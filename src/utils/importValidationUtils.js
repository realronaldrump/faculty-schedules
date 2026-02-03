/**
 * Import Validation Utils
 *
 * Pre-commit validation layer that validates import data against business rules
 * before committing to the database. This provides fail-fast behavior and
 * surfaces issues before any data is written.
 */

import {
  validateSection,
  validatePerson,
  validateSpace
} from './canonicalSchema';
import { detectTeachingConflicts } from './hygieneCore';

/**
 * Validate an import transaction before commit
 *
 * @param {ImportTransaction} transaction - The transaction to validate
 * @param {Object} existingData - Current database state
 * @param {Array} existingData.schedules - Existing schedules
 * @param {Array} existingData.people - Existing people
 * @param {Array} existingData.rooms - Existing rooms
 * @returns {Object} Validation result with errors, warnings, and summary
 */
export const validateImportTransaction = (transaction, existingData = {}) => {
  const errors = [];
  const warnings = [];
  const info = [];

  const existingPeople = existingData.people || [];
  const existingSchedules = existingData.schedules || [];
  const existingRooms = existingData.rooms || [];

  // Build lookup sets for cross-reference validation
  const existingPersonIds = new Set(existingPeople.map(p => p.id));
  const existingRoomIds = new Set(existingRooms.map(r => r.id || r.spaceKey));

  // Collect new IDs being created in this transaction
  const newPersonIds = new Set();
  const newRoomIds = new Set();

  // 1. Validate all people being added
  (transaction.changes?.people?.added || []).forEach(change => {
    const person = change.newData;
    if (!person) return;

    const result = validatePerson(person);

    result.errors.forEach(e => {
      errors.push({
        changeId: change.id,
        collection: 'people',
        field: extractFieldFromError(e),
        message: e,
        data: { firstName: person.firstName, lastName: person.lastName, email: person.email }
      });
    });

    result.warnings.forEach(w => {
      warnings.push({
        changeId: change.id,
        collection: 'people',
        field: extractFieldFromError(w),
        message: w
      });
    });

    // Track new person IDs
    if (person.id) newPersonIds.add(person.id);
  });

  // 2. Validate all rooms being added
  (transaction.changes?.rooms?.added || []).forEach(change => {
    const room = change.newData;
    if (!room) return;

    const result = validateSpace(room);

    result.errors.forEach(e => {
      errors.push({
        changeId: change.id,
        collection: 'rooms',
        field: extractFieldFromError(e),
        message: e,
        data: { spaceKey: room.spaceKey, displayName: room.displayName }
      });
    });

    result.warnings.forEach(w => {
      warnings.push({
        changeId: change.id,
        collection: 'rooms',
        field: extractFieldFromError(w),
        message: w
      });
    });

    // Track new room IDs
    if (room.spaceKey) newRoomIds.add(room.spaceKey);
    if (room.id) newRoomIds.add(room.id);
  });

  // 3. Validate all schedules being added
  (transaction.changes?.schedules?.added || []).forEach(change => {
    const schedule = change.newData;
    if (!schedule) return;

    const result = validateSection(schedule);

    result.errors.forEach(e => {
      errors.push({
        changeId: change.id,
        collection: 'schedules',
        field: extractFieldFromError(e),
        message: e,
        data: { courseCode: schedule.courseCode, section: schedule.section }
      });
    });

    result.warnings.forEach(w => {
      warnings.push({
        changeId: change.id,
        collection: 'schedules',
        field: extractFieldFromError(w),
        message: w
      });
    });
  });

  // 4. Cross-reference validation: Check instructor references
  const crossRefWarnings = validateCrossReferences(
    transaction,
    { existingPersonIds, existingRoomIds, newPersonIds, newRoomIds }
  );
  warnings.push(...crossRefWarnings);

  // 5. Check for potential teaching conflicts
  const conflictWarnings = validateTeachingConflicts(transaction, existingSchedules);
  warnings.push(...conflictWarnings);

  // 6. Validate modified records
  const modificationWarnings = validateModifications(transaction);
  warnings.push(...modificationWarnings);

  // Build summary
  const summary = buildValidationSummary(transaction, errors, warnings);

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    info,
    summary
  };
};

/**
 * Validate cross-references between collections
 */
const validateCrossReferences = (transaction, lookups) => {
  const { existingPersonIds, existingRoomIds, newPersonIds, newRoomIds } = lookups;
  const warnings = [];

  // Get match issues that will resolve references
  const matchIssueResolvedPersonIds = new Set();
  (transaction.matchingIssues || []).forEach(issue => {
    if (issue.pendingPersonChangeId) {
      // This match issue will create or link a person
      matchIssueResolvedPersonIds.add(issue.id);
    }
  });

  // Check schedules for unresolved instructor references
  (transaction.changes?.schedules?.added || []).forEach(change => {
    const schedule = change.newData;
    if (!schedule) return;

    // Check instructorId
    if (schedule.instructorId) {
      const exists = existingPersonIds.has(schedule.instructorId) ||
                     newPersonIds.has(schedule.instructorId);

      if (!exists) {
        // Check if there's a match resolution for this schedule
        const hasResolution = (schedule.instructorMatchIssueIds || []).some(
          issueId => matchIssueResolvedPersonIds.has(issueId)
        );

        if (!hasResolution) {
          warnings.push({
            changeId: change.id,
            collection: 'schedules',
            type: 'orphaned_reference',
            field: 'instructorId',
            message: `Schedule ${schedule.courseCode} ${schedule.section} references unknown instructor: ${schedule.instructorId}`
          });
        }
      }
    }

    // Check instructorIds array
    (schedule.instructorIds || []).forEach(personId => {
      const exists = existingPersonIds.has(personId) || newPersonIds.has(personId);

      if (!exists) {
        const hasResolution = (schedule.instructorMatchIssueIds || []).some(
          issueId => matchIssueResolvedPersonIds.has(issueId)
        );

        if (!hasResolution) {
          warnings.push({
            changeId: change.id,
            collection: 'schedules',
            type: 'orphaned_reference',
            field: 'instructorIds',
            message: `Schedule ${schedule.courseCode} ${schedule.section} references unknown instructor in array: ${personId}`
          });
        }
      }
    });

    // Check spaceIds
    (schedule.spaceIds || []).forEach(spaceId => {
      const exists = existingRoomIds.has(spaceId) || newRoomIds.has(spaceId);

      if (!exists) {
        warnings.push({
          changeId: change.id,
          collection: 'schedules',
          type: 'orphaned_reference',
          field: 'spaceIds',
          message: `Schedule ${schedule.courseCode} ${schedule.section} references unknown room: ${spaceId}`
        });
      }
    });
  });

  return warnings;
};

/**
 * Check for potential teaching conflicts introduced by this import
 */
const validateTeachingConflicts = (transaction, existingSchedules) => {
  const warnings = [];

  // Get all new schedules
  const newSchedules = (transaction.changes?.schedules?.added || []).map(c => c.newData).filter(Boolean);

  if (newSchedules.length === 0) {
    return warnings;
  }

  // Combine with existing schedules for the same term(s)
  const termCodes = new Set(newSchedules.map(s => s.termCode).filter(Boolean));
  const relevantExisting = existingSchedules.filter(s => termCodes.has(s.termCode));

  const allSchedules = [...relevantExisting, ...newSchedules];

  // Use existing conflict detection
  try {
    const conflicts = detectTeachingConflicts(allSchedules, { includeNewOnly: true });

    conflicts.forEach(conflict => {
      // Only warn about conflicts involving new schedules
      const involvesNew = newSchedules.some(ns =>
        conflict.scheduleIds?.includes(ns.identityKey) ||
        conflict.schedule1?.identityKey === ns.identityKey ||
        conflict.schedule2?.identityKey === ns.identityKey
      );

      if (involvesNew) {
        warnings.push({
          type: 'potential_teaching_conflict',
          collection: 'schedules',
          severity: 'medium',
          message: `Potential teaching conflict: ${conflict.instructorName || 'instructor'} may be double-booked on ${conflict.day} at ${conflict.overlapStart}-${conflict.overlapEnd}`
        });
      }
    });
  } catch (err) {
    // Don't fail validation if conflict detection fails
    console.warn('Could not check teaching conflicts:', err.message);
  }

  return warnings;
};

/**
 * Validate modifications to existing records
 */
const validateModifications = (transaction) => {
  const warnings = [];

  // Check schedule modifications
  (transaction.changes?.schedules?.modified || []).forEach(change => {
    const updates = change.newData;
    const original = change.originalData;

    if (!updates || !original) return;

    // Warn if identity fields are being changed
    const identityFields = ['courseCode', 'section', 'termCode', 'crn', 'clssId'];

    identityFields.forEach(field => {
      if (updates[field] !== undefined && original[field] && updates[field] !== original[field]) {
        warnings.push({
          changeId: change.id,
          collection: 'schedules',
          type: 'identity_change',
          field,
          message: `Modifying identity field '${field}' from '${original[field]}' to '${updates[field]}' - this may affect duplicate detection`
        });
      }
    });

    // Warn if instructor is being changed
    if (updates.instructorId && original.instructorId && updates.instructorId !== original.instructorId) {
      warnings.push({
        changeId: change.id,
        collection: 'schedules',
        type: 'instructor_change',
        field: 'instructorId',
        message: `Changing instructor for ${original.courseCode} ${original.section}`
      });
    }
  });

  // Check people modifications
  (transaction.changes?.people?.modified || []).forEach(change => {
    const updates = change.newData;
    const original = change.originalData;

    if (!updates || !original) return;

    // Warn if key identity fields are being changed
    if (updates.email && original.email && updates.email !== original.email) {
      warnings.push({
        changeId: change.id,
        collection: 'people',
        type: 'identity_change',
        field: 'email',
        message: `Changing email from '${original.email}' to '${updates.email}'`
      });
    }

    if (updates.baylorId && original.baylorId && updates.baylorId !== original.baylorId) {
      warnings.push({
        changeId: change.id,
        collection: 'people',
        type: 'identity_change',
        field: 'baylorId',
        message: `Changing Baylor ID from '${original.baylorId}' to '${updates.baylorId}'`
      });
    }
  });

  return warnings;
};

/**
 * Build validation summary
 */
const buildValidationSummary = (transaction, errors, warnings) => {
  const scheduleErrors = errors.filter(e => e.collection === 'schedules').length;
  const peopleErrors = errors.filter(e => e.collection === 'people').length;
  const roomErrors = errors.filter(e => e.collection === 'rooms').length;

  const schedulesAdded = transaction.changes?.schedules?.added?.length || 0;
  const peopleAdded = transaction.changes?.people?.added?.length || 0;
  const roomsAdded = transaction.changes?.rooms?.added?.length || 0;

  return {
    errorCount: errors.length,
    warningCount: warnings.length,
    schedulesValid: schedulesAdded - scheduleErrors,
    schedulesInvalid: scheduleErrors,
    peopleValid: peopleAdded - peopleErrors,
    peopleInvalid: peopleErrors,
    roomsValid: roomsAdded - roomErrors,
    roomsInvalid: roomErrors,
    orphanedReferences: warnings.filter(w => w.type === 'orphaned_reference').length,
    potentialConflicts: warnings.filter(w => w.type === 'potential_teaching_conflict').length
  };
};

/**
 * Extract field name from error message (heuristic)
 */
const extractFieldFromError = (errorMessage) => {
  const fieldPatterns = [
    { pattern: /course code/i, field: 'courseCode' },
    { pattern: /section/i, field: 'section' },
    { pattern: /term/i, field: 'termCode' },
    { pattern: /instructor/i, field: 'instructor' },
    { pattern: /room/i, field: 'room' },
    { pattern: /email/i, field: 'email' },
    { pattern: /phone/i, field: 'phone' },
    { pattern: /name/i, field: 'name' },
    { pattern: /building/i, field: 'buildingCode' },
    { pattern: /space/i, field: 'spaceKey' },
  ];

  for (const { pattern, field } of fieldPatterns) {
    if (pattern.test(errorMessage)) {
      return field;
    }
  }

  return null;
};

/**
 * Quick validation check for a single schedule row
 * Useful for row-level validation during preview
 *
 * @param {Object} scheduleData - Schedule data to validate
 * @returns {Object} { isValid, errors, warnings }
 */
export const validateScheduleRow = (scheduleData) => {
  const result = validateSection(scheduleData);
  return {
    isValid: result.errors.length === 0,
    errors: result.errors,
    warnings: result.warnings
  };
};

/**
 * Quick validation check for a single person row
 *
 * @param {Object} personData - Person data to validate
 * @returns {Object} { isValid, errors, warnings }
 */
export const validatePersonRow = (personData) => {
  const result = validatePerson(personData);
  return {
    isValid: result.errors.length === 0,
    errors: result.errors,
    warnings: result.warnings
  };
};

/**
 * Quick validation check for a single room row
 *
 * @param {Object} roomData - Room data to validate
 * @returns {Object} { isValid, errors, warnings }
 */
export const validateRoomRow = (roomData) => {
  const result = validateSpace(roomData);
  return {
    isValid: result.errors.length === 0,
    errors: result.errors,
    warnings: result.warnings
  };
};
