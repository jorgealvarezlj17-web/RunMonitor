import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, CloudUpload, CloudCheck, Loader2 } from 'lucide-react';
import { onSnapshot, collection, query, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';

export const ConnectionStatus: React.FC = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [hasPendingWrites, setHasPendingWrites] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Listen for pending writes in the equipment collection
    const q = query(collection(db, 'equipment'), limit(1));
    const unsubscribe = onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
      setHasPendingWrites(snapshot.metadata.hasPendingWrites);
    }, (error) => {
      // Suppress benign idle stream disconnection errors
      if (error.message.includes('Disconnecting idle stream')) {
        return;
      }
      console.error('Firestore listener error:', error);
    });
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
    };
  }, []);

  return (
    <div className="flex items-center">
      <AnimatePresence mode="wait">
        {!isOnline ? (
          <motion.div
            key="offline"
            initial={{ opacity: 0, y: -10, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 10, filter: "blur(4px)" }}
            className="flex items-center gap-2 px-3 py-1.5 bg-rose-50 text-rose-600 border border-rose-200 rounded-full shadow-sm"
            title="Estás trabajando sin conexión. Los cambios se guardarán localmente."
          >
            <div className="relative flex items-center justify-center">
              <span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-20 animate-ping"></span>
              <WifiOff size={14} strokeWidth={2.5} />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider">Modo Offline</span>
          </motion.div>
        ) : hasPendingWrites ? (
          <motion.div
            key="syncing"
            initial={{ opacity: 0, y: -10, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 10, filter: "blur(4px)" }}
            className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-600 border border-amber-200 rounded-full shadow-sm"
            title="Sincronizando cambios con la nube..."
          >
            <Loader2 size={14} className="animate-spin" strokeWidth={2.5} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Sincronizando</span>
          </motion.div>
        ) : (
          <motion.div
            key="online"
            initial={{ opacity: 0, y: -10, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 10, filter: "blur(4px)" }}
            className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-full shadow-sm"
            title="Conectado y sincronizado"
          >
            <CloudCheck size={14} strokeWidth={2.5} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Sincronizado</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
