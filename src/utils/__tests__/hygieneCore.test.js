import { describe, expect, it } from 'vitest';

const {
  standardizePerson,
  standardizeSchedule,
  detectPeopleDuplicates,
  detectScheduleDuplicates,
  detectRoomDuplicates,
  mergePeopleData
} = await import('../hygieneCore');

describe('hygieneCore', () => {
  it('standardizes basic person fields and parses names', () => {
    const input = {
      name: 'Dr Jane Doe',
      email: 'JANE.DOE@EXAMPLE.EDU',
      phone: '(123) 456-7890',
      roles: { faculty: true, staff: false }
    };

    const result = standardizePerson(input, { updateTimestamp: false });
    expect(result.firstName).toBe('Jane');
    expect(result.lastName).toBe('Doe');
    expect(result.title).toBe('Dr');
    expect(result.email).toBe('jane.doe@example.edu');
    expect(result.phone).toBe('1234567890');
    expect(result.roles).toEqual(['faculty']);
  });

  it('clears tenure when a person is adjunct', () => {
    const input = {
      isAdjunct: true,
      isTenured: true,
      roles: ['faculty']
    };

    const result = standardizePerson(input, { updateTimestamp: false });
    expect(result.isAdjunct).toBe(true);
    expect(result.isTenured).toBe(false);
  });

  it('detects people duplicates and orders by completeness', () => {
    const people = [
      { id: 'a', firstName: 'Sam', lastName: 'Lee', email: 'sam@example.edu' },
      { id: 'b', firstName: 'Samuel', lastName: 'Lee', email: 'sam@example.edu', phone: '9999999999', jobTitle: 'Professor' }
    ];

    const duplicates = detectPeopleDuplicates(people);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].type).toBe('email');
    expect(duplicates[0].records[0].id).toBe('b');
  });

  it('respects blocked duplicate pairs', () => {
    const people = [
      { id: 'a', firstName: 'Sam', lastName: 'Lee', email: 'sam@example.edu' },
      { id: 'b', firstName: 'Samuel', lastName: 'Lee', email: 'sam@example.edu' }
    ];

    const duplicates = detectPeopleDuplicates(people, { blockedPairs: new Set(['a__b']) });
    expect(duplicates).toHaveLength(0);
  });

  it('flags fuzzy name duplicates', () => {
    const people = [
      { id: 'a', firstName: 'John', lastName: 'Smith' },
      { id: 'b', firstName: 'John A', lastName: 'Smith' }
    ];

    const duplicates = detectPeopleDuplicates(people);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].type).toBe('fuzzy_name');
  });

  it('detects schedule duplicates by CRN+term', () => {
    const schedules = [
      { id: 's1', crn: '12345', term: 'Fall 2025', courseCode: 'ADM 1300', section: '01', instructorId: 'p1' },
      { id: 's2', crn: '12345', term: 'Fall 2025', courseCode: 'ADM 1300', section: '01', instructorId: 'p2' }
    ];

    const duplicates = detectScheduleDuplicates(schedules);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].type).toBe('crn');
  });

  it('standardizes schedules with no-room and instructor ids', () => {
    const input = {
      courseCode: 'ADM 1300',
      section: '01',
      term: 'Spring 2026',
      spaceDisplayNames: ['Online'],
      isOnline: true,
      instructorId: 'p1'
    };

    const result = standardizeSchedule(input);
    expect(result.locationType).toBe('no_room');
    expect(result.locationLabel).toBe('No Room Needed');
    expect(result.spaceDisplayNames).toEqual([]);
    expect(result.instructorIds).toEqual(['p1']);
    expect(result.instructorAssignments[0].personId).toBe('p1');
  });

  it('detects room duplicates', () => {
    const rooms = [
      { id: 'r1', displayName: 'Goebel 101', spaceKey: 'GOEBEL:101' },
      { id: 'r2', displayName: 'Goebel 101', spaceKey: 'GOEBEL:101' }
    ];

    const duplicates = detectRoomDuplicates(rooms);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].type).toBe('room_name');
  });

  it('merges people data with role and external id unions', () => {
    const primary = {
      id: 'p1',
      firstName: 'Alice',
      lastName: 'Jones',
      roles: ['faculty'],
      externalIds: { emails: ['alice@baylor.edu'] }
    };
    const secondary = {
      id: 'p2',
      roles: { staff: true },
      externalIds: { emails: ['alice.jones@baylor.edu'] },
      baylorId: '000123456'
    };

    const merged = mergePeopleData(primary, secondary);
    expect(merged.roles.sort()).toEqual(['faculty', 'staff']);
    expect(merged.externalIds.emails).toEqual(
      expect.arrayContaining(['alice@baylor.edu', 'alice.jones@baylor.edu'])
    );
    expect(merged.baylorId).toBe('000123456');
  });
});
