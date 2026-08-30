import fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const cfg = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(cfg);
const db = getFirestore(app, cfg.firestoreDatabaseId);
const auth = getAuth(app);

async function run() {
  await signInWithEmailAndPassword(auth, 'cron@runmonitor.app', 'SecureCronPassword123!');
  
  // Set shiftEndTime to right now (local time) minus 2 minutes
  const now = new Date(Date.now() - 4 * 3600 * 1000);
  const endH = now.getUTCHours();
  const endM = now.getUTCMinutes() - 2; 
  // handle underflow simply for test
  const endTime = `${endH.toString().padStart(2,'0')}:${Math.max(0, endM).toString().padStart(2,'0')}`;

  await setDoc(doc(db, 'config', 'app_settings'), {
    shiftEndTime: endTime,
    lastAutoSentShiftKey: '' // clear it
  }, { merge: true });

  console.log(`Set shiftEndTime to ${endTime} and cleared lastAutoSentShiftKey.`);
  process.exit(0);
}
run();
