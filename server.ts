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

  // Helper function to send WhatsApp message supporting Green API, Whapi, Evolution, etc.
  async function sendWhatsAppMessage(appConfig: any, message: string, customRecipient?: string) {
    const provider = appConfig?.whatsappProvider || (appConfig?.greenApiInstanceId ? 'greenapi' : 'custom');
    
    // 1. Green API
    const greenApiInstanceId = appConfig?.greenApiInstanceId || '710722721756';
    const greenApiToken = appConfig?.greenApiToken || '648d092ee3fc4965b6a69e39f5f7d15c2694eb6bc7be48058b';
    let greenApiChatId = customRecipient || appConfig?.greenApiChatId || appConfig?.whatsappGroupId || '120363427690312638@g.us';

    if (provider === 'greenapi' || (greenApiInstanceId && greenApiToken)) {
      if (!greenApiInstanceId || !greenApiToken || !greenApiChatId) {
        console.warn("Green API configuration missing. Message generated but not sent.");
        return { success: false, error: "Faltan credenciales de Green API (IdInstance, ApiTokenInstance o Teléfono/Grupo)" };
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
          timeout: 15000
        });
        console.log("Message successfully sent via Green API:", response.data);
        return { success: true, data: response.data };
      } catch (error: any) {
        console.error("Error sending message via Green API:", error?.response?.data || error.message);
        return { success: false, error: error?.response?.data?.message || error.message };
      }
    }

    // 2. Generic Webhook / Whapi / Evolution API
    const apiUrl = appConfig?.whatsappApiUrl;
    const apiToken = appConfig?.whatsappToken;
    const groupId = customRecipient || appConfig?.whatsappGroupId;

    if (!apiUrl || !apiToken || !groupId) {
      console.warn("WhatsApp API configuration missing. Report generated but not sent.");
      return { success: false, error: "Configuración de WhatsApp API faltante." };
    }

    try {
      const response = await axios.post(apiUrl, {
        to: groupId,
        body: message
      }, {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });
      console.log("Message successfully sent via WhatsApp API:", response.data);
      return { success: true, data: response.data };
    } catch (error: any) {
      console.error("Error sending message via WhatsApp API:", error?.response?.data || error.message);
      return { success: false, error: error?.response?.data?.message || error.message };
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
    } catch (error) {
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
  });
}

startServer();
