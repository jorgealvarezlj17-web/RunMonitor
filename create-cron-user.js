import admin from 'firebase-admin';
import fs from 'fs';

const cfg = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

admin.initializeApp({
  projectId: cfg.projectId
});

async function run() {
  try {
    const user = await admin.auth().createUser({
      email: 'cron@runmonitor.app',
      password: 'SecureCronPassword123!',
      emailVerified: true
    });
    console.log('Created user:', user.uid);
  } catch(e) {
    if (e.code === 'auth/email-already-exists') {
      console.log('User already exists.');
    } else {
      console.error(e);
    }
  }
}
run();
