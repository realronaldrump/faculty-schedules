import { useCallback, useEffect, useRef, useState } from "react";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";
import { formatDateKeyInTimeZone } from "../utils/activityAnalytics";
import {
  loadActivitySummaries,
  loadTodayActivitySummary,
  syncActivityRollups,
} from "../utils/activitySync";
import { loadActivityHistoryPage } from "../utils/activityHistory";
import { mergeEventPages, timestampMs } from "../utils/activityExplorer";

const EMPTY_SUMMARIES = {
  todayDateKey: "",
  analyticsRows: [],
  pageDailyRows: [],
  userDailyRows: [],
};
const EMPTY_HISTORY = {
  rows: [],
  cursor: null,
  hasMore: false,
  loaded: false,
  updatedAt: null,
};
const errorText = (error) =>
  error?.code === "permission-denied"
    ? "Access to this information was denied."
    : error?.code === "resource-exhausted"
      ? "The activity service has reached its daily limit. Try again later."
      : "Could not refresh this information. Previously loaded data is still shown.";

export default function useActivityExplorerData({
  enabled,
  startDateKey,
  endDateKey,
}) {
  const [summaries, setSummaries] = useState(EMPTY_SUMMARIES);
  const [presence, setPresence] = useState([]);
  const [tutorials, setTutorials] = useState([]);
  const [history, setHistory] = useState(EMPTY_HISTORY);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errors, setErrors] = useState({});
  const [updatedAt, setUpdatedAt] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const historyRef = useRef(EMPTY_HISTORY);
  const windowRef = useRef("");
  const requestRef = useRef(0);
  const historyBusyRef = useRef(false);
  const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    let busy = false;
    let todayKey = "";
    const load = async (initial = false) => {
      if (busy) return;
      busy = true;
      if (initial) setLoading(true);
      const nextErrors = {};
      const full = initial || todayKey !== formatDateKeyInTimeZone(new Date());
      if (full) {
        try {
          await syncActivityRollups();
        } catch (error) {
          nextErrors.sync = `Summary status could not be checked. ${errorText(error)}`;
        }
      }
      const results = await Promise.allSettled([
        full ? loadActivitySummaries() : loadTodayActivitySummary(),
        getDocs(
          query(
            collection(db, "userPresence"),
            orderBy("updatedAt", "desc"),
            limit(120),
          ),
        ),
        ...(full ? [getDocs(collection(db, "tutorialProgress"))] : []),
      ]);
      if (!active) return;
      if (results[0].status === "fulfilled") {
        const next = results[0].value;
        todayKey = next.todayDateKey;
        setSummaries((current) =>
          full
            ? next
            : {
                todayDateKey: next.todayDateKey,
                ...Object.fromEntries(
                  ["analyticsRows", "pageDailyRows", "userDailyRows"].map(
                    (key) => [
                      key,
                      [
                        ...current[key].filter(
                          (row) => row.dateKey !== next.todayDateKey,
                        ),
                        ...next[key],
                      ],
                    ],
                  ),
                ),
              },
        );
        setUpdatedAt(new Date());
      } else nextErrors.summaries = errorText(results[0].reason);
      if (results[1].status === "fulfilled")
        setPresence(
          results[1].value.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          })),
        );
      else nextErrors.presence = errorText(results[1].reason);
      if (results[2]?.status === "fulfilled")
        setTutorials(
          results[2].value.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          })),
        );
      else if (results[2]?.status === "rejected")
        nextErrors.tutorials = errorText(results[2].reason);
      setErrors((current) => ({
        ...current,
        ...nextErrors,
        summaries: nextErrors.summaries || "",
        presence: nextErrors.presence || "",
        ...(full
          ? {
              sync: nextErrors.sync || "",
              tutorials: nextErrors.tutorials || "",
            }
          : {}),
      }));
      setLoading(false);
      busy = false;
    };
    void load(true);
    const tick = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = setInterval(tick, 60000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [enabled, refreshKey]);

  useEffect(() => {
    if (!enabled) return undefined;
    const token = ++requestRef.current;
    historyBusyRef.current = false;
    const key = `${startDateKey}:${endDateKey}`;
    const changed = windowRef.current !== key;
    windowRef.current = key;
    if (changed) {
      historyRef.current = EMPTY_HISTORY;
      setHistory(EMPTY_HISTORY);
    }
    setHistoryLoading(true);
    setLoadingMore(false);
    const load = async () => {
      if (historyBusyRef.current) return;
      historyBusyRef.current = true;
      try {
        const next = await loadActivityHistoryPage({
          startDateKey,
          endDateKey,
        });
        if (token !== requestRef.current) return;
        const previous = historyRef.current;
        const overlaps = next.rows.some((row) =>
          previous.rows.some((old) => old.id === row.id),
        );
        const combined =
          previous.loaded && (overlaps || !next.hasMore)
            ? { ...previous, rows: mergeEventPages(previous.rows, next.rows) }
            : next;
        historyRef.current = {
          ...combined,
          loaded: true,
          updatedAt: new Date(),
        };
        setHistory(historyRef.current);
        setErrors((current) => ({ ...current, history: "" }));
      } catch (error) {
        if (token === requestRef.current)
          setErrors((current) => ({ ...current, history: errorText(error) }));
      } finally {
        if (token === requestRef.current) {
          setHistoryLoading(false);
          historyBusyRef.current = false;
        }
      }
    };
    void load();
    const tick = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = setInterval(tick, 60000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      requestRef.current += 1;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [enabled, startDateKey, endDateKey, refreshKey]);

  const loadMore = useCallback(async () => {
    const previous = historyRef.current;
    if (
      !enabled ||
      !previous.hasMore ||
      loadingMore ||
      historyLoading ||
      historyBusyRef.current
    )
      return;
    const token = requestRef.current;
    historyBusyRef.current = true;
    setLoadingMore(true);
    try {
      const next = await loadActivityHistoryPage({
        startDateKey,
        endDateKey,
        cursor: previous.cursor,
      });
      if (token !== requestRef.current) return;
      historyRef.current = {
        ...next,
        loaded: true,
        updatedAt: historyRef.current.updatedAt,
        rows: mergeEventPages(historyRef.current.rows, next.rows),
      };
      setHistory(historyRef.current);
      setErrors((current) => ({ ...current, history: "" }));
    } catch (error) {
      if (token === requestRef.current)
        setErrors((current) => ({ ...current, history: errorText(error) }));
    } finally {
      if (token === requestRef.current) {
        setLoadingMore(false);
        historyBusyRef.current = false;
      }
    }
  }, [enabled, startDateKey, endDateKey, loadingMore, historyLoading]);

  return {
    summaries,
    presence,
    tutorials,
    history,
    loading,
    historyLoading,
    loadingMore,
    errors,
    updatedAt,
    refresh,
    loadMore,
    oldestEvent: history.rows.reduce(
      (oldest, row) =>
        !oldest || timestampMs(row.timestamp) < timestampMs(oldest)
          ? row.timestamp
          : oldest,
      null,
    ),
  };
}
