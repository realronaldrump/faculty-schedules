import { beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_TERM_CONFIG,
  normalizeTermConfig,
  normalizeTermLabel,
  setTermConfig,
  sortTerms,
  termCodeFromLabel,
  termLabelFromCode
} from '../termUtils';

describe('termUtils', () => {
  beforeEach(() => {
    setTermConfig(DEFAULT_TERM_CONFIG);
  });

  it('uses the canonical CLSS term-code mapping by default', () => {
    expect(DEFAULT_TERM_CONFIG.codeToSeason).toEqual({
      '10': 'Spring',
      '30': 'Summer',
      '40': 'Fall',
      '50': 'Winter'
    });
    expect(DEFAULT_TERM_CONFIG.seasonOrder).toEqual([
      'Spring',
      'Summer',
      'Fall',
      'Winter'
    ]);
  });

  it('migrates the exact legacy seeded v1 mapping without rewriting custom mappings', () => {
    const migrated = normalizeTermConfig({
      version: 1,
      codeToSeason: {
        '10': 'Winter',
        '30': 'Fall',
        '40': 'Spring',
        '50': 'Summer'
      },
      seasonOrder: ['Winter', 'Spring', 'Summer', 'Fall'],
      twoDigitYearBase: 2000
    });
    const custom = normalizeTermConfig({
      version: 1,
      codeToSeason: {
        '01': 'Spring',
        '02': 'Summer',
        '03': 'Fall',
        '04': 'Winter'
      },
      seasonOrder: ['Spring', 'Summer', 'Fall', 'Winter'],
      twoDigitYearBase: 2000
    });

    expect(migrated.version).toBeGreaterThan(1);
    expect(migrated.codeToSeason).toEqual(DEFAULT_TERM_CONFIG.codeToSeason);
    expect(migrated.seasonOrder).toEqual(DEFAULT_TERM_CONFIG.seasonOrder);
    expect(custom.codeToSeason).toEqual({
      '01': 'Spring',
      '02': 'Summer',
      '03': 'Fall',
      '04': 'Winter'
    });
  });

  it('normalizes term labels with flexible spacing and year formats', () => {
    expect(normalizeTermLabel('fall2025')).toBe('Fall 2025');
    expect(normalizeTermLabel('Spring 25')).toBe('Spring 2025');
    expect(normalizeTermLabel('202540')).toBe('Fall 2025');
  });

  it('maps term labels to codes and back using config', () => {
    expect(termCodeFromLabel('Fall 2025')).toBe('202540');
    expect(termLabelFromCode('202510')).toBe('Spring 2025');
  });

  it('supports custom term code mappings', () => {
    setTermConfig({
      ...DEFAULT_TERM_CONFIG,
      codeToSeason: {
        '01': 'Spring',
        '02': 'Summer',
        '03': 'Fall',
        '04': 'Winter'
      },
      seasonOrder: ['Spring', 'Summer', 'Fall', 'Winter']
    });
    expect(termCodeFromLabel('Spring 2026')).toBe('202601');
    expect(termLabelFromCode('202601')).toBe('Spring 2026');
  });

  it('sorts terms by year then configured season order', () => {
    const sorted = sortTerms(['Spring 2025', 'Fall 2024', 'Fall 2025']);
    expect(sorted).toEqual(['Fall 2025', 'Spring 2025', 'Fall 2024']);
  });
});
