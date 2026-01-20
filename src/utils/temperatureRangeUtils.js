export const normalizeIdealRange = (minF, maxF) => {
  const minVal = Number.isFinite(minF) ? Number(minF) : null;
  const maxVal = Number.isFinite(maxF) ? Number(maxF) : null;
  if (minVal == null && maxVal == null) return null;
  if (minVal != null && maxVal != null && minVal > maxVal) return null;
  return { minF: minVal, maxF: maxVal };
};

export const normalizeIdealRangeByType = (rangesByType = {}) => {
  if (!rangesByType || typeof rangesByType !== "object") return {};
  const next = {};
  Object.entries(rangesByType).forEach(([type, range]) => {
    if (!type) return;
    const normalized = normalizeIdealRange(range?.minF, range?.maxF);
    if (normalized) next[type] = normalized;
  });
  return next;
};

export const resolveIdealRangeForSpaceType = (
  spaceType,
  defaultRange,
  rangesByType,
) => {
  if (!spaceType) return defaultRange || null;
  if (!rangesByType || typeof rangesByType !== "object") {
    return defaultRange || null;
  }
  if (rangesByType[spaceType]) return rangesByType[spaceType];
  const normalized = String(spaceType).trim().toLowerCase();
  if (!normalized) return defaultRange || null;
  const match = Object.entries(rangesByType).find(
    ([type]) => String(type).trim().toLowerCase() === normalized,
  );
  return match?.[1] || defaultRange || null;
};

export const getTemperatureStatus = (valueF, range) => {
  if (!Number.isFinite(valueF) || !range) return "unknown";
  if (Number.isFinite(range.minF) && valueF < range.minF) return "below";
  if (Number.isFinite(range.maxF) && valueF > range.maxF) return "above";
  return "ok";
};
