import React from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  formatConfidence,
  getDuplicatePairKey,
  getLegacyIssueKey,
  getPersonLabel,
  getRoomLabel,
  getScheduleLabel,
  getSpaceRepairKey,
  getTeachingConflictKey,
  toArray,
} from "./reportFormatters";

const DecisionReviewSection = ({
  scanResult,
  blockingCategories,
  totalBlockingIssues,
  expandedCategories,
  pendingActionKey,
  pendingMergeConfirmationKey,
  isFixingSafe,
  onToggleCategory,
  onRunSafeFix,
  onMergeDuplicate,
  onMarkDuplicateAsDistinct,
  onRepairSpaceIssue,
  onMarkConflictAsDistinct,
  onCopyValue,
}) => {
  const navigate = useNavigate();

  const openImportWizard = (transactionId, view = "resolve") => {
    const params = new URLSearchParams();
    if (transactionId) params.set("transaction", transactionId);
    params.set("view", view);
    navigate(`/admin-tools/import-wizard?${params.toString()}`);
  };

  const importStatusLabel = (status = "") => {
    switch ((status || "").toString().trim()) {
      case "preview":
        return "Preview Pending";
      case "partial":
        return "Partially Applied";
      case "failed":
        return "Failed";
      case "failed_integrity":
        return "Integrity Finalization Failed";
      default:
        return "Needs Review";
    }
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 text-baylor-gold" />
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            3. Review items needing decisions
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            Each item below should have a clear action button. Work top-to-bottom
            and resolve what safe fixes cannot handle automatically.
          </p>
        </div>
      </div>

      {scanResult ? (
        <div className="mt-4 space-y-3">
          {totalBlockingIssues > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {totalBlockingIssues} item{totalBlockingIssues === 1 ? "" : "s"} still need
              decisions. Use the action buttons in each card.
            </div>
          )}
          {blockingCategories
            .filter((category) => category.count > 0)
            .map((category) => {
              const isExpanded = expandedCategories[category.id] ?? true;
              return (
                <div
                  key={category.id}
                  className="rounded-lg border border-gray-200 bg-gray-50 p-3"
                >
                  <button
                    type="button"
                    onClick={() => onToggleCategory(category.id)}
                    className="flex w-full flex-col gap-2 text-left sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="text-sm font-semibold text-gray-900">
                        {category.label}
                      </div>
                      <div className="mt-0.5 text-xs text-gray-600">
                        {category.description}
                      </div>
                    </div>
                    <div className="inline-flex items-center gap-2 text-sm font-medium text-gray-700">
                      {category.count} item{category.count === 1 ? "" : "s"}
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="mt-3 space-y-2">
                      {category.items.map((item, index) => {
                        if (category.id === "orphaned-instructors") {
                          const schedule = item?.record || {};
                          const missingInstructorIds = toArray(item?.missingInstructorIds);
                          return (
                            <div
                              key={`${schedule?.id || "orphaned-instructor"}:${index}`}
                              className="rounded-md border border-gray-200 bg-white p-3"
                            >
                              <div className="text-sm font-medium text-gray-900">
                                {getScheduleLabel(schedule)}
                              </div>
                              <div className="mt-1 text-xs text-gray-600">
                                {item?.reason || "Instructor link is missing or invalid."}
                              </div>
                              {missingInstructorIds.length > 0 && (
                                <div className="mt-1 text-xs text-gray-500">
                                  Missing instructor IDs: {missingInstructorIds.join(", ")}
                                </div>
                              )}
                              <div className="mt-2 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => navigate("/courses/manage")}
                                  className="inline-flex items-center rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                                >
                                  Open Courses Manage
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onCopyValue(schedule?.id, "Schedule ID")
                                  }
                                  disabled={!schedule?.id}
                                  className="inline-flex items-center rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                >
                                  Copy Schedule ID
                                </button>
                              </div>
                            </div>
                          );
                        }

                        if (category.id === "orphaned-spaces") {
                          const schedule = item?.record || {};
                          const missingSpaceIds = toArray(item?.missingSpaceIds);
                          const repairActionKey = getSpaceRepairKey(item);
                          const isRepairing = pendingActionKey === repairActionKey;

                          return (
                            <div
                              key={`${schedule?.id || "orphaned-space"}:${index}`}
                              className="rounded-md border border-gray-200 bg-white p-3"
                            >
                              <div className="text-sm font-medium text-gray-900">
                                {getScheduleLabel(schedule)}
                              </div>
                              <div className="mt-1 text-xs text-gray-600">
                                {item?.reason || "Schedule points to invalid room links."}
                              </div>
                              {missingSpaceIds.length > 0 && (
                                <div className="mt-1 text-xs text-gray-500">
                                  Missing room IDs: {missingSpaceIds.join(", ")}
                                </div>
                              )}
                              <div className="mt-2 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => onRepairSpaceIssue(item)}
                                  disabled={Boolean(pendingActionKey)}
                                  className="inline-flex items-center rounded-md bg-baylor-green px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-baylor-green/90 disabled:opacity-50"
                                >
                                  {isRepairing ? "Repairing..." : "Repair Room Link"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => navigate("/facilities/spaces")}
                                  className="inline-flex items-center rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                                >
                                  Open Space Management
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onCopyValue(schedule?.id, "Schedule ID")
                                  }
                                  disabled={!schedule?.id}
                                  className="inline-flex items-center rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                >
                                  Copy Schedule ID
                                </button>
                              </div>
                            </div>
                          );
                        }

                        if (category.id === "high-confidence-duplicates") {
                          const [primary, secondary] = toArray(item?.records);
                          const entityLabel =
                            item?.entityType === "people"
                              ? "People"
                              : item?.entityType === "rooms"
                                ? "Rooms"
                                : "Schedules";
                          const primaryLabel =
                            item?.entityType === "people"
                              ? getPersonLabel(primary)
                              : item?.entityType === "rooms"
                                ? getRoomLabel(primary)
                                : getScheduleLabel(primary);
                          const secondaryLabel =
                            item?.entityType === "people"
                              ? getPersonLabel(secondary)
                              : item?.entityType === "rooms"
                                ? getRoomLabel(secondary)
                                : getScheduleLabel(secondary);
                          const duplicatePairKey = getDuplicatePairKey(item);
                          const mergeActionKey = `merge:${duplicatePairKey}`;
                          const distinctActionKey = `distinct:${duplicatePairKey}`;
                          const isMerging = pendingActionKey === mergeActionKey;
                          const isMarkingDistinct = pendingActionKey === distinctActionKey;
                          const isAwaitingMergeConfirmation =
                            pendingMergeConfirmationKey === duplicatePairKey;

                          return (
                            <div
                              key={`${duplicatePairKey}:${index}`}
                              className="rounded-md border border-gray-200 bg-white p-3"
                            >
                              <div className="text-sm font-medium text-gray-900">
                                {entityLabel}: {primaryLabel} + {secondaryLabel}
                              </div>
                              <div className="mt-1 text-xs text-gray-600">
                                {formatConfidence(item?.confidence)} match
                                {item?.reason ? ` • ${item.reason}` : ""}
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => onMergeDuplicate(item)}
                                  disabled={Boolean(pendingActionKey)}
                                  className="inline-flex items-center rounded-md bg-baylor-green px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-baylor-green/90 disabled:opacity-50"
                                >
                                  {isMerging
                                    ? "Merging..."
                                    : isAwaitingMergeConfirmation
                                      ? "Confirm Merge"
                                      : "Merge Records"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onMarkDuplicateAsDistinct(item)}
                                  disabled={Boolean(pendingActionKey)}
                                  className="inline-flex items-center rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                >
                                  {isMarkingDistinct
                                    ? "Saving..."
                                    : "Mark As Separate"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onCopyValue(
                                      [primary?.id, secondary?.id]
                                        .filter(Boolean)
                                        .join(", "),
                                      "Record IDs",
                                    )
                                  }
                                  disabled={!primary?.id && !secondary?.id}
                                  className="inline-flex items-center rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                >
                                  Copy IDs
                                </button>
                              </div>
                            </div>
                          );
                        }

                        if (category.id === "unresolved-import-issues") {
                          const issueId = item?.issueId || "";
                          const transactionId = item?.transactionId || "";
                          const semester = item?.semester || "Unknown semester";
                          const status = (item?.status || "").toString().trim();
                          const canResumeDecisionQueue = status === "preview";
                          const canOpenHistory = Boolean(transactionId);

                          return (
                            <div
                              key={`${transactionId || "import"}:${issueId || index}`}
                              className="rounded-md border border-gray-200 bg-white p-3"
                            >
                              <div className="text-sm font-medium text-gray-900">
                                Transaction {transactionId || "Unknown"} • {semester}
                              </div>
                              <div className="mt-1 text-xs text-gray-600">
                                {(item?.importType || "schedule").toString()} issue
                                {issueId ? ` • ${issueId}` : ""}
                                {item?.reason ? ` • ${item.reason}` : ""}
                              </div>
                              <div className="mt-1 text-xs text-gray-500">
                                Status: {importStatusLabel(status)}
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {canResumeDecisionQueue ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openImportWizard(transactionId, "resolve")
                                    }
                                    disabled={!transactionId}
                                    className="inline-flex items-center rounded-md bg-baylor-green px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-baylor-green/90 disabled:opacity-50"
                                  >
                                    Resume Decision Queue
                                  </button>
                                ) : null}
                                {canOpenHistory ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openImportWizard(transactionId, "history")
                                    }
                                    className="inline-flex items-center rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                                  >
                                    Open Import History
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          );
                        }

                        if (category.id === "teaching-conflicts") {
                          const [scheduleA, scheduleB] = toArray(item?.schedules);
                          const conflictKey = getTeachingConflictKey(item);
                          const markDistinctActionKey = `distinct:${conflictKey}`;
                          const isMarkingDistinct =
                            pendingActionKey === markDistinctActionKey;

                          return (
                            <div
                              key={`${conflictKey}:${index}`}
                              className="rounded-md border border-gray-200 bg-white p-3"
                            >
                              <div className="text-sm font-medium text-gray-900">
                                {getScheduleLabel(scheduleA)} vs {getScheduleLabel(scheduleB)}
                              </div>
                              <div className="mt-1 text-xs text-gray-600">
                                {item?.day ? `${item.day}: ` : ""}
                                {item?.overlapDescription ||
                                  item?.reason ||
                                  "Overlapping meeting times"}
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => onMarkConflictAsDistinct(item)}
                                  disabled={Boolean(pendingActionKey)}
                                  className="inline-flex items-center rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                >
                                  {isMarkingDistinct
                                    ? "Saving..."
                                    : "Mark As Separate"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => navigate("/courses/manage")}
                                  className="inline-flex items-center rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                                >
                                  Open Courses Manage
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onCopyValue(
                                      [scheduleA?.id, scheduleB?.id]
                                        .filter(Boolean)
                                        .join(", "),
                                      "Schedule IDs",
                                    )
                                  }
                                  disabled={!scheduleA?.id && !scheduleB?.id}
                                  className="inline-flex items-center rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                >
                                  Copy Schedule IDs
                                </button>
                              </div>
                            </div>
                          );
                        }

                        if (category.id === "legacy-model-issues") {
                          const issueKey = getLegacyIssueKey(item);
                          const recordType = (item?.recordType || "record")
                            .toString()
                            .replace(/s$/, "");
                          const touchedFields = toArray(item?.touchedFields);

                          return (
                            <div
                              key={`${issueKey}:${index}`}
                              className="rounded-md border border-gray-200 bg-white p-3"
                            >
                              <div className="text-sm font-medium text-gray-900">
                                Legacy {recordType} cleanup needed
                              </div>
                              <div className="mt-1 text-xs text-gray-600">
                                {item?.message || "Legacy mirrored fields detected."}
                              </div>
                              {touchedFields.length > 0 && (
                                <div className="mt-1 text-xs text-gray-500">
                                  Fields: {touchedFields.join(", ")}
                                </div>
                              )}
                              <div className="mt-2 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={onRunSafeFix}
                                  disabled={isFixingSafe}
                                  className="inline-flex items-center rounded-md border border-baylor-green px-2.5 py-1.5 text-xs font-semibold text-baylor-green hover:bg-baylor-green/5 disabled:opacity-50"
                                >
                                  {isFixingSafe
                                    ? "Running Safe Fixes..."
                                    : "Run Safe Fixes"}
                                </button>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={`${category.id}:fallback:${index}`}
                            className="rounded-md border border-gray-200 bg-white p-3 text-xs text-gray-600"
                          >
                            Unknown issue format.
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

          {totalBlockingIssues === 0 && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">
              No blocking issues found. Routine cleanup is complete.
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          Run the data check first to populate review items.
        </div>
      )}
    </section>
  );
};

export default DecisionReviewSection;
