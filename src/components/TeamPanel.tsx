import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Profile } from '../context/ProfileContext';
import { Shield, ShieldAlert, User, ToggleLeft, ToggleRight, Search, Loader2, Mail, Plus, Trash2, ShieldCheck, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatDistanceToNow, format } from 'date-fns';
import { es } from 'date-fns/locale';

export const TeamPanel: React.FC = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [allowedEmails, setAllowedEmails] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [activeTab, setActiveTab] = useState<'users' | 'whitelist'>('users');
  const [, setTick] = useState(0);

  useEffect(() => {
    // Force re-render every minute to keep the "is online" check fresh
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const qProfiles = query(collection(db, 'profiles'));
    const unsubscribeProfiles = onSnapshot(qProfiles, (snapshot) => {
      const fetchedProfiles: Profile[] = [];
      snapshot.forEach((doc) => {
        fetchedProfiles.push({ id: doc.id, ...doc.data() } as Profile);
      });
      setProfiles(fetchedProfiles);
      setLoading(false);
    });

    const qEmails = query(collection(db, 'allowed_emails'));
    const unsubscribeEmails = onSnapshot(qEmails, (snapshot) => {
      const emails: string[] = [];
      snapshot.forEach((doc) => {
        emails.push(doc.id);
      });
      console.log("Allowed emails fetched:", emails);
      setAllowedEmails(emails);
    });

    return () => {
      unsubscribeProfiles();
      unsubscribeEmails();
    };
  }, []);

  const toggleSyncStatus = async (profileId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'profiles', profileId), {
        is_synced: !currentStatus
      });
    } catch (error) {
      console.error("Error updating sync status:", error);
    }
  };

  const toggleRole = async (profileId: string, currentRole: string) => {
    try {
      await updateDoc(doc(db, 'profiles', profileId), {
        role: currentRole === 'admin' ? 'operator' : 'admin'
      });
    } catch (error) {
      console.error("Error updating role:", error);
    }
  };

  const addAllowedEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail) return;
    const emailLower = newEmail.toLowerCase().trim();
    
    if (emailLower.startsWith('jorgealvarez.lj17@') || emailLower === 'jorgealvarez.lj17') {
      alert("Este correo es de administrador y no necesita ser agregado a la lista de autorizados, ya que tiene acceso total automático.");
      setNewEmail('');
      return;
    }

    try {
      await setDoc(doc(db, 'allowed_emails', emailLower), {
        email: emailLower,
        addedAt: serverTimestamp()
      });
      setNewEmail('');
      alert("Correo agregado exitosamente a la lista de autorizados.");
    } catch (error) {
      console.error("Error adding allowed email:", error);
      alert("Error al agregar el correo: " + (error instanceof Error ? error.message : String(error)));
    }
  };

  const removeAllowedEmail = async (email: string) => {
    console.log("Entering removeAllowedEmail with email:", email);
    // if (!confirm(`¿Estás seguro de que deseas eliminar ${email} de la lista de autorizados?`)) {
    //   console.log("User cancelled deletion");
    //   return;
    // }
    console.log("Attempting to delete email from db:", email);
    try {
      await deleteDoc(doc(db, 'allowed_emails', email));
      alert("Correo eliminado exitosamente.");
      console.log("Delete success");
    } catch (error) {
      console.error("Error removing allowed email:", error);
      alert("Error al eliminar el correo: " + (error instanceof Error ? error.message : String(error)));
    }
  };

  const deleteProfile = async (profileId: string) => {
    if (!confirm(`¿Estás seguro de que deseas eliminar este usuario?`)) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'profiles', profileId));
      alert("Usuario eliminado exitosamente.");
    } catch (error) {
      console.error("Error removing profile:", error);
      alert("Error al eliminar el usuario: " + (error instanceof Error ? error.message : String(error)));
    }
  };

  const filteredProfiles = profiles.filter(p => {
    const emailLower = p.email?.toLowerCase() || '';
    // Exclude admin user and only show allowed users
    if (emailLower.includes('jorgealvarez.lj17') || emailLower.includes('j.alvarez.lj17')) {
      return false; 
    }
    const isAllowed = allowedEmails.includes(emailLower);
    if (!isAllowed) {
        console.log("User not in allowedEmails:", emailLower);
    }
    return isAllowed && (
           p.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
           p.email?.toLowerCase().includes(searchTerm.toLowerCase()));
  });

  const filteredAllowedEmails = allowedEmails;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-20">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Panel de Equipo</h2>
          <p className="text-slate-500 mt-1">Gestiona el acceso y roles de los operadores</p>
        </div>
        <div className="flex p-1 bg-slate-100 rounded-xl">
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${activeTab === 'users' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Usuarios
          </button>
          <button
            onClick={() => setActiveTab('whitelist')}
            className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${activeTab === 'whitelist' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Lista Blanca
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'users' ? (
          <motion.div
            key="users"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Buscar usuario..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all shadow-sm"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredProfiles.map((profile) => (
                <motion.div 
                  key={profile.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col gap-4"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center shrink-0 relative border border-slate-200 overflow-hidden">
                        {profile.photo_url ? (
                          <img
                            src={profile.photo_url}
                            alt={profile.full_name || 'User'}
                            className="w-full h-full object-cover rounded-full"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <User size={24} className="text-slate-400" />
                        )}
                        {(() => {
                          const isActuallyOnline = profile.is_online && profile.last_connection 
                            ? (new Date().getTime() - new Date(profile.last_connection).getTime() < 120000) 
                            : profile.is_online;
                          return (
                            <span className={`absolute bottom-0 right-0 w-3.5 h-3.5 border-2 border-white rounded-full ${isActuallyOnline ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                          );
                        })()}
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 text-lg leading-tight">{profile.full_name}</p>
                        <p className="text-sm text-slate-500 mt-0.5">{profile.email}</p>
                        {(() => {
                          const isActuallyOnline = profile.is_online && profile.last_connection 
                            ? (new Date().getTime() - new Date(profile.last_connection).getTime() < 120000) 
                            : profile.is_online;
                          
                          if (isActuallyOnline) {
                            return (
                              <div className="flex items-center gap-1 mt-1 text-[11px] font-bold text-emerald-500 uppercase tracking-wider">
                                <span>En línea</span>
                              </div>
                            );
                          } else if (profile.last_connection) {
                            return (
                              <div className="flex items-center gap-1 mt-1 text-[11px] font-medium text-slate-400">
                                <Clock size={12} />
                                <span>
                                  Desconectó: {format(new Date(profile.last_connection), "d MMM, HH:mm", { locale: es })} ({formatDistanceToNow(new Date(profile.last_connection), { addSuffix: true, locale: es })})
                                </span>
                              </div>
                            );
                          } else {
                            return (
                              <div className="flex items-center gap-1 mt-1 text-[11px] font-medium text-slate-400">
                                <Clock size={12} />
                                <span>Desconectado (sin registros)</span>
                              </div>
                            );
                          }
                        })()}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                    <button
                      onClick={() => toggleRole(profile.id, profile.role)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                        profile.role === 'admin' 
                          ? 'bg-purple-100 text-purple-700 hover:bg-purple-200' 
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {profile.role === 'admin' ? <Shield size={14} /> : <User size={14} />}
                      {profile.role === 'admin' ? 'Administrador' : 'Operador'}
                    </button>

                    <button
                      onClick={() => toggleSyncStatus(profile.id, profile.is_synced)}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        profile.is_synced 
                          ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' 
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {profile.is_synced ? (
                        <>
                          <ToggleRight size={16} />
                          <span>Vinculado</span>
                        </>
                      ) : (
                        <>
                          <ToggleLeft size={16} />
                          <span>Desvinculado</span>
                        </>
                      )}
                    </button>
                  </div>
                </motion.div>
              ))}
              {filteredProfiles.length === 0 && (
                <div className="col-span-full bg-white p-12 rounded-[2rem] border border-slate-200 text-center flex flex-col items-center justify-center">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                    <Search className="text-slate-300" size={24} />
                  </div>
                  <p className="text-slate-500 font-medium">No se encontraron usuarios</p>
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="whitelist"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <ShieldCheck className="text-cyan-600" />
                Agregar Correo Autorizado
              </h3>
              <form onSubmit={addAllowedEmail} className="flex gap-3">
                <div className="relative flex-1">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="email"
                    required
                    placeholder="correo@ejemplo.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all"
                  />
                </div>
                <button
                  type="submit"
                  className="px-6 py-3 bg-cyan-600 text-white font-bold rounded-2xl hover:bg-cyan-700 transition-all flex items-center gap-2 shadow-lg shadow-cyan-600/20"
                >
                  <Plus size={20} />
                  <span>Agregar</span>
                </button>
              </form>
              <p className="mt-4 text-sm text-slate-500">
                Solo los correos en esta lista podrán crear una cuenta en el sistema.
              </p>
            </div>

            <div className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                <h3 className="font-bold text-slate-900">Correos Autorizados ({filteredAllowedEmails.length})</h3>
              </div>
              <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
                {filteredAllowedEmails.map((email) => (
                  <div key={email} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-cyan-50 flex items-center justify-center text-cyan-600">
                        <Mail size={16} />
                      </div>
                      <span className="font-medium text-slate-700">{email}</span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeAllowedEmail(email); }}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                      title="Eliminar de la lista"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
                {filteredAllowedEmails.length === 0 && (
                  <div className="px-6 py-12 text-center text-slate-500">
                    No hay correos autorizados. Agrega uno arriba.
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
