/**
 * PAF (Personnel Action Form) Utilities
 *
 * Provides helpers for generating copy-paste friendly PAF data
 * for adjunct faculty paperwork and Microsoft Forms.
 */

// Static costing defaults for PAF forms
export const PAF_DEFAULTS = {
  costing: "410.41205.100.1000000.91055.155.0000",
  fte: "0.25",
  pay: "$5,000",
  monthlyPay: "$1,000",
};

/**
 * Generate PAF data for an adjunct faculty member
 * @param {Object} person - Person record from the directory
 * @param {Array} courses - Array of course/section records assigned to this person
 * @returns {Object} PAF data object
 */
export const generatePAFOutput = (person, courses = []) => {
  if (!person) return null;

  const fullName = [person.lastName, person.firstName]
    .filter(Boolean)
    .join(", ");

  return {
    name: fullName,
    firstName: person.firstName || "",
    lastName: person.lastName || "",
    email: person.email || "",
    baylorId: person.baylorId || "",
    ignitePersonNumber: person.ignitePersonNumber || "",
    courses: courses.map((course) => formatCourseForPAF(course)),
    ...PAF_DEFAULTS,
  };
};

/**
 * Format a single course/section for PAF display
 * @param {Object} course - Course/section record
 * @returns {Object} Formatted course data
 */
export const formatCourseForPAF = (course) => {
  if (!course) return null;

  const courseCode = course.courseCode || course.Course || "";
  const sectionNumber =
    course.sectionNumber || course.section || course.Section || "";
  const courseTitle =
    course.courseTitle || course["Course Title"] || course.Title || "";
  const credits =
    course.credits ?? course.Credits ?? course["Credits (parsed)"] ?? null;
  const maxEnrollment =
    course.maxEnrollment ??
    course.max_enrollment ??
    course["Maximum Enrollment"] ??
    course.maximumEnrollment ??
    course.MaxEnrollment ??
    null;

  const details = [];
  if (maxEnrollment !== null && maxEnrollment !== undefined && maxEnrollment !== "") {
    details.push(`${maxEnrollment} max enrollment`);
  }
  const detailsLabel = details.length > 0 ? ` (${details.join(", ")})` : "";
  const headerParts = [];
  if (courseCode) headerParts.push(courseCode);
  if (sectionNumber) headerParts.push(sectionNumber);
  const header = headerParts.join("-").trim();
  const titlePart = courseTitle ? ` ${courseTitle}` : "";
  const displayLine = `${header}${titlePart}${detailsLabel}`.trim();

  return {
    courseCode,
    sectionNumber,
    courseTitle,
    credits,
    maxEnrollment,
    displayLine,
    copyLine: displayLine,
  };
};

/**
 * Format PAF data for clipboard copy (full block)
 * @param {Object} pafData - PAF data from generatePAFOutput
 * @returns {string} Formatted text for clipboard
 */
export const formatPAFForClipboard = (pafData) => {
  if (!pafData) return "";

  const lines = [
    `Name: ${pafData.name}`,
    `Email: ${pafData.email}`,
    `Baylor ID: ${pafData.baylorId}`,
  ];

  if (pafData.ignitePersonNumber) {
    lines.push(`Ignite #: ${pafData.ignitePersonNumber}`);
  }

  lines.push("", "Courses:");
  pafData.courses.forEach((course) => {
    if (course) {
      lines.push(`  ${course.displayLine}`);
    }
  });

  lines.push(
    "",
    "--- Costing ---",
    `Costing: ${pafData.costing}`,
    `FTE: ${pafData.fte}`,
    `Pay: ${pafData.pay}`,
    `Monthly Pay: ${pafData.monthlyPay}`
  );

  return lines.join("\n");
};

/**
 * Format a single course line for clipboard copy
 * @param {Object} course - Formatted course from formatCourseForPAF
 * @returns {string} Copy-friendly course string
 */
export const formatCourseForClipboard = (course) => {
  if (!course) return "";
  return course.displayLine || "";
};

/**
 * Copy text to clipboard with fallback for older browsers
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} Whether copy was successful
 */
export const copyToClipboard = async (text) => {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // Fallback for older browsers
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const success = document.execCommand("copy");
    document.body.removeChild(textArea);
    return success;
  } catch (error) {
    console.error("Failed to copy to clipboard:", error);
    return false;
  }
};

export default {
  PAF_DEFAULTS,
  generatePAFOutput,
  formatCourseForPAF,
  formatPAFForClipboard,
  formatCourseForClipboard,
  copyToClipboard,
};
