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
import { sendWhatsAppMessageDirect } from '../whatsapp';
import { TimePickerModal } from './TimePickerModal';
import { OperationType, handleFirestoreError } from '../utils/firestoreError';
import { useProfile } from '../context/ProfileContext';
import { AquanovaSettingsTab } from './AquanovaSettingsTab';
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
  getDoc,
  limit,
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
  telegramBotToken?: string;
  telegramChatId?: string;
  autoSendWhatsAppEnabled?: boolean;
  isUpdatingApp?: boolean;
  updateNotice?: string;
  lastUpdatedTimestamp?: string;
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

type SettingsTab = 'schedule' | 'whatsapp' | 'telegram' | 'aquanova' | 'backups' | 'categories' | 'system';

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

  // Test connection state
  const [testingService, setTestingService] = useState<'none' | 'whatsapp' | 'telegram'>('none');
  const [testResult, setTestResult] = useState<'idle' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
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
  const [resetProgressMessage, setResetProgressMessage] = useState('');
  const [resetProgressPercent, setResetProgressPercent] = useState(0);
  const [resetErrorMessage, setResetErrorMessage] = useState<string | null>(null);
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

  const handleTestGlobalWhatsApp = async () => {
    setTestingService('whatsapp');
    setTestResult('idle');
    setTestMessage('');
    try {
      const pingMessage = `✅ *PRUEBA DE CONEXIÓN WHATSAPP*\n\nRunMonitor está configurado correctamente y enviando este mensaje de prueba.\n\n_Hora: ${format(new Date(), 'HH:mm:ss')}_`;
      
      const result = await sendWhatsAppMessageDirect(pingMessage, {
        whatsappProvider: config.whatsappProvider,
        whatsappApiUrl: config.whatsappApiUrl,
        whatsappToken: config.whatsappToken,
        whatsappGroupId: config.whatsappGroupId,
        greenApiInstanceId: config.greenApiInstanceId,
        greenApiToken: config.greenApiToken,
        greenApiChatId: config.greenApiChatId
      });

      if (result.success) {
        setTestResult('success');
        setTestMessage('✅ ¡Conexión exitosa en WhatsApp! El mensaje de prueba ha sido enviado.');
      } else {
        setTestResult('error');
        setTestMessage(`❌ Error de conexión en WhatsApp: ${result.error}`);
      }
    } catch (err: any) {
      setTestResult('error');
      setTestMessage(`❌ Ocurrió un error inesperado (WhatsApp): ${err.message}`);
    } finally {
      setTestingService('none');
      setTimeout(() => setTestResult('idle'), 8000);
    }
  };

  const handleTestGlobalTelegram = async () => {
    setTestingService('telegram');
    setTestResult('idle');
    setTestMessage('');
    try {
      const pingMessage = `✅ *PRUEBA DE CONEXIÓN TELEGRAM*\n\nRunMonitor está configurado correctamente y enviando este mensaje de prueba.\n\n_Hora: ${format(new Date(), 'HH:mm:ss')}_`;
      
      const result = await sendWhatsAppMessageDirect(pingMessage, {
        whatsappProvider: 'none', // skip WhatsApp logic
        telegramBotToken: config.telegramBotToken,
        telegramChatId: config.telegramChatId
      });

      if (result.success) {
        setTestResult('success');
        setTestMessage('✅ ¡Conexión exitosa en Telegram! El mensaje de prueba ha sido enviado.');
      } else {
        setTestResult('error');
        setTestMessage(`❌ Error de conexión en Telegram: Revisa tu Token y Chat ID.`);
      }
    } catch (err: any) {
      setTestResult('error');
      setTestMessage(`❌ Ocurrió un error inesperado (Telegram): ${err.message}`);
    } finally {
      setTestingService('none');
      setTimeout(() => setTestResult('idle'), 8000);
    }
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
      const backupsRef = collection(db, 'whatsapp_backups');
      const q = query(backupsRef, orderBy('timestamp', 'desc'), limit(150));
      const snapshot = await getDocs(q);
      const fetchedBackups: any[] = [];
      snapshot.forEach(doc => fetchedBackups.push(doc.data()));
      
      setBackups(fetchedBackups.filter((b: any) => b.id !== 'staged_upcoming_report'));
      const staged = fetchedBackups.find((b: any) => b.id === 'staged_upcoming_report');
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
      const response = await sendWhatsAppMessageDirect(
        stagedBackup.message,
        config,
        stagedBackup.recipient
      );
      if (response.success) {
        sounds.playSuccess();
        setResendStatus({ id: 'staged_upcoming_report', success: true, message: '¡Reporte pre-generado enviado exitosamente a WhatsApp!' });
        if (db) {
          const backupId = `bk_${Date.now()}`;
          await setDoc(doc(db, 'whatsapp_backups', backupId), {
            id: backupId,
            timestamp: new Date().toISOString(),
            recipient: stagedBackup.recipient,
            message: stagedBackup.message,
            status: 'success',
            type: 'manual'
          });
        }
      } else {
        sounds.playError();
        setResendStatus({ id: 'staged_upcoming_report', success: false, message: response.error || 'Error al enviar a WhatsApp' });
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
      const response = await sendWhatsAppMessageDirect(backup.message, config, backup.recipient);
      if (response.success) {
        sounds.playSuccess();
        setResendStatus({ id: backup.id, success: true, message: '¡Mensaje reenviado exitosamente a WhatsApp!' });
      } else {
        sounds.playError();
        setResendStatus({ id: backup.id, success: false, message: response.error || 'Error al reenviar mensaje.' });
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
      const backupsRef = collection(db, 'whatsapp_backups');
      const snapshot = await getDocs(backupsRef);
      const batchPromises = snapshot.docs.map(document => deleteDoc(doc(db, 'whatsapp_backups', document.id)));
      await Promise.all(batchPromises);
      
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
      const url = `https://api.green-api.com/waInstance${config.greenApiInstanceId}/getContacts/${config.greenApiToken}`;
      const response = await fetch('/api/relay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUrl: url,
          proxyMethod: 'GET'
        })
      });
      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        throw new Error(`El servidor devolvió un formato inválido. Código HTTP: ${response.status}`);
      }
      if (response.ok) {
        const groups = (Array.isArray(data) ? data : []).filter((c: any) => c.type === 'group' || c.isGroup || (c.id && c.id.includes('@g.us')));
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
      const response = await sendWhatsAppMessageDirect(
        '🧪 *Ping desde AI Studio / Vercel* verificando sesión de WhatsApp',
        config
      );

      if (response.success) {
        sounds.playSuccess();
        setTestStatus({ type: 'success', message: '¡Mensaje de prueba enviado con éxito a tu WhatsApp!' });
      } else {
        setTestStatus({ type: 'error', message: response.error || 'No se pudo enviar el mensaje. Verifica las credenciales.' });
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
    setResetErrorMessage(null);
    setResetProgressPercent(5);
    setResetProgressMessage('Conectando con la base de datos...');

    try {
      // 1. Fetch all documents in logs
      setResetProgressMessage('Consultando historial de encendidos y apagados...');
      const logsSnap = await getDocs(collection(db, 'logs'));
      const totalLogs = logsSnap.docs.length;
      setResetProgressPercent(15);

      // 1.5. Fetch all documents in power_events
      setResetProgressMessage('Consultando historial de eventos de Corpoelec...');
      const powerSnap = await getDocs(collection(db, 'power_events'));
      const totalPower = powerSnap.docs.length;
      setResetProgressPercent(25);

      // 2. Fetch all equipment
      setResetProgressMessage('Consultando equipos de planta...');
      const equipSnap = await getDocs(collection(db, 'equipment'));
      const totalEquip = equipSnap.docs.length;
      setResetProgressPercent(35);

      const CHUNK_SIZE = 40;

      // 3. Delete logs in chunks
      if (totalLogs > 0) {
        for (let i = 0; i < totalLogs; i += CHUNK_SIZE) {
          const chunk = logsSnap.docs.slice(i, i + CHUNK_SIZE);
          const batch = writeBatch(db);
          chunk.forEach((d) => batch.delete(d.ref));
          await batch.commit();
          const currentCount = Math.min(i + chunk.length, totalLogs);
          const percent = Math.min(60, 35 + Math.round((currentCount / totalLogs) * 25));
          setResetProgressPercent(percent);
          setResetProgressMessage(`Borrando historial de encendidos (${currentCount}/${totalLogs})...`);
        }
      } else {
        setResetProgressPercent(60);
      }

      // 4. Delete power_events in chunks
      if (totalPower > 0) {
        for (let i = 0; i < totalPower; i += CHUNK_SIZE) {
          const chunk = powerSnap.docs.slice(i, i + CHUNK_SIZE);
          const batch = writeBatch(db);
          chunk.forEach((d) => batch.delete(d.ref));
          await batch.commit();
          const currentCount = Math.min(i + chunk.length, totalPower);
          const percent = Math.min(80, 60 + Math.round((currentCount / totalPower) * 20));
          setResetProgressPercent(percent);
          setResetProgressMessage(`Borrando fallas eléctricas (${currentCount}/${totalPower})...`);
        }
      } else {
        setResetProgressPercent(80);
      }

      // 5. Reset all equipment to off and 0 hours
      const now = Timestamp.now();
      if (totalEquip > 0) {
        for (let i = 0; i < totalEquip; i += CHUNK_SIZE) {
          const chunk = equipSnap.docs.slice(i, i + CHUNK_SIZE);
          const batch = writeBatch(db);
          chunk.forEach((d) => {
            batch.update(d.ref, {
              status: 'off',
              totalUsageTime: 0,
              lastTurnedOn: null,
              lastOffReason: 'Restablecimiento general de planta',
              lastUpdated: now
            });
          });
          await batch.commit();
          const currentCount = Math.min(i + chunk.length, totalEquip);
          const percent = Math.min(95, 80 + Math.round((currentCount / totalEquip) * 15));
          setResetProgressPercent(percent);
          setResetProgressMessage(`Apagando equipos y reseteando horas a 0 (${currentCount}/${totalEquip})...`);
        }
      } else {
        setResetProgressPercent(95);
      }

      // 6. Reset draft observations/maintenance if any
      setResetProgressMessage('Limpiando borradores de turno...');
      try {
        const batchConfig = writeBatch(db);
        batchConfig.set(doc(db, 'config', 'current_shift_observations'), { observations: '', lastUpdated: now }, { merge: true });
        batchConfig.set(doc(db, 'config', 'current_shift_maintenance'), { preventivos: [], correctivos: [], inoperativos: [], lastUpdated: now }, { merge: true });
        await batchConfig.commit();
      } catch (cfgErr) {
        console.warn('Non-critical config reset notice:', cfgErr);
      }

      setResetProgressPercent(100);
      setResetProgressMessage('¡Restablecimiento completado con éxito!');
      sounds.playSuccess();
      setResetStatus('success');

      // Keep success message visible briefly before closing modal
      setTimeout(() => {
        setShowResetConfirm(false);
        setResetConfirmText('');
        setIsResetting(false);
        setResetProgressPercent(0);
        setResetProgressMessage('');
      }, 1600);

      setTimeout(() => setResetStatus('idle'), 6000);
    } catch (error: any) {
      console.error('Error resetting operation logs:', error);
      const errMsg = error?.message || 'Error de permisos o conexión con la base de datos.';
      setResetErrorMessage(errMsg);
      setResetStatus('error');
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
      <div className="bg-slate-100/90 p-1.5 rounded-2xl border border-slate-200/80 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5 shadow-xs">
        <button
          type="button"
          onClick={() => {
            sounds.playClick();
            setActiveTab('schedule');
          }}
          className={`py-3 px-2.5 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'schedule'
              ? 'bg-white text-cyan-700 shadow-sm border border-slate-200/60'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Clock size={16} className={activeTab === 'schedule' ? 'text-cyan-600 shrink-0' : 'text-slate-400 shrink-0'} />
          <span className="truncate">Horarios</span>
        </button>

        <button
          type="button"
          onClick={() => {
            sounds.playClick();
            setActiveTab('whatsapp');
          }}
          className={`py-3 px-2.5 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'whatsapp'
              ? 'bg-white text-emerald-700 shadow-sm border border-slate-200/60'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <MessageSquare size={16} className={activeTab === 'whatsapp' ? 'text-emerald-600 shrink-0' : 'text-slate-400 shrink-0'} />
          <span className="truncate">WhatsApp</span>
        </button>

        <button
          type="button"
          onClick={() => {
            sounds.playClick();
            setActiveTab('telegram');
          }}
          className={`py-3 px-2.5 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'telegram'
              ? 'bg-white text-blue-500 shadow-sm border border-slate-200/60'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Send size={16} className={activeTab === 'telegram' ? 'text-blue-500 shrink-0' : 'text-slate-400 shrink-0'} />
          <span className="truncate">Telegram</span>
        </button>

        <button
          type="button"
          onClick={() => {
            sounds.playClick();
            setActiveTab('aquanova');
          }}
          className={`py-3 px-2.5 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'aquanova'
              ? 'bg-white text-cyan-600 shadow-sm border border-slate-200/60'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Zap size={16} className={activeTab === 'aquanova' ? 'text-cyan-500 shrink-0' : 'text-slate-400 shrink-0'} />
          <span className="truncate">Aquanova</span>
        </button>

        <button
          type="button"
          onClick={() => {
            sounds.playClick();
            setActiveTab('backups');
          }}
          className={`py-3 px-2.5 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'backups'
              ? 'bg-white text-blue-700 shadow-sm border border-slate-200/60'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Database size={16} className={activeTab === 'backups' ? 'text-blue-600 shrink-0' : 'text-slate-400 shrink-0'} />
          <span className="truncate">Respaldos</span>
        </button>

        <button
          type="button"
          onClick={() => {
            sounds.playClick();
            setActiveTab('categories');
          }}
          className={`py-3 px-2.5 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'categories'
              ? 'bg-white text-slate-900 shadow-sm border border-slate-200/60'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <LayoutGrid size={16} className={activeTab === 'categories' ? 'text-cyan-600 shrink-0' : 'text-slate-400 shrink-0'} />
          <span className="truncate">Áreas</span>
        </button>

        <button
          type="button"
          onClick={() => {
            sounds.playClick();
            setActiveTab('system');
          }}
          className={`py-3 px-2.5 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'system'
              ? 'bg-white text-rose-700 shadow-sm border border-slate-200/60'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <ShieldAlert size={16} className={activeTab === 'system' ? 'text-rose-600 shrink-0' : 'text-slate-400 shrink-0'} />
          <span className="truncate">Sistema</span>
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

            {/* Card 2: Estado del Corte Operativo */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-cyan-50 text-cyan-700 rounded-2xl border border-cyan-200/60">
                    <Clock size={22} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Ciclo y Próximo Corte Operativo</h2>
                    <p className="text-xs text-slate-500 font-medium">Temporizador en tiempo real basado en el horario de corte</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-extrabold rounded-full border border-emerald-200/60">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Cierre a las {config.shiftEndTime || '18:00'}
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tiempo Restante para el Corte</p>
                  <p className="text-2xl font-mono font-black text-slate-900 mt-0.5">{timeRemaining}</p>
                </div>
                <p className="text-xs text-slate-500 max-w-sm text-center sm:text-right">
                  Al completarse este ciclo, el sistema genera el corte de turno y envía las notificaciones a los canales configurados.
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
                  className="w-full sm:w-auto px-8 py-3.5 bg-cyan-600 hover:bg-cyan-700 active:scale-[0.99] text-white font-black text-sm rounded-xl transition-all shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSavingConfig ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : saveStatus === 'success' ? (
                    <CheckCircle2 size={18} />
                  ) : (
                    <Save size={18} />
                  )}
                  <span>{saveStatus === 'success' ? '¡Cambios Guardados!' : 'Guardar Horarios de Corte'}</span>
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* =================================================================== */}
        {/* TAB 2: WHATSAPP INTEGRATION                                         */}
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
            {/* Card 1: Switch de Envío Automático a WhatsApp */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-200/60 shrink-0">
                    <Radio size={22} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Envío Automático a WhatsApp</h2>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      El reporte diario se genera y se envía automáticamente a la Hora de Fin ({config.shiftEndTime || '18:00'})
                    </p>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer shrink-0 self-end sm:self-center">
                  <input
                    type="checkbox"
                    checked={config.autoSendWhatsAppEnabled ?? true}
                    onChange={(e) => setConfig({ ...config, autoSendWhatsAppEnabled: e.target.checked })}
                    disabled={isReadOnly || !isAdmin}
                    className="sr-only peer"
                  />
                  <div className="w-12 h-6.5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600 disabled:opacity-50"></div>
                </label>
              </div>
            </div>

            {/* Card 2: Configuración del Proveedor y Destino */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-200/60">
                  <MessageSquare size={22} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Configuración de Conexión WhatsApp</h2>
                  <p className="text-xs text-slate-500 font-medium">Proveedor de API y destino para los reportes de turno</p>
                </div>
              </div>

              {/* Selector de Proveedor */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                  Proveedor de Servicio
                </label>
                <div className="bg-slate-100 p-1.5 rounded-2xl border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      sounds.playClick();
                      setConfig({ ...config, whatsappProvider: 'render_baileys' });
                    }}
                    disabled={isReadOnly || !isAdmin}
                    className={`py-2.5 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 ${
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
                    className={`py-2.5 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 ${
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
                    className={`py-2.5 px-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 ${
                      config.whatsappProvider === 'custom'
                        ? 'bg-cyan-600 text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>API Genérica / Webhook</span>
                  </button>
                </div>
              </div>

              {/* Configuración según Proveedor */}
              {(config.whatsappProvider || 'render_baileys') === 'render_baileys' ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                      URL Endpoint del Servidor Render
                    </label>
                    <input
                      type="text"
                      value={config.whatsappApiUrl || 'https://bot-whatsapp-baileys-jpyb.onrender.com/send-message'}
                      onChange={(e) => setConfig({ ...config, whatsappApiUrl: e.target.value })}
                      disabled={isReadOnly || !isAdmin}
                      className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-mono text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500/50 outline-none transition-all disabled:opacity-50"
                      placeholder="https://bot-whatsapp-baileys-jpyb.onrender.com/send-message"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                      Tipo de Destino
                    </label>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <button
                        type="button"
                        onClick={() => {
                          sounds.playClick();
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
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-slate-600">
                            ID del Grupo de WhatsApp (JID)
                          </label>
                          <button
                            type="button"
                            onClick={handleFetchWhatsAppGroups}
                            disabled={isLoadingGroups || isReadOnly || !isAdmin}
                            className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-emerald-300 shadow-xs transition-all disabled:opacity-50"
                          >
                            {isLoadingGroups ? <Loader2 size={13} className="animate-spin text-emerald-600" /> : <RefreshCw size={13} />}
                            <span>{isLoadingGroups ? 'Buscando...' : 'Detectar Grupos'}</span>
                          </button>
                        </div>

                        <input
                          type="text"
                          value={config.whatsappGroupId || config.greenApiChatId || ''}
                          onChange={(e) => setConfig({ ...config, whatsappGroupId: e.target.value, greenApiChatId: e.target.value })}
                          disabled={isReadOnly || !isAdmin}
                          className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-mono text-sm focus:ring-2 focus:ring-emerald-500/50 outline-none transition-all disabled:opacity-50"
                          placeholder="Ej: 120363427690312638@g.us"
                        />

                        {groupLoadError && (
                          <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-[11px]">
                            ⚠️ {groupLoadError}
                          </div>
                        )}

                        {/* Selector rápido de Grupo Aquanova */}
                        <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80">
                          <button
                            type="button"
                            onClick={() => {
                              sounds.playClick();
                              setConfig({ ...config, whatsappGroupId: '120363427690312638@g.us', greenApiChatId: '120363427690312638@g.us' });
                            }}
                            className={`w-full text-left px-3 py-2 rounded-lg border text-xs font-mono transition-all flex items-center justify-between ${
                              (config.whatsappGroupId === '120363427690312638@g.us' || config.greenApiChatId === '120363427690312638@g.us')
                                ? 'bg-emerald-600 text-white border-emerald-600 font-bold shadow-xs'
                                : 'bg-white text-slate-800 border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/50'
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
                          Código de país + número sin espacios ni guiones (ej: <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800">584127653247</code>).
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : config.whatsappProvider === 'greenapi' ? (
                <div className="space-y-4">
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
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                      Destino (ID del Grupo o Teléfono)
                    </label>
                    <input
                      type="text"
                      value={config.greenApiChatId || ''}
                      onChange={(e) => setConfig({ ...config, greenApiChatId: e.target.value })}
                      disabled={isReadOnly || !isAdmin}
                      className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-mono text-sm focus:ring-2 focus:ring-emerald-500/50 outline-none transition-all disabled:opacity-50"
                      placeholder="Ej: 120363427690312638@g.us"
                    />
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

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleTestWhatsApp}
                  disabled={isTestingWhatsApp || isReadOnly || !isAdmin}
                  className="flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-emerald-50 text-emerald-800 font-extrabold hover:bg-emerald-100 border border-emerald-200 transition-all text-xs disabled:opacity-50"
                >
                  {isTestingWhatsApp ? <Loader2 className="animate-spin" size={16} /> : <MessageSquare size={16} />}
                  <span>Probar Conexión WhatsApp</span>
                </button>

                {isAdmin && !isReadOnly && (
                  <button
                    type="button"
                    onClick={handleSaveConfig}
                    disabled={isSavingConfig}
                    className="flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-emerald-600 text-white font-extrabold hover:bg-emerald-700 active:scale-[0.99] transition-all shadow-md shadow-emerald-500/20 text-xs disabled:opacity-50"
                  >
                    {isSavingConfig ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : saveStatus === 'success' ? (
                      <CheckCircle2 size={16} />
                    ) : (
                      <Save size={16} />
                    )}
                    <span>{saveStatus === 'success' ? '¡Cambios Guardados!' : 'Guardar Cambios de WhatsApp'}</span>
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* =================================================================== */}
        {/* TAB 3: TELEGRAM INTEGRATION                                         */}
        {/* =================================================================== */}
        {activeTab === 'telegram' && (
          <motion.div
            key="tab-telegram"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="space-y-6"
          >
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs space-y-6">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center border border-blue-200 shadow-sm shrink-0">
                    <Send className="text-blue-600" size={24} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Integración con Telegram (Oficial)</h2>
                    <p className="text-xs text-slate-500 font-medium">Conexión directa mediante Bot de Telegram para reportes y alertas</p>
                  </div>
                </div>
              </div>

              {/* Guía compacta */}
              <div className="bg-blue-50/70 border border-blue-200/70 rounded-2xl p-4 text-xs text-blue-900 space-y-2">
                <p className="font-bold flex items-center gap-1.5">
                  <span>ℹ️</span> Pasos rápidos de configuración:
                </p>
                <ol className="list-decimal pl-5 space-y-1 text-blue-800 text-[11px]">
                  <li>En Telegram, abre <strong>@BotFather</strong> y usa el comando <code>/newbot</code>.</li>
                  <li>Pega el <strong>Token HTTP API</strong> que te proporcione en el campo inferior.</li>
                  <li>Agrega tu nuevo bot al grupo de tu empresa y dale permisos de escritura.</li>
                  <li>Pega el <strong>Chat ID</strong> del grupo (ej: <code>-100123456789</code>).</li>
                </ol>
              </div>

              <div className="space-y-4 pt-1">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Token del Bot (HTTP API)
                  </label>
                  <input
                    type="password"
                    value={config.telegramBotToken || ''}
                    onChange={(e) => setConfig({ ...config, telegramBotToken: e.target.value })}
                    disabled={isReadOnly || !isAdmin}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-mono text-sm focus:ring-2 focus:ring-blue-500/50 outline-none transition-all disabled:opacity-50"
                    placeholder="Ej: 1234567890:ABCdefGhIjkLmnOpQRstuVWXyz"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Chat ID (Grupo de Destino)
                  </label>
                  <input
                    type="text"
                    value={config.telegramChatId || ''}
                    onChange={(e) => setConfig({ ...config, telegramChatId: e.target.value })}
                    disabled={isReadOnly || !isAdmin}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-mono text-sm focus:ring-2 focus:ring-blue-500/50 outline-none transition-all disabled:opacity-50"
                    placeholder="Ej: -100123456789"
                  />
                  <p className="text-[11px] text-slate-500 mt-1.5">El ID de grupos de Telegram suele comenzar con -100.</p>
                </div>
              </div>

              {testResult !== 'idle' && testingService === 'telegram' && (
                <div className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                  testResult === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {testMessage}
                </div>
              )}

              {/* Botones de Acción */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleTestGlobalTelegram}
                  disabled={testingService !== 'none' || !isAdmin || isReadOnly}
                  className="flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-blue-50 text-blue-700 font-extrabold hover:bg-blue-100 border border-blue-200 transition-all text-xs disabled:opacity-50"
                >
                  {testingService === 'telegram' ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  <span>Probar Conexión Telegram</span>
                </button>

                {isAdmin && !isReadOnly && (
                  <button
                    type="button"
                    onClick={handleSaveConfig}
                    disabled={isSavingConfig}
                    className="flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-blue-600 text-white font-extrabold hover:bg-blue-700 active:scale-[0.99] transition-all shadow-md shadow-blue-500/20 text-xs disabled:opacity-50"
                  >
                    {isSavingConfig ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : saveStatus === 'success' ? (
                      <CheckCircle2 size={16} />
                    ) : (
                      <Save size={16} />
                    )}
                    <span>{saveStatus === 'success' ? '¡Cambios Guardados!' : 'Guardar Cambios de Telegram'}</span>
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* =================================================================== */}
        {/* TAB: AUTOMATIZACIÓN Y SINCRONIZACIÓN AQUANOVA                       */}
        {/* =================================================================== */}
        {activeTab === 'aquanova' && (
          <motion.div
            key="tab-aquanova"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
          >
            <AquanovaSettingsTab />
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
                <div className="group relative p-4 bg-emerald-50/60 rounded-xl border border-emerald-200/70 shadow-sm transition-all hover:shadow-md space-y-3">
                  {/* Header of the note */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-emerald-200/60 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Clock size={15} className="text-emerald-600" />
                        <h4 className="text-sm font-bold text-slate-800">
                          Borrador en Vivo
                        </h4>

                        {/* Indicador de 3 puntos en movimiento suave y constante */}
                        <div className="flex items-center gap-1 ml-1" title="Actualizándose constantemente en vivo">
                          {[0, 1, 2].map((i) => (
                            <motion.span
                              key={i}
                              className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"
                              animate={{
                                opacity: [0.25, 1, 0.25],
                                scale: [0.75, 1.25, 0.75],
                                y: [0, -3.5, 0],
                              }}
                              transition={{
                                duration: 1,
                                repeat: Infinity,
                                ease: 'easeInOut',
                                delay: i * 0.18,
                              }}
                            />
                          ))}
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 font-medium">
                        Corte programado para las {config.shiftEndTime || '18:00'}
                      </p>
                    </div>

                    {/* Action Buttons con la misma discreción y estilo de las notas */}
                    <div className="flex items-center gap-1.5 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => handleCopyBackup(stagedBackup)}
                        className="p-1.5 rounded-lg bg-white/70 hover:bg-white text-slate-600 hover:text-slate-900 transition-colors shadow-sm border border-emerald-200/60"
                        title="Copiar reporte al portapapeles"
                      >
                        {copiedId === stagedBackup.id ? (
                          <Check size={14} className="text-emerald-600" />
                        ) : (
                          <Copy size={14} />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={handleSendStagedNow}
                        disabled={resendingId === 'staged_upcoming_report'}
                        className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-sm disabled:opacity-50"
                        title="Enviar a WhatsApp ahora"
                      >
                        {resendingId === 'staged_upcoming_report' ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Send size={14} />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Note message preview */}
                  <div className="text-slate-700 text-[13px] whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto custom-scrollbar select-text bg-white/50 p-4 rounded-xl shadow-sm border border-slate-100 font-sans">
                    {stagedBackup.message}
                  </div>

                  {resendStatus && resendStatus.id === 'staged_upcoming_report' && (
                    <div className={`p-2 rounded-lg text-[11px] font-medium flex items-center gap-1.5 ${
                      resendStatus.success ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'
                    }`}>
                      {resendStatus.success ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
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
                          className="group relative p-4 bg-yellow-50/60 rounded-xl border border-yellow-200/50 shadow-sm transition-all hover:shadow-md space-y-3"
                        >
                          {/* Header of the note */}
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-yellow-200/50 pb-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <FileText size={14} className="text-yellow-600" />
                                <h4 className="text-sm font-bold text-slate-800">
                                  {isManual ? 'Reporte Manual' : 'Corte de Turno'}
                                </h4>
                                {isSuccess && (
                                  <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-100/50 px-1.5 py-0.5 rounded">
                                    <CheckCircle2 size={10} /> Enviado
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 mt-1 font-medium">
                                {formattedDate} • {bk.recipient}
                              </p>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center gap-1.5 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={() => handleCopyBackup(bk)}
                                className="p-1.5 rounded-lg bg-white/60 hover:bg-white text-slate-600 hover:text-slate-900 transition-colors shadow-sm border border-yellow-200/50"
                                title="Copiar reporte al portapapeles"
                              >
                                {copiedId === bk.id ? (
                                  <Check size={14} className="text-emerald-600" />
                                ) : (
                                  <Copy size={14} />
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleResendBackup(bk)}
                                disabled={resendingId === bk.id}
                                className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-sm disabled:opacity-50"
                                title="Reenviar a WhatsApp"
                              >
                                {resendingId === bk.id ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : (
                                  <Send size={14} />
                                )}
                              </button>

                              {isAdmin && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSingleBackup(bk.id)}
                                  className="p-1.5 rounded-lg bg-white/60 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors shadow-sm border border-yellow-200/50"
                                  title="Eliminar registro"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Error notice if present */}
                          {bk.error && (
                            <div className="px-3 py-2 rounded-lg bg-rose-50/80 border border-rose-200/50 text-rose-700 text-xs font-medium flex items-center gap-1.5">
                              <AlertCircle size={14} className="shrink-0 text-rose-600" />
                              <span>{bk.error}</span>
                            </div>
                          )}

                          {/* Note message preview */}
                          <div className="text-slate-700 text-[13px] whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto custom-scrollbar select-text bg-white/50 p-4 rounded-xl shadow-sm border border-slate-100 font-sans">
                            {bk.message}
                          </div>

                          {/* Resend status */}
                          {resendStatus && resendStatus.id === bk.id && (
                            <div className={`p-2 rounded-lg text-[11px] font-medium flex items-center gap-1.5 ${
                              resendStatus.success ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'
                            }`}>
                              {resendStatus.success ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
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
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xs space-y-6">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-amber-100 text-amber-700 rounded-2xl border border-amber-200/60">
                    <Sliders size={22} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Mantenimiento y Actualizaciones del Sistema</h2>
                    <p className="text-xs text-slate-500 font-medium">Controla en vivo el aviso de actualización en las pantallas de todos los trabajadores y teléfonos</p>
                  </div>
                </div>

                <span className={`px-3 py-1 text-xs font-black rounded-xl border flex items-center gap-1.5 shadow-2xs ${
                  config.isUpdatingApp
                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                    : 'bg-slate-100 text-slate-700 border-slate-200'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${config.isUpdatingApp ? 'bg-amber-500 animate-pulse' : 'bg-slate-400'}`}></span>
                  <span>{config.isUpdatingApp ? 'Aviso Activo en Pantallas' : 'Modo Normal (Sin Aviso)'}</span>
                </span>
              </div>

              {/* Status Banner */}
              <div className={`p-4 rounded-2xl border transition-all ${
                config.isUpdatingApp 
                  ? 'bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 border-amber-300/80' 
                  : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                      <Radio size={14} className={config.isUpdatingApp ? 'text-amber-600 animate-pulse' : 'text-slate-400'} />
                      <span>{config.isUpdatingApp ? 'Transmisión de Aviso Activa en Firestore' : 'Aviso Desactivado'}</span>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      {config.isUpdatingApp
                        ? 'Todos los teléfonos móviles y computadoras conectadas tienen actualmente la notificación visible en pantalla pidiéndoles actualizar su caché.'
                        : 'Activa esta opción cuando realices cambios en GitHub o el sistema para que todos los usuarios sepan que una actualización está en proceso.'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={isReadOnly || !isAdmin}
                      onClick={async () => {
                        sounds.playClick();
                        const nextState = !config.isUpdatingApp;
                        const newConfig = {
                          ...config,
                          isUpdatingApp: nextState,
                          updateNotice: config.updateNotice || 'Sincronizando mejoras en el sistema. Puedes continuar usando la app con normalidad.',
                          lastUpdatedTimestamp: new Date().toISOString()
                        };
                        setConfig(newConfig);
                        try {
                          await setDoc(doc(db, 'config', 'app_settings'), newConfig, { merge: true });
                          sounds.playSuccess();
                        } catch (err) {
                          console.error('Error toggling update state:', err);
                        }
                      }}
                      className={`px-4 py-2 rounded-xl text-xs font-black transition-all shadow-xs active:scale-95 ${
                        config.isUpdatingApp
                          ? 'bg-rose-500 hover:bg-rose-600 text-white'
                          : 'bg-amber-500 hover:bg-amber-600 text-slate-950'
                      }`}
                    >
                      {config.isUpdatingApp ? 'Desactivar Aviso' : 'Activar Aviso Global'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Notice Message Configuration */}
              <div className="space-y-2 pt-1">
                <label className="text-xs font-bold text-slate-800">
                  Mensaje Opcional para el Equipo
                </label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    value={config.updateNotice || ''}
                    disabled={isReadOnly || !isAdmin}
                    placeholder="Sincronizando mejoras en el sistema. Puedes continuar usando la app con normalidad."
                    onChange={(e) => setConfig({ ...config, updateNotice: e.target.value })}
                    className="flex-1 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-slate-800"
                  />
                  <button
                    type="button"
                    disabled={isReadOnly || !isAdmin}
                    onClick={async () => {
                      sounds.playClick();
                      try {
                        await setDoc(doc(db, 'config', 'app_settings'), {
                          updateNotice: config.updateNotice || 'Sincronizando mejoras en el sistema. Puedes continuar usando la app con normalidad.',
                          lastUpdatedTimestamp: new Date().toISOString()
                        }, { merge: true });
                        sounds.playSuccess();
                        alert('Mensaje guardado exitosamente.');
                      } catch (err) {
                        console.error('Error saving update notice:', err);
                      }
                    }}
                    className="py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs shrink-0"
                  >
                    Guardar Mensaje
                  </button>
                </div>
              </div>

              {/* Cache Cleaning */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-bold text-slate-900">Limpieza Profunda de Caché en este Dispositivo</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Elimina Service Workers, vacía CacheStorage y fuerza la descarga de los archivos nuevos más recientes sin cerrar tu sesión de usuario.
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
                    if ('caches' in window) {
                      const cacheNames = await caches.keys();
                      for (const name of cacheNames) {
                        await caches.delete(name);
                      }
                    }
                    try {
                      localStorage.removeItem('app_version');
                      sessionStorage.clear();
                    } catch (e) {
                      // ignore
                    }
                    window.location.replace(window.location.origin + window.location.pathname + '?reload=' + Date.now());
                  }}
                  className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-xs transition-all whitespace-nowrap self-start sm:self-auto flex items-center gap-1.5 shadow-2xs"
                >
                  <RefreshCw size={13} />
                  <span>Limpiar y Recargar Ahora</span>
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
                            disabled={isResetting || resetStatus === 'success'}
                            onChange={(e) => setResetConfirmText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && resetConfirmText.trim().toLowerCase() === 'restablecer' && !isResetting && resetStatus !== 'success') {
                                handleResetAllData();
                              }
                            }}
                            placeholder="Escribe restablecer aquí..."
                            className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:ring-2 focus:ring-rose-500/50 outline-none text-xs font-bold disabled:opacity-50"
                          />
                        </div>

                        {/* Progress Bar during reset */}
                        {isResetting && (
                          <div className="p-4 rounded-2xl bg-rose-50/80 border border-rose-200 space-y-2.5">
                            <div className="flex items-center justify-between text-xs font-bold text-rose-950">
                              <div className="flex items-center gap-2">
                                <Loader2 className="animate-spin text-rose-600 shrink-0" size={16} />
                                <span className="line-clamp-1">{resetProgressMessage || 'Restableciendo datos...'}</span>
                              </div>
                              <span className="text-rose-600 font-extrabold shrink-0 ml-2">{resetProgressPercent}%</span>
                            </div>
                            <div className="w-full h-2.5 bg-rose-200/60 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-rose-600 rounded-full transition-all duration-300 ease-out"
                                style={{ width: `${resetProgressPercent}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Success message inside modal */}
                        {resetStatus === 'success' && (
                          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center gap-2.5 text-xs font-bold text-emerald-900">
                            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                            <span>¡Listo! Todos los historiales fueron borrados y los equipos reiniciados.</span>
                          </div>
                        )}

                        {/* Error message inside modal */}
                        {resetErrorMessage && (
                          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-start gap-2.5">
                            <AlertCircle size={18} className="text-rose-600 shrink-0 mt-0.5" />
                            <div>
                              <div className="font-extrabold text-rose-950">No se pudo completar el restablecimiento:</div>
                              <div className="text-[11px] font-medium text-rose-700 mt-1 leading-relaxed">{resetErrorMessage}</div>
                            </div>
                          </div>
                        )}

                        <div className="flex gap-3 pt-1">
                          <button
                            type="button"
                            disabled={isResetting}
                            onClick={() => {
                              sounds.playClick();
                              setShowResetConfirm(false);
                              setResetConfirmText('');
                              setResetErrorMessage(null);
                            }}
                            className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-200 disabled:opacity-50 transition-all"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={handleResetAllData}
                            disabled={isResetting || resetStatus === 'success' || resetConfirmText.trim().toLowerCase() !== 'restablecer'}
                            className="flex-1 py-3 bg-rose-600 text-white font-black text-xs rounded-xl hover:bg-rose-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-md shadow-rose-600/20"
                          >
                            {isResetting ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                            <span>{isResetting ? 'Restableciendo...' : 'Confirmar'}</span>
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
