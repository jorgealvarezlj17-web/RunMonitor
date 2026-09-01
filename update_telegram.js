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
  await setDoc(doc(db, 'config', 'app_settings'), {
    telegramBotToken: '8806419490:AAHiQ7K70waz4-2-ucVmdvi8XFckNZ5MWY0',
    telegramChatId: '-5351288780'
  }, { merge: true });
  console.log('Telegram settings saved!');
  process.exit(0);
}
run();
