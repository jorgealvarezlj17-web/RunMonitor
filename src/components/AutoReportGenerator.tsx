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

  const checkAndTriggerAutoReport = async () => {
    if (!configLoadedRef.current || isExecutingRef.current) return;
    if (rangeMode === 'until_now' || !endTime || !autoSendEnabled) return;

    // Calculate shift end time for TODAY
    const [endH, endM] = endTime.split(':').map(Number);
    if (isNaN(endH) || isNaN(endM)) return;

    const now = new Date();
    const endToday = new Date(now);
    endToday.setHours(endH, endM, 0, 0);

    // Only trigger if today's scheduled shift end time has been reached/passed.
    // Do NOT trigger for past days or when saving schedule before the scheduled time.
    if (now < endToday) {
      return;
    }

    const targetShiftEnd = endToday;
    const dateStr = format(targetShiftEnd, 'yyyy-MM-dd');
    const shiftKey = `${endTime}_${dateStr}`;

    // If shift key matches what's already sent in local state, skip
    if (lastAutoSentShiftKey === shiftKey) return;

    // Lock check against Firestore to prevent duplicate concurrent executions
    try {
      isExecutingRef.current = true;
      const settingsRef = doc(db, 'config', 'app_settings');
      const docSnap = await getDoc(settingsRef);
      if (docSnap.exists() && docSnap.data().lastAutoSentShiftKey === shiftKey) {
        setLastAutoSentShiftKey(shiftKey);
        isExecutingRef.current = false;
        return;
      }

      // Lock this shiftKey immediately in Firestore before generating
      await setDoc(settingsRef, { lastAutoSentShiftKey: shiftKey }, { merge: true });
      setLastAutoSentShiftKey(shiftKey);

      console.log(`[AutoReportGenerator] Triggering auto report for shiftKey: ${shiftKey}...`);
      await generateAndSendReport(targetShiftEnd);
    } catch (err) {
      console.error("[AutoReportGenerator] Error checking/locking auto report:", err);
    } finally {
      isExecutingRef.current = false;
    }
  };

  useEffect(() => {
    // Check on interval (every 5s)
    const interval = setInterval(() => {
      checkAndTriggerAutoReport();
    }, 5000);

    // Check immediately on tab visibility change or window focus
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkAndTriggerAutoReport();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);

    // Initial check
    checkAndTriggerAutoReport();

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
    };
  }, [endTime, startTime, rangeMode, autoSendEnabled, lastAutoSentShiftKey]);

  const generateAndSendReport = async (targetShiftEnd: Date) => {
    console.log("Generating report content for auto-send...");
    try {
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

      const startTs = Timestamp.fromDate(start);
      const endTs = Timestamp.fromDate(end);

      // Fetch categories
      const catSnap = await getDocs(collection(db, 'categories'));
      const categories: Record<string, string> = {};
      catSnap.forEach(doc => {
        categories[doc.id] = doc.data().name;
      });

      // Fetch equipment
      const equipSnap = await getDocs(collection(db, 'equipment'));
      const equipments: any[] = [];
      equipSnap.forEach(doc => {
        equipments.push({ id: doc.id, ...doc.data() });
      });

      // Fetch logs
      const q = query(
        collection(db, 'logs'), 
        where('timestamp', '>=', startTs),
        where('timestamp', '<=', endTs),
        orderBy('timestamp', 'asc')
      );
      const querySnapshot = await getDocs(q);
      const logs: any[] = [];
      querySnapshot.forEach(doc => {
        logs.push({ id: doc.id, ...doc.data() });
      });

      // Fetch power events
      const qPower = query(
        collection(db, 'power_events'),
        where('timestamp', '>=', startTs),
        where('timestamp', '<=', endTs),
        orderBy('timestamp', 'asc')
      );
      const powerSnapshot = await getDocs(qPower);
      const powerEvents: any[] = [];
      powerSnapshot.forEach(doc => {
        powerEvents.push({ id: doc.id, ...doc.data() });
      });

      // Fetch last power event
      const qLastPower = query(
        collection(db, 'power_events'),
        where('timestamp', '<', startTs),
        orderBy('timestamp', 'desc'),
        limit(1)
      );
      const lastPowerSnap = await getDocs(qLastPower);
      let initialPowerState: any = null;
      if (!lastPowerSnap.empty) {
        initialPowerState = lastPowerSnap.docs[0].data();
      }

      // Fetch arrival status for each equipment
      const arrivalStatuses: Record<string, string> = {};
      await Promise.all(equipments.map(async (eq) => {
        const qLast = query(
          collection(db, 'logs'),
          where('equipmentId', '==', eq.id),
          where('timestamp', '<', startTs),
          orderBy('timestamp', 'desc'),
          limit(50)
        );
        const snap = await getDocs(qLast);
        let foundStatus = 'off';
        for (const d of snap.docs) {
          const action = d.data().action;
          if (action === 'on' || action === 'off') {
            foundStatus = action;
            break;
          }
        }
        arrivalStatuses[eq.id] = foundStatus;
      }));

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
            start: initialPowerState.timestamp ? initialPowerState.timestamp.toDate() : new Date(),
            end: null,
            type: initialPowerState.type
          };
        }

        powerEvents.forEach((ev) => {
          const evDate = ev.timestamp ? ev.timestamp.toDate() : new Date();
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
              const startStr = format(falla.start, 'h:mma');
              if (falla.end) {
                const endStr = format(falla.end, 'h:mma');
                const durationMs = falla.end.getTime() - falla.start.getTime();
                const durationMins = Math.round(durationMs / 60000);
                fallasDurationMins += durationMins;
                powerEventsText += `${index + 1}) ${startStr}/ ${endStr} - ${formatDuration(durationMins)}\n`;
              } else {
                powerEventsText += `${index + 1}) ${startStr}/ (Sigue interrumpido)\n`;
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
              const startStr = format(corte.start, 'h:mma');
              if (corte.end) {
                const endStr = format(corte.end, 'h:mma');
                const durationMs = corte.end.getTime() - corte.start.getTime();
                const durationMins = Math.round(durationMs / 60000);
                cortesDurationMins += durationMins;
                powerEventsText += `${index + 1}) ${startStr}/ ${endStr} - ${formatDuration(durationMins)}\n`;
              } else {
                powerEventsText += `${index + 1}) ${startStr}/ (Sigue interrumpido)\n`;
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
              const logDate = log.timestamp ? log.timestamp.toDate() : new Date();
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
              const dateParts = dateKey.split('-').map(Number);
              const dateObj = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
              const dayName = format(dateObj, "EEEE d", { locale: es });
              const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
              
              catText += `          ${capitalizedDay}\n`;
              
              const dayLogs = logsByDate[dateKey];
              
              if (dayLogs.length === 0 && arrivalStatus === 'on') {
                catText += `• (En servicio desde el inicio)\n`;
              }

              let i = 0;
              while (i < dayLogs.length) {
                const log = dayLogs[i];
                const logDate = log.timestamp ? log.timestamp.toDate() : new Date();
                if (log.action === 'on') {
                  const timeOn = format(logDate, 'h:mma');
                  if (i + 1 < dayLogs.length && dayLogs[i+1].action === 'off') {
                    const nextLogDate = dayLogs[i+1].timestamp ? dayLogs[i+1].timestamp.toDate() : new Date();
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
            });

            if (eq.tiempo_operativo !== false) {
              let totalMs = 0;
              let isOn = arrivalStatus === 'on';
              let lastOnTime = isOn ? start.getTime() : 0;

              eqLogs.forEach(log => {
                const logDate = log.timestamp ? log.timestamp.toDate() : new Date();
                const logTime = logDate.getTime();
                if (log.action === 'on') {
                  if (!isOn) {
                    isOn = true;
                    lastOnTime = logTime;
                  }
                } else if (log.action === 'off') {
                  if (isOn) {
                    totalMs += (logTime - lastOnTime);
                    isOn = false;
                  }
                }
              });

              if (isOn) {
                const reportEndTime = end < now ? end : now;
                totalMs += (reportEndTime.getTime() - lastOnTime);
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

      const finalReport = text.trim();

      // Send to WhatsApp API
      const response = await fetch('/api/send-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: finalReport })
      });

      if (response.ok) {
        console.log("Global Auto Report sent successfully!");

        // Clear shift data in Firestore
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

        await addDoc(collection(db, 'notifications'), {
          title: 'Corte de Reporte Automático',
          message: `El reporte operativo fue generado y enviado automáticamente a las ${new Date().toLocaleTimeString()}.`,
          type: 'success',
          timestamp: serverTimestamp(),
          read: false
        });
      }
    } catch (err) {
      console.error("Error in Global Auto Report generator:", err);
    }
  };

  return null; // Invisible component
}
