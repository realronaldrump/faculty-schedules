import { describe, expect, it } from 'vitest';

import {
  applyPersonIdentityMetadata,
  buildCanonicalCourseFromSchedule,
  buildPersonDocId,
  buildPersonIdentityIndex,
  buildPersonImportUpdates,
  resolvePersonIdentityMatch,
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

  it('derives stable person identity metadata for deterministic imports', () => {
    const result = applyPersonIdentityMetadata({
      firstName: ' Jane ',
      lastName: 'Doe',
      email: 'JANE.DOE@EXAMPLE.EDU',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    });

    expect(result.identityKey).toBe('email:6a616e652e646f65406578616d706c652e656475');
    expect(result.identityKeys).toContain('name:doe:jane');
    expect(buildPersonDocId({ primaryKey: result.identityKey })).toBe(
      'person_email_6a616e652e646f65406578616d706c652e656475'
    );
  });

  it('does not collapse distinct emails that differ only by punctuation', () => {
    const dotted = applyPersonIdentityMetadata({
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane.doe@baylor.edu'
    });
    const hyphenated = applyPersonIdentityMetadata({
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane-doe@baylor.edu'
    });

    expect(dotted.identityKey).not.toBe(hyphenated.identityKey);
    expect(buildPersonDocId({ primaryKey: dotted.identityKey })).not.toBe(
      buildPersonDocId({ primaryKey: hyphenated.identityKey })
    );
  });

  it('matches incoming people to existing canonical records by strong identity', () => {
    const existing = [
      {
        id: 'person_a',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane.doe@example.edu'
      }
    ];
    const { index } = buildPersonIdentityIndex(existing);
    const incoming = applyPersonIdentityMetadata({
      firstName: 'JANE',
      lastName: 'DOE',
      email: 'Jane.Doe@Example.edu'
    });

    const match = resolvePersonIdentityMatch(incoming, index);
    expect(match.person.id).toBe('person_a');
    expect(match.matchedKey).toBe('email:6a616e652e646f65406578616d706c652e656475');
  });

  it('flags strong identity keys that resolve to different people as ambiguous', () => {
    const { index } = buildPersonIdentityIndex([
      {
        id: 'person_a',
        firstName: 'Jane',
        lastName: 'Doe',
        baylorId: '123456789',
        email: 'jane.a@example.edu'
      },
      {
        id: 'person_b',
        firstName: 'Janet',
        lastName: 'Doe',
        baylorId: '987654321',
        email: 'jane.doe@example.edu'
      }
    ]);
    const incoming = applyPersonIdentityMetadata({
      firstName: 'Jane',
      lastName: 'Doe',
      baylorId: '123456789',
      email: 'jane.doe@example.edu'
    });

    const match = resolvePersonIdentityMatch(incoming, index);

    expect(match.ambiguous).toBe(true);
    expect(match.person).toBeNull();
    expect(match.candidates.map((person) => person.id).sort()).toEqual([
      'person_a',
      'person_b'
    ]);
  });

  it('treats Ignite person numbers as strong import identities', () => {
    const result = applyPersonIdentityMetadata({
      firstName: 'Jane',
      lastName: 'Doe',
      ignitePersonNumber: 'IG-98765',
      externalIds: {
        personNumber: '98765'
      }
    });

    expect(result.identityKey).toBe('ignite:98765');
    expect(result.identityKeys).toEqual(
      expect.arrayContaining(['ignite:98765', 'name:doe:jane']),
    );
    expect(buildPersonDocId({ primaryKey: result.identityKey })).toBe(
      'person_ignite_98765',
    );

    const { index } = buildPersonIdentityIndex([
      {
        id: 'person_a',
        externalIds: {
          ignitePersonNumber: '98765',
        },
      },
    ]);
    const match = resolvePersonIdentityMatch(result, index);

    expect(match.person.id).toBe('person_a');
    expect(match.matchedKey).toBe('ignite:98765');
  });

  it('merges imported person data deterministically without losing existing fields', () => {
    const existing = {
      id: 'person_a',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane.doe@example.edu',
      roles: ['faculty'],
      title: 'Dr'
    };
    const incoming = {
      firstName: 'Janey',
      lastName: 'Doe',
      email: 'JANE.DOE@EXAMPLE.EDU',
      phone: '(254) 555-1212',
      roles: ['staff'],
      officeSpaceIds: ['GOEBEL:101']
    };

    const { updates, merged } = buildPersonImportUpdates(existing, incoming, {
      updateTimestamp: false
    });
    expect(updates.firstName).toBeUndefined();
    expect(updates.phone).toBe('2545551212');
    expect(updates.roles.sort()).toEqual(['faculty', 'staff']);
    expect(merged.title).toBe('Dr');
    expect(merged.identityKey).toBe('email:6a616e652e646f65406578616d706c652e656475');
  });

  it('does not backfill generated default person fields during updates', () => {
    const existing = {
      id: 'person_a',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane.doe@example.edu'
    };
    const incoming = {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'JANE.DOE@EXAMPLE.EDU'
    };

    const { updates } = buildPersonImportUpdates(existing, incoming, {
      updateTimestamp: false
    });

    expect(updates).not.toHaveProperty('isFullTime');
    expect(updates).not.toHaveProperty('isActive');
    expect(updates).not.toHaveProperty('jobs');
    expect(updates).not.toHaveProperty('weeklySchedule');
    expect(updates).not.toHaveProperty('createdAt');
  });

  it('builds deterministic canonical course docs from imported schedules', () => {
    const course = buildCanonicalCourseFromSchedule({
      courseCode: 'adm1300',
      courseTitle: 'Intro to Administration',
      credits: 3,
      departmentCode: 'adm'
    });

    expect(course.id).toBe('ADM_1300');
    expect(course.data.courseCode).toBe('ADM 1300');
    expect(course.data.title).toBe('Intro to Administration');
    expect(course.data.departmentCode).toBe('ADM');
  });
});
