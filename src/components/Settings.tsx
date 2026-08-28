import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Settings as SettingsIcon, 
  Plus, 
  Trash2, 
  Save, 
  MessageSquare, 
  Clock, 
  Shield,
  CheckCircle2,
  AlertCircle,
  Loader2,
  AlertTriangle,
  LayoutGrid,
  Box,
  ChevronRight,
  Search,
  Filter,
  Users,
  RefreshCw
} from 'lucide-react';
import { TimePickerModal } from './TimePickerModal';
import { OperationType, handleFirestoreError } from '../utils/firestoreError';
import { useProfile } from '../context/ProfileContext';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  updateDoc,
  getDoc,
  setDoc,
  orderBy,
  serverTimestamp,
  getDocs,
  writeBatch,
  Timestamp
} from 'firebase/firestore';
import { db, auth } from '../firebase';

interface Category {
  id: string;
  name: string;
  ownerUid?: string;
}

interface Equipment {
  id: string;
  name: string;
  categoryId: string;
  category: string;
}

interface AppConfig {
  whatsappProvider?: 'greenapi' | 'custom';
  greenApiInstanceId?: string;
  greenApiToken?: string;
  greenApiChatId?: string;
  whatsappApiUrl?: string;
  whatsappToken?: string;
  whatsappGroupId?: string;
  reportCronTime?: string;
  shiftStartTime?: string;
}

const to12h = (time24: string) => {
  if (!time24) return '';
  let [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, '0')} ${period}`;
};

const Settings: React.FC = () => {
  const { profile } = useProfile();
  const isReadOnly = profile?.is_synced === false;
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [config, setConfig] = useState<AppConfig>({
    whatsappProvider: 'greenapi',
    greenApiInstanceId: '710722721756',
    greenApiToken: '648d092ee3fc4965b6a69e39f5f7d15c2694eb6bc7be48058b',
    greenApiChatId: '120363427690312638@g.us',
    whatsappApiUrl: '',
    whatsappToken: '',
    whatsappGroupId: '',
    reportCronTime: '0 18 * * *', // Default 6 PM
    shiftStartTime: '18:00'
  });
  const [displayTime, setDisplayTime] = useState(to12h(config.shiftStartTime || '18:00'));
  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [isTestingWhatsApp, setIsTestingWhatsApp] = useState(false);
  const [testStatus, setTestStatus] = useState<{ type: 'idle' | 'success' | 'error'; message?: string }>({ type: 'idle' });
  const [availableGroups, setAvailableGroups] = useState<{ id: string; name: string; isGroup: boolean }[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [groupLoadError, setGroupLoadError] = useState<string | null>(null);

  const handleFetchWhatsAppGroups = async () => {
    setIsLoadingGroups(true);
    setGroupLoadError(null);
    try {
      const response = await fetch('/api/green-api/get-chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          greenApiInstanceId: config.greenApiInstanceId,
          greenApiToken: config.greenApiToken
        })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        const groups = (data.chats || []).filter((c: any) => c.isGroup);
        setAvailableGroups(groups);
        if (groups.length === 0) {
          setGroupLoadError('No se encontraron grupos asociados a esta cuenta de WhatsApp.');
        }
      } else {
        setGroupLoadError(data.error || 'Error al obtener los grupos de WhatsApp.');
      }
    } catch (err: any) {
      setGroupLoadError(err.message || 'Error al conectar con Green API.');
    } finally {
      setIsLoadingGroups(false);
    }
  };

  const handleTimeConfirm = (time24: string) => {
    setDisplayTime(to12h(time24));
    setConfig({...config, shiftStartTime: time24});
  };

  useEffect(() => {
    // Listen to categories
    const qCats = query(collection(db, 'categories'), orderBy('name'));
    const unsubscribeCats = onSnapshot(qCats, (snapshot) => {
      const cats = snapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
        ownerUid: doc.data().ownerUid
      })) as Category[];
      setCategories(cats);
    });

    // Listen to config
    const unsubscribeConfig = onSnapshot(doc(db, 'config', 'app_settings'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as AppConfig;
        setConfig({
          ...data,
          whatsappProvider: data.whatsappProvider || 'greenapi',
          greenApiInstanceId: data.greenApiInstanceId || '710722721756',
          greenApiToken: data.greenApiToken || '648d092ee3fc4965b6a69e39f5f7d15c2694eb6bc7be48058b',
          greenApiChatId: data.greenApiChatId || '120363427690312638@g.us'
        });
        setDisplayTime(to12h(data.shiftStartTime || '18:00'));
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'config/app_settings');
    });

    return () => {
      unsubscribeCats();
      unsubscribeConfig();
    };
  }, []);

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly || !newCategoryName.trim() || !auth.currentUser) return;

    try {
      addDoc(collection(db, 'categories'), {
        name: newCategoryName.trim(),
        ownerUid: auth.currentUser.uid,
        order: categories.length
      }).catch(error => {
        console.error('Error adding category:', error);
      });
      setNewCategoryName('');
    } catch (error) {
      console.error('Error adding category:', error);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (isReadOnly) return;
    if (!window.confirm('¿Estás seguro de eliminar esta categoría?')) return;
    try {
      deleteDoc(doc(db, 'categories', id)).catch(error => {
        console.error('Error deleting category:', error);
      });
    } catch (error) {
      console.error('Error deleting category:', error);
    }
  };

  const handleSaveConfig = async () => {
    if (isReadOnly || profile?.role !== 'admin') {
      alert('Solo los administradores pueden modificar la configuración del sistema.');
      return;
    }
    setIsSavingConfig(true);
    setSaveStatus('idle');
    try {
      setDoc(doc(db, 'config', 'app_settings'), config).then(() => {
        setSaveStatus('success');
        setTimeout(() => setSaveStatus('idle'), 3000);
      }).catch(error => {
        console.error('Error saving config:', error);
        handleFirestoreError(error, OperationType.WRITE, 'config/app_settings');
        setSaveStatus('error');
      }).finally(() => {
        setIsSavingConfig(false);
      });
      
      fetch('/api/admin/reload-config', { method: 'POST' }).catch(e => {
        console.warn('Failed to notify server about config change:', e);
      });
    } catch (error) {
      console.error('Error saving config:', error);
      handleFirestoreError(error, OperationType.WRITE, 'config/app_settings');
      setSaveStatus('error');
      setIsSavingConfig(false);
    }
  };

  const handleTestWhatsApp = async () => {
    setIsTestingWhatsApp(true);
    setTestStatus({ type: 'idle' });
    try {
      const response = await fetch('/api/test-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: config.whatsappProvider || 'greenapi',
          greenApiInstanceId: config.greenApiInstanceId,
          greenApiToken: config.greenApiToken,
          greenApiChatId: config.greenApiChatId,
          whatsappApiUrl: config.whatsappApiUrl,
          whatsappToken: config.whatsappToken,
          whatsappGroupId: config.whatsappGroupId
        })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        setTestStatus({ type: 'success', message: '¡Mensaje de prueba enviado con éxito a tu WhatsApp!' });
      } else {
        setTestStatus({ type: 'error', message: data.error || 'No se pudo enviar el mensaje. Verifica las credenciales.' });
      }
    } catch (error: any) {
      setTestStatus({ type: 'error', message: error.message || 'Error de red al probar conexión' });
    } finally {
      setIsTestingWhatsApp(false);
      setTimeout(() => {
        setTestStatus(prev => prev.type === 'success' ? { type: 'idle' } : prev);
      }, 6000);
    }
  };

  const [isResetting, setIsResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetStatus, setResetStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleResetAllData = async () => {
    if (isReadOnly || profile?.role !== 'admin') {
      alert('Solo los administradores pueden realizar esta acción.');
      return;
    }
    
    setIsResetting(true);
    setResetStatus('idle');
    try {
      const batch = writeBatch(db);

      // 1. Fetch all documents in logs and delete them
      const logsSnap = await getDocs(collection(db, 'logs'));
      logsSnap.docs.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });

      // 1.5. Fetch all documents in power_events and delete them
      const powerSnap = await getDocs(collection(db, 'power_events'));
      powerSnap.docs.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });

      // 2. Fetch all equipment and reset totalUsageTime to 0
      const equipSnap = await getDocs(collection(db, 'equipment'));
      const now = Timestamp.now();
      equipSnap.docs.forEach((docSnap) => {
        const eqData = docSnap.data();
        const updateData: any = {
          totalUsageTime: 0,
          lastUpdated: now
        };
        // If equipment is 'on', reset lastTurnedOn to now so it starts counting from 0
        if (eqData.status === 'on') {
          updateData.lastTurnedOn = now;
        }
        batch.update(docSnap.ref, updateData);
      });

      // Commit the batch
      await batch.commit();
      
      setResetStatus('success');
      setShowResetConfirm(false);
      setResetConfirmText('');
      setTimeout(() => setResetStatus('idle'), 5000);
    } catch (error) {
      console.error('Error resetting operation logs:', error);
      try {
        handleFirestoreError(error, OperationType.DELETE, 'logs');
      } catch (e) {}
      setResetStatus('error');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      <header className="flex items-center gap-4 mb-8">
        <div className="p-3 bg-cyan-100 rounded-2xl text-cyan-600">
          <SettingsIcon size={32} />
        </div>
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Configuración</h1>
          <p className="text-slate-500 font-medium">Gestiona las áreas y parámetros del sistema</p>
        </div>
      </header>

      {isReadOnly && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 mb-6">
          <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={20} />
          <div>
            <h3 className="text-sm font-bold text-amber-800">Acceso en modo lectura</h3>
            <p className="text-xs text-amber-700 mt-1">
              Tu perfil no tiene permisos para realizar cambios en esta sección.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Categories Management */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-transparent rounded-[2.5rem] p-8 border border-slate-200/60"
        >
          <div className="flex items-center gap-3 mb-6">
            <LayoutGrid className="text-cyan-600" size={24} />
            <h2 className="text-xl font-bold text-slate-900">Áreas (Campos)</h2>
          </div>

          <form onSubmit={handleAddCategory} className="flex gap-2 mb-6">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              disabled={isReadOnly}
              placeholder="Nueva área..."
              className="flex-1 px-5 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-cyan-500/50 outline-none transition-all text-sm disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isReadOnly || !newCategoryName.trim()}
              className="p-3 bg-cyan-600 text-white rounded-xl hover:bg-cyan-700 transition-all shadow-lg shadow-cyan-500/20 disabled:opacity-50"
            >
              <Plus size={20} />
            </button>
          </form>

          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {categories.map((cat) => (
              <div 
                key={cat.id}
                className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group hover:border-slate-200 transition-all"
              >
                <div className="flex items-center gap-3">
                  <Box size={16} className="text-slate-400" />
                  <span className="text-slate-900 font-bold">{cat.name}</span>
                </div>
                <button
                  onClick={() => handleDeleteCategory(cat.id)}
                  disabled={isReadOnly || (profile?.role !== 'admin' && cat.ownerUid !== auth.currentUser?.uid)}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100 disabled:opacity-50"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
            {categories.length === 0 && (
              <p className="text-center text-slate-400 py-8 font-medium italic">No hay áreas registradas</p>
            )}
          </div>
        </motion.section>

        {/* WhatsApp & Green API Config */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-transparent rounded-[2.5rem] p-8 border border-slate-200/60"
        >
          <div className="flex items-center gap-3 mb-6">
            <MessageSquare className="text-cyan-600" size={24} />
            <div>
              <h2 className="text-xl font-bold text-slate-900">WhatsApp / Green API</h2>
              <p className="text-xs text-slate-500 font-medium">Configura el envío de reportes automáticos</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Provider Selector */}
            <div className="bg-slate-50 p-1.5 rounded-2xl border border-slate-200 flex gap-1">
              <button
                type="button"
                onClick={() => setConfig({...config, whatsappProvider: 'greenapi'})}
                disabled={isReadOnly || profile?.role !== 'admin'}
                className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 ${
                  (config.whatsappProvider || 'greenapi') === 'greenapi'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Green API (Recomendado)</span>
              </button>
              <button
                type="button"
                onClick={() => setConfig({...config, whatsappProvider: 'custom'})}
                disabled={isReadOnly || profile?.role !== 'admin'}
                className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 ${
                  config.whatsappProvider === 'custom'
                    ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/20'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>API Genérica / Whapi</span>
              </button>
            </div>

            {(config.whatsappProvider || 'greenapi') === 'greenapi' ? (
              <>
                <div className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-3.5 text-xs text-emerald-800 flex items-start gap-2">
                  <span className="font-bold">💡 Green API:</span>
                  <span>
                    Obtén tu <strong>IdInstance</strong> y <strong>ApiTokenInstance</strong> en tu consola de Green API (green-api.com).
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">IdInstance (Green API)</label>
                  <input
                    type="text"
                    value={config.greenApiInstanceId || ''}
                    onChange={(e) => setConfig({...config, greenApiInstanceId: e.target.value})}
                    disabled={isReadOnly || profile?.role !== 'admin'}
                    className="w-full px-5 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-emerald-500/50 outline-none transition-all text-sm font-mono disabled:opacity-50"
                    placeholder="Ej: 1101999999"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">ApiTokenInstance (Green API)</label>
                  <input
                    type="password"
                    value={config.greenApiToken || ''}
                    onChange={(e) => setConfig({...config, greenApiToken: e.target.value})}
                    disabled={isReadOnly || profile?.role !== 'admin'}
                    className="w-full px-5 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-emerald-500/50 outline-none transition-all text-sm font-mono disabled:opacity-50"
                    placeholder="••••••••••••••••••••••••••••"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5 ml-1">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">
                      Destino (Número o Grupo WhatsApp)
                    </label>
                    <button
                      type="button"
                      onClick={handleFetchWhatsAppGroups}
                      disabled={isLoadingGroups || isReadOnly || profile?.role !== 'admin'}
                      className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200/60 transition-all disabled:opacity-50"
                    >
                      {isLoadingGroups ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      <span>Buscar grupos automáticamente</span>
                    </button>
                  </div>

                  <input
                    type="text"
                    value={config.greenApiChatId || ''}
                    onChange={(e) => setConfig({...config, greenApiChatId: e.target.value})}
                    disabled={isReadOnly || profile?.role !== 'admin'}
                    className="w-full px-5 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-emerald-500/50 outline-none transition-all text-sm font-mono disabled:opacity-50"
                    placeholder="Ej: 12036302...@g.us o 584121234567"
                  />

                  {/* WhatsApp Groups List Found from Green API */}
                  {availableGroups.length > 0 && (
                    <div className="mt-2 p-3 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-2">
                      <p className="text-[11px] font-bold text-emerald-900 flex items-center gap-1.5">
                        <Users size={14} className="text-emerald-600" />
                        Grupos encontrados en tu WhatsApp (Toca uno para seleccionarlo):
                      </p>
                      <div className="max-h-48 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
                        {availableGroups.map((grp) => {
                          const isSelected = config.greenApiChatId === grp.id;
                          return (
                            <button
                              key={grp.id}
                              type="button"
                              onClick={() => setConfig({ ...config, greenApiChatId: grp.id })}
                              className={`w-full text-left p-2.5 rounded-lg border text-xs flex items-center justify-between transition-all ${
                                isSelected
                                  ? 'bg-emerald-600 text-white border-emerald-600 font-bold shadow-sm'
                                  : 'bg-white text-slate-800 border-slate-200 hover:bg-emerald-50/70 hover:border-emerald-300'
                              }`}
                            >
                              <div className="flex items-center gap-2 overflow-hidden">
                                <Users size={14} className={isSelected ? 'text-white' : 'text-emerald-600'} />
                                <span className="truncate">{grp.name}</span>
                              </div>
                              <span className={`text-[10px] font-mono shrink-0 ml-2 ${isSelected ? 'text-emerald-100' : 'text-slate-400'}`}>
                                {isSelected ? '✓ Seleccionado' : 'Elegir'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {groupLoadError && (
                    <p className="text-[11px] text-amber-600 mt-1 ml-1 flex items-center gap-1">
                      <AlertTriangle size={12} /> {groupLoadError}
                    </p>
                  )}

                  <p className="text-[11px] text-slate-400 mt-1.5 ml-1">
                    Para enviar al grupo de WhatsApp <strong>"Reportes"</strong>, pulsa arriba <em>"Buscar grupos automáticamente"</em> y elígelo con un toque, o escribe su ID que termina en <code>@g.us</code>.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">API URL (Whapi/Evolution)</label>
                  <input
                    type="text"
                    value={config.whatsappApiUrl || ''}
                    onChange={(e) => setConfig({...config, whatsappApiUrl: e.target.value})}
                    disabled={isReadOnly || profile?.role !== 'admin'}
                    className="w-full px-5 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-cyan-500/50 outline-none transition-all text-sm disabled:opacity-50"
                    placeholder="https://api.whapi.cloud/messages/text"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">API Token</label>
                  <input
                    type="password"
                    value={config.whatsappToken || ''}
                    onChange={(e) => setConfig({...config, whatsappToken: e.target.value})}
                    disabled={isReadOnly || profile?.role !== 'admin'}
                    className="w-full px-5 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-cyan-500/50 outline-none transition-all text-sm disabled:opacity-50"
                    placeholder="••••••••••••••••"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">ID del Grupo / Destinatario</label>
                  <input
                    type="text"
                    value={config.whatsappGroupId || ''}
                    onChange={(e) => setConfig({...config, whatsappGroupId: e.target.value})}
                    disabled={isReadOnly || profile?.role !== 'admin'}
                    className="w-full px-5 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-cyan-500/50 outline-none transition-all text-sm disabled:opacity-50"
                    placeholder="1234567890@g.us"
                  />
                </div>
              </>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1 flex items-center gap-2">
                  <Clock size={12} />
                  Cron (UTC)
                </label>
                <input
                  type="text"
                  value={config.reportCronTime}
                  onChange={(e) => setConfig({...config, reportCronTime: e.target.value})}
                  disabled={isReadOnly || profile?.role !== 'admin'}
                  className="w-full px-5 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-cyan-500/50 outline-none transition-all text-sm font-mono disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1 flex items-center gap-2">
                  <Clock size={12} />
                  Inicio Turno
                </label>
                <button
                  type="button"
                  onClick={() => setIsTimePickerOpen(true)}
                  disabled={isReadOnly || profile?.role !== 'admin'}
                  className="w-full px-5 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-left outline-none transition-all text-sm font-mono hover:border-cyan-500/50 disabled:opacity-50"
                >
                  {displayTime || 'Hora'}
                </button>
                <TimePickerModal 
                  isOpen={isTimePickerOpen} 
                  onClose={() => setIsTimePickerOpen(false)}
                  onConfirm={handleTimeConfirm}
                  initialTime={config.shiftStartTime}
                />
              </div>
            </div>

            {testStatus.type !== 'idle' && (
              <div className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
                testStatus.type === 'success' 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}>
                {testStatus.type === 'success' ? <CheckCircle2 size={16} className="shrink-0" /> : <AlertCircle size={16} className="shrink-0" />}
                <span>{testStatus.message}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={handleTestWhatsApp}
                disabled={isTestingWhatsApp || isReadOnly || profile?.role !== 'admin'}
                className="flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-emerald-50 text-emerald-700 font-bold hover:bg-emerald-100 border border-emerald-200/60 transition-all text-sm disabled:opacity-50"
              >
                {isTestingWhatsApp ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <MessageSquare size={18} />
                )}
                <span>Probar Conexión</span>
              </button>

              <button
                type="button"
                onClick={handleSaveConfig}
                disabled={isSavingConfig || isReadOnly || profile?.role !== 'admin'}
                className="flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-cyan-600 text-white font-bold hover:bg-cyan-700 transition-all shadow-md shadow-cyan-500/20 text-sm disabled:opacity-50"
              >
                {isSavingConfig ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : saveStatus === 'success' ? (
                  <>
                    <CheckCircle2 size={18} />
                    <span>Guardado</span>
                  </>
                ) : (
                  <>
                    <Save size={18} />
                    <span>Guardar Config</span>
                  </>
                )}
              </button>
            </div>
            
            <button
              onClick={async () => {
                if ('serviceWorker' in navigator) {
                  const regs = await navigator.serviceWorker.getRegistrations();
                  for(let reg of regs) {
                    await reg.unregister();
                  }
                }
                localStorage.clear();
                window.location.reload();
              }}
              className="w-full mt-2 flex items-center justify-center gap-2 py-3 rounded-xl bg-rose-50 text-rose-600 font-bold hover:bg-rose-100 border border-rose-200/60 text-xs transition-all"
            >
              <Trash2 size={16} />
              <span>Forzar Actualización (Borrar Caché)</span>
            </button>
          </div>
        </motion.section>
      </div>

      {profile?.role === 'admin' && (
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-rose-50/10 rounded-[2.5rem] p-8 border border-rose-200/50 mt-8"
        >
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="text-rose-600 animate-pulse" size={24} />
            <h2 className="text-xl font-bold text-slate-900">Zona de Peligro (Administrador)</h2>
          </div>
          
          <p className="text-slate-500 font-medium text-sm mb-6 max-w-2xl">
            Esta sección contiene herramientas avanzadas para restablecer los datos operativos de la planta. 
            Al realizar esta acción, se borrarán todos los registros históricos de encendidos, apagados, fallas y el tiempo operativo acumulado de todos los equipos volverá a 0.
          </p>

          <div className="bg-white/80 rounded-2xl p-6 border border-slate-200/60 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h3 className="text-base font-bold text-slate-900">Restablecer Historial y Tiempos de Operación</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-lg">
                Se vaciará la colección de registros (logs) y se reiniciará el contador de horas de funcionamiento de cada equipo a cero.
              </p>
            </div>
            
            <button
              onClick={() => setShowResetConfirm(true)}
              className="px-6 py-3.5 bg-rose-600 text-white font-extrabold text-sm rounded-xl hover:bg-rose-700 active:scale-[0.98] transition-all shadow-lg shadow-rose-500/20 whitespace-nowrap"
            >
              Restablecer Datos
            </button>
          </div>

          <AnimatePresence>
            {showResetConfirm && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
              >
                <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200 max-w-md w-full shadow-2xl relative overflow-hidden">
                  <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-6">
                    <AlertTriangle size={24} />
                  </div>
                  
                  <h3 className="text-xl font-black text-slate-900 tracking-tight mb-2">¿Estás absolutamente seguro?</h3>
                  <p className="text-sm text-slate-600 font-medium mb-6 leading-relaxed">
                    Esta acción es irreversible. Se eliminará permanentemente todo el historial de eventos de encendido, apagado, fallas, tiempos manuales y se reiniciará el tiempo operativo acumulado de todos los equipos a cero.
                  </p>

                  <div className="mb-6">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                      Escribe <span className="text-rose-600 font-black select-none">RESTABLECER</span> para continuar:
                    </label>
                    <input
                      type="text"
                      value={resetConfirmText}
                      onChange={(e) => setResetConfirmText(e.target.value)}
                      placeholder="Escribe aquí..."
                      className="w-full px-5 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-rose-500/50 outline-none transition-all text-sm font-bold"
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setShowResetConfirm(false);
                        setResetConfirmText('');
                      }}
                      className="flex-1 py-3.5 bg-slate-100 text-slate-700 font-bold text-sm rounded-xl hover:bg-slate-200 transition-all"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleResetAllData}
                      disabled={isResetting || resetConfirmText.trim().toUpperCase() !== 'RESTABLECER'}
                      className="flex-1 py-3.5 bg-rose-600 text-white font-black text-sm rounded-xl hover:bg-rose-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg shadow-rose-500/10"
                    >
                      {isResetting ? (
                        <Loader2 className="animate-spin" size={18} />
                      ) : (
                        <>
                          <Trash2 size={18} />
                          <span>Confirmar</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {resetStatus === 'success' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center gap-3"
            >
              <CheckCircle2 className="text-emerald-500 shrink-0" size={20} />
              <p className="text-xs font-bold">
                ¡Éxito! Todos los registros han sido borrados y los tiempos operativos se han reiniciado a cero.
              </p>
            </motion.div>
          )}

          {resetStatus === 'error' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl flex items-center gap-3"
            >
              <AlertCircle className="text-rose-500 shrink-0" size={20} />
              <p className="text-xs font-bold">
                Error al restablecer los registros. Por favor, inténtalo de nuevo o contacta al soporte técnico.
              </p>
            </motion.div>
          )}
        </motion.section>
      )}
    </div>
  );
};

export default Settings;
