const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');

const targetStr = `  // Reload configuration and cron job
  app.post("/api/admin/reload-config", async (req, res) => {
    await setupCron();
    res.json({ message: "Configuration and cron job reloaded." });
  });
      app.use(vite.middlewares);`;

const replacement = `  // Reload configuration and cron job
  app.post("/api/admin/reload-config", async (req, res) => {
    await setupCron();
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

      let message = \`*REPORTE OPERATIVO - \${formData.fecha}*\\n\\n\`;
      message += \`👤 *Operador:* \${formData.operador}\\n\`;
      message += \`⏰ *Turno:* \${formData.turno}\\n\`;
      if (formData.notas) message += \`📝 *Notas:* \${formData.notas}\\n\`;

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
      app.use(vite.middlewares);`;

content = content.replace(targetStr, replacement);
fs.writeFileSync('server.ts', content);
