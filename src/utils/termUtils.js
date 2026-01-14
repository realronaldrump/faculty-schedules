export const DEFAULT_TERM_CONFIG = {
  version: 1,
  codeToSeason: {
    '10': 'Winter',
    '30': 'Fall',
    '40': 'Spring',
    '50': 'Summer'
  },
  // Order is least to most recent within the same year.
  seasonOrder: ['Winter', 'Spring', 'Summer', 'Fall'],
  twoDigitYearBase: 2000
};

let cachedConfig = {
  ...DEFAULT_TERM_CONFIG,
  codeToSeason: { ...DEFAULT_TERM_CONFIG.codeToSeason },
  seasonOrder: [...DEFAULT_TERM_CONFIG.seasonOrder]
};
let configLoaded = false;

const toTitleCase = (value) => {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
};

const normalizeSeasonList = (value) => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => (item || '').trim()).filter(Boolean)));
};

const pad2 = (value) => String(value).padStart(2, '0');

const formatDateValue = (date) => (
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
);

export const normalizeTermDateValue = (value) => {
  if (!value) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';
    const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return formatDateValue(parsed);
    }
    return '';
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : formatDateValue(value);
  }
  if (typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '' : formatDateValue(parsed);
  }
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    return normalizeTermDateValue(value.toDate());
  }
  return '';
};

export const parseTermDate = (value) => {
  const normalized = normalizeTermDateValue(value);
  if (!normalized) return null;
  const parsed = new Date(`${normalized}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const normalizeTermConfig = (raw = {}) => {
  const codeToSeason =
    raw && typeof raw.codeToSeason === 'object' && !Array.isArray(raw.codeToSeason)
      ? Object.fromEntries(
          Object.entries(raw.codeToSeason).map(([key, val]) => [
            String(key).trim(),
            (val || '').trim()
          ])
        )
      : { ...DEFAULT_TERM_CONFIG.codeToSeason };

  const seasonOrder = normalizeSeasonList(raw.seasonOrder);
  const twoDigitYearBase = Number.isInteger(raw.twoDigitYearBase)
    ? raw.twoDigitYearBase
    : DEFAULT_TERM_CONFIG.twoDigitYearBase;

  return {
    version: raw.version || DEFAULT_TERM_CONFIG.version,
    codeToSeason,
    seasonOrder: seasonOrder.length > 0 ? seasonOrder : [...DEFAULT_TERM_CONFIG.seasonOrder],
    twoDigitYearBase
  };
};

export const setTermConfig = (raw) => {
  cachedConfig = normalizeTermConfig(raw);
  configLoaded = true;
  return cachedConfig;
};

export const getTermConfig = () => cachedConfig;

export const loadTermConfig = async ({ force = false } = {}) => {
  if (configLoaded && !force) return cachedConfig;
  try {
    const firestore = await import('firebase/firestore');
    const { db } = await import('../firebase');
    const snap = await firestore.getDoc(firestore.doc(db, 'settings', 'termConfig'));
    if (snap.exists()) {
      return setTermConfig(snap.data());
    }
  } catch (error) {
    console.warn('Term config load failed:', error);
  }
  configLoaded = true;
  return cachedConfig;
};

export const getSeasonNames = (termConfig = getTermConfig()) => {
  const names = new Set();
  normalizeSeasonList(termConfig.seasonOrder).forEach((season) => names.add(season));
  Object.values(termConfig.codeToSeason || {}).forEach((season) => {
    if (season) names.add(season);
  });
  return Array.from(names);
};

export const normalizeSeasonLabel = (season, termConfig = getTermConfig()) => {
  if (!season) return '';
  const cleaned = season.trim();
  if (!cleaned) return '';

  const canonical = getSeasonNames(termConfig).find(
    (name) => name.toLowerCase() === cleaned.toLowerCase()
  );
  return canonical || toTitleCase(cleaned);
};

export const parseTermLabel = (term, termConfig = getTermConfig()) => {
  if (!term) return null;
  const cleaned = term.trim();
  if (!cleaned) return null;

  const match = cleaned.match(/^([A-Za-z]+)[\s-]*(\d{2}|\d{4})$/);
  if (!match) return null;

  const yearToken = match[2];
  const year =
    yearToken.length === 2
      ? termConfig.twoDigitYearBase + parseInt(yearToken, 10)
      : parseInt(yearToken, 10);

  if (Number.isNaN(year)) return null;

  return {
    season: normalizeSeasonLabel(match[1], termConfig),
    year
  };
};

export const formatTermLabel = (term, termConfig = getTermConfig()) => {
  const parsed = parseTermLabel(term, termConfig);
  if (!parsed) return '';
  return `${parsed.season} ${parsed.year}`;
};

export const normalizeTermLabel = (term, termConfig = getTermConfig()) => {
  const cleaned = (term || '').trim();
  if (!cleaned) return '';
  const formatted = formatTermLabel(cleaned, termConfig);
  if (formatted) return formatted;
  const fromCode = termLabelFromCode(cleaned, termConfig);
  return fromCode || cleaned;
};

export const parseTermCode = (termCode, termConfig = getTermConfig()) => {
  if (!termCode || typeof termCode !== 'string') return null;
  const cleaned = termCode.trim();
  if (!/^\d{6}$/.test(cleaned)) return null;

  const year = parseInt(cleaned.slice(0, 4), 10);
  const code = cleaned.slice(4);
  if (Number.isNaN(year)) return null;

  const season = termConfig.codeToSeason?.[code];
  if (!season) return null;

  return {
    season: normalizeSeasonLabel(season, termConfig),
    year
  };
};

export const formatTermFromCode = (termCode, termConfig = getTermConfig()) => {
  const parsed = parseTermCode(termCode, termConfig);
  if (!parsed) return '';
  return `${parsed.season} ${parsed.year}`;
};

export const termLabelFromCode = (termCode, termConfig = getTermConfig()) => {
  return formatTermFromCode(termCode, termConfig);
};

export const termCodeFromLabel = (value, termConfig = getTermConfig()) => {
  if (!value) return '';
  const cleaned = String(value).trim();
  if (!cleaned) return '';
  if (/^\d{6}$/.test(cleaned)) return cleaned;

  const parsed = parseTermLabel(cleaned, termConfig);
  if (!parsed) return '';

  const entries = Object.entries(termConfig.codeToSeason || {});
  const match = entries.find(
    ([, label]) => label && label.toLowerCase() === parsed.season.toLowerCase()
  );
  if (!match) return '';

  return `${parsed.year}${match[0]}`;
};

export const getSeasonIndex = (season, termConfig = getTermConfig()) => {
  if (!season) return null;
  const order = normalizeSeasonList(termConfig.seasonOrder);
  if (order.length === 0) return null;
  const index = order.findIndex((entry) => entry.toLowerCase() === season.toLowerCase());
  return index === -1 ? null : index;
};

export const compareTermLabels = (a, b, termConfig = getTermConfig()) => {
  const parsedA = parseTermLabel(a || '', termConfig);
  const parsedB = parseTermLabel(b || '', termConfig);

  if (!parsedA || !parsedB) {
    return (b || '').localeCompare(a || '');
  }

  if (parsedA.year !== parsedB.year) {
    return parsedB.year - parsedA.year;
  }

  const indexA = getSeasonIndex(parsedA.season, termConfig);
  const indexB = getSeasonIndex(parsedB.season, termConfig);
  if (indexA !== null && indexB !== null && indexA !== indexB) {
    return indexB - indexA;
  }

  return parsedB.season.localeCompare(parsedA.season);
};

export const sortTerms = (terms = [], termConfig = getTermConfig()) => {
  return [...terms].filter(Boolean).sort((a, b) => compareTermLabels(a, b, termConfig));
};

export const buildTermLabelRegex = (termConfig = getTermConfig()) => {
  const seasons = getSeasonNames(termConfig);
  if (seasons.length === 0) {
    return /^([A-Za-z]+)\s+\d{4}$/i;
  }

  const escaped = seasons.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^(${escaped.join('|')})\\s+\\d{4}$`, 'i');
};

export const isTermLabel = (term, termConfig = getTermConfig()) => {
  if (!term) return false;
  const pattern = buildTermLabelRegex(termConfig);
  return pattern.test(term.trim());
};

export const deriveTermInfo = ({ term, termCode } = {}, termConfig = getTermConfig()) => {
  const normalizedTerm = normalizeTermLabel(term || '', termConfig);
  let parsed = parseTermLabel(normalizedTerm, termConfig);

  if (!parsed && termCode) {
    parsed = parseTermCode(termCode, termConfig);
  }

  const season = parsed?.season || '';
  const year = parsed?.year || null;
  const seasonIndex = season ? getSeasonIndex(season, termConfig) : null;
  const sortKey =
    year !== null && seasonIndex !== null ? year * 100 + seasonIndex : null;

  return {
    term: normalizedTerm || (term || '').trim(),
    termCode: termCode || '',
    season,
    year,
    sortKey
  };
};

export const normalizeTermRecord = (record = {}, termConfig = getTermConfig()) => {
  const term = normalizeTermLabel(record.term || '', termConfig);
  const termCode = termCodeFromLabel(record.termCode || term, termConfig);
  const termLabel = term || termLabelFromCode(termCode, termConfig) || (record.term || '');
  const parsed = parseTermLabel(termLabel, termConfig);
  const season = parsed?.season || '';
  const year = parsed?.year || null;
  const seasonIndex = season ? getSeasonIndex(season, termConfig) : null;
  const derivedSortKey =
    year !== null && seasonIndex !== null ? year * 100 + seasonIndex : null;
  const normalizedStartDate = normalizeTermDateValue(record.startDate);
  const normalizedEndDate = normalizeTermDateValue(record.endDate);

  return {
    ...record,
    term: termLabel,
    termCode: termCode || record.termCode || '',
    season,
    year,
    startDate: normalizedStartDate || '',
    endDate: normalizedEndDate || '',
    sortKey: record.sortKey ?? derivedSortKey
  };
};

export const sortTermsByRecency = (terms = [], termConfig = getTermConfig()) => {
  return [...terms].sort((a, b) => {
    const aDate = normalizeTermDateValue(a?.startDate || a?.endDate);
    const bDate = normalizeTermDateValue(b?.startDate || b?.endDate);
    if (aDate && bDate) {
      const aDateKey = Number(aDate.replace(/-/g, ''));
      const bDateKey = Number(bDate.replace(/-/g, ''));
      if (aDateKey !== bDateKey) {
        return bDateKey - aDateKey;
      }
    }
    const aKey = a?.sortKey ?? deriveTermInfo({ term: a?.term, termCode: a?.termCode }, termConfig).sortKey;
    const bKey = b?.sortKey ?? deriveTermInfo({ term: b?.term, termCode: b?.termCode }, termConfig).sortKey;
    if (aKey !== null && bKey !== null && aKey !== bKey) {
      return bKey - aKey;
    }
    return compareTermLabels(a?.term || '', b?.term || '', termConfig);
  });
};
