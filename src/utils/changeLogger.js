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
  return logChange({
    action: 'UPDATE',
    entity,
    collection,
    documentId,
    changes,
    originalData,
    source
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
