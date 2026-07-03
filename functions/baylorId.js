const BAYLOR_ID_KEYS = new Set(["baylorId", "Baylor ID", "BaylorID"]);
const REDACTED_BAYLOR_ID = "[removed-baylor-id]";

const normalizeBaylorId = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const digits = text.replace(/\D/g, "");
  return digits || null;
};

const isValidBaylorId = (value) => {
  const normalized = normalizeBaylorId(value);
  return Boolean(normalized && /^\d{9}$/.test(normalized));
};

const redactRemovedBaylorIdInString = (value, removedBaylorId) => {
  if (!removedBaylorId || typeof value !== "string") return value;
  return value.includes(removedBaylorId)
    ? value.split(removedBaylorId).join(REDACTED_BAYLOR_ID)
    : value;
};

const scrubRemovedBaylorId = (value, removedBaylorId, path = []) => {
  if (!removedBaylorId) return value;
  if (value === undefined || value === null) return value;

  const currentKey = path[path.length - 1] || "";
  const normalizedKey = currentKey.replace(/[^A-Za-z0-9]+/g, "").toLowerCase();
  const keyIsBaylorId =
    BAYLOR_ID_KEYS.has(currentKey) || normalizedKey.endsWith("baylorid");

  if (Array.isArray(value)) {
    return value.map((item, index) =>
      scrubRemovedBaylorId(item, removedBaylorId, [...path, String(index)]),
    );
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        scrubRemovedBaylorId(child, removedBaylorId, [...path, key]),
      ]),
    );
  }

  if (keyIsBaylorId && normalizeBaylorId(value) === removedBaylorId) {
    return null;
  }

  if (typeof value === "string") {
    return redactRemovedBaylorIdInString(value, removedBaylorId);
  }

  return value;
};

const hasSerializedValueChanged = (before, after) =>
  JSON.stringify(before) !== JSON.stringify(after);

module.exports = {
  REDACTED_BAYLOR_ID,
  normalizeBaylorId,
  isValidBaylorId,
  scrubRemovedBaylorId,
  hasSerializedValueChanged,
};
