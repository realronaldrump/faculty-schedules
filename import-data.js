import admin from 'firebase-admin';
import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---- CONFIGURATION ----
// IMPORTANT: Download your Firebase service account key JSON file
// and place it in the root of your project.
// Go to Project Settings > Service accounts > Generate new private key
const serviceAccount = require('./firebase-service-account.json'); // UPDATE FILENAME IF NEEDED

const collectionName = 'schedules';
const historyCollectionName = 'history';
const csvFilePath = './public/HSD_Instructor_Schedules.csv';
// -----------------------

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const importData = async () => {
  try {
    console.log(`Reading data from ${csvFilePath}...`);
    const fileContent = fs.readFileSync(csvFilePath, { encoding: 'utf-8' });

    // Parse CSV content
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true
    });

    console.log(`Found ${records.length} records to import into '${collectionName}'.`);

    // Use a batch write for efficiency
    const batch = db.batch();

    records.forEach((record) => {
      // Create a new document reference for each record
      const docRef = db.collection(collectionName).doc(); 
      batch.set(docRef, record);
    });
    
    // Clear the history collection as we are starting fresh
    console.log(`Clearing old data in '${historyCollectionName}'...`);
    const historySnapshot = await db.collection(historyCollectionName).get();
    historySnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
    });


    await batch.commit();

    console.log('-------------------------------------');
    console.log('✅ Data import successful!');
    console.log(`✅ Emptied '${historyCollectionName}' collection.`);
    console.log('-------------------------------------');

  } catch (error) {
    console.error('🔥 Error importing data:', error);
  }
};

importData();