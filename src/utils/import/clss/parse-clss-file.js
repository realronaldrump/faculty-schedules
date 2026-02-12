import { parseCSVRecords } from "../../csvUtils";
import { hashRecord } from "../../hashUtils";
import {
  buildTermLabelRegex,
  getTermConfig,
  normalizeTermLabel,
} from "../../termUtils";
import { findBestHeaderRow } from "./header-matcher";
import { getDefaultClssProfile } from "./profile-schema";
import { normalizeClssRow } from "./normalize-row";

const isCancelledStatus = (status) =>
  (status || "").toString().trim().toLowerCase().startsWith("cancel");

const isCourseTitleRow = (values = []) => {
  if (!Array.isArray(values) || values.length === 0) return false;
  const firstValue = (values[0] || "").toString().trim();
  if (!firstValue) return false;
  if (firstValue.match(/^[A-Z]{2,4}\s+\d{4}\s*-/)) {
    const nonEmptyCount = values.filter((value) => String(value || "").trim()).length;
    return nonEmptyCount < 5;
  }
  return false;
};

const isValidScheduleRow = (row = {}) => {
  const canonical = row.__clssCanonical || {};
  const hasInstructor = Boolean(canonical.instructor);
  const hasCourse = Boolean(canonical.course_code);
  const hasValidCrn = /^\d{5,6}$/.test((canonical.crn || "").trim());
  const cancelled = isCancelledStatus(canonical.status);
  return hasCourse && hasValidCrn && (hasInstructor || cancelled);
};

const isLikelyClssData = (headerMatch) => {
  if (!headerMatch) return false;
  if (headerMatch.matchedRequired >= 3) return true;
  if (headerMatch.score >= 18 && headerMatch.confidence >= 0.45) return true;
  return false;
};

export const parseClssFile = (
  csvText,
  { profile = null, strict = true } = {},
) => {
  const compiledProfile = profile || getDefaultClssProfile();
  const rows = parseCSVRecords(csvText || "");

  const emptyReport = {
    profileId: compiledProfile.id,
    profileVersion: compiledProfile.version,
    headerMap: {},
    missingRequired: [...compiledProfile.requiredFields],
    unknownColumns: [],
    confidence: 0,
    aliasHits: 0,
    headerRowIndex: -1,
  };

  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      isClss: false,
      rows: [],
      schemaReport: emptyReport,
      headerRowIndex: -1,
      profile: compiledProfile,
    };
  }

  const headerMatch = findBestHeaderRow(rows, compiledProfile);
  if (!headerMatch) {
    if (strict) {
      throw new Error(
        "Could not detect CLSS header row. Update CLSS profile aliases or verify source file.",
      );
    }
    return {
      isClss: false,
      rows: [],
      schemaReport: emptyReport,
      headerRowIndex: -1,
      profile: compiledProfile,
    };
  }

  const likelyClss = isLikelyClssData(headerMatch);
  if (!likelyClss && strict) {
    throw new Error(
      "File does not match CLSS profile expectations. Update CLSS profile aliases or verify source file.",
    );
  }
  if (!likelyClss && !strict) {
    return {
      isClss: false,
      rows: [],
      schemaReport: {
        ...emptyReport,
        headerMap: headerMatch.headerMap || {},
        missingRequired: headerMatch.missingRequired || [],
        unknownColumns: headerMatch.unknownColumns || [],
        confidence: headerMatch.confidence || 0,
        aliasHits: (headerMatch.matchedRequired || 0) + (headerMatch.matchedOptional || 0),
        headerRowIndex: headerMatch.headerRowIndex,
      },
      headerRowIndex: headerMatch.headerRowIndex,
      profile: compiledProfile,
    };
  }

  if (strict && Array.isArray(headerMatch.missingRequired) && headerMatch.missingRequired.length > 0) {
    throw new Error(
      `Missing required CLSS columns: ${headerMatch.missingRequired.join(", ")}`,
    );
  }

  const semesterPattern = buildTermLabelRegex(getTermConfig());
  const firstCell = (rows[0]?.[0] || "").replace(/"/g, "").trim();
  const detectedTerm = semesterPattern.test(firstCell)
    ? normalizeTermLabel(firstCell)
    : "";

  const parsedRows = [];
  for (let rowIndex = headerMatch.headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const rowValues = rows[rowIndex] || [];
    const isCompletelyEmpty = rowValues.every((value) => !String(value || "").trim());
    if (isCompletelyEmpty) continue;
    if (isCourseTitleRow(rowValues)) continue;

    const normalized = normalizeClssRow(rowValues, {
      fieldToIndex: headerMatch.fieldToIndex,
      detectedTerm,
      includeOriginalColumns: true,
      rawHeaders: headerMatch.rawHeaders,
    });

    normalized.__rowIndex = rowIndex + 1;
    const hashInput = { ...normalized };
    delete hashInput.__rowIndex;
    normalized.__rowHash = hashRecord(hashInput);

    if (isValidScheduleRow(normalized)) {
      parsedRows.push(normalized);
    }
  }

  const schemaReport = {
    profileId: compiledProfile.id,
    profileVersion: compiledProfile.version,
    headerMap: headerMatch.headerMap,
    missingRequired: headerMatch.missingRequired,
    unknownColumns: Array.from(new Set(headerMatch.unknownColumns || [])),
    confidence: headerMatch.confidence,
    aliasHits: (headerMatch.matchedRequired || 0) + (headerMatch.matchedOptional || 0),
    headerRowIndex: headerMatch.headerRowIndex,
  };

  return {
    isClss: true,
    rows: parsedRows,
    schemaReport,
    headerRowIndex: headerMatch.headerRowIndex,
    profile: compiledProfile,
  };
};

export default {
  parseClssFile,
};
