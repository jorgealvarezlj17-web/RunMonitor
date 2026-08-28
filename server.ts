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

  async function generateAndSendDailyReport() {
    const currentDb = await ensureValidDb();
    if (!currentDb) {
      console.warn("Firestore not initialized, cannot generate report");
      return;
    }
    
    console.log("Generating daily report...");
    
    try {
      const appConfig = await getAppConfig();
      
      const now = new Date();
      let start: Date;
      let end: Date;

      const startTime = appConfig?.shiftStartTime || '18:00';
      const endTime = appConfig?.shiftEndTime || '18:00';
      const rangeMode = appConfig?.shiftRangeMode || 'scheduled';

      const [startH, startM] = startTime.split(':').map(Number);
      const [endH, endM] = endTime.split(':').map(Number);

      if (rangeMode === 'until_now') {
        end = now;
        start = new Date(now);
        if (startH > now.getHours() || (startH === now.getHours() && startM > now.getMinutes())) {
          start.setDate(now.getDate() - 1);
        }
        start.setHours(startH, startM, 0, 0);
      } else {
        end = new Date(now);
        end.setHours(endH, endM, 0, 0);

        start = new Date(end);
        if (startH === endH && startM === endM) {
          start.setDate(end.getDate() - 1);
          start.setHours(startH, startM, 0, 0);
        } else if (startH > endH || (startH === endH && startM > endM)) {
          start.setDate(end.getDate() - 1);
          start.setHours(startH, startM, 0, 0);
        } else {
          start.setHours(startH, startM, 0, 0);
        }
      }

      const tsThreshold = admin.firestore.Timestamp.fromDate(start);
      const tsEnd = admin.firestore.Timestamp.fromDate(end);

      // Fetch logs in window
      const logsRef = currentDb.collection('logs');
      const querySnapshot = await logsRef
        .where('timestamp', '>=', tsThreshold)
        .where('timestamp', '<=', tsEnd)
        .orderBy('timestamp', 'desc')
        .get();

      // Fetch equipment names for context
      const equipRef = currentDb.collection('equipment');
      const equipSnapshot = await equipRef.get();
      const equipmentMap: Record<string, string> = {};
      equipSnapshot.forEach(doc => {
        equipmentMap[doc.id] = doc.data().name || 'Desconocido';
      });

      let continuityCount = 0;
      let failureCount = 0;
      const details: string[] = [];

      querySnapshot.forEach(doc => {
        const data = doc.data();
        const equipName = equipmentMap[data.equipmentId] || 'Equipo Desconocido';
        const action = data.action === 'on' ? 'CONTINUIDAD DE SERVICIO' : 'FALLA EN EL SERVICIO';
        
        if (data.action === 'on') continuityCount++;
        else failureCount++;

        const time = data.timestamp.toDate().toLocaleTimeString();
        details.push(`- ${time}: ${equipName} -> ${action}`);
      });

      const reportHeader = "🚨 *REPORTE AUTOMÁTICO DE SISTEMA* 🚨\n\n";
      const summary = `*Resumen de las últimas 24h:*\n` +
                      `✅ Continuidad de Servicio: ${continuityCount}\n` +
                      `❌ Fallas en el Servicio: ${failureCount}\n\n` +
                      `*Detalle de Eventos:*\n` +
                      (details.length > 0 ? details.slice(0, 15).join('\n') + (details.length > 15 ? "\n... (más eventos)" : "") : "Sin eventos registrados.");

      let fullMessage = reportHeader + summary;

      // Fetch shift observations
      const obsDoc = await currentDb.collection('config').doc('current_shift_observations').get();
      const observations = obsDoc.exists ? obsDoc.data()?.observations || '' : '';

      if (observations.trim()) {
        fullMessage += `\n\n📝 *NOTAS Y OBSERVACIONES:*\n${observations.trim()}`;
      }

      const result = await sendWhatsAppMessage(appConfig, fullMessage);

      if (result.success) {
        // Clear observations after sending
        await currentDb.collection('config').doc('current_shift_observations').set({
          observations: '',
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        console.log("Daily report sent successfully to WhatsApp.");
      }
    } catch (error) {
      console.error("Error generating or sending daily report:", error);
    }
  }

  let dailyReportTask: any = null;

  async function setupCron() {
    const appConfig = await getAppConfig();
    const cronTime = appConfig?.reportCronTime || '0 18 * * *';

    if (dailyReportTask) {
      dailyReportTask.stop();
    }

    console.log(`Scheduling daily report with cron: ${cronTime}`);
    try {
      dailyReportTask = cron.schedule(cronTime, () => {
        generateAndSendDailyReport();
      });
    } catch (error) {
      console.error(`Failed to schedule cron job with expression "${cronTime}":`, error);
      if (cronTime !== '0 18 * * *') {
        console.log('Attempting to schedule with default cron: 0 18 * * *');
        try {
          dailyReportTask = cron.schedule('0 18 * * *', () => {
            generateAndSendDailyReport();
          });
        } catch (e) {
          console.error('Failed to schedule default cron job:', e);
        }
      }
    }
  }

  // Initial setup
  setupCron().catch(err => console.error("Error in setupCron:", err));

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Reload configuration and cron job
  app.post("/api/admin/reload-config", async (req, res) => {
    await setupCron();
    res.json({ message: "Configuration and cron job reloaded." });
  });

  // Manual trigger for testing the report
  app.post("/api/admin/trigger-report", async (req, res) => {
    await generateAndSendDailyReport();
    res.json({ message: "Report generation triggered." });
  });

  // Handle form submission and send WhatsApp notification
  app.post("/api/submit-form", express.json(), async (req, res) => {
    if (!db) {
      return res.status(500).json({ error: "Firestore not initialized" });
    }

    const formData = req.body;
    console.log("Received form submission for date:", formData.fecha);

    try {
      const appConfig = await getAppConfig();
      
      const header = `📋 *NUEVO FORMULARIO DIARIO - ${formData.fecha}* 📋\n\n`;
      
      const generalInfo = `*Información General:*\n` +
                          `- Continuidad: ${formData.continuidad}${formData.continuidad === 'No' ? ` (${formData.duracionFalla} min)` : ''}\n` +
                          `- Falla Voltaje: ${formData.fallaVoltaje}${formData.fallaVoltaje === 'Si' ? ` (${formData.duracionFallaVoltaje} min)` : ''}\n\n`;
      
      const generators = `*Generadores (Encendidos):*\n` +
                         `- Maternidad: ${formData.encendidoMaternidad} (${formData.tiempoMaternidad})\n` +
                         `- Campamento: ${formData.encendidoCampamento} (${formData.tiempoCampamento})\n` +
                         `- Subestación: ${formData.encendidoSubestacion} (${formData.tiempoSubestacion})\n\n`;
      
      const pumping = `*Bombeo y Tanques:*\n` +
                      `- Playa: ${formData.bombeoPlaya} min\n` +
                      `- Pozo: ${formData.bombeoPozo} min\n` +
                      `- Tanques Aireación: ${formData.tanquesAireacion?.length || 0}\n` +
                      `- Tanques Movimiento: ${formData.tanquesMovimiento?.length || 0}\n\n`;

      const blowers = `*Blowers:*\n` +
                      `- Encendidos: ${formData.encendidoBlowers} veces\n` +
                      (formData.tiemposBlowers ? Object.entries(formData.tiemposBlowers)
                        .filter(([_, val]) => val)
                        .map(([key, val]) => `  ${key}. ${val}`)
                        .join('\n') : '') + '\n\n';

      const failureReport = formData.reporteFalla ? `*Reporte de Falla:*\n${formData.reporteFalla}\n\n` : '';
      
      const footer = `_Enviado por: ${formData.submittedBy || 'Sistema'}_`;

      const fullMessage = header + generalInfo + generators + pumping + blowers + failureReport + footer;

      await sendWhatsAppMessage(appConfig, fullMessage);

      res.json({ success: true, message: "Form submitted and notification sent." });
    } catch (error) {
      console.error("Error processing form submission:", error);
      res.status(500).json({ error: "Failed to process submission" });
    }
  });

  // Send any custom WhatsApp / Green API message directly (from Corte de Reporte)
  app.post("/api/send-whatsapp", express.json(), async (req, res) => {
    try {
      const { message, recipient } = req.body;
      if (!message) {
        return res.status(400).json({ success: false, error: "El contenido del mensaje es requerido." });
      }

      const appConfig = await getAppConfig();
      const result = await sendWhatsAppMessage(appConfig, message, recipient);

      if (result.success) {
        return res.json({ success: true, message: "Mensaje enviado exitosamente vía WhatsApp / Green API" });
      } else {
        return res.status(400).json({ success: false, error: result.error || "No se pudo enviar el mensaje." });
      }
    } catch (error: any) {
      console.error("Error in /api/send-whatsapp:", error);
      return res.status(500).json({ success: false, error: error.message || "Error interno del servidor" });
    }
  });

  // Fetch WhatsApp chats / groups from Green API
  app.post("/api/green-api/get-chats", express.json(), async (req, res) => {
    try {
      const { greenApiInstanceId, greenApiToken, greenApiUrl } = req.body;
      const appConfig = await getAppConfig();
      const instanceId = greenApiInstanceId || appConfig?.greenApiInstanceId || '710722721756';
      const token = greenApiToken || appConfig?.greenApiToken || '648d092ee3fc4965b6a69e39f5f7d15c2694eb6bc7be48058b';
      const hostUrl = greenApiUrl || appConfig?.greenApiUrl || `https://api.green-api.com`;
      const cleanHost = hostUrl.replace(/\/+$/, '');

      if (!instanceId || !token) {
        return res.status(400).json({ success: false, error: "Credenciales de Green API no provistas." });
      }

      const url = `${cleanHost}/waInstance${instanceId.trim()}/getChats/${token.trim()}`;
      const response = await axios.get(url, { timeout: 15000 });
      
      const chats = (response.data || []).map((c: any) => ({
        id: c.id,
        name: c.name || c.contactName || c.id,
        isGroup: c.id?.endsWith('@g.us')
      }));

      return res.json({ success: true, chats });
    } catch (error: any) {
      console.error("Error fetching chats from Green API:", error?.response?.data || error.message);
      return res.status(500).json({ success: false, error: error?.response?.data?.message || error.message });
    }
  });

  // Test Green API / WhatsApp connection
  app.post("/api/test-whatsapp", express.json(), async (req, res) => {
    try {
      const { provider, greenApiInstanceId, greenApiToken, greenApiChatId, whatsappApiUrl, whatsappToken, whatsappGroupId } = req.body;
      const testConfig = {
        whatsappProvider: provider || 'greenapi',
        greenApiInstanceId,
        greenApiToken,
        greenApiChatId,
        whatsappApiUrl,
        whatsappToken,
        whatsappGroupId
      };

      const testMsg = `🤖 *PRUEBA DE CONEXIÓN GREEN API / WHATSAPP*\n\n` +
                      `✅ ¡Tu integración de WhatsApp está funcionando correctamente!\n` +
                      `📅 Fecha: ${new Date().toLocaleString('es-ES', { timeZone: 'America/Caracas' })}\n` +
                      `🏢 Sistema: Monitor de Equipos Planta`;

      const result = await sendWhatsAppMessage(testConfig, testMsg);
      if (result.success) {
        return res.json({ success: true, message: "Mensaje de prueba enviado con éxito." });
      } else {
        return res.status(400).json({ success: false, error: result.error || "Error al enviar mensaje de prueba" });
      }
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message || "Error al probar conexión" });
    }
  });

  // Get the latest submission for a specific user or the absolute latest
  app.get("/api/latest-submission", async (req, res) => {
    const currentDb = await ensureValidDb();
    if (!currentDb) {
      return res.status(500).json({ error: "Firestore not initialized" });
    }

    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    try {
      const submissionsRef = currentDb.collection('form_submissions');
      const snapshot = await submissionsRef
        .where('submittedBy', '==', email)
        .orderBy('submittedAt', 'desc')
        .limit(1)
        .get();

      if (snapshot.empty) {
        return res.status(404).json({ error: "No submissions found for today." });
      }

      const data = snapshot.docs[0].data();
      if (data.submittedAt && data.submittedAt.toDate) {
        data.submittedAt = data.submittedAt.toDate().toISOString();
      }

      res.json(data);
    } catch (error: any) {
      console.error("Error fetching latest submission:", error);
      res.status(500).json({ error: "Failed to fetch submission" });
    }
  });

  // JSONP endpoint for the bookmarklet to bypass CORS completely
  app.get("/api/latest-submission-jsonp", async (req, res) => {
    const currentDb = await ensureValidDb();
    const callback = req.query.callback as string;
    
    if (!callback) {
      return res.status(400).send("console.error('Callback is required');");
    }

    if (!currentDb) {
      return res.send(`${callback}({ error: "Firestore not initialized" });`);
    }

    const { email } = req.query;
    if (!email) {
      return res.send(`${callback}({ error: "Email is required" });`);
    }

    try {
      const submissionsRef = currentDb.collection('form_submissions');
      const snapshot = await submissionsRef
        .where('submittedBy', '==', email)
        .orderBy('submittedAt', 'desc')
        .limit(1)
        .get();

      if (snapshot.empty) {
        return res.send(`${callback}({ error: "No se encontró el test de hoy. Asegúrate de haberle dado a 'Completar Formulario' primero." });`);
      }

      const data = snapshot.docs[0].data();
      if (data.submittedAt && data.submittedAt.toDate) {
        data.submittedAt = data.submittedAt.toDate().toISOString();
      }

      res.send(`${callback}(${JSON.stringify(data)});`);
    } catch (error: any) {
      console.error("Error fetching latest submission:", error);
      res.send(`${callback}({ error: "Failed to fetch submission: ${error.message}" });`);
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
