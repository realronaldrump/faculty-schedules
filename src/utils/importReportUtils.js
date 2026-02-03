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

  return {
    withinBatchDuplicates,
    withinBatchMerged: previewSummary.withinBatchMerged || 0,
    matchedExisting: schedulesUpdated,
    identityKeysGenerated: countIdentityKeys(transaction)
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
  if (message.includes('no email or name')) return 'missing_identity';
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

/**
 * Generate a compact one-line summary
 *
 * @param {Object} report - Report from generateImportReport
 * @returns {string} Single-line summary
 */
export const formatImportReportOneLine = (report) => {
  if (!report || report.error) {
    return `Import failed: ${report?.error || 'Unknown error'}`;
  }

  const parts = [];

  if (report.summary.schedulesAdded > 0) {
    parts.push(`+${report.summary.schedulesAdded} schedules`);
  }
  if (report.summary.schedulesModified > 0) {
    parts.push(`~${report.summary.schedulesModified} updated`);
  }
  if (report.summary.peopleAdded > 0) {
    parts.push(`+${report.summary.peopleAdded} people`);
  }
  if (report.summary.roomsAdded > 0) {
    parts.push(`+${report.summary.roomsAdded} rooms`);
  }
  if (report.validation?.errorCount > 0) {
    parts.push(`${report.validation.errorCount} errors`);
  }
  if (report.validation?.warningCount > 0) {
    parts.push(`${report.validation.warningCount} warnings`);
  }

  if (parts.length === 0) {
    return `Import ${report.status}: No changes`;
  }

  return `Import ${report.status}: ${parts.join(', ')}`;
};

/**
 * Generate a report suitable for UI display
 *
 * @param {Object} report - Report from generateImportReport
 * @returns {Object} UI-friendly report structure
 */
export const formatImportReportForUI = (report) => {
  if (!report || report.error) {
    return {
      status: 'error',
      message: report?.error || 'Unknown error',
      sections: []
    };
  }

  const sections = [];

  // Summary section
  sections.push({
    title: 'Summary',
    type: 'stats',
    items: [
      { label: 'Schedules Added', value: report.summary.schedulesAdded, color: 'green' },
      { label: 'Schedules Updated', value: report.summary.schedulesModified, color: 'blue' },
      { label: 'Schedules Unchanged', value: report.summary.schedulesUnchanged, color: 'gray' },
      { label: 'People Added', value: report.summary.peopleAdded, color: 'green' },
      { label: 'People Updated', value: report.summary.peopleModified, color: 'blue' },
      { label: 'Rooms Added', value: report.summary.roomsAdded, color: 'green' }
    ]
  });

  // Validation section
  if (report.validation?.errorCount > 0 || report.validation?.warningCount > 0) {
    sections.push({
      title: 'Validation',
      type: 'alerts',
      items: [
        ...(report.validation.errors || []).map(e => ({
          type: 'error',
          message: e.message || e
        })),
        ...(report.validation.warnings || []).slice(0, 10).map(w => ({
          type: 'warning',
          message: w.message || w
        }))
      ]
    });
  }

  // Match issues section
  if (report.matchResolution?.total > 0) {
    sections.push({
      title: 'Match Resolution',
      type: 'info',
      items: [
        { label: 'Total Issues', value: report.matchResolution.total },
        { label: 'Resolved', value: report.matchResolution.resolved },
        { label: 'Pending', value: report.matchResolution.pending }
      ]
    });
  }

  return {
    status: report.status,
    message: formatImportReportOneLine(report),
    semester: report.semester,
    timestamp: report.timestamp,
    sections
  };
};
