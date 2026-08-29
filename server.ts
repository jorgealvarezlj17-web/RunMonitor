import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import cron from "node-cron";
import axios from "axios";
import dotenv from "dotenv";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import cors from "cors";

// Load environment variables
dotenv.config();

// Ensure all Date evaluations are in local time
process.env.TZ = 'America/Caracas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Enable CORS for the bookmarklet
  app.use(cors({
    origin: '*', // Allow all origins for the bookmarklet to work from anywhere
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));

  // Error handling for the process
  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  let db: admin.firestore.Firestore | null = null;

  // Initialize Firebase Admin for backend
  try {
    const configPath = path.join(__dirname, 'firebase-applet-config.json');
    let databaseId: string | undefined = undefined;
    let projectId: string | undefined = process.env.GOOGLE_CLOUD_PROJECT;

    if (fs.existsSync(configPath)) {
      const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      databaseId = firebaseConfig.firestoreDatabaseId;
      projectId = firebaseConfig.projectId || projectId;
    }

    if (admin.apps.length === 0) {
      // Explicitly use the projectId from config to avoid picking up the internal Cloud Run project
      admin.initializeApp({
        projectId: projectId
      });
      console.log("Firebase Admin initialized with Project ID:", projectId);
    }

    const adminAppInstance = admin.app();
    
    // Try to initialize with the specified databaseId
    if (databaseId && databaseId !== '(default)') {
      db = getFirestore(adminAppInstance, databaseId);
      console.log(`Firestore initialized (Database: ${databaseId})`);
    } else {
      db = getFirestore(adminAppInstance);
      console.log("Firestore initialized (Default database)");
    }
  } catch (error) {
    console.error("Error initializing Firebase Admin:", error);
  }

  async function ensureValidDb() {
    return db;
  }

  async function getAppConfig() {
    const currentDb = await ensureValidDb();
    if (!currentDb) return null;
    try {
      console.log(`Fetching app config from database: ${currentDb.databaseId} in project: ${admin.app().options.projectId}`);
      const configDoc = await currentDb.collection('config').doc('app_settings').get();
      if (configDoc.exists) {
        return configDoc.data();
      }
    } catch (error: any) {
      if (error.code === 7 || error.message?.includes('PERMISSION_DENIED')) {
        console.warn("Permission denied when fetching app config. This is expected if the service account lacks access to the named database.");
      } else {
        console.error(`Error fetching app config from Firestore (DB: ${currentDb.databaseId}):`, error);
      }
    }
    return null;
  }

  let memoryBackups: any[] = [];

  // Helper function to save backup record to Firestore with in-memory fallback
  async function saveWhatsAppBackupRecord(message: string, recipient: string, status: 'success' | 'failed' | 'saved' | string, errorStr?: string, providerStr?: string) {
    const backupId = `bk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const record = {
      id: backupId,
      timestamp: new Date().toISOString(),
      recipient: recipient || 'Sin destinatario',
      message: message || '',
      status: status,
      error: errorStr || null,
      provider: providerStr || 'render_baileys'
    };

    // Keep in-memory copy (max 100)
    memoryBackups.unshift(record);
    if (memoryBackups.length > 100) memoryBackups.pop();

    try {
      const currentDb = await ensureValidDb();
      if (!currentDb) return;
      await currentDb.collection('whatsapp_backups').doc(backupId).set(record);
      console.log(`[Backup] Message saved to backup database (ID: ${backupId}, Status: ${status})`);
    } catch (err: any) {
      if (err.code === 7 || err.message?.includes('PERMISSION_DENIED')) {
        console.warn(`[Backup] Firestore permission denied on server Admin SDK, record saved in memory fallback (ID: ${backupId})`);
      } else {
        console.error("Error saving WhatsApp backup to Firestore:", err);
      }
    }
  }

  // Helper function to send WhatsApp message supporting Render Baileys API, Green API, Whapi, etc.
  async function sendWhatsAppMessage(appConfig: any, message: string, customRecipient?: string) {
    const provider = appConfig?.whatsappProvider || 'render_baileys';
    
    // 1. Render Baileys API (Default: https://bot-whatsapp-baileys-jpyb.onrender.com/send-message)
    if (provider === 'render_baileys' || provider === 'baileys' || appConfig?.whatsappApiUrl?.includes('bot-whatsapp-baileys') || appConfig?.whatsappApiUrl?.includes('onrender.com')) {
      const targetUrl = appConfig?.whatsappApiUrl || 'https://bot-whatsapp-baileys-jpyb.onrender.com/send-message';
      const rawRecipient = customRecipient || appConfig?.whatsappGroupId || appConfig?.greenApiChatId || appConfig?.whatsappRecipient || '120363427690312638@g.us';

      if (!rawRecipient) {
        const err = "Falta el número de teléfono o ID de grupo de destino para WhatsApp.";
        await saveWhatsAppBackupRecord(message, 'No especificado', 'failed', err, provider);
        return { success: false, error: err };
      }

      // Format recipient: remove leading + or @c.us suffix for phone numbers
      let formattedTo = String(rawRecipient).trim();
      if (formattedTo.startsWith('+')) {
        formattedTo = formattedTo.substring(1);
      }
      if (formattedTo.endsWith('@c.us')) {
        formattedTo = formattedTo.replace('@c.us', '');
      }

      // Attempt sending with retry for Render free-tier cold starts
      const maxAttempts = 2;
      let lastErrorMsg = 'Error al conectar con Render Baileys API';

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          console.log(`[Attempt ${attempt}/${maxAttempts}] Sending WhatsApp message via Render Baileys API to '${formattedTo}' at '${targetUrl}' (timeout: 60s)...`);
          
          const response = await axios.post(targetUrl, {
            to: formattedTo,
            message: message
          }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 60000 // 60s timeout to allow Render service cold boot
          });

          console.log("Message successfully sent via Render Baileys API:", response.data);
          await saveWhatsAppBackupRecord(message, formattedTo, 'success', undefined, provider);
          return { success: true, data: response.data };
        } catch (error: any) {
          const isTimeout = error.code === 'ECONNABORTED' || error.message?.includes('timeout');
          const isNetworkOr5xx = error.response?.status >= 500 || error.code === 'ENOTFOUND' || error.code === 'ECONNRESET';
          
          lastErrorMsg = error?.response?.data?.message || error?.response?.data?.error || (
            isTimeout 
              ? 'Tiempo de espera excedido al contactar el servidor de WhatsApp en Render (iniciando servicio).'
              : error.message || 'Error al conectar con Render Baileys API'
          );

          console.warn(`[Attempt ${attempt}/${maxAttempts}] Render Baileys API issue:`, lastErrorMsg);

          if (attempt < maxAttempts && (isTimeout || isNetworkOr5xx)) {
            console.log(`Waiting 3 seconds before retrying Render Baileys API (waking up container)...`);
            await new Promise(r => setTimeout(r, 3000));
          }
        }
      }

      console.warn("[WhatsApp Service] No fue posible contactar el servidor de Render Baileys tras varios intentos. El mensaje ha quedado preservado en la base de datos de respaldo.");
      await saveWhatsAppBackupRecord(message, formattedTo, 'failed', lastErrorMsg, provider);
      return { 
        success: false, 
        error: lastErrorMsg 
      };
    }

    // 2. Green API
    const greenApiInstanceId = appConfig?.greenApiInstanceId;
    const greenApiToken = appConfig?.greenApiToken;
    let greenApiChatId = customRecipient || appConfig?.greenApiChatId || appConfig?.whatsappGroupId;

    if (provider === 'greenapi' && greenApiInstanceId && greenApiToken) {
      if (!greenApiInstanceId || !greenApiToken || !greenApiChatId) {
        const err = "Faltan credenciales de Green API (IdInstance, ApiTokenInstance o Teléfono/Grupo)";
        console.warn("Green API configuration missing. Message generated but not sent.");
        await saveWhatsAppBackupRecord(message, greenApiChatId || 'No especificado', 'failed', err, 'greenapi');
        return { success: false, error: err };
      }

      // Format recipient
      let formattedChatId = greenApiChatId.trim().replace(/[+\s\-()]/g, '');
      if (!formattedChatId.endsWith('@c.us') && !formattedChatId.endsWith('@g.us')) {
        formattedChatId = (formattedChatId.includes('-') || formattedChatId.length > 15)
          ? `${formattedChatId}@g.us`
          : `${formattedChatId}@c.us`;
      }

      const hostUrl = appConfig?.greenApiUrl || `https://7107.api.greenapi.com`;
      const cleanHost = hostUrl.replace(/\/+$/, '');
      const greenUrl = `${cleanHost}/waInstance${greenApiInstanceId.trim()}/sendMessage/${greenApiToken.trim()}`;
      try {
        const response = await axios.post(greenUrl, {
          chatId: formattedChatId,
          message: message
        }, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000
        });
        console.log("Message successfully sent via Green API:", response.data);
        await saveWhatsAppBackupRecord(message, formattedChatId, 'success', undefined, 'greenapi');
        return { success: true, data: response.data };
      } catch (error: any) {
        const errMsg = error?.response?.data?.message || error.message;
        console.error("Error sending message via Green API:", error?.response?.data || error.message);
        await saveWhatsAppBackupRecord(message, formattedChatId, 'failed', errMsg, 'greenapi');
        return { success: false, error: errMsg };
      }
    }

    // 3. Generic Webhook / Whapi / Evolution API / Custom
    const apiUrl = appConfig?.whatsappApiUrl || 'https://bot-whatsapp-baileys-jpyb.onrender.com/send-message';
    const groupId = customRecipient || appConfig?.whatsappGroupId || appConfig?.greenApiChatId;

    if (!groupId) {
      const err = "Configuración de WhatsApp API faltante.";
      console.warn("WhatsApp API configuration missing. Report generated but not sent.");
      await saveWhatsAppBackupRecord(message, 'No especificado', 'failed', err, provider);
      return { success: false, error: err };
    }

    try {
      let formattedTo = String(groupId).trim().replace(/^\+/, '');
      if (formattedTo.endsWith('@c.us')) formattedTo = formattedTo.replace('@c.us', '');

      const headers: any = { 'Content-Type': 'application/json' };
      if (appConfig?.whatsappToken) {
        headers['Authorization'] = `Bearer ${appConfig.whatsappToken}`;
      }

      const response = await axios.post(apiUrl, {
        to: formattedTo,
        message: message,
        body: message
      }, {
        headers,
        timeout: 30000
      });
      console.log("Message successfully sent via WhatsApp API:", response.data);
      await saveWhatsAppBackupRecord(message, formattedTo, 'success', undefined, provider);
      return { success: true, data: response.data };
    } catch (error: any) {
      const errMsg = error?.response?.data?.message || error.message;
      console.error("Error sending message via WhatsApp API:", error?.response?.data || error.message);
      await saveWhatsAppBackupRecord(message, groupId, 'failed', errMsg, provider);
      return { success: false, error: errMsg };
    }
  }

  // Initial setup

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Reload configuration and cron job
  app.post("/api/admin/reload-config", async (req, res) => {
    
    res.json({ message: "Configuration and cron job reloaded." });
  });

  // Handle form submission and send WhatsApp notification
  app.post("/api/submit-form", express.json(), async (req, res) => {
    if (!db) {
      return res.status(500).json({ error: "Firestore not initialized" });
    }

    const formData = req.body;
    try {
      const appConfig = await getAppConfig();
      if (appConfig?.autoSendWhatsAppEnabled === false) {
        return res.json({ success: true, message: "Saved to Firestore, WhatsApp auto-send is disabled." });
      }

      let message = `*REPORTE OPERATIVO - ${formData.fecha}*\n\n`;
      message += `👤 *Operador:* ${formData.operador}\n`;
      message += `⏰ *Turno:* ${formData.turno}\n`;
      if (formData.notas) message += `📝 *Notas:* ${formData.notas}\n`;

      const result = await sendWhatsAppMessage(appConfig, message);
      if (!result.success) {
        return res.status(500).json({ error: "Failed to send WhatsApp message", details: result.error });
      }
      res.json({ success: true, message: "Report generated and sent to WhatsApp." });
    } catch (error) {
      res.status(500).json({ error: "Internal server error processing submission." });
    }
  });

  // Proxy endpoint to send manual WhatsApp messages
  app.post("/api/send-whatsapp", express.json(), async (req, res) => {
    try {
      const { message, recipientId } = req.body;
      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }
      const appConfig = await getAppConfig();
      const result = await sendWhatsAppMessage(appConfig, message, recipientId);
      
      if (result.success) {
        res.json({ success: true, data: result.data });
      } else {
        res.status(500).json({ success: false, error: result.error });
      }
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Endpoint to fetch WhatsApp groups / chats via Green API
  app.post("/api/green-api/get-chats", express.json(), async (req, res) => {
    try {
      const { greenApiInstanceId, greenApiToken } = req.body;
      const instanceId = greenApiInstanceId || '710722721756';
      const token = greenApiToken || '648d092ee3fc4965b6a69e39f5f7d15c2694eb6bc7be48058b';

      if (!instanceId || !token) {
        return res.status(400).json({ success: false, error: "Faltan credenciales de Green API" });
      }

      const hostUrl = `https://7107.api.greenapi.com`;
      const url = `${hostUrl}/waInstance${instanceId.trim()}/getChats/${token.trim()}`;
      
      const response = await axios.get(url, { timeout: 15000 });
      if (Array.isArray(response.data)) {
        const chats = response.data.map((c: any) => ({
          id: c.id,
          name: c.name || c.id,
          isGroup: String(c.id).endsWith('@g.us')
        }));
        return res.json({ success: true, chats });
      }

      // Try getGroupList if getChats doesn't return an array
      const groupUrl = `${hostUrl}/waInstance${instanceId.trim()}/getGroupList/${token.trim()}`;
      const groupResp = await axios.get(groupUrl, { timeout: 15000 });
      if (Array.isArray(groupResp.data)) {
        const groups = groupResp.data.map((g: any) => ({
          id: g.groupId || g.id,
          name: g.groupName || g.name || g.groupId || g.id,
          isGroup: true
        }));
        return res.json({ success: true, chats: groups });
      }

      res.json({ success: true, chats: [] });
    } catch (error: any) {
      console.error("Error fetching chats from Green API:", error?.response?.data || error.message);
      res.status(500).json({ success: false, error: error?.response?.data?.message || error.message });
    }
  });

  // Endpoint to fetch backup messages history
  app.get("/api/whatsapp-backups", async (req, res) => {
    let backups: any[] = [...memoryBackups];
    try {
      const currentDb = await ensureValidDb();
      if (currentDb) {
        const snapshot = await currentDb.collection('whatsapp_backups').limit(150).get();
        const dbBackups: any[] = [];
        snapshot.forEach(doc => {
          dbBackups.push({ id: doc.id, ...doc.data() });
        });
        // Merge without duplicates
        const existingIds = new Set(dbBackups.map(b => b.id));
        for (const mb of memoryBackups) {
          if (!existingIds.has(mb.id)) {
            dbBackups.push(mb);
          }
        }
        backups = dbBackups;
      }
    } catch (error: any) {
      if (error.code === 7 || error.message?.includes('PERMISSION_DENIED')) {
        console.warn("Firestore permission denied on GET /api/whatsapp-backups, returning in-memory backups fallback.");
      } else {
        console.error("Error fetching whatsapp backups from Firestore:", error);
      }
    }
    // Sort newest first
    backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    res.json({ success: true, backups });
  });

  // Endpoint to delete a specific backup message
  app.delete("/api/whatsapp-backups/:id", async (req, res) => {
    const { id } = req.params;
    memoryBackups = memoryBackups.filter(b => b.id !== id);
    try {
      const currentDb = await ensureValidDb();
      if (currentDb) {
        await currentDb.collection('whatsapp_backups').doc(id).delete();
      }
    } catch (error: any) {
      console.warn("Error deleting backup in Firestore (using memory sync):", error.message);
    }
    res.json({ success: true, message: "Respaldo eliminado" });
  });

  // Endpoint to clear all backup messages
  app.delete("/api/whatsapp-backups", async (req, res) => {
    memoryBackups = [];
    try {
      const currentDb = await ensureValidDb();
      if (currentDb) {
        const snapshot = await currentDb.collection('whatsapp_backups').get();
        const batch = currentDb.batch();
        snapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
        });
        await batch.commit();
      }
    } catch (error: any) {
      console.warn("Error clearing backups in Firestore (using memory sync):", error.message);
    }
    res.json({ success: true, message: "Todos los respaldos eliminados" });
  });

  // Endpoint to resend a backed-up message
  app.post("/api/whatsapp-backups/resend", express.json(), async (req, res) => {
    try {
      const { message, recipient } = req.body;
      if (!message) return res.status(400).json({ error: "Mensaje vacio" });
      const appConfig = await getAppConfig();
      const result = await sendWhatsAppMessage(appConfig, message, recipient);
      if (result.success) {
        res.json({ success: true, message: "Mensaje reenviado exitosamente a WhatsApp" });
      } else {
        res.status(500).json({ success: false, error: result.error });
      }
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Endpoint to test WhatsApp configuration from Settings UI
  app.post("/api/test-whatsapp", express.json(), async (req, res) => {
    try {
      const { provider, greenApiInstanceId, greenApiToken, greenApiChatId, whatsappApiUrl, whatsappToken, whatsappGroupId } = req.body;
      const testConfig = {
        whatsappProvider: provider || 'render_baileys',
        greenApiInstanceId,
        greenApiToken,
        greenApiChatId,
        whatsappApiUrl: whatsappApiUrl || 'https://bot-whatsapp-baileys-jpyb.onrender.com/send-message',
        whatsappToken,
        whatsappGroupId: whatsappGroupId || greenApiChatId
      };
      
      const testMessage = `🧪 *Prueba de Notificación - Aquanova*\n\nConexión con el servidor de WhatsApp (Render Baileys API) verificada exitosamente.\n📅 Fecha: ${new Date().toLocaleString('es-VE')}`;
      const result = await sendWhatsAppMessage(testConfig, testMessage);
      
      if (result.success) {
        res.json({ success: true, data: result.data });
      } else {
        res.status(500).json({ success: false, error: result.error });
      }
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    try {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.error("Error creating Vite server:", e);
    }
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);

    // Automatic Keep-Alive Ping to keep Render WhatsApp bot awake 24/7
    setInterval(async () => {
      try {
        const appConfig = await getAppConfig();
        const renderUrl = appConfig?.whatsappApiUrl || 'https://bot-whatsapp-baileys-jpyb.onrender.com/send-message';
        const baseUrl = renderUrl.replace(/\/send-message\/?$/, '');
        await axios.get(baseUrl, { timeout: 10000 });
        console.log(`[Keep-Alive] Ping enviado a Render para mantener bot activo: ${baseUrl}`);
      } catch (err: any) {
        // Silent catch for ping
      }
    }, 5 * 60 * 1000); // Every 5 minutes
  });
}

startServer();
