import {
  BULK_EXPORT_SHEET_IDS,
  getSheetDefinition,
  SHEET_IDS,
  SHEET_ORDER,
} from "./adminExportSchemas";

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

const sanitizeWorksheetName = (name) => {
  const sanitized = String(name || "Sheet")
    .replace(/[\\/:*?]+/g, " ")
    .replace(/\[/g, " ")
    .replace(/\]/g, " ")
    .trim();

  if (!sanitized) return "Sheet";
  return sanitized.slice(0, 31);
};

const notifyProgress = (onProgress, message) => {
  if (typeof onProgress === "function") {
    onProgress(message);
  }
};

const stripInvalidXmlCharacters = (value) =>
  Array.from(String(value ?? ""))
    .filter((character) => {
      const codePoint = character.codePointAt(0);
      return (
        codePoint === 0x9 ||
        codePoint === 0xa ||
        codePoint === 0xd ||
        (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
        (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
        (codePoint >= 0x10000 && codePoint <= 0x10ffff)
      );
    })
    .join("");

const escapeXml = (value) =>
  stripInvalidXmlCharacters(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const buildCellXml = ({ rowIndex, columnIndex, value, styleId }) => {
  const ref = `${toColumnLetter(columnIndex)}${rowIndex}`;
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${ref}" s="${styleId}"><v>${value}</v></c>`;
  }
  if (typeof value === "boolean") {
    return `<c r="${ref}" s="${styleId}" t="b"><v>${value ? 1 : 0}</v></c>`;
  }

  const text = escapeXml(value);
  return `<c r="${ref}" s="${styleId}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
};

const buildWorksheetXml = (sheet) => {
  const columns = sheet.columns || [];
  const rows = sheet.rows || [];
  const autoFilter = buildAutoFilterRange(columns.length);
  const columnXml = columns
    .map((columnDef, index) => {
      const columnNumber = index + 1;
      const width = Number(columnDef.width || 20);
      return `<col min="${columnNumber}" max="${columnNumber}" width="${width}" customWidth="1"/>`;
    })
    .join("");

  const headerCells = columns
    .map((columnDef, index) =>
      buildCellXml({
        rowIndex: 1,
        columnIndex: index + 1,
        value: columnDef.header,
        styleId: 1,
      }),
    )
    .join("");

  const bodyRows = rows
    .map((row, rowIndex) => {
      const normalizedRow = normalizeRowForColumns(row, columns);
      const excelRowIndex = rowIndex + 2;
      const cells = columns
        .map((columnDef, columnIndex) =>
          buildCellXml({
            rowIndex: excelRowIndex,
            columnIndex: columnIndex + 1,
            value: normalizedRow[columnDef.key],
            styleId: 2,
          }),
        )
        .join("");
      return `<row r="${excelRowIndex}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>
  <cols>${columnXml}</cols>
  <sheetData>
    <row r="1" ht="24" customHeight="1">${headerCells}</row>
    ${bodyRows}
  </sheetData>
  ${autoFilter ? `<autoFilter ref="${autoFilter}"/>` : ""}
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`;
};

const buildWorkbookXml = (workbookSheets) => {
  const sheetsXml = workbookSheets
    .map(
      (sheet, index) =>
        `<sheet name="${escapeXml(sanitizeWorksheetName(sheet.name))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews><workbookView xWindow="0" yWindow="0" windowWidth="22000" windowHeight="12000"/></bookViews>
  <sheets>${sheetsXml}</sheets>
</workbook>`;
};

const buildWorkbookRelsXml = (sheetCount) => {
  const sheetRels = Array.from({ length: sheetCount }, (_, index) =>
    `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
  ).join("");
  const stylesRelId = sheetCount + 1;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheetRels}
  <Relationship Id="rId${stylesRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
};

const buildContentTypesXml = (sheetCount) => {
  const worksheetOverrides = Array.from({ length: sheetCount }, (_, index) =>
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  ${worksheetOverrides}
</Types>`;
};

const buildRootRelsXml = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

const buildStylesXml = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF154734"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFE5E7EB"/></left>
      <right style="thin"><color rgb="FFE5E7EB"/></right>
      <top style="thin"><color rgb="FFE5E7EB"/></top>
      <bottom style="thin"><color rgb="FFE5E7EB"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top" wrapText="1"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const buildCorePropsXml = () => {
  const timestamp = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>HSD Dashboard</dc:creator>
  <cp:lastModifiedBy>HSD Dashboard</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:modified>
</cp:coreProperties>`;
};

const buildAppPropsXml = (workbookSheets) => {
  const sheetNames = workbookSheets
    .map((sheet) => `<vt:lpstr>${escapeXml(sanitizeWorksheetName(sheet.name))}</vt:lpstr>`)
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>HSD Dashboard</Application>
  <Company>Baylor University</Company>
  <HeadingPairs>
    <vt:vector size="2" baseType="variant">
      <vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant>
      <vt:variant><vt:i4>${workbookSheets.length}</vt:i4></vt:variant>
    </vt:vector>
  </HeadingPairs>
  <TitlesOfParts>
    <vt:vector size="${workbookSheets.length}" baseType="lpstr">
      ${sheetNames}
    </vt:vector>
  </TitlesOfParts>
</Properties>`;
};

export const createWorkbookBuffer = async ({
  workbookSheets = [],
  onProgress,
} = {}) => {
  notifyProgress(onProgress, "Loading workbook tools...");
  const zipModule = await import("jszip");
  const JSZip = zipModule.default || zipModule;
  const workbookZip = new JSZip();

  notifyProgress(onProgress, "Building workbook...");
  workbookZip.file("[Content_Types].xml", buildContentTypesXml(workbookSheets.length));
  workbookZip.file("_rels/.rels", buildRootRelsXml());
  workbookZip.file("docProps/core.xml", buildCorePropsXml());
  workbookZip.file("docProps/app.xml", buildAppPropsXml(workbookSheets));
  workbookZip.file("xl/workbook.xml", buildWorkbookXml(workbookSheets));
  workbookZip.file("xl/_rels/workbook.xml.rels", buildWorkbookRelsXml(workbookSheets.length));
  workbookZip.file("xl/styles.xml", buildStylesXml());

  workbookSheets.forEach((sheet, index) => {
    notifyProgress(
      onProgress,
      `Preparing ${sheet.name || `sheet ${index + 1}`}...`,
    );
    workbookZip.file(`xl/worksheets/sheet${index + 1}.xml`, buildWorksheetXml(sheet));
  });

  notifyProgress(onProgress, "Writing workbook file...");
  return workbookZip.generateAsync({
    type: "arraybuffer",
    compression: "DEFLATE",
  });
};

export const downloadAdminWorkbook = async ({
  fileName,
  sheetIds,
  rowsBySheetId,
  summaryRows,
  onProgress,
} = {}) => {
  notifyProgress(onProgress, "Preparing workbook data...");
  const workbookSheets = buildWorkbookDefinition({
    sheetIds,
    rowsBySheetId,
    summaryRows,
  });

  const buffer = await createWorkbookBuffer({ workbookSheets, onProgress });
  notifyProgress(onProgress, "Starting download...");
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
