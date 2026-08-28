
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function checkCategories() {
  const catSnap = await getDocs(collection(db, 'categories'));
  console.log('Categories in DB:');
  catSnap.forEach(doc => {
    console.log(`- ID: ${doc.id}, Name: "${doc.data().name}"`);
  });
  process.exit(0);
}

checkCategories().catch(err => {
  console.error(err);
  process.exit(1);
});
