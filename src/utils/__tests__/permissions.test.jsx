/* @vitest-environment jsdom */
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const canAccessMock = vi.fn();

vi.mock("../../contexts/AuthContext.jsx", () => ({
  useAuth: () => ({ canAccess: canAccessMock }),
}));

import { PERMISSION_PAGE_MAP, usePermissions } from "../permissions";

const EXPECTED_PERMISSION_PAGE_MAP = {
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
  canEditRoom: "facilities/spaces",
  canCreateRoom: "facilities/spaces",
  canDeleteRoom: "facilities/spaces",
  canSaveRoomGrid: "scheduling/rooms",
  canDeleteRoomGrid: "scheduling/rooms",
  canEditRoomGrid: "scheduling/rooms",
  canEditProgram: "people/programs",
  canCreateProgram: "people/programs",
  canDeleteProgram: "people/programs",
  canAssignProgramDirector: "people/programs",
  canRemoveProgramDirector: "people/programs",
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
  canEditPAF: "workflows/paf",
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

describe("usePermissions", () => {
  beforeEach(() => {
    canAccessMock.mockReset();
    canAccessMock.mockReturnValue(true);
  });

  it("exposes generic page-based permission helpers", () => {
    const { result } = renderHook(() => usePermissions());

    expect(typeof result.current.canView).toBe("function");
    expect(typeof result.current.canEdit).toBe("function");
    expect(typeof result.current.canExport).toBe("function");
    expect(typeof result.current.canImport).toBe("function");
    expect(typeof result.current.canAction).toBe("function");
    expect(typeof result.current.canDoAction).toBe("function");

    result.current.canView("dashboard");
    result.current.canEdit("people/directory");
    result.current.canExport("scheduling/rooms");
    result.current.canImport("admin-tools/import-wizard");
    result.current.canAction("admin/settings");
    result.current.canDoAction("admin/access-control");

    expect(canAccessMock).toHaveBeenCalledWith("dashboard");
    expect(canAccessMock).toHaveBeenCalledWith("people/directory");
    expect(canAccessMock).toHaveBeenCalledWith("scheduling/rooms");
    expect(canAccessMock).toHaveBeenCalledWith("admin-tools/import-wizard");
    expect(canAccessMock).toHaveBeenCalledWith("admin/settings");
    expect(canAccessMock).toHaveBeenCalledWith("admin/access-control");
  });

  it("maps all specific permission helpers to the expected page IDs", () => {
    const { result } = renderHook(() => usePermissions());

    expect(PERMISSION_PAGE_MAP).toEqual(EXPECTED_PERMISSION_PAGE_MAP);

    Object.entries(EXPECTED_PERMISSION_PAGE_MAP).forEach(([helperName, pageId]) => {
      expect(typeof result.current[helperName]).toBe("function");
      canAccessMock.mockClear();
      result.current[helperName]();
      expect(canAccessMock).toHaveBeenCalledTimes(1);
      expect(canAccessMock).toHaveBeenCalledWith(pageId);
    });
  });
});
