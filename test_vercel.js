import fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { format } from 'date-fns';

const cfg = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(cfg);
const db = getFirestore(app, cfg.firestoreDatabaseId);
const auth = getAuth(app);

async function run() {
  await signInWithEmailAndPassword(auth, 'cron@runmonitor.app', 'SecureCronPassword123!');
  
  const settingsDoc = await getDoc(doc(db, 'config', 'app_settings'));
  const settings = settingsDoc.exists() ? settingsDoc.data() : {};
  console.log("Settings:", settings);

  const rangeMode = settings.shiftRangeMode || 'scheduled';
  const startTime = settings.shiftStartTime;
  const endTime = settings.shiftEndTime;
  console.log(`Mode: ${rangeMode}, Start: ${startTime}, End: ${endTime}`);

  if (rangeMode === 'until_now' || !endTime) {
    console.log("Not scheduled mode.");
    return;
  }

  const [endH, endM] = endTime.split(':').map(Number);
  
  // Use exact logic from Vercel
  const now = new Date();
  const tzOffset = -4 * 3600 * 1000;
  const nowLocal = new Date(now.getTime() + tzOffset);
  console.log("nowLocal (UTC-4):", nowLocal.toISOString());

  const targetShiftEnd = new Date(nowLocal);
  targetShiftEnd.setUTCHours(endH, endM, 0, 0);
  console.log("targetShiftEnd:", targetShiftEnd.toISOString());

  if (nowLocal < targetShiftEnd) {
    console.log(`Still before cutoff time (${endTime}).`);
  } else {
    console.log("Time is UP!");
  }
  
  process.exit(0);
}
run();
