import { describe, expect, it } from 'vitest';

import {
  standardizeImportedPerson,
  standardizeImportedRoom,
  standardizeImportedSchedule
} from '../importHygieneUtils';

describe('importHygieneUtils', () => {
  it('standardizes imported people fields', () => {
    const result = standardizeImportedPerson({
      firstName: '  Jane ',
      lastName: ' DOE ',
      email: 'JANE.DOE@EXAMPLE.EDU',
      phone: '(123) 456-7890',
      office: '  Old Main 101 ',
      officeSpaceId: '  MAIN:101 ',
      officeRoomId: '  MAIN:101 '
    }, { updateTimestamp: false });

    expect(result.firstName).toBe('Jane');
    expect(result.lastName).toBe('DOE');
    expect(result.name).toBe('Jane DOE');
    expect(result.email).toBe('jane.doe@example.edu');
    expect(result.phone).toBe('1234567890');
    expect(result.office).toBe('Old Main 101');
    expect(result.officeSpaceId).toBe('MAIN:101');
    expect(result.officeRoomId).toBe('MAIN:101');
    expect(result.externalIds?.emails || []).toContain('jane.doe@example.edu');
  });

  it('standardizes imported schedules', () => {
    const result = standardizeImportedSchedule({
      courseCode: 'adm1300',
      section: '01 ',
      term: 'spring 2026',
      roomName: 'Online',
      instructorId: 'p1'
    });

    expect(result.courseCode).toBe('ADM 1300');
    expect(result.section).toBe('01');
    expect(result.term).toBe('Spring 2026');
    expect(result.locationType).toBe('no_room');
    expect(result.roomNames).toEqual([]);
    expect(result.instructorIds).toEqual(['p1']);
  });

  it('standardizes imported rooms', () => {
    const result = standardizeImportedRoom({
      name: '  Goebel 101 ',
      displayName: '  Goebel 101  ',
      building: ' Goebel ',
      roomNumber: ' 101 ',
      type: ''
    });

    expect(result.name).toBe('Goebel 101');
    expect(result.displayName).toBe('Goebel 101');
    expect(result.building).toBe('Goebel');
    expect(result.roomNumber).toBe('101');
    expect(result.type).toBe('Classroom');
    expect(result.updatedAt).toBeTruthy();
  });
});
