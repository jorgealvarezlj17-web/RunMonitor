import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { Wrench, RefreshCw, X } from 'lucide-react';
import { sounds } from '../utils/sounds';

export const UpdateBanner = () => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'config', 'app_settings'), (docSnap) => {
      if (docSnap.exists()) {
        const updating = docSnap.data().isUpdatingApp === true;
        setIsUpdating(updating);
        if (!updating) {
          setIsDismissed(false); // Reset dismissal when it turns off
        }
      }
    }, (error) => {
      // Ignore auth/permission errors silently for unauthenticated users
    });

    return () => unsubscribe();
  }, []);

  const handleRefresh = async () => {
    sounds.playClick();
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (let reg of regs) {
        await reg.unregister();
      }
    }
    localStorage.clear();
    window.location.reload();
  };

  if (!isUpdating || isDismissed) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:w-auto md:max-w-xl z-50">
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.9 }}
          className="bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-2xl shadow-2xl p-4 flex flex-col sm:flex-row items-center gap-4 relative"
        >
          <button 
            onClick={() => setIsDismissed(true)}
            className="absolute -top-2 -right-2 bg-white text-slate-800 rounded-full p-1 shadow-md hover:bg-slate-100 transition-colors"
          >
            <X size={16} />
          </button>
          
          <div className="bg-white/20 p-2.5 rounded-xl shrink-0">
            <Wrench size={24} className="text-white" />
          </div>
          
          <div className="flex-1 text-center sm:text-left">
            <p className="text-sm font-bold leading-tight">
              Aplicación en proceso de actualización
            </p>
            <p className="text-[11px] font-medium opacity-90 mt-0.5">
              Algunos enlaces y funciones (como los reportes) pueden tardar unos minutos en reflejar la última versión.
            </p>
          </div>
          
          <button
            onClick={handleRefresh}
            className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 bg-white text-orange-600 hover:bg-orange-50 transition-colors rounded-xl text-xs font-black shadow-sm active:scale-95 w-full sm:w-auto justify-center"
          >
            <RefreshCw size={14} />
            Refrescar App
          </button>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
