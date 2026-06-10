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
  applyPersonIdentityMetadata,
  buildPersonImportUpdates,
  deriveImportedPersonIdentity,
  standardizeImportedPerson
} from './importHygieneUtils';
import {
  extractScheduleRowBaseData,
} from './importScheduleRowUtils';
import { hashRecord } from './hashUtils';
import { parseCrossListCrns } from './dataImportUtils';

const normalizeImportedDigits = (value) => (value || '').toString().replace(/\D/g, '');

const DIRECTORY_FIRST_NAME_HEADERS = ['First Name', 'FirstName', 'firstName'];
const DIRECTORY_LAST_NAME_HEADERS = ['Last Name', 'LastName', 'lastName'];
const DIRECTORY_EMAIL_HEADERS = ['E-mail Address', 'E-mail', 'Email', 'email'];
const DIRECTORY_PHONE_HEADERS = ['Phone', 'Business Phone', 'Home Phone', 'phone'];
const DIRECTORY_BAYLOR_ID_HEADERS = ['Baylor ID', 'BaylorID', 'baylorId'];
const DIRECTORY_CLSS_ID_HEADERS = [
  'CLSS Instructor ID',
  'clssInstructorId',
  'Instructor ID',
  'InstructorID'
];
const DIRECTORY_IGNITE_PERSON_NUMBER_HEADERS = [
  'Person Number',
  'PersonNumber',
  'Person #',
  'personNumber',
  'person_number',
  'ignitePersonNumber',
  'Ignite Person Number',
  'ignitePersonId',
  'Ignite Person ID',
  'igniteId',
  'Ignite ID'
];

const readDirectoryField = (row = {}, headers = []) => {
  for (const header of headers) {
    const value = row?.[header];
    if (value === undefined || value === null) continue;
    const normalized = String(value).trim();
    if (normalized) return normalized;
  }
  return '';
};

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
    return preprocessDirectoryRows(rows);
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
  const unkeyedRows = [];

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
      } else {
        // Keep rows even if we can't derive an identity key yet; downstream preview will surface errors.
        unkeyedRows.push(normalizedRow);
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
  const combinedDeduped = [...dedupedRows, ...unkeyedRows].filter(Boolean);
  combinedDeduped.sort((a, b) => (a?.__rowIndex || 0) - (b?.__rowIndex || 0));

  warnings.push(...mergeWarnings);

  return {
    normalizedRows,
    dedupedRows: combinedDeduped,
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
  const mergedIdentityKeys = new Set(Array.isArray(base.__identityKeys) ? base.__identityKeys : []);

  // Merge data from other rows
  for (let i = 1; i < scored.length; i++) {
    const other = scored[i].row.baseData;
    const otherKeys = scored[i].row.__identityKeys || [];
    otherKeys.forEach((key) => key && mergedIdentityKeys.add(key));

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
    // (We will merge instructors across the full group after this loop.)
  }

  // Merge instructor information across all rows in the group.
  const normalizeDigits = (value) => (value || '').toString().replace(/\D/g, '');
  const buildInstructorKey = (info) => {
    if (!info) return '';
    const digits = normalizeDigits(info.id);
    if (digits && digits.length === 9) return `baylor:${digits}`;
    const first = (info.firstName || '').toString().trim().toLowerCase();
    const last = (info.lastName || '').toString().trim().toLowerCase();
    if (!first && !last) return '';
    return `name:${last}|${first}`;
  };
  const mergedInstructorMap = new Map();
  const allInstructors = group
    .map((row) => row?.baseData?.parsedInstructors)
    .flat()
    .filter(Boolean);
  allInstructors.forEach((info) => {
    const key = buildInstructorKey(info);
    if (!key) return;
    const existing = mergedInstructorMap.get(key);
    if (!existing) {
      mergedInstructorMap.set(key, { ...info });
      return;
    }
    const merged = { ...existing };
    if (!merged.id && info.id) merged.id = info.id;
    if (!merged.firstName && info.firstName) merged.firstName = info.firstName;
    if (!merged.lastName && info.lastName) merged.lastName = info.lastName;
    if (!merged.title && info.title) merged.title = info.title;
    const percA = Number.isFinite(existing.percentage) ? existing.percentage : null;
    const percB = Number.isFinite(info.percentage) ? info.percentage : null;
    if (percA === null) merged.percentage = percB ?? existing.percentage ?? 100;
    else if (percB === null) merged.percentage = percA;
    else merged.percentage = Math.max(percA, percB);
    merged.isPrimary = Boolean(existing.isPrimary || info.isPrimary);
    merged.isStaff = Boolean(existing.isStaff || info.isStaff);
    mergedInstructorMap.set(key, merged);
  });

  const mergedInstructors = Array.from(mergedInstructorMap.values());
  const choosePrimaryInstructor = () => {
    if (mergedInstructors.length === 0) return null;
    const candidates = mergedInstructors.some((i) => i.isPrimary)
      ? mergedInstructors.filter((i) => i.isPrimary)
      : mergedInstructors;
    return [...candidates].sort((a, b) => {
      const percA = Number.isFinite(a.percentage) ? a.percentage : 0;
      const percB = Number.isFinite(b.percentage) ? b.percentage : 0;
      if (percA !== percB) return percB - percA;
      const lastA = (a.lastName || '').toString();
      const lastB = (b.lastName || '').toString();
      return lastA.localeCompare(lastB);
    })[0];
  };
  const primaryInstructor = choosePrimaryInstructor();
  if (primaryInstructor) {
    const primaryKey = buildInstructorKey(primaryInstructor);
    mergedInstructors.forEach((info) => {
      info.isPrimary = buildInstructorKey(info) === primaryKey;
    });
  }

  const formatInstructorName = (info) => {
    if (!info) return '';
    const firstName = (info.firstName || '').trim();
    const lastName = (info.lastName || '').trim();
    if (firstName && lastName) return `${lastName}, ${firstName}`;
    return lastName || firstName;
  };
  const normalizedInstructorName = mergedInstructors
    .map(formatInstructorName)
    .filter(Boolean);
  baseData.parsedInstructors = mergedInstructors;
  baseData.parsedInstructor = primaryInstructor || baseData.parsedInstructor || null;
  baseData.normalizedInstructorName = Array.from(new Set(normalizedInstructorName)).join('; ');
  const primaryDigits = normalizeDigits(primaryInstructor?.id);
  baseData.instructorBaylorId = primaryDigits && primaryDigits.length === 9 ? primaryDigits : '';
  baseData.instructorField = baseData.normalizedInstructorName || baseData.instructorField || '';

  // Merge cross-listed CRNs across raw rows.
  const crossListSet = new Set(Array.isArray(baseData.crossListCrns) ? baseData.crossListCrns : []);
  group.forEach((row) => {
    const crns = parseCrossListCrns(row?.raw || row) || [];
    crns.forEach((crn) => crn && crossListSet.add(crn));
  });
  if (crossListSet.size > 0) {
    baseData.crossListCrns = Array.from(crossListSet);
  }

  base.baseData = baseData;
  base.__merged = true;
  base.__mergedFromRows = group.map(r => r.__rowIndex);
  base.__identityKeys = Array.from(mergedIdentityKeys).filter(Boolean);

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
const preprocessDirectoryRows = (rows) => {
  const normalizedRows = [];
  const warnings = [];
  const errors = [];
  let skippedRows = 0;

  const identityGroups = new Map();
  const nameMap = new Map();
  const unkeyedRows = [];

  rows.forEach((row, index) => {
    const rowIndex = row.__rowIndex || index + 1;

    try {
      const email = readDirectoryField(row, DIRECTORY_EMAIL_HEADERS).toLowerCase();
      const firstName = readDirectoryField(row, DIRECTORY_FIRST_NAME_HEADERS);
      const lastName = readDirectoryField(row, DIRECTORY_LAST_NAME_HEADERS);
      const phone = readDirectoryField(row, DIRECTORY_PHONE_HEADERS);
      const baylorId = readDirectoryField(row, DIRECTORY_BAYLOR_ID_HEADERS);
      const ignitePersonNumber = normalizeImportedDigits(
        readDirectoryField(row, DIRECTORY_IGNITE_PERSON_NUMBER_HEADERS)
      );
      const clssInstructorId = readDirectoryField(row, DIRECTORY_CLSS_ID_HEADERS);

      // Skip rows without meaningful identity
      if (!email && !firstName && !lastName && !baylorId && !clssInstructorId && !ignitePersonNumber) {
        skippedRows++;
        warnings.push({
          rowIndex,
          message: `Skipped row ${rowIndex}: no email, name, or external ID`
        });
        return;
      }

      const rowHash = row.__rowHash || hashRecord(row);
      const baseData = applyPersonIdentityMetadata(standardizeImportedPerson({
        firstName,
        lastName,
        email,
        phone,
        baylorId,
        ignitePersonNumber,
        externalIds: {
          ...(clssInstructorId ? { clssInstructorId } : {}),
          ...(ignitePersonNumber ? { ignitePersonNumber, personNumber: ignitePersonNumber } : {})
        },
        roles: ['faculty']
      }, { updateTimestamp: false }));
      const identity = deriveImportedPersonIdentity(baseData);
      const primaryKey = identity.strongKeys[0] || '';
      const nameKey = `${firstName.toLowerCase()}|${lastName.toLowerCase()}`;

      const normalizedRow = {
        __rowIndex: rowIndex,
        __rowHash: rowHash,
        __email: email,
        __nameKey: nameKey,
        __identityKey: primaryKey,
        __identityKeys: identity.keys,
        __identitySource: identity.source,
        baseData,
        raw: row
      };

      normalizedRows.push(normalizedRow);

      if (primaryKey) {
        if (!identityGroups.has(primaryKey)) {
          identityGroups.set(primaryKey, []);
        }
        identityGroups.get(primaryKey).push(normalizedRow);
      } else {
        unkeyedRows.push(normalizedRow);
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

  const { dedupedRows, mergeWarnings, duplicateCount } = mergeDirectoryIdentityGroups(identityGroups);
  warnings.push(...mergeWarnings);

  for (const [nameKey, group] of nameMap) {
    if (!nameKey || group.length <= 1) continue;
    const unkeyedGroup = group.filter((entry) => !entry.__identityKey);
    if (unkeyedGroup.length <= 1) continue;
    const rowIndexes = unkeyedGroup.map(r => r.__rowIndex).join(', ');
    warnings.push({
      type: 'possible_within_batch_duplicate',
      field: 'name',
      value: nameKey,
      rowIndexes: unkeyedGroup.map(r => r.__rowIndex),
      message: `Rows ${rowIndexes} have the same name but no strong identifier; keeping them separate for review`
    });
  }

  const combinedDeduped = [...dedupedRows, ...unkeyedRows].filter(Boolean);
  combinedDeduped.sort((a, b) => (a?.__rowIndex || 0) - (b?.__rowIndex || 0));

  return {
    normalizedRows,
    dedupedRows: combinedDeduped,
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

const mergeDirectoryIdentityGroups = (identityGroups) => {
  const dedupedRows = [];
  const mergeWarnings = [];
  let duplicateCount = 0;

  for (const [key, group] of identityGroups) {
    if (group.length === 1) {
      dedupedRows.push(group[0]);
      continue;
    }

    duplicateCount += group.length - 1;
    const rowIndexes = group.map(r => r.__rowIndex).join(', ');
    mergeWarnings.push({
      type: 'within_batch_duplicate',
      identityKey: key,
      rowIndexes: group.map(r => r.__rowIndex),
      message: `Rows ${rowIndexes} have the same person identity (${key}) - merging into one canonical person row`
    });
    dedupedRows.push(mergeDirectoryRowGroup(group));
  }

  return { dedupedRows, mergeWarnings, duplicateCount };
};

const mergeDirectoryRowGroup = (group) => {
  if (group.length === 0) return null;
  if (group.length === 1) return group[0];

  const scored = group.map((row) => ({
    row,
    score: scoreDirectoryCompleteness(row.baseData)
  }));
  scored.sort((a, b) => b.score - a.score || (a.row.__rowIndex || 0) - (b.row.__rowIndex || 0));

  let mergedPerson = { ...(scored[0].row.baseData || {}) };
  const mergedRaw = { ...(scored[0].row.raw || {}) };
  const mergedIdentityKeys = new Set(scored[0].row.__identityKeys || []);

  for (let i = 1; i < scored.length; i += 1) {
    const entry = scored[i].row;
    const { merged } = buildPersonImportUpdates(mergedPerson, entry.baseData, {
      updateTimestamp: false
    });
    mergedPerson = applyPersonIdentityMetadata(merged);
    (entry.__identityKeys || []).forEach((identityKey) => {
      if (identityKey) mergedIdentityKeys.add(identityKey);
    });

    Object.entries(entry.raw || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      if (
        mergedRaw[key] === undefined ||
        mergedRaw[key] === null ||
        String(mergedRaw[key]).trim() === ''
      ) {
        mergedRaw[key] = value;
      }
    });
  }

  const merged = {
    ...scored[0].row,
    __merged: true,
    __mergedFromRows: group.map(r => r.__rowIndex),
    __identityKeys: Array.from(mergedIdentityKeys).filter(Boolean),
    baseData: mergedPerson,
    raw: mergedRaw
  };
  merged.__identityKey = deriveImportedPersonIdentity(mergedPerson).strongKeys[0] || merged.__identityKey;
  return merged;
};

const scoreDirectoryCompleteness = (person = {}) => {
  if (!person) return 0;
  let score = 0;
  if (person.baylorId || person.externalIds?.baylorId) score += 10;
  if (person.externalIds?.clssInstructorId) score += 9;
  if (
    person.ignitePersonNumber ||
    person.personNumber ||
    person.externalIds?.ignitePersonNumber ||
    person.externalIds?.personNumber
  ) score += 9;
  if (person.email) score += 8;
  if (person.firstName) score += 3;
  if (person.lastName) score += 3;
  if (person.phone) score += 2;
  if (person.office || person.officeSpaceId) score += 2;
  if (person.jobTitle || person.title) score += 1;
  return score;
};
