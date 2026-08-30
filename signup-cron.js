import fs from 'fs';

const cfg = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));

async function run() {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${cfg.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'cron@runmonitor.app',
      password: 'SecureCronPassword123!',
      returnSecureToken: true
    })
  });
  const data = await res.json();
  console.log(data);
}
run();
