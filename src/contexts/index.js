/**
 * Context Exports
 *
 * This file provides a central export point for all application contexts.
 * Components can import from here instead of individual context files.
 *
 * Usage:
 *   import { useData, useUI, useAuth, useTutorial } from '../contexts';
 */

// Authentication context
export { AuthProvider, useAuth } from './AuthContext';

// Data context - centralized data management
export { DataProvider, useData } from './DataContext';

// UI context - notifications, sidebar, modals
export { UIProvider, useUI } from './UIContext';

// Tutorial context - help system, tutorials, tooltips
export { TutorialProvider, useTutorial, TUTORIALS, HELP_HINTS } from './TutorialContext';
