// Import transaction model for tracking changes
export class ImportTransaction {
  constructor(type, description, semester) {
    this.id = `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.type = type; // 'schedule' | 'directory'
    this.description = description;
    this.semester = semester;
    this.timestamp = new Date().toISOString();
    this.status = 'preview'; // 'preview' | 'committed' | 'rolled_back' | 'partial' | 'failed' | 'failed_integrity'
    this.changes = {
      schedules: {
        added: [],
        modified: [],
        deleted: []
      },
      people: {
        added: [],
        modified: [],
        deleted: []
      },
      rooms: {
        added: [],
        modified: [],
        deleted: []
      }
    };
    this.matchingIssues = [];
    this.validation = { errors: [], warnings: [] };
    // Structured import preprocessing report (within-batch dedupe, normalization, etc)
    this.preprocessReport = null;
    // Structured transaction validation report (schema + cross-ref checks)
    this.validationReport = null;
    this.previewSummary = null;
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
    this.stats = {
      totalChanges:
        this.changes.schedules.added.length +
        this.changes.schedules.modified.length +
        this.changes.schedules.deleted.length +
        this.changes.people.added.length +
        this.changes.people.modified.length +
        this.changes.people.deleted.length +
        this.changes.rooms.added.length +
        this.changes.rooms.modified.length +
        this.changes.rooms.deleted.length,
      schedulesAdded: this.changes.schedules.added.length,
      peopleAdded: this.changes.people.added.length,
      roomsAdded: this.changes.rooms.added.length,
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
    const allChanges = [];

    const actionMap = {
      'added': 'add',
      'modified': 'modify',
      'deleted': 'delete'
    };

    ['schedules', 'people', 'rooms'].forEach(collection => {
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
    if (!Array.isArray(transaction.rowLineage)) {
      transaction.rowLineage = [];
    }
    return transaction;
  }
}
