import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  doc, 
  getDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../firestoreUtils';
import { 
  Zap,
  ZapOff,
  AlertTriangle
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface Equipment {
  id: string;
  name: string;
  status: 'on' | 'off';
  categoryId?: string;
  imageUrl?: string;
  tiempo_operativo?: boolean;
  totalUsageTime?: number;
  lastTurnedOn?: any;
  lastOffReason?: string | null;
}

interface Category {
  id: string;
  name: string;
  order: number;
}

interface LogEntry {
  id: string;
  equipmentId: string;
  equipmentName?: string;
  action: 'on' | 'off';
  timestamp: any;
  userEmail?: string;
  reason?: string;
}

interface PowerEvent {
  id: string;
  type: 'falla' | 'corte' | 'ok' | string;
  timestamp: any;
  userUid?: string;
  userEmail?: string;
  notes?: string;
}

export const PanelRegistro: React.FC = () => {
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [powerEvents, setPowerEvents] = useState<PowerEvent[]>([]);
  const [shiftStartTime, setShiftStartTime] = useState('18:00');

  // Helper safely convert Firestore timestamp/Date
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

  // 1. Fetch Config
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'config', 'app_settings'));
        if (docSnap.exists()) {
          setShiftStartTime(docSnap.data().shiftStartTime || '18:00');
        }
      } catch (err) {
        console.error("Error fetching config:", err);
      }
    };
    fetchConfig();
  }, []);

  // 2. Real-time Equipments listener
  useEffect(() => {
    const q = query(collection(db, 'equipment'), orderBy('order', 'asc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const items: Equipment[] = [];
      snapshot.forEach((d) => {
        items.push({ id: d.id, ...d.data() } as Equipment);
      });
      setEquipments(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'equipment');
    });
    return () => unsub();
  }, []);

  // 3. Real-time Categories listener
  useEffect(() => {
    const q = query(collection(db, 'categories'), orderBy('order', 'asc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const items: Category[] = [];
      snapshot.forEach((d) => {
        items.push({ id: d.id, ...d.data() } as Category);
      });
      setCategories(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'categories');
    });
    return () => unsub();
  }, []);

  // 4. Real-time Shift Logs & Power Events listeners
  useEffect(() => {
    const unsubLogs = onSnapshot(collection(db, 'logs'), (snapshot) => {
      const items: LogEntry[] = [];
      snapshot.forEach((d) => {
        items.push({ id: d.id, ...d.data() } as LogEntry);
      });
      setLogs(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'logs');
    });

    const unsubPower = onSnapshot(collection(db, 'power_events'), (snapshot) => {
      const items: PowerEvent[] = [];
      snapshot.forEach((d) => {
        items.push({ id: d.id, ...d.data() } as PowerEvent);
      });
      setPowerEvents(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'power_events');
    });

    return () => {
      unsubLogs();
      unsubPower();
    };
  }, []);

  // Shift Start/End Calculation
  const getShiftRange = () => {
    const now = new Date();
    const [startHour, startMin] = shiftStartTime.split(':').map(Number);
    
    let start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startHour, startMin, 0, 0);
    if (now < start) {
      start.setDate(start.getDate() - 1);
    }
    
    let end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end, now };
  };

  const { start: shiftStart, end: shiftEnd, now: currentTime } = getShiftRange();

  // Filter logs for current shift
  const shiftLogs = logs.filter(l => {
    const d = safeToDate(l.timestamp);
    return d >= shiftStart && d <= shiftEnd;
  }).sort((a, b) => safeToDate(a.timestamp).getTime() - safeToDate(b.timestamp).getTime());

  // Filter and sort power events for current shift
  const shiftPowerEvents = powerEvents.filter(p => {
    const d = safeToDate(p.timestamp);
    return d >= shiftStart && d <= shiftEnd;
  }).sort((a, b) => safeToDate(a.timestamp).getTime() - safeToDate(b.timestamp).getTime());

  // Count distinct occurrences
  const shiftFallasCount = shiftPowerEvents.filter(e => e.type === 'falla').length;
  const shiftCortesCount = shiftPowerEvents.filter(e => e.type === 'corte').length;
  
  // Latest overall power state
  const latestPowerEvent = powerEvents.length > 0 ? powerEvents[powerEvents.length - 1] : null;
  const currentGlobalPowerType = latestPowerEvent ? latestPowerEvent.type : 'ok';

  // --- Calculate Accumulated Duration for Fallas and Cortes in this Shift ---
  let totalFallaMs = 0;
  let totalCorteMs = 0;

  // Look at prior power events to determine state at shift start
  const priorPower = powerEvents
    .filter(p => safeToDate(p.timestamp) < shiftStart)
    .sort((a, b) => safeToDate(b.timestamp).getTime() - safeToDate(a.timestamp).getTime());

  let activeTrackType = priorPower.length > 0 ? priorPower[0].type : 'ok';
  let activeTrackStartTime = (activeTrackType === 'falla' || activeTrackType === 'corte') 
    ? shiftStart.getTime() 
    : 0;

  shiftPowerEvents.forEach((ev) => {
    const evTime = safeToDate(ev.timestamp).getTime();
    
    if (activeTrackType === 'falla' && activeTrackStartTime > 0) {
      totalFallaMs += Math.max(0, evTime - activeTrackStartTime);
    } else if (activeTrackType === 'corte' && activeTrackStartTime > 0) {
      totalCorteMs += Math.max(0, evTime - activeTrackStartTime);
    }

    activeTrackType = ev.type;
    if (ev.type === 'falla' || ev.type === 'corte') {
      activeTrackStartTime = evTime;
    } else {
      activeTrackStartTime = 0;
    }
  });

  // If still ongoing at current moment
  if (activeTrackStartTime > 0 && (activeTrackType === 'falla' || activeTrackType === 'corte')) {
    const evalMs = Math.min(currentTime.getTime(), shiftEnd.getTime());
    if (evalMs > activeTrackStartTime) {
      if (activeTrackType === 'falla') {
        totalFallaMs += (evalMs - activeTrackStartTime);
      } else if (activeTrackType === 'corte') {
        totalCorteMs += (evalMs - activeTrackStartTime);
      }
    }
  }

  const formatDurationStr = (ms: number) => {
    const totalMinutes = Math.round(ms / 60000);
    const hrs = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (totalMinutes === 0) return '0m';
    return `${hrs > 0 ? `${hrs}h ` : ''}${mins}m`;
  };

  const fallaTimeString = formatDurationStr(totalFallaMs);
  const corteTimeString = formatDurationStr(totalCorteMs);

  // Filter and group equipments
  const groupedEquipments: Record<string, Equipment[]> = {};
  categories.forEach(cat => groupedEquipments[cat.id] = []);
  
  equipments.forEach(eq => {
    const catId = eq.categoryId || 'uncategorized';
    if (!groupedEquipments[catId]) groupedEquipments[catId] = [];
    groupedEquipments[catId].push(eq);
  });

  return (
    <div className="space-y-6 pb-16 max-w-5xl mx-auto px-4 sm:px-6">
      {/* Header */}
      <div className="pt-2 pb-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Panel de Registro</h2>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Turno actual: <span className="font-semibold text-slate-700">{format(shiftStart, "h:mma", { locale: es })}</span> a <span className="font-semibold text-slate-700">{format(shiftEnd, "h:mma", { locale: es })}</span>
          </p>
        </div>
      </div>

      {/* Categories Tables for Equipments */}
      <div className="space-y-6">
        {categories.map(cat => {
          const catEquips = groupedEquipments[cat.id];
          if (!catEquips || catEquips.length === 0) return null;

          return (
            <div key={cat.id} className="bg-white border border-slate-200/90 rounded-xl overflow-hidden shadow-xs">
              {/* Category Header with Colorful Column Headers */}
              <div className="px-5 py-3 bg-slate-50/90 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  {cat.name}
                </span>

                {/* Table Header Titles in distinctive colors */}
                <div className="hidden sm:flex items-center gap-5 text-[11px] font-bold uppercase tracking-wider">
                  <span className="w-16 text-center text-rose-600">OFF</span>
                  <span className="w-16 text-center text-emerald-600">ON</span>
                  <span className="w-24 text-center text-indigo-600">TIEMPO</span>
                </div>
              </div>

              {/* Rows */}
              <div className="divide-y divide-slate-100">
                {catEquips.map(eq => {
                  const isON = eq.status === 'on';
                  const eqLogs = shiftLogs.filter(l => l.equipmentId === eq.id);
                  
                  const onCount = eqLogs.filter(l => l.action === 'on').length;
                  const offCount = eqLogs.filter(l => l.action === 'off').length;

                  // Compute current shift total usage ms
                  let totalMs = 0;
                  const priorLogs = logs.filter(l => l.equipmentId === eq.id && safeToDate(l.timestamp) < shiftStart)
                    .sort((a, b) => safeToDate(b.timestamp).getTime() - safeToDate(a.timestamp).getTime());
                  let arrivalStatus = priorLogs.length > 0 ? (priorLogs[0].action === 'on' ? 'on' : 'off') : (eq.status === 'on' ? 'on' : 'off');
                  let isOnState = arrivalStatus === 'on';
                  let lastOnTime = isOnState ? shiftStart.getTime() : 0;

                  eqLogs.forEach(log => {
                    const logDate = safeToDate(log.timestamp);
                    const logTime = logDate.getTime();
                    if (log.action === 'on') {
                      if (!isOnState) {
                        isOnState = true;
                        lastOnTime = logTime;
                      }
                    } else if (log.action === 'off') {
                      if (isOnState) {
                        totalMs += Math.max(0, logTime - lastOnTime);
                        isOnState = false;
                      }
                    }
                  });

                  if (isOnState) {
                    const evalMs = Math.min(currentTime.getTime(), shiftEnd.getTime());
                    if (evalMs > lastOnTime) {
                      totalMs += (evalMs - lastOnTime);
                    }
                  }

                  const totalMinutes = Math.round(totalMs / 60000);
                  const hrs = Math.floor(totalMinutes / 60);
                  const mins = totalMinutes % 60;
                  const shiftTimeString = `${hrs > 0 ? `${hrs}h ` : ''}${mins}m`;

                  return (
                    <div 
                      key={eq.id} 
                      className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                    >
                      {/* Left: Name & Status */}
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isON ? 'bg-emerald-500 shadow-xs shadow-emerald-400' : 'bg-slate-300'}`} />
                        <span className="font-semibold text-slate-800 text-sm truncate">
                          {eq.name}
                        </span>
                      </div>

                      {/* Right: Parameter Columns with larger black numbers */}
                      <div className="flex items-center justify-between sm:justify-end gap-5 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                        {/* OFF */}
                        <div className="w-16 text-center flex flex-col items-center">
                          <span className="text-[10px] font-bold text-rose-600 uppercase sm:hidden block mb-0.5">OFF</span>
                          <span className={`font-mono text-base font-black ${
                            offCount > 0 ? 'text-slate-900' : 'text-slate-300'
                          }`}>
                            {offCount}
                          </span>
                        </div>

                        {/* ON */}
                        <div className="w-16 text-center flex flex-col items-center">
                          <span className="text-[10px] font-bold text-emerald-600 uppercase sm:hidden block mb-0.5">ON</span>
                          <span className={`font-mono text-base font-black ${
                            onCount > 0 ? 'text-slate-900' : 'text-slate-300'
                          }`}>
                            {onCount}
                          </span>
                        </div>

                        {/* TIEMPO */}
                        <div className="w-24 text-center flex flex-col items-center">
                          <span className="text-[10px] font-bold text-indigo-600 uppercase sm:hidden block mb-0.5">TIEMPO</span>
                          <span className={`font-mono text-base font-black ${
                            eq.tiempo_operativo !== false && totalMinutes > 0
                              ? 'text-slate-900'
                              : 'text-slate-300'
                          }`}>
                            {eq.tiempo_operativo !== false ? shiftTimeString : '—'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Electrical Registry Table - Structured with vibrant colors */}
      <div className="bg-white border border-slate-200/90 rounded-xl overflow-hidden shadow-xs">
        {/* Category Header with Columns */}
        <div className="px-5 py-3 bg-slate-50/90 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-amber-500/10 flex items-center justify-center text-amber-600">
              <Zap size={15} />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Registro Eléctrico (Suministro)
            </span>
          </div>

          {/* Table Header Titles matching Equipment */}
          <div className="hidden sm:flex items-center gap-5 text-[11px] font-bold uppercase tracking-wider">
            <span className="w-16 text-center text-slate-600">ESTADO</span>
            <span className="w-16 text-center text-amber-600">EVENTOS</span>
            <span className="w-24 text-center text-indigo-600">TIEMPO</span>
          </div>
        </div>

        {/* Rows: Falla Eléctrica & Corte Eléctrico */}
        <div className="divide-y divide-slate-100">
          {/* Row 1: Falla Eléctrica */}
          <div className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors">
            <div className="flex items-center gap-3 min-w-0">
              {/* Colorful Icon Box */}
              <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 border border-amber-200/70 flex items-center justify-center shrink-0 shadow-2xs">
                <AlertTriangle size={17} />
              </div>
              <span className="font-semibold text-slate-800 text-sm">
                Falla Eléctrica
              </span>
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-5 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-100">
              {/* Estado */}
              <div className="w-16 text-center flex flex-col items-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase sm:hidden block mb-0.5">ESTADO</span>
                {currentGlobalPowerType === 'falla' ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-black bg-amber-500 text-white animate-pulse shadow-xs">
                    ACTIVA
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    OK
                  </span>
                )}
              </div>

              {/* Eventos / Conteo */}
              <div className="w-16 text-center flex flex-col items-center">
                <span className="text-[10px] font-bold text-amber-600 uppercase sm:hidden block mb-0.5">EVENTOS</span>
                <span className={`font-mono text-base font-black ${
                  shiftFallasCount > 0 ? 'text-slate-900' : 'text-slate-300'
                }`}>
                  {shiftFallasCount}
                </span>
              </div>

              {/* Tiempo Acumulado */}
              <div className="w-24 text-center flex flex-col items-center">
                <span className="text-[10px] font-bold text-indigo-600 uppercase sm:hidden block mb-0.5">TIEMPO</span>
                <span className={`font-mono text-base font-black ${
                  totalFallaMs > 0 ? 'text-slate-900' : 'text-slate-300'
                }`}>
                  {fallaTimeString}
                </span>
              </div>
            </div>
          </div>

          {/* Row 2: Corte Eléctrico */}
          <div className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors">
            <div className="flex items-center gap-3 min-w-0">
              {/* Colorful Icon Box */}
              <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 border border-rose-200/70 flex items-center justify-center shrink-0 shadow-2xs">
                <ZapOff size={17} />
              </div>
              <span className="font-semibold text-slate-800 text-sm">
                Corte Eléctrico
              </span>
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-5 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-100">
              {/* Estado */}
              <div className="w-16 text-center flex flex-col items-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase sm:hidden block mb-0.5">ESTADO</span>
                {currentGlobalPowerType === 'corte' ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-black bg-rose-500 text-white animate-pulse shadow-xs">
                    ACTIVO
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    OK
                  </span>
                )}
              </div>

              {/* Eventos / Conteo */}
              <div className="w-16 text-center flex flex-col items-center">
                <span className="text-[10px] font-bold text-rose-600 uppercase sm:hidden block mb-0.5">EVENTOS</span>
                <span className={`font-mono text-base font-black ${
                  shiftCortesCount > 0 ? 'text-slate-900' : 'text-slate-300'
                }`}>
                  {shiftCortesCount}
                </span>
              </div>

              {/* Tiempo Acumulado */}
              <div className="w-24 text-center flex flex-col items-center">
                <span className="text-[10px] font-bold text-indigo-600 uppercase sm:hidden block mb-0.5">TIEMPO</span>
                <span className={`font-mono text-base font-black ${
                  totalCorteMs > 0 ? 'text-slate-900' : 'text-slate-300'
                }`}>
                  {corteTimeString}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
