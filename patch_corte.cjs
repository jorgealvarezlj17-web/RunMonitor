const fs = require('fs');
let code = fs.readFileSync('src/components/CorteReporte.tsx', 'utf8');

const powerTextInjectRegex = /if \(powerEventsText\) \{\s*text \+= powerEventsText;\s*\}/s;

const newPowerTextAndTanks = `if (powerEventsText) {
        text += powerEventsText;
      }

      if (tanquesAireacion.length > 0 || tanquesMovimiento.length > 0) {
        text += \`_ESTADO CHAPALETAS / TANQUES:_\\n\`;
        if (tanquesAireacion.length > 0) {
          text += \`• Aireación: \${tanquesAireacion.join(', ')}\\n\`;
        }
        if (tanquesMovimiento.length > 0) {
          text += \`• Movimiento: \${tanquesMovimiento.join(', ')}\\n\`;
        }
        text += \`━━━━━━━━━━━━━━━━━━━━\\n\`;
      }`;

code = code.replace(powerTextInjectRegex, newPowerTextAndTanks);

fs.writeFileSync('src/components/CorteReporte.tsx', code);
