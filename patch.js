const fs = require('fs');

let code = fs.readFileSync('api/corte-automatico.js', 'utf8');

// 1. Reemplazar la recolección exhaustiva (que toma segundos) por la lectura del staging.
// Donde dice: "// 5. Generate Report Text" hasta "// 6. Send to WhatsApp and/or Telegram"

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
       console.log('No se encontro staged, no se enviara nada o se tendria que compilar. Abortando.');
       return res.status(200).json({ message: 'No staged report found' });
    }

    `;
  
  code = code.substring(0, startIndex) + replacement + code.substring(endIndex);
}

// 2. Hacer paralelos a Telegram y WhatsApp
const telegramStart = "// 6.a Enviar a Telegram (si está configurado)";
const whatsappStart = "// 6.b Enviar a WhatsApp";
const catchStart = "} catch(e) {";

// En vez de hacer un reemplazo de regex complejo, lo modificaremos a mano.

fs.writeFileSync('api/corte-automatico.js', code);
console.log('Patch aplicado en Generate Report Text');
