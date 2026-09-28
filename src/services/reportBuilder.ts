import { 
  collection, 
  getDocs, 
  query, 
  orderBy, 
  limit, 
  where,
  doc, 
  getDoc, 
  setDoc 
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export const safeToDate = (ts: any): Date => {
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

export interface ShiftReportResult {
  text: string;
  shiftStart: Date;
  shiftEnd: Date;
  shiftKey: string;
}

/**
 * Builds the complete formatted shift report matching the Panel de Registro and Corte de Reporte.
 */
export async function buildShiftReportText(options?: {
  shiftStartTime?: string;
  shiftEndTime?: string;
  operatorName?: string;
}): Promise<ShiftReportResult> {
  const now = new Date();

  // 1. Fetch app settings if not provided
  let startTimeStr = options?.shiftStartTime;
  let endTimeStr = options?.shiftEndTime;

  if (!startTimeStr || !endTimeStr) {
    try {
      const configDoc = await getDoc(doc(db, 'config', 'app_settings'));
      if (configDoc.exists()) {
        const d = configDoc.data();
        if (!startTimeStr) startTimeStr = d.shiftStartTime || '18:00';
        if (!endTimeStr) endTimeStr = d.shiftEndTime || '18:00';
      }
    } catch (e) {
      console.warn('Notice reading app_settings in buildShiftReportText:', e);
    }
  }

  startTimeStr = startTimeStr || '18:00';
  endTimeStr = endTimeStr || '18:00';

  // 2. Compute shift start and end (exact match with Panel de Registro)
  const [startHour, startMin] = startTimeStr.split(':').map(Number);
  let start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startHour, startMin, 0, 0);
  if (now < start) {
    start.setDate(start.getDate() - 1);
  }

  const [endHour, endMin] = endTimeStr.split(':').map(Number);
  let targetEnd = new Date(start);
  if (endHour < startHour || (endHour === startHour && endMin <= startMin)) {
    targetEnd.setDate(targetEnd.getDate() + 1);
  }
  targetEnd.setHours(endHour, endMin, 0, 0);

  // If the current time is past targetEnd or in between, include all logs up to now
  const evalEnd = Math.max(targetEnd.getTime(), now.getTime());

  // 3. Parallel fetch of required Firestore data
  const [catSnap, equipSnap, logsSnap, powerSnap, obsDoc, maintDoc, tanksDoc] = await Promise.all([
    getDocs(query(collection(db, 'categories'), orderBy('order', 'asc'))),
    getDocs(query(collection(db, 'equipment'), orderBy('order', 'asc'))),
    getDocs(query(collection(db, 'logs'), where('action', 'in', ['on', 'off', 'manual']), orderBy('timestamp', 'desc'), limit(400))),
    getDocs(query(collection(db, 'power_events'), orderBy('timestamp', 'desc'), limit(80))),
    getDoc(doc(db, 'config', 'current_shift_observations')).catch(() => null),
    getDoc(doc(db, 'config', 'current_shift_maintenance')).catch(() => null),
    getDoc(doc(db, 'config', 'current_shift_tanks')).catch(() => null)
  ]);

  // Categories map & ordered list
  const categories: Record<string, string> = {};
  const catList: { id: string; name: string }[] = [];
  catSnap.forEach(d => {
    const data = d.data();
    categories[d.id] = data.name;
    catList.push({ id: d.id, name: data.name });
  });

  // Equipments
  const equipments: any[] = [];
  equipSnap.forEach(d => equipments.push({ id: d.id, ...d.data() }));

  // All logs
  const allLogs: any[] = [];
  logsSnap.forEach(d => allLogs.push({ id: d.id, ...d.data() }));

  // Filter logs for current shift
  const logs = allLogs.filter(l => {
    const d = safeToDate(l.timestamp);
    const ts = d.getTime();
    return ts >= start.getTime() && ts <= evalEnd && (l.action === 'on' || l.action === 'off');
  });
  logs.sort((a, b) => safeToDate(a.timestamp).getTime() - safeToDate(b.timestamp).getTime());

  // Power events
  const allPower: any[] = [];
  powerSnap.forEach(d => allPower.push({ id: d.id, ...d.data() }));

  const powerEvents = allPower.filter(p => {
    const ts = safeToDate(p.timestamp).getTime();
    return ts >= start.getTime() && ts <= evalEnd;
  });
  powerEvents.sort((a, b) => safeToDate(a.timestamp).getTime() - safeToDate(b.timestamp).getTime());

  const priorPower = allPower.filter(p => safeToDate(p.timestamp).getTime() < start.getTime());
  priorPower.sort((a, b) => safeToDate(b.timestamp).getTime() - safeToDate(a.timestamp).getTime());
  const initialPowerState = priorPower.length > 0 ? priorPower[0] : null;

  // Determine arrival status for each equipment prior to shift start
  const arrivalStatuses: Record<string, string> = {};
  equipments.forEach((eq) => {
    const priorLogs = allLogs.filter(l => 
      (l.equipmentId === eq.id || l.equipmentName === eq.name) && 
      safeToDate(l.timestamp).getTime() < start.getTime()
    );
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

  // Group equipments by category
  const groupedEquipments: Record<string, any[]> = {};
  equipments.forEach(eq => {
    const catId = eq.categoryId || 'uncategorized';
    if (!groupedEquipments[catId]) groupedEquipments[catId] = [];
    groupedEquipments[catId].push(eq);
  });

  // 4. Build text
  const startStr = `${format(start, 'dd/MM/yy')} (${format(start, 'h:mma')})`;
  const endStr = `${format(targetEnd, 'dd/MM/yy')} (${format(targetEnd, 'h:mma')})`;
  
  const currentOp = options?.operatorName || 
    auth.currentUser?.displayName || 
    auth.currentUser?.email?.split('@')[0] || 
    'Operador en Turno';

  let text = `👤 OP. EN TURNO: ${currentOp}\n`;
  text += `📅 Ciclo Operativo: ${startStr} — ${endStr}\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n`;

  // Power Events Section
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
      text += `⚡ ESTADO DEL SERVICIO ELÉCTRICO\n`;

      const formatDuration = (mins: number) => {
        const hrs = Math.floor(mins / 60);
        const m = mins % 60;
        return hrs > 0 ? `${hrs}h ${m}m` : `${m}m`;
      };

      if (fallas.length > 0) {
        text += `Fallas en el servicio eléctrico: ${fallas.length}\n`;
        let fallasDurationMins = 0;
        fallas.forEach((falla, index) => {
          const sStr = format(falla.start, 'h:mma');
          if (falla.end) {
            const eStr = format(falla.end, 'h:mma');
            const durationMs = falla.end.getTime() - falla.start.getTime();
            const durationMins = Math.round(durationMs / 60000);
            fallasDurationMins += durationMins;
            text += `${index + 1}) ${sStr}/ ${eStr} - ${formatDuration(durationMins)}\n`;
          } else {
            text += `${index + 1}) ${sStr}/ (Sigue interrumpido)\n`;
          }
        });
        if (fallasDurationMins > 0) {
          text += `Duracion total de fallas: ${formatDuration(fallasDurationMins)}\n`;
        }
        if (cortes.length > 0) text += `\n`;
      }

      if (cortes.length > 0) {
        text += `Cortes en el servicio eléctrico: ${cortes.length}\n`;
        let cortesDurationMins = 0;
        cortes.forEach((corte, index) => {
          const sStr = format(corte.start, 'h:mma');
          if (corte.end) {
            const eStr = format(corte.end, 'h:mma');
            const durationMs = corte.end.getTime() - corte.start.getTime();
            const durationMins = Math.round(durationMs / 60000);
            cortesDurationMins += durationMins;
            text += `${index + 1}) ${sStr}/ ${eStr} - ${formatDuration(durationMins)}\n`;
          } else {
            text += `${index + 1}) ${sStr}/ (Sigue interrumpido)\n`;
          }
        });
        if (cortesDurationMins > 0) {
          text += `Duracion total de cortes: ${formatDuration(cortesDurationMins)}\n`;
        }
      }
      text += `━━━━━━━━━━━━━━━━━━━━\n`;
    }
  }

  // Observations
  const observations = obsDoc?.exists() ? (obsDoc.data().observations || '') : '';
  if (observations.trim()) {
    text += `_NOTAS Y OBSERVACIONES:_\n${observations.trim()}\n━━━━━━━━━━━━━━━━━━━━\n`;
  }

  // Iterate categories in order
  let hasAnyData = false;
  catList.forEach(cat => {
    const catEquips = groupedEquipments[cat.id] || [];
    if (catEquips.length === 0) return;

    let catText = `_ÁREA: ${cat.name.toUpperCase()}_\n`;
    catText += `━━━━━━━━━━━━━━━━━━━━\n`;
    let hasDataForCat = false;

    catEquips.forEach(eq => {
      const eqLogs = logs.filter(l => 
        (l.equipmentId === eq.id || l.equipmentName === eq.name) && 
        (l.action === 'on' || l.action === 'off')
      );
      const arrivalStatus = arrivalStatuses[eq.id];
      const eqNameLower = (eq.name || '').toLowerCase();
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
            const dayName = format(dateObj, 'EEEE d', { locale: es });
            const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
            catText += `          ${capitalizedDay}\n`;

            if (dayLogs.length === 0 && arrivalStatus === 'on') {
              catText += `• (En servicio desde el inicio / Sigue ON)\n`;
            }

            let i = 0;
            while (i < dayLogs.length) {
              const log = dayLogs[i];
              const logDate = safeToDate(log.timestamp);
              if (log.action === 'on') {
                const timeOn = format(logDate, 'h:mma');
                if (i + 1 < dayLogs.length && dayLogs[i + 1].action === 'off') {
                  const nextLogDate = safeToDate(dayLogs[i + 1].timestamp);
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
            const currentEvalMs = Math.min(now.getTime(), evalEnd);
            if (currentEvalMs > lastOnTime) {
              totalMs += (currentEvalMs - lastOnTime);
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

  // Tanks / Chapaletas
  if (tanksDoc?.exists()) {
    const tanksData = tanksDoc.data();
    const tanquesAireacion: string[] = tanksData.tanquesAireacion || [];
    const tanquesMovimiento: string[] = tanksData.tanquesMovimiento || [];
    if (tanquesAireacion.length > 0 || tanquesMovimiento.length > 0) {
      text += `_ESTADO CHAPALETAS / TANQUES:_\n`;
      if (tanquesAireacion.length > 0) {
        text += `• Aireación: ${tanquesAireacion.join(', ')}\n`;
      }
      if (tanquesMovimiento.length > 0) {
        text += `• Movimiento: ${tanquesMovimiento.join(', ')}\n`;
      }
      text += `━━━━━━━━━━━━━━━━━━━━\n`;
    }
  }

  // Maintenance
  const maintRecords = maintDoc?.exists() ? (maintDoc.data().records || '') : '';
  if (maintRecords.trim()) {
    text += `_REGISTRO DE MANTENIMIENTO:_\n${maintRecords.trim()}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n`;
  }

  if (!hasAnyData && !observations.trim() && powerEvents.length === 0 && (!initialPowerState || initialPowerState.type === 'ok') && !maintRecords.trim()) {
    text += `\nNo se registraron movimientos en este turno.\n`;
  }

  const shiftDateStr = format(targetEnd, 'yyyy-MM-dd');
  const shiftKey = `${endTimeStr}_${shiftDateStr}`;

  return {
    text: text.trim(),
    shiftStart: start,
    shiftEnd: targetEnd,
    shiftKey
  };
}

/**
 * Regenerates the live staged draft and persists it to whatsapp_backups/staged_upcoming_report in Firestore.
 */
export async function updateStagedUpcomingReport(options?: {
  shiftStartTime?: string;
  shiftEndTime?: string;
  operatorName?: string;
}): Promise<ShiftReportResult> {
  const result = await buildShiftReportText(options);

  try {
    const stagedDocRef = doc(db, 'whatsapp_backups', 'staged_upcoming_report');
    await setDoc(stagedDocRef, {
      id: 'staged_upcoming_report',
      timestamp: new Date().toISOString(),
      recipient: 'Grupo WhatsApp (Programado)',
      message: result.text,
      status: 'scheduled',
      type: 'reporte_programado',
      shiftKey: result.shiftKey,
      scheduledTime: result.shiftEnd.toISOString(),
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.warn('[reportBuilder] Error saving staged upcoming report to Firestore:', err);
  }

  return result;
}
