const NICKNAME_MAP = {
  bob: 'robert',
  bobby: 'robert',
  rob: 'robert',
  robbie: 'robert',
  bill: 'william',
  billy: 'william',
  will: 'william',
  willie: 'william',
  jim: 'james',
  jimmy: 'james',
  jamie: 'james',
  mike: 'michael',
  mickey: 'michael',
  mick: 'michael',
  dave: 'david',
  davey: 'david',
  steve: 'steven',
  stevie: 'steven',
  chris: 'christopher',
  matt: 'matthew',
  dan: 'daniel',
  danny: 'daniel',
  tom: 'thomas',
  tommy: 'thomas',
  joe: 'joseph',
  joey: 'joseph',
  tony: 'anthony',
  liz: 'elizabeth',
  beth: 'elizabeth',
  betty: 'elizabeth',
  sue: 'susan',
  susie: 'susan',
  katie: 'katherine',
  kate: 'katherine',
  kathy: 'katherine',
  patty: 'patricia',
  pat: 'patricia',
  trish: 'patricia',
  nick: 'nicholas',
  andy: 'andrew',
  alex: 'alexander'
};

const normalizeToken = (value) =>
  (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const normalizeFirstName = (value) => normalizeToken(value).split(' ')[0] || '';

const normalizeLastName = (value) =>
  normalizeToken(value)
    .split(' ')
    .filter(Boolean)
    .join(' ')
    .trim();

export const normalizeBaylorId = (value) => (value || '').toString().replace(/\D/g, '');

export const makeNameKey = (firstName, lastName) => {
  const first = normalizeFirstName(firstName);
  const last = normalizeLastName(lastName);
  return [first, last].filter(Boolean).join(' ').trim();
};

const canonicalizeFirstName = (value) => {
  const normalized = normalizeFirstName(value);
  return NICKNAME_MAP[normalized] || normalized;
};

const levenshteinDistance = (a, b) => {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
};

const similarityScore = (a, b) => {
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (!maxLen) return 0;
  return 1 - levenshteinDistance(a, b) / maxLen;
};

const partSimilarity = (a, b) => {
  if (!a || !b) return 0;
  const normalizedA = normalizeToken(a);
  const normalizedB = normalizeToken(b);
  if (!normalizedA || !normalizedB) return 0;
  if (normalizedA === normalizedB) return 1;

  const canonicalA = canonicalizeFirstName(normalizedA);
  const canonicalB = canonicalizeFirstName(normalizedB);
  if (canonicalA && canonicalA === canonicalB) return 0.95;

  return similarityScore(normalizedA, normalizedB);
};

export const calculateNameSimilarity = (firstA, lastA, firstB, lastB) => {
  const normalizedLastA = normalizeLastName(lastA);
  const normalizedLastB = normalizeLastName(lastB);
  if (!normalizedLastA || !normalizedLastB) return 0;

  const lastScore = partSimilarity(normalizedLastA, normalizedLastB);
  if (lastScore < 0.8) return 0;

  const firstScore = partSimilarity(firstA, firstB);
  return (lastScore * 0.6) + (firstScore * 0.4);
};

const summarizePersonCandidate = (person, score, reason) => ({
  id: person.id,
  firstName: person.firstName || '',
  lastName: person.lastName || '',
  email: person.email || '',
  baylorId: person.baylorId || '',
  jobTitle: person.jobTitle || '',
  department: person.department || '',
  score,
  reason
});

const findExactMatches = (personData, existingPeople) => {
  const matches = [];
  const baylorId = normalizeBaylorId(personData?.baylorId);
  const email = (personData?.email || '').toLowerCase().trim();
  const clssId = personData?.clssInstructorId ? String(personData.clssInstructorId).trim() : '';

  if (baylorId) {
    const baylorMatches = existingPeople.filter(p => normalizeBaylorId(p?.baylorId) === baylorId);
    if (baylorMatches.length > 0) {
      return { matches: baylorMatches, matchType: 'baylorId' };
    }
  }

  if (email) {
    const emailMatches = existingPeople.filter(p =>
      p?.email && p.email.toLowerCase().trim() === email
    );
    if (emailMatches.length > 0) {
      return { matches: emailMatches, matchType: 'email' };
    }

    const externalMatches = existingPeople.filter(p =>
      Array.isArray(p?.externalIds?.emails) &&
      p.externalIds.emails.some(e => e.toLowerCase().trim() === email)
    );
    if (externalMatches.length > 0) {
      return { matches: externalMatches, matchType: 'externalEmail' };
    }
  }

  if (clssId) {
    const clssMatches = existingPeople.filter(p =>
      p?.externalIds?.clssInstructorId &&
      String(p.externalIds.clssInstructorId).trim() === clssId
    );
    if (clssMatches.length > 0) {
      return { matches: clssMatches, matchType: 'clssId' };
    }
  }

  const firstName = normalizeFirstName(personData?.firstName);
  const lastName = normalizeLastName(personData?.lastName);
  if (firstName && lastName) {
    const nameMatches = existingPeople.filter(p =>
      normalizeFirstName(p?.firstName) === firstName &&
      normalizeLastName(p?.lastName) === lastName
    );
    if (nameMatches.length > 0) {
      return { matches: nameMatches, matchType: 'exactName' };
    }
  }

  return { matches: [], matchType: null };
};

export const findPersonMatch = (personData, existingPeople, options = {}) => {
  const { maxCandidates = 5, minScore = 0.85 } = options;
  const safeExisting = Array.isArray(existingPeople) ? existingPeople : [];
  const { matches: exactMatches, matchType } = findExactMatches(personData, safeExisting);

  if (exactMatches.length === 1) {
    return { status: 'exact', person: exactMatches[0], matchType };
  }

  if (exactMatches.length > 1) {
    return {
      status: 'ambiguous',
      matchType,
      candidates: exactMatches.map(person => summarizePersonCandidate(person, 1, `Duplicate ${matchType}`)),
      reason: `Multiple ${matchType} matches`
    };
  }

  const firstName = normalizeFirstName(personData?.firstName);
  const lastName = normalizeLastName(personData?.lastName);
  if (!firstName || !lastName) {
    return { status: 'none', candidates: [], reason: 'Missing name data' };
  }

  const candidates = safeExisting
    .filter(p => p?.firstName && p?.lastName)
    .map((person) => {
      const score = calculateNameSimilarity(firstName, lastName, person.firstName, person.lastName);
      return { person, score };
    })
    .filter(({ score }) => score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxCandidates)
    .map(({ person, score }) => summarizePersonCandidate(person, score, 'Similar name'));

  if (candidates.length > 0) {
    return { status: 'review', candidates, reason: 'No exact match; similar names found' };
  }

  return { status: 'none', candidates: [], reason: 'No match found' };
};

export const formatPersonDisplayName = (person) => {
  const first = (person?.firstName || '').trim();
  const last = (person?.lastName || '').trim();
  if (first && last) return `${first} ${last}`;
  if (last) return last;
  return first;
};

