import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  deleteField,
} from "firebase/firestore";
import { db } from "../firebase";
import { logBulkUpdate } from "./changeLogger";
import { normalizeTermLabel, termCodeFromLabel } from "./termUtils";

const normalizeString = (value) =>
  value === undefined || value === null ? "" : String(value).trim();

const getPairKey = (a, b) => {
  const left = String(a);
  const right = String(b);
  return left < right ? `${left}__${right}` : `${right}__${left}`;
};

const getScheduleTermKey = (schedule = {}) => {
  const term = normalizeString(schedule.term || schedule.Term || "");
  const termCode = normalizeString(schedule.termCode || schedule.TermCode || "");
  const normalizedTerm = normalizeTermLabel(term);
  const resolvedTermCode =
    termCode ||
    termCodeFromLabel(normalizedTerm) ||
    termCodeFromLabel(term) ||
    "";
  return resolvedTermCode || normalizedTerm || term;
};

const chunkArray = (items, size = 10) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

export const buildLinkedSchedulePairSet = (schedules = []) => {
  const pairs = new Set();
  const groups = new Map();

  schedules.forEach((schedule) => {
    const groupId = normalizeString(schedule?.linkGroupId);
    const scheduleId = schedule?.id;
    if (!groupId || !scheduleId) return;
    if (!groups.has(groupId)) {
      groups.set(groupId, []);
    }
    groups.get(groupId).push(scheduleId);
  });

  groups.forEach((ids) => {
    if (!Array.isArray(ids) || ids.length < 2) return;
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        pairs.add(getPairKey(ids[i], ids[j]));
      }
    }
  });

  return pairs;
};

export const linkSchedules = async ({
  scheduleIds = [],
  reason = "",
  source = "scheduleLinkUtils.linkSchedules",
} = {}) => {
  const uniqueIds = Array.from(new Set(scheduleIds.filter(Boolean)));
  if (uniqueIds.length < 2) {
    throw new Error("Select at least two schedules to link.");
  }

  const scheduleDocs = await Promise.all(
    uniqueIds.map((id) => getDoc(doc(db, "schedules", id))),
  );
  const schedules = scheduleDocs.map((snap) =>
    snap.exists() ? { id: snap.id, ...snap.data() } : null,
  );
  if (schedules.some((s) => !s)) {
    throw new Error("One or more schedules could not be found.");
  }

  const termKeys = new Set(schedules.map((s) => getScheduleTermKey(s)));
  if (termKeys.size > 1) {
    throw new Error("Linked sections must belong to the same term.");
  }

  const existingGroupIds = Array.from(
    new Set(
      schedules
        .map((s) => normalizeString(s.linkGroupId))
        .filter(Boolean),
    ),
  );

  const targetGroupId =
    existingGroupIds[0] ||
    `link_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const allScheduleIds = new Set(uniqueIds);

  if (existingGroupIds.length > 0) {
    const chunks = chunkArray(existingGroupIds);
    for (const chunk of chunks) {
      const snapshot = await getDocs(
        query(collection(db, "schedules"), where("linkGroupId", "in", chunk)),
      );
      snapshot.docs.forEach((docSnap) => {
        allScheduleIds.add(docSnap.id);
      });
    }
  }

  let batch = writeBatch(db);
  let opCount = 0;
  const now = new Date().toISOString();
  const commitIfNeeded = async () => {
    if (opCount >= 450) {
      await batch.commit();
      batch = writeBatch(db);
      opCount = 0;
    }
  };

  for (const id of allScheduleIds) {
    batch.update(doc(db, "schedules", id), {
      linkGroupId: targetGroupId,
      updatedAt: now,
    });
    opCount += 1;
    await commitIfNeeded();
  }

  if (opCount > 0) {
    await batch.commit();
  }

  await logBulkUpdate(
    "Schedule Link Group",
    "schedules",
    allScheduleIds.size,
    source,
    {
      linkGroupId: targetGroupId,
      reason: normalizeString(reason),
      scheduleIds: Array.from(allScheduleIds),
    },
  );

  return {
    linkGroupId: targetGroupId,
    updated: allScheduleIds.size,
  };
};

export const unlinkSchedules = async ({
  scheduleIds = [],
  source = "scheduleLinkUtils.unlinkSchedules",
} = {}) => {
  const uniqueIds = Array.from(new Set(scheduleIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return { updated: 0 };
  }

  const scheduleDocs = await Promise.all(
    uniqueIds.map((id) => getDoc(doc(db, "schedules", id))),
  );
  const schedules = scheduleDocs.map((snap) =>
    snap.exists() ? { id: snap.id, ...snap.data() } : null,
  );
  const groupIds = Array.from(
    new Set(
      schedules
        .map((s) => normalizeString(s?.linkGroupId))
        .filter(Boolean),
    ),
  );
  if (groupIds.length === 0) {
    return { updated: 0 };
  }

  let totalUpdated = 0;

  for (const groupId of groupIds) {
    const snapshot = await getDocs(
      query(collection(db, "schedules"), where("linkGroupId", "==", groupId)),
    );
    const groupMembers = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
    const groupSize = groupMembers.length;
    const idsToClear =
      groupSize <= 2
        ? groupMembers.map((s) => s.id)
        : groupMembers
            .map((s) => s.id)
            .filter((id) => uniqueIds.includes(id));

    if (idsToClear.length === 0) continue;

    let batch = writeBatch(db);
    let opCount = 0;
    const now = new Date().toISOString();

    for (const id of idsToClear) {
      batch.update(doc(db, "schedules", id), {
        linkGroupId: deleteField(),
        updatedAt: now,
      });
      opCount += 1;
      if (opCount >= 450) {
        await batch.commit();
        batch = writeBatch(db);
        opCount = 0;
      }
    }
    if (opCount > 0) {
      await batch.commit();
    }

    totalUpdated += idsToClear.length;

    await logBulkUpdate(
      "Schedule Link Group",
      "schedules",
      idsToClear.length,
      source,
      {
        linkGroupId: groupId,
        action: "unlink",
        scheduleIds: idsToClear,
      },
    );
  }

  return { updated: totalUpdated };
};

export default {
  buildLinkedSchedulePairSet,
  linkSchedules,
  unlinkSchedules,
};
