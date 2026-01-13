import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import { db, COLLECTIONS } from '../firebase';
import {
  loadTermConfig,
  normalizeTermLabel,
  normalizeTermRecord,
  sortTermsByRecency,
  termCodeFromLabel,
  termLabelFromCode
} from './termUtils';

let cachedFallbackTerms = null;

const buildTermDocId = (termLabel, termCode) => {
  const derivedCode = termCodeFromLabel(termCode || termLabel);
  return derivedCode || '';
};

const buildTermDoc = ({ term, termCode, includeDefaults = false } = {}) => {
  const normalizedTerm = normalizeTermLabel(term) || termLabelFromCode(termCode) || term || '';
  const normalizedTermCode = termCodeFromLabel(termCode || normalizedTerm);
  const now = new Date().toISOString();
  const docData = {
    term: normalizedTerm,
    termCode: normalizedTermCode,
    updatedAt: now
  };

  if (includeDefaults) {
    docData.status = 'active';
    docData.locked = false;
    docData.createdAt = now;
  }

  return docData;
};

export const fetchTermOptions = async ({ includeArchived = false } = {}) => {
  await loadTermConfig();
  const termsSnapshot = await getDocs(collection(db, COLLECTIONS.TERMS));
  let normalized = termsSnapshot.docs.map((docSnap) => {
    const record = {
      id: docSnap.id,
      ...docSnap.data()
    };
    const normalizedRecord = normalizeTermRecord(record);
    const status = normalizedRecord.status || (record.archived ? 'archived' : 'active');
    return {
      ...normalizedRecord,
      status,
      locked: normalizedRecord.locked === true || status === 'archived'
    };
  });
  if (normalized.length === 0) {
    if (cachedFallbackTerms) {
      normalized = cachedFallbackTerms;
    } else {
      console.warn('No term records found; falling back to schedules scan.');
      const schedulesSnapshot = await getDocs(collection(db, COLLECTIONS.SCHEDULES));
      const termMap = new Map();
      schedulesSnapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const normalizedTerm = normalizeTermLabel(data.term || '');
        const termCode = termCodeFromLabel(data.termCode || normalizedTerm);
        const termLabel = normalizedTerm || termLabelFromCode(termCode) || (data.term || '');
        if (!termLabel && !termCode) return;
        const termId = termCode || termLabel;
        if (!termMap.has(termId)) {
          termMap.set(termId, { term: termLabel, termCode });
        }
      });
      normalized = Array.from(termMap.values()).map((term) => {
        const record = normalizeTermRecord(term);
        return {
          ...record,
          status: 'active',
          locked: record.locked === true
        };
      });
      cachedFallbackTerms = normalized;
    }
  }
  const filtered = includeArchived ? normalized : normalized.filter((term) => term.status !== 'archived');
  return sortTermsByRecency(filtered);
};

export const backfillTermMetadata = async () => {
  await loadTermConfig();
  const schedulesSnapshot = await getDocs(collection(db, COLLECTIONS.SCHEDULES));
  const schedules = schedulesSnapshot.docs;
  const termMap = new Map();
  let schedulesUpdated = 0;

  let scheduleBatch = writeBatch(db);
  let scheduleBatchOps = 0;
  const commitScheduleBatch = async () => {
    if (scheduleBatchOps === 0) return;
    await scheduleBatch.commit();
    scheduleBatch = writeBatch(db);
    scheduleBatchOps = 0;
  };

  for (const docSnap of schedules) {
    const data = docSnap.data();
    const normalizedTerm = normalizeTermLabel(data.term || '');
    const termCode = termCodeFromLabel(data.termCode || normalizedTerm);
    const termLabel = normalizedTerm || termLabelFromCode(termCode) || (data.term || '');

    if (termLabel || termCode) {
      const termId = termCode || termLabel;
      if (!termMap.has(termId)) {
        termMap.set(termId, { term: termLabel, termCode });
      }
    }

    const updates = {};
    if (termCode && data.termCode !== termCode) {
      updates.termCode = termCode;
    }
    if (termLabel && data.term !== termLabel) {
      updates.term = termLabel;
    }
    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date().toISOString();
      scheduleBatch.update(docSnap.ref, updates);
      scheduleBatchOps += 1;
      schedulesUpdated += 1;

      if (scheduleBatchOps >= 450) {
        await commitScheduleBatch();
      }
    }
  }

  await commitScheduleBatch();

  const existingTermsSnapshot = await getDocs(collection(db, COLLECTIONS.TERMS));
  const existingTermIds = new Set(existingTermsSnapshot.docs.map((docSnap) => docSnap.id));
  let termsUpserted = 0;

  let termBatch = writeBatch(db);
  let termBatchOps = 0;
  const commitTermBatch = async () => {
    if (termBatchOps === 0) return;
    await termBatch.commit();
    termBatch = writeBatch(db);
    termBatchOps = 0;
  };

  for (const termData of termMap.values()) {
    const termDocId = buildTermDocId(termData.term, termData.termCode);
    if (!termDocId) continue;
    const isNew = !existingTermIds.has(termDocId);
    const termDoc = buildTermDoc({
      term: termData.term,
      termCode: termData.termCode || termDocId,
      includeDefaults: isNew
    });
    termBatch.set(doc(db, COLLECTIONS.TERMS, termDocId), termDoc, { merge: true });
    termBatchOps += 1;
    termsUpserted += 1;

    if (termBatchOps >= 450) {
      await commitTermBatch();
    }
  }

  await commitTermBatch();

  return {
    schedulesScanned: schedules.length,
    schedulesUpdated,
    termsUpserted
  };
};
