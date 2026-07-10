import { describe, expect, it } from 'vitest';
import { preprocessImportData } from '../importPreprocessor';

describe('importPreprocessor', () => {
  describe('preprocessImportData', () => {
    it('returns empty result for empty input', () => {
      const result = preprocessImportData([], 'schedule');

      expect(result.normalizedRows).toHaveLength(0);
      expect(result.dedupedRows).toHaveLength(0);
      expect(result.validationReport.totalRows).toBe(0);
    });

    it('normalizes schedule rows and derives identity keys', () => {
      const rows = [
        {
          Course: 'ID 4433',
          'Section #': '01',
          Term: 'Spring 2026',
          CRN: '33070',
          Instructor: 'Smith, John',
          Room: 'GOEBEL:101'
        }
      ];

      const result = preprocessImportData(rows, 'schedule', { fallbackTerm: 'Spring 2026' });

      expect(result.normalizedRows).toHaveLength(1);
      expect(result.validationReport.validRows).toBe(1);
      expect(result.validationReport.skippedRows).toBe(0);

      const normalizedRow = result.normalizedRows[0];
      expect(normalizedRow.__identityKey).toBeTruthy();
      expect(normalizedRow.__identityKeys).toBeInstanceOf(Array);
      expect(normalizedRow.baseData.courseCode).toBe('ID 4433');
    });

    it('skips rows missing course code', () => {
      const rows = [
        {
          Course: '',
          'Section #': '01',
          Term: 'Spring 2026',
          CRN: '33070'
        }
      ];

      const result = preprocessImportData(rows, 'schedule', { fallbackTerm: 'Spring 2026' });

      expect(result.normalizedRows).toHaveLength(0);
      expect(result.validationReport.skippedRows).toBe(1);
      expect(result.validationReport.warnings.some(w => w.message.includes('missing course code'))).toBe(true);
    });

    it('detects within-batch duplicates', () => {
      const rows = [
        {
          Course: 'ID 4433',
          'Section #': '01',
          Term: 'Spring 2026',
          CRN: '33070',
          Instructor: 'Smith, John'
        },
        {
          Course: 'ID 4433',
          'Section #': '01',
          Term: 'Spring 2026',
          CRN: '33070',
          Instructor: 'Smith, John'
        }
      ];

      const result = preprocessImportData(rows, 'schedule', { fallbackTerm: 'Spring 2026' });

      // Both rows are valid, but they're duplicates
      expect(result.normalizedRows).toHaveLength(2);
      // After deduplication, should have only 1
      expect(result.dedupedRows).toHaveLength(1);
      expect(result.validationReport.withinBatchDuplicates).toBe(1);
      expect(result.validationReport.warnings.some(w => w.type === 'within_batch_duplicate')).toBe(true);
    });

    it('merges duplicate rows keeping most complete data', () => {
      const rows = [
        {
          Course: 'ID 4433',
          'Section #': '01',
          Term: 'Spring 2026',
          CRN: '33070',
          Instructor: 'Smith, John',
          'Course Title': 'Short Title'
        },
        {
          Course: 'ID 4433',
          'Section #': '01',
          Term: 'Spring 2026',
          CRN: '33070',
          Instructor: 'Smith, John',
          'Course Title': 'A Much Longer and More Complete Course Title'
        }
      ];

      const result = preprocessImportData(rows, 'schedule', { fallbackTerm: 'Spring 2026' });

      expect(result.dedupedRows).toHaveLength(1);
      // Should keep the longer course title
      expect(result.dedupedRows[0].baseData.courseTitle).toBe('A Much Longer and More Complete Course Title');
    });

    it('merges schedule rows when any stable identity key overlaps', () => {
      const rows = [
        {
          Course: 'ID 4433',
          'Section #': '01',
          Term: 'Spring 2026',
          'CLSS ID': '2962',
          CRN: '33070',
          Instructor: 'Smith, John'
        },
        {
          Course: 'ID 4433',
          'Section #': '01',
          Term: 'Spring 2026',
          CRN: '33070',
          Instructor: 'Smith, John'
        }
      ];

      const result = preprocessImportData(rows, 'schedule', { fallbackTerm: 'Spring 2026' });

      expect(result.dedupedRows).toHaveLength(1);
      expect(result.validationReport.withinBatchDuplicates).toBe(1);
      expect(result.dedupedRows[0].__identityKeys).toEqual(
        expect.arrayContaining(['clss:202610:2962', 'crn:202610:33070'])
      );
    });

    it('preserves the strongest identity fields when a richer row becomes the merge base', () => {
      const rows = [
        {
          Course: 'TEST 1000',
          'Section #': '01',
          Term: 'Spring 2026',
          'CLSS ID': 'CLSS-1',
          CRN: '12345',
          Instructor: 'Doe, Jane'
        },
        {
          Course: 'TEST 1000',
          'Section #': '01',
          Term: 'Spring 2026',
          CRN: '12345',
          Instructor: 'Doe, Jane',
          'Course Title': 'A detailed course title',
          'Meeting Pattern': 'MWF 9am-9:50am',
          Room: 'Goebel 101',
          Enrollment: '25',
          'Maximum Enrollment': '30',
          Credits: '3'
        }
      ];

      const result = preprocessImportData(rows, 'schedule', {
        fallbackTerm: 'Spring 2026'
      });
      const merged = result.dedupedRows[0];

      expect(merged.baseData.clssId).toBe('CLSS-1');
      expect(merged.baseData.crn).toBe('12345');
      expect(merged.__identityKey).toBe('clss:202610:CLSS_1');
      expect(merged.__identitySource).toBe('clss');
    });

    it('keeps overlapping schedule rows separate when their CRNs conflict', () => {
      const rows = [
        {
          Course: 'ID 4433',
          'Section #': '01',
          Term: 'Spring 2026',
          CRN: '33070',
          Instructor: 'Smith, John'
        },
        {
          Course: 'ID 4433',
          'Section #': '01',
          Term: 'Spring 2026',
          CRN: '33071',
          Instructor: 'Smith, John'
        }
      ];

      const result = preprocessImportData(rows, 'schedule', { fallbackTerm: 'Spring 2026' });

      expect(result.dedupedRows).toHaveLength(2);
      expect(result.validationReport.withinBatchDuplicates).toBe(0);
      expect(result.validationReport.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'conflicting_within_batch_identity' })
        ])
      );
    });

    it('merges instructor identities by Baylor ID even when formatted with non-digits', () => {
      const rows = [
        {
          Course: 'ID 4433',
          'Section #': '01',
          Term: 'Spring 2026',
          CRN: '33070',
          Instructor: 'Smith, John (123-456-789) [Primary, 100%]'
        },
        {
          Course: 'ID 4433',
          'Section #': '01',
          Term: 'Spring 2026',
          CRN: '33070',
          Instructor: 'Smith, John (123456789) [50%]'
        }
      ];

      const result = preprocessImportData(rows, 'schedule', { fallbackTerm: 'Spring 2026' });

      expect(result.dedupedRows).toHaveLength(1);
      const merged = result.dedupedRows[0].baseData;
      expect(Array.isArray(merged.parsedInstructors)).toBe(true);
      expect(merged.parsedInstructors).toHaveLength(1);
      expect(merged.instructorBaylorId).toBe('123456789');
    });

    it('processes directory import rows', () => {
      const rows = [
        {
          'First Name': 'John',
          'Last Name': 'Smith',
          'E-mail': 'john.smith@example.com'
        }
      ];

      const result = preprocessImportData(rows, 'directory');

      expect(result.normalizedRows).toHaveLength(1);
      expect(result.validationReport.validRows).toBe(1);
      expect(result.normalizedRows[0].__email).toBe('john.smith@example.com');
    });

    it('detects directory duplicates by email', () => {
      const rows = [
        {
          'First Name': 'John',
          'Last Name': 'Smith',
          'E-mail': 'john.smith@example.com'
        },
        {
          'First Name': 'Johnny',
          'Last Name': 'Smith',
          'E-mail': 'john.smith@example.com'
        }
      ];

      const result = preprocessImportData(rows, 'directory');

      expect(result.normalizedRows).toHaveLength(2);
      expect(result.dedupedRows).toHaveLength(1);
      expect(result.validationReport.withinBatchDuplicates).toBe(1);
      expect(result.dedupedRows[0].baseData.email).toBe('john.smith@example.com');
      expect(result.validationReport.warnings.some(w => w.type === 'within_batch_duplicate')).toBe(true);
    });

    it('merges directory rows when a non-primary strong identity key overlaps', () => {
      const rows = [
        {
          'First Name': 'John',
          'Last Name': 'Smith',
          'Baylor ID': '123-456-789',
          'E-mail': 'john.smith@example.com'
        },
        {
          'First Name': 'John',
          'Last Name': 'Smith',
          'E-mail': 'john.smith@example.com',
          Phone: '(254) 555-1212'
        }
      ];

      const result = preprocessImportData(rows, 'directory');

      expect(result.dedupedRows).toHaveLength(1);
      expect(result.validationReport.withinBatchDuplicates).toBe(1);
      expect(result.dedupedRows[0].baseData.baylorId).toBe('123456789');
      expect(result.dedupedRows[0].baseData.phone).toBe('2545551212');
    });

    it('keeps overlapping directory rows separate when Baylor IDs conflict', () => {
      const rows = [
        {
          'First Name': 'John',
          'Last Name': 'Smith',
          'Baylor ID': '123-456-789',
          'E-mail': 'john.smith@example.com'
        },
        {
          'First Name': 'John',
          'Last Name': 'Smith',
          'Baylor ID': '987-654-321',
          'E-mail': 'john.smith@example.com'
        }
      ];

      const result = preprocessImportData(rows, 'directory');

      expect(result.dedupedRows).toHaveLength(2);
      expect(result.validationReport.withinBatchDuplicates).toBe(0);
      expect(result.validationReport.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'conflicting_within_batch_identity' })
        ])
      );
    });

    it('keeps every row in a contradictory overlap component separate', () => {
      const rows = [
        {
          'First Name': 'John',
          'Last Name': 'Smith',
          'Baylor ID': '123-456-789',
          'E-mail': 'john.smith@example.com'
        },
        {
          'First Name': 'Johnny',
          'Last Name': 'Smith',
          'Baylor ID': '987-654-321',
          'E-mail': 'john.smith@example.com'
        },
        {
          'First Name': 'J',
          'Last Name': 'Smith',
          'E-mail': 'john.smith@example.com'
        }
      ];

      const result = preprocessImportData(rows, 'directory');

      expect(result.dedupedRows).toHaveLength(3);
      expect(result.validationReport.withinBatchDuplicates).toBe(0);
      expect(result.validationReport.errors).toEqual([
        expect.objectContaining({
          type: 'conflicting_within_batch_identity',
          rowIndexes: [1, 2, 3],
          conflictingTypes: expect.arrayContaining(['baylor'])
        })
      ]);
    });

    it('keeps same-name directory rows separate when no strong identifier exists', () => {
      const rows = [
        {
          'First Name': 'John',
          'Last Name': 'Smith'
        },
        {
          'First Name': 'John',
          'Last Name': 'Smith'
        }
      ];

      const result = preprocessImportData(rows, 'directory');

      expect(result.normalizedRows).toHaveLength(2);
      expect(result.dedupedRows).toHaveLength(2);
      expect(result.validationReport.withinBatchDuplicates).toBe(0);
      expect(result.validationReport.warnings.some(w => w.type === 'possible_within_batch_duplicate')).toBe(true);
    });

    it('keeps directory rows that are identified only by Baylor ID', () => {
      const rows = [
        {
          'Baylor ID': '123-456-789',
          Phone: '(254) 555-1212'
        }
      ];

      const result = preprocessImportData(rows, 'directory');

      expect(result.normalizedRows).toHaveLength(1);
      expect(result.dedupedRows).toHaveLength(1);
      expect(result.dedupedRows[0].baseData.baylorId).toBe('123456789');
      expect(result.dedupedRows[0].__identityKey).toBe('baylor:123456789');
    });

    it('accepts directory header aliases used by the import wizard', () => {
      const rows = [
        {
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'JANE.DOE@EXAMPLE.COM',
          BaylorID: '123-456-789',
          InstructorID: 'CLSS.1'
        }
      ];

      const result = preprocessImportData(rows, 'directory');

      expect(result.normalizedRows).toHaveLength(1);
      expect(result.validationReport.skippedRows).toBe(0);
      expect(result.dedupedRows[0].baseData.firstName).toBe('Jane');
      expect(result.dedupedRows[0].baseData.lastName).toBe('Doe');
      expect(result.dedupedRows[0].baseData.email).toBe('jane.doe@example.com');
      expect(result.dedupedRows[0].baseData.baylorId).toBe('123456789');
      expect(result.dedupedRows[0].baseData.externalIds.clssInstructorId).toBe('CLSS.1');
    });

    it('deduplicates directory rows by Ignite person number', () => {
      const rows = [
        {
          'First Name': 'Jane',
          'Last Name': 'Doe',
          'Person Number': 'IG-98765'
        },
        {
          firstName: 'Jane',
          lastName: 'Doe',
          ignitePersonNumber: '98765',
          Phone: '(254) 555-1212'
        }
      ];

      const result = preprocessImportData(rows, 'directory');

      expect(result.normalizedRows).toHaveLength(2);
      expect(result.dedupedRows).toHaveLength(1);
      expect(result.validationReport.withinBatchDuplicates).toBe(1);
      expect(result.dedupedRows[0].baseData.ignitePersonNumber).toBe('98765');
      expect(result.dedupedRows[0].baseData.phone).toBe('2545551212');
      expect(result.dedupedRows[0].__identityKey).toBe('ignite:98765');
    });

    it('accepts legacy Ignite header aliases before directory deduplication', () => {
      const rows = [
        {
          firstName: 'Jane',
          lastName: 'Doe',
          igniteId: 'IG-98765'
        },
        {
          firstName: 'Jane',
          lastName: 'Doe',
          person_number: '98765'
        }
      ];

      const result = preprocessImportData(rows, 'directory');

      expect(result.normalizedRows).toHaveLength(2);
      expect(result.dedupedRows).toHaveLength(1);
      expect(result.dedupedRows[0].baseData.ignitePersonNumber).toBe('98765');
      expect(result.dedupedRows[0].__identityKey).toBe('ignite:98765');
    });
  });
});
