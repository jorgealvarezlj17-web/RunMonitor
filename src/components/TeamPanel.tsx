import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Profile, isMasterAdminEmail } from '../context/ProfileContext';
import { 
  Shield, 
  User, 
  ToggleLeft, 
  ToggleRight, 
  Search, 
  Loader2, 
  Mail, 
  Plus, 
  Trash2, 
  ShieldCheck, 
  Clock, 
  Activity, 
  Users, 
  CheckCircle2, 
  AlertCircle,
  Sparkles,
  Lock,
  UserCheck,
  UserX,
  RefreshCw,
  Info,
  Radio,
  Eye,
  EyeOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatDistanceToNow, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { sounds } from '../utils/sounds';

interface AllowedEmailItem {
  id: string;
  email: string;
  name?: string;
  role?: 'admin' | 'operator';
  status?: 'active' | 'inactive';
  addedAt?: any;
  addedBy?: string;
}

export const formatRealtimeAgo = (dateString?: string): string => {
  if (!dateString) return 'Sin registros';
  const time = new Date(dateString).getTime();
  if (isNaN(time)) return 'Sin registros';
  const diffMs = Math.max(0, Date.now() - time);
  const diffSec = Math.floor(diffMs / 1000);
  
  if (diffSec < 3) return 'hace unos instantes';
  if (diffSec < 60) return `hace ${diffSec} seg`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `hace ${diffMin} ${diffMin === 1 ? 'minuto' : 'minutos'}`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `hace ${diffHours} ${diffHours === 1 ? 'hora' : 'horas'}`;
  const diffDays = Math.floor(diffHours / 24);
  return `hace ${diffDays} ${diffDays === 1 ? 'día' : 'días'}`;
};

export const TeamPanel: React.FC = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [allowedEmails, setAllowedEmails] = useState<AllowedEmailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // New Allowed Email Form State
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<'operator' | 'admin'>('operator');
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Tabs & Filters
  const [activeTab, setActiveTab] = useState<'users' | 'whitelist'>('users');
  const [userFilter, setUserFilter] = useState<'all' | 'online' | 'offline' | 'admin' | 'operator'>('all');
  
  // Realtime tick to keep live timestamps and active status fresh every second
  const [, setTick] = useState(0);

  useEffect(() => {
    // Refresh every 1 second for ultra-responsive real-time presence indicators
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // 1. Listen to all user profiles in real-time
    const qProfiles = query(collection(db, 'profiles'));
    const unsubscribeProfiles = onSnapshot(qProfiles, (snapshot) => {
      const fetchedProfiles: Profile[] = [];
      snapshot.forEach((docSnap) => {
        fetchedProfiles.push({ id: docSnap.id, ...docSnap.data() } as Profile);
      });
      setProfiles(fetchedProfiles);
      setLoading(false);
    }, (err) => {
      console.error('Error fetching profiles:', err);
      setLoading(false);
    });

    // 2. Listen to authorized worker emails (security filter) in real-time
    const qEmails = query(collection(db, 'allowed_emails'));
    const unsubscribeEmails = onSnapshot(qEmails, (snapshot) => {
      const items: AllowedEmailItem[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        items.push({
          id: docSnap.id,
          email: data.email || docSnap.id,
          name: data.name || '',
          role: data.role || 'operator',
          status: data.status || 'active',
          addedAt: data.addedAt,
          addedBy: data.addedBy
        });
      });
      setAllowedEmails(items);
    }, (err) => {
      console.error('Error fetching allowed_emails:', err);
    });

    return () => {
      unsubscribeProfiles();
      unsubscribeEmails();
    };
  }, []);

  // Helper to check if a profile is actively looking at the app right now
  const isProfileOnline = (p: Profile): boolean => {
    if (!p.is_online) return false;
    if (!p.last_connection) return false;
    const diffMs = Date.now() - new Date(p.last_connection).getTime();
    return diffMs < 14000; // Active within last 14 seconds (heartbeat is 4s)
  };

  // Stats Calculations
  const stats = useMemo(() => {
    const totalUsers = profiles.length;
    const onlineUsers = profiles.filter(isProfileOnline).length;
    const offlineUsers = Math.max(0, totalUsers - onlineUsers);
    const totalAllowed = allowedEmails.length;
    const activeAllowed = allowedEmails.filter(a => a.status !== 'inactive').length;
    return {
      totalUsers,
      onlineUsers,
      offlineUsers,
      totalAllowed,
      activeAllowed
    };
  }, [profiles, allowedEmails]);

  // Allowed Email Set for fast lookup
  const allowedEmailMap = useMemo(() => {
    const map = new Map<string, AllowedEmailItem>();
    allowedEmails.forEach(item => {
      map.set(item.email.toLowerCase().trim(), item);
    });
    return map;
  }, [allowedEmails]);

  // Toggle sync status
  const toggleSyncStatus = async (profileId: string, currentStatus: boolean) => {
    sounds.playClick();
    try {
      await updateDoc(doc(db, 'profiles', profileId), {
        is_synced: !currentStatus
      });
    } catch (error) {
      console.error('Error updating sync status:', error);
    }
  };

  // Toggle role between admin and operator
  const toggleRole = async (profileId: string, currentRole: string) => {
    sounds.playClick();
    try {
      await updateDoc(doc(db, 'profiles', profileId), {
        role: currentRole === 'admin' ? 'operator' : 'admin'
      });
    } catch (error) {
      console.error('Error updating role:', error);
    }
  };

  // Toggle status of allowed email (active / inactive)
  const toggleAllowedEmailStatus = async (item: AllowedEmailItem) => {
    sounds.playClick();
    const newStatus = item.status === 'inactive' ? 'active' : 'inactive';
    try {
      await updateDoc(doc(db, 'allowed_emails', item.id), {
        status: newStatus
      });
      setFeedbackMsg({
        type: 'success',
        text: `Acceso ${newStatus === 'active' ? 'activado' : 'suspendido'} para ${item.email}`
      });
      setTimeout(() => setFeedbackMsg(null), 3500);
    } catch (err) {
      console.error('Error toggling allowed email status:', err);
    }
  };

  // Add a worker email to the security filter
  const addAllowedEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    sounds.playClick();
    setIsSubmittingEmail(true);
    setFeedbackMsg(null);

    const emailLower = newEmail.toLowerCase().trim();
    
    if (emailLower.startsWith('jorgealvarez.lj17@') || emailLower === 'jorgealvarez.lj17@gmail.com') {
      setFeedbackMsg({
        type: 'error',
        text: 'Este correo es del Administrador Principal y tiene acceso automático sin restricciones.'
      });
      setIsSubmittingEmail(false);
      return;
    }

    try {
      await setDoc(doc(db, 'allowed_emails', emailLower), {
        email: emailLower,
        name: newName.trim() || '',
        role: newRole,
        status: 'active',
        addedAt: serverTimestamp()
      });
      
      setNewEmail('');
      setNewName('');
      setFeedbackMsg({
        type: 'success',
        text: `¡Correo ${emailLower} autorizado exitosamente! Ahora este trabajador puede registrarse o iniciar sesión.`
      });
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (error: any) {
      console.error('Error adding allowed email:', error);
      setFeedbackMsg({
        type: 'error',
        text: 'Error al autorizar correo: ' + (error?.message || String(error))
      });
    } finally {
      setIsSubmittingEmail(false);
    }
  };

  // Remove worker email from security filter
  const removeAllowedEmail = async (email: string) => {
    sounds.playClick();
    if (!window.confirm(`¿Estás seguro de revocar la autorización a "${email}"?\n\nAl eliminarlo del filtro, este usuario ya no podrá iniciar sesión en la plataforma.`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'allowed_emails', email.toLowerCase().trim()));
      setFeedbackMsg({
        type: 'success',
        text: `Autorización de "${email}" revocada exitosamente.`
      });
      setTimeout(() => setFeedbackMsg(null), 3500);
    } catch (error: any) {
      console.error('Error removing allowed email:', error);
      setFeedbackMsg({
        type: 'error',
        text: 'Error al eliminar correo: ' + (error?.message || String(error))
      });
    }
  };

  // Delete profile
  const deleteProfile = async (profile: Profile) => {
    sounds.playClick();
    if (!window.confirm(`¿Eliminar permanentemente el perfil de "${profile.full_name || profile.email}"?`)) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'profiles', profile.id));
      setFeedbackMsg({
        type: 'success',
        text: `Perfil de ${profile.full_name || profile.email} eliminado.`
      });
      setTimeout(() => setFeedbackMsg(null), 3500);
    } catch (error: any) {
      console.error('Error removing profile:', error);
      setFeedbackMsg({
        type: 'error',
        text: 'Error al eliminar perfil: ' + (error?.message || String(error))
      });
    }
  };

  // Filtered profiles for User Tab
  const filteredProfiles = useMemo(() => {
    return profiles.filter((p) => {
      const isOnline = isProfileOnline(p);
      const emailLower = p.email?.toLowerCase() || '';
      const nameLower = p.full_name?.toLowerCase() || '';
      const searchMatch = !searchTerm || 
        emailLower.includes(searchTerm.toLowerCase()) || 
        nameLower.includes(searchTerm.toLowerCase());

      if (!searchMatch) return false;

      if (userFilter === 'online') return isOnline;
      if (userFilter === 'offline') return !isOnline;
      if (userFilter === 'admin') return p.role === 'admin';
      if (userFilter === 'operator') return p.role === 'operator';
      return true;
    });
  }, [profiles, searchTerm, userFilter]);

  // Filtered allowed emails for Whitelist Tab
  const filteredAllowedEmails = useMemo(() => {
    return allowedEmails.filter((item) => {
      const emailLower = item.email.toLowerCase();
      const nameLower = (item.name || '').toLowerCase();
      if (!searchTerm) return true;
      return emailLower.includes(searchTerm.toLowerCase()) || nameLower.includes(searchTerm.toLowerCase());
    });
  }, [allowedEmails, searchTerm]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="w-9 h-9 animate-spin text-cyan-600" />
        <p className="text-sm font-semibold text-slate-500">Cargando datos del equipo y seguridad...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header with Title & Action Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Panel de Equipos & Seguridad</h2>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-cyan-50 text-cyan-700 border border-cyan-200">
              En Vivo
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Supervisa usuarios conectados en tiempo real y gestiona el filtro de seguridad por correos autorizados.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-1.5 bg-slate-100/90 rounded-2xl self-start md:self-auto border border-slate-200/60">
          <button
            type="button"
            onClick={() => {
              sounds.playClick();
              setActiveTab('users');
            }}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all ${
              activeTab === 'users' 
                ? 'bg-white text-slate-900 shadow-sm' 
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users size={16} className={activeTab === 'users' ? 'text-cyan-600' : ''} />
            <span>Usuarios ({stats.totalUsers})</span>
            {stats.onlineUsers > 0 && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              sounds.playClick();
              setActiveTab('whitelist');
            }}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all ${
              activeTab === 'whitelist' 
                ? 'bg-white text-slate-900 shadow-sm' 
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <ShieldCheck size={16} className={activeTab === 'whitelist' ? 'text-cyan-600' : ''} />
            <span>Filtro de Seguridad ({stats.totalAllowed})</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        {/* Real-time Online Users KPI */}
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50/50 border border-emerald-200/80 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-emerald-800">En Línea Ahora</span>
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-emerald-950">{stats.onlineUsers}</span>
            <span className="text-xs font-bold text-emerald-700">conectado{stats.onlineUsers === 1 ? '' : 's'}</span>
          </div>
          <p className="text-[10px] font-semibold text-emerald-700/80 mt-1">Actividad en vivo &lt; 90s</p>
        </div>

        {/* Offline Users KPI */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">Desconectados</span>
            <Clock size={16} className="text-slate-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-800">{stats.offlineUsers}</span>
            <span className="text-xs font-bold text-slate-500">fuera de línea</span>
          </div>
          <p className="text-[10px] font-semibold text-slate-400 mt-1">Sin sesión activa</p>
        </div>

        {/* Security Filter Whitelist Count */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-cyan-800">Filtro de Correos</span>
            <ShieldCheck size={16} className="text-cyan-600" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-cyan-950">{stats.totalAllowed}</span>
            <span className="text-xs font-bold text-cyan-700">autorizados</span>
          </div>
          <p className="text-[10px] font-semibold text-cyan-600/80 mt-1">{stats.activeAllowed} activos con acceso</p>
        </div>

        {/* Security Status Mode */}
        <div className="bg-slate-900 text-white rounded-2xl p-4 flex flex-col justify-between border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Protección</span>
            <Lock size={15} className="text-emerald-400" />
          </div>
          <div className="mt-2">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span className="text-sm font-black text-emerald-400">Filtro Estricto</span>
            </div>
            <p className="text-[10px] text-slate-300 mt-1 leading-tight font-medium">
              Solo correos registrados pueden acceder
            </p>
          </div>
        </div>
      </div>

      {/* Global Feedback Alert */}
      <AnimatePresence>
        {feedbackMsg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`p-4 rounded-2xl border flex items-center justify-between gap-3 text-sm font-bold shadow-xs ${
              feedbackMsg.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                : 'bg-red-50 text-red-900 border-red-200'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {feedbackMsg.type === 'success' ? <CheckCircle2 size={18} className="text-emerald-600 shrink-0" /> : <AlertCircle size={18} className="text-red-600 shrink-0" />}
              <span>{feedbackMsg.text}</span>
            </div>
            <button 
              type="button" 
              onClick={() => setFeedbackMsg(null)}
              className="text-xs underline hover:opacity-80"
            >
              Cerrar
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* TAB 1: USERS & REAL-TIME PRESENCE */}
      {activeTab === 'users' && (
        <motion.div
          key="tab-users"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="space-y-4"
        >
          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input
                type="text"
                placeholder="Buscar usuario o correo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 shadow-xs"
              />
            </div>

            {/* Quick Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto p-1 bg-slate-100 rounded-2xl border border-slate-200/60 text-xs font-bold text-slate-600">
              <button
                type="button"
                onClick={() => { sounds.playClick(); setUserFilter('all'); }}
                className={`px-3 py-1.5 rounded-xl transition-all ${userFilter === 'all' ? 'bg-white text-slate-900 shadow-xs font-black' : 'hover:text-slate-900'}`}
              >
                Todos ({stats.totalUsers})
              </button>
              <button
                type="button"
                onClick={() => { sounds.playClick(); setUserFilter('online'); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all ${userFilter === 'online' ? 'bg-white text-emerald-800 shadow-xs font-black' : 'hover:text-emerald-700'}`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>En Línea ({stats.onlineUsers})</span>
              </button>
              <button
                type="button"
                onClick={() => { sounds.playClick(); setUserFilter('offline'); }}
                className={`px-3 py-1.5 rounded-xl transition-all ${userFilter === 'offline' ? 'bg-white text-slate-800 shadow-xs font-black' : 'hover:text-slate-900'}`}
              >
                Desconectados ({stats.offlineUsers})
              </button>
              <button
                type="button"
                onClick={() => { sounds.playClick(); setUserFilter('admin'); }}
                className={`px-3 py-1.5 rounded-xl transition-all ${userFilter === 'admin' ? 'bg-white text-purple-800 shadow-xs font-black' : 'hover:text-purple-700'}`}
              >
                Admins
              </button>
            </div>
          </div>

          {/* User Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredProfiles.map((p) => {
              const isOnline = isProfileOnline(p);
              const isOwnerAdmin = isMasterAdminEmail(p.email);
              const isAllowed = allowedEmailMap.has(p.email?.toLowerCase().trim() || '');
              const allowedData = allowedEmailMap.get(p.email?.toLowerCase().trim() || '');

              const formattedTime = p.last_connection 
                ? format(new Date(p.last_connection), 'hh:mm:ss a', { locale: es }) 
                : null;
              const formattedDate = p.last_connection 
                ? format(new Date(p.last_connection), 'dd/MM/yyyy', { locale: es }) 
                : null;

              return (
                <motion.div
                  key={p.id}
                  layout
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`bg-white rounded-3xl border transition-all p-5 flex flex-col justify-between gap-4 shadow-xs hover:shadow-md ${
                    isOnline 
                      ? 'border-emerald-400/80 ring-2 ring-emerald-400/20 bg-gradient-to-b from-emerald-50/20 to-white' 
                      : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3.5 min-w-0">
                      {/* Avatar with Real-time indicator */}
                      <div className="relative shrink-0">
                        {p.photo_url ? (
                          <img
                            src={p.photo_url}
                            alt={p.full_name || 'User'}
                            className="w-13 h-13 rounded-2xl object-cover border-2 border-white shadow-xs"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-13 h-13 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-600 font-black text-lg border border-slate-200">
                            {(p.full_name || p.email || '?')[0].toUpperCase()}
                          </div>
                        )}
                        
                        {/* Live Online Radar Pulse Dot */}
                        {isOnline ? (
                          <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-white"></span>
                          </span>
                        ) : (
                          <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-slate-300 border-2 border-white"></span>
                        )}
                      </div>

                      {/* Name, Email & Real-time status */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-base font-bold text-slate-900 truncate">
                            {p.full_name || 'Usuario sin nombre'}
                          </h4>
                          {isOwnerAdmin ? (
                            <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 rounded-md border border-amber-300/60">
                              Propietario
                            </span>
                          ) : p.role === 'admin' ? (
                            <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 rounded-md border border-purple-200">
                              Admin
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-700 rounded-md border border-slate-200">
                              Operador
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 font-medium truncate mt-0.5">{p.email}</p>

                        {/* Real-time Status Banner */}
                        <div className="mt-2.5">
                          {isOnline ? (
                            <div className="inline-flex items-center gap-2 text-xs font-bold text-emerald-800 bg-emerald-100/90 px-3 py-1 rounded-xl border border-emerald-300 shadow-xs">
                              <span className="relative flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-600"></span>
                              </span>
                              <span>Viendo la app ahora</span>
                              <span className="text-[10px] font-bold text-emerald-700 bg-white/80 px-1.5 py-0.5 rounded-md shadow-2xs">
                                En vivo
                              </span>
                            </div>
                          ) : p.last_connection ? (
                            <div className="flex flex-col gap-1 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 text-slate-700 font-bold">
                                  <Clock size={12} className="text-slate-400" />
                                  <span>Última conexión / salida:</span>
                                </div>
                                <span className="text-[11px] font-bold text-cyan-700 bg-cyan-50 px-1.5 py-0.5 rounded border border-cyan-200/60">
                                  {formatRealtimeAgo(p.last_connection)}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 text-[11px] text-slate-600 font-medium ml-4 flex-wrap">
                                <span className="font-bold text-slate-800">{formattedTime}</span>
                                <span>({formattedDate})</span>
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[11px] bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 inline-flex items-center gap-1">
                              <Clock size={11} />
                              <span>Sin registros de conexión</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Security Filter Status Badge */}
                  <div className="bg-slate-50/80 rounded-2xl p-2.5 border border-slate-200/60 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      {isOwnerAdmin ? (
                        <>
                          <ShieldCheck size={15} className="text-amber-600" />
                          <span className="font-bold text-slate-700">Acceso Maestro</span>
                        </>
                      ) : isAllowed ? (
                        <>
                          <ShieldCheck size={15} className="text-emerald-600" />
                          <span className="font-bold text-emerald-800">
                            Filtro: {allowedData?.status === 'inactive' ? 'Suspendido' : 'Autorizado'}
                          </span>
                        </>
                      ) : (
                        <>
                          <AlertCircle size={15} className="text-amber-500" />
                          <span className="font-bold text-amber-700">Sin Autorización en Lista</span>
                        </>
                      )}
                    </div>

                    {!isOwnerAdmin && !isAllowed && (
                      <button
                        type="button"
                        onClick={async () => {
                          sounds.playClick();
                          if (!p.email) return;
                          try {
                            await setDoc(doc(db, 'allowed_emails', p.email.toLowerCase().trim()), {
                              email: p.email.toLowerCase().trim(),
                              name: p.full_name || '',
                              role: p.role || 'operator',
                              status: 'active',
                              addedAt: serverTimestamp()
                            });
                            setFeedbackMsg({ type: 'success', text: `Correo ${p.email} agregado al filtro de autorizados.` });
                            setTimeout(() => setFeedbackMsg(null), 3000);
                          } catch (e) {
                            console.error(e);
                          }
                        }}
                        className="text-[11px] font-bold text-cyan-700 bg-cyan-50 hover:bg-cyan-100 px-2 py-1 rounded-lg border border-cyan-200 transition-colors"
                      >
                        + Autorizar Correo
                      </button>
                    )}
                  </div>

                  {/* Action Controls */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                      {/* Role Switcher */}
                      <button
                        type="button"
                        disabled={isOwnerAdmin}
                        onClick={() => toggleRole(p.id, p.role)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                          p.role === 'admin'
                            ? 'bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100'
                            : 'bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200'
                        } ${isOwnerAdmin ? 'opacity-80 cursor-default' : ''}`}
                      >
                        <Shield size={13} className={p.role === 'admin' ? 'text-purple-600' : 'text-slate-500'} />
                        <span>{p.role === 'admin' ? 'Administrador' : 'Operador'}</span>
                      </button>

                      {/* Sync / App Access Toggle */}
                      <button
                        type="button"
                        disabled={isOwnerAdmin}
                        onClick={() => toggleSyncStatus(p.id, p.is_synced)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                          p.is_synced
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                            : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                        } ${isOwnerAdmin ? 'opacity-80 cursor-default' : ''}`}
                      >
                        {p.is_synced ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                        <span>{p.is_synced ? 'Vinculado' : 'Desvinculado'}</span>
                      </button>
                    </div>

                    {!isOwnerAdmin && (
                      <button
                        type="button"
                        onClick={() => deleteProfile(p)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                        title="Eliminar usuario"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}

            {filteredProfiles.length === 0 && (
              <div className="col-span-full bg-white rounded-3xl border border-slate-200 p-12 text-center flex flex-col items-center justify-center">
                <div className="w-14 h-14 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mb-3">
                  <Search size={24} />
                </div>
                <h4 className="text-base font-bold text-slate-800">No se encontraron usuarios</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  {searchTerm ? 'Intenta con otro término de búsqueda o limpia el filtro actual.' : 'Aún no hay usuarios registrados bajo este criterio.'}
                </p>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* TAB 2: WHITELIST / SECURITY FILTER MANAGEMENT */}
      {activeTab === 'whitelist' && (
        <motion.div
          key="tab-whitelist"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="space-y-6"
        >
          {/* Security Filter Explainer Banner */}
          <div className="bg-gradient-to-r from-cyan-900 via-slate-900 to-slate-900 text-white rounded-3xl p-6 shadow-sm border border-cyan-800/40 relative overflow-hidden">
            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1 max-w-2xl">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={20} className="text-cyan-400" />
                  <h3 className="text-lg font-black tracking-tight">Filtro de Seguridad de Trabajadores</h3>
                </div>
                <p className="text-xs text-slate-300 font-medium leading-relaxed">
                  Solo los correos registrados en esta lista tienen autorización para crear cuenta o iniciar sesión. Cualquier intento de acceso desde un correo no autorizado será bloqueado automáticamente.
                </p>
              </div>

              <div className="bg-white/10 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/15 shrink-0 text-center">
                <span className="text-xs font-bold text-cyan-300 block uppercase tracking-wider">Filtro</span>
                <span className="text-sm font-black text-white">Activo y Protegido</span>
              </div>
            </div>
          </div>

          {/* Add Worker Email Form */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
            <h3 className="text-base font-bold text-slate-900 mb-3 flex items-center gap-2">
              <Plus size={18} className="text-cyan-600" />
              <span>Autorizar Nuevo Correo de Trabajador</span>
            </h3>

            <form onSubmit={addAllowedEmail} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-5 relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="email"
                  required
                  placeholder="correo.trabajador@ejemplo.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all"
                />
              </div>

              <div className="sm:col-span-4 relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  placeholder="Nombre del trabajador (opcional)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all"
                />
              </div>

              <div className="sm:col-span-3 flex gap-2">
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as 'operator' | 'admin')}
                  className="bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                >
                  <option value="operator">Operador</option>
                  <option value="admin">Admin</option>
                </select>

                <button
                  type="submit"
                  disabled={isSubmittingEmail || !newEmail.trim()}
                  className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs py-2.5 px-3 rounded-2xl transition-all shadow-md shadow-cyan-600/20 flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isSubmittingEmail ? <Loader2 size={14} className="animate-spin" /> : <Plus size={15} />}
                  <span>Autorizar</span>
                </button>
              </div>
            </form>
          </div>

          {/* Authorized Worker Emails List */}
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="p-4 sm:px-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Lista de Correos Autorizados ({filteredAllowedEmails.length})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Control de acceso preventivo para altas y accesos</p>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="text"
                  placeholder="Filtrar correos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
              {filteredAllowedEmails.map((item) => {
                const isRegistered = profiles.some(p => p.email?.toLowerCase().trim() === item.email.toLowerCase().trim());
                const matchingProfile = profiles.find(p => p.email?.toLowerCase().trim() === item.email.toLowerCase().trim());
                const isOnline = matchingProfile ? isProfileOnline(matchingProfile) : false;

                return (
                  <div key={item.id} className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors">
                    <div className="flex items-center gap-3.5">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${
                        item.status === 'inactive' 
                          ? 'bg-slate-100 text-slate-400 border-slate-200' 
                          : 'bg-cyan-50 text-cyan-700 border-cyan-200/60'
                      }`}>
                        <Mail size={18} />
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-bold text-sm ${item.status === 'inactive' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                            {item.email}
                          </span>
                          {item.name && (
                            <span className="text-xs font-semibold text-slate-500">
                              ({item.name})
                            </span>
                          )}
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                            item.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {item.role === 'admin' ? 'Admin' : 'Operador'}
                          </span>
                        </div>

                        {/* Account registration status indicator */}
                        <div className="mt-1 flex items-center gap-2 text-xs flex-wrap">
                          {isRegistered ? (
                            <>
                              <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-[11px]">
                                <UserCheck size={13} className="text-emerald-600" />
                                <span>Registrado</span>
                              </span>
                              {isOnline ? (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[10px]">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                                  <span>Viendo app ahora</span>
                                </span>
                              ) : matchingProfile?.last_connection ? (
                                <span className="inline-flex items-center gap-1 text-slate-500 text-[10px] bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                                  <Clock size={10} className="text-slate-400" />
                                  <span>
                                    Últ. vez: {format(new Date(matchingProfile.last_connection), 'hh:mm:ss a', { locale: es })} ({formatRealtimeAgo(matchingProfile.last_connection)})
                                  </span>
                                </span>
                              ) : null}
                            </>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-amber-700 font-medium text-[11px]">
                              <Clock size={12} className="text-amber-600" />
                              <span>Pendiente de primer registro</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Quick status toggle and delete button */}
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <button
                        type="button"
                        onClick={() => toggleAllowedEmailStatus(item)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 ${
                          item.status === 'inactive'
                            ? 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        }`}
                        title={item.status === 'inactive' ? 'Activar acceso' : 'Suspender acceso temporalmente'}
                      >
                        {item.status === 'inactive' ? <UserX size={14} /> : <UserCheck size={14} />}
                        <span>{item.status === 'inactive' ? 'Suspendido' : 'Activo'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => removeAllowedEmail(item.id)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                        title="Revocar autorización y eliminar del filtro"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {filteredAllowedEmails.length === 0 && (
                <div className="p-12 text-center text-slate-500">
                  <ShieldCheck size={28} className="mx-auto text-slate-300 mb-2" />
                  <p className="font-bold text-slate-700 text-sm">No hay correos autorizados en este filtro</p>
                  <p className="text-xs text-slate-400 mt-1">Usa el formulario superior para autorizar a tus operadores.</p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};
