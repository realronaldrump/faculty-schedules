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

const groupRowsByOverlappingIdentityKeys = (
  rows = [],
  selectKeys = () => [],
  exclusiveIdentityTypes = []
) => {
  const safeRows = Array.isArray(rows) ? rows : [];
  const exclusiveTypes = new Set(exclusiveIdentityTypes);
  const parents = safeRows.map((_, index) => index);
  const find = (index) => {
    let root = index;
    while (parents[root] !== root) root = parents[root];
    while (parents[index] !== index) {
      const next = parents[index];
      parents[index] = root;
      index = next;
    }
    return root;
  };
  const keysByRow = safeRows.map((row) => Array.from(
    new Set((selectKeys(row) || []).map((key) => String(key || '').trim()).filter(Boolean))
  ));
  const union = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    const root = Math.min(leftRoot, rightRoot);
    parents[leftRoot] = root;
    parents[rightRoot] = root;
  };

  const keyOwners = new Map();
  keysByRow.forEach((keys, index) => {
    keys.forEach((key) => {
      if (keyOwners.has(key)) {
        union(index, keyOwners.get(key));
      } else {
        keyOwners.set(key, index);
      }
    });
  });

  const componentIndexesByRoot = new Map();
  const unkeyedRows = [];
  safeRows.forEach((row, index) => {
    if (keysByRow[index].length === 0) {
      unkeyedRows.push(row);
      return;
    }
    const root = find(index);
    if (!componentIndexesByRoot.has(root)) componentIndexesByRoot.set(root, []);
    componentIndexesByRoot.get(root).push(index);
  });

  const identityGroups = new Map();
  const conflicts = [];
  componentIndexesByRoot.forEach((indexes, root) => {
    const valuesByType = new Map();
    indexes.forEach((index) => {
      keysByRow[index].forEach((key) => {
        const separatorIndex = key.indexOf(':');
        const type = separatorIndex >= 0 ? key.slice(0, separatorIndex) : key;
        if (!exclusiveTypes.has(type)) return;
        if (!valuesByType.has(type)) valuesByType.set(type, new Set());
        valuesByType.get(type).add(key);
      });
    });
    const conflictingTypes = Array.from(exclusiveTypes).filter(
      (type) => (valuesByType.get(type)?.size || 0) > 1
    );
    const componentRows = indexes.map((index) => safeRows[index]);

    if (conflictingTypes.length > 0) {
      conflicts.push({ rows: componentRows, conflictingTypes });
      indexes.forEach((index) => {
        const row = safeRows[index];
        const label = row?.__identityKey || keysByRow[index]?.[0] || `identity-row-${index}`;
        identityGroups.set(`${label}#${index}`, [row]);
      });
      return;
    }

    const label = componentRows[0]?.__identityKey || keysByRow[root]?.[0] || `identity-group-${root}`;
    identityGroups.set(`${label}#${root}`, componentRows);
  });
  return { identityGroups, unkeyedRows, conflicts };
};

const selectScheduleGroupingKeys = (row) =>
  (Array.isArray(row?.__identityKeys) ? row.__identityKeys : []).filter(
    (key) => !String(key).startsWith('composite:')
  );

const selectPersonStrongIdentityKeys = (row) =>
  (Array.isArray(row?.__identityKeys) ? row.__identityKeys : []).filter(
    (key) => !String(key).startsWith('name:')
  );

const displayIdentityGroupKey = (key) => String(key || '').replace(/#\d+$/, '');

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

    } catch (err) {
      errors.push({
        rowIndex,
        message: `Error processing row ${rowIndex}: ${err.message}`
      });
    }
  });

  const { identityGroups, unkeyedRows, conflicts } = groupRowsByOverlappingIdentityKeys(
    normalizedRows,
    selectScheduleGroupingKeys,
    ['clss', 'crn', 'section']
  );
  conflicts.forEach((conflict) => {
    const rowIndexes = conflict.rows.map((row) => row?.__rowIndex).filter(Boolean);
    errors.push({
      type: 'conflicting_within_batch_identity',
      rowIndexes,
      conflictingTypes: conflict.conflictingTypes,
      message: `Rows ${rowIndexes.join(', ')} share an identity key but have conflicting ${conflict.conflictingTypes.join('/')} values; keeping them separate`
    });
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

    const identityKey = displayIdentityGroupKey(key);
    mergeWarnings.push({
      type: 'within_batch_duplicate',
      identityKey,
      rowIndexes: group.map(r => r.__rowIndex),
      message: `Rows ${rowIndexes} have same identity (${identityKey}) - merging into single record`
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

    // Preserve the strongest stable identity components even when the most
    // content-complete row is missing one of them.
    for (const field of [
      'clssId',
      'crn',
      'courseCode',
      'section',
      'term',
      'termCode'
    ]) {
      if (!baseData[field] && other[field]) {
        baseData[field] = other[field];
      }
    }

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

  const mergedIdentity = deriveScheduleIdentity({
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
  const stableMergedKeys = Array.from(mergedIdentityKeys).filter(
    (key) => !String(key).startsWith('composite:')
  );
  const canonicalIdentityKeys = Array.from(new Set([
    ...mergedIdentity.keys,
    ...stableMergedKeys
  ])).filter(Boolean);

  base.baseData = baseData;
  base.__merged = true;
  base.__mergedFromRows = group.map(r => r.__rowIndex);
  base.__identityKey = mergedIdentity.primaryKey || canonicalIdentityKeys[0] || '';
  base.__identityKeys = canonicalIdentityKeys;
  base.__identitySource = mergedIdentity.source ||
    (base.__identityKey ? base.__identityKey.split(':')[0] : '');

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

  const nameMap = new Map();

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

  const { identityGroups, unkeyedRows, conflicts } = groupRowsByOverlappingIdentityKeys(
    normalizedRows,
    selectPersonStrongIdentityKeys,
    ['baylor', 'clss-instructor', 'email', 'ignite']
  );
  conflicts.forEach((conflict) => {
    const rowIndexes = conflict.rows.map((row) => row?.__rowIndex).filter(Boolean);
    errors.push({
      type: 'conflicting_within_batch_identity',
      rowIndexes,
      conflictingTypes: conflict.conflictingTypes,
      message: `Rows ${rowIndexes.join(', ')} share a person identity key but have conflicting ${conflict.conflictingTypes.join('/')} values; keeping them separate`
    });
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
    const identityKey = displayIdentityGroupKey(key);
    mergeWarnings.push({
      type: 'within_batch_duplicate',
      identityKey,
      rowIndexes: group.map(r => r.__rowIndex),
      message: `Rows ${rowIndexes} have the same person identity (${identityKey}) - merging into one canonical person row`
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
