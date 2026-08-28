const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');
content = content.replace('await setupCron();', '');
content = content.replace('await setupCron();', '');
fs.writeFileSync('server.ts', content);
