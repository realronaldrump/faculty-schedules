export const toArray = (value) => (Array.isArray(value) ? value : []);

const formatTimestamp = (value) => {
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
      label: "Classes missing instructor links",
      count: orphanedInstructorReferences.length,
      description: "Classes that need the correct instructor selected.",
      items: orphanedInstructorReferences,
    },
    {
      id: "orphaned-spaces",
      label: "Classes missing room links",
      count: orphanedSpaceReferences.length,
      description: "Classes that need their room connection refreshed.",
      items: orphanedSpaceReferences,
    },
    {
      id: "high-confidence-duplicates",
      label: "Possible duplicates",
      count: highConfidenceDuplicates.length,
      description: "Entries that may be the same person, class, or room.",
      items: highConfidenceDuplicates,
    },
    {
      id: "unresolved-import-issues",
      label: "Imported names to match",
      count: unresolvedImportIssues.length,
      description: "Imported people that need to be matched or skipped.",
      items: unresolvedImportIssues,
    },
    {
      id: "teaching-conflicts",
      label: "Possible schedule overlaps",
      count: teachingConflicts.length,
      description: "Classes that may overlap for the same instructor.",
      items: teachingConflicts,
    },
    {
      id: "legacy-model-issues",
      label: "Older data format",
      count: legacyModelIssues.length,
      description: "Entries saved in an older format that can usually be refreshed.",
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

const getDecisionCount = (totalBlockingIssues = 0, safeFixableCount = 0) =>
  Math.max(0, Number(totalBlockingIssues || 0) - Number(safeFixableCount || 0));

export const DATA_HEALTH_STATES = {
  checking: "checking",
  cleanupReady: "cleanupReady",
  cleaning: "cleaning",
  needsChoice: "needsChoice",
  allClear: "allClear",
  error: "error",
};

export const buildDataHealthViewModel = ({
  scanResult,
  safeFixResult,
  isScanning = false,
  isFixingSafe = false,
  safeFixableCount = 0,
  totalBlockingIssues = 0,
  lastRunError = "",
} = {}) => {
  const routineCount = Number(safeFixableCount || 0);
  const decisionCount = getDecisionCount(totalBlockingIssues, routineCount);
  const checkedAt = formatTimestamp(scanResult?.timestamp);
  const hasCleanupResult = Boolean(safeFixResult);
  const errorMessage = (lastRunError || "").toString().trim();

  const metrics = scanResult
    ? [
        {
          label: "Routine cleanup",
          value: routineCount > 0 ? routineCount : "None",
        },
        {
          label: "Needs your choice",
          value: decisionCount > 0 ? decisionCount : "None",
        },
        {
          label: "Last checked",
          value: checkedAt,
        },
      ]
    : [
        {
          label: "Status",
          value: "Starting automatically",
        },
      ];

  if (errorMessage) {
    return {
      state: DATA_HEALTH_STATES.error,
      title: "Could not finish",
      eyebrow: "Data Health Check",
      description:
        "Nothing was changed. Try the check again, and use the troubleshooting details if this keeps happening.",
      primaryAction: "scan",
      primaryLabel: "Try again",
      metrics,
      decisionCount,
      routineCount,
      checkedAt,
      errorMessage,
      hasCleanupResult,
    };
  }

  if (isFixingSafe) {
    return {
      state: DATA_HEALTH_STATES.cleaning,
      title: "Cleaning up routine items",
      eyebrow: "Data Health Check",
      description:
        "The app is handling routine cleanup now. It will check everything again when it finishes.",
      primaryAction: null,
      primaryLabel: "Cleaning...",
      metrics,
      decisionCount,
      routineCount,
      checkedAt,
      hasCleanupResult,
    };
  }

  if (isScanning || !scanResult) {
    return {
      state: DATA_HEALTH_STATES.checking,
      title: "Checking your data",
      eyebrow: "Data Health Check",
      description:
        "The app is looking for routine cleanup it can handle and anything that needs your choice.",
      primaryAction: null,
      primaryLabel: "Checking...",
      metrics,
      decisionCount,
      routineCount,
      checkedAt,
      hasCleanupResult,
    };
  }

  if (routineCount > 0) {
    return {
      state: DATA_HEALTH_STATES.cleanupReady,
      title: "Routine cleanup available",
      eyebrow: "Data Health Check",
      description:
        "The app found items it can clean up for you. Review is not needed for this step.",
      primaryAction: "cleanup",
      primaryLabel: "Clean up routine items",
      metrics,
      decisionCount,
      routineCount,
      checkedAt,
      hasCleanupResult,
    };
  }

  if (decisionCount > 0) {
    return {
      state: DATA_HEALTH_STATES.needsChoice,
      title: "Needs your choice",
      eyebrow: "Data Health Check",
      description:
        "Routine cleanup is done. A few items need a person to choose the right answer.",
      primaryAction: "scan",
      primaryLabel: "Check again",
      metrics,
      decisionCount,
      routineCount,
      checkedAt,
      hasCleanupResult,
    };
  }

  return {
    state: DATA_HEALTH_STATES.allClear,
    title: "All clear",
    eyebrow: "Data Health Check",
    description:
      "Everything looks ready. You can check again any time after imports or schedule updates.",
    primaryAction: "scan",
    primaryLabel: "Check again",
    metrics,
    decisionCount,
    routineCount,
    checkedAt,
    hasCleanupResult,
  };
};

export const buildDecisionCategoryViewModels = (categories = []) =>
  categories
    .filter((category) => Number(category?.count || 0) > 0)
    .map((category) => ({
      id: category.id,
      label: category.label,
      count: Number(category.count || 0),
      description: category.description,
      items: toArray(category.items),
    }));

const buildSummary = (title, items = [], nextStep = "") => ({
  title,
  items,
  nextStep,
});

export const summarizeBaselinePreview = (report) => {
  if (!report) return null;
  const items = [
    {
      label: "Terms in scope",
      value: Number(report?.summary?.totalTermsProcessed || 0),
    },
    {
      label: "Schedules in scope",
      value: Number(report?.summary?.totalSchedulesProcessed || 0),
    },
    {
      label: "Identity updates planned",
      value: Number(report?.summary?.identityBackfillWouldUpdate || 0),
    },
    {
      label: "Rooms to create",
      value: Number(report?.summary?.roomsCreated || 0),
    },
    {
      label: "Schedule links to update",
      value: Number(report?.summary?.schedulesSpaceRepaired || 0),
    },
    {
      label: "Schedule merges planned",
      value: Number(report?.summary?.scheduleDuplicatesWouldMerge || 0),
    },
  ];
  return buildSummary(
    "Full data refresh preview ready",
    items,
    "If these counts look right, run the full data refresh.",
  );
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
      label: "Identity updates",
      value: Number(report?.summary?.identityBackfillUpdated || 0),
    },
    {
      label: "Items to review",
      value: Number(report?.summary?.blockerCount || 0),
    },
  ];
  const blockerCount = Number(report?.summary?.blockerCount || 0);
  const nextStep =
    blockerCount > 0
      ? "Review troubleshooting details before running more support tools."
      : "Full data refresh finished. Continue only if new issues appear.";
  return buildSummary("Full data refresh complete", items, nextStep);
};

export const summarizeTermRepairPreview = (report, termCode = "") => {
  if (!report) return null;
  const items = [
    { label: "Term", value: termCode || report?.termCodes?.[0] || "Unknown" },
    {
      label: "Rooms to create",
      value: Number(report?.roomsCreated || 0),
    },
    {
      label: "Schedule links to update",
      value: Number(report?.spaceLinkRepairs?.schedulesUpdated || 0),
    },
    {
      label: "Room entries to refresh",
      value: Number(report?.spaceLinkRepairs?.roomsUpdated || 0),
    },
    {
      label: "Schedule merges planned",
      value: Number(report?.scheduleDuplicatesWouldMerge || 0),
    },
    {
      label: "Cross-list links to update",
      value: Number(report?.crossListAutoLink?.schedulesUpdated || 0),
    },
  ];
  return buildSummary(
    "Term refresh preview ready",
    items,
    "If these counts look correct, refresh the selected term.",
  );
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
      ? "Check troubleshooting details before refreshing this term again."
      : "Term refresh finished.";
  return buildSummary("Term refresh complete", items, nextStep);
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
    "Room link preview ready",
    items,
    "Review the counts, then update room links only if the preview looks correct.",
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
      ? "Some room link updates could not finish. Check details before running again."
      : "Room links updated successfully.";
  return buildSummary("Room link update complete", items, nextStep);
};

export const summarizeOrphanScan = (scan, termLabel = "") => {
  if (!scan) return null;
  const items = [
    { label: "Term", value: termLabel || "Selected term" },
    { label: "Unused classes", value: Number(scan?.schedules?.length || 0) },
    { label: "Unused people", value: Number(scan?.people?.length || 0) },
    { label: "Unused rooms", value: Number(scan?.rooms?.length || 0) },
    { label: "Total items", value: Number(scan?.total || 0) },
  ];
  const nextStep =
    Number(scan?.total || 0) > 0
      ? "If this looks correct, confirm cleanup to remove these unused imported items."
      : "No unused imported items found for this term.";
  return buildSummary("Unused imported items check complete", items, nextStep);
};

export const summarizeOrphanCleanup = (result, termLabel = "") => {
  if (!result) return null;
  const items = [
    { label: "Term", value: termLabel || "Selected term" },
    { label: "Removed items", value: Number(result?.deleted || 0) },
    { label: "Errors", value: Number(result?.errors || 0) },
  ];
  const nextStep =
    Number(result?.errors || 0) > 0
      ? "Some items could not be removed. Check details for the failures."
      : "Cleanup finished. Run one more scan to confirm everything is clear.";
  return buildSummary("Unused imported items removed", items, nextStep);
};
