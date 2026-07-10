import { describe, expect, it } from 'vitest';
import {
  assertNoBlockingPreprocessErrors,
  getBlockingPreprocessErrors,
  validateImportTransaction
} from '../importValidationUtils';

// Mock transaction factory
const createMockTransaction = (schedules = [], people = [], rooms = []) => ({
  changes: {
    schedules: {
      added: schedules.map((s, i) => ({
        id: `change_schedule_${i}`,
        newData: s
      })),
      modified: [],
      deleted: []
    },
    people: {
      added: people.map((p, i) => ({
        id: `change_person_${i}`,
        newData: p
      })),
      modified: [],
      deleted: []
    },
    rooms: {
      added: rooms.map((r, i) => ({
        id: `change_room_${i}`,
        newData: r
      })),
      modified: [],
      deleted: []
    }
  },
  matchingIssues: [],
  validation: { errors: [], warnings: [] }
});

describe('importValidationUtils', () => {
  describe('getBlockingPreprocessErrors', () => {
    it('normalizes structured and string preprocessing errors', () => {
      expect(getBlockingPreprocessErrors({
        preprocessReport: {
          errors: [
            { message: ' Conflicting identity keys ' },
            ' Invalid source row ',
            {},
          ]
        }
      })).toEqual(['Conflicting identity keys', 'Invalid source row']);
    });

    it('does not treat preview warnings or schema validation errors as preprocessing blockers', () => {
      expect(getBlockingPreprocessErrors({
        preprocessReport: { warnings: [{ message: 'Possible duplicate' }] },
        validation: { errors: ['A deselectable generated change is invalid'] }
      })).toEqual([]);
    });

    it('rejects commit validation before writes when preprocessing errors exist', () => {
      expect(() => assertNoBlockingPreprocessErrors({
        preprocessReport: {
          errors: [
            { message: 'Rows 1 and 2 have conflicting Baylor IDs' },
            { message: 'Rows 3 and 4 have conflicting CRNs' },
          ]
        }
      })).toThrow(
        /Cannot commit import: preprocessing found 2 blocking errors.*conflicting Baylor IDs.*conflicting CRNs/,
      );
    });
  });

  describe('validateImportTransaction', () => {
    it('returns valid for transaction with valid schedules', () => {
      const transaction = createMockTransaction([
        {
          courseCode: 'ID 4433',
          sectionNumber: '01', // canonicalSchema uses sectionNumber
          termCode: '202610',
          term: 'Spring 2026',
          crn: '33070'
        }
      ]);

      const result = validateImportTransaction(transaction, {});

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns errors for schedules missing required fields', () => {
      const transaction = createMockTransaction([
        {
          courseCode: '', // Missing course code
          section: '01',
          termCode: '202610'
        }
      ]);

      const result = validateImportTransaction(transaction, {});

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.message.toLowerCase().includes('course code'))).toBe(true);
    });

    it('returns errors for people missing identity fields', () => {
      const nowISO = '2026-02-05T00:00:00.000Z';
      const transaction = createMockTransaction([], [
        {
          firstName: 'John',
          lastName: 'Smith',
          createdAt: nowISO,
          updatedAt: nowISO,
          // Missing: clssInstructorId, baylorId, email - invalid
        }
      ]);

      const result = validateImportTransaction(transaction, {});

      expect(result.isValid).toBe(false);
      expect(
        result.errors.some(e => e.message.toLowerCase().includes('external identifier'))
      ).toBe(true);
    });

    it('returns errors for people missing name', () => {
      // canonicalSchema requires at least firstName or lastName
      const transaction = createMockTransaction([], [
        {
          email: 'test@example.com',
          createdAt: '2026-02-05T00:00:00.000Z',
          updatedAt: '2026-02-05T00:00:00.000Z'
          // Missing: firstName and lastName
        }
      ]);

      const result = validateImportTransaction(transaction, {});

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e =>
        e.collection === 'people' && e.message.toLowerCase().includes('name')
      )).toBe(true);
    });

    it('returns errors for rooms missing required fields', () => {
      const transaction = createMockTransaction([], [], [
        {
          displayName: 'Some Room'
          // Missing: buildingCode, spaceNumber, spaceKey
        }
      ]);

      const result = validateImportTransaction(transaction, {});

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.collection === 'rooms')).toBe(true);
    });

    it('warns about orphaned instructor references', () => {
      const transaction = createMockTransaction([
        {
          courseCode: 'ID 4433',
          section: '01',
          termCode: '202610',
          instructorId: 'nonexistent_person_123',
          instructorIds: ['nonexistent_person_123']
        }
      ]);

      const result = validateImportTransaction(transaction, {
        people: [], // No existing people
        schedules: [],
        rooms: []
      });

      // Orphaned references are warnings, not errors
      expect(result.warnings.some(w =>
        w.type === 'orphaned_reference' && w.message.includes('unknown instructor')
      )).toBe(true);
    });

    it('does not warn about instructor references that exist', () => {
      const transaction = createMockTransaction([
        {
          courseCode: 'ID 4433',
          section: '01',
          termCode: '202610',
          instructorId: 'person_123',
          instructorIds: ['person_123']
        }
      ]);

      const result = validateImportTransaction(transaction, {
        people: [{ id: 'person_123', firstName: 'John', lastName: 'Smith' }],
        schedules: [],
        rooms: []
      });

      expect(result.warnings.filter(w => w.type === 'orphaned_reference')).toHaveLength(0);
    });

    it('does not warn about instructor references resolved by a pending person match', () => {
      const nowISO = '2026-02-05T00:00:00.000Z';
      const transaction = createMockTransaction(
        [
          {
            courseCode: 'ID 4433',
            section: '01',
            termCode: '202610',
            instructorMatchIssueIds: ['match_person_1']
          }
        ],
        [
          {
            firstName: 'Jane',
            lastName: 'Doe',
            email: 'jane@example.com',
            createdAt: nowISO,
            updatedAt: nowISO,
          }
        ]
      );
      transaction.matchingIssues = [
        {
          id: 'match_person_1',
          pendingPersonChangeId: 'change_person_0'
        }
      ];

      const result = validateImportTransaction(transaction, {
        people: [],
        schedules: [],
        rooms: []
      });

      expect(result.warnings.filter(w =>
        w.type === 'orphaned_reference'
      )).toHaveLength(0);
    });

    it('warns when an imported schedule creates a real teaching conflict', () => {
      const transaction = createMockTransaction([
        {
          identityKey: 'crn:202610:33070',
          courseCode: 'ID 4433',
          section: '01',
          termCode: '202610',
          instructorId: 'person_123',
          instructorIds: ['person_123'],
          meetingPatterns: [{ day: 'M', startTime: '09:30', endTime: '10:45' }]
        }
      ]);

      const result = validateImportTransaction(transaction, {
        people: [{ id: 'person_123', firstName: 'John', lastName: 'Smith' }],
        rooms: [],
        schedules: [
          {
            id: 'existing_schedule',
            identityKey: 'crn:202610:11111',
            courseCode: 'ID 1300',
            section: '02',
            termCode: '202610',
            instructorId: 'person_123',
            instructorIds: ['person_123'],
            meetingPatterns: [{ day: 'M', startTime: '09:00', endTime: '10:00' }]
          }
        ]
      });

      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'potential_teaching_conflict',
            message: expect.stringContaining('ID 1300')
          })
        ])
      );
    });

    it('warns when a schedule modification creates a teaching conflict', () => {
      const transaction = createMockTransaction();
      transaction.changes.schedules.modified.push({
        id: 'change_schedule_modified',
        originalData: {
          id: 'modified_schedule',
          identityKey: 'crn:202610:33070',
          courseCode: 'ID 4433',
          section: '01',
          termCode: '202610',
          instructorId: 'person_123',
          instructorIds: ['person_123'],
          meetingPatterns: [{ day: 'M', startTime: '11:00', endTime: '12:00' }]
        },
        newData: {
          meetingPatterns: [{ day: 'M', startTime: '09:30', endTime: '10:45' }]
        }
      });

      const result = validateImportTransaction(transaction, {
        people: [{ id: 'person_123', firstName: 'John', lastName: 'Smith' }],
        rooms: [],
        schedules: [
          {
            id: 'modified_schedule',
            identityKey: 'crn:202610:33070',
            courseCode: 'ID 4433',
            section: '01',
            termCode: '202610',
            instructorId: 'person_123',
            meetingPatterns: [{ day: 'M', startTime: '11:00', endTime: '12:00' }]
          },
          {
            id: 'existing_schedule',
            identityKey: 'crn:202610:11111',
            courseCode: 'ID 1300',
            section: '02',
            termCode: '202610',
            instructorId: 'person_123',
            meetingPatterns: [{ day: 'M', startTime: '09:00', endTime: '10:00' }]
          }
        ]
      });

      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'potential_teaching_conflict' })
        ])
      );
    });

    it('schema-validates merged modified records', () => {
      const transaction = createMockTransaction();
      transaction.changes.schedules.modified.push({
        id: 'change_schedule_modified',
        originalData: {
          courseCode: 'ID 4433',
          section: '01',
          termCode: '202610'
        },
        newData: { courseCode: '' }
      });
      transaction.changes.people.modified.push({
        id: 'change_person_modified',
        originalData: {
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@example.com',
          createdAt: '2026-02-05T00:00:00.000Z',
          updatedAt: '2026-02-05T00:00:00.000Z'
        },
        newData: { firstName: '', lastName: '' }
      });
      transaction.changes.rooms.modified.push({
        id: 'change_room_modified',
        originalData: {
          buildingCode: 'GOEBEL',
          spaceNumber: '101',
          spaceKey: 'GOEBEL:101'
        },
        newData: { spaceKey: '' }
      });

      const result = validateImportTransaction(transaction, {});

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ changeId: 'change_schedule_modified', collection: 'schedules' }),
          expect.objectContaining({ changeId: 'change_person_modified', collection: 'people' }),
          expect.objectContaining({ changeId: 'change_room_modified', collection: 'rooms' })
        ])
      );
      expect(result.summary).toEqual(
        expect.objectContaining({
          schedulesInvalid: 1,
          peopleInvalid: 1,
          roomsInvalid: 1
        })
      );
    });

    it('allows a legacy person without createdAt to receive a valid update', () => {
      const transaction = createMockTransaction();
      transaction.changes.people.modified.push({
        id: 'change_person_legacy',
        originalData: {
          id: 'person-legacy',
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@example.com'
        },
        newData: {
          phone: '2545551212',
          updatedAt: '2026-07-10T00:00:00.000Z'
        }
      });

      const result = validateImportTransaction(transaction, {});

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('builds correct summary', () => {
      const nowISO = '2026-02-05T00:00:00.000Z';
      const transaction = createMockTransaction(
        [
          { courseCode: 'ID 4433', sectionNumber: '01', termCode: '202610' },
          { courseCode: '', sectionNumber: '02', termCode: '202610' } // Invalid - missing courseCode
        ],
        [
          {
            firstName: 'John',
            lastName: 'Smith',
            email: 'john@example.com',
            createdAt: nowISO,
            updatedAt: nowISO,
          }
        ],
        [
          { buildingCode: 'GOEBEL', spaceNumber: '101', spaceKey: 'GOEBEL:101' }
        ]
      );

      const result = validateImportTransaction(transaction, {});

      expect(result.summary.schedulesValid).toBe(1);
      expect(result.summary.schedulesInvalid).toBe(1);
      expect(result.summary.peopleValid).toBe(1);
      expect(result.summary.roomsValid).toBe(1);
    });

    it('fails validation when people:add is missing createdAt', () => {
      const transaction = createMockTransaction([], [
        {
          id: 'person_1',
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@example.com',
          // createdAt missing
          updatedAt: '2026-02-05T00:00:00.000Z',
        }
      ]);

      const result = validateImportTransaction(transaction, {});

      expect(result.isValid).toBe(false);
      expect(
        result.errors.some(e => e.collection === 'people' && e.message.toLowerCase().includes('createdat'))
      ).toBe(true);
    });
  });
});
