// Import transaction model for tracking changes
const TRACKED_IMPORT_COLLECTIONS = ['schedules', 'people', 'rooms', 'courses', 'terms'];

const CHANGE_BUCKETS = ['added', 'modified', 'deleted'];

const createChangeBuckets = () => ({
  added: [],
  modified: [],
  deleted: []
});

export const buildGroupedChanges = (changes = []) => {
  const groups = TRACKED_IMPORT_COLLECTIONS.reduce((acc, collection) => {
    acc[collection] = createChangeBuckets();
    return acc;
  }, {});
  changes.forEach((change) => {
    if (!change?.collection) return;
    const actionKey = change.action === 'add' ? 'added' :
      change.action === 'modify' ? 'modified' : 'deleted';
    if (!CHANGE_BUCKETS.includes(actionKey)) return;
    if (!groups[change.collection]) {
      groups[change.collection] = createChangeBuckets();
    }
    groups[change.collection][actionKey].push(change);
  });
  return groups;
};

const createTrackedChanges = () => (
  TRACKED_IMPORT_COLLECTIONS.reduce((changes, collection) => {
    changes[collection] = createChangeBuckets();
    return changes;
  }, {})
);

const ensureChangeBuckets = (changes, collection) => {
  if (!changes || typeof changes !== 'object') {
    return createTrackedChanges();
  }
  TRACKED_IMPORT_COLLECTIONS.forEach((trackedCollection) => {
    if (!changes[trackedCollection] || typeof changes[trackedCollection] !== 'object') {
      changes[trackedCollection] = createChangeBuckets();
    }
    CHANGE_BUCKETS.forEach((bucket) => {
      if (!Array.isArray(changes[trackedCollection][bucket])) {
        changes[trackedCollection][bucket] = [];
      }
    });
  });
  if (collection && (!changes[collection] || typeof changes[collection] !== 'object')) {
    changes[collection] = createChangeBuckets();
  }
  if (collection) {
    CHANGE_BUCKETS.forEach((bucket) => {
      if (!Array.isArray(changes[collection][bucket])) {
        changes[collection][bucket] = [];
      }
    });
  }
  return changes;
};

export class ImportTransaction {
  constructor(type, description, semester) {
    this.id = `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.type = type; // 'schedule' | 'directory'
    this.description = description;
    this.semester = semester;
    this.timestamp = new Date().toISOString();
    this.status = 'preview'; // 'preview' | 'committed' | 'rolled_back' | 'partial' | 'failed' | 'failed_integrity'
    this.changes = createTrackedChanges();
    this.matchingIssues = [];
    this.validation = { errors: [], warnings: [] };
    // Structured import preprocessing report (within-batch dedupe, normalization, etc)
    this.preprocessReport = null;
    // Structured transaction validation report (schema + cross-ref checks)
    this.validationReport = null;
    this.previewSummary = null;
    this.entityResolutionReport = null;
    this.entityCleanupReport = null;
    this.originalData = {}; // Store original data for rollback
    this.importMetadata = {};
    this.rowLineage = [];
    this.stats = {
      totalChanges: 0,
      schedulesAdded: 0,
      peopleAdded: 0,
      roomsAdded: 0,
      peopleModified: 0
    };
    // Add metadata for database storage
    this.createdBy = 'system'; // Could be enhanced with user info
    this.lastModified = new Date().toISOString();
  }

  // Add a change to the transaction
  addChange(collection, action, newData, originalData = null, options = {}) {
    this.changes = ensureChangeBuckets(this.changes, collection);
    const change = {
      id: `change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      collection,
      action, // 'add' | 'modify' | 'delete'
      newData,
      originalData,
      timestamp: new Date().toISOString(),
      applied: false,
      groupKey: options.groupKey || null,
      pendingResolution: options.pendingResolution || false,
      matchIssueId: options.matchIssueId || null,
      importMeta: options.importMeta || null
    };

    this.changes[collection][action === 'add' ? 'added' : action === 'modify' ? 'modified' : 'deleted'].push(change);
    this.updateStats();
    this.lastModified = new Date().toISOString();
    return change.id;
  }

  addMatchIssue(issue) {
    const matchIssue = {
      id: `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: issue.type || 'person',
      importType: issue.importType || 'schedule',
      matchKey: issue.matchKey || '',
      reason: issue.reason || '',
      proposedPerson: issue.proposedPerson || {},
      candidates: Array.isArray(issue.candidates) ? issue.candidates : [],
      pendingPersonChangeId: issue.pendingPersonChangeId || null,
      scheduleChangeIds: Array.isArray(issue.scheduleChangeIds) ? issue.scheduleChangeIds : [],
      createdAt: new Date().toISOString()
    };
    this.matchingIssues.push(matchIssue);
    this.lastModified = new Date().toISOString();
    return matchIssue;
  }

  addRowLineage(entry) {
    if (!entry || typeof entry !== 'object') return;
    this.rowLineage.push(entry);
    this.lastModified = new Date().toISOString();
  }

  updateStats() {
    this.changes = ensureChangeBuckets(this.changes);
    const totalChanges = TRACKED_IMPORT_COLLECTIONS.reduce((total, collection) => {
      const buckets = this.changes[collection] || createChangeBuckets();
      return total + buckets.added.length + buckets.modified.length + buckets.deleted.length;
    }, 0);

    this.stats = {
      totalChanges,
      schedulesAdded: this.changes.schedules.added.length,
      peopleAdded: this.changes.people.added.length,
      roomsAdded: this.changes.rooms.added.length,
      coursesAdded: this.changes.courses.added.length,
      coursesModified: this.changes.courses.modified.length,
      termsAdded: this.changes.terms.added.length,
      termsModified: this.changes.terms.modified.length,
      peopleModified: this.changes.people.modified.length
    };
    this.lastModified = new Date().toISOString();
  }

  // Get summary of changes
  getSummary() {
    return {
      id: this.id,
      type: this.type,
      description: this.description,
      semester: this.semester,
      timestamp: this.timestamp,
      status: this.status,
      stats: this.stats,
      createdBy: this.createdBy,
      lastModified: this.lastModified
    };
  }

  // Get all changes in a flat list for UI display
  getAllChanges() {
    this.changes = ensureChangeBuckets(this.changes);
    const allChanges = [];

    const actionMap = {
      'added': 'add',
      'modified': 'modify',
      'deleted': 'delete'
    };

    TRACKED_IMPORT_COLLECTIONS.forEach(collection => {
      ['added', 'modified', 'deleted'].forEach(actionKey => {
        this.changes[collection][actionKey].forEach(change => {
          // Keep references to the underlying change objects so commit/rollback can
          // persist `applied` and `documentId` updates reliably.
          if (!change.collection) change.collection = collection;
          if (!change.action) change.action = actionMap[actionKey];
          allChanges.push(change);
        });
      });
    });

    // Sort chronologically
    return allChanges.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }

  // Convert to database format
  toFirestore() {
    return {
      id: this.id,
      type: this.type,
      description: this.description,
      semester: this.semester,
      timestamp: this.timestamp,
      status: this.status,
      changes: this.changes,
      matchingIssues: this.matchingIssues,
      validation: this.validation,
      preprocessReport: this.preprocessReport,
      validationReport: this.validationReport,
      previewSummary: this.previewSummary,
      entityResolutionReport: this.entityResolutionReport,
      entityCleanupReport: this.entityCleanupReport,
      originalData: this.originalData,
      importMetadata: this.importMetadata,
      rowLineage: this.rowLineage,
      stats: this.stats,
      importReport: this.importReport,
      createdBy: this.createdBy,
      lastModified: this.lastModified
    };
  }

  // Create from database format
  static fromFirestore(data) {
    const transaction = Object.assign(new ImportTransaction(), data);
    transaction.changes = ensureChangeBuckets(transaction.changes);
    if (!Array.isArray(transaction.matchingIssues)) {
      transaction.matchingIssues = [];
    }
    if (!transaction.validation || typeof transaction.validation !== 'object') {
      transaction.validation = { errors: [], warnings: [] };
    }
    if (!Array.isArray(transaction.validation.errors)) {
      transaction.validation.errors = [];
    }
    if (!Array.isArray(transaction.validation.warnings)) {
      transaction.validation.warnings = [];
    }
    if (transaction.preprocessReport === undefined) {
      transaction.preprocessReport = null;
    }
    if (transaction.validationReport === undefined) {
      transaction.validationReport = null;
    }
    if (!transaction.importMetadata || typeof transaction.importMetadata !== 'object') {
      transaction.importMetadata = {};
    }
    if (transaction.entityResolutionReport === undefined) {
      transaction.entityResolutionReport = null;
    }
    if (transaction.entityCleanupReport === undefined) {
      transaction.entityCleanupReport = null;
    }
    if (!Array.isArray(transaction.rowLineage)) {
      transaction.rowLineage = [];
    }
    return transaction;
  }
}
