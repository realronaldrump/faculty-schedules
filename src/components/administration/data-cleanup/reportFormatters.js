export const toArray = (value) => (Array.isArray(value) ? value : []);

export const formatTimestamp = (value) => {
  if (!value) return "Not run yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not run yet";
  return date.toLocaleString();
};

export const getPersonLabel = (person = {}) => {
  const explicitName = (person?.name || "").toString().trim();
  if (explicitName) return explicitName;
  const composedName = `${person?.firstName || ""} ${person?.lastName || ""}`.trim();
  if (composedName) return composedName;
  return person?.email || person?.id || "Unknown person";
};

export const getScheduleLabel = (schedule = {}) => {
  const term = schedule?.term || schedule?.termCode || "No term";
  const courseId = [schedule?.courseCode, schedule?.section].filter(Boolean).join(" ");
  if (courseId) return `${courseId} (${term})`;
  if (schedule?.courseTitle) return `${schedule.courseTitle} (${term})`;
  if (schedule?.id) return `Schedule ${schedule.id} (${term})`;
  return `Unlabeled schedule (${term})`;
};

export const getRoomLabel = (room = {}) =>
  room?.displayName || room?.spaceKey || room?.id || "Unknown room";

export const formatConfidence = (confidence) =>
  `${Math.round(Number(confidence || 0) * 100)}%`;

export const getDuplicatePairKey = (duplicate = {}) => {
  const [primary, secondary] = toArray(duplicate.records);
  return `${duplicate?.entityType || "unknown"}:${primary?.id || "none"}:${secondary?.id || "none"}`;
};

export const getSpaceRepairKey = (issue = {}) =>
  `repair-space:${issue?.record?.id || "unknown"}`;

export const getTeachingConflictKey = (conflict = {}) => {
  const [scheduleA, scheduleB] = toArray(conflict.schedules);
  return `teaching-conflict:${scheduleA?.id || "none"}:${scheduleB?.id || "none"}`;
};

export const getLegacyIssueKey = (issue = {}) =>
  `legacy:${issue?.recordType || "unknown"}:${issue?.record?.id || issue?.id || "unknown"}`;

export const buildBlockingCategories = (scanResult) => {
  if (!scanResult?.issues) return [];

  const orphaned = toArray(scanResult.issues.orphaned);
  const duplicates = scanResult.issues.duplicates || {};
  const scheduleDuplicates = toArray(duplicates.schedules).filter(
    (entry) => Number(entry?.confidence || 0) >= 0.98,
  );
  const peopleDuplicates = toArray(duplicates.people).filter(
    (entry) => Number(entry?.confidence || 0) >= 0.95,
  );
  const roomDuplicates = toArray(duplicates.rooms).filter(
    (entry) => Number(entry?.confidence || 0) >= 0.95,
  );
  const unresolvedImportIssues = toArray(scanResult.issues.unresolvedImportIssues);
  const teachingConflicts = toArray(scanResult.issues.teachingConflicts);
  const legacyModelIssues = toArray(scanResult.issues.legacyModelIssues);

  const orphanedInstructorReferences = orphaned.filter(
    (issue) => issue?.type === "orphaned_schedule",
  );
  const orphanedSpaceReferences = orphaned.filter(
    (issue) => issue?.type === "orphaned_space",
  );

  const highConfidenceDuplicates = [
    ...scheduleDuplicates.map((entry) => ({ ...entry, entityType: "schedules" })),
    ...peopleDuplicates.map((entry) => ({ ...entry, entityType: "people" })),
    ...roomDuplicates.map((entry) => ({ ...entry, entityType: "rooms" })),
  ];

  return [
    {
      id: "orphaned-instructors",
      label: "Missing instructor links",
      count: orphanedInstructorReferences.length,
      description: "Class records that are missing a valid instructor link.",
      items: orphanedInstructorReferences,
    },
    {
      id: "orphaned-spaces",
      label: "Missing room links",
      count: orphanedSpaceReferences.length,
      description: "Class records that point to room IDs that do not exist.",
      items: orphanedSpaceReferences,
    },
    {
      id: "high-confidence-duplicates",
      label: "Likely duplicate records",
      count: highConfidenceDuplicates.length,
      description: "Records that strongly appear to be duplicates and can cause noise.",
      items: highConfidenceDuplicates,
    },
    {
      id: "unresolved-import-issues",
      label: "Unfinished import decisions",
      count: unresolvedImportIssues.length,
      description: "Import transactions that still need link/create/exclude decisions.",
      items: unresolvedImportIssues,
    },
    {
      id: "teaching-conflicts",
      label: "Possible teaching overlaps",
      count: teachingConflicts.length,
      description: "Potential same-time teaching conflicts for instructors.",
      items: teachingConflicts,
    },
    {
      id: "legacy-model-issues",
      label: "Older field format records",
      count: legacyModelIssues.length,
      description: "Records still carrying legacy mirrored fields.",
      items: legacyModelIssues,
    },
  ];
};

export const getTotalBlockingIssues = (categories = []) =>
  categories.reduce((total, item) => total + Number(item?.count || 0), 0);

export const getSafeFixableCount = (scanResult) => {
  if (!scanResult?.autoFixable) return 0;
  const auto = scanResult.autoFixable;
  return (
    Number(auto.highConfidencePeopleDuplicates || 0) +
    Number(auto.highConfidenceScheduleDuplicates || 0) +
    Number(auto.highConfidenceRoomDuplicates || 0) +
    Number(auto.orphanedSchedulesWithName || 0) +
    Number(auto.orphanedSpaceLinks || 0) +
    Number(auto.legacyModelIssues || 0)
  );
};

const buildSummary = (title, items = [], nextStep = "") => ({
  title,
  items,
  nextStep,
});

export const summarizeScanResult = (scanResult) => {
  if (!scanResult) return null;
  const issues = Number(scanResult?.summary?.blockingIssues || 0);
  const items = [
    { label: "Needs manual decisions", value: issues },
    { label: "People records", value: Number(scanResult?.counts?.people || 0) },
    { label: "Class records", value: Number(scanResult?.counts?.schedules || 0) },
    { label: "Room records", value: Number(scanResult?.counts?.rooms || 0) },
  ];
  const nextStep =
    issues === 0
      ? "No blocking issues found. Routine cleanup is complete."
      : "Run the safe fixes, then review any remaining decision items.";
  return buildSummary("Data check complete", items, nextStep);
};

export const summarizeSafeFixPlan = (scanResult) => {
  if (!scanResult?.autoFixable) return null;
  const auto = scanResult.autoFixable;
  const items = [
    {
      label: "People duplicates to merge",
      value: Number(auto.highConfidencePeopleDuplicates || 0),
    },
    {
      label: "Schedule duplicates to merge",
      value: Number(auto.highConfidenceScheduleDuplicates || 0),
    },
    {
      label: "Room duplicates to merge",
      value: Number(auto.highConfidenceRoomDuplicates || 0),
    },
    {
      label: "Instructor links to backfill",
      value: Number(auto.orphanedSchedulesWithName || 0),
    },
    {
      label: "Room links to repair",
      value: Number(auto.orphanedSpaceLinks || 0),
    },
    {
      label: "Legacy-format records to normalize",
      value: Number(auto.legacyModelIssues || 0),
    },
  ];
  const total = items.reduce((sum, item) => sum + Number(item.value || 0), 0);
  return buildSummary(
    "Safe fix preview",
    [{ label: "Estimated records to touch", value: total }, ...items],
    total > 0
      ? "Run Safe Fixes to apply these repairs automatically."
      : "No safe repairs are currently needed.",
  );
};

export const summarizeSafeFixResult = (result) => {
  if (!result) return null;
  const items = [
    { label: "People duplicates merged", value: Number(result?.duplicates?.peopleMerged || 0) },
    {
      label: "Schedule duplicates merged",
      value: Number(result?.duplicates?.schedulesMerged || 0),
    },
    { label: "Room duplicates merged", value: Number(result?.duplicates?.roomsMerged || 0) },
    {
      label: "Instructor links repaired",
      value: Number(result?.instructorLinks?.linked || 0),
    },
    { label: "Legacy records fixed", value: Number(result?.legacyModel?.fixed || 0) },
    { label: "Total records updated", value: Number(result?.totalFixed || 0) },
  ];
  const nextStep =
    Number(result?.errors?.length || 0) > 0
      ? "Some items still need review. Open technical details for exact errors."
      : "Safe repairs completed. Review any remaining decision items below.";
  return buildSummary("Safe repair run complete", items, nextStep);
};

export const summarizeBaselineReport = (report) => {
  if (!report) return null;
  const items = [
    {
      label: "Terms processed",
      value: Number(report?.summary?.totalTermsProcessed || 0),
    },
    {
      label: "Schedules processed",
      value: Number(report?.summary?.totalSchedulesProcessed || 0),
    },
    {
      label: "Identity repairs",
      value: Number(report?.summary?.identityBackfillUpdated || 0),
    },
    {
      label: "Blockers",
      value: Number(report?.summary?.blockerCount || 0),
    },
  ];
  const blockerCount = Number(report?.summary?.blockerCount || 0);
  const nextStep =
    blockerCount > 0
      ? "Review blocker details before running more advanced repairs."
      : "Baseline is clean. Continue only if new issues appear.";
  return buildSummary("Baseline repair complete", items, nextStep);
};

export const summarizeTermRepairReport = (report, termCode = "") => {
  if (!report) return null;
  const items = [
    { label: "Term", value: termCode || report?.termCodes?.[0] || "Unknown" },
    {
      label: "Schedules updated",
      value: Number(report?.spaceLinkRepairs?.schedulesUpdated || 0),
    },
    {
      label: "Rooms updated",
      value: Number(report?.spaceLinkRepairs?.roomsUpdated || 0),
    },
    {
      label: "Duplicates merged",
      value: Number(report?.scheduleDuplicatesMerged || 0),
    },
  ];
  const blockerCount = toArray(report?.blockers).length;
  const nextStep =
    blockerCount > 0
      ? "Check blockers in technical details before repeating this repair."
      : "Term repair finished successfully.";
  return buildSummary("Term repair complete", items, nextStep);
};

export const summarizeLocationPreview = (preview) => {
  if (!preview) return null;
  const items = [
    {
      label: "Rooms missing keys",
      value: Number(preview?.rooms?.missingSpaceKey?.length || 0),
    },
    {
      label: "Invalid room keys",
      value: Number(preview?.rooms?.invalidSpaceKey?.length || 0),
    },
    {
      label: "Schedules missing room IDs",
      value: Number(preview?.schedules?.missingSpaceIds?.length || 0),
    },
    {
      label: "People missing office room IDs",
      value: Number(preview?.people?.missingOfficeSpaceId?.length || 0),
    },
  ];
  return buildSummary(
    "Location preview ready",
    items,
    "Review the counts, then apply migration only if the preview looks correct.",
  );
};

export const summarizeLocationApplyReport = (report) => {
  if (!report) return null;
  const items = [
    { label: "Rooms updated", value: Number(report?.roomsUpdated || 0) },
    { label: "Rooms created", value: Number(report?.roomsSeeded || 0) },
    { label: "Schedules updated", value: Number(report?.schedulesUpdated || 0) },
    { label: "People updated", value: Number(report?.peopleUpdated || 0) },
  ];
  const errorCount = toArray(report?.errors).length;
  const nextStep =
    errorCount > 0
      ? "Some location updates failed. Review technical details before running again."
      : "Location migration completed successfully.";
  return buildSummary("Location migration complete", items, nextStep);
};

export const summarizeOrphanScan = (scan, termLabel = "") => {
  if (!scan) return null;
  const items = [
    { label: "Term", value: termLabel || "Selected term" },
    { label: "Orphaned schedules", value: Number(scan?.schedules?.length || 0) },
    { label: "Orphaned people", value: Number(scan?.people?.length || 0) },
    { label: "Orphaned rooms", value: Number(scan?.rooms?.length || 0) },
    { label: "Total records", value: Number(scan?.total || 0) },
  ];
  const nextStep =
    Number(scan?.total || 0) > 0
      ? "If this looks correct, confirm cleanup to remove these records."
      : "No orphaned records found for this term.";
  return buildSummary("Orphan scan complete", items, nextStep);
};

export const summarizeOrphanCleanup = (result, termLabel = "") => {
  if (!result) return null;
  const items = [
    { label: "Term", value: termLabel || "Selected term" },
    { label: "Deleted records", value: Number(result?.deleted || 0) },
    { label: "Errors", value: Number(result?.errors || 0) },
  ];
  const nextStep =
    Number(result?.errors || 0) > 0
      ? "Some records could not be deleted. Review technical details."
      : "Cleanup finished. Run one more scan to confirm everything is clear.";
  return buildSummary("Orphan cleanup complete", items, nextStep);
};
