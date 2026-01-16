// Centralized permission helpers
// Keep it intentionally simple for maintainability.

import { useAuth } from "../contexts/AuthContext.jsx";

// Centralized permission helpers focused on page-level access.
export function usePermissions() {
  const { canAccess } = useAuth();

  const canView = (pageId) => canAccess(pageId);
  const canEdit = (pageId) => canAccess(pageId);
  const canExport = (pageId) => canAccess(pageId);
  const canImport = (pageId) => canAccess(pageId);
  const canAction = (pageId) => canAccess(pageId);
  const canDoAction = (pageId) => canAccess(pageId);
  const canEditFaculty = () => canAccess("people/people-directory");
  const canCreateFaculty = () => canAccess("people/people-directory");
  const canDeleteFaculty = () => canAccess("people/people-directory");
  const canEditStaff = () => canAccess("people/people-directory");
  const canCreateStaff = () => canAccess("people/people-directory");
  const canDeleteStaff = () => canAccess("people/people-directory");
  const canEditAdjunct = () => canAccess("people/people-directory");
  const canCreateAdjunct = () => canAccess("people/people-directory");
  const canDeleteAdjunct = () => canAccess("people/people-directory");
  const canEditStudent = () => canAccess("people/people-directory");
  const canCreateStudent = () => canAccess("people/people-directory");
  const canDeleteStudent = () => canAccess("people/people-directory");
  const canEditSchedule = () => canAccess("analytics/course-management");
  const canCreateSchedule = () => canAccess("analytics/course-management");
  const canDeleteSchedule = () => canAccess("analytics/course-management");
  const canBulkEditSchedule = () => canAccess("analytics/course-management");
  const canImportSchedule = () => canAccess("tools/import-wizard");
  const canExportSchedule = () => canAccess("scheduling/room-schedules");
  const canEditRoom = () => canAccess("administration/app-settings");
  const canCreateRoom = () => canAccess("administration/app-settings");
  const canDeleteRoom = () => canAccess("administration/app-settings");
  const canSaveRoomGrid = () => canAccess("tools/room-grid-generator");
  const canDeleteRoomGrid = () => canAccess("tools/room-grid-generator");
  const canEditRoomGrid = () => canAccess("tools/room-grid-generator");
  const canEditProgram = () => canAccess("analytics/program-management");
  const canCreateProgram = () => canAccess("analytics/program-management");
  const canDeleteProgram = () => canAccess("analytics/program-management");
  const canAssignProgramUPD = () => canAccess("analytics/program-management");
  const canRemoveProgramUPD = () => canAccess("analytics/program-management");
  const canEditCourse = () => canAccess("analytics/course-management");
  const canCreateCourse = () => canAccess("analytics/course-management");
  const canDeleteCourse = () => canAccess("analytics/course-management");
  const canEditTerm = () => canAccess("administration/app-settings");
  const canCreateTerm = () => canAccess("administration/app-settings");
  const canDeleteTerm = () => canAccess("administration/app-settings");
  const canEditDepartment = () => canAccess("analytics/department-insights");
  const canCreateDepartment = () => canAccess("analytics/department-insights");
  const canDeleteDepartment = () => canAccess("analytics/department-insights");
  const canEditAcronym = () => canAccess("resources/baylor-acronyms");
  const canCreateAcronym = () => canAccess("resources/baylor-acronyms");
  const canDeleteAcronym = () => canAccess("resources/baylor-acronyms");
  const canImportData = () => canAccess("tools/import-wizard");
  const canExportData = () => canAccess("scheduling/room-schedules");
  const canRunDataHygiene = () => canAccess("tools/data-hygiene");
  const canDeduplicateData = () => canAccess("tools/data-hygiene");
  const canMigrateData = () => canAccess("tools/data-hygiene");
  const canBackupData = () => canAccess("tools/data-hygiene");
  const canViewAnalytics = () => canAccess("analytics/department-insights");
  const canEditAnalytics = () => canAccess("analytics/department-insights");
  const canExportAnalytics = () => canAccess("analytics/department-insights");
  const canViewDepartmentAnalytics = () =>
    canAccess("analytics/department-insights");
  const canViewCourseAnalytics = () => canAccess("analytics/course-management");
  const canManageSystemSettings = () =>
    canAccess("administration/app-settings");
  const canManageAccessControl = () =>
    canAccess("administration/access-control");
  const canManageUsers = () => canAccess("administration/access-control");
  const canDisableUsers = () => canAccess("administration/access-control");
  const canDeleteUsers = () => canAccess("administration/access-control");
  const canPerformMaintenance = () => canAccess("administration/app-settings");
  const canEditCRN = () => canAccess("tools/crn-tools");
  const canUpdateCRN = () => canAccess("tools/crn-tools");
  const canCheckCRNQuality = () => canAccess("tools/crn-tools");
  const canBulkUpdateCRN = () => canAccess("tools/crn-tools");
  const canEditMissingData = () => canAccess("tools/data-hygiene");
  const canUpdateMissingData = () => canAccess("tools/data-hygiene");
  const canReviewMissingData = () => canAccess("tools/data-hygiene");

  return {
    canView,
    canEdit,
    canExport,
    canImport,
    canAction,
    canDoAction,
    canEditFaculty,
    canCreateFaculty,
    canDeleteFaculty,
    canEditStaff,
    canCreateStaff,
    canDeleteStaff,
    canEditAdjunct,
    canCreateAdjunct,
    canDeleteAdjunct,
    canEditStudent,
    canCreateStudent,
    canDeleteStudent,
    canEditSchedule,
    canCreateSchedule,
    canDeleteSchedule,
    canBulkEditSchedule,
    canImportSchedule,
    canExportSchedule,
    canEditRoom,
    canCreateRoom,
    canDeleteRoom,
    canSaveRoomGrid,
    canDeleteRoomGrid,
    canEditRoomGrid,
    canEditProgram,
    canCreateProgram,
    canDeleteProgram,
    canAssignProgramUPD,
    canRemoveProgramUPD,
    canEditCourse,
    canCreateCourse,
    canDeleteCourse,
    canEditTerm,
    canCreateTerm,
    canDeleteTerm,
    canEditDepartment,
    canCreateDepartment,
    canDeleteDepartment,
    canEditAcronym,
    canCreateAcronym,
    canDeleteAcronym,
    canImportData,
    canExportData,
    canRunDataHygiene,
    canDeduplicateData,
    canMigrateData,
    canBackupData,
    canViewAnalytics,
    canEditAnalytics,
    canExportAnalytics,
    canViewDepartmentAnalytics,
    canViewCourseAnalytics,
    canManageSystemSettings,
    canManageAccessControl,
    canManageUsers,
    canDisableUsers,
    canDeleteUsers,
    canPerformMaintenance,
    canEditCRN,
    canUpdateCRN,
    canCheckCRNQuality,
    canBulkUpdateCRN,
    canEditMissingData,
    canUpdateMissingData,
    canReviewMissingData,
  };
}
