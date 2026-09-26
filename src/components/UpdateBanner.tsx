import React, { useEffect, useState, useCallback, useRef } from 'react';
import { db, auth } from '../firebase';
import { doc, onSnapshot, updateDoc, setDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, RefreshCw, X, ShieldAlert, Lock, Radio, Sparkles, ArrowRight, Eye, Play } from 'lucide-react';
import { sounds } from '../utils/sounds';
import { BUILD_ID, BUILD_TIMESTAMP } from '../version';
import { useProfile, isMasterAdminEmail } from '../context/ProfileContext';

interface VersionResponse {
  buildId?: string;
  buildTime?: number;
  updatedAt?: string;
}

export const UpdateBanner: React.FC = () => {
  const { profile } = useProfile();
  const pageLoadTimeRef = useRef<number>(Date.now());
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [newUpdateAvailable, setNewUpdateAvailable] = useState(false);
  const [isUpdatingServer, setIsUpdatingServer] = useState(false);
  const [serverTargetBuildId, setServerTargetBuildId] = useState<string>('');
  const [updateNoticeText, setUpdateNoticeText] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCheckingServer, setIsCheckingServer] = useState(false);
  const [lastCheckMessage, setLastCheckMessage] = useState<string>('Esperando despliegue de Vercel...');
  const [adminPreviewLock, setAdminPreviewLock] = useState(false);
  const [adminBypass, setAdminBypass] = useState(false);

  // Check if current user is an Admin
  const currentUserEmail = auth.currentUser?.email || profile?.email;
  const isAdmin = isMasterAdminEmail(currentUserEmail) || profile?.role === 'admin';

  // 1. Detect if the app was just updated (or fresh cache loaded)
  useEffect(() => {
    try {
      const justUpdated = sessionStorage.getItem('just_updated_alert') === 'true';
      const storedBuild = localStorage.getItem('app_build_hash');

      if (justUpdated || (storedBuild && storedBuild !== BUILD_ID)) {
        setShowSuccessToast(true);
        sounds.playSuccess();
        sessionStorage.removeItem('just_updated_alert');

        const timer = setTimeout(() => {
          setShowSuccessToast(false);
        }, 4000);
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

  // 2. Real-time listener for maintenance/update state in Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'config', 'app_settings'),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const updating = data.isUpdatingApp === true;
          const targetBuild = data.targetBuildId || '';
          setIsUpdatingServer(updating);
          setServerTargetBuildId(targetBuild);
          setUpdateNoticeText(data.updateNotice || '');

          // If this client already has the target build, auto-clear the pause flag in Firestore
          if (updating && targetBuild && targetBuild === BUILD_ID) {
            updateDoc(doc(db, 'config', 'app_settings'), {
              isUpdatingApp: false,
              lastUpdatedTimestamp: new Date().toISOString()
            }).catch(() => {});
          }
        }
      },
      () => {
        // Silently ignore permissions if unauthenticated
      }
    );

    return () => unsubscribe();
  }, []);

  // 3. Clear cache and reload cleanly
  const handleApplyUpdate = useCallback(async () => {
    sounds.playClick();
    setIsRefreshing(true);
    setLastCheckMessage('Limpiando memoria caché y recargando...');

    try {
      // Clear CacheStorage
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        for (const name of cacheNames) {
          await caches.delete(name);
        }
      }

      // Unregister Service Workers
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      }

      // Flag for post-reload toast
      try {
        sessionStorage.setItem('just_updated_alert', 'true');
        localStorage.setItem('app_build_hash', BUILD_ID);
      } catch {
        // ignore
      }

      const cleanUrl = window.location.origin + window.location.pathname + `?sync=${Date.now()}`;
      window.location.replace(cleanUrl);
    } catch {
      window.location.reload();
    }
  }, []);

  // 4. Background check for new Vercel deployment (every 10 seconds while locked, 60s otherwise)
  const checkForNewDeployment = useCallback(async () => {
    try {
      setIsCheckingServer(true);
      const res = await fetch(`/version.json?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
      });

      if (res.ok) {
        const data: VersionResponse = await res.json();
        if (data.buildId && data.buildId !== BUILD_ID) {
          setNewUpdateAvailable(true);
          setLastCheckMessage('¡Nueva versión detectada en Vercel! Aplicando actualización...');
          // Automatically trigger update and cache purge
          setTimeout(() => {
            handleApplyUpdate();
          }, 1000);
          return;
        } else {
          setLastCheckMessage('El servidor aún está compilando o esperando tu guardado push...');
        }
      } else {
        // Fallback check against index.html
        const htmlRes = await fetch(`/?_t=${Date.now()}`, { cache: 'no-store' });
        if (htmlRes.ok) {
          const html = await htmlRes.text();
          const currentScripts = Array.from(document.querySelectorAll('script[src]'))
            .map(s => s.getAttribute('src') || '')
            .filter(src => src.includes('/assets/'));

          if (currentScripts.length > 0) {
            const hasNewAssets = currentScripts.some(src => !html.includes(src));
            if (hasNewAssets) {
              setNewUpdateAvailable(true);
              setLastCheckMessage('¡Nuevos archivos detectados en el servidor! Actualizando...');
              setTimeout(() => {
                handleApplyUpdate();
              }, 1000);
              return;
            }
          }
        }
      }
    } catch {
      setLastCheckMessage('Comprobando conexión con el servidor...');
    } finally {
      setIsCheckingServer(false);
    }
  }, [handleApplyUpdate]);

  // Polling loop: faster when server is updating
  useEffect(() => {
    const intervalTime = isUpdatingServer ? 10000 : 45000;
    const interval = setInterval(checkForNewDeployment, intervalTime);
    return () => clearInterval(interval);
  }, [isUpdatingServer, checkForNewDeployment]);

  // Admin action to unlock operators directly
  const handleUnlockOperators = async () => {
    sounds.playClick();
    try {
      await updateDoc(doc(db, 'config', 'app_settings'), {
        isUpdatingApp: false,
        lastUpdatedTimestamp: new Date().toISOString()
      });
      sounds.playSuccess();
      setIsUpdatingServer(false);
    } catch {
      try {
        await setDoc(doc(db, 'config', 'app_settings'), {
          isUpdatingApp: false,
          lastUpdatedTimestamp: new Date().toISOString()
        }, { merge: true });
        sounds.playSuccess();
        setIsUpdatingServer(false);
      } catch (err) {
        console.error('Error unlocking operators:', err);
      }
    }
  };

  // Condition to lock the screen:
  // If isUpdatingServer is active AND the client has NOT loaded the target build yet AND (user is NOT admin OR admin is testing preview) AND not bypassed
  const isAlreadyUpdated = Boolean(serverTargetBuildId && serverTargetBuildId === BUILD_ID);
  const isOperatorLocked = !isAlreadyUpdated && (isUpdatingServer || adminPreviewLock) && (!isAdmin || adminPreviewLock) && !adminBypass;

  return (
    <>
      {/* ========================================================================= */}
      {/* 1. FULL-SCREEN BLOCKING LOCK FOR OPERATORS (No interaction allowed)       */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {isOperatorLocked && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[999999] bg-slate-950/95 backdrop-blur-2xl flex flex-col items-center justify-center p-4 sm:p-6 text-center select-none overflow-y-auto"
          >
            {/* Background subtle radial glow */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl animate-pulse" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-cyan-500/10 rounded-full blur-2xl" />
            </div>

            <div className="max-w-md w-full relative z-10 space-y-6">
              {/* Icon Container with active radar pulse */}
              <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-3xl bg-amber-500 opacity-20" />
                <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-slate-950 shadow-xl shadow-amber-500/30">
                  <Lock size={28} className="stroke-[2.5]" />
                </div>
              </div>

              {/* Title and Explanation */}
              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-400 text-xs font-bold uppercase tracking-wider">
                  <Radio size={12} className="animate-pulse" />
                  <span>Actualización del Sistema en Curso</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  Sistema en Pausa
                </h1>
                <p className="text-sm text-slate-300 leading-relaxed max-w-sm mx-auto">
                  {updateNoticeText ||
                    'Se están sincronizando mejoras y cambios en el sistema central de la planta. El acceso y registro de operaciones se encuentra temporalmente detenido.'}
                </p>
              </div>

              {/* Information Card */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 text-left space-y-3 shadow-inner">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-amber-400 mt-1.5 shrink-0 animate-pulse" />
                  <p className="text-xs text-slate-300 leading-normal">
                    <strong className="text-white">No cierres esta ventana:</strong> Tu pantalla se actualizará y desbloqueará sola de forma automática tan pronto como los cambios se publiquen en el servidor.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-cyan-400 mt-1.5 shrink-0" />
                  <p className="text-xs text-slate-300 leading-normal">
                    <strong className="text-white">Tus datos están protegidos:</strong> Todos los turnos y registros anteriores están guardados de forma segura en la nube.
                  </p>
                </div>
              </div>

              {/* Live Status Indicator */}
              <div className="flex items-center justify-center gap-2 text-xs text-slate-400 font-medium bg-slate-900/60 px-4 py-2 rounded-xl border border-slate-800/80">
                <RefreshCw size={13} className={isCheckingServer || isRefreshing ? 'animate-spin text-amber-400' : 'text-slate-500'} />
                <span className="truncate">{lastCheckMessage}</span>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={checkForNewDeployment}
                  disabled={isCheckingServer || isRefreshing}
                  className="w-full sm:w-auto px-5 py-2.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-white text-xs font-bold rounded-xl border border-slate-700 transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                >
                  <RefreshCw size={14} className={isCheckingServer ? 'animate-spin' : ''} />
                  <span>Comprobar Estado Ahora</span>
                </button>

                {/* If preview mode was active by admin */}
                {adminPreviewLock && (
                  <button
                    type="button"
                    onClick={() => setAdminPreviewLock(false)}
                    className="w-full sm:w-auto px-4 py-2.5 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 text-xs font-black rounded-xl transition-all shadow-sm"
                  >
                    Salir de Vista Previa
                  </button>
                )}
              </div>

              {/* Admin Emergency Bypass Link */}
              {!adminPreviewLock && (
                <div className="pt-4 border-t border-slate-900 flex justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      const pass = window.prompt('Introduce la clave de acceso de administrador para entrar:');
                      if (pass && (pass === 'admin' || pass === '1234' || pass.toLowerCase() === 'jorge')) {
                        setAdminBypass(true);
                      } else if (pass) {
                        alert('Clave no válida.');
                      }
                    }}
                    className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors underline"
                  >
                    ¿Eres administrador? Entrar como administrador
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* 2. ADMIN FLOATING CONTROL BAR (Visible only to Admin when update is ON)   */}
      {/* ========================================================================= */}
      {isAdmin && isUpdatingServer && !adminPreviewLock && (
        <div className="fixed top-0 inset-x-0 z-50 bg-amber-500 text-slate-950 px-4 py-2.5 shadow-md flex flex-wrap items-center justify-between gap-3 text-xs font-semibold">
          <div className="flex items-center gap-2">
            <span className="p-1 bg-slate-950 text-amber-400 rounded-lg">
              <ShieldAlert size={14} />
            </span>
            <span>
              <strong>Pausa de Actualización Activa:</strong> Los operadores tienen la pantalla bloqueada esperando tu despliegue en Vercel.
            </span>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => setAdminPreviewLock(true)}
              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 active:scale-95"
              title="Ver cómo ven la pantalla los operadores"
            >
              <Eye size={12} />
              <span>Ver como Operador</span>
            </button>

            <button
              onClick={handleUnlockOperators}
              className="px-3 py-1 bg-slate-950 hover:bg-slate-900 text-amber-300 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 shadow-sm active:scale-95"
            >
              <CheckCircle2 size={12} className="text-emerald-400" />
              <span>Finalizar y Desbloquear Todos</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. SUCCESS TOAST (When update has just been loaded into client)            */}
      {/* ========================================================================= */}
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

      {/* ========================================================================= */}
      {/* 4. DISCREET INDICATOR (When a new build is detected in background)         */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {newUpdateAvailable && !isOperatorLocked && (
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
                Nueva versión lista en el servidor. Sincronizando caché...
              </span>

              <button
                onClick={handleApplyUpdate}
                disabled={isRefreshing}
                className="ml-auto px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-[11px] transition-colors flex items-center gap-1 shrink-0 active:scale-95 disabled:opacity-50"
              >
                <RefreshCw size={11} className={isRefreshing ? 'animate-spin' : ''} />
                <span>{isRefreshing ? 'Aplicando...' : 'Actualizar'}</span>
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
