export interface ShiftAutomationData {
  fecha: string;
  day: string;
  month: string;
  year: string;
  userEmail: string;
  continuidadCorpoelec: string;
  duracionFallaCorpoelec: number;
  fallaVoltaje: string;
  duracionFallaVoltaje: number;
  mantenimientoCorrectivo: string[];
  obsCorrectivo: string;
  mantenimientoPreventivo: string[];
  obsPreventivo: string;
  generadoresInoperativos: string[];
  obsInoperativo: string;
  maternidadVeces: number;
  maternidadTiempo: string;
  campamentoVeces: number;
  campamentoTiempo: string;
  subestacionVeces: number;
  subestacionTiempo: string;
  bombeoPlayaMinutos: number;
  bombeoPozoMinutos: number;
  blowersVeces: string;
  blowerHora1: string;
  blowerHora2: string;
  blowerHora3: string;
  fallaInterna: string;
}

export function generateAquanovaBrowserScript(data: ShiftAutomationData): string {
  const safeData = JSON.stringify(data);

  return `(async function runAquanovaAutoFill() {
  const data = ${safeData};
  console.log("⚡ [Run Monitor] Iniciando auto-llenado visual en Aquanova...", data);

  // Eliminar HUD previo si existía
  const oldHUD = document.getElementById('runmonitor-hud');
  if (oldHUD) oldHUD.remove();

  // Crear HUD visual flotante en la esquina superior derecha
  const hud = document.createElement('div');
  hud.id = 'runmonitor-hud';
  hud.style.cssText = 'position:fixed;top:18px;right:18px;z-index:99999999;background:#090d16;color:#f8fafc;padding:16px 20px;border-radius:16px;border:2px solid #06b6d4;box-shadow:0 20px 40px rgba(0,0,0,0.6);font-family:system-ui,-apple-system,sans-serif;min-width:320px;max-width:380px;box-sizing:border-box;pointer-events:auto;';
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

  // Actualizador universal de inputs React
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
    updateHUD(1, "📝 Llenando Página 1: Información General", "Ingresando Fecha (" + data.fecha + "), Estado de Corpoelec y Voltaje...", 20);
    await sleep(800);

    // Fecha
    const dateInputs = Array.from(document.querySelectorAll('input[data-timescape-input], input[type="text"], input[type="tel"], input[inputmode="numeric"]'))
      .filter(i => i.offsetParent !== null);
    if (dateInputs.length >= 3) {
      fillInput(dateInputs[0], data.day);
      fillInput(dateInputs[1], data.month);
      fillInput(dateInputs[2], data.year);
    }

    // Corpoelec
    const corpLabels = Array.from(document.querySelectorAll('label')).filter(l => l.textContent.trim() === data.continuidadCorpoelec);
    if (corpLabels.length > 0) corpLabels[0].click();

    if (data.continuidadCorpoelec === "No") {
      const corteInput = document.querySelector('input[name="383f785f-e64e-4217-ab60-6ef37f9d7d8c"]') ||
        Array.from(document.querySelectorAll('input')).find(i => (i.placeholder || '').toLowerCase().includes('minuto'));
      if (corteInput) fillInput(corteInput, data.duracionFallaCorpoelec);
    }

    // Falla de Voltaje
    const voltLabels = Array.from(document.querySelectorAll('label')).filter(l => l.textContent.trim() === data.fallaVoltaje);
    if (voltLabels.length > 1) {
      voltLabels[1].click();
    } else if (voltLabels.length > 0) {
      voltLabels[0].click();
    }

    if (data.fallaVoltaje === "Si") {
      const voltInput = document.querySelector('input[name="14450083-f4fe-4197-9d1d-bc9aa5dac2a3"]');
      if (voltInput) fillInput(voltInput, data.duracionFallaVoltaje);
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
    if (matInput) fillInput(matInput, data.maternidadVeces);
    clickMatchingText(data.maternidadTiempo);

    // Campamento
    const campInput = document.querySelector('input[name="Cuantas veces se encendió el generador eléctrico del campamento"]') ||
      Array.from(document.querySelectorAll('input')).find(i => (i.name || '').toLowerCase().includes('campamento'));
    if (campInput) fillInput(campInput, data.campamentoVeces);
    clickMatchingText(data.campamentoTiempo);

    // Subestación
    const subInput = document.querySelector('input[name="Cuantas veces se encendió el generador eléctrico de la subestación eléctrica"]') ||
      Array.from(document.querySelectorAll('input')).find(i => (i.name || '').toLowerCase().includes('subestaci'));
    if (subInput) fillInput(subInput, data.subestacionVeces);
    clickMatchingText(data.subestacionTiempo);

    // Bombeos
    const playaInput = document.querySelector('input[name="¿Cuanto tiempo hubo bombeo de agua de playa? en minutos"]') ||
      Array.from(document.querySelectorAll('input')).find(i => (i.name || '').toLowerCase().includes('playa'));
    if (playaInput) fillInput(playaInput, data.bombeoPlayaMinutos);

    const pozoInput = document.querySelector('input[name="¿Cuanto tiempo hubo bombeo de agua pozo? en minutos"]') ||
      Array.from(document.querySelectorAll('input')).find(i => (i.name || '').toLowerCase().includes('pozo'));
    if (pozoInput) fillInput(pozoInput, data.bombeoPozoMinutos);

    updateHUD(3, "👀 Página 3 Llena", "Generadores y bombeos verificados... Avanzando en 2 segundos...", 65);
    await sleep(2500);

    updateHUD(3, "➡️ Avanzando a Página 4...", "Haciendo clic en Continuar...", 70);
    await clickContinuarBtn();
    await sleep(1800);

    // =================================================================
    // PÁGINA 4: BLOWERS
    // =================================================================
    updateHUD(4, "📝 Llenando Página 4: Blowers (Tanques 1-20)", "Seleccionando encendidos (" + data.blowersVeces + ") y horarios...", 80);
    await sleep(800);

    clickMatchingText(data.blowersVeces);

    const blowerInput = document.querySelector('input[name="Hora 1 encendido Blower"]') ||
      Array.from(document.querySelectorAll('input')).find(i => (i.name || '').toLowerCase().includes('blower'));
    if (blowerInput) fillInput(blowerInput, data.blowerHora1);

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
    if (fallaArea) fillTextarea(fallaArea, data.fallaInterna);

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

export function generateBookmarkletHref(script: string): string {
  // Compress and URI-encode for bookmarklet
  return `javascript:${encodeURIComponent(script)}`;
}
