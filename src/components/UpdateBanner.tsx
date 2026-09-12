import React, { useEffect, useState, useCallback, useRef } from 'react';
import { db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, RefreshCw, X } from 'lucide-react';
import { sounds } from '../utils/sounds';
import { BUILD_ID } from '../version';

export const UpdateBanner: React.FC = () => {
  const pageLoadTimeRef = useRef<number>(Date.now());
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [newUpdateAvailable, setNewUpdateAvailable] = useState(false);
  const [isUpdatingServer, setIsUpdatingServer] = useState(false);
  const [isDismissed, setIsDismissed] = useState(() => {
    try {
      return sessionStorage.getItem('update_pill_dismissed') === 'true';
    } catch {
      return false;
    }
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 1. Detect if the app was just updated (or fresh cache loaded)
  useEffect(() => {
    try {
      const justUpdated = sessionStorage.getItem('just_updated_alert') === 'true';
      const storedBuild = localStorage.getItem('app_build_hash');

      // If the build hash changed or we flagged a completed refresh:
      if (justUpdated || (storedBuild && storedBuild !== BUILD_ID)) {
        setShowSuccessToast(true);
        sounds.playSuccess();
        sessionStorage.removeItem('just_updated_alert');
        sessionStorage.removeItem('update_pill_dismissed');

        // Auto-dismiss notification smoothly after 3.5 seconds
        const timer = setTimeout(() => {
          setShowSuccessToast(false);
        }, 3500);
        return () => clearTimeout(timer);
      }
    } catch {
      // Storage access protected in iframe
    } finally {
      try {
        localStorage.setItem('app_build_hash', BUILD_ID);
        localStorage.setItem('app_last_boot_time', String(pageLoadTimeRef.current));
      } catch {
        // ignore
      }
    }
  }, []);

  // 2. Real-time listener for maintenance/update announcements in Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'config', 'app_settings'),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const updating = data.isUpdatingApp === true;
          const updateTimestamp = data.lastUpdatedTimestamp 
            ? new Date(data.lastUpdatedTimestamp).getTime() 
            : 0;

          // If the page was loaded AFTER the update was published, this client already has the update!
          const clientAlreadyHasUpdate = pageLoadTimeRef.current >= updateTimestamp;

          if (updating && !clientAlreadyHasUpdate) {
            setIsUpdatingServer(true);
          } else {
            // Already updated or update completed: do not show notice
            setIsUpdatingServer(false);
          }

          if (!updating) {
            sessionStorage.removeItem('update_pill_dismissed');
            setIsDismissed(false);
          }
        }
      },
      () => {
        // Silently ignore permissions
      }
    );

    return () => unsubscribe();
  }, []);

  // 3. Background detection of new build / modern caches on server
  useEffect(() => {
    let active = true;

    const checkServerForNewAssets = async () => {
      try {
        const res = await fetch(`/?_t=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
        });
        if (res.ok && active) {
          const html = await res.text();
          // Detect if current loaded bundle script matches server bundle script
          const currentScripts = Array.from(document.querySelectorAll('script[src]'))
            .map(s => s.getAttribute('src') || '')
            .filter(src => src.includes('/assets/'));

          if (currentScripts.length > 0) {
            const hasNewAssetsOnServer = currentScripts.some(src => !html.includes(src));
            if (hasNewAssetsOnServer) {
              setNewUpdateAvailable(true);
            }
          }
        }
      } catch {
        // Network offline or error
      }
    };

    // Check periodically without bothering the user
    const interval = setInterval(checkServerForNewAssets, 60000);
    const initialCheck = setTimeout(checkServerForNewAssets, 15000);

    return () => {
      active = false;
      clearInterval(interval);
      clearTimeout(initialCheck);
    };
  }, []);

  // Refresh modern caches and reload safely without logging out
  const handleApplyUpdate = useCallback(async () => {
    sounds.playClick();
    setIsRefreshing(true);

    try {
      // 1. Clear caches
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        for (const name of cacheNames) {
          await caches.delete(name);
        }
      }

      // 2. Unregister old service workers
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      }

      // 3. Mark update ready to notify upon reload
      try {
        sessionStorage.setItem('just_updated_alert', 'true');
      } catch {
        // ignore
      }

      // 4. Clean reload
      const cleanUrl = window.location.origin + window.location.pathname + `?sync=${Date.now()}`;
      window.location.replace(cleanUrl);
    } catch {
      window.location.reload();
    }
  }, []);

  const handleDismiss = () => {
    sounds.playClick();
    setIsDismissed(true);
    try {
      sessionStorage.setItem('update_pill_dismissed', 'true');
    } catch {
      // ignore
    }
  };

  const showPill = !isDismissed && (newUpdateAvailable || (isUpdatingServer && !showSuccessToast));

  return (
    <>
      {/* 1. Subtle confirmation toast when modern caches/update are loaded */}
      <AnimatePresence>
        {showSuccessToast && (
          <div className="fixed top-4 inset-x-0 z-50 flex justify-center pointer-events-none px-4">
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -15, scale: 0.95 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="pointer-events-auto bg-slate-900/95 text-white border border-emerald-500/50 shadow-xl backdrop-blur-md px-4 py-2.5 rounded-2xl flex items-center gap-2.5 text-xs font-semibold"
            >
              <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-400/30">
                <CheckCircle2 size={13} />
              </div>
              <span className="text-slate-100">Aplicación actualizada con éxito</span>
              <button
                onClick={() => setShowSuccessToast(false)}
                className="text-slate-400 hover:text-white ml-2 p-0.5 rounded transition-colors"
                title="Cerrar"
              >
                <X size={13} />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 2. Discreet, non-intrusive floating indicator (never blocks the user) */}
      <AnimatePresence>
        {showPill && (
          <div className="fixed top-3 inset-x-0 z-40 flex justify-center pointer-events-none px-3">
            <motion.div
              initial={{ opacity: 0, y: -15, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -15, scale: 0.96 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="pointer-events-auto bg-slate-900/90 text-white border border-slate-700/80 shadow-lg backdrop-blur-md px-3.5 py-1.5 rounded-full flex items-center gap-2.5 text-xs max-w-lg"
            >
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>

              <span className="text-slate-200 truncate">
                {newUpdateAvailable
                  ? 'Nuevas mejoras listas. Puedes seguir usando la app'
                  : 'Sincronizando mejoras. Puedes seguir usando la app normalmente'}
              </span>

              <button
                onClick={handleApplyUpdate}
                disabled={isRefreshing}
                className="ml-auto px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-[11px] transition-colors flex items-center gap-1 shrink-0 active:scale-95 disabled:opacity-50"
              >
                <RefreshCw size={11} className={isRefreshing ? 'animate-spin' : ''} />
                <span>{isRefreshing ? 'Aplicando...' : 'Actualizar'}</span>
              </button>

              <button
                onClick={handleDismiss}
                className="text-slate-400 hover:text-white p-1 rounded transition-colors shrink-0"
                title="Ocultar aviso"
              >
                <X size={13} />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
