export const DEFAULT_TIMEZONE = "America/Chicago";
export const AUTO_MATCH_THRESHOLD = 0.85;

export const DEFAULT_SNAPSHOT_TIMES = [
  { label: "8:30 AM", minutes: 8 * 60 + 30, toleranceMinutes: 15 },
  { label: "4:30 PM", minutes: 16 * 60 + 30, toleranceMinutes: 15 },
];

export const DATA_VIEW_TABS = [
  { id: "floorplan", label: "Floorplan" },
  { id: "daily", label: "Daily" },
  { id: "historical", label: "Historical" },
  { id: "trends", label: "Trends" },
];

export const ACTION_TABS = [
  { id: "import", label: "Import" },
  { id: "export", label: "Export" },
  { id: "settings", label: "Settings" },
];
