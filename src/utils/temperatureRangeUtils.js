export const normalizeIdealRange = (minF, maxF) => {
  const minVal = Number.isFinite(minF) ? Number(minF) : null;
  const maxVal = Number.isFinite(maxF) ? Number(maxF) : null;
  if (minVal == null && maxVal == null) return null;
  if (minVal != null && maxVal != null && minVal > maxVal) return null;
  return { minF: minVal, maxF: maxVal };
};

export const getTemperatureStatus = (valueF, range) => {
  if (!Number.isFinite(valueF) || !range) return "unknown";
  if (Number.isFinite(range.minF) && valueF < range.minF) return "below";
  if (Number.isFinite(range.maxF) && valueF > range.maxF) return "above";
  return "ok";
};
