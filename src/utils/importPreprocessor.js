/**
 * Import Preprocessor
 *
 * Centralized normalization and within-batch deduplication for import data.
 * This module serves as a single entry point ensuring ALL data is normalized
 * before any database operations.
 *
 * Key responsibilities:
 * - Normalize all rows using existing standardization functions
 * - Derive identity keys for each row
 * - Detect and merge duplicates within the import batch
 * - Return normalized data with a validation report
 */

import { deriveScheduleIdentity } from './importIdentityUtils';
import {
  standardizeImportedPerson,
  standardizeImportedSchedule,
  standardizeImportedRoom
} from './importHygieneUtils';
import {
  extractScheduleRowBaseData,
  normalizeSectionIdentifier,
  extractCrnFromSectionField
} from './importTransactionUtils';
import { standardizeCourseCode, isCancelledStatus } from './hygieneCore';
import { hashRecord } from './hashUtils';
import { normalizeTermLabel, termCodeFromLabel } from './termUtils';

/**
 * Preprocess all import rows, normalizing and detecting within-batch duplicates
 *
 * @param {Array} rows - Raw CSV rows
 * @param {string} importType - 'schedule' or 'directory'
 * @param {Object} options
 * @param {string} options.fallbackTerm - Default term if not in row
 * @returns {Object} { normalizedRows, dedupedRows, validationReport }
 */
export const preprocessImportData = (rows, importType, options = {}) => {
  const { fallbackTerm = '' } = options;

  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      normalizedRows: [],
      dedupedRows: [],
      validationReport: {
        totalRows: 0,
        validRows: 0,
        skippedRows: 0,
        withinBatchDuplicates: 0,
        warnings: [],
        errors: []
      }
    };
  }

  if (importType === 'schedule') {
    return preprocessScheduleRows(rows, fallbackTerm);
  } else if (importType === 'directory') {
    return preprocessDirectoryRows(rows, options);
  }

  // Unknown type - return as-is with minimal processing
  return {
    normalizedRows: rows,
    dedupedRows: rows,
    validationReport: {
      totalRows: rows.length,
      validRows: rows.length,
      skippedRows: 0,
      withinBatchDuplicates: 0,
      warnings: [{ message: `Unknown import type: ${importType}` }],
      errors: []
    }
  };
};

/**
 * Preprocess schedule import rows
 */
const preprocessScheduleRows = (rows, fallbackTerm) => {
  const normalizedRows = [];
  const warnings = [];
  const errors = [];
  let skippedRows = 0;

  // Group rows by identity key for duplicate detection
  const identityGroups = new Map();

  rows.forEach((row, index) => {
    const rowIndex = row.__rowIndex || index + 1;

    try {
      // Extract and normalize base data
      const baseData = extractScheduleRowBaseData(row, fallbackTerm);

      // Skip invalid rows
      if (!baseData.courseCode || !baseData.section) {
        skippedRows++;
        warnings.push({
          rowIndex,
          message: `Skipped row ${rowIndex}: missing course code or section`
        });
        return;
      }

      // Derive identity
      const identity = deriveScheduleIdentity({
        courseCode: baseData.courseCode,
        section: baseData.section,
        term: baseData.term,
        termCode: baseData.termCode,
        clssId: baseData.clssId,
        crn: baseData.crn,
        meetingPatterns: baseData.meetingPatterns,
        spaceIds: baseData.spaceIds,
        spaceDisplayNames: baseData.spaceDisplayNames
      });

      const normalizedRow = {
        __rowIndex: rowIndex,
        __rowHash: baseData.rowHash,
        __identityKey: identity.primaryKey,
        __identityKeys: identity.keys,
        __identitySource: identity.source,
        baseData,
        raw: row
      };

      normalizedRows.push(normalizedRow);

      // Track for duplicate detection
      const primaryKey = identity.primaryKey;
      if (primaryKey) {
        if (!identityGroups.has(primaryKey)) {
          identityGroups.set(primaryKey, []);
        }
        identityGroups.get(primaryKey).push(normalizedRow);
      }
    } catch (err) {
      errors.push({
        rowIndex,
        message: `Error processing row ${rowIndex}: ${err.message}`
      });
    }
  });

  // Merge within-batch duplicates
  const { dedupedRows, mergeWarnings, duplicateCount } = mergeWithinBatchDuplicates(identityGroups);

  warnings.push(...mergeWarnings);

  return {
    normalizedRows,
    dedupedRows,
    validationReport: {
      totalRows: rows.length,
      validRows: normalizedRows.length,
      skippedRows,
      withinBatchDuplicates: duplicateCount,
      warnings,
      errors
    }
  };
};

/**
 * Merge rows that have the same identity key within the import batch
 */
const mergeWithinBatchDuplicates = (identityGroups) => {
  const dedupedRows = [];
  const mergeWarnings = [];
  let duplicateCount = 0;

  for (const [key, group] of identityGroups) {
    if (group.length === 1) {
      dedupedRows.push(group[0]);
      continue;
    }

    // Multiple rows with same identity - merge them
    duplicateCount += group.length - 1;
    const rowIndexes = group.map(r => r.__rowIndex).join(', ');

    mergeWarnings.push({
      type: 'within_batch_duplicate',
      identityKey: key,
      rowIndexes: group.map(r => r.__rowIndex),
      message: `Rows ${rowIndexes} have same identity (${key}) - merging into single record`
    });

    // Merge the group - take the most complete row as base and merge others into it
    const merged = mergeScheduleRowGroup(group);
    dedupedRows.push(merged);
  }

  return { dedupedRows, mergeWarnings, duplicateCount };
};

/**
 * Merge a group of schedule rows with the same identity
 * Takes the most complete row as base and fills in missing data from others
 */
const mergeScheduleRowGroup = (group) => {
  if (group.length === 0) return null;
  if (group.length === 1) return group[0];

  // Score each row by completeness
  const scored = group.map(row => ({
    row,
    score: scoreRowCompleteness(row.baseData)
  }));

  // Sort by score descending - most complete first
  scored.sort((a, b) => b.score - a.score);

  // Start with most complete row
  const base = { ...scored[0].row };
  const baseData = { ...base.baseData };

  // Merge data from other rows
  for (let i = 1; i < scored.length; i++) {
    const other = scored[i].row.baseData;

    // Merge meeting patterns (combine all unique patterns)
    if (Array.isArray(other.meetingPatterns) && other.meetingPatterns.length > 0) {
      baseData.meetingPatterns = mergeArraysUnique(
        baseData.meetingPatterns || [],
        other.meetingPatterns,
        (p) => `${p.day}|${p.startTime}|${p.endTime}`
      );
    }

    // Merge space IDs
    if (Array.isArray(other.spaceIds) && other.spaceIds.length > 0) {
      baseData.spaceIds = Array.from(new Set([
        ...(baseData.spaceIds || []),
        ...other.spaceIds
      ]));
    }

    // Merge space display names
    if (Array.isArray(other.spaceDisplayNames) && other.spaceDisplayNames.length > 0) {
      baseData.spaceDisplayNames = Array.from(new Set([
        ...(baseData.spaceDisplayNames || []),
        ...other.spaceDisplayNames
      ]));
    }

    // Take higher enrollment numbers
    if (other.enrollment != null && (baseData.enrollment == null || other.enrollment > baseData.enrollment)) {
      baseData.enrollment = other.enrollment;
    }
    if (other.maxEnrollment != null && (baseData.maxEnrollment == null || other.maxEnrollment > baseData.maxEnrollment)) {
      baseData.maxEnrollment = other.maxEnrollment;
    }

    // Fill empty string fields
    for (const field of ['courseTitle', 'instructionMethod', 'status', 'partOfTerm', 'campus']) {
      if (!baseData[field] && other[field]) {
        baseData[field] = other[field];
      }
    }

    // Prefer longer course title
    if (other.courseTitle && baseData.courseTitle && other.courseTitle.length > baseData.courseTitle.length) {
      baseData.courseTitle = other.courseTitle;
    }

    // Merge instructor info (prefer non-empty)
    if (!baseData.instructorField && other.instructorField) {
      baseData.instructorField = other.instructorField;
      baseData.parsedInstructor = other.parsedInstructor;
      baseData.parsedInstructors = other.parsedInstructors;
      baseData.normalizedInstructorName = other.normalizedInstructorName;
      baseData.instructorBaylorId = other.instructorBaylorId;
    }
  }

  base.baseData = baseData;
  base.__merged = true;
  base.__mergedFromRows = group.map(r => r.__rowIndex);

  return base;
};

/**
 * Score row completeness for merge priority
 */
const scoreRowCompleteness = (data) => {
  if (!data) return 0;
  let score = 0;

  // Identity fields (high weight)
  if (data.clssId) score += 10;
  if (data.crn) score += 8;
  if (data.courseCode) score += 5;
  if (data.section) score += 5;
  if (data.termCode) score += 5;

  // Content fields
  if (data.courseTitle) score += 3;
  if (Array.isArray(data.meetingPatterns) && data.meetingPatterns.length > 0) score += 3;
  if (Array.isArray(data.spaceIds) && data.spaceIds.length > 0) score += 3;
  if (data.instructorField) score += 3;
  if (data.enrollment != null) score += 2;
  if (data.maxEnrollment != null) score += 2;
  if (data.credits != null) score += 2;

  return score;
};

/**
 * Merge arrays with uniqueness based on key function
 */
const mergeArraysUnique = (arr1, arr2, keyFn) => {
  const seen = new Set();
  const result = [];

  for (const item of [...arr1, ...arr2]) {
    const key = keyFn(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }

  return result;
};

/**
 * Preprocess directory import rows (people data)
 */
const preprocessDirectoryRows = (rows, options = {}) => {
  const normalizedRows = [];
  const warnings = [];
  const errors = [];
  let skippedRows = 0;

  // Track for duplicate detection by email/name
  const emailMap = new Map();
  const nameMap = new Map();

  rows.forEach((row, index) => {
    const rowIndex = row.__rowIndex || index + 1;

    try {
      const email = (row['E-mail'] || row.Email || '').toString().trim().toLowerCase();
      const firstName = (row['First Name'] || '').toString().trim();
      const lastName = (row['Last Name'] || '').toString().trim();

      // Skip rows without meaningful identity
      if (!email && !firstName && !lastName) {
        skippedRows++;
        warnings.push({
          rowIndex,
          message: `Skipped row ${rowIndex}: no email or name`
        });
        return;
      }

      const rowHash = row.__rowHash || hashRecord(row);
      const nameKey = `${firstName.toLowerCase()}|${lastName.toLowerCase()}`;

      const normalizedRow = {
        __rowIndex: rowIndex,
        __rowHash: rowHash,
        __email: email,
        __nameKey: nameKey,
        raw: row
      };

      normalizedRows.push(normalizedRow);

      // Track for duplicate detection
      if (email) {
        if (!emailMap.has(email)) {
          emailMap.set(email, []);
        }
        emailMap.get(email).push(normalizedRow);
      }

      if (nameKey) {
        if (!nameMap.has(nameKey)) {
          nameMap.set(nameKey, []);
        }
        nameMap.get(nameKey).push(normalizedRow);
      }
    } catch (err) {
      errors.push({
        rowIndex,
        message: `Error processing row ${rowIndex}: ${err.message}`
      });
    }
  });

  // Detect duplicates (but don't auto-merge for people - too risky)
  let duplicateCount = 0;

  for (const [email, group] of emailMap) {
    if (group.length > 1) {
      duplicateCount += group.length - 1;
      const rowIndexes = group.map(r => r.__rowIndex).join(', ');
      warnings.push({
        type: 'within_batch_duplicate',
        field: 'email',
        value: email,
        rowIndexes: group.map(r => r.__rowIndex),
        message: `Rows ${rowIndexes} have same email (${email}) - possible duplicates`
      });
    }
  }

  return {
    normalizedRows,
    dedupedRows: normalizedRows, // Don't auto-merge people
    validationReport: {
      totalRows: rows.length,
      validRows: normalizedRows.length,
      skippedRows,
      withinBatchDuplicates: duplicateCount,
      warnings,
      errors
    }
  };
};

/**
 * Check if a preprocessed schedule row should be skipped
 * (e.g., cancelled status)
 */
export const shouldSkipScheduleRow = (preprocessedRow) => {
  const baseData = preprocessedRow?.baseData;
  if (!baseData) return false;

  return isCancelledStatus(baseData.status);
};

/**
 * Get identity key from a preprocessed row
 */
export const getRowIdentityKey = (preprocessedRow) => {
  return preprocessedRow?.__identityKey || '';
};

/**
 * Get all identity keys from a preprocessed row
 */
export const getRowIdentityKeys = (preprocessedRow) => {
  return preprocessedRow?.__identityKeys || [];
};
