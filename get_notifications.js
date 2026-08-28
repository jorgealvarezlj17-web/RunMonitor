import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "{}");
if (Object.keys(serviceAccount).length > 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  const db = getFirestore();
  const notifs = await db.collection('notifications').orderBy('timestamp', 'desc').limit(5).get();
  notifs.forEach(doc => console.log(doc.data().title, doc.data().timestamp?.toDate()));
} else {
  console.log("No SA key");
}
