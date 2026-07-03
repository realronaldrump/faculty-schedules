/**
 * Program director assignments — canonical model.
 *
 * The single source of truth for every program-director relationship is the
 * `directors` array on each program document:
 *
 *   programs/{id}.directors = [{ personId: string, role: "upd" | "gpd" }]
 *
 * One entry = one explicit (person, program, role) assignment. A person may
 * hold the same role for several programs, several roles for one program, or
 * any combination. There are no person-side flags and no per-role caps.
 *
 * Every read goes through `normalizeDirectors`/`buildDirectorIndex` and every
 * write goes through `usePeopleOperations` (or the one-time migration), so
 * role strings stay typed and duplicate (personId, role) pairs cannot exist.
 * Adding a future role type only requires a new entry in DIRECTOR_ROLE_META.
 */

export const DIRECTOR_ROLES = Object.freeze({
  UPD: "upd",
  GPD: "gpd",
});

export const DIRECTOR_ROLE_META = Object.freeze({
  [DIRECTOR_ROLES.UPD]: Object.freeze({
    abbreviation: "UPD",
    label: "Undergraduate Program Director",
    groupLabel: "Undergraduate (UPD)",
  }),
  [DIRECTOR_ROLES.GPD]: Object.freeze({
    abbreviation: "GPD",
    label: "Graduate Program Director",
    groupLabel: "Graduate (GPD)",
  }),
});

export const DIRECTOR_ROLE_ORDER = Object.freeze([
  DIRECTOR_ROLES.UPD,
  DIRECTOR_ROLES.GPD,
]);

export const normalizeDirectorRole = (value) => {
  const role = String(value ?? "")
    .trim()
    .toLowerCase();
  return DIRECTOR_ROLE_META[role] ? role : null;
};

export const isDirectorRole = (value) => normalizeDirectorRole(value) !== null;

export const getDirectorRoleAbbreviation = (role) =>
  DIRECTOR_ROLE_META[normalizeDirectorRole(role)]?.abbreviation || "";

export const getDirectorRoleLabel = (role) =>
  DIRECTOR_ROLE_META[normalizeDirectorRole(role)]?.label || "";

const roleRank = (role) => {
  const rank = DIRECTOR_ROLE_ORDER.indexOf(role);
  return rank === -1 ? DIRECTOR_ROLE_ORDER.length : rank;
};

const directorKey = (personId, role) => `${personId}::${role}`;

/**
 * Normalize a raw `directors` value from Firestore into a sorted, deduped,
 * typed array of `{ personId, role }` entries. Invalid entries are dropped.
 */
export const normalizeDirectors = (rawDirectors) => {
  if (!Array.isArray(rawDirectors)) return [];
  const seen = new Set();
  const normalized = [];
  rawDirectors.forEach((entry) => {
    const personId = String(entry?.personId ?? "").trim();
    const role = normalizeDirectorRole(entry?.role);
    if (!personId || !role) return;
    const key = directorKey(personId, role);
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push({ personId, role });
  });
  normalized.sort(
    (a, b) =>
      roleRank(a.role) - roleRank(b.role) || a.personId.localeCompare(b.personId),
  );
  return normalized;
};

/**
 * Read a program's director assignments, optionally filtered to one role.
 */
export const getProgramDirectors = (program, role = null) => {
  const directors = normalizeDirectors(program?.directors);
  if (!role) return directors;
  const normalizedRole = normalizeDirectorRole(role);
  return directors.filter((entry) => entry.role === normalizedRole);
};

export const hasDirector = (rawDirectors, personId, role) => {
  const normalizedRole = normalizeDirectorRole(role);
  const targetId = String(personId ?? "").trim();
  if (!targetId || !normalizedRole) return false;
  return normalizeDirectors(rawDirectors).some(
    (entry) => entry.personId === targetId && entry.role === normalizedRole,
  );
};

/**
 * Pure add/remove used by the write path and the migration. Both return a
 * fresh normalized array and never touch other assignments.
 */
export const addDirector = (rawDirectors, personId, role) =>
  normalizeDirectors([
    ...(Array.isArray(rawDirectors) ? rawDirectors : []),
    { personId, role },
  ]);

export const removeDirector = (rawDirectors, personId, role) => {
  const normalizedRole = normalizeDirectorRole(role);
  const targetId = String(personId ?? "").trim();
  return normalizeDirectors(rawDirectors).filter(
    (entry) => !(entry.personId === targetId && entry.role === normalizedRole),
  );
};

export const removePersonFromDirectors = (rawDirectors, personId) => {
  const targetId = String(personId ?? "").trim();
  return normalizeDirectors(rawDirectors).filter(
    (entry) => entry.personId !== targetId,
  );
};

export const reassignDirectorPerson = (rawDirectors, fromPersonId, toPersonId) => {
  const fromId = String(fromPersonId ?? "").trim();
  const toId = String(toPersonId ?? "").trim();
  if (!fromId || !toId) return normalizeDirectors(rawDirectors);
  return normalizeDirectors(
    normalizeDirectors(rawDirectors).map((entry) =>
      entry.personId === fromId ? { ...entry, personId: toId } : entry,
    ),
  );
};

export const directorsAreEqual = (a, b) => {
  const left = normalizeDirectors(a);
  const right = normalizeDirectors(b);
  if (left.length !== right.length) return false;
  return left.every(
    (entry, index) =>
      entry.personId === right[index].personId && entry.role === right[index].role,
  );
};

/**
 * Build the person-side view of the same relationship data:
 * Map<personId, [{ programId, programName, role }]>, sorted by role then
 * program name. Directory pages, person records, filters, and exports all
 * derive from this index so they can never disagree with program pages.
 */
export const buildDirectorIndex = (programs = []) => {
  const index = new Map();
  (Array.isArray(programs) ? programs : []).forEach((program) => {
    if (!program?.id) return;
    normalizeDirectors(program.directors).forEach(({ personId, role }) => {
      const assignments = index.get(personId) || [];
      assignments.push({
        programId: program.id,
        programName: program.name || "",
        role,
      });
      index.set(personId, assignments);
    });
  });
  index.forEach((assignments) =>
    assignments.sort(
      (a, b) =>
        roleRank(a.role) - roleRank(b.role) ||
        a.programName.localeCompare(b.programName),
    ),
  );
  return index;
};

export const getDirectorAssignments = (directorIndex, personId) =>
  (directorIndex instanceof Map && directorIndex.get(personId)) || [];

/**
 * Unique role abbreviations for a person's assignments, in role order.
 * e.g. ["UPD"] or ["UPD", "GPD"].
 */
export const summarizeDirectorRoles = (assignments = []) => {
  const roles = new Set(
    (Array.isArray(assignments) ? assignments : [])
      .map((assignment) => normalizeDirectorRole(assignment?.role))
      .filter(Boolean),
  );
  return DIRECTOR_ROLE_ORDER.filter((role) => roles.has(role)).map(
    (role) => DIRECTOR_ROLE_META[role].abbreviation,
  );
};

export const formatDirectorAssignment = (assignment) => {
  const abbreviation = getDirectorRoleAbbreviation(assignment?.role);
  if (!abbreviation) return "";
  const programName = (assignment?.programName || "").trim();
  return programName ? `${abbreviation} — ${programName}` : abbreviation;
};

export const formatDirectorAssignmentList = (assignments = []) =>
  (Array.isArray(assignments) ? assignments : [])
    .map(formatDirectorAssignment)
    .filter(Boolean)
    .join("; ");

/**
 * Shared directory/email-list filter vocabulary.
 */
export const DIRECTOR_FILTER_OPTIONS = Object.freeze([
  Object.freeze({ value: "all", label: "All" }),
  Object.freeze({ value: DIRECTOR_ROLES.UPD, label: "UPDs Only" }),
  Object.freeze({ value: DIRECTOR_ROLES.GPD, label: "GPDs Only" }),
  Object.freeze({ value: "any", label: "Any Director" }),
  Object.freeze({ value: "none", label: "No Director Role" }),
]);

export const matchesDirectorFilter = (assignments, filterValue) => {
  const list = Array.isArray(assignments) ? assignments : [];
  switch (filterValue) {
    case DIRECTOR_ROLES.UPD:
    case DIRECTOR_ROLES.GPD:
      return list.some((assignment) => assignment.role === filterValue);
    case "any":
      return list.length > 0;
    case "none":
      return list.length === 0;
    default:
      return true;
  }
};

/**
 * Eligibility shared by client UI and the write path. Returns an error string
 * or null. Adjunct faculty cannot hold director roles (existing business rule).
 */
export const getDirectorEligibilityError = (person) => {
  if (!person?.id) return "Person record not found.";
  if (person.isAdjunct === true) {
    return "Adjunct faculty cannot be assigned as program directors.";
  }
  return null;
};
