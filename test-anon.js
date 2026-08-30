import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import fs from 'fs';
const cfg = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(cfg);
const auth = getAuth(app);
signInAnonymously(auth).then(user => {
  console.log('Success:', user.user.uid);
  process.exit(0);
}).catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
