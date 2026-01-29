export const normalizeNumericField = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number.parseInt(String(value).replace(/[^0-9-]/g, ""), 10);
  return Number.isNaN(parsed) ? null : parsed;
};

export const getMaxEnrollment = (record = {}) => {
  if (!record) return null;
  const raw =
    record.maxEnrollment ??
    record.max_enrollment ??
    record["Maximum Enrollment"] ??
    record.maximumEnrollment ??
    record.MaxEnrollment ??
    record["Max Enrollment"] ??
    null;
  return normalizeNumericField(raw);
};
