import { useMemo } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";

export const PERMISSION_PAGE_MAP = {
  canEditFaculty: "people/directory",
  canCreateFaculty: "people/directory",
  canDeleteFaculty: "people/directory",
  canEditStaff: "people/directory",
  canCreateStaff: "people/directory",
  canDeleteStaff: "people/directory",
  canEditAdjunct: "people/directory",
  canCreateAdjunct: "people/directory",
  canDeleteAdjunct: "people/directory",
  canEditStudent: "people/directory",
  canCreateStudent: "people/directory",
  canDeleteStudent: "people/directory",
  canEditSchedule: "courses/manage",
  canCreateSchedule: "courses/manage",
  canDeleteSchedule: "courses/manage",
  canBulkEditSchedule: "courses/manage",
  canImportSchedule: "admin-tools/import-wizard",
  canExportSchedule: "scheduling/rooms",
  canEditRoom: "people/directory",
  canCreateRoom: "people/directory",
  canDeleteRoom: "people/directory",
  canSaveRoomGrid: "scheduling/rooms",
  canDeleteRoomGrid: "scheduling/rooms",
  canEditRoomGrid: "scheduling/rooms",
  canEditProgram: "people/programs",
  canCreateProgram: "people/programs",
  canDeleteProgram: "people/programs",
  canAssignProgramUPD: "people/programs",
  canRemoveProgramUPD: "people/programs",
  canEditCourse: "courses/manage",
  canCreateCourse: "courses/manage",
  canDeleteCourse: "courses/manage",
  canEditTerm: "admin/settings",
  canCreateTerm: "admin/settings",
  canDeleteTerm: "admin/settings",
  canEditDepartment: "analytics/department-insights",
  canCreateDepartment: "analytics/department-insights",
  canDeleteDepartment: "analytics/department-insights",
  canEditAcronym: "help/acronyms",
  canCreateAcronym: "help/acronyms",
  canDeleteAcronym: "help/acronyms",
  canImportData: "admin-tools/import-wizard",
  canExportData: "courses/manage",
  canRunDataHygiene: "admin/data-hygiene",
  canDeduplicateData: "admin/data-hygiene",
  canMigrateData: "admin/data-hygiene",
  canBackupData: "admin/data-hygiene",
  canViewAnalytics: "analytics/department-insights",
  canEditAnalytics: "analytics/department-insights",
  canExportAnalytics: "analytics/department-insights",
  canViewDepartmentAnalytics: "analytics/department-insights",
  canViewCourseAnalytics: "courses/manage",
  canManageSystemSettings: "admin/settings",
  canManageAccessControl: "admin/access-control",
  canManageUsers: "admin/access-control",
  canDisableUsers: "admin/access-control",
  canDeleteUsers: "admin/access-control",
  canPerformMaintenance: "admin/settings",
  canEditCRN: "admin-tools/crn-tools",
  canUpdateCRN: "admin-tools/crn-tools",
  canCheckCRNQuality: "admin-tools/crn-tools",
  canBulkUpdateCRN: "admin-tools/crn-tools",
  canEditMissingData: "admin/data-hygiene",
  canUpdateMissingData: "admin/data-hygiene",
  canReviewMissingData: "admin/data-hygiene",
};

export function usePermissions() {
  const { canAccess } = useAuth();

  const mappedPermissions = useMemo(() => {
    const permissions = {};
    Object.entries(PERMISSION_PAGE_MAP).forEach(([name, pageId]) => {
      permissions[name] = () => canAccess(pageId);
    });
    return permissions;
  }, [canAccess]);

  return {
    canView: (pageId) => canAccess(pageId),
    canEdit: (pageId) => canAccess(pageId),
    canExport: (pageId) => canAccess(pageId),
    canImport: (pageId) => canAccess(pageId),
    canAction: (pageId) => canAccess(pageId),
    canDoAction: (pageId) => canAccess(pageId),
    ...mappedPermissions,
  };
}
