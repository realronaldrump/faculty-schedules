import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import {
  TEMPERATURE_GRANULARITY,
  buildAggregateSeries,
  resolveTemperatureGranularity,
} from "./temperatureAggregation";
import { formatDateInTimeZone } from "./temperatureUtils";

const chunkArray = (items, size) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const buildDeviceSpaceMap = (deviceDocs = {}) => {
  const map = new Map();
  Object.values(deviceDocs).forEach((device) => {
    const spaceKey = device?.mapping?.spaceKey;
    if (!spaceKey || !device?.id) return;
    map.set(device.id, spaceKey);
  });
  return map;
};

const mergePoint = (store, timestampMs, value) => {
  const existing = store.get(timestampMs);
  if (!existing) {
    store.set(timestampMs, { sum: value, count: 1, min: value, max: value });
    return;
  }
  existing.sum += value;
  existing.count += 1;
  existing.min = Math.min(existing.min, value);
  existing.max = Math.max(existing.max, value);
};

const buildRawSeries = ({
  readingsDocs = [],
  deviceSpaceMap,
  spaceLabelMap,
  start,
  end,
  unit,
}) => {
  const spacePointMaps = new Map();
  let lastUpdated = null;

  readingsDocs.forEach((docData) => {
    const deviceId = docData.deviceId;
    const spaceKey = deviceSpaceMap.get(deviceId);
    if (!spaceKey) return;
    const samples = docData.samples || {};
    if (!spacePointMaps.has(spaceKey)) {
      spacePointMaps.set(spaceKey, new Map());
    }
    const spaceStore = spacePointMaps.get(spaceKey);
    Object.values(samples).forEach((sample) => {
      const utc = sample?.utc?.toDate ? sample.utc.toDate() : sample?.utc;
      if (!(utc instanceof Date)) return;
      if (utc < start || utc > end) return;
      const value = unit === "C" ? sample.temperatureC : sample.temperatureF;
      if (!Number.isFinite(value)) return;
      const timestampMs = utc.getTime();
      mergePoint(spaceStore, timestampMs, value);
      if (!lastUpdated || utc > lastUpdated) lastUpdated = utc;
    });
  });

  return {
    series: Array.from(spacePointMaps.entries()).map(([spaceKey, store]) => {
      const points = Array.from(store.entries()).map(([timestampMs, entry]) => ({
        timestamp: new Date(timestampMs),
        value: entry.sum / entry.count,
        min: entry.min,
        max: entry.max,
        count: entry.count,
      }));
      points.sort((a, b) => a.timestamp - b.timestamp);
      return {
        spaceKey,
        spaceLabel: spaceLabelMap.get(spaceKey) || spaceKey,
        points,
      };
    }),
    lastUpdated,
  };
};

const isPermissionError = (error) => {
  const code = error?.code;
  if (code === "permission-denied" || code === "unauthenticated") return true;
  if (typeof error?.message !== "string") return false;
  return error.message.toLowerCase().includes("permission");
};

export const fetchTemperatureSeries = async ({
  db,
  buildingCode,
  spaceKeys = [],
  start,
  end,
  timezone,
  deviceDocs = {},
  granularity = "auto",
  unit = "F",
}) => {
  if (!db || !buildingCode || spaceKeys.length === 0 || !start || !end) {
    return {
      series: [],
      granularity: resolveTemperatureGranularity({ start, end, requested: granularity }),
      lastUpdated: null,
      unit,
    };
  }

  const resolvedGranularity = resolveTemperatureGranularity({
    start,
    end,
    requested: granularity,
  });

  const startLocal = formatDateInTimeZone(start, timezone);
  const endLocal = formatDateInTimeZone(end, timezone);
  const spaceLabelMap = new Map();

  if (resolvedGranularity === TEMPERATURE_GRANULARITY.RAW) {
    const deviceSpaceMap = buildDeviceSpaceMap(deviceDocs);
    const spaceKeySet = new Set(spaceKeys);
    Object.values(deviceDocs).forEach((device) => {
      const spaceKey = device?.mapping?.spaceKey;
      if (!spaceKey || !spaceKeySet.has(spaceKey)) return;
      spaceLabelMap.set(spaceKey, device?.mapping?.spaceLabel || device?.label || spaceKey);
    });
    const deviceIds = Array.from(
      new Set(
        Array.from(deviceSpaceMap.entries())
          .filter(([, spaceKey]) => spaceKeySet.has(spaceKey))
          .map(([deviceId]) => deviceId),
      ),
    );
    const chunks = chunkArray(deviceIds, 10);
    const readingsDocs = [];
    for (const chunk of chunks) {
      const q = query(
        collection(db, "temperatureDeviceReadings"),
        where("buildingCode", "==", buildingCode),
        where("deviceId", "in", chunk),
        where("dateLocal", ">=", startLocal),
        where("dateLocal", "<=", endLocal),
      );
      const snap = await getDocs(q);
      snap.docs.forEach((docSnap) => {
        readingsDocs.push(docSnap.data());
      });
    }
    const { series, lastUpdated } = buildRawSeries({
      readingsDocs,
      deviceSpaceMap,
      spaceLabelMap,
      start,
      end,
      unit,
    });
    return {
      series,
      granularity: resolvedGranularity,
      lastUpdated,
      unit,
    };
  }

  const spaceChunks = chunkArray(spaceKeys, 10);
  const aggregateDocs = [];
  try {
    for (const chunk of spaceChunks) {
      const q = query(
        collection(db, "temperatureRoomAggregates"),
        where("buildingCode", "==", buildingCode),
        where("spaceKey", "in", chunk),
        where("dateLocal", ">=", startLocal),
        where("dateLocal", "<=", endLocal),
      );
      const snap = await getDocs(q);
      snap.docs.forEach((docSnap) => aggregateDocs.push(docSnap.data()));
    }
  } catch (error) {
    if (isPermissionError(error)) {
      console.warn(
        "Temperature aggregates unavailable; falling back to raw readings.",
        error,
      );
      return fetchTemperatureSeries({
        db,
        buildingCode,
        spaceKeys,
        start,
        end,
        timezone,
        deviceDocs,
        granularity: TEMPERATURE_GRANULARITY.RAW,
        unit,
      });
    }
    throw error;
  }

  const series = buildAggregateSeries({
    aggregates: aggregateDocs,
    granularity: resolvedGranularity,
    timezone,
    unit,
  });

  let lastUpdated = null;
  series.forEach((item) => {
    if (item.updatedAt?.toDate) {
      const updated = item.updatedAt.toDate();
      if (!lastUpdated || updated > lastUpdated) lastUpdated = updated;
    }
    if (!item.updatedAt && item.points.length > 0) {
      const latestPoint = item.points[item.points.length - 1]?.timestamp;
      if (latestPoint && (!lastUpdated || latestPoint > lastUpdated)) {
        lastUpdated = latestPoint;
      }
    }
  });

  return {
    series,
    granularity: resolvedGranularity,
    lastUpdated,
    unit,
  };
};
