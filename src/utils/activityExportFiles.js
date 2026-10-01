import { escapeCSVCell } from "./csvUtils";

export const ACTIVITY_EXPORT_PART_BYTES = 1024 * 1024;
export const ACTIVITY_EXPORT_MAX_BYTES = 25 * 1024 * 1024;
const encoder = new TextEncoder();
export const utf8Bytes = (text) => encoder.encode(text).length;

// Split on record boundaries, measuring UTF-8 bytes rather than JS characters.
// Each CSV part has its own header and is independently usable.
export function createActivityExportWriter({
  partBytes = ACTIVITY_EXPORT_PART_BYTES,
  maxBytes = ACTIVITY_EXPORT_MAX_BYTES,
} = {}) {
  const files = [];
  let totalBytes = 0;
  const addFile = (path, content, metadata = {}) => {
    const bytes = utf8Bytes(content);
    if (totalBytes + bytes > maxBytes)
      throw new Error("This export is too large. Choose a shorter period or filter by person, then export again.");
    totalBytes += bytes;
    files.push({ path, content, bytes, ...metadata });
  };
  const addDataset = (dataset, rows, columns = null) => {
    const header = columns ? `${columns.map(escapeCSVCell).join(",")}\r\n` : "";
    const headerBytes = utf8Bytes(header);
    let lines = [header];
    let bytes = headerBytes;
    let rowCount = 0;
    let part = 0;
    const flush = () => {
      part += 1;
      const extension = columns ? "csv" : "jsonl";
      addFile(`${columns ? "tables" : "records"}/${dataset}.part-${String(part).padStart(4, "0")}.${extension}`,
        lines.join(""), { dataset, format: extension, rowCount, ...(columns ? { columns } : {}) });
      lines = [header];
      bytes = headerBytes;
      rowCount = 0;
    };
    for (const row of rows) {
      const line = columns
        ? `${columns.map((column) => escapeCSVCell(row[column])).join(",")}\r\n`
        : `${JSON.stringify(row)}\n`;
      const lineBytes = utf8Bytes(line);
      if (headerBytes + lineBytes > partBytes)
        throw new Error("An activity record is too large to export safely. Choose a shorter period or filter by feature.");
      if (bytes + lineBytes > partBytes && rowCount) flush();
      lines.push(line);
      bytes += lineBytes;
      rowCount += 1;
    }
    if (rowCount || !part) flush();
  };
  return { files, addFile, addDataset, get totalBytes() { return totalBytes; } };
}
