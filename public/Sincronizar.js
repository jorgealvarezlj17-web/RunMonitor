(function() {
  function showMsg(msg, isError = false) {
    let div = document.getElementById('rm-sync-msg');
    if (!div) {
      div = document.createElement('div');
      div.id = 'rm-sync-msg';
      div.style.cssText = 'position:fixed;top:20px;right:20px;padding:15px;border-radius:8px;z-index:999999;font-family:sans-serif;font-size:14px;box-shadow:0 4px 6px rgba(0,0,0,0.2);max-width:300px;word-wrap:break-word;transition:all 0.3s;';
      document.body.appendChild(div);
      
      // Botón para cerrar
      let closeBtn = document.createElement('span');
      closeBtn.innerHTML = '✖';
      closeBtn.style.cssText = 'position:absolute;top:5px;right:10px;cursor:pointer;font-size:12px;opacity:0.7;';
      closeBtn.onclick = function() { div.remove(); };
      div.appendChild(closeBtn);
      
      let textDiv = document.createElement('div');
      textDiv.id = 'rm-sync-text';
      div.appendChild(textDiv);
    }
    div.style.backgroundColor = isError ? '#fee2e2' : '#d1fae5';
    div.style.color = isError ? '#991b1b' : '#065f46';
    div.style.border = `1px solid ${isError ? '#f87171' : '#34d399'}`;
    
    document.getElementById('rm-sync-text').innerHTML = '<strong>RunMonitor:</strong><br>' + msg;
    
    if(!isError) {
      setTimeout(() => { if(div && div.parentNode) div.parentNode.removeChild(div); }, 5000);
    }
  }

  console.log('Iniciando sincronización...');
  showMsg('Iniciando script de sincronización...');

  // 1. Obtener el correo (lo guarda en memoria en Aquanova para no pedirlo siempre)
  let userEmail = localStorage.getItem('runmonitor_email');
  if (!userEmail) {
    userEmail = prompt('Por favor, ingresa tu correo electrónico registrado en RunMonitor para sincronizar los datos:');
    if (!userEmail) {
      console.warn('Sincronización cancelada por el usuario.');
      showMsg('Sincronización cancelada.', true);
      return;
    }
    localStorage.setItem('runmonitor_email', userEmail);
  }

  console.log('Solicitando datos para:', userEmail);
  showMsg('Solicitando datos para: ' + userEmail + '...');

  // 2. Definir la función de callback global que recibirá los datos JSONP
  window.aquanovaSyncCallback = async function(d) {
    if (d.error) {
      console.error('Error de RunMonitor:', d.error);
      showMsg('Error: ' + d.error, true);
      if (d.error.includes('No se encontró') || d.error.includes('Email is required')) {
        // Borrar el correo guardado si parece estar mal o falló
        localStorage.removeItem('runmonitor_email'); 
      }
      return;
    }

    showMsg('¡Datos recibidos! Buscando campos del formulario...');

    // 3. Lógica de llenado
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

    let filledCount = 0;

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
        filledCount++;
        await wait(100);
      }
    }
    
    const btn = Array.from(document.querySelectorAll('button, span')).find(b => {
      const t = (b.innerText || '').toLowerCase();
      return t === 'continuar' || t === 'siguiente' || t === 'enviar';
    });
    if (btn) { btn.style.boxShadow = '0 0 0 6px #10b981'; btn.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    
    if(filledCount === 0) {
      console.warn("No se encontraron campos para llenar en esta página.");
      showMsg("No se encontraron campos para rellenar en esta parte del formulario Aquanova.", true);
    } else {
      console.log(`Sincronizados ${filledCount} campos.`);
      showMsg(`¡Sincronizados ${filledCount} campos con éxito!`, false);
    }
  };

  // 4. Inyectar el script JSONP para comunicarse con RunMonitor saltando el bloqueo CORS
  const publicAppUrl = 'https://ais-pre-wmfblgqoaqzcozog7yuyos-108145579037.us-east5.run.app';
  const jsonpUrl = `${publicAppUrl}/api/latest-submission-jsonp?email=${encodeURIComponent(userEmail)}&callback=aquanovaSyncCallback&t=${Date.now()}`;
  
  const s = document.createElement('script');
  s.src = jsonpUrl;
  s.onerror = function() {
    console.error("Error cargando script JSONP. Puede ser un bloqueo del navegador o la página.");
    showMsg('Error de conexión o bloqueo de seguridad (CORS/CSP) detectado. Revisa la consola (F12).', true);
  };
  document.body.appendChild(s);

})();
