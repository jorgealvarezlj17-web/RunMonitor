import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });
  const [showRestoredNotice, setShowRestoredNotice] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowRestoredNotice(true);
      const timer = setTimeout(() => {
        setShowRestoredNotice(false);
      }, 4000);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowRestoredNotice(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-50 pointer-events-none flex flex-col items-end gap-2">
      <AnimatePresence>
        {!isOnline && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="pointer-events-auto flex items-center gap-2.5 px-3.5 py-2 rounded-full bg-amber-600/95 text-white shadow-lg backdrop-blur-md text-xs font-semibold border border-amber-400/40"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-200 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-100"></span>
            </span>
            <WifiOff size={14} className="shrink-0" />
            <span>Modo sin conexión activo (Caché local)</span>
          </motion.div>
        )}

        {showRestoredNotice && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="pointer-events-auto flex items-center gap-2 px-3.5 py-2 rounded-full bg-emerald-600/95 text-white shadow-lg backdrop-blur-md text-xs font-semibold border border-emerald-400/40"
          >
            <CheckCircle2 size={14} className="shrink-0 text-emerald-200" />
            <Wifi size={14} className="shrink-0" />
            <span>Conexión restablecida - Datos sincronizados</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
