/**
 * clear-faculty-programs.js
 * ----------------------------------
 * This one-off utility clears ALL program assignments from faculty records
 * (sets `programId` to null and removes `isUPD`) and removes `updId` from 
 * every program document.  Run when you want to start fresh and manually 
 * assign programs in the UI.
 *
 * Usage:
 *   npm run clear-programs
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, writeBatch } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAhfG2PP_ewf0tC_lSwN8ca5wlWQV-_lPM",
  authDomain: "faculty-schedules-be0e9.firebaseapp.com",
  projectId: "faculty-schedules-be0e9",
  storageBucket: "faculty-schedules-be0e9.firebasestorage.app",
  messagingSenderId: "714558284379",
  appId: "1:714558284379:web:44a476b2058b8a950e557e",
  measurementId: "G-PHSBFLLYSL"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function clearPrograms() {
  console.log('🚀 Clearing program assignments from all faculty…');

  const [peopleSnap, programsSnap] = await Promise.all([
    getDocs(collection(db, 'people')),
    getDocs(collection(db, 'programs'))
  ]);

  const now = new Date().toISOString();
  const batch = writeBatch(db);
  let updates = 0;

  // Clear faculty programId / isUPD
  peopleSnap.forEach(docSnap => {
    const data = docSnap.data();

    // Identify faculty
    const rolesArr = Array.isArray(data.roles)
      ? data.roles
      : data.roles && typeof data.roles === 'object'
        ? Object.keys(data.roles).filter(r => data.roles[r])
        : [];

    if (rolesArr.includes('faculty')) {
      batch.update(doc(db, 'people', docSnap.id), {
        programId: null,
        isUPD: false,
        updatedAt: now
      });
      updates++;
    }
  });

  // Clear updId in programs
  programsSnap.forEach(pSnap => {
    batch.update(doc(db, 'programs', pSnap.id), {
      updId: '',
      updatedAt: now
    });
  });

  await batch.commit();
  console.log(`✅ Cleared programs for ${updates} faculty and reset UPD on ${programsSnap.size} programs.`);
  process.exit(0);
}

clearPrograms().catch(err => {
  console.error('❌ Failed to clear programs:', err);
  process.exit(1);
}); 