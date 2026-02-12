import {
  BULK_EXPORT_SHEET_IDS,
  getSheetDefinition,
  SHEET_IDS,
  SHEET_ORDER,
} from "./adminExportSchemas";

const HEADER_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF154734" },
};

const HEADER_FONT = {
  bold: true,
  color: { argb: "FFFFFFFF" },
};

const HEADER_ALIGNMENT = {
  vertical: "middle",
  horizontal: "center",
  wrapText: true,
};

const HEADER_BORDER = {
  top: { style: "thin", color: { argb: "FF0F3527" } },
  left: { style: "thin", color: { argb: "FF0F3527" } },
  bottom: { style: "thin", color: { argb: "FF0F3527" } },
  right: { style: "thin", color: { argb: "FF0F3527" } },
};

export const toColumnLetter = (columnNumber) => {
  let temp = columnNumber;
  let letter = "";

  while (temp > 0) {
    const mod = (temp - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    temp = Math.floor((temp - mod) / 26);
  }

  return letter;
};

export const buildAutoFilterRange = (columnCount = 0) => {
  if (!columnCount || columnCount < 1) return null;
  return `A1:${toColumnLetter(columnCount)}1`;
};

export const getWorkbookSheetOrder = (sheetIds = []) => {
  const requested = Array.isArray(sheetIds) && sheetIds.length > 0 ? sheetIds : BULK_EXPORT_SHEET_IDS;
  const seen = new Set();
  const orderedWithoutSummary = SHEET_ORDER.filter(
    (sheetId) =>
      sheetId !== SHEET_IDS.summary &&
      requested.includes(sheetId) &&
      !seen.has(sheetId) &&
      seen.add(sheetId),
  );

  return [SHEET_IDS.summary, ...orderedWithoutSummary];
};

export const buildWorkbookDefinition = ({
  sheetIds,
  rowsBySheetId = {},
  summaryRows = [],
} = {}) => {
  const orderedSheetIds = getWorkbookSheetOrder(sheetIds);
  const workbookSheets = [];

  orderedSheetIds.forEach((sheetId) => {
    const definition = getSheetDefinition(sheetId);
    if (!definition) return;

    const rows = sheetId === SHEET_IDS.summary ? summaryRows : rowsBySheetId[sheetId] || [];
    workbookSheets.push({
      ...definition,
      rows,
    });
  });

  return workbookSheets;
};

const normalizeRowForColumns = (row = {}, columns = []) => {
  const normalized = {};
  columns.forEach((columnDef) => {
    const value = row[columnDef.key];
    normalized[columnDef.key] = value === undefined || value === null ? "" : value;
  });
  return normalized;
};

const applyWorksheetStyling = (worksheet, columnCount) => {
  worksheet.views = [{ state: "frozen", ySplit: 1 }];

  const autoFilter = buildAutoFilterRange(columnCount);
  if (autoFilter) {
    worksheet.autoFilter = autoFilter;
  }

  const headerRow = worksheet.getRow(1);
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = HEADER_ALIGNMENT;
    cell.border = HEADER_BORDER;
  });

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    row.eachCell((cell) => {
      cell.alignment = {
        vertical: "top",
        horizontal: "left",
        wrapText: true,
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE5E7EB" } },
        left: { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
        right: { style: "thin", color: { argb: "FFE5E7EB" } },
      };
    });
  });
};

const sanitizeWorksheetName = (name) => {
  const sanitized = String(name || "Sheet")
    .replace(/[\\/:*?]+/g, " ")
    .replace(/\[/g, " ")
    .replace(/\]/g, " ")
    .trim();

  if (!sanitized) return "Sheet";
  return sanitized.slice(0, 31);
};

export const createWorkbookBuffer = async ({ workbookSheets = [] } = {}) => {
  const excelModule = await import("exceljs");
  const ExcelJS = excelModule.default || excelModule;
  const workbook = new ExcelJS.Workbook();

  workbook.creator = "HSD Faculty Dashboard";
  workbook.company = "Baylor University";
  workbook.created = new Date();
  workbook.modified = new Date();

  workbookSheets.forEach((sheet) => {
    const worksheet = workbook.addWorksheet(sanitizeWorksheetName(sheet.name));
    worksheet.columns = (sheet.columns || []).map((columnDef) => ({
      header: columnDef.header,
      key: columnDef.key,
      width: columnDef.width || 20,
    }));

    (sheet.rows || []).forEach((row) => {
      worksheet.addRow(normalizeRowForColumns(row, sheet.columns || []));
    });

    applyWorksheetStyling(worksheet, (sheet.columns || []).length);
  });

  return workbook.xlsx.writeBuffer();
};

export const downloadAdminWorkbook = async ({
  fileName,
  sheetIds,
  rowsBySheetId,
  summaryRows,
} = {}) => {
  const workbookSheets = buildWorkbookDefinition({
    sheetIds,
    rowsBySheetId,
    summaryRows,
  });

  const buffer = await createWorkbookBuffer({ workbookSheets });
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = fileName || "export.xlsx";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export default {
  buildAutoFilterRange,
  buildWorkbookDefinition,
  createWorkbookBuffer,
  downloadAdminWorkbook,
  getWorkbookSheetOrder,
  toColumnLetter,
};
