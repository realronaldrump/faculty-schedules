import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  CheckSquare,
  Grid2X2,
  LineChart,
  RefreshCcw,
  Search,
  Square,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { AutoSizer } from "react-virtualized-auto-sizer";
import { FixedSizeList as List } from "react-window";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useData } from "../../contexts/DataContext.jsx";
import { useUI } from "../../contexts/UIContext.jsx";
import { resolveBuildingDisplayName } from "../../utils/locationService";
import {
  normalizeMatchText,
  toBuildingKey,
  zonedTimeToUtc,
} from "../../utils/temperatureUtils";
import { resolveTemperatureGranularity } from "../../utils/temperatureAggregation";
import { fetchTemperatureSeries } from "../../utils/temperatureDataService";
import {
  getTemperatureStatus,
  normalizeIdealRange,
} from "../../utils/temperatureRangeUtils";
import { subscribeTemperatureDataRefresh } from "../../utils/temperatureEvents";

const DEFAULT_TIMEZONE = "America/Chicago";
const MAX_POINTS = 1400;
const COLOR_PALETTE = [
  "#1E7A5E",
  "#1F6FEB",
  "#D97706",
  "#0F766E",
  "#A855F7",
  "#DC2626",
  "#0891B2",
  "#4F46E5",
  "#0EA5E9",
];

const formatDateTimeInput = (date, timeZone) => {
  if (!date) return "";
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`;
};

const parseDateTimeInput = (value, timeZone) => {
  if (!value) return null;
  const [datePart, timePart] = value.split("T");
  if (!datePart || !timePart) return null;
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  return zonedTimeToUtc(
    { year, month, day, hour, minute, second: 0, raw: value },
    timeZone,
  );
};

const formatTick = (date, timeZone, withDate) => {
  if (!date) return "";
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: withDate ? "short" : undefined,
    day: withDate ? "numeric" : undefined,
    hour: "numeric",
    minute: "2-digit",
  });
  return formatter.format(date);
};

const downsamplePoints = (points, maxPoints) => {
  if (points.length <= maxPoints) return points;
  const bucketSize = Math.ceil(points.length / maxPoints);
  const result = [];
  for (let i = 0; i < points.length; i += bucketSize) {
    const slice = points.slice(i, i + bucketSize);
    if (slice.length === 0) continue;
    const avg =
      slice.reduce((sum, p) => sum + p.value, 0) / slice.length;
    const mid = slice[Math.floor(slice.length / 2)];
    result.push({
      ...mid,
      value: avg,
    });
  }
  return result;
};

const getSeriesColor = (index) => COLOR_PALETTE[index % COLOR_PALETTE.length];

const buildPath = (points, xScale, yScale) => {
  if (!points || points.length === 0) return "";
  return points
    .map((point, index) => {
      const x = xScale(point.timestamp.getTime());
      const y = yScale(point.value);
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
};

const isValidTimestamp = (value) =>
  value instanceof Date && Number.isFinite(value.getTime());

const sanitizeSeriesPoints = (series = []) =>
  series.map((item) => ({
    ...item,
    points: (item.points || []).filter(
      (point) =>
        Number.isFinite(point.value) && isValidTimestamp(point.timestamp),
    ),
  }));

const TemperatureLineChart = ({
  series,
  height = 320,
  timeZone,
  unitLabel,
  idealRange,
  onBrush,
  onPointSelect,
  compact = false,
}) => {
  const containerRef = useRef(null);
  const [hover, setHover] = useState(null);
  const [brush, setBrush] = useState(null);

  const plotPadding = compact
    ? { top: 12, right: 12, bottom: 24, left: 36 }
    : { top: 16, right: 20, bottom: 36, left: 46 };

  return (
    <div className="relative" ref={containerRef} style={{ height }}>
      <AutoSizer disableHeight>
        {({ width }) => {
          const resolvedWidth =
            Number.isFinite(width) && width > 0
              ? width
              : containerRef.current?.clientWidth || 0;
          if (!resolvedWidth) {
            return (
              <div className="h-full flex items-center justify-center text-sm text-gray-500">
                Sizing chart...
              </div>
            );
          }
          const plotWidth =
            resolvedWidth - plotPadding.left - plotPadding.right;
          const plotHeight = height - plotPadding.top - plotPadding.bottom;
          const allPoints = series.flatMap((item) => item.points || []);
          if (allPoints.length === 0) {
            return (
              <div className="h-full flex items-center justify-center text-sm text-gray-500">
                No data for this range.
              </div>
            );
          }
          const minX = Math.min(...allPoints.map((p) => p.timestamp.getTime()));
          const maxX = Math.max(...allPoints.map((p) => p.timestamp.getTime()));
          const minYRaw = Math.min(...allPoints.map((p) => p.value));
          const maxYRaw = Math.max(...allPoints.map((p) => p.value));
          const minY = Math.min(
            minYRaw,
            idealRange?.minF ?? minYRaw,
          );
          const maxY = Math.max(
            maxYRaw,
            idealRange?.maxF ?? maxYRaw,
          );
          const yPadding = (maxY - minY) * 0.08 || 1;
          const yMin = minY - yPadding;
          const yMax = maxY + yPadding;

          const xScale = (value) =>
            plotPadding.left +
            ((value - minX) / (maxX - minX || 1)) * plotWidth;
          const yScale = (value) =>
            plotPadding.top +
            (1 - (value - yMin) / (yMax - yMin || 1)) * plotHeight;
          const invertX = (x) => {
            const pct = (x - plotPadding.left) / (plotWidth || 1);
            return minX + pct * (maxX - minX);
          };

          const yTicks = 4;
          const xTicks = compact ? 3 : 5;
          const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) =>
            yMin + (i / yTicks) * (yMax - yMin),
          );
          const xTickValues = Array.from({ length: xTicks }, (_, i) =>
            minX + (i / (xTicks - 1)) * (maxX - minX),
          );

          const handlePointerMove = (event) => {
            const bounds = containerRef.current?.getBoundingClientRect();
            if (!bounds) return;
            const x = event.clientX - bounds.left;
            if (brush) {
              setBrush((prev) => (prev ? { ...prev, currentX: x } : prev));
            }
            if (x < plotPadding.left || x > resolvedWidth - plotPadding.right) {
              setHover(null);
              return;
            }
            const targetMs = invertX(x);
            const values = series
              .filter((item) => item.points.length > 0)
              .map((item) => {
                const points = item.points;
                let low = 0;
                let high = points.length - 1;
                while (low < high) {
                  const mid = Math.floor((low + high) / 2);
                  if (points[mid].timestamp.getTime() < targetMs) low = mid + 1;
                  else high = mid;
                }
                const closest = points[low] || points[points.length - 1];
                return {
                  roomId: item.roomId,
                  roomName: item.roomName,
                  value: closest.value,
                  timestamp: closest.timestamp,
                  color: item.color,
                };
              });
            if (values.length === 0) {
              setHover(null);
              return;
            }
            const timestamp = values[0].timestamp;
            setHover({
              x,
              timestamp,
              values,
            });
          };

          const handlePointerDown = (event) => {
            if (!onBrush) return;
            const bounds = containerRef.current?.getBoundingClientRect();
            if (!bounds) return;
            const x = event.clientX - bounds.left;
            setBrush({ startX: x, currentX: x });
          };

          const handlePointerUp = () => {
            if (!brush) return;
            const delta = Math.abs(brush.currentX - brush.startX);
            const start = Math.min(brush.startX, brush.currentX);
            const end = Math.max(brush.startX, brush.currentX);
            setBrush(null);
            if (delta > 12 && onBrush) {
              const startMs = invertX(start);
              const endMs = invertX(end);
              onBrush({ start: new Date(startMs), end: new Date(endMs) });
              return;
            }
            if (hover && onPointSelect) {
              onPointSelect(hover);
            }
          };

          return (
            <svg
              width={resolvedWidth}
              height={height}
              className="overflow-visible"
              onPointerMove={handlePointerMove}
              onPointerLeave={() => setHover(null)}
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
            >
              <rect
                x={plotPadding.left}
                y={plotPadding.top}
                width={plotWidth}
                height={plotHeight}
                fill="#ffffff"
                rx="8"
              />

              {idealRange && Number.isFinite(idealRange.minF) && Number.isFinite(idealRange.maxF) && (
                <rect
                  x={plotPadding.left}
                  y={yScale(idealRange.maxF)}
                  width={plotWidth}
                  height={Math.max(2, yScale(idealRange.minF) - yScale(idealRange.maxF))}
                  fill="rgba(16, 185, 129, 0.08)"
                />
              )}

              {yTickValues.map((tick) => (
                <g key={`y-${tick}`}>
                  <line
                    x1={plotPadding.left}
                    x2={resolvedWidth - plotPadding.right}
                    y1={yScale(tick)}
                    y2={yScale(tick)}
                    stroke="#E5E7EB"
                    strokeDasharray="3 4"
                  />
                  <text
                    x={plotPadding.left - 8}
                    y={yScale(tick)}
                    textAnchor="end"
                    dominantBaseline="middle"
                    className="fill-gray-500 text-[10px]"
                  >
                    {tick.toFixed(0)}{unitLabel}
                  </text>
                </g>
              ))}

              {xTickValues.map((tick) => {
                const tickDate = new Date(tick);
                return (
                  <g key={`x-${tick}`}>
                    <line
                      y1={plotPadding.top}
                      y2={plotPadding.top + plotHeight}
                      x1={xScale(tick)}
                      x2={xScale(tick)}
                      stroke="#F3F4F6"
                    />
                    <text
                      x={xScale(tick)}
                      y={height - plotPadding.bottom + 18}
                      textAnchor="middle"
                      className="fill-gray-500 text-[10px]"
                    >
                      {formatTick(
                        tickDate,
                        timeZone,
                        !compact && maxX - minX > 24 * 60 * 60 * 1000,
                      )}
                    </text>
                  </g>
                );
              })}

              {series.map((item) => (
                <path
                  key={item.roomId}
                  d={buildPath(item.points, xScale, yScale)}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={compact ? 1.5 : 2}
                />
              ))}

              {hover && (
                <>
                  <line
                    x1={hover.x}
                    x2={hover.x}
                    y1={plotPadding.top}
                    y2={plotPadding.top + plotHeight}
                    stroke="#9CA3AF"
                    strokeDasharray="4 4"
                  />
                  {hover.values.map((value) => (
                    <circle
                      key={`${value.roomId}-${value.timestamp.toISOString()}`}
                      cx={xScale(value.timestamp.getTime())}
                      cy={yScale(value.value)}
                      r={3}
                      fill={value.color}
                    />
                  ))}
                </>
              )}

              {brush && (
                <rect
                  x={Math.min(brush.startX, brush.currentX)}
                  y={plotPadding.top}
                  width={Math.abs(brush.currentX - brush.startX)}
                  height={plotHeight}
                  fill="rgba(59, 130, 246, 0.15)"
                  stroke="rgba(59, 130, 246, 0.5)"
                />
              )}
            </svg>
          );
        }}
      </AutoSizer>

      {hover && (
        <div
          className="absolute top-3 left-3 bg-white border border-gray-200 rounded-lg shadow-md p-3 text-xs text-gray-700 space-y-2"
          style={{ maxWidth: 220 }}
        >
          <div className="font-semibold text-gray-900">
            {formatTick(hover.timestamp, timeZone, true)}
          </div>
          <div className="space-y-1">
            {hover.values.map((value) => (
              <div
                key={`${value.roomId}-tooltip`}
                className="flex items-center justify-between gap-3"
              >
                <span className="text-gray-600">{value.roomName}</span>
                <span
                  className={`px-2 py-1 rounded-full text-xs font-semibold ${(() => {
                    const status = getTemperatureStatus(value.value, idealRange);
                    if (status === "below") return "bg-sky-100 text-sky-800";
                    if (status === "above") return "bg-rose-100 text-rose-800";
                    return "bg-gray-900 text-white";
                  })()}`}
                >
                  {value.value.toFixed(1)}
                  {unitLabel}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const TemperatureDashboard = () => {
  const { loading: authLoading, user } = useAuth();
  const { spacesList = [], spacesByKey } = useData();
  const { showNotification } = useUI();
  const readingsContainerRef = useRef(null);

  const [selectedBuilding, setSelectedBuilding] = useState("");
  const [buildingSettings, setBuildingSettings] = useState(null);
  const [hiddenBuildingCodes, setHiddenBuildingCodes] = useState(new Set());
  const [hiddenLoaded, setHiddenLoaded] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [deviceDocs, setDeviceDocs] = useState({});

  const [rangeStart, setRangeStart] = useState(null);
  const [rangeEnd, setRangeEnd] = useState(null);
  const [fullRange, setFullRange] = useState(null);
  const [rangePreset, setRangePreset] = useState("24h");

  const [roomSearch, setRoomSearch] = useState("");
  const [selectedRoomIds, setSelectedRoomIds] = useState([]);
  const [visibleRoomIds, setVisibleRoomIds] = useState(new Set());
  const [compareMode, setCompareMode] = useState("overlay");

  const [seriesData, setSeriesData] = useState([]);
  const [granularity, setGranularity] = useState("auto");
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const timezone = buildingSettings?.timezone || DEFAULT_TIMEZONE;
  const idealRange = normalizeIdealRange(
    buildingSettings?.idealTempFMin,
    buildingSettings?.idealTempFMax,
  );

  const roomsByBuilding = useMemo(() => {
    const grouped = {};
    (spacesList || []).forEach((room) => {
      if (room?.isActive === false) return;
      const buildingCode = (room.buildingCode || room.building || "")
        .toString()
        .trim()
        .toUpperCase();
      if (!buildingCode) return;
      if (
        buildingCode.toLowerCase() === "online" ||
        buildingCode.toLowerCase() === "off campus"
      )
        return;
      if (!grouped[buildingCode]) grouped[buildingCode] = [];
      grouped[buildingCode].push(room);
    });
    Object.keys(grouped).forEach((key) => {
      // Deduplicate rooms by ID/spaceKey
      const seen = new Set();
      grouped[key] = grouped[key].filter((room) => {
        const id = room.spaceKey || room.id;
        if (!id) return false;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });

      grouped[key].sort((a, b) =>
        (a.displayName || a.name || "").localeCompare(
          b.displayName || b.name || "",
          undefined,
          { numeric: true },
        ),
      );
    });
    return grouped;
  }, [spacesList]);

  const buildingOptions = useMemo(() => {
    return Object.keys(roomsByBuilding)
      .map((code) => ({
        code,
        name: resolveBuildingDisplayName(code) || code,
        hidden: hiddenBuildingCodes.has(code),
      }))
      .filter((item) => showHidden || !item.hidden)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [roomsByBuilding, hiddenBuildingCodes, showHidden]);

  const roomsForBuilding = useMemo(
    () => roomsByBuilding[selectedBuilding] || [],
    [roomsByBuilding, selectedBuilding],
  );

  const roomLabel = (room) => {
    if (!room) return "Unknown";
    const key = room.spaceKey || room.id || "";
    const resolved =
      key && spacesByKey instanceof Map
        ? spacesByKey.get(key)
        : null;
    return (
      resolved?.displayName ||
      room.displayName ||
      room.name ||
      room.roomNumber ||
      room.id ||
      "Unknown"
    );
  };

  const roomNameMap = useMemo(() => {
    const map = new Map();
    roomsForBuilding.forEach((room) => {
      const roomId = room.spaceKey || room.id;
      if (!roomId) return;
      map.set(roomId, roomLabel(room));
    });
    return map;
  }, [roomsForBuilding]);

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

  useEffect(() => {
    if (!hiddenLoaded) return;
    if (!selectedBuilding && buildingOptions.length > 0) {
      const defaultBuilding = localStorage.getItem(
        "temperatureDefaultBuilding",
      );
      if (
        defaultBuilding &&
        buildingOptions.some((item) => item.code === defaultBuilding)
      ) {
        setSelectedBuilding(defaultBuilding);
      } else {
        setSelectedBuilding(buildingOptions[0].code);
      }
    }
  }, [buildingOptions, selectedBuilding, hiddenLoaded]);

  useEffect(() => {
    if (!selectedBuilding) return;
    setSelectedRoomIds([]);
    setVisibleRoomIds(new Set());
    setSeriesData([]);
    setSelectedPoint(null);
  }, [selectedBuilding]);

  useEffect(() => {
    if (authLoading || !user || !selectedBuilding) return;
    let active = true;
    const loadSettings = async () => {
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
          setBuildingSettings({
            ...data,
            buildingCode: selectedBuilding,
            buildingName,
          });
        } else {
          setBuildingSettings({
            buildingCode: selectedBuilding,
            buildingName,
            timezone: DEFAULT_TIMEZONE,
            idealTempFMin: null,
            idealTempFMax: null,
          });
        }
      } catch (error) {
        console.error("Error loading temperature settings:", error);
        showNotification(
          "error",
          "Settings Load Failed",
          "Unable to load temperature settings for this building.",
        );
      } finally {
        // no-op
      }
    };
    loadSettings();
    return () => {
      active = false;
    };
  }, [selectedBuilding, authLoading, user, showNotification]);

  useEffect(() => {
    if (authLoading || !user || !selectedBuilding) return;
    let active = true;
    const loadDevices = async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, "temperatureDevices"),
            where("buildingCode", "==", selectedBuilding),
          ),
        );
        if (!active) return;
        const map = {};
        snap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          map[docSnap.id] = { id: docSnap.id, ...data };
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
    if (!timezone) return;
    const now = new Date();
    const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    setRangeStart(start);
    setRangeEnd(now);
    setFullRange({ start, end: now });
    setRangePreset("24h");
  }, [timezone, selectedBuilding]);

  useEffect(() => {
    const unsubscribe = subscribeTemperatureDataRefresh((detail) => {
      if (detail?.buildingCode && detail.buildingCode !== selectedBuilding) return;
      setRefreshKey((prev) => prev + 1);
    });
    return () => unsubscribe();
  }, [selectedBuilding]);

  useEffect(() => {
    const runFetch = async () => {
      if (!selectedBuilding || selectedRoomIds.length === 0) {
        setSeriesData([]);
        return;
      }
      if (!rangeStart || !rangeEnd) return;
      if (rangeStart > rangeEnd) {
        setDataError("Start date must be before end date.");
        return;
      }
      setDataLoading(true);
      setDataError("");
      try {
        const result = await fetchTemperatureSeries({
          db,
          buildingCode: selectedBuilding,
          roomIds: selectedRoomIds,
          start: rangeStart,
          end: rangeEnd,
          timezone,
          deviceDocs,
          granularity,
          unit: "F",
        });
        const seriesWithColors = result.series.map((item, index) => ({
          ...item,
          roomName: roomNameMap.get(item.roomId) || item.roomName,
          color: getSeriesColor(index),
          points: downsamplePoints(item.points || [], MAX_POINTS),
        }));
        setSeriesData(seriesWithColors);
        setLastUpdated(result.lastUpdated);
        setVisibleRoomIds((prev) => {
          const allIds = seriesWithColors.map((item) => item.roomId);
          if (!prev || prev.size === 0) return new Set(allIds);
          const next = new Set(allIds.filter((id) => prev.has(id)));
          if (next.size === 0) return new Set(allIds);
          return next;
        });
      } catch (error) {
        console.error("Temperature query failed:", error);
        setDataError("Unable to load temperature data for this range.");
      } finally {
        setDataLoading(false);
      }
    };
    runFetch();
  }, [
    selectedBuilding,
    selectedRoomIds,
    rangeStart,
    rangeEnd,
    timezone,
    deviceDocs,
    granularity,
    refreshKey,
    roomNameMap,
  ]);

  const filteredRooms = useMemo(() => {
    const search = normalizeMatchText(roomSearch);
    if (!search) return roomsForBuilding;
    return roomsForBuilding.filter((room) =>
      normalizeMatchText(roomLabel(room)).includes(search),
    );
  }, [roomsForBuilding, roomSearch]);

  const toggleRoom = (roomId) => {
    setSelectedRoomIds((prev) => {
      if (prev.includes(roomId)) {
        return prev.filter((id) => id !== roomId);
      }
      return [...prev, roomId];
    });
  };

  const selectAllRooms = () => {
    const allIds = roomsForBuilding.map((room) => room.spaceKey || room.id).filter(Boolean);
    setSelectedRoomIds(allIds);
  };

  const clearRooms = () => {
    setSelectedRoomIds([]);
  };

  const toggleSeriesVisibility = (roomId) => {
    setVisibleRoomIds((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId);
      else next.add(roomId);
      return next;
    });
  };

  const applyPreset = (preset) => {
    const now = new Date();
    let start;
    if (preset === "7d") start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    else if (preset === "30d")
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    else start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    setRangeStart(start);
    setRangeEnd(now);
    setFullRange({ start, end: now });
    setRangePreset(preset);
  };

  const handleBrush = ({ start, end }) => {
    if (!start || !end) return;
    setRangeStart(start);
    setRangeEnd(end);
    setRangePreset("custom");
  };

  const resetZoom = () => {
    if (!fullRange) return;
    setRangeStart(fullRange.start);
    setRangeEnd(fullRange.end);
    setRangePreset("custom");
  };

  const visibleSeries = seriesData.filter((item) =>
    visibleRoomIds.has(item.roomId),
  );
  const chartSeries = useMemo(
    () => sanitizeSeriesPoints(visibleSeries),
    [visibleSeries],
  );

  const statsRows = useMemo(() => {
    return visibleSeries.map((item) => {
      const values = item.points.map((p) => p.value);
      const latest = values[values.length - 1];
      const min = values.length ? Math.min(...values) : null;
      const max = values.length ? Math.max(...values) : null;
      const avg =
        values.length > 0
          ? values.reduce((sum, v) => sum + v, 0) / values.length
          : null;
      return {
        roomId: item.roomId,
        roomName: item.roomName,
        latest,
        min,
        max,
        avg,
      };
    });
  }, [visibleSeries]);

  const readings = useMemo(() => {
    const rows = [];
    chartSeries.forEach((item) => {
      item.points.forEach((point) => {
        rows.push({
          roomId: item.roomId,
          roomName: item.roomName,
          timestamp: point.timestamp,
          value: point.value,
        });
      });
    });
    rows.sort((a, b) => a.timestamp - b.timestamp);
    return rows;
  }, [chartSeries]);

  const unitLabel = "°F";

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Temperature Dashboard
        </h1>
        <p className="text-gray-600">
          Explore room temperature trends and compare spaces.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr] gap-6">
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Building
              </label>
              <div className="flex items-center gap-2">
                <select
                  className="form-select w-full"
                  value={selectedBuilding}
                  onChange={(e) => setSelectedBuilding(e.target.value)}
                >
                  <option value="">Select building...</option>
                  {buildingOptions.map((building) => (
                    <option key={building.code} value={building.code}>
                      {building.name}
                      {building.hidden ? " (hidden)" : ""}
                    </option>
                  ))}
                </select>
                {hiddenBuildingCodes.size > 0 && (
                  <button
                    onClick={() => setShowHidden(!showHidden)}
                    className="p-2 rounded-lg text-sm font-medium flex items-center gap-1 transition bg-gray-100 text-gray-700 hover:bg-gray-200"
                    title={showHidden ? "Hide hidden buildings" : "Show hidden buildings"}
                  >
                    {showHidden ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Date Range
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {[
                  { id: "24h", label: "Last 24h" },
                  { id: "7d", label: "7d" },
                  { id: "30d", label: "30d" },
                ].map((preset) => (
                  <button
                    key={preset.id}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${rangePreset === preset.id
                      ? "bg-baylor-green text-white border-baylor-green"
                      : "bg-white text-gray-600 border-gray-200 hover:border-baylor-green/50"
                      }`}
                    onClick={() => applyPreset(preset.id)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <input
                    type="datetime-local"
                    className="form-input w-full"
                    value={formatDateTimeInput(rangeStart, timezone)}
                    onChange={(e) => {
                      const next = parseDateTimeInput(e.target.value, timezone);
                      if (next) {
                        setRangeStart(next);
                        setRangePreset("custom");
                      }
                    }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <input
                    type="datetime-local"
                    className="form-input w-full"
                    value={formatDateTimeInput(rangeEnd, timezone)}
                    onChange={(e) => {
                      const next = parseDateTimeInput(e.target.value, timezone);
                      if (next) {
                        setRangeEnd(next);
                        setRangePreset("custom");
                      }
                    }}
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">
                Rooms
              </label>
              <div className="flex items-center gap-2 mb-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    className="form-input pl-9 w-full"
                    placeholder="Search rooms..."
                    value={roomSearch}
                    onChange={(e) => setRoomSearch(e.target.value)}
                  />
                </div>
                <button
                  className="btn-ghost"
                  onClick={selectAllRooms}
                  disabled={roomsForBuilding.length === 0}
                >
                  All
                </button>
                <button className="btn-ghost" onClick={clearRooms}>
                  Clear
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg">
                {filteredRooms.length === 0 ? (
                  <div className="p-3 text-xs text-gray-500">
                    No rooms found.
                  </div>
                ) : (
                  filteredRooms.map((room) => {
                    const roomId = room.spaceKey || room.id;
                    if (!roomId) return null;
                    const checked = selectedRoomIds.includes(roomId);
                    return (
                      <label
                        key={roomId}
                        className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 text-sm text-gray-700 cursor-pointer hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          className="w-4 h-4 text-baylor-green border-gray-300 rounded focus:ring-baylor-green"
                          checked={checked}
                          onChange={() => toggleRoom(roomId)}
                        />
                        <span>{roomLabel(room)}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                className={`flex-1 btn-secondary ${compareMode === "overlay" ? "bg-baylor-green/10 text-baylor-green" : ""}`}
                onClick={() => setCompareMode("overlay")}
              >
                <LineChart className="w-4 h-4 mr-2" />
                Overlay
              </button>
              <button
                className={`flex-1 btn-secondary ${compareMode === "grid" ? "bg-baylor-green/10 text-baylor-green" : ""}`}
                onClick={() => setCompareMode("grid")}
              >
                <Grid2X2 className="w-4 h-4 mr-2" />
                Grid
              </button>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-2">
            <div className="text-xs text-gray-500">Granularity</div>
            <div className="text-sm font-semibold text-gray-900">
              {resolveTemperatureGranularity({
                start: rangeStart,
                end: rangeEnd,
                requested: granularity,
              })}
            </div>
            <div className="text-xs text-gray-500">
              Timezone: {timezone}
            </div>
            {lastUpdated && (
              <div className="text-xs text-gray-500">
                Last updated: {formatTick(lastUpdated, timezone, true)}
              </div>
            )}
            <button
              className="btn-ghost w-full"
              onClick={() => setRefreshKey((prev) => prev + 1)}
            >
              <RefreshCcw className="w-4 h-4 mr-2" />
              Refresh data
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-gray-900">
                  Temperature Trends
                </h2>
                {dataLoading && (
                  <span className="text-xs text-gray-500">Loading…</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button className="btn-ghost" onClick={resetZoom}>
                  <ZoomOut className="w-4 h-4 mr-2" />
                  Reset zoom
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => setGranularity("auto")}
                >
                  <ZoomIn className="w-4 h-4 mr-2" />
                  Auto
                </button>
              </div>
            </div>
            {dataError && (
              <div className="text-sm text-rose-600 mb-3">{dataError}</div>
            )}
            {compareMode === "overlay" ? (
              <>
                <div className="flex flex-wrap gap-2 mb-3">
                  {seriesData.map((item) => {
                    const active = visibleRoomIds.has(item.roomId);
                    return (
                      <button
                        key={item.roomId}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border flex items-center gap-2 ${active
                          ? "bg-gray-900 text-white border-gray-900"
                          : "bg-white text-gray-500 border-gray-200"
                          }`}
                        onClick={() => toggleSeriesVisibility(item.roomId)}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                        {item.roomName}
                      </button>
                    );
                  })}
                </div>
                <TemperatureLineChart
                  series={chartSeries}
                  height={360}
                  timeZone={timezone}
                  unitLabel={unitLabel}
                  idealRange={idealRange}
                  onBrush={handleBrush}
                  onPointSelect={setSelectedPoint}
                />
              </>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {chartSeries.map((item) => (
                  <div
                    key={item.roomId}
                    className="border border-gray-200 rounded-lg p-3"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-semibold text-gray-900">
                        {item.roomName}
                      </div>
                      <div className="text-xs text-gray-500">
                        {item.points[item.points.length - 1]?.value?.toFixed(1)}
                        {unitLabel}
                      </div>
                    </div>
                    <TemperatureLineChart
                      series={[item]}
                      height={160}
                      timeZone={timezone}
                      unitLabel={unitLabel}
                      idealRange={idealRange}
                      compact
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                Room Stats
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2 text-gray-500 font-semibold">
                        Room
                      </th>
                      <th className="text-left px-3 py-2 text-gray-500 font-semibold">
                        Latest
                      </th>
                      <th className="text-left px-3 py-2 text-gray-500 font-semibold">
                        Min
                      </th>
                      <th className="text-left px-3 py-2 text-gray-500 font-semibold">
                        Max
                      </th>
                      <th className="text-left px-3 py-2 text-gray-500 font-semibold">
                        Avg
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {statsRows.map((row) => {
                      const status = getTemperatureStatus(row.latest, idealRange);
                      const tone =
                        status === "below"
                          ? "text-sky-700 bg-sky-50"
                          : status === "above"
                            ? "text-rose-700 bg-rose-50"
                            : "text-baylor-green bg-baylor-green/10";
                      return (
                        <tr key={row.roomId}>
                          <td className="px-3 py-2 text-gray-700">
                            {row.roomName}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${tone}`}>
                              {row.latest != null ? row.latest.toFixed(1) : "—"}
                              {unitLabel}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            {row.min != null ? row.min.toFixed(1) : "—"}
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            {row.max != null ? row.max.toFixed(1) : "—"}
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            {row.avg != null ? row.avg.toFixed(1) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                Readings
              </h3>
              {readings.length === 0 ? (
                <div className="text-sm text-gray-500">
                  No readings for the selected range.
                </div>
              ) : (
                <div className="h-64" ref={readingsContainerRef}>
                  <AutoSizer>
                    {({ height, width }) => {
                      const resolvedHeight =
                        Number.isFinite(height) && height > 0
                          ? height
                          : readingsContainerRef.current?.clientHeight || 0;
                      const resolvedWidth =
                        Number.isFinite(width) && width > 0
                          ? width
                          : readingsContainerRef.current?.clientWidth || 0;
                      if (!resolvedHeight || !resolvedWidth) return null;
                      return (
                        <List
                          height={resolvedHeight}
                          width={resolvedWidth}
                          itemCount={readings.length}
                          itemSize={36}
                          itemData={{
                            rows: readings,
                            timezone,
                            selectedPoint,
                            unitLabel,
                          }}
                        >
                          {({ index, style, data }) => {
                            const row = data.rows[index];
                            const rowTime = row.timestamp?.getTime?.();
                            const selectedTime =
                              data.selectedPoint?.timestamp?.getTime?.();
                            const isSelected =
                              rowTime != null &&
                              selectedTime != null &&
                              rowTime === selectedTime;
                            return (
                              <div
                                style={style}
                                className={`px-3 py-2 flex items-center justify-between text-xs border-b border-gray-100 ${isSelected ? "bg-baylor-green/10" : ""}`}
                              >
                                <span className="text-gray-700">
                                  {row.roomName}
                                </span>
                                <span className="text-gray-500">
                                  {rowTime != null
                                    ? formatTick(row.timestamp, data.timezone, true)
                                    : "—"}
                                </span>
                                <span className="font-semibold text-gray-900">
                                  {row.value.toFixed(1)}
                                  {data.unitLabel}
                                </span>
                              </div>
                            );
                          }}
                        </List>
                      );
                    }}
                  </AutoSizer>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TemperatureDashboard;
