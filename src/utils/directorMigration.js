/**
 * One-time migration of legacy UPD data into the canonical
 * `programs/{id}.directors` model, plus removal of the legacy fields
 * (`programs.updIds`, `programs.updId`, `people.isUPD`).
 *
 * Legacy state being reconciled (see tasks/todo.md for the audit):
 *   - programs.updIds / programs.updId — assignments written by the Programs
 *     page (program-side intent).
 *   - people.isUPD + people.programId — the directory flag, which the rest of
 *     the app displayed on its own and which routinely diverged.
 *
 * Reconciliation is deterministic:
 *   - updIds/updId entry whose person exists (following mergedInto chains)
 *     → migrated as a UPD assignment of that program.
 *   - person with isUPD === true and a resolvable programId that no updIds
 *     list covers → migrated as a UPD assignment of their program.
 *   - person with isUPD === true and no resolvable program → reported for
 *     manual review (never silently discarded, never guessed).
 *   - updIds entry with no surviving person document → reported as orphaned
 *     and dropped.
 *
 * The plan builder is pure so the reconciliation is fully unit-testable and
 * the same logic backs the Data Cleanup health scan. Re-running after a
 * successful apply is a no-op.
 */

import {
  collection,
  deleteField,
  doc,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import { db, COLLECTIONS } from "../firebase";
import { logUpdate } from "./changeLogger";
import {
  DIRECTOR_ROLES,
  directorsAreEqual,
  normalizeDirectors,
} from "./directorAssignments";

const MAX_MERGE_HOPS = 10;
const BATCH_LIMIT = 400;

const personDisplayName = (person) =>
  person?.name ||
  `${person?.firstName || ""} ${person?.lastName || ""}`.trim() ||
  person?.email ||
  person?.id ||
  "Unknown";

/**
 * Follow mergedInto chains to the surviving person document.
 * Returns the canonical person object or null.
 */
const resolveCanonicalPerson = (peopleById, personId) => {
  let current = peopleById.get(personId) || null;
  let hops = 0;
  while (current?.mergedInto && hops < MAX_MERGE_HOPS) {
    const next = peopleById.get(current.mergedInto);
    if (!next) break;
    current = next;
    hops += 1;
  }
  if (!current || current.mergedInto) return null;
  return current;
};

const legacyUpdIdsForProgram = (program) => {
  const ids = [];
  if (Array.isArray(program?.updIds)) {
    program.updIds.forEach((id) => {
      const trimmed = String(id ?? "").trim();
      if (trimmed) ids.push(trimmed);
    });
  }
  const singular = String(program?.updId ?? "").trim();
  if (singular) ids.push(singular);
  return Array.from(new Set(ids));
};

/**
 * Pure reconciliation. Returns the full migration plan:
 * {
 *   assignments: [{ programId, programName, personId, personName, role, source }],
 *   programUpdates: [{ programId, programName, directors, hadLegacyFields }],
 *   peopleCleanups: [{ personId, personName }],
 *   orphaned: [{ programId, programName, personId, reason }],
 *   manualReview: [{ personId, personName, reason }],
 *   summary: { ... }
 * }
 */
export const buildDirectorMigrationPlan = (people = [], programs = []) => {
  const peopleById = new Map(
    (people || []).filter((p) => p?.id).map((p) => [p.id, p]),
  );
  const programsById = new Map(
    (programs || []).filter((p) => p?.id).map((p) => [p.id, p]),
  );

  const assignments = [];
  const orphaned = [];
  const manualReview = [];
  const directorsByProgramId = new Map();
  const coveredByUpdIds = new Set(); // personId::programId pairs from program-side lists

  programsById.forEach((program) => {
    directorsByProgramId.set(program.id, normalizeDirectors(program.directors));
  });

  const addAssignment = (program, person, source) => {
    const existing = directorsByProgramId.get(program.id) || [];
    const already = existing.some(
      (entry) =>
        entry.personId === person.id && entry.role === DIRECTOR_ROLES.UPD,
    );
    if (!already) {
      directorsByProgramId.set(
        program.id,
        normalizeDirectors([
          ...existing,
          { personId: person.id, role: DIRECTOR_ROLES.UPD },
        ]),
      );
      assignments.push({
        programId: program.id,
        programName: program.name || "",
        personId: person.id,
        personName: personDisplayName(person),
        role: DIRECTOR_ROLES.UPD,
        source,
      });
    }
  };

  // Pass 1: program-side lists (updIds / updId) — the assignments the
  // Programs page management UI intentionally wrote.
  programsById.forEach((program) => {
    legacyUpdIdsForProgram(program).forEach((rawPersonId) => {
      const person = resolveCanonicalPerson(peopleById, rawPersonId);
      if (!person) {
        orphaned.push({
          programId: program.id,
          programName: program.name || "",
          personId: rawPersonId,
          reason: "Referenced person record no longer exists.",
        });
        return;
      }
      coveredByUpdIds.add(`${person.id}::${program.id}`);
      addAssignment(program, person, "program updIds");
    });
  });

  // Pass 2: directory flags (people.isUPD) not covered by any program list.
  (people || []).forEach((rawPerson) => {
    if (rawPerson?.isUPD !== true || rawPerson?.mergedInto) return;
    const person = resolveCanonicalPerson(peopleById, rawPerson.id) || rawPerson;
    const program = person.programId
      ? programsById.get(person.programId)
      : null;
    if (!program) {
      manualReview.push({
        personId: person.id,
        personName: personDisplayName(person),
        reason: person.programId
          ? `Flagged as UPD but programId "${person.programId}" does not match any program.`
          : "Flagged as UPD but has no program assignment to attach the directorship to.",
      });
      return;
    }
    if (coveredByUpdIds.has(`${person.id}::${program.id}`)) return;
    addAssignment(program, person, "directory flag + program membership");
  });

  // Program writes: canonical directors + legacy field removal.
  const programUpdates = [];
  programsById.forEach((program) => {
    const nextDirectors = directorsByProgramId.get(program.id) || [];
    const hadLegacyFields =
      Object.prototype.hasOwnProperty.call(program, "updIds") ||
      Object.prototype.hasOwnProperty.call(program, "updId");
    const directorsChanged = !directorsAreEqual(
      program.directors,
      nextDirectors,
    );
    const directorsFieldMissing = !Array.isArray(program.directors);
    if (hadLegacyFields || directorsChanged || directorsFieldMissing) {
      programUpdates.push({
        programId: program.id,
        programName: program.name || "",
        directors: nextDirectors,
        hadLegacyFields,
      });
    }
  });

  // People writes: strip the legacy flag wherever the field exists at all.
  // Flags belonging to manual-review people are separated so the routine
  // health-scan auto-fix never removes them; only the explicit migration
  // apply (which surfaces the manual-review report first) clears those.
  const manualReviewIds = new Set(manualReview.map((entry) => entry.personId));
  const peopleWithLegacyFlag = (people || [])
    .filter(
      (person) =>
        person?.id && Object.prototype.hasOwnProperty.call(person, "isUPD"),
    )
    .map((person) => ({
      personId: person.id,
      personName: personDisplayName(person),
    }));
  const peopleCleanups = peopleWithLegacyFlag.filter(
    (entry) => !manualReviewIds.has(entry.personId),
  );
  const manualReviewCleanups = peopleWithLegacyFlag.filter((entry) =>
    manualReviewIds.has(entry.personId),
  );

  return {
    assignments,
    programUpdates,
    peopleCleanups,
    manualReviewCleanups,
    orphaned,
    manualReview,
    summary: {
      programsTotal: programsById.size,
      peopleTotal: peopleById.size,
      migratedAssignments: assignments.length,
      programsToUpdate: programUpdates.length,
      peopleFlagsToRemove:
        peopleCleanups.length + manualReviewCleanups.length,
      orphanedReferences: orphaned.length,
      manualReviewCount: manualReview.length,
    },
  };
};

const fetchPeopleAndPrograms = async () => {
  const [peopleSnapshot, programsSnapshot] = await Promise.all([
    getDocs(collection(db, COLLECTIONS.PEOPLE)),
    getDocs(collection(db, COLLECTIONS.PROGRAMS)),
  ]);
  return {
    people: peopleSnapshot.docs.map((d) => ({ id: d.id, ...d.data() })),
    programs: programsSnapshot.docs.map((d) => ({ id: d.id, ...d.data() })),
  };
};

export const previewDirectorMigration = async () => {
  const { people, programs } = await fetchPeopleAndPrograms();
  return buildDirectorMigrationPlan(people, programs);
};

/**
 * Apply the migration in chunked batches (each batch commits atomically).
 * Returns the plan plus an apply report.
 */
export const applyDirectorMigration = async () => {
  const { people, programs } = await fetchPeopleAndPrograms();
  const plan = buildDirectorMigrationPlan(people, programs);
  const now = new Date().toISOString();

  const operations = [];
  plan.programUpdates.forEach((update) => {
    operations.push((batch) => {
      batch.update(doc(db, COLLECTIONS.PROGRAMS, update.programId), {
        directors: update.directors,
        updIds: deleteField(),
        updId: deleteField(),
        updatedAt: now,
      });
    });
  });
  [...plan.peopleCleanups, ...plan.manualReviewCleanups].forEach((cleanup) => {
    operations.push((batch) => {
      batch.update(doc(db, COLLECTIONS.PEOPLE, cleanup.personId), {
        isUPD: deleteField(),
        updatedAt: now,
      });
    });
  });

  let committed = 0;
  for (let start = 0; start < operations.length; start += BATCH_LIMIT) {
    const batch = writeBatch(db);
    operations
      .slice(start, start + BATCH_LIMIT)
      .forEach((applyOperation) => applyOperation(batch));
    await batch.commit();
    committed += Math.min(BATCH_LIMIT, operations.length - start);
  }

  try {
    await logUpdate(
      `Program Director Migration — ${plan.summary.migratedAssignments} assignments canonicalized`,
      COLLECTIONS.PROGRAMS,
      "director-migration",
      {
        summary: plan.summary,
        assignments: plan.assignments,
        orphaned: plan.orphaned,
        manualReview: plan.manualReview,
      },
      {},
      "directorMigration.js - applyDirectorMigration",
    );
  } catch (error) {
    console.error("Change logging error (director migration):", error);
  }

  return {
    ...plan,
    applied: {
      documentWrites: committed,
      programsUpdated: plan.programUpdates.length,
      peopleUpdated: plan.peopleCleanups.length + plan.manualReviewCleanups.length,
      completedAt: now,
    },
  };
};
