// Centralized permission helpers
// Keep it intentionally simple for maintainability.

import { useAuth } from '../contexts/AuthContext.jsx';
import { registerActionKey } from './actionRegistry';

// Standard action keys the app cares about
export const STANDARD_ACTIONS = {
  VIEW: 'view',
  EDIT: 'edit', // any operation that writes to Firestore
  EXPORT: 'export',
  IMPORT: 'import'
};

// Comprehensive action registry - automatically registers ALL app actions
// This is the master list of all possible operations in the app
// NOTE: View permissions are handled by Role-Based Access (page access), not user actions
export const APP_ACTIONS = {
  // ===== DIRECTORY OPERATIONS =====
  // Faculty directory actions
  FACULTY_EDIT: 'directory.faculty.edit',
  FACULTY_CREATE: 'directory.faculty.create',
  FACULTY_DELETE: 'directory.faculty.delete',

  // Staff directory actions
  STAFF_EDIT: 'directory.staff.edit',
  STAFF_CREATE: 'directory.staff.create',
  STAFF_DELETE: 'directory.staff.delete',

  // Adjunct directory actions
  ADJUNCT_EDIT: 'directory.adjunct.edit',
  ADJUNCT_CREATE: 'directory.adjunct.create',
  ADJUNCT_DELETE: 'directory.adjunct.delete',

  // Student directory actions
  STUDENT_EDIT: 'directory.student.edit',
  STUDENT_CREATE: 'directory.student.create',
  STUDENT_DELETE: 'directory.student.delete',

  // ===== SCHEDULE OPERATIONS =====
  SCHEDULE_EDIT: 'schedule.edit',
  SCHEDULE_CREATE: 'schedule.create',
  SCHEDULE_DELETE: 'schedule.delete',
  SCHEDULE_BULK_EDIT: 'schedule.bulk.edit',
  SCHEDULE_IMPORT: 'schedule.import',
  SCHEDULE_EXPORT: 'schedule.export',

  // ===== ROOM OPERATIONS =====
  ROOM_EDIT: 'room.edit',
  ROOM_CREATE: 'room.create',
  ROOM_DELETE: 'room.delete',

  // ===== ROOM GRID OPERATIONS =====
  ROOMGRIDS_SAVE: 'roomGrids.save',
  ROOMGRIDS_DELETE: 'roomGrids.delete',
  ROOMGRIDS_EDIT: 'roomGrids.edit',

  // ===== PROGRAM OPERATIONS =====
  PROGRAM_EDIT: 'program.edit',
  PROGRAM_CREATE: 'program.create',
  PROGRAM_DELETE: 'program.delete',
  PROGRAM_UPD_ASSIGN: 'program.upd.assign',
  PROGRAM_UPD_REMOVE: 'program.upd.remove',

  // ===== COURSE OPERATIONS =====
  COURSE_EDIT: 'course.edit',
  COURSE_CREATE: 'course.create',
  COURSE_DELETE: 'course.delete',

  // ===== TERM OPERATIONS =====
  TERM_EDIT: 'term.edit',
  TERM_CREATE: 'term.create',
  TERM_DELETE: 'term.delete',

  // ===== DEPARTMENT OPERATIONS =====
  DEPARTMENT_EDIT: 'department.edit',
  DEPARTMENT_CREATE: 'department.create',
  DEPARTMENT_DELETE: 'department.delete',

  // ===== ACRONYM OPERATIONS =====
  ACRONYM_EDIT: 'acronym.edit',
  ACRONYM_CREATE: 'acronym.create',
  ACRONYM_DELETE: 'acronym.delete',

  // ===== DATA MANAGEMENT OPERATIONS =====
  DATA_IMPORT: 'data.import',
  DATA_EXPORT: 'data.export',
  DATA_HYGIENE: 'data.hygiene',
  DATA_DEDUPLICATION: 'data.deduplication',
  DATA_MIGRATION: 'data.migration',
  DATA_BACKUP: 'data.backup',

  // ===== ANALYTICS OPERATIONS =====
  ANALYTICS_VIEW: 'analytics.view',
  ANALYTICS_EDIT: 'analytics.edit',
  ANALYTICS_EXPORT: 'analytics.export',
  ANALYTICS_DEPARTMENT: 'analytics.department.view',
  ANALYTICS_COURSE: 'analytics.course.view',

  // ===== SYSTEM OPERATIONS =====
  SYSTEM_SETTINGS: 'system.settings',
  SYSTEM_ACCESS_CONTROL: 'system.access.control',
  SYSTEM_USER_MANAGE: 'system.user.manage',
  SYSTEM_USER_DISABLE: 'system.user.disable',
  SYSTEM_USER_DELETE: 'system.user.delete',
  SYSTEM_MAINTENANCE: 'system.maintenance',

  // ===== CRN OPERATIONS =====
  CRN_EDIT: 'crn.edit',
  CRN_UPDATE: 'crn.update',
  CRN_QUALITY_CHECK: 'crn.quality.check',
  CRN_BULK_UPDATE: 'crn.bulk.update',

  // ===== MISSING DATA OPERATIONS =====
  MISSING_DATA_EDIT: 'missing.data.edit',
  MISSING_DATA_UPDATE: 'missing.data.update',
  MISSING_DATA_REVIEW: 'missing.data.review'
};

// Legacy alias for backward compatibility - only action-based permissions
export const DIRECTORY_ACTIONS = {
  FACULTY_EDIT: APP_ACTIONS.FACULTY_EDIT,
  FACULTY_CREATE: APP_ACTIONS.FACULTY_CREATE,
  FACULTY_DELETE: APP_ACTIONS.FACULTY_DELETE,
  STAFF_EDIT: APP_ACTIONS.STAFF_EDIT,
  STAFF_CREATE: APP_ACTIONS.STAFF_CREATE,
  STAFF_DELETE: APP_ACTIONS.STAFF_DELETE,
  ADJUNCT_EDIT: APP_ACTIONS.ADJUNCT_EDIT,
  ADJUNCT_CREATE: APP_ACTIONS.ADJUNCT_CREATE,
  ADJUNCT_DELETE: APP_ACTIONS.ADJUNCT_DELETE,
  STUDENT_EDIT: APP_ACTIONS.STUDENT_EDIT,
  STUDENT_CREATE: APP_ACTIONS.STUDENT_CREATE,
  STUDENT_DELETE: APP_ACTIONS.STUDENT_DELETE,
  ROOMGRIDS_SAVE: APP_ACTIONS.ROOMGRIDS_SAVE,
  ROOMGRIDS_DELETE: APP_ACTIONS.ROOMGRIDS_DELETE,
  DATA_IMPORT: APP_ACTIONS.DATA_IMPORT,
  DATA_EXPORT: APP_ACTIONS.DATA_EXPORT,
  SCHEDULE_EDIT: APP_ACTIONS.SCHEDULE_EDIT,
  SCHEDULE_CREATE: APP_ACTIONS.SCHEDULE_CREATE,
  SCHEDULE_DELETE: APP_ACTIONS.SCHEDULE_DELETE,
  ANALYTICS_EDIT: APP_ACTIONS.ANALYTICS_EDIT
};

// Register ALL app actions on module load - this ensures complete coverage
Object.values(APP_ACTIONS).forEach(action => registerActionKey(action));

// Hook to ask simple permission questions from components
export function usePermissions() {
  const { canAccess, isAdmin, canAction } = useAuth();

  const canView = (pageId) => canAccess(pageId);
  const canEdit = () => isAdmin; // Legacy - keep for backward compatibility
  const canExport = (pageId) => canAccess(pageId);
  const canImport = () => isAdmin;

  const canDoAction = (actionKey) => {
    if (typeof actionKey === 'string' && actionKey.trim()) {
      // Auto-register action key on first use so the admin UI can pick it up
      registerActionKey(actionKey.trim());
    }
    if (typeof canAction === 'function') return canAction(actionKey);
    return isAdmin;
  };

  const canPerform = (pageId, action) => {
    switch (action) {
      case STANDARD_ACTIONS.VIEW:
        return canView(pageId);
      case STANDARD_ACTIONS.EDIT:
        return canEdit();
      case STANDARD_ACTIONS.EXPORT:
        return canExport(pageId);
      case STANDARD_ACTIONS.IMPORT:
        return canImport();
      default:
        // Unknown actions default to requiring admin to be safe
        return isAdmin;
    }
  };

  // ===== DIRECTORY PERMISSIONS =====
  const canEditFaculty = () => canDoAction(APP_ACTIONS.FACULTY_EDIT);
  const canCreateFaculty = () => canDoAction(APP_ACTIONS.FACULTY_CREATE);
  const canDeleteFaculty = () => canDoAction(APP_ACTIONS.FACULTY_DELETE);

  const canEditStaff = () => canDoAction(APP_ACTIONS.STAFF_EDIT);
  const canCreateStaff = () => canDoAction(APP_ACTIONS.STAFF_CREATE);
  const canDeleteStaff = () => canDoAction(APP_ACTIONS.STAFF_DELETE);

  const canEditAdjunct = () => canDoAction(APP_ACTIONS.ADJUNCT_EDIT);
  const canCreateAdjunct = () => canDoAction(APP_ACTIONS.ADJUNCT_CREATE);
  const canDeleteAdjunct = () => canDoAction(APP_ACTIONS.ADJUNCT_DELETE);

  const canEditStudent = () => canDoAction(APP_ACTIONS.STUDENT_EDIT);
  const canCreateStudent = () => canDoAction(APP_ACTIONS.STUDENT_CREATE);
  const canDeleteStudent = () => canDoAction(APP_ACTIONS.STUDENT_DELETE);

  // ===== SCHEDULE PERMISSIONS =====
  const canEditSchedule = () => canDoAction(APP_ACTIONS.SCHEDULE_EDIT);
  const canCreateSchedule = () => canDoAction(APP_ACTIONS.SCHEDULE_CREATE);
  const canDeleteSchedule = () => canDoAction(APP_ACTIONS.SCHEDULE_DELETE);
  const canBulkEditSchedule = () => canDoAction(APP_ACTIONS.SCHEDULE_BULK_EDIT);
  const canImportSchedule = () => canDoAction(APP_ACTIONS.SCHEDULE_IMPORT);
  const canExportSchedule = () => canDoAction(APP_ACTIONS.SCHEDULE_EXPORT);

  // ===== ROOM PERMISSIONS =====
  const canEditRoom = () => canDoAction(APP_ACTIONS.ROOM_EDIT);
  const canCreateRoom = () => canDoAction(APP_ACTIONS.ROOM_CREATE);
  const canDeleteRoom = () => canDoAction(APP_ACTIONS.ROOM_DELETE);

  // ===== ROOM GRID PERMISSIONS =====
  const canSaveRoomGrid = () => canDoAction(APP_ACTIONS.ROOMGRIDS_SAVE);
  const canDeleteRoomGrid = () => canDoAction(APP_ACTIONS.ROOMGRIDS_DELETE);
  const canEditRoomGrid = () => canDoAction(APP_ACTIONS.ROOMGRIDS_EDIT);

  // ===== PROGRAM PERMISSIONS =====
  const canEditProgram = () => canDoAction(APP_ACTIONS.PROGRAM_EDIT);
  const canCreateProgram = () => canDoAction(APP_ACTIONS.PROGRAM_CREATE);
  const canDeleteProgram = () => canDoAction(APP_ACTIONS.PROGRAM_DELETE);
  const canAssignProgramUPD = () => canDoAction(APP_ACTIONS.PROGRAM_UPD_ASSIGN);
  const canRemoveProgramUPD = () => canDoAction(APP_ACTIONS.PROGRAM_UPD_REMOVE);

  // ===== COURSE PERMISSIONS =====
  const canEditCourse = () => canDoAction(APP_ACTIONS.COURSE_EDIT);
  const canCreateCourse = () => canDoAction(APP_ACTIONS.COURSE_CREATE);
  const canDeleteCourse = () => canDoAction(APP_ACTIONS.COURSE_DELETE);

  // ===== TERM PERMISSIONS =====
  const canEditTerm = () => canDoAction(APP_ACTIONS.TERM_EDIT);
  const canCreateTerm = () => canDoAction(APP_ACTIONS.TERM_CREATE);
  const canDeleteTerm = () => canDoAction(APP_ACTIONS.TERM_DELETE);

  // ===== DEPARTMENT PERMISSIONS =====
  const canEditDepartment = () => canDoAction(APP_ACTIONS.DEPARTMENT_EDIT);
  const canCreateDepartment = () => canDoAction(APP_ACTIONS.DEPARTMENT_CREATE);
  const canDeleteDepartment = () => canDoAction(APP_ACTIONS.DEPARTMENT_DELETE);

  // ===== ACRONYM PERMISSIONS =====
  const canEditAcronym = () => canDoAction(APP_ACTIONS.ACRONYM_EDIT);
  const canCreateAcronym = () => canDoAction(APP_ACTIONS.ACRONYM_CREATE);
  const canDeleteAcronym = () => canDoAction(APP_ACTIONS.ACRONYM_DELETE);

  // ===== DATA MANAGEMENT PERMISSIONS =====
  const canImportData = () => canDoAction(APP_ACTIONS.DATA_IMPORT);
  const canExportData = () => canDoAction(APP_ACTIONS.DATA_EXPORT);
  const canRunDataHygiene = () => canDoAction(APP_ACTIONS.DATA_HYGIENE);
  const canDeduplicateData = () => canDoAction(APP_ACTIONS.DATA_DEDUPLICATION);
  const canMigrateData = () => canDoAction(APP_ACTIONS.DATA_MIGRATION);
  const canBackupData = () => canDoAction(APP_ACTIONS.DATA_BACKUP);

  // ===== ANALYTICS PERMISSIONS =====
  const canViewAnalytics = () => canDoAction(APP_ACTIONS.ANALYTICS_VIEW);
  const canEditAnalytics = () => canDoAction(APP_ACTIONS.ANALYTICS_EDIT);
  const canExportAnalytics = () => canDoAction(APP_ACTIONS.ANALYTICS_EXPORT);
  const canViewDepartmentAnalytics = () => canDoAction(APP_ACTIONS.ANALYTICS_DEPARTMENT);
  const canViewCourseAnalytics = () => canDoAction(APP_ACTIONS.ANALYTICS_COURSE);

  // ===== SYSTEM PERMISSIONS =====
  const canManageSystemSettings = () => canDoAction(APP_ACTIONS.SYSTEM_SETTINGS);
  const canManageAccessControl = () => canDoAction(APP_ACTIONS.SYSTEM_ACCESS_CONTROL);
  const canManageUsers = () => canDoAction(APP_ACTIONS.SYSTEM_USER_MANAGE);
  const canDisableUsers = () => canDoAction(APP_ACTIONS.SYSTEM_USER_DISABLE);
  const canDeleteUsers = () => canDoAction(APP_ACTIONS.SYSTEM_USER_DELETE);
  const canPerformMaintenance = () => canDoAction(APP_ACTIONS.SYSTEM_MAINTENANCE);

  // ===== CRN PERMISSIONS =====
  const canEditCRN = () => canDoAction(APP_ACTIONS.CRN_EDIT);
  const canUpdateCRN = () => canDoAction(APP_ACTIONS.CRN_UPDATE);
  const canCheckCRNQuality = () => canDoAction(APP_ACTIONS.CRN_QUALITY_CHECK);
  const canBulkUpdateCRN = () => canDoAction(APP_ACTIONS.CRN_BULK_UPDATE);

  // ===== MISSING DATA PERMISSIONS =====
  const canEditMissingData = () => canDoAction(APP_ACTIONS.MISSING_DATA_EDIT);
  const canUpdateMissingData = () => canDoAction(APP_ACTIONS.MISSING_DATA_UPDATE);
  const canReviewMissingData = () => canDoAction(APP_ACTIONS.MISSING_DATA_REVIEW);

  // ===== GENERAL HELPER FUNCTIONS =====
  const canEditDirectory = (type) => {
    switch (type) {
      case 'faculty': return canEditFaculty();
      case 'staff': return canEditStaff();
      case 'adjunct': return canEditAdjunct();
      case 'student': return canEditStudent();
      default: return false;
    }
  };

  const canCreateInDirectory = (type) => {
    switch (type) {
      case 'faculty': return canCreateFaculty();
      case 'staff': return canCreateStaff();
      case 'adjunct': return canCreateAdjunct();
      case 'student': return canCreateStudent();
      default: return false;
    }
  };

  const canDeleteFromDirectory = (type) => {
    switch (type) {
      case 'faculty': return canDeleteFaculty();
      case 'staff': return canDeleteStaff();
      case 'adjunct': return canDeleteAdjunct();
      case 'student': return canDeleteStudent();
      default: return false;
    }
  };

  return {
    // Legacy functions
    canView,
    canEdit,
    canExport,
    canImport,
    canPerform,
    canAction: canDoAction,
    isAdmin,

    // ===== DIRECTORY PERMISSIONS =====
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

    // ===== SCHEDULE PERMISSIONS =====
    canEditSchedule,
    canCreateSchedule,
    canDeleteSchedule,
    canBulkEditSchedule,
    canImportSchedule,
    canExportSchedule,

    // ===== ROOM PERMISSIONS =====
    canEditRoom,
    canCreateRoom,
    canDeleteRoom,

    // ===== ROOM GRID PERMISSIONS =====
    canSaveRoomGrid,
    canDeleteRoomGrid,
    canEditRoomGrid,

    // ===== PROGRAM PERMISSIONS =====
    canEditProgram,
    canCreateProgram,
    canDeleteProgram,
    canAssignProgramUPD,
    canRemoveProgramUPD,

    // ===== COURSE PERMISSIONS =====
    canEditCourse,
    canCreateCourse,
    canDeleteCourse,

    // ===== TERM PERMISSIONS =====
    canEditTerm,
    canCreateTerm,
    canDeleteTerm,

    // ===== DEPARTMENT PERMISSIONS =====
    canEditDepartment,
    canCreateDepartment,
    canDeleteDepartment,

    // ===== ACRONYM PERMISSIONS =====
    canEditAcronym,
    canCreateAcronym,
    canDeleteAcronym,

    // ===== DATA MANAGEMENT PERMISSIONS =====
    canImportData,
    canExportData,
    canRunDataHygiene,
    canDeduplicateData,
    canMigrateData,
    canBackupData,

    // ===== ANALYTICS PERMISSIONS =====
    canEditAnalytics,
    canExportAnalytics,
    canViewDepartmentAnalytics,
    canViewCourseAnalytics,

    // ===== SYSTEM PERMISSIONS =====
    canManageSystemSettings,
    canManageAccessControl,
    canManageUsers,
    canDisableUsers,
    canDeleteUsers,
    canPerformMaintenance,

    // ===== CRN PERMISSIONS =====
    canEditCRN,
    canUpdateCRN,
    canCheckCRNQuality,
    canBulkUpdateCRN,

    // ===== MISSING DATA PERMISSIONS =====
    canEditMissingData,
    canUpdateMissingData,
    canReviewMissingData,

    // ===== GENERAL HELPER FUNCTIONS =====
    canEditDirectory,
    canCreateInDirectory,
    canDeleteFromDirectory
  };
}

