const fs = require('fs');
let code = fs.readFileSync('src/components/AutoReportGenerator.tsx', 'utf8');

// Modificar el trigger del cliente para que dispare 7 segundos antes (compensación de red)
code = code.replace(
  'if (now < endToday) {',
  '// Adelantar 7 segundos para compensar la latencia de red y que llegue en el segundo 00\\n    if (now.getTime() < endToday.getTime() - 7000) {'
);

fs.writeFileSync('src/components/AutoReportGenerator.tsx', code);
