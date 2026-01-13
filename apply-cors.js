import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { readFile } from 'fs/promises';

const serviceAccount = JSON.parse(await readFile(new URL('./firebase-service-account.json', import.meta.url)));
const corsConfig = JSON.parse(await readFile(new URL('./cors.json', import.meta.url)));

const app = initializeApp({
    credential: cert(serviceAccount),
    storageBucket: 'faculty-schedules-be0e9.firebasestorage.app'
});

const bucket = getStorage().bucket();

try {
    await bucket.setCorsConfiguration(corsConfig);
    console.log('CORS configuration applied successfully to', bucket.name);
} catch (error) {
    console.error('Error applying CORS configuration:', error);
}
