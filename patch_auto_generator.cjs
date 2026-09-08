const fs = require('fs');
let code = fs.readFileSync('src/components/AutoReportGenerator.tsx', 'utf8');

// 1. Add debounce ref
code = code.replace(/const configLoadedRef = useRef\(false\);/, `const configLoadedRef = useRef(false);
  const stagingTimeoutRef = useRef<NodeJS.Timeout | null>(null);`);

// 2. Fetch tanks in buildCurrentReportText
const maintenanceRegex = /\/\/ Maintenance\s*let maintenanceRecords = '';\s*const maintDoc = await getDoc\(doc\(db, 'config', 'current_shift_maintenance'\)\);\s*if \(maintDoc\.exists\(\)\) \{\s*maintenanceRecords = maintDoc\.data\(\)\.records \|\| '';\s*\}/s;

const newMaintenanceAndTanks = `// Maintenance
    let maintenanceRecords = '';
    const maintDoc = await getDoc(doc(db, 'config', 'current_shift_maintenance'));
    if (maintDoc.exists()) {
      maintenanceRecords = maintDoc.data().records || '';
    }

    // Tanks
    let tanquesAireacion: string[] = [];
    let tanquesMovimiento: string[] = [];
    const tanksDoc = await getDoc(doc(db, 'config', 'current_shift_tanks'));
    if (tanksDoc.exists()) {
      tanquesAireacion = tanksDoc.data().tanquesAireacion || [];
      tanquesMovimiento = tanksDoc.data().tanquesMovimiento || [];
    }`;

code = code.replace(maintenanceRegex, newMaintenanceAndTanks);

// 3. Inject tanks in the text string
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

// 4. Update stageCurrentReport to remove isStagingRef return and use debounce wrapper
const stageCurrentReportFunc = /const stageCurrentReport = async \(\) => \{.*?(?=try \{)/s;
const newStageCurrentReport = `const stageCurrentReport = async () => {
    if (!configLoadedRef.current || isStagingRef.current) return;
    const [endH, endM] = (endTime || '18:00').split(':').map(Number);
    if (isNaN(endH) || isNaN(endM)) return;
    const now = new Date();
    let targetEnd = new Date(now);
    targetEnd.setHours(endH, endM, 0, 0);
    if (now > targetEnd) {
      targetEnd.setDate(targetEnd.getDate() + 1);
    }
    const dateStr = format(targetEnd, 'yyyy-MM-dd');
    const shiftKey = \`\${endTime}_\${dateStr}\`;
    
    // Skip staging if already sent for this shiftKey
    if (lastAutoSentShiftKey === shiftKey) return;
    
    `;

code = code.replace(stageCurrentReportFunc, newStageCurrentReport);

// 5. Add requestStageCurrentReport wrapper before useEffect
const useEffectRegex = /useEffect\(\(\) => \{\s*\/\/ Stage immediately\s*stageCurrentReport\(\);/s;
const newUseEffect = `const requestStageCurrentReport = () => {
    if (stagingTimeoutRef.current) clearTimeout(stagingTimeoutRef.current);
    stagingTimeoutRef.current = setTimeout(() => {
      stageCurrentReport();
    }, 1500);
  };

  useEffect(() => {
    // Stage immediately
    requestStageCurrentReport();`;

code = code.replace(useEffectRegex, newUseEffect);

// 6. Replace stageCurrentReport with requestStageCurrentReport in listeners
const listenersRegex = /const unsubLogs = onSnapshot\(collection\(db, 'logs'\), \(\) => stageCurrentReport\(\)\);\s*const unsubPower = onSnapshot\(collection\(db, 'power_events'\), \(\) => stageCurrentReport\(\)\);\s*const unsubObs = onSnapshot\(doc\(db, 'config', 'current_shift_observations'\), \(\) => stageCurrentReport\(\)\);\s*const unsubMaint = onSnapshot\(doc\(db, 'config', 'current_shift_maintenance'\), \(\) => stageCurrentReport\(\)\);\s*const unsubEquip = onSnapshot\(collection\(db, 'equipment'\), \(\) => stageCurrentReport\(\)\);\s*const stageInterval = setInterval\(\(\) => stageCurrentReport\(\), 10000\);\s*const handleVisibilityChange = \(\) => \{\s*if \(document\.visibilityState === 'visible'\) \{\s*stageCurrentReport\(\);\s*\}\s*\};/s;

const newListeners = `const unsubLogs = onSnapshot(collection(db, 'logs'), () => requestStageCurrentReport());
    const unsubPower = onSnapshot(collection(db, 'power_events'), () => requestStageCurrentReport());
    const unsubObs = onSnapshot(doc(db, 'config', 'current_shift_observations'), () => requestStageCurrentReport());
    const unsubMaint = onSnapshot(doc(db, 'config', 'current_shift_maintenance'), () => requestStageCurrentReport());
    const unsubEquip = onSnapshot(collection(db, 'equipment'), () => requestStageCurrentReport());
    const unsubTanks = onSnapshot(doc(db, 'config', 'current_shift_tanks'), () => requestStageCurrentReport());

    const stageInterval = setInterval(() => requestStageCurrentReport(), 15000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestStageCurrentReport();
      }
    };`;

code = code.replace(listenersRegex, newListeners);

// add unsubTanks to cleanup
const cleanupRegex = /unsubEquip\(\);\s*clearInterval\(stageInterval\);/s;
const newCleanup = `unsubEquip();
      unsubTanks();
      clearInterval(stageInterval);`;

code = code.replace(cleanupRegex, newCleanup);

fs.writeFileSync('src/components/AutoReportGenerator.tsx', code);
