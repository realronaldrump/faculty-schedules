import { formatPersonDisplayName } from "./personMatchUtils";
import { getRoleList } from "./peopleUtils";

const normalizeSupervisorKey = (value) =>
  String(value || "").trim().toLowerCase();

const isSupervisorCandidate = (person) => {
  const roles = getRoleList(person?.roles);
  return (
    roles.includes("staff") ||
    roles.includes("faculty") ||
    person?.isAdjunct ||
    person?.isUPD
  );
};

export const buildSupervisorIndex = (people = []) => {
  const options = [];
  const byId = new Map();
  const nameToIds = new Map();

  people.forEach((person) => {
    if (!person?.id || !isSupervisorCandidate(person)) return;

    const label =
      formatPersonDisplayName(person) || person.name || person.email || "";
    if (!label) return;

    if (!byId.has(person.id)) {
      const option = { id: person.id, label };
      options.push(option);
      byId.set(person.id, option);
    }

    const key = normalizeSupervisorKey(label);
    if (!key) return;
    const existing = nameToIds.get(key) || new Set();
    existing.add(person.id);
    nameToIds.set(key, existing);
  });

  const nameToId = new Map();
  nameToIds.forEach((ids, key) => {
    if (ids.size === 1) {
      nameToId.set(key, Array.from(ids)[0]);
    }
  });

  options.sort((a, b) => a.label.localeCompare(b.label));

  return { options, byId, nameToId };
};

export const resolveSupervisorId = ({
  supervisorId,
  supervisorName,
  supervisorIndex,
}) => {
  if (supervisorId) return supervisorId;
  const key = normalizeSupervisorKey(supervisorName);
  if (!key || !supervisorIndex?.nameToId) return "";
  return supervisorIndex.nameToId.get(key) || "";
};

export const resolveSupervisorLabel = ({
  supervisorId,
  supervisorName,
  peopleIndex,
  supervisorIndex,
}) => {
  const fallback = supervisorName || "";
  if (supervisorId) {
    const person = peopleIndex?.resolvePerson?.(supervisorId) || null;
    const labelFromPerson = person
      ? formatPersonDisplayName(person) || person.name || person.email || ""
      : "";
    if (labelFromPerson) return labelFromPerson;

    const option = supervisorIndex?.byId?.get(supervisorId);
    if (option?.label) return option.label;
  }

  return fallback;
};
