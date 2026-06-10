/**
 * Import Report Utils
 *
 * Generate structured reports of import operations for visibility and debugging.
 * Provides both machine-readable reports and human-readable console output.
 */

/**
 * Generate a comprehensive import report from a completed transaction
 *
 * @param {ImportTransaction} transaction - Completed transaction
 * @returns {Object} Structured report
 */
export const generateImportReport = (transaction) => {
  if (!transaction) {
    return { error: 'No transaction provided' };
  }

  const report = {
    id: transaction.id,
    timestamp: transaction.timestamp,
    semester: transaction.semester,
    type: transaction.type,
    status: transaction.status,
    description: transaction.description,

    summary: buildSummary(transaction),
    normalization: buildNormalizationReport(transaction),
    duplicatePrevention: buildDuplicatePreventionReport(transaction),
    entityResolution: buildEntityResolutionReport(transaction),
    entityCleanup: buildEntityCleanupReport(transaction),
    validation: buildValidationReport(transaction),
    matchResolution: buildMatchResolutionReport(transaction),
    lineage: buildLineageReport(transaction)
  };

  return report;
};

/**
 * Build summary section
 */
const buildSummary = (transaction) => {
  const stats = transaction.stats || {};
  const changes = transaction.changes || {};

  return {
    totalChanges: stats.totalChanges || 0,
    schedulesAdded: stats.schedulesAdded || 0,
    schedulesModified: changes.schedules?.modified?.length || 0,
    schedulesDeleted: changes.schedules?.deleted?.length || 0,
    schedulesUnchanged: transaction.previewSummary?.schedulesUnchanged || 0,
    schedulesMetadataOnly: transaction.previewSummary?.schedulesMetadataOnly || 0,
    peopleAdded: stats.peopleAdded || 0,
    peopleModified: stats.peopleModified || 0,
    peopleDeleted: changes.people?.deleted?.length || 0,
    roomsAdded: stats.roomsAdded || 0,
    roomsModified: changes.rooms?.modified?.length || 0,
    roomsDeleted: changes.rooms?.deleted?.length || 0,
    matchIssuesCount: transaction.matchingIssues?.length || 0
  };
};

/**
 * Build normalization report
 */
const buildNormalizationReport = (transaction) => {
  const previewSummary = transaction.previewSummary || {};
  const metadata = transaction.importMetadata || {};

  // Count skipped rows by reason
  const skippedReasons = {};
  const validation = transaction.validation || {};

  (validation.warnings || []).forEach(warning => {
    if (warning.message?.includes('Skipped')) {
      const reason = extractSkipReason(warning.message);
      skippedReasons[reason] = (skippedReasons[reason] || 0) + 1;
    }
  });

  return {
    rowsProcessed: previewSummary.rowsProcessed || metadata.rowCount || 0,
    rowsValid: previewSummary.rowsValid || 0,
    rowsSkipped: previewSummary.rowsSkipped || 0,
    rowsInvalid: previewSummary.rowsInvalid || 0,
    skippedReasons
  };
};

/**
 * Build duplicate prevention report
 */
const buildDuplicatePreventionReport = (transaction) => {
  const previewSummary = transaction.previewSummary || {};
  const validation = transaction.validation || {};

  // Count within-batch duplicates from warnings
  let withinBatchDuplicates = 0;
  (validation.warnings || []).forEach(warning => {
    if (warning.type === 'within_batch_duplicate') {
      withinBatchDuplicates++;
    }
  });

  // Count matched existing records
  const schedulesUpdated = transaction.changes?.schedules?.modified?.length || 0;
  const peopleMatchedExisting = transaction.entityResolutionReport?.personCreatesMatchedExisting || 0;

  return {
    withinBatchDuplicates,
    withinBatchMerged: previewSummary.withinBatchMerged || 0,
    matchedExisting: schedulesUpdated + peopleMatchedExisting,
    identityKeysGenerated: countIdentityKeys(transaction)
  };
};

const buildEntityResolutionReport = (transaction) => {
  const report = transaction.entityResolutionReport || {};
  return {
    personCreatesMatchedExisting: report.personCreatesMatchedExisting || 0,
    deterministicPersonCreates: report.deterministicPersonCreates || 0,
    duplicateCreateChangesSuppressed: report.duplicateCreateChangesSuppressed || 0,
    existingPersonIdentityCollisions: report.existingPersonIdentityCollisions || 0,
    courseUpserts: report.courseUpserts || 0,
    personMergeUpdates: Array.isArray(report.personMergeUpdates)
      ? report.personMergeUpdates.slice(0, 20)
      : []
  };
};

const buildEntityCleanupReport = (transaction) => {
  const report = transaction.entityCleanupReport || {};
  return {
    mode: report.mode || '',
    peopleDuplicatesDetected: report.peopleDuplicatesDetected || 0,
    peopleDuplicatesMerged: report.peopleDuplicatesMerged || 0,
    peopleDuplicatesWouldMerge: report.peopleDuplicatesWouldMerge || 0,
    peopleDuplicatesFlagged: report.peopleDuplicatesFlagged || 0,
    roomDuplicatesDetected: report.roomDuplicatesDetected || 0,
    roomDuplicatesMerged: report.roomDuplicatesMerged || 0,
    roomDuplicatesWouldMerge: report.roomDuplicatesWouldMerge || 0,
    roomDuplicatesFlagged: report.roomDuplicatesFlagged || 0,
    error: report.error || ''
  };
};

/**
 * Build validation report section
 */
const buildValidationReport = (transaction) => {
  const validation = transaction.validation || {};

  return {
    errorCount: validation.errors?.length || 0,
    warningCount: validation.warnings?.length || 0,
    errors: (validation.errors || []).slice(0, 10), // Limit to first 10
    warnings: (validation.warnings || []).slice(0, 20), // Limit to first 20
    summary: validation.summary || {}
  };
};

/**
 * Build match resolution report
 */
const buildMatchResolutionReport = (transaction) => {
  const matchingIssues = transaction.matchingIssues || [];

  const resolved = matchingIssues.filter(i => i.resolved).length;
  const pending = matchingIssues.filter(i => !i.resolved).length;

  const byType = {};
  matchingIssues.forEach(issue => {
    const type = issue.type || 'unknown';
    byType[type] = (byType[type] || 0) + 1;
  });

  return {
    total: matchingIssues.length,
    resolved,
    pending,
    byType,
    issues: matchingIssues.slice(0, 10) // Limit to first 10
  };
};

/**
 * Build lineage report
 */
const buildLineageReport = (transaction) => {
  const rowLineage = transaction.rowLineage || [];
  const metadata = transaction.importMetadata || {};

  // Count actions
  const actionCounts = {};
  rowLineage.forEach(entry => {
    const action = entry.action || 'unknown';
    actionCounts[action] = (actionCounts[action] || 0) + 1;
  });

  return {
    importRunId: transaction.id,
    rowLineageCount: rowLineage.length,
    fileHash: metadata.fileHash || null,
    rowHashCount: metadata.rowHashes?.length || 0,
    actionCounts
  };
};

/**
 * Count identity keys in transaction
 */
const countIdentityKeys = (transaction) => {
  let count = 0;

  (transaction.changes?.schedules?.added || []).forEach(change => {
    if (change.newData?.identityKey) count++;
  });
  (transaction.changes?.people?.added || []).forEach(change => {
    if (change.newData?.identityKey) count++;
  });

  return count;
};

/**
 * Extract skip reason from warning message
 */
const extractSkipReason = (message) => {
  if (message.includes('missing course code')) return 'missing_course_code';
  if (message.includes('missing section')) return 'missing_section';
  if (message.includes('cancelled')) return 'cancelled_status';
  if (message.includes('invalid')) return 'invalid_data';
  if (message.includes('no email or name') || message.includes('no email, name, or external ID')) {
    return 'missing_identity';
  }
  return 'other';
};

/**
 * Format report for console logging (human-readable)
 *
 * @param {Object} report - Report from generateImportReport
 * @returns {string} Formatted text output
 */
export const formatImportReportForLog = (report) => {
  if (!report || report.error) {
    return `Import Report Error: ${report?.error || 'Unknown error'}`;
  }

  const lines = [
    '',
    '═══════════════════════════════════════════════════════════════',
    `  IMPORT REPORT: ${report.id}`,
    '═══════════════════════════════════════════════════════════════',
    `  Semester: ${report.semester || 'N/A'}`,
    `  Type: ${report.type || 'N/A'}`,
    `  Status: ${report.status || 'N/A'}`,
    `  Timestamp: ${report.timestamp || 'N/A'}`,
    '───────────────────────────────────────────────────────────────',
    '',
    '  SUMMARY',
    '  -------',
    `  Schedules: ${report.summary.schedulesAdded} added, ${report.summary.schedulesModified} modified, ${report.summary.schedulesUnchanged} unchanged`,
    `  People: ${report.summary.peopleAdded} added, ${report.summary.peopleModified} modified`,
    `  Rooms: ${report.summary.roomsAdded} added`,
    `  Match Issues: ${report.summary.matchIssuesCount}`,
    ''
  ];

  // Normalization section
  if (report.normalization) {
    lines.push('  NORMALIZATION');
    lines.push('  -------------');
    lines.push(`  Rows processed: ${report.normalization.rowsProcessed}`);
    lines.push(`  Rows valid: ${report.normalization.rowsValid}`);
    lines.push(`  Rows skipped: ${report.normalization.rowsSkipped}`);

    if (Object.keys(report.normalization.skippedReasons).length > 0) {
      lines.push('  Skip reasons:');
      for (const [reason, count] of Object.entries(report.normalization.skippedReasons)) {
        lines.push(`    - ${reason}: ${count}`);
      }
    }
    lines.push('');
  }

  // Duplicate prevention section
  if (report.duplicatePrevention) {
    lines.push('  DUPLICATE PREVENTION');
    lines.push('  --------------------');
    lines.push(`  Within-batch duplicates: ${report.duplicatePrevention.withinBatchDuplicates}`);
    lines.push(`  Matched existing records: ${report.duplicatePrevention.matchedExisting}`);
    lines.push(`  Identity keys generated: ${report.duplicatePrevention.identityKeysGenerated}`);
    lines.push('');
  }

  if (report.entityResolution) {
    lines.push('  ENTITY RESOLUTION');
    lines.push('  -----------------');
    lines.push(`  Person creates matched existing: ${report.entityResolution.personCreatesMatchedExisting}`);
    lines.push(`  Deterministic person creates: ${report.entityResolution.deterministicPersonCreates}`);
    lines.push(`  Course records upserted: ${report.entityResolution.courseUpserts}`);
    lines.push('');
  }

  if (report.entityCleanup) {
    const isPreview = report.entityCleanup.mode === 'preview';
    lines.push(isPreview ? '  ENTITY CLEANUP PREVIEW' : '  ENTITY CLEANUP');
    lines.push(isPreview ? '  ----------------------' : '  --------------');
    if (report.entityCleanup.mode) {
      lines.push(`  Mode: ${report.entityCleanup.mode}`);
    }
    lines.push(`  People duplicate candidates: ${report.entityCleanup.peopleDuplicatesWouldMerge}`);
    if (!isPreview) {
      lines.push(`  People duplicates merged: ${report.entityCleanup.peopleDuplicatesMerged}`);
    }
    lines.push(`  People duplicates flagged: ${report.entityCleanup.peopleDuplicatesFlagged}`);
    lines.push(`  Room duplicate candidates: ${report.entityCleanup.roomDuplicatesWouldMerge}`);
    if (!isPreview) {
      lines.push(`  Room duplicates merged: ${report.entityCleanup.roomDuplicatesMerged}`);
    }
    lines.push(`  Room duplicates flagged: ${report.entityCleanup.roomDuplicatesFlagged}`);
    if (isPreview) {
      lines.push('  Apply duplicate decisions from Data Health Check.');
    }
    if (report.entityCleanup.error) {
      lines.push(`  Cleanup error: ${report.entityCleanup.error}`);
    }
    lines.push('');
  }

  // Validation section
  if (report.validation) {
    lines.push('  VALIDATION');
    lines.push('  ----------');
    lines.push(`  Errors: ${report.validation.errorCount}`);
    lines.push(`  Warnings: ${report.validation.warningCount}`);

    if (report.validation.errors?.length > 0) {
      lines.push('  Errors (first 5):');
      report.validation.errors.slice(0, 5).forEach(e => {
        lines.push(`    ❌ ${e.message || e}`);
      });
    }

    if (report.validation.warnings?.length > 0) {
      lines.push('  Warnings (first 5):');
      report.validation.warnings.slice(0, 5).forEach(w => {
        lines.push(`    ⚠️  ${w.message || w}`);
      });
    }
    lines.push('');
  }

  // Match resolution section
  if (report.matchResolution && report.matchResolution.total > 0) {
    lines.push('  MATCH RESOLUTION');
    lines.push('  ----------------');
    lines.push(`  Total issues: ${report.matchResolution.total}`);
    lines.push(`  Resolved: ${report.matchResolution.resolved}`);
    lines.push(`  Pending: ${report.matchResolution.pending}`);
    lines.push('');
  }

  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');

  return lines.join('\n');
};
