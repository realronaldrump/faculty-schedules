/**
 * Recent Changes Display Utilities
 * 
 * Functions to fetch and format recent changes from the centralized change log
 */

import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Fetch recent changes from the centralized change log
 * @param {number} limitCount - Number of recent changes to fetch (default: 50)
 * @returns {Array} Array of change log entries
 */
export const fetchRecentChanges = async (limitCount = 50) => {
  try {
    const changesQuery = query(
      collection(db, 'changeLog'),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );
    
    const snapshot = await getDocs(changesQuery);
    const changes = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    return changes;
  } catch (error) {
    console.error('Error fetching recent changes:', error);
    return [];
  }
};

/**
 * Format change log entry for display
 * @param {Object} change - Change log entry
 * @returns {Object} Formatted change with display properties
 */
export const formatChangeForDisplay = (change) => {
  const timeAgo = getTimeAgo(change.timestamp);
  
  return {
    ...change,
    timeAgo,
    displayAction: getDisplayAction(change.action),
    displayEntity: change.entity,
    displaySource: getDisplaySource(change.source),
    actionColor: getActionColor(change.action)
  };
};

/**
 * Get display-friendly action name
 * @param {string} action - Raw action type
 * @returns {string} Display-friendly action
 */
const getDisplayAction = (action) => {
  const actionMap = {
    'CREATE': 'Created',
    'UPDATE': 'Updated',
    'DELETE': 'Deleted',
    'IMPORT': 'Imported',
    'STANDARDIZE': 'Standardized',
    'MERGE': 'Merged',
    'BULK_UPDATE': 'Bulk Updated',
    'BATCH_OPERATION': 'Batch Operation',
    'UPDATE_GROUPED': 'Updated Group'
  };
  
  return actionMap[action] || action;
};

/**
 * Get display-friendly source name
 * @param {string} source - Raw source
 * @returns {string} Display-friendly source
 */
const getDisplaySource = (source) => {
  if (!source) return 'System';
  
  // Extract component/file name from path
  const parts = source.split(' - ');
  if (parts.length > 1) {
    const location = parts[0];
    const cleanLocation = location
      .replace('.jsx', '')
      .replace('.js', '')
      .replace(/.*\//, '') // Remove path
      .replace(/([A-Z])/g, ' $1') // Add space before capital letters
      .trim();
    
    return cleanLocation || 'System';
  }
  
  return source;
};

/**
 * Get color class for action type
 * @param {string} action - Action type
 * @returns {string} Tailwind color class
 */
const getActionColor = (action) => {
  const colorMap = {
    'CREATE': 'text-green-600',
    'UPDATE': 'text-blue-600',
    'DELETE': 'text-red-600',
    'IMPORT': 'text-purple-600',
    'STANDARDIZE': 'text-yellow-600',
    'MERGE': 'text-orange-600',
    'BULK_UPDATE': 'text-indigo-600',
    'BATCH_OPERATION': 'text-gray-600',
    'UPDATE_GROUPED': 'text-blue-500'
  };
  
  return colorMap[action] || 'text-gray-600';
};

/**
 * Calculate time ago from timestamp
 * @param {string} timestamp - ISO timestamp
 * @returns {string} Human-readable time ago
 */
const getTimeAgo = (timestamp) => {
  if (!timestamp) return 'Unknown time';
  
  const now = new Date();
  const changeTime = new Date(timestamp);
  const diffMs = now - changeTime;
  
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMinutes < 1) {
    return 'Just now';
  } else if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  } else {
    return changeTime.toLocaleDateString();
  }
};

/**
 * Group changes by date for better organization
 * @param {Array} changes - Array of change entries
 * @returns {Object} Changes grouped by date
 */
export const groupChangesByDate = (changes) => {
  const groups = {};
  
  changes.forEach(change => {
    const date = new Date(change.timestamp).toDateString();
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(formatChangeForDisplay(change));
  });
  
  return groups;
};

/**
 * Get summary statistics for changes
 * @param {Array} changes - Array of change entries
 * @returns {Object} Summary statistics
 */
export const getChangeSummary = (changes) => {
  const summary = {
    total: changes.length,
    today: 0,
    thisWeek: 0,
    byAction: {},
    byCollection: {},
    bySource: {}
  };
  
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart.getTime() - (7 * 24 * 60 * 60 * 1000));
  
  changes.forEach(change => {
    const changeTime = new Date(change.timestamp);
    
    // Count by time period
    if (changeTime >= todayStart) {
      summary.today++;
    }
    if (changeTime >= weekStart) {
      summary.thisWeek++;
    }
    
    // Count by action
    summary.byAction[change.action] = (summary.byAction[change.action] || 0) + 1;
    
    // Count by collection
    summary.byCollection[change.collection] = (summary.byCollection[change.collection] || 0) + 1;
    
    // Count by source
    const source = getDisplaySource(change.source);
    summary.bySource[source] = (summary.bySource[source] || 0) + 1;
  });
  
  return summary;
};