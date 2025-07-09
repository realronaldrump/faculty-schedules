/**
 * Utility functions for handling course-related data.
 */

/**
 * Parses a Baylor course code into its constituent parts.
 * The format is expected to be a program abbreviation followed by a four-digit number.
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
      error: 'Invalid input' 
    };
  }

  const trimmedCode = courseCode.trim();
  // Matches 2-4 uppercase letters for the program, optional whitespace, and a 4-digit number.
  const match = trimmedCode.match(/^([A-Z]{2,4})\s?(\d{4})$/);

  if (!match) {
    const programMatch = trimmedCode.match(/^[A-Z]{2,4}/);
    return {
      program: programMatch ? programMatch[0] : 'N/A',
      level: 0,
      credits: 0,
      identifier: '0000',
      original: courseCode,
      error: 'Invalid course code format'
    };
  }

  const [, program, digits] = match;

  return {
    program, // e.g., "NUTR"
    level: parseInt(digits[0], 10), // e.g., 3
    credits: parseInt(digits[1], 10), // e.g., 3
    identifier: digits.substring(2), // e.g., "31"
    original: courseCode,
  };
}; 