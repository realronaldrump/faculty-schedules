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
import { db } from "../../firebase";
import {
  logUpdate,
  logStandardization,
  logMerge,
  logBulkUpdate,
} from "../changeLogger";
import { normalizedSchema } from "../normalizedSchema";
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
} from "../locationService";
import { normalizeSpaceRecord } from "../spaceUtils";
import { isStudentWorker } from "../peopleUtils";
import { deriveScheduleIdentityFromSchedule } from "../importIdentityUtils";
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
} from "../hygieneCore";
import {
  buildLinkedSchedulePairSet,
  computeCrossListAutoLinkGroups,
} from "../scheduleLinkUtils";

const MAX_BATCH_OPERATIONS = 450;

const getLocationModelVersion = async () => {
  try {
    const appSettingsSnap = await getDoc(doc(db, "settings", "app"));
    if (!appSettingsSnap.exists()) return 0;
    const rawVersion = appSettingsSnap.data()?.locationModelVersion;
    const parsedVersion = Number(rawVersion);
    return Number.isFinite(parsedVersion) ? parsedVersion : 0;
  } catch (error) {
    console.warn("Unable to read settings/app location model version:", error);
    return 0;
  }
};

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
export const standardizeAllData = async (options = {}) => {
  const {
    termCode = "",
    includePeople = true,
    includeSchedules = true,
    includeRooms = true,
  } = options;
  const batchWriter = createBatchWriter();
  let updateCount = 0;

  // Standardize people
  if (includePeople) {
    const peopleSnapshot = await getDocs(collection(db, "people"));
    for (const docSnap of peopleSnapshot.docs) {
      const standardized = standardizePerson(docSnap.data());
      await batchWriter.add((batch) => batch.update(docSnap.ref, standardized));
      updateCount++;
    }
  }

  // Standardize schedules
  if (includeSchedules) {
    const schedulesSnapshot = termCode
      ? await getDocs(
          query(collection(db, "schedules"), where("termCode", "==", termCode)),
        )
      : await getDocs(collection(db, "schedules"));
    for (const docSnap of schedulesSnapshot.docs) {
      const standardized = standardizeSchedule(docSnap.data());
      if (standardized.instructorId) {
        standardized.instructorName = deleteField();
      }
      await batchWriter.add((batch) => batch.update(docSnap.ref, standardized));
      updateCount++;
    }
  }

  // Standardize rooms
  if (includeRooms) {
    const roomsSnapshot = await getDocs(collection(db, "rooms"));
    for (const docSnap of roomsSnapshot.docs) {
      const standardized = standardizeRoom(docSnap.data());
      await batchWriter.add((batch) => batch.update(docSnap.ref, standardized));
      updateCount++;
    }
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
  const linkedPairs = buildLinkedSchedulePairSet(schedules);
  const scheduleBlocks = new Set([...scheduleDecisions, ...linkedPairs]);
  const scheduleDuplicates = detectScheduleDuplicates(schedules, {
    blockedPairs: scheduleBlocks,
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

const chunkTermCodes = (items, size = 10) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const fetchSchedulesForTermCodes = async (termCodeList = []) => {
  const uniqueCodes = Array.from(
    new Set((Array.isArray(termCodeList) ? termCodeList : []).map((code) => String(code || "").trim()).filter(Boolean)),
  );
  if (uniqueCodes.length === 0) return [];

  const snapshots = await Promise.all(
    chunkTermCodes(uniqueCodes).map((chunk) =>
      getDocs(query(collection(db, "schedules"), where("termCode", "in", chunk))),
    ),
  );

  const seen = new Set();
  const schedules = [];
  snapshots.forEach((snapshot) => {
    snapshot.docs.forEach((docSnap) => {
      if (seen.has(docSnap.id)) return;
      seen.add(docSnap.id);
      schedules.push({ id: docSnap.id, ...docSnap.data() });
    });
  });
  return schedules;
};

const ensureMissingRoomsFromSchedules = async ({
  schedules = [],
  transactionId = "",
} = {}) => {
  const report = {
    roomsCreated: 0,
    roomCreateErrors: [],
    createdRoomIds: [],
  };

  if (!Array.isArray(schedules) || schedules.length === 0) {
    return report;
  }

  const roomsSnapshot = await getDocs(collection(db, "rooms"));
  const existingRoomKeys = new Set(
    roomsSnapshot.docs
      .map((docSnap) => {
        const room = docSnap.data() || {};
        return (room.spaceKey || docSnap.id || "").toString().trim();
      })
      .filter(Boolean),
  );

  const referencedSpaceKeys = new Set();
  schedules.forEach((schedule) => {
    const ids = Array.isArray(schedule?.spaceIds) ? schedule.spaceIds : [];
    ids.forEach((id) => {
      const value = (id || "").toString().trim();
      if (!value) return;
      const validation = validateSpaceKey(value);
      if (validation.valid) referencedSpaceKeys.add(value);
    });

    const names = Array.isArray(schedule?.spaceDisplayNames)
      ? schedule.spaceDisplayNames.filter(Boolean)
      : [];
    if (names.length > 0) {
      const parsed = parseMultiRoom(names.join("; "));
      const parsedKeys = Array.isArray(parsed?.spaceKeys) ? parsed.spaceKeys : [];
      parsedKeys.forEach((spaceKey) => {
        const value = (spaceKey || "").toString().trim();
        if (!value) return;
        const validation = validateSpaceKey(value);
        if (validation.valid) referencedSpaceKeys.add(value);
      });
    }
  });

  const batchWriter = createBatchWriter();
  const now = new Date().toISOString();
  const createdBy = transactionId ? `post-import:${transactionId}` : "post-import-cleanup";

  for (const spaceKey of referencedSpaceKeys) {
    if (existingRoomKeys.has(spaceKey)) continue;
    const parsedKey = parseSpaceKey(spaceKey);
    const buildingCode = (parsedKey?.buildingCode || "").toString().trim().toUpperCase();
    const spaceNumber = normalizeSpaceNumber(parsedKey?.spaceNumber || "");
    const canonicalKey = buildingCode && spaceNumber ? buildSpaceKey(buildingCode, spaceNumber) : "";
    if (!canonicalKey || existingRoomKeys.has(canonicalKey)) continue;

    try {
      const buildingDisplayName = resolveBuildingDisplayName(buildingCode) || buildingCode;
      const resolvedBuilding = resolveBuilding(buildingCode);
      const displayName = formatSpaceDisplayName({
        buildingCode,
        buildingDisplayName,
        spaceNumber,
      });
      const payload = {
        spaceKey: canonicalKey,
        buildingCode,
        buildingDisplayName,
        buildingId: resolvedBuilding?.id || "",
        spaceNumber,
        displayName,
        name: displayName,
        building: buildingDisplayName,
        roomNumber: spaceNumber,
        type: SPACE_TYPE.CLASSROOM,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        createdBy,
      };
      await batchWriter.add((batch) => {
        batch.set(doc(db, "rooms", canonicalKey), payload, { merge: true });
      });
      report.roomsCreated += 1;
      report.createdRoomIds.push(canonicalKey);
      existingRoomKeys.add(canonicalKey);
    } catch (error) {
      report.roomCreateErrors.push(error?.message || String(error));
    }
  }

  await batchWriter.flush();
  return report;
};

const applyCrossListAutoLinkingForSchedules = async ({
  schedules = [],
} = {}) => {
  const report = {
    groupsDetected: 0,
    schedulesUpdated: 0,
    linkedScheduleIds: [],
    clearedScheduleIds: [],
    errors: [],
  };

  if (!Array.isArray(schedules) || schedules.length === 0) {
    return report;
  }

  const groups = computeCrossListAutoLinkGroups(schedules);
  report.groupsDetected = groups.length;

  const desiredGroupByScheduleId = new Map();
  groups.forEach((group) => {
    (Array.isArray(group.scheduleIds) ? group.scheduleIds : []).forEach((scheduleId) => {
      desiredGroupByScheduleId.set(scheduleId, group.linkGroupId);
    });
  });

  const batchWriter = createBatchWriter();
  const now = new Date().toISOString();

  for (const schedule of schedules) {
    const scheduleId = (schedule?.id || "").toString().trim();
    if (!scheduleId) continue;

    const desiredGroupId = desiredGroupByScheduleId.get(scheduleId) || "";
    const currentGroupId = (schedule?.linkGroupId || "").toString().trim();

    if (desiredGroupId && currentGroupId !== desiredGroupId) {
      await batchWriter.add((batch) => {
        batch.update(doc(db, "schedules", scheduleId), {
          linkGroupId: desiredGroupId,
          updatedAt: now,
        });
      });
      report.schedulesUpdated += 1;
      report.linkedScheduleIds.push(scheduleId);
      continue;
    }

    if (!desiredGroupId && currentGroupId && currentGroupId.startsWith("xlist_")) {
      await batchWriter.add((batch) => {
        batch.update(doc(db, "schedules", scheduleId), {
          linkGroupId: deleteField(),
          updatedAt: now,
        });
      });
      report.schedulesUpdated += 1;
      report.clearedScheduleIds.push(scheduleId);
    }
  }

  await batchWriter.flush();
  return report;
};

/**
 * Run scoped post-import finalization.
 *
 * Deterministic finalize order:
 * 1) Create missing referenced rooms for touched schedules
 * 2) Repair schedule spaceIds / display names for touched schedules
 * 3) Normalize canonical room fields touched during repairs
 * 4) Merge high-confidence schedule duplicates in touched terms
 * 5) Auto-link cross-listed schedules with deterministic linkGroupId
 */
export const runPostImportCleanup = async ({
  termCode,
  termCodes,
  touchedScheduleIds = [],
  transactionId = "",
  autoLinkCrossLists = true,
} = {}) => {
  const codes = Array.isArray(termCodes)
    ? termCodes
    : termCode
      ? [termCode]
      : [];
  const uniqueTermCodes = Array.from(
    new Set(codes.map((code) => String(code || "").trim()).filter(Boolean)),
  );

  if (uniqueTermCodes.length === 0) {
    throw new Error("runPostImportCleanup requires a termCode (or termCodes).");
  }

  const touchedSet = new Set(
    (Array.isArray(touchedScheduleIds) ? touchedScheduleIds : [])
      .map((id) => String(id || "").trim())
      .filter(Boolean),
  );

  const report = {
    transactionId: transactionId || "",
    termCodes: uniqueTermCodes,
    touchedScheduleIds: Array.from(touchedSet),
    schedulesFetched: 0,
    roomsCreated: 0,
    roomCreateErrors: [],
    createdRoomIds: [],
    spaceLinkRepairs: null,
    scheduleDuplicatesDetected: 0,
    scheduleDuplicatesMerged: 0,
    scheduleMergeErrors: [],
    mergedScheduleIds: [],
    crossListAutoLink: {
      groupsDetected: 0,
      schedulesUpdated: 0,
      linkedScheduleIds: [],
      clearedScheduleIds: [],
      errors: [],
    },
    blockers: [],
    timestamp: new Date().toISOString(),
  };

  let schedules = await fetchSchedulesForTermCodes(uniqueTermCodes);
  report.schedulesFetched = schedules.length;

  const targetSchedules =
    touchedSet.size > 0
      ? schedules.filter((schedule) => touchedSet.has(schedule.id))
      : schedules;

  // 1) Ensure missing rooms from touched schedule references
  const roomSeedResult = await ensureMissingRoomsFromSchedules({
    schedules: targetSchedules,
    transactionId,
  });
  report.roomsCreated = roomSeedResult.roomsCreated;
  report.roomCreateErrors = roomSeedResult.roomCreateErrors;
  report.createdRoomIds = roomSeedResult.createdRoomIds;

  // 2/3) Repair touched schedule space links and normalize canonical room fields
  try {
    report.spaceLinkRepairs = await repairScheduleSpaceLinks({
      schedules: targetSchedules,
      normalizeRoomDisplayNames: true,
    });
  } catch (error) {
    report.spaceLinkRepairs = { error: error?.message || String(error) };
    report.blockers.push(`Space link repair failed: ${error?.message || error}`);
  }

  // Refresh after repairs before duplicate/link operations.
  schedules = await fetchSchedulesForTermCodes(uniqueTermCodes);

  // 4) Merge high-confidence duplicates in touched terms
  const scheduleDecisions = await fetchDedupeDecisions("schedules");
  const linkedPairs = buildLinkedSchedulePairSet(schedules);
  const blockedPairs = new Set([...scheduleDecisions, ...linkedPairs]);
  const scheduleDuplicates = detectScheduleDuplicates(schedules, { blockedPairs });
  report.scheduleDuplicatesDetected = scheduleDuplicates.length;

  const mergedSecondaryIds = new Set();
  for (const dup of scheduleDuplicates) {
    if (dup.confidence < 0.98) continue;
    const [primary, secondary] = dup.records || [];
    if (!primary?.id || !secondary?.id) continue;
    if (mergedSecondaryIds.has(primary.id) || mergedSecondaryIds.has(secondary.id)) continue;
    try {
      await mergeScheduleRecords(dup);
      report.scheduleDuplicatesMerged += 1;
      report.mergedScheduleIds.push({
        kept: primary.id,
        removed: secondary.id,
      });
      mergedSecondaryIds.add(secondary.id);
    } catch (error) {
      report.scheduleMergeErrors.push(error?.message || String(error));
    }
  }

  if (report.scheduleDuplicatesMerged > 0) {
    schedules = await fetchSchedulesForTermCodes(uniqueTermCodes);
  }

  // 5) Apply deterministic cross-list auto-linking
  if (autoLinkCrossLists) {
    try {
      report.crossListAutoLink = await applyCrossListAutoLinkingForSchedules({
        schedules,
      });
    } catch (error) {
      report.crossListAutoLink.errors.push(error?.message || String(error));
      report.blockers.push(`Cross-list auto-linking failed: ${error?.message || error}`);
    }
  }

  if (report.roomCreateErrors.length > 0) {
    report.blockers.push(`Room creation errors: ${report.roomCreateErrors.length}`);
  }
  if (report.scheduleMergeErrors.length > 0) {
    report.blockers.push(`Schedule merge errors: ${report.scheduleMergeErrors.length}`);
  }

  return report;
};

export const runHistoricalBaselineBackfill = async ({ saveReport = true } = {}) => {
  const schedulesSnapshot = await getDocs(collection(db, "schedules"));
  const schedules = schedulesSnapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
  const allTermCodes = Array.from(
    new Set(schedules.map((schedule) => (schedule?.termCode || "").toString().trim()).filter(Boolean)),
  ).sort();

  const identityPreview = await previewScheduleIdentityBackfill();
  const identityApply = await applyScheduleIdentityBackfill(identityPreview.changes || []);
  const finalizeReport =
    allTermCodes.length > 0
      ? await runPostImportCleanup({
          termCodes: allTermCodes,
          transactionId: `baseline_${Date.now()}`,
          autoLinkCrossLists: true,
        })
      : {
          termCodes: [],
          blockers: [],
          scheduleDuplicatesMerged: 0,
          roomsCreated: 0,
          spaceLinkRepairs: { schedulesUpdated: 0, roomsUpdated: 0 },
          crossListAutoLink: { schedulesUpdated: 0, linkedScheduleIds: [], clearedScheduleIds: [] },
          mergedScheduleIds: [],
          createdRoomIds: [],
        };

  const report = {
    type: "historical_baseline",
    createdAt: new Date().toISOString(),
    summary: {
      totalTermsProcessed: allTermCodes.length,
      totalSchedulesProcessed: schedules.length,
      identityBackfillUpdated: identityApply?.updated || 0,
      scheduleDuplicatesMerged: finalizeReport?.scheduleDuplicatesMerged || 0,
      roomsCreated: finalizeReport?.roomsCreated || 0,
      schedulesSpaceRepaired: finalizeReport?.spaceLinkRepairs?.schedulesUpdated || 0,
      roomsNormalized: finalizeReport?.spaceLinkRepairs?.roomsUpdated || 0,
      crossListLinked: finalizeReport?.crossListAutoLink?.schedulesUpdated || 0,
      blockerCount: Array.isArray(finalizeReport?.blockers)
        ? finalizeReport.blockers.length
        : 0,
    },
    changedIds: {
      identityBackfill: (identityPreview?.changes || []).map((item) => item.id),
      mergedSchedules: finalizeReport?.mergedScheduleIds || [],
      createdRooms: finalizeReport?.createdRoomIds || [],
      crossListLinkedSchedules: finalizeReport?.crossListAutoLink?.linkedScheduleIds || [],
      crossListClearedSchedules: finalizeReport?.crossListAutoLink?.clearedScheduleIds || [],
    },
    blockers: finalizeReport?.blockers || [],
    details: {
      identityTotalRecords: identityPreview?.totalRecords || 0,
      identityRecordsToUpdate: identityPreview?.recordsToUpdate || 0,
      finalizeTimestamp: finalizeReport?.timestamp || "",
      finalizeTermCount: Array.isArray(finalizeReport?.termCodes)
        ? finalizeReport.termCodes.length
        : 0,
    },
  };

  if (saveReport) {
    await addDoc(collection(db, "maintenanceReports"), report);
  }

  return report;
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

// ---------------------------------------------------------------------------
// SCHEDULE IDENTITY BACKFILL
// ---------------------------------------------------------------------------

export const previewScheduleIdentityBackfill = async ({ termCode = "" } = {}) => {
  const snapshot = termCode
    ? await getDocs(
        query(collection(db, "schedules"), where("termCode", "==", termCode)),
      )
    : await getDocs(collection(db, "schedules"));
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

const LEGACY_SCHEDULE_FIELD_MAP = [
  { legacy: "Course", canonical: "courseCode" },
  { legacy: "Section #", canonical: "section" },
  { legacy: "Section", canonical: "section" },
  { legacy: "CRN", canonical: "crn" },
  { legacy: "Term", canonical: "term" },
  { legacy: "Semester", canonical: "term" },
  { legacy: "Term Code", canonical: "termCode" },
  { legacy: "Semester Code", canonical: "termCode" },
  { legacy: "Course Title", canonical: "courseTitle" },
  { legacy: "Instructor", canonical: "instructorName" },
  { legacy: "Inst. Method", canonical: "instructionMethod" },
  { legacy: "Room", canonical: "locationLabel" },
];

const hasNonEmptyValue = (value) =>
  value !== undefined &&
  value !== null &&
  (!(typeof value === "string") || value.trim() !== "");

const personHasRole = (person, role) => {
  if (!person) return false;
  if (Array.isArray(person.roles)) return person.roles.includes(role);
  if (person.roles && typeof person.roles === "object") {
    return person.roles[role] === true;
  }
  return false;
};

const buildScheduleLegacyFixUpdates = (schedule = {}) => {
  const updates = {};
  const touchedFields = [];

  LEGACY_SCHEDULE_FIELD_MAP.forEach(({ legacy, canonical }) => {
    if (!(legacy in schedule)) return;
    const legacyValue = schedule[legacy];
    const canonicalValue = schedule[canonical];
    if (!hasNonEmptyValue(canonicalValue) && hasNonEmptyValue(legacyValue)) {
      updates[canonical] = legacyValue;
    }
    updates[legacy] = deleteField();
    touchedFields.push(legacy);
  });

  return {
    updates,
    touchedFields,
  };
};

const normalizeRolesArray = (roles) => {
  if (Array.isArray(roles)) return roles.filter(Boolean);
  if (roles && typeof roles === "object") {
    return Object.keys(roles).filter((key) => roles[key]);
  }
  return [];
};

const buildStudentAggregate = (person = {}) => {
  const jobs = Array.isArray(person.jobs) ? person.jobs : [];
  const locations = jobs.flatMap((job) =>
    Array.isArray(job?.location) ? job.location : [],
  );
  const primaryBuildings = Array.from(
    new Set(
      locations
        .map((value) => (value || "").toString().trim())
        .filter(Boolean),
    ),
  );
  const weeklySchedule = jobs.flatMap((job) =>
    Array.isArray(job?.weeklySchedule) ? job.weeklySchedule : [],
  );
  return {
    primaryBuildings,
    primaryBuilding: primaryBuildings[0] || "",
    weeklySchedule,
  };
};

const normalizeLegacyString = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const normalizeLegacyBuildingList = (value) => {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return Array.from(
    new Set(
      list
        .map((item) => normalizeLegacyString(item))
        .filter(Boolean),
    ),
  );
};

const buildCanonicalStudentJob = ({
  jobTitle = "",
  supervisor = "",
  supervisorId = "",
  hourlyRate = "",
  buildings = [],
  weeklySchedule = [],
  startDate = "",
  endDate = "",
} = {}) => {
  const location = normalizeLegacyBuildingList(buildings);
  const normalizedWeeklySchedule = Array.isArray(weeklySchedule)
    ? weeklySchedule
    : [];
  const canonicalJob = {
    jobTitle: normalizeLegacyString(jobTitle),
    supervisor: normalizeLegacyString(supervisor),
    supervisorId: normalizeLegacyString(supervisorId),
    hourlyRate: normalizeLegacyString(hourlyRate),
    location,
    buildings: location,
    weeklySchedule: normalizedWeeklySchedule,
    startDate: normalizeLegacyString(startDate),
    endDate: normalizeLegacyString(endDate),
  };

  const hasMeaningfulData =
    canonicalJob.jobTitle ||
    canonicalJob.supervisor ||
    canonicalJob.supervisorId ||
    canonicalJob.hourlyRate ||
    canonicalJob.startDate ||
    canonicalJob.endDate ||
    location.length > 0 ||
    normalizedWeeklySchedule.length > 0;

  return hasMeaningfulData ? canonicalJob : null;
};

const cleanSemesterScheduleEntry = (entry = {}, person = {}) => {
  if (!entry || typeof entry !== "object") {
    return {
      changed: false,
      value: entry,
    };
  }

  const cleaned = { ...entry };
  let changed = false;
  const jobs = Array.isArray(cleaned.jobs) ? cleaned.jobs : [];
  const hasEntryLegacyMirror =
    hasNonEmptyValue(cleaned.jobTitle) ||
    hasNonEmptyValue(cleaned.supervisor) ||
    hasNonEmptyValue(cleaned.supervisorId) ||
    hasNonEmptyValue(cleaned.hourlyRate);

  if (jobs.length === 0) {
    const synthesizedEntryJob = buildCanonicalStudentJob({
      jobTitle: cleaned.jobTitle,
      supervisor: cleaned.supervisor,
      supervisorId: cleaned.supervisorId,
      hourlyRate: cleaned.hourlyRate,
      buildings:
        Array.isArray(cleaned.primaryBuildings) && cleaned.primaryBuildings.length > 0
          ? cleaned.primaryBuildings
          : cleaned.primaryBuilding,
      weeklySchedule: cleaned.weeklySchedule,
      startDate: cleaned.startDate || person.startDate,
      endDate: cleaned.endDate || person.endDate,
    });
    if (synthesizedEntryJob) {
      cleaned.jobs = [synthesizedEntryJob];
      changed = true;
    }
  }

  if (hasEntryLegacyMirror) {
    delete cleaned.jobTitle;
    delete cleaned.supervisor;
    delete cleaned.supervisorId;
    delete cleaned.hourlyRate;
    changed = true;
  }

  return {
    changed,
    value: cleaned,
  };
};

const buildPersonLegacyFixUpdates = (person = {}) => {
  const updates = {};
  const touchedFields = [];
  const addTouched = (field) => {
    if (!field) return;
    if (!touchedFields.includes(field)) {
      touchedFields.push(field);
    }
  };
  const normalizedRoles = normalizeRolesArray(person.roles);

  if (person.roles && !Array.isArray(person.roles)) {
    updates.roles = normalizedRoles;
    addTouched("roles");
  }

  const externalIds =
    person.externalIds && typeof person.externalIds === "object"
      ? { ...person.externalIds }
      : {};

  if (hasNonEmptyValue(person.clssInstructorId)) {
    if (!hasNonEmptyValue(externalIds.clssInstructorId)) {
      externalIds.clssInstructorId = String(person.clssInstructorId).trim();
    }
    updates.clssInstructorId = deleteField();
    addTouched("clssInstructorId");
  }

  if (hasNonEmptyValue(person.baylorId) && !hasNonEmptyValue(externalIds.baylorId)) {
    externalIds.baylorId = String(person.baylorId).trim();
  }

  if (Object.keys(externalIds).length > 0) {
    updates.externalIds = externalIds;
  }

  if (
    hasNonEmptyValue(person.primaryBuilding) &&
    !Array.isArray(person.primaryBuildings)
  ) {
    updates.primaryBuildings = [String(person.primaryBuilding).trim()].filter(Boolean);
    addTouched("primaryBuildings");
  }

  if (personHasRole({ roles: normalizedRoles }, "student")) {
    const currentJobs = Array.isArray(person.jobs) ? person.jobs : [];
    let canonicalJobs = currentJobs;

    if (currentJobs.length === 0) {
      const synthesizedJob = buildCanonicalStudentJob({
        jobTitle: person.jobTitle,
        supervisor: person.supervisor,
        supervisorId: person.supervisorId,
        hourlyRate: person.hourlyRate,
        buildings:
          Array.isArray(person.primaryBuildings) && person.primaryBuildings.length > 0
            ? person.primaryBuildings
            : person.primaryBuilding,
        weeklySchedule: person.weeklySchedule,
        startDate: person.startDate,
        endDate: person.endDate,
      });

      if (synthesizedJob) {
        canonicalJobs = [synthesizedJob];
        updates.jobs = canonicalJobs;
        addTouched("jobs");
        addTouched("student_payload_promoted_to_job");
      }
    }

    if (person.semesterSchedules && typeof person.semesterSchedules === "object") {
      let scheduleChanged = false;
      const cleanedSemesterSchedules = Object.fromEntries(
        Object.entries(person.semesterSchedules).map(([key, entry]) => {
          const cleanedEntry = cleanSemesterScheduleEntry(entry, person);
          if (cleanedEntry.changed) scheduleChanged = true;
          return [key, cleanedEntry.value];
        }),
      );
      if (scheduleChanged) {
        updates.semesterSchedules = cleanedSemesterSchedules;
        addTouched("semesterSchedules");
        addTouched("semester_schedule_mirror_fields");
      }
    }

    if (canonicalJobs.length > 0) {
      const aggregate = buildStudentAggregate({ ...person, jobs: canonicalJobs });
      if (aggregate.primaryBuildings.length > 0) {
        updates.primaryBuildings = aggregate.primaryBuildings;
        updates.primaryBuilding = aggregate.primaryBuilding;
      }
      if (aggregate.weeklySchedule.length > 0) {
        updates.weeklySchedule = aggregate.weeklySchedule;
      }
    }

    const hasStudentMirrorField =
      Object.prototype.hasOwnProperty.call(person, "jobTitle") ||
      Object.prototype.hasOwnProperty.call(person, "supervisor") ||
      Object.prototype.hasOwnProperty.call(person, "supervisorId") ||
      Object.prototype.hasOwnProperty.call(person, "hourlyRate");
    if (hasStudentMirrorField) {
      updates.jobTitle = deleteField();
      updates.supervisor = deleteField();
      updates.supervisorId = deleteField();
      updates.hourlyRate = deleteField();
      addTouched("student_payload_mirror_fields");
    }
  }

  return {
    updates,
    touchedFields,
  };
};

const detectLegacyModelIssues = (people = [], schedules = []) => {
  const issues = [];

  schedules.forEach((schedule) => {
    const { updates, touchedFields } = buildScheduleLegacyFixUpdates(schedule);
    if (Object.keys(updates).length === 0) return;
    issues.push({
      id: `legacy-schedule:${schedule.id}`,
      type: "legacy_schedule_fields",
      recordType: "schedules",
      record: {
        id: schedule.id,
        courseCode: schedule.courseCode || "",
        section: schedule.section || "",
        term: schedule.term || schedule.termCode || "",
      },
      touchedFields,
      message: `Schedule ${schedule.id} contains legacy mirrored fields.`,
      updates,
    });
  });

  people.forEach((person) => {
    const { updates, touchedFields } = buildPersonLegacyFixUpdates(person);
    if (Object.keys(updates).length === 0) return;
    issues.push({
      id: `legacy-person:${person.id}`,
      type: "legacy_person_fields",
      recordType: "people",
      record: {
        id: person.id,
        name:
          person.name ||
          `${person.firstName || ""} ${person.lastName || ""}`.trim() ||
          person.email ||
          "",
      },
      touchedFields,
      message: `Person ${person.id} contains legacy identity or payload fields.`,
      updates,
    });
  });

  return issues;
};

const applyLegacyModelFixes = async (issues = []) => {
  let fixed = 0;
  const errors = [];

  for (const issue of issues) {
    const collectionName = issue?.recordType;
    const docId = issue?.record?.id;
    const updates = issue?.updates;
    if (!collectionName || !docId || !updates || Object.keys(updates).length === 0) {
      continue;
    }
    try {
      await updateDoc(doc(db, collectionName, docId), {
        ...updates,
        updatedAt: new Date().toISOString(),
      });
      fixed += 1;
    } catch (error) {
      errors.push(
        `${collectionName}/${docId}: ${error?.message || "Unknown legacy cleanup error"}`,
      );
    }
  }

  return {
    totalIssues: issues.length,
    fixed,
    errors,
  };
};

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
  const linkedPairs = buildLinkedSchedulePairSet(schedules);
  const scheduleBlocks = new Set([...scheduleDecisions, ...linkedPairs]);
  const scheduleDuplicates = detectScheduleDuplicates(schedules, {
    blockedPairs: scheduleBlocks,
  });
  const roomDuplicates = detectRoomDuplicates(rooms, {
    blockedPairs: roomDecisions,
  });
  const orphanedIssues = detectCrossCollectionIssues(people, schedules, rooms);
  const teachingConflicts = detectTeachingConflicts(schedules, {
    blockedSchedulePairs: scheduleBlocks,
  });
  const legacyModelIssues = detectLegacyModelIssues(people, schedules);

  const highConfidencePeopleDuplicates = peopleDuplicates.filter(
    (entry) => Number(entry?.confidence || 0) >= 0.95,
  );
  const highConfidenceScheduleDuplicates = scheduleDuplicates.filter(
    (entry) => Number(entry?.confidence || 0) >= 0.98,
  );
  const highConfidenceRoomDuplicates = roomDuplicates.filter(
    (entry) => Number(entry?.confidence || 0) >= 0.95,
  );

  const unresolvedImportIssues = [];
  try {
    const importTransactionsSnapshot = await getDocs(
      collection(db, "importTransactions"),
    );
    importTransactionsSnapshot.docs.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const status = (data.status || "").toString().trim();
      if (!["preview", "partial", "failed", "failed_integrity"].includes(status))
        return;
      const matchIssues = Array.isArray(data.matchingIssues)
        ? data.matchingIssues
        : [];
      const resolutionMap =
        data.matchResolutions && typeof data.matchResolutions === "object"
          ? data.matchResolutions
          : {};
      matchIssues.forEach((issue) => {
        const action = resolutionMap?.[issue.id]?.action;
        if (!action) {
          unresolvedImportIssues.push({
            transactionId: docSnap.id,
            status,
            issueId: issue.id,
            reason: issue.reason || "",
            importType: issue.importType || data.type || "schedule",
            semester: data.semester || "",
          });
        }
      });
    });
  } catch (error) {
    console.warn("Unable to read importTransactions for unresolved issues:", error);
  }

  // Calculate health score
  const totalRecords = people.length + schedules.length + rooms.length;
  const totalIssues =
    highConfidencePeopleDuplicates.length +
    highConfidenceScheduleDuplicates.length +
    highConfidenceRoomDuplicates.length +
    orphanedIssues.length +
    teachingConflicts.length +
    unresolvedImportIssues.length +
    legacyModelIssues.length;

  const healthScore =
    totalRecords === 0
      ? 100
      : Math.max(0, Math.round(100 - (totalIssues / totalRecords) * 100));

  // Count auto-fixable issues
  const autoFixable = {
    highConfidencePeopleDuplicates: highConfidencePeopleDuplicates.length,
    highConfidenceScheduleDuplicates: highConfidenceScheduleDuplicates.length,
    highConfidenceRoomDuplicates: highConfidenceRoomDuplicates.length,
    orphanedSchedulesWithName: orphanedIssues.filter(
      (i) =>
        i.type === "orphaned_schedule" &&
        (i.record?.instructorName || i.record?.Instructor),
    ).length,
    orphanedSpaceLinks: orphanedIssues.filter(
      (i) => i.type === "orphaned_space",
    ).length,
    legacyModelIssues: legacyModelIssues.length,
  };

  const blockingSummary = {
    orphanedInstructorReferences: orphanedIssues.filter(
      (issue) => issue.type === "orphaned_schedule",
    ).length,
    orphanedSpaceReferences: orphanedIssues.filter(
      (issue) => issue.type === "orphaned_space",
    ).length,
    highConfidenceDuplicates:
      highConfidencePeopleDuplicates.length +
      highConfidenceScheduleDuplicates.length +
      highConfidenceRoomDuplicates.length,
    unresolvedImportIssues: unresolvedImportIssues.length,
    teachingConflicts: teachingConflicts.length,
    legacyModelIssues: legacyModelIssues.length,
  };

  const blockingIssues = Object.values(blockingSummary).reduce(
    (total, count) => total + Number(count || 0),
    0,
  );

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
        people: highConfidencePeopleDuplicates,
        schedules: highConfidenceScheduleDuplicates,
        rooms: highConfidenceRoomDuplicates,
        total:
          highConfidencePeopleDuplicates.length +
          highConfidenceScheduleDuplicates.length +
          highConfidenceRoomDuplicates.length,
      },
      orphaned: orphanedIssues,
      teachingConflicts,
      unresolvedImportIssues,
      legacyModelIssues,
    },
    autoFixable,
    summary: {
      blockingIssues,
      ...blockingSummary,
    },
    canAutoFix:
      autoFixable.highConfidencePeopleDuplicates > 0 ||
      autoFixable.highConfidenceScheduleDuplicates > 0 ||
      autoFixable.highConfidenceRoomDuplicates > 0 ||
      autoFixable.orphanedSchedulesWithName > 0 ||
      autoFixable.orphanedSpaceLinks > 0 ||
      autoFixable.legacyModelIssues > 0,
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
    fixLegacyModel = true,
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
    legacyModel: { fixed: 0, totalIssues: 0 },
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
    // 0. Normalize legacy model mirrors and identity shadow fields
    if (fixLegacyModel) {
      try {
        const [peopleSnapshot, schedulesSnapshot] = await Promise.all([
          getDocs(collection(db, "people")),
          getDocs(collection(db, "schedules")),
        ]);
        const people = peopleSnapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        const schedules = schedulesSnapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        const legacyIssues = detectLegacyModelIssues(people, schedules);
        const legacyResult = await applyLegacyModelFixes(legacyIssues);
        results.legacyModel = {
          fixed: legacyResult.fixed || 0,
          totalIssues: legacyResult.totalIssues || 0,
        };
        if (Array.isArray(legacyResult.errors) && legacyResult.errors.length > 0) {
          results.errors.push(...legacyResult.errors);
        }
      } catch (error) {
        results.errors.push(`Legacy model cleanup failed: ${error.message}`);
      }
    }

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
      const linkedPairs = buildLinkedSchedulePairSet(schedules);
      const scheduleBlocks = new Set([...scheduleDecisions, ...linkedPairs]);
      const scheduleDuplicates = detectScheduleDuplicates(schedules, {
        blockedPairs: scheduleBlocks,
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
        const locationModelVersion = await getLocationModelVersion();

        // Location model v2+: prefer targeted canonical repairs and avoid
        // running the broader full migration pipeline on every auto-fix.
        if (locationModelVersion >= 2) {
          const repairResult = await repairScheduleSpaceLinks({
            normalizeRoomDisplayNames: true,
          });
          results.locations = {
            roomsUpdated: repairResult.roomsUpdated || 0,
            schedulesUpdated: repairResult.schedulesUpdated || 0,
            peopleUpdated: 0,
          };
        } else {
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
        }
      } catch (error) {
        results.errors.push(`Location fix failed: ${error.message}`);
      }
    }

    // Log the bulk operation
    const totalFixed =
      results.legacyModel.fixed +
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
  buildScheduleLegacyFixUpdates,
  buildPersonLegacyFixUpdates,
  detectLegacyModelIssues,
};

export {
  standardizePhone,
  standardizeCourseCode,
  standardizeTerm,
  standardizeSpaceLabel,
} from "../hygieneCore";
