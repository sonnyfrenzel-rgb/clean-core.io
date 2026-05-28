import { initializeApp } from 'firebase/app';
import { initializeFirestore, doc, getDoc } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {}, firebaseConfig.firestoreDatabaseId);

async function check() {
  const uid = 'l8ymJ7qFxcXfvS015JaHLAKXpLp2';
  console.log(`Checking user document for UID: ${uid}...`);
  const snap = await getDoc(doc(db, 'users', uid));
  if (snap.exists()) {
    console.log('Document EXISTS! Content:', snap.data());
  } else {
    console.log('Document DOES NOT EXIST in database.');
  }
  
  console.log('Checking registration request...');
  const regSnap = await getDoc(doc(db, 'registration_requests', uid));
  if (regSnap.exists()) {
    console.log('Reg request EXISTS! Content:', regSnap.data());
  } else {
    console.log('Reg request DOES NOT EXIST.');
  }
}

check().catch(console.error);
