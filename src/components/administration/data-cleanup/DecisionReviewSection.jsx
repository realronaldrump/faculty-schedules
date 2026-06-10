import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  buildDecisionCategoryViewModels,
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

const ActionButton = ({
  children,
  onClick,
  disabled = false,
  variant = "secondary",
}) => {
  const styles =
    variant === "primary"
      ? "bg-baylor-green text-white hover:bg-baylor-green/90"
      : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-9 items-center rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${styles}`}
    >
      {children}
    </button>
  );
};

const IssueCard = ({ title, note, children }) => (
  <div className="rounded-lg border border-gray-200 bg-white p-4">
    <div className="text-sm font-semibold text-gray-950">{title}</div>
    {note && <p className="mt-1 text-sm leading-5 text-gray-600">{note}</p>}
    <div className="mt-3">{children}</div>
  </div>
);

const ButtonRow = ({ children }) => (
  <div className="flex flex-wrap gap-2">{children}</div>
);

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
  onCancelMergeConfirmation,
  onMarkDuplicateAsDistinct,
  onRepairSpaceIssue,
  onMarkConflictAsDistinct,
  onCopyValue,
}) => {
  const navigate = useNavigate();
  const categories = buildDecisionCategoryViewModels(blockingCategories);

  if (!scanResult || totalBlockingIssues === 0 || categories.length === 0) {
    return null;
  }

  const openImportWizard = (transactionId, view = "resolve") => {
    const params = new URLSearchParams();
    if (transactionId) params.set("transaction", transactionId);
    params.set("view", view);
    navigate(`/admin-tools/import-wizard?${params.toString()}`);
  };

  const importStatusLabel = (status = "") => {
    switch ((status || "").toString().trim()) {
      case "preview":
        return "Waiting for your choices";
      case "partial":
        return "Partly finished";
      case "failed":
        return "Could not finish";
      case "failed_integrity":
        return "Needs support review";
      default:
        return "Needs review";
    }
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-baylor-gold/40 bg-baylor-gold/10">
          <AlertTriangle className="h-5 w-5 text-baylor-green" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-950">
            Items that need your choice
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-600">
            Work from the top down. Each card explains what the app found and
            gives you the clearest next step.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {categories.map((category) => {
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
                  <div className="text-sm font-semibold text-gray-950">
                    {category.label}
                  </div>
                  <div className="mt-0.5 text-sm text-gray-600">
                    {category.description}
                  </div>
                </div>
                <div className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700">
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

                      return (
                        <IssueCard
                          key={`${schedule?.id || "missing-instructor"}:${index}`}
                          title={getScheduleLabel(schedule)}
                          note="This class needs the correct instructor selected."
                        >
                          <ButtonRow>
                            <ActionButton
                              variant="primary"
                              onClick={() => navigate("/courses/manage")}
                            >
                              Open course management
                            </ActionButton>
                            <ActionButton
                              onClick={() =>
                                onCopyValue(schedule?.id, "Class reference")
                              }
                              disabled={!schedule?.id}
                            >
                              Copy reference
                            </ActionButton>
                          </ButtonRow>
                        </IssueCard>
                      );
                    }

                    if (category.id === "orphaned-spaces") {
                      const schedule = item?.record || {};
                      const repairActionKey = getSpaceRepairKey(item);
                      const isRepairing = pendingActionKey === repairActionKey;

                      return (
                        <IssueCard
                          key={`${schedule?.id || "missing-room"}:${index}`}
                          title={getScheduleLabel(schedule)}
                          note="This class has a room connection that needs to be refreshed."
                        >
                          <ButtonRow>
                            <ActionButton
                              variant="primary"
                              onClick={() => onRepairSpaceIssue(item)}
                              disabled={Boolean(pendingActionKey)}
                            >
                              {isRepairing ? "Updating..." : "Update room link"}
                            </ActionButton>
                            <ActionButton
                              onClick={() => navigate("/facilities/spaces")}
                            >
                              Open rooms
                            </ActionButton>
                            <ActionButton
                              onClick={() =>
                                onCopyValue(schedule?.id, "Class reference")
                              }
                              disabled={!schedule?.id}
                            >
                              Copy reference
                            </ActionButton>
                          </ButtonRow>
                        </IssueCard>
                      );
                    }

                    if (category.id === "high-confidence-duplicates") {
                      const [primary, secondary] = toArray(item?.records);
                      const entityLabel =
                        item?.entityType === "people"
                          ? "People"
                          : item?.entityType === "rooms"
                            ? "Rooms"
                            : "Classes";
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
                      const confidenceLabel =
                        Number(item?.confidence || 0) >= 0.98
                          ? "Very strong match"
                          : `${formatConfidence(item?.confidence)} match`;

                      return (
                        <IssueCard
                          key={`${duplicatePairKey}:${index}`}
                          title={`${entityLabel}: ${primaryLabel} + ${secondaryLabel}`}
                          note={`${confidenceLabel}. If these are the same, merge them. If not, keep them separate.`}
                        >
                          {isAwaitingMergeConfirmation ? (
                            <div className="rounded-lg border border-baylor-green/20 bg-baylor-green/5 p-3">
                              <div className="text-sm font-semibold text-baylor-green">
                                Merge these two entries?
                              </div>
                              <p className="mt-1 text-sm text-gray-600">
                                This keeps one entry and folds the duplicate
                                details into it.
                              </p>
                              <div className="mt-3">
                                <ButtonRow>
                                  <ActionButton
                                    variant="primary"
                                    onClick={() => onMergeDuplicate(item)}
                                    disabled={Boolean(pendingActionKey)}
                                  >
                                    {isMerging ? "Merging..." : "Yes, merge these"}
                                  </ActionButton>
                                  <ActionButton
                                    onClick={onCancelMergeConfirmation}
                                    disabled={Boolean(pendingActionKey)}
                                  >
                                    Not now
                                  </ActionButton>
                                  <ActionButton
                                    onClick={() => onMarkDuplicateAsDistinct(item)}
                                    disabled={Boolean(pendingActionKey)}
                                  >
                                    {isMarkingDistinct
                                      ? "Saving..."
                                      : "Keep separate"}
                                  </ActionButton>
                                </ButtonRow>
                              </div>
                            </div>
                          ) : (
                            <ButtonRow>
                              <ActionButton
                                variant="primary"
                                onClick={() => onMergeDuplicate(item)}
                                disabled={Boolean(pendingActionKey)}
                              >
                                Review merge
                              </ActionButton>
                              <ActionButton
                                onClick={() => onMarkDuplicateAsDistinct(item)}
                                disabled={Boolean(pendingActionKey)}
                              >
                                {isMarkingDistinct ? "Saving..." : "Keep separate"}
                              </ActionButton>
                              <ActionButton
                                onClick={() =>
                                  onCopyValue(
                                    [primary?.id, secondary?.id]
                                      .filter(Boolean)
                                      .join(", "),
                                    "Entry references",
                                  )
                                }
                                disabled={!primary?.id && !secondary?.id}
                              >
                                Copy references
                              </ActionButton>
                            </ButtonRow>
                          )}
                        </IssueCard>
                      );
                    }

                    if (category.id === "unresolved-import-issues") {
                      const issueId = item?.issueId || "";
                      const transactionId = item?.transactionId || "";
                      const semester = item?.semester || "Unknown term";
                      const status = (item?.status || "").toString().trim();
                      const canResumeDecisionQueue = status === "preview";
                      const canOpenHistory = Boolean(transactionId);

                      return (
                        <IssueCard
                          key={`${transactionId || "import"}:${issueId || index}`}
                          title={`Import for ${semester}`}
                          note={`Status: ${importStatusLabel(status)}. Continue the import choices to match, add, or skip the person.`}
                        >
                          <ButtonRow>
                            {canResumeDecisionQueue ? (
                              <ActionButton
                                variant="primary"
                                onClick={() =>
                                  openImportWizard(transactionId, "resolve")
                                }
                                disabled={!transactionId}
                              >
                                Continue import decisions
                              </ActionButton>
                            ) : null}
                            {canOpenHistory ? (
                              <ActionButton
                                onClick={() =>
                                  openImportWizard(transactionId, "history")
                                }
                              >
                                Open import history
                              </ActionButton>
                            ) : null}
                          </ButtonRow>
                        </IssueCard>
                      );
                    }

                    if (category.id === "teaching-conflicts") {
                      const [scheduleA, scheduleB] = toArray(item?.schedules);
                      const conflictKey = getTeachingConflictKey(item);
                      const markDistinctActionKey = `distinct:${conflictKey}`;
                      const isMarkingDistinct =
                        pendingActionKey === markDistinctActionKey;

                      return (
                        <IssueCard
                          key={`${conflictKey}:${index}`}
                          title={`${getScheduleLabel(scheduleA)} and ${getScheduleLabel(scheduleB)}`}
                          note={
                            item?.overlapDescription ||
                            item?.reason ||
                            "These classes may overlap for the same instructor."
                          }
                        >
                          <ButtonRow>
                            <ActionButton
                              variant="primary"
                              onClick={() => onMarkConflictAsDistinct(item)}
                              disabled={Boolean(pendingActionKey)}
                            >
                              {isMarkingDistinct ? "Saving..." : "Mark as okay"}
                            </ActionButton>
                            <ActionButton onClick={() => navigate("/courses/manage")}>
                              Open course management
                            </ActionButton>
                            <ActionButton
                              onClick={() =>
                                onCopyValue(
                                  [scheduleA?.id, scheduleB?.id]
                                    .filter(Boolean)
                                    .join(", "),
                                  "Class references",
                                )
                              }
                              disabled={!scheduleA?.id && !scheduleB?.id}
                            >
                              Copy references
                            </ActionButton>
                          </ButtonRow>
                        </IssueCard>
                      );
                    }

                    if (category.id === "legacy-model-issues") {
                      const issueKey = getLegacyIssueKey(item);
                      const recordType = (item?.recordType || "entry")
                        .toString()
                        .replace(/s$/, "");

                      return (
                        <IssueCard
                          key={`${issueKey}:${index}`}
                          title={`Older ${recordType} format`}
                          note="This entry is saved in an older format. Routine cleanup can usually refresh it."
                        >
                          <ButtonRow>
                            <ActionButton
                              variant="primary"
                              onClick={onRunSafeFix}
                              disabled={isFixingSafe}
                            >
                              {isFixingSafe
                                ? "Cleaning up..."
                                : "Clean up routine items"}
                            </ActionButton>
                          </ButtonRow>
                        </IssueCard>
                      );
                    }

                    return (
                      <IssueCard
                        key={`${category.id}:fallback:${index}`}
                        title="Needs support review"
                        note="This item needs a support person to review the details."
                      >
                        <ButtonRow>
                          <ActionButton
                            onClick={() =>
                              onCopyValue(
                                JSON.stringify(item || {}),
                                "Item details",
                              )
                            }
                          >
                            Copy details
                          </ActionButton>
                        </ButtonRow>
                      </IssueCard>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default DecisionReviewSection;
