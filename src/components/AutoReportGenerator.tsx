import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit, 
  doc, 
  onSnapshot, 
  setDoc, 
  getDoc,
  deleteDoc,
  serverTimestamp, 
  Timestamp, 
  addDoc 
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export function AutoReportGenerator() {
  const [startTime, setStartTime] = useState('18:00');
  const [endTime, setEndTime] = useState('18:00');
  const [rangeMode, setRangeMode] = useState<'scheduled' | 'until_now'>('scheduled');
  const [autoSendEnabled, setAutoSendEnabled] = useState(true);
  const [lastAutoSentShiftKey, setLastAutoSentShiftKey] = useState<string | null>(null);

  const isExecutingRef = useRef(false);
  const isStagingRef = useRef(false);
  const configLoadedRef = useRef(false);

  useEffect(() => {
    const unsubscribeConfig = onSnapshot(doc(db, 'config', 'app_settings'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.shiftStartTime) setStartTime(data.shiftStartTime);
        if (data.shiftEndTime) setEndTime(data.shiftEndTime);
        if (data.shiftRangeMode) setRangeMode(data.shiftRangeMode);
        if (data.autoSendWhatsAppEnabled !== undefined) setAutoSendEnabled(data.autoSendWhatsAppEnabled);
        if (data.lastAutoSentShiftKey) setLastAutoSentShiftKey(data.lastAutoSentShiftKey);
      }
      configLoadedRef.current = true;
    });
    return () => unsubscribeConfig();
  }, []);

  // Helper to safely parse any Firestore timestamp or Date
  const safeToDate = (ts: any): Date => {
    if (!ts) return new Date();
    if (ts instanceof Date) return ts;
    if (typeof ts.toDate === 'function') return ts.toDate();
    if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
    if (typeof ts._seconds === 'number') return new Date(ts._seconds * 1000);
    if (typeof ts === 'number') return new Date(ts);
    if (typeof ts === 'string') {
      const d = new Date(ts);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  };

  // Helper to build current report text
  const buildCurrentReportText = async (targetShiftEnd: Date): Promise<string> => {
    const now = new Date();
    let start: Date;
    let end: Date = targetShiftEnd;

    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);

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

    // Fetch categories
    const catSnap = await getDocs(collection(db, 'categories'));
    const categories: Record<string, string> = {};
    catSnap.forEach(docSnap => {
      categories[docSnap.id] = docSnap.data().name;
    });

    // Fetch equipment
    const equipSnap = await getDocs(collection(db, 'equipment'));
    const equipments: any[] = [];
    equipSnap.forEach(docSnap => {
      equipments.push({ id: docSnap.id, ...docSnap.data() });
    });

    // Fetch all logs once (avoids composite index errors)
    const allLogsSnap = await getDocs(collection(db, 'logs'));
    const allLogs: any[] = [];
    allLogsSnap.forEach(docSnap => {
      allLogs.push({ id: docSnap.id, ...docSnap.data() });
    });

    // Filter logs in shift range
    const logs = allLogs.filter(l => {
      const d = safeToDate(l.timestamp);
      return d >= start && d <= end;
    });
    logs.sort((a, b) => safeToDate(a.timestamp).getTime() - safeToDate(b.timestamp).getTime());

    // Fetch all power events once
    const allPowerSnap = await getDocs(collection(db, 'power_events'));
    const allPower: any[] = [];
    allPowerSnap.forEach(docSnap => {
      allPower.push({ id: docSnap.id, ...docSnap.data() });
    });

    const powerEvents = allPower.filter(p => {
      const d = safeToDate(p.timestamp);
      return d >= start && d <= end;
    });
    powerEvents.sort((a, b) => safeToDate(a.timestamp).getTime() - safeToDate(b.timestamp).getTime());

    const priorPower = allPower.filter(p => safeToDate(p.timestamp) < start);
    priorPower.sort((a, b) => safeToDate(b.timestamp).getTime() - safeToDate(a.timestamp).getTime());
    let initialPowerState: any = priorPower.length > 0 ? priorPower[0] : null;

    // Determine arrival status for each equipment prior to shift
    const arrivalStatuses: Record<string, string> = {};
    equipments.forEach((eq) => {
      const priorLogs = allLogs.filter(l => l.equipmentId === eq.id && safeToDate(l.timestamp) < start);
      priorLogs.sort((a, b) => safeToDate(b.timestamp).getTime() - safeToDate(a.timestamp).getTime());
      let foundStatus: string | null = null;
      for (const d of priorLogs) {
        if (d.action === 'on' || d.action === 'off') {
          foundStatus = d.action;
          break;
        }
      }
      if (!foundStatus) {
        foundStatus = eq.status === 'on' ? 'on' : 'off';
      }
      arrivalStatuses[eq.id] = foundStatus;
    });

    // Group equipments
    const groupedEquipments: Record<string, any[]> = {};
    equipments.forEach(eq => {
      const catId = eq.categoryId || 'uncategorized';
      if (!groupedEquipments[catId]) groupedEquipments[catId] = [];
      groupedEquipments[catId].push(eq);
    });

    // Format report
    const startStr = `${format(start, "dd/MM/yy")} (${format(start, "h:mma")})`;
    const endStr = `${format(end, "dd/MM/yy")} (${format(end, "h:mma")})`;

    const currentOp = auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || 'Operador Automático';

    let text = `👤 OP. EN TURNO: ${currentOp}\n`;
    text += `📅 Ciclo Operativo: ${startStr} — ${endStr}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n`;

    // Power events
    let powerEventsText = '';
    if (powerEvents.length > 0 || (initialPowerState && initialPowerState.type !== 'ok')) {
      const fallas: any[] = [];
      const cortes: any[] = [];
      let currentEvent: any = null;

      if (initialPowerState && initialPowerState.type !== 'ok') {
        currentEvent = {
          start: safeToDate(initialPowerState.timestamp),
          end: null,
          type: initialPowerState.type
        };
      }

      powerEvents.forEach((ev) => {
        const evDate = safeToDate(ev.timestamp);
        if (ev.type === 'falla' || ev.type === 'corte') {
          if (!currentEvent) {
            currentEvent = { start: evDate, end: null, type: ev.type };
          } else if (currentEvent.type !== ev.type) {
            currentEvent.end = evDate;
            if (currentEvent.type === 'falla') fallas.push(currentEvent);
            else cortes.push(currentEvent);
            currentEvent = { start: evDate, end: null, type: ev.type };
          }
        } else if (ev.type === 'ok') {
          if (currentEvent) {
            currentEvent.end = evDate;
            if (currentEvent.type === 'falla') fallas.push(currentEvent);
            else cortes.push(currentEvent);
            currentEvent = null;
          }
        }
      });

      if (currentEvent) {
        if (currentEvent.type === 'falla') fallas.push(currentEvent);
        else cortes.push(currentEvent);
      }

      if (fallas.length > 0 || cortes.length > 0) {
        powerEventsText += `⚡ ESTADO DEL SERVICIO ELÉCTRICO\n`;
        
        const formatDuration = (mins: number) => {
          const hrs = Math.floor(mins / 60);
          const m = mins % 60;
          return hrs > 0 ? `${hrs}h ${m}m` : `${m}m`;
        };

        if (fallas.length > 0) {
          powerEventsText += `Fallas en el servicio eléctrico: ${fallas.length}\n`;
          let fallasDurationMins = 0;
          fallas.forEach((falla, index) => {
            const sStr = format(falla.start, 'h:mma');
            if (falla.end) {
              const eStr = format(falla.end, 'h:mma');
              const durationMs = falla.end.getTime() - falla.start.getTime();
              const durationMins = Math.round(durationMs / 60000);
              fallasDurationMins += durationMins;
              powerEventsText += `${index + 1}) ${sStr}/ ${eStr} - ${formatDuration(durationMins)}\n`;
            } else {
              powerEventsText += `${index + 1}) ${sStr}/ (Sigue interrumpido)\n`;
            }
          });
          if (fallasDurationMins > 0) {
            powerEventsText += `Duracion total de fallas: ${formatDuration(fallasDurationMins)}\n`;
          }
          if (cortes.length > 0) powerEventsText += `\n`;
        }

        if (cortes.length > 0) {
          powerEventsText += `Cortes en el servicio eléctrico: ${cortes.length}\n`;
          let cortesDurationMins = 0;
          cortes.forEach((corte, index) => {
            const sStr = format(corte.start, 'h:mma');
            if (corte.end) {
              const eStr = format(corte.end, 'h:mma');
              const durationMs = corte.end.getTime() - corte.start.getTime();
              const durationMins = Math.round(durationMs / 60000);
              cortesDurationMins += durationMins;
              powerEventsText += `${index + 1}) ${sStr}/ ${eStr} - ${formatDuration(durationMins)}\n`;
            } else {
              powerEventsText += `${index + 1}) ${sStr}/ (Sigue interrumpido)\n`;
            }
          });
          if (cortesDurationMins > 0) {
            powerEventsText += `Duracion total de cortes: ${formatDuration(cortesDurationMins)}\n`;
          }
        }
        powerEventsText += `━━━━━━━━━━━━━━━━━━━━\n`;
      }
    }

    // Observations
    let observations = '';
    const obsDoc = await getDoc(doc(db, 'config', 'current_shift_observations'));
    if (obsDoc.exists()) {
      observations = obsDoc.data().observations || '';
    }
    if (observations.trim()) {
      text += `_NOTAS Y OBSERVACIONES:_\n${observations.trim()}\n━━━━━━━━━━━━━━━━━━━━\n`;
    }
    
    // Maintenance
    let maintenanceRecords = '';
    const maintDoc = await getDoc(doc(db, 'config', 'current_shift_maintenance'));
    if (maintDoc.exists()) {
      maintenanceRecords = maintDoc.data().records || '';
    }

    // Equipments iteration
    const catIds = Object.keys(groupedEquipments);
    let hasAnyData = false;
    
    catIds.forEach(catId => {
      const catName = categories[catId] || 'General / Sin Área';
      const catEquips = groupedEquipments[catId];
      
      let catText = `_ÁREA: ${catName.toUpperCase()}_\n`;
      catText += `━━━━━━━━━━━━━━━━━━━━\n`;
      let hasDataForCat = false;

      catEquips.forEach(eq => {
        const eqLogs = logs.filter(l => l.equipmentId === eq.id && (l.action === 'on' || l.action === 'off'));
        const arrivalStatus = arrivalStatuses[eq.id];
        const eqNameLower = eq.name.toLowerCase();
        const isAlwaysVisible = eqNameLower.includes('playa') || eqNameLower.includes('pozo #4') || eqNameLower.includes('pozo 4');

        if (eqLogs.length > 0 || (arrivalStatus === 'on' && eq.tiempo_operativo !== false) || isAlwaysVisible) {
          hasDataForCat = true;
          hasAnyData = true;
          catText += `◻️ *${eq.name.trim()}*\n`;

          const logsByDate: Record<string, any[]> = {};
          eqLogs.forEach(log => {
            const logDate = safeToDate(log.timestamp);
            const dateStr = format(logDate, 'yyyy-MM-dd');
            if (!logsByDate[dateStr]) logsByDate[dateStr] = [];
            logsByDate[dateStr].push(log);
          });

          const startDateStr = format(start, 'yyyy-MM-dd');
          if (eqLogs.length === 0 && arrivalStatus === 'on' && eq.tiempo_operativo !== false) {
            logsByDate[startDateStr] = [];
          }

          const sortedDates = Object.keys(logsByDate).sort();
          
          sortedDates.forEach(dateKey => {
            const dayLogs = logsByDate[dateKey];
            if (dayLogs.length > 0 || arrivalStatus === 'on') {
              const dateParts = dateKey.split('-').map(Number);
              const dateObj = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
              const dayName = format(dateObj, "EEEE d", { locale: es });
              const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
              
              catText += `          ${capitalizedDay}\n`;
              
              if (dayLogs.length === 0) {
                if (arrivalStatus === 'on') {
                  catText += `• (En servicio desde el inicio / Sigue ON)\n`;
                }
              }

              let i = 0;
              while (i < dayLogs.length) {
                const log = dayLogs[i];
                const logDate = safeToDate(log.timestamp);
                if (log.action === 'on') {
                  const timeOn = format(logDate, 'h:mma');
                  if (i + 1 < dayLogs.length && dayLogs[i+1].action === 'off') {
                    const nextLogDate = safeToDate(dayLogs[i+1].timestamp);
                    const timeOff = format(nextLogDate, 'h:mma');
                    catText += `• ON ${timeOn}  |  OFF ${timeOff}\n`;
                    i += 2;
                  } else {
                    catText += `• ON ${timeOn} (Sigue ON)\n`;
                    i++;
                  }
                } else {
                  const timeOff = format(logDate, 'h:mma');
                  catText += `• OFF ${timeOff}\n`;
                  i++;
                }
              }
            }
          });

          if (eq.tiempo_operativo !== false) {
            let totalMs = 0;
            let isOn = arrivalStatus === 'on';
            let lastOnTime = isOn ? start.getTime() : 0;

            eqLogs.forEach(log => {
              const logDate = safeToDate(log.timestamp);
              const logTime = logDate.getTime();
              if (log.action === 'on') {
                if (!isOn) {
                  isOn = true;
                  lastOnTime = logTime;
                }
              } else if (log.action === 'off') {
                if (isOn) {
                  totalMs += Math.max(0, logTime - lastOnTime);
                  isOn = false;
                }
              }
            });

            if (isOn) {
              const evalMs = Math.min(now.getTime(), end.getTime());
              if (evalMs > lastOnTime) {
                totalMs += (evalMs - lastOnTime);
              }
            }

            const totalMinutes = Math.round(totalMs / 60000);
            let timeFormatted = '';
            if (totalMinutes < 60) {
              timeFormatted = `${totalMinutes}m`;
            } else {
              const hours = Math.floor(totalMinutes / 60);
              const minutes = totalMinutes % 60;
              timeFormatted = minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
            }
            
            catText += `_Tiempo operativo: ${timeFormatted}_\n`;
          }
        }
      });

      if (hasDataForCat) {
        text += catText;
        text += `━━━━━━━━━━━━━━━━━━━━\n`;
      }
    });

    if (powerEventsText) {
      text += powerEventsText;
    }
    
    if (maintenanceRecords.trim()) {
      text += `_REGISTRO DE MANTENIMIENTO:_\n${maintenanceRecords.trim()}\n`;
      text += `━━━━━━━━━━━━━━━━━━━━\n`;
    }

    if (!hasAnyData && !observations.trim() && powerEvents.length === 0 && (!initialPowerState || initialPowerState.type === 'ok') && !maintenanceRecords.trim()) {
      text += `\nNo se registraron movimientos en este turno.\n`;
    }

    return text.trim();
  };

  // Pre-generate & stage report in real-time
  const stageCurrentReport = async () => {
    if (!configLoadedRef.current || isStagingRef.current) return;

    const [endH, endM] = (endTime || '18:00').split(':').map(Number);
    if (isNaN(endH) || isNaN(endM)) return;

    const now = new Date();
    let targetEnd = new Date(now);
    targetEnd.setHours(endH, endM, 0, 0);

    if (now > targetEnd) {
      targetEnd.setDate(targetEnd.getDate() + 1);
    }

    const dateStr = format(targetEnd, 'yyyy-MM-dd');
    const shiftKey = `${endTime}_${dateStr}`;

    // Skip staging if already sent for this shiftKey
    if (lastAutoSentShiftKey === shiftKey) return;

    try {
      isStagingRef.current = true;
      const reportText = await buildCurrentReportText(targetEnd);
      
      const stagedDocRef = doc(db, 'whatsapp_backups', 'staged_upcoming_report');
      await setDoc(stagedDocRef, {
        id: 'staged_upcoming_report',
        timestamp: new Date().toISOString(),
        recipient: 'Grupo WhatsApp (Programado)',
        message: reportText,
        status: 'scheduled',
        type: 'reporte_programado',
        shiftKey: shiftKey,
        scheduledTime: targetEnd.toISOString(),
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (err) {
      console.warn("[AutoReportGenerator] Error staging current report:", err);
    } finally {
      isStagingRef.current = false;
    }
  };

  const checkAndTriggerAutoReport = async () => {
    if (!configLoadedRef.current || isExecutingRef.current) return;
    if (rangeMode === 'until_now' || !endTime) return;

    const [endH, endM] = endTime.split(':').map(Number);
    if (isNaN(endH) || isNaN(endM)) return;

    const now = new Date();
    const endToday = new Date(now);
    endToday.setHours(endH, endM, 0, 0);

    if (now < endToday) {
      return;
    }

    const targetShiftEnd = endToday;
    const dateStr = format(targetShiftEnd, 'yyyy-MM-dd');
    const shiftKey = `${endTime}_${dateStr}`;

    if (lastAutoSentShiftKey === shiftKey) return;

    try {
      isExecutingRef.current = true;
      const settingsRef = doc(db, 'config', 'app_settings');
      const docSnap = await getDoc(settingsRef);
      if (docSnap.exists() && docSnap.data().lastAutoSentShiftKey === shiftKey) {
        setLastAutoSentShiftKey(shiftKey);
        isExecutingRef.current = false;
        return;
      }

      await setDoc(settingsRef, { lastAutoSentShiftKey: shiftKey }, { merge: true });
      setLastAutoSentShiftKey(shiftKey);

      console.log(`[AutoReportGenerator] Ejecutando corte programado (${shiftKey}). WhatsApp AutoSend: ${autoSendEnabled ? 'ACTIVO' : 'DESACTIVADO'}...`);
      
      // Get staged report or build fresh
      let finalReport = '';
      const stagedSnap = await getDoc(doc(db, 'whatsapp_backups', 'staged_upcoming_report'));
      if (stagedSnap.exists() && stagedSnap.data().message) {
        finalReport = stagedSnap.data().message;
      } else {
        finalReport = await buildCurrentReportText(targetShiftEnd);
      }

      let backupStatus: 'success' | 'failed' | 'saved' = 'saved';
      let errorMsg: string | null = null;
      let recipientName = 'Respaldo Local (WhatsApp Desactivado)';

      // If WhatsApp auto send is enabled, attempt to send via API
      if (autoSendEnabled) {
        recipientName = 'Grupo WhatsApp (Automático)';
        try {
          const response = await fetch('/api/send-whatsapp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: finalReport })
          });

          if (response.ok) {
            try {
              const data = await response.json();
              if (data.success) {
                backupStatus = 'success';
              } else {
                backupStatus = 'failed';
                errorMsg = data.error || 'Error al enviar a WhatsApp';
              }
            } catch (parseError) {
              backupStatus = 'failed';
              errorMsg = `Respuesta no válida (posible falta de backend en Vercel). Estado: ${response.status}`;
            }
          } else {
            backupStatus = 'failed';
            try {
              const errData = await response.json();
              errorMsg = errData.error || `Error HTTP ${response.status} de WhatsApp`;
            } catch (_) {
              errorMsg = `Error HTTP ${response.status} de WhatsApp`;
            }
          }
        } catch (netErr: any) {
          backupStatus = 'failed';
          errorMsg = netErr.message || 'Error de conexión con el servicio de WhatsApp';
        }
      } else {
        // WhatsApp auto-send was toggled off, but report is saved to backup
        backupStatus = 'saved';
        errorMsg = null;
      }

      // CRITICAL: Always create permanent backup entry in whatsapp_backups regardless of WhatsApp status or configuration!
      const backupId = `bk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await setDoc(doc(db, 'whatsapp_backups', backupId), {
        id: backupId,
        timestamp: new Date().toISOString(),
        recipient: recipientName,
        message: finalReport,
        status: backupStatus,
        error: errorMsg,
        type: 'reporte_programado',
        shiftKey: shiftKey,
        whatsappSent: backupStatus === 'success'
      });

      // Remove staged doc
      try {
        await deleteDoc(doc(db, 'whatsapp_backups', 'staged_upcoming_report'));
      } catch (_) {}

      // Always execute shift cutoff and state preservation
      let currentTanksAireacion = [];
      let currentTanksMovimiento = [];
      
      const tanksDoc = await getDoc(doc(db, 'config', 'current_shift_tanks'));
      if (tanksDoc.exists()) {
        const tData = tanksDoc.data();
        currentTanksAireacion = tData.tanquesAireacion || [];
        currentTanksMovimiento = tData.tanquesMovimiento || [];
      }

      await setDoc(doc(db, 'config', 'previous_shift_tanks'), {
        tanquesAireacion: currentTanksAireacion,
        tanquesMovimiento: currentTanksMovimiento,
        lastUpdated: serverTimestamp()
      }, { merge: true });

      await Promise.all([
        setDoc(doc(db, 'config', 'current_shift_observations'), { observations: '', lastUpdated: serverTimestamp() }, { merge: true }),
        setDoc(doc(db, 'config', 'current_shift_maintenance'), { records: '', lastUpdated: serverTimestamp() }, { merge: true }),
        setDoc(doc(db, 'config', 'current_shift_tanks'), { tanquesAireacion: [], tanquesMovimiento: [], lastUpdated: serverTimestamp() }, { merge: true })
      ]);

      const notifTitle = backupStatus === 'success' 
        ? 'Corte de Reporte Enviado a WhatsApp' 
        : backupStatus === 'saved' 
          ? 'Corte de Reporte Guardado en Respaldo' 
          : 'Corte de Reporte Guardado (Falla WhatsApp)';

      const notifMessage = backupStatus === 'success'
        ? `El reporte operativo fue generado y enviado automáticamente a WhatsApp a las ${new Date().toLocaleTimeString()}.`
        : backupStatus === 'saved'
          ? `El reporte programado fue generado y guardado en respaldo a las ${new Date().toLocaleTimeString()} (Envío a WhatsApp desactivado).`
          : `El reporte fue guardado en el módulo de respaldos. WhatsApp reportó: ${errorMsg || 'desconectado'}.`;

      await addDoc(collection(db, 'notifications'), {
        title: notifTitle,
        message: notifMessage,
        type: backupStatus === 'failed' ? 'warning' : 'success',
        timestamp: serverTimestamp(),
        read: false
      });

      console.log(`[AutoReportGenerator] Corte programado completado con éxito. Estado: ${backupStatus}`);
    } catch (err) {
      console.error("Error in Global Auto Report generator:", err);
    } finally {
      isExecutingRef.current = false;
    }
  };

  useEffect(() => {
    // Stage immediately
    stageCurrentReport();

    // Subscribe to real-time changes in logs, power events, observations, maintenance, equipment
    const unsubLogs = onSnapshot(collection(db, 'logs'), () => stageCurrentReport());
    const unsubPower = onSnapshot(collection(db, 'power_events'), () => stageCurrentReport());
    const unsubObs = onSnapshot(doc(db, 'config', 'current_shift_observations'), () => stageCurrentReport());
    const unsubMaint = onSnapshot(doc(db, 'config', 'current_shift_maintenance'), () => stageCurrentReport());
    const unsubEquip = onSnapshot(collection(db, 'equipment'), () => stageCurrentReport());

    const stageInterval = setInterval(() => stageCurrentReport(), 10000);
    const triggerInterval = setInterval(() => checkAndTriggerAutoReport(), 5000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        stageCurrentReport();
        checkAndTriggerAutoReport();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);

    return () => {
      unsubLogs();
      unsubPower();
      unsubObs();
      unsubMaint();
      unsubEquip();
      clearInterval(stageInterval);
      clearInterval(triggerInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
    };
  }, [endTime, startTime, rangeMode, autoSendEnabled, lastAutoSentShiftKey]);

  return null;
}

