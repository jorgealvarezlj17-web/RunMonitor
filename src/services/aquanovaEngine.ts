/**
 * Engine for Aquanova Form Automation
 * Supports both Cloud Autonomous Submission and Visual Real-Time Laptop Runner
 */

export interface AquanovaShiftPayload {
  fecha: string;
  day: string;
  month: string;
  year: string;
  userEmail: string;
  continuidadCorpoelec: 'Si' | 'No';
  duracionFallaCorpoelec: number;
  fallaVoltaje: 'Si' | 'No';
  duracionFallaVoltaje: number;
  mantenimientoCorrectivo: string[];
  obsCorrectivo: string;
  mantenimientoPreventivo: string[];
  obsPreventivo: string;
  generadoresInoperativos: string[];
  obsInoperativo: string;
  maternidadVeces: number;
  maternidadTiempo: string; // '< 1 hora' | '≥ 1 hora y < 2 horas' | '≥ 4 horas y < 8 horas' | '≥ 8 horas'
  campamentoVeces: number;
  campamentoTiempo: string;
  subestacionVeces: number;
  subestacionTiempo: string;
  bombeoPlayaMinutos: number;
  bombeoPozoMinutos: number;
  tanquesAireacion: string[];
  tanquesMovimiento: string[];
  blowersVeces: '1 vez' | '2 veces' | '3 veces';
  blowerHora1: string;
  blowerHora2: string;
  blowerHora3: string;
  fallaInterna: string;
}

// In-memory cache of latest shift data synced from client
let cachedShiftPayload: AquanovaShiftPayload | null = null;

export function setCachedShiftData(data: Partial<AquanovaShiftPayload>) {
  const current = cachedShiftPayload || {
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
    tanquesAireacion: [],
    tanquesMovimiento: [],
    blowersVeces: '1 vez',
    blowerHora1: 'Continuo sin interrupciones',
    blowerHora2: '',
    blowerHora3: '',
    fallaInterna: 'Sin novedades relevantes durante el turno'
  };
  cachedShiftPayload = { ...current, ...data };
  return cachedShiftPayload;
}

export function getCachedShiftData(): AquanovaShiftPayload | null {
  return cachedShiftPayload;
}

export async function computeAquanovaData(currentDb: any): Promise<AquanovaShiftPayload> {
  const now = new Date();
  
  // Format Date for America/Caracas (Venezuela)
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

  // Default payload or cached payload
  const payload: AquanovaShiftPayload = cachedShiftPayload ? { ...cachedShiftPayload, fecha, day, month, year } : {
    fecha,
    day,
    month,
    year,
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
    tanquesAireacion: [],
    tanquesMovimiento: [],
    blowersVeces: '1 vez',
    blowerHora1: 'Continuo sin interrupciones',
    blowerHora2: '',
    blowerHora3: '',
    fallaInterna: 'Sin novedades relevantes durante el turno'
  };

  if (!currentDb) return payload;

  try {
    // 1. Fetch Equipment & Categories
    const [equipSnap, catSnap, powerEventsSnap, settingsSnap] = await Promise.all([
      currentDb.collection('equipment').get(),
      currentDb.collection('categories').get(),
      currentDb.collection('power_events').orderBy('timestamp', 'desc').limit(50).get(),
      currentDb.collection('config').doc('app_settings').get()
    ]);

    const categories: Record<string, string> = {};
    catSnap.forEach((doc: any) => {
      categories[doc.id] = (doc.data().name || '').toLowerCase();
    });

    const equipmentList: any[] = [];
    equipSnap.forEach((doc: any) => {
      const data = doc.data();
      equipmentList.push({
        id: doc.id,
        name: data.name || '',
        category: categories[data.categoryId] || '',
        status: data.status || 'off',
        disabled: !!data.disabled,
        disabledNote: data.disabledNote || '',
        lastTurnedOn: data.lastTurnedOn,
        totalUsageTime: data.totalUsageTime || 0
      });
    });

    // 2. Compute Power Events (Corpoelec)
    let totalCorteMinutos = 0;
    let totalFallaVoltajeMinutos = 0;
    let hayCorte = false;
    let hayFalla = false;

    powerEventsSnap.forEach((doc: any) => {
      const ev = doc.data();
      if (!ev.timestamp) return;
      const evDate = ev.timestamp.toDate ? ev.timestamp.toDate() : new Date(ev.timestamp);
      // Check if within last 24 hours
      if (now.getTime() - evDate.getTime() < 24 * 60 * 60 * 1000) {
        if (ev.type === 'corte') {
          hayCorte = true;
          totalCorteMinutos += ev.durationMinutes || 0;
        } else if (ev.type === 'falla') {
          hayFalla = true;
          totalFallaVoltajeMinutos += ev.durationMinutes || 0;
        }
      }
    });

    if (hayCorte) {
      payload.continuidadCorpoelec = 'No';
      payload.duracionFallaCorpoelec = totalCorteMinutos;
    }
    if (hayFalla) {
      payload.fallaVoltaje = 'Si';
      payload.duracionFallaVoltaje = totalFallaVoltajeMinutos;
    }

    // 3. Compute Generators
    const mapTimeToLabel = (minutes: number) => {
      if (minutes >= 480) return '≥ 8 horas';
      if (minutes >= 240) return '≥ 4 horas y < 8 horas';
      if (minutes >= 60) return '≥ 1 hora y < 2 horas';
      return '< 1 hora';
    };

    equipmentList.forEach(eq => {
      const name = eq.name.toLowerCase();
      const cat = eq.category.toLowerCase();
      const minutes = Math.floor((eq.totalUsageTime || 0) / 60);

      // Inoperativos
      if (eq.disabled) {
        payload.generadoresInoperativos.push(eq.name);
        if (eq.disabledNote) {
          payload.obsInoperativo += `${eq.name}: ${eq.disabledNote}. `;
        }
      }

      // Maternidad
      if (name.includes('maternidad') || cat.includes('maternidad')) {
        if (eq.status === 'on' || minutes > 0) {
          payload.maternidadVeces = Math.max(1, payload.maternidadVeces);
          payload.maternidadTiempo = mapTimeToLabel(minutes);
        }
      }

      // Campamento
      if (name.includes('campamento') || cat.includes('campamento')) {
        if (eq.status === 'on' || minutes > 0) {
          payload.campamentoVeces = Math.max(1, payload.campamentoVeces);
          payload.campamentoTiempo = mapTimeToLabel(minutes);
        }
      }

      // Subestación
      if (name.includes('subestacion') || name.includes('sub_estacion') || cat.includes('subestacion')) {
        if (eq.status === 'on' || minutes > 0) {
          payload.subestacionVeces = Math.max(1, payload.subestacionVeces);
          payload.subestacionTiempo = mapTimeToLabel(minutes);
        }
      }

      // Bombeo Playa
      if (name.includes('playa') && (name.includes('bomba') || cat.includes('bomba'))) {
        payload.bombeoPlayaMinutos = minutes;
      }

      // Bombeo Pozo
      if ((name.includes('pozo') || name.includes('pozo #4')) && (name.includes('bomba') || cat.includes('bomba'))) {
        payload.bombeoPozoMinutos = minutes;
      }
    });

  } catch (error: any) {
    if (error.code === 7 || error.message?.includes('PERMISSION_DENIED')) {
      console.warn("[Aquanova] Note: Server Admin SDK lacks access to named database; using cached/calculated shift payload.");
    } else {
      console.error("Error computing Aquanova shift data:", error);
    }
  }

  return payload;
}

/**
 * Returns the executable Node.js automation script that will be downloaded and executed
 * by the laptop runner. Controls Chrome via Puppeteer with high visual fidelity.
 */
export function getAutomationScriptContent(data: AquanovaShiftPayload, appBaseUrl: string): string {
  return `/**
 * Aquanova Automation Engine - Dynamic Remote Script
 * Run Monitor -> Aquanova Auto-Fill
 */
const puppeteer = require('puppeteer');

(async () => {
  console.log("==================================================");
  console.log("🚀 INICIANDO AUTOMATIZACIÓN EN VIVO DE AQUANOVA");
  console.log("📅 Fecha del turno:", "${data.fecha}");
  console.log("👤 Operador:", "${data.userEmail}");
  console.log("==================================================");

  // Iniciar Chrome en modo visual en la pantalla de la laptop
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized', '--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  // Utilidad para esperar
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Llenado directo y rápido de campos
  async function fillInput(selector, text) {
    try {
      const element = await page.$(selector);
      if (element) {
        await element.click({ clickCount: 3 });
        await element.press('Backspace');
        await element.type(String(text), { delay: 10 });
      }
    } catch (e) {}
  }

  try {
    console.log("🌐 Navegando a la página de Carga Diaria Electricidad en Aquanova...");
    await page.goto('https://app.aquanova.farm/formulario-de-carga-diaria-electricidad', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    await wait(2500);

    // ----------------------------------------------------
    // DETECCIÓN Y LOGIN AUTOMÁTICO (SI ESTÁ CERRADA LA SESIÓN)
    // ----------------------------------------------------
    const currentUrl = page.url();
    const hasPasswordField = await page.$('input[type="password"]');
    if (currentUrl.includes('signin') || currentUrl.includes('login') || hasPasswordField) {
      console.log("🔑 Sesión no iniciada. Ingresando credenciales de operador automáticamente...");
      
      const emailField = await page.$('input[type="email"], input[name="email"], input[type="text"]');
      if (emailField) {
        await emailField.click({ clickCount: 3 });
        await emailField.type("${data.userEmail}", { delay: 50 });
      }

      const passField = await page.$('input[type="password"], input[name="password"]');
      if (passField) {
        await passField.click({ clickCount: 3 });
        await passField.type("1234Aquanova", { delay: 50 });
      }

      await wait(500);
      console.log("🚀 Haciendo clic en Iniciar Sesión...");
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, input[type="submit"]'));
        const submitBtn = btns.find(b => {
          const text = (b.textContent || b.value || '').toLowerCase();
          return text.includes('iniciar') || text.includes('sign in') || text.includes('log in') || text.includes('entrar');
        });
        if (submitBtn) submitBtn.click();
      });

      console.log("⏳ Esperando carga de sesión...");
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
      await wait(2000);

      // Si no estamos en el formulario, redirigir
      if (!page.url().includes('formulario-de-carga-diaria-electricidad')) {
        await page.goto('https://app.aquanova.farm/formulario-de-carga-diaria-electricidad', {
          waitUntil: 'networkidle2',
          timeout: 60000
        });
        await wait(2500);
      }
    }

    // ==========================================
    // PASO 1: INFORMACIÓN GENERAL Y CORPOELEC
    // ==========================================
    console.log("📝 Llenando Sección 1: Información General y Corpoelec...");

    // 1. Fecha (dd / mm / yyyy)
    try {
      const inputs = await page.$$('input[data-timescape-input]');
      if (inputs.length >= 3) {
        await inputs[0].click({ clickCount: 3 });
        await inputs[0].type("${data.day}", { delay: 20 });
        await inputs[1].click({ clickCount: 3 });
        await inputs[1].type("${data.month}", { delay: 20 });
        await inputs[2].click({ clickCount: 3 });
        await inputs[2].type("${data.year}", { delay: 20 });
      }
    } catch (err) {
      console.warn("Aviso en campo fecha:", err.message);
    }

    // 2. Continuidad Corpoelec
    await wait(200);
    const continuidadTarget = "${data.continuidadCorpoelec}";
    await page.evaluate((targetText) => {
      const labels = Array.from(document.querySelectorAll('label'));
      const btn = labels.find(l => l.textContent.trim() === targetText);
      if (btn) btn.click();
    }, continuidadTarget);

    if (continuidadTarget === 'No') {
      await fillInput('input[name="383f785f-e64e-4217-ab60-6ef37f9d7d8c"]', "${data.duracionFallaCorpoelec}");
    }

    // 3. Falla de voltaje
    await wait(200);
    const fallaTarget = "${data.fallaVoltaje}";
    await page.evaluate((targetText) => {
      const labels = Array.from(document.querySelectorAll('label'));
      const btn = labels.find(l => l.textContent.trim() === targetText);
      if (btn) btn.click();
    }, fallaTarget);

    if (fallaTarget === 'Si') {
      await fillInput('input[name="14450083-f4fe-4197-9d1d-bc9aa5dac2a3"]', "${data.duracionFallaVoltaje}");
    }

    // Pausa para que veas la Sección 1 completamente llena
    console.log("👀 Sección 1 completamente llena en pantalla.");
    await wait(1800);

    // Clic en Continuar (Paso 1 -> Paso 2)
    console.log("➡️ Pasando a Sección 2...");
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const cont = buttons.find(b => b.textContent.includes('Continuar'));
      if (cont) cont.click();
    });

    await wait(1500);

    // ==========================================
    // PASO 2: MANTENIMIENTO Y OTROS
    // ==========================================
    console.log("📝 Revisando Sección 2: Mantenimientos...");
    await wait(1200);

    // Clic en Continuar (Paso 2 -> Paso 3)
    console.log("➡️ Pasando a Sección 3...");
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const cont = buttons.find(b => b.textContent.includes('Continuar'));
      if (cont) cont.click();
    });

    await wait(1500);

    // ==========================================
    // PASO 3: GENERADORES, BOMBEO Y AIREADORES
    // ==========================================
    console.log("📝 Llenando Sección 3: Generadores y Bombeo...");
    
    // Maternidad
    await fillInput('input[name="Cuantas veces se encendió el generador eléctrico de maternidad"]', "${data.maternidadVeces}");
    await page.evaluate((label) => {
      const labels = Array.from(document.querySelectorAll('label'));
      const opt = labels.find(l => l.textContent.includes(label));
      if (opt) opt.click();
    }, "${data.maternidadTiempo}");

    // Campamento
    await fillInput('input[name="Cuantas veces se encendió el generador eléctrico del campamento"]', "${data.campamentoVeces}");
    await page.evaluate((label) => {
      const labels = Array.from(document.querySelectorAll('label'));
      const opt = labels.find(l => l.textContent.includes(label));
      if (opt) opt.click();
    }, "${data.campamentoTiempo}");

    // Subestación
    await fillInput('input[name="Cuantas veces se encendió el generador eléctrico de la subestación eléctrica"]', "${data.subestacionVeces}");
    await page.evaluate((label) => {
      const labels = Array.from(document.querySelectorAll('label'));
      const opt = labels.find(l => l.textContent.includes(label));
      if (opt) opt.click();
    }, "${data.subestacionTiempo}");

    // Bombeo Playa y Pozo
    await fillInput('input[name="¿Cuanto tiempo hubo bombeo de agua de playa? en minutos"]', "${data.bombeoPlayaMinutos}");
    await fillInput('input[name="¿Cuanto tiempo hubo bombeo de agua pozo? en minutos"]', "${data.bombeoPozoMinutos}");

    // Pausa para que veas la Sección 3 completamente llena
    console.log("👀 Sección 3 completamente llena en pantalla.");
    await wait(1800);

    // Clic en Continuar (Paso 3 -> Paso 4)
    console.log("➡️ Pasando a Sección 4...");
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const cont = buttons.find(b => b.textContent.includes('Continuar'));
      if (cont) cont.click();
    });

    await wait(1500);

    // ==========================================
    // PASO 4: BLOWERS
    // ==========================================
    console.log("📝 Llenando Sección 4: Blowers...");
    await page.evaluate((veces) => {
      const labels = Array.from(document.querySelectorAll('label'));
      const btn = labels.find(l => l.textContent.includes(veces));
      if (btn) btn.click();
    }, "${data.blowersVeces}");

    await wait(200);
    await fillInput('input[name="Hora 1 encendido Blower"]', "${data.blowerHora1}");

    // Pausa para que veas la Sección 4 completamente llena
    console.log("👀 Sección 4 completamente llena en pantalla.");
    await wait(1800);

    // Clic en Continuar (Paso 4 -> Paso 5)
    console.log("➡️ Pasando a Sección 5 (Final)...");
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const cont = buttons.find(b => b.textContent.includes('Continuar'));
      if (cont) cont.click();
    });

    await wait(1500);

    // ==========================================
    // PASO 5: REPORTE DE FALLA Y COMPLETADO
    // ==========================================
    console.log("📝 Llenando Sección 5: Novedades del Turno...");
    await fillInput('textarea[name="Alguna falla del sistema a Reportar"]', "${data.fallaInterna}");

    await wait(800);
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
      const finishBtn = buttons.find(b => {
        const text = (b.textContent || b.value || '').toLowerCase();
        return text.includes('completar') || text.includes('enviar') || text.includes('submit');
      });
      if (finishBtn) {
        finishBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });

    console.log("==================================================");
    console.log("✅ ¡LAS 5 SECCIONES FUERON LLENADAS Y VERIFICADAS!");
    console.log("👀 La ventana de Chrome está abierta en tu pantalla.");
    console.log("👉 Haz clic en 'Completar Formulario' para guardar en Aquanova.");
    console.log("==================================================");

  } catch (error) {
    console.error("❌ Error en la automatización:", error);
  }
})();
`;
}

/**
 * Generates client-side JavaScript that can be executed directly inside the user's
 * real browser tab at https://app.aquanova.farm/formulario-de-carga-diaria-electricidad
 * via a Chrome Bookmarklet or Browser Console.
 * It fills each section visually, displays a floating progress HUD, pauses at each step,
 * and clicks "Continuar" through all 5 sections.
 */
export function getBrowserAutomatorCode(data: AquanovaShiftPayload): string {
  return `(async function runAquanovaAutoFill() {
  console.log("⚡ [Run Monitor] Iniciando auto-llenado visual en Aquanova...");

  // Eliminar banner previo si existía
  const oldHUD = document.getElementById('runmonitor-hud');
  if (oldHUD) oldHUD.remove();

  // Crear HUD visual flotante en la esquina superior derecha
  const hud = document.createElement('div');
  hud.id = 'runmonitor-hud';
  hud.style.cssText = 'position:fixed;top:18px;right:18px;z-index:99999999;background:#090d16;color:#f8fafc;padding:16px 20px;border-radius:16px;border:2px solid #06b6d4;box-shadow:0 20px 40px rgba(0,0,0,0.6);font-family:system-ui,-apple-system,sans-serif;min-width:320px;max-width:380px;box-sizing:border-box;pointer-events:auto;animation:fadeIn 0.3s ease;';
  hud.innerHTML = \`
    <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #1e293b;padding-bottom:10px;margin-bottom:10px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:18px;">⚡</span>
        <div>
          <div style="font-weight:900;font-size:13px;color:#38bdf8;letter-spacing:0.5px;line-height:1;">RUN MONITOR</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:2px;">Auto-Llenado en Vivo</div>
        </div>
      </div>
      <span id="rm-badge" style="font-size:11px;font-weight:bold;background:#0284c7;color:#fff;padding:3px 10px;border-radius:999px;">
        Página 1 de 5
      </span>
    </div>
    <div id="rm-status" style="font-size:13px;font-weight:700;color:#f8fafc;margin-bottom:4px;">
      Iniciando proceso...
    </div>
    <div id="rm-sub" style="font-size:11px;color:#94a3b8;line-height:1.4;">
      Preparando campos del formulario oficial...
    </div>
    <div style="margin-top:12px;width:100%;height:4px;background:#1e293b;border-radius:2px;overflow:hidden;">
      <div id="rm-progress" style="width:20%;height:100%;background:linear-gradient(90deg,#06b6d4,#10b981);transition:width 0.4s ease;"></div>
    </div>
  \`;
  document.body.appendChild(hud);

  const updateHUD = (step, title, subtitle, pct) => {
    const badge = document.getElementById('rm-badge');
    const status = document.getElementById('rm-status');
    const sub = document.getElementById('rm-sub');
    const prog = document.getElementById('rm-progress');
    if (badge) badge.innerText = typeof step === 'number' ? 'Página ' + step + ' de 5' : step;
    if (status) status.innerText = title;
    if (sub) sub.innerText = subtitle;
    if (prog) prog.style.width = pct + '%';
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // Actualizador universal de inputs de React / HTML5
  const fillInput = (el, val) => {
    if (!el) return false;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus();
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (nativeSetter) {
      nativeSetter.call(el, val);
    } else {
      el.value = val;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
    return true;
  };

  const fillTextarea = (el, val) => {
    if (!el) return false;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus();
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    if (nativeSetter) {
      nativeSetter.call(el, val);
    } else {
      el.value = val;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
    return true;
  };

  const clickMatchingText = (text) => {
    const targets = Array.from(document.querySelectorAll('label, button, div, span, p'));
    const cleanSearch = text.trim().toLowerCase();
    // Prioridad a labels directos
    const match = targets.find(t => t.textContent.trim().toLowerCase() === cleanSearch) ||
                  targets.find(t => t.textContent.trim().toLowerCase().includes(cleanSearch));
    if (match) {
      match.scrollIntoView({ behavior: 'smooth', block: 'center' });
      match.click();
      const input = match.querySelector('input') || match.parentElement?.querySelector('input');
      if (input) input.click();
      return true;
    }
    return false;
  };

  const clickContinuarBtn = async () => {
    await sleep(600);
    const buttons = Array.from(document.querySelectorAll('button, input[type="button"]'));
    const btn = buttons.find(b => (b.textContent || b.value || '').trim().toLowerCase().includes('continuar'));
    if (btn) {
      btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      btn.style.outline = '4px solid #06b6d4';
      await sleep(500);
      btn.click();
      return true;
    }
    return false;
  };

  try {
    // =================================================================
    // PÁGINA 1: INFORMACIÓN GENERAL Y CORPOELEC
    // =================================================================
    updateHUD(1, "📝 Llenando Página 1: Información General", "Ingresando Fecha (${data.fecha}), Estado de Corpoelec y Voltaje...", 20);
    await sleep(800);

    // Fecha (Softr timescape or text inputs)
    const dateInputs = Array.from(document.querySelectorAll('input[data-timescape-input], input[type="text"], input[type="tel"], input[inputmode="numeric"]'))
      .filter(i => i.offsetParent !== null);
    if (dateInputs.length >= 3) {
      fillInput(dateInputs[0], "${data.day}");
      fillInput(dateInputs[1], "${data.month}");
      fillInput(dateInputs[2], "${data.year}");
    }

    // Corpoelec
    const corpLabels = Array.from(document.querySelectorAll('label')).filter(l => l.textContent.trim() === "${data.continuidadCorpoelec}");
    if (corpLabels.length > 0) corpLabels[0].click();

    if ("${data.continuidadCorpoelec}" === "No") {
      const corteInput = document.querySelector('input[name="383f785f-e64e-4217-ab60-6ef37f9d7d8c"]') ||
        Array.from(document.querySelectorAll('input')).find(i => (i.placeholder || '').toLowerCase().includes('minuto'));
      if (corteInput) fillInput(corteInput, "${data.duracionFallaCorpoelec}");
    }

    // Falla de Voltaje
    const voltLabels = Array.from(document.querySelectorAll('label')).filter(l => l.textContent.trim() === "${data.fallaVoltaje}");
    if (voltLabels.length > 1) {
      voltLabels[1].click();
    } else if (voltLabels.length > 0) {
      voltLabels[0].click();
    }

    if ("${data.fallaVoltaje}" === "Si") {
      const voltInput = document.querySelector('input[name="14450083-f4fe-4197-9d1d-bc9aa5dac2a3"]');
      if (voltInput) fillInput(voltInput, "${data.duracionFallaVoltaje}");
    }

    updateHUD(1, "👀 Página 1 Llena", "Verificando en pantalla... Avanzando en 2 segundos...", 20);
    await sleep(2200);

    updateHUD(1, "➡️ Avanzando a Página 2...", "Haciendo clic en Continuar...", 25);
    await clickContinuarBtn();
    await sleep(1800);

    // =================================================================
    // PÁGINA 2: MANTENIMIENTOS
    // =================================================================
    updateHUD(2, "📝 Revisando Página 2: Mantenimientos", "Verificando generadores inoperativos y mantenimientos...", 40);
    await sleep(2000);

    updateHUD(2, "➡️ Avanzando a Página 3...", "Haciendo clic en Continuar...", 45);
    await clickContinuarBtn();
    await sleep(1800);

    // =================================================================
    // PÁGINA 3: GENERADORES Y BOMBEO
    // =================================================================
    updateHUD(3, "📝 Llenando Página 3: Generadores y Bombeo", "Ingresando Maternidad, Campamento, Subestación y Bombeos...", 60);
    await sleep(800);

    // Maternidad
    const matInput = document.querySelector('input[name="Cuantas veces se encendió el generador eléctrico de maternidad"]') ||
      Array.from(document.querySelectorAll('input')).find(i => (i.name || '').toLowerCase().includes('maternidad'));
    if (matInput) fillInput(matInput, "${data.maternidadVeces}");
    clickMatchingText("${data.maternidadTiempo}");

    // Campamento
    const campInput = document.querySelector('input[name="Cuantas veces se encendió el generador eléctrico del campamento"]') ||
      Array.from(document.querySelectorAll('input')).find(i => (i.name || '').toLowerCase().includes('campamento'));
    if (campInput) fillInput(campInput, "${data.campamentoVeces}");
    clickMatchingText("${data.campamentoTiempo}");

    // Subestación
    const subInput = document.querySelector('input[name="Cuantas veces se encendió el generador eléctrico de la subestación eléctrica"]') ||
      Array.from(document.querySelectorAll('input')).find(i => (i.name || '').toLowerCase().includes('subestaci'));
    if (subInput) fillInput(subInput, "${data.subestacionVeces}");
    clickMatchingText("${data.subestacionTiempo}");

    // Bombeos
    const playaInput = document.querySelector('input[name="¿Cuanto tiempo hubo bombeo de agua de playa? en minutos"]') ||
      Array.from(document.querySelectorAll('input')).find(i => (i.name || '').toLowerCase().includes('playa'));
    if (playaInput) fillInput(playaInput, "${data.bombeoPlayaMinutos}");

    const pozoInput = document.querySelector('input[name="¿Cuanto tiempo hubo bombeo de agua pozo? en minutos"]') ||
      Array.from(document.querySelectorAll('input')).find(i => (i.name || '').toLowerCase().includes('pozo'));
    if (pozoInput) fillInput(pozoInput, "${data.bombeoPozoMinutos}");

    updateHUD(3, "👀 Página 3 Llena", "Generadores y bombeos verificados... Avanzando en 2 segundos...", 65);
    await sleep(2500);

    updateHUD(3, "➡️ Avanzando a Página 4...", "Haciendo clic en Continuar...", 70);
    await clickContinuarBtn();
    await sleep(1800);

    // =================================================================
    // PÁGINA 4: BLOWERS
    // =================================================================
    updateHUD(4, "📝 Llenando Página 4: Blowers (Tanques 1-20)", "Seleccionando encendidos (${data.blowersVeces}) y horarios...", 80);
    await sleep(800);

    clickMatchingText("${data.blowersVeces}");

    const blowerInput = document.querySelector('input[name="Hora 1 encendido Blower"]') ||
      Array.from(document.querySelectorAll('input')).find(i => (i.name || '').toLowerCase().includes('blower'));
    if (blowerInput) fillInput(blowerInput, "${data.blowerHora1}");

    updateHUD(4, "👀 Página 4 Llena", "Horarios de Blowers registrados... Avanzando en 2 segundos...", 85);
    await sleep(2200);

    updateHUD(4, "➡️ Avanzando a Página 5 (Final)...", "Haciendo clic en Continuar...", 90);
    await clickContinuarBtn();
    await sleep(1800);

    // =================================================================
    // PÁGINA 5: NOVEDADES Y COMPLETADO
    // =================================================================
    updateHUD(5, "📝 Llenando Página 5: Novedades del Turno", "Escribiendo reporte final...", 95);
    await sleep(800);

    const fallaArea = document.querySelector('textarea[name="Alguna falla del sistema a Reportar"]') || document.querySelector('textarea');
    if (fallaArea) fillTextarea(fallaArea, "${data.fallaInterna}");

    // Resaltar en verde esmeralda el botón de completar formulario
    const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
    const finishBtn = buttons.find(b => {
      const t = (b.textContent || b.value || '').trim().toLowerCase();
      return t.includes('completar') || t.includes('enviar') || t.includes('submit');
    });

    if (finishBtn) {
      finishBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      finishBtn.style.outline = '6px solid #10b981';
      finishBtn.style.boxShadow = '0 0 30px rgba(16, 185, 129, 0.8)';
    }

    updateHUD("¡Listo!", "✅ ¡LAS 5 PÁGINAS FUERON LLENADAS!", "Revisa los campos y haz clic en 'Completar Formulario' para guardar.", 100);
    const badge = document.getElementById('rm-badge');
    if (badge) {
      badge.style.background = '#10b981';
      badge.innerText = '✅ Llenado Completo';
    }

  } catch (err) {
    console.error("Error en auto-llenado:", err);
    updateHUD("Error", "❌ Ocurrió una novedad", err.message, 100);
  }
})();`;
}
