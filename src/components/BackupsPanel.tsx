import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Database, 
  RefreshCw, 
  Trash2, 
  AlertTriangle, 
  Loader2, 
  Send, 
  Check, 
  Copy, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  FileText,
  Filter
} from 'lucide-react';
import { collection, query, orderBy, limit, getDocs, onSnapshot, doc, deleteDoc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useProfile } from '../context/ProfileContext';
import { sounds } from '../utils/sounds';
import { format } from 'date-fns';
import { sendWhatsAppMessageDirect } from '../whatsapp';
import { updateStagedUpcomingReport } from '../services/reportBuilder';

export interface WhatsAppBackupRecord {
  id: string;
  timestamp: string;
  recipient: string;
  message: string;
  status: 'success' | 'failed' | 'scheduled' | 'saved' | 'manual' | string;
  error?: string | null;
  provider?: string;
  type?: string;
}

export const BackupsPanel: React.FC = () => {
  const { profile } = useProfile();
  const isAdmin = profile?.role === 'admin';

  const [backups, setBackups] = useState<WhatsAppBackupRecord[]>([]);
  const [stagedBackup, setStagedBackup] = useState<WhatsAppBackupRecord | null>(null);
  const [isLoadingBackups, setIsLoadingBackups] = useState(true);
  const [isClearingBackups, setIsClearingBackups] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [backupSearch, setBackupSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'success' | 'saved' | 'manual' | 'failed'>('all');
  
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resendStatus, setResendStatus] = useState<{ id: string; success: boolean; message: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isRefreshingDraft, setIsRefreshingDraft] = useState(false);
  const [config, setConfig] = useState<any>({});

  // Cargar configuración de WhatsApp/notificaciones
  useEffect(() => {
    const loadConfig = async () => {
      try {
        if (!db) return;
        const configDoc = await getDoc(doc(db, 'config', 'app_settings'));
        if (configDoc.exists()) {
          setConfig(configDoc.data() || {});
        }
      } catch (err) {
        console.warn('Error loading app config for backups:', err);
      }
    };
    loadConfig();
  }, []);

  const fetchBackups = async () => {
    setIsLoadingBackups(true);
    try {
      if (!db) return;
      const backupsRef = collection(db, 'whatsapp_backups');
      const q = query(backupsRef, orderBy('timestamp', 'desc'), limit(150));
      const snapshot = await getDocs(q);
      const fetchedBackups: any[] = [];
      snapshot.forEach(docSnap => fetchedBackups.push({ id: docSnap.id, ...docSnap.data() }));
      
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
      console.error('Error fetching backups:', err);
    } finally {
      setIsLoadingBackups(false);
    }
  };

  useEffect(() => {
    fetchBackups();
    // Auto-update the live draft as soon as Backups is opened
    updateStagedUpcomingReport().catch((err) => console.warn('Auto-stage on mount:', err));

    if (!db) return;

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
      console.warn('Firestore listener on whatsapp_backups failed:', err);
    });

    return () => unsub();
  }, []);

  const handleRefreshDraft = async () => {
    sounds.playClick();
    setIsRefreshingDraft(true);
    try {
      const res = await updateStagedUpcomingReport({
        shiftStartTime: config.shiftStartTime,
        shiftEndTime: config.shiftEndTime
      });
      setStagedBackup({
        id: 'staged_upcoming_report',
        timestamp: new Date().toISOString(),
        recipient: 'Grupo WhatsApp (Programado)',
        message: res.text,
        status: 'scheduled',
        error: null,
        provider: ''
      });
      sounds.playSuccess();
    } catch (err) {
      console.warn('Error refreshing live draft:', err);
      sounds.playError();
    } finally {
      setIsRefreshingDraft(false);
    }
  };

  const handleSendStagedNow = async () => {
    sounds.playClick();
    setResendingId('staged_upcoming_report');
    setResendStatus(null);
    try {
      let messageToSend = stagedBackup?.message || '';
      try {
        const fresh = await updateStagedUpcomingReport({
          shiftStartTime: config.shiftStartTime,
          shiftEndTime: config.shiftEndTime
        });
        if (fresh?.text) messageToSend = fresh.text;
      } catch (e) {
        console.warn('Fallback to existing message:', e);
      }

      if (!messageToSend) {
        throw new Error('No hay mensaje generado para enviar.');
      }

      const response = await sendWhatsAppMessageDirect(
        messageToSend,
        config,
        stagedBackup?.recipient || 'Grupo WhatsApp (Programado)'
      );
      if (response.success) {
        sounds.playSuccess();
        setResendStatus({ id: 'staged_upcoming_report', success: true, message: '¡Reporte pre-generado enviado exitosamente a WhatsApp!' });
        if (db) {
          const backupId = `bk_${Date.now()}`;
          await setDoc(doc(db, 'whatsapp_backups', backupId), {
            id: backupId,
            timestamp: new Date().toISOString(),
            recipient: stagedBackup?.recipient || 'Grupo WhatsApp (Programado)',
            message: messageToSend,
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
      console.error('Error deleting backup:', err);
    }
  };

  const handleClearAllBackups = async () => {
    sounds.playClick();
    setIsClearingBackups(true);
    try {
      if (db) {
        const backupsRef = collection(db, 'whatsapp_backups');
        const snapshot = await getDocs(backupsRef);
        const batchPromises = snapshot.docs.map(document => deleteDoc(doc(db, 'whatsapp_backups', document.id)));
        await Promise.all(batchPromises);
      }
      setBackups([]);
      setShowClearConfirm(false);
      sounds.playSuccess();
    } catch (err) {
      console.error('Error clearing backups:', err);
      sounds.playError();
    } finally {
      setIsClearingBackups(false);
    }
  };

  const filteredBackups = backups.filter(b => {
    const matchesSearch = !backupSearch || 
      b.message.toLowerCase().includes(backupSearch.toLowerCase()) || 
      b.recipient.toLowerCase().includes(backupSearch.toLowerCase());

    if (!matchesSearch) return false;

    if (filterStatus === 'all') return true;
    if (filterStatus === 'success') return b.status === 'success';
    if (filterStatus === 'saved') return b.status === 'saved';
    if (filterStatus === 'manual') return b.status === 'manual';
    if (filterStatus === 'failed') return b.status !== 'success' && b.status !== 'saved' && b.status !== 'manual';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Encabezado del Módulo */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 mb-1 flex items-center gap-3">
            <span className="p-2 bg-blue-100 text-blue-600 rounded-2xl">
              <Database size={28} />
            </span>
            Respaldos
          </h2>
          <p className="text-slate-600 font-medium text-sm">
            Historial centralizado de reportes automáticos, manuales y copias de seguridad de envíos
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchBackups}
            disabled={isLoadingBackups}
            className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-all flex items-center gap-2 text-sm font-semibold shadow-xs disabled:opacity-50"
            title="Actualizar lista de respaldos"
          >
            <RefreshCw size={15} className={isLoadingBackups ? 'animate-spin text-blue-600' : ''} />
            <span>Actualizar</span>
          </button>

          {isAdmin && backups.length > 0 && (
            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              className="h-10 px-4 rounded-xl border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 transition-all flex items-center gap-1.5 text-sm font-semibold shadow-xs"
            >
              <Trash2 size={15} />
              <span>Vaciar Historial</span>
            </button>
          )}
        </div>
      </div>

      {/* Alerta de confirmación para vaciar historial */}
      <AnimatePresence>
        {showClearConfirm && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-sm space-y-3 shadow-sm"
          >
            <div className="flex items-center gap-2.5 font-bold text-rose-900">
              <AlertTriangle size={18} className="text-rose-600 shrink-0" />
              <span>¿Confirmas que deseas eliminar todo el historial de respaldo permanentemente?</span>
            </div>
            <p className="text-xs text-rose-700">
              Esta acción no se puede deshacer. Se borrarán todas las copias de los reportes guardados en la base de datos.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleClearAllBackups}
                disabled={isClearingBackups}
                className="h-8 px-4 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition-colors text-xs flex items-center gap-1.5"
              >
                {isClearingBackups ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                <span>Sí, eliminar todo</span>
              </button>
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="h-8 px-4 bg-white text-slate-700 border border-slate-200 rounded-xl font-bold hover:bg-slate-50 transition-colors text-xs"
              >
                Cancelar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tarjeta de Borrador en Vivo / Staged Upcoming Report */}
      {stagedBackup ? (
        <div className="p-5 bg-gradient-to-br from-amber-50 to-orange-50/40 rounded-2xl border border-amber-200 text-sm space-y-3 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-amber-500 text-white flex items-center gap-1 shadow-xs">
                ⚡ Borrador en Vivo
              </span>
              <span className="text-xs text-amber-900 font-bold">
                Corte programado: {config.shiftEndTime || '18:00'}
              </span>
              <span className="text-[11px] text-amber-700 font-medium bg-amber-100/60 px-2 py-0.5 rounded-md">
                Sincronizado con Panel de Registro
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleRefreshDraft}
                disabled={isRefreshingDraft}
                className="h-8 px-3 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-50 active:scale-95"
                title="Recalcular con los datos más recientes del panel de registro"
              >
                <RefreshCw size={13} className={isRefreshingDraft ? 'animate-spin' : ''} />
                <span>{isRefreshingDraft ? 'Actualizando...' : 'Actualizar Borrador'}</span>
              </button>

              <button
                type="button"
                onClick={handleSendStagedNow}
                disabled={resendingId === 'staged_upcoming_report'}
                className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-50 active:scale-95"
                title="Enviar borrador a WhatsApp inmediatamente"
              >
                {resendingId === 'staged_upcoming_report' ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                <span>Enviar Ahora</span>
              </button>

              <button
                type="button"
                onClick={() => handleCopyBackup(stagedBackup)}
                className="h-8 px-3 bg-white border border-amber-200 text-amber-900 hover:bg-amber-100/60 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 active:scale-95"
                title="Copiar texto del borrador"
              >
                {copiedId === stagedBackup.id ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                <span>{copiedId === stagedBackup.id ? 'Copiado' : 'Copiar'}</span>
              </button>
            </div>
          </div>

          <div className="bg-slate-900 text-slate-100 p-3.5 rounded-xl font-mono text-xs overflow-x-auto border border-slate-800 whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto select-all">
            {stagedBackup.message}
          </div>

          {resendStatus && resendStatus.id === 'staged_upcoming_report' && (
            <div className={`p-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 ${
              resendStatus.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}>
              {resendStatus.success ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
              <span>{resendStatus.message}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="p-5 bg-gradient-to-br from-amber-50 to-orange-50/40 rounded-2xl border border-amber-200 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div>
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md text-xs font-black bg-amber-500 text-white">⚡ Borrador en Vivo</span>
              Borrador del Turno Actual
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Genera la previsualización del reporte con los datos y estados del Panel de Registro.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRefreshDraft}
            disabled={isRefreshingDraft}
            className="h-9 px-4 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 active:scale-95"
          >
            <RefreshCw size={14} className={isRefreshingDraft ? 'animate-spin' : ''} />
            <span>{isRefreshingDraft ? 'Generando...' : 'Generar Borrador'}</span>
          </button>
        </div>
      )}

      {/* Barra de Filtro y Búsqueda */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={backupSearch}
            onChange={(e) => setBackupSearch(e.target.value)}
            placeholder="Buscar por texto del reporte, destinatario o fecha..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all font-medium"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-400 font-semibold text-[11px] px-1 hidden sm:inline flex items-center gap-1">
            <Filter size={12} /> Estado:
          </span>
          {[
            { id: 'all', label: 'Todos' },
            { id: 'success', label: 'Enviados' },
            { id: 'saved', label: 'Guardados' },
            { id: 'manual', label: 'Manuales' },
            { id: 'failed', label: 'Fallidos' }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => {
                sounds.playClick();
                setFilterStatus(f.id as any);
              }}
              className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${
                filterStatus === f.id
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de Respaldos */}
      {isLoadingBackups ? (
        <div className="bg-white rounded-2xl p-12 border border-slate-200 text-center space-y-3">
          <Loader2 size={28} className="animate-spin mx-auto text-blue-600" />
          <p className="text-sm font-semibold text-slate-600">Cargando historial de respaldos...</p>
        </div>
      ) : filteredBackups.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 border border-dashed border-slate-300 text-center space-y-2">
          <Database size={36} className="mx-auto text-slate-300" />
          <h3 className="text-base font-bold text-slate-700">No se encontraron respaldos</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {backupSearch || filterStatus !== 'all'
              ? 'No hay registros que coincidan con la búsqueda o filtro seleccionado.'
              : 'Los reportes generados o enviados automáticamente se guardarán en esta sección.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-xs font-semibold text-slate-500 px-1">
            Mostrando {filteredBackups.length} {filteredBackups.length === 1 ? 'respaldo' : 'respaldos'}
          </div>

          {filteredBackups.map((bk) => {
            const isSuccess = bk.status === 'success';
            const isSaved = bk.status === 'saved';
            const isManual = bk.status === 'manual';
            const formattedDate = bk.timestamp 
              ? format(new Date(bk.timestamp), 'dd/MM/yyyy · hh:mm a')
              : 'Fecha no registrada';

            return (
              <div
                key={bk.id}
                className="p-4 bg-white rounded-2xl border border-slate-200 hover:border-slate-300 shadow-xs hover:shadow-sm transition-all space-y-3"
              >
                {/* Fila superior de información y acciones */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 ${
                      isSuccess 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                        : isSaved
                          ? 'bg-sky-50 text-sky-700 border border-sky-200'
                          : isManual
                            ? 'bg-slate-100 text-slate-700 border border-slate-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}>
                      {isSuccess ? <CheckCircle2 size={12} /> : isSaved ? <Database size={12} /> : isManual ? <FileText size={12} /> : <AlertCircle size={12} />}
                      {isSuccess 
                        ? 'Enviado a WhatsApp' 
                        : isSaved 
                          ? 'Respaldo Guardado' 
                          : isManual
                            ? 'Corte Manual'
                            : 'Falla al Enviar'}
                    </span>

                    <span className="text-slate-600 font-mono text-xs font-medium">
                      {formattedDate}
                    </span>

                    <span className="text-slate-300 text-xs hidden sm:inline">•</span>

                    <span className="text-slate-500 text-xs truncate max-w-xs" title={bk.recipient}>
                      {bk.recipient || 'Destino no especificado'}
                    </span>
                  </div>

                  {/* Acciones */}
                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      type="button"
                      onClick={() => handleCopyBackup(bk)}
                      className="h-7 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors flex items-center gap-1 active:scale-95"
                      title="Copiar reporte al portapapeles"
                    >
                      {copiedId === bk.id ? (
                        <Check size={12} className="text-emerald-600" />
                      ) : (
                        <Copy size={12} className="text-slate-500" />
                      )}
                      <span>{copiedId === bk.id ? 'Copiado' : 'Copiar'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleResendBackup(bk)}
                      disabled={resendingId === bk.id}
                      className="h-7 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors flex items-center gap-1 disabled:opacity-50 active:scale-95"
                      title="Reenviar este reporte a WhatsApp"
                    >
                      {resendingId === bk.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Send size={12} />
                      )}
                      <span>Reenviar</span>
                    </button>

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleDeleteSingleBackup(bk.id)}
                        className="h-7 w-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors flex items-center justify-center"
                        title="Eliminar este respaldo"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Notificación de error si existe */}
                {bk.error && (
                  <div className="px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                    <AlertCircle size={14} className="shrink-0 text-rose-600" />
                    <span>{bk.error}</span>
                  </div>
                )}

                {/* Vista previa del mensaje */}
                <div className="bg-slate-900 text-slate-200 p-3 rounded-xl font-mono text-xs overflow-x-auto border border-slate-800 whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto select-all">
                  {bk.message}
                </div>

                {/* Notificación de reenvío */}
                {resendStatus && resendStatus.id === bk.id && (
                  <div className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                    resendStatus.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
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
  );
};
export default BackupsPanel;
