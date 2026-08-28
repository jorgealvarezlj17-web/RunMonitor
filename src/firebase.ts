import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, getDocFromServer, doc, enableIndexedDbPersistence } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Enable Firestore offline persistence for smooth offline and low-connectivity operation
if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn("Firestore persistence failed-precondition (multiple tabs open). Offline caching is still active in the primary tab.");
    } else if (err.code === 'unimplemented') {
      console.warn("Firestore persistence unimplemented in this browser context.");
    } else {
      console.warn("Firestore persistence initialization error:", err);
    }
  });
}

export const auth = getAuth(app);
export const storage = getStorage(app);

async function testConnection() {
  try {
    // Use getDocFromServer to bypass local cache and test the actual connection
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('the client is offline') || error.message.includes('unavailable')) {
        console.warn("Firestore is operating in offline mode. Local cached state and operations will sync automatically once connection is restored.");
      } else {
        console.error("Firestore connection test encountered an error:", error.message);
      }
    }
  }
}
testConnection();

console.log("Firebase Storage initialized with bucket:", storage.app.options.storageBucket);
