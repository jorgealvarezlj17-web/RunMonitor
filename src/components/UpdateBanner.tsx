import React, { useEffect, useState, useCallback } from 'react';
import { db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, Sparkles, ChevronDown, ChevronUp, Radio, CheckCircle2 } from 'lucide-react';
import { sounds } from '../utils/sounds';
import { APP_VERSION } from '../version';

export const UpdateBanner: React.FC = () => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateNotice, setUpdateNotice] = useState<string>('');
  const [targetVersion, setTargetVersion] = useState<string>('');
  const [isMinimized, setIsMinimized] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('update_banner_minimized') === 'true';
    } catch {
      return false;
    }
  });
  const [isClearing, setIsClearing] = useState(false);
  const [newVersionDetected, setNewVersionDetected] = useState(false);

  // Real-time listener for app settings
  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'config', 'app_settings'),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const updating = data.isUpdatingApp === true;
          setIsUpdating(updating);
          setUpdateNotice(data.updateNotice || 'Actualización de sistema en curso. Se están sincronizando las últimas mejoras y permisos.');
          setTargetVersion(data.targetVersion || '');

          // If updating turns off, reset minimized
          if (!updating) {
            setIsMinimized(false);
            sessionStorage.removeItem('update_banner_minimized');
          }
        }
      },
      (error) => {
        // Silently ignore permissions if unauthenticated
        console.warn('Config snapshot status:', error.message);
      }
    );

    return () => unsubscribe();
  }, []);

  // Background check to see if new version is live on server
  useEffect(() => {
    if (!isUpdating && targetVersion === APP_VERSION) return;

    const checkServerVersion = async () => {
      try {
        const res = await fetch(`/?_t=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
        });
        if (res.ok) {
          const text = await res.text();
          // If HTML contains the targetVersion or new bundle
          if (targetVersion && text.includes(targetVersion)) {
            setNewVersionDetected(true);
          }
        }
      } catch (e) {
        // Network offline or error
      }
    };

    const interval = setInterval(checkServerVersion, 35000);
    checkServerVersion();
    return () => clearInterval(interval);
  }, [isUpdating, targetVersion]);

  // Deep Cache Cleaner & Hard Reload
  const handleForceUpdate = useCallback(async () => {
    sounds.playClick();
    setIsClearing(true);

    try {
      // 1. Unregister all active Service Workers
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      }

      // 2. Clear CacheStorage (PWA caches, vite cache)
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        for (const name of cacheNames) {
          await caches.delete(name);
        }
      }

      // 3. Clear version and temporary storage while preserving authentication
      try {
        localStorage.removeItem('app_version');
        sessionStorage.clear();
      } catch (e) {
        console.warn('Storage cleanup notice:', e);
      }

      // 4. Force hard reload with timestamp query to bypass HTTP cache
      const cleanUrl = window.location.origin + window.location.pathname + `?update=${Date.now()}`;
      window.location.replace(cleanUrl);
    } catch (err) {
      console.error('Error during cache cleanup:', err);
      window.location.reload();
    }
  }, []);

  const toggleMinimize = (val: boolean) => {
    sounds.playClick();
    setIsMinimized(val);
    try {
      sessionStorage.setItem('update_banner_minimized', val ? 'true' : 'false');
    } catch {
      // ignore
    }
  };

  // Determine if banner should show:
  // Shows if isUpdating is true OR if targetVersion exists and differs from local APP_VERSION
  const hasVersionMismatch = targetVersion && targetVersion !== APP_VERSION;
  const shouldShow = isUpdating || hasVersionMismatch;

  if (!shouldShow) return null;

  return (
    <div className="fixed z-50 pointer-events-none inset-x-0 bottom-4 px-4 flex justify-center">
      <AnimatePresence mode="wait">
        {isMinimized ? (
          // Minimized Floating Pill
          <motion.button
            key="minimized"
            initial={{ opacity: 0, y: 20, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.8 }}
            onClick={() => toggleMinimize(false)}
            className="pointer-events-auto bg-slate-900/95 text-white border-2 border-amber-400 shadow-2xl backdrop-blur-md px-4 py-2 rounded-full flex items-center gap-2.5 text-xs font-bold hover:bg-slate-800 transition-all hover:scale-105 active:scale-95 group"
          >
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
            </span>
            <span className="text-amber-300 group-hover:text-amber-200">
              {newVersionDetected ? '🎉 ¡Nueva versión lista para instalar!' : 'Actualización en curso...'}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono border border-amber-500/30">
              v{targetVersion || APP_VERSION}
            </span>
            <ChevronUp size={14} className="text-slate-400 group-hover:text-white" />
          </motion.button>
        ) : (
          // Expanded Full Card Banner
          <motion.div
            key="expanded"
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            className="pointer-events-auto w-full max-w-xl bg-gradient-to-br from-slate-900 via-amber-950/90 to-slate-900 text-white rounded-3xl shadow-2xl border-2 border-amber-400/80 p-4 sm:p-5 relative overflow-hidden backdrop-blur-xl"
          >
            {/* Ambient Background Glow */}
            <div className="absolute -top-20 -right-20 w-48 h-48 bg-amber-500/20 rounded-full blur-3xl pointer-events-none"></div>

            {/* Header / Minimize Button */}
            <div className="flex items-start justify-between gap-3 mb-3 relative z-10">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="px-2.5 py-1 text-[11px] font-black uppercase tracking-wider bg-amber-500 text-slate-950 rounded-lg flex items-center gap-1.5 shadow-xs">
                  <Radio size={12} className="animate-pulse text-slate-950" />
                  <span>Aviso del Sistema</span>
                </span>
                <span className="text-xs font-bold text-amber-300 flex items-center gap-1 font-mono">
                  <span>Local: v{APP_VERSION}</span>
                  {targetVersion && targetVersion !== APP_VERSION && (
                    <>
                      <span className="text-slate-400">→</span>
                      <span className="text-emerald-400 font-black">Meta: v{targetVersion}</span>
                    </>
                  )}
                </span>
              </div>

              <button
                onClick={() => toggleMinimize(true)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
                title="Minimizar aviso"
              >
                <ChevronDown size={18} />
              </button>
            </div>

            {/* Content Body */}
            <div className="space-y-2 relative z-10">
              <h4 className="text-base font-black text-white flex items-center gap-2">
                <span>{newVersionDetected ? '✨ Nueva actualización detectada' : 'Actualización en Curso'}</span>
                {isUpdating && (
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                )}
              </h4>

              <p className="text-xs text-slate-200 leading-relaxed font-medium">
                {updateNotice || 'Se han realizado nuevas mejoras en el sistema. Si aún no las ves reflejadas en tu teléfono, puedes forzar la recarga para limpiar la memoria caché.'}
              </p>

              {newVersionDetected ? (
                <div className="flex items-center gap-1.5 text-xs text-emerald-300 font-bold bg-emerald-500/20 px-3 py-1.5 rounded-xl border border-emerald-400/40">
                  <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                  <span>Los nuevos archivos ya están disponibles. ¡Haz clic para aplicar!</span>
                </div>
              ) : (
                <div className="text-[11px] text-amber-200/80 bg-amber-500/10 px-3 py-1.5 rounded-xl border border-amber-500/20">
                  💡 <span className="font-semibold">Nota para operadores y equipo:</span> La actualización se cargará automáticamente en segundo plano. Si deseas ver los cambios de inmediato, pulsa el botón de abajo.
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="mt-4 pt-3 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 relative z-10">
              <span className="text-[11px] text-slate-400 font-medium text-center sm:text-left">
                No se cerrará tu sesión activa de usuario.
              </span>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() => toggleMinimize(true)}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-slate-300 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                >
                  Ocultar
                </button>

                <button
                  onClick={handleForceUpdate}
                  disabled={isClearing}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black rounded-xl text-xs shadow-lg transition-all active:scale-95 disabled:opacity-50"
                >
                  <RefreshCw size={14} className={isClearing ? 'animate-spin' : ''} />
                  <span>{isClearing ? 'Limpiando y recargando...' : 'Actualizar y Limpiar Caché'}</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
