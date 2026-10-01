import { ACTIVITY_HISTORY_PAGE_SIZE } from "./activityHistory";
import { mergeEventPages } from "./activityExplorer";

export const ACTIVITY_EXPORT_READ_BUDGET = 2000;

// Reserve the requested limit before each query, including failed requests.
// This is a conservative query budget, not a claim about billed reads or the
// project's remaining quota. Empty queries and rule checks may also be billed.
export async function collectActivityExportHistory({
  history,
  startDateKey,
  endDateKey,
  loadPage,
  readBudget = ACTIVITY_EXPORT_READ_BUDGET,
  onPage = () => {},
  onProgress = () => {},
  isCancelled = () => false,
}) {
  if (!Number.isInteger(readBudget) || readBudget < 0 || readBudget > ACTIVITY_EXPORT_READ_BUDGET)
    throw new Error("Invalid export read budget.");
  let rows = mergeEventPages(history.rows || [], []);
  let cursor = history.cursor || null;
  let hasMore = !history.loaded || history.hasMore;
  let loaded = Boolean(history.loaded);
  let requestedDocumentLimit = 0;
  let documentsFetched = 0;
  let queriesAttempted = 0;
  let emptyQueries = 0;
  let errorCode = "";
  const checkCancelled = () => {
    if (isCancelled()) {
      const error = new Error("Export cancelled because the activity period changed.");
      error.name = "AbortError";
      throw error;
    }
  };
  checkCancelled();
  while (hasMore && requestedDocumentLimit < readBudget) {
    checkCancelled();
    const pageSize = Math.min(ACTIVITY_HISTORY_PAGE_SIZE, readBudget - requestedDocumentLimit);
    requestedDocumentLimit += pageSize;
    queriesAttempted += 1;
    let next;
    try {
      next = await loadPage({ startDateKey, endDateKey, cursor, pageSize });
    } catch (error) {
      checkCancelled();
      const code = String(error?.code || "").replace(/^firestore\//, "");
      errorCode = ["resource-exhausted", "permission-denied", "unavailable", "deadline-exceeded"].includes(code)
        ? code : "unavailable";
      break;
    }
    checkCancelled();
    documentsFetched += next.rows.length;
    if (!next.rows.length) emptyQueries += 1;
    rows = mergeEventPages(rows, next.rows);
    loaded = true;
    if (next.hasMore && (!next.cursor || next.cursor.id === cursor?.id)) {
      errorCode = "pagination-stalled";
      break;
    }
    cursor = next.cursor;
    hasMore = next.hasMore;
    onPage({ rows, cursor, hasMore, loaded });
    onProgress({ documentsFetched, requestedDocumentLimit });
  }
  return {
    rows,
    cursor,
    hasMore,
    loaded,
    coverage: {
      complete: loaded && !hasMore && !errorCode,
      stopReason: errorCode ? "read-error" : hasMore ? "read-budget" : "exhausted",
      errorCode: errorCode || null,
      extraReadBudget: readBudget,
      requestedDocumentLimit,
      documentsFetched,
      queriesAttempted,
      emptyQueries,
    },
  };
}
