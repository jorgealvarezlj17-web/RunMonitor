import fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';

const cfg = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(cfg);
const db = getFirestore(app, cfg.firestoreDatabaseId);
const auth = getAuth(app);

async function run() {
  await signInWithEmailAndPassword(auth, 'cron@runmonitor.app', 'SecureCronPassword123!');
  const q = query(collection(db, 'whatsapp_backups'), orderBy('timestamp', 'desc'), limit(10));
  const snap = await getDocs(q);
  snap.forEach(d => {
    const data = d.data();
    console.log(`[${data.timestamp}] ${data.recipient} | Status: ${data.status} | Error: ${data.error} | ShiftKey: ${data.shiftKey}`);
  });
  process.exit(0);
}
run();
