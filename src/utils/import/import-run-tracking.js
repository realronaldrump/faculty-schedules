import { doc, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { createBatchWriter } from "./common";

const buildImportRunPayload = (transaction) => ({
  id: transaction.id,
  type: transaction.type,
  description: transaction.description,
  semester: transaction.semester,
  timestamp: transaction.timestamp,
  status: transaction.status,
  stats: transaction.stats,
  importMetadata: transaction.importMetadata || {},
  createdBy: transaction.createdBy,
  lastModified: transaction.lastModified,
});

const sanitizeLineageDocId = (value) => {
  if (!value) return "";
  return String(value).replace(/[^A-Za-z0-9_-]+/g, "_");
};

export const persistImportRunTracking = async (transaction) => {
  const runRef = doc(db, "importRuns", transaction.id);
  const runPayload = buildImportRunPayload(transaction);
  await setDoc(runRef, runPayload, { merge: true });

  if (!Array.isArray(transaction.rowLineage) || transaction.rowLineage.length === 0) {
    return;
  }

  const batchWriter = createBatchWriter();
  const now = new Date().toISOString();
  for (const entry of transaction.rowLineage) {
    if (!entry || typeof entry !== "object") continue;
    const rowId = sanitizeLineageDocId(entry.rowHash || entry.rowIndex || "");
    if (!rowId) continue;
    const docId = `${transaction.id}_${rowId}`;
    const payload = {
      importRunId: transaction.id,
      importType: transaction.type,
      timestamp: now,
      ...entry,
    };
    await batchWriter.add(null, (batch) => {
      batch.set(doc(db, "importRowLineage", docId), payload, { merge: true });
    });
  }
  await batchWriter.flush();
};
