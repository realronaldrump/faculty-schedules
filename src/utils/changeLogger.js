/**
 * Centralized Change Logging System
 * 
 * This utility logs all data mutations across the entire application
 * to provide a comprehensive audit trail of changes made to the database.
 */

import { collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase';

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
export const logChange = async (changeData) => {
  try {
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
      userId: 'system' // For now, since no user authentication
    };

    await addDoc(collection(db, 'changeLog'), logEntry);
    console.log('📝 Change logged:', logEntry);
  } catch (error) {
    console.error('❌ Error logging change:', error);
    // Don't throw error to prevent breaking the main operation
  }
};

/**
 * Log a batch operation (multiple changes at once)
 * @param {Array} changes - Array of change objects
 * @param {string} batchDescription - Description of the batch operation
 * @param {string} source - Source of the batch operation
 */
export const logBatchChanges = async (changes, batchDescription, source) => {
  try {
    const batchLogEntry = {
      timestamp: new Date().toISOString(),
      action: 'BATCH_OPERATION',
      entity: batchDescription,
      collection: 'multiple',
      source: source,
      metadata: {
        changesCount: changes.length,
        changes: changes
      },
      userId: 'system'
    };

    await addDoc(collection(db, 'changeLog'), batchLogEntry);
    console.log('📝 Batch operation logged:', batchLogEntry);
  } catch (error) {
    console.error('❌ Error logging batch changes:', error);
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

/**
 * Compare two values for equality (handles objects, arrays, etc.)
 */
const areValuesEqual = (val1, val2) => {
  if (val1 === val2) return true;
  
  // Handle null/undefined cases
  if (val1 == null && val2 == null) return true;
  if (val1 == null || val2 == null) return false;
  
  // Handle objects/arrays
  if (typeof val1 === 'object' && typeof val2 === 'object') {
    return JSON.stringify(val1) === JSON.stringify(val2);
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
      return value.length > 0 ? value.join(', ') : '(empty)';
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

export const logCreate = (entity, collection, documentId, data, source) => {
  return logChange({
    action: 'CREATE',
    entity,
    collection,
    documentId,
    changes: data,
    source
  });
};

export const logUpdate = (entity, collection, documentId, changes, originalData, source) => {
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
      fieldChanges,
      changedFields: Object.keys(fieldChanges),
      changeCount: Object.keys(fieldChanges).length
    }
  });
};

export const logDelete = (entity, collection, documentId, originalData, source) => {
  return logChange({
    action: 'DELETE',
    entity,
    collection,
    documentId,
    originalData,
    source
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
