import { Storage } from '@google-cloud/storage';
import { readFile } from 'fs/promises';

const serviceAccount = JSON.parse(await readFile(new URL('./firebase-service-account.json', import.meta.url)));
const corsConfig = JSON.parse(await readFile(new URL('./cors.json', import.meta.url)));

const storage = new Storage({
    projectId: serviceAccount.project_id,
    credentials: {
        client_email: serviceAccount.client_email,
        private_key: serviceAccount.private_key,
    },
});

const bucketName = 'faculty-schedules-be0e9.firebasestorage.app';

async function setupBucket() {
    const bucket = storage.bucket(bucketName);

    try {
        const [exists] = await bucket.exists();
        if (!exists) {
            console.log(`Bucket ${bucketName} does not exist. Creating...`);
            // Try creating with standard location/class if possible, or just default
            await bucket.create({ location: 'US' });
            console.log(`Bucket ${bucketName} created.`);
        } else {
            console.log(`Bucket ${bucketName} exists.`);
        }
    } catch (error) {
        console.error('Error checking/creating bucket:', error.message);
    }

    try {
        await bucket.setCorsConfiguration(corsConfig);
        console.log('CORS configuration applied successfully to', bucketName);
    } catch (error) {
        console.error('Error applying CORS configuration:', error);
    }
}

setupBucket();
