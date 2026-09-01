const fs = require('fs');
let code = fs.readFileSync('api/corte-automatico.js', 'utf8');

code = code.replace(
  'if (nowLocal < targetShiftEnd) {',
  'if (nowLocal.getTime() < targetShiftEnd.getTime() - 7000) {'
);

fs.writeFileSync('api/corte-automatico.js', code);
