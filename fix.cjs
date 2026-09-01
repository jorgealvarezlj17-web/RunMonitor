const fs = require('fs');
let code = fs.readFileSync('src/components/AutoReportGenerator.tsx', 'utf8');

code = code.replace(
  "// Adelantar 7 segundos para compensar la latencia de red y que llegue en el segundo 00\\n    if (now.getTime() < endToday.getTime() - 7000) {",
  "// Adelantar 7 segundos para compensar la latencia de red y que llegue en el segundo 00\\n    if (now.getTime() < endToday.getTime() - 7000) {"
); // Wait, how did it look? Let's just restore original first or fix the syntax.

