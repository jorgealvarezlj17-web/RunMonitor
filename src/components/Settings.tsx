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
  Radio,
  Database,
  Copy,
  Check,
  FileText,
  Search,
  Send,
  History,
  Filter
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
import { format } from 'date-fns';

interface Category {
  id: string;
  name: string;
  ownerUid?: string;
}

interface AppConfig {
  whatsappProvider?: 'render_baileys' | 'greenapi' | 'custom';
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
  autoSendWhatsAppEnabled?: boolean;
}

const to12h = (time24: string) => {
  if (!time24) return '';
  let [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, '0')} ${period}`;
};

interface WhatsAppBackupRecord {
  id: string;
  timestamp: string;
  recipient: string;
  message: string;
  status: 'success' | 'failed' | 'scheduled' | 'saved' | 'manual' | string;
  error?: string | null;
  provider?: string;
  type?: string;
}

type SettingsTab = 'schedule' | 'whatsapp' | 'backups' | 'categories' | 'system';

export const Settings: React.FC = () => {
  const { profile } = useProfile();
  const isReadOnly = profile?.is_synced === false;
  const isAdmin = profile?.role === 'admin';

  const [activeTab, setActiveTab] = useState<SettingsTab>('schedule');
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Backup state
  const [backups, setBackups] = useState<WhatsAppBackupRecord[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [backupFilter, setBackupFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [backupSearch, setBackupSearch] = useState('');
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [resendStatus, setResendStatus] = useState<{ id: string; success: boolean; message: string } | null>(null);
  const [isClearingBackups, setIsClearingBackups] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const [config, setConfig] = useState<AppConfig>({
    whatsappProvider: 'render_baileys',
    greenApiInstanceId: '710722721756',
    greenApiToken: '648d092ee3fc4965b6a69e39f5f7d15c2694eb6bc7be48058b',
    greenApiChatId: '120363427690312638@g.us',
    whatsappApiUrl: 'https://bot-whatsapp-baileys-jpyb.onrender.com/send-message',
    whatsappToken: '',
    whatsappGroupId: '584127653247',
    reportCronTime: '0 18 * * *', // Default 6 PM
    shiftStartTime: '18:00',
    shiftEndTime: '18:00',
    shiftRangeMode: 'scheduled',
    autoSendWhatsAppEnabled: true
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
  const [timeRemaining, setTimeRemaining] = useState<string>('--:--:--');

  useEffect(() => {
    const calculateCountdown = () => {
      const endTime = config.shiftEndTime || '18:00';
      const [endH, endM] = endTime.split(':').map(Number);
      
      const now = new Date();
      const target = new Date(now);
      target.setHours(endH, endM, 0, 0);

      if (now.getTime() > target.getTime()) {
        target.setDate(target.getDate() + 1);
      }

      const diff = target.getTime() - now.getTime();
      if (diff <= 0) {
        setTimeRemaining('00:00:00 (Cercano al envío)');
        return;
      }

      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);

      setTimeRemaining(
        `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`
      );
    };

    calculateCountdown();
    const timer = setInterval(calculateCountdown, 1000);
    return () => clearInterval(timer);
  }, [config.shiftEndTime]);

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
          whatsappProvider: data.whatsappProvider || 'render_baileys',
          whatsappApiUrl: data.whatsappApiUrl || 'https://bot-whatsapp-baileys-jpyb.onrender.com/send-message',
          whatsappGroupId: data.whatsappGroupId || '584127653247',
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
      const configToSave: any = { ...config };
      if (config.shiftEndTime) {
        const [endH, endM] = config.shiftEndTime.split(':').map(Number);
        if (!isNaN(endH) && !isNaN(endM)) {
          const now = new Date();
          const endToday = new Date(now);
          endToday.setHours(endH, endM, 0, 0);
          if (now >= endToday) {
            // Mark today's shift as already processed when saving after the shift time,
            // to avoid sending an unrequested retroactive report.
            configToSave.lastAutoSentShiftKey = `${config.shiftEndTime}_${format(now, 'yyyy-MM-dd')}`;
          }
        }
      }

      await setDoc(doc(db, 'config', 'app_settings'), configToSave, { merge: true });
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

  // Backup management logic
  const [stagedBackup, setStagedBackup] = useState<WhatsAppBackupRecord | null>(null);

  const fetchBackups = async () => {
    setIsLoadingBackups(true);
    try {
      const res = await fetch('/api/whatsapp-backups');
      const data = await res.json();
      if (data.success && Array.isArray(data.backups)) {
        setBackups(data.backups.filter((b: any) => b.id !== 'staged_upcoming_report'));
        const staged = data.backups.find((b: any) => b.id === 'staged_upcoming_report');
        if (staged) {
          setStagedBackup({
            id: staged.id,
            timestamp: staged.timestamp || new Date().toISOString(),
            recipient: staged.recipient || 'Grupo WhatsApp (Programado)',
            message: staged.message || '',
            status: 'scheduled',
            error: null,
            provider: ''
          });
        }
      }
    } catch (err) {
      console.error("Error fetching backups:", err);
    } finally {
      setIsLoadingBackups(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'backups') {
      fetchBackups();
      if (db) {
        const q = query(collection(db, 'whatsapp_backups'));
        const unsub = onSnapshot(q, (snapshot) => {
          const list: WhatsAppBackupRecord[] = [];
          let foundStaged: WhatsAppBackupRecord | null = null;
          snapshot.forEach((docSnap) => {
            if (docSnap.id === 'staged_upcoming_report') {
              const d = docSnap.data();
              foundStaged = {
                id: docSnap.id,
                timestamp: d.timestamp || new Date().toISOString(),
                recipient: d.recipient || 'Grupo WhatsApp (Programado)',
                message: d.message || '',
                status: 'scheduled',
                error: null,
                provider: ''
              };
              return;
            }
            const d = docSnap.data();
            list.push({
              id: docSnap.id,
              timestamp: d.timestamp || new Date().toISOString(),
              recipient: d.recipient || '',
              message: d.message || '',
              status: d.status || 'success',
              error: d.error || null,
              provider: d.provider || ''
            });
          });
          list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          setBackups(list);
          setStagedBackup(foundStaged);
          setIsLoadingBackups(false);
        }, (err) => {
          console.warn("Firestore listener on whatsapp_backups failed, using REST endpoint fallback:", err);
        });
        return () => unsub();
      }
    }
  }, [activeTab]);

  const handleSendStagedNow = async () => {
    if (!stagedBackup) return;
    sounds.playClick();
    setResendingId('staged_upcoming_report');
    setResendStatus(null);
    try {
      const res = await fetch('/api/send-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: stagedBackup.message })
      });
      const data = await res.json();
      if (res.ok) {
        sounds.playSuccess();
        setResendStatus({ id: 'staged_upcoming_report', success: true, message: '¡Reporte pre-generado enviado exitosamente a WhatsApp!' });
        if (db) {
          const backupId = `bk_${Date.now()}`;
          await setDoc(doc(db, 'whatsapp_backups', backupId), {
            id: backupId,
            timestamp: new Date().toISOString(),
            recipient: 'Grupo WhatsApp (Manual)',
            message: stagedBackup.message,
            status: 'success',
            type: 'manual'
          });
        }
      } else {
        sounds.playError();
        setResendStatus({ id: 'staged_upcoming_report', success: false, message: data.error || 'Error al enviar a WhatsApp' });
      }
    } catch (err: any) {
      sounds.playError();
      setResendStatus({ id: 'staged_upcoming_report', success: false, message: err.message || 'Error de conexión' });
    } finally {
      setResendingId(null);
    }
  };

  const handleResendBackup = async (backup: WhatsAppBackupRecord) => {
    sounds.playClick();
    setResendingId(backup.id);
    setResendStatus(null);
    try {
      const res = await fetch('/api/whatsapp-backups/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: backup.message, recipient: backup.recipient })
      });
      const data = await res.json();
      if (data.success) {
        sounds.playSuccess();
        setResendStatus({ id: backup.id, success: true, message: '¡Mensaje reenviado exitosamente a WhatsApp!' });
      } else {
        sounds.playError();
        setResendStatus({ id: backup.id, success: false, message: data.error || 'Error al reenviar mensaje.' });
      }
    } catch (err: any) {
      sounds.playError();
      setResendStatus({ id: backup.id, success: false, message: err.message || 'Error de conexión' });
    } finally {
      setResendingId(null);
    }
  };

  const handleCopyBackup = (backup: WhatsAppBackupRecord) => {
    sounds.playClick();
    navigator.clipboard.writeText(backup.message);
    setCopiedId(backup.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDeleteSingleBackup = async (id: string) => {
    sounds.playClick();
    try {
      if (db) {
        await deleteDoc(doc(db, 'whatsapp_backups', id));
      } else {
        await fetch(`/api/whatsapp-backups/${id}`, { method: 'DELETE' });
      }
      setBackups(prev => prev.filter(b => b.id !== id));
    } catch (err) {
      console.error("Error deleting backup:", err);
    }
  };

  const handleClearAllBackups = async () => {
    sounds.playClick();
    setIsClearingBackups(true);
    try {
      await fetch('/api/whatsapp-backups', { method: 'DELETE' });
      setBackups([]);
      setShowClearConfirm(false);
    } catch (err) {
      console.error("Error clearing backups:", err);
    } finally {
      setIsClearingBackups(false);
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
      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        throw new Error(`El servidor devolvió un formato inválido (HTML/404). Si estás en Vercel, el backend de WhatsApp no se ejecuta en estático. Código HTTP: ${response.status}`);
      }
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

      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        throw new Error(`Respuesta no-JSON del servidor (HTML/404). En Vercel el backend no responde a /api/test-whatsapp. Código: ${response.status}`);
      }
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
      // 1. Fetch all documents in logs and delete them
      const logsSnap = await getDocs(collection(db, 'logs'));
      // 1.5. Fetch all documents in power_events and delete them
      const powerSnap = await getDocs(collection(db, 'power_events'));
      // 2. Fetch all equipment and reset them to status: 'off', totalUsageTime: 0
      const equipSnap = await getDocs(collection(db, 'equipment'));
      const now = Timestamp.now();

      // Collect all batch operations and commit in chunks of 400
      let batch = writeBatch(db);
      let opCount = 0;

      const commitAndResetBatchIfNeeded = async () => {
        opCount++;
        if (opCount >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          opCount = 0;
        }
      };

      for (const docSnap of logsSnap.docs) {
        batch.delete(docSnap.ref);
        await commitAndResetBatchIfNeeded();
      }

      for (const docSnap of powerSnap.docs) {
        batch.delete(docSnap.ref);
        await commitAndResetBatchIfNeeded();
      }

      for (const docSnap of equipSnap.docs) {
        batch.update(docSnap.ref, {
          status: 'off',
          totalUsageTime: 0,
          lastTurnedOn: null,
          lastOffReason: null,
          lastUpdated: now
        });
        await commitAndResetBatchIfNeeded();
      }

      if (opCount > 0) {
        await batch.commit();
      }

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
      <div className="bg-slate-100/90 p-1.5 rounded-2xl border border-slate-200/80 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 shadow-xs">
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
          <span>WhatsApp API</span>
        </button>

        <button
          type="button"
          onClick={() => {
            sounds.playClick();
            setActiveTab('backups');
          }}
          className={`py-3 px-3 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-2 ${
            activeTab === 'backups'
              ? 'bg-white text-blue-700 shadow-sm border border-slate-200/60'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Database size={16} className={activeTab === 'backups' ? 'text-blue-600' : 'text-slate-400'} />
          <span>Respaldo de Mensajes</span>
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

              {/* Selector de Rango de Turno */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 shadow-xs mt-4">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <CalendarRange size={18} className="text-cyan-600" />
                    <div>
                      <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Duración del Turno</h3>
                      <p className="text-[11px] text-slate-500 font-medium">Establece la hora exacta de inicio y cierre</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Hora de Inicio */}
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm transition-all hover:border-cyan-400">
                      <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Inicio (Desde)</span>
                      <button 
                        disabled={isReadOnly || !isAdmin}
                        onClick={() => {
                          sounds.playClick();
                          setTimePickerTarget('start');
                        }}
                        className="w-full flex items-center justify-between group disabled:opacity-50"
                      >
                        <span className="font-mono font-black text-2xl text-slate-800 group-hover:text-cyan-600 transition-colors">
                          {to12h(config.shiftStartTime || '06:00')}
                        </span>
                        <span className="text-xs font-sans font-bold text-cyan-700 bg-cyan-50 px-2.5 py-1 rounded-lg border border-cyan-200/60">
                          {config.shiftStartTime || '06:00'}
                        </span>
                      </button>
                    </div>

                    {/* Hora de Cierre */}
                    <div className={`bg-white p-4 rounded-xl border transition-all ${
                      config.shiftRangeMode === 'until_now' 
                        ? 'border-slate-200 opacity-60' 
                        : 'border-slate-200 shadow-sm hover:border-teal-400'
                    }`}>
                      <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Cierre (Hasta)</span>
                      <button 
                        disabled={config.shiftRangeMode === 'until_now' || isReadOnly || !isAdmin}
                        onClick={() => {
                          sounds.playClick();
                          setTimePickerTarget('end');
                        }}
                        className="w-full flex items-center justify-between group disabled:opacity-50"
                      >
                        <span className={`font-mono font-black text-2xl transition-colors ${
                          config.shiftRangeMode === 'until_now' ? 'text-slate-400' : 'text-slate-800 group-hover:text-teal-600'
                        }`}>
                          {config.shiftRangeMode === 'until_now' ? 'En vivo' : to12h(config.shiftEndTime || '18:00')}
                        </span>
                        <span className={`text-xs font-sans font-bold px-2.5 py-1 rounded-lg border ${
                          config.shiftRangeMode === 'until_now'
                            ? 'bg-slate-100 text-slate-500 border-slate-200'
                            : 'text-teal-700 bg-teal-50 border-teal-200/60'
                        }`}>
                          {config.shiftRangeMode === 'until_now' ? 'Ahora' : (config.shiftEndTime || '18:00')}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Visualización Minimalista del Rango */}
                  <div className="pt-2 pb-1 px-1">
                    <div className="h-2 bg-slate-200 rounded-full relative overflow-hidden flex items-center shadow-inner">
                      {(() => {
                        const sTime = config.shiftStartTime || '06:00';
                        const eTime = config.shiftEndTime || '18:00';
                        const [sH, sM] = sTime.split(':').map(Number);
                        const [eH, eM] = eTime.split(':').map(Number);
                        const startMinutes = sH * 60 + sM;
                        let endMinutes = eH * 60 + eM;
                        if (endMinutes <= startMinutes && config.shiftRangeMode === 'scheduled') {
                          endMinutes += 24 * 60;
                        }
                        const totalSpan = 24 * 60;
                        const leftPercent = Math.min(100, Math.max(0, (startMinutes / totalSpan) * 100));
                        const widthPercent = Math.min(100 - leftPercent, Math.max(2, ((endMinutes - startMinutes) / totalSpan) * 100));

                        return (
                          <div
                            className="absolute h-full bg-gradient-to-r from-cyan-400 to-teal-400 rounded-full opacity-90 transition-all shadow-sm"
                            style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                          />
                        );
                      })()}
                    </div>
                    <div className="flex justify-between text-[10px] font-bold text-slate-400 mt-2 px-1">
                      <span>00:00</span>
                      <span>12:00</span>
                      <span>23:59</span>
                    </div>
                  </div>
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

            {/* Card 2: Envío Automático */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-slate-100 text-slate-700 rounded-2xl border border-slate-200/60">
                  <Radio size={22} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Envío Automático a WhatsApp</h2>
                  <p className="text-xs text-slate-500 font-medium">El reporte se genera y envía automáticamente a la Hora de Fin del Corte configurada arriba</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="pt-2 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-800">Activar Reportes Automáticos a WhatsApp</p>
                    <p className="text-xs text-slate-500 font-medium">El servidor recolectará los eventos, guardará el reporte y lo enviará a WhatsApp exactamente a la hora de fin del turno.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.autoSendWhatsAppEnabled ?? true}
                      onChange={(e) => setConfig({ ...config, autoSendWhatsAppEnabled: e.target.checked })}
                      disabled={isReadOnly || !isAdmin}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600 disabled:opacity-50"></div>
                  </label>
                </div>

                {/* Live Countdown Widget */}
                <div className="mt-4 p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-cyan-100 text-cyan-700 flex items-center justify-center font-bold">
                      <Clock size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tiempo Restante para Envío Automático</p>
                      <p className="text-lg font-mono font-black text-slate-900 mt-0.5">{timeRemaining}</p>
                    </div>
                  </div>
                  <div className="text-right sm:text-right">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-extrabold rounded-full border border-emerald-200/60">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      Hora Cierre: {config.shiftEndTime || '18:00'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Save Button for Schedule Tab */}
            {isAdmin && !isReadOnly && (
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  disabled={isSavingConfig}
                  className="w-full sm:w-auto px-8 py-3.5 bg-cyan-600 hover:bg-cyan-700 active:scale-[0.99] text-white font-black text-sm rounded-xl transition-all shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSavingConfig ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : saveStatus === 'success' ? (
                    <CheckCircle2 size={18} />
                  ) : (
                    <Save size={18} />
                  )}
                  <span>{saveStatus === 'success' ? '¡Cambios Guardados!' : 'Guardar Cambios'}</span>
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
              <div className="bg-slate-100 p-1.5 rounded-2xl border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    sounds.playClick();
                    setConfig({ ...config, whatsappProvider: 'render_baileys' });
                  }}
                  disabled={isReadOnly || !isAdmin}
                  className={`py-3 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 ${
                    (config.whatsappProvider || 'render_baileys') === 'render_baileys'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>Render Baileys API</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sounds.playClick();
                    setConfig({ ...config, whatsappProvider: 'greenapi' });
                  }}
                  disabled={isReadOnly || !isAdmin}
                  className={`py-3 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 ${
                    config.whatsappProvider === 'greenapi'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>Green API</span>
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
                  <span>API Genérica / Webhook</span>
                </button>
              </div>

              {(config.whatsappProvider || 'render_baileys') === 'render_baileys' ? (
                <div className="space-y-4">
                  <div className="bg-emerald-50/70 border border-emerald-200/70 rounded-2xl p-4 text-xs text-emerald-900 flex items-start gap-2.5">
                    <span className="text-emerald-700 font-black">🚀</span>
                    <div>
                      <p className="font-bold">Servidor Render Baileys API Vinculado</p>
                      <p className="mt-0.5 text-emerald-800">
                        Envío de mensajes directo a tu API en Render mediante <strong>POST JSON</strong> (sin necesidad de token).
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                      URL Endpoint del Servidor Render
                    </label>
                    <input
                      type="text"
                      value={config.whatsappApiUrl || 'https://bot-whatsapp-baileys-jpyb.onrender.com/send-message'}
                      onChange={(e) => setConfig({ ...config, whatsappApiUrl: e.target.value })}
                      disabled={isReadOnly || !isAdmin}
                      className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-mono text-sm focus:ring-2 focus:ring-emerald-500/50 outline-none transition-all disabled:opacity-50"
                      placeholder="https://bot-whatsapp-baileys-jpyb.onrender.com/send-message"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                      Tipo de Destino para Notificaciones
                    </label>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <button
                        type="button"
                        onClick={() => {
                          sounds.playClick();
                          // Switch to individual phone if current is group or default
                          const currentVal = config.whatsappGroupId || config.greenApiChatId || '';
                          const newPhone = currentVal.includes('@g.us') ? '584127653247' : (currentVal || '584127653247');
                          setConfig({ ...config, whatsappGroupId: newPhone, greenApiChatId: newPhone });
                        }}
                        disabled={isReadOnly || !isAdmin}
                        className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                          !(config.whatsappGroupId || config.greenApiChatId || '').includes('@g.us')
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <span className="text-base">📱</span>
                        <span>Teléfono Individual</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          sounds.playClick();
                          // Switch to group JID
                          const currentVal = config.whatsappGroupId || config.greenApiChatId || '';
                          const newGroup = currentVal.includes('@g.us') ? currentVal : '120363427690312638@g.us';
                          setConfig({ ...config, whatsappGroupId: newGroup, greenApiChatId: newGroup });
                        }}
                        disabled={isReadOnly || !isAdmin}
                        className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                          (config.whatsappGroupId || config.greenApiChatId || '').includes('@g.us')
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <span className="text-base">👥</span>
                        <span>Grupo de WhatsApp</span>
                      </button>
                    </div>

                    {(config.whatsappGroupId || config.greenApiChatId || '').includes('@g.us') ? (
                      <div className="space-y-3">
                        <label className="block text-xs font-semibold text-slate-600">
                          ID del Grupo de WhatsApp (JID)
                        </label>
                        <input
                          type="text"
                          value={config.whatsappGroupId || config.greenApiChatId || ''}
                          onChange={(e) => setConfig({ ...config, whatsappGroupId: e.target.value, greenApiChatId: e.target.value })}
                          disabled={isReadOnly || !isAdmin}
                          className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-mono text-sm focus:ring-2 focus:ring-emerald-500/50 outline-none transition-all disabled:opacity-50"
                          placeholder="Ej: 120363427690312638@g.us"
                        />

                        <div className="p-3 bg-slate-100/80 rounded-xl border border-slate-200/80 flex flex-col gap-2.5">
                          <div className="flex items-center justify-between">
                            <p className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                              <span>💬</span> Grupos detectados en tu WhatsApp:
                            </p>
                            <button
                              type="button"
                              onClick={handleFetchWhatsAppGroups}
                              disabled={isLoadingGroups || isReadOnly || !isAdmin}
                              className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 bg-white px-3 py-1.5 rounded-lg border border-emerald-300 shadow-sm transition-all disabled:opacity-50 active:scale-95"
                            >
                              {isLoadingGroups ? <Loader2 size={13} className="animate-spin text-emerald-600" /> : <RefreshCw size={13} />}
                              <span>{isLoadingGroups ? 'Cargando grupos...' : 'Obtener/Actualizar Grupos'}</span>
                            </button>
                          </div>

                          {groupLoadError && (
                            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-[11px]">
                              ⚠️ {groupLoadError}
                            </div>
                          )}

                          <div className="grid grid-cols-1 gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                sounds.playClick();
                                setConfig({ ...config, whatsappGroupId: '120363427690312638@g.us', greenApiChatId: '120363427690312638@g.us' });
                              }}
                              className={`text-left px-3 py-2.5 rounded-lg border text-xs font-mono transition-all flex items-center justify-between ${
                                (config.whatsappGroupId === '120363427690312638@g.us' || config.greenApiChatId === '120363427690312638@g.us')
                                  ? 'bg-emerald-600 text-white border-emerald-600 font-bold shadow-sm'
                                  : 'bg-white text-emerald-950 border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/50'
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <span>👥</span>
                                <div className="truncate">
                                  <p className="font-bold text-xs truncate">Grupo Aquanova</p>
                                  <p className="text-[10px] font-mono opacity-80">120363427690312638@g.us</p>
                                </div>
                              </div>
                              <span className={`text-[10px] shrink-0 font-sans ml-2 font-bold px-2 py-0.5 rounded ${
                                (config.whatsappGroupId === '120363427690312638@g.us' || config.greenApiChatId === '120363427690312638@g.us')
                                  ? 'bg-emerald-700 text-white'
                                  : 'bg-slate-100 text-slate-700'
                              }`}>
                                {(config.whatsappGroupId === '120363427690312638@g.us' || config.greenApiChatId === '120363427690312638@g.us') ? '✓ Seleccionado' : 'Seleccionar'}
                              </span>
                            </button>

                            {availableGroups.filter(Boolean).map((grp: any) => {
                              const grpId = grp.id || grp.chatId || grp.groupId || '';
                              if (grpId === '120363427690312638@g.us') return null; // Already shown above
                              const isSelected = config.greenApiChatId === grpId || config.whatsappGroupId === grpId;
                              return (
                                <button
                                  key={grpId || grp.name || Math.random().toString()}
                                  type="button"
                                  onClick={() => {
                                    sounds.playClick();
                                    setConfig({ ...config, greenApiChatId: grpId, whatsappGroupId: grpId });
                                  }}
                                  className={`w-full text-left p-2.5 rounded-lg border text-xs flex items-center justify-between transition-all ${
                                    isSelected
                                      ? 'bg-emerald-600 text-white border-emerald-600 font-bold shadow-sm'
                                      : 'bg-white text-slate-800 border-slate-200 hover:bg-emerald-50'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 truncate">
                                    <span>👥</span>
                                    <div className="truncate">
                                      <p className="font-bold truncate">{grp.name || 'Grupo sin nombre'}</p>
                                      <p className="text-[10px] font-mono opacity-75">{grpId}</p>
                                    </div>
                                  </div>
                                  <span className={`text-[10px] font-mono shrink-0 ml-2 px-2 py-0.5 rounded ${
                                    isSelected ? 'bg-emerald-700 text-white font-bold' : 'bg-slate-100 text-slate-700'
                                  }`}>
                                    {isSelected ? '✓ Seleccionado' : 'Seleccionar'}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Direct Confirm & Save button */}
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={handleSaveConfig}
                            disabled={isSavingConfig || isReadOnly || !isAdmin}
                            className="w-full py-3 px-4 rounded-xl bg-emerald-600 text-white font-extrabold hover:bg-emerald-700 active:scale-[0.99] transition-all shadow-md shadow-emerald-600/20 text-xs flex items-center justify-center gap-2 disabled:opacity-50"
                          >
                            {isSavingConfig ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                            <span>Confirmar y Guardar Grupo Seleccionado</span>
                          </button>
                          {saveStatus === 'success' && (
                            <p className="text-xs text-emerald-600 font-bold text-center mt-1.5 flex items-center justify-center gap-1">
                              ✓ Grupo guardado y confirmado para el envío de reportes
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-600">
                          Número de Teléfono (con código de país sin +)
                        </label>
                        <input
                          type="text"
                          value={config.whatsappGroupId || config.greenApiChatId || ''}
                          onChange={(e) => setConfig({ ...config, whatsappGroupId: e.target.value, greenApiChatId: e.target.value })}
                          disabled={isReadOnly || !isAdmin}
                          className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-mono text-sm focus:ring-2 focus:ring-emerald-500/50 outline-none transition-all disabled:opacity-50"
                          placeholder="Ej: 584127653247"
                        />
                        <p className="text-[11px] text-slate-500">
                          Formato: Código de país + número sin espacios ni guiones (ej: <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800">584127653247</code>).
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : config.whatsappProvider === 'greenapi' ? (
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
                          {availableGroups.filter(Boolean).map((grp: any) => {
                            const grpId = grp.id || grp.chatId || grp.groupId || '';
                            const isSelected = config.greenApiChatId === grpId || config.whatsappGroupId === grpId;
                            return (
                              <button
                                key={grpId || grp.name || Math.random().toString()}
                                type="button"
                                onClick={() => {
                                  sounds.playClick();
                                  setConfig({ ...config, greenApiChatId: grpId, whatsappGroupId: grpId });
                                }}
                                className={`w-full text-left p-2.5 rounded-xl border text-xs flex items-center justify-between transition-all ${
                                  isSelected
                                    ? 'bg-emerald-600 text-white border-emerald-600 font-bold shadow-sm'
                                    : 'bg-white text-slate-800 border-slate-200 hover:bg-emerald-50 hover:border-emerald-300'
                                }`}
                              >
                                <div className="flex items-center gap-2 truncate">
                                  <Users size={14} className={isSelected ? 'text-white' : 'text-emerald-600'} />
                                  <span className="truncate">{grp.name || grpId}</span>
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
                    className="flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-cyan-600 text-white font-extrabold hover:bg-cyan-700 active:scale-[0.99] transition-all shadow-md shadow-cyan-500/20 text-sm disabled:opacity-50"
                  >
                    {isSavingConfig ? (
                      <Loader2 className="animate-spin" size={18} />
                    ) : saveStatus === 'success' ? (
                      <CheckCircle2 size={18} />
                    ) : (
                      <Save size={18} />
                    )}
                    <span>{saveStatus === 'success' ? '¡Cambios Guardados!' : 'Guardar Cambios'}</span>
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* =================================================================== */}
        {/* TAB: RESPALDO DE MENSAJES Y NOTIFICACIONES                         */}
        {/* =================================================================== */}
        {activeTab === 'backups' && (
          <motion.div
            key="tab-backups"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="space-y-4"
          >
            <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-xs space-y-4">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-slate-100 text-slate-700 rounded-lg">
                    <Database size={18} />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Historial de Respaldos</h2>
                    <p className="text-xs text-slate-500">
                      Registro de cortes automáticos, manuales y envíos de WhatsApp
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={fetchBackups}
                    disabled={isLoadingBackups}
                    className="h-8 px-2.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors flex items-center gap-1.5 text-xs font-medium disabled:opacity-50"
                    title="Actualizar lista de respaldos"
                  >
                    <RefreshCw size={13} className={isLoadingBackups ? 'animate-spin text-blue-600' : ''} />
                    <span>Actualizar</span>
                  </button>

                  {isAdmin && backups.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowClearConfirm(true)}
                      className="h-8 px-2.5 rounded-lg border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 transition-colors flex items-center gap-1 text-xs font-medium"
                    >
                      <Trash2 size={13} />
                      <span>Vaciar</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Confirm Clear Alert */}
              {showClearConfirm && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-rose-900">
                    <AlertTriangle size={15} className="text-rose-600 shrink-0" />
                    <span>¿Confirmas que deseas eliminar todo el historial de respaldo?</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleClearAllBackups}
                      disabled={isClearingBackups}
                      className="h-7 px-3 bg-rose-600 text-white rounded-md font-medium hover:bg-rose-700 transition-colors text-xs flex items-center gap-1"
                    >
                      {isClearingBackups ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      <span>Sí, eliminar todo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowClearConfirm(false)}
                      className="h-7 px-3 bg-white text-slate-700 border border-slate-200 rounded-md font-medium hover:bg-slate-50 transition-colors text-xs"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {/* Live Pre-generated Staged Report Card */}
              {stagedBackup && (
                <div className="p-3.5 bg-amber-50/50 rounded-xl border border-amber-200 text-xs space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500 text-white flex items-center gap-1">
                        ⚡ Borrador en Vivo
                      </span>
                      <span className="text-xs text-amber-900 font-medium">
                        Corte programado: {config.shiftEndTime || '18:00'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleSendStagedNow}
                        disabled={resendingId === 'staged_upcoming_report'}
                        className="h-7 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs rounded-md transition-colors flex items-center gap-1 disabled:opacity-50"
                        title="Enviar borrador a WhatsApp inmediatamente"
                      >
                        {resendingId === 'staged_upcoming_report' ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                        <span>Enviar Ahora</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopyBackup(stagedBackup)}
                        className="h-7 px-2.5 bg-white border border-amber-200 text-amber-900 hover:bg-amber-100/60 font-medium text-xs rounded-md transition-colors flex items-center gap-1"
                      >
                        {copiedId === stagedBackup.id ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                        <span>{copiedId === stagedBackup.id ? 'Copiado' : 'Copiar'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-900 text-slate-100 p-3 rounded-lg font-mono text-[11px] overflow-x-auto border border-slate-800 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
                    {stagedBackup.message}
                  </div>

                  {resendStatus && resendStatus.id === 'staged_upcoming_report' && (
                    <div className={`p-2 rounded-lg text-xs font-medium flex items-center gap-1.5 ${
                      resendStatus.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}>
                      {resendStatus.success ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                      <span>{resendStatus.message}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Search & Filter Bar */}
              <div className="relative w-full">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={backupSearch}
                  onChange={(e) => setBackupSearch(e.target.value)}
                  placeholder="Buscar por texto, destino o fecha..."
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400 focus:bg-white transition-colors"
                />
              </div>

              {/* List of Backups */}
              {isLoadingBackups ? (
                <div className="py-8 text-center text-slate-400 space-y-2">
                  <Loader2 size={20} className="animate-spin mx-auto text-slate-400" />
                  <p className="text-xs">Cargando respaldos...</p>
                </div>
              ) : backups.length === 0 ? (
                <div className="py-8 border border-dashed border-slate-200 rounded-xl text-center space-y-1.5">
                  <Database size={24} className="mx-auto text-slate-300" />
                  <p className="text-xs font-bold text-slate-600">No hay respaldos registrados</p>
                  <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                    Los reportes generados o enviados se guardarán automáticamente aquí.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {backups
                    .filter(b => {
                      const matchesSearch = !backupSearch || 
                        b.message.toLowerCase().includes(backupSearch.toLowerCase()) || 
                        b.recipient.toLowerCase().includes(backupSearch.toLowerCase());
                      return matchesSearch;
                    })
                    .map((bk) => {
                      const isSuccess = bk.status === 'success';
                      const isSaved = bk.status === 'saved';
                      const isManual = bk.status === 'manual';
                      const formattedDate = bk.timestamp 
                        ? format(new Date(bk.timestamp), 'dd/MM/yyyy · hh:mm a')
                        : 'Fecha no registrada';

                      return (
                        <div
                          key={bk.id}
                          className="p-3 bg-white rounded-xl border border-slate-200 hover:border-slate-300 transition-colors space-y-2"
                        >
                          {/* Card Top Row */}
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold flex items-center gap-1 ${
                                isSuccess 
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                  : isSaved
                                    ? 'bg-sky-50 text-sky-700 border border-sky-200'
                                    : isManual
                                      ? 'bg-slate-100 text-slate-700 border border-slate-200'
                                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}>
                                {isSuccess ? <CheckCircle2 size={11} /> : isSaved ? <Database size={11} /> : isManual ? <FileText size={11} /> : <AlertCircle size={11} />}
                                {isSuccess 
                                  ? 'Enviado a WhatsApp' 
                                  : isSaved 
                                    ? 'Respaldo (WhatsApp Off)' 
                                    : isManual
                                      ? 'Corte Manual'
                                      : 'Falla de WhatsApp'}
                              </span>

                              <span className="text-slate-500 font-mono text-[11px]">
                                {formattedDate}
                              </span>

                              <span className="text-slate-400 text-[11px] hidden sm:inline">•</span>

                              <span className="text-slate-500 text-[11px]">
                                {bk.recipient}
                              </span>
                            </div>

                            {/* Small Action Buttons */}
                            <div className="flex items-center gap-1.5 ml-auto">
                              <button
                                type="button"
                                onClick={() => handleCopyBackup(bk)}
                                className="h-6 px-2 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-[11px] transition-colors flex items-center gap-1"
                                title="Copiar reporte al portapapeles"
                              >
                                {copiedId === bk.id ? (
                                  <Check size={11} className="text-emerald-600" />
                                ) : (
                                  <Copy size={11} className="text-slate-500" />
                                )}
                                <span>{copiedId === bk.id ? 'Copiado' : 'Copiar'}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleResendBackup(bk)}
                                disabled={resendingId === bk.id}
                                className="h-6 px-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-[11px] transition-colors flex items-center gap-1 disabled:opacity-50"
                                title="Reenviar este reporte a WhatsApp"
                              >
                                {resendingId === bk.id ? (
                                  <Loader2 size={11} className="animate-spin" />
                                ) : (
                                  <Send size={11} />
                                )}
                                <span>Reenviar</span>
                              </button>

                              {isAdmin && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSingleBackup(bk.id)}
                                  className="h-6 w-6 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors flex items-center justify-center"
                                  title="Eliminar registro"
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Error notice if present */}
                          {bk.error && (
                            <div className="px-2 py-1 rounded bg-rose-50 border border-rose-200/70 text-rose-700 text-[11px] font-medium flex items-center gap-1.5">
                              <AlertCircle size={12} className="shrink-0 text-rose-600" />
                              <span>{bk.error}</span>
                            </div>
                          )}

                          {/* Monospace message preview */}
                          <div className="bg-slate-900 text-slate-200 p-2.5 rounded-lg font-mono text-[11px] overflow-x-auto border border-slate-800 whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto select-all">
                            {bk.message}
                          </div>

                          {/* Resend status toast/inline */}
                          {resendStatus && resendStatus.id === bk.id && (
                            <div className={`p-1.5 rounded-md text-[11px] font-medium flex items-center gap-1.5 ${
                              resendStatus.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                            }`}>
                              {resendStatus.success ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                              <span>{resendStatus.message}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
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
                      Vacía todos los registros de encendido/apagado, fallas eléctricas, apaga todos los equipos de la planta y reinicia el contador de horas de funcionamiento a cero.
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
                            Esta acción eliminará de forma irreversible el historial de encendidos, apagados, fallas eléctricas, <strong>apagará todos los equipos</strong> y reiniciará el tiempo operativo a cero.
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
                    <span>¡Éxito! Todos los registros han sido borrados, todos los equipos han sido apagados y los tiempos operativos se han reiniciado a cero.</span>
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
