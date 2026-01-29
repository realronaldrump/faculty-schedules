import { zonedTimeToUtc } from "./temperatureUtils";

export const TEMPERATURE_GRANULARITY = {
  RAW: "raw",
  HOURLY: "hour",
  DAILY: "day",
};

export const resolveTemperatureGranularity = ({ start, end, requested }) => {
  if (requested && requested !== "auto") return requested;
  if (!start || !end) return TEMPERATURE_GRANULARITY.HOURLY;
  const diffMs = end.getTime() - start.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  if (diffHours <= 48) return TEMPERATURE_GRANULARITY.RAW;
  if (diffHours <= 24 * 45) return TEMPERATURE_GRANULARITY.HOURLY;
  return TEMPERATURE_GRANULARITY.DAILY;
};

const initBucket = () => ({
  count: 0,
  minF: null,
  maxF: null,
  sumF: 0,
  minC: null,
  maxC: null,
  sumC: 0,
});

const addToBucket = (bucket, sample) => {
  const { temperatureF, temperatureC } = sample || {};
  if (!Number.isFinite(temperatureF) && !Number.isFinite(temperatureC)) {
    return bucket;
  }
  const next = bucket || initBucket();
  next.count += 1;
  if (Number.isFinite(temperatureF)) {
    next.minF = next.minF == null ? temperatureF : Math.min(next.minF, temperatureF);
    next.maxF = next.maxF == null ? temperatureF : Math.max(next.maxF, temperatureF);
    next.sumF += temperatureF;
  }
  if (Number.isFinite(temperatureC)) {
    next.minC = next.minC == null ? temperatureC : Math.min(next.minC, temperatureC);
    next.maxC = next.maxC == null ? temperatureC : Math.max(next.maxC, temperatureC);
    next.sumC += temperatureC;
  }
  return next;
};

const finalizeBucket = (bucket) => {
  if (!bucket || bucket.count === 0) return null;
  return {
    count: bucket.count,
    minF: bucket.minF,
    maxF: bucket.maxF,
    avgF: bucket.minF == null ? null : bucket.sumF / bucket.count,
    minC: bucket.minC,
    maxC: bucket.maxC,
    avgC: bucket.minC == null ? null : bucket.sumC / bucket.count,
  };
};

export const buildHourlyAggregates = (samples = {}) => {
  const buckets = Array.from({ length: 24 }, () => initBucket());
  let daily = initBucket();
  Object.entries(samples).forEach(([minuteKey, sample]) => {
    const minute = Number.parseInt(minuteKey, 10);
    if (Number.isNaN(minute)) return;
    const hour = Math.floor(minute / 60);
    if (hour < 0 || hour > 23) return;
    buckets[hour] = addToBucket(buckets[hour], sample);
    daily = addToBucket(daily, sample);
  });
  return {
    hourly: buckets.map(finalizeBucket),
    daily: finalizeBucket(daily),
    sampleCount: daily.count || 0,
  };
};

export const buildAggregateSeries = ({
  aggregates = [],
  granularity = TEMPERATURE_GRANULARITY.HOURLY,
  timezone,
  unit = "F",
}) => {
  const bySpace = new Map();
  aggregates.forEach((doc) => {
    const spaceKey = doc.spaceKey || "unknown";
    if (!bySpace.has(spaceKey)) {
      bySpace.set(spaceKey, {
        spaceKey,
        spaceLabel: doc.spaceLabel || doc.spaceDisplayName || spaceKey,
        points: [],
        updatedAt: doc.updatedAt || null,
      });
    }
    const entry = bySpace.get(spaceKey);
    const docUpdatedAt = doc.updatedAt?.toDate
      ? doc.updatedAt.toDate()
      : doc.updatedAt;
    const entryUpdatedAt = entry.updatedAt?.toDate
      ? entry.updatedAt.toDate()
      : entry.updatedAt;
    if (docUpdatedAt && (!entryUpdatedAt || docUpdatedAt > entryUpdatedAt)) {
      entry.updatedAt = doc.updatedAt;
    }

    if (granularity === TEMPERATURE_GRANULARITY.DAILY) {
      if (!doc.daily || !doc.dateLocal) return;
      const [year, month, day] = doc.dateLocal.split("-").map(Number);
      const utcDate = zonedTimeToUtc(
        { year, month, day, hour: 12, minute: 0, second: 0, raw: doc.dateLocal },
        timezone,
      );
      if (!utcDate) return;
      const value = unit === "C" ? doc.daily.avgC : doc.daily.avgF;
      if (!Number.isFinite(value)) return;
      entry.points.push({
        timestamp: utcDate,
        value,
        min: unit === "C" ? doc.daily.minC : doc.daily.minF,
        max: unit === "C" ? doc.daily.maxC : doc.daily.maxF,
        count: doc.daily.count,
      });
      return;
    }

    if (!doc.hourly || !doc.dateLocal) return;
    const [year, month, day] = doc.dateLocal.split("-").map(Number);
    doc.hourly.forEach((bucket, hour) => {
      if (!bucket || bucket.count === 0) return;
      const utcDate = zonedTimeToUtc(
        { year, month, day, hour, minute: 0, second: 0, raw: doc.dateLocal },
        timezone,
      );
      if (!utcDate) return;
      const value = unit === "C" ? bucket.avgC : bucket.avgF;
      if (!Number.isFinite(value)) return;
      entry.points.push({
        timestamp: utcDate,
        value,
        min: unit === "C" ? bucket.minC : bucket.minF,
        max: unit === "C" ? bucket.maxC : bucket.maxF,
        count: bucket.count,
      });
    });
  });

  return Array.from(bySpace.values()).map((series) => ({
    ...series,
    points: series.points.sort((a, b) => a.timestamp - b.timestamp),
  }));
};
