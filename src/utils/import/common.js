import { writeBatch } from "firebase/firestore";
import { db } from "../../firebase";

export const MAX_BATCH_OPERATIONS = 450;

export const cleanObject = (obj) => {
  if (typeof obj !== "object" || obj === null) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(cleanObject).filter((item) => item !== undefined);
  }
  const cleaned = {};
  Object.entries(obj).forEach(([key, value]) => {
    if (value !== undefined) {
      cleaned[key] = cleanObject(value);
    }
  });
  return cleaned;
};

export const getValueByPath = (obj, path) => {
  if (!path) return undefined;
  return path.split(".").reduce((acc, key) => {
    if (acc === undefined || acc === null) return undefined;
    return acc[key];
  }, obj);
};

export const createBatchWriter = ({ onFlush } = {}) => {
  let batch = writeBatch(db);
  let opCount = 0;
  const pendingChanges = new Set();

  const flush = async () => {
    if (opCount === 0) return;
    await batch.commit();
    pendingChanges.forEach((change) => {
      change.applied = true;
    });
    pendingChanges.clear();
    if (typeof onFlush === "function") {
      await onFlush();
    }
    batch = writeBatch(db);
    opCount = 0;
  };

  const add = async (change, apply) => {
    apply(batch);
    opCount += 1;
    if (change) pendingChanges.add(change);
    if (opCount >= MAX_BATCH_OPERATIONS) {
      await flush();
    }
  };

  return { add, flush };
};
