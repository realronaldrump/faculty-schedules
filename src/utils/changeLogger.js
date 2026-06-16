/**
 * Centralized Change Logging System
 * 
 * This utility logs all data mutations across the entire application
 * to provide a comprehensive audit trail of changes made to the database.
 */

import { collection, addDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

/**
 * Log a data change to the database
 * @param {Object} changeData - The change information
 * @param {string} changeData.action - Type of action (CREATE, UPDATE, DELETE, BULK_UPDATE, IMPORT, STANDARDIZE, MERGE, etc.)
 * @param {string} changeData.entity - Description of what was changed (e.g., "Faculty - John Doe", "Schedule - CS 101", etc.)
 * @param {string} changeData.collection - Firebase collection affected
 * @param {string} [changeData.documentId] - Document ID affected (if applicable)
 * @param {Object} [changeData.changes] - New data or changes made
 * @param {Object} [changeData.originalData] - Original data before change (for updates/deletes)
 * @param {string} [changeData.source] - Source of the change (component name, utility function, etc.)
 * @param {Object} [changeData.metadata] - Additional metadata (affected count, transaction ID, etc.)
 */
const logChange = async (changeData) => {
  try {
    const currentUser = auth.currentUser;
    const actor = {
      uid: currentUser?.uid || "system",
      email: currentUser?.email || null,
      displayName: currentUser?.displayName || null,
    };

    const logEntry = {
      timestamp: new Date().toISOString(),
      action: changeData.action,
      entity: changeData.entity,
      collection: changeData.collection,
      documentId: changeData.documentId || null,
      changes: changeData.changes || null,
      originalData: changeData.originalData || null,
      source: changeData.source || 'Unknown',
      metadata: changeData.metadata || {},
      userId: actor.uid,
      actor,
    };

    await addDoc(collection(db, 'changeLog'), logEntry);
    console.log('📝 Change logged:', logEntry);
  } catch (error) {
    console.error('❌ Error logging change:', error);
    // Don't throw error to prevent breaking the main operation
  }
};

/**
 * Calculate detailed field changes between original and updated data
 * @param {Object} originalData - Original data before changes
 * @param {Object} updatedData - Updated data after changes
 * @returns {Object} Detailed field changes with before/after values
 */
const getFieldChanges = (originalData, updatedData) => {
  const changes = {};
  
  if (!originalData || !updatedData) {
    return changes;
  }

  // Get all unique keys from both objects
  const allKeys = new Set([
    ...Object.keys(originalData || {}),
    ...Object.keys(updatedData || {})
  ]);

  allKeys.forEach(key => {
    // Skip system fields
    if (['id', 'createdAt', 'updatedAt', 'timestamp'].includes(key)) {
      return;
    }

    const oldValue = originalData[key];
    const newValue = updatedData[key];

    // Only track if values are actually different
    if (!areValuesEqual(oldValue, newValue)) {
      changes[key] = {
        from: formatValue(oldValue),
        to: formatValue(newValue),
        type: getChangeType(oldValue, newValue)
      };
    }
  });

  return changes;
};

// System-managed fields that should never trigger a "changed" detection,
// even when they appear inside nested objects (e.g. semesterSchedules entries).
const SYSTEM_FIELDS = new Set(['id', 'createdAt', 'updatedAt', 'timestamp']);

/**
 * Recursively strip system-managed fields so that auto-updated timestamps
 * inside nested objects (e.g. semesterSchedules[key].updatedAt) do not
 * produce false-positive change detections.
 */
const stripSystemFields = (value) => {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(stripSystemFields);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !SYSTEM_FIELDS.has(k))
        .map(([k, v]) => [k, stripSystemFields(v)])
    );
  }
  return value;
};

/**
 * Produce a canonical JSON string with sorted keys, so key-order differences
 * (e.g. from normalization) do not produce false-positive change detections.
 */
const canonicalStringify = (value) => {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalStringify).join(',') + ']';
  }
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonicalStringify(value[k])).join(',') + '}';
};

/**
 * Compare two values for equality (handles objects, arrays, etc.)
 */
const areValuesEqual = (val1, val2) => {
  if (val1 === val2) return true;

  // Treat null, undefined, and empty string as equivalent "empty" values
  const isEmpty = (v) => v == null || v === '';
  if (isEmpty(val1) && isEmpty(val2)) return true;
  if (isEmpty(val1) || isEmpty(val2)) return false;

  // For objects/arrays: strip system-managed timestamp fields recursively
  // before canonical comparison so that auto-updated timestamps inside nested
  // structures (e.g. semesterSchedules[key].updatedAt) don't produce false
  // positives, then compare with key-sorted canonical stringification.
  if (typeof val1 === 'object' && typeof val2 === 'object') {
    return canonicalStringify(stripSystemFields(val1)) === canonicalStringify(stripSystemFields(val2));
  }

  return false;
};

/**
 * Format value for display in change log
 */
const formatValue = (value) => {
  if (value === null || value === undefined) {
    return '(empty)';
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      if (value.length === 0) return '(empty)';
      return value.map(item => typeof item === 'object' ? JSON.stringify(item) : String(item)).join(', ');
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'string' && value.trim() === '') {
    return '(empty)';
  }
  return String(value);
};

/**
 * Determine the type of change that occurred
 */
const getChangeType = (oldValue, newValue) => {
  if (oldValue == null && newValue != null) return 'added';
  if (oldValue != null && newValue == null) return 'removed';
  return 'modified';
};

/**
 * Convenience functions for common actions
 */

export const logCreate = (entity, collection, documentId, data, source, metadata = {}) => {
  return logChange({
    action: 'CREATE',
    entity,
    collection,
    documentId,
    changes: data,
    source,
    metadata
  });
};

export const logUpdate = (entity, collection, documentId, changes, originalData, source, metadata = {}) => {
  // Calculate detailed field changes
  const fieldChanges = getFieldChanges(originalData, changes);
  
  return logChange({
    action: 'UPDATE',
    entity,
    collection,
    documentId,
    changes,
    originalData,
    source,
    metadata: {
      ...metadata,
      fieldChanges,
      changedFields: Object.keys(fieldChanges),
      changeCount: Object.keys(fieldChanges).length
    }
  });
};

export const logDelete = (entity, collection, documentId, originalData, source, metadata = {}) => {
  return logChange({
    action: 'DELETE',
    entity,
    collection,
    documentId,
    originalData,
    source,
    metadata
  });
};

export const logImport = (entity, collection, importCount, source, metadata = {}) => {
  return logChange({
    action: 'IMPORT',
    entity,
    collection,
    source,
    metadata: {
      importCount,
      ...metadata
    }
  });
};

export const logStandardization = (collection, recordsUpdated, source) => {
  return logChange({
    action: 'STANDARDIZE',
    entity: `Data standardization - ${recordsUpdated} records updated`,
    collection,
    source,
    metadata: {
      recordsUpdated
    }
  });
};

export const logMerge = (entity, collection, primaryDocumentId, duplicateIds, source) => {
  return logChange({
    action: 'MERGE',
    entity,
    collection,
    documentId: primaryDocumentId,
    source,
    metadata: {
      duplicateIds,
      mergedCount: duplicateIds.length
    }
  });
};

export const logBulkUpdate = (entity, collection, affectedCount, source, metadata = {}) => {
  return logChange({
    action: 'BULK_UPDATE',
    entity,
    collection,
    source,
    metadata: {
      affectedCount,
      ...metadata
    }
  });
};
