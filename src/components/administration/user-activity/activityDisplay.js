import { toDate } from "../../../utils/activityAnalytics";

const LIVE_WINDOW_MINUTES = 2;
const IDLE_WINDOW_MINUTES = 10;

export const formatMinutes = (value) => {
  const minutes = Math.round(value || 0);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
  }
  return `${minutes}m`;
};

export const formatCount = (value) =>
  Number(value || 0).toLocaleString("en-US");

export const formatDateTime = (value) => {
  const date = toDate(value);
  if (!date) return "Unknown time";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export const formatTimeAgo = (value) => {
  const date = toDate(value);
  if (!date) return "unknown";

  const diffMinutes = Math.max(
    0,
    Math.floor((Date.now() - date.getTime()) / (1000 * 60)),
  );
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
};

export const formatDateKeyShort = (dateKey) => {
  if (!dateKey) return "—";
  const parsed = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateKey;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export const formatHourLabel = (hour) => {
  const normalized = ((Number(hour) % 24) + 24) % 24;
  const meridiem = normalized < 12 ? "AM" : "PM";
  const displayHour = normalized % 12 || 12;
  return `${displayHour} ${meridiem}`;
};

export const getActivityStatus = (lastActiveAt) => {
  const lastActiveDate = toDate(lastActiveAt);
  if (!lastActiveDate) {
    return { label: "Unknown", tone: "muted", rank: 3 };
  }
  const diffMinutes = Math.max(
    0,
    Math.floor((Date.now() - lastActiveDate.getTime()) / (1000 * 60)),
  );
  if (diffMinutes <= LIVE_WINDOW_MINUTES) {
    return { label: "Active now", tone: "success", rank: 0 };
  }
  if (diffMinutes <= IDLE_WINDOW_MINUTES) {
    return { label: "Idle", tone: "warning", rank: 1 };
  }
  return { label: "Away", tone: "neutral", rank: 2 };
};

export const humanizeActionKey = (actionKey) =>
  String(actionKey || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export const downloadCsv = (filename, headerCells, rows) => {
  const escapeCell = (value) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [headerCells, ...rows].map((cells) =>
    cells.map(escapeCell).join(","),
  );
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
