import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import admin from "firebase-admin";
import {
  deriveScheduleIdentityFromSchedule,
} from "../src/utils/importIdentityUtils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceAccountPath = path.resolve(
  __dirname,
  "../firebase-service-account.json",
);

const serviceAccount = JSON.parse(
  fs.readFileSync(serviceAccountPath, "utf8"),
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const identityStrength = (key) => {
  if (!key) return 0;
  if (key.startsWith("clss:")) return 4;
  if (key.startsWith("crn:")) return 3;
  if (key.startsWith("section:")) return 2;
  if (key.startsWith("composite:")) return 1;
  return 0;
};

const mergeIdentityKeys = (existingKeys, incomingKeys) => {
  const merged = new Set();
  (Array.isArray(existingKeys) ? existingKeys : []).forEach((key) => {
    if (key) merged.add(key);
  });
  (Array.isArray(incomingKeys) ? incomingKeys : []).forEach((key) => {
    if (key) merged.add(key);
  });
  return Array.from(merged);
};

const preferIdentityKey = (existingKey, incomingKey) => {
  if (!incomingKey) return existingKey || "";
  if (!existingKey) return incomingKey;
  return identityStrength(incomingKey) >= identityStrength(existingKey)
    ? incomingKey
    : existingKey;
};

const run = async () => {
  const snapshot = await db.collection("schedules").get();
  let batch = db.batch();
  let batchCount = 0;
  let updated = 0;

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const identity = deriveScheduleIdentityFromSchedule(data);
    if (!identity.primaryKey) continue;

    const resolvedIdentityKey = preferIdentityKey(
      data.identityKey,
      identity.primaryKey,
    );
    const mergedIdentityKeys = mergeIdentityKeys(
      data.identityKeys,
      identity.keys,
    );
    const resolvedSource = resolvedIdentityKey
      ? resolvedIdentityKey.split(":")[0]
      : data.identitySource || "";

    const updates = {};
    if (resolvedIdentityKey && data.identityKey !== resolvedIdentityKey) {
      updates.identityKey = resolvedIdentityKey;
    }
    if (
      mergedIdentityKeys.length > 0 &&
      JSON.stringify(data.identityKeys || []) !==
        JSON.stringify(mergedIdentityKeys)
    ) {
      updates.identityKeys = mergedIdentityKeys;
    }
    if (resolvedSource && data.identitySource !== resolvedSource) {
      updates.identitySource = resolvedSource;
    }

    if (Object.keys(updates).length === 0) continue;

    batch.update(docSnap.ref, updates);
    batchCount += 1;
    updated += 1;

    if (batchCount >= 400) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  console.log(`✅ Updated ${updated} schedule records with identity keys`);
};

run().catch((error) => {
  console.error("❌ Identity backfill failed:", error);
  process.exitCode = 1;
});
