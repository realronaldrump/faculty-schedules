import { resolveOfficeLocations } from "./spaceUtils";

const normalizeString = (value) => (value == null ? "" : String(value).trim());

const normalizeKeyPart = (value) => normalizeString(value).toLowerCase();

const getPersonName = (person = {}) =>
  normalizeString(
    person.name ||
      [person.firstName, person.lastName].map(normalizeString).filter(Boolean).join(" "),
  );

const getPersonIdentityKey = (person = {}, fallbackKey = "") => {
  const id = normalizeString(person.id);
  if (id) return `id:${id}`;

  const email = normalizeKeyPart(person.email);
  if (email) return `email:${email}`;

  const name = normalizeKeyPart(getPersonName(person));
  if (name) return `name:${name}`;

  return `unknown:${fallbackKey}`;
};

const hasUsableValue = (value) => {
  if (value == null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true;
};

const mergePersonData = (existing = {}, incoming = {}) => {
  const merged = { ...existing };

  Object.entries(incoming).forEach(([key, value]) => {
    if (key === "roleFlags") return;

    if (typeof value === "boolean") {
      merged[key] = Boolean(merged[key]) || value;
      return;
    }

    if (!hasUsableValue(merged[key]) && hasUsableValue(value)) {
      merged[key] = value;
    }
  });

  return merged;
};

const getOfficeRowsForPerson = (person = {}, spacesByKey) => {
  if (person.isRemote) {
    return [
      {
        buildingName: "Remote",
        roomNumber: "",
        office: person.office || "Remote",
        locationKey: "remote",
      },
    ];
  }

  const locations = resolveOfficeLocations(person, spacesByKey);
  if (locations.length === 0) {
    return [
      {
        buildingName: "No Building",
        roomNumber: "",
        office: person.office || "",
        locationKey: `unassigned:${normalizeKeyPart(person.office)}`,
      },
    ];
  }

  const rowsByLocation = new Map();
  locations.forEach((location) => {
    const buildingName = location.buildingDisplayName || "No Building";
    const roomNumber = location.spaceNumber || "";
    const office = location.displayName || person.office || "";
    const locationKey =
      location.spaceKey ||
      [buildingName, roomNumber, office].map(normalizeKeyPart).join(":");

    if (!rowsByLocation.has(locationKey)) {
      rowsByLocation.set(locationKey, {
        buildingName,
        roomNumber,
        office,
        locationKey,
      });
    }
  });

  return Array.from(rowsByLocation.values());
};

const getDisplayRole = (person, roleFlags) => {
  if (roleFlags.faculty && roleFlags.staff) return "Faculty & Staff";
  if (roleFlags.faculty) return person.isAdjunct ? "Adjunct Faculty" : "Faculty";
  if (roleFlags.staff) return person.isAlsoFaculty ? "Faculty & Staff" : "Staff";
  if (person.isAlsoFaculty || person.isAlsoStaff) return "Faculty & Staff";
  return person.isAdjunct ? "Adjunct Faculty" : "Staff";
};

const getRoleType = (roleFlags) => {
  if (roleFlags.faculty && roleFlags.staff) return "both";
  if (roleFlags.faculty) return "faculty";
  return "staff";
};

const sortOfficePeople = (a, b) => {
  const roomA = parseInt(a.roomNumber, 10) || 9999;
  const roomB = parseInt(b.roomNumber, 10) || 9999;
  if (roomA !== roomB) return roomA - roomB;

  return (a.name || "").localeCompare(b.name || "");
};

export const buildOfficeBuildingData = ({
  facultyData = [],
  staffData = [],
  spacesByKey,
  showFaculty = true,
  showStaff = true,
  showAdjuncts = true,
} = {}) => {
  const buildings = {};

  const ensureBuilding = (buildingName) => {
    if (!buildings[buildingName]) {
      buildings[buildingName] = {
        name: buildingName,
        peopleByRowKey: new Map(),
      };
    }
    return buildings[buildingName];
  };

  const addPerson = (person, roleType, fallbackKey) => {
    if (!person) return;

    const personIdentityKey = getPersonIdentityKey(person, fallbackKey);
    getOfficeRowsForPerson(person, spacesByKey).forEach((officeRow) => {
      const building = ensureBuilding(officeRow.buildingName);
      const rowKey = `${personIdentityKey}:${officeRow.locationKey}`;
      const existing = building.peopleByRowKey.get(rowKey);
      const roleFlags = existing?.roleFlags || { faculty: false, staff: false };
      roleFlags[roleType] = true;

      const mergedPerson = existing
        ? mergePersonData(existing, person)
        : { ...person };

      building.peopleByRowKey.set(rowKey, {
        ...mergedPerson,
        name: getPersonName(mergedPerson),
        buildingName: officeRow.buildingName,
        roomNumber: officeRow.roomNumber,
        office: officeRow.office || mergedPerson.office || "",
        sortKey: officeRow.roomNumber || getPersonName(mergedPerson),
        rowKey,
        roleFlags,
      });
    });
  };

  if (showFaculty && Array.isArray(facultyData)) {
    facultyData
      .filter((person) => showAdjuncts || !person.isAdjunct)
      .forEach((person, index) => addPerson(person, "faculty", `faculty:${index}`));
  }

  if (showStaff && Array.isArray(staffData)) {
    staffData.forEach((person, index) =>
      addPerson(person, "staff", `staff:${index}`),
    );
  }

  Object.values(buildings).forEach((building) => {
    const people = Array.from(building.peopleByRowKey.values()).map((person) => {
      const roleFlags = person.roleFlags;
      const { roleFlags: _roleFlags, ...displayPerson } = person;

      return {
        ...displayPerson,
        roleType: getRoleType(roleFlags),
        displayRole: getDisplayRole(displayPerson, roleFlags),
      };
    });

    people.sort(sortOfficePeople);

    building.people = people;
    building.facultyCount = people.filter(
      (person) => person.roleType === "faculty" || person.roleType === "both",
    ).length;
    building.staffCount = people.filter(
      (person) => person.roleType === "staff" || person.roleType === "both",
    ).length;
    delete building.peopleByRowKey;
  });

  return buildings;
};
