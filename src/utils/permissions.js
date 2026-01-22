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
  const canEditFaculty = () => canAccess("people/directory");
  const canCreateFaculty = () => canAccess("people/directory");
  const canDeleteFaculty = () => canAccess("people/directory");
  const canEditStaff = () => canAccess("people/directory");
  const canCreateStaff = () => canAccess("people/directory");
  const canDeleteStaff = () => canAccess("people/directory");
  const canEditAdjunct = () => canAccess("people/directory");
  const canCreateAdjunct = () => canAccess("people/directory");
  const canDeleteAdjunct = () => canAccess("people/directory");
  const canEditStudent = () => canAccess("people/directory");
  const canCreateStudent = () => canAccess("people/directory");
  const canDeleteStudent = () => canAccess("people/directory");
  const canEditSchedule = () => canAccess("data/schedule-data");
  const canCreateSchedule = () => canAccess("data/schedule-data");
  const canDeleteSchedule = () => canAccess("data/schedule-data");
  const canBulkEditSchedule = () => canAccess("data/schedule-data");
  const canImportSchedule = () => canAccess("data/import-wizard");
  const canExportSchedule = () => canAccess("scheduling/rooms");
  const canEditRoom = () => canAccess("people/directory");
  const canCreateRoom = () => canAccess("people/directory");
  const canDeleteRoom = () => canAccess("people/directory");
  const canSaveRoomGrid = () => canAccess("scheduling/rooms");
  const canDeleteRoomGrid = () => canAccess("scheduling/rooms");
  const canEditRoomGrid = () => canAccess("scheduling/rooms");
  const canEditProgram = () => canAccess("people/programs");
  const canCreateProgram = () => canAccess("people/programs");
  const canDeleteProgram = () => canAccess("people/programs");
  const canAssignProgramUPD = () => canAccess("people/programs");
  const canRemoveProgramUPD = () => canAccess("people/programs");
  const canEditCourse = () => canAccess("data/schedule-data");
  const canCreateCourse = () => canAccess("data/schedule-data");
  const canDeleteCourse = () => canAccess("data/schedule-data");
  const canEditTerm = () => canAccess("admin/settings");
  const canCreateTerm = () => canAccess("admin/settings");
  const canDeleteTerm = () => canAccess("admin/settings");
  const canEditDepartment = () => canAccess("analytics/department-insights");
  const canCreateDepartment = () => canAccess("analytics/department-insights");
  const canDeleteDepartment = () => canAccess("analytics/department-insights");
  const canEditAcronym = () => canAccess("help/acronyms");
  const canCreateAcronym = () => canAccess("help/acronyms");
  const canDeleteAcronym = () => canAccess("help/acronyms");
  const canImportData = () => canAccess("data/import-wizard");
  const canExportData = () => canAccess("data/schedule-data");
  const canRunDataHygiene = () => canAccess("admin/data-hygiene");
  const canDeduplicateData = () => canAccess("admin/data-hygiene");
  const canMigrateData = () => canAccess("admin/data-hygiene");
  const canBackupData = () => canAccess("admin/data-hygiene");
  const canViewAnalytics = () => canAccess("analytics/department-insights");
  const canEditAnalytics = () => canAccess("analytics/department-insights");
  const canExportAnalytics = () => canAccess("analytics/department-insights");
  const canViewDepartmentAnalytics = () =>
    canAccess("analytics/department-insights");
  const canViewCourseAnalytics = () => canAccess("data/schedule-data");
  const canManageSystemSettings = () =>
    canAccess("admin/settings");
  const canManageAccessControl = () =>
    canAccess("admin/access-control");
  const canManageUsers = () => canAccess("admin/access-control");
  const canDisableUsers = () => canAccess("admin/access-control");
  const canDeleteUsers = () => canAccess("admin/access-control");
  const canPerformMaintenance = () => canAccess("admin/settings");
  const canEditCRN = () => canAccess("data/crn-tools");
  const canUpdateCRN = () => canAccess("data/crn-tools");
  const canCheckCRNQuality = () => canAccess("data/crn-tools");
  const canBulkUpdateCRN = () => canAccess("data/crn-tools");
  const canEditMissingData = () => canAccess("admin/data-hygiene");
  const canUpdateMissingData = () => canAccess("admin/data-hygiene");
  const canReviewMissingData = () => canAccess("admin/data-hygiene");

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
