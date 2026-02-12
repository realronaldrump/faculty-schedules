import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileUp,
  History,
  Image as ImageIcon,
  LayoutGrid,
  LineChart,
  Map as MapIcon,
  Pencil,
  Plus,
  Save,
  Thermometer,
  Trash2,
  X,
} from "lucide-react";
import Papa from "papaparse";
import JSZip from "jszip";
import { v4 as uuidv4 } from "uuid";
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  serverTimestamp,
  orderBy,
  writeBatch,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useData } from "../../contexts/DataContext.jsx";
import { useUI } from "../../contexts/UIContext.jsx";
import {
  normalizeSingleSpaceKey,
  parseSpaceKey,
  resolveBuildingDisplayName,
  SPACE_TYPE,
} from "../../utils/locationService";
import {
  formatMinutesToLabel,
  formatMinutesToTime,
  parseTime,
} from "../../utils/timeUtils";
import {
  detectGoveeCsvColumns,
  extractRoomTokens,
  formatDateInTimeZone,
  getMinutesSinceMidnight,
  normalizeMatchText,
  normalizeRoomNumber,
  parseDeviceLabelFromFilename,
  parseLocalTimestamp,
  toRoomAggregateDocId,
  toBuildingKey,
  toDateKey,
  toDeviceDayId,
  toDeviceId,
  toSnapshotDocId,
  zonedTimeToUtc,
} from "../../utils/temperatureUtils";
import {
  buildHourlyAggregates,
} from "../../utils/temperatureAggregation";
import {
  calculateImportProgress,
  formatElapsed,
} from "../../utils/temperatureImportProgress";
import {
  getTemperatureStatus,
  normalizeIdealRange,
  normalizeIdealRangeByType,
  resolveIdealRangeForSpaceType,
} from "../../utils/temperatureRangeUtils";
import { emitTemperatureDataRefresh } from "../../utils/temperatureEvents";
import ConfirmDialog from "../shared/ConfirmDialog";
import {
  ACTION_TABS,
  AUTO_MATCH_THRESHOLD,
  DATA_VIEW_TABS,
  DEFAULT_TIMEZONE,
} from "./monitoring/constants";
import {
  buildDefaultSettings,
  coerceNumber,
  formatTimezoneLabel,
  getSpaceLabel,
  isValidTimeZone,
  sortRooms,
  toCsvSafe,
} from "./monitoring/helpers";
import Toolbar from "./monitoring/Toolbar";
import ViewTabs from "./monitoring/ViewTabs";
import QuickStats from "./monitoring/QuickStats";
import SnapshotPanel from "./monitoring/SnapshotPanel";
import ImportPanel from "./monitoring/ImportPanel";
import SettingsPanel from "./monitoring/SettingsPanel";

const MAX_FIRESTORE_BATCH_WRITES = 400;

const toLocalDateToken = (value) => {
  if (!value || typeof value !== "string") return "";
  const token = value.split(" ")[0]?.trim() || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(token)) return "";
  return token;
};

const parseImportDateRange = (importItem) => {
  const start = toLocalDateToken(importItem?.dateRange?.start || "");
  const end = toLocalDateToken(importItem?.dateRange?.end || "");
  if (!start && !end) return null;
  const safeStart = start || end;
  const safeEnd = end || start;
  if (!safeStart || !safeEnd) return null;
  return safeStart <= safeEnd
    ? { start: safeStart, end: safeEnd }
    : { start: safeEnd, end: safeStart };
};

const mergeDateRanges = (ranges = []) => {
  const normalized = ranges
    .filter((range) => range?.start && range?.end)
    .map((range) =>
      range.start <= range.end
        ? { start: range.start, end: range.end }
        : { start: range.end, end: range.start },
    )
    .sort((a, b) => a.start.localeCompare(b.start));

  if (normalized.length === 0) return [];
  const merged = [normalized[0]];
  for (let i = 1; i < normalized.length; i += 1) {
    const current = normalized[i];
    const previous = merged[merged.length - 1];
    if (current.start <= previous.end) {
      if (current.end > previous.end) previous.end = current.end;
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
};

const buildImportItemMergeKey = (item) => {
  const fileHash = (item?.fileHash || "").toString();
  const fileName = (item?.fileName || "").toString().toLowerCase();
  if (fileHash) return `hash:${fileHash}`;
  return `name:${fileName}`;
};

const toMillis = (value) => {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  if (value instanceof Date) return value.getTime();
  return 0;
};

const mergeDocSnapshots = (snapshots = []) => {
  const docsById = new Map();
  snapshots.forEach((snap) => {
    if (!snap?.docs) return;
    snap.docs.forEach((docSnap) => {
      docsById.set(docSnap.id, docSnap);
    });
  });
  return Array.from(docsById.values());
};

const loadBuildingScopedDocs = async ({
  collectionName,
  buildingCode,
  buildingName,
  codeConstraints = [],
  nameConstraints = codeConstraints,
}) => {
  const runQuery = async (queryRef, scope) => {
    try {
      return await getDocs(queryRef);
    } catch (error) {
      console.warn(
        `Temperature query failed for ${collectionName} (${scope})`,
        error,
      );
      return null;
    }
  };

  const requests = [
    runQuery(
      query(
        collection(db, collectionName),
        where("buildingCode", "==", buildingCode),
        ...codeConstraints,
      ),
      "buildingCode",
    ),
  ];

  if (buildingName) {
    requests.push(
      runQuery(
        query(
          collection(db, collectionName),
          where("buildingName", "==", buildingName),
          ...nameConstraints,
        ),
        "buildingName",
      ),
    );
  }

  const snapshots = await Promise.all(requests);
  const successfulSnapshots = snapshots.filter(Boolean);
  if (successfulSnapshots.length === 0) {
    throw new Error(`Failed to query ${collectionName} for building.`);
  }
  return mergeDocSnapshots(successfulSnapshots);
};

const TemperatureMonitoring = () => {
  const { loading: authLoading, user } = useAuth();
  const { spacesList = [], spacesByKey, roomsLoading } = useData();
  const { showNotification } = useUI();
  const mapRef = useRef(null);
  const dragStateRef = useRef(null);

  const [selectedBuilding, setSelectedBuilding] = useState("");
  const [buildingSettings, setBuildingSettings] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsExists, setSettingsExists] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSnapshotId, setSelectedSnapshotId] = useState("");
  const [viewMode, setViewMode] = useState("floorplan");
  const [snapshotDocs, setSnapshotDocs] = useState([]);
  const [hiddenBuildingCodes, setHiddenBuildingCodes] = useState(new Set());
  const [hiddenLoaded, setHiddenLoaded] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [deviceDocs, setDeviceDocs] = useState({});
  const [importHistory, setImportHistory] = useState([]);
  const [importHistoryLoaded, setImportHistoryLoaded] = useState(false);

  const [importItems, setImportItems] = useState([]);
  const [importing, setImporting] = useState(false);
  const [mappingOverrides, setMappingOverrides] = useState({});
  const [pendingMappings, setPendingMappings] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [importJobId, setImportJobId] = useState(null);
  const [importJob, setImportJob] = useState(null);
  const [importTick, setImportTick] = useState(0);
  const importProgressRef = useRef({
    lastUpdate: 0,
    lastRows: 0,
    lastReadings: 0,
    lastSkippedExisting: 0,
    lastConflicts: 0,
  });

  const [editingPositions, setEditingPositions] = useState(false);
  const [markerDrafts, setMarkerDrafts] = useState({});
  const [activePlacementSpaceKey, setActivePlacementSpaceKey] = useState("");

  const [newSnapshotTime, setNewSnapshotTime] = useState("");
  const [newSnapshotTolerance, setNewSnapshotTolerance] = useState(15);

  const [historicalStart, setHistoricalStart] = useState("");
  const [historicalEnd, setHistoricalEnd] = useState("");
  const [historicalSpaceKey, setHistoricalSpaceKey] = useState("");
  const [historicalDocs, setHistoricalDocs] = useState([]);
  const [historicalLoading, setHistoricalLoading] = useState(false);
  const [buildingIsHidden, setBuildingIsHidden] = useState(false);

  const [exportStart, setExportStart] = useState("");
  const [exportEnd, setExportEnd] = useState("");
  const [exportSpaceKeys, setExportSpaceKeys] = useState([]);
  const [exportSnapshotIds, setExportSnapshotIds] = useState([]);
  const [exporting, setExporting] = useState(false);

  const [recomputeStart, setRecomputeStart] = useState("");
  const [recomputeEnd, setRecomputeEnd] = useState("");
  const [recomputing, setRecomputing] = useState(false);

  const [showDeleteFloorplanConfirm, setShowDeleteFloorplanConfirm] =
    useState(false);
  const [deleteRoomSpaceKey, setDeleteRoomSpaceKey] = useState("");
  const [showDeleteRoomDataConfirm, setShowDeleteRoomDataConfirm] =
    useState(false);
  const [deletingRoomData, setDeletingRoomData] = useState(false);
  const [importHistoryRefresh, setImportHistoryRefresh] = useState(0);
  const [snapshotRefreshKey, setSnapshotRefreshKey] = useState(0);

  const timezoneLabel = formatTimezoneLabel(
    buildingSettings?.timezone || DEFAULT_TIMEZONE,
  );

  const formatSnapshotTemp = (snapshot) => {
    if (!snapshot || snapshot.status === "missing") return "No data";
    if (snapshot.temperatureF != null)
      return `${Math.round(snapshot.temperatureF)} F`;
    if (snapshot.temperatureC != null)
      return `${Math.round(snapshot.temperatureC)} C`;
    return "No data";
  };

  const defaultIdealRange = useMemo(
    () =>
      normalizeIdealRange(
        buildingSettings?.idealTempFMin,
        buildingSettings?.idealTempFMax,
      ),
    [buildingSettings?.idealTempFMin, buildingSettings?.idealTempFMax],
  );

  const idealRangesByType = useMemo(
    () =>
      normalizeIdealRangeByType(buildingSettings?.idealTempRangesBySpaceType),
    [buildingSettings?.idealTempRangesBySpaceType],
  );

  const resolveSnapshotTempF = (snapshot) => {
    if (!snapshot) return null;
    if (Number.isFinite(snapshot.temperatureF)) return snapshot.temperatureF;
    if (Number.isFinite(snapshot.temperatureC)) {
      return (snapshot.temperatureC * 9) / 5 + 32;
    }
    return null;
  };

  const resolveIdealRangeForRoom = (room) =>
    resolveIdealRangeForSpaceType(
      room?.type,
      defaultIdealRange,
      idealRangesByType,
    );

  const getTempToneClasses = ({
    valueF,
    missing,
    range,
    variant = "pill",
  }) => {
    if (missing) {
      return variant === "solid"
        ? "bg-gray-400/90 text-white"
        : "bg-gray-200 text-gray-600";
    }
    const status = getTemperatureStatus(valueF, range || defaultIdealRange);
    if (status === "below") {
      return variant === "solid"
        ? "bg-sky-200/90 text-sky-900"
        : "bg-sky-100 text-sky-800";
    }
    if (status === "above") {
      return variant === "solid"
        ? "bg-red-200/90 text-red-900"
        : "bg-red-100 text-red-800";
    }
    return variant === "solid"
      ? "bg-baylor-green/90 text-white"
      : "bg-baylor-green/10 text-baylor-green";
  };

  const normalizeMarkerMap = (markers = {}) => {
    if (!markers || typeof markers !== "object") return {};
    const next = {};
    Object.entries(markers).forEach(([key, value]) => {
      if (!key) return;
      const direct =
        roomLookup[key] ||
        (spacesByKey instanceof Map ? spacesByKey.get(key) : null);
      if (direct) {
        next[key] = value;
        return;
      }
      const byId = spacesList.find((room) => room.id === key);
      if (byId?.spaceKey) {
        next[byId.spaceKey] = value;
        return;
      }
      next[key] = value;
    });
    return next;
  };

  const roomsByBuilding = useMemo(() => {
    const grouped = {};
    const seenByBuilding = {};
    (spacesList || []).forEach((room) => {
      if (room?.isActive === false) return;
      const spaceKey = normalizeSingleSpaceKey(room.spaceKey || room.id || "");
      if (!spaceKey) return;
      const parsedKey = parseSpaceKey(spaceKey);
      const buildingCode = (room.buildingCode || parsedKey?.buildingCode || room.building || "")
        .toString()
        .trim()
        .toUpperCase();
      if (!buildingCode) return;
      if (
        buildingCode.toLowerCase() === "online" ||
        buildingCode.toLowerCase() === "off campus"
      )
        return;
      if (!grouped[buildingCode]) {
        grouped[buildingCode] = [];
        seenByBuilding[buildingCode] = new Set();
      }
      const seen = seenByBuilding[buildingCode];
      if (spaceKey && seen.has(spaceKey)) return;
      if (spaceKey) seen.add(spaceKey);
      grouped[buildingCode].push({
        ...room,
        spaceKey,
      });
    });
    Object.keys(grouped).forEach((key) => {
      grouped[key].sort(sortRooms);
    });
    return grouped;
  }, [spacesList]);

  const buildingOptions = useMemo(() => {
    return Object.keys(roomsByBuilding)
      .filter(
        (code) =>
          showHidden ||
          !hiddenBuildingCodes.has(code) ||
          code === selectedBuilding,
      )
      .map((code) => ({
        code,
        name: resolveBuildingDisplayName(code) || code,
      }))
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true }),
      );
  }, [roomsByBuilding, hiddenBuildingCodes, showHidden, selectedBuilding]);

  const buildingList = useMemo(
    () => buildingOptions.map((item) => item.code),
    [buildingOptions],
  );

  const selectedBuildingName = useMemo(
    () =>
      selectedBuilding
        ? resolveBuildingDisplayName(selectedBuilding) || selectedBuilding
        : "",
    [selectedBuilding],
  );

  const roomsForBuilding = useMemo(() => {
    return roomsByBuilding[selectedBuilding] || [];
  }, [roomsByBuilding, selectedBuilding]);

  const roomLookup = useMemo(() => {
    const lookup = {};
    roomsForBuilding.forEach((room) => {
      const key = normalizeSingleSpaceKey(room.spaceKey || room.id || "");
      if (key) lookup[key] = room;
    });
    return lookup;
  }, [roomsForBuilding]);

  const deleteRoomLabel = useMemo(() => {
    const spaceKey = normalizeSingleSpaceKey(deleteRoomSpaceKey || "");
    if (!spaceKey) return "";
    return getSpaceLabel(roomLookup[spaceKey] || { id: spaceKey }, spacesByKey);
  }, [deleteRoomSpaceKey, roomLookup, spacesByKey]);

  const resolveImportSpaceKey = (item) => {
    if (!item) return "";
    return normalizeSingleSpaceKey(
      item.spaceKey ||
      deviceDocs[item.deviceId]?.mapping?.spaceKey ||
      "",
    );
  };

  const resolveImportSpaceLabel = (item, spaceKey) => {
    if (!spaceKey) return "Unassigned";
    const canonicalLabel = getSpaceLabel(
      roomLookup[spaceKey] || { id: spaceKey },
      spacesByKey,
    );
    const fallbackLabel = (item?.spaceLabel || "").toString().trim();
    if (canonicalLabel === spaceKey && fallbackLabel) return fallbackLabel;
    return canonicalLabel;
  };

  const spaceTypeOptions = useMemo(() => {
    const baseTypes = Object.values(SPACE_TYPE);
    const extraTypes = new Set();
    roomsForBuilding.forEach((room) => {
      if (room?.type) extraTypes.add(room.type);
    });
    Object.keys(buildingSettings?.idealTempRangesBySpaceType || {}).forEach(
      (type) => {
        if (type) extraTypes.add(type);
      },
    );
    const extras = Array.from(extraTypes).filter(
      (type) => !baseTypes.includes(type),
    );
    extras.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return [...baseTypes, ...extras];
  }, [roomsForBuilding, buildingSettings?.idealTempRangesBySpaceType]);

  const snapshotTimes = buildingSettings?.snapshotTimes || [];

  const snapshotLookup = useMemo(() => {
    const map = {};
    snapshotDocs.forEach((docData) => {
      const spaceKey = normalizeSingleSpaceKey(docData.spaceKey || "");
      if (!spaceKey) return;
      if (!map[spaceKey]) map[spaceKey] = {};
      map[spaceKey][docData.snapshotTimeId] = docData;
    });
    return map;
  }, [snapshotDocs]);

  const snapshotDocsBySpace = useMemo(() => {
    const map = {};
    snapshotDocs.forEach((docData) => {
      const spaceKey = normalizeSingleSpaceKey(docData.spaceKey || "");
      if (!spaceKey) return;
      if (!map[spaceKey]) map[spaceKey] = [];
      map[spaceKey].push(docData);
    });
    Object.values(map).forEach((items) => {
      items.sort((a, b) => (a?.targetMinutes || 0) - (b?.targetMinutes || 0));
    });
    return map;
  }, [snapshotDocs]);

  const selectedSnapshotSlot = useMemo(
    () => snapshotTimes.find((slot) => slot.id === selectedSnapshotId) || null,
    [snapshotTimes, selectedSnapshotId],
  );

  const normalizeSnapshotLabel = (value) =>
    (value || "").toString().trim().toLowerCase();

  const resolveSnapshotForSlot = (spaceKey, slot) => {
    const stableSpaceKey = normalizeSingleSpaceKey(spaceKey || "");
    if (!stableSpaceKey) return null;
    if (!slot) return snapshotDocsBySpace[stableSpaceKey]?.[0] || null;

    const exactMatch = snapshotLookup[stableSpaceKey]?.[slot.id];
    if (exactMatch) return exactMatch;

    const candidates = snapshotDocsBySpace[stableSpaceKey] || [];
    if (candidates.length === 0) return null;

    if (Number.isFinite(slot.minutes)) {
      const byMinutes = candidates.find(
        (docData) =>
          Number.isFinite(docData?.targetMinutes) &&
          docData.targetMinutes === slot.minutes,
      );
      if (byMinutes) return byMinutes;
    }

    const slotLabel = normalizeSnapshotLabel(
      slot.label || formatMinutesToLabel(slot.minutes),
    );
    if (slotLabel) {
      const byLabel = candidates.find(
        (docData) =>
          normalizeSnapshotLabel(docData?.snapshotLabel || "") === slotLabel,
      );
      if (byLabel) return byLabel;
    }

    return candidates[0] || null;
  };

  const hasUnresolvedMappings = useMemo(() => {
    return pendingMappings.some(
      (item) => !mappingOverrides[item.deviceId] && !item.suggestedSpaceKey,
    );
  }, [pendingMappings, mappingOverrides]);

  const importSummary = useMemo(() => {
    const summary = {
      fileCount: importItems.length,
      deviceCount: 0,
      totalRows: 0,
      parsedRows: 0,
      duplicateCount: 0,
      errorCount: 0,
      readyCount: 0,
    };
    const deviceIds = new Set();
    importItems.forEach((item) => {
      summary.totalRows += item.rowCount ?? 0;
      summary.parsedRows += item.parsedCount ?? 0;
      summary.errorCount += item.errorCount ?? 0;
      if (item.duplicate) summary.duplicateCount += 1;
      if (item.deviceId) deviceIds.add(item.deviceId);
      if (
        (item.errorCount ?? 0) === 0 &&
        (item.parsedCount ?? 0) > 0
      ) {
        summary.readyCount += 1;
      }
    });
    summary.deviceCount = deviceIds.size;
    return summary;
  }, [importItems]);

  const roomImportStats = useMemo(() => {
    const bySpace = new Map();
    importHistory.forEach((item) => {
      const spaceKey = normalizeSingleSpaceKey(
        item?.spaceKey || deviceDocs[item?.deviceId]?.mapping?.spaceKey || "",
      );
      if (!spaceKey) return;

      const canonicalRoomLabel = getSpaceLabel(
        roomLookup[spaceKey] || { id: spaceKey },
        spacesByKey,
      );
      const fallbackRoomLabel = (item?.spaceLabel || "").toString().trim();
      const roomLabel =
        canonicalRoomLabel === spaceKey && fallbackRoomLabel
          ? fallbackRoomLabel
          : canonicalRoomLabel;

      if (!bySpace.has(spaceKey)) {
        bySpace.set(spaceKey, {
          spaceKey,
          roomLabel,
          importCount: 0,
          totalRows: 0,
          totalParsedRows: 0,
          totalNewReadings: 0,
          totalSkippedExisting: 0,
          totalConflicts: 0,
          deviceIds: new Set(),
          dateStart: "",
          dateEnd: "",
          lastImportedAt: null,
        });
      }

      const stats = bySpace.get(spaceKey);
      if (stats.roomLabel === spaceKey && roomLabel !== spaceKey) {
        stats.roomLabel = roomLabel;
      }
      stats.importCount += 1;
      stats.totalRows += Number(item?.rowCount) || 0;
      stats.totalParsedRows += Number(item?.parsedCount) || 0;
      stats.totalNewReadings += Number(item?.newReadings) || 0;
      stats.totalSkippedExisting += Number(item?.skippedExistingCount) || 0;
      stats.totalConflicts += Number(item?.conflictCount) || 0;
      if (item?.deviceId) stats.deviceIds.add(item.deviceId);

      const range = parseImportDateRange(item);
      if (range) {
        if (!stats.dateStart || range.start < stats.dateStart) {
          stats.dateStart = range.start;
        }
        if (!stats.dateEnd || range.end > stats.dateEnd) {
          stats.dateEnd = range.end;
        }
      }

      const createdAt = item?.createdAt?.toDate
        ? item.createdAt.toDate()
        : item?.createdAt?.seconds
          ? new Date(item.createdAt.seconds * 1000)
          : null;
      if (createdAt && (!stats.lastImportedAt || createdAt > stats.lastImportedAt)) {
        stats.lastImportedAt = createdAt;
      }
    });

    return Array.from(bySpace.values())
      .map((stats) => ({
        ...stats,
        deviceCount: stats.deviceIds.size,
      }))
      .sort((a, b) => {
        const readingDelta = b.totalNewReadings - a.totalNewReadings;
        if (readingDelta !== 0) return readingDelta;
        return a.roomLabel.localeCompare(b.roomLabel, undefined, {
          numeric: true,
        });
      });
  }, [importHistory, deviceDocs, roomLookup, spacesByKey]);

  const activeImportJob =
    importJob && importJob.buildingCode === selectedBuilding ? importJob : null;
  const importProgress = calculateImportProgress({
    processedRows: activeImportJob?.processedRows || 0,
    totalRows: activeImportJob?.totalRows || 0,
    processedFiles: activeImportJob?.processedFiles || 0,
    totalFiles: activeImportJob?.totalFiles || 0,
  });
  const importStartedAt = activeImportJob?.startedAt?.toDate
    ? activeImportJob.startedAt.toDate()
    : activeImportJob?.startedAt instanceof Date
      ? activeImportJob.startedAt
      : null;
  const importFinishedAt = activeImportJob?.finishedAt?.toDate
    ? activeImportJob.finishedAt.toDate()
    : activeImportJob?.finishedAt instanceof Date
      ? activeImportJob.finishedAt
      : null;
  const importElapsed = importStartedAt
    ? formatElapsed(
      (activeImportJob?.status === "running"
        ? importTick || Date.now()
        : importFinishedAt?.getTime() || Date.now()) - importStartedAt.getTime(),
    )
    : null;

  // Load hidden buildings
  useEffect(() => {
    const fetchHidden = async () => {
      try {
        const q = query(
          collection(db, "temperatureBuildingSettings"),
          where("hidden", "==", true),
        );
        const snap = await getDocs(q);
        const codes = new Set(snap.docs.map((d) => d.data().buildingCode));
        setHiddenBuildingCodes(codes);
      } catch (err) {
        console.error("Error fetching hidden buildings:", err);
      } finally {
        setHiddenLoaded(true);
      }
    };
    fetchHidden();
  }, []);

  // Set default building - skip hidden buildings unless explicitly saved as default
  useEffect(() => {
    // Wait for hidden buildings to load before selecting default
    if (!hiddenLoaded) return;
    if (!selectedBuilding && buildingList.length > 0) {
      const defaultBuilding = localStorage.getItem(
        "temperatureDefaultBuilding",
      );
      // If user had explicitly set a default building, use it even if hidden
      if (
        defaultBuilding &&
        buildingList.includes(defaultBuilding) &&
        !hiddenBuildingCodes.has(defaultBuilding)
      ) {
        setSelectedBuilding(defaultBuilding);
      } else {
        // Find the first non-hidden building
        const firstNonHidden = buildingList.find(
          (code) => !hiddenBuildingCodes.has(code),
        );
        setSelectedBuilding(firstNonHidden || buildingList[0]);
      }
    }
  }, [buildingList, selectedBuilding, hiddenBuildingCodes, hiddenLoaded]);

  useEffect(() => {
    if (!selectedBuilding) return;
    setImportHistoryLoaded(false);
    setSelectedDate("");
    setImportItems([]);
    setPendingMappings([]);
    setMappingOverrides({});
    setExportSpaceKeys([]);
    setExportSnapshotIds([]);
    setHistoricalSpaceKey("");
    setHistoricalDocs([]);
    setDeleteRoomSpaceKey("");
    setShowDeleteRoomDataConfirm(false);
  }, [selectedBuilding]);

  useEffect(() => {
    if (!selectedBuilding) return;
    const storedJobId = localStorage.getItem(
      `temperatureImportJob:${selectedBuilding}`,
    );
    setImportJobId(storedJobId || null);
  }, [selectedBuilding]);

  useEffect(() => {
    if (!importJobId) {
      setImportJob(null);
      return;
    }
    const unsubscribe = onSnapshot(
      doc(db, "temperatureImportJobs", importJobId),
      (snap) => {
        if (!snap.exists()) {
          setImportJob(null);
          return;
        }
        setImportJob({ id: snap.id, ...snap.data() });
      },
      (error) => {
        console.error("Import job subscription failed:", error);
      },
    );
    return () => unsubscribe();
  }, [importJobId]);

  useEffect(() => {
    if (!importJob?.startedAt || importJob.status !== "running") return;
    const interval = setInterval(() => {
      setImportTick(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [importJob?.startedAt, importJob?.status]);

  useEffect(() => {
    if (authLoading || !user) return;
    if (!selectedBuilding) return;
    let active = true;

    const loadSettings = async () => {
      setSettingsLoading(true);
      try {
        const buildingName =
          resolveBuildingDisplayName(selectedBuilding) || selectedBuilding;
        const buildingKey = toBuildingKey(selectedBuilding);
        const snap = await getDoc(
          doc(db, "temperatureBuildingSettings", buildingKey),
        );
        if (!active) return;
        if (snap.exists()) {
          const data = snap.data();
          const defaultTimes = buildDefaultSettings({
            buildingCode: selectedBuilding,
            buildingName,
          }).snapshotTimes;
          const nextTimes =
            Array.isArray(data.snapshotTimes) && data.snapshotTimes.length > 0
              ? data.snapshotTimes
              : defaultTimes;
          const nextTypeRanges = {};
          if (
            data.idealTempRangesBySpaceType &&
            typeof data.idealTempRangesBySpaceType === "object"
          ) {
            Object.entries(data.idealTempRangesBySpaceType).forEach(
              ([type, range]) => {
                if (!type || !range || typeof range !== "object") return;
                const minF = Number.isFinite(range.minF) ? range.minF : null;
                const maxF = Number.isFinite(range.maxF) ? range.maxF : null;
                if (minF == null && maxF == null) return;
                nextTypeRanges[type] = { minF, maxF };
              },
            );
          }
          const nextSettings = {
            ...data,
            buildingCode: selectedBuilding,
            buildingName,
            snapshotTimes: [...nextTimes].sort(
              (a, b) => (a.minutes || 0) - (b.minutes || 0),
            ),
            idealTempFMin:
              Number.isFinite(data.idealTempFMin) ? data.idealTempFMin : null,
            idealTempFMax:
              Number.isFinite(data.idealTempFMax) ? data.idealTempFMax : null,
            idealTempRangesBySpaceType: nextTypeRanges,
            markers: normalizeMarkerMap(data.markers || {}),
          };
          setBuildingSettings(nextSettings);
          setBuildingIsHidden(data.hidden === true);
          setSettingsExists(true);
        } else {
          setBuildingSettings(
            buildDefaultSettings({
              buildingCode: selectedBuilding,
              buildingName,
            }),
          );
          setBuildingIsHidden(false);
          setSettingsExists(false);
        }
      } catch (error) {
        console.error("Error loading temperature settings:", error);
        showNotification(
          "error",
          "Settings Load Failed",
          "Unable to load temperature settings for this building.",
        );
        const buildingName =
          resolveBuildingDisplayName(selectedBuilding) || selectedBuilding;
        setBuildingSettings(
          buildDefaultSettings({
            buildingCode: selectedBuilding,
            buildingName,
          }),
        );
        setBuildingIsHidden(false);
        setSettingsExists(false);
      } finally {
        if (active) setSettingsLoading(false);
      }
    };

    const loadImportHistory = async () => {
      try {
        const buildingName =
          resolveBuildingDisplayName(selectedBuilding) || selectedBuilding;
        const docs = await loadBuildingScopedDocs({
          collectionName: "temperatureImports",
          buildingCode: selectedBuilding,
          buildingName,
        });
        const items = docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
        setImportHistory(items);
      } catch (err) {
        console.error("Failed to load history", err);
      } finally {
        if (active) setImportHistoryLoaded(true);
      }
    };

    loadSettings();
    loadImportHistory();

    return () => {
      active = false;
    };
  }, [selectedBuilding, showNotification, authLoading, user, importHistoryRefresh]);

  useEffect(() => {
    if (selectedDate || !selectedBuilding || !importHistoryLoaded) return;
    let active = true;

    const initializeSelectedDate = async () => {
      const latestImportDate = importHistory
        .map((item) => parseImportDateRange(item)?.end || "")
        .filter(Boolean)
        .sort()
        .pop();
      if (latestImportDate) {
        if (active) setSelectedDate(latestImportDate);
        return;
      }

      try {
        const buildingName =
          resolveBuildingDisplayName(selectedBuilding) || selectedBuilding;
        const latestSnapshotDocs = await loadBuildingScopedDocs({
          collectionName: "temperatureRoomSnapshots",
          buildingCode: selectedBuilding,
          buildingName,
          codeConstraints: [orderBy("dateLocal", "desc"), limit(1)],
        });
        const latestSnapshotDate = latestSnapshotDocs
          .map((docSnap) => toLocalDateToken(docSnap.data()?.dateLocal || ""))
          .filter(Boolean)
          .sort()
          .pop();
        if (latestSnapshotDate) {
          if (active) setSelectedDate(latestSnapshotDate);
          return;
        }
      } catch (error) {
        console.error("Failed to determine latest snapshot date:", error);
      }

      if (active) {
        setSelectedDate(
          formatDateInTimeZone(
            new Date(),
            buildingSettings?.timezone || DEFAULT_TIMEZONE,
          ),
        );
      }
    };

    void initializeSelectedDate();
    return () => {
      active = false;
    };
  }, [
    selectedDate,
    selectedBuilding,
    importHistoryLoaded,
    importHistory,
    buildingSettings?.timezone,
  ]);

  useEffect(() => {
    if (snapshotTimes.length === 0) return;
    const exists = snapshotTimes.some((slot) => slot.id === selectedSnapshotId);
    if (!selectedSnapshotId || !exists) {
      setSelectedSnapshotId(snapshotTimes[0].id);
    }
  }, [selectedSnapshotId, snapshotTimes]);

  useEffect(() => {
    if (authLoading || !user) return;
    if (!selectedBuilding) return;
    let active = true;
    const loadDevices = async () => {
      try {
        const buildingName =
          resolveBuildingDisplayName(selectedBuilding) || selectedBuilding;
        const docs = await loadBuildingScopedDocs({
          collectionName: "temperatureDevices",
          buildingCode: selectedBuilding,
          buildingName,
        });
        if (!active) return;
        const map = {};
        docs.forEach((docSnap) => {
          const data = docSnap.data();
          const canonicalSpaceKey = normalizeSingleSpaceKey(
            data?.mapping?.spaceKey || data?.spaceKey || "",
          );
          map[docSnap.id] = {
            id: docSnap.id,
            ...data,
            ...(data?.mapping
              ? {
                  mapping: {
                    ...data.mapping,
                    ...(canonicalSpaceKey
                      ? { spaceKey: canonicalSpaceKey }
                      : {}),
                  },
                }
              : {}),
            ...(canonicalSpaceKey ? { spaceKey: canonicalSpaceKey } : {}),
          };
        });
        setDeviceDocs(map);
      } catch (error) {
        console.error("Error loading devices:", error);
      }
    };
    loadDevices();
    return () => {
      active = false;
    };
  }, [selectedBuilding, authLoading, user]);

  useEffect(() => {
    if (authLoading || !user) return;
    if (!selectedBuilding || !selectedDate) return;
    let active = true;
    const loadSnapshots = async () => {
      setSnapshotLoading(true);
      try {
        const buildingName =
          resolveBuildingDisplayName(selectedBuilding) || selectedBuilding;
        const docs = await loadBuildingScopedDocs({
          collectionName: "temperatureRoomSnapshots",
          buildingCode: selectedBuilding,
          buildingName,
          codeConstraints: [where("dateLocal", "==", selectedDate)],
        });
        if (!active) return;
        const items = docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setSnapshotDocs(items);
      } catch (error) {
        console.error("Error loading snapshots:", error);
        showNotification(
          "error",
          "Snapshot Load Failed",
          "Unable to load temperature snapshots for this date.",
        );
      } finally {
        if (active) setSnapshotLoading(false);
      }
    };
    loadSnapshots();
    return () => {
      active = false;
    };
  }, [
    selectedBuilding,
    selectedDate,
    showNotification,
    authLoading,
    user,
    snapshotRefreshKey,
  ]);

  useEffect(() => {
    if (!selectedBuilding) return;
    const today = formatDateInTimeZone(
      new Date(),
      buildingSettings?.timezone || DEFAULT_TIMEZONE,
    );
    if (!historicalStart) setHistoricalStart(today);
    if (!historicalEnd) setHistoricalEnd(today);
    if (!exportStart) setExportStart(today);
    if (!exportEnd) setExportEnd(today);
    if (!recomputeStart) setRecomputeStart(today);
    if (!recomputeEnd) setRecomputeEnd(today);
  }, [
    selectedBuilding,
    buildingSettings?.timezone,
    historicalStart,
    historicalEnd,
    exportStart,
    exportEnd,
    recomputeStart,
    recomputeEnd,
  ]);

  const updateMarkerDraft = (spaceKey, xPct, yPct) => {
    setMarkerDrafts((prev) => ({
      ...prev,
      [spaceKey]: {
        xPct: Math.max(0, Math.min(100, xPct)),
        yPct: Math.max(0, Math.min(100, yPct)),
      },
    }));
  };

  const handleMarkerPointerDown = (spaceKey, event) => {
    if (!editingPositions || !mapRef.current) return;
    event.preventDefault();
    const rect = mapRef.current.getBoundingClientRect();
    dragStateRef.current = {
      spaceKey,
      rect,
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const handlePointerMove = (event) => {
    const state = dragStateRef.current;
    if (!state || !mapRef.current) return;
    const { rect, spaceKey } = state;
    const xPct = ((event.clientX - rect.left) / rect.width) * 100;
    const yPct = ((event.clientY - rect.top) / rect.height) * 100;
    updateMarkerDraft(spaceKey, xPct, yPct);
  };

  const handlePointerUp = () => {
    dragStateRef.current = null;
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
  };

  const handleMapClick = (event) => {
    if (!editingPositions || !activePlacementSpaceKey || !mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    const xPct = ((event.clientX - rect.left) / rect.width) * 100;
    const yPct = ((event.clientY - rect.top) / rect.height) * 100;
    updateMarkerDraft(activePlacementSpaceKey, xPct, yPct);
    setActivePlacementSpaceKey("");
  };

  const startEditingPositions = () => {
    setEditingPositions(true);
    setMarkerDrafts(buildingSettings?.markers || {});
    setActivePlacementSpaceKey("");
  };

  const cancelEditingPositions = () => {
    setEditingPositions(false);
    setMarkerDrafts({});
    setActivePlacementSpaceKey("");
  };

  const saveMarkerPositions = async () => {
    if (!selectedBuilding) return;
    try {
      const buildingKey = toBuildingKey(selectedBuilding);
      await setDoc(
        doc(db, "temperatureBuildingSettings", buildingKey),
        {
          buildingCode: selectedBuilding,
          buildingName: selectedBuildingName || selectedBuilding,
          markers: markerDrafts,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setBuildingSettings((prev) => ({
        ...prev,
        markers: markerDrafts,
      }));
      setEditingPositions(false);
      showNotification(
        "success",
        "Marker Positions Saved",
        "Floorplan markers updated successfully.",
      );
    } catch (error) {
      console.error("Error saving marker positions:", error);
      showNotification(
        "error",
        "Save Failed",
        "Unable to save floorplan markers.",
      );
    }
  };

  const handleFloorplanUpload = async (file) => {
    if (!file || !selectedBuilding) return;

    // specific check for Firestore document size limit (approx 1MB minus metadata)
    if (file.size > 900 * 1024) {
      showNotification(
        "error",
        "File Too Large",
        "For database storage, image must be under 900KB. Please compress the PNG.",
      );
      return;
    }

    try {
      const { base64, width, height } = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            resolve({
              base64: e.target.result,
              width: img.width,
              height: img.height,
            });
          };
          img.onerror = () => reject(new Error("Invalid image file."));
          img.src = e.target.result;
        };
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
      });

      const buildingKey = toBuildingKey(selectedBuilding);

      // Store directly in Firestore structure
      const floorplan = {
        storagePath: null, // No external storage used
        downloadUrl: base64, // Data URL serves as the source
        width,
        height,
        updatedAt: new Date().toISOString(),
      };

      await setDoc(
        doc(db, "temperatureBuildingSettings", buildingKey),
        {
          buildingCode: selectedBuilding,
          buildingName: selectedBuildingName || selectedBuilding,
          floorplan,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      setBuildingSettings((prev) => ({
        ...prev,
        floorplan,
      }));
      showNotification(
        "success",
        "Floorplan Saved",
        "Floorplan saved directly to database.",
      );
    } catch (error) {
      console.error("Error saving floorplan:", error);
      showNotification(
        "error",
        "Save Failed",
        "Unable to save floorplan to database.",
      );
    }
  };

  const handleDeleteFloorplan = () => {
    if (!selectedBuilding) return;
    setShowDeleteFloorplanConfirm(true);
  };

  const confirmDeleteFloorplan = async () => {
    setShowDeleteFloorplanConfirm(false);
    try {
      const buildingKey = toBuildingKey(selectedBuilding);
      await setDoc(
        doc(db, "temperatureBuildingSettings", buildingKey),
        {
          floorplan: null,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      setBuildingSettings((prev) => ({
        ...prev,
        floorplan: null,
      }));
      showNotification(
        "success",
        "Floorplan Deleted",
        "Floorplan has been removed.",
      );
    } catch (error) {
      console.error("Error deleting floorplan:", error);
      showNotification("error", "Delete Failed", "Unable to delete floorplan.");
    }
  };

  const deleteDocRefsInBatches = async (docRefs = []) => {
    const uniqueRefs = [];
    const seenPaths = new Set();
    docRefs.forEach((refItem) => {
      if (!refItem?.path) return;
      if (seenPaths.has(refItem.path)) return;
      seenPaths.add(refItem.path);
      uniqueRefs.push(refItem);
    });
    if (uniqueRefs.length === 0) return 0;

    let batch = writeBatch(db);
    let operationCount = 0;
    let deletedCount = 0;
    for (const refItem of uniqueRefs) {
      batch.delete(refItem);
      operationCount += 1;
      deletedCount += 1;
      if (operationCount >= MAX_FIRESTORE_BATCH_WRITES) {
        await batch.commit();
        batch = writeBatch(db);
        operationCount = 0;
      }
    }
    if (operationCount > 0) {
      await batch.commit();
    }
    return deletedCount;
  };

  const refreshDeviceDateBounds = async (deviceId) => {
    if (!deviceId) return;
    const readingsSnap = await getDocs(
      query(
        collection(db, "temperatureDeviceReadings"),
        where("deviceId", "==", deviceId),
      ),
    );

    let earliestLocalTimestamp = "";
    let latestLocalTimestamp = "";
    let earliestUtcDate = null;
    let latestUtcDate = null;

    readingsSnap.docs.forEach((docSnap) => {
      const samples = docSnap.data()?.samples || {};
      Object.values(samples).forEach((sample) => {
        const rawLocal = (sample?.rawLocal || "").toString();
        if (rawLocal) {
          if (!earliestLocalTimestamp || rawLocal < earliestLocalTimestamp) {
            earliestLocalTimestamp = rawLocal;
          }
          if (!latestLocalTimestamp || rawLocal > latestLocalTimestamp) {
            latestLocalTimestamp = rawLocal;
          }
        }
        const utcValue = sample?.utc?.toDate
          ? sample.utc.toDate()
          : sample?.utc instanceof Date
            ? sample.utc
            : null;
        if (utcValue) {
          if (!earliestUtcDate || utcValue < earliestUtcDate) {
            earliestUtcDate = utcValue;
          }
          if (!latestUtcDate || utcValue > latestUtcDate) {
            latestUtcDate = utcValue;
          }
        }
      });
    });

    await setDoc(
      doc(db, "temperatureDevices", deviceId),
      {
        earliestLocalTimestamp: earliestLocalTimestamp || null,
        latestLocalTimestamp: latestLocalTimestamp || null,
        earliestUtc: earliestUtcDate ? Timestamp.fromDate(earliestUtcDate) : null,
        latestUtc: latestUtcDate ? Timestamp.fromDate(latestUtcDate) : null,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  };

  const handleDeleteRoomData = async () => {
    const targetSpaceKey = normalizeSingleSpaceKey(deleteRoomSpaceKey || "");
    if (!selectedBuilding || !targetSpaceKey) return;

    setShowDeleteRoomDataConfirm(false);
    setDeletingRoomData(true);
    try {
      const buildingName = selectedBuildingName || selectedBuilding;
      const roomLabel = getSpaceLabel(
        roomLookup[targetSpaceKey] || { id: targetSpaceKey },
        spacesByKey,
      );

      const roomImportDocs = await loadBuildingScopedDocs({
        collectionName: "temperatureImports",
        buildingCode: selectedBuilding,
        buildingName,
      });
      const roomImports = roomImportDocs
        .map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }))
        .filter(
          (item) =>
            normalizeSingleSpaceKey(item?.spaceKey || "") === targetSpaceKey,
        );

      const roomImportRefs = roomImports.map((item) =>
        doc(db, "temperatureImports", item.id),
      );

      const aggregateDocs = await loadBuildingScopedDocs({
        collectionName: "temperatureRoomAggregates",
        buildingCode: selectedBuilding,
        buildingName,
        codeConstraints: [where("spaceKey", "==", targetSpaceKey)],
      });

      const snapshotDocsForRoom = await loadBuildingScopedDocs({
        collectionName: "temperatureRoomSnapshots",
        buildingCode: selectedBuilding,
        buildingName,
        codeConstraints: [where("spaceKey", "==", targetSpaceKey)],
      });

      const mappedDeviceDocs = await loadBuildingScopedDocs({
        collectionName: "temperatureDevices",
        buildingCode: selectedBuilding,
        buildingName,
        codeConstraints: [where("mapping.spaceKey", "==", targetSpaceKey)],
      });

      const deviceDateRanges = new Map();
      const deviceIdsFromImports = new Set();
      roomImports.forEach((item) => {
        const deviceId = (item?.deviceId || "").toString().trim();
        if (!deviceId) return;
        deviceIdsFromImports.add(deviceId);
        const nextRanges = deviceDateRanges.get(deviceId) || [];
        const dateRange = parseImportDateRange(item);
        if (dateRange) {
          nextRanges.push(dateRange);
        }
        deviceDateRanges.set(deviceId, nextRanges);
      });

      const readingsRefMap = new Map();
      const affectedDeviceIds = new Set();
      for (const deviceId of deviceIdsFromImports) {
        const mergedRanges = mergeDateRanges(deviceDateRanges.get(deviceId) || []);
        if (mergedRanges.length === 0) {
          const readingsSnap = await getDocs(
            query(
              collection(db, "temperatureDeviceReadings"),
              where("deviceId", "==", deviceId),
            ),
          );
          readingsSnap.docs.forEach((docSnap) => {
            readingsRefMap.set(docSnap.ref.path, docSnap.ref);
            affectedDeviceIds.add(deviceId);
          });
          continue;
        }

        for (const range of mergedRanges) {
          const readingsSnap = await getDocs(
            query(
              collection(db, "temperatureDeviceReadings"),
              where("deviceId", "==", deviceId),
              where("dateLocal", ">=", range.start),
              where("dateLocal", "<=", range.end),
            ),
          );
          readingsSnap.docs.forEach((docSnap) => {
            readingsRefMap.set(docSnap.ref.path, docSnap.ref);
            affectedDeviceIds.add(deviceId);
          });
        }
      }

      const deletedImports = await deleteDocRefsInBatches(roomImportRefs);
      const deletedAggregates = await deleteDocRefsInBatches(
        aggregateDocs.map((docSnap) => docSnap.ref),
      );
      const deletedSnapshots = await deleteDocRefsInBatches(
        snapshotDocsForRoom.map((docSnap) => docSnap.ref),
      );
      const deletedReadings = await deleteDocRefsInBatches(
        Array.from(readingsRefMap.values()),
      );

      const mappedDeviceIds = new Set(
        mappedDeviceDocs.map((docSnap) => docSnap.id).filter(Boolean),
      );
      const devicesToRefresh = new Set([
        ...Array.from(affectedDeviceIds),
        ...Array.from(mappedDeviceIds),
      ]);
      for (const deviceId of devicesToRefresh) {
        await refreshDeviceDateBounds(deviceId);
      }

      setImportHistory((prev) =>
        prev.filter(
          (item) =>
            normalizeSingleSpaceKey(item?.spaceKey || "") !== targetSpaceKey,
        ),
      );
      setDeleteRoomSpaceKey("");
      setImportHistoryRefresh((prev) => prev + 1);
      setSnapshotRefreshKey((prev) => prev + 1);
      emitTemperatureDataRefresh({
        buildingCode: selectedBuilding,
        updatedAt: new Date().toISOString(),
      });

      showNotification(
        "success",
        "Room Data Deleted",
        `${roomLabel}: removed ${deletedImports} import logs, ${deletedReadings} reading docs, ${deletedAggregates} aggregate docs, and ${deletedSnapshots} snapshot docs.`,
      );
    } catch (error) {
      console.error("Failed to delete room temperature data:", error);
      showNotification(
        "error",
        "Delete Failed",
        "Unable to delete room temperature data.",
      );
    } finally {
      setDeletingRoomData(false);
    }
  };

  const handleAddSnapshotTime = () => {
    const minutes = parseTime(newSnapshotTime);
    if (minutes == null) {
      showNotification("error", "Invalid Time", 'Use a format like "8:30 AM".');
      return;
    }
    const tolerance = Number(newSnapshotTolerance) || 0;
    const nextTimes = [
      ...(buildingSettings?.snapshotTimes || []),
      {
        id: uuidv4(),
        label: formatMinutesToTime(minutes),
        minutes,
        toleranceMinutes: tolerance,
      },
    ].sort((a, b) => a.minutes - b.minutes);
    setBuildingSettings((prev) => ({ ...prev, snapshotTimes: nextTimes }));
    setNewSnapshotTime("");
    setNewSnapshotTolerance(15);
  };

  const handleUpdateSnapshotTime = (id, updates) => {
    const nextTimes = (buildingSettings?.snapshotTimes || [])
      .map((slot) => (slot.id === id ? { ...slot, ...updates } : slot))
      .sort((a, b) => a.minutes - b.minutes);
    setBuildingSettings((prev) => ({ ...prev, snapshotTimes: nextTimes }));
  };

  const handleRemoveSnapshotTime = (id) => {
    const nextTimes = (buildingSettings?.snapshotTimes || []).filter(
      (slot) => slot.id !== id,
    );
    setBuildingSettings((prev) => ({ ...prev, snapshotTimes: nextTimes }));
    if (selectedSnapshotId === id && nextTimes.length > 0) {
      setSelectedSnapshotId(nextTimes[0].id);
    }
  };

  const sanitizeTypeRanges = (rangesByType) => {
    const cleaned = {};
    const invalidTypes = [];
    if (!rangesByType || typeof rangesByType !== "object") {
      return { cleaned, invalidTypes };
    }
    Object.entries(rangesByType).forEach(([type, range]) => {
      if (!type || !range || typeof range !== "object") return;
      const minF = coerceNumber(range.minF);
      const maxF = coerceNumber(range.maxF);
      if (minF == null && maxF == null) return;
      const normalized = normalizeIdealRange(minF, maxF);
      if (!normalized) {
        invalidTypes.push(type);
        return;
      }
      cleaned[type] = normalized;
    });
    return { cleaned, invalidTypes };
  };

  const saveBuildingSettings = async () => {
    if (!selectedBuilding || !buildingSettings) return;
    if (!isValidTimeZone(buildingSettings.timezone || DEFAULT_TIMEZONE)) {
      showNotification(
        "error",
        "Invalid Timezone",
        "Please enter a valid IANA timezone (e.g., America/Chicago).",
      );
      return;
    }
    const defaultMin = coerceNumber(buildingSettings.idealTempFMin);
    const defaultMax = coerceNumber(buildingSettings.idealTempFMax);
    const range = normalizeIdealRange(defaultMin, defaultMax);
    if (
      (defaultMin != null || defaultMax != null) &&
      !range
    ) {
      showNotification(
        "error",
        "Invalid Ideal Range",
        "Ideal temperature minimum must be less than or equal to the maximum.",
      );
      return;
    }
    const { cleaned: typeRanges, invalidTypes } = sanitizeTypeRanges(
      buildingSettings.idealTempRangesBySpaceType,
    );
    if (invalidTypes.length > 0) {
      showNotification(
        "error",
        "Invalid Type Range",
        `Ideal temperature minimum must be less than or equal to the maximum for ${invalidTypes[0]}.`,
      );
      return;
    }
    try {
      const buildingKey = toBuildingKey(selectedBuilding);
      const sortedTimes = [...(buildingSettings.snapshotTimes || [])].sort(
        (a, b) => (a.minutes || 0) - (b.minutes || 0),
      );
      const payload = {
        buildingCode: selectedBuilding,
        buildingName: selectedBuildingName || selectedBuilding,
        timezone: buildingSettings.timezone || DEFAULT_TIMEZONE,
        idealTempFMin: defaultMin,
        idealTempFMax: defaultMax,
        idealTempRangesBySpaceType: typeRanges,
        snapshotTimes: sortedTimes,
        markers: buildingSettings.markers || {},
        floorplan: buildingSettings.floorplan || null,
        updatedAt: serverTimestamp(),
        hidden: buildingIsHidden,
      };
      if (!settingsExists) payload.createdAt = serverTimestamp();
      await setDoc(
        doc(db, "temperatureBuildingSettings", buildingKey),
        payload,
        { merge: true },
      );

      setHiddenBuildingCodes((prev) => {
        const next = new Set(prev);
        if (buildingIsHidden) next.add(selectedBuilding);
        else next.delete(selectedBuilding);
        return next;
      });

      setSettingsExists(true);
      showNotification(
        "success",
        "Settings Saved",
        "Temperature settings updated for this building.",
      );
    } catch (error) {
      console.error("Error saving settings:", error);
      showNotification(
        "error",
        "Save Failed",
        "Unable to save temperature settings.",
      );
    }
  };

  const updateTypeRange = (type, updates) => {
    setBuildingSettings((prev) => {
      if (!prev) return prev;
      const prevRanges =
        prev.idealTempRangesBySpaceType &&
          typeof prev.idealTempRangesBySpaceType === "object"
          ? prev.idealTempRangesBySpaceType
          : {};
      const current = prevRanges[type] || { minF: null, maxF: null };
      const nextRange = { ...current, ...updates };
      const nextRanges = { ...prevRanges };
      if (nextRange.minF == null && nextRange.maxF == null) {
        delete nextRanges[type];
      } else {
        nextRanges[type] = nextRange;
      }
      return { ...prev, idealTempRangesBySpaceType: nextRanges };
    });
  };

  const suggestRoomMatch = (label) => {
    const roomsList = roomsForBuilding;
    if (!label || roomsList.length === 0) {
      return { spaceKey: "", confidence: 0, method: "none" };
    }
    const labelNormalized = normalizeMatchText(label);
    const labelTokens = extractRoomTokens(label).map(normalizeRoomNumber);
    let best = null;
    roomsList.forEach((room) => {
      const roomNumber = normalizeRoomNumber(
        room.spaceNumber || room.roomNumber || "",
      );
      const spaceLabel = normalizeMatchText(getSpaceLabel(room, spacesByKey));
      let score = 0;
      let method = "";
      if (roomNumber && labelTokens.includes(roomNumber)) {
        score = 0.95;
        method = "exact_room_number";
      } else if (roomNumber) {
        const digits = roomNumber.replace(/\D/g, "");
        if (
          digits &&
          labelTokens.some((token) => token.replace(/\D/g, "") === digits)
        ) {
          score = 0.85;
          method = "room_number";
        }
        if (labelNormalized.includes(roomNumber.toLowerCase())) {
          score = Math.max(score, 0.75);
          method = method || "room_number_text";
        }
      }
      if (!score && spaceLabel && labelNormalized.includes(spaceLabel)) {
        score = 0.8;
        method = "label_match";
      }
      if (!score) return;
      if (!best || score > best.score) {
        best = { room, score, method, tied: false };
      } else if (best && score === best.score) {
        best.tied = true;
      }
    });
    if (!best) return { spaceKey: "", confidence: 0, method: "none" };
    let confidence = best.score;
    if (best.tied) confidence = Math.min(confidence, 0.65);
    return {
      spaceKey: best.room.spaceKey || best.room.id,
      confidence,
      method: best.method,
    };
  };

  const hashFile = async (file) => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  const parseCsvFile = (file) =>
    new Promise((resolve, reject) => {
      Papa.parse(file, {
        skipEmptyLines: true,
        complete: (results) => {
          if (!results.data || results.data.length === 0) {
            reject(new Error("CSV is empty."));
            return;
          }
          const [headerRow, ...rows] = results.data;
          resolve({ headerRow, rows });
        },
        error: (error) => reject(error),
      });
    });

  const buildPendingMappings = (items) => {
    const seen = new Set();
    return items
      .filter((item) => item.deviceId)
      .filter((item) => {
        if (seen.has(item.deviceId)) return false;
        seen.add(item.deviceId);
        return true;
      })
      .map((item) => ({
        deviceId: item.deviceId,
        deviceLabel: item.deviceLabel,
        suggestedSpaceKey: item.suggestedSpaceKey,
        matchConfidence: item.matchConfidence,
        matchMethod: item.matchMethod,
      }));
  };

  const pruneMappingOverrides = (overrides, items) => {
    const deviceIds = new Set(
      items.map((item) => item.deviceId).filter(Boolean),
    );
    return Object.keys(overrides).reduce((acc, deviceId) => {
      if (deviceIds.has(deviceId)) acc[deviceId] = overrides[deviceId];
      return acc;
    }, {});
  };

  const processFiles = async (files) => {
    if (!selectedBuilding || files.length === 0) return;

    const nextItems = [];
    const buildingName =
      resolveBuildingDisplayName(selectedBuilding) || selectedBuilding;
    for (const file of files) {
      try {
        const fileHash = await hashFile(file);
        let duplicate = false;
        let duplicateCount = 0;
        try {
          const duplicateDocs = await loadBuildingScopedDocs({
            collectionName: "temperatureImports",
            buildingCode: selectedBuilding,
            buildingName,
            codeConstraints: [where("fileHash", "==", fileHash)],
          });
          duplicateCount = duplicateDocs.length;
          duplicate = duplicateCount > 0;
        } catch (duplicateError) {
          console.warn("Failed to check duplicate file hash:", duplicateError);
        }
        const parsed = await parseCsvFile(file);
        const {
          timestampIndex,
          temperatureIndex,
          humidityIndex,
          temperatureUnit,
        } = detectGoveeCsvColumns(parsed.headerRow || []);
        if (timestampIndex === -1 || temperatureIndex === -1) {
          nextItems.push({
            id: uuidv4(),
            file,
            fileName: file.name,
            fileHash,
            duplicate,
            duplicateCount,
            errors: ["Missing required timestamp or temperature columns."],
            errorCount: 1,
            samples: [],
          });
          continue;
        }
        const samples = [];
        let minTimestamp = "";
        let maxTimestamp = "";
        let parsedCount = 0;
        let errorCount = 0;
        parsed.rows.forEach((row) => {
          const rawTimestamp = row[timestampIndex];
          const rawTemperature = row[temperatureIndex];
          const rawHumidity = humidityIndex > -1 ? row[humidityIndex] : null;
          const parts = parseLocalTimestamp(rawTimestamp);
          if (!parts) {
            errorCount += 1;
            return;
          }
          const tempVal = Number.parseFloat(rawTemperature);
          if (Number.isNaN(tempVal)) {
            errorCount += 1;
            return;
          }
          const humidityVal =
            rawHumidity == null || rawHumidity === ""
              ? null
              : Number.parseFloat(rawHumidity);
          const tempF =
            temperatureUnit === "C" ? (tempVal * 9) / 5 + 32 : tempVal;
          const tempC =
            temperatureUnit === "C" ? tempVal : ((tempVal - 32) * 5) / 9;
          samples.push({
            localTimestamp: parts.raw,
            parts,
            temperatureF: Number.isFinite(tempF) ? Number(tempF) : null,
            temperatureC: Number.isFinite(tempC) ? Number(tempC) : null,
            humidity: Number.isFinite(humidityVal) ? Number(humidityVal) : null,
          });
          parsedCount += 1;
          if (!minTimestamp || parts.raw < minTimestamp)
            minTimestamp = parts.raw;
          if (!maxTimestamp || parts.raw > maxTimestamp)
            maxTimestamp = parts.raw;
        });
        const deviceLabel = parseDeviceLabelFromFilename(file.name);
        const deviceId = toDeviceId(selectedBuilding, deviceLabel);
        const existingDevice = deviceDocs[deviceId];
        const existingSpaceKey = normalizeSingleSpaceKey(
          existingDevice?.mapping?.spaceKey ||
            existingDevice?.spaceKey ||
            "",
        );
        const suggestion = existingSpaceKey
          ? {
            spaceKey: existingSpaceKey,
            confidence: existingDevice.mapping.confidence ?? 1,
            method:
              existingDevice.mapping.method ||
              existingDevice.mapping.matchMethod ||
              "existing",
          }
          : suggestRoomMatch(deviceLabel);
        nextItems.push({
          id: uuidv4(),
          file,
          fileName: file.name,
          fileHash,
          duplicate,
          duplicateCount,
          deviceLabel,
          deviceId,
          temperatureUnit: temperatureUnit || "F",
          rowCount: parsed.rows.length,
          parsedCount,
          errorCount,
          minTimestamp,
          maxTimestamp,
          samples,
          suggestedSpaceKey: suggestion.spaceKey,
          matchConfidence: suggestion.confidence,
          matchMethod: suggestion.method,
        });
      } catch (error) {
        console.error("CSV parse error:", error);
        nextItems.push({
          id: uuidv4(),
          file,
          fileName: file.name,
          errors: ["Unable to parse this CSV file."],
          errorCount: 1,
          samples: [],
        });
      }
    }
    setImportItems((prevItems) => {
      const mergedByKey = new Map();
      [...prevItems, ...nextItems].forEach((item) => {
        mergedByKey.set(buildImportItemMergeKey(item), item);
      });
      const mergedItems = Array.from(mergedByKey.values());
      setPendingMappings(buildPendingMappings(mergedItems));
      setMappingOverrides((prevOverrides) =>
        pruneMappingOverrides(prevOverrides, mergedItems),
      );
      return mergedItems;
    });
  };

  const extractCsvsFromZip = async (zipFile) => {
    const csvFiles = [];

    const extractFromZip = async (source) => {
      const zip = await JSZip.loadAsync(source);
      const filePromises = [];

      zip.forEach((relativePath, zipEntry) => {
        if (zipEntry.dir) return;
        const lowerPath = relativePath.toLowerCase();
        if (lowerPath.endsWith(".csv")) {
          filePromises.push(
            zipEntry.async("blob").then((blob) => {
              const fileName = relativePath.split("/").pop() || relativePath;
              const file = new File([blob], fileName, { type: "text/csv" });
              csvFiles.push(file);
            }),
          );
          return;
        }
        if (lowerPath.endsWith(".zip")) {
          filePromises.push(
            zipEntry
              .async("arraybuffer")
              .then((buffer) => extractFromZip(buffer))
              .catch((error) => {
                console.error("Failed to extract nested ZIP:", relativePath, error);
              }),
          );
        }
      });

      await Promise.all(filePromises);
    };

    await extractFromZip(zipFile);
    return csvFiles;
  };

  const expandFilesToCsvs = async (files) => {
    const allCsvs = [];
    for (const file of files) {
      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith(".zip")) {
        try {
          const extracted = await extractCsvsFromZip(file);
          allCsvs.push(...extracted);
        } catch (error) {
          console.error("Failed to extract ZIP:", file.name, error);
        }
      } else if (
        lowerName.endsWith(".csv") ||
        file.type === "text/csv" ||
        file.type === "application/vnd.ms-excel"
      ) {
        allCsvs.push(file);
      }
    }
    return allCsvs;
  };

  const handleCsvSelection = async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    event.target.value = "";
    const csvFiles = await expandFilesToCsvs(files);
    if (csvFiles.length > 0) {
      await processFiles(csvFiles);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []);
    const csvFiles = await expandFilesToCsvs(files);
    if (csvFiles.length > 0) {
      await processFiles(csvFiles);
    }
  };

  const handleRemoveImportItem = (itemId) => {
    setImportItems((prevItems) => {
      const nextItems = prevItems.filter((item) => item.id !== itemId);
      setPendingMappings(buildPendingMappings(nextItems));
      setMappingOverrides((prevOverrides) =>
        pruneMappingOverrides(prevOverrides, nextItems),
      );
      return nextItems;
    });
  };

  const handleClearImports = () => {
    setImportItems([]);
    setPendingMappings([]);
    setMappingOverrides({});
  };

  const createImportJob = async ({ totalFiles, totalRows }) => {
    if (!selectedBuilding) return null;
    const jobId = uuidv4();
    importProgressRef.current = {
      lastUpdate: 0,
      lastRows: 0,
      lastReadings: 0,
      lastSkippedExisting: 0,
      lastConflicts: 0,
    };
    await setDoc(
      doc(db, "temperatureImportJobs", jobId),
      {
        buildingCode: selectedBuilding,
        buildingName: selectedBuildingName || selectedBuilding,
        status: "running",
        stage: "Preparing",
        totalFiles,
        processedFiles: 0,
        totalRows,
        processedRows: 0,
        processedReadings: 0,
        skippedExistingReadings: 0,
        conflictCount: 0,
        currentFile: null,
        createdBy: user?.uid || null,
        startedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    localStorage.setItem(`temperatureImportJob:${selectedBuilding}`, jobId);
    setImportJobId(jobId);
    return jobId;
  };

  const updateImportJob = async (jobId, updates, { force = false } = {}) => {
    if (!jobId) return;
    const now = Date.now();
    const lastUpdate = importProgressRef.current.lastUpdate || 0;
    const lastRows = importProgressRef.current.lastRows || 0;
    const lastReadings = importProgressRef.current.lastReadings || 0;
    const lastSkippedExisting = importProgressRef.current.lastSkippedExisting || 0;
    const lastConflicts = importProgressRef.current.lastConflicts || 0;
    const nextRows =
      updates.processedRows != null ? updates.processedRows : lastRows;
    const nextReadings =
      updates.processedReadings != null
        ? updates.processedReadings
        : lastReadings;
    const nextSkippedExisting =
      updates.skippedExistingReadings != null
        ? updates.skippedExistingReadings
        : lastSkippedExisting;
    const nextConflicts =
      updates.conflictCount != null ? updates.conflictCount : lastConflicts;
    if (
      !force &&
      now - lastUpdate < 1500 &&
      nextRows - lastRows < 250 &&
      nextReadings - lastReadings < 50 &&
      nextSkippedExisting - lastSkippedExisting < 50 &&
      nextConflicts - lastConflicts < 25
    ) {
      return;
    }
    importProgressRef.current.lastUpdate = now;
    importProgressRef.current.lastRows = nextRows;
    importProgressRef.current.lastReadings = nextReadings;
    importProgressRef.current.lastSkippedExisting = nextSkippedExisting;
    importProgressRef.current.lastConflicts = nextConflicts;
    try {
      await updateDoc(doc(db, "temperatureImportJobs", jobId), {
        ...updates,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Failed to update import job:", error);
    }
  };

  const recomputeSnapshotsForDay = async ({
    buildingCode,
    buildingName,
    spaceKey,
    dateLocal,
    samples,
    timezone,
    deviceId,
    deviceLabel,
  }) => {
    for (const snapshot of snapshotTimes) {
      const targetMinutes = snapshot.minutes;
      const tolerance = snapshot.toleranceMinutes ?? 15;
      let bestSample = null;
      let bestDelta = null;
      for (let delta = 0; delta <= tolerance; delta += 1) {
        const candidates =
          delta === 0
            ? [targetMinutes]
            : [targetMinutes - delta, targetMinutes + delta];
        for (const minute of candidates) {
          if (minute < 0 || minute > 1439) continue;
          const sample = samples[String(minute)];
          if (!sample) continue;
          bestSample = sample;
          bestDelta = Math.abs(minute - targetMinutes);
          break;
        }
        if (bestSample) break;
      }
      const stableBuilding = buildingCode || buildingName || "";
      const stableSpaceKey = spaceKey || "";
      const snapshotId = toSnapshotDocId(
        stableBuilding,
        stableSpaceKey,
        dateLocal,
        snapshot.id,
      );
      const snapshotRef = doc(db, "temperatureRoomSnapshots", snapshotId);
      const existingSnap = await getDoc(snapshotRef);
      const status = bestSample ? "ok" : "missing";
      const recomputedUtc = bestSample?.rawLocal
        ? (() => {
          const parsed = parseLocalTimestamp(bestSample.rawLocal);
          const utcDate = parsed ? zonedTimeToUtc(parsed, timezone) : null;
          return utcDate ? Timestamp.fromDate(utcDate) : bestSample.utc;
        })()
        : null;
      const payload = {
        buildingCode: buildingCode || "",
        buildingName: buildingName || buildingCode || "",
        spaceKey: stableSpaceKey,
        spaceLabel: getSpaceLabel(
          roomLookup[stableSpaceKey] || { id: stableSpaceKey },
          spacesByKey,
        ),
        dateLocal,
        snapshotTimeId: snapshot.id,
        snapshotLabel: snapshot.label || formatMinutesToTime(snapshot.minutes),
        targetMinutes,
        toleranceMinutes: tolerance,
        timezone,
        status,
        temperatureF: bestSample ? bestSample.temperatureF : null,
        temperatureC: bestSample ? bestSample.temperatureC : null,
        humidity: bestSample ? bestSample.humidity : null,
        deltaMinutes: bestSample ? bestDelta : null,
        sourceDeviceId: bestSample ? deviceId : null,
        sourceDeviceLabel: bestSample ? deviceLabel : null,
        sourceReadingLocal: bestSample ? bestSample.rawLocal : null,
        sourceReadingUtc: bestSample ? recomputedUtc : null,
        updatedAt: serverTimestamp(),
      };
      if (!existingSnap.exists()) payload.createdAt = serverTimestamp();
      if (existingSnap.exists()) {
        const existing = existingSnap.data();
        const same =
          existing.status === payload.status &&
          existing.temperatureF === payload.temperatureF &&
          existing.temperatureC === payload.temperatureC &&
          existing.humidity === payload.humidity &&
          existing.deltaMinutes === payload.deltaMinutes &&
          existing.sourceReadingLocal === payload.sourceReadingLocal;
        if (same) continue;
      }
      await setDoc(snapshotRef, payload, { merge: true });
    }
  };

  const handleImport = async () => {
    if (!selectedBuilding || !buildingSettings) return;
    if (importItems.length === 0) return;
    if (!isValidTimeZone(buildingSettings.timezone || DEFAULT_TIMEZONE)) {
      showNotification(
        "error",
        "Invalid Timezone",
        "Update the building timezone before importing.",
      );
      return;
    }
    const unresolved = pendingMappings.filter((item) => {
      const override = mappingOverrides[item.deviceId];
      return !override && !item.suggestedSpaceKey;
    });
    if (unresolved.length > 0) {
      showNotification(
        "error",
        "Mapping Required",
        "Please resolve device-to-room mappings before importing.",
      );
      return;
    }
    const importQueue = importItems.filter(
      (item) =>
        (item.errorCount ?? 0) === 0 &&
        item.deviceId &&
        Array.isArray(item.samples) &&
        item.samples.length > 0,
    );
    if (importQueue.length === 0) {
      showNotification(
        "error",
        "Nothing to Import",
        "No valid files are ready for import.",
      );
      return;
    }
    setImporting(true);
    const totalFiles = importQueue.length;
    const totalRows = importQueue.reduce(
      (sum, item) => sum + (item.samples?.length || 0),
      0,
    );
    let jobId = null;
    const deviceCache = { ...deviceDocs };
    let totalNewReadings = 0;
    let totalSkippedExisting = 0;
    let totalConflicts = 0;
    let totalImportLogs = 0;
    let processedFiles = 0;
    let processedRows = 0;
    const dayDocCache = new Map();
    try {
      jobId = await createImportJob({ totalFiles, totalRows });
      await updateImportJob(
        jobId,
        {
          stage: "Writing readings",
          processedFiles,
          processedRows,
          totalFiles,
          totalRows,
          processedReadings: totalNewReadings,
          skippedExistingReadings: totalSkippedExisting,
          conflictCount: totalConflicts,
        },
        { force: true },
      );
      for (const item of importQueue) {
        if (!item.deviceId || !item.samples || item.samples.length === 0)
          continue;
        const deviceId = item.deviceId;
        const deviceLabel = item.deviceLabel || deviceId;
        const existingDevice = deviceCache[deviceId];
        const latestLocal = existingDevice?.latestLocalTimestamp || "";
        const spaceKey = normalizeSingleSpaceKey(
          mappingOverrides[deviceId] ||
            item.suggestedSpaceKey ||
            existingDevice?.mapping?.spaceKey ||
            "",
        );
        if (!spaceKey) continue;
        const timezone = buildingSettings.timezone || DEFAULT_TIMEZONE;
        const manualOverride = Boolean(mappingOverrides[deviceId]);
        const mappingPayload = {
          spaceKey,
          method: manualOverride
            ? "manual"
            : item.matchMethod ||
            existingDevice?.mapping?.method ||
            existingDevice?.mapping?.matchMethod ||
            "auto",
          confidence: manualOverride
            ? 1
            : (item.matchConfidence ??
              existingDevice?.mapping?.confidence ??
              1),
          updatedAt: serverTimestamp(),
          manual: manualOverride,
        };
        const mappedSpaceLabel = getSpaceLabel(
          roomLookup[spaceKey] || { id: spaceKey },
          spacesByKey,
        );

        await updateImportJob(
          jobId,
          {
            stage: "Writing readings",
            currentFile: item.fileName || deviceLabel,
            processedFiles,
            processedRows,
            processedReadings: totalNewReadings,
            skippedExistingReadings: totalSkippedExisting,
            conflictCount: totalConflicts,
          },
          { force: true },
        );

        const samplesByDate = {};
        const earliestLocal = existingDevice?.earliestLocalTimestamp || "";
        let newLatestLocal = latestLocal;
        let newEarliestLocal = earliestLocal;
        let newLatestUtc = existingDevice?.latestUtc || null;
        let newLatestUtcDate = newLatestUtc?.toDate
          ? newLatestUtc.toDate()
          : newLatestUtc instanceof Date
            ? newLatestUtc
            : null;
        let newEarliestUtc = existingDevice?.earliestUtc || null;
        let newEarliestUtcDate = newEarliestUtc?.toDate
          ? newEarliestUtc.toDate()
          : newEarliestUtc instanceof Date
            ? newEarliestUtc
            : null;
        item.samples.forEach((sample) => {
          processedRows += 1;
          // Duplicate detection is minute-based, so backfilled dates are allowed
          // while already imported minute buckets are skipped.
          if (processedRows % 500 === 0) {
            void updateImportJob(jobId, {
              processedFiles,
              processedRows,
              stage: "Writing readings",
              processedReadings: totalNewReadings,
              skippedExistingReadings: totalSkippedExisting,
              conflictCount: totalConflicts,
            });
          }
          if (sample.localTimestamp > newLatestLocal)
            newLatestLocal = sample.localTimestamp;
          if (!newEarliestLocal || sample.localTimestamp < newEarliestLocal)
            newEarliestLocal = sample.localTimestamp;
          const utcDate = zonedTimeToUtc(sample.parts, timezone);
          if (utcDate && (!newLatestUtcDate || utcDate > newLatestUtcDate)) {
            newLatestUtcDate = utcDate;
            newLatestUtc = Timestamp.fromDate(utcDate);
          }
          if (utcDate && (!newEarliestUtcDate || utcDate < newEarliestUtcDate)) {
            newEarliestUtcDate = utcDate;
            newEarliestUtc = Timestamp.fromDate(utcDate);
          }
          const dateKey = toDateKey(sample.parts);
          const minuteKey = String(getMinutesSinceMidnight(sample.parts));
          if (!samplesByDate[dateKey]) samplesByDate[dateKey] = {};
          samplesByDate[dateKey][minuteKey] = {
            temperatureF: sample.temperatureF,
            temperatureC: sample.temperatureC,
            humidity: sample.humidity,
            rawLocal: sample.localTimestamp,
            utc: utcDate ? Timestamp.fromDate(utcDate) : null,
          };
        });

        const updatedDates = new Set();
        const daySamplesCache = {};
        let deviceNewReadings = 0;
        let deviceSkippedExisting = 0;
        let deviceConflicts = 0;

        for (const [dateKey, entries] of Object.entries(samplesByDate)) {
          const docId = toDeviceDayId(deviceId, dateKey);
          const dayRef = doc(db, "temperatureDeviceReadings", docId);
          const cachedDay = dayDocCache.get(docId);
          let dayExists = Boolean(cachedDay?.exists);
          let existingSamples = cachedDay?.samples || {};
          let existingSampleCount = Number(cachedDay?.sampleCount) || 0;

          if (!cachedDay) {
            const daySnap = await getDoc(dayRef);
            if (daySnap.exists()) {
              const existingData = daySnap.data();
              existingSamples = existingData?.samples || {};
              existingSampleCount =
                Number(existingData?.sampleCount) ||
                Object.keys(existingSamples).length;
              dayExists = true;
            } else {
              existingSamples = {};
              existingSampleCount = 0;
              dayExists = false;
            }
            dayDocCache.set(docId, {
              exists: dayExists,
              samples: existingSamples,
              sampleCount: existingSampleCount,
            });
          }

          const newEntries = {};
          let skippedExisting = 0;
          let conflicts = 0;
          Object.entries(entries).forEach(([minuteKey, sample]) => {
            const existing = existingSamples[minuteKey];
            if (existing) {
              const same =
                existing.temperatureF === sample.temperatureF &&
                existing.temperatureC === sample.temperatureC &&
                existing.humidity === sample.humidity &&
                existing.rawLocal === sample.rawLocal;
              if (same) {
                skippedExisting += 1;
              } else {
                conflicts += 1;
              }
              return;
            }
            newEntries[minuteKey] = sample;
          });
          const newCount = Object.keys(newEntries).length;
          if (newCount === 0) {
            daySamplesCache[dateKey] = existingSamples;
            deviceSkippedExisting += skippedExisting;
            deviceConflicts += conflicts;
            continue;
          }
          const metadata = {
            buildingCode: selectedBuilding,
            buildingName: selectedBuildingName || selectedBuilding,
            deviceId,
            deviceLabel,
            dateLocal: dateKey,
            timezone,
            updatedAt: serverTimestamp(),
          };
          if (!dayExists) metadata.createdAt = serverTimestamp();
          const updatePayload = { ...metadata };
          if (dayExists) {
            Object.entries(newEntries).forEach(([minuteKey, sample]) => {
              updatePayload[`samples.${minuteKey}`] = sample;
            });
            updatePayload.sampleCount = existingSampleCount + newCount;
            await updateDoc(dayRef, updatePayload);
          } else {
            await setDoc(
              dayRef,
              {
                ...metadata,
                sampleCount: newCount,
                samples: newEntries,
              },
              { merge: true },
            );
          }
          const mergedSamples = { ...existingSamples, ...newEntries };
          const mergedSampleCount = existingSampleCount + newCount;
          dayDocCache.set(docId, {
            exists: true,
            samples: mergedSamples,
            sampleCount: mergedSampleCount,
          });
          deviceNewReadings += newCount;
          deviceSkippedExisting += skippedExisting;
          deviceConflicts += conflicts;
          updatedDates.add(dateKey);
          daySamplesCache[dateKey] = mergedSamples;

          void updateImportJob(jobId, {
            processedFiles,
            processedRows,
            stage: "Writing readings",
            processedReadings: totalNewReadings + deviceNewReadings,
            skippedExistingReadings: totalSkippedExisting + deviceSkippedExisting,
            conflictCount: totalConflicts + deviceConflicts,
          });
        }

        totalSkippedExisting += deviceSkippedExisting;
        totalConflicts += deviceConflicts;
        if (deviceNewReadings > 0) {
          totalNewReadings += deviceNewReadings;
        }

        const importDocId = uuidv4();
        await setDoc(doc(db, "temperatureImports", importDocId), {
          buildingCode: selectedBuilding,
          buildingName: selectedBuildingName || selectedBuilding,
          importRunId: jobId || null,
          status: deviceNewReadings > 0 ? "completed" : "no_new_readings",
          importedBy: user?.uid || null,
          deviceId,
          deviceLabel,
          spaceKey,
          spaceLabel: mappedSpaceLabel,
          mappingMethod: mappingPayload.method,
          mappingConfidence: mappingPayload.confidence,
          mappingManual: mappingPayload.manual,
          mappingUpdatedAt: serverTimestamp(),
          fileName: item.fileName,
          fileHash: item.fileHash,
          duplicateFileHash: Boolean(item.duplicate),
          duplicateFileHashCount: item.duplicateCount || 0,
          rowCount: item.rowCount || 0,
          parsedCount: item.parsedCount || 0,
          newReadings: deviceNewReadings,
          skippedExistingCount: deviceSkippedExisting,
          conflictCount: deviceConflicts,
          updatedDates: Array.from(updatedDates).sort(),
          dateRange: {
            start: item.minTimestamp,
            end: item.maxTimestamp,
          },
          temperatureUnit: item.temperatureUnit || "F",
          createdAt: serverTimestamp(),
        });
        totalImportLogs += 1;

        const existingMapping = existingDevice?.mapping || {};
        const existingSpaceKey = normalizeSingleSpaceKey(
          existingMapping.spaceKey || "",
        );
        const mappingChanged =
          existingSpaceKey !== mappingPayload.spaceKey ||
          Boolean(existingMapping.manual) !== Boolean(mappingPayload.manual) ||
          (existingMapping.method || existingMapping.matchMethod || "auto") !==
          mappingPayload.method;
        const latestLocalChanged =
          newLatestLocal && newLatestLocal !== latestLocal;
        const earliestLocalChanged =
          newEarliestLocal && newEarliestLocal !== earliestLocal;
        const shouldUpdateDevice =
          deviceNewReadings > 0 || mappingChanged || latestLocalChanged || earliestLocalChanged;
        if (shouldUpdateDevice) {
          await setDoc(
            doc(db, "temperatureDevices", deviceId),
            {
              buildingCode: selectedBuilding,
              buildingName: selectedBuildingName || selectedBuilding,
              label: deviceLabel,
              labelNormalized: normalizeMatchText(deviceLabel),
              mapping: mappingPayload,
              latestLocalTimestamp: newLatestLocal || latestLocal || null,
              latestUtc: newLatestUtc || existingDevice?.latestUtc || null,
              earliestLocalTimestamp: newEarliestLocal || earliestLocal || null,
              earliestUtc: newEarliestUtc || existingDevice?.earliestUtc || null,
              lastImportedAt:
                deviceNewReadings > 0
                  ? serverTimestamp()
                  : existingDevice?.lastImportedAt || null,
              updatedAt: serverTimestamp(),
              createdAt: existingDevice
                ? existingDevice.createdAt || serverTimestamp()
                : serverTimestamp(),
            },
            { merge: true },
          );
          deviceCache[deviceId] = {
            ...(deviceCache[deviceId] || {}),
            buildingCode: selectedBuilding,
            buildingName: selectedBuildingName || selectedBuilding,
            label: deviceLabel,
            labelNormalized: normalizeMatchText(deviceLabel),
            mapping: mappingPayload,
            latestLocalTimestamp: newLatestLocal || latestLocal || null,
            latestUtc: newLatestUtc || existingDevice?.latestUtc || null,
            earliestLocalTimestamp: newEarliestLocal || earliestLocal || null,
            earliestUtc: newEarliestUtc || existingDevice?.earliestUtc || null,
          };
        }

        if (updatedDates.size > 0) {
          await updateImportJob(
            jobId,
            {
              stage: "Aggregating",
              processedFiles,
              processedRows,
              processedReadings: totalNewReadings,
              skippedExistingReadings: totalSkippedExisting,
              conflictCount: totalConflicts,
            },
            { force: true },
          );
          for (const dateKey of updatedDates) {
            const samples = daySamplesCache[dateKey] || {};
            const aggregates = buildHourlyAggregates(samples);
            const aggregateId = toRoomAggregateDocId(
              selectedBuilding,
              spaceKey,
              dateKey,
            );
            await setDoc(
              doc(db, "temperatureRoomAggregates", aggregateId),
              {
                buildingCode: selectedBuilding,
                buildingName: selectedBuildingName || selectedBuilding,
                spaceKey,
                spaceLabel: getSpaceLabel(
                  roomLookup[spaceKey] || { id: spaceKey },
                  spacesByKey,
                ),
                dateLocal: dateKey,
                timezone,
                hourly: aggregates.hourly,
                daily: aggregates.daily,
                sampleCount: aggregates.sampleCount,
                sourceDeviceId: deviceId,
                sourceDeviceLabel: deviceLabel,
                updatedAt: serverTimestamp(),
                createdAt: serverTimestamp(),
              },
              { merge: true },
            );
          }
        }

        if (updatedDates.size > 0 && snapshotTimes.length > 0) {
          await updateImportJob(
            jobId,
            {
              stage: "Updating snapshots",
              processedFiles,
              processedRows,
              processedReadings: totalNewReadings,
              skippedExistingReadings: totalSkippedExisting,
              conflictCount: totalConflicts,
            },
            { force: true },
          );
          for (const dateKey of updatedDates) {
            const samples = daySamplesCache[dateKey] || {};
            await recomputeSnapshotsForDay({
              buildingCode: selectedBuilding,
              buildingName: selectedBuildingName || selectedBuilding,
              spaceKey,
              dateLocal: dateKey,
              samples,
              timezone,
              deviceId,
              deviceLabel,
            });
          }
        }

        processedFiles += 1;
        await updateImportJob(
          jobId,
          {
            processedFiles,
            processedRows,
            currentFile: null,
            stage: "Writing readings",
            processedReadings: totalNewReadings,
            skippedExistingReadings: totalSkippedExisting,
            conflictCount: totalConflicts,
          },
          { force: true },
        );
      }
      await updateImportJob(
        jobId,
        {
          stage: "Finalizing",
          processedFiles,
          processedRows,
          processedReadings: totalNewReadings,
          skippedExistingReadings: totalSkippedExisting,
          conflictCount: totalConflicts,
        },
        { force: true },
      );
      await updateImportJob(
        jobId,
        {
          status: "completed",
          stage: "Completed",
          processedFiles,
          processedRows,
          processedReadings: totalNewReadings,
          skippedExistingReadings: totalSkippedExisting,
          conflictCount: totalConflicts,
          finishedAt: serverTimestamp(),
          currentFile: null,
        },
        { force: true },
      );
      setDeviceDocs(deviceCache);
      if (totalNewReadings === 0) {
        const skippedNote =
          totalSkippedExisting > 0
            ? ` ${totalSkippedExisting} existing readings were skipped.`
            : "";
        const conflictNote =
          totalConflicts > 0 ? ` ${totalConflicts} conflicts were skipped.` : "";
        showNotification(
          "success",
          "No New Readings",
          `No new readings were added.${skippedNote}${conflictNote} Logged ${totalImportLogs} import file${totalImportLogs === 1 ? "" : "s"}.`,
        );
      } else {
        const conflictNote =
          totalConflicts > 0 ? ` (${totalConflicts} conflicts skipped)` : "";
        const skippedNote =
          totalSkippedExisting > 0
            ? ` (${totalSkippedExisting} existing readings skipped)`
            : "";
        showNotification(
          "success",
          "Import Complete",
          `${totalNewReadings} new readings added${skippedNote}${conflictNote}. Logged ${totalImportLogs} import file${totalImportLogs === 1 ? "" : "s"}.`,
        );
      }
      setImportItems([]);
      setPendingMappings([]);
      setMappingOverrides({});
      setImportHistoryRefresh((prev) => prev + 1);
      setSnapshotRefreshKey((prev) => prev + 1);
      emitTemperatureDataRefresh({
        buildingCode: selectedBuilding,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Import error:", error);
      if (jobId) {
        const details = [];
        if (error?.message) details.push(error.message);
        if (error?.code) details.push(`Code: ${error.code}`);
        await updateImportJob(
          jobId,
          {
            status: "failed",
            stage: "Failed",
            processedFiles,
            processedRows,
            processedReadings: totalNewReadings,
            skippedExistingReadings: totalSkippedExisting,
            conflictCount: totalConflicts,
            errorSummary: error?.message || "Import failed",
            errorDetails: details,
            finishedAt: serverTimestamp(),
            currentFile: null,
          },
          { force: true },
        );
      }
      showNotification(
        "error",
        "Import Failed",
        "Unable to import temperature CSVs.",
      );
    } finally {
      setImporting(false);
    }
  };

  const handleRecomputeSnapshots = async () => {
    if (!selectedBuilding || !recomputeStart || !recomputeEnd) return;
    if (!isValidTimeZone(buildingSettings?.timezone || DEFAULT_TIMEZONE)) {
      showNotification(
        "error",
        "Invalid Timezone",
        "Update the building timezone before recomputing.",
      );
      return;
    }
    if (recomputeStart > recomputeEnd) {
      showNotification(
        "error",
        "Invalid Range",
        "Start date must be before end date.",
      );
      return;
    }
    setRecomputing(true);
    try {
      const buildingName = selectedBuildingName || selectedBuilding;
      const docs = await loadBuildingScopedDocs({
        collectionName: "temperatureDeviceReadings",
        buildingCode: selectedBuilding,
        buildingName,
        codeConstraints: [
          where("dateLocal", ">=", recomputeStart),
          where("dateLocal", "<=", recomputeEnd),
        ],
      });
      for (const docSnap of docs) {
        const data = docSnap.data();
        const device = deviceDocs[data.deviceId];
        const spaceKey = normalizeSingleSpaceKey(
          device?.mapping?.spaceKey || device?.spaceKey || "",
        );
        if (!spaceKey) continue;
        const samples = data.samples || {};
        await recomputeSnapshotsForDay({
          buildingCode: selectedBuilding,
          buildingName: selectedBuildingName || selectedBuilding,
          spaceKey,
          dateLocal: data.dateLocal,
          samples,
          timezone: buildingSettings?.timezone || DEFAULT_TIMEZONE,
          deviceId: data.deviceId,
          deviceLabel: device?.label || data.deviceId,
        });
        const aggregates = buildHourlyAggregates(samples);
        const aggregateId = toRoomAggregateDocId(
          selectedBuilding,
          spaceKey,
          data.dateLocal,
        );
        await setDoc(
          doc(db, "temperatureRoomAggregates", aggregateId),
          {
            buildingCode: selectedBuilding,
            buildingName: selectedBuildingName || selectedBuilding,
            spaceKey,
            spaceLabel: getSpaceLabel(
              roomLookup[spaceKey] || { id: spaceKey },
              spacesByKey,
            ),
            dateLocal: data.dateLocal,
            timezone: buildingSettings?.timezone || DEFAULT_TIMEZONE,
            hourly: aggregates.hourly,
            daily: aggregates.daily,
            sampleCount: aggregates.sampleCount,
            sourceDeviceId: data.deviceId,
            sourceDeviceLabel: device?.label || data.deviceId,
            updatedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
          },
          { merge: true },
        );
      }
      showNotification(
        "success",
        "Snapshots Recomputed",
        "Snapshot results updated for the selected range.",
      );
    } catch (error) {
      console.error("Recompute error:", error);
      showNotification(
        "error",
        "Recompute Failed",
        "Unable to recompute snapshots.",
      );
    } finally {
      setRecomputing(false);
    }
  };

  const loadHistorical = async () => {
    if (!selectedBuilding || !historicalStart || !historicalEnd) return;
    if (historicalStart > historicalEnd) {
      showNotification(
        "error",
        "Invalid Range",
        "Start date must be before end date.",
      );
      return;
    }
    setHistoricalLoading(true);
    try {
      const buildingName = selectedBuildingName || selectedBuilding;
      const docs = (
        await loadBuildingScopedDocs({
          collectionName: "temperatureRoomSnapshots",
          buildingCode: selectedBuilding,
          buildingName,
          codeConstraints: [
            where("dateLocal", ">=", historicalStart),
            where("dateLocal", "<=", historicalEnd),
          ],
        })
      ).map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      const normalizedDocs = docs
        .map((docData) => {
          const spaceKey = normalizeSingleSpaceKey(docData.spaceKey || "");
          if (!spaceKey) return null;
          return {
            ...docData,
            spaceKey,
          };
        })
        .filter(Boolean);
      setHistoricalDocs(normalizedDocs);
    } catch (error) {
      console.error("Historical load error:", error);
      showNotification(
        "error",
        "Historical Load Failed",
        "Unable to load historical snapshot data.",
      );
    } finally {
      setHistoricalLoading(false);
    }
  };

  const handleSnapshotExport = async () => {
    if (!selectedBuilding || !exportStart || !exportEnd) return;
    if (exportStart > exportEnd) {
      showNotification(
        "error",
        "Invalid Range",
        "Start date must be before end date.",
      );
      return;
    }
    setExporting(true);
    try {
      const exportSpaceSet = new Set(
        (exportSpaceKeys || [])
          .map((value) => normalizeSingleSpaceKey(value || ""))
          .filter(Boolean),
      );
      const buildingName = selectedBuildingName || selectedBuilding;
      const docs = (
        await loadBuildingScopedDocs({
          collectionName: "temperatureRoomSnapshots",
          buildingCode: selectedBuilding,
          buildingName,
          codeConstraints: [
            where("dateLocal", ">=", exportStart),
            where("dateLocal", "<=", exportEnd),
          ],
        })
      ).map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      const filtered = docs
        .map((docData) => {
          const spaceKey = normalizeSingleSpaceKey(docData.spaceKey || "");
          if (!spaceKey) return null;
          return {
            ...docData,
            spaceKey,
          };
        })
        .filter(Boolean)
        .filter((docData) => {
          const spaceKey = docData.spaceKey;
          if (exportSpaceSet.size > 0 && !exportSpaceSet.has(spaceKey)) {
            return false;
          }
          if (
            exportSnapshotIds.length > 0 &&
            !exportSnapshotIds.includes(docData.snapshotTimeId)
          ) {
            return false;
          }
          return true;
        });
      const headers = [
        "Building",
        "Room",
        "Date",
        "Snapshot Time",
        "Temperature F",
        "Temperature C",
        "Humidity",
        "Status",
        "Timezone",
        "Delta Minutes",
        "Source Local Timestamp",
        "Source UTC Timestamp",
        "Device Label",
      ];
      const rows = filtered.map((docData) => {
        const spaceKey = docData.spaceKey;
        return [
          docData.buildingName || selectedBuildingName || selectedBuilding,
          getSpaceLabel(roomLookup[spaceKey] || { id: spaceKey }, spacesByKey) ||
            docData.spaceLabel ||
            "",
          docData.dateLocal || "",
          docData.snapshotLabel || "",
          docData.temperatureF ?? "",
          docData.temperatureC ?? "",
          docData.humidity ?? "",
          docData.status || "",
          docData.timezone || buildingSettings?.timezone || DEFAULT_TIMEZONE,
          docData.deltaMinutes ?? "",
          docData.sourceReadingLocal || "",
          docData.sourceReadingUtc?.toDate
            ? docData.sourceReadingUtc.toDate().toISOString()
            : "",
          docData.sourceDeviceLabel || "",
        ];
      });
      const csvContent = [
        headers.map(toCsvSafe).join(","),
        ...rows.map((row) => row.map(toCsvSafe).join(",")),
      ].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `temperature-snapshots-${selectedBuilding}-${exportStart}-to-${exportEnd}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      showNotification(
        "success",
        "Export Ready",
        `Exported ${rows.length} snapshot rows.`,
      );
    } catch (error) {
      console.error("Export error:", error);
      showNotification(
        "error",
        "Export Failed",
        "Unable to export snapshot data.",
      );
    } finally {
      setExporting(false);
    }
  };

  const handleRawExport = async () => {
    if (!selectedBuilding || !exportStart || !exportEnd) return;
    if (exportStart > exportEnd) {
      showNotification(
        "error",
        "Invalid Range",
        "Start date must be before end date.",
      );
      return;
    }
    setExporting(true);
    try {
      const exportSpaceSet = new Set(
        (exportSpaceKeys || [])
          .map((value) => normalizeSingleSpaceKey(value || ""))
          .filter(Boolean),
      );
      const buildingName = selectedBuildingName || selectedBuilding;
      const docs = await loadBuildingScopedDocs({
        collectionName: "temperatureDeviceReadings",
        buildingCode: selectedBuilding,
        buildingName,
        codeConstraints: [
          where("dateLocal", ">=", exportStart),
          where("dateLocal", "<=", exportEnd),
        ],
      });
      const rows = [];
      docs.forEach((docSnap) => {
        const data = docSnap.data();
        const device = deviceDocs[data.deviceId] || {};
        const spaceKey = normalizeSingleSpaceKey(
          device?.mapping?.spaceKey || device?.spaceKey || "",
        );
        if (exportSpaceSet.size > 0) {
          if (!spaceKey || !exportSpaceSet.has(spaceKey)) return;
        }
        const spaceLabel = spaceKey
          ? getSpaceLabel(roomLookup[spaceKey] || { id: spaceKey }, spacesByKey)
          : "";
        const samples = data.samples || {};
        Object.values(samples).forEach((sample) => {
          rows.push([
            buildingName || selectedBuilding,
            spaceLabel,
            device.label || data.deviceId,
            sample.rawLocal || "",
            buildingSettings?.timezone || DEFAULT_TIMEZONE,
            sample.temperatureF ?? "",
            sample.temperatureC ?? "",
            sample.humidity ?? "",
          ]);
        });
      });
      const headers = [
        "Building",
        "Room",
        "Device Label",
        "Local Timestamp",
        "Timezone",
        "Temperature F",
        "Temperature C",
        "Humidity",
      ];
      const csvContent = [
        headers.map(toCsvSafe).join(","),
        ...rows.map((row) => row.map(toCsvSafe).join(",")),
      ].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `temperature-raw-${selectedBuilding}-${exportStart}-to-${exportEnd}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      showNotification(
        "success",
        "Export Ready",
        `Exported ${rows.length} raw readings.`,
      );
    } catch (error) {
      console.error("Raw export error:", error);
      showNotification(
        "error",
        "Export Failed",
        "Unable to export raw readings.",
      );
    } finally {
      setExporting(false);
    }
  };

  const markerMap = editingPositions
    ? markerDrafts
    : buildingSettings?.markers || {};
  const missingMarkers = roomsForBuilding.filter((room) => {
    const spaceKey = room.spaceKey || room.id;
    if (!spaceKey) return false;
    return !markerMap[spaceKey];
  });

  const currentSnapshotLabel = selectedSnapshotSlot?.label || "";

  const floorplanData = buildingSettings?.floorplan;

  const renderFloorplan = () => {
    if (roomsLoading || settingsLoading) {
      return (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-600">
          Loading floorplan data...
        </div>
      );
    }
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Floorplan View
            </h2>
            <p className="text-sm text-gray-600">
              {selectedDate || "Select a date"} -{" "}
              {currentSnapshotLabel || "Select a snapshot time"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!editingPositions ? (
              <button className="btn-secondary" onClick={startEditingPositions}>
                <Pencil className="w-4 h-4 mr-2" /> Edit Positions
              </button>
            ) : (
              <>
                <button className="btn-primary" onClick={saveMarkerPositions}>
                  <Save className="w-4 h-4 mr-2" /> Save Positions
                </button>
                <button className="btn-ghost" onClick={cancelEditingPositions}>
                  <X className="w-4 h-4 mr-2" /> Cancel
                </button>
              </>
            )}
            <label className="btn-secondary cursor-pointer">
              <ImageIcon className="w-4 h-4 mr-2" /> Upload PNG
              <input
                type="file"
                accept="image/png"
                className="hidden"
                onChange={(event) =>
                  handleFloorplanUpload(event.target.files?.[0])
                }
              />
            </label>
          </div>
        </div>

        {floorplanData?.downloadUrl && !editingPositions && (
          <div className="flex justify-end mb-4">
            <button
              className="btn-ghost text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={handleDeleteFloorplan}
            >
              <Trash2 className="w-4 h-4 mr-2" /> Delete Floorplan
            </button>
          </div>
        )}

        {!floorplanData?.downloadUrl ? (
          <div className="border-2 border-dashed border-gray-200 rounded-xl p-12 text-center bg-gray-50/50">
            <div className="max-w-sm mx-auto">
              <div className="w-16 h-16 rounded-full bg-baylor-green/10 flex items-center justify-center mx-auto mb-4">
                <MapIcon className="w-8 h-8 text-baylor-green" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No Floorplan Uploaded
              </h3>
              <p className="text-sm text-gray-600 mb-6">
                Upload a PNG image of the building floorplan to visualize
                temperature data with room markers.
              </p>
              <label className="btn-primary cursor-pointer inline-flex items-center gap-2">
                <ImageIcon className="w-4 h-4" />
                Upload Floorplan
                <input
                  type="file"
                  accept="image/png"
                  className="hidden"
                  onChange={(event) =>
                    handleFloorplanUpload(event.target.files?.[0])
                  }
                />
              </label>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
            <div className="relative border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
              <div
                ref={mapRef}
                className={`relative ${editingPositions ? "cursor-crosshair" : ""}`}
                onClick={handleMapClick}
              >
                <img
                  src={floorplanData.downloadUrl}
                  alt={`${selectedBuilding} floorplan`}
                  className="w-full h-auto block"
                />
                {roomsForBuilding.map((room) => {
                  const spaceKey = room.spaceKey || room.id;
                  if (!spaceKey) return null;
                  const marker = markerMap[spaceKey];
                  if (!marker) return null;
                  const snapshot = resolveSnapshotForSlot(
                    spaceKey,
                    selectedSnapshotSlot,
                  );
                  const isMissing = !snapshot || snapshot.status === "missing";
                  const tempLabel = formatSnapshotTemp(snapshot);
                  const tempValueF = resolveSnapshotTempF(snapshot);
                  const roomRange = resolveIdealRangeForRoom(room);
                  const roomNum =
                    room.spaceNumber || room.roomNumber || room.name || "";
                  return (
                    <button
                      key={spaceKey}
                      type="button"
                      onPointerDown={(event) =>
                        handleMarkerPointerDown(spaceKey, event)
                      }
                      className={`absolute -translate-x-1/2 -translate-y-1/2 rounded px-2 py-1 text-[10px] font-medium shadow-sm whitespace-nowrap flex flex-col items-center leading-tight ${getTempToneClasses({
                        valueF: tempValueF,
                        missing: isMissing,
                        range: roomRange,
                        variant: "solid",
                      })}`}
                      style={{
                        left: `${marker.xPct}%`,
                        top: `${marker.yPct}%`,
                      }}
                      title={`${getSpaceLabel(room, spacesByKey)} - ${tempLabel}`}
                    >
                      <span className="text-[9px] uppercase tracking-wide">
                        {roomNum || getSpaceLabel(room, spacesByKey)}
                      </span>
                      {!isMissing && Number.isFinite(tempValueF) && (
                        <span className="text-[12px] font-semibold">
                          {Math.round(tempValueF)}°
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4">
              {editingPositions && (
                <div className="bg-baylor-green/5 border border-baylor-green/20 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-baylor-green mb-2">
                    Edit Mode
                  </h3>
                  <p className="text-xs text-gray-600 mb-3">
                    Drag existing markers or choose a room below, then click the
                    map to place it.
                  </p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {missingMarkers.length === 0 ? (
                      <div className="text-xs text-gray-600">
                        All rooms have markers placed.
                      </div>
                    ) : (
                      missingMarkers.map((room) => {
                        const spaceKey = room.spaceKey || room.id;
                        if (!spaceKey) return null;
                        return (
                          <button
                            key={spaceKey}
                            className={`w-full text-left px-3 py-2 rounded-md border text-xs ${activePlacementSpaceKey === spaceKey ? "border-baylor-green bg-baylor-green/10" : "border-gray-200 hover:border-baylor-green/50"}`}
                            onClick={() => setActivePlacementSpaceKey(spaceKey)}
                          >
                            {getSpaceLabel(room, spacesByKey)}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">
                  Snapshot Summary
                </h3>
                <div className="text-sm text-gray-600 space-y-1">
                  <div>{roomsForBuilding.length} rooms in building</div>
                  <div>
                    {Object.keys(snapshotLookup).length} rooms with data
                  </div>
                  <div>
                    Timezone: {timezoneLabel}
                  </div>
                </div>
                <Link
                  to="/facilities/spaces"
                  className="mt-3 inline-flex items-center gap-1.5 text-xs text-baylor-green hover:text-baylor-green/80 transition-colors"
                >
                  <Plus size={12} />
                  Add or manage rooms
                </Link>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">
                  Missing Data
                </h3>
                <div className="text-xs text-gray-600 max-h-40 overflow-y-auto space-y-1">
                  {roomsForBuilding
                    .filter((room) => {
                      const spaceKey = room.spaceKey || room.id;
                      const snapshot = spaceKey
                        ? resolveSnapshotForSlot(spaceKey, selectedSnapshotSlot)
                        : null;
                      return !snapshot || snapshot.status === "missing";
                    })
                    .map((room) => (
                      <div key={room.spaceKey || room.id}>
                        {getSpaceLabel(room, spacesByKey)}
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const handleGrabReadings = async () => {
    if (!roomsForBuilding.length || !snapshotTimes.length) return;

    const buildingName =
      resolveBuildingDisplayName(selectedBuilding) || selectedBuilding;
    const lines = [`Temperature Readings - ${buildingName} - ${selectedDate}`];
    lines.push("");

    roomsForBuilding.forEach((room) => {
      const spaceKey = room.spaceKey || room.id;
      if (!spaceKey) return;

      const readings = [];
      snapshotTimes.forEach((slot) => {
        const snapshot = resolveSnapshotForSlot(spaceKey, slot);
        const isMissing = !snapshot || snapshot.status === "missing";

        if (!isMissing) {
          const tempF = resolveSnapshotTempF(snapshot);
          if (tempF != null) {
            readings.push(
              `${Math.round(tempF)}°F (${slot.label || formatMinutesToLabel(slot.minutes)})`,
            );
          }
        }
      });

      if (readings.length > 0) {
        const spaceLabel = getSpaceLabel(room, spacesByKey);
        lines.push(`${spaceLabel}: ${readings.join(" | ")}`);
      }
    });

    if (lines.length <= 2) {
      showNotification(
        "info",
        "No Readings",
        "No temperature data found to copy for this date.",
      );
      return;
    }

    const textToCopy = lines.join("\n");
    try {
      await navigator.clipboard.writeText(textToCopy);
      showNotification(
        "success",
        "Copied",
        "Temperature readings copied to clipboard.",
      );
    } catch (err) {
      console.error("Failed to copy:", err);
      showNotification("error", "Copy Failed", "Could not copy to clipboard.");
    }
  };

  const renderDailyTable = () => (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4" data-tutorial="daily-table">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Daily Snapshot Table
          </h2>
          <p className="text-sm text-gray-600">
            Date: {selectedDate || "Select a date"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleGrabReadings}
            className="p-1.5 hover:bg-gray-100 rounded-md text-gray-600 transition-colors"
            title="Grab readings to clipboard"
          >
            <Copy className="w-5 h-5" />
          </button>
          <div className="text-sm text-gray-600">
            {snapshotTimes.length} snapshot times
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="university-table min-w-full">
          <thead>
            <tr>
              <th className="table-header-cell">
                Room
              </th>
              {snapshotTimes.map((slot) => (
                <th
                  key={slot.id}
                  className="table-header-cell"
                >
                  {slot.label || formatMinutesToLabel(slot.minutes)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roomsForBuilding.map((room) => {
              const spaceKey = room.spaceKey || room.id;
              if (!spaceKey) return null;
              const roomRange = resolveIdealRangeForRoom(room);
              return (
                <tr key={spaceKey}>
                  <td className="table-cell font-medium text-gray-800">
                    {getSpaceLabel(room, spacesByKey)}
                  </td>
                  {snapshotTimes.map((slot) => {
                    const snapshot = resolveSnapshotForSlot(spaceKey, slot);
                    const isMissing =
                      !snapshot || snapshot.status === "missing";
                    const tempValueF = resolveSnapshotTempF(snapshot);
                    return (
                      <td key={slot.id} className="table-cell">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${getTempToneClasses({
                            valueF: tempValueF,
                            missing: isMissing,
                            range: roomRange,
                            variant: "pill",
                          })}`}
                        >
                          {formatSnapshotTemp(snapshot)}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  const missingCounts = useMemo(() => {
    const counts = {};
    historicalDocs.forEach((docData) => {
      if (docData.status !== "missing") return;
      const spaceKey = docData.spaceKey;
      if (!spaceKey) return;
      counts[spaceKey] = (counts[spaceKey] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([spaceKey, count]) => ({ spaceKey, count }))
      .sort((a, b) => b.count - a.count);
  }, [historicalDocs]);

  const renderHistorical = () => {
    const roomSnapshots = historicalSpaceKey
      ? historicalDocs.filter(
        (docData) => docData.spaceKey === historicalSpaceKey,
      )
      : [];

    const dates = Array.from(
      new Set(roomSnapshots.map((docData) => docData.dateLocal)),
    ).sort();
    const historicalRoomRange = resolveIdealRangeForSpaceType(
      roomLookup[historicalSpaceKey]?.type,
      defaultIdealRange,
      idealRangesByType,
    );

    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Historical View
            </h2>
            <p className="text-sm text-gray-600">
              Track snapshot history across dates.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              className="form-input"
              value={historicalStart}
              onChange={(e) => setHistoricalStart(e.target.value)}
            />
            <span className="text-gray-500">to</span>
            <input
              type="date"
              className="form-input"
              value={historicalEnd}
              onChange={(e) => setHistoricalEnd(e.target.value)}
            />
            <button
              className="btn-secondary"
              onClick={loadHistorical}
              disabled={historicalLoading}
            >
              {historicalLoading ? "Loading..." : "Load"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          <div>
            <label className="form-label">Room</label>
            <select
              className="form-input"
              value={historicalSpaceKey}
              onChange={(e) => setHistoricalSpaceKey(e.target.value)}
            >
              <option value="">Select a room...</option>
              {roomsForBuilding.map((room) => {
                const spaceKey = room.spaceKey || room.id;
                if (!spaceKey) return null;
                return (
                  <option key={spaceKey} value={spaceKey}>
                    {getSpaceLabel(room, spacesByKey)}
                  </option>
                );
              })}
            </select>
            {historicalSpaceKey && (
              <div className="mt-4 overflow-x-auto">
                <table className="university-table min-w-full">
                  <thead>
                    <tr>
                      <th className="table-header-cell">
                        Date
                      </th>
                      {snapshotTimes.map((slot) => (
                        <th
                          key={slot.id}
                          className="table-header-cell"
                        >
                          {slot.label || formatMinutesToLabel(slot.minutes)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dates.map((dateKey) => (
                      <tr key={dateKey}>
                        <td className="table-cell font-medium text-gray-800">
                          {dateKey}
                        </td>
                        {snapshotTimes.map((slot) => {
                          const snapshot = roomSnapshots.find(
                            (docData) =>
                              docData.dateLocal === dateKey &&
                              docData.snapshotTimeId === slot.id,
                          );
                          const isMissing =
                            !snapshot || snapshot.status === "missing";
                          const tempValueF = resolveSnapshotTempF(snapshot);
                          return (
                            <td key={slot.id} className="table-cell">
                              <span
                                className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${getTempToneClasses({
                                  valueF: tempValueF,
                                  missing: isMissing,
                                  range: historicalRoomRange,
                                  variant: "pill",
                                })}`}
                              >
                                {formatSnapshotTemp(snapshot)}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              Problem Rooms
            </h3>
            {missingCounts.length === 0 ? (
              <div className="text-xs text-gray-600">
                No missing data in this range.
              </div>
            ) : (
              <div className="space-y-2 text-xs text-gray-600">
                {missingCounts.slice(0, 8).map((item) => (
                  <div
                    key={item.spaceKey}
                    className="flex items-center justify-between"
                  >
                    <span>
                      {getSpaceLabel(
                        roomLookup[item.spaceKey] || { id: item.spaceKey },
                        spacesByKey,
                      )}
                    </span>
                    <span className="text-gray-500">{item.count} missing</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderImport = () => (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6" data-tutorial="import-section">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Bulk Import</h2>
          <p className="text-sm text-gray-600">
            Upload Govee CSV exports and map devices to rooms.
          </p>
        </div>
        {importItems.length > 0 && (
          <button
            className="btn-ghost flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleClearImports}
            disabled={importing}
          >
            <X className="w-4 h-4" /> Clear list
          </button>
        )}
      </div>

      <input
        id="temperature-import-csvs"
        type="file"
        accept=".csv,.zip"
        multiple
        className="hidden"
        onChange={handleCsvSelection}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div
          className={`border border-dashed rounded-lg p-5 transition-colors ${isDragging
            ? "border-baylor-green bg-baylor-green/10"
            : "border-baylor-green/40 bg-baylor-green/5"
            }`}
          onDragOver={handleDragOver}
          onDragEnter={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="flex items-start gap-4 pointer-events-none">
            <div className="w-12 h-12 rounded-full bg-white border border-baylor-green/20 flex items-center justify-center">
              <FileUp className="w-5 h-5 text-baylor-green" />
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900">
                Select Govee CSV exports or ZIP files
              </div>
              <div className="text-xs text-gray-500">
                Drag and drop files here, or click to browse. You can remove unwanted files after extraction.
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <label
              htmlFor="temperature-import-csvs"
              className="btn-secondary cursor-pointer inline-flex items-center"
            >
              <FileUp className="w-4 h-4 mr-2" /> Choose Files
            </label>
            {importItems.length > 0 && (
              <span className="text-xs text-gray-500">
                Additional selections are added to this list.
              </span>
            )}
          </div>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">
              Import Summary
            </h3>
            <span
              className={`text-xs font-medium ${importItems.length ? "text-baylor-green" : "text-gray-500"}`}
            >
              {importItems.length ? "Ready for review" : "Awaiting files"}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg bg-white border border-gray-200 p-3">
              <div className="text-xs text-gray-500">Files</div>
              <div className="text-lg font-semibold text-gray-900">
                {importSummary.fileCount}
              </div>
            </div>
            <div className="rounded-lg bg-white border border-gray-200 p-3">
              <div className="text-xs text-gray-500">Devices</div>
              <div className="text-lg font-semibold text-gray-900">
                {importSummary.deviceCount}
              </div>
            </div>
            <div className="rounded-lg bg-white border border-gray-200 p-3">
              <div className="text-xs text-gray-500">Rows Parsed</div>
              <div className="text-lg font-semibold text-gray-900">
                {importSummary.totalRows > 0
                  ? `${importSummary.parsedRows}/${importSummary.totalRows}`
                  : "0"}
              </div>
            </div>
            <div className="rounded-lg bg-white border border-gray-200 p-3">
              <div className="text-xs text-gray-500">Seen Before</div>
              <div className="text-lg font-semibold text-gray-600">
                {importSummary.duplicateCount}
              </div>
            </div>
            <div className="rounded-lg bg-white border border-gray-200 p-3">
              <div className="text-xs text-gray-500">Errors</div>
              <div className="text-lg font-semibold text-amber-700">
                {importSummary.errorCount}
              </div>
            </div>
            <div className="rounded-lg bg-white border border-gray-200 p-3">
              <div className="text-xs text-gray-500">Ready</div>
              <div className="text-lg font-semibold text-baylor-green">
                {importSummary.readyCount}
              </div>
            </div>
          </div>
        </div>
      </div>

      {activeImportJob && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">
                Import Progress
              </h3>
              <p className="text-xs text-gray-500">
                {activeImportJob.stage || "Preparing"}
              </p>
            </div>
            <span
              className={`text-xs font-semibold px-2 py-1 rounded-full ${activeImportJob.status === "failed"
                ? "bg-rose-100 text-rose-700"
                : activeImportJob.status === "completed"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-baylor-green/10 text-baylor-green"
                }`}
            >
              {activeImportJob.status || "running"}
            </span>
          </div>

          <div className="space-y-2">
            <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
              {importProgress.percent != null ? (
                <div
                  className="h-full bg-baylor-green transition-all"
                  style={{ width: `${Math.max(2, importProgress.percent)}%` }}
                />
              ) : (
                <div className="h-full w-1/3 bg-baylor-green/60 animate-pulse" />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600">
              <div>
                Files: {activeImportJob.processedFiles || 0}/
                {activeImportJob.totalFiles || 0}
              </div>
              <div>
                Rows: {activeImportJob.processedRows || 0}
                {activeImportJob.totalRows
                  ? `/${activeImportJob.totalRows}`
                  : " (estimating…)"}
              </div>
              {importElapsed && <div>Elapsed: {importElapsed}</div>}
            </div>
            {activeImportJob.currentFile && (
              <div className="text-xs text-gray-500">
                Current: {activeImportJob.currentFile}
              </div>
            )}
            {(activeImportJob.processedReadings != null ||
              activeImportJob.skippedExistingReadings != null ||
              activeImportJob.conflictCount != null) && (
                <div className="text-xs text-gray-600 flex flex-wrap gap-3">
                  {activeImportJob.processedReadings != null && (
                    <span>
                      New readings: {activeImportJob.processedReadings}
                    </span>
                  )}
                  {activeImportJob.skippedExistingReadings != null && (
                    <span>
                      Existing skipped: {activeImportJob.skippedExistingReadings}
                    </span>
                  )}
                  {activeImportJob.conflictCount != null && (
                    <span>Conflicts: {activeImportJob.conflictCount}</span>
                  )}
                </div>
              )}
            {activeImportJob.status === "failed" && (
              <details className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
                <summary className="cursor-pointer font-semibold">
                  {activeImportJob.errorSummary || "Import failed"}
                </summary>
                {Array.isArray(activeImportJob.errorDetails) &&
                  activeImportJob.errorDetails.length > 0 && (
                    <ul className="mt-2 space-y-1 text-rose-700">
                      {activeImportJob.errorDetails.map((detail, index) => (
                        <li key={`${detail}-${index}`}>{detail}</li>
                      ))}
                    </ul>
                  )}
              </details>
            )}
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Selected Files</h3>
          <span className="text-xs text-gray-500">
            {importSummary.fileCount} files
          </span>
        </div>
        {importItems.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
            No files selected yet. Use the upload area above to add CSV or ZIP
            files.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="university-table min-w-full">
              <thead>
                <tr>
                  <th className="table-header-cell">
                    File
                  </th>
                  <th className="table-header-cell">
                    Device
                  </th>
                  <th className="table-header-cell">
                    Rows
                  </th>
                  <th className="table-header-cell">
                    Date Range
                  </th>
                  <th className="table-header-cell">
                    Status
                  </th>
                  <th className="table-header-cell">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {importItems.map((item) => {
                  const rowTotal = item.rowCount ?? 0;
                  const parsedRows = item.parsedCount ?? 0;
                  const rowsLabel =
                    rowTotal > 0
                      ? `${parsedRows}/${rowTotal}`
                      : parsedRows > 0
                        ? `${parsedRows}`
                        : "-";
                  return (
                    <tr key={item.id}>
                      <td className="table-cell font-medium text-gray-800">
                        {item.fileName}
                      </td>
                      <td className="table-cell text-gray-700">
                        {item.deviceLabel || "-"}
                      </td>
                      <td className="table-cell text-gray-700">{rowsLabel}</td>
                      <td className="table-cell text-gray-700">
                        {item.minTimestamp && item.maxTimestamp
                          ? `${item.minTimestamp} -> ${item.maxTimestamp}`
                          : "-"}
                      </td>
                      <td className="table-cell text-gray-700">
                        {item.errorCount > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
                            <AlertTriangle className="w-3 h-3" />{" "}
                            {item.errorCount} errors
                          </span>
                        ) : item.duplicate ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-700">
                            <CheckCircle2 className="w-3 h-3" />
                            Seen before ({item.duplicateCount || 1})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-baylor-green/20 bg-baylor-green/10 px-2 py-1 text-xs text-baylor-green">
                            <CheckCircle2 className="w-3 h-3" /> Ready
                          </span>
                        )}
                      </td>
                      <td className="table-cell text-gray-700">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => handleRemoveImportItem(item.id)}
                          disabled={importing}
                          aria-label={`Remove ${item.fileName}`}
                        >
                          <Trash2 className="w-3 h-3" />
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {importItems.length > 0 && pendingMappings.length > 0 && (
          <div className="bg-baylor-gold/10 border border-baylor-gold/30 rounded-lg p-4 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">
                Device → Room Mapping
              </h3>
              <p className="text-xs text-gray-500">
                Review and correct room assignments before importing. Multiple
                files from the same device will share a mapping. Changes are
                saved for future imports.
              </p>
            </div>
            <div className="space-y-2">
              {pendingMappings.map((item) => (
                <div
                  key={item.deviceId}
                  className="flex flex-col md:flex-row md:items-center md:justify-between gap-2"
                >
                  <div>
                    <div className="text-sm font-medium text-gray-800">
                      {item.deviceLabel}
                    </div>
                    <div className="text-xs text-gray-500">
                      Suggested:{" "}
                      {item.suggestedSpaceKey
                        ? getSpaceLabel(
                          roomLookup[item.suggestedSpaceKey] || {
                            id: item.suggestedSpaceKey,
                          },
                          spacesByKey,
                        )
                        : "None"}{" "}
                      | Confidence {Math.round((item.matchConfidence || 0) * 100)}
                      %
                    </div>
                  </div>
                  <select
                    className="form-input md:max-w-xs"
                    value={
                      mappingOverrides[item.deviceId] ||
                      item.suggestedSpaceKey ||
                      ""
                    }
                    onChange={(e) =>
                      setMappingOverrides((prev) => ({
                        ...prev,
                        [item.deviceId]: e.target.value,
                      }))
                    }
                  >
                    <option value="">Select room...</option>
                    {roomsForBuilding.map((room) => {
                      const spaceKey = room.spaceKey || room.id;
                      if (!spaceKey) return null;
                      return (
                        <option key={spaceKey} value={spaceKey}>
                          {getSpaceLabel(room, spacesByKey)}
                        </option>
                      );
                    })}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {importItems.length > 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="text-sm text-gray-600">
              Existing readings are skipped automatically; only new readings are
              added. Resolve any mapping prompts before importing.
            </div>
            <button
              className="btn-primary"
              onClick={handleImport}
              disabled={importing || hasUnresolvedMappings}
            >
              {importing ? "Import in progress" : "Import Now"}
            </button>
          </div>
        )}
      </div>

      <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-rose-900">
            Delete Room Import Data
          </h3>
          <p className="text-xs text-rose-700">
            This removes all import logs and stored temperature data for the
            selected room in this building.
          </p>
        </div>
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <select
            className="form-input md:max-w-sm"
            value={deleteRoomSpaceKey}
            onChange={(e) => setDeleteRoomSpaceKey(e.target.value)}
            disabled={deletingRoomData || importing}
          >
            <option value="">Select room...</option>
            {roomsForBuilding.map((room) => {
              const spaceKey = room.spaceKey || room.id;
              if (!spaceKey) return null;
              return (
                <option key={spaceKey} value={spaceKey}>
                  {getSpaceLabel(room, spacesByKey)}
                </option>
              );
            })}
          </select>
          <button
            className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => setShowDeleteRoomDataConfirm(true)}
            disabled={!deleteRoomSpaceKey || deletingRoomData || importing}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            {deletingRoomData ? "Deleting..." : "Delete Room Data"}
          </button>
        </div>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-900">
            Room Import Statistics
          </h3>
          <span className="text-xs text-gray-500">
            {roomImportStats.length} rooms with imported data
          </span>
        </div>
        {roomImportStats.length === 0 ? (
          <div className="text-sm text-gray-600">
            No imported room data for this building yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="university-table min-w-full">
              <thead>
                <tr>
                  <th className="table-header-cell">
                    Room
                  </th>
                  <th className="table-header-cell">
                    New Readings
                  </th>
                  <th className="table-header-cell">
                    Existing Skipped
                  </th>
                  <th className="table-header-cell">
                    Source Rows
                  </th>
                  <th className="table-header-cell">
                    Imports
                  </th>
                  <th className="table-header-cell">
                    Devices
                  </th>
                  <th className="table-header-cell">
                    Date Coverage
                  </th>
                  <th className="table-header-cell">
                    Last Import
                  </th>
                </tr>
              </thead>
              <tbody>
                {roomImportStats.map((stats) => {
                  const dateCoverage = stats.dateStart
                    ? stats.dateStart === stats.dateEnd
                      ? stats.dateStart
                      : `${stats.dateStart} to ${stats.dateEnd}`
                    : "-";
                  const lastImport = stats.lastImportedAt
                    ? stats.lastImportedAt.toLocaleString()
                    : "-";
                  return (
                    <tr key={stats.spaceKey}>
                      <td className="table-cell font-medium text-gray-800">
                        {stats.roomLabel}
                      </td>
                      <td className="table-cell text-gray-700">
                        {stats.totalNewReadings}
                      </td>
                      <td className="table-cell text-gray-700">
                        {stats.totalSkippedExisting}
                      </td>
                      <td className="table-cell text-gray-700">
                        {stats.totalParsedRows}/{stats.totalRows}
                      </td>
                      <td className="table-cell text-gray-700">
                        {stats.importCount}
                      </td>
                      <td className="table-cell text-gray-700">
                        {stats.deviceCount}
                      </td>
                      <td className="table-cell text-gray-700">{dateCoverage}</td>
                      <td className="table-cell text-gray-700">{lastImport}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {importHistory.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-900">
              Recent Import Files
            </h3>
            <span className="text-xs text-gray-500">
              {importHistory.length} logged files
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="university-table min-w-full">
              <thead>
                <tr>
                  <th className="table-header-cell">
                    Imported
                  </th>
                  <th className="table-header-cell">
                    File
                  </th>
                  <th className="table-header-cell">
                    Room
                  </th>
                  <th className="table-header-cell">
                    New Readings
                  </th>
                  <th className="table-header-cell">
                    Existing Skipped
                  </th>
                  <th className="table-header-cell">
                    Date Range
                  </th>
                </tr>
              </thead>
              <tbody>
                {importHistory.map((item) => {
                  const importDate = item.createdAt?.seconds
                    ? new Date(item.createdAt.seconds * 1000).toLocaleString()
                    : "Unknown";
                  const mappedSpaceKey = resolveImportSpaceKey(item);
                  const spaceLabel = resolveImportSpaceLabel(item, mappedSpaceKey);
                  const dateRange = parseImportDateRange(item);
                  const dateRangeLabel = dateRange
                    ? dateRange.start === dateRange.end
                      ? dateRange.start
                      : `${dateRange.start} to ${dateRange.end}`
                    : "-";
                  return (
                    <tr key={item.id}>
                      <td className="table-cell text-gray-700">{importDate}</td>
                      <td
                        className="table-cell text-gray-700 truncate max-w-[220px]"
                        title={item.fileName}
                      >
                        {item.fileName || "-"}
                      </td>
                      <td className="table-cell text-gray-700">{spaceLabel}</td>
                      <td className="table-cell text-gray-700">
                        {item.newReadings ?? 0}
                      </td>
                      <td className="table-cell text-gray-700">
                        {item.skippedExistingCount ?? 0}
                      </td>
                      <td className="table-cell text-gray-700">
                        {dateRangeLabel}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  const renderExport = () => (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Export Data</h2>
        <p className="text-sm text-gray-600">
          Download snapshot or raw readings using current filters.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <label className="form-label">Date range</label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              className="form-input"
              value={exportStart}
              onChange={(e) => setExportStart(e.target.value)}
            />
            <span className="text-gray-500">to</span>
            <input
              type="date"
              className="form-input"
              value={exportEnd}
              onChange={(e) => setExportEnd(e.target.value)}
            />
          </div>
          <label className="form-label">Rooms (optional)</label>
          <select
            className="form-input"
            multiple
            value={exportSpaceKeys}
            onChange={(e) =>
              setExportSpaceKeys(
                Array.from(e.target.selectedOptions).map((opt) => opt.value),
              )
            }
          >
            {roomsForBuilding.map((room) => {
              const spaceKey = room.spaceKey || room.id;
              if (!spaceKey) return null;
              return (
                <option key={spaceKey} value={spaceKey}>
                  {getSpaceLabel(room, spacesByKey)}
                </option>
              );
            })}
          </select>
          <label className="form-label">Snapshot times (optional)</label>
          <select
            className="form-input"
            multiple
            value={exportSnapshotIds}
            onChange={(e) =>
              setExportSnapshotIds(
                Array.from(e.target.selectedOptions).map((opt) => opt.value),
              )
            }
          >
            {snapshotTimes.map((slot) => (
              <option key={slot.id} value={slot.id}>
                {slot.label || formatMinutesToLabel(slot.minutes)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-3">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-2 text-sm text-gray-600">
              <Download className="w-4 h-4 mt-0.5 text-gray-400" />
              <div>
                <div className="font-medium text-gray-800">Snapshot Export</div>
                <div>
                  Includes temperature, humidity, snapshot time, and delta to
                  target.
                </div>
              </div>
            </div>
            <button
              className="btn-primary w-full"
              onClick={handleSnapshotExport}
              disabled={exporting}
            >
              {exporting ? "Exporting..." : "Export Snapshots CSV"}
            </button>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-2 text-sm text-gray-600">
              <Download className="w-4 h-4 mt-0.5 text-gray-400" />
              <div>
                <div className="font-medium text-gray-800">
                  Raw Readings Export
                </div>
                <div>Full daily readings with local timestamps.</div>
              </div>
            </div>
            <button
              className="btn-secondary w-full"
              onClick={handleRawExport}
              disabled={exporting}
            >
              {exporting ? "Exporting..." : "Export Raw Readings CSV"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6" data-tutorial="settings-section">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">
          Temperature Settings
        </h2>
        <p className="text-sm text-gray-600">
          Manage timezone and snapshot intervals for this building.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className="form-label">Building Timezone</label>
            <input
              type="text"
              className="form-input"
              value={buildingSettings?.timezone || DEFAULT_TIMEZONE}
              onChange={(e) =>
                setBuildingSettings((prev) => ({
                  ...prev,
                  timezone: e.target.value,
                }))
              }
            />
            <p className="text-xs text-gray-500 mt-1">
              Default: {DEFAULT_TIMEZONE}
            </p>
          </div>

          <div>
            <label className="form-label">Ideal Temperature Range (°F)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                className="form-input w-28"
                value={buildingSettings?.idealTempFMin ?? ""}
                onChange={(e) =>
                  setBuildingSettings((prev) => ({
                    ...prev,
                    idealTempFMin: e.target.value === "" ? null : Number(e.target.value),
                  }))
                }
                placeholder="Min"
              />
              <span className="text-gray-500 text-sm">to</span>
              <input
                type="number"
                className="form-input w-28"
                value={buildingSettings?.idealTempFMax ?? ""}
                onChange={(e) =>
                  setBuildingSettings((prev) => ({
                    ...prev,
                    idealTempFMax: e.target.value === "" ? null : Number(e.target.value),
                  }))
                }
                placeholder="Max"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Default range used unless a space type override is defined.
            </p>
          </div>

          <div>
            <label className="form-label">Space Type Ranges (°F)</label>
            <p className="text-xs text-gray-500 mt-1">
              Optional overrides by space type; leave blank to use the building
              default.
            </p>
            <div className="space-y-2 mt-3">
              {spaceTypeOptions.map((type) => {
                const range =
                  buildingSettings?.idealTempRangesBySpaceType?.[type] || {};
                const hasOverride =
                  range.minF != null || range.maxF != null;
                return (
                  <div key={type} className="flex items-center gap-2">
                    <div className="w-24 text-xs font-semibold text-gray-600">
                      {type}
                    </div>
                    <input
                      type="number"
                      className="form-input w-24"
                      value={range.minF ?? ""}
                      onChange={(e) =>
                        updateTypeRange(type, {
                          minF:
                            e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                      placeholder="Min"
                    />
                    <span className="text-gray-500 text-xs">to</span>
                    <input
                      type="number"
                      className="form-input w-24"
                      value={range.maxF ?? ""}
                      onChange={(e) =>
                        updateTypeRange(type, {
                          maxF:
                            e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                      placeholder="Max"
                    />
                    {hasOverride ? (
                      <button
                        type="button"
                        className="text-xs text-gray-500 hover:text-gray-700"
                        onClick={() =>
                          updateTypeRange(type, { minF: null, maxF: null })
                        }
                      >
                        Clear
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">Default</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className="form-label">Snapshot Times</label>
            <div className="space-y-2">
              {snapshotTimes.map((slot) => (
                <div key={slot.id} className="flex items-center gap-2">
                  <input
                    type="text"
                    className="form-input"
                    value={slot.label || formatMinutesToTime(slot.minutes)}
                    onChange={(e) => {
                      const nextLabel = e.target.value;
                      const parsedMinutes = parseTime(nextLabel);
                      if (parsedMinutes == null) {
                        handleUpdateSnapshotTime(slot.id, { label: nextLabel });
                      } else {
                        handleUpdateSnapshotTime(slot.id, {
                          minutes: parsedMinutes,
                          label: formatMinutesToTime(parsedMinutes),
                        });
                      }
                    }}
                  />
                  <input
                    type="number"
                    min="0"
                    className="form-input w-24"
                    value={slot.toleranceMinutes ?? 15}
                    onChange={(e) =>
                      handleUpdateSnapshotTime(slot.id, {
                        toleranceMinutes: Number(e.target.value),
                      })
                    }
                  />
                  <button
                    className="btn-ghost"
                    onClick={() => handleRemoveSnapshotTime(slot.id)}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="text"
                className="form-input"
                placeholder="Add time (e.g., 12:00 PM)"
                value={newSnapshotTime}
                onChange={(e) => setNewSnapshotTime(e.target.value)}
              />
              <input
                type="number"
                min="0"
                className="form-input w-24"
                value={newSnapshotTolerance}
                onChange={(e) =>
                  setNewSnapshotTolerance(Number(e.target.value))
                }
              />
              <button className="btn-secondary" onClick={handleAddSnapshotTime}>
                Add
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={buildingIsHidden}
                onChange={(e) => setBuildingIsHidden(e.target.checked)}
                className="w-4 h-4 text-baylor-green border-gray-300 rounded focus:ring-baylor-green"
              />
              <span className="text-sm text-gray-700">
                Hide this building from the selector
              </span>
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <button className="btn-primary" onClick={saveBuildingSettings}>
                Save Settings
              </button>
              <button
                className="btn-ghost"
                onClick={() =>
                  setBuildingSettings(
                    buildDefaultSettings({
                      buildingCode: selectedBuilding,
                      buildingName: selectedBuildingName,
                    }),
                  )
                }
              >
                Reset Defaults
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  localStorage.setItem(
                    "temperatureDefaultBuilding",
                    selectedBuilding,
                  );
                  showNotification(
                    "success",
                    "Default Set",
                    `${selectedBuildingName || selectedBuilding} is now your default building.`,
                  );
                }}
              >
                Set as Default
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">
              Recompute Snapshots
            </h3>
            <p className="text-xs text-gray-600">
              If timezone or mappings change, recompute snapshots for the
              selected range.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                className="form-input"
                value={recomputeStart}
                onChange={(e) => setRecomputeStart(e.target.value)}
              />
              <span className="text-gray-500">to</span>
              <input
                type="date"
                className="form-input"
                value={recomputeEnd}
                onChange={(e) => setRecomputeEnd(e.target.value)}
              />
            </div>
            <button
              className="btn-secondary w-full"
              onClick={handleRecomputeSnapshots}
              disabled={recomputing}
            >
              {recomputing ? "Recomputing..." : "Recompute Snapshots"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // Calculate quick stats
  const roomCount = roomsForBuilding.length;
  const roomsWithData = Object.keys(snapshotLookup).length;
  const coveragePercent =
    roomCount > 0 ? Math.round((roomsWithData / roomCount) * 100) : 0;
  const showSnapshotControls = viewMode !== "trends";
  const isSnapshotView =
    viewMode === "floorplan" ||
    viewMode === "daily" ||
    viewMode === "historical";

  return (
    <div className="space-y-6 p-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Temperature Monitoring
        </h1>
        <p className="text-gray-600">
          Track room temperatures, import sensor data, and visualize daily
          snapshots.
        </p>
      </div>

      {/* Filter Bar - Sticky */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm sticky top-0 z-10">
        <Toolbar
          selectedBuilding={selectedBuilding}
          buildingOptions={buildingOptions}
          hiddenBuildingCodes={hiddenBuildingCodes}
          showHidden={showHidden}
          onToggleShowHidden={() => setShowHidden(!showHidden)}
          onBuildingChange={setSelectedBuilding}
          showSnapshotControls={showSnapshotControls}
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          selectedSnapshotId={selectedSnapshotId}
          onSnapshotChange={setSelectedSnapshotId}
          snapshotTimes={snapshotTimes}
        />
        <ViewTabs
          dataViewTabs={DATA_VIEW_TABS}
          actionTabs={ACTION_TABS}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      </div>

      <QuickStats
        selectedBuilding={selectedBuilding}
        snapshotLoading={snapshotLoading}
        viewMode={viewMode}
        roomCount={roomCount}
        roomsWithData={roomsWithData}
        coveragePercent={coveragePercent}
        timezoneLabel={timezoneLabel}
      />

      <SnapshotPanel
        viewMode={viewMode}
        snapshotLoading={snapshotLoading}
        isSnapshotView={isSnapshotView}
        renderFloorplan={renderFloorplan}
        renderDailyTable={renderDailyTable}
        renderHistorical={renderHistorical}
        selectedBuilding={selectedBuilding}
        buildingSettings={buildingSettings}
        roomsForBuilding={roomsForBuilding}
        spacesByKey={spacesByKey}
        deviceDocs={deviceDocs}
      />

      <ImportPanel viewMode={viewMode} renderImport={renderImport} />
      {viewMode === "export" && renderExport()}
      <SettingsPanel viewMode={viewMode} renderSettings={renderSettings} />

      <ConfirmDialog
        isOpen={showDeleteFloorplanConfirm}
        title="Delete Floorplan"
        message="Are you sure you want to delete the floorplan? This action cannot be undone."
        onConfirm={confirmDeleteFloorplan}
        onCancel={() => setShowDeleteFloorplanConfirm(false)}
        confirmText="Delete"
        variant="danger"
      />

      <ConfirmDialog
        isOpen={showDeleteRoomDataConfirm}
        title="Delete Room Data"
        message={`Delete all import logs, readings, aggregates, and snapshots for ${deleteRoomLabel || "this room"} in ${selectedBuildingName || selectedBuilding}?`}
        onConfirm={handleDeleteRoomData}
        onCancel={() => setShowDeleteRoomDataConfirm(false)}
        confirmText="Delete Room Data"
        variant="danger"
      />
    </div>
  );
};

export default TemperatureMonitoring;
