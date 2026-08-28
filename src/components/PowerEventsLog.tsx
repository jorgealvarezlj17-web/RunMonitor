import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, doc, deleteDoc, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Zap, Trash2, X, AlertTriangle, Clock, ZapOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { handleFirestoreError, OperationType } from '../firestoreUtils';

export const PowerEventsLog: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'power_events'),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setEvents(items);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'power_events');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleClearHistory = async () => {
    try {
      const q = query(collection(db, 'power_events'));
      const snapshot = await getDocs(q);
      
      const deletePromises = snapshot.docs.map(document => 
        deleteDoc(doc(db, 'power_events', document.id))
      );
      
      await Promise.all(deletePromises);
      setConfirmClear(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'power_events');
    }
  };

  const currentState = events.length > 0 ? events[events.length - 1].type : 'ok';
  const isFalla = currentState === 'falla';
  const isCorte = currentState === 'corte';

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black transition-all border relative h-10 hover:scale-[1.01] active:scale-[0.99] ${
          isCorte 
            ? 'bg-rose-50 text-rose-700 border-rose-200/80 hover:bg-rose-100 shadow-sm shadow-rose-100/50'
            : isFalla
            ? 'bg-amber-50 text-amber-700 border-amber-200/80 hover:bg-amber-100 shadow-sm shadow-amber-100/50'
            : 'bg-slate-50 text-slate-700 border-slate-200/80 hover:bg-slate-100 shadow-sm'
        }`}
      >
        {(isCorte || isFalla) && (
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isCorte ? 'bg-rose-400' : 'bg-amber-400'}`}></span>
            <span className={`relative inline-flex rounded-full h-3 w-3 ${isCorte ? 'bg-rose-500' : 'bg-amber-500'}`}></span>
          </span>
        )}
        {isCorte ? (
          <ZapOff size={16} className="text-rose-600 animate-pulse shrink-0" />
        ) : isFalla ? (
          <AlertTriangle size={16} className="text-amber-600 animate-pulse shrink-0" />
        ) : (
          <Zap size={16} className="text-slate-500 shrink-0 fill-slate-200" />
        )}
        <span className="hidden md:inline">
          {isCorte ? 'Corte Activo' : isFalla ? 'Falla Activa' : 'Registro Eléctrico'}
        </span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center">
                    <Zap size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight">Registro Eléctrico</h2>
                    <p className="text-sm font-medium text-slate-500">Historial de fallas y cortes</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {loading ? (
                  <div className="flex justify-center items-center h-32">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500"></div>
                  </div>
                ) : events.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="w-20 h-20 bg-slate-50 rounded-[2rem] flex items-center justify-center mx-auto mb-6 text-slate-200 border border-slate-100">
                      <Zap size={40} />
                    </div>
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">No hay eventos registrados</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {events.map((event) => {
                      const date = event.timestamp ? event.timestamp.toDate() : new Date();
                      
                      let icon = <Zap size={20} />;
                      let bgColor = 'bg-slate-100';
                      let textColor = 'text-slate-600';
                      let title = 'Desconocido';

                      if (event.type === 'falla') {
                        icon = <AlertTriangle size={20} />;
                        bgColor = 'bg-orange-100';
                        textColor = 'text-orange-600';
                        title = 'Falla Eléctrica (Fluctuación)';
                      } else if (event.type === 'corte') {
                        icon = <Zap size={20} />;
                        bgColor = 'bg-red-100';
                        textColor = 'text-red-600';
                        title = 'Corte Eléctrico (Sin luz)';
                      } else if (event.type === 'ok') {
                        icon = <Clock size={20} />;
                        bgColor = 'bg-emerald-100';
                        textColor = 'text-emerald-600';
                        title = 'Servicio Restablecido';
                      }

                      return (
                        <div key={event.id} className="flex items-center gap-4 p-4 rounded-2xl border border-slate-100 bg-slate-50/50">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${bgColor} ${textColor}`}>
                            {icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className={`font-bold text-sm ${textColor}`}>{title}</h4>
                            <p className="text-xs font-medium text-slate-500 mt-0.5">
                              {format(date, 'dd/MM/yyyy HH:mm')}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {events.length > 0 && (
                <div className="p-6 border-t border-slate-100 bg-slate-50/50">
                  {confirmClear ? (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-red-50 border border-red-100 rounded-2xl p-4"
                    >
                      <p className="text-xs font-bold text-red-800 mb-3 text-center uppercase tracking-wider">
                        ¿Eliminar todo el historial?
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={handleClearHistory}
                          className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-colors uppercase tracking-widest"
                        >
                          Confirmar
                        </button>
                        <button
                          onClick={() => setConfirmClear(false)}
                          className="flex-1 py-2 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold rounded-xl transition-colors uppercase tracking-widest"
                        >
                          Cancelar
                        </button>
                      </div>
                    </motion.div>
                  ) : (
                    <div className="flex justify-center">
                      <button
                        onClick={() => setConfirmClear(true)}
                        className="flex items-center gap-2 px-4 py-2 text-red-400 hover:text-red-600 text-[10px] font-bold uppercase tracking-[0.2em] transition-colors"
                      >
                        <Trash2 size={14} />
                        Limpiar Historial
                      </button>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
