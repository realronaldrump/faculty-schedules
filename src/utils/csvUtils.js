/**
 * CSV utilities
 *
 * We intentionally keep parsing logic in-app (not relying on external libs)
 * because some sources (like CLSS) include multiline quoted fields and headers.
 */

/**
 * Robust CSV parser that handles escaped quotes and multiline fields.
 *
 * @param {string} text
 * @returns {string[][]} rows
 */
export const parseCSVRecords = (text) => {
  const input = String(text || "");
  const rows = [];
  let currentRow = [];
  let currentValue = "";
  let inQuotes = false;
  let lastCharWasLineBreak = false;

  for (let i = 0; i < input.length; i++) {
    let char = input[i];

    if (i === 0 && char === "\ufeff") {
      // Strip BOM if present
      continue;
    }

    if (char === '"') {
      if (inQuotes && input[i + 1] === '"') {
        currentValue += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      lastCharWasLineBreak = false;
    } else if (char === "," && !inQuotes) {
      currentRow.push(currentValue);
      currentValue = "";
      lastCharWasLineBreak = false;
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && input[i + 1] === "\n") {
        i++;
      }
      currentRow.push(currentValue);
      rows.push(currentRow);
      currentRow = [];
      currentValue = "";
      lastCharWasLineBreak = true;
    } else {
      currentValue += char;
      lastCharWasLineBreak = false;
    }
  }

  if (!lastCharWasLineBreak || currentRow.length > 0 || currentValue) {
    currentRow.push(currentValue);
    rows.push(currentRow);
  }

  return rows;
};

const FORMULA_PREFIX_PATTERN = /^[\t\r\n ]*[=+\-@]/;

/**
 * Keep text cells from being interpreted as formulas when a CSV is opened in a
 * spreadsheet application. Numeric JavaScript values remain numeric text; only
 * user-provided strings receive the leading apostrophe.
 */
export const neutralizeSpreadsheetFormula = (value) => {
  if (typeof value !== "string" || !FORMULA_PREFIX_PATTERN.test(value)) {
    return value;
  }
  return `'${value}`;
};

export const serializeCSVValue = (value) => {
  if (value === undefined || value === null) return "";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  }
  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime())
      ? date.toISOString()
      : "";
  }
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        item && typeof item === "object" ? JSON.stringify(item) : String(item ?? ""),
      )
      .join("; ");
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch (_error) {
      return "";
    }
  }
  return value;
};

export const escapeCSVCell = (value) => {
  const serialized = serializeCSVValue(value);
  const safeValue = neutralizeSpreadsheetFormula(serialized);
  return `"${String(safeValue ?? "").replace(/"/g, '""')}"`;
};

/** Build an Excel-friendly UTF-8 CSV with deterministic CRLF line endings. */
export const buildCSVContent = (
  headers = [],
  rows = [],
  { includeBom = true } = {},
) => {
  const lines = [headers, ...rows].map((row) =>
    (Array.isArray(row) ? row : []).map(escapeCSVCell).join(","),
  );
  return `${includeBom ? "\ufeff" : ""}${lines.join("\r\n")}`;
};

export const downloadTextFile = (
  content,
  filename,
  mimeType = "text/plain;charset=utf-8;",
) => {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.visibility = "hidden";
  document.body.appendChild(link);

  try {
    link.click();
  } finally {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
};

export const downloadCSVFile = (filename, headers = [], rows = []) =>
  downloadTextFile(
    buildCSVContent(headers, rows),
    filename,
    "text/csv;charset=utf-8;",
  );
