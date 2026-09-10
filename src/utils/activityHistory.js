import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { addDaysToDateKey, getDateKeyUtcRange } from "./activityRollup";

export const ACTIVITY_HISTORY_PAGE_SIZE = 200;

// Timestamp-only ordering uses existing single-field indexes. Filtering people
// and features happens across explicitly paginated history, never a hidden cap.
export const loadActivityHistoryPage = async ({
  startDateKey,
  endDateKey,
  cursor = null,
}) => {
  const { start } = getDateKeyUtcRange(startDateKey);
  const { start: end } = getDateKeyUtcRange(addDaysToDateKey(endDateKey, 1));
  const snapshot = await getDocs(
    query(
      collection(db, "userActivityEvents"),
      where("timestamp", ">=", start),
      where("timestamp", "<", end),
      orderBy("timestamp", "desc"),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(ACTIVITY_HISTORY_PAGE_SIZE),
    ),
  );
  return {
    rows: snapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
    cursor: snapshot.docs.at(-1) || null,
    hasMore: snapshot.docs.length === ACTIVITY_HISTORY_PAGE_SIZE,
  };
};
