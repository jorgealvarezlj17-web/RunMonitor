import React, { useState, useEffect, useRef } from 'react';
import { 
  Clock, 
  Copy, 
  FileText, 
  CheckCircle2, 
  AlertCircle,
  RefreshCw,
  AlignLeft,
  Eraser,
  AlertTriangle,
  Filter,
  Settings,
  Send,
  Loader2,
  MessageSquare
} from 'lucide-react';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  Timestamp,
  limit,
  getDoc,
  doc,
  updateDoc,
  setDoc,
  serverTimestamp,
  onSnapshot,
  writeBatch
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';
import { format, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { OperationType, handleFirestoreError } from '../utils/firestoreError';
import { useProfile } from '../context/ProfileContext';
import { sounds } from '../utils/sounds';

interface LogEntry {
  id: string;
  equipmentId: string;
  action: 'on' | 'off' | 'manual' | 'enabled' | 'disabled';
  timestamp: Timestamp;
  userUid: string;
  details?: string;
  isManual?: boolean;
  reason?: string;
}

const TankGrid = ({
  tanquesAireacion,
  tanquesMovimiento,
  toggleTank,
  isReadOnly,
  onLoadPrevious,
  onClearAll,
  hasPrevious,
  availableTanks,
  setAvailableTanks,
  isAdmin = false
}: {
  tanquesAireacion: string[];
  tanquesMovimiento: string[];
  toggleTank: (type: 'aireacion' | 'movimiento', tankId: string) => void;
  isReadOnly?: boolean;
  onLoadPrevious: () => void;
  onClearAll: () => void;
  hasPrevious: boolean;
  availableTanks: string[];
  setAvailableTanks: React.Dispatch<React.SetStateAction<string[]>>;
  isAdmin?: boolean;
}) => {
  const TANK_NUMBERS = Array.from({ length: 60 }, (_, i) => i + 1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showOnlyActive, setShowOnlyActive] = useState(false);
  const [isConfigMode, setIsConfigMode] = useState(false);

  useEffect(() => {
    const savedScroll = sessionStorage.getItem('tankGridScrollPos');
    if (savedScroll && scrollRef.current) {
      scrollRef.current.scrollTop = parseInt(savedScroll, 10);
    }
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    sessionStorage.setItem('tankGridScrollPos', e.currentTarget.scrollTop.toString());
  };
  
  return (
    <div className="space-y-6 bg-slate-50 p-4 sm:p-6 rounded-3xl border border-slate-200 mt-8 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Control de Chapaletas</h3>
        <div className="flex gap-4 text-[10px] font-bold uppercase tracking-wider text-slate-600">
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-cyan-500 rounded-full shadow-sm"></div> Air (Aireación)</div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-teal-500 rounded-full shadow-sm"></div> Mov (Movimiento)</div>
        </div>
      </div>

      {/* Quick Access */}
      <div className="space-y-2">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Acciones Rápidas</p>
        <div className="flex gap-3 flex-wrap">
          <button
            type="button"
            onClick={onLoadPrevious}
            disabled={!hasPrevious}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50 hover:border-cyan-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
          >
            <RefreshCw size={14} /> Cargar turno anterior
          </button>
          <button
            type="button"
            onClick={onClearAll}
            disabled={tanquesAireacion.length === 0 && tanquesMovimiento.length === 0}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50 hover:border-red-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
          >
            <Eraser size={14} /> Limpiar todos
          </button>
          <button
            type="button"
            onClick={() => setShowOnlyActive(!showOnlyActive)}
            className={`px-4 py-2 border text-xs font-bold rounded-xl transition-all flex items-center gap-2 shadow-sm ${
              showOnlyActive 
                ? 'bg-cyan-500 border-cyan-600 text-white' 
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-cyan-500/50'
            }`}
          >
            <Filter size={14} /> {showOnlyActive ? 'Ver todos los tanques' : 'Ver solo activos'}
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setIsConfigMode(!isConfigMode)}
              className={`px-4 py-2 border text-xs font-bold rounded-xl transition-all flex items-center gap-2 shadow-sm ${
                isConfigMode 
                  ? 'bg-amber-500 border-amber-600 text-white' 
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-amber-500/50'
              }`}
            >
              <Settings size={14} /> {isConfigMode ? 'Finalizar configuración' : 'Configurar tanques físicos'}
            </button>
          )}
        </div>
        {isConfigMode && isAdmin && (
          <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-[10px] text-amber-800 font-medium">
            <p>MODO CONFIGURACIÓN: Toca los tanques para marcarlos como "existentes" o "no existentes" en la planta. Los que desmarques no aparecerán en el reporte diario.</p>
          </div>
        )}
      </div>

      {/* Grid */}
      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6 max-h-[340px] overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent"
      >
        {TANK_NUMBERS.filter(num => {
          const id = `T${String(num).padStart(3, '0')}`;
          if (isConfigMode && isAdmin) return true; // Show all in config mode to allow selection
          
          // First check if it's in the available list
          if (!availableTanks.includes(id)) return false;
          
          if (!showOnlyActive) return true;
          return tanquesAireacion.includes(id) || tanquesMovimiento.includes(id);
        }).map(num => {
          const id = `T${String(num).padStart(3, '0')}`;
          const isAvailable = availableTanks.includes(id);
          const isAirOn = tanquesAireacion.includes(id);
          const isMovOn = tanquesMovimiento.includes(id);
          
          return (
            <div key={id} id={`tank-${num}`} className={`flex flex-col items-center gap-2 transition-all duration-500 ${!isAvailable && !(isConfigMode && isAdmin) ? 'hidden' : ''}`}>
              <div className={`relative w-24 h-24 rounded-full overflow-hidden border-4 shadow-md flex select-none transition-all ${
                isConfigMode && isAdmin
                  ? (isAvailable ? 'border-amber-400 bg-white' : 'border-slate-200 bg-slate-100 opacity-40')
                  : 'border-white bg-slate-100'
              }`}>
                {isConfigMode && isAdmin ? (
                  <div 
                    onClick={() => {
                      setAvailableTanks(prev => 
                        prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
                      );
                    }}
                    className="w-full h-full flex items-center justify-center cursor-pointer"
                  >
                    <span className={`text-[10px] font-black uppercase ${isAvailable ? 'text-amber-600' : 'text-slate-400'}`}>
                      {isAvailable ? 'EXISTENTE' : 'NO EXISTE'}
                    </span>
                  </div>
                ) : (
                  <>
                    {/* Left Half - Aireación (AIR) */}
                    <button 
                      type="button"
                      onClick={() => {
                        sounds.playClick();
                        toggleTank('aireacion', id);
                      }}
                      title={`Tanque ${num} - Aireación (${isAirOn ? 'Encendido' : 'Apagado'})`}
                      className={`w-1/2 h-full flex flex-col items-center justify-center pt-5 transition-colors duration-200 cursor-pointer ${
                        isAirOn ? 'bg-cyan-500 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                      }`}
                    >
                      <span className="text-[10px] font-black uppercase tracking-wider -ml-1">Air</span>
                      <span className={`text-[7px] font-bold uppercase tracking-tight -ml-1 ${isAirOn ? 'text-cyan-100' : 'text-slate-400'}`}>
                        {isAirOn ? 'ON' : 'OFF'}
                      </span>
                    </button>

                    {/* Right Half - Movimiento (MOV) */}
                    <button 
                      type="button"
                      onClick={() => {
                        sounds.playClick();
                        toggleTank('movimiento', id);
                      }}
                      title={`Tanque ${num} - Movimiento (${isMovOn ? 'Encendido' : 'Apagado'})`}
                      className={`w-1/2 h-full flex flex-col items-center justify-center pt-5 transition-colors duration-200 cursor-pointer ${
                        isMovOn ? 'bg-teal-500 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                      }`}
                    >
                      <span className="text-[10px] font-black uppercase tracking-wider ml-1">Mov</span>
                      <span className={`text-[7px] font-bold uppercase tracking-tight ml-1 ${isMovOn ? 'text-teal-100' : 'text-slate-400'}`}>
                        {isMovOn ? 'ON' : 'OFF'}
                      </span>
                    </button>
                    
                    {/* Divider Line */}
                    <div className="absolute left-1/2 top-0 bottom-0 w-[2px] bg-white -translate-x-1/2 pointer-events-none" />
                  </>
                )}

                {/* Center Badge Overlay */}
                <div className="absolute inset-x-0 top-1.5 flex justify-center pointer-events-none">
                  <span className={`font-black text-[10px] shadow-sm px-2 py-0.5 rounded-full border transition-all ${
                    isConfigMode && isAdmin
                      ? (isAvailable ? 'bg-amber-100 text-amber-900 border-amber-200' : 'bg-slate-200 text-slate-500 border-slate-300')
                      : 'bg-white/95 text-slate-800 border-slate-200 shadow-slate-200/50'
                  }`}>
                    T-{num}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const CorteReporte: React.FC = () => {
  const { profile } = useProfile();
  const isReadOnly = profile?.is_synced === false;
  const [startTime, setStartTime] = useState('18:00');
  const [observations, setObservations] = useState('');
  const [maintenanceRecords, setMaintenanceRecords] = useState('');
  const [tanquesAireacion, setTanquesAireacion] = useState<string[]>([]);
  const [tanquesMovimiento, setTanquesMovimiento] = useState<string[]>([]);
  const [prevTanquesAireacion, setPrevTanquesAireacion] = useState<string[]>([]);
  const [prevTanquesMovimiento, setPrevTanquesMovimiento] = useState<string[]>([]);
  
  const [availableTanks, setAvailableTanks] = useState<string[]>(() => {
    const saved = localStorage.getItem('plantAvailableTanks');
    if (saved) return JSON.parse(saved);
    return Array.from({ length: 60 }, (_, i) => `T${String(i + 1).padStart(3, '0')}`);
  });

  useEffect(() => {
    localStorage.setItem('plantAvailableTanks', JSON.stringify(availableTanks));
  }, [availableTanks]);

  const [loading, setLoading] = useState(false);
  const [reportText, setReportText] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [sendWhatsAppStatus, setSendWhatsAppStatus] = useState<{ type: 'idle' | 'success' | 'error'; message?: string }>({ type: 'idle' });


  
  const TANK_OPTIONS = Array.from({ length: 60 }, (_, i) => `T${String(i + 1).padStart(3, '0')}`);

  const toggleTank = (type: 'aireacion' | 'movimiento', tankId: string) => {
    if (isReadOnly) return;
    const currentArray = type === 'aireacion' ? tanquesAireacion : tanquesMovimiento;
    const setArray = type === 'aireacion' ? setTanquesAireacion : setTanquesMovimiento;
    
    const newArray = currentArray.includes(tankId)
      ? currentArray.filter(item => item !== tankId)
      : [...currentArray, tankId];
    
    setArray(newArray);
    
    // Save to Firestore
    try {
      setDoc(doc(db, 'config', 'current_shift_tanks'), {
        [type === 'aireacion' ? 'tanquesAireacion' : 'tanquesMovimiento']: newArray,
        lastUpdated: serverTimestamp()
      }, { merge: true }).catch(e => {
        console.error("Error saving tanks:", e);
      });
    } catch (e) {
      console.error("Error saving tanks:", e);
    }
  };

  const loadPreviousTanks = () => {
    if (isReadOnly) return;
    setTanquesAireacion(prevTanquesAireacion);
    setTanquesMovimiento(prevTanquesMovimiento);
    try {
      setDoc(doc(db, 'config', 'current_shift_tanks'), {
        tanquesAireacion: prevTanquesAireacion,
        tanquesMovimiento: prevTanquesMovimiento,
        lastUpdated: serverTimestamp()
      }, { merge: true });
    } catch (e) {
      console.error(e);
    }
  };

  const clearTanks = () => {
    if (isReadOnly) return;
    setTanquesAireacion([]);
    setTanquesMovimiento([]);
    try {
      setDoc(doc(db, 'config', 'current_shift_tanks'), {
        tanquesAireacion: [],
        tanquesMovimiento: [],
        lastUpdated: serverTimestamp()
      }, { merge: true });
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    // Listen to app_settings for start time
    const unsubscribeConfig = onSnapshot(doc(db, 'config', 'app_settings'), (docSnap) => {
      if (docSnap.exists()) {
        setStartTime(docSnap.data().shiftStartTime || '18:00');
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'config/app_settings');
    });

    const unsubscribeObs = onSnapshot(doc(db, 'config', 'current_shift_observations'), (docSnap) => {
      if (docSnap.exists()) {
        setObservations(docSnap.data().observations || '');
      } else {
        setObservations('');
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'config/current_shift_observations');
    });

    const unsubscribeMaint = onSnapshot(doc(db, 'config', 'current_shift_maintenance'), (docSnap) => {
      if (docSnap.exists()) {
        setMaintenanceRecords(docSnap.data().records || '');
      } else {
        setMaintenanceRecords('');
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'config/current_shift_maintenance');
    });

    const unsubscribeTanks = onSnapshot(doc(db, 'config', 'current_shift_tanks'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setTanquesAireacion(data.tanquesAireacion || []);
        setTanquesMovimiento(data.tanquesMovimiento || []);
      } else {
        setTanquesAireacion([]);
        setTanquesMovimiento([]);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'config/current_shift_tanks');
    });

    const unsubscribePrevTanks = onSnapshot(doc(db, 'config', 'previous_shift_tanks'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setPrevTanquesAireacion(data.tanquesAireacion || []);
        setPrevTanquesMovimiento(data.tanquesMovimiento || []);
      } else {
        setPrevTanquesAireacion([]);
        setPrevTanquesMovimiento([]);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'config/previous_shift_tanks');
    });

    return () => {
      unsubscribeConfig();
      unsubscribeObs();
      unsubscribeMaint();
      unsubscribeTanks();
      unsubscribePrevTanks();
    };
  }, []);

  const generateReport = async () => {
    if (isReadOnly) return;
    setLoading(true);
    setError(null);
    try {
      const end = new Date(); // Current time as end time
      
      // Calculate start Date based on user rule:
      // Start time is always from the PREVIOUS day at the configured shift start hour.
      const [startH, startM] = startTime.split(':').map(Number);
      const start = new Date(end);
      start.setDate(end.getDate() - 1);
      start.setHours(startH, startM, 0, 0);

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

      // Fetch logs in range
      const logsRef = collection(db, 'logs');
      const q = query(
        logsRef, 
        where('timestamp', '>=', startTs),
        where('timestamp', '<=', endTs),
        orderBy('timestamp', 'asc')
      );
      const querySnapshot = await getDocs(q);
      const logs: LogEntry[] = [];
      querySnapshot.forEach(doc => {
        const logData = doc.data() as LogEntry;
        logs.push({ id: doc.id, ...logData });
      });

      // Fetch power_events in range
      const powerEventsRef = collection(db, 'power_events');
      const qPower = query(
        powerEventsRef,
        where('timestamp', '>=', startTs),
        where('timestamp', '<=', endTs),
        orderBy('timestamp', 'asc')
      );
      const powerSnapshot = await getDocs(qPower);
      const powerEvents: any[] = [];
      powerSnapshot.forEach(doc => {
        const data = doc.data();
        powerEvents.push({ id: doc.id, ...data });
      });

      // Fetch last power event before shift to know initial state
      const qLastPower = query(
        powerEventsRef,
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
        for (const doc of snap.docs) {
          const logData = doc.data() as LogEntry;
          
          const action = logData.action;
          if (action === 'on' || action === 'off') {
            foundStatus = action;
            break;
          }
        }
        arrivalStatuses[eq.id] = foundStatus;
      }));

      // Group equipments by category
      const groupedEquipments: Record<string, any[]> = {};
      equipments.forEach(eq => {
        const catId = eq.categoryId || 'uncategorized';
        if (!groupedEquipments[catId]) groupedEquipments[catId] = [];
        groupedEquipments[catId].push(eq);
      });

      // Format report
      const startStr = format(start, "dd/MM/yy");
      const endStr = format(end, "dd/MM/yy");
      const currentOp = profile?.full_name || auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || 'Operador';

      let text = `👤 OP. EN TURNO: ${currentOp}\n`;
      text += `📅 Ciclo Operativo: ${startStr} — ${endStr}\n`;
      text += `━━━━━━━━━━━━━━━━━━━━\n`;

      // Format Power Events
      let powerEventsText = '';
      if (powerEvents.length > 0 || (initialPowerState && initialPowerState.type !== 'ok')) {
        const fallas: { start: Date, end: Date | null }[] = [];
        const cortes: { start: Date, end: Date | null }[] = [];
        let currentEvent: { start: Date, end: Date | null, type: string } | null = null;

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
              currentEvent = {
                start: evDate,
                end: null,
                type: ev.type
              };
            } else if (currentEvent.type !== ev.type) {
              // Si cambia de falla a corte o viceversa, cerramos el actual y abrimos el nuevo
              currentEvent.end = evDate;
              if (currentEvent.type === 'falla') fallas.push(currentEvent);
              else cortes.push(currentEvent);
              
              currentEvent = {
                start: evDate,
                end: null,
                type: ev.type
              };
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

      // Notes and Observations
      if (observations.trim()) {
        text += `_NOTAS Y OBSERVACIONES:_\n`;
        text += `${observations.trim()}\n`;
        text += `━━━━━━━━━━━━━━━━━━━━\n`;
      }

      // Iterate over categories
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

          // Only show equipment if it had events OR was 'on' during the shift OR is always visible
          if (eqLogs.length > 0 || (arrivalStatus === 'on' && eq.tiempo_operativo !== false) || isAlwaysVisible) {
            hasDataForCat = true;
            hasAnyData = true;
            catText += `◻️ *${eq.name.trim()}*\n`;

            // Group logs by date
            const logsByDate: Record<string, LogEntry[]> = {};
            eqLogs.forEach(log => {
              const logDate = log.timestamp ? log.timestamp.toDate() : new Date();
              const dateStr = format(logDate, 'yyyy-MM-dd');
              if (!logsByDate[dateStr]) logsByDate[dateStr] = [];
              logsByDate[dateStr].push(log);
            });

            // If no logs but was 'on' at start, ensure we show the start date
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
              
              // Centered-ish header for the day
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

            // Calculate running hours if tiempo_operativo is not false
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
                const now = new Date();
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
        setError('No se encontraron registros ni equipos activos en el rango seleccionado.');
        setReportText('');
        setLoading(false);
        return;
      }

      const finalReport = text.trim();
      setReportText(finalReport);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);

      // Save current observations to Firestore to persist manual edits - don't await
      setDoc(doc(db, 'config', 'current_shift_observations'), {
        observations: observations,
        lastUpdated: serverTimestamp()
      }, { merge: true }).catch(e => {
        console.error("Error saving observations:", e);
      });

      // Save tanks to previous shift
      await setDoc(doc(db, 'config', 'previous_shift_tanks'), {
        tanquesAireacion,
        tanquesMovimiento,
        lastUpdated: serverTimestamp()
      }, { merge: true });

      // Clear current shift data for the next shift
      await Promise.all([
        setDoc(doc(db, 'config', 'current_shift_observations'), { observations: '', lastUpdated: serverTimestamp() }, { merge: true }),
        setDoc(doc(db, 'config', 'current_shift_maintenance'), { records: '', lastUpdated: serverTimestamp() }, { merge: true }),
        setDoc(doc(db, 'config', 'current_shift_tanks'), { tanquesAireacion: [], tanquesMovimiento: [], lastUpdated: serverTimestamp() }, { merge: true })
      ]);

      setObservations('');
      setMaintenanceRecords('');
      setTanquesAireacion([]);
      setTanquesMovimiento([]);

      sounds.playSuccess();

    } catch (err) {
      console.error("Detailed error generating report:", err);
      if (err instanceof Error) {
        setError(`Error al generar el reporte: ${err.message}`);
      } else {
        setError('Error al generar el reporte. Si estás offline, asegúrate de haber cargado los datos previamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  const manualCopy = () => {
    if (!reportText) return;
    navigator.clipboard.writeText(reportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleSendToWhatsApp = async () => {
    if (!reportText || isSendingWhatsApp) return;
    setIsSendingWhatsApp(true);
    setSendWhatsAppStatus({ type: 'idle' });

    try {
      const response = await fetch('/api/send-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: reportText })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        setSendWhatsAppStatus({ type: 'success', message: '¡Reporte enviado exitosamente a WhatsApp!' });
      } else {
        setSendWhatsAppStatus({ 
          type: 'error', 
          message: data.error || 'No se pudo enviar el reporte. Verifica la configuración en la pestaña Configuración.' 
        });
      }
    } catch (err: any) {
      console.error("Error sending report via WhatsApp:", err);
      setSendWhatsAppStatus({ 
        type: 'error', 
        message: err.message || 'Error de conexión al enviar el reporte.' 
      });
    } finally {
      setIsSendingWhatsApp(false);
      setTimeout(() => {
        setSendWhatsAppStatus(prev => prev.type === 'success' ? { type: 'idle' } : prev);
      }, 7000);
    }
  };



  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 mb-2">Corte de Reporte</h2>
          <p className="text-slate-600 font-medium flex items-center gap-2">
            <Clock size={16} className="text-cyan-600" />
            Generador de reportes operativos para WhatsApp
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Configuration Card */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="lg:col-span-5 bg-white rounded-[2rem] p-8 border border-slate-200 shadow-xl flex flex-col h-full"
        >
          {isReadOnly && (
            <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 text-amber-700 shadow-sm">
              <AlertTriangle size={20} className="shrink-0" />
              <p className="text-sm font-bold">Acceso en modo lectura - No puedes generar reportes</p>
            </div>
          )}

          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 bg-cyan-50 text-cyan-600 rounded-2xl flex items-center justify-center">
              <FileText size={24} />
            </div>
            <h3 className="text-xl font-bold text-slate-900">Datos del Turno</h3>
          </div>

          <div className="space-y-6 flex-1">
            <div className="space-y-2">
              <div className="flex justify-between items-center px-1">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2">
                  <AlignLeft size={14} /> Observaciones del Turno
                </label>
                <button 
                  disabled={isReadOnly}
                  onClick={() => {
                    if (isReadOnly) return;
                    setObservations('');
                    try {
                      // Don't await for better offline support
                      setDoc(doc(db, 'config', 'current_shift_observations'), { 
                        observations: '',
                        lastUpdated: serverTimestamp()
                      }, { merge: true }).catch(e => {
                        console.error("Error clearing observations:", e);
                      });
                    } catch (e) {
                      console.error("Error clearing observations:", e);
                    }
                  }}
                  className="text-[10px] font-bold text-red-500/70 hover:text-red-600 transition-colors uppercase tracking-widest flex items-center gap-1"
                >
                  <Eraser size={12} /> Limpiar
                </button>
              </div>
              <textarea 
                value={observations}
                onChange={(e) => {
                  const newValue = e.target.value;
                  setObservations(newValue);
                  if (!isReadOnly) {
                    setDoc(doc(db, 'config', 'current_shift_observations'), {
                      observations: newValue,
                      lastUpdated: serverTimestamp()
                    }, { merge: true }).catch(e => {
                      console.error("Error saving observations:", e);
                    });
                  }
                }}
                disabled={isReadOnly}
                placeholder="Ej: Tubería con fuga en el área norte..."
                rows={4}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:bg-white transition-all resize-none"
              />
            </div>
            
              <div className="space-y-2">
                <div className="flex justify-between items-center px-1">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2">
                    <FileText size={14} /> Registro de Mantenimiento
                  </label>
                  <button 
                    disabled={isReadOnly}
                    onClick={() => {
                      if (isReadOnly) return;
                      setMaintenanceRecords('');
                      try {
                        setDoc(doc(db, 'config', 'current_shift_maintenance'), { 
                          records: '',
                          lastUpdated: serverTimestamp()
                        }, { merge: true }).catch(e => {
                          console.error("Error clearing maintenance records:", e);
                        });
                      } catch (e) {
                        console.error("Error clearing maintenance records:", e);
                      }
                    }}
                    className="text-[10px] font-bold text-red-500/70 hover:text-red-600 transition-colors uppercase tracking-widest flex items-center gap-1"
                  >
                    <Eraser size={12} /> Limpiar
                  </button>
                </div>
                <textarea 
                  value={maintenanceRecords}
                  onChange={(e) => {
                    const newValue = e.target.value;
                    setMaintenanceRecords(newValue);
                    if (!isReadOnly) {
                      setDoc(doc(db, 'config', 'current_shift_maintenance'), {
                        records: newValue,
                        lastUpdated: serverTimestamp()
                      }, { merge: true }).catch(e => {
                        console.error("Error saving maintenance records:", e);
                      });
                    }
                  }}
                  disabled={isReadOnly}
                  placeholder="Ej: Mantenimiento preventivo GE1..."
                  rows={4}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:bg-white transition-all resize-none"
                />
              </div>
            
              <TankGrid 
                tanquesAireacion={tanquesAireacion}
                tanquesMovimiento={tanquesMovimiento}
                toggleTank={toggleTank}
                isReadOnly={false}
                onLoadPrevious={loadPreviousTanks}
                onClearAll={clearTanks}
                hasPrevious={prevTanquesAireacion.length > 0 || prevTanquesMovimiento.length > 0}
                availableTanks={availableTanks}
                setAvailableTanks={setAvailableTanks}
                isAdmin={profile?.role === 'admin'}
              />
            
            <p className="text-xs text-slate-500 font-medium text-center bg-white/5 p-3 rounded-xl mt-6">
              El reporte se generará con formato limpio para WhatsApp.
            </p>
          </div>

          <button
            onClick={generateReport}
            disabled={loading || isReadOnly}
            className={`
              w-full mt-6 font-black py-4 rounded-2xl shadow-lg transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed group
              ${copied ? 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-emerald-500/20' : 'bg-cyan-500 hover:bg-cyan-400 text-white shadow-cyan-500/20'}
            `}
          >
            {loading ? (
              <RefreshCw size={24} className="animate-spin" />
            ) : copied ? (
              <>
                <CheckCircle2 size={24} className="scale-110" />
                ¡Reporte Generado!
              </>
            ) : (
              <>
                <FileText size={24} className="group-hover:scale-110 transition-transform" />
                Generar Reporte
              </>
            )}
          </button>


        </motion.div>

        {/* Preview Card */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="lg:col-span-7 bg-white rounded-[2rem] p-8 border border-slate-200 shadow-xl flex flex-col h-full min-h-[600px]"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
                <FileText size={24} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">Vista Previa WhatsApp</h3>
                <p className="text-xs text-slate-500 font-medium">Revisa el formato antes de enviar al grupo</p>
              </div>
            </div>
          </div>

          <div className="flex-1 bg-slate-50 rounded-2xl p-6 border border-slate-200 relative overflow-y-auto mb-4 custom-scrollbar shadow-inner">
            <AnimatePresence mode="wait">
              {error ? (
                <motion.div 
                  key="error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full flex flex-col items-center justify-center text-center p-4"
                >
                  <AlertCircle size={48} className="text-red-500 mb-4 opacity-50" />
                  <p className="text-slate-600 font-medium">{error}</p>
                </motion.div>
              ) : reportText ? (
                <motion.pre 
                  key="content"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-slate-700 font-sans whitespace-pre-wrap text-sm leading-relaxed"
                >
                  {reportText}
                </motion.pre>
              ) : (
                <motion.div 
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="h-full flex flex-col items-center justify-center text-center p-4"
                >
                  <FileText size={48} className="text-slate-300 mb-4" />
                  <p className="text-slate-500 font-medium">Configura los datos del turno y presiona "Generar Reporte".</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {sendWhatsAppStatus.type !== 'idle' && (
            <div className={`mb-4 p-3 rounded-xl border text-xs flex items-center gap-2 ${
              sendWhatsAppStatus.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}>
              {sendWhatsAppStatus.type === 'success' ? <CheckCircle2 size={16} className="shrink-0" /> : <AlertCircle size={16} className="shrink-0" />}
              <span>{sendWhatsAppStatus.message}</span>
            </div>
          )}

          {/* Action buttons at the bottom */}
          {reportText && (
            <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
              <button
                onClick={manualCopy}
                className={`
                  w-full sm:w-1/3 py-3.5 px-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2 text-sm border
                  ${copied 
                    ? 'bg-slate-800 text-white border-slate-800 shadow-md' 
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}
                `}
              >
                {copied ? <CheckCircle2 size={18} className="text-emerald-400" /> : <Copy size={18} />}
                <span>{copied ? 'Copiado' : 'Copiar'}</span>
              </button>

              <button
                onClick={handleSendToWhatsApp}
                disabled={isSendingWhatsApp}
                className="w-full sm:w-2/3 py-3.5 px-6 rounded-xl font-black transition-all flex items-center justify-center gap-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white shadow-lg shadow-emerald-600/25 text-base disabled:opacity-50"
                title="Enviar reporte directamente al grupo Reportes"
              >
                {isSendingWhatsApp ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    <span>Enviando al grupo...</span>
                  </>
                ) : (
                  <>
                    <Send size={20} />
                    <span>Enviar Reporte</span>
                  </>
                )}
              </button>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};
