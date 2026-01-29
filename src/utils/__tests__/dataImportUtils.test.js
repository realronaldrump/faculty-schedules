import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createScheduleModel, parseCLSSCSV, parseInstructorFieldList } from '../dataImportUtils';
import { extractScheduleRowBaseData } from '../importTransactionUtils';

const csvPath = path.resolve(process.cwd(), 'data-samples/CLSSspring2026import.csv');
const csvText = fs.readFileSync(csvPath, 'utf-8');
const parsedRows = parseCLSSCSV(csvText);

describe('dataImportUtils CLSS parsing', () => {
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
    expect(base.roomNames.length).toBeGreaterThan(0);
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

  it('preserves max enrollment on schedule model', () => {
    const schedule = createScheduleModel({
      courseCode: 'ADM 1300',
      section: '01',
      term: 'Spring 2026',
      enrollment: '12',
      maxEnrollment: '25'
    });

    expect(schedule.enrollment).toBe(12);
    expect(schedule.maxEnrollment).toBe(25);
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
  });
});
