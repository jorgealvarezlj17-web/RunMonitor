import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, getDocs, collection } from 'firebase/firestore';
import { format } from 'date-fns';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

export default async function handler(req, res) {
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
    if (nowLocal < targetShiftEnd) {
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

    // Safe date parsing helper
    const safeToDate = (ts) => {
      if (!ts) return new Date();
      if (ts instanceof Date) return ts;
      if (typeof ts.toDate === 'function') return ts.toDate();
      if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
      if (typeof ts === 'string') return new Date(ts);
      return new Date();
    };

    // Fetch collections
    const catSnap = await getDocs(collection(db, 'categories'));
    const categories = {};
    catSnap.forEach(d => { categories[d.id] = d.data().name; });

    const equipSnap = await getDocs(collection(db, 'equipment'));
    const equipments = [];
    equipSnap.forEach(d => { equipments.push({ id: d.id, ...d.data() }); });

    const allLogsSnap = await getDocs(collection(db, 'logs'));
    const logs = [];
    allLogsSnap.forEach(d => {
      const data = d.data();
      const dt = safeToDate(data.timestamp);
      const tzOffset = -4 * 3600 * 1000;
      const dtLocal = new Date(dt.getTime() + tzOffset);
      
      if (dtLocal >= startLocal && dtLocal <= targetShiftEnd) {
        logs.push({ id: d.id, ...data });
      }
    });
    logs.sort((a, b) => safeToDate(a.timestamp).getTime() - safeToDate(b.timestamp).getTime());

    const allPowerSnap = await getDocs(collection(db, 'power_events'));
    const powerEvents = [];
    allPowerSnap.forEach(d => {
      const data = d.data();
      const dtLocal = new Date(safeToDate(data.timestamp).getTime() - 4 * 3600 * 1000);
      if (dtLocal >= startLocal && dtLocal <= targetShiftEnd) {
        powerEvents.push({ id: d.id, ...data });
      }
    });
    powerEvents.sort((a, b) => safeToDate(a.timestamp).getTime() - safeToDate(b.timestamp).getTime());

    const obsSnap = await getDoc(doc(db, 'config', 'current_shift_observations'));
    const maintSnap = await getDoc(doc(db, 'config', 'current_shift_maintenance'));
    const observationsText = obsSnap.exists() ? obsSnap.data().text || '' : '';
    const maintText = maintSnap.exists() ? maintSnap.data().text || '' : '';

    // Build the text
    let reportText = `*REPORTE OPERATIVO PROGRAMADO*\n`;
    reportText += `*FECHA:* ${format(targetShiftEnd, 'dd/MM/yyyy')}\n`;
    reportText += `*TURNO:* ${startH.toString().padStart(2, '0')}:${startM.toString().padStart(2, '0')} a ${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}\n\n`;

    // Equipments
    reportText += `*ESTADO DE EQUIPOS:*\n`;
    const catGroups = {};
    equipments.forEach(eq => {
      const c = eq.categoryId || 'sin_categoria';
      if (!catGroups[c]) catGroups[c] = [];
      catGroups[c].push(eq);
    });
    for (const catId of Object.keys(catGroups)) {
      const catName = categories[catId] || catId;
      reportText += `\n*${catName}*\n`;
      catGroups[catId].forEach(eq => {
        let stIcon = '✅';
        if (eq.status === 'warning') stIcon = '⚠️';
        if (eq.status === 'offline') stIcon = '❌';
        reportText += `${stIcon} ${eq.name}: ${eq.status === 'online' ? 'Operativo' : eq.status === 'warning' ? 'Precaución' : 'Fuera de Servicio'}\n`;
      });
    }

    reportText += `\n*NOVEDADES DEL TURNO:*\n`;
    if (logs.length === 0 && powerEvents.length === 0) {
      reportText += `Sin novedades reportadas en el periodo.\n`;
    } else {
      if (powerEvents.length > 0) {
        reportText += `\n⚡ Eventos Eléctricos:\n`;
        powerEvents.forEach(pe => {
          const dtLocal = new Date(safeToDate(pe.timestamp).getTime() - 4 * 3600 * 1000);
          reportText += `- ${format(dtLocal, 'HH:mm')} | ${pe.type === 'corte' ? 'CORTE DE ENERGÍA' : 'RESTABLECIMIENTO'} | Planta: ${pe.plantStatus === 'encendida' ? 'Encendida' : 'Apagada'}\n`;
        });
      }
      if (logs.length > 0) {
        reportText += `\n📋 Registros:\n`;
        logs.forEach(log => {
          const dtLocal = new Date(safeToDate(log.timestamp).getTime() - 4 * 3600 * 1000);
          let eqName = log.equipmentId;
          const eq = equipments.find(e => e.id === log.equipmentId);
          if (eq) eqName = eq.name;
          reportText += `- ${format(dtLocal, 'HH:mm')} | ${eqName} | ${log.description}\n`;
        });
      }
    }

    if (maintText.trim()) {
      reportText += `\n*MANTENIMIENTOS:*\n${maintText}\n`;
    }
    if (observationsText.trim()) {
      reportText += `\n*OBSERVACIONES GENERALES:*\n${observationsText}\n`;
    }

    // 6. Send to WhatsApp via internal proxy/Render
    let sendSuccess = false;
    let errorMsg = null;
    let resultData = null;

    try {
      const wpConfigDoc = await getDoc(doc(db, 'config', 'whatsapp'));
      const wpConfig = wpConfigDoc.exists() ? wpConfigDoc.data() : {};
      
      const provider = wpConfig.whatsappProvider || 'render_baileys';
      let formattedTo = wpConfig.whatsappGroupId || wpConfig.greenApiChatId || '120363427690312638@g.us';
      
      if (!formattedTo) {
         errorMsg = 'No se ha configurado un ID de grupo destino';
      } else {
          if (provider === 'green_api') {
              const url = `https://api.green-api.com/waInstance${wpConfig.greenApiInstanceId}/sendMessage/${wpConfig.greenApiToken}`;
              const resp = await fetch(url, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ chatId: formattedTo, message: reportText })
              });
              resultData = await resp.json();
              if (resp.ok && !resultData.error) sendSuccess = true;
              else errorMsg = resultData.error || 'Green API Error';
          } else {
              const url = wpConfig.whatsappApiUrl || 'https://bot-whatsapp-baileys-jpyb.onrender.com/send-message';
              formattedTo = formattedTo.replace('@g.us', '').replace('@c.us', '');
              const resp = await fetch(url, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ to: formattedTo, message: reportText })
              });
              resultData = await resp.json().catch(e=>({}));
              if (resp.ok && !resultData.error) sendSuccess = true;
              else errorMsg = resultData.error || resultData.message || 'Render Baileys API Error';
          }
      }
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
