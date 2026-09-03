const admin = require('firebase-admin');
const fs = require('fs');

const serviceAccount = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();
db.collection('config').doc('app_settings').get().then(doc => {
  if (doc.exists) {
    const data = doc.data();
    const token = data.telegramBotToken;
    console.log("Token:", token);
    
    if(token) {
       fetch(`https://api.telegram.org/bot${token}/getMe`)
         .then(r => r.json())
         .then(res => {
             console.log("Bot Info:", res);
             process.exit(0);
         })
         .catch(e => {
             console.error("Fetch Error:", e);
             process.exit(1);
         });
    } else {
       console.log("No telegram token found in DB.");
       process.exit(0);
    }
  } else {
    console.log("No config found.");
    process.exit(0);
  }
}).catch(console.error);
