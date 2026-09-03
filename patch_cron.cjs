const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const anchor1 = "cron.schedule('* * * * *', async () => {";
const anchor2 = "  app.listen(PORT, \"0.0.0.0\", () => {";

const idx1 = code.indexOf(anchor1);
const idx2 = code.indexOf(anchor2, idx1);

if (idx1 !== -1 && idx2 !== -1) {
    const replacement = `cron.schedule('* * * * *', async () => {
    try {
      const configPath = require('path').join(process.cwd(), 'firebase-applet-config.json');
      if (!require('fs').existsSync(configPath)) return;
      const firebaseConfig = JSON.parse(require('fs').readFileSync(configPath, 'utf-8'));
      
      const { initializeApp, getApps, getApp } = await import('firebase/app');
      const { getAuth, signInWithEmailAndPassword } = await import('firebase/auth');
      const { getFirestore, doc, getDoc, updateDoc, setDoc } = await import('firebase/firestore');
      
      const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
      const auth = getAuth(app);
      const db = getFirestore(app);
      
      await signInWithEmailAndPassword(auth, 'cron@runmonitor.app', 'SecureCronPassword123!');
      
      const configDoc = await getDoc(doc(db, 'config', 'app_settings'));
      if(!configDoc.exists()) return;
      const settings = configDoc.data();
      if(settings.autoSendWhatsAppEnabled === false) return;
      
      const endTime = settings.shiftEndTime;
      if(!endTime) return;
      
      const nowLocal = new Date();
      nowLocal.setHours(nowLocal.getUTCHours() - 4); // force UTC-4 for Caracas
      
      const [endH, endM] = endTime.split(':').map(Number);
      
      if (nowLocal.getHours() === endH && nowLocal.getMinutes() === endM) {
         const dateStr = nowLocal.toISOString().split('T')[0];
         const shiftKey = \`\${endTime}_\${dateStr}\`;
         
         if (settings.lastAutoSentShiftKey === shiftKey) return;
         
         const stagedDoc = await getDoc(doc(db, 'whatsapp_backups', 'staged_upcoming_report'));
         if(stagedDoc.exists() && stagedDoc.data().message) {
             const finalReport = stagedDoc.data().message;
             
             await updateDoc(doc(db, 'config', 'app_settings'), { lastAutoSentShiftKey: shiftKey });
             
             const result = await sendWhatsAppMessage(settings, finalReport);
             
             const backupId = \`bk_\${Date.now()}\`;
             await setDoc(doc(db, 'whatsapp_backups', backupId), {
                 id: backupId, timestamp: new Date().toISOString(), recipient: 'WhatsApp y Telegram (Server Cron)', message: finalReport, status: result.success ? 'success' : 'failed', error: result.error || null, type: 'reporte_programado', shiftKey: shiftKey
             });
         }
      }
    } catch(e) {
      console.error('[Server Cron] Error:', e.message);
    }
  });\n\n`;

    code = code.substring(0, idx1) + replacement + code.substring(idx2);
    fs.writeFileSync('server.ts', code);
    console.log("Success");
} else {
    console.log("Anchors not found");
}
