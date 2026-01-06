/**
 * Context Exports
 *
 * This file provides a central export point for all application contexts.
 * Components can import from here instead of individual context files.
 *
 * Usage:
 *   import { useData, useUI, useAuth } from '../contexts';
 */

// Authentication context
export { AuthProvider, useAuth } from './AuthContext';

// Data context - centralized data management
export { DataProvider, useData } from './DataContext';

// UI context - notifications, sidebar, modals
export { UIProvider, useUI } from './UIContext';
