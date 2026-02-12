import { normalizeTermLabel, termCodeFromLabel } from "../termUtils";
import { sortWeeklySchedule } from "../studentScheduleUtils";

export const normalizeRoleList = (roles) => {
  if (Array.isArray(roles)) return roles.filter(Boolean);
  if (roles && typeof roles === "object") {
    return Object.keys(roles).filter((key) => roles[key]);
  }
  if (typeof roles === "string" && roles.trim()) {
    return [roles.trim()];
  }
  return [];
};

export const yesNo = (value) => (value ? "Yes" : "No");

export const joinValues = (values = [], separator = "; ") => {
  if (!Array.isArray(values)) return "";
  const seen = new Set();
  const normalized = [];
  values.forEach((value) => {
    if (value === undefined || value === null) return;
    const text = String(value).trim();
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push(text);
  });
  return normalized.join(separator);
};

export const getActiveStatusLabel = (isActive) =>
  isActive === false ? "Inactive" : "Active";

export const getBooleanStatusLabel = (value) => (value ? "Yes" : "No");

export const getPersonDisplayName = (person = {}) => {
  const explicitName = (person?.name || "").toString().trim();
  if (explicitName) return explicitName;

  const fullName = `${person?.firstName || ""} ${person?.lastName || ""}`.trim();
  if (fullName) return fullName;

  return person?.email || person?.id || "Unknown";
};

export const getPersonBaylorId = (person = {}) =>
  (person?.baylorId || person?.externalIds?.baylorId || "").toString().trim();

export const getPersonClssInstructorId = (person = {}) =>
  (
    person?.externalIds?.clssInstructorId ||
    person?.clssInstructorId ||
    person?.externalIds?.clssId ||
    ""
  )
    .toString()
    .trim();

export const toDateObject = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number") {
    const fromNumber = new Date(value);
    return Number.isNaN(fromNumber.getTime()) ? null : fromNumber;
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      const utcDate = new Date(`${text}T00:00:00`);
      return Number.isNaN(utcDate.getTime()) ? null : utcDate;
    }

    const fromString = new Date(text);
    return Number.isNaN(fromString.getTime()) ? null : fromString;
  }
  if (typeof value === "object") {
    if (typeof value.toDate === "function") {
      const dateValue = value.toDate();
      return Number.isNaN(dateValue?.getTime?.()) ? null : dateValue;
    }
    if (typeof value.seconds === "number") {
      const fromSeconds = new Date(value.seconds * 1000);
      return Number.isNaN(fromSeconds.getTime()) ? null : fromSeconds;
    }
  }
  return null;
};

export const formatDate = (value) => {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  const parsed = toDateObject(value);
  if (!parsed) return "";
  const year = parsed.getFullYear();
  const month = `${parsed.getMonth() + 1}`.padStart(2, "0");
  const day = `${parsed.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const formatDateTime = (value) => {
  const parsed = toDateObject(value);
  if (!parsed) return "";
  return parsed.toLocaleString();
};

export const formatCurrency = (value) => {
  if (value === undefined || value === null || value === "") return "";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  return `$${numeric.toFixed(2)}`;
};

export const formatNumber = (value, { decimals = 0 } = {}) => {
  if (value === undefined || value === null || value === "") return "";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  return numeric.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

export const toNormalizedTermScope = ({
  termScope = "all",
  selectedTerm = "",
  selectedTermMeta = null,
} = {}) => {
  const normalizedLabel = normalizeTermLabel(selectedTerm) || selectedTerm || "";
  const normalizedCode =
    selectedTermMeta?.termCode || termCodeFromLabel(normalizedLabel || selectedTerm);

  return {
    scope: termScope === "selected" ? "selected" : "all",
    termLabel: normalizedLabel,
    termCode: normalizedCode || "",
    scopeLabel:
      termScope === "selected"
        ? normalizedLabel || selectedTermMeta?.term || "Selected term"
        : "All terms",
  };
};

export const scheduleMatchesTermScope = (schedule = {}, termScopeInfo = {}) => {
  if (!schedule || termScopeInfo.scope !== "selected") return true;

  const scheduleTermCode = (schedule?.termCode || "").toString().trim();
  const scheduleTermLabel =
    normalizeTermLabel(schedule?.term || "") || (schedule?.term || "").toString().trim();

  if (termScopeInfo.termCode && scheduleTermCode) {
    return scheduleTermCode === termScopeInfo.termCode;
  }

  if (termScopeInfo.termLabel && scheduleTermLabel) {
    return scheduleTermLabel === termScopeInfo.termLabel;
  }

  return false;
};

export const formatWeeklySchedule = (entries = []) => {
  if (!Array.isArray(entries) || entries.length === 0) return "";
  const sorted = sortWeeklySchedule(entries);
  const labels = sorted
    .map((entry) => {
      if (!entry?.day || !entry?.start || !entry?.end) return "";
      return `${entry.day} ${entry.start}-${entry.end}`;
    })
    .filter(Boolean);
  return joinValues(labels);
};

export const formatMeetingPatternSummary = (patterns = []) => {
  if (!Array.isArray(patterns) || patterns.length === 0) return "";
  const labels = patterns
    .map((pattern) => {
      const day = (pattern?.day || "").toString().trim();
      const start = (pattern?.startTime || "").toString().trim();
      const end = (pattern?.endTime || "").toString().trim();
      if (!day && !start && !end) return "";
      if (day && start && end) return `${day} ${start}-${end}`;
      return [day, start, end].filter(Boolean).join(" ");
    })
    .filter(Boolean);

  return joinValues(labels);
};

export const slugifyForFileName = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "all";

export const getTodayTag = () => formatDate(new Date());

export const buildBulkExportFileName = ({ termScopeInfo } = {}) => {
  const scopePart =
    termScopeInfo?.scope === "selected"
      ? slugifyForFileName(termScopeInfo.termLabel || termScopeInfo.termCode)
      : "all";
  return `hsd-operational-export-${scopePart}-${getTodayTag()}.xlsx`;
};

export const buildIndividualFileName = ({ label = "export" } = {}) => {
  const tag = slugifyForFileName(label);
  return `hsd-${tag}-export-${getTodayTag()}.xlsx`;
};
