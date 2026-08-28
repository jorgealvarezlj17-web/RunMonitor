import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Settings as SettingsIcon, 
  Plus, 
  Trash2, 
  Save, 
  MessageSquare, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  AlertTriangle, 
  LayoutGrid, 
  Box, 
  RefreshCw, 
  Users, 
  ShieldAlert, 
  Sliders, 
  HelpCircle,
  Sparkles,
  CalendarRange,
  Zap,
  Radio
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
  setDoc, 
  orderBy, 
  getDocs, 
  writeBatch, 
  Timestamp 
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { sounds } from '../utils/sounds';

interface Category {
  id: string;
  name: string;
  ownerUid?: string;
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
  shiftEndTime?: string;
  shiftRangeMode?: 'scheduled' | 'until_now';
}

const to12h = (time24: string) => {
  if (!time24) return '';
  let [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, '0')} ${period}`;
};

type SettingsTab = 'schedule' | 'whatsapp' | 'categories' | 'system';

export const Settings: React.FC = () => {
  const { profile } = useProfile();
  const isReadOnly = profile?.is_synced === false;
  const isAdmin = profile?.role === 'admin';

  const [activeTab, setActiveTab] = useState<SettingsTab>('schedule');
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
    shiftStartTime: '18:00',
    shiftEndTime: '18:00',
    shiftRangeMode: 'scheduled'
  });

  // Time picker state
  const [timePickerTarget, setTimePickerTarget] = useState<'start' | 'end' | null>(null);

  // Statuses
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [isTestingWhatsApp, setIsTestingWhatsApp] = useState(false);
  const [testStatus, setTestStatus] = useState<{ type: 'idle' | 'success' | 'error'; message?: string }>({ type: 'idle' });
  const [availableGroups, setAvailableGroups] = useState<{ id: string; name: string; isGroup: boolean }[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [groupLoadError, setGroupLoadError] = useState<string | null>(null);

  // Reset zone state
  const [isResetting, setIsResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetStatus, setResetStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Listen to categories and config in Firestore
  useEffect(() => {
    const qCats = query(collection(db, 'categories'), orderBy('name'));
    const unsubscribeCats = onSnapshot(qCats, (snapshot) => {
      const cats = snapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
        ownerUid: doc.data().ownerUid
      })) as Category[];
      setCategories(cats);
    });

    const unsubscribeConfig = onSnapshot(doc(db, 'config', 'app_settings'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as AppConfig;
        setConfig(prev => ({
          ...prev,
          ...data,
          whatsappProvider: data.whatsappProvider || 'greenapi',
          greenApiInstanceId: data.greenApiInstanceId || '710722721756',
          greenApiToken: data.greenApiToken || '648d092ee3fc4965b6a69e39f5f7d15c2694eb6bc7be48058b',
          greenApiChatId: data.greenApiChatId || '120363427690312638@g.us',
          shiftStartTime: data.shiftStartTime || '18:00',
          shiftEndTime: data.shiftEndTime || '18:00',
          shiftRangeMode: data.shiftRangeMode || 'scheduled'
        }));
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'config/app_settings');
    });

    return () => {
      unsubscribeCats();
      unsubscribeConfig();
    };
  }, []);

  const handleTimeConfirm = (time24: string) => {
    sounds.playClick();
    if (timePickerTarget === 'start') {
      setConfig(prev => ({ ...prev, shiftStartTime: time24 }));
    } else if (timePickerTarget === 'end') {
      setConfig(prev => ({ ...prev, shiftEndTime: time24 }));
    }
    setTimePickerTarget(null);
  };

  const handleSaveConfig = async () => {
    if (isReadOnly || !isAdmin) {
      alert('Solo los administradores pueden modificar la configuración del sistema.');
      return;
    }
    setIsSavingConfig(true);
    setSaveStatus('idle');
    try {
      await setDoc(doc(db, 'config', 'app_settings'), config, { merge: true });
      sounds.playSuccess();
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3500);
      
      fetch('/api/admin/reload-config', { method: 'POST' }).catch(e => {
        console.warn('Failed to notify server about config change:', e);
      });
    } catch (error) {
      console.error('Error saving config:', error);
      handleFirestoreError(error, OperationType.WRITE, 'config/app_settings');
      setSaveStatus('error');
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleFetchWhatsAppGroups = async () => {
    sounds.playClick();
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

  const handleTestWhatsApp = async () => {
    sounds.playClick();
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
        sounds.playSuccess();
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

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly || !newCategoryName.trim() || !auth.currentUser) return;
    sounds.playClick();
    try {
      await addDoc(collection(db, 'categories'), {
        name: newCategoryName.trim(),
        ownerUid: auth.currentUser.uid,
        order: categories.length
      });
      sounds.playSuccess();
      setNewCategoryName('');
    } catch (error) {
      console.error('Error adding category:', error);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (isReadOnly) return;
    if (!window.confirm('¿Estás seguro de eliminar esta área?')) return;
    sounds.playClick();
    try {
      await deleteDoc(doc(db, 'categories', id));
      sounds.playPowerOff();
    } catch (error) {
      console.error('Error deleting category:', error);
    }
  };

  const handleResetAllData = async () => {
    if (isReadOnly || !isAdmin) {
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
        if (eqData.status === 'on') {
          updateData.lastTurnedOn = now;
        }
        batch.update(docSnap.ref, updateData);
      });

      await batch.commit();
      sounds.playSuccess();
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

  // Human readable description of the scheduled cycle
  const getCycleSummaryText = () => {
    const startStr = to12h(config.shiftStartTime || '18:00');
    const endStr = to12h(config.shiftEndTime || '18:00');
    const isUntilNow = config.shiftRangeMode === 'until_now';

    if (isUntilNow) {
      return `Toma todos los registros desde las ${startStr} (del día anterior) hasta el instante exacto en que generas el reporte.`;
    }

    if (config.shiftStartTime === config.shiftEndTime) {
      return `Ciclo completo de 24 horas: recopila registros desde las ${startStr} del día anterior hasta las ${endStr} del día actual.`;
    }

    return `Ventana fija programada: recopila datos desde las ${startStr} hasta las ${endStr}.`;
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-24">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-cyan-600/10 text-cyan-600 rounded-2xl border border-cyan-500/20 shadow-xs">
            <SettingsIcon size={28} />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Configuración del Sistema</h1>
            <p className="text-xs sm:text-sm text-slate-500 font-medium">Administra horarios de corte, integraciones y áreas de la planta</p>
          </div>
        </div>

        {/* Global Save Button if Admin */}
        {isAdmin && !isReadOnly && (
          <button
            type="button"
            onClick={handleSaveConfig}
            disabled={isSavingConfig}
            className="flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-cyan-600 text-white font-bold hover:bg-cyan-700 active:scale-95 transition-all shadow-md shadow-cyan-600/20 text-sm disabled:opacity-50 self-start sm:self-auto"
          >
            {isSavingConfig ? (
              <Loader2 className="animate-spin" size={18} />
            ) : saveStatus === 'success' ? (
              <>
                <CheckCircle2 size={18} />
                <span>¡Guardado!</span>
              </>
            ) : (
              <>
                <Save size={18} />
                <span>Guardar Cambios</span>
              </>
            )}
          </button>
        )}
      </header>

      {/* Read-only warning */}
      {isReadOnly && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={20} />
          <div>
            <h3 className="text-sm font-bold text-amber-800">Acceso en modo lectura</h3>
            <p className="text-xs text-amber-700 mt-1">
              Tu perfil actual no posee permisos de administrador para realizar modificaciones.
            </p>
          </div>
        </div>
      )}

      {/* Notification Toast for Save */}
      {saveStatus === 'success' && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center gap-2.5 text-xs font-bold"
        >
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
          <span>Configuración guardada y sincronizada correctamente en todo el sistema.</span>
        </motion.div>
      )}

      {saveStatus === 'error' && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl flex items-center gap-2.5 text-xs font-bold"
        >
          <AlertCircle size={18} className="text-rose-600 shrink-0" />
          <span>Ocurrió un error al guardar la configuración. Revisa tus permisos de conexión.</span>
        </motion.div>
      )}

      {/* Modern Segmented Navigation Tabs */}
      <div className="bg-slate-100/90 p-1.5 rounded-2xl border border-slate-200/80 grid grid-cols-2 md:grid-cols-4 gap-1.5 shadow-xs">
        <button
          type="button"
          onClick={() => {
            sounds.playClick();
            setActiveTab('schedule');
          }}
          className={`py-3 px-3 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-2 ${
            activeTab === 'schedule'
              ? 'bg-white text-cyan-700 shadow-sm border border-slate-200/60'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Clock size={16} className={activeTab === 'schedule' ? 'text-cyan-600' : 'text-slate-400'} />
          <span>Horarios de Corte</span>
        </button>

        <button
          type="button"
          onClick={() => {
            sounds.playClick();
            setActiveTab('whatsapp');
          }}
          className={`py-3 px-3 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-2 ${
            activeTab === 'whatsapp'
              ? 'bg-white text-emerald-700 shadow-sm border border-slate-200/60'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <MessageSquare size={16} className={activeTab === 'whatsapp' ? 'text-emerald-600' : 'text-slate-400'} />
          <span>WhatsApp & Green API</span>
        </button>

        <button
          type="button"
          onClick={() => {
            sounds.playClick();
            setActiveTab('categories');
          }}
          className={`py-3 px-3 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-2 ${
            activeTab === 'categories'
              ? 'bg-white text-slate-900 shadow-sm border border-slate-200/60'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <LayoutGrid size={16} className={activeTab === 'categories' ? 'text-cyan-600' : 'text-slate-400'} />
          <span>Áreas de Planta</span>
        </button>

        <button
          type="button"
          onClick={() => {
            sounds.playClick();
            setActiveTab('system');
          }}
          className={`py-3 px-3 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-2 ${
            activeTab === 'system'
              ? 'bg-white text-rose-700 shadow-sm border border-slate-200/60'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <ShieldAlert size={16} className={activeTab === 'system' ? 'text-rose-600' : 'text-slate-400'} />
          <span>Sistema & Peligro</span>
        </button>
      </div>

      {/* TAB CONTENT CONTAINER */}
      <AnimatePresence mode="wait">
        {/* =================================================================== */}
        {/* TAB 1: HORARIOS Y PROGRAMACIÓN DE CORTE                            */}
        {/* =================================================================== */}
        {activeTab === 'schedule' && (
          <motion.div
            key="tab-schedule"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="space-y-6"
          >
            {/* Card 1: Rango de Horario de Toma de Información */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-cyan-50 text-cyan-600 rounded-2xl border border-cyan-200/60">
                    <CalendarRange size={22} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Ventana de Información para el Corte de Turno</h2>
                    <p className="text-xs text-slate-500 font-medium">Programa la hora exacta de inicio y fin en la que se recopilarán los datos operativos</p>
                  </div>
                </div>
                <span className="hidden sm:inline-flex px-3 py-1 bg-cyan-50 text-cyan-700 text-[11px] font-extrabold rounded-full border border-cyan-200/60">
                  Corte Diario
                </span>
              </div>

              {/* Mode Selector: Ventana Programada vs Hasta la hora actual */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Modo de Toma de Datos
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      sounds.playClick();
                      setConfig({ ...config, shiftRangeMode: 'scheduled' });
                    }}
                    disabled={isReadOnly || !isAdmin}
                    className={`p-3.5 rounded-xl border text-left flex items-start gap-3 transition-all ${
                      (config.shiftRangeMode || 'scheduled') === 'scheduled'
                        ? 'bg-white border-cyan-500 ring-2 ring-cyan-500/20 shadow-sm'
                        : 'bg-slate-100/70 border-slate-200 text-slate-600 hover:bg-white'
                    }`}
                  >
                    <div className={`p-2 rounded-lg mt-0.5 ${
                      (config.shiftRangeMode || 'scheduled') === 'scheduled' ? 'bg-cyan-500 text-white' : 'bg-slate-200 text-slate-500'
                    }`}>
                      <Clock size={16} />
                    </div>
                    <div>
                      <div className="text-xs font-extrabold text-slate-900">Horario Fijo Programado</div>
                      <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                        Usa las horas exactas de Inicio y Fin configuradas abajo (ej: 06:00 PM a 06:00 PM).
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      sounds.playClick();
                      setConfig({ ...config, shiftRangeMode: 'until_now' });
                    }}
                    disabled={isReadOnly || !isAdmin}
                    className={`p-3.5 rounded-xl border text-left flex items-start gap-3 transition-all ${
                      config.shiftRangeMode === 'until_now'
                        ? 'bg-white border-cyan-500 ring-2 ring-cyan-500/20 shadow-sm'
                        : 'bg-slate-100/70 border-slate-200 text-slate-600 hover:bg-white'
                    }`}
                  >
                    <div className={`p-2 rounded-lg mt-0.5 ${
                      config.shiftRangeMode === 'until_now' ? 'bg-cyan-500 text-white' : 'bg-slate-200 text-slate-500'
                    }`}>
                      <Zap size={16} />
                    </div>
                    <div>
                      <div className="text-xs font-extrabold text-slate-900">Hasta la Hora Actual (En Vivo)</div>
                      <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                        Desde la Hora de Inicio hasta el minuto en que se pulsa "Generar Reporte".
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Start & End Time Pickers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Start Time */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock size={14} className="text-cyan-600" />
                      Hora de Inicio del Corte
                    </label>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Inicio</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      sounds.playClick();
                      setTimePickerTarget('start');
                    }}
                    disabled={isReadOnly || !isAdmin}
                    className="w-full px-4 py-3 bg-white border border-slate-200 hover:border-cyan-500 rounded-xl text-slate-900 font-mono font-black text-lg flex items-center justify-between shadow-xs transition-all disabled:opacity-50"
                  >
                    <span>{to12h(config.shiftStartTime || '18:00')}</span>
                    <span className="text-xs font-sans font-bold text-cyan-600 bg-cyan-50 px-2.5 py-1 rounded-lg border border-cyan-200/60">
                      {config.shiftStartTime || '18:00'}
                    </span>
                  </button>
                  <p className="text-[11px] text-slate-500">
                    Hora desde la cual el sistema comienza a contabilizar eventos y horas de servicio.
                  </p>
                </div>

                {/* End Time */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock size={14} className="text-teal-600" />
                      Hora de Fin del Corte
                    </label>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Cierre</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      sounds.playClick();
                      setTimePickerTarget('end');
                    }}
                    disabled={isReadOnly || !isAdmin || config.shiftRangeMode === 'until_now'}
                    className={`w-full px-4 py-3 bg-white border rounded-xl font-mono font-black text-lg flex items-center justify-between shadow-xs transition-all disabled:opacity-50 ${
                      config.shiftRangeMode === 'until_now'
                        ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                        : 'border-slate-200 hover:border-teal-500 text-slate-900'
                    }`}
                  >
                    <span>
                      {config.shiftRangeMode === 'until_now' 
                        ? 'Hora Actual (En vivo)' 
                        : to12h(config.shiftEndTime || '18:00')}
                    </span>
                    <span className={`text-xs font-sans font-bold px-2.5 py-1 rounded-lg border ${
                      config.shiftRangeMode === 'until_now'
                        ? 'bg-slate-200 text-slate-500 border-slate-300'
                        : 'text-teal-700 bg-teal-50 border-teal-200/60'
                    }`}>
                      {config.shiftRangeMode === 'until_now' ? 'Tiempo Real' : (config.shiftEndTime || '18:00')}
                    </span>
                  </button>
                  <p className="text-[11px] text-slate-500">
                    Hora límite donde concluye el ciclo de evaluación para este turno.
                  </p>
                </div>
              </div>

              {/* Explanatory Visual Card */}
              <div className="bg-linear-to-r from-cyan-50/80 to-teal-50/80 p-4 rounded-2xl border border-cyan-200/60 flex items-start gap-3">
                <Sparkles size={20} className="text-cyan-600 shrink-0 mt-0.5" />
                <div className="text-xs text-slate-700 leading-relaxed">
                  <span className="font-extrabold text-cyan-900">Resumen del Rango Programado: </span>
                  {getCycleSummaryText()}
                </div>
              </div>
            </div>

            {/* Card 2: Envío Automático / Cron UTC */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-slate-100 text-slate-700 rounded-2xl border border-slate-200/60">
                  <Radio size={22} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Programación Automática (Servidor Cron)</h2>
                  <p className="text-xs text-slate-500 font-medium">Hora a la que el servidor enviará el reporte automático si está habilitado</p>
                </div>
              </div>

              <div className="space-y-3">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Expresión Cron (Horario UTC)
                </label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    value={config.reportCronTime || '0 18 * * *'}
                    onChange={(e) => setConfig({ ...config, reportCronTime: e.target.value })}
                    disabled={isReadOnly || !isAdmin}
                    className="flex-1 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-mono text-sm focus:ring-2 focus:ring-cyan-500/50 outline-none transition-all disabled:opacity-50"
                    placeholder="0 18 * * *"
                  />
                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        sounds.playClick();
                        setConfig({ ...config, reportCronTime: '0 22 * * *' });
                      }}
                      disabled={isReadOnly || !isAdmin}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all"
                    >
                      06:00 PM VET (22:00 UTC)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        sounds.playClick();
                        setConfig({ ...config, reportCronTime: '0 10 * * *' });
                      }}
                      disabled={isReadOnly || !isAdmin}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all"
                    >
                      06:00 AM VET (10:00 UTC)
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400">
                  Formato estándar: <code>minuto hora día_mes mes día_semana</code> (Hora del servidor en UTC).
                </p>
              </div>
            </div>

            {/* Save Button for Schedule Tab */}
            {isAdmin && !isReadOnly && (
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  disabled={isSavingConfig}
                  className="w-full sm:w-auto px-8 py-3.5 bg-cyan-600 hover:bg-cyan-700 text-white font-black text-sm rounded-xl transition-all shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2"
                >
                  {isSavingConfig ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                  <span>Guardar Horarios de Corte</span>
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* =================================================================== */}
        {/* TAB 2: WHATSAPP & GREEN API INTEGRATION                             */}
        {/* =================================================================== */}
        {activeTab === 'whatsapp' && (
          <motion.div
            key="tab-whatsapp"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="space-y-6"
          >
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs space-y-6">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-200/60">
                    <MessageSquare size={22} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Integración de WhatsApp (Green API / Webhook)</h2>
                    <p className="text-xs text-slate-500 font-medium">Conexión directa para el envío de reportes y notificaciones</p>
                  </div>
                </div>
              </div>

              {/* Provider Selector */}
              <div className="bg-slate-100 p-1.5 rounded-2xl border border-slate-200 grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    sounds.playClick();
                    setConfig({ ...config, whatsappProvider: 'greenapi' });
                  }}
                  disabled={isReadOnly || !isAdmin}
                  className={`py-3 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 ${
                    (config.whatsappProvider || 'greenapi') === 'greenapi'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>Green API (Recomendado)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sounds.playClick();
                    setConfig({ ...config, whatsappProvider: 'custom' });
                  }}
                  disabled={isReadOnly || !isAdmin}
                  className={`py-3 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 ${
                    config.whatsappProvider === 'custom'
                      ? 'bg-cyan-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>API Genérica / Whapi</span>
                </button>
              </div>

              {(config.whatsappProvider || 'greenapi') === 'greenapi' ? (
                <div className="space-y-4">
                  <div className="bg-emerald-50/70 border border-emerald-200/70 rounded-2xl p-4 text-xs text-emerald-900 flex items-start gap-2.5">
                    <span className="text-emerald-700 font-black">💡</span>
                    <span>
                      Ingresa tu <strong>IdInstance</strong> y <strong>ApiTokenInstance</strong> de tu consola de Green API (green-api.com) para enviar mensajes al instante.
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                        IdInstance (Green API)
                      </label>
                      <input
                        type="text"
                        value={config.greenApiInstanceId || ''}
                        onChange={(e) => setConfig({ ...config, greenApiInstanceId: e.target.value })}
                        disabled={isReadOnly || !isAdmin}
                        className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-mono text-sm focus:ring-2 focus:ring-emerald-500/50 outline-none transition-all disabled:opacity-50"
                        placeholder="Ej: 710722721756"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                        ApiTokenInstance (Green API)
                      </label>
                      <input
                        type="password"
                        value={config.greenApiToken || ''}
                        onChange={(e) => setConfig({ ...config, greenApiToken: e.target.value })}
                        disabled={isReadOnly || !isAdmin}
                        className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-mono text-sm focus:ring-2 focus:ring-emerald-500/50 outline-none transition-all disabled:opacity-50"
                        placeholder="••••••••••••••••••••••••••••"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-1.5">
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                        Destino (ID del Grupo o Teléfono)
                      </label>
                      <button
                        type="button"
                        onClick={handleFetchWhatsAppGroups}
                        disabled={isLoadingGroups || isReadOnly || !isAdmin}
                        className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1.5 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 transition-all disabled:opacity-50 self-start sm:self-auto"
                      >
                        {isLoadingGroups ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                        <span>Buscar grupos en WhatsApp</span>
                      </button>
                    </div>

                    <input
                      type="text"
                      value={config.greenApiChatId || ''}
                      onChange={(e) => setConfig({ ...config, greenApiChatId: e.target.value })}
                      disabled={isReadOnly || !isAdmin}
                      className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-mono text-sm focus:ring-2 focus:ring-emerald-500/50 outline-none transition-all disabled:opacity-50"
                      placeholder="Ej: 120363427690312638@g.us"
                    />

                    {/* WhatsApp Groups List Found from Green API */}
                    {availableGroups.length > 0 && (
                      <div className="mt-3 p-4 bg-emerald-50/50 border border-emerald-200 rounded-2xl space-y-2.5">
                        <p className="text-xs font-bold text-emerald-950 flex items-center gap-2">
                          <Users size={15} className="text-emerald-600" />
                          Grupos encontrados (Toca para seleccionar):
                        </p>
                        <div className="max-h-48 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
                          {availableGroups.map((grp) => {
                            const isSelected = config.greenApiChatId === grp.id;
                            return (
                              <button
                                key={grp.id}
                                type="button"
                                onClick={() => {
                                  sounds.playClick();
                                  setConfig({ ...config, greenApiChatId: grp.id });
                                }}
                                className={`w-full text-left p-2.5 rounded-xl border text-xs flex items-center justify-between transition-all ${
                                  isSelected
                                    ? 'bg-emerald-600 text-white border-emerald-600 font-bold shadow-sm'
                                    : 'bg-white text-slate-800 border-slate-200 hover:bg-emerald-50 hover:border-emerald-300'
                                }`}
                              >
                                <div className="flex items-center gap-2 truncate">
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
                      <p className="text-xs text-amber-700 mt-1.5 flex items-center gap-1">
                        <AlertTriangle size={13} /> {groupLoadError}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                      URL del Webhook / API
                    </label>
                    <input
                      type="text"
                      value={config.whatsappApiUrl || ''}
                      onChange={(e) => setConfig({ ...config, whatsappApiUrl: e.target.value })}
                      disabled={isReadOnly || !isAdmin}
                      className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm focus:ring-2 focus:ring-cyan-500/50 outline-none transition-all disabled:opacity-50"
                      placeholder="https://api.whapi.cloud/messages/text"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                      API Token / Bearer Key
                    </label>
                    <input
                      type="password"
                      value={config.whatsappToken || ''}
                      onChange={(e) => setConfig({ ...config, whatsappToken: e.target.value })}
                      disabled={isReadOnly || !isAdmin}
                      className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm focus:ring-2 focus:ring-cyan-500/50 outline-none transition-all disabled:opacity-50"
                      placeholder="••••••••••••••••"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                      ID del Destinatario / Grupo
                    </label>
                    <input
                      type="text"
                      value={config.whatsappGroupId || ''}
                      onChange={(e) => setConfig({ ...config, whatsappGroupId: e.target.value })}
                      disabled={isReadOnly || !isAdmin}
                      className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm focus:ring-2 focus:ring-cyan-500/50 outline-none transition-all disabled:opacity-50"
                      placeholder="12036302...@g.us"
                    />
                  </div>
                </div>
              )}

              {/* Status indicator */}
              {testStatus.type !== 'idle' && (
                <div className={`p-4 rounded-2xl border text-xs flex items-center gap-2.5 ${
                  testStatus.type === 'success' 
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900 font-bold' 
                    : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}>
                  {testStatus.type === 'success' ? <CheckCircle2 size={18} className="shrink-0 text-emerald-600" /> : <AlertCircle size={18} className="shrink-0 text-rose-600" />}
                  <span>{testStatus.message}</span>
                </div>
              )}

              {/* Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleTestWhatsApp}
                  disabled={isTestingWhatsApp || isReadOnly || !isAdmin}
                  className="flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-emerald-50 text-emerald-800 font-extrabold hover:bg-emerald-100 border border-emerald-200 transition-all text-sm disabled:opacity-50"
                >
                  {isTestingWhatsApp ? <Loader2 className="animate-spin" size={18} /> : <MessageSquare size={18} />}
                  <span>Probar Conexión WhatsApp</span>
                </button>

                {isAdmin && !isReadOnly && (
                  <button
                    type="button"
                    onClick={handleSaveConfig}
                    disabled={isSavingConfig}
                    className="flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-cyan-600 text-white font-extrabold hover:bg-cyan-700 transition-all shadow-md shadow-cyan-500/20 text-sm disabled:opacity-50"
                  >
                    {isSavingConfig ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                    <span>Guardar Configuración</span>
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* =================================================================== */}
        {/* TAB 3: ÁREAS Y CAMPOS DE PLANTA                                     */}
        {/* =================================================================== */}
        {activeTab === 'categories' && (
          <motion.div
            key="tab-categories"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="space-y-6"
          >
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-cyan-50 text-cyan-600 rounded-2xl border border-cyan-200/60">
                  <LayoutGrid size={22} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Áreas y Campos Operativos</h2>
                  <p className="text-xs text-slate-500 font-medium">Categorías para organizar y agrupar los equipos de la planta</p>
                </div>
              </div>

              <form onSubmit={handleAddCategory} className="flex gap-2">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  disabled={isReadOnly}
                  placeholder="Nombre de la nueva área (ej. Bombeo, Generadores...)"
                  className="flex-1 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm focus:ring-2 focus:ring-cyan-500/50 outline-none transition-all disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={isReadOnly || !newCategoryName.trim()}
                  className="px-5 py-3 bg-cyan-600 text-white font-bold rounded-xl hover:bg-cyan-700 transition-all shadow-md shadow-cyan-500/20 disabled:opacity-50 flex items-center gap-2 text-sm"
                >
                  <Plus size={18} />
                  <span className="hidden sm:inline">Agregar</span>
                </button>
              </form>

              <div className="space-y-2 max-h-[450px] overflow-y-auto pr-1 custom-scrollbar">
                {categories.map((cat) => (
                  <div 
                    key={cat.id}
                    className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200/80 hover:border-cyan-300 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <Box size={18} className="text-cyan-600" />
                      <span className="text-slate-900 font-bold text-sm">{cat.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(cat.id)}
                      disabled={isReadOnly || (!isAdmin && cat.ownerUid !== auth.currentUser?.uid)}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all disabled:opacity-50"
                      title="Eliminar Área"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                {categories.length === 0 && (
                  <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400 text-xs italic">
                    No hay áreas registradas. Agrega una arriba.
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* =================================================================== */}
        {/* TAB 4: MANTENIMIENTO, CACHÉ Y ZONA DE PELIGRO                       */}
        {/* =================================================================== */}
        {activeTab === 'system' && (
          <motion.div
            key="tab-system"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="space-y-6"
          >
            {/* Maintenance card */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-slate-100 text-slate-700 rounded-2xl border border-slate-200/60">
                  <Sliders size={22} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Mantenimiento de la Aplicación</h2>
                  <p className="text-xs text-slate-500 font-medium">Acciones para limpiar datos temporales del navegador y actualizar</p>
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-bold text-slate-900">Limpieza de Caché Local</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Fuerza la descarga de la última versión de la aplicación y borra Service Workers guardados en tu dispositivo.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    sounds.playClick();
                    if ('serviceWorker' in navigator) {
                      const regs = await navigator.serviceWorker.getRegistrations();
                      for (let reg of regs) {
                        await reg.unregister();
                      }
                    }
                    localStorage.clear();
                    window.location.reload();
                  }}
                  className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-xs transition-all whitespace-nowrap self-start sm:self-auto"
                >
                  Borrar Caché y Recargar
                </button>
              </div>
            </div>

            {/* Danger Zone (Admin Only) */}
            {isAdmin && (
              <div className="bg-rose-50/40 rounded-3xl p-6 sm:p-8 border border-rose-200/70 shadow-xs space-y-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-rose-100 text-rose-600 rounded-2xl border border-rose-200">
                    <ShieldAlert size={22} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-rose-950">Zona de Peligro (Administrador)</h2>
                    <p className="text-xs text-rose-700 font-medium">Herramientas críticas para el restablecimiento general de datos de planta</p>
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-5 border border-rose-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-xs font-extrabold text-slate-900">Restablecer Historial y Tiempos de Operación</h3>
                    <p className="text-[11px] text-slate-500 mt-1 max-w-xl">
                      Vacía todos los registros de encendido/apagado, fallas eléctricas y reinicia el contador de horas de funcionamiento de los equipos a cero.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      sounds.playClick();
                      setShowResetConfirm(true);
                    }}
                    className="px-5 py-3 bg-rose-600 text-white font-extrabold text-xs rounded-xl hover:bg-rose-700 active:scale-95 transition-all shadow-md shadow-rose-600/20 whitespace-nowrap self-start md:self-auto"
                  >
                    Restablecer Datos
                  </button>
                </div>

                {/* Reset confirmation modal */}
                <AnimatePresence>
                  {showResetConfirm && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
                    >
                      <motion.div
                        initial={{ scale: 0.95, y: 15 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.95, y: 15 }}
                        className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 max-w-md w-full shadow-2xl space-y-5"
                      >
                        <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center">
                          <AlertTriangle size={24} />
                        </div>
                        
                        <div>
                          <h3 className="text-lg font-black text-slate-900 tracking-tight">¿Estás absolutamente seguro?</h3>
                          <p className="text-xs text-slate-600 font-medium mt-2 leading-relaxed">
                            Esta acción eliminará de forma irreversible el historial de encendidos, apagados, fallas y reiniciará el tiempo operativo de todos los equipos a cero.
                          </p>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                            Escribe <span className="text-rose-600 font-black select-none">RESTABLECER</span> para continuar:
                          </label>
                          <input
                            type="text"
                            value={resetConfirmText}
                            onChange={(e) => setResetConfirmText(e.target.value)}
                            placeholder="Escribe aquí..."
                            className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-rose-500/50 outline-none text-xs font-bold"
                          />
                        </div>

                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              sounds.playClick();
                              setShowResetConfirm(false);
                              setResetConfirmText('');
                            }}
                            className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-200 transition-all"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={handleResetAllData}
                            disabled={isResetting || resetConfirmText.trim().toUpperCase() !== 'RESTABLECER'}
                            className="flex-1 py-3 bg-rose-600 text-white font-black text-xs rounded-xl hover:bg-rose-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-md shadow-rose-600/20"
                          >
                            {isResetting ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                            <span>Confirmar</span>
                          </button>
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {resetStatus === 'success' && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl flex items-center gap-3 text-xs font-bold"
                  >
                    <CheckCircle2 className="text-emerald-600 shrink-0" size={18} />
                    <span>¡Éxito! Todos los registros han sido borrados y los tiempos operativos se han reiniciado a cero.</span>
                  </motion.div>
                )}

                {resetStatus === 'error' && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-rose-50 border border-rose-200 text-rose-900 rounded-2xl flex items-center gap-3 text-xs font-bold"
                  >
                    <AlertCircle className="text-rose-600 shrink-0" size={18} />
                    <span>Error al restablecer los registros. Revisa los permisos de conexión.</span>
                  </motion.div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Time Picker Modal */}
      <TimePickerModal
        isOpen={timePickerTarget !== null}
        onClose={() => setTimePickerTarget(null)}
        onConfirm={handleTimeConfirm}
        initialTime={timePickerTarget === 'start' ? (config.shiftStartTime || '18:00') : (config.shiftEndTime || '18:00')}
        title={timePickerTarget === 'start' ? 'Hora de Inicio del Corte' : 'Hora de Fin del Corte'}
      />
    </div>
  );
};

export default Settings;
