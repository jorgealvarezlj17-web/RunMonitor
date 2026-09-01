const fs = require('fs');

let code = fs.readFileSync('api/corte-automatico.js', 'utf8');

const startMarker = "// 5. Generate Report Text";
const endMarker = "// 6. Send to WhatsApp and/or Telegram";

const startIndex = code.indexOf(startMarker);
const endIndex = code.indexOf(endMarker);

if (startIndex !== -1 && endIndex !== -1) {
  const replacement = `// 5. Generate Report Text
    let startLocal = new Date(targetShiftEnd);
    const [startH, startM] = (startTime || '06:00').split(':').map(Number);
    if (startH === endH && startM === endM) {
      startLocal.setUTCDate(targetShiftEnd.getUTCDate() - 1);
      startLocal.setUTCHours(startH, startM, 0, 0);
    } else if (startH > endH || (startH === endH && startM > endM)) {
      startLocal.setUTCDate(targetShiftEnd.getUTCDate() - 1);
      startLocal.setUTCHours(startH, startM, 0, 0);
    } else {
      startLocal.setUTCHours(startH, startM, 0, 0);
    }

    let reportText = '';
    const stagedSnap = await getDoc(doc(db, 'whatsapp_backups', 'staged_upcoming_report'));
    if (stagedSnap.exists() && stagedSnap.data().message) {
      reportText = stagedSnap.data().message;
      console.log('Se uso el reporte pre-generado staged_upcoming_report');
    } else {
       console.log('No se encontro staged. Construyendo de emergencia...');
       reportText = "*REPORTE DE EMERGENCIA*\\nNo se pudo leer el reporte pre-generado. Hubo un error en el cliente.";
    }

    `;
  
  code = code.substring(0, startIndex) + replacement + code.substring(endIndex);
}

// Para hacerlos paralelos:
// Vamos a reemplazar el fetch de Telegram para que NO use await y agregue la promesa a un arreglo
const sendReplacement = `    // 6. Send to WhatsApp and/or Telegram
    let sendSuccess = false;
    let errorMsg = null;
    let resultData = null;

    const fetchWithTimeout = (url, options, timeout = 4000) => {
      return Promise.race([
        fetch(url, options),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout))
      ]);
    };

    let telegramPromise = Promise.resolve();

    try {
      if (settings.telegramBotToken && settings.telegramChatId) {
          const telegramUrl = \`https://api.telegram.org/bot\${settings.telegramBotToken}/sendMessage\`;
          telegramPromise = fetch(telegramUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  chat_id: settings.telegramChatId,
                  text: reportText,
                  parse_mode: 'Markdown'
              })
          }).then(r => r.json()).then(d => {
              if (d.ok) { sendSuccess = true; console.log("Telegram OK"); }
          }).catch(e => console.error("Telegram error:", e));
      }

      // WhatsApp send
      const provider = settings.whatsappProvider || 'render_baileys';
      let formattedTo = settings.whatsappGroupId || settings.greenApiChatId || '120363427690312638@g.us';
      
      if (!formattedTo) {
         if (!sendSuccess) errorMsg = 'No se ha configurado un ID de grupo destino';
      } else {
          let url = settings.whatsappApiUrl || 'https://bot-whatsapp-baileys-jpyb.onrender.com/send-message';
          let bodyPayload = { to: formattedTo.replace('@g.us', '').replace('@c.us', ''), message: reportText };
          
          if (provider === 'green_api') {
              url = \`https://api.green-api.com/waInstance\${settings.greenApiInstanceId}/sendMessage/\${settings.greenApiToken}\`;
              bodyPayload = { chatId: formattedTo, message: reportText };
          }
          
          const resp = await fetchWithTimeout(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(bodyPayload)
          });
          resultData = await resp.json().catch(()=>({}));
          if (resp.ok && !resultData.error) sendSuccess = true;
          else errorMsg = resultData.error || resultData.message || 'WhatsApp API Error';
      }

      // Wait for Telegram to finish in parallel
      await telegramPromise;
      
    } catch(e) {
      errorMsg = e.message;
    }
`;

const replaceStart = "// 6. Send to WhatsApp and/or Telegram";
const replaceEnd = "// 7. Save backup in Firestore";

const s2 = code.indexOf(replaceStart);
const e2 = code.indexOf(replaceEnd);
if (s2 !== -1 && e2 !== -1) {
  code = code.substring(0, s2) + sendReplacement + code.substring(e2);
}

fs.writeFileSync('api/corte-automatico.js', code);
