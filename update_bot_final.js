import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, updateDoc } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const auth = getAuth(app);
const db = getFirestore(app, config.firestoreDatabaseId);

signInWithEmailAndPassword(auth, 'cron@runmonitor.app', 'SecureCronPassword123!').then(async () => {
    try {
        await updateDoc(doc(db, 'config', 'app_settings'), {
            telegramBotToken: "8707104180:AAGCV-h4ba9DkrAO6kurFa1YDmTCgGB8DeA",
            telegramChatId: "-5536983219"
        });
        console.log("Token updated successfully!");
        process.exit(0);
    } catch (e) {
        console.error("Update failed:", e);
        process.exit(1);
    }
}).catch(e => {
    console.error("Auth failed:", e);
    process.exit(1);
});
