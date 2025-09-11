// Centralized permission helpers
// Keep it intentionally simple for maintainability.

import { useAuth } from '../contexts/AuthContext.jsx';

// Standard action keys the app cares about
export const STANDARD_ACTIONS = {
  VIEW: 'view',
  EDIT: 'edit', // any operation that writes to Firestore
  EXPORT: 'export',
  IMPORT: 'import'
};

// Hook to ask simple permission questions from components
export function usePermissions() {
  const { canAccess, isAdmin } = useAuth();

  const canView = (pageId) => canAccess(pageId);
  const canEdit = () => isAdmin; // Editing is admin-only by design (rules enforce this too)
  const canExport = (pageId) => canAccess(pageId);
  const canImport = () => isAdmin;

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

  return { canView, canEdit, canExport, canImport, canPerform, isAdmin };
}


