const fs = require('fs');

let serverFile = fs.readFileSync('server.ts', 'utf8');

// Remove the cron logic and generateAndSendDailyReport
const startDel = serverFile.indexOf('async function generateAndSendDailyReport() {');
const endDel = serverFile.indexOf('// Initial setup');
if (startDel !== -1 && endDel !== -1) {
  serverFile = serverFile.substring(0, startDel) + serverFile.substring(endDel);
}
// Remove trigger-report endpoint
const trStart = serverFile.indexOf('app.post("/api/admin/trigger-report"');
if (trStart !== -1) {
  const trEnd = serverFile.indexOf('});', trStart) + 3;
  serverFile = serverFile.substring(0, trStart) + serverFile.substring(trEnd);
}

fs.writeFileSync('server.ts', serverFile);
