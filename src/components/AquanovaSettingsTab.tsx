import React, { useState, useEffect } from 'react';
import { 
  Zap, 
  CheckCircle2, 
  RefreshCw, 
  AlertCircle, 
  Clock,
  Activity,
  Check,
  ChevronRight,
  ChevronLeft,
  Send,
  Cloud,
  Layers,
  Wrench,
  Gauge,
  Wind,
  FileText,
  ExternalLink,
  Copy,
  Bookmark,
  MousePointerClick,
  Sparkles,
  Eye,
  Sliders,
  Code,
  Terminal,
  Info,
  CheckCheck
} from 'lucide-react';
import { sounds } from '../utils/sounds';
import { db, auth } from '../firebase';
import { collection, getDocs, query, orderBy, limit, addDoc, serverTimestamp } from 'firebase/firestore';
import { GENERATOR_MAPPING } from '../constants';
import { generateAquanovaBrowserScript, generateBookmarkletHref, ShiftAutomationData } from '../utils/aquanovaClientBookmarklet';

const TANK_OPTIONS = Array.from({ length: 60 }, (_, i) => `T${String(i + 1).padStart(3, '0')}`);
const TIEMPO_OPTIONS = ['< 1 hora', '1 a 2 horas', '2 a 4 horas', '4 a 6 horas', 'Mayor a 6 horas'];

export const AquanovaSettingsTab: React.FC = () => {
  const [activeMode, setActiveMode] = useState<'live_browser' | 'internal_form'>('live_browser');
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [cloudMsg, setCloudMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showCodeViewer, setShowCodeViewer] = useState(false);

  // Form State initialized with defaults
  const [formData, setFormData] = useState<ShiftAutomationData>({
    fecha: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    day: new Date().getDate().toString().padStart(2, '0'),
    month: (new Date().getMonth() + 1).toString().padStart(2, '0'),
    year: new Date().getFullYear().toString(),
    userEmail: 'jorgealvarez.lj17@gmail.com',
    continuidadCorpoelec: 'Si',
    duracionFallaCorpoelec: 0,
    fallaVoltaje: 'No',
    duracionFallaVoltaje: 0,
    mantenimientoCorrectivo: [],
    obsCorrectivo: '',
    mantenimientoPreventivo: [],
    obsPreventivo: '',
    generadoresInoperativos: [],
    obsInoperativo: '',
    maternidadVeces: 0,
    maternidadTiempo: '< 1 hora',
    campamentoVeces: 0,
    campamentoTiempo: '< 1 hora',
    subestacionVeces: 0,
    subestacionTiempo: '< 1 hora',
    bombeoPlayaMinutos: 0,
    bombeoPozoMinutos: 0,
    blowersVeces: '1 vez',
    blowerHora1: 'Continuo sin interrupciones',
    blowerHora2: '',
    blowerHora3: '',
    fallaInterna: 'Sin novedades relevantes durante el turno'
  });

  const fetchAndCalculateShiftData = async () => {
    setLoadingData(true);
    try {
      // 1. Fetch server calculated/cached baseline
      const res = await fetch('/api/aquanova/shift-data');
      const json = await res.json();
      let base = json.success && json.data ? json.data : {};

      const now = new Date();
      const formatter = new Intl.DateTimeFormat('es-VE', {
        timeZone: 'America/Caracas',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const parts = formatter.formatToParts(now);
      const day = parts.find(p => p.type === 'day')?.value || String(now.getDate()).padStart(2, '0');
      const month = parts.find(p => p.type === 'month')?.value || String(now.getMonth() + 1).padStart(2, '0');
      const year = parts.find(p => p.type === 'year')?.value || String(now.getFullYear());
      const fecha = `${day}/${month}/${year}`;

      let calculated: ShiftAutomationData = {
        fecha,
        day,
        month,
        year,
        userEmail: auth.currentUser?.email || 'jorgealvarez.lj17@gmail.com',
        continuidadCorpoelec: base.continuidadCorpoelec || 'Si',
        duracionFallaCorpoelec: base.duracionFallaCorpoelec || 0,
        fallaVoltaje: base.fallaVoltaje || 'No',
        duracionFallaVoltaje: base.duracionFallaVoltaje || 0,
        mantenimientoCorrectivo: base.mantenimientoCorrectivo || [],
        obsCorrectivo: base.obsCorrectivo || '',
        mantenimientoPreventivo: base.mantenimientoPreventivo || [],
        obsPreventivo: base.obsPreventivo || '',
        generadoresInoperativos: base.generadoresInoperativos || [],
        obsInoperativo: base.obsInoperativo || '',
        maternidadVeces: base.maternidadVeces || 0,
        maternidadTiempo: base.maternidadTiempo || '< 1 hora',
        campamentoVeces: base.campamentoVeces || 0,
        campamentoTiempo: base.campamentoTiempo || '< 1 hora',
        subestacionVeces: base.subestacionVeces || 0,
        subestacionTiempo: base.subestacionTiempo || '< 1 hora',
        bombeoPlayaMinutos: base.bombeoPlayaMinutos || 0,
        bombeoPozoMinutos: base.bombeoPozoMinutos || 0,
        blowersVeces: base.blowersVeces || '1 vez',
        blowerHora1: base.blowerHora1 || 'Continuo sin interrupciones',
        blowerHora2: base.blowerHora2 || '',
        blowerHora3: base.blowerHora3 || '',
        fallaInterna: base.fallaInterna || 'Sin novedades relevantes durante el turno'
      };

      // 2. Real-time compute from Firestore if client session active
      if (db) {
        try {
          const [equipSnap, catSnap, powerEventsSnap] = await Promise.all([
            getDocs(collection(db, 'equipment')),
            getDocs(collection(db, 'categories')),
            getDocs(query(collection(db, 'power_events'), orderBy('timestamp', 'desc'), limit(50)))
          ]);

          const categories: Record<string, string> = {};
          catSnap.forEach(d => {
            categories[d.id] = (d.data().name || '').toLowerCase();
          });

          let maternidadVeces = 0;
          let maternidadMin = 0;
          let campamentoVeces = 0;
          let campamentoMin = 0;
          let subestacionVeces = 0;
          let subestacionMin = 0;
          let bombeoPlayaMinutos = 0;
          let bombeoPozoMinutos = 0;

          equipSnap.forEach(d => {
            const data = d.data();
            const name = (data.name || '').toLowerCase();
            const cat = categories[data.categoryId] || '';
            const min = Math.round((data.totalUsageTime || 0) / 60);

            if (name.includes('maternidad') && (cat.includes('generador') || name.includes('generador') || name.includes('ge'))) {
              if (data.status === 'on' || min > 0) {
                maternidadVeces = 1;
                maternidadMin = min;
              }
            } else if (name.includes('campamento') && (cat.includes('generador') || name.includes('generador') || name.includes('ge'))) {
              if (data.status === 'on' || min > 0) {
                campamentoVeces = 1;
                campamentoMin = min;
              }
            } else if ((name.includes('subestacion') || name.includes('sub_estacion') || cat.includes('subestacion')) && (cat.includes('generador') || name.includes('generador') || name.includes('ge'))) {
              if (data.status === 'on' || min > 0) {
                subestacionVeces = 1;
                subestacionMin = min;
              }
            } else if (name.includes('playa') && (name.includes('bomba') || cat.includes('bomba'))) {
              bombeoPlayaMinutos = min;
            } else if ((name.includes('pozo') || name.includes('pozo #4')) && (name.includes('bomba') || cat.includes('bomba'))) {
              bombeoPozoMinutos = min;
            }
          });

          const mapTimeToLabel = (mins: number) => {
            if (mins <= 0) return '< 1 hora';
            const h = mins / 60;
            if (h < 1) return '< 1 hora';
            if (h <= 2) return '1 a 2 horas';
            if (h <= 4) return '2 a 4 horas';
            if (h <= 6) return '4 a 6 horas';
            return 'Mayor a 6 horas';
          };

          let hayCorte = false;
          let duracionCorte = 0;
          let hayFalla = false;
          let duracionFalla = 0;

          powerEventsSnap.forEach(d => {
            const ev = d.data();
            if (!ev.timestamp) return;
            const evDate = ev.timestamp.toDate ? ev.timestamp.toDate() : new Date(ev.timestamp);
            if (now.getTime() - evDate.getTime() < 24 * 60 * 60 * 1000) {
              if (ev.type === 'corte') {
                hayCorte = true;
                duracionCorte += ev.durationMinutes || 0;
              } else if (ev.type === 'falla') {
                hayFalla = true;
                duracionFalla += ev.durationMinutes || 0;
              }
            }
          });

          calculated = {
            ...calculated,
            continuidadCorpoelec: hayCorte ? 'No' : 'Si',
            duracionFallaCorpoelec: duracionCorte,
            fallaVoltaje: hayFalla ? 'Si' : 'No',
            duracionFallaVoltaje: duracionFalla,
            maternidadVeces: maternidadVeces > 0 ? maternidadVeces : calculated.maternidadVeces,
            maternidadTiempo: maternidadMin > 0 ? mapTimeToLabel(maternidadMin) : calculated.maternidadTiempo,
            campamentoVeces: campamentoVeces > 0 ? campamentoVeces : calculated.campamentoVeces,
            campamentoTiempo: campamentoMin > 0 ? mapTimeToLabel(campamentoMin) : calculated.campamentoTiempo,
            subestacionVeces: subestacionVeces > 0 ? subestacionVeces : calculated.subestacionVeces,
            subestacionTiempo: subestacionMin > 0 ? mapTimeToLabel(subestacionMin) : calculated.subestacionTiempo,
            bombeoPlayaMinutos: bombeoPlayaMinutos > 0 ? bombeoPlayaMinutos : calculated.bombeoPlayaMinutos,
            bombeoPozoMinutos: bombeoPozoMinutos > 0 ? bombeoPozoMinutos : calculated.bombeoPozoMinutos,
          };
        } catch (dbErr) {
          console.warn("Notice calculating shift data:", dbErr);
        }
      }

      setFormData(calculated);

      // Keep server cache in sync for cloud autonomous workers
      await fetch('/api/aquanova/sync-shift-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(calculated)
      });
    } catch (err) {
      console.error("Error fetching shift data:", err);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    fetchAndCalculateShiftData();
  }, []);

  // Compute live browser automator script and bookmarklet URL from latest formData
  const currentBrowserScript = generateAquanovaBrowserScript(formData);
  const appOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const compactBookmarklet = `javascript:(function(){const s=document.createElement('script');s.src='${appOrigin}/api/aquanova/browser-automator.js?t='+Date.now();document.head.appendChild(s);})();`;
  const bookmarkletHref = compactBookmarklet;

  const handleCopyCode = async () => {
    sounds.playClick();
    try {
      await navigator.clipboard.writeText(currentBrowserScript);
      setCopiedCode(true);
      sounds.playSuccess();
      setTimeout(() => setCopiedCode(false), 3000);
    } catch (e) {
      alert("No se pudo copiar automáticamente. Puedes seleccionar el texto manualmente.");
    }
  };

  const handleCopyBookmarklet = async () => {
    sounds.playClick();
    try {
      await navigator.clipboard.writeText(compactBookmarklet);
      setCopiedLink(true);
      sounds.playSuccess();
      setTimeout(() => setCopiedLink(false), 3000);
    } catch (e) {
      alert("No se pudo copiar.");
    }
  };

  const handleNext = () => {
    sounds.playClick();
    if (currentStep < 5) setCurrentStep(prev => prev + 1);
  };

  const handlePrev = () => {
    sounds.playClick();
    if (currentStep > 1) setCurrentStep(prev => prev - 1);
  };

  const handleSubmitForm = async () => {
    sounds.playClick();
    setSubmitting(true);
    setCloudMsg(null);
    try {
      const payload = {
        ...formData,
        submittedAt: serverTimestamp(),
        submittedBy: auth.currentUser?.email || 'operador@aquanova.farm'
      };

      if (db) {
        await addDoc(collection(db, 'aquanova_submissions'), payload);
      }

      // Trigger cloud backend sync as well
      await fetch('/api/aquanova/cloud-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      sounds.playSuccess();
      setSubmittedSuccess(true);
    } catch (err: any) {
      sounds.playError();
      alert("Error al guardar el formulario: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleTriggerCloudDirect = async () => {
    sounds.playClick();
    setCloudSyncing(true);
    setCloudMsg(null);
    try {
      const res = await fetch('/api/aquanova/cloud-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.success) {
        sounds.playSuccess();
        setCloudMsg({ type: 'success', text: "¡Sincronizado y enviado directamente desde la nube con éxito!" });
      } else {
        sounds.playError();
        setCloudMsg({ type: 'error', text: data.error || "Error al enviar a la nube" });
      }
    } catch (err: any) {
      sounds.playError();
      setCloudMsg({ type: 'error', text: err.message || "Error de conexión" });
    } finally {
      setCloudSyncing(false);
    }
  };

  const toggleMultiSelect = (field: 'mantenimientoCorrectivo' | 'mantenimientoPreventivo' | 'generadoresInoperativos', item: string) => {
    setFormData(prev => {
      const list = prev[field] as string[];
      const exists = list.includes(item);
      const updated = exists ? list.filter(x => x !== item) : [...list, item];
      return { ...prev, [field]: updated };
    });
  };

  const steps = [
    { num: 1, name: 'Información General', icon: Zap },
    { num: 2, name: 'Mantenimientos', icon: Wrench },
    { num: 3, name: 'Generadores y Bombeo', icon: Gauge },
    { num: 4, name: 'Encendido de Blowers', icon: Wind },
    { num: 5, name: 'Novedades y Envío', icon: FileText },
  ];

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16">
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-cyan-950 text-white border border-cyan-500/20 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 text-xs font-bold uppercase tracking-wider mb-2">
              <Zap size={14} className="text-cyan-400" />
              Carga Diaria de Electricidad Aquanova
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white">
              Auto-Llenado en Vivo en Aquanova
            </h2>
            <p className="text-slate-300 text-sm mt-1 max-w-xl">
              Mira cómo la página real de Aquanova se llena automáticamente sección por sección con los datos de tu turno en Run Monitor.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchAndCalculateShiftData}
              disabled={loadingData}
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-xs flex items-center gap-2 transition-all active:scale-95 shadow-sm"
              title="Recalcular con los datos más recientes de Run Monitor"
            >
              <RefreshCw size={14} className={loadingData ? 'animate-spin' : ''} />
              <span>{loadingData ? 'Calculando...' : 'Recalcular Turno'}</span>
            </button>
          </div>
        </div>

        {/* MODE SWITCHER */}
        <div className="relative z-10 mt-6 pt-5 border-t border-slate-700/60 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setActiveMode('live_browser')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
              activeMode === 'live_browser'
                ? 'bg-cyan-500 text-slate-950 shadow-md font-black'
                : 'bg-white/10 text-slate-300 hover:bg-white/20'
            }`}
          >
            <Eye size={15} />
            <span>Ver Llenado en la Página Real de Aquanova</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveMode('internal_form')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
              activeMode === 'internal_form'
                ? 'bg-cyan-500 text-slate-950 shadow-md font-black'
                : 'bg-white/10 text-slate-300 hover:bg-white/20'
            }`}
          >
            <Sliders size={15} />
            <span>Formulario Manual de Respaldo</span>
          </button>
        </div>
      </div>

      {/* Cloud Notification Message */}
      {cloudMsg && (
        <div className={`p-4 rounded-xl border text-sm font-medium flex items-center gap-2 ${
          cloudMsg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {cloudMsg.type === 'success' ? <CheckCircle2 size={18} className="text-emerald-600" /> : <AlertCircle size={18} className="text-rose-600" />}
          <span>{cloudMsg.text}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODO 1: AUTO-LLENADO EN VIVO EN LA PÁGINA REAL DE AQUANOVA                */}
      {/* ========================================================================= */}
      {activeMode === 'live_browser' && (
        <div className="space-y-6">
          {/* Main Action Box */}
          <div className="bg-white border-2 border-cyan-500/30 rounded-2xl p-6 sm:p-8 shadow-lg">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-100 text-cyan-800 flex items-center justify-center font-bold shrink-0">
                <Sparkles size={22} className="text-cyan-600" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">
                  Ver el Llenado en Vivo en la Página Real de Aquanova
                </h3>
                <p className="text-xs text-slate-500">
                  Elige cualquiera de las dos formas para ejecutar la automatización directamente en la web oficial:
                </p>
              </div>
            </div>

            {/* AVISO CLAVE SOBRE about:blank#blocked */}
            <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900 mb-6 flex items-start gap-2.5">
              <Info size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <strong>¿Por qué apareció la pantalla en negro con «about:blank#blocked»?</strong>
                <p className="mt-1 text-amber-800">
                  Google Chrome bloquea por seguridad cuando haces clic directo en enlaces que intentan ejecutar código JavaScript. Para evitar ese bloqueo del navegador, la forma <strong>100% garantizada y más rápida</strong> es pegarlo en la <strong>Consola (F12)</strong> o guardarlo en Marcadores con los pasos que te indicamos abajo.
                </p>
              </div>
            </div>

            {/* DOS OPCIONES: OPCION 1 (CONSOLA F12) Y OPCION 2 (MARCADOR MANUAL) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* OPCION 1: CONSOLA F12 (LA MAS FACIL Y SIN ERRORES) */}
              <div className="p-5 rounded-2xl bg-slate-50 border-2 border-emerald-500/30 flex flex-col justify-between relative shadow-sm">
                <div className="absolute -top-3 right-4 px-2.5 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-black uppercase tracking-wider shadow-sm">
                  100% Efectivo y Rápido
                </div>
                <div>
                  <div className="flex items-center gap-2 text-xs font-black text-emerald-700 uppercase tracking-wider mb-2">
                    <Terminal size={16} />
                    Opción 1: Consola de Chrome (F12)
                  </div>
                  <h4 className="text-base font-bold text-slate-900 mb-1">
                    Copia y pega en la Consola
                  </h4>
                  <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                    Es la forma más rápida en laptop. No requiere instalar nada ni lidiar con bloqueos de Chrome.
                  </p>

                  <div className="space-y-3 mb-4">
                    <div className="flex items-start gap-2 text-xs text-slate-700">
                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">1</span>
                      <span>Haz clic abajo en <strong>Copiar Script de Llenado</strong>.</span>
                    </div>
                    <div className="flex items-start gap-2 text-xs text-slate-700">
                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">2</span>
                      <span>Abre la página oficial de Aquanova en una pestaña.</span>
                    </div>
                    <div className="flex items-start gap-2 text-xs text-slate-700">
                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">3</span>
                      <span>Presiona la tecla <strong>F12</strong> (o Clic derecho &gt; <em>Inspeccionar</em> &gt; pestaña <strong>Consola</strong>).</span>
                    </div>
                    <div className="flex items-start gap-2 text-xs text-slate-700">
                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">4</span>
                      <span>Presiona <strong>Ctrl + V</strong> (Pegar) y presiona <strong>Enter</strong>.</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer"
                  >
                    {copiedCode ? <CheckCheck size={18} /> : <Copy size={18} />}
                    <span>{copiedCode ? '¡Script Copiado al Portapapeles!' : 'Copiar Script de Llenado'}</span>
                  </button>

                  <a
                    href="https://app.aquanova.farm/formulario-de-carga-diaria-electricidad"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-bold text-xs flex items-center justify-center gap-2 transition-all text-center"
                  >
                    <span>Abrir Aquanova en pestaña nueva</span>
                    <ExternalLink size={14} />
                  </a>
                </div>
              </div>

              {/* OPCION 2: CREAR MARCADOR EN CHROME (SIN BLOQUEOS) */}
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 text-xs font-black text-blue-700 uppercase tracking-wider mb-2">
                    <Bookmark size={16} />
                    Opción 2: Crear Marcador en Chrome
                  </div>
                  <h4 className="text-base font-bold text-slate-900 mb-1">
                    Guardar botón permanente
                  </h4>
                  <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                    Si quieres tener un botón fijo en tu barra superior de Chrome para usarlo todos los días con un solo clic:
                  </p>

                  <div className="space-y-3 mb-4">
                    <div className="flex items-start gap-2 text-xs text-slate-700">
                      <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">1</span>
                      <span>En tu Chrome, haz <strong>clic derecho</strong> en la barra de marcadores y selecciona <strong>«Añadir página...»</strong></span>
                    </div>
                    <div className="flex items-start gap-2 text-xs text-slate-700">
                      <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">2</span>
                      <span>En <strong>Nombre</strong> escribe: <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-900 font-bold text-[11px]">⚡ Auto-Llenar Aquanova</code></span>
                    </div>
                    <div className="flex items-start gap-2 text-xs text-slate-700">
                      <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">3</span>
                      <span>En <strong>URL</strong>, copia y pega el código del botón azul de abajo.</span>
                    </div>
                    <div className="flex items-start gap-2 text-xs text-slate-700">
                      <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">4</span>
                      <span>Haz clic en <strong>Guardar</strong>. ¡Listo! Ahora cuando abras Aquanova, sólo le das 1 clic a ese marcador.</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <button
                    type="button"
                    onClick={handleCopyBookmarklet}
                    className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-sm flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer"
                  >
                    {copiedLink ? <CheckCheck size={18} /> : <Bookmark size={18} />}
                    <span>{copiedLink ? '¡URL de Marcador Copiada!' : 'Copiar URL para el Marcador'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowCodeViewer(prev => !prev)}
                    className="w-full py-2 px-3 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 font-bold text-xs text-slate-600 flex items-center justify-center gap-1.5 transition-all"
                  >
                    <Code size={14} />
                    <span>{showCodeViewer ? 'Ocultar código del script' : 'Ver código que se ejecutará'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* CODE PREVIEW EXPANDER */}
            {showCodeViewer && (
              <div className="mt-6 p-4 rounded-xl bg-slate-950 text-slate-200 font-mono text-xs border border-slate-800">
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
                  <span className="text-slate-400 font-sans font-bold flex items-center gap-2">
                    <Code size={16} className="text-cyan-400" />
                    Código JavaScript que ejecuta el llenado visual:
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-[11px] font-sans font-bold flex items-center gap-1"
                  >
                    {copiedCode ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copiedCode ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </div>
                <div className="max-h-60 overflow-y-auto pr-2 text-[11px] leading-relaxed text-slate-300 select-all">
                  <pre>{currentBrowserScript}</pre>
                </div>
              </div>
            )}
          </div>

          {/* SIMULATED PREVIEW OF WHAT HAPPENS ON THE REAL PAGE */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
              <Activity size={15} className="text-cyan-600" />
              <span>Secuencia de Auto-Llenado que verás en la Página Real</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-cyan-100 text-cyan-900">Pág 1</span>
                  <span className="text-[10px] text-slate-400 font-bold">2 seg</span>
                </div>
                <div className="font-bold text-xs text-slate-800">Información General</div>
                <div className="text-[11px] text-slate-500 leading-tight">
                  Fecha ({formData.fecha}), Corpoelec ({formData.continuidadCorpoelec}), Voltaje.
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-slate-200 text-slate-800">Pág 2</span>
                  <span className="text-[10px] text-slate-400 font-bold">2 seg</span>
                </div>
                <div className="font-bold text-xs text-slate-800">Mantenimientos</div>
                <div className="text-[11px] text-slate-500 leading-tight">
                  Verificación de correctivos, preventivos e inoperativos.
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-blue-100 text-blue-900">Pág 3</span>
                  <span className="text-[10px] text-slate-400 font-bold">2.5 seg</span>
                </div>
                <div className="font-bold text-xs text-slate-800">Generadores & Bombeo</div>
                <div className="text-[11px] text-slate-500 leading-tight">
                  Maternidad, Campamento, Subestación, Bombeo Playa ({formData.bombeoPlayaMinutos}m) y Pozo ({formData.bombeoPozoMinutos}m).
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-indigo-100 text-indigo-900">Pág 4</span>
                  <span className="text-[10px] text-slate-400 font-bold">2 seg</span>
                </div>
                <div className="font-bold text-xs text-slate-800">Blowers</div>
                <div className="text-[11px] text-slate-500 leading-tight">
                  Frecuencia ({formData.blowersVeces}) y horarios de encendido.
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-emerald-600 text-white">Pág 5</span>
                  <span className="text-[10px] text-emerald-700 font-bold">Final</span>
                </div>
                <div className="font-bold text-xs text-emerald-950">Novedades & Listo</div>
                <div className="text-[11px] text-emerald-800 leading-tight">
                  Escribe reporte y resalta botón "Completar Formulario".
                </div>
              </div>
            </div>
          </div>

          {/* VERIFICATION CARD OF CURRENT SHIFT DATA TO BE INJECTED */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="text-sm font-black text-slate-900">
                  Datos calculados de tu turno listos para inyectar
                </h4>
                <p className="text-xs text-slate-500">
                  Estos son los valores reales medidos en Run Monitor que se escribirán en Aquanova.
                </p>
              </div>
              <button
                type="button"
                onClick={fetchAndCalculateShiftData}
                className="text-xs text-cyan-700 font-bold hover:underline flex items-center gap-1"
              >
                <RefreshCw size={12} />
                <span>Actualizar</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-slate-400 font-bold text-[11px]">Fecha</div>
                <div className="font-bold text-slate-900 text-sm mt-0.5">{formData.fecha}</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-slate-400 font-bold text-[11px]">Corpoelec</div>
                <div className={`font-bold text-sm mt-0.5 ${formData.continuidadCorpoelec === 'Si' ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {formData.continuidadCorpoelec === 'Si' ? 'Continuo' : `Corte (${formData.duracionFallaCorpoelec} min)`}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-slate-400 font-bold text-[11px]">Generador Subestación</div>
                <div className="font-bold text-slate-900 text-sm mt-0.5">{formData.subestacionTiempo}</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-slate-400 font-bold text-[11px]">Bombeo Playa</div>
                <div className="font-bold text-blue-700 text-sm mt-0.5">{formData.bombeoPlayaMinutos} minutos</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-slate-400 font-bold text-[11px]">Bombeo Pozo</div>
                <div className="font-bold text-blue-700 text-sm mt-0.5">{formData.bombeoPozoMinutos} minutos</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-slate-400 font-bold text-[11px]">Generador Maternidad</div>
                <div className="font-bold text-slate-900 text-sm mt-0.5">{formData.maternidadTiempo}</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-slate-400 font-bold text-[11px]">Generador Campamento</div>
                <div className="font-bold text-slate-900 text-sm mt-0.5">{formData.campamentoTiempo}</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-slate-400 font-bold text-[11px]">Blowers</div>
                <div className="font-bold text-slate-900 text-sm mt-0.5">{formData.blowersVeces}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODO 2: FORMULARIO INTERNO MANUAL DE RESPALDO                             */}
      {/* ========================================================================= */}
      {activeMode === 'internal_form' && (
        <div className="space-y-6">
          {/* STEP PROGRESS BAR */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2 overflow-x-auto pb-2 sm:pb-0">
              {steps.map((s) => {
                const Icon = s.icon;
                const isCompleted = currentStep > s.num;
                const isCurrent = currentStep === s.num;

                return (
                  <button
                    key={s.num}
                    type="button"
                    onClick={() => setCurrentStep(s.num)}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all whitespace-nowrap text-left ${
                      isCurrent 
                        ? 'bg-slate-900 text-white shadow-md' 
                        : isCompleted 
                        ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100' 
                        : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                      isCurrent 
                        ? 'bg-cyan-500 text-slate-950' 
                        : isCompleted 
                        ? 'bg-emerald-600 text-white' 
                        : 'bg-slate-200 text-slate-600'
                    }`}>
                      {isCompleted ? <Check size={14} /> : s.num}
                    </div>
                    <div className="hidden sm:block">
                      <div className="text-xs font-bold leading-tight">{s.name}</div>
                      <div className={`text-[10px] ${isCurrent ? 'text-slate-300' : 'text-slate-400'}`}>
                        {isCurrent ? 'Paso actual' : isCompleted ? 'Completado' : 'Pendiente'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* FORM CARD CONTAINER */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
            {/* SECCIÓN 1 */}
            {currentStep === 1 && (
              <div className="space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-cyan-700">Sección 1 de 5</span>
                  <h3 className="text-xl font-bold text-slate-900">Información General y Corpoelec</h3>
                  <p className="text-xs text-slate-500 mt-1">Registra la fecha y la estabilidad del servicio eléctrico nacional.</p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-800 mb-1">
                    FECHA DEL TURNO *
                  </label>
                  <input
                    type="text"
                    value={formData.fecha}
                    onChange={(e) => setFormData(prev => ({ ...prev, fecha: e.target.value }))}
                    className="w-full sm:w-64 p-3 rounded-xl border border-slate-300 bg-slate-50 font-bold text-slate-800 focus:bg-white focus:border-cyan-500 outline-none"
                  />
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <label className="block text-sm font-bold text-slate-800">
                    ¿Hubo continuidad en el servicio eléctrico de Corpoelec? *
                  </label>
                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, continuidadCorpoelec: 'Si' }))}
                      className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm border transition-all flex items-center justify-center gap-2 ${
                        formData.continuidadCorpoelec === 'Si'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {formData.continuidadCorpoelec === 'Si' && <Check size={16} />}
                      <span>Sí, hubo continuidad</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, continuidadCorpoelec: 'No' }))}
                      className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm border transition-all flex items-center justify-center gap-2 ${
                        formData.continuidadCorpoelec === 'No'
                          ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {formData.continuidadCorpoelec === 'No' && <Check size={16} />}
                      <span>No (Hubo corte)</span>
                    </button>
                  </div>

                  {formData.continuidadCorpoelec === 'No' && (
                    <div className="pt-2">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Duración total de la falla / corte (en minutos):
                      </label>
                      <input
                        type="number"
                        value={formData.duracionFallaCorpoelec}
                        onChange={(e) => setFormData(prev => ({ ...prev, duracionFallaCorpoelec: Number(e.target.value) }))}
                        className="w-full sm:w-48 p-2.5 rounded-lg border border-rose-300 bg-white font-bold text-rose-700 outline-none"
                      />
                    </div>
                  )}
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <label className="block text-sm font-bold text-slate-800">
                    ¿Hubo falla de voltaje en el servicio eléctrico de Corpoelec? *
                  </label>
                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, fallaVoltaje: 'No' }))}
                      className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm border transition-all flex items-center justify-center gap-2 ${
                        formData.fallaVoltaje === 'No'
                          ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {formData.fallaVoltaje === 'No' && <Check size={16} />}
                      <span>No hubo falla de voltaje</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, fallaVoltaje: 'Si' }))}
                      className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm border transition-all flex items-center justify-center gap-2 ${
                        formData.fallaVoltaje === 'Si'
                          ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {formData.fallaVoltaje === 'Si' && <Check size={16} />}
                      <span>Sí, hubo fluctuación/falla</span>
                    </button>
                  </div>

                  {formData.fallaVoltaje === 'Si' && (
                    <div className="pt-2">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Duración de la falla de voltaje (en minutos):
                      </label>
                      <input
                        type="number"
                        value={formData.duracionFallaVoltaje}
                        onChange={(e) => setFormData(prev => ({ ...prev, duracionFallaVoltaje: Number(e.target.value) }))}
                        className="w-full sm:w-48 p-2.5 rounded-lg border border-amber-300 bg-white font-bold text-amber-800 outline-none"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SECCIÓN 2 */}
            {currentStep === 2 && (
              <div className="space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-cyan-700">Sección 2 de 5</span>
                  <h3 className="text-xl font-bold text-slate-900">Mantenimiento y Equipos</h3>
                  <p className="text-xs text-slate-500 mt-1">Registra si algún generador recibió servicio técnico o estuvo inoperativo.</p>
                </div>

                <div className="space-y-3">
                  <label className="block text-sm font-bold text-slate-800">
                    ¿Se realizó mantenimiento correctivo a alguno de los generadores?
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {Object.entries(GENERATOR_MAPPING).map(([id, label]) => {
                      const selected = formData.mantenimientoCorrectivo.includes(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => toggleMultiSelect('mantenimientoCorrectivo', id)}
                          className={`p-3 rounded-xl border text-left text-xs font-bold transition-all flex items-center justify-between ${
                            selected 
                              ? 'bg-indigo-50 border-indigo-500 text-indigo-900 shadow-sm' 
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span>{label}</span>
                          {selected && <Check size={16} className="text-indigo-600" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-slate-100">
                  <label className="block text-sm font-bold text-slate-800">
                    ¿Se realizó mantenimiento preventivo a alguno de los generadores?
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {Object.entries(GENERATOR_MAPPING).map(([id, label]) => {
                      const selected = formData.mantenimientoPreventivo.includes(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => toggleMultiSelect('mantenimientoPreventivo', id)}
                          className={`p-3 rounded-xl border text-left text-xs font-bold transition-all flex items-center justify-between ${
                            selected 
                              ? 'bg-blue-50 border-blue-500 text-blue-900 shadow-sm' 
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span>{label}</span>
                          {selected && <Check size={16} className="text-blue-600" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-slate-100">
                  <label className="block text-sm font-bold text-slate-800">
                    ¿Hay algún generador inoperativo en la planta?
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {Object.entries(GENERATOR_MAPPING).map(([id, label]) => {
                      const selected = formData.generadoresInoperativos.includes(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => toggleMultiSelect('generadoresInoperativos', id)}
                          className={`p-3 rounded-xl border text-left text-xs font-bold transition-all flex items-center justify-between ${
                            selected 
                              ? 'bg-rose-50 border-rose-500 text-rose-900 shadow-sm' 
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span>{label}</span>
                          {selected && <Check size={16} className="text-rose-600" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* SECCIÓN 3 */}
            {currentStep === 3 && (
              <div className="space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-cyan-700">Sección 3 de 5</span>
                  <h3 className="text-xl font-bold text-slate-900">Generadores Eléctricos y Bombeo</h3>
                  <p className="text-xs text-slate-500 mt-1">Valores calculados automáticamente según los minutos registrados en tu turno.</p>
                </div>

                {/* Maternidad */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-sm text-slate-900">Generador Maternidad</h4>
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-cyan-100 text-cyan-900">Área Maternidad</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">¿Cuántas veces encendió?</label>
                      <input
                        type="number"
                        value={formData.maternidadVeces}
                        onChange={(e) => setFormData(prev => ({ ...prev, maternidadVeces: Number(e.target.value) }))}
                        className="w-full p-2.5 rounded-lg border border-slate-300 bg-white font-bold text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Rango de tiempo:</label>
                      <select
                        value={formData.maternidadTiempo}
                        onChange={(e) => setFormData(prev => ({ ...prev, maternidadTiempo: e.target.value }))}
                        className="w-full p-2.5 rounded-lg border border-slate-300 bg-white font-bold text-slate-800"
                      >
                        {TIEMPO_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Campamento */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-sm text-slate-900">Generador Campamento</h4>
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-cyan-100 text-cyan-900">Área Campamento</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">¿Cuántas veces encendió?</label>
                      <input
                        type="number"
                        value={formData.campamentoVeces}
                        onChange={(e) => setFormData(prev => ({ ...prev, campamentoVeces: Number(e.target.value) }))}
                        className="w-full p-2.5 rounded-lg border border-slate-300 bg-white font-bold text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Rango de tiempo:</label>
                      <select
                        value={formData.campamentoTiempo}
                        onChange={(e) => setFormData(prev => ({ ...prev, campamentoTiempo: e.target.value }))}
                        className="w-full p-2.5 rounded-lg border border-slate-300 bg-white font-bold text-slate-800"
                      >
                        {TIEMPO_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Subestación */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-sm text-slate-900">Generador Subestación Eléctrica</h4>
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-cyan-100 text-cyan-900">Subestación</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">¿Cuántas veces encendió?</label>
                      <input
                        type="number"
                        value={formData.subestacionVeces}
                        onChange={(e) => setFormData(prev => ({ ...prev, subestacionVeces: Number(e.target.value) }))}
                        className="w-full p-2.5 rounded-lg border border-slate-300 bg-white font-bold text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Rango de tiempo:</label>
                      <select
                        value={formData.subestacionTiempo}
                        onChange={(e) => setFormData(prev => ({ ...prev, subestacionTiempo: e.target.value }))}
                        className="w-full p-2.5 rounded-lg border border-slate-300 bg-white font-bold text-slate-800"
                      >
                        {TIEMPO_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Bombeo Playa y Pozo */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200">
                    <label className="block text-xs font-bold text-blue-900 mb-1">
                      Bombeo de Agua Playa (en minutos):
                    </label>
                    <input
                      type="number"
                      value={formData.bombeoPlayaMinutos}
                      onChange={(e) => setFormData(prev => ({ ...prev, bombeoPlayaMinutos: Number(e.target.value) }))}
                      className="w-full p-2.5 rounded-lg border border-blue-300 bg-white font-bold text-blue-900"
                    />
                  </div>
                  <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200">
                    <label className="block text-xs font-bold text-blue-900 mb-1">
                      Bombeo de Agua Pozo (en minutos):
                    </label>
                    <input
                      type="number"
                      value={formData.bombeoPozoMinutos}
                      onChange={(e) => setFormData(prev => ({ ...prev, bombeoPozoMinutos: Number(e.target.value) }))}
                      className="w-full p-2.5 rounded-lg border border-blue-300 bg-white font-bold text-blue-900"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* SECCIÓN 4 */}
            {currentStep === 4 && (
              <div className="space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-cyan-700">Sección 4 de 5</span>
                  <h3 className="text-xl font-bold text-slate-900">Encendido de Blowers (Tanques 1-20)</h3>
                  <p className="text-xs text-slate-500 mt-1">Registra cuántas veces y en qué horarios operaron los sopladores de aireación.</p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-800 mb-2">
                    ¿Cuántas veces se encendieron los blowers? *
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {['1 vez', '2 veces', '3 veces'].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, blowersVeces: v }))}
                        className={`py-3 px-4 rounded-xl font-bold text-sm border transition-all flex items-center justify-center gap-2 ${
                          formData.blowersVeces === v
                            ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {formData.blowersVeces === v && <Check size={16} />}
                        <span>{v}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4 pt-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Hora 1 encendido / apagado de los Blowers (1ra vez):
                    </label>
                    <input
                      type="text"
                      value={formData.blowerHora1}
                      onChange={(e) => setFormData(prev => ({ ...prev, blowerHora1: e.target.value }))}
                      className="w-full p-3 rounded-xl border border-slate-300 bg-slate-50 font-medium text-slate-800 outline-none focus:bg-white focus:border-cyan-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* SECCIÓN 5 */}
            {currentStep === 5 && (
              <div className="space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-cyan-700">Sección 5 de 5 (Paso Final)</span>
                  <h3 className="text-xl font-bold text-slate-900">Novedades del Turno y Envío</h3>
                  <p className="text-xs text-slate-500 mt-1">Revisa el resumen final y completa el registro del formulario.</p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-800 mb-1">
                    Alguna falla del sistema interno a reportar:
                  </label>
                  <textarea
                    value={formData.fallaInterna}
                    onChange={(e) => setFormData(prev => ({ ...prev, fallaInterna: e.target.value }))}
                    rows={4}
                    className="w-full p-3 rounded-xl border border-slate-300 bg-slate-50 text-sm font-medium text-slate-800 outline-none focus:bg-white focus:border-cyan-500"
                  />
                </div>

                {submittedSuccess && (
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-bold flex items-center gap-2">
                    <CheckCircle2 size={20} className="text-emerald-600" />
                    <span>¡Formulario de Aquanova completado y guardado con éxito!</span>
                  </div>
                )}
              </div>
            )}

            {/* NAVIGATION BUTTONS */}
            <div className="flex items-center justify-between gap-3 pt-6 mt-6 border-t border-slate-100">
              <button
                type="button"
                onClick={handlePrev}
                disabled={currentStep === 1 || submitting}
                className="px-5 py-2.5 rounded-xl border border-slate-300 font-bold text-xs text-slate-700 hover:bg-slate-100 transition-all flex items-center gap-2 disabled:opacity-30 disabled:pointer-events-none"
              >
                <ChevronLeft size={16} />
                <span>Sección Anterior</span>
              </button>

              <div className="text-xs font-bold text-slate-400">
                Paso {currentStep} de 5
              </div>

              {currentStep < 5 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 font-bold text-xs text-white shadow-sm flex items-center gap-2 transition-all active:scale-95"
                >
                  <span>Continuar a la siguiente sección</span>
                  <ChevronRight size={16} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmitForm}
                  disabled={submitting}
                  className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 font-bold text-xs text-white shadow-md flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      <span>Enviando Formulario...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      <span>Completar Formulario de Aquanova</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DIRECT CLOUD SYNC OPTION (AUTONOMOUS) */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">
            <Cloud size={16} />
            <span>Envío Autónomo en la Nube</span>
          </div>
          <p className="text-xs text-slate-600">
            ¿Quieres que el servidor de la nube procese y registre este turno directamente sin abrir la página?
          </p>
        </div>

        <button
          type="button"
          onClick={handleTriggerCloudDirect}
          disabled={cloudSyncing}
          className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-2 shadow-sm transition-all whitespace-nowrap active:scale-95 disabled:opacity-50"
        >
          {cloudSyncing ? (
            <>
              <RefreshCw size={14} className="animate-spin" />
              <span>Sincronizando Nube...</span>
            </>
          ) : (
            <>
              <Zap size={14} />
              <span>Sincronizar en la Nube Ahora</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

function CodeIcon(props: any) {
  return <FileText {...props} />;
}
