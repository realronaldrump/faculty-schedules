import { describe, expect, it } from 'vitest';

const {
  standardizePerson,
  standardizeSchedule,
  detectPeopleDuplicates,
  detectScheduleDuplicates,
  detectRoomDuplicates,
  detectTeachingConflicts,
  mergePeopleData
} = await import('../hygieneCore');
const { buildLinkedSchedulePairSet } = await import('../scheduleLinkUtils');
const { applyBuildingConfig } = await import('../locationService');

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

  it('normalizes student building names using building config', () => {
    applyBuildingConfig({
      version: 1,
      buildings: [
        { code: 'GOEBEL', displayName: 'Goebel Building', aliases: ['Goebel'] }
      ]
    });

    const input = {
      roles: ['student'],
      primaryBuildings: ['Goebel', 'Goebel Building'],
      primaryBuilding: 'Goebel',
      jobs: [{ location: ['Goebel'] }],
      semesterSchedules: {
        'Spring 2026': {
          primaryBuilding: 'Goebel',
          jobs: [{ location: ['Goebel'] }],
          weeklySchedule: []
        }
      }
    };

    const result = standardizePerson(input, { updateTimestamp: false });
    expect(result.primaryBuildings).toEqual(['Goebel Building']);
    expect(result.primaryBuilding).toBe('Goebel Building');
    expect(result.jobs[0].location).toEqual(['Goebel Building']);
    expect(result.semesterSchedules['Spring 2026'].primaryBuilding).toBe('Goebel Building');
    expect(result.semesterSchedules['Spring 2026'].jobs[0].location).toEqual(['Goebel Building']);
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

  it('normalizes Ignite numbers and detects exact Ignite duplicates', () => {
    const standardized = standardizePerson(
      {
        firstName: 'Jane',
        lastName: 'Doe',
        ignitePersonNumber: 'IG-98765',
      },
      { updateTimestamp: false },
    );

    expect(standardized.ignitePersonNumber).toBe('98765');
    expect(standardized.externalIds.ignitePersonNumber).toBe('98765');
    expect(standardized.externalIds.personNumber).toBe('98765');

    const duplicates = detectPeopleDuplicates([
      { id: 'a', firstName: 'Jane', lastName: 'Doe', ignitePersonId: '98765' },
      {
        id: 'b',
        firstName: 'Jane',
        lastName: 'Doe',
        externalIds: { igniteId: 'IG-98765' },
      },
    ]);

    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].type).toBe('ignitePersonNumber');
    expect(duplicates[0].confidence).toBe(1);
  });

  it('stores missing Baylor IDs as null and mirrors non-null values externally', () => {
    const missing = standardizePerson(
      {
        firstName: 'No',
        lastName: 'Id',
        baylorId: '   ',
        externalIds: { baylorId: '123456789' },
      },
      { updateTimestamp: false },
    );

    expect(missing.baylorId).toBeNull();
    expect(missing.externalIds.baylorId).toBeNull();

    const assigned = standardizePerson(
      {
        firstName: 'Has',
        lastName: 'Id',
        baylorId: '123-456-789',
      },
      { updateTimestamp: false },
    );

    expect(assigned.baylorId).toBe('123456789');
    expect(assigned.externalIds.baylorId).toBe('123456789');
  });

  it('allows multiple null Baylor IDs while still detecting duplicate non-null IDs', () => {
    const duplicates = detectPeopleDuplicates([
      { id: 'a', firstName: 'A', lastName: 'One', baylorId: null },
      { id: 'b', firstName: 'B', lastName: 'Two', externalIds: { baylorId: null } },
      { id: 'c', firstName: 'C', lastName: 'Three', baylorId: '123456789' },
      { id: 'd', firstName: 'D', lastName: 'Four', externalIds: { baylorId: '123456789' } },
    ]);

    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].type).toBe('baylorId');
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

  it('builds linked schedule pair sets', () => {
    const schedules = [
      { id: 's1', linkGroupId: 'g1' },
      { id: 's2', linkGroupId: 'g1' },
      { id: 's3', linkGroupId: 'g1' },
      { id: 's4', linkGroupId: 'g2' }
    ];

    const pairs = buildLinkedSchedulePairSet(schedules);
    expect(pairs.has('s1__s2')).toBe(true);
    expect(pairs.has('s1__s3')).toBe(true);
    expect(pairs.has('s2__s3')).toBe(true);
    expect(pairs.has('s1__s4')).toBe(false);
  });

  it('skips schedule duplicates when blockedPairs include linked pairs', () => {
    const schedules = [
      { id: 's1', crn: '12345', term: 'Fall 2025', courseCode: 'ADM 1300', section: '01' },
      { id: 's2', crn: '12345', term: 'Fall 2025', courseCode: 'ADM 1300', section: '02' }
    ];

    const duplicates = detectScheduleDuplicates(schedules, { blockedPairs: new Set(['s1__s2']) });
    expect(duplicates).toHaveLength(0);
  });

  it('skips teaching conflicts when blockedSchedulePairs include linked pairs', () => {
    const schedules = [
      {
        id: 's1',
        instructorId: 'p1',
        term: 'Fall 2025',
        meetingPatterns: [{ day: 'M', startTime: '9:00 AM', endTime: '10:00 AM' }]
      },
      {
        id: 's2',
        instructorId: 'p1',
        term: 'Fall 2025',
        meetingPatterns: [{ day: 'M', startTime: '9:30 AM', endTime: '10:30 AM' }]
      }
    ];

    const conflicts = detectTeachingConflicts(schedules, {
      blockedSchedulePairs: new Set(['s1__s2'])
    });
    expect(conflicts).toHaveLength(0);
  });

  it('reports an overlapping schedule pair only once across multiple patterns', () => {
    const schedules = [
      {
        id: 's1',
        instructorId: 'p1',
        term: 'Fall 2025',
        meetingPatterns: [
          { day: 'M', startTime: '9:00 AM', endTime: '10:00 AM' },
          { day: 'M', startTime: '9:15 AM', endTime: '10:15 AM' }
        ]
      },
      {
        id: 's2',
        instructorId: 'p1',
        term: 'Fall 2025',
        meetingPatterns: [
          { day: 'M', startTime: '9:30 AM', endTime: '10:30 AM' }
        ]
      }
    ];

    const conflicts = detectTeachingConflicts(schedules);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].schedules.map((schedule) => schedule.id)).toEqual([
      's1',
      's2'
    ]);
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
