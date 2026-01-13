import { beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_TERM_CONFIG,
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

  it('normalizes term labels with flexible spacing and year formats', () => {
    expect(normalizeTermLabel('fall2025')).toBe('Fall 2025');
    expect(normalizeTermLabel('Spring 25')).toBe('Spring 2025');
    expect(normalizeTermLabel('202530')).toBe('Fall 2025');
  });

  it('maps term labels to codes and back using config', () => {
    expect(termCodeFromLabel('Fall 2025')).toBe('202530');
    expect(termLabelFromCode('202540')).toBe('Spring 2025');
  });

  it('sorts terms by year then configured season order', () => {
    const sorted = sortTerms(['Spring 2025', 'Fall 2024', 'Fall 2025']);
    expect(sorted).toEqual(['Fall 2025', 'Spring 2025', 'Fall 2024']);
  });
});
