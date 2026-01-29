import {
  standardizePerson,
  standardizeSchedule,
  standardizeRoom
} from './hygieneCore';

const normalizeOfficeId = (value) => {
  if (value === undefined || value === null) return '';
  return String(value).trim();
};

export const standardizeImportedPerson = (person = {}, options = {}) => {
  const { updateTimestamp = true } = options;
  const base = { ...person };
  if (Object.prototype.hasOwnProperty.call(person, 'officeSpaceId')) {
    base.officeSpaceId = normalizeOfficeId(person.officeSpaceId);
  }
  return standardizePerson(base, { updateTimestamp });
};

export const standardizeImportedSchedule = (schedule = {}) =>
  standardizeSchedule(schedule);

export const standardizeImportedRoom = (room = {}) => standardizeRoom(room);
