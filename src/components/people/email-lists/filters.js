import { normalizeTermLabel, termCodeFromLabel } from "../../../utils/termUtils";

export const createDefaultDirectoryFilters = () => ({
  programs: [],
  jobTitles: [],
  buildings: [],
  roleFilter: "all",
  adjunct: "exclude",
  tenured: "all",
  upd: "all",
  isRemote: "all",
});

export const createDefaultStudentFilters = () => ({
  buildings: [],
  jobTitles: [],
});

export const filterSchedulesBySelectedTerm = (
  scheduleData = [],
  selectedSemester = "",
) => {
  if (!Array.isArray(scheduleData)) return [];
  if (!selectedSemester) return scheduleData;

  const normalizedSelected =
    normalizeTermLabel(selectedSemester) || String(selectedSemester).trim();
  const selectedCode =
    termCodeFromLabel(normalizedSelected) || termCodeFromLabel(selectedSemester);

  return scheduleData.filter((schedule) => {
    const scheduleTerm =
      schedule.term ||
      schedule.Term ||
      schedule.semester ||
      schedule.Semester ||
      "";
    const normalizedScheduleTerm =
      normalizeTermLabel(scheduleTerm) || String(scheduleTerm).trim();
    if (normalizedScheduleTerm && normalizedScheduleTerm === normalizedSelected) {
      return true;
    }

    const scheduleCode =
      schedule.termCode ||
      schedule.TermCode ||
      schedule.semesterCode ||
      schedule.SemesterCode ||
      termCodeFromLabel(scheduleTerm);
    if (selectedCode && scheduleCode && String(scheduleCode) === String(selectedCode)) {
      return true;
    }

    return false;
  });
};
