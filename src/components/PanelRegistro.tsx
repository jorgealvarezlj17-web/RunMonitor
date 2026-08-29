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
  Activity, 
  MonitorDot
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface Equipment {
  id: string;
  name: string;
  status: 'on' | 'off';
  categoryId?: string;
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

export const PanelRegistro: React.FC = () => {
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [powerEvents, setPowerEvents] = useState<any[]>([]);
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
      const items: any[] = [];
      snapshot.forEach((d) => {
        items.push({ id: d.id, ...d.data() });
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

  // Filter power events for current shift
  const shiftPowerEvents = powerEvents.filter(p => {
    const d = safeToDate(p.timestamp);
    return d >= shiftStart && d <= shiftEnd;
  }).sort((a, b) => safeToDate(a.timestamp).getTime() - safeToDate(b.timestamp).getTime());

  // Filter and group equipments
  const groupedEquipments: Record<string, Equipment[]> = {};
  categories.forEach(cat => groupedEquipments[cat.id] = []);
  
  equipments.forEach(eq => {
    const catId = eq.categoryId || 'uncategorized';
    if (!groupedEquipments[catId]) groupedEquipments[catId] = [];
    groupedEquipments[catId].push(eq);
  });

  return (
    <div className="space-y-10 pb-16 max-w-6xl mx-auto px-4 sm:px-6">
      <div className="flex flex-col items-center justify-center text-center pb-8 pt-6">
        <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-slate-900/20">
          <MonitorDot size={32} className="text-cyan-400" />
        </div>
        <h2 className="text-3xl font-black text-slate-900 tracking-tight">Tablero de Registro</h2>
        <p className="text-slate-500 mt-2 font-medium">Monitoreo digital de tiempos y conteos del turno actual</p>
      </div>

      <div className="space-y-8">
        {categories.map(cat => {
          const catEquips = groupedEquipments[cat.id];
          if (!catEquips || catEquips.length === 0) return null;

          return (
            <div key={cat.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              {/* Category Header */}
              <div className="bg-slate-50/50 border-b border-slate-200 px-6 py-4">
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-700 flex items-center gap-2">
                  <Activity size={18} className="text-cyan-600" />
                  {cat.name}
                </h3>
              </div>
              
              {/* Equipments List */}
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
                    <div key={eq.id} className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                      {/* Left: Name */}
                      <div className="flex items-center gap-3">
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${isON ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-slate-300'}`} />
                        <span className="font-bold text-slate-800 text-base">{eq.name}</span>
                      </div>

                      {/* Right: Clean Digital Counters */}
                      <div className="bg-slate-100 shadow-inner border border-slate-200/60 rounded-xl p-2 flex items-center shrink-0">
                        <div className="flex flex-col items-center px-4 min-w-[4rem]">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">OFF</span>
                          <span className="font-mono text-slate-700 text-lg font-black">{offCount}</span>
                        </div>
                        
                        <div className="w-px h-8 bg-slate-200"></div>
                        
                        <div className="flex flex-col items-center px-4 min-w-[4rem]">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">ON</span>
                          <span className="font-mono text-slate-700 text-lg font-black">{onCount}</span>
                        </div>
                        
                        {eq.tiempo_operativo !== false && (
                          <>
                            <div className="w-px h-8 bg-slate-200"></div>
                            <div className="flex flex-col items-center px-5 min-w-[6rem]">
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">TIEMPO</span>
                              <span className="font-mono text-cyan-700 text-lg font-black">{shiftTimeString}</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
