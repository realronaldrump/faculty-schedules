import { deleteField, doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { cleanObject, getValueByPath } from "./common";

export const toRollbackPayload = (value) => {
  const cleaned = cleanObject(value);
  if (!cleaned || typeof cleaned !== "object" || Array.isArray(cleaned)) {
    return cleaned;
  }
  const payload = { ...cleaned };
  delete payload.id;
  return payload;
};

export const buildRollbackModifyUpdates = (change = {}) => {
  const rollbackUpdates = {};
  const pendingUpdates =
    change?.newData && typeof change.newData === "object" ? change.newData : {};

  Object.keys(pendingUpdates).forEach((key) => {
    if (!key || key === "updatedAt") return;
    const originalValue = getValueByPath(change.originalData || {}, key);
    if (originalValue === undefined) {
      rollbackUpdates[key] = deleteField();
      return;
    }
    rollbackUpdates[key] = cleanObject(originalValue);
  });

  return rollbackUpdates;
};

export const verifyRollbackResult = async (appliedChanges = []) => {
  const verification = {
    checked: appliedChanges.length,
    remainingCreatedDocs: [],
    missingRestoredDocs: [],
    verified: true,
    timestamp: new Date().toISOString(),
  };

  for (const change of appliedChanges) {
    const collectionName = change?.collection;
    const targetId =
      (change?.documentId || change?.originalData?.id || "").toString().trim();
    if (!collectionName || !targetId) continue;

    const targetSnap = await getDoc(doc(db, collectionName, targetId));
    if (change.action === "add") {
      if (targetSnap.exists()) {
        verification.remainingCreatedDocs.push(`${collectionName}/${targetId}`);
      }
      continue;
    }

    if (
      (change.action === "modify" || change.action === "delete") &&
      !targetSnap.exists()
    ) {
      verification.missingRestoredDocs.push(`${collectionName}/${targetId}`);
    }
  }

  verification.verified =
    verification.remainingCreatedDocs.length === 0 &&
    verification.missingRestoredDocs.length === 0;
  return verification;
};
