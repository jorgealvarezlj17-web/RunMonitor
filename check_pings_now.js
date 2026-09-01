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
  
  console.log("=== LATEST PINGS IN DATABASE ===");
  const q = query(collection(db, 'logs'), where('type', '==', 'ping'), orderBy('timestamp', 'desc'), limit(10));
  const snap = await getDocs(q);
  snap.forEach(d => {
    const data = d.data();
    console.log(`[${data.timestamp ? (data.timestamp.toDate ? data.timestamp.toDate().toISOString() : data.timestamp) : 'N/A'}] ${data.description}`);
  });
  process.exit(0);
}
run();
