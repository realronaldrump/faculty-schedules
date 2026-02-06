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

export default {
  parseCSVRecords,
};

