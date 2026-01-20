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

const buildDeviceRoomMap = (deviceDocs = {}) => {
  const map = new Map();
  Object.values(deviceDocs).forEach((device) => {
    const roomId = device?.mapping?.spaceKey || device?.mapping?.roomId;
    if (!roomId || !device?.id) return;
    map.set(device.id, roomId);
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
  deviceRoomMap,
  roomLabelMap,
  start,
  end,
  unit,
}) => {
  const roomPointMaps = new Map();
  let lastUpdated = null;

  readingsDocs.forEach((docData) => {
    const deviceId = docData.deviceId;
    const roomId = deviceRoomMap.get(deviceId);
    if (!roomId) return;
    const samples = docData.samples || {};
    if (!roomPointMaps.has(roomId)) {
      roomPointMaps.set(roomId, new Map());
    }
    const roomStore = roomPointMaps.get(roomId);
    Object.values(samples).forEach((sample) => {
      const utc = sample?.utc?.toDate ? sample.utc.toDate() : sample?.utc;
      if (!(utc instanceof Date)) return;
      if (utc < start || utc > end) return;
      const value = unit === "C" ? sample.temperatureC : sample.temperatureF;
      if (!Number.isFinite(value)) return;
      const timestampMs = utc.getTime();
      mergePoint(roomStore, timestampMs, value);
      if (!lastUpdated || utc > lastUpdated) lastUpdated = utc;
    });
  });

  return {
    series: Array.from(roomPointMaps.entries()).map(([roomId, store]) => {
      const points = Array.from(store.entries()).map(([timestampMs, entry]) => ({
        timestamp: new Date(timestampMs),
        value: entry.sum / entry.count,
        min: entry.min,
        max: entry.max,
        count: entry.count,
      }));
      points.sort((a, b) => a.timestamp - b.timestamp);
      return {
        roomId,
        roomName: roomLabelMap.get(roomId) || roomId,
        points,
      };
    }),
    lastUpdated,
  };
};

export const fetchTemperatureSeries = async ({
  db,
  buildingCode,
  roomIds = [],
  start,
  end,
  timezone,
  deviceDocs = {},
  granularity = "auto",
  unit = "F",
}) => {
  if (!db || !buildingCode || roomIds.length === 0 || !start || !end) {
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
  const roomLabelMap = new Map();

  if (resolvedGranularity === TEMPERATURE_GRANULARITY.RAW) {
    const deviceRoomMap = buildDeviceRoomMap(deviceDocs);
    const roomIdSet = new Set(roomIds);
    Object.values(deviceDocs).forEach((device) => {
      const roomId = device?.mapping?.spaceKey || device?.mapping?.roomId;
      if (!roomId || !roomIdSet.has(roomId)) return;
      roomLabelMap.set(roomId, device?.mapping?.roomName || device?.label || roomId);
    });
    const deviceIds = Array.from(
      new Set(
        Array.from(deviceRoomMap.entries())
          .filter(([, roomId]) => roomIdSet.has(roomId))
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
      deviceRoomMap,
      roomLabelMap,
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

  const roomChunks = chunkArray(roomIds, 10);
  const aggregateDocs = [];
  for (const chunk of roomChunks) {
    const q = query(
      collection(db, "temperatureRoomAggregates"),
      where("buildingCode", "==", buildingCode),
      where("roomId", "in", chunk),
      where("dateLocal", ">=", startLocal),
      where("dateLocal", "<=", endLocal),
    );
    const snap = await getDocs(q);
    snap.docs.forEach((docSnap) => aggregateDocs.push(docSnap.data()));
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
