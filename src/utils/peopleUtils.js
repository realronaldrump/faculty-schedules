/**
 * People utility helpers for canonical/merged records.
 */

export const buildPeopleIndex = (people = []) => {
  const peopleById = new Map();
  people.forEach(person => {
    if (person?.id) {
      peopleById.set(person.id, person);
    }
  });

  const resolvePersonId = (personId) => {
    if (!personId) return personId;
    let currentId = personId;
    const visited = new Set();

    while (currentId && peopleById.has(currentId) && !visited.has(currentId)) {
      const current = peopleById.get(currentId);
      const nextId = current?.mergedInto;
      if (!nextId || !peopleById.has(nextId)) {
        break;
      }
      visited.add(currentId);
      currentId = nextId;
    }

    return currentId;
  };

  const resolvePerson = (personId) => {
    const canonicalId = resolvePersonId(personId);
    return peopleById.get(canonicalId) || null;
  };

  const peopleMap = new Map();
  peopleById.forEach((person, id) => {
    const canonicalId = resolvePersonId(id);
    const canonicalPerson = peopleById.get(canonicalId) || person;
    peopleMap.set(id, canonicalPerson);
  });

  const canonicalPeople = people.filter(person => !person?.mergedInto);

  return {
    peopleById,
    peopleMap,
    resolvePersonId,
    resolvePerson,
    canonicalPeople
  };
};

export const getRoleList = (roles) => {
  if (Array.isArray(roles)) return roles.filter(Boolean);
  if (roles && typeof roles === 'object') {
    return Object.keys(roles).filter((key) => roles[key]);
  }
  return [];
};

export const hasRole = (person, role) => (
  getRoleList(person?.roles).includes(role)
);

export const isPersonActive = (person) => person?.isActive !== false;

export const isStudentWorker = (person) => {
  const roles = getRoleList(person?.roles);
  return roles.includes('student') && !roles.includes('faculty') && !roles.includes('staff');
};

export const filterCanonicalPeople = (people = []) => (
  buildPeopleIndex(people).canonicalPeople
);
