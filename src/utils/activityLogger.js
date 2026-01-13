/**
 * User Activity Tracking System
 *
 * This utility captures all user interactions and activities across the application
 * to provide comprehensive visibility into user behavior and system usage.
 */

import { collection, addDoc, query, where, orderBy, limit, getDocs, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';

/**
 * Activity event types for consistent categorization
 */
export const ACTIVITY_TYPES = {
  // Navigation
  PAGE_VIEW: 'page_view',
  NAVIGATION: 'navigation',
  MENU_CLICK: 'menu_click',

  // Data Interactions
  DATA_VIEW: 'data_view',
  SEARCH: 'search',
  FILTER: 'filter',
  SORT: 'sort',
  EXPORT: 'export',
  IMPORT: 'import',

  // User Actions
  BUTTON_CLICK: 'button_click',
  FORM_SUBMIT: 'form_submit',
  MODAL_OPEN: 'modal_open',
  MODAL_CLOSE: 'modal_close',
  TAB_SWITCH: 'tab_switch',

  // Authentication
  LOGIN: 'login',
  LOGOUT: 'logout',
  SESSION_START: 'session_start',
  SESSION_END: 'session_end',

  // System
  ERROR: 'error',
  FEATURE_USAGE: 'feature_usage',
  TIME_SPENT: 'time_spent'
};

/**
 * Log a user activity event
 * @param {Object} activityData - The activity information
 * @param {string} activityData.type - Type of activity (from ACTIVITY_TYPES)
 * @param {string} activityData.action - Description of the action taken
 * @param {string} [activityData.element] - DOM element identifier (button name, link text, etc.)
 * @param {string} [activityData.page] - Current page/route
 * @param {Object} [activityData.metadata] - Additional metadata (search terms, filter values, etc.)
 * @param {string} [activityData.sessionId] - User session identifier
 * @param {string} [activityData.component] - React component name
 * @param {Object} [activityData.userInfo] - User information (email, role, etc.)
 */
export const logActivity = async (activityData) => {
  try {
    // Get current user info from localStorage or context
    const userInfo = getCurrentUserInfo();

    const activityEntry = {
      timestamp: new Date().toISOString(),
      type: activityData.type,
      action: activityData.action,
      element: activityData.element || null,
      page: activityData.page || window.location.pathname,
      metadata: activityData.metadata || {},
      sessionId: activityData.sessionId || getSessionId(),
      component: activityData.component || null,
      userId: userInfo.userId,
      userEmail: userInfo.email,
      userRole: userInfo.role,
      userAgent: navigator.userAgent,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      referrer: document.referrer || null
    };

    await addDoc(collection(db, 'userActivity'), activityEntry);

    // Do not log activity to console in any environment

    return activityEntry;
  } catch (_) {
    // Silently ignore logging errors to avoid any leaks/console output
  }
};

/**
 * Get current user information for activity logging
 */
const getCurrentUserInfo = () => {
  try {
    // Prefer live Firebase auth user when available
    const currentUser = auth && auth.currentUser ? auth.currentUser : null;
    if (currentUser) {
      // Try to enrich with cached role if present
      let cachedRole = 'unknown';
      try {
        const cached = localStorage.getItem('userInfo');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && parsed.role) cachedRole = parsed.role;
        }
      } catch (error) {
        void error;
      }

      return {
        userId: currentUser.uid,
        email: currentUser.email || null,
        role: cachedRole,
        displayName: currentUser.displayName || (currentUser.email ? currentUser.email.split('@')[0] : undefined)
      };
    }

    // Fallback to cached user info from localStorage
    const cached = localStorage.getItem('userInfo');
    if (cached) {
      return JSON.parse(cached);
    }

    // Final fallback defaults
    return {
      userId: 'anonymous',
      email: null,
      role: 'unknown'
    };
  } catch (error) {
    return {
      userId: 'anonymous',
      email: null,
      role: 'unknown'
    };
  }
};

/**
 * Generate or retrieve session ID
 */
const getSessionId = () => {
  let sessionId = sessionStorage.getItem('sessionId');
  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('sessionId', sessionId);
  }
  return sessionId;
};

/**
 * Log page view activity
 * @param {string} page - Page path or name
 * @param {Object} metadata - Additional page metadata
 */
export const logPageView = (page, metadata = {}) => {
  return logActivity({
    type: ACTIVITY_TYPES.PAGE_VIEW,
    action: `Viewed ${page}`,
    page: page,
    metadata: {
      ...metadata,
      url: window.location.href,
      title: document.title
    }
  });
};

/**
 * Log navigation activity
 * @param {string} fromPage - Source page
 * @param {string} toPage - Destination page
 * @param {string} method - Navigation method (link, button, etc.)
 */
export const logNavigation = (fromPage, toPage, method = 'link') => {
  return logActivity({
    type: ACTIVITY_TYPES.NAVIGATION,
    action: `Navigated from ${fromPage} to ${toPage}`,
    element: method,
    metadata: {
      from: fromPage,
      to: toPage,
      method: method
    }
  });
};

/**
 * Log button/form interaction
 * @param {string} element - Element identifier
 * @param {string} action - Action description
 * @param {Object} metadata - Additional data
 */
export const logInteraction = (element, action, metadata = {}) => {
  return logActivity({
    type: ACTIVITY_TYPES.BUTTON_CLICK,
    action: action,
    element: element,
    metadata: metadata
  });
};

/**
 * Log search activity
 * @param {string} searchTerm - Search query
 * @param {string} searchType - Type of search (global, people, schedules, etc.)
 * @param {number} resultsCount - Number of results found
 */
export const logSearch = (searchTerm, searchType, resultsCount) => {
  return logActivity({
    type: ACTIVITY_TYPES.SEARCH,
    action: `Searched for "${searchTerm}" in ${searchType}`,
    element: 'search_input',
    metadata: {
      searchTerm: searchTerm,
      searchType: searchType,
      resultsCount: resultsCount
    }
  });
};

/**
 * Log filter application
 * @param {Object} filters - Applied filters
 * @param {string} context - Where filters were applied
 */
export const logFilter = (filters, context) => {
  return logActivity({
    type: ACTIVITY_TYPES.FILTER,
    action: `Applied filters in ${context}`,
    element: 'filter_controls',
    metadata: {
      filters: filters,
      context: context,
      filterCount: Object.keys(filters).length
    }
  });
};

/**
 * Log data export activity
 * @param {string} exportType - Type of export (CSV, PDF, etc.)
 * @param {string} dataType - What data was exported
 * @param {number} recordCount - Number of records exported
 */
export const logExport = (exportType, dataType, recordCount) => {
  return logActivity({
    type: ACTIVITY_TYPES.EXPORT,
    action: `Exported ${recordCount} ${dataType} records as ${exportType}`,
    element: 'export_button',
    metadata: {
      exportType: exportType,
      dataType: dataType,
      recordCount: recordCount
    }
  });
};

/**
 * Log authentication events
 * @param {string} eventType - login, logout, session_start, session_end
 * @param {Object} metadata - Additional auth metadata
 */
export const logAuth = (eventType, metadata = {}) => {
  return logActivity({
    type: eventType,
    action: `User ${eventType.replace('_', ' ')}`,
    metadata: metadata
  });
};

/**
 * Log errors and exceptions
 * @param {Error} error - Error object
 * @param {string} context - Where the error occurred
 * @param {Object} additionalData - Additional error context
 */
export const logError = (error, context, additionalData = {}) => {
  return logActivity({
    type: ACTIVITY_TYPES.ERROR,
    action: `Error in ${context}: ${error.message}`,
    metadata: {
      errorMessage: error.message,
      errorStack: error.stack,
      context: context,
      ...additionalData
    }
  });
};

/**
 * Log feature usage
 * @param {string} feature - Feature name
 * @param {string} action - What was done with the feature
 * @param {Object} metadata - Additional feature usage data
 */
export const logFeatureUsage = (feature, action, metadata = {}) => {
  return logActivity({
    type: ACTIVITY_TYPES.FEATURE_USAGE,
    action: `${action} ${feature}`,
    metadata: {
      feature: feature,
      action: action,
      ...metadata
    }
  });
};

/**
 * Get recent user activities
 * @param {Object} options - Query options
 * @param {string} [options.userId] - Filter by specific user
 * @param {string} [options.type] - Filter by activity type
 * @param {number} [options.limit] - Maximum number of results
 * @param {number} [options.hours] - Get activities from last N hours
 */
export const getRecentActivities = async (options = {}) => {
  try {
    let q = collection(db, 'userActivity');

    // Build query constraints
    const constraints = [];

    if (options.userId) {
      constraints.push(where('userId', '==', options.userId));
    }

    if (options.type) {
      constraints.push(where('type', '==', options.type));
    }

    if (options.hours) {
      const since = new Date(Date.now() - (options.hours * 60 * 60 * 1000));
      constraints.push(where('timestamp', '>=', since.toISOString()));
    }

    // Order by timestamp descending
    constraints.push(orderBy('timestamp', 'desc'));

    // Apply limit
    if (options.limit) {
      constraints.push(limit(options.limit));
    } else {
      constraints.push(limit(100)); // Default limit
    }

    try {
      q = query(q, ...constraints);
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (_) {
      // Fallback: missing composite index or restricted read; fetch recent by timestamp and filter in memory
      const fallbackLimit = options.limit || 500;
      const fallbackQuery = query(collection(db, 'userActivity'), orderBy('timestamp', 'desc'), limit(fallbackLimit));
      const snap = await getDocs(fallbackQuery);
      const items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return items.filter(a => {
        if (options.userId && a.userId !== options.userId) return false;
        if (options.type && a.type !== options.type) return false;
        if (options.hours) {
          const cutoff = Date.now() - (options.hours * 60 * 60 * 1000);
          const ts = new Date(a.timestamp).getTime();
          if (isFinite(ts) && ts < cutoff) return false;
        }
        return true;
      });
    }
  } catch (error) {
    console.error('Error fetching recent activities:', error);
    return [];
  }
};

/**
 * Subscribe to real-time activity updates
 * @param {Function} callback - Callback function for new activities
 * @param {Object} options - Subscription options
 */
export const subscribeToActivities = (callback, options = {}) => {
  try {
    let q = collection(db, 'userActivity');

    const constraints = [];

    if (options.userId) {
      constraints.push(where('userId', '==', options.userId));
    }

    if (options.type) {
      constraints.push(where('type', '==', options.type));
    }

    constraints.push(orderBy('timestamp', 'desc'));
    constraints.push(limit(options.limit || 50));

    try {
      q = query(q, ...constraints);
      return onSnapshot(q, (snapshot) => {
        const activities = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        callback(activities);
      });
    } catch (_) {
      // Fallback: subscribe to recent by timestamp and filter before callback
      const fbQuery = query(collection(db, 'userActivity'), orderBy('timestamp', 'desc'), limit(options.limit || 50));
      return onSnapshot(fbQuery, (snapshot) => {
        const raw = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const filtered = raw.filter(a => {
          if (options.userId && a.userId !== options.userId) return false;
          if (options.type && a.type !== options.type) return false;
          return true;
        });
        callback(filtered);
      });
    }
  } catch (_) {
    return () => {}; // Return no-op unsubscribe function
  }
};

/**
 * Get activity statistics
 * @param {Object} options - Statistics options
 */
export const getActivityStats = async (options = {}) => {
  try {
    const activities = await getRecentActivities({
      ...options,
      limit: 1000 // Get more data for statistics
    });

    const stats = {
      total: activities.length,
      byType: {},
      byUser: {},
      byHour: {},
      recentActivity: activities.slice(0, 10)
    };

    activities.forEach(activity => {
      // Count by type
      stats.byType[activity.type] = (stats.byType[activity.type] || 0) + 1;

      // Count by user
      const userKey = activity.userEmail || activity.userId;
      stats.byUser[userKey] = (stats.byUser[userKey] || 0) + 1;

      // Count by hour
      const hour = new Date(activity.timestamp).getHours();
      stats.byHour[hour] = (stats.byHour[hour] || 0) + 1;
    });

    return stats;
  } catch (_) {
    return { total: 0, byType: {}, byUser: {}, byHour: {}, recentActivity: [] };
  }
};

