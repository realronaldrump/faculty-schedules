/**
 * Utility functions for handling course-related data.
 */

/**
 * Derive credit hours from a catalog number using Baylor conventions.
 * Baylor encodes the credit hours as the second digit in the four-character catalog number.
 * Courses that contain alpha characters (e.g., "3V90") are variable-credit offerings; for these,
 * we fall back to any provided credit-hour value or default to 0.
 *
 * @param {string|number} catalogNumber Raw catalog number, e.g. "1300" or "3V90".
 * @param {string|number|null} fallbackCredits Optional fallback credit value (string or number).
 * @returns {number|null} Parsed credit hours, or null if unavailable.
 */
export const deriveCreditsFromCatalogNumber = (catalogNumber, fallbackCredits = null) => {
  const parseFallback = (value) => {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const fallback = parseFallback(fallbackCredits);

  if (catalogNumber === undefined || catalogNumber === null) {
    return fallback;
  }

  const raw = String(catalogNumber).trim().toUpperCase();
  if (!raw) {
    return fallback;
  }

  const sanitized = raw.replace(/\s+/g, '');
  const hasAlphaCharacters = /[^0-9]/.test(sanitized);

  if (!hasAlphaCharacters && sanitized.length >= 2) {
    const creditDigit = parseInt(sanitized[1], 10);
    if (!Number.isNaN(creditDigit)) {
      return creditDigit;
    }
  }

  if (!hasAlphaCharacters) {
    const digits = sanitized.match(/\d/g);
    if (digits && digits.length >= 2) {
      const creditDigit = parseInt(digits[1], 10);
      if (!Number.isNaN(creditDigit)) {
        return creditDigit;
      }
    }
  }

  if (fallback !== null) {
    return fallback;
  }

  // Variable-credit courses default to 0 when no explicit value is provided.
  return 0;
};

/**
 * Parses a Baylor course code into its constituent parts.
 * The format is expected to be a program abbreviation followed by a four-character catalog number.
 * Example: "NUTR 3331" becomes { program: "NUTR", level: 3, credits: 3, identifier: "31" }
 *
 * @param {string} courseCode The course code string (e.g., "NUTR 3331" or "NUTR3331").
 * @returns {object} An object containing the parsed components of the course code.
 *                   Returns a default structure with an error for invalid formats.
 */
export const parseCourseCode = (courseCode) => {
  if (!courseCode || typeof courseCode !== 'string') {
    return { 
      program: 'N/A', 
      level: 0, 
      credits: 0, 
      identifier: '00', 
      original: courseCode, 
      catalogNumber: '',
      isVariableCredit: false,
      error: 'Invalid input' 
    };
  }

  const trimmedCode = courseCode.trim();
  // Matches 2-4 uppercase letters for the program, optional whitespace, and a 4-digit number.
  const match = trimmedCode.match(/^([A-Z]{2,4})\s?([0-9A-Z]{4})$/);

  if (!match) {
    const programMatch = trimmedCode.match(/^[A-Z]{2,4}/);
    return {
      program: programMatch ? programMatch[0] : 'N/A',
      level: 0,
      credits: 0,
      identifier: '0000',
      original: courseCode,
      catalogNumber: '',
      isVariableCredit: false,
      error: 'Invalid course code format'
    };
  }

  const [, program, catalogNumber] = match;
  const normalizedCatalog = catalogNumber.toUpperCase();
  const levelDigit = parseInt(normalizedCatalog[0], 10);
  const credits = deriveCreditsFromCatalogNumber(normalizedCatalog);
  const isVariableCredit = /[^0-9]/.test(normalizedCatalog);

  return {
    program, // e.g., "NUTR"
    level: Number.isNaN(levelDigit) ? 0 : levelDigit,
    credits,
    identifier: normalizedCatalog.substring(2),
    catalogNumber: normalizedCatalog,
    isVariableCredit,
    original: courseCode,
  };
};
