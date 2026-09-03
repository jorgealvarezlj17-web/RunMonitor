const fs = require('fs');
let code = fs.readFileSync('src/components/AutoReportGenerator.tsx', 'utf8');

const functionStart = "  const checkAndTriggerAutoReport = async () => {";
const functionEnd = "  // --- MAIN LOOP ---"; // wait, let's find the exact next comment or function

const fnStartIdx = code.indexOf(functionStart);
const fnEndIdx = code.indexOf("  useEffect(() => {", fnStartIdx);

if (fnStartIdx !== -1 && fnEndIdx !== -1) {
    code = code.substring(0, fnStartIdx) + code.substring(fnEndIdx);
    
    // Also remove the intervals
    code = code.replace("    const triggerInterval = setInterval(() => checkAndTriggerAutoReport(), 5000);\n", "");
    code = code.replace("        checkAndTriggerAutoReport();\n", "");
    code = code.replace("      clearInterval(triggerInterval);\n", "");
    
    fs.writeFileSync('src/components/AutoReportGenerator.tsx', code);
    console.log("Success");
} else {
    console.log("Could not find bounds");
}
