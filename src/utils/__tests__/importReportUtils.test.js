import { describe, expect, it } from 'vitest';
import {
  generateImportReport,
  formatImportReportForLog
} from '../importReportUtils';

// Mock transaction factory
const createMockTransaction = (overrides = {}) => ({
  id: 'import_test_123',
  timestamp: '2026-01-15T10:30:00.000Z',
  semester: 'Spring 2026',
  type: 'schedule',
  status: 'committed',
  description: 'Test import',
  stats: {
    totalChanges: 10,
    schedulesAdded: 5,
    peopleAdded: 2,
    roomsAdded: 1,
    peopleModified: 2
  },
  changes: {
    schedules: {
      added: Array(5).fill({ newData: { courseCode: 'TEST' } }),
      modified: Array(3).fill({ newData: {}, originalData: {} }),
      deleted: []
    },
    people: {
      added: Array(2).fill({ newData: { firstName: 'Test' } }),
      modified: Array(2).fill({ newData: {}, originalData: {} }),
      deleted: []
    },
    rooms: {
      added: Array(1).fill({ newData: { spaceKey: 'TEST:101' } }),
      modified: [],
      deleted: []
    }
  },
  matchingIssues: [],
  validation: { errors: [], warnings: [] },
  previewSummary: {
    rowsProcessed: 100,
    rowsValid: 95,
    rowsSkipped: 5,
    schedulesUnchanged: 50
  },
  importMetadata: {
    fileHash: 'abc123',
    rowCount: 100
  },
  preprocessReport: {
    totalRows: 100,
    validRows: 95,
    skippedRows: 5,
    withinBatchDuplicates: 0,
    warnings: [],
    errors: []
  },
  rowLineage: Array(100).fill({ action: 'add' }),
  ...overrides
});

describe('importReportUtils', () => {
  describe('generateImportReport', () => {
    it('returns error for null transaction', () => {
      const report = generateImportReport(null);
      expect(report.error).toBe('No transaction provided');
    });

    it('generates complete report structure', () => {
      const transaction = createMockTransaction();
      const report = generateImportReport(transaction);

      expect(report.id).toBe('import_test_123');
      expect(report.semester).toBe('Spring 2026');
      expect(report.status).toBe('committed');
      expect(report.summary).toBeDefined();
      expect(report.normalization).toBeDefined();
      expect(report.duplicatePrevention).toBeDefined();
      expect(report.validation).toBeDefined();
      expect(report.matchResolution).toBeDefined();
      expect(report.lineage).toBeDefined();
    });

    it('calculates summary correctly', () => {
      const transaction = createMockTransaction();
      const report = generateImportReport(transaction);

      expect(report.summary.schedulesAdded).toBe(5);
      expect(report.summary.schedulesModified).toBe(3);
      expect(report.summary.schedulesUnchanged).toBe(50);
      expect(report.summary.peopleAdded).toBe(2);
      expect(report.summary.roomsAdded).toBe(1);
    });

    it('captures normalization stats', () => {
      const transaction = createMockTransaction();
      const report = generateImportReport(transaction);

      expect(report.normalization.rowsProcessed).toBe(100);
      expect(report.normalization.rowsValid).toBe(95);
      expect(report.normalization.rowsSkipped).toBe(5);
    });

    it('uses authoritative preprocessing counts after warnings are serialized', () => {
      const transaction = createMockTransaction({
        previewSummary: null,
        validation: {
          errors: [],
          warnings: ['Rows 1, 2, 3 have the same identity - merging']
        },
        preprocessReport: {
          totalRows: 3,
          validRows: 3,
          skippedRows: 0,
          withinBatchDuplicates: 2,
          warnings: [
            { type: 'within_batch_duplicate', rowIndexes: [1, 2, 3] }
          ],
          errors: []
        },
        importMetadata: { rowCount: 3 }
      });

      const report = generateImportReport(transaction);

      expect(report.normalization).toEqual(
        expect.objectContaining({ rowsProcessed: 3, rowsValid: 3, rowsSkipped: 0 })
      );
      expect(report.duplicatePrevention.withinBatchDuplicates).toBe(2);
      expect(report.duplicatePrevention.withinBatchMerged).toBe(2);
    });

    it('includes validation errors and warnings', () => {
      const transaction = createMockTransaction({
        validation: {
          errors: [
            { message: 'Missing course code' },
            { message: 'Invalid CRN' }
          ],
          warnings: [
            { message: 'Unknown instructor' }
          ]
        }
      });

      const report = generateImportReport(transaction);

      expect(report.validation.errorCount).toBe(2);
      expect(report.validation.warningCount).toBe(1);
      expect(report.validation.errors).toHaveLength(2);
      expect(report.validation.warnings).toHaveLength(1);
    });

    it('tracks match resolution stats', () => {
      const transaction = createMockTransaction({
        matchingIssues: [
          { id: '1', type: 'person', resolved: true },
          { id: '2', type: 'person', resolved: false },
          { id: '3', type: 'person', resolved: true }
        ]
      });

      const report = generateImportReport(transaction);

      expect(report.matchResolution.total).toBe(3);
      expect(report.matchResolution.resolved).toBe(2);
      expect(report.matchResolution.pending).toBe(1);
    });

    it('captures lineage information', () => {
      const transaction = createMockTransaction();
      const report = generateImportReport(transaction);

      expect(report.lineage.importRunId).toBe('import_test_123');
      expect(report.lineage.rowLineageCount).toBe(100);
      expect(report.lineage.fileHash).toBe('abc123');
    });
  });

  describe('formatImportReportForLog', () => {
    it('returns error message for invalid report', () => {
      const output = formatImportReportForLog({ error: 'Test error' });
      expect(output).toContain('Test error');
    });

    it('formats report as readable text', () => {
      const transaction = createMockTransaction();
      const report = generateImportReport(transaction);
      const output = formatImportReportForLog(report);

      expect(output).toContain('IMPORT REPORT');
      expect(output).toContain('Spring 2026');
      expect(output).toContain('committed');
      expect(output).toContain('SUMMARY');
      expect(output).toContain('5 added');
    });

    it('includes errors section when present', () => {
      const transaction = createMockTransaction({
        validation: {
          errors: [{ message: 'Test error' }],
          warnings: []
        }
      });
      const report = generateImportReport(transaction);
      const output = formatImportReportForLog(report);

      expect(output).toContain('Errors');
      expect(output).toContain('Test error');
    });

    it('includes warnings section when present', () => {
      const transaction = createMockTransaction({
        validation: {
          errors: [],
          warnings: [{ message: 'Test warning' }]
        }
      });
      const report = generateImportReport(transaction);
      const output = formatImportReportForLog(report);

      expect(output).toContain('Warnings');
      expect(output).toContain('Test warning');
    });

    it('labels import entity cleanup as preview-only when dry run report is stored', () => {
      const transaction = createMockTransaction({
        entityCleanupReport: {
          mode: 'preview',
          peopleDuplicatesWouldMerge: 2,
          peopleDuplicatesMerged: 0,
          roomDuplicatesWouldMerge: 1,
          roomDuplicatesMerged: 0
        }
      });
      const report = generateImportReport(transaction);
      const output = formatImportReportForLog(report);

      expect(output).toContain('ENTITY CLEANUP PREVIEW');
      expect(output).toContain('People duplicate candidates: 2');
      expect(output).toContain('Room duplicate candidates: 1');
      expect(output).toContain('Apply duplicate decisions from Data Health Check.');
      expect(output).not.toContain('People duplicates merged: 0');
      expect(output).not.toContain('Room duplicates merged: 0');
    });
  });
});
