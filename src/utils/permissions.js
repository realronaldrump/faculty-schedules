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

// Granular action keys for specific operations
export const DIRECTORY_ACTIONS = {
  // Faculty directory actions
  FACULTY_EDIT: 'directory.faculty.edit',
  FACULTY_CREATE: 'directory.faculty.create',
  FACULTY_DELETE: 'directory.faculty.delete',
  FACULTY_VIEW: 'directory.faculty.view',

  // Staff directory actions
  STAFF_EDIT: 'directory.staff.edit',
  STAFF_CREATE: 'directory.staff.create',
  STAFF_DELETE: 'directory.staff.delete',
  STAFF_VIEW: 'directory.staff.view',

  // Adjunct directory actions
  ADJUNCT_EDIT: 'directory.adjunct.edit',
  ADJUNCT_CREATE: 'directory.adjunct.create',
  ADJUNCT_DELETE: 'directory.adjunct.delete',
  ADJUNCT_VIEW: 'directory.adjunct.view',

  // Student directory actions
  STUDENT_EDIT: 'directory.student.edit',
  STUDENT_CREATE: 'directory.student.create',
  STUDENT_DELETE: 'directory.student.delete',
  STUDENT_VIEW: 'directory.student.view',

  // Room grid actions
  ROOMGRIDS_SAVE: 'roomGrids.save',
  ROOMGRIDS_DELETE: 'roomGrids.delete',

  // Import/Export actions
  DATA_IMPORT: 'data.import',
  DATA_EXPORT: 'data.export',

  // Schedule actions
  SCHEDULE_EDIT: 'schedule.edit',
  SCHEDULE_CREATE: 'schedule.create',
  SCHEDULE_DELETE: 'schedule.delete',

  // Analytics actions
  ANALYTICS_VIEW: 'analytics.view',
  ANALYTICS_EDIT: 'analytics.edit'
};

// Register all directory actions on module load
Object.values(DIRECTORY_ACTIONS).forEach(action => registerActionKey(action));

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

  // Directory-specific permission helpers
  const canEditFaculty = () => canDoAction(DIRECTORY_ACTIONS.FACULTY_EDIT);
  const canCreateFaculty = () => canDoAction(DIRECTORY_ACTIONS.FACULTY_CREATE);
  const canDeleteFaculty = () => canDoAction(DIRECTORY_ACTIONS.FACULTY_DELETE);
  const canViewFaculty = () => canDoAction(DIRECTORY_ACTIONS.FACULTY_VIEW) || canEditFaculty() || canCreateFaculty() || canDeleteFaculty();

  const canEditStaff = () => canDoAction(DIRECTORY_ACTIONS.STAFF_EDIT);
  const canCreateStaff = () => canDoAction(DIRECTORY_ACTIONS.STAFF_CREATE);
  const canDeleteStaff = () => canDoAction(DIRECTORY_ACTIONS.STAFF_DELETE);
  const canViewStaff = () => canDoAction(DIRECTORY_ACTIONS.STAFF_VIEW) || canEditStaff() || canCreateStaff() || canDeleteStaff();

  const canEditAdjunct = () => canDoAction(DIRECTORY_ACTIONS.ADJUNCT_EDIT);
  const canCreateAdjunct = () => canDoAction(DIRECTORY_ACTIONS.ADJUNCT_CREATE);
  const canDeleteAdjunct = () => canDoAction(DIRECTORY_ACTIONS.ADJUNCT_DELETE);
  const canViewAdjunct = () => canDoAction(DIRECTORY_ACTIONS.ADJUNCT_VIEW) || canEditAdjunct() || canCreateAdjunct() || canDeleteAdjunct();

  const canEditStudent = () => canDoAction(DIRECTORY_ACTIONS.STUDENT_EDIT);
  const canCreateStudent = () => canDoAction(DIRECTORY_ACTIONS.STUDENT_CREATE);
  const canDeleteStudent = () => canDoAction(DIRECTORY_ACTIONS.STUDENT_DELETE);
  const canViewStudent = () => canDoAction(DIRECTORY_ACTIONS.STUDENT_VIEW) || canEditStudent() || canCreateStudent() || canDeleteStudent();

  // General directory permissions
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

    // New granular directory permissions
    canEditFaculty,
    canCreateFaculty,
    canDeleteFaculty,
    canViewFaculty,
    canEditStaff,
    canCreateStaff,
    canDeleteStaff,
    canViewStaff,
    canEditAdjunct,
    canCreateAdjunct,
    canDeleteAdjunct,
    canViewAdjunct,
    canEditStudent,
    canCreateStudent,
    canDeleteStudent,
    canViewStudent,

    // General helpers
    canEditDirectory,
    canCreateInDirectory,
    canDeleteFromDirectory
  };
}


