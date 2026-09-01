import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, getDocs, collection } from 'firebase/firestore';
import { format } from 'date-fns';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

export default async function handler(req, res) {
  // Evitar que Vercel y el navegador cacheen esta respuesta (CRÍTICO para cron-job)
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  try {
    // 1. Validate security token
    const token = req.query.token || req.headers.authorization;
    if (token !== 'runmonitor-secure-tick') {
      return res.status(401).json({ error: 'Unauthorized. Please provide ?token=runmonitor-secure-tick' });
    }

    // prevent re-initialization if vercel keeps container warm
    let app;
    if (getApps().length === 0) {
      app = initializeApp(firebaseConfig);
    } else {
      app = getApp();
    }
    
    // Autenticar al bot para poder leer la base de datos
    const auth = getAuth(app);
    await signInWithEmailAndPassword(auth, 'cron@runmonitor.app', 'SecureCronPassword123!');
    
    const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

    // Guardar log temporal para probar si cron-job.org realmente está visitando
    try {
        await setDoc(doc(db, 'logs', `ping_${Date.now()}`), {
           description: `CRON-JOB PING RECIBIDO - Token válido`,
           timestamp: new Date(),
           equipmentId: 'cron_test',
           type: 'ping'
        });
    } catch (e) {}

    // 3. Read App Settings
    const settingsRef = doc(db, 'config', 'app_settings');
    const settingsSnap = await getDoc(settingsRef);
    if (!settingsSnap.exists()) {
      return res.status(200).json({ message: 'Settings not found, skipping.' });
    }
    const settings = settingsSnap.data();

    // Check if auto send is enabled
    if (settings.autoSendWhatsAppEnabled === false) {
      return res.status(200).json({ message: 'Auto-send is disabled in settings.' });
    }

    const rangeMode = settings.shiftRangeMode || 'scheduled';
    const endTime = settings.shiftEndTime;
    const startTime = settings.shiftStartTime;

    if (!endTime || rangeMode === 'until_now') {
      return res.status(200).json({ message: 'Invalid range mode or no endTime configured.' });
    }

    // 4. Time checks
    const nowUTC = new Date();
    // Caracas is UTC-4
    const offset = -4; 
    const nowLocal = new Date(nowUTC.getTime() + offset * 3600 * 1000);

    const [endH, endM] = endTime.split(':').map(Number);
    if (isNaN(endH) || isNaN(endM)) {
      return res.status(200).json({ message: 'Invalid endTime format.' });
    }

    const targetShiftEnd = new Date(nowLocal);
    targetShiftEnd.setUTCHours(endH, endM, 0, 0);

    // If current local time is before the target end time of today
    if (nowLocal.getTime() < targetShiftEnd.getTime() - 7000) {
      return res.status(200).json({ message: `Still before cutoff time (${endTime}). Current local time: ${nowLocal.toISOString()}` });
    }

    const dateStr = format(targetShiftEnd, 'yyyy-MM-dd');
    const shiftKey = `${endTime}_${dateStr}`;

    if (settings.lastAutoSentShiftKey === shiftKey) {
      return res.status(200).json({ message: 'Report already sent for this shift.', shiftKey });
    }

    // 5. Generate Report Text
    let startLocal = new Date(targetShiftEnd);
    const [startH, startM] = (startTime || '06:00').split(':').map(Number);
    if (startH === endH && startM === endM) {
      startLocal.setUTCDate(targetShiftEnd.getUTCDate() - 1);
      startLocal.setUTCHours(startH, startM, 0, 0);
    } else if (startH > endH || (startH === endH && startM > endM)) {
      startLocal.setUTCDate(targetShiftEnd.getUTCDate() - 1);
      startLocal.setUTCHours(startH, startM, 0, 0);
    } else {
      startLocal.setUTCHours(startH, startM, 0, 0);
    }

    let reportText = '';
    const stagedSnap = await getDoc(doc(db, 'whatsapp_backups', 'staged_upcoming_report'));
    if (stagedSnap.exists() && stagedSnap.data().message) {
      reportText = stagedSnap.data().message;
      console.log('Se uso el reporte pre-generado staged_upcoming_report');
    } else {
       console.log('No se encontro staged. Construyendo de emergencia...');
       reportText = "*REPORTE DE EMERGENCIA*\nNo se pudo leer el reporte pre-generado. Hubo un error en el cliente.";
    }

        // 6. Send to WhatsApp and/or Telegram
    let sendSuccess = false;
    let errorMsg = null;
    let resultData = null;

    const fetchWithTimeout = (url, options, timeout = 4000) => {
      return Promise.race([
        fetch(url, options),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout))
      ]);
    };

    let telegramPromise = Promise.resolve();

    try {
      if (settings.telegramBotToken && settings.telegramChatId) {
          const telegramUrl = `https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`;
          telegramPromise = fetch(telegramUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  chat_id: settings.telegramChatId,
                  text: reportText,
                  parse_mode: 'Markdown'
              })
          }).then(r => r.json()).then(d => {
              if (d.ok) { sendSuccess = true; console.log("Telegram OK"); }
          }).catch(e => console.error("Telegram error:", e));
      }

      // WhatsApp send
      const provider = settings.whatsappProvider || 'render_baileys';
      let formattedTo = settings.whatsappGroupId || settings.greenApiChatId || '120363427690312638@g.us';
      
      if (!formattedTo) {
         if (!sendSuccess) errorMsg = 'No se ha configurado un ID de grupo destino';
      } else {
          let url = settings.whatsappApiUrl || 'https://bot-whatsapp-baileys-jpyb.onrender.com/send-message';
          let bodyPayload = { to: formattedTo.replace('@g.us', '').replace('@c.us', ''), message: reportText };
          
          if (provider === 'green_api') {
              url = `https://api.green-api.com/waInstance${settings.greenApiInstanceId}/sendMessage/${settings.greenApiToken}`;
              bodyPayload = { chatId: formattedTo, message: reportText };
          }
          
          const resp = await fetchWithTimeout(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(bodyPayload)
          });
          resultData = await resp.json().catch(()=>({}));
          if (resp.ok && !resultData.error) sendSuccess = true;
          else errorMsg = resultData.error || resultData.message || 'WhatsApp API Error';
      }

      // Wait for Telegram to finish in parallel
      await telegramPromise;
      
    } catch(e) {
      errorMsg = e.message;
    }
// 7. Save backup in Firestore
    const backupId = `bk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const backupData = {
        id: backupId,
        timestamp: new Date().toISOString(),
        recipient: 'Grupo WhatsApp (Vercel Cron)',
        message: reportText,
        status: sendSuccess ? 'success' : 'failed',
        error: errorMsg,
        type: 'reporte_programado',
        shiftKey: shiftKey
    };
    await setDoc(doc(db, 'whatsapp_backups', backupId), backupData);

    // 7.5 Crear notificación en la app para alertar al usuario
    try {
      const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const notifTitle = sendSuccess 
         ? '✅ Reporte en la Nube Enviado' 
         : '⚠️ Fallo en Vercel Cron (WhatsApp)';
         
      const notifMessage = sendSuccess 
         ? `El reporte automático (${shiftKey}) se envió exitosamente a WhatsApp desde el servidor de Vercel.`
         : `Fallo al enviar reporte desde la nube. Razón: ${errorMsg || 'Servidor WhatsApp desconectado'}. Revisa que Render no esté dormido o verifica la conexión de tu bot.`;
         
      await setDoc(doc(db, 'notifications', notifId), {
        title: notifTitle,
        message: notifMessage,
        type: sendSuccess ? 'success' : 'error',
        timestamp: new Date(),
        read: false
      });
    } catch (notifErr) {
      console.error("Error guardando notificacion:", notifErr);
    }

    // 8. Update shiftKey if success
    if (sendSuccess) {
      await setDoc(settingsRef, { lastAutoSentShiftKey: shiftKey }, { merge: true });
      return res.status(200).json({ success: true, message: 'Report sent via Vercel Cron!', shiftKey });
    } else {
      return res.status(500).json({ success: false, error: errorMsg, details: 'Report generation succeeded but sending failed. Will retry.' });
    }

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}
