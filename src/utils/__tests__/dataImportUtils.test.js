import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseInstructorFieldList } from '../dataImportUtils';
import { parseClssFile } from '../import/clss/parse-clss-file';
import { extractScheduleRowBaseData } from '../importScheduleRowUtils';

const parseCLSSCSV = (text) => parseClssFile(text, { strict: true }).rows;

const csvPath = path.resolve(
  process.cwd(),
  'src/utils/__tests__/fixtures/CLSSspring2026import.sanitized.csv'
);
const csvText = fs.readFileSync(csvPath, 'utf-8');
const parsedRows = parseCLSSCSV(csvText);

describe('dataImportUtils CLSS parsing', () => {
  it('parses multiline CLSS export headers without embedded newlines', () => {
    const exportPath = path.resolve(
      process.cwd(),
      'src/utils/__tests__/fixtures/CLSSExportSpring2026.sanitized.csv'
    );
    const exportText = fs.readFileSync(exportPath, 'utf-8');
    const exportRows = parseCLSSCSV(exportText);

    expect(exportRows.length).toBeGreaterThan(50);
    const keys = Object.keys(exportRows[0] || {});
    expect(keys.some((k) => /[\r\n]/.test(k))).toBe(false);

    // Sanity check expected canonical headers exist.
    expect(keys).toContain('CLSS ID');
    expect(keys).toContain('CRN');
    expect(keys).toContain('Course');
    expect(keys).toContain('Section #');
    expect(keys).toContain('Instructor');

    const base = extractScheduleRowBaseData(exportRows[0]);
    expect(base.termCode).toBe('202610');
    expect(base.crn).toMatch(/^\d{5,6}$/);
  });

  it('parses CLSS CSV rows with term and CRN', () => {
    expect(parsedRows.length).toBeGreaterThan(0);
    expect(parsedRows[0].Term).toBe('Spring 2026');
    expect(parsedRows[0].CRN).toMatch(/^\d{5,6}$/);
  });

  it('extracts normalized schedule data from a CLSS row', () => {
    const base = extractScheduleRowBaseData(parsedRows[0]);
    expect(base.term).toBe('Spring 2026');
    expect(base.termCode).toBe('202610');
    expect(base.section).toMatch(/^[A-Z0-9]+$/i);
    expect(base.spaceDisplayNames.length).toBeGreaterThan(0);
  });

  it('marks online rows as roomless with Online label', () => {
    const onlineRow = parsedRows.find((row) =>
      String(row.Room || '').toUpperCase().includes('ONLINE')
    );
    expect(onlineRow).toBeTruthy();
    const base = extractScheduleRowBaseData(onlineRow);
    expect(base.isOnline).toBe(true);
    expect(base.locationType).toBe('no_room');
    expect(base.locationLabel).toBe('Online');
  });

  it('parses multiple instructors and staff records', () => {
    const instructors = parseInstructorFieldList(
      'Doe, Jane (123456789) [Primary, 60%] / Smith, John [40%]'
    );
    expect(instructors).toHaveLength(2);
    expect(instructors[0].lastName).toBe('Doe');
    expect(instructors[0].isPrimary).toBe(true);
    expect(instructors[1].percentage).toBe(40);

    const staff = parseInstructorFieldList('Staff');
    expect(staff[0].isStaff).toBe(true);

    const annotatedStaff = parseInstructorFieldList('Staff [Primary, 100%]');
    expect(annotatedStaff[0].isStaff).toBe(true);

    const stafford = parseInstructorFieldList('Stafford, John [100%]');
    expect(stafford).toEqual([
      expect.objectContaining({
        lastName: 'Stafford',
        firstName: 'John',
        isStaff: false,
      }),
    ]);
  });
});
