import fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getCountFromServer } from 'firebase/firestore';

const cfg = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(cfg);
const db = getFirestore(app, cfg.firestoreDatabaseId);
const auth = getAuth(app);

async function run() {
  await signInWithEmailAndPassword(auth, 'cron@runmonitor.app', 'SecureCronPassword123!');
  
  const coll = collection(db, 'logs');
  const snap = await getCountFromServer(coll);
  console.log("Total logs in DB:", snap.data().count);
  
  const pColl = collection(db, 'power_events');
  const pSnap = await getCountFromServer(pColl);
  console.log("Total power events in DB:", pSnap.data().count);
  
  process.exit(0);
}
run();
