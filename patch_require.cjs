const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(/require\('path'\)/g, 'path');
code = code.replace(/require\('fs'\)/g, 'fs');

fs.writeFileSync('server.ts', code);
