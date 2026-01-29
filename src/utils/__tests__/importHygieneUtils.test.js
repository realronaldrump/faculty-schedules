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
      officeSpaceId: '  MAIN:101 '
    }, { updateTimestamp: false });

    expect(result.firstName).toBe('Jane');
    expect(result.lastName).toBe('DOE');
    expect(result.name).toBe('Jane DOE');
    expect(result.email).toBe('jane.doe@example.edu');
    expect(result.phone).toBe('1234567890');
    expect(result.office).toBe('Old Main 101');
    expect(result.officeSpaceId).toBe('MAIN:101');
    expect(result.externalIds?.emails || []).toContain('jane.doe@example.edu');
  });

  it('standardizes imported schedules', () => {
    const result = standardizeImportedSchedule({
      courseCode: 'adm1300',
      section: '01 ',
      term: 'spring 2026',
      spaceDisplayNames: ['Online'],
      isOnline: true,
      instructorId: 'p1'
    });

    expect(result.courseCode).toBe('ADM 1300');
    expect(result.section).toBe('01');
    expect(result.term).toBe('Spring 2026');
    expect(result.locationType).toBe('no_room');
    expect(result.spaceDisplayNames).toEqual([]);
    expect(result.instructorIds).toEqual(['p1']);
  });

  it('standardizes imported rooms', () => {
    const result = standardizeImportedRoom({
      displayName: '  Goebel 101  ',
      buildingDisplayName: ' Goebel ',
      buildingCode: ' goebel ',
      spaceNumber: ' 101 ',
      spaceKey: '  GOEBEL:101 ',
      type: ''
    });

    expect(result.displayName).toBe('Goebel 101');
    expect(result.buildingDisplayName).toBe('Goebel');
    expect(result.buildingCode).toBe('GOEBEL');
    expect(result.spaceNumber).toBe('101');
    expect(result.spaceKey).toBe('GOEBEL:101');
    expect(result.type).toBe('Classroom');
    expect(result.updatedAt).toBeTruthy();
  });
});
