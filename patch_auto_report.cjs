const fs = require('fs');
let code = fs.readFileSync('src/components/AutoReportGenerator.tsx', 'utf8');

// We remove checkAndTriggerAutoReport and the interval that calls it
code = code.replace(/const checkAndTriggerAutoReport = async \(\) => \{[\s\S]*?\/\/ Update UI state\s*setLastAutoSentShiftKey\(shiftKey\);\s*isExecutingRef\.current = false;\s*\};\s*\}\s*catch[^\}]+\}[\s\S]*?\};\s*\}\s*catch[^\}]+\}[\s\S]*?\};\s*\}\s*catch[^\}]+\}[\s\S]*?finally\s*\{\s*isExecutingRef\.current = false;\s*\}\s*\};/, '');

fs.writeFileSync('src/components/AutoReportGenerator.tsx', code);
