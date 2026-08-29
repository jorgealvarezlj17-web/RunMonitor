import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, orderBy, Timestamp, doc, limit, getDoc, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { db, auth } from '../firebase';
import { GENERATOR_MAPPING } from '../constants';
import { Check, Loader2, Smartphone, Copy } from 'lucide-react';

export const AquanovaFormReplica = () => {
  const [page, setPage] = useState(() => {
    const savedPage = sessionStorage.getItem('aquanovaFormPage');
    return savedPage ? parseInt(savedPage, 10) : 1;
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [redirectUrl, setRedirectUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const appUrl = window.location.origin;

  const userEmail = auth.currentUser?.email || '';

  const magicScript = `javascript:(async function(){
    const STORAGE_KEY = 'aquanova_sync_cache';
    const appUrl = '${appUrl}';
    const params = new URLSearchParams(window.location.search);
    const syncUser = params.get('syncUser') || '';
    const wait = (ms) => new Promise(r => setTimeout(r, ms));

    async function fetchData() {
      const api = appUrl + '/api/latest-submission' + (syncUser ? '?email=' + encodeURIComponent(syncUser) : '');
      try {
        const r = await fetch(api);
        if (!r.ok) throw new Error('No se encontró el test');
        const d = await r.json();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
        return d;
      } catch (e) {
        alert('Error al obtener datos: ' + e.message);
        return null;
      }
    }

    function findElementByText(text, startIndex = 0) {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
      let node;
      let currentIndex = 0;
      while (node = walker.nextNode()) {
        if (node.textContent.toLowerCase().includes(text.toLowerCase())) {
          if (currentIndex >= startIndex) return node.parentElement;
          currentIndex++;
        }
      }
      return null;
    }

    async function fillFields(data) {
      const mappings = [
        { label: 'FECHA', v: data.fecha },
        { label: 'continuidad', v: data.continuidad },
        { label: 'duración de la falla', v: data.duracionFalla, index: 0 },
        { label: 'falla de voltaje', v: data.fallaVoltaje },
        { label: 'duración de la falla', v: data.duracionFallaVoltaje, index: 1 },
        { label: 'maternidad', v: data.encendidoMaternidad },
        { label: 'campamento', v: data.encendidoCampamento },
        { label: 'subestacion', v: data.encendidoSubestacion },
        { label: 'playa', v: data.bombeoPlaya },
        { label: 'pozo', v: data.bombeoPozo },
        { label: 'reporte', v: data.reporteFalla }
      ];

      let filledCount = 0;

      for (const m of mappings) {
        if (m.v === undefined || m.v === null || m.v === '') continue;

        const anchor = findElementByText(m.label, m.index || 0);
        if (!anchor) continue;

        // Search for the next interactive element after this anchor
        let current = anchor;
        let target = null;
        let limit = 0;

        while (!target && limit < 15) {
          // Look at siblings and then move up to parent's siblings
          const interactive = current.querySelectorAll('input, textarea, select, button, [role="button"], [role="radio"]');
          if (interactive.length > 0) {
            if (String(m.v).toLowerCase() === 'si' || String(m.v).toLowerCase() === 'no') {
              // For Si/No, find the specific button
              target = Array.from(interactive).find(el => (el.innerText || el.value || '').toLowerCase().includes(String(m.v).toLowerCase()));
            } else {
              target = interactive[0];
            }
          }
          if (!target) {
            current = current.nextElementSibling || current.parentElement;
            if (!current) break;
          }
          limit++;
        }

        if (target) {
          if (target.tagName === 'INPUT' && (target.type === 'text' || target.type === 'number' || target.type === 'date')) {
            target.value = m.v;
            ['input', 'change', 'blur'].forEach(ev => target.dispatchEvent(new Event(ev, { bubbles: true })));
          } else {
            target.click();
          }
          target.style.outline = '3px solid #10b981';
          target.style.backgroundColor = '#ecfdf5';
          filledCount++;
          await wait(150);
        }
      }
      if (filledCount > 0) console.log('Sincronizados ' + filledCount + ' campos.');
    }

    let data = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!data || (data.submittedAt && (new Date().getTime() - new Date(data.submittedAt).getTime() > 3600000))) {
      data = await fetchData();
    }

    if (data) {
      await fillFields(data);
      const nextBtn = Array.from(document.querySelectorAll('button, a, span')).find(b => {
        const t = (b.innerText || '').toLowerCase();
        return t === 'continuar' || t === 'siguiente' || t === 'enviar';
      });
      if (nextBtn) {
        nextBtn.style.boxShadow = '0 0 0 5px #10b981';
        nextBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  })();`;

  const copyMagicScript = () => {
    navigator.clipboard.writeText(magicScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const [manualSyncCode, setManualSyncCode] = useState('');
  const [isGeneratingSync, setIsGeneratingSync] = useState(false);

  const generateManualSync = async () => {
    if (!userEmail) {
      alert('Error: No se detectó tu sesión. Por favor, recarga la página.');
      return;
    }
    setIsGeneratingSync(true);
    try {
      const publicAppUrl = 'https://ais-pre-wmfblgqoaqzcozog7yuyos-108145579037.us-east5.run.app';
      const jsonpUrl = `${publicAppUrl}/api/latest-submission-jsonp?email=${encodeURIComponent(userEmail)}&callback=aquanovaSyncCallback`;
      
      const code = `javascript:(function(){
        window.aquanovaSyncCallback = async function(d) {
          if (d.error) {
            alert('Error: ' + d.error);
            return;
          }
          const wait = (ms) => new Promise(r => setTimeout(r, ms));
          function findEl(text, index = 0) {
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
            let node, curr = 0;
            while (node = walker.nextNode()) {
              if (node.textContent.toLowerCase().includes(text.toLowerCase())) {
                if (curr >= index) return node.parentElement;
                curr++;
              }
            }
            return null;
          }
          const m = [
            { l: 'FECHA', v: d.fecha },
            { l: 'continuidad', v: d.continuidad },
            { l: 'duración de la falla', v: d.duracionFalla, i: 0 },
            { l: 'falla de voltaje', v: d.fallaVoltaje },
            { l: 'duración de la falla', v: d.duracionFallaVoltaje, i: 1 },
            { l: 'maternidad', v: d.encendidoMaternidad },
            { l: 'tiempo maternidad', v: d.tiempoMaternidad },
            { l: 'campamento', v: d.encendidoCampamento },
            { l: 'tiempo campamento', v: d.tiempoCampamento },
            { l: 'subestacion', v: d.encendidoSubestacion },
            { l: 'tiempo subestacion', v: d.tiempoSubestacion },
            { l: 'playa', v: d.bombeoPlaya },
            { l: 'pozo', v: d.bombeoPozo },
            { l: 'aireacion', v: d.tanquesAireacion },
            { l: 'movimiento', v: d.tanquesMovimiento },
            { l: 'blowers', v: d.encendidoBlowers },
            { l: 'reporte', v: d.reporteFalla }
          ];
          for (const x of m) {
            if (!x.v) continue;
            const anchor = findEl(x.l, x.i || 0);
            if (!anchor) continue;
            let curr = anchor, target = null, lim = 0;
            while (!target && lim < 15) {
              const items = curr.querySelectorAll('input, textarea, select, button, [role="button"]');
              if (items.length > 0) {
                if (Array.isArray(x.v)) {
                  items.forEach(item => {
                    const label = (item.innerText || item.value || '').toLowerCase();
                    if (x.v.some(val => label.includes(val.toLowerCase()))) {
                      if (!item.checked && item.click) item.click();
                    }
                  });
                  target = items[0];
                } else if (['si', 'no'].includes(String(x.v).toLowerCase())) {
                  target = Array.from(items).find(el => (el.innerText || el.value || '').toLowerCase().includes(String(x.v).toLowerCase()));
                } else { target = items[0]; }
              }
              if (!target) { curr = curr.nextElementSibling || curr.parentElement; if (!curr) break; }
              lim++;
            }
            if (target) {
              if (target.tagName === 'INPUT' && target.type !== 'radio' && !Array.isArray(x.v)) {
                target.value = x.v;
                ['input', 'change', 'blur'].forEach(e => target.dispatchEvent(new Event(e, { bubbles: true })));
              } else if (!Array.isArray(x.v)) { target.click(); }
              target.style.outline = '4px solid #10b981';
              await wait(100);
            }
          }
          const btn = Array.from(document.querySelectorAll('button, span')).find(b => {
            const t = (b.innerText || '').toLowerCase();
            return t === 'continuar' || t === 'siguiente' || t === 'enviar';
          });
          if (btn) { btn.style.boxShadow = '0 0 0 6px #10b981'; btn.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
          alert('¡Sincronización de datos completada!');
        };
        var s = document.createElement('script');
        s.src = '${jsonpUrl}&t=' + Date.now();
        document.body.appendChild(s);
      })();`;
      
      setManualSyncCode(code);
      try {
        await navigator.clipboard.writeText(code);
        alert('¡Código dinámico generado! Guárdalo como marcador por ÚLTIMA VEZ. Ya no tendrás que actualizarlo nunca más.');
      } catch (err) {
        console.error('Clipboard error:', err);
      }
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setIsGeneratingSync(false);
    }
  };

  useEffect(() => {
    sessionStorage.setItem('aquanovaFormPage', page.toString());
  }, [page]);

  const TANK_OPTIONS = (() => {
    const saved = localStorage.getItem('plantAvailableTanks');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Error parsing available tanks:", e);
      }
    }
    return Array.from({ length: 60 }, (_, i) => `T${String(i + 1).padStart(3, '0')}`);
  })();

  const [formData, setFormData] = useState(() => {
    const defaultData = {
      fecha: (() => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return d.toISOString().split('T')[0];
      })(),
      continuidad: 'Si',
      duracionFalla: '0',
      fallaVoltaje: 'No',
      duracionFallaVoltaje: '0',
      mantenimientoCorrectivo: [] as string[],
      obsCorrectivo: '',
      mantenimientoPreventivo: [] as string[],
      obsPreventivo: '',
      generadorInoperativo: [] as string[],
      obsInoperativo: '',
      encendidoMaternidad: '0',
      tiempoMaternidad: '',
      encendidoCampamento: '0',
      tiempoCampamento: '',
      encendidoSubestacion: '0',
      tiempoSubestacion: '',
      bombeoPlaya: '0',
      bombeoPozo: '0',
      tanquesAireacion: [] as string[],
      tanquesMovimiento: [] as string[],
      encendidoBlowers: '',
      tiemposBlowers: {
        '1': '',
        '2': '',
        '3': ''
      } as Record<string, string>,
      reporteFalla: '',
      fotosFalla: [] as string[],
    };

    const saved = sessionStorage.getItem('aquanovaFormData');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return { ...defaultData, ...parsed };
      } catch (e) {
        console.error("Error parsing saved form data:", e);
      }
    }
    return defaultData;
  });

  useEffect(() => {
    sessionStorage.setItem('aquanovaFormData', JSON.stringify(formData));
  }, [formData]);

  useEffect(() => {
    // Real-time listeners for all data sources
    const unsubscribes: (() => void)[] = [];

    const setupListeners = async () => {
      // 1. Get shift start time (one-time or could be listener too)
      const configSnap = await getDoc(doc(db, 'config', 'app_settings'));
      const startTimeStr = configSnap.exists() ? configSnap.data().shiftStartTime : '18:00';
      
      const calculateShiftRange = () => {
        const end = new Date();
        const [startH, startM] = startTimeStr.split(':').map(Number);
        const start = new Date(end);
        start.setHours(startH, startM, 0, 0);
        if (start > end) start.setDate(start.getDate() - 1);
        return { start, end };
      };

      const { start, end } = calculateShiftRange();

      // Helper to identify generators from text
      const identifyGenerators = (text: string): string[] => {
        const found: string[] = [];
        const lowerText = text.toLowerCase();
        
        const check = (keywords: string[]) => keywords.some(k => lowerText.includes(k));

        if (check(['300', '275', 'subestación', 'subestacion', '300 kv', '300kv'])) found.push('GE2-C275-S');
        if (check(['150'])) found.push('GE7-C150-S');
        if (check(['27.5-c', '27.5c', 'ge1', 'ge-1'])) found.push('GE1-C27.5-C');
        if (check(['27.5-m', '27.5m', 'ge3', 'ge-3'])) found.push('GE3-C27.5-M');
        if (check(['27.5-b', '27.5b', 'ge4', 'ge-4'])) found.push('GE4-C27.5-B');
        if (check(['34.5-b', '34.5b', 'ge5', 'ge-5'])) found.push('GE5-C34.5-B');
        if (check(['500', 'ge6', 'ge-6'])) found.push('GE6-C500-G');
        if (check(['27.5-g', '27.5g', 'ge8', 'ge-8'])) found.push('GE8-C27.5-G');
        if (check(['27.5-g', '27.5g', 'ge9', 'ge-9'])) found.push('GE9-C27.5-G');
        if (check(['ge10', 'ge-10']) || (check(['15']) && !lowerText.includes('150'))) found.push('GE10-C15-G');
        if (check(['ge11', 'ge-11']) || (check(['10']) && !lowerText.includes('150') && !lowerText.includes('27.5'))) found.push('GE11-C10-G');
        if (check(['5.5', 'ge12', 'ge-12'])) found.push('GE12-C5.5-G');
        
        return Array.from(new Set(found));
      };

      // 2. Listen to Power Events
      const qPower = query(
        collection(db, 'power_events'),
        where('timestamp', '>=', Timestamp.fromDate(start)),
        where('timestamp', '<=', Timestamp.fromDate(end)),
        orderBy('timestamp', 'asc')
      );
      unsubscribes.push(onSnapshot(qPower, (snapshot) => {
        let fallas: { start: Date, end: Date | null, type: string }[] = [];
        let currentEvent: { start: Date, end: Date | null, type: string } | null = null;

        snapshot.forEach((docSnap) => {
          const ev = docSnap.data();
          const evDate = ev.timestamp.toDate();
          if (ev.type === 'falla' || ev.type === 'corte') {
            if (!currentEvent) currentEvent = { start: evDate, end: null, type: ev.type };
            else if (currentEvent.type !== ev.type) {
              currentEvent.end = evDate;
              fallas.push(currentEvent);
              currentEvent = { start: evDate, end: null, type: ev.type };
            }
          } else if (ev.type === 'ok') {
            if (currentEvent) {
              currentEvent.end = evDate;
              fallas.push(currentEvent);
              currentEvent = null;
            }
          }
        });

        if (currentEvent) {
          currentEvent.end = new Date();
          fallas.push(currentEvent);
        }

        const totalCorteMins = fallas.reduce((acc, f) => (f.end && f.type === 'corte') ? acc + Math.round((f.end.getTime() - f.start.getTime()) / 60000) : acc, 0);
        const totalFallaMins = fallas.reduce((acc, f) => (f.end && f.type === 'falla') ? acc + Math.round((f.end.getTime() - f.start.getTime()) / 60000) : acc, 0);

        setFormData(prev => ({
          ...prev,
          continuidad: fallas.some(f => f.type === 'corte') ? 'No' : 'Si',
          duracionFalla: totalCorteMins.toString(),
          fallaVoltaje: fallas.some(f => f.type === 'falla') ? 'Si' : 'No',
          duracionFallaVoltaje: totalFallaMins.toString()
        }));
      }));

      // 3. Listen to Maintenance and Observations
      unsubscribes.push(onSnapshot(doc(db, 'config', 'current_shift_maintenance'), (docSnap) => {
        const maintRecords = docSnap.exists() ? docSnap.data().records || '' : '';
        
        setFormData(prev => {
          if (!maintRecords) {
            return {
              ...prev,
              obsPreventivo: '',
              mantenimientoPreventivo: [],
              obsCorrectivo: '',
              mantenimientoCorrectivo: [],
              obsInoperativo: '',
              generadorInoperativo: []
            };
          }

          // Split by lines to process each maintenance record block separately
          const lines = maintRecords.split('\n');
          let preventivoGens: string[] = [];
          let correctivoGens: string[] = [];
          let inoperativoGens: string[] = [];
          let preventivoObs = '';
          let correctivoObs = '';
          let inoperativoObs = '';

          let currentMode: 'preventivo' | 'correctivo' | 'inoperativo' | null = null;

          lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) return;
            const lower = trimmed.toLowerCase();

            // Detect section headers
            if (lower.includes('mantenimiento preventivo') || lower === 'preventivo') {
              currentMode = 'preventivo';
            } else if (lower.includes('mantenimiento correctivo') || lower === 'correctivo') {
              currentMode = 'correctivo';
            } else if (lower.includes('inoperativo') || lower.includes('averia') || lower.includes('falla')) {
              currentMode = 'inoperativo';
            }

            if (currentMode === 'preventivo') {
              preventivoGens = Array.from(new Set([...preventivoGens, ...identifyGenerators(trimmed)]));
              preventivoObs += (preventivoObs ? '\n' : '') + trimmed;
            } else if (currentMode === 'correctivo') {
              correctivoGens = Array.from(new Set([...correctivoGens, ...identifyGenerators(trimmed)]));
              correctivoObs += (correctivoObs ? '\n' : '') + trimmed;
            } else if (currentMode === 'inoperativo') {
              inoperativoGens = Array.from(new Set([...inoperativoGens, ...identifyGenerators(trimmed)]));
              inoperativoObs += (inoperativoObs ? '\n' : '') + trimmed;
            }
          });

          return {
            ...prev,
            obsPreventivo: preventivoObs,
            mantenimientoPreventivo: preventivoGens,
            obsCorrectivo: correctivoObs,
            mantenimientoCorrectivo: correctivoGens,
            obsInoperativo: inoperativoObs,
            generadorInoperativo: inoperativoGens,
          };
        });
      }));

      unsubscribes.push(onSnapshot(doc(db, 'config', 'current_shift_observations'), (docSnap) => {
        const obs = docSnap.exists() ? docSnap.data().observations || '' : '';
        if (!obs) return;

        setFormData(prev => {
          const lowerObs = obs.toLowerCase();
          const isInoperativo = lowerObs.includes('inoperativo') || lowerObs.includes('averia') || lowerObs.includes('falla');
          
          if (isInoperativo) {
            return {
              ...prev,
              obsInoperativo: obs,
              generadorInoperativo: identifyGenerators(obs)
            };
          }
          return prev;
        });
      }));

      // 4. Listen to Tanks
      unsubscribes.push(onSnapshot(doc(db, 'config', 'current_shift_tanks'), (docSnap) => {
        const currentTanks = docSnap.exists() ? docSnap.data() : { tanquesAireacion: [], tanquesMovimiento: [] };
        setFormData(prev => ({
          ...prev,
          tanquesAireacion: (currentTanks.tanquesAireacion && currentTanks.tanquesAireacion.length > 0) 
            ? currentTanks.tanquesAireacion 
            : [TANK_OPTIONS[0] || 'T001'],
          tanquesMovimiento: (currentTanks.tanquesMovimiento && currentTanks.tanquesMovimiento.length > 0) 
            ? currentTanks.tanquesMovimiento 
            : [TANK_OPTIONS[0] || 'T001']
        }));
      }));

      // 5. Listen to Logs for Generators and Pumps
      const qLogs = query(
        collection(db, 'logs'),
        where('timestamp', '>=', Timestamp.fromDate(start)),
        orderBy('timestamp', 'asc')
      );

      // Fetch categories and equipment once to avoid repeated network calls
      const [catSnap, equipSnap] = await Promise.all([
        getDocs(query(collection(db, 'categories'))),
        getDocs(query(collection(db, 'equipment')))
      ]);
      const allCategories = catSnap.docs;
      const allEquipment = equipSnap.docs;

      // Pre-fetch initial statuses for ALL equipment to avoid nested queries in the listener
      const initialStatusesCache: Record<string, string> = {};
      const blowerFoundInSubstation = { found: false };
      const blowerFoundInCategory: Record<string, boolean> = {};

      // Helper to identify Subestación area
      const isSubstationArea = (eq: any, allCats: any[]) => {
        const normalize = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, '');
        const name = normalize(eq.data().name);
        const cat = allCats.find(c => c.id === eq.data().categoryId);
        const catName = cat ? normalize(cat.data().name) : '';
        
        const keywords = ['subestacion', 'sunestacion', 'sub', 'se', 'estacion', 'sun'];
        const hasKeyword = keywords.some(k => name.includes(k) || catName.includes(k));
        return hasKeyword;
      };

      const safeToDate = (ts: any): Date => {
        if (!ts) return new Date();
        if (typeof ts.toDate === 'function') return ts.toDate();
        if (ts instanceof Date) return ts;
        if (typeof ts === 'number') return new Date(ts);
        if (typeof ts === 'string') return new Date(ts);
        if (ts.seconds) return new Date(ts.seconds * 1000);
        return new Date();
      };

      // Fetch all prior logs once to avoid composite index queries
      const allPriorLogsSnap = await getDocs(collection(db, 'logs'));
      const allPriorLogs: any[] = [];
      allPriorLogsSnap.forEach(d => allPriorLogs.push(d.data()));

      allEquipment.forEach((eq) => {
        const prior = allPriorLogs
          .filter(l => l.equipmentId === eq.id && safeToDate(l.timestamp) < start)
          .sort((a, b) => safeToDate(b.timestamp).getTime() - safeToDate(a.timestamp).getTime());

        if (prior.length > 0) {
          initialStatusesCache[eq.id] = prior[0].action;
        } else {
          const name = eq.data().name.toLowerCase();
          const isBlower = name.includes('blower') || name.includes('bl') || name.includes('soplador');
          const isBackup = name.includes('respaldo') || name.includes('backup') || name.includes('emergencia') || name.includes('auxiliar');
          const inSub = isSubstationArea(eq, allCategories);

          if (isBlower) {
            if (inSub) {
              // For Subestación, only ONE blower ON globally if no history
              if (!isBackup && !blowerFoundInSubstation.found) {
                initialStatusesCache[eq.id] = 'on';
                blowerFoundInSubstation.found = true;
              } else {
                initialStatusesCache[eq.id] = 'off';
              }
            } else {
              // For other areas, one ON per category
              const catId = eq.data().categoryId || 'default';
              if (!isBackup && !blowerFoundInCategory[catId]) {
                initialStatusesCache[eq.id] = 'on';
                blowerFoundInCategory[catId] = true;
              } else {
                initialStatusesCache[eq.id] = 'off';
              }
            }
          } else {
            initialStatusesCache[eq.id] = 'off';
          }
        }
      });

      unsubscribes.push(onSnapshot(qLogs, async (snapshot) => {
        const getGeneratorStats = (categoryName: string) => {
          let startCount = 0;
          let totalDurationMs = 0;
          const normalize = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, '');
          const target = normalize(categoryName);
          const category = allCategories.find(d => normalize(d.data().name).includes(target));
          if (!category) return { count: '0', timeLabel: '< 1 hora' };

          const equipIds = allEquipment.filter(d => d.data().categoryId === category.id && (d.data().name.toLowerCase().includes('generador') || d.data().name.toLowerCase().includes('gn'))).map(d => d.id);
          if (equipIds.length === 0) return { count: '0', timeLabel: '< 1 hora' };

          const lastOnTime: Record<string, Date> = {};
          equipIds.forEach(id => { if (initialStatusesCache[id] === 'on') lastOnTime[id] = start; });

          snapshot.forEach(docSnap => {
            const log = docSnap.data();
            if (!equipIds.includes(log.equipmentId)) return;
            const logTime = log.timestamp?.toDate() || new Date();
            if (log.action === 'on') { startCount++; lastOnTime[log.equipmentId] = logTime; }
            else if (log.action === 'off' && lastOnTime[log.equipmentId]) { totalDurationMs += logTime.getTime() - lastOnTime[log.equipmentId].getTime(); delete lastOnTime[log.equipmentId]; }
          });

          Object.keys(lastOnTime).forEach(id => { totalDurationMs += end.getTime() - lastOnTime[id].getTime(); });
          const mins = Math.round(totalDurationMs / 60000);
          let label = '< 1 hora';
          if (mins >= 480) label = '≥ 8 horas';
          else if (mins >= 240) label = '≥ 4 horas y < 8 horas';
          else if (mins >= 120) label = '≥ 2 horas y < 4 horas';
          else if (mins >= 60) label = '≥ 1 hora y < 2 horas';
          return { count: startCount.toString(), timeLabel: label };
        };

        const getPumpDuration = (keyword: string) => {
          let totalDurationMs = 0;
          const normalize = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, '');
          const target = normalize(keyword);
          const equipIds = allEquipment.filter(d => {
            const name = normalize(d.data().name);
            return name.includes(target) && (name.includes('bomba') || name.includes('bombeo') || name.includes('pozo'));
          }).map(d => d.id);
          if (equipIds.length === 0) return '0';

          const lastOnTime: Record<string, Date> = {};
          equipIds.forEach(id => { if (initialStatusesCache[id] === 'on') lastOnTime[id] = start; });

          snapshot.forEach(docSnap => {
            const log = docSnap.data();
            if (!equipIds.includes(log.equipmentId)) return;
            const logTime = log.timestamp?.toDate() || new Date();
            if (log.action === 'on') lastOnTime[log.equipmentId] = logTime;
            else if (log.action === 'off' && lastOnTime[log.equipmentId]) { totalDurationMs += logTime.getTime() - lastOnTime[log.equipmentId].getTime(); delete lastOnTime[log.equipmentId]; }
          });

          Object.keys(lastOnTime).forEach(id => { totalDurationMs += end.getTime() - lastOnTime[id].getTime(); });
          return Math.round(totalDurationMs / 60000).toString();
        };

        const getBlowerLogs = () => {
          const normalize = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, '');
          
          const subCategory = allCategories.find(d => {
            const catName = normalize(d.data().name);
            return catName.includes('subestacion') || catName.includes('sunestacion') || catName.includes('sub');
          });

          const subBlowers = allEquipment.filter(d => {
            const name = normalize(d.data().name);
            const isBlower = name.includes('blower') || name.includes('bl') || name.includes('soplador');
            const isInSubCategory = subCategory && d.data().categoryId === subCategory.id;
            const hasSubInName = name.includes('subestacion') || name.includes('sub') || name.includes('se') || name.includes('estacion') || name.includes('sun') || name.includes('sunestacion');
            return isBlower && (isInSubCategory || hasSubInName);
          });

          const blowerIds = subBlowers.map(b => b.id);
          if (blowerIds.length === 0) return { count: '1', times: { '1': 'Continuo...', '2': '', '3': '' } };

          // 1. Get all logs for these blowers and sort them
          const combinedLogs = snapshot.docs
            .map(d => ({ id: d.id, ...d.data() } as any))
            .filter(l => blowerIds.includes(l.equipmentId) && (l.action === 'on' || l.action === 'off'))
            .sort((a, b) => {
              const timeA = a.timestamp?.toDate().getTime() || 0;
              const timeB = b.timestamp?.toDate().getTime() || 0;
              return timeA - timeB;
            });

          // 2. Track global state: Oxygen is present if at least one blower is ON
          const currentStatuses = { ...initialStatusesCache };
          let activeCount = blowerIds.filter(id => currentStatuses[id] === 'on').length;
          
          // If no blowers are running at the start of the shift, we start with a global OFF
          let globalOffTime: Date | null = activeCount === 0 ? start : null;
          const finalEvents: { offTime: Date, label: string }[] = [];

          combinedLogs.forEach(log => {
            const time = log.timestamp?.toDate() || new Date();
            const timeStr = format(time, 'h:mma').toUpperCase();
            const prevStatus = currentStatuses[log.equipmentId];
            
            if (log.action === prevStatus) return; // Ignore redundant logs
            currentStatuses[log.equipmentId] = log.action;
            
            if (log.action === 'on') {
              activeCount++;
              // If we were completely OFF (no oxygen) and now at least one is ON
              if (activeCount === 1 && globalOffTime) {
                const offStr = format(globalOffTime, 'h:mma').toUpperCase();
                finalEvents.push({ 
                  offTime: globalOffTime, 
                  label: `OFF ${offStr} / ON ${timeStr}` 
                });
                globalOffTime = null;
              }
            } else if (log.action === 'off') {
              activeCount = Math.max(0, activeCount - 1);
              // If the last running blower just turned OFF (oxygen stops)
              if (activeCount === 0 && !globalOffTime) {
                globalOffTime = time;
              }
            }
          });

          if (globalOffTime) {
            const offStr = format(globalOffTime, 'h:mma').toUpperCase();
            finalEvents.push({ 
              offTime: globalOffTime, 
              label: `OFF ${offStr} / ON --:--` 
            });
          }

          const sortedEvents = finalEvents
            .sort((a, b) => a.offTime.getTime() - b.offTime.getTime())
            .slice(0, 3);

          if (sortedEvents.length === 0) return { count: '1', times: { '1': 'Continuo...', '2': '', '3': '' } };

          const times: Record<string, string> = { '1': '', '2': '', '3': '' };
          sortedEvents.forEach((ev, i) => {
            times[(i + 1).toString()] = ev.label;
          });

          return { count: sortedEvents.length.toString(), times };
        };

        const sub = getGeneratorStats('Subestación');
        const mat = getGeneratorStats('Maternidad');
        const camp = getGeneratorStats('Campamento');
        const playa = getPumpDuration('Playa');
        const pozo = getPumpDuration('Pozo');
        const blowerData = getBlowerLogs();

        setFormData(prev => ({
          ...prev,
          encendidoSubestacion: sub.count,
          tiempoSubestacion: sub.timeLabel,
          encendidoMaternidad: mat.count,
          tiempoMaternidad: mat.timeLabel,
          encendidoCampamento: camp.count,
          tiempoCampamento: camp.timeLabel,
          bombeoPlaya: playa,
          bombeoPozo: pozo,
          encendidoBlowers: blowerData.count,
          tiemposBlowers: blowerData.times
        }));
      }));
    };

    setupListeners();
    return () => unsubscribes.forEach(unsub => unsub());
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const toggleItem = (field: keyof typeof formData, itemId: string) => {
    setFormData(prev => {
      const currentArray = prev[field] as string[];
      const newArray = currentArray.includes(itemId)
        ? currentArray.filter(item => item !== itemId)
        : [...currentArray, itemId];
      
      return { ...prev, [field]: newArray };
    });
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    
    try {
      const submissionData = {
        ...formData,
        submittedAt: serverTimestamp(),
        submittedBy: auth.currentUser?.email || 'unknown',
      };

      await addDoc(collection(db, 'form_submissions'), submissionData);
      
      // Also notify via backend (WhatsApp)
      try {
        await fetch('/api/submit-form', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(submissionData)
        });
      } catch (notifyError) {
        console.error("Error sending notification:", notifyError);
        // We don't fail the whole submission if notification fails
      }

      setSubmitSuccess(true);
      sessionStorage.removeItem('aquanovaFormData');
      sessionStorage.removeItem('aquanovaFormPage');
      
      // Prepare the redirect URL with the user's email to identify their data
      const baseUrl = "https://app.aquanova.farm/formulario-de-carga-diaria-electricidad";
      const params = new URLSearchParams({
        syncUser: userEmail // This helps the bookmarklet find the right data
      });

      setRedirectUrl(`${baseUrl}?${params.toString()}`);
    } catch (error) {
      console.error("Error submitting form:", error);
      alert("Error al enviar el formulario. Por favor intente de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const MultiSelect = ({ 
    field, 
    label,
    options,
    optionLabelMap
  }: { 
    field: keyof typeof formData, 
    label: string,
    options: string[],
    optionLabelMap?: Record<string, string>
  }) => {
    const [isOpen, setIsOpen] = useState(false);
    const selected = formData[field] as string[];

    return (
      <div className="relative">
        <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
        <div 
          className="border border-slate-300 rounded-lg p-2 min-h-[42px] flex flex-wrap gap-1 cursor-pointer bg-white items-center" 
          onClick={() => setIsOpen(!isOpen)}
        >
          {selected.length === 0 && <span className="text-slate-400 text-sm px-1">Seleccione...</span>}
          {selected.map(id => (
            <span key={id} className="bg-slate-100 border border-slate-200 px-2 py-1 rounded text-xs flex items-center gap-1 text-slate-700">
              {optionLabelMap ? (optionLabelMap[id] || id) : id}
              <button 
                type="button"
                onClick={(e) => { e.stopPropagation(); toggleItem(field, id); }} 
                className="hover:text-red-500 font-bold"
              >
                ×
              </button>
            </span>
          ))}
          <div className="ml-auto text-slate-400 text-xs">▼</div>
        </div>
        
        {isOpen && (
          <div className="absolute z-10 w-full bg-white border border-slate-300 rounded-lg mt-1 shadow-lg max-h-60 overflow-y-auto">
            {options.map(id => (
              <div 
                key={id} 
                className="p-3 hover:bg-slate-50 cursor-pointer flex items-center gap-3 border-b border-slate-50 last:border-0" 
                onClick={() => toggleItem(field, id)}
              >
                <input 
                  type="checkbox" 
                  checked={selected.includes(id)} 
                  readOnly
                  className="rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                />
                <span className="text-sm text-slate-700">{optionLabelMap ? (optionLabelMap[id] || id) : id}</span>
              </div>
            ))}
          </div>
        )}
        {isOpen && <div className="fixed inset-0 z-0" onClick={() => setIsOpen(false)} />}
      </div>
    );
  };

  return (
    <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-200 max-w-lg mx-auto space-y-8">
      <div className="flex justify-between items-start gap-4">
        <h2 className="text-xl font-bold text-slate-800 mb-1 leading-tight">FORMULARIO DE INFORMACIÓN SOBRE ACTIVIDADES DIARIAS SOBRE ELECTRICIDAD</h2>
      </div>
      
      {page === 1 && (
        <>
          <p className="text-sm text-slate-500 mb-6">Información General</p>
          <div className="space-y-6">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">FECHA *</span>
              <input type="date" name="fecha" value={formData.fecha} onChange={handleInputChange} className="mt-1 block w-full border border-slate-300 rounded-lg p-2.5" />
            </label>

            <div className="space-y-2">
              <span className="text-sm font-medium text-slate-700">¿Hubo continuidad en el servicio eléctrico de Corpoelec? *</span>
              <div className="flex gap-4">
                <label className="flex items-center gap-2"><input type="radio" name="continuidad" value="No" checked={formData.continuidad === 'No'} onChange={handleInputChange} /> No</label>
                <label className="flex items-center gap-2"><input type="radio" name="continuidad" value="Si" checked={formData.continuidad === 'Si'} onChange={handleInputChange} /> Si</label>
              </div>
            </div>

            {formData.continuidad === 'No' && (
              <label className="block">
                <span className="text-sm text-slate-600">Si la respuesta anterior fue “No”, especifique la duración de la falla (en minutos)</span>
                <input type="number" name="duracionFalla" value={formData.duracionFalla} onChange={handleInputChange} className="mt-1 block w-full border border-slate-300 rounded-lg p-2.5 bg-slate-50" />
              </label>
            )}

            <div className="space-y-2">
              <span className="text-sm font-medium text-slate-700">¿Hubo falla de voltaje en el servicio eléctrico de Corpoelec? Si/No *</span>
              <div className="flex gap-4">
                <label className="flex items-center gap-2"><input type="radio" name="fallaVoltaje" value="No" checked={formData.fallaVoltaje === 'No'} onChange={handleInputChange} /> No</label>
                <label className="flex items-center gap-2"><input type="radio" name="fallaVoltaje" value="Si" checked={formData.fallaVoltaje === 'Si'} onChange={handleInputChange} /> Si</label>
              </div>
            </div>

            {formData.fallaVoltaje === 'Si' && (
              <label className="block">
                <span className="text-sm text-slate-600">Si la respuesta anterior fue “Si”, especifique la duración de la falla (en minutos).</span>
                <input type="number" name="duracionFallaVoltaje" value={formData.duracionFallaVoltaje} onChange={handleInputChange} className="mt-1 block w-full border border-slate-300 rounded-lg p-2.5 bg-slate-50" />
              </label>
            )}
          </div>
          <button onClick={() => setPage(2)} className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl hover:bg-slate-800">Continuar</button>
        </>
      )}

      {page === 2 && (
        <>
          <div className="border-t pt-8">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Mantenimiento y otros</h3>
            
            <div className="space-y-4">
              <MultiSelect 
                field="mantenimientoCorrectivo" 
                label="¿Se realizó mantenimiento correctivo a alguno de los generadores a continuación?" 
                options={Object.keys(GENERATOR_MAPPING)}
                optionLabelMap={GENERATOR_MAPPING}
              />
              <label className="block text-sm font-medium text-slate-700">Observaciones sobre mantenimiento Correctivo</label>
              <textarea name="obsCorrectivo" value={formData.obsCorrectivo} onChange={handleInputChange} className="w-full border border-slate-300 rounded-lg p-2.5" />

              <MultiSelect 
                field="mantenimientoPreventivo" 
                label="¿Se realizó mantenimiento preventivo a alguno de los generadores a continuación?" 
                options={Object.keys(GENERATOR_MAPPING)}
                optionLabelMap={GENERATOR_MAPPING}
              />
              <label className="block text-sm font-medium text-slate-700">Observaciones sobre Mantenimiento Preventivo</label>
              <textarea name="obsPreventivo" value={formData.obsPreventivo} onChange={handleInputChange} className="w-full border border-slate-300 rounded-lg p-2.5" />

              <MultiSelect 
                field="generadorInoperativo" 
                label="¿Alguno de los generadores a continuación esta inoperativo por averia?" 
                options={Object.keys(GENERATOR_MAPPING)}
                optionLabelMap={GENERATOR_MAPPING}
              />
              <label className="block text-sm font-medium text-slate-700">Observaciones sobre causa de inoperacion de Generador</label>
              <textarea name="obsInoperativo" value={formData.obsInoperativo} onChange={handleInputChange} className="w-full border border-slate-300 rounded-lg p-2.5" />
            </div>
          </div>
          <div className="flex gap-4">
            <button onClick={() => setPage(1)} className="w-full bg-slate-200 text-slate-800 font-bold py-3 rounded-xl hover:bg-slate-300">Anterior</button>
            <button onClick={() => setPage(3)} className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl hover:bg-slate-800">Continuar</button>
          </div>
        </>
      )}

      {page === 3 && (
        <>
          <h3 className="text-lg font-bold text-slate-800 mb-4">Encendido de Generadores</h3>
          <div className="space-y-6">
            {[
              { label: 'Cuantas veces se encendió el generador eléctrico de maternidad *', name: 'encendidoMaternidad', timeName: 'tiempoMaternidad' },
              { label: 'Cuantas veces se encendió el generador eléctrico del campamento *', name: 'encendidoCampamento', timeName: 'tiempoCampamento' },
              { label: 'Cuantas veces se encendió el generador eléctrico de la subestación eléctrica *', name: 'encendidoSubestacion', timeName: 'tiempoSubestacion' },
            ].map((item) => (
              <div key={item.name} className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">{item.label}</label>
                <input type="number" name={item.name} value={formData[item.name as keyof typeof formData] as string} onChange={handleInputChange} placeholder="Si no hubo bombeo, colocar 0." className="w-full border border-slate-300 rounded-lg p-2.5" />
                <div className="flex flex-wrap gap-2 pt-1">
                  {['< 1 hora', '≥ 1 hora y < 2 horas', '≥ 2 horas y < 4 horas', '≥ 4 horas y < 8 horas', '≥ 8 horas'].map(time => (
                    <label key={time} className="flex items-center gap-1 text-xs border border-slate-200 rounded-full px-3 py-1 bg-slate-50">
                      <input type="radio" name={item.timeName} value={time} checked={formData[item.timeName as keyof typeof formData] === time} onChange={handleInputChange} />
                      {time}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <label className="block">
              <span className="text-sm font-medium text-slate-700">¿Cuanto tiempo hubo bombeo de agua de playa? en minutos *</span>
              <input type="number" name="bombeoPlaya" value={formData.bombeoPlaya} onChange={handleInputChange} placeholder="Si no hubo bombeo, colocar 0." className="mt-1 block w-full border border-slate-300 rounded-lg p-2.5" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">¿Cuanto tiempo hubo bombeo de agua pozo? en minutos *</span>
              <input type="number" name="bombeoPozo" value={formData.bombeoPozo} onChange={handleInputChange} placeholder="Si no hubo bombeo, colocar 0." className="mt-1 block w-full border border-slate-300 rounded-lg p-2.5" />
            </label>
            <MultiSelect 
              field="tanquesAireacion" 
              label="¿Qué tanques tuvieron aireadores de aireación encendidos durante el periodo? *" 
              options={TANK_OPTIONS}
            />
            <MultiSelect 
              field="tanquesMovimiento" 
              label="¿Qué tanques tuvieron aireadores de movimiento encendidos durante el periodo? *" 
              options={TANK_OPTIONS}
            />
          </div>
          <div className="flex gap-4 mt-8">
            <button onClick={() => setPage(2)} className="w-full bg-slate-200 text-slate-800 font-bold py-3 rounded-xl hover:bg-slate-300">Anterior</button>
            <button onClick={() => setPage(4)} className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl hover:bg-slate-800">Continuar</button>
          </div>
        </>
      )}

      {page === 4 && (
        <>
          <h3 className="text-lg font-bold text-slate-800 mb-4">Encendido de Blowers</h3>
          <div className="space-y-6">
            <div className="space-y-3">
              <span className="text-sm font-medium text-slate-700 block">¿Cuantas veces se encendieron los blowers (tanque 1-20)? *</span>
              <div className="flex gap-3">
                {['1 vez', '2 veces', '3 veces'].map((label, idx) => {
                  const val = (idx + 1).toString();
                  return (
                    <label key={val} className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-full border transition-all cursor-pointer text-sm font-medium ${formData.encendidoBlowers === val ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}>
                      <input 
                        type="radio" 
                        name="encendidoBlowers" 
                        value={val} 
                        checked={formData.encendidoBlowers === val} 
                        onChange={handleInputChange} 
                        className="sr-only"
                      />
                      {formData.encendidoBlowers === val && <Check size={14} />}
                      {label}
                    </label>
                  );
                })}
              </div>
            </div>

            {formData.encendidoBlowers && (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                {Array.from({ length: parseInt(formData.encendidoBlowers) }).map((_, i) => {
                  const num = (i + 1).toString();
                  const ordinal = num === '1' ? '1er' : num === '2' ? '2da' : '3er';
                  return (
                    <div key={num} className="space-y-2">
                      <label className="block text-sm font-medium text-slate-700">
                        Hora encendido y apagado de los Blowers ({ordinal} vez) *
                      </label>
                      <input
                        type="text"
                        placeholder="HE: hh:mm pm o am / HA: hh:mm pm o am"
                        value={formData.tiemposBlowers[num]}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFormData(prev => ({
                            ...prev,
                            tiemposBlowers: {
                              ...prev.tiemposBlowers,
                              [num]: val
                            }
                          }));
                        }}
                        className="w-full border border-slate-300 rounded-lg p-3 bg-slate-50 text-sm outline-none focus:border-slate-900 transition-all"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex gap-4 mt-8">
            <button onClick={() => setPage(3)} className="w-full bg-slate-200 text-slate-800 font-bold py-3 rounded-xl hover:bg-slate-300">Anterior</button>
            <button onClick={() => setPage(5)} className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl hover:bg-slate-800">Continuar</button>
          </div>
        </>
      )}

      {page === 5 && (
        <>
          <h3 className="text-lg font-bold text-slate-800 mb-4">Reporte de Falla en el sistema Interno</h3>
          <p className="text-sm text-slate-600 mb-4">
            En caso de haberse presentado alguna falla en los equipos de generación, por favor describa la naturaleza de la falla y las medidas adoptadas o previstas para su corrección.
          </p>
          <textarea 
            name="reporteFalla" 
            value={formData.reporteFalla} 
            onChange={handleInputChange} 
            className="w-full border border-slate-300 rounded-lg p-3 bg-slate-50 text-sm min-h-[120px] outline-none focus:border-slate-900 transition-all mb-6"
            placeholder="Describa la falla aquí..."
          />
          
          <div className="space-y-3 mb-8">
            <span className="text-sm font-medium text-slate-700 block">Fotos relevantes del día</span>
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 hover:bg-slate-100 cursor-pointer transition-all">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <svg className="w-8 h-8 mb-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path>
                </svg>
                <p className="text-sm text-slate-500">Subir fotos</p>
              </div>
              <input type="file" className="hidden" multiple accept="image/*" onChange={(e) => {
                console.log("Files selected:", e.target.files);
              }} />
            </label>
          </div>

          <div className="flex gap-4">
            <button onClick={() => setPage(4)} className="w-full bg-slate-200 text-slate-800 font-bold py-3 rounded-xl hover:bg-slate-300" disabled={isSubmitting}>Anterior</button>
            {!submitSuccess ? (
              <button 
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl hover:bg-slate-800 flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {isSubmitting ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <Check size={18} />
                )}
                {isSubmitting ? 'Enviando...' : 'Completar Formulario'}
              </button>
            ) : (
              <a 
                href={redirectUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full bg-emerald-600 text-white font-bold py-3 rounded-xl hover:bg-emerald-700 flex items-center justify-center gap-2 animate-bounce"
              >
                <Check size={18} />
                Ir a Formulario Real
              </a>
            )}
          </div>
          {submitSuccess && (
            <div className="text-center space-y-4">
              <div className="space-y-1">
                <p className="text-emerald-600 text-sm font-bold">
                  ¡Test guardado con éxito!
                </p>
                <p className="text-slate-500 text-xs">
                  Haz clic en el botón verde para abrir la web de la empresa.
                </p>
              </div>

              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-left">
                <p className="text-xs font-bold text-indigo-900 mb-2 flex items-center gap-2">
                  <Smartphone size={14} /> Sincronización para Móvil
                </p>
                <div className="space-y-3 text-[10px] text-indigo-700 leading-relaxed">
                  <p className="font-bold text-indigo-900 border-b border-indigo-200 pb-1">Opción A: Uso Rápido (Cada vez)</p>
                  <p>1. Dale al botón <b>"Copiar Script"</b> abajo.</p>
                  <p>2. Abre la web real con el botón verde.</p>
                  <p>3. En la barra de arriba, borra todo, escribe <b>javascript:</b> y pega el código.</p>
                  
                  <p className="font-bold text-indigo-900 border-b border-indigo-200 pb-1 pt-1">Opción B: Sin Copiar/Pegar (Configura 1 vez)</p>
                  <p>1. Crea un marcador (favorito) en tu navegador con cualquier nombre (ej: "Sincronizar").</p>
                  <p>2. Edita ese marcador y en la <b>URL/Dirección</b> pega el código de abajo.</p>
                  <p>3. ¡Listo! Ahora, cuando estés en la web real, solo toca ese marcador en tus favoritos y se llenará solo.</p>
                </div>
                <div className="space-y-2 mt-3">
                  <button 
                    onClick={copyMagicScript}
                    className="w-full py-2.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? '¡Copiado!' : 'Copiar Script Mágico'}
                  </button>
                  <button 
                    onClick={generateManualSync}
                    disabled={isGeneratingSync}
                    className="w-full py-2.5 bg-slate-800 text-white rounded-lg text-xs font-bold hover:bg-slate-900 transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
                  >
                    {isGeneratingSync ? <Loader2 className="animate-spin" size={14} /> : <Smartphone size={14} />}
                    {isGeneratingSync ? 'Generando...' : 'Generar Código Directo (Hoy)'}
                  </button>

                  {manualSyncCode && (
                    <div className="mt-4 p-3 bg-white border border-indigo-200 rounded-lg space-y-2">
                      <p className="text-[10px] font-bold text-indigo-900 uppercase tracking-wider">Tu Código de Hoy:</p>
                      <textarea 
                        readOnly 
                        value={manualSyncCode}
                        className="w-full h-20 text-[9px] font-mono bg-slate-50 border border-slate-200 rounded p-2 outline-none"
                        onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                      />
                      <p className="text-[9px] text-slate-500 italic">
                        Si no se copió solo, mantén presionado arriba para copiarlo todo.
                      </p>
                      <div className="mt-2 p-2 bg-indigo-50 rounded border border-indigo-100">
                        <p className="text-[10px] font-bold text-indigo-800 mb-1">¿Qué hago con este código?</p>
                        <ol className="text-[9px] text-indigo-700 list-decimal pl-3 space-y-1">
                          <li>Copia todo el código de arriba.</li>
                          <li>Abre la página del <strong>formulario oficial</strong>.</li>
                          <li>Borra la dirección web (URL) de arriba.</li>
                          <li>Escribe la palabra <strong>javascript:</strong> (con los dos puntos).</li>
                          <li>Pega el código copiado justo después y presiona Enter/Ir.</li>
                          <li>¡El formulario se llenará automáticamente!</li>
                        </ol>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
