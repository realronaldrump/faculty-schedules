/**
 * Faculty Finder Utilities
 *
 * Shared logic for deriving active faculty lists.
 */

/**
 * Filter faculty to those teaching in the current schedule data.
 * @param {Array} facultyData
 * @param {Array} scheduleData
 * @returns {Array}
 */
export const getActiveFacultyList = (facultyData = [], scheduleData = []) => {
  const teachingFacultyNames = new Set();

  (scheduleData || []).forEach((schedule) => {
    const names = Array.isArray(schedule.instructorNames)
      ? schedule.instructorNames
      : [];
    const fallback = schedule.Instructor || schedule.instructorName || "";
    const allNames = names.length > 0 ? names : [fallback];

    allNames.forEach((name) => {
      if (name && name !== "Staff" && name !== "TBA") {
        teachingFacultyNames.add(name.toLowerCase());
      }
    });
  });

  return (facultyData || []).filter((faculty) => {
    const name = faculty?.name?.toLowerCase() || "";
    return teachingFacultyNames.has(name);
  });
};
