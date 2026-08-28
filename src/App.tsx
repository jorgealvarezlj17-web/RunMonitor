import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, getDoc, getDocFromServer, setDoc, deleteDoc, getDocs, collection } from 'firebase/firestore';
import { auth, db } from './firebase';
import { Auth } from './components/Auth';
import { ConnectionStatus } from './components/ConnectionStatus';
import { EquipmentList } from './components/EquipmentList';
import { AddEquipment } from './components/AddEquipment';
import { PowerEventsLog } from './components/PowerEventsLog';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Sidebar } from './components/Sidebar';
import { CorteReporte } from './components/CorteReporte';
import { StatsPanel } from './components/StatsPanel';
import Settings from './components/Settings';
import { TeamPanel } from './components/TeamPanel';
import { Activity, ShieldCheck, Menu, X, BellRing, Zap, FileText, Loader2, User as UserIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { useProfile, isMasterAdminEmail } from './context/ProfileContext';
import { sounds } from './utils/sounds';

const APP_VERSION = "1.2.0";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showReminder, setShowReminder] = useState(false);
  const [shiftStartTime, setShiftStartTime] = useState('18:00');
  const { profile, loading: profileLoading } = useProfile();

  useEffect(() => {
    if (profile && profile.role !== 'admin') {
      if (activeTab === 'stats' || activeTab === 'settings' || activeTab === 'team') {
        setActiveTab('dashboard');
      }
    }
  }, [profile, activeTab]);

  // Version Control & Cache Busting
  useEffect(() => {
    const storedVersion = localStorage.getItem('app_version');
    if (storedVersion !== APP_VERSION) {
      console.log(`Updating app version from ${storedVersion} to ${APP_VERSION}`);
      localStorage.setItem('app_version', APP_VERSION);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
          for (const registration of registrations) {
            registration.unregister();
          }
        });
      }
      if (storedVersion) {
        window.location.reload();
      }
    }
  }, []);

  useEffect(() => {
    if (!user || !isMasterAdminEmail(user.email)) return;
    // Clean up admin emails from whitelist since they bypass it programmatically
    const cleanupAdminEmails = async () => {
      try {
        const admins = ['jorgealvarez.lj17@gmail.com', 'j.alvarez.lj17@gmail.com'];
        for (const admin of admins) {
          const adminRef = doc(db, 'allowed_emails', admin);
          const snap = await getDoc(adminRef);
          if (snap.exists()) {
            await deleteDoc(adminRef);
          }
        }
      } catch (error) {
        console.error('Error cleaning up admin emails:', error);
      }
    };
    cleanupAdminEmails();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const fetchConfig = async () => {
      try {
        const configDoc = await getDoc(doc(db, 'config', 'app_settings'));
        if (configDoc.exists()) {
          setShiftStartTime(configDoc.data().shiftStartTime || '18:00');
        }
      } catch (error) {
        console.error('Error fetching config in App:', error);
      }
    };
    fetchConfig();
  }, [user]);

  useEffect(() => {
    const checkReminder = () => {
      const now = new Date();
      const todayStr = format(now, 'yyyy-MM-dd');
      const lastCleared = localStorage.getItem('lastReportClearedDate');

      if (lastCleared !== todayStr) {
        const [h] = shiftStartTime.split(':').map(Number);
        if (now.getHours() >= h) {
          setShowReminder(true);
        }
      }
    };

    checkReminder();
    const interval = setInterval(checkReminder, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [shiftStartTime]);

  useEffect(() => {
    if (activeTab === 'corte' && showReminder) {
      setShowReminder(false);
      localStorage.setItem('lastReportClearedDate', format(new Date(), 'yyyy-MM-dd'));
    }
  }, [activeTab, showReminder]);

  useEffect(() => {
    let isMounted = true;

    // Fallback timeout for loading state - if Firebase takes too long, 
    // we show the login screen anyway so the user isn't stuck.
    const timeout = setTimeout(() => {
      if (isMounted && !authReady) {
        console.warn('Auth check timed out, showing start button');
        setAuthReady(true);
      }
    }, 6000);

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (isMounted) {
        setUser(user);
        setAuthReady(true);
        setLoading(false);
        clearTimeout(timeout);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
      clearTimeout(timeout);
    };
  }, []); // Empty dependency array ensures this runs only once on mount

  if (loading || (!user && !authReady) || (user && profileLoading)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 relative overflow-hidden">
        {/* Background glow effects */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-[100px]" />
        
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative z-10 flex flex-col items-center gap-8"
        >
          {/* Logo container */}
          <div className="flex flex-col items-center">
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
              className="w-32 h-32 rounded-full bg-gradient-to-b from-[#00FFFF] to-[#60A5FA] flex items-center justify-center relative shadow-lg"
            >
              <div className="w-16 h-16 border-[6px] border-black rounded-full border-t-transparent flex items-center justify-center">
                <div className="absolute top-8 w-[6px] h-8 bg-black rounded-full"></div>
              </div>
            </motion.div>
            <h1 className="mt-6 text-4xl font-bold">
              <span className="text-slate-800">Run</span>
              <span className="text-[#00B4D8]">Monitor</span>
            </h1>
          </div>
            
          <div className="flex flex-col items-center gap-3 min-h-[60px]">
            {!authReady ? (
              <>
                <div className="w-48 h-1.5 bg-slate-200 rounded-full overflow-hidden backdrop-blur-sm border border-slate-300">
                  <motion.div 
                    initial={{ x: "-100%" }}
                    animate={{ x: "100%" }}
                    transition={{ duration: 1.5, ease: "easeInOut", repeat: Infinity }}
                    className="h-full w-1/2 bg-gradient-to-r from-transparent via-cyan-500 to-transparent rounded-full"
                  />
                </div>
                <p className="text-cyan-600/80 font-bold uppercase tracking-[0.2em] text-[10px] animate-pulse">
                  Iniciando sistema...
                </p>
              </>
            ) : (
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => setLoading(false)}
                className="px-8 py-3 rounded-full bg-cyan-600 hover:bg-cyan-700 text-white font-bold uppercase tracking-widest transition-all shadow-lg shadow-cyan-500/30 active:scale-95"
              >
                Iniciar
              </motion.button>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="w-full min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-cyan-500/30 relative overflow-x-hidden">
        {!user ? (
          <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 sm:p-6 overflow-y-auto bg-slate-50 relative">
            {/* Cloud movement background - Flight effect */}
            <div className="absolute inset-0 bg-gradient-to-b from-sky-400 to-sky-200 overflow-hidden">
              {/* Far clouds (slower, more blurred) */}
              <motion.div 
                className="absolute top-20 left-0 opacity-70"
                animate={{ x: ["-100%", "200%"] }}
                transition={{ duration: 80, repeat: Infinity, ease: "linear" }}
              >
                <div className="relative w-64 h-32">
                    <div className="absolute top-0 left-0 w-40 h-40 bg-white rounded-full blur-3xl"></div>
                    <div className="absolute top-10 left-20 w-40 h-40 bg-white rounded-full blur-3xl"></div>
                </div>
              </motion.div>
              
              <motion.div 
                className="absolute top-60 left-40 opacity-60"
                animate={{ x: ["-150%", "150%"] }}
                transition={{ duration: 100, repeat: Infinity, ease: "linear" }}
              >
                <div className="relative w-96 h-40">
                    <div className="absolute top-0 left-0 w-60 h-60 bg-white rounded-full blur-3xl"></div>
                    <div className="absolute top-10 left-40 w-60 h-60 bg-white rounded-full blur-3xl"></div>
                </div>
              </motion.div>
              
              {/* Near clouds (faster, less blurred) */}
              <motion.div 
                className="absolute top-10 -left-20 opacity-90"
                animate={{ x: ["-100%", "200%"], y: [0, 20, 0] }}
                transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }}
              >
                <div className="relative w-48 h-24">
                    <div className="absolute top-0 left-0 w-32 h-32 bg-white rounded-full blur-2xl"></div>
                    <div className="absolute top-5 left-10 w-32 h-32 bg-white rounded-full blur-2xl"></div>
                </div>
              </motion.div>
              
              <motion.div 
                className="absolute bottom-32 -left-40 opacity-80"
                animate={{ x: ["-100%", "200%"], y: [0, -30, 0] }}
                transition={{ duration: 45, repeat: Infinity, ease: "easeInOut" }}
              >
                <div className="relative w-80 h-32">
                    <div className="absolute top-0 left-0 w-40 h-40 bg-white rounded-full blur-2xl"></div>
                    <div className="absolute top-5 left-20 w-40 h-40 bg-white rounded-full blur-2xl"></div>
                </div>
              </motion.div>
            </div>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-md w-full text-center relative z-10"
            >
              <div className="bg-white/60 backdrop-blur-xl p-4 sm:p-6 rounded-2xl shadow-2xl border border-white/40">
                <h2 className="text-2xl font-bold mb-4 tracking-tight">
                  <span className="text-black">Run</span>
                  <span className="text-[#00B4D8]">Monitor</span>
                </h2>
                <Auth />
              </div>
            </motion.div>
          </div>
        ) : profile?.is_synced === false ? (
          <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-md w-full text-center bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-2xl"
            >
              <div className="w-24 h-24 bg-amber-500/10 text-amber-500 rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-inner border border-amber-500/20">
                <ShieldCheck size={48} />
              </div>
              <h2 className="text-2xl font-black mb-4 tracking-tight text-slate-900">Acceso Pendiente</h2>
              <p className="text-slate-600 mb-8 leading-relaxed">
                Tu cuenta ha sido creada exitosamente, pero está pendiente de aprobación. 
                Contacta al administrador para que vincule tu cuenta al historial global.
              </p>
              <button
                onClick={() => signOut(auth)}
                className="w-full py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl transition-all"
              >
                Cerrar Sesión
              </button>
            </motion.div>
          </div>
        ) : (
          <div className="min-h-screen bg-slate-50 flex">
            <Sidebar 
              activeTab={activeTab} 
              setActiveTab={setActiveTab} 
              isOpen={isSidebarOpen} 
              setIsOpen={setIsSidebarOpen} 
            />

            <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${isSidebarOpen ? 'lg:ml-64' : 'lg:ml-20'}`}>
              {/* Barra superior 100% FIJA (Fixed Header) */}
              <div className={`fixed top-0 right-0 left-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.06)] transition-all duration-300 ${isSidebarOpen ? 'lg:left-64' : 'lg:left-20'}`}>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between relative">
                  {/* Botón de Menú a la izquierda */}
                  <div className="flex items-center">
                    <button 
                      onClick={() => {
                        sounds.playClick();
                        setIsSidebarOpen(!isSidebarOpen);
                      }}
                      className="p-2 hover:bg-slate-100 active:scale-95 rounded-xl text-slate-700 transition-all border border-slate-200/60 bg-slate-50/50 shadow-xs"
                      title="Menú"
                    >
                      {isSidebarOpen ? <X size={22} /> : <Menu size={22} />}
                    </button>
                  </div>

                  {/* Indicador de Estado centrado */}
                  <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center">
                    <ConnectionStatus />
                  </div>

                  {/* Perfil a la derecha */}
                  <div className="flex items-center gap-3">
                    <Auth />
                  </div>
                </div>
              </div>

              {/* Espaciador exacto para que el contenido inicie debajo de la barra fija */}
              <div className="h-14 w-full flex-shrink-0" />

              {/* Main Content que pasa por debajo de la barra */}
              <main className="flex-1 p-4 sm:p-6 lg:p-10 relative">
                <AnimatePresence>
                  {showReminder && activeTab !== 'corte' && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="mb-6 bg-white border border-amber-200 rounded-2xl p-4 flex items-center justify-between shadow-sm"
                    >
                      <div className="flex items-center gap-3 text-amber-700">
                        <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                          <BellRing size={16} />
                        </div>
                        <span className="font-bold text-sm">Es hora de realizar el corte de reporte.</span>
                      </div>
                      <button 
                        onClick={() => setActiveTab('corte')}
                        className="px-4 py-2 bg-amber-100 text-amber-700 font-bold rounded-xl hover:bg-amber-200 transition-all text-xs"
                      >
                        Ir al Corte
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence mode="wait">
                  {activeTab === 'dashboard' ? (
                    <motion.div
                      key="dashboard"
                      initial={{ opacity: 0, y: 20, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -20, scale: 0.98 }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      className="space-y-10"
                    >
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                        <div>
                          <h2 className="text-3xl font-black tracking-tight text-slate-900 mb-2">Panel de Control</h2>
                          <p className="text-slate-600 font-medium flex items-center gap-2">
                            <Activity size={16} className="text-emerald-600" />
                            Estado de equipos en tiempo real
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <PowerEventsLog />
                          <AddEquipment onAdded={() => {}} />
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2">
                          <EquipmentList />
                        </div>
                      </div>
                    </motion.div>
                  ) : activeTab === 'corte' ? (
                    <motion.div
                      key="corte"
                      initial={{ opacity: 0, y: 20, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -20, scale: 0.98 }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    >
                      <CorteReporte />
                    </motion.div>
                  ) : activeTab === 'stats' && profile?.role === 'admin' ? (
                    <motion.div
                      key="stats"
                      initial={{ opacity: 0, y: 20, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -20, scale: 0.98 }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    >
                      <StatsPanel />
                    </motion.div>
                  ) : activeTab === 'team' && profile?.role === 'admin' ? (
                    <motion.div
                      key="team"
                      initial={{ opacity: 0, y: 20, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -20, scale: 0.98 }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    >
                      <TeamPanel />
                    </motion.div>
                  ) : activeTab === 'settings' && profile?.role === 'admin' ? (
                    <motion.div
                      key="settings"
                      initial={{ opacity: 0, y: 20, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -20, scale: 0.98 }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    >
                      <Settings />
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </main>

              {/* Footer */}
              <footer className="px-6 py-8 border-t border-slate-200 text-center">
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
                  © 2026 Run Monitor • Sistema de Gestión Inteligente
                </p>
              </footer>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
