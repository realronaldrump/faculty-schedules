/**
 * Simple Data Hygiene System
 *
 * Focus: Prevention over cure
 * - Clean data as it comes in
 * - Simple duplicate prevention
 * - Standardize data formats
 * - One source of truth per record
 */

import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  addDoc,
  orderBy,
  limit,
  deleteField,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  logUpdate,
  logStandardization,
  logMerge,
  logBulkUpdate,
} from "./changeLogger";
import { normalizedSchema } from "./normalizedSchema";
import {
  parseRoomLabel,
  parseMultiRoom,
  splitMultiRoom,
  buildSpaceKey,
  parseSpaceKey,
  validateSpaceKey,
  detectLocationType,
  formatSpaceDisplayName,
  normalizeSpaceNumber,
  resolveBuilding,
  resolveBuildingDisplayName,
  LOCATION_TYPE,
  SPACE_TYPE,
} from "./locationService";
import { normalizeSpaceRecord } from "./spaceUtils";
import { isStudentWorker } from "./peopleUtils";
import { deriveScheduleIdentityFromSchedule } from "./importIdentityUtils";
import {
  DEFAULT_PERSON_SCHEMA,
  standardizePerson,
  standardizeSchedule,
  standardizeRoom,
  detectPeopleDuplicates,
  detectScheduleDuplicates,
  detectRoomDuplicates,
  detectCrossCollectionIssues,
  mergePeopleData,
  mergeScheduleData,
  mergeRoomData,
  detectTeachingConflicts,
  detectAllDataIssues,
} from "./hygieneCore";

const MAX_BATCH_OPERATIONS = 450;

const createBatchWriter = () => {
  let batch = writeBatch(db);
  let opCount = 0;

  const add = async (apply) => {
    apply(batch);
    opCount += 1;
    if (opCount >= MAX_BATCH_OPERATIONS) {
      await batch.commit();
      batch = writeBatch(db);
      opCount = 0;
    }
  };

  const flush = async () => {
    if (opCount === 0) return;
    await batch.commit();
    batch = writeBatch(db);
    opCount = 0;
  };

  return { add, flush };
};

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

// ---------------------------------------------------------------------------
// DEDUPE DECISIONS
// ---------------------------------------------------------------------------

const buildDedupePairKey = (idA, idB) => {
  if (!idA || !idB) return "";
  const [left, right] = [String(idA), String(idB)].sort();
  return `${left}__${right}`;
};

const buildDedupeDecisionId = (entityType, idA, idB) => {
  const pairKey = buildDedupePairKey(idA, idB);
  if (!pairKey || !entityType) return "";
  return `${entityType}__${pairKey}`;
};

export const fetchDedupeDecisions = async (entityType) => {
  if (!entityType) return new Set();
  try {
    const snapshot = await getDocs(
      query(
        collection(db, "dedupeDecisions"),
        where("entityType", "==", entityType),
        where("decision", "==", "not_duplicate"),
      ),
    );
    const blockedPairs = new Set();
    snapshot.docs.forEach((docSnap) => {
      const data = docSnap.data() || {};
      if (data.pairKey) {
        blockedPairs.add(data.pairKey);
        return;
      }
      if (Array.isArray(data.recordIds) && data.recordIds.length === 2) {
        const key = buildDedupePairKey(data.recordIds[0], data.recordIds[1]);
        if (key) blockedPairs.add(key);
      }
    });
    return blockedPairs;
  } catch (error) {
    if (error?.code === "permission-denied") {
      console.warn(
        "Deduplication decisions could not be loaded due to permissions.",
        error,
      );
      return new Set();
    }
    throw error;
  }
};

export const markNotDuplicate = async ({
  entityType,
  idA,
  idB,
  reason = "",
} = {}) => {
  const pairKey = buildDedupePairKey(idA, idB);
  if (!pairKey || !entityType) {
    throw new Error("Entity type and two record IDs are required");
  }
  const now = new Date().toISOString();
  const docId = buildDedupeDecisionId(entityType, idA, idB);
  const payload = {
    entityType,
    pairKey,
    recordIds: [idA, idB],
    decision: "not_duplicate",
    reason: reason ? String(reason).trim() : "",
    updatedAt: now,
    createdAt: now,
  };
  await setDoc(doc(db, "dedupeDecisions", docId), payload, { merge: true });
  return payload;
};

// ---------------------------------------------------------------------------
// PERSON SCHEMA CONSISTENCY
// ---------------------------------------------------------------------------
// Canonical schema and normalization live in hygieneCore.

// ==================== DUPLICATE DETECTION ====================

/**
 * Find potential duplicate people using simple, reliable criteria
 */
export const findDuplicatePeople = async (options = {}) => {
  const peopleSnapshot = await getDocs(collection(db, "people"));
  const people = peopleSnapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((person) => !person?.mergedInto);
  return detectPeopleDuplicates(people, options);
};

/**
 * Find orphaned schedule records (schedules without valid people)
 */
export const findOrphanedSchedules = async () => {
  const [schedulesSnapshot, peopleSnapshot] = await Promise.all([
    getDocs(collection(db, "schedules")),
    getDocs(collection(db, "people")),
  ]);

  const schedules = schedulesSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
  const people = peopleSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  const peopleById = new Map();

  people.forEach((person) => {
    peopleById.set(person.id, person);
  });

  const getScheduleInstructorIds = (schedule) => {
    const ids = new Set();
    if (schedule?.instructorId) ids.add(schedule.instructorId);
    if (Array.isArray(schedule?.instructorIds)) {
      schedule.instructorIds.forEach((id) => ids.add(id));
    }
    if (Array.isArray(schedule?.instructorAssignments)) {
      schedule.instructorAssignments.forEach((assignment) => {
        if (assignment?.personId) ids.add(assignment.personId);
      });
    }
    return Array.from(ids).filter(Boolean);
  };

  const orphaned = schedules.filter((schedule) => {
    const instructorIds = getScheduleInstructorIds(schedule);
    if (instructorIds.length === 0) return true;
    return !instructorIds.some((id) => peopleById.has(id));
  });

  return orphaned;
};

/**
 * Backfill instructorId for schedules using exact name match (strict, non-fuzzy).
 */
export const backfillInstructorIdsFromNames = async () => {
  const [schedulesSnapshot, peopleSnapshot] = await Promise.all([
    getDocs(collection(db, "schedules")),
    getDocs(collection(db, "people")),
  ]);

  const people = peopleSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
  const peopleByName = new Map();
  const ambiguousNames = new Set();
  const peopleById = new Map();

  people.forEach((person) => {
    const fullName =
      `${person.firstName || ""} ${person.lastName || ""}`.trim();
    if (!fullName) return;
    if (peopleByName.has(fullName)) {
      ambiguousNames.add(fullName);
    } else {
      peopleByName.set(fullName, person);
    }
    peopleById.set(person.id, person);
  });

  let batch = writeBatch(db);
  let batchCount = 0;
  const results = {
    linked: 0,
    skippedAmbiguous: 0,
    skippedMissing: 0,
  };

  const commitBatch = async () => {
    if (batchCount === 0) return;
    await batch.commit();
    batch = writeBatch(db);
    batchCount = 0;
  };

  const normalizeInstructorToken = (value) => {
    if (!value) return "";
    const cleaned = String(value)
      .replace(/\[[^\]]*\]/g, "")
      .replace(/\([^)]*\)/g, "")
      .trim();
    if (!cleaned) return "";
    if (cleaned.includes(",")) {
      const [lastPart, firstPartRaw] = cleaned.split(",", 2);
      const lastName = (lastPart || "").trim();
      const firstName = (firstPartRaw || "").trim();
      return `${firstName} ${lastName}`.trim();
    }
    return cleaned;
  };

  const splitInstructorNames = (value) => {
    if (!value) return [];
    return String(value)
      .split(/;|\/|\s+&\s+|\s+and\s+/i)
      .map((part) => normalizeInstructorToken(part))
      .filter((name) => name && name.toLowerCase() !== "staff");
  };

  const getScheduleInstructorIds = (schedule) => {
    const ids = new Set();
    if (schedule?.instructorId) ids.add(schedule.instructorId);
    if (Array.isArray(schedule?.instructorIds)) {
      schedule.instructorIds.forEach((id) => ids.add(id));
    }
    if (Array.isArray(schedule?.instructorAssignments)) {
      schedule.instructorAssignments.forEach((assignment) => {
        if (assignment?.personId) ids.add(assignment.personId);
      });
    }
    return Array.from(ids).filter(Boolean);
  };

  for (const snap of schedulesSnapshot.docs) {
    const schedule = snap.data();
    const existingInstructorIds = getScheduleInstructorIds(schedule);
    if (existingInstructorIds.some((id) => peopleById.has(id))) continue;

    const instructorName = (
      schedule.instructorName ||
      schedule.Instructor ||
      ""
    ).trim();
    if (!instructorName) continue;

    const candidateNames = splitInstructorNames(instructorName);
    if (candidateNames.length === 0) continue;

    const resolvedPeople = [];
    let hasAmbiguous = false;
    let hasMissing = false;

    candidateNames.forEach((name) => {
      if (ambiguousNames.has(name)) {
        hasAmbiguous = true;
        return;
      }
      const person = peopleByName.get(name);
      if (!person) {
        hasMissing = true;
        return;
      }
      resolvedPeople.push(person);
    });

    if (hasAmbiguous) {
      results.skippedAmbiguous += 1;
      continue;
    }
    if (hasMissing || resolvedPeople.length === 0) {
      results.skippedMissing += 1;
      continue;
    }

    const instructorAssignments = resolvedPeople.map((person, index) => ({
      personId: person.id,
      isPrimary: index === 0,
      percentage: 100,
    }));

    batch.update(snap.ref, {
      instructorId: resolvedPeople[0].id,
      instructorIds: resolvedPeople.map((person) => person.id),
      instructorAssignments,
      instructorName: deleteField(),
      updatedAt: new Date().toISOString(),
    });
    batchCount += 1;
    results.linked += 1;

    if (batchCount >= 450) {
      await commitBatch();
    }
  }

  await commitBatch();

  return results;
};

const MERGE_BATCH_LIMIT = 450;

const buildInstructorName = (person) =>
  `${person?.firstName || ""} ${person?.lastName || ""}`.trim();

const resolveCanonicalPersonRecord = async (personId) => {
  let currentId = personId;
  const visited = new Set();

  while (currentId && !visited.has(currentId)) {
    const snap = await getDoc(doc(db, "people", currentId));
    if (!snap.exists()) {
      return { id: currentId, data: null, exists: false };
    }
    const data = { id: snap.id, ...snap.data() };
    if (!data.mergedInto) {
      return { id: data.id, data, exists: true };
    }
    visited.add(currentId);
    currentId = data.mergedInto;
  }

  throw new Error("Merge chain detected for person records");
};

const commitBatchedUpdates = async (
  updates,
  batchLimit = MERGE_BATCH_LIMIT,
) => {
  let batch = writeBatch(db);
  let batchCount = 0;
  let totalUpdated = 0;

  for (const { ref, data } of updates) {
    batch.update(ref, data);
    batchCount += 1;
    totalUpdated += 1;

    if (batchCount >= batchLimit) {
      await batch.commit();
      batch = writeBatch(db);
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  return totalUpdated;
};

const updateEmailListPresetsForPerson = async (
  duplicateId,
  primaryId = null,
) => {
  const presetsSnapshot = await getDocs(
    query(
      collection(db, "emailListPresets"),
      where("personIds", "array-contains", duplicateId),
    ),
  );

  if (presetsSnapshot.empty) {
    return 0;
  }

  const updates = [];
  const updatedAt = new Date().toISOString();

  presetsSnapshot.docs.forEach((presetDoc) => {
    const data = presetDoc.data() || {};
    const currentIds = Array.isArray(data.personIds) ? data.personIds : [];
    const nextIds = currentIds.filter((id) => id !== duplicateId);

    if (primaryId && !nextIds.includes(primaryId)) {
      nextIds.push(primaryId);
    }

    if (
      nextIds.length !== currentIds.length ||
      (primaryId && !currentIds.includes(primaryId))
    ) {
      updates.push({
        ref: presetDoc.ref,
        data: { personIds: nextIds, updatedAt },
      });
    }
  });

  if (updates.length === 0) {
    return 0;
  }

  return commitBatchedUpdates(updates);
};

const reassignSchedulesToPrimary = async (
  duplicateId,
  primaryId,
  instructorName,
) => {
  let updated = 0;
  let hasMore = true;

  while (hasMore) {
    const snapshot = await getDocs(
      query(
        collection(db, "schedules"),
        where("instructorId", "==", duplicateId),
        limit(MERGE_BATCH_LIMIT),
      ),
    );

    if (snapshot.empty) {
      hasMore = false;
      continue;
    }

    const batch = writeBatch(db);
    const updatedAt = new Date().toISOString();
    snapshot.docs.forEach((scheduleDoc) => {
      batch.update(scheduleDoc.ref, {
        instructorId: primaryId,
        instructorName: instructorName || deleteField(),
        updatedAt,
      });
    });

    await batch.commit();
    updated += snapshot.size;
  }

  return updated;
};

// ==================== SIMPLE FIXES ====================

/**
 * Merge two people records (keep the primary, delete the duplicate)
 */
export const mergePeople = async (
  primaryId,
  duplicateId,
  fieldChoices = {},
) => {
  if (!primaryId || !duplicateId) {
    throw new Error("Both primary and duplicate IDs are required");
  }

  if (primaryId === duplicateId) {
    throw new Error("Cannot merge a person into themselves");
  }

  const duplicateDoc = await getDoc(doc(db, "people", duplicateId));
  if (!duplicateDoc.exists()) {
    throw new Error("Duplicate record not found");
  }

  const duplicate = { id: duplicateDoc.id, ...duplicateDoc.data() };
  const resolvedPrimary = await resolveCanonicalPersonRecord(primaryId);
  if (!resolvedPrimary.exists || !resolvedPrimary.data) {
    throw new Error("Primary record not found");
  }

  const primary = resolvedPrimary.data;

  if (duplicate.mergedInto && duplicate.mergedInto !== primary.id) {
    throw new Error("Duplicate record already merged into another person");
  }

  if (duplicate.id === primary.id) {
    return primary;
  }

  const merged = mergePeopleData(primary, duplicate, fieldChoices);
  delete merged.mergedInto;
  delete merged.mergeStatus;
  delete merged.mergedAt;
  delete merged.mergeUpdatedAt;
  const mergeTimestamp = new Date().toISOString();

  const initialBatch = writeBatch(db);
  initialBatch.update(doc(db, "people", primary.id), merged);
  initialBatch.update(doc(db, "people", duplicate.id), {
    mergedInto: primary.id,
    mergeStatus: "in_progress",
    mergedAt: duplicate.mergedAt || mergeTimestamp,
    mergeUpdatedAt: mergeTimestamp,
  });
  await initialBatch.commit();

  const instructorName = buildInstructorName(merged);
  await reassignSchedulesToPrimary(duplicate.id, primary.id, instructorName);

  try {
    await updateEmailListPresetsForPerson(duplicate.id, primary.id);
  } catch (error) {
    await updateDoc(doc(db, "people", duplicate.id), {
      mergeStatus: "pending_cleanup",
      mergeUpdatedAt: new Date().toISOString(),
    });
    throw error;
  }

  const remainingSchedules = await getDocs(
    query(
      collection(db, "schedules"),
      where("instructorId", "==", duplicate.id),
      limit(1),
    ),
  );

  if (remainingSchedules.empty) {
    await deleteDoc(doc(db, "people", duplicate.id));
  } else {
    await updateDoc(doc(db, "people", duplicate.id), {
      mergeStatus: "pending_cleanup",
      mergeUpdatedAt: new Date().toISOString(),
    });
  }

  // Log merge
  try {
    await logMerge(
      `People Merge - ${merged.firstName || ""} ${merged.lastName || ""}`.trim(),
      "people",
      primary.id,
      [duplicate.id],
      "dataHygiene.js - mergePeople",
    );
  } catch (e) {
    console.error("Change logging error (merge people):", e);
  }

  return merged;
};

/**
 * Delete a person only if no schedules still reference them.
 */
export const deletePersonSafely = async (personId) => {
  if (!personId) {
    throw new Error("Person ID is required");
  }

  const personDoc = await getDoc(doc(db, "people", personId));
  if (!personDoc.exists()) {
    throw new Error("Person not found");
  }

  const schedulesSnapshot = await getDocs(
    query(
      collection(db, "schedules"),
      where("instructorId", "==", personId),
      limit(1),
    ),
  );

  if (!schedulesSnapshot.empty) {
    throw new Error(
      "Cannot delete a person while they are assigned to schedules. Reassign or merge first.",
    );
  }

  await updateEmailListPresetsForPerson(personId, null);
  await deleteDoc(doc(db, "people", personId));
};

/**
 * Merge duplicate schedule records
 */
export const mergeScheduleRecords = async (duplicateGroup) => {
  const [primary, secondary] = duplicateGroup.records || [];
  if (!primary?.id || !secondary?.id) {
    throw new Error("Invalid schedule duplicate group");
  }

  const mergedData = mergeScheduleData(primary, secondary);

  const batch = writeBatch(db);
  batch.update(doc(db, "schedules", primary.id), mergedData);
  batch.delete(doc(db, "schedules", secondary.id));
  await batch.commit();

  try {
    await logMerge(
      `Schedule Merge - ${primary.courseCode || ""} ${primary.section || ""} (${primary.term || ""})`.trim(),
      "schedules",
      primary.id,
      [secondary.id],
      "dataHygiene.js - mergeScheduleRecords",
    );
  } catch (e) {
    console.error("Change logging error (merge schedules):", e);
  }

  return {
    primaryId: primary.id,
    secondaryId: secondary.id,
    mergedData,
  };
};

/**
 * Merge duplicate room records
 */
export const mergeRoomRecords = async (duplicateGroup) => {
  const [primary, secondary] = duplicateGroup.records || [];
  if (!primary?.id || !secondary?.id) {
    throw new Error("Invalid room duplicate group");
  }

  const mergedData = mergeRoomData(primary, secondary);
  const batchWriter = createBatchWriter();

  await batchWriter.add((batch) => {
    batch.update(doc(db, "rooms", primary.id), mergedData);
  });

  const schedulesSnapshot = await getDocs(collection(db, "schedules"));
  let schedulesUpdated = 0;
  const primaryName = mergedData.displayName || "";
  const primaryKey = primary.spaceKey || primary.id;
  const secondaryKey = secondary.spaceKey || secondary.id;

  for (const scheduleDoc of schedulesSnapshot.docs) {
    const s = scheduleDoc.data();
    const currentIds = Array.isArray(s.spaceIds) ? s.spaceIds : [];
    if (!currentIds.includes(secondaryKey)) continue;

    const nextIds = Array.from(
      new Set(currentIds.map((id) => (id === secondaryKey ? primaryKey : id))),
    );
    const currentNames = Array.isArray(s.spaceDisplayNames)
      ? s.spaceDisplayNames
      : [];
    const nextNames = currentNames.map((name, idx) => {
      const currentId = currentIds[idx];
      return currentId === secondaryKey ? primaryName : name;
    });

    const nameFallback = primaryName || nextNames[0] || "";
    const normalizedNames =
      nextNames.length > 0 ? nextNames : nameFallback ? [nameFallback] : [];

    await batchWriter.add((batch) => {
      batch.update(doc(db, "schedules", scheduleDoc.id), {
        spaceIds: nextIds,
        spaceDisplayNames: normalizedNames,
        updatedAt: new Date().toISOString(),
      });
    });
    schedulesUpdated += 1;
  }

  await batchWriter.add((batch) => {
    batch.delete(doc(db, "rooms", secondary.id));
  });

  await batchWriter.flush();

  try {
    await logMerge(
      `Room Merge - ${primaryName || primary.name || ""}`.trim(),
      "rooms",
      primary.id,
      [secondary.id],
      "dataHygiene.js - mergeRoomRecords",
    );
  } catch (e) {
    console.error("Change logging error (merge rooms):", e);
  }

  return {
    primaryId: primary.id,
    secondaryId: secondary.id,
    mergedData,
    schedulesUpdated,
  };
};

/**
 * Link orphaned schedule to existing person
 */
export const linkScheduleToPerson = async (scheduleId, personId) => {
  const personDoc = await getDoc(doc(db, "people", personId));
  if (!personDoc.exists()) {
    throw new Error("Person not found");
  }

  const person = { id: personDoc.id, ...personDoc.data() };
  const scheduleRef = doc(db, "schedules", scheduleId);
  const beforeSnap = await getDoc(scheduleRef);
  const before = beforeSnap.exists() ? beforeSnap.data() : null;
  const baseAssignments = Array.isArray(before?.instructorAssignments)
    ? before.instructorAssignments
    : [];
  const assignmentMap = new Map();
  baseAssignments.forEach((assignment) => {
    const resolvedId =
      assignment?.personId || assignment?.instructorId || assignment?.id;
    if (!resolvedId) return;
    assignmentMap.set(resolvedId, {
      ...assignment,
      personId: resolvedId,
    });
  });
  if (!assignmentMap.has(personId)) {
    assignmentMap.set(personId, {
      personId,
      isPrimary: assignmentMap.size === 0,
      percentage: 100,
    });
  }
  const instructorAssignments = Array.from(assignmentMap.values());
  if (
    instructorAssignments.length > 0 &&
    !instructorAssignments.some((assignment) => assignment.isPrimary)
  ) {
    instructorAssignments[0].isPrimary = true;
  }
  const primaryAssignment =
    instructorAssignments.find((assignment) => assignment.isPrimary) ||
    instructorAssignments[0];
  const instructorIds = Array.from(
    new Set([
      ...(Array.isArray(before?.instructorIds) ? before.instructorIds : []),
      before?.instructorId,
      ...instructorAssignments.map((assignment) => assignment.personId),
    ]),
  ).filter(Boolean);
  const updates = {
    instructorId: primaryAssignment?.personId || personId,
    instructorIds,
    instructorAssignments,
    instructorName: deleteField(),
    updatedAt: new Date().toISOString(),
  };
  await updateDoc(scheduleRef, updates);
  // Change log
  try {
    await logUpdate(
      `Schedule Instructor Link - ${before?.courseCode || ""} ${before?.section || ""}`.trim(),
      "schedules",
      scheduleId,
      updates,
      before,
      "dataHygiene.js - linkScheduleToPerson",
    );
  } catch (e) {
    console.error("Change logging error (link schedule to person):", e);
  }
};

/**
 * Standardize all existing data
 */
export const standardizeAllData = async () => {
  const batchWriter = createBatchWriter();
  let updateCount = 0;

  // Standardize people
  const peopleSnapshot = await getDocs(collection(db, "people"));
  for (const docSnap of peopleSnapshot.docs) {
    const standardized = standardizePerson(docSnap.data());
    await batchWriter.add((batch) => batch.update(docSnap.ref, standardized));
    updateCount++;
  }

  // Standardize schedules
  const schedulesSnapshot = await getDocs(collection(db, "schedules"));
  for (const docSnap of schedulesSnapshot.docs) {
    const standardized = standardizeSchedule(docSnap.data());
    if (standardized.instructorId) {
      standardized.instructorName = deleteField();
    }
    await batchWriter.add((batch) => batch.update(docSnap.ref, standardized));
    updateCount++;
  }

  // Standardize rooms
  const roomsSnapshot = await getDocs(collection(db, "rooms"));
  for (const docSnap of roomsSnapshot.docs) {
    const standardized = standardizeRoom(docSnap.data());
    await batchWriter.add((batch) => batch.update(docSnap.ref, standardized));
    updateCount++;
  }

  await batchWriter.flush();

  // Log the standardization operation
  await logStandardization(
    "multiple",
    updateCount,
    "dataHygiene.js - standardizeAllData",
  );

  return { updatedRecords: updateCount };
};

/**
 * Backfill `rooms` from people.office and link via `people.officeSpaceId`.
 *
 * - Creates missing office rooms as `type: "Office"` using deterministic IDs (spaceKey).
 * - Links people to an existing room when a matching spaceKey is found.
 */
export const backfillOfficeRooms = async () => {
  const batchWriter = createBatchWriter();
  const stats = {
    roomsCreated: 0,
    roomsUpdated: 0,
    peopleUpdated: 0,
    skipped: 0,
    duplicateRoomKeys: 0,
    errors: [],
  };

  const [roomsSnapshot, peopleSnapshot] = await Promise.all([
    getDocs(collection(db, "rooms")),
    getDocs(collection(db, "people")),
  ]);

  const roomsByKey = new Map();
  const addRoomToIndex = (key, room) => {
    if (!key) return;
    if (!roomsByKey.has(key)) {
      roomsByKey.set(key, room);
    } else {
      stats.duplicateRoomKeys += 1;
    }
  };
  roomsSnapshot.docs.forEach((docSnap) => {
    const room = { id: docSnap.id, ...docSnap.data() };
    const parsed = parseRoomLabel(room.displayName || "");
    const spaceKey = room.spaceKey || parsed?.spaceKey || "";
    addRoomToIndex(spaceKey, room);
  });

  // First: ensure every room has spaceKey/spaceNumber when parseable
  for (const docSnap of roomsSnapshot.docs) {
    const room = { id: docSnap.id, ...docSnap.data() };
    const parsed = parseRoomLabel(room.displayName || "");
    if (!parsed?.spaceKey) continue;

    const updates = {};
    const buildingCode = (parsed.buildingCode || "")
      .toString()
      .trim()
      .toUpperCase();
    const spaceNumber = normalizeSpaceNumber(parsed.spaceNumber || "");
    const resolvedBuilding = resolveBuilding(buildingCode);
    const buildingDisplayName =
      parsed.building ||
      resolvedBuilding?.displayName ||
      resolveBuildingDisplayName(buildingCode);
    if (!room.spaceKey) updates.spaceKey = parsed.spaceKey;
    if (!room.spaceNumber && spaceNumber) updates.spaceNumber = spaceNumber;
    if (!room.buildingCode && buildingCode) updates.buildingCode = buildingCode;
    if (!room.buildingDisplayName && buildingDisplayName)
      updates.buildingDisplayName = buildingDisplayName;
    if (!room.displayName && parsed.displayName)
      updates.displayName = parsed.displayName;
    if (!room.buildingId && resolvedBuilding?.id)
      updates.buildingId = resolvedBuilding.id;

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date().toISOString();
      await batchWriter.add((batch) =>
        batch.set(docSnap.ref, updates, { merge: true }),
      );
      stats.roomsUpdated += 1;

      const merged = { ...room, ...updates };
      const spaceKey = merged.spaceKey || parsed.spaceKey;
      addRoomToIndex(spaceKey, { id: docSnap.id, ...merged });
    }
  }

  // Second: create/link office rooms from people
  for (const personSnap of peopleSnapshot.docs) {
    const person = { id: personSnap.id, ...personSnap.data() };
    const office = (person.office || "").toString().trim();
    const hasNoOffice =
      person.hasNoOffice === true ||
      person.isRemote === true ||
      isStudentWorker(person);

    if (hasNoOffice || !office) {
      if (person.officeSpaceId) {
        await batchWriter.add((batch) =>
          batch.update(personSnap.ref, {
            officeSpaceId: "",
            updatedAt: new Date().toISOString(),
          }),
        );
        stats.peopleUpdated += 1;
      } else {
        stats.skipped += 1;
      }
      continue;
    }

    const parsed = parseRoomLabel(office);
    if (!parsed?.spaceKey) {
      stats.skipped += 1;
      continue;
    }

    const existingRoom = roomsByKey.get(parsed.spaceKey);
    const officeSpaceId = parsed.spaceKey;

    if (!existingRoom) {
      const now = new Date().toISOString();
      const buildingCode = (parsed.buildingCode || "")
        .toString()
        .trim()
        .toUpperCase();
      const spaceNumber = normalizeSpaceNumber(parsed.spaceNumber || "");
      const resolvedBuilding = resolveBuilding(buildingCode);
      const buildingDisplayName =
        parsed.building ||
        resolvedBuilding?.displayName ||
        resolveBuildingDisplayName(buildingCode) ||
        buildingCode;
      const displayName =
        parsed.displayName ||
        formatSpaceDisplayName({
          buildingCode,
          buildingDisplayName,
          spaceNumber,
        }) ||
        office;
      const newRoom = {
        displayName: displayName,
        spaceKey: parsed.spaceKey,
        spaceNumber,
        buildingCode,
        buildingDisplayName,
        buildingId: resolvedBuilding?.id || "",
        capacity: null,
        type: "Office",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      try {
        await batchWriter.add((batch) =>
          batch.set(doc(db, "rooms", parsed.spaceKey), newRoom, {
            merge: true,
          }),
        );
        addRoomToIndex(parsed.spaceKey, { id: parsed.spaceKey, ...newRoom });
        stats.roomsCreated += 1;
      } catch (error) {
        stats.errors.push(
          `Room create failed (${parsed.displayName}): ${error.message}`,
        );
        continue;
      }
    }

    if ((person.officeSpaceId || "") !== officeSpaceId) {
      await batchWriter.add((batch) =>
        batch.update(personSnap.ref, {
          officeSpaceId,
          updatedAt: new Date().toISOString(),
        }),
      );
      stats.peopleUpdated += 1;
    } else {
      stats.skipped += 1;
    }
  }

  await batchWriter.flush();
  return stats;
};

/**
 * Preview changes for backfilling office rooms (no writes).
 *
 * Returns a plan consumable by OfficeRoomBackfillPreviewModal.
 */
export const previewOfficeRoomBackfill = async () => {
  const generatedAt = new Date().toISOString();

  const plan = {
    generatedAt,
    stats: {
      roomsCreated: 0,
      roomsUpdated: 0,
      peopleUpdated: 0,
      peopleCleared: 0,
      skipped: 0,
      duplicateRoomKeys: 0,
    },
    changes: [],
  };

  const [roomsSnapshot, peopleSnapshot] = await Promise.all([
    getDocs(collection(db, "rooms")),
    getDocs(collection(db, "people")),
  ]);

  const roomsByKey = new Map();
  const addRoomToIndex = (key, room) => {
    if (!key) return;
    if (!roomsByKey.has(key)) {
      roomsByKey.set(key, room);
    } else {
      plan.stats.duplicateRoomKeys += 1;
    }
  };
  roomsSnapshot.docs.forEach((docSnap) => {
    const room = { id: docSnap.id, ...docSnap.data() };
    const parsed = parseRoomLabel(room.displayName || "");
    const spaceKey = room.spaceKey || parsed?.spaceKey || "";
    addRoomToIndex(spaceKey, room);
  });

  // First: ensure every room has spaceKey/spaceNumber when parseable
  for (const docSnap of roomsSnapshot.docs) {
    const room = { id: docSnap.id, ...docSnap.data() };
    const parsed = parseRoomLabel(room.displayName || "");
    if (!parsed?.spaceKey) continue;

    const updates = {};
    const buildingCode = (parsed.buildingCode || "")
      .toString()
      .trim()
      .toUpperCase();
    const spaceNumber = normalizeSpaceNumber(parsed.spaceNumber || "");
    const resolvedBuilding = resolveBuilding(buildingCode);
    const buildingDisplayName =
      parsed.building ||
      resolvedBuilding?.displayName ||
      resolveBuildingDisplayName(buildingCode);
    if (!room.spaceKey) updates.spaceKey = parsed.spaceKey;
    if (!room.spaceNumber && spaceNumber) updates.spaceNumber = spaceNumber;
    if (!room.buildingCode && buildingCode) updates.buildingCode = buildingCode;
    if (!room.buildingDisplayName && buildingDisplayName)
      updates.buildingDisplayName = buildingDisplayName;
    if (!room.displayName && parsed.displayName)
      updates.displayName = parsed.displayName;
    if (!room.buildingId && resolvedBuilding?.id)
      updates.buildingId = resolvedBuilding.id;

    if (Object.keys(updates).length === 0) continue;

    const changeId = `rooms:${docSnap.id}:metadata`;
    plan.changes.push({
      id: changeId,
      collection: "rooms",
      action: "merge",
      documentId: docSnap.id,
      label: `Room: backfill metadata · ${parsed.displayName || room.displayName || docSnap.id}`,
      before: {
        spaceKey: room.spaceKey || "",
        spaceNumber: room.spaceNumber || "",
        buildingCode: room.buildingCode || "",
        buildingDisplayName: room.buildingDisplayName || "",
        displayName: room.displayName || "",
      },
      data: updates,
    });
    plan.stats.roomsUpdated += 1;

    const merged = { ...room, ...updates };
    const spaceKey = merged.spaceKey || parsed.spaceKey;
    addRoomToIndex(spaceKey, { id: docSnap.id, ...merged });
  }

  // Second: create/link office rooms from people
  const roomCreateChangeIds = new Map();

  for (const personSnap of peopleSnapshot.docs) {
    const person = { id: personSnap.id, ...personSnap.data() };
    const office = (person.office || "").toString().trim();
    const hasNoOffice =
      person.hasNoOffice === true ||
      person.isRemote === true ||
      isStudentWorker(person);

    if (hasNoOffice || !office) {
      if (person.officeSpaceId) {
        plan.changes.push({
          id: `people:${personSnap.id}:officeSpaceId:clear`,
          collection: "people",
          action: "update",
          documentId: personSnap.id,
          label:
            `Person: clear office location · ${person.firstName || ""} ${person.lastName || ""}`.trim(),
          before: {
            office: person.office || "",
            officeSpaceId: person.officeSpaceId || "",
            hasNoOffice: person.hasNoOffice === true,
            isRemote: person.isRemote === true,
          },
          data: {
            officeSpaceId: "",
          },
        });
        plan.stats.peopleUpdated += 1;
        plan.stats.peopleCleared += 1;
      } else {
        plan.stats.skipped += 1;
      }
      continue;
    }

    const parsed = parseRoomLabel(office);
    if (!parsed?.spaceKey) {
      plan.stats.skipped += 1;
      continue;
    }

    const existingRoom = roomsByKey.get(parsed.spaceKey);
    const officeSpaceId = parsed.spaceKey;

    const dependsOn = [];
    if (!existingRoom) {
      const existingCreateId = roomCreateChangeIds.get(parsed.spaceKey);
      const createId = existingCreateId || `rooms:${parsed.spaceKey}:create`;

      if (!existingCreateId) {
        const buildingCode = (parsed.buildingCode || "")
          .toString()
          .trim()
          .toUpperCase();
        const spaceNumber = normalizeSpaceNumber(parsed.spaceNumber || "");
        const resolvedBuilding = resolveBuilding(buildingCode);
        const buildingDisplayName =
          parsed.building ||
          resolvedBuilding?.displayName ||
          resolveBuildingDisplayName(buildingCode) ||
          buildingCode;
        const displayName =
          parsed.displayName ||
          formatSpaceDisplayName({
            buildingCode,
            buildingDisplayName,
            spaceNumber,
          }) ||
          office;
        const newRoom = {
          displayName: displayName,
          spaceKey: parsed.spaceKey,
          spaceNumber,
          buildingCode,
          buildingDisplayName,
          buildingId: resolvedBuilding?.id || "",
          capacity: null,
          type: "Office",
          isActive: true,
        };

        plan.changes.push({
          id: createId,
          collection: "rooms",
          action: "upsert",
          documentId: parsed.spaceKey,
          label: `Room: create office · ${displayName}`,
          before: null,
          data: newRoom,
        });
        plan.stats.roomsCreated += 1;
        roomCreateChangeIds.set(parsed.spaceKey, createId);
        roomsByKey.set(parsed.spaceKey, { id: parsed.spaceKey, ...newRoom });
      }

      dependsOn.push(createId);
    }

    if ((person.officeSpaceId || "") !== officeSpaceId) {
      plan.changes.push({
        id: `people:${personSnap.id}:officeSpaceId:set`,
        collection: "people",
        action: "update",
        documentId: personSnap.id,
        label:
          `Person: set office location · ${person.firstName || ""} ${person.lastName || ""}`.trim(),
        before: {
          office: person.office || "",
          officeSpaceId: person.officeSpaceId || "",
          hasNoOffice: person.hasNoOffice === true,
          isRemote: person.isRemote === true,
        },
        data: {
          officeSpaceId,
        },
        ...(dependsOn.length > 0 ? { dependsOn } : {}),
      });
      plan.stats.peopleUpdated += 1;
    } else {
      plan.stats.skipped += 1;
    }
  }

  return plan;
};

/**
 * Apply a preview plan returned by previewOfficeRoomBackfill().
 */
export const applyOfficeRoomBackfillPlan = async (plan, selectedIds = []) => {
  const changes = Array.isArray(plan?.changes) ? plan.changes : [];
  const selectedSet = new Set(Array.isArray(selectedIds) ? selectedIds : []);

  // Ensure dependencies are applied even if caller omitted them.
  const changeById = new Map(changes.map((change) => [change.id, change]));
  const queue = Array.from(selectedSet);
  while (queue.length > 0) {
    const id = queue.pop();
    const change = changeById.get(id);
    const deps = Array.isArray(change?.dependsOn) ? change.dependsOn : [];
    deps.forEach((depId) => {
      if (!selectedSet.has(depId)) {
        selectedSet.add(depId);
        queue.push(depId);
      }
    });
  }

  const batchWriter = createBatchWriter();
  const now = new Date().toISOString();

  const stats = {
    roomsCreated: 0,
    roomsUpdated: 0,
    peopleUpdated: 0,
    skipped: 0,
    errors: [],
  };

  const selectedChanges = changes
    .filter((change) => change && selectedSet.has(change.id))
    .sort((a, b) => {
      const order = { rooms: 0, people: 1 };
      const aOrder = order[a.collection] ?? 99;
      const bOrder = order[b.collection] ?? 99;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return (a.label || "").localeCompare(b.label || "", undefined, {
        numeric: true,
      });
    });

  for (const change of selectedChanges) {
    try {
      if (change.collection === "rooms") {
        const ref = doc(db, "rooms", change.documentId);
        const data = { ...(change.data || {}) };
        if (change.action === "upsert") {
          data.createdAt = data.createdAt || now;
          data.updatedAt = now;
          await batchWriter.add((batch) =>
            batch.set(ref, data, { merge: true }),
          );
          stats.roomsCreated += 1;
        } else {
          data.updatedAt = now;
          await batchWriter.add((batch) =>
            batch.set(ref, data, { merge: true }),
          );
          stats.roomsUpdated += 1;
        }
        continue;
      }

      if (change.collection === "people") {
        const ref = doc(db, "people", change.documentId);
        const data = { ...(change.data || {}), updatedAt: now };
        await batchWriter.add((batch) => batch.update(ref, data));
        stats.peopleUpdated += 1;
        continue;
      }

      stats.skipped += 1;
    } catch (error) {
      stats.errors.push(
        `${change.collection}/${change.documentId}: ${error.message}`,
      );
    }
  }

  await batchWriter.flush();
  return stats;
};

/**
 * Automatically merge obvious duplicates (high confidence only)
 * Returns a report of what was merged
 */
export const autoMergeObviousDuplicates = async () => {
  const [peopleDecisions, scheduleDecisions, roomDecisions] = await Promise.all(
    [
      fetchDedupeDecisions("people"),
      fetchDedupeDecisions("schedules"),
      fetchDedupeDecisions("rooms"),
    ],
  );

  // Existing people merging
  const duplicates = await findDuplicatePeople({
    blockedPairs: peopleDecisions,
  });
  const results = {
    mergedPeople: 0,
    mergedSchedules: 0,
    mergedRooms: 0,
    skipped: 0,
    errors: [],
    mergedPairs: [],
  };

  // Merge people
  for (const duplicate of duplicates) {
    if (duplicate.confidence >= 0.95) {
      try {
        const [primary, secondary] = duplicate.records;
        await mergePeople(primary.id, secondary.id);
        results.mergedPeople++;
        results.mergedPairs.push({
          type: "person",
          kept: `${primary.firstName || ""} ${primary.lastName || ""}`.trim(),
          removed:
            `${secondary.firstName || ""} ${secondary.lastName || ""}`.trim(),
          reason: duplicate.reason,
        });
      } catch (error) {
        const [primary, secondary] = duplicate.records;
        results.errors.push(
          `Failed to merge person ${(secondary?.firstName || "").trim()} ${(secondary?.lastName || "").trim()}: ${error.message}`,
        );
      }
    } else {
      results.skipped++;
    }
  }

  // Fetch schedules and rooms for duplicate detection
  const schedulesSnapshot = await getDocs(collection(db, "schedules"));
  const schedules = schedulesSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
  const roomsSnapshot = await getDocs(collection(db, "rooms"));
  const rooms = roomsSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  // Merge schedules
  const scheduleDuplicates = detectScheduleDuplicates(schedules, {
    blockedPairs: scheduleDecisions,
  });
  for (const dup of scheduleDuplicates) {
    if (dup.confidence >= 0.98) {
      try {
        const mergeResult = await mergeScheduleRecords(dup);
        results.mergedSchedules++;
        results.mergedPairs.push({
          type: "schedule",
          kept: mergeResult.primaryId,
          removed: mergeResult.secondaryId,
          reason: dup.reason,
        });
      } catch (error) {
        results.errors.push(`Failed to merge schedule: ${error.message}`);
      }
    } else {
      results.skipped++;
    }
  }

  // Merge rooms
  const roomDuplicates = detectRoomDuplicates(rooms, {
    blockedPairs: roomDecisions,
  });
  for (const dup of roomDuplicates) {
    if (dup.confidence >= 0.95) {
      try {
        const mergeResult = await mergeRoomRecords(dup);
        results.mergedRooms++;
        results.mergedPairs.push({
          type: "room",
          kept: mergeResult.primaryId,
          removed: mergeResult.secondaryId,
          reason: dup.reason,
        });
      } catch (error) {
        results.errors.push(`Failed to merge room: ${error.message}`);
      }
    } else {
      results.skipped++;
    }
  }

  return results;
};

// ==================== REAL-TIME VALIDATION ====================

/**
 * Validate and clean data before saving
 */
export const validateAndCleanBeforeSave = async (data, collection_name) => {
  switch (collection_name) {
    case "people": {
      const cleanPerson = standardizePerson(data);

      // Check for potential duplicates
      const emailDuplicates = await findPeopleByEmail(cleanPerson.email);
      const baylorDuplicates = await findPeopleByBaylorId(cleanPerson.baylorId);
      const duplicateWarnings = [];

      if (
        emailDuplicates.length > 0 &&
        !emailDuplicates.find((p) => p.id === cleanPerson.id)
      ) {
        duplicateWarnings.push(`Email ${cleanPerson.email} already exists`);
      }
      if (
        baylorDuplicates.length > 0 &&
        !baylorDuplicates.find((p) => p.id === cleanPerson.id)
      ) {
        duplicateWarnings.push(
          `Baylor ID ${cleanPerson.baylorId} already exists`,
        );
      }

      // After cleaning
      // Enforce schema
      const schema = normalizedSchema.tables[collection_name];
      if (schema) {
        Object.keys(schema.fields).forEach((key) => {
          if (cleanPerson[key] === undefined) {
            cleanPerson[key] = null; // Or default value from schema
          }
        });
        // Remove extra fields
        Object.keys(cleanPerson).forEach((key) => {
          if (!schema.fields[key]) delete cleanPerson[key];
        });
      }

      return {
        cleanData: cleanPerson,
        warnings: duplicateWarnings,
        isValid: duplicateWarnings.length === 0,
      };
    }

    case "schedules": {
      return {
        cleanData: standardizeSchedule(data),
        warnings: [],
        isValid: true,
      };
    }

    default: {
      return {
        cleanData: data,
        warnings: [],
        isValid: true,
      };
    }
  }
};

/**
 * Find people by email
 */
const findPeopleByEmail = async (email) => {
  if (!email) return [];

  const peopleSnapshot = await getDocs(
    query(
      collection(db, "people"),
      where("email", "==", email.toLowerCase().trim()),
    ),
  );
  return peopleSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
};

const findPeopleByBaylorId = async (baylorId) => {
  if (!baylorId) return [];

  const peopleSnapshot = await getDocs(
    query(collection(db, "people"), where("baylorId", "==", baylorId)),
  );
  return peopleSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
};

// ==================== HEALTH CHECK ====================

/**
 * Get a simple health report of the data
 */
export const getDataHealthReport = async () => {
  const [peopleSnapshot, schedulesSnapshot, peopleDecisions] =
    await Promise.all([
      getDocs(collection(db, "people")),
      getDocs(collection(db, "schedules")),
      fetchDedupeDecisions("people"),
    ]);

  const people = peopleSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
  const schedules = schedulesSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
  const duplicates = detectPeopleDuplicates(people, {
    blockedPairs: peopleDecisions,
  });

  const peopleIds = new Set(people.map((person) => person.id));
  const getScheduleInstructorIds = (schedule) => {
    const ids = new Set();
    if (schedule?.instructorId) ids.add(schedule.instructorId);
    if (Array.isArray(schedule?.instructorIds)) {
      schedule.instructorIds.forEach((id) => ids.add(id));
    }
    if (Array.isArray(schedule?.instructorAssignments)) {
      schedule.instructorAssignments.forEach((assignment) => {
        if (assignment?.personId) ids.add(assignment.personId);
      });
    }
    return Array.from(ids).filter(Boolean);
  };
  const orphaned = schedules.filter((schedule) => {
    const instructorIds = getScheduleInstructorIds(schedule);
    if (instructorIds.length === 0) return true;
    return !instructorIds.some((id) => peopleIds.has(id));
  });

  const totalPeople = peopleSnapshot.size;
  const totalSchedules = schedulesSnapshot.size;

  // Count people missing key info (excluding those intentionally marked as not having them)
  const missingEmail = people.filter(
    (p) => !p.email || p.email.trim() === "",
  ).length;
  const missingPhone = people.filter(
    (p) => (!p.phone || p.phone.trim() === "") && !p.hasNoPhone,
  ).length;
  const missingOffice = people.filter(
    (p) =>
      !isStudentWorker(p) &&
      (!p.office || p.office.trim() === "") &&
      !p.hasNoOffice,
  ).length;
  const missingJobTitle = people.filter(
    (p) => !p.jobTitle || p.jobTitle.trim() === "",
  ).length;
  const missingProgram = people.filter((p) => {
    // Only check for missing program if the person is faculty
    const roles = p.roles || [];
    const isFaculty = Array.isArray(roles)
      ? roles.includes("faculty")
      : !!roles.faculty;
    return isFaculty && !p.programId;
  }).length;

  return {
    summary: {
      totalPeople,
      totalSchedules,
      duplicatePeople: duplicates.length,
      orphanedSchedules: orphaned.length,
      missingEmail,
      missingPhone,
      missingOffice,
      missingJobTitle,
      missingProgram,
      healthScore: calculateHealthScore(
        totalPeople,
        duplicates.length,
        orphaned.length,
        missingEmail,
      ),
    },
    duplicates,
    orphaned,
    lastChecked: new Date().toISOString(),
  };
};

/**
 * Generate comprehensive data hygiene report
 */
export const generateDataHygieneReport = async () => {
  const [
    peopleSnapshot,
    schedulesSnapshot,
    roomsSnapshot,
    peopleDecisions,
    scheduleDecisions,
    roomDecisions,
  ] = await Promise.all([
    getDocs(collection(db, "people")),
    getDocs(collection(db, "schedules")),
    getDocs(collection(db, "rooms")),
    fetchDedupeDecisions("people"),
    fetchDedupeDecisions("schedules"),
    fetchDedupeDecisions("rooms"),
  ]);

  const people = peopleSnapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
  const canonicalPeople = people.filter((person) => !person?.mergedInto);
  const schedules = schedulesSnapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
  const rooms = roomsSnapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));

  const peopleDuplicates = detectPeopleDuplicates(canonicalPeople, {
    blockedPairs: peopleDecisions,
  });
  const scheduleDuplicates = detectScheduleDuplicates(schedules, {
    blockedPairs: scheduleDecisions,
  });
  const roomDuplicates = detectRoomDuplicates(rooms, {
    blockedPairs: roomDecisions,
  });
  const crossCollection = detectCrossCollectionIssues(people, schedules, rooms);

  const details = {
    people: {
      total: people.length,
      duplicates: peopleDuplicates,
      duplicateCount: peopleDuplicates.length,
      ignoredPairs: peopleDecisions.size,
    },
    schedules: {
      total: schedules.length,
      duplicates: scheduleDuplicates,
      duplicateCount: scheduleDuplicates.length,
      ignoredPairs: scheduleDecisions.size,
    },
    rooms: {
      total: rooms.length,
      duplicates: roomDuplicates,
      duplicateCount: roomDuplicates.length,
      ignoredPairs: roomDecisions.size,
    },
    crossCollection,
  };

  const summary = {
    totalDuplicates:
      details.people.duplicateCount +
      details.schedules.duplicateCount +
      details.rooms.duplicateCount,
    totalIssues:
      details.people.duplicateCount +
      details.schedules.duplicateCount +
      details.rooms.duplicateCount +
      crossCollection.length,
  };

  const report = {
    timestamp: new Date().toISOString(),
    summary,
    details,
    recommendations: generateRecommendations({ ...details, crossCollection }),
    dataQualityScore: calculateDataQualityScore({
      ...details,
      summary,
      crossCollection,
    }),
  };

  return report;
};

const generateRecommendations = (results) => {
  const recommendations = [];

  if (results.people.duplicateCount > 0) {
    recommendations.push({
      priority: "high",
      action: "Merge duplicate people records",
      count: results.people.duplicateCount,
      description:
        "You have people listed multiple times. Merging them will create one accurate record for each person.",
      benefit: "Eliminates confusion when looking up faculty and staff",
    });
  }

  if (results.schedules.duplicateCount > 0) {
    recommendations.push({
      priority: "medium",
      action: "Merge duplicate schedule records",
      count: results.schedules.duplicateCount,
      description:
        "Some courses appear to be scheduled multiple times. Merging removes the duplicates.",
      benefit: "Accurate course schedules without duplicates",
    });
  }

  if (results.rooms.duplicateCount > 0) {
    recommendations.push({
      priority: "low",
      action: "Merge duplicate room records",
      count: results.rooms.duplicateCount,
      description:
        "Some rooms are listed multiple times with slight variations in name.",
      benefit: "Consistent room names across all schedules",
    });
  }

  if (results.crossCollection.length > 0) {
    recommendations.push({
      priority: "high",
      action: "Fix broken connections",
      count: results.crossCollection.length,
      description:
        "Some schedules reference people or rooms that no longer exist in the system.",
      benefit: "Ensures all schedule data is properly connected",
    });
  }

  return recommendations;
};

const calculateDataQualityScore = (results) => {
  const totalRecords =
    results.people.total + results.schedules.total + results.rooms.total;
  const totalIssues = results.summary.totalIssues;

  if (totalRecords === 0) return 100;

  const qualityScore = Math.max(0, 100 - (totalIssues / totalRecords) * 100);
  return Math.round(qualityScore);
};

/**
 * Calculate a simple health score (0-100)
 */
const calculateHealthScore = (total, duplicates, orphaned, missingEmail) => {
  if (total === 0) return 100;

  const issues = duplicates + orphaned + missingEmail;
  const score = Math.max(0, 100 - (issues / total) * 100);
  return Math.round(score);
};

/**
 * Preview what standardization would change without making actual changes
 */
export const previewStandardization = async () => {
  try {
    const peopleSnapshot = await getDocs(collection(db, "people"));
    const people = peopleSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    const changes = [];

    people.forEach((person) => {
      const original = { ...person };
      const standardized = standardizePerson(person);

      // Find actual differences
      const differences = [];

      // Check name parsing issues
      if ((!original.firstName || !original.lastName) && original.name) {
        if (standardized.firstName && standardized.lastName) {
          differences.push({
            field: "name_parsing",
            description: `Parse "${original.name}" into firstName: "${standardized.firstName}" and lastName: "${standardized.lastName}"`,
            before: {
              firstName: original.firstName || "",
              lastName: original.lastName || "",
              name: original.name || "",
            },
            after: {
              firstName: standardized.firstName,
              lastName: standardized.lastName,
              name: standardized.name,
            },
          });
        }
      }

      // Check for undefined name construction
      if (
        original.name === "undefined undefined" ||
        original.name === " " ||
        original.name === ""
      ) {
        if (
          standardized.name &&
          standardized.name !== "undefined undefined" &&
          standardized.name.trim() !== ""
        ) {
          differences.push({
            field: "fix_broken_name",
            description: `Fix broken name "${original.name}" to "${standardized.name}"`,
            before: { name: original.name },
            after: { name: standardized.name },
          });
        }
      }

      // Check phone standardization
      if (original.phone && original.phone !== standardized.phone) {
        differences.push({
          field: "phone_format",
          description: `Standardize phone from "${original.phone}" to "${standardized.phone}"`,
          before: { phone: original.phone },
          after: { phone: standardized.phone },
        });
      }

      // Check email standardization
      if (original.email && original.email !== standardized.email) {
        differences.push({
          field: "email_format",
          description: `Standardize email from "${original.email}" to "${standardized.email}"`,
          before: { email: original.email },
          after: { email: standardized.email },
        });
      }

      // Check roles standardization
      if (
        original.roles &&
        !Array.isArray(original.roles) &&
        typeof original.roles === "object"
      ) {
        differences.push({
          field: "roles_format",
          description: `Convert roles from object to array format`,
          before: { roles: original.roles },
          after: { roles: standardized.roles },
        });
      }

      if (differences.length > 0) {
        changes.push({
          personId: person.id,
          personName:
            original.name ||
            `${original.firstName} ${original.lastName}`.trim() ||
            "Unknown",
          differences,
        });
      }
    });

    return {
      totalRecords: people.length,
      recordsToChange: changes.length,
      changes,
      summary: {
        nameParsingFixes: changes.filter((c) =>
          c.differences.some((d) => d.field === "name_parsing"),
        ).length,
        brokenNameFixes: changes.filter((c) =>
          c.differences.some((d) => d.field === "fix_broken_name"),
        ).length,
        phoneFormatFixes: changes.filter((c) =>
          c.differences.some((d) => d.field === "phone_format"),
        ).length,
        emailFormatFixes: changes.filter((c) =>
          c.differences.some((d) => d.field === "email_format"),
        ).length,
        rolesFormatFixes: changes.filter((c) =>
          c.differences.some((d) => d.field === "roles_format"),
        ).length,
      },
    };
  } catch (error) {
    console.error("Error previewing standardization:", error);
    throw error;
  }
};

/**
 * Preview standardization changes across people, schedules, and rooms.
 */
export const previewStandardizationPlan = async ({
  limitPerType = 200,
} = {}) => {
  const limit = Number.isFinite(limitPerType) ? Math.max(1, limitPerType) : 200;
  const [peopleSnapshot, schedulesSnapshot, roomsSnapshot] = await Promise.all([
    getDocs(collection(db, "people")),
    getDocs(collection(db, "schedules")),
    getDocs(collection(db, "rooms")),
  ]);

  const diffFields = (before, after, fields) => {
    const diffs = [];
    fields.forEach((field) => {
      const prior = before[field];
      const next = after[field];
      const priorString =
        Array.isArray(prior) || typeof prior === "object"
          ? JSON.stringify(prior || null)
          : String(prior ?? "");
      const nextString =
        Array.isArray(next) || typeof next === "object"
          ? JSON.stringify(next || null)
          : String(next ?? "");
      if (priorString !== nextString) {
        diffs.push({ field, before: prior, after: next });
      }
    });
    return diffs;
  };

  const changes = {
    people: [],
    schedules: [],
    rooms: [],
  };
  const changeCounts = {
    people: 0,
    schedules: 0,
    rooms: 0,
  };

  peopleSnapshot.docs.forEach((docSnap) => {
    const original = docSnap.data() || {};
    const standardized = standardizePerson(
      { ...original, id: docSnap.id },
      { updateTimestamp: false },
    );
    const diffs = diffFields(original, standardized, [
      "firstName",
      "lastName",
      "name",
      "email",
      "phone",
      "roles",
      "office",
      "department",
      "externalIds",
      "baylorId",
      "hasNoPhone",
      "hasNoOffice",
    ]);
    if (diffs.length > 0) {
      changeCounts.people += 1;
      if (changes.people.length < limit) {
        changes.people.push({
          id: docSnap.id,
          label:
            standardized.name ||
            `${standardized.firstName || ""} ${standardized.lastName || ""}`.trim() ||
            "Unknown",
          diffs,
        });
      }
    }
  });

  schedulesSnapshot.docs.forEach((docSnap) => {
    const original = docSnap.data() || {};
    const standardized = standardizeSchedule({ ...original, id: docSnap.id });
    const diffs = diffFields(original, standardized, [
      "term",
      "termCode",
      "courseCode",
      "section",
      "crn",
      "spaceIds",
      "spaceDisplayNames",
      "locationType",
      "locationLabel",
      "instructorIds",
      "instructorAssignments",
      "instructionMethod",
      "scheduleType",
      "status",
    ]);
    if (diffs.length > 0) {
      changeCounts.schedules += 1;
      if (changes.schedules.length < limit) {
        changes.schedules.push({
          id: docSnap.id,
          label:
            `${standardized.courseCode || ""} ${standardized.section || ""} ${standardized.term || ""}`.trim() ||
            docSnap.id,
          diffs,
        });
      }
    }
  });

  roomsSnapshot.docs.forEach((docSnap) => {
    const original = docSnap.data() || {};
    const standardized = standardizeRoom({ ...original, id: docSnap.id });
    const diffs = diffFields(original, standardized, [
      "displayName",
      "buildingCode",
      "buildingDisplayName",
      "spaceNumber",
      "spaceKey",
      "type",
    ]);
    if (diffs.length > 0) {
      changeCounts.rooms += 1;
      if (changes.rooms.length < limit) {
        changes.rooms.push({
          id: docSnap.id,
          label: standardized.displayName || standardized.name || docSnap.id,
          diffs,
        });
      }
    }
  });

  return {
    counts: {
      people: peopleSnapshot.size,
      schedules: schedulesSnapshot.size,
      rooms: roomsSnapshot.size,
    },
    changeCounts,
    samples: changes,
  };
};

/**
 * Apply targeted standardization changes with logging for undo capability
 */
export const applyTargetedStandardization = async (changeIds = null) => {
  try {
    const preview = await previewStandardization();

    // If changeIds provided, only apply those changes
    const changesToApply = changeIds
      ? preview.changes.filter((change) => changeIds.includes(change.personId))
      : preview.changes;

    if (changesToApply.length === 0) {
      return { applied: 0, skipped: 0, errors: [] };
    }

    const batch = writeBatch(db);
    const changeLog = [];
    let applied = 0;
    let errors = [];

    for (const change of changesToApply) {
      try {
        // Get current data
        const personRef = doc(db, "people", change.personId);
        const personSnapshot = await getDoc(personRef);

        if (!personSnapshot.exists()) {
          errors.push(`Person ${change.personId} not found`);
          continue;
        }

        const currentData = personSnapshot.data();
        const standardizedData = standardizePerson(currentData);

        // Only update if there are actual changes
        if (JSON.stringify(currentData) !== JSON.stringify(standardizedData)) {
          batch.update(personRef, standardizedData);

          // Log the change for potential undo
          changeLog.push({
            personId: change.personId,
            personName: change.personName,
            timestamp: new Date().toISOString(),
            originalData: currentData,
            updatedData: standardizedData,
            changes: change.differences,
          });

          applied++;
        }
      } catch (error) {
        errors.push(`Error updating ${change.personName}: ${error.message}`);
      }
    }

    // Commit all changes
    if (applied > 0) {
      await batch.commit();

      // Save change log for potential undo
      if (changeLog.length > 0) {
        await addDoc(collection(db, "standardizationHistory"), {
          timestamp: new Date().toISOString(),
          operation: "targeted_standardization",
          changes: changeLog,
          summary: `Applied ${applied} standardization changes`,
        });
      }
    }

    return {
      applied,
      skipped: changesToApply.length - applied,
      errors,
      changeLogId: changeLog.length > 0 ? "saved" : null,
    };
  } catch (error) {
    console.error("Error applying targeted standardization:", error);
    throw error;
  }
};

/**
 * Get recent standardization history for undo capability
 */
export const getStandardizationHistory = async (limitCount = 10) => {
  try {
    const historySnapshot = await getDocs(
      query(
        collection(db, "standardizationHistory"),
        orderBy("timestamp", "desc"),
        limit(limitCount),
      ),
    );

    return historySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error getting standardization history:", error);
    return [];
  }
};

// ---------------------------------------------------------------------------
// SCHEDULE IDENTITY BACKFILL
// ---------------------------------------------------------------------------

export const previewScheduleIdentityBackfill = async () => {
  const snapshot = await getDocs(collection(db, "schedules"));
  const changes = [];

  snapshot.docs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const identity = deriveScheduleIdentityFromSchedule({
      id: docSnap.id,
      ...data,
    });
    if (!identity.primaryKey) return;

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

    const before = {
      identityKey: data.identityKey || "",
      identityKeys: Array.isArray(data.identityKeys) ? data.identityKeys : [],
      identitySource: data.identitySource || "",
    };
    const after = {
      identityKey: resolvedIdentityKey || "",
      identityKeys: mergedIdentityKeys,
      identitySource: resolvedSource,
    };

    if (JSON.stringify(before) !== JSON.stringify(after)) {
      changes.push({
        id: docSnap.id,
        courseCode: data.courseCode || "",
        term: data.term || "",
        before,
        after,
      });
    }
  });

  return {
    totalRecords: snapshot.size,
    recordsToUpdate: changes.length,
    changes,
  };
};

export const applyScheduleIdentityBackfill = async (changes = []) => {
  if (!Array.isArray(changes) || changes.length === 0) {
    return { updated: 0 };
  }

  const batchWriter = createBatchWriter();
  const now = new Date().toISOString();

  for (const item of changes) {
    if (!item?.id || !item.after) continue;
    await batchWriter.add((batch) => {
      batch.update(doc(db, "schedules", item.id), {
        identityKey: item.after.identityKey,
        identityKeys: item.after.identityKeys,
        identitySource: item.after.identitySource,
        updatedAt: now,
      });
    });
  }

  await batchWriter.flush();
  await logBulkUpdate(
    "Backfill schedule identity keys",
    "schedules",
    changes.length,
    "dataHygiene.js - applyScheduleIdentityBackfill",
  );

  return { updated: changes.length };
};

// ============================================================================
// LOCATION MIGRATION UTILITIES
// ============================================================================

/**
 * Preview location migration - identifies rooms needing split/normalization
 * and schedules/people needing spaceId backfill
 */
export const previewLocationMigration = async () => {
  const preview = {
    rooms: {
      multiRoom: [], // Rooms with combined strings that need splitting
      missingSpaceKey: [], // Rooms without spaceKey field
      invalidSpaceKey: [], // Rooms with invalid spaceKey format
      toSeedFromSchedules: [], // Rooms that will be created from schedule spaceDisplayNames
      toSeedFromPeople: [], // Offices that will be created from people office fields
      total: 0,
    },
    schedules: {
      missingSpaceIds: [], // Schedules without spaceIds array
      hasVirtualLocation: [], // Schedules with ONLINE/TBA (informational)
      total: 0,
    },
    people: {
      missingOfficeSpaceId: [], // People without officeSpaceId
      total: 0,
    },
  };

  try {
    // 1. Analyze rooms collection
    const roomsSnap = await getDocs(collection(db, "rooms"));
    preview.rooms.total = roomsSnap.size;

    // Build set of existing spaceKeys
    const existingSpaceKeys = new Set();
    for (const docSnap of roomsSnap.docs) {
      const room = { id: docSnap.id, ...docSnap.data() };

      if (room.spaceKey) {
        existingSpaceKeys.add(room.spaceKey);
      }

      // Check for combined multi-room strings in name/displayName
      const displayName = room.displayName || "";
      const parts = splitMultiRoom(displayName);
      if (parts.length > 1) {
        preview.rooms.multiRoom.push({
          id: room.id,
          currentName: displayName,
          parsedParts: parts,
          building: room.buildingDisplayName || room.buildingCode || "",
        });
      }

      // Check for missing spaceKey
      if (!room.spaceKey) {
        preview.rooms.missingSpaceKey.push({
          id: room.id,
          name: displayName,
          building: room.buildingDisplayName || room.buildingCode || "",
          roomNumber: room.spaceNumber || "",
        });
      } else {
        const validation = validateSpaceKey(room.spaceKey);
        if (!validation.valid) {
          preview.rooms.invalidSpaceKey.push({
            id: room.id,
            currentSpaceKey: room.spaceKey,
            name: displayName,
          });
        }
      }
    }

    // 2. Analyze schedules collection - also identify rooms to seed
    const schedulesSnap = await getDocs(collection(db, "schedules"));
    preview.schedules.total = schedulesSnap.size;

    const roomsToSeed = new Map(); // spaceKey -> display info

    for (const docSnap of schedulesSnap.docs) {
      const schedule = { id: docSnap.id, ...docSnap.data() };
      const roomLabel =
        Array.isArray(schedule.spaceDisplayNames) &&
        schedule.spaceDisplayNames.length > 0
          ? schedule.spaceDisplayNames.join("; ")
          : "";
      const locationType =
        schedule.locationType || detectLocationType(roomLabel);
      const isPhysical = locationType === LOCATION_TYPE.PHYSICAL;

      // Check for missing spaceIds array
      if (
        !schedule.spaceIds ||
        !Array.isArray(schedule.spaceIds) ||
        schedule.spaceIds.length === 0
      ) {
        // Check if it's a virtual location
        if (!isPhysical) {
          preview.schedules.hasVirtualLocation.push({
            id: schedule.id,
            courseCode: schedule.courseCode,
            room: roomLabel,
            locationType,
          });
        } else if (roomLabel) {
          preview.schedules.missingSpaceIds.push({
            id: schedule.id,
            courseCode: schedule.courseCode,
            courseTitle: schedule.courseTitle,
            room: roomLabel,
            term: schedule.term,
          });
        }
      }

      // Check if we need to seed rooms from this schedule
      if (roomLabel && isPhysical) {
        const parsedResult = parseMultiRoom(roomLabel);
        const parsedRooms = parsedResult?.rooms || [];

        for (const parsed of parsedRooms) {
          const buildingCode = (
            parsed?.buildingCode ||
            parsed?.building?.code ||
            ""
          )
            .toString()
            .trim()
            .toUpperCase();
          const spaceNumber = normalizeSpaceNumber(parsed?.spaceNumber || "");

          if (buildingCode && spaceNumber) {
            const spaceKey = buildSpaceKey(buildingCode, spaceNumber);
            if (
              !existingSpaceKeys.has(spaceKey) &&
              !roomsToSeed.has(spaceKey)
            ) {
              const buildingDisplayName =
                parsed?.building?.displayName ||
                resolveBuildingDisplayName(buildingCode) ||
                buildingCode;
              roomsToSeed.set(spaceKey, {
                spaceKey,
                displayName: formatSpaceDisplayName({
                  buildingCode,
                  buildingDisplayName,
                  spaceNumber,
                }),
                type: "Classroom",
                sourceSchedule: schedule.courseCode,
              });
            }
          }
        }
      }
    }

    preview.rooms.toSeedFromSchedules = Array.from(roomsToSeed.values());

    // 3. Analyze people collection - also identify offices to seed
    const peopleSnap = await getDocs(collection(db, "people"));
    preview.people.total = peopleSnap.size;

    const officesToSeed = new Map();

    for (const docSnap of peopleSnap.docs) {
      const person = { id: docSnap.id, ...docSnap.data() };

      // Check for missing officeSpaceId
      if (!person.officeSpaceId) {
        if (person.office) {
          preview.people.missingOfficeSpaceId.push({
            id: person.id,
            name: `${person.firstName || ""} ${person.lastName || ""}`.trim(),
            office: person.office,
          });

          // Check if we need to seed this office
          if (detectLocationType(person.office) === LOCATION_TYPE.PHYSICAL) {
            const parsed = parseRoomLabel(person.office);
            const buildingCode = (
              parsed?.buildingCode ||
              parsed?.building?.code ||
              ""
            )
              .toString()
              .trim()
              .toUpperCase();
            const spaceNumber = normalizeSpaceNumber(parsed?.spaceNumber || "");

            if (buildingCode && spaceNumber) {
              const spaceKey = buildSpaceKey(buildingCode, spaceNumber);
              // Don't seed if already exists, or will be seeded from schedules
              if (
                !existingSpaceKeys.has(spaceKey) &&
                !roomsToSeed.has(spaceKey) &&
                !officesToSeed.has(spaceKey)
              ) {
                const buildingDisplayName =
                  parsed?.building?.displayName ||
                  resolveBuildingDisplayName(buildingCode) ||
                  buildingCode;
                officesToSeed.set(spaceKey, {
                  spaceKey,
                  displayName: formatSpaceDisplayName({
                    buildingCode,
                    buildingDisplayName,
                    spaceNumber,
                  }),
                  type: "Office",
                  sourcePerson:
                    `${person.firstName || ""} ${person.lastName || ""}`.trim(),
                });
              }
            }
          }
        }
      }
    }

    preview.rooms.toSeedFromPeople = Array.from(officesToSeed.values());

    return preview;
  } catch (error) {
    console.error("Error previewing location migration:", error);
    throw error;
  }
};

const normalizeRoomNameKey = (value) =>
  (value || "")
    .toString()
    .replace(/\s*\([A-Z]{2,6}\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const dedupeOrdered = (values = []) => {
  const seen = new Set();
  const result = [];
  values.forEach((value) => {
    if (!value) return;
    if (seen.has(value)) return;
    seen.add(value);
    result.push(value);
  });
  return result;
};

const getCanonicalRoomDisplayName = (room = {}, docId = "") => {
  const normalized = normalizeSpaceRecord(room, docId);
  const buildingCode = normalized.buildingCode || "";
  const spaceNumber = normalized.spaceNumber || "";
  const resolvedBuildingName = resolveBuildingDisplayName(buildingCode);
  const buildingDisplayName =
    resolvedBuildingName || normalized.buildingDisplayName || buildingCode;
  const canonical = formatSpaceDisplayName({
    buildingCode,
    buildingDisplayName,
    spaceNumber,
  });
  return canonical || normalized.displayName || room.displayName || room.spaceKey || "";
};

const buildRoomLookupMaps = (rooms = []) => {
  const roomsBySpaceKey = new Map();
  const roomsById = new Map();
  const roomsByNameKey = new Map();

  rooms.forEach((room) => {
    if (!room) return;
    const id = room.id;
    if (id) roomsById.set(id, room);
    const spaceKey = (room.spaceKey || "").toString().trim();
    if (spaceKey) roomsBySpaceKey.set(spaceKey, room);
    const nameKey = normalizeRoomNameKey(room.displayName || room.name || "");
    if (nameKey && !roomsByNameKey.has(nameKey)) {
      roomsByNameKey.set(nameKey, room);
    }
  });

  return { roomsBySpaceKey, roomsById, roomsByNameKey };
};

const resolveDisplayNameForSpaceKey = (spaceKey, roomsBySpaceKey) => {
  if (!spaceKey) return "";
  const room = roomsBySpaceKey.get(spaceKey);
  if (room) {
    return getCanonicalRoomDisplayName(room, room.id) || room.displayName || spaceKey;
  }
  const parsedKey = parseSpaceKey(spaceKey);
  if (!parsedKey?.buildingCode || !parsedKey?.spaceNumber) return spaceKey;
  return formatSpaceDisplayName({
    buildingCode: parsedKey.buildingCode,
    spaceNumber: parsedKey.spaceNumber,
  });
};

const buildScheduleSpaceProposal = ({
  schedule,
  roomsBySpaceKey,
  roomsById,
  roomsByNameKey,
} = {}) => {
  const currentSpaceIds = Array.isArray(schedule?.spaceIds)
    ? schedule.spaceIds.filter(Boolean)
    : [];
  const currentDisplayNames = Array.isArray(schedule?.spaceDisplayNames)
    ? schedule.spaceDisplayNames.filter(Boolean)
    : [];
  const locationLabel =
    currentDisplayNames.length > 0
      ? currentDisplayNames.join("; ")
      : schedule?.locationLabel || "";

  if (isScheduleNonPhysical(schedule, locationLabel)) {
    return {
      spaceIds: [],
      spaceDisplayNames: [],
      unresolvedSpaceIds: [],
      isPhysical: false,
    };
  }

  const resolvedSpaceKeys = [];
  const unresolvedSpaceIds = [];

  currentSpaceIds.forEach((spaceId) => {
    const trimmed = (spaceId || "").toString().trim();
    if (!trimmed) return;

    if (roomsBySpaceKey.has(trimmed)) {
      resolvedSpaceKeys.push(trimmed);
      return;
    }

    if (roomsById.has(trimmed)) {
      const room = roomsById.get(trimmed);
      const canonicalKey = room?.spaceKey || room?.id || "";
      if (canonicalKey) {
        resolvedSpaceKeys.push(canonicalKey);
        return;
      }
    }

    const nameKey = normalizeRoomNameKey(trimmed);
    if (nameKey && roomsByNameKey.has(nameKey)) {
      const room = roomsByNameKey.get(nameKey);
      const canonicalKey = room?.spaceKey || room?.id || "";
      if (canonicalKey) {
        resolvedSpaceKeys.push(canonicalKey);
        return;
      }
    }

    if (validateSpaceKey(trimmed).valid) {
      unresolvedSpaceIds.push(trimmed);
    }
  });

  if (locationLabel) {
    const parsedResult = parseMultiRoom(locationLabel);
    const parsedRooms = parsedResult?.rooms || [];
    for (const parsed of parsedRooms) {
      const buildingCode = (
        parsed?.buildingCode ||
        parsed?.building?.code ||
        ""
      )
        .toString()
        .trim()
        .toUpperCase();
      const spaceNumber = normalizeSpaceNumber(parsed?.spaceNumber || "");
      let spaceKey =
        parsed?.spaceKey ||
        (buildingCode && spaceNumber ? buildSpaceKey(buildingCode, spaceNumber) : "");

      if (!spaceKey) {
        const nameKey = normalizeRoomNameKey(parsed?.displayName || "");
        if (nameKey && roomsByNameKey.has(nameKey)) {
          const room = roomsByNameKey.get(nameKey);
          spaceKey = room?.spaceKey || room?.id || "";
        }
      }

      if (!spaceKey) continue;

      if (roomsBySpaceKey.has(spaceKey)) {
        resolvedSpaceKeys.push(spaceKey);
      } else {
        const nameKey = normalizeRoomNameKey(parsed?.displayName || "");
        if (nameKey && roomsByNameKey.has(nameKey)) {
          const room = roomsByNameKey.get(nameKey);
          const canonicalKey = room?.spaceKey || room?.id || "";
          if (canonicalKey) {
            resolvedSpaceKeys.push(canonicalKey);
          }
        } else {
          unresolvedSpaceIds.push(spaceKey);
        }
      }
    }
  }

  const uniqueSpaceIds = dedupeOrdered(resolvedSpaceKeys);
  const spaceDisplayNames =
    uniqueSpaceIds.length > 0
      ? uniqueSpaceIds
          .map((key) => resolveDisplayNameForSpaceKey(key, roomsBySpaceKey))
          .filter(Boolean)
      : [];

  return {
    spaceIds: uniqueSpaceIds,
    spaceDisplayNames,
    unresolvedSpaceIds: dedupeOrdered(unresolvedSpaceIds),
    isPhysical: true,
  };
};

const isScheduleNonPhysical = (schedule, locationLabel = "") => {
  const type = (schedule?.locationType || "").toString().toLowerCase();
  if (schedule?.isOnline) return true;
  if (["no_room", "none", "virtual"].includes(type)) return true;
  if (["room", "physical"].includes(type)) return false;
  if (Array.isArray(schedule?.spaceIds) && schedule.spaceIds.some(Boolean)) {
    return false;
  }
  return detectLocationType(locationLabel || "") !== LOCATION_TYPE.PHYSICAL;
};

const repairScheduleSpaceLinksInternal = async ({
  schedules = [],
  normalizeRoomDisplayNames = false,
  autoCreateMissingRooms = false,
  overrides = {},
} = {}) => {
  const roomsSnap = await getDocs(collection(db, "rooms"));
  const rooms = roomsSnap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
  const { roomsBySpaceKey, roomsById, roomsByNameKey } =
    buildRoomLookupMaps(rooms);
  const batchWriter = createBatchWriter();
  const pendingRoomUpdates = new Map();
  const now = new Date().toISOString();

  const results = {
    schedulesUpdated: 0,
    roomsCreated: 0,
    roomsUpdated: 0,
  };

  const queueRoomUpdate = (room, updates) => {
    if (!room?.id) return;
    if (!updates || Object.keys(updates).length === 0) return;
    const existing = pendingRoomUpdates.get(room.id) || {};
    pendingRoomUpdates.set(room.id, { ...existing, ...updates });
  };

  const queueRoomNormalization = (room) => {
    if (!normalizeRoomDisplayNames || !room) return;
    const normalized = normalizeSpaceRecord(room, room.id);
    const canonicalDisplayName = getCanonicalRoomDisplayName(room, room.id);
    const updates = {};
    if (canonicalDisplayName && canonicalDisplayName !== room.displayName) {
      updates.displayName = canonicalDisplayName;
    }
    if (
      normalized.buildingDisplayName &&
      normalized.buildingDisplayName !== room.buildingDisplayName
    ) {
      updates.buildingDisplayName = normalized.buildingDisplayName;
    }
    if (normalized.buildingCode && normalized.buildingCode !== room.buildingCode) {
      updates.buildingCode = normalized.buildingCode;
    }
    if (normalized.spaceNumber && normalized.spaceNumber !== room.spaceNumber) {
      updates.spaceNumber = normalized.spaceNumber;
    }
    if (Object.keys(updates).length > 0) {
      queueRoomUpdate(room, { ...updates, updatedAt: now });
    }
  };

  if (autoCreateMissingRooms) {
    console.warn(
      "repairScheduleSpaceLinksInternal: autoCreateMissingRooms is enabled, but should be avoided in production.",
    );
  }

  for (const schedule of schedules) {
    if (!schedule?.id) continue;

    const currentSpaceIds = Array.isArray(schedule.spaceIds)
      ? schedule.spaceIds.filter(Boolean)
      : [];
    const currentDisplayNames = Array.isArray(schedule.spaceDisplayNames)
      ? schedule.spaceDisplayNames.filter(Boolean)
      : [];
    const locationLabel =
      currentDisplayNames.length > 0
        ? currentDisplayNames.join("; ")
        : schedule.locationLabel || "";

    if (isScheduleNonPhysical(schedule, locationLabel)) {
      if (currentSpaceIds.length > 0 || currentDisplayNames.length > 0) {
        await batchWriter.add((batch) => {
          batch.update(doc(db, "schedules", schedule.id), {
            spaceIds: [],
            spaceDisplayNames: [],
            updatedAt: now,
          });
        });
        results.schedulesUpdated += 1;
      }
      continue;
    }

    const override = overrides?.[schedule.id];
    if (override && Array.isArray(override.spaceIds || override)) {
      const overrideIds = dedupeOrdered(override.spaceIds || override);
      if (overrideIds.length === 0) {
        continue;
      }
      overrideIds.forEach((id) => {
        const room = roomsBySpaceKey.get(id);
        if (room) queueRoomNormalization(room);
      });
      const overrideNames = overrideIds
        .map((key) => resolveDisplayNameForSpaceKey(key, roomsBySpaceKey))
        .filter(Boolean);
      await batchWriter.add((batch) => {
        batch.update(doc(db, "schedules", schedule.id), {
          spaceIds: overrideIds,
          spaceDisplayNames: overrideNames,
          updatedAt: now,
        });
      });
      results.schedulesUpdated += 1;
      continue;
    }

    const proposal = buildScheduleSpaceProposal({
      schedule,
      roomsBySpaceKey,
      roomsById,
      roomsByNameKey,
    });

    if (!proposal.isPhysical) {
      continue;
    }

    const uniqueSpaceIds = proposal.spaceIds;
    const nextDisplayNames = proposal.spaceDisplayNames;

    if (uniqueSpaceIds.length === 0) {
      continue;
    }

    uniqueSpaceIds.forEach((id) => {
      const room = roomsBySpaceKey.get(id);
      if (room) queueRoomNormalization(room);
    });

    const spaceIdsChanged =
      uniqueSpaceIds.length !== currentSpaceIds.length ||
      uniqueSpaceIds.some((id, idx) => id !== currentSpaceIds[idx]);
    const displayNamesChanged =
      nextDisplayNames.length !== currentDisplayNames.length ||
      nextDisplayNames.some((name, idx) => name !== currentDisplayNames[idx]);

    if (spaceIdsChanged || displayNamesChanged) {
      await batchWriter.add((batch) => {
        batch.update(doc(db, "schedules", schedule.id), {
          spaceIds: uniqueSpaceIds,
          spaceDisplayNames: nextDisplayNames,
          updatedAt: now,
        });
      });
      results.schedulesUpdated += 1;
    }
  }

  for (const [roomId, updates] of pendingRoomUpdates.entries()) {
    await batchWriter.add((batch) => {
      batch.update(doc(db, "rooms", roomId), updates);
    });
    results.roomsUpdated += 1;
  }

  await batchWriter.flush();

  return results;
};

/**
 * Apply location migration - fixes room records and backfills spaceIds
 * @param {Object} options - Migration options
 * @param {boolean} options.splitMultiRooms - Split combined room strings into separate docs
 * @param {boolean} options.backfillSpaceKeys - Add spaceKey to rooms missing it
 * @param {boolean} options.seedRoomsFromSchedules - Create room records from schedule spaceDisplayNames
 * @param {boolean} options.seedRoomsFromPeople - Create room records from people office fields
 * @param {boolean} options.backfillScheduleSpaceIds - Add spaceIds to schedules
 * @param {boolean} options.repairInvalidScheduleSpaceIds - Repair invalid or missing schedule spaceIds
 * @param {boolean} options.normalizeRoomDisplayNames - Normalize room display names from canonical fields
 * @param {boolean} options.backfillPeopleOfficeSpaceIds - Add officeSpaceId to people
 */
export const applyLocationMigration = async (options = {}) => {
  const {
    splitMultiRooms = true,
    backfillSpaceKeys = true,
    seedRoomsFromSchedules = true,
    seedRoomsFromPeople = true,
    backfillScheduleSpaceIds = true,
    repairInvalidScheduleSpaceIds = false,
    normalizeRoomDisplayNames = false,
    backfillPeopleOfficeSpaceIds = true,
  } = options;

  const results = {
    roomsSplit: 0,
    roomsUpdated: 0,
    roomsSeeded: 0,
    schedulesUpdated: 0,
    peopleUpdated: 0,
    errors: [],
  };

  const batchWriter = createBatchWriter();

  try {
    // 1. Fix rooms with combined strings
    if (splitMultiRooms) {
      const roomsSnap = await getDocs(collection(db, "rooms"));

      for (const docSnap of roomsSnap.docs) {
        const room = docSnap.data();
        const displayName = room.displayName || "";
        const parts = splitMultiRoom(displayName);

        if (parts.length > 1) {
          // This is a combined room - create individual records
          for (const part of parts) {
            try {
              const parsed = parseRoomLabel(part);
              const buildingCode = (
                parsed?.buildingCode ||
                parsed?.building?.code ||
                ""
              )
                .toString()
                .trim()
                .toUpperCase();
              const spaceNumber = normalizeSpaceNumber(
                parsed?.spaceNumber || "",
              );
              if (buildingCode && spaceNumber) {
                const newSpaceKey = buildSpaceKey(buildingCode, spaceNumber);
                const newDocId = newSpaceKey;

                // Check if this space already exists
                const existingDoc = await getDoc(doc(db, "rooms", newDocId));
                if (!existingDoc.exists()) {
                  const resolvedBuilding = resolveBuilding(buildingCode);
                  const buildingDisplayName =
                    parsed?.building?.displayName ||
                    resolvedBuilding?.displayName ||
                    resolveBuildingDisplayName(buildingCode) ||
                    buildingCode;
                  const displayName = formatSpaceDisplayName({
                    buildingCode,
                    buildingDisplayName,
                    spaceNumber,
                  });
                  const newRoom = {
                    spaceKey: newSpaceKey,
                    spaceNumber,
                    buildingCode,
                    buildingDisplayName,
                    buildingId: resolvedBuilding?.id || "",
                    type: room.type || SPACE_TYPE.CLASSROOM,
                    isActive: true,
                    // Legacy fields
                    building: buildingDisplayName,
                    roomNumber: spaceNumber,
                    name: displayName,
                    displayName: displayName,
                    createdAt: new Date().toISOString(),
                    createdBy: "location-migration",
                  };

                  await batchWriter.add((batch) => {
                    batch.set(doc(db, "rooms", newDocId), newRoom);
                  });
                  results.roomsSplit++;
                }
              }
            } catch (err) {
              results.errors.push(
                `Failed to split room part "${part}": ${err.message}`,
              );
            }
          }

          // Mark the original combined record as inactive
          await batchWriter.add((batch) => {
            batch.update(docSnap.ref, {
              isActive: false,
              migratedAt: new Date().toISOString(),
              migrationNote: "Split into individual room records",
            });
          });
        }
      }
    }

    // 2. Backfill spaceKey on rooms missing it
    if (backfillSpaceKeys) {
      const roomsSnap = await getDocs(collection(db, "rooms"));

      for (const docSnap of roomsSnap.docs) {
        const room = docSnap.data();

        if (!room.spaceKey && room.isActive !== false) {
          const displayName = room.displayName || "";
          const parsed = parseRoomLabel(displayName);

          const buildingCode = (
            parsed?.buildingCode ||
            parsed?.building?.code ||
            room.buildingCode ||
            ""
          )
            .toString()
            .trim()
            .toUpperCase();
          const spaceNumber = normalizeSpaceNumber(
            parsed?.spaceNumber || room.spaceNumber || "",
          );
          if (buildingCode && spaceNumber) {
            const spaceKey = buildSpaceKey(buildingCode, spaceNumber);
            const resolvedBuilding =
              resolveBuilding(buildingCode) ||
              resolveBuilding(
                parsed?.building?.displayName || room.buildingDisplayName || "",
              );
            const buildingDisplayName =
              parsed?.building?.displayName ||
              resolvedBuilding?.displayName ||
              resolveBuildingDisplayName(buildingCode) ||
              buildingCode;
            const formattedDisplayName = formatSpaceDisplayName({
              buildingCode,
              buildingDisplayName,
              spaceNumber,
            });

            await batchWriter.add((batch) => {
              batch.update(docSnap.ref, {
                spaceKey,
                spaceNumber,
                buildingCode,
                buildingDisplayName,
                buildingId: resolvedBuilding?.id || "",
                ...(room.displayName
                  ? {}
                  : {
                      displayName: formattedDisplayName,
                    }),
                updatedAt: new Date().toISOString(),
              });
            });
            results.roomsUpdated++;
          }
        }
      }
    }

    // 3. Seed room records from schedules' spaceDisplayNames
    if (seedRoomsFromSchedules) {
      // Get existing room spaceKeys to avoid duplicates
      const existingRoomsSnap = await getDocs(collection(db, "rooms"));
      const existingSpaceKeys = new Set();
      existingRoomsSnap.docs.forEach((docSnap) => {
        const room = docSnap.data();
        if (room.spaceKey) existingSpaceKeys.add(room.spaceKey);
      });

      const schedulesSnap = await getDocs(collection(db, "schedules"));
      const roomsToCreate = new Map(); // spaceKey -> room data

      for (const docSnap of schedulesSnap.docs) {
        const schedule = docSnap.data();
        const locationLabel = Array.isArray(schedule.spaceDisplayNames)
          ? schedule.spaceDisplayNames.join("; ")
          : "";

        if (
          !locationLabel ||
          detectLocationType(locationLabel) !== LOCATION_TYPE.PHYSICAL
        )
          continue;

        const parsedResult = parseMultiRoom(locationLabel);
        const parsedRooms = parsedResult?.rooms || [];

        for (const parsed of parsedRooms) {
          const buildingCode = (
            parsed?.buildingCode ||
            parsed?.building?.code ||
            ""
          )
            .toString()
            .trim()
            .toUpperCase();
          const spaceNumber = normalizeSpaceNumber(parsed?.spaceNumber || "");

          if (!buildingCode || !spaceNumber) continue;

          const spaceKey = buildSpaceKey(buildingCode, spaceNumber);

          // Skip if already exists or already queued
          if (existingSpaceKeys.has(spaceKey) || roomsToCreate.has(spaceKey))
            continue;

          const resolvedBuilding = resolveBuilding(buildingCode);
          const buildingDisplayName =
            parsed?.building?.displayName ||
            resolvedBuilding?.displayName ||
            resolveBuildingDisplayName(buildingCode) ||
            buildingCode;
          const displayName = formatSpaceDisplayName({
            buildingCode,
            buildingDisplayName,
            spaceNumber,
          });
          roomsToCreate.set(spaceKey, {
            spaceKey,
            spaceNumber,
            buildingCode,
            buildingDisplayName,
            buildingId: resolvedBuilding?.id || "",
            type: SPACE_TYPE.CLASSROOM,
            isActive: true,
            displayName: displayName,
            createdAt: new Date().toISOString(),
            createdBy: "location-migration-seed",
          });
        }
      }

      // Create the room records
      for (const [spaceKey, roomData] of roomsToCreate) {
        try {
          const docId = spaceKey;
          if (docId) {
            await batchWriter.add((batch) => {
              batch.set(doc(db, "rooms", docId), roomData);
            });
            results.roomsSeeded++;
          }
        } catch (err) {
          results.errors.push(
            `Failed to seed room ${spaceKey}: ${err.message}`,
          );
        }
      }
    }

    // 4. Seed room records from people office fields
    if (seedRoomsFromPeople) {
      // Get existing room spaceKeys to avoid duplicates
      const existingRoomsSnap = await getDocs(collection(db, "rooms"));
      const existingSpaceKeys = new Set();
      existingRoomsSnap.docs.forEach((docSnap) => {
        const room = docSnap.data();
        if (room.spaceKey) existingSpaceKeys.add(room.spaceKey);
      });

      const peopleSnap = await getDocs(collection(db, "people"));
      const officesToCreate = new Map(); // spaceKey -> room data

      for (const docSnap of peopleSnap.docs) {
        const person = docSnap.data();
        const office = person.office || "";

        if (!office || detectLocationType(office) !== LOCATION_TYPE.PHYSICAL)
          continue;

        const parsed = parseRoomLabel(office);
        const buildingCode = (
          parsed?.buildingCode ||
          parsed?.building?.code ||
          ""
        )
          .toString()
          .trim()
          .toUpperCase();
        const spaceNumber = normalizeSpaceNumber(parsed?.spaceNumber || "");

        if (!buildingCode || !spaceNumber) continue;

        const spaceKey = buildSpaceKey(buildingCode, spaceNumber);

        // Skip if already exists or already queued
        if (existingSpaceKeys.has(spaceKey) || officesToCreate.has(spaceKey))
          continue;

        const resolvedBuilding = resolveBuilding(buildingCode);
        const buildingDisplayName =
          parsed?.building?.displayName ||
          resolvedBuilding?.displayName ||
          resolveBuildingDisplayName(buildingCode) ||
          buildingCode;
        const displayName = formatSpaceDisplayName({
          buildingCode,
          buildingDisplayName,
          spaceNumber,
        });
        officesToCreate.set(spaceKey, {
          spaceKey,
          spaceNumber,
          buildingCode,
          buildingDisplayName,
          buildingId: resolvedBuilding?.id || "",
          type: SPACE_TYPE.OFFICE,
          isActive: true,
          displayName: displayName,
          createdAt: new Date().toISOString(),
          createdBy: "location-migration-seed",
        });
      }

      // Create the office room records
      for (const [spaceKey, roomData] of officesToCreate) {
        try {
          const docId = spaceKey;
          if (docId) {
            await batchWriter.add((batch) => {
              batch.set(doc(db, "rooms", docId), roomData);
            });
            results.roomsSeeded++;
          }
        } catch (err) {
          results.errors.push(
            `Failed to seed office ${spaceKey}: ${err.message}`,
          );
        }
      }
    }

    // 5. Normalize room display names (optional)
    if (normalizeRoomDisplayNames) {
      const roomsSnap = await getDocs(collection(db, "rooms"));
      for (const docSnap of roomsSnap.docs) {
        const room = docSnap.data() || {};
        const normalized = normalizeSpaceRecord(room, docSnap.id);
        const canonicalDisplayName = getCanonicalRoomDisplayName(room, docSnap.id);
        const updates = {};
        if (canonicalDisplayName && canonicalDisplayName !== room.displayName) {
          updates.displayName = canonicalDisplayName;
        }
        if (
          normalized.buildingDisplayName &&
          normalized.buildingDisplayName !== room.buildingDisplayName
        ) {
          updates.buildingDisplayName = normalized.buildingDisplayName;
        }
        if (normalized.buildingCode && normalized.buildingCode !== room.buildingCode) {
          updates.buildingCode = normalized.buildingCode;
        }
        if (normalized.spaceNumber && normalized.spaceNumber !== room.spaceNumber) {
          updates.spaceNumber = normalized.spaceNumber;
        }
        if (Object.keys(updates).length > 0) {
          await batchWriter.add((batch) => {
            batch.update(docSnap.ref, {
              ...updates,
              updatedAt: new Date().toISOString(),
            });
          });
          results.roomsUpdated++;
        }
      }
    }

    // 6. Repair schedule spaceIds (preferred) or backfill missing spaceIds
    if (repairInvalidScheduleSpaceIds) {
      await batchWriter.flush();
      const schedulesSnap = await getDocs(collection(db, "schedules"));
      const schedules = schedulesSnap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      const repairResult = await repairScheduleSpaceLinksInternal({
        schedules,
        normalizeRoomDisplayNames,
        autoCreateMissingRooms: false,
      });
      results.schedulesUpdated += repairResult.schedulesUpdated || 0;
      results.roomsUpdated += repairResult.roomsUpdated || 0;
    } else if (backfillScheduleSpaceIds) {
      const schedulesSnap = await getDocs(collection(db, "schedules"));

      for (const docSnap of schedulesSnap.docs) {
        const schedule = docSnap.data();

        if (!schedule.spaceIds || schedule.spaceIds.length === 0) {
          const locationLabel = Array.isArray(schedule.spaceDisplayNames)
            ? schedule.spaceDisplayNames.join("; ")
            : "";

          if (
            locationLabel &&
            detectLocationType(locationLabel) === LOCATION_TYPE.PHYSICAL
          ) {
            const parsedResult = parseMultiRoom(locationLabel);
            const spaceIds = [];
            const spaceDisplayNames = [];

            // parseMultiRoom returns an object with a 'rooms' array property
            const parsedRooms = parsedResult?.rooms || [];
            for (const parsed of parsedRooms) {
              const buildingCode = (
                parsed?.buildingCode ||
                parsed?.building?.code ||
                ""
              )
                .toString()
                .trim()
                .toUpperCase();
              const spaceNumber = normalizeSpaceNumber(
                parsed?.spaceNumber || "",
              );
              if (buildingCode && spaceNumber) {
                const spaceKey = buildSpaceKey(buildingCode, spaceNumber);
                const buildingDisplayName =
                  parsed?.building?.displayName ||
                  resolveBuildingDisplayName(buildingCode) ||
                  buildingCode;
                const displayName = formatSpaceDisplayName({
                  buildingCode,
                  buildingDisplayName,
                  spaceNumber,
                });
                spaceIds.push(spaceKey);
                spaceDisplayNames.push(displayName);
              }
            }

            if (spaceIds.length > 0) {
              const uniqueSpaceIds = Array.from(new Set(spaceIds));
              const uniqueDisplayNames = Array.from(new Set(spaceDisplayNames));
              await batchWriter.add((batch) => {
                batch.update(docSnap.ref, {
                  spaceIds: uniqueSpaceIds,
                  spaceDisplayNames: uniqueDisplayNames,
                  updatedAt: new Date().toISOString(),
                });
              });
              results.schedulesUpdated++;
            }
          }
        }
      }
    }

    // 7. Backfill officeSpaceId on people
    if (backfillPeopleOfficeSpaceIds) {
      const peopleSnap = await getDocs(collection(db, "people"));

      for (const docSnap of peopleSnap.docs) {
        const person = docSnap.data();

        if (!person.officeSpaceId && person.office) {
          if (detectLocationType(person.office) !== LOCATION_TYPE.PHYSICAL)
            continue;
          const parsed = parseRoomLabel(person.office);
          const buildingCode = (
            parsed?.buildingCode ||
            parsed?.building?.code ||
            ""
          )
            .toString()
            .trim()
            .toUpperCase();
          const spaceNumber = normalizeSpaceNumber(parsed?.spaceNumber || "");

          if (buildingCode && spaceNumber) {
            const spaceKey = buildSpaceKey(buildingCode, spaceNumber);
            const officeSpaceId = spaceKey;
            const updates = {
              officeSpaceId,
              updatedAt: new Date().toISOString(),
            };

            await batchWriter.add((batch) => {
              batch.update(docSnap.ref, updates);
            });
            results.peopleUpdated++;
          }
        }
      }
    }

    await batchWriter.flush();

    return results;
  } catch (error) {
    console.error("Error applying location migration:", error);
    throw error;
  }
};

export const repairScheduleSpaceLinks = async ({
  normalizeRoomDisplayNames = true,
  overrides = {},
  schedules = null,
} = {}) => {
  let targetSchedules = schedules;
  if (!Array.isArray(targetSchedules)) {
    const schedulesSnap = await getDocs(collection(db, "schedules"));
    targetSchedules = schedulesSnap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
  }
  return repairScheduleSpaceLinksInternal({
    schedules: targetSchedules,
    normalizeRoomDisplayNames,
    overrides,
    autoCreateMissingRooms: false,
  });
};

export const repairScheduleSpaceLinksForSchedule = async (
  scheduleId,
  { normalizeRoomDisplayNames = true, overrides = {} } = {},
) => {
  if (!scheduleId) {
    throw new Error("Schedule ID is required");
  }
  const scheduleSnap = await getDoc(doc(db, "schedules", scheduleId));
  if (!scheduleSnap.exists()) {
    throw new Error("Schedule not found");
  }
  const schedule = { id: scheduleSnap.id, ...scheduleSnap.data() };
  return repairScheduleSpaceLinksInternal({
    schedules: [schedule],
    normalizeRoomDisplayNames,
    overrides,
    autoCreateMissingRooms: false,
  });
};

export const previewScheduleSpaceLinks = async ({ schedules = [] } = {}) => {
  const roomsSnap = await getDocs(collection(db, "rooms"));
  const rooms = roomsSnap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
  const { roomsBySpaceKey, roomsById, roomsByNameKey } =
    buildRoomLookupMaps(rooms);

  const items = schedules
    .filter((schedule) => schedule?.id)
    .map((schedule) => {
      const proposal = buildScheduleSpaceProposal({
        schedule,
        roomsBySpaceKey,
        roomsById,
        roomsByNameKey,
      });
      return {
        scheduleId: schedule.id,
        schedule,
        proposedSpaceIds: proposal.spaceIds,
        proposedDisplayNames: proposal.spaceDisplayNames,
        unresolvedSpaceIds: proposal.unresolvedSpaceIds || [],
        isPhysical: proposal.isPhysical,
      };
    });

  const options = [];
  const displayMap = {};
  rooms.forEach((room) => {
    const spaceKey = (room.spaceKey || room.id || "").toString().trim();
    if (!spaceKey) return;
    if (!displayMap[spaceKey]) {
      displayMap[spaceKey] = getCanonicalRoomDisplayName(room, room.id);
      options.push(spaceKey);
    }
  });

  options.sort((a, b) => {
    const nameA = displayMap[a] || a;
    const nameB = displayMap[b] || b;
    return nameA.localeCompare(nameB);
  });

  return {
    items,
    roomOptions: options,
    displayMap,
  };
};

/**
 * Get location health stats - summary of location data quality
 */
export const getLocationHealthStats = async () => {
  const stats = {
    rooms: {
      total: 0,
      withSpaceKey: 0,
      withoutSpaceKey: 0,
      multiRoom: 0,
      inactive: 0,
    },
    schedules: {
      total: 0,
      withSpaceIds: 0,
      withoutSpaceIds: 0,
      virtual: 0,
    },
    people: {
      total: 0,
      withOfficeSpaceId: 0,
      withoutOfficeSpaceId: 0,
      withOffice: 0,
    },
  };

  try {
    // Rooms
    const roomsSnap = await getDocs(collection(db, "rooms"));
    stats.rooms.total = roomsSnap.size;

    for (const docSnap of roomsSnap.docs) {
      const room = docSnap.data();
      if (room.isActive === false) stats.rooms.inactive++;
      if (room.spaceKey) stats.rooms.withSpaceKey++;
      else stats.rooms.withoutSpaceKey++;

      const displayName = room.displayName || "";
      if (splitMultiRoom(displayName).length > 1) stats.rooms.multiRoom++;
    }

    // Schedules
    const schedulesSnap = await getDocs(collection(db, "schedules"));
    stats.schedules.total = schedulesSnap.size;

    for (const docSnap of schedulesSnap.docs) {
      const schedule = docSnap.data();
      if (schedule.spaceIds?.length > 0) stats.schedules.withSpaceIds++;
      else {
        const roomLabel =
          Array.isArray(schedule.spaceDisplayNames) &&
          schedule.spaceDisplayNames.length > 0
            ? schedule.spaceDisplayNames.join("; ")
            : "";
        if (detectLocationType(roomLabel) !== LOCATION_TYPE.PHYSICAL)
          stats.schedules.virtual++;
        else stats.schedules.withoutSpaceIds++;
      }
    }

    // People
    const peopleSnap = await getDocs(collection(db, "people"));
    stats.people.total = peopleSnap.size;

    for (const docSnap of peopleSnap.docs) {
      const person = docSnap.data();
      if (person.officeSpaceId) stats.people.withOfficeSpaceId++;
      else if (person.office) {
        stats.people.withOffice++;
        stats.people.withoutOfficeSpaceId++;
      }
    }

    return stats;
  } catch (error) {
    console.error("Error getting location health stats:", error);
    throw error;
  }
};

// ============================================================================
// ONE-CLICK SCAN AND FIX
// ============================================================================

/**
 * Comprehensive data scan - detects all issues including teaching conflicts
 *
 * This replaces the complex multi-step wizard with a single scan that:
 * 1. Loads all data
 * 2. Detects duplicates across all collections
 * 3. Detects orphaned records
 * 4. Detects teaching conflicts (faculty double-booked)
 * 5. Detects missing data
 * 6. Returns a complete health report
 */
export const scanDataHealth = async () => {
  const [
    peopleSnapshot,
    schedulesSnapshot,
    roomsSnapshot,
    peopleDecisions,
    scheduleDecisions,
    roomDecisions,
  ] = await Promise.all([
    getDocs(collection(db, "people")),
    getDocs(collection(db, "schedules")),
    getDocs(collection(db, "rooms")),
    fetchDedupeDecisions("people"),
    fetchDedupeDecisions("schedules"),
    fetchDedupeDecisions("rooms"),
  ]);

  const people = peopleSnapshot.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .filter((person) => !person?.mergedInto);
  const schedules = schedulesSnapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
  const rooms = roomsSnapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));

  // Detect all issues
  const peopleDuplicates = detectPeopleDuplicates(people, {
    blockedPairs: peopleDecisions,
  });
  const scheduleDuplicates = detectScheduleDuplicates(schedules, {
    blockedPairs: scheduleDecisions,
  });
  const roomDuplicates = detectRoomDuplicates(rooms, {
    blockedPairs: roomDecisions,
  });
  const orphanedIssues = detectCrossCollectionIssues(people, schedules, rooms);
  const teachingConflicts = detectTeachingConflicts(schedules, {
    blockedSchedulePairs: scheduleDecisions,
  });

  // Count missing data
  const missingData = {
    email: people.filter((p) => !p.email || p.email.trim() === "").length,
    phone: people.filter(
      (p) => (!p.phone || p.phone.trim() === "") && !p.hasNoPhone,
    ).length,
    office: people.filter(
      (p) =>
        !isStudentWorker(p) &&
        (!p.office || p.office.trim() === "") &&
        !p.hasNoOffice &&
        !p.isRemote,
    ).length,
    jobTitle: people.filter((p) => !p.jobTitle || p.jobTitle.trim() === "")
      .length,
  };

  // Calculate health score
  const totalRecords = people.length + schedules.length + rooms.length;
  const totalIssues =
    peopleDuplicates.length +
    scheduleDuplicates.length +
    roomDuplicates.length +
    orphanedIssues.length +
    teachingConflicts.length;

  const healthScore =
    totalRecords === 0
      ? 100
      : Math.max(0, Math.round(100 - (totalIssues / totalRecords) * 100));

  // Count auto-fixable issues
  const autoFixable = {
    highConfidencePeopleDuplicates: peopleDuplicates.filter(
      (d) => d.confidence >= 0.95,
    ).length,
    highConfidenceScheduleDuplicates: scheduleDuplicates.filter(
      (d) => d.confidence >= 0.98,
    ).length,
    highConfidenceRoomDuplicates: roomDuplicates.filter(
      (d) => d.confidence >= 0.95,
    ).length,
    orphanedSchedulesWithName: orphanedIssues.filter(
      (i) =>
        i.type === "orphaned_schedule" &&
        (i.record?.instructorName || i.record?.Instructor),
    ).length,
    orphanedSpaceLinks: orphanedIssues.filter(
      (i) => i.type === "orphaned_space",
    ).length,
  };

  return {
    timestamp: new Date().toISOString(),
    healthScore,
    counts: {
      people: people.length,
      schedules: schedules.length,
      rooms: rooms.length,
    },
    issues: {
      duplicates: {
        people: peopleDuplicates,
        schedules: scheduleDuplicates,
        rooms: roomDuplicates,
        total:
          peopleDuplicates.length +
          scheduleDuplicates.length +
          roomDuplicates.length,
      },
      orphaned: orphanedIssues,
      teachingConflicts,
      missingData,
    },
    autoFixable,
    canAutoFix:
      autoFixable.highConfidencePeopleDuplicates > 0 ||
      autoFixable.highConfidenceScheduleDuplicates > 0 ||
      autoFixable.highConfidenceRoomDuplicates > 0 ||
      autoFixable.orphanedSchedulesWithName > 0 ||
      autoFixable.orphanedSpaceLinks > 0,
  };
};

/**
 * One-click fix - automatically resolves all safe-to-fix issues
 *
 * This function:
 * 1. Standardizes all data formats
 * 2. Merges high-confidence duplicates
 * 3. Links orphaned schedules where possible
 * 4. Backfills instructor IDs from names
 * 5. Fixes location data
 *
 * Issues requiring human decision are left for manual review.
 */
export const autoFixAllIssues = async (options = {}) => {
  const {
    mergeHighConfidenceDuplicates = true,
    standardizeData = true,
    backfillInstructorIds = true,
    fixLocations = true,
    confidenceThreshold = {
      people: 0.95,
      schedules: 0.98,
      rooms: 0.95,
    },
  } = options;

  const results = {
    standardization: { updated: 0 },
    duplicates: {
      peopleMerged: 0,
      schedulesMerged: 0,
      roomsMerged: 0,
      skipped: 0,
    },
    instructorLinks: { linked: 0, skipped: 0 },
    locations: {
      roomsUpdated: 0,
      schedulesUpdated: 0,
      peopleUpdated: 0,
    },
    errors: [],
    timestamp: new Date().toISOString(),
  };

  try {
    // 1. Standardize all data formats
    if (standardizeData) {
      try {
        const standardResult = await standardizeAllData();
        results.standardization.updated = standardResult.updatedRecords || 0;
      } catch (error) {
        results.errors.push(`Standardization failed: ${error.message}`);
      }
    }

    // 2. Merge high-confidence duplicates
    if (mergeHighConfidenceDuplicates) {
      const [peopleDecisions, scheduleDecisions, roomDecisions] =
        await Promise.all([
          fetchDedupeDecisions("people"),
          fetchDedupeDecisions("schedules"),
          fetchDedupeDecisions("rooms"),
        ]);

      // Merge people duplicates
      const peopleDuplicates = await findDuplicatePeople({
        blockedPairs: peopleDecisions,
      });
      for (const duplicate of peopleDuplicates) {
        if (duplicate.confidence >= confidenceThreshold.people) {
          try {
            const [primary, secondary] = duplicate.records;
            await mergePeople(primary.id, secondary.id);
            results.duplicates.peopleMerged++;
          } catch (error) {
            results.errors.push(`Failed to merge people: ${error.message}`);
          }
        } else {
          results.duplicates.skipped++;
        }
      }

      // Merge schedule duplicates
      const schedulesSnapshot = await getDocs(collection(db, "schedules"));
      const schedules = schedulesSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      const scheduleDuplicates = detectScheduleDuplicates(schedules, {
        blockedPairs: scheduleDecisions,
      });

      for (const dup of scheduleDuplicates) {
        if (dup.confidence >= confidenceThreshold.schedules) {
          try {
            await mergeScheduleRecords(dup);
            results.duplicates.schedulesMerged++;
          } catch (error) {
            results.errors.push(`Failed to merge schedules: ${error.message}`);
          }
        } else {
          results.duplicates.skipped++;
        }
      }

      // Merge room duplicates
      const roomsSnapshot = await getDocs(collection(db, "rooms"));
      const rooms = roomsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      const roomDuplicates = detectRoomDuplicates(rooms, {
        blockedPairs: roomDecisions,
      });

      for (const dup of roomDuplicates) {
        if (dup.confidence >= confidenceThreshold.rooms) {
          try {
            await mergeRoomRecords(dup);
            results.duplicates.roomsMerged++;
          } catch (error) {
            results.errors.push(`Failed to merge rooms: ${error.message}`);
          }
        } else {
          results.duplicates.skipped++;
        }
      }
    }

    // 3. Backfill instructor IDs from names
    if (backfillInstructorIds) {
      try {
        const linkResult = await backfillInstructorIdsFromNames();
        results.instructorLinks.linked = linkResult.linked || 0;
        results.instructorLinks.skipped =
          (linkResult.skippedAmbiguous || 0) + (linkResult.skippedMissing || 0);
      } catch (error) {
        results.errors.push(`Instructor backfill failed: ${error.message}`);
      }
    }

    // 4. Fix location data
    if (fixLocations) {
      try {
        const locationResult = await applyLocationMigration({
          splitMultiRooms: true,
          backfillSpaceKeys: true,
          seedRoomsFromSchedules: false,
          seedRoomsFromPeople: false,
          backfillScheduleSpaceIds: true,
          repairInvalidScheduleSpaceIds: true,
          normalizeRoomDisplayNames: true,
          backfillPeopleOfficeSpaceIds: true,
        });
        results.locations = {
          roomsUpdated:
            (locationResult.roomsUpdated || 0) +
            (locationResult.roomsSplit || 0) +
            (locationResult.roomsSeeded || 0),
          schedulesUpdated: locationResult.schedulesUpdated || 0,
          peopleUpdated: locationResult.peopleUpdated || 0,
        };
        if (locationResult.errors?.length > 0) {
          results.errors.push(...locationResult.errors);
        }
      } catch (error) {
        results.errors.push(`Location fix failed: ${error.message}`);
      }
    }

    // Log the bulk operation
    const totalFixed =
      results.standardization.updated +
      results.duplicates.peopleMerged +
      results.duplicates.schedulesMerged +
      results.duplicates.roomsMerged +
      results.instructorLinks.linked +
      results.locations.roomsUpdated +
      results.locations.schedulesUpdated +
      results.locations.peopleUpdated;

    if (totalFixed > 0) {
      try {
        await logBulkUpdate(
          "Auto-fix all data issues",
          "multiple",
          totalFixed,
          "dataHygiene.js - autoFixAllIssues",
        );
      } catch (e) {
        console.error("Failed to log bulk update:", e);
      }
    }

    results.success = results.errors.length === 0;
    results.totalFixed = totalFixed;

    return results;
  } catch (error) {
    console.error("Error in autoFixAllIssues:", error);
    results.errors.push(`Critical error: ${error.message}`);
    results.success = false;
    return results;
  }
};

/**
 * Get remaining issues after auto-fix
 * These require human decision (low confidence duplicates, ambiguous links, etc.)
 */
export const getRemainingIssues = async () => {
  const scan = await scanDataHealth();

  // Filter to only issues that need human review
  return {
    lowConfidenceDuplicates: {
      people: scan.issues.duplicates.people.filter((d) => d.confidence < 0.95),
      schedules: scan.issues.duplicates.schedules.filter(
        (d) => d.confidence < 0.98,
      ),
      rooms: scan.issues.duplicates.rooms.filter((d) => d.confidence < 0.95),
    },
    orphanedWithoutMatch: scan.issues.orphaned.filter(
      (i) =>
        i.type === "orphaned_schedule" &&
        !i.record?.instructorName &&
        !i.record?.Instructor,
    ),
    teachingConflicts: scan.issues.teachingConflicts,
    missingData: scan.issues.missingData,
    healthScore: scan.healthScore,
  };
};

export {
  DEFAULT_PERSON_SCHEMA,
  standardizePerson,
  standardizeSchedule,
  standardizeRoom,
  detectPeopleDuplicates,
  detectScheduleDuplicates,
  detectRoomDuplicates,
  detectCrossCollectionIssues,
  detectTeachingConflicts,
  detectAllDataIssues,
  mergePeopleData,
  mergeScheduleData,
  mergeRoomData,
};

export {
  standardizePhone,
  standardizeCourseCode,
  standardizeTerm,
  standardizeSpaceLabel,
} from "./hygieneCore";
