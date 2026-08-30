import fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, orderBy, limit, where } from 'firebase/firestore';

const cfg = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(cfg);
const db = getFirestore(app, cfg.firestoreDatabaseId);
const auth = getAuth(app);

async function run() {
  await signInWithEmailAndPassword(auth, 'cron@runmonitor.app', 'SecureCronPassword123!');
  
  console.log("--- LATEST WHATSAPP BACKUPS ---");
  const q1 = query(collection(db, 'whatsapp_backups'), orderBy('timestamp', 'desc'), limit(5));
  const snap1 = await getDocs(q1);
  snap1.forEach(d => {
    const data = d.data();
    console.log(`[${data.timestamp}] ${data.recipient} | ShiftKey: ${data.shiftKey} | Status: ${data.status}`);
  });

  console.log("\n--- CRON-JOB PINGS ---");
  const q2 = query(collection(db, 'logs'), where('type', '==', 'ping'), orderBy('timestamp', 'desc'), limit(5));
  const snap2 = await getDocs(q2);
  if (snap2.empty) console.log("NO PINGS RECORDED");
  snap2.forEach(d => {
    const data = d.data();
    console.log(`[${data.timestamp ? (data.timestamp.toDate ? data.timestamp.toDate().toISOString() : data.timestamp) : 'N/A'}] ${data.description}`);
  });

  process.exit(0);
}
run();
