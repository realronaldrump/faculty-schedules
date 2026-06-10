import { normalizeHeaderToken } from "./profile-schema";

const findBestAliasMatch = (
  normalizedHeader,
  normalizedAliases = [],
  { allowPartial = true } = {},
) => {
  if (!normalizedHeader) return { matched: false, isExact: false };
  if (normalizedAliases.includes(normalizedHeader)) {
    return { matched: true, isExact: true };
  }

  // Required fields must be exact alias matches. Partial matching can
  // incorrectly bind required fields such as "term" -> "term code".
  if (!allowPartial) {
    return { matched: false, isExact: false };
  }

  const matchedAlias = normalizedAliases.find((alias) => {
    if (!alias) return false;
    return normalizedHeader.includes(alias) || alias.includes(normalizedHeader);
  });

  return { matched: Boolean(matchedAlias), isExact: false };
};

const buildHeaderMatchForRow = (row = [], profile) => {
  const normalizedHeaders = row.map((header) => normalizeHeaderToken(header));
  const usedIndexes = new Set();
  const fieldToIndex = {};
  let matchedRequired = 0;
  let matchedOptional = 0;
  let exactMatches = 0;

  const rankCandidates = (field) => {
    const ranked = [];
    normalizedHeaders.forEach((normalizedHeader, index) => {
      if (!normalizedHeader || usedIndexes.has(index)) return;
      const match = findBestAliasMatch(
        normalizedHeader,
        field.normalizedAliases,
        { allowPartial: !field.required },
      );
      if (!match.matched) return;
      ranked.push({
        index,
        weight: match.isExact ? 2 : 1,
      });
    });

    ranked.sort((a, b) => b.weight - a.weight);
    return ranked;
  };

  profile.fields.forEach((field) => {
    const candidates = rankCandidates(field);
    if (candidates.length === 0) return;

    const winner = candidates[0];
    fieldToIndex[field.fieldId] = winner.index;
    usedIndexes.add(winner.index);
    if (winner.weight === 2) exactMatches += 1;

    if (field.required) matchedRequired += 1;
    else matchedOptional += 1;
  });

  const nonEmptyHeaderIndexes = normalizedHeaders
    .map((value, index) => ({ value, index }))
    .filter((entry) => Boolean(entry.value));

  const unknownColumns = nonEmptyHeaderIndexes
    .filter((entry) => !usedIndexes.has(entry.index))
    .map((entry) => String(row[entry.index] || "").trim())
    .filter(Boolean);

  const requiredTotal = profile.requiredFields.length;
  const optionalTotal = Math.max(profile.fields.length - requiredTotal, 1);
  const coverageRequired = requiredTotal > 0 ? matchedRequired / requiredTotal : 1;
  const coverageOptional = matchedOptional / optionalTotal;
  const confidence = Number(
    Math.min(1, coverageRequired * 0.8 + coverageOptional * 0.2).toFixed(3),
  );
  const score = matchedRequired * 10 + matchedOptional * 2 + exactMatches;

  return {
    fieldToIndex,
    matchedRequired,
    matchedOptional,
    requiredTotal,
    optionalTotal,
    exactMatches,
    unknownColumns,
    confidence,
    score,
  };
};

export const findBestHeaderRow = (rows = [], profile) => {
  const candidates = [];
  rows.forEach((row, index) => {
    if (!Array.isArray(row)) return;
    const match = buildHeaderMatchForRow(row, profile);
    if (match.score <= 0) return;
    candidates.push({
      headerRowIndex: index,
      rawHeaders: row,
      ...match,
    });
  });

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.matchedRequired !== a.matchedRequired)
      return b.matchedRequired - a.matchedRequired;
    return a.headerRowIndex - b.headerRowIndex;
  });

  const best = candidates[0];
  const headerMap = Object.fromEntries(
    Object.entries(best.fieldToIndex).map(([fieldId, index]) => [
      fieldId,
      String(best.rawHeaders[index] || "").trim(),
    ]),
  );

  const missingRequired = profile.requiredFields.filter(
    (fieldId) => best.fieldToIndex[fieldId] === undefined,
  );

  return {
    ...best,
    headerMap,
    missingRequired,
  };
};
