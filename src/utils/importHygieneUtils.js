import {
  standardizePerson,
  standardizeSchedule,
  standardizeRoom
} from './hygieneCore';

const normalizeOfficeId = (value) => {
  if (value === undefined || value === null) return '';
  return String(value).trim();
};

const normalizeOfficeIdList = (value) => {
  if (Array.isArray(value)) {
    return value.map(normalizeOfficeId).filter(Boolean);
  }
  if (value === undefined || value === null) return [];
  const single = normalizeOfficeId(value);
  return single ? [single] : [];
};

export const standardizeImportedPerson = (person = {}, options = {}) => {
  const { updateTimestamp = true } = options;
  const base = { ...person };
  if (Object.prototype.hasOwnProperty.call(person, 'officeSpaceId')) {
    base.officeSpaceId = normalizeOfficeId(person.officeSpaceId);
  }
  if (Object.prototype.hasOwnProperty.call(person, 'officeSpaceIds')) {
    base.officeSpaceIds = normalizeOfficeIdList(person.officeSpaceIds);
  }
  if (Object.prototype.hasOwnProperty.call(person, 'offices')) {
    base.offices = normalizeOfficeIdList(person.offices);
  }
  return standardizePerson(base, { updateTimestamp });
};

export const standardizeImportedSchedule = (schedule = {}) =>
  standardizeSchedule(schedule);

export const standardizeImportedRoom = (room = {}) => standardizeRoom(room);
