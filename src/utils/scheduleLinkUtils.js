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

const normalizeCrn = (value) => {
  const normalized = normalizeString(value);
  if (!normalized) return "";
  const match = normalized.match(/\b(\d{5,6})\b/);
  return match ? match[1] : "";
};

const normalizeTermKey = (value) =>
  normalizeString(value).replace(/[^A-Za-z0-9]+/g, "").toLowerCase();

export const buildDeterministicLinkGroupId = ({
  termCode = "",
  term = "",
  crns = [],
} = {}) => {
  const normalizedTerm =
    normalizeTermKey(termCode || term) || normalizeTermKey(term) || "term";
  const normalizedCrns = Array.from(
    new Set((Array.isArray(crns) ? crns : []).map(normalizeCrn).filter(Boolean)),
  ).sort();
  const seed = `${normalizedTerm}:${normalizedCrns.join("|") || "group"}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  const hashToken = hash.toString(36);
  const anchor = normalizedCrns[0] || "group";
  return `xlist_${normalizedTerm}_${anchor}_${hashToken}`;
};

const getScheduleCrossListCrns = (schedule = {}) => {
  const tokens = new Set();
  const addCrn = (value) => {
    const normalized = normalizeCrn(value);
    if (normalized) tokens.add(normalized);
  };

  addCrn(schedule?.crn);

  const fieldCandidates = [
    schedule?.crossListCrns,
    schedule?.crossLists,
    schedule?.crossListingCrns,
    schedule?.crossListing,
  ];

  fieldCandidates.forEach((candidate) => {
    if (Array.isArray(candidate)) {
      candidate.forEach(addCrn);
      return;
    }
    if (typeof candidate === "string" && candidate.trim()) {
      const matches = candidate.match(/\b\d{5,6}\b/g);
      if (matches) matches.forEach(addCrn);
    }
  });

  return Array.from(tokens);
};

export const computeCrossListAutoLinkGroups = (schedules = []) => {
  const scheduleById = new Map();
  const scheduleIdsByTermCrn = new Map();
  const adjacencyByTermCrn = new Map();

  const getTermCrnKey = (termKey, crn) => `${termKey}::${crn}`;
  const ensureAdjacency = (termCrnKey) => {
    if (!adjacencyByTermCrn.has(termCrnKey)) {
      adjacencyByTermCrn.set(termCrnKey, new Set());
    }
    return adjacencyByTermCrn.get(termCrnKey);
  };
  const connect = (left, right) => {
    if (!left || !right || left === right) return;
    ensureAdjacency(left).add(right);
    ensureAdjacency(right).add(left);
  };

  schedules.forEach((schedule) => {
    const scheduleId = normalizeString(schedule?.id);
    if (!scheduleId) return;

    const termKey = getScheduleTermKey(schedule);
    const crns = getScheduleCrossListCrns(schedule);
    if (!termKey || crns.length === 0) return;

    scheduleById.set(scheduleId, schedule);

    crns.forEach((crn) => {
      const termCrnKey = getTermCrnKey(termKey, crn);
      if (!scheduleIdsByTermCrn.has(termCrnKey)) {
        scheduleIdsByTermCrn.set(termCrnKey, new Set());
      }
      scheduleIdsByTermCrn.get(termCrnKey).add(scheduleId);
      ensureAdjacency(termCrnKey);
    });

    const primaryCrn = crns[0];
    const primaryKey = getTermCrnKey(termKey, primaryCrn);
    crns.slice(1).forEach((relatedCrn) => {
      connect(primaryKey, getTermCrnKey(termKey, relatedCrn));
    });
  });

  const visited = new Set();
  const groups = [];

  adjacencyByTermCrn.forEach((_, termCrnKey) => {
    if (visited.has(termCrnKey)) return;
    const [termKey] = termCrnKey.split("::");
    const queue = [termCrnKey];
    const component = [];
    visited.add(termCrnKey);

    while (queue.length > 0) {
      const current = queue.shift();
      component.push(current);
      const neighbors = adjacencyByTermCrn.get(current) || new Set();
      neighbors.forEach((neighbor) => {
        if (visited.has(neighbor)) return;
        visited.add(neighbor);
        queue.push(neighbor);
      });
    }

    const componentCrns = component
      .map((entry) => entry.split("::")[1])
      .filter(Boolean);
    const uniqueCrns = Array.from(new Set(componentCrns)).sort();
    if (uniqueCrns.length < 2) return;

    const scheduleIds = new Set();
    component.forEach((entry) => {
      const ids = scheduleIdsByTermCrn.get(entry);
      if (!ids) return;
      ids.forEach((id) => scheduleIds.add(id));
    });
    if (scheduleIds.size < 2) return;

    const termCode =
      Array.from(scheduleIds)
        .map((id) => scheduleById.get(id)?.termCode)
        .find((value) => normalizeString(value)) || "";
    const termLabel =
      Array.from(scheduleIds)
        .map((id) => scheduleById.get(id)?.term)
        .find((value) => normalizeString(value)) || "";

    groups.push({
      termKey,
      termCode: normalizeString(termCode),
      term: normalizeString(termLabel),
      crns: uniqueCrns,
      linkGroupId: buildDeterministicLinkGroupId({
        termCode,
        term: termLabel,
        crns: uniqueCrns,
      }),
      scheduleIds: Array.from(scheduleIds).sort(),
    });
  });

  return groups;
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
  buildDeterministicLinkGroupId,
  computeCrossListAutoLinkGroups,
  buildLinkedSchedulePairSet,
  linkSchedules,
  unlinkSchedules,
};
