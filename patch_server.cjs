const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf8');

const waStart = "  async function sendWhatsAppMessage(appConfig: any, message: string, customRecipient?: string) {\n    const provider = appConfig?.whatsappProvider || 'render_baileys';";
const waNew = "  async function sendWhatsAppMessage(appConfig: any, message: string, customRecipient?: string) {\n" +
"    let telegramSuccess = false;\n" +
"    let telegramPromise = Promise.resolve();\n" +
"    if (appConfig?.telegramBotToken && appConfig?.telegramChatId) {\n" +
"       const tUrl = `https://api.telegram.org/bot${appConfig.telegramBotToken}/sendMessage`;\n" +
"       telegramPromise = axios.post(tUrl, {\n" +
"           chat_id: appConfig.telegramChatId,\n" +
"           text: message,\n" +
"           parse_mode: 'Markdown'\n" +
"       }).then(r => {\n" +
"           if(r.data.ok) telegramSuccess = true;\n" +
"       }).catch(e => {\n" +
"           console.error(\"Telegram error in server:\", e.message);\n" +
"       });\n" +
"    }\n\n" +
"    const provider = appConfig?.whatsappProvider || 'render_baileys';";

code = code.replace(waStart, waNew);

// Add await telegramPromise before returns in sendWhatsAppMessage
code = code.replace(/return \{ success: true, data: response\.data \};/g, 'await telegramPromise; return { success: true, data: response.data };');


const cronAnchor = '  app.listen(PORT, "0.0.0.0", () => {';
const cronJob = "  // Background cron to check shift end time\n" +
"  cron.schedule('* * * * *', async () => {\n" +
"    try {\n" +
"      const db = await ensureValidDb();\n" +
"      if(!db) return;\n" +
"      const configDoc = await db.collection('config').doc('app_settings').get();\n" +
"      if(!configDoc.exists) return;\n" +
"      const settings = configDoc.data();\n" +
"      if(settings.autoSendWhatsAppEnabled === false) return;\n" +
"      const endTime = settings.shiftEndTime;\n" +
"      if(!endTime) return;\n" +
"      const nowLocal = new Date();\n" +
"      nowLocal.setHours(nowLocal.getUTCHours() - 4); // force UTC-4 for Caracas\n" +
"      const [endH, endM] = endTime.split(':').map(Number);\n" +
"      if (nowLocal.getHours() === endH && nowLocal.getMinutes() === endM) {\n" +
"         const dateStr = nowLocal.toISOString().split('T')[0];\n" +
"         const shiftKey = `${endTime}_${dateStr}`;\n" +
"         if (settings.lastAutoSentShiftKey === shiftKey) return;\n" +
"         const stagedDoc = await db.collection('whatsapp_backups').doc('staged_upcoming_report').get();\n" +
"         if(stagedDoc.exists && stagedDoc.data().message) {\n" +
"             const finalReport = stagedDoc.data().message;\n" +
"             await db.collection('config').doc('app_settings').update({ lastAutoSentShiftKey: shiftKey });\n" +
"             const result = await sendWhatsAppMessage(settings, finalReport);\n" +
"             const backupId = `bk_${Date.now()}`;\n" +
"             await db.collection('whatsapp_backups').doc(backupId).set({\n" +
"                 id: backupId, timestamp: new Date().toISOString(), recipient: 'WhatsApp y Telegram (Server Cron)', message: finalReport, status: result.success ? 'success' : 'failed', error: result.error || null, type: 'reporte_programado', shiftKey: shiftKey\n" +
"             });\n" +
"         }\n" +
"      }\n" +
"    } catch(e) {\n" +
"      console.error('[Server Cron] Error:', e);\n" +
"    }\n" +
"  });\n\n" +
"  app.listen(PORT, \"0.0.0.0\", () => {";

code = code.replace(cronAnchor, cronJob);

fs.writeFileSync('server.ts', code);
