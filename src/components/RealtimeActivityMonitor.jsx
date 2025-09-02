import React, { useState, useEffect } from 'react';
import {
  Activity,
  Users,
  Eye,
  MousePointer,
  Search,
  Filter,
  Clock,
  Zap,
  User,
  Globe,
  AlertCircle,
  Download
} from 'lucide-react';
import { subscribeToActivities, ACTIVITY_TYPES } from '../utils/activityLogger';

const RealtimeActivityMonitor = ({
  maxItems = 10,
  showFilters = true,
  compact = false,
  className = ''
}) => {
  const [activities, setActivities] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [filters, setFilters] = useState({
    type: '',
    userId: ''
  });
  const [stats, setStats] = useState({
    totalToday: 0,
    activeUsers: 0,
    currentOnline: 0
  });

  // Real-time subscription
  useEffect(() => {
    const unsubscribe = subscribeToActivities((newActivities) => {
      setActivities(prev => {
        const combined = [...newActivities, ...prev];
        // Remove duplicates and limit to maxItems
        const unique = combined.filter((activity, index, self) =>
          index === self.findIndex(a => a.id === activity.id)
        );
        return unique.slice(0, maxItems);
      });

      // Update stats
      updateStats(newActivities);
      setIsConnected(true);
    }, { limit: maxItems });

    // Connection status check
    const connectionTimer = setInterval(() => {
      // This is a simple connection check - in a real app you'd check WebSocket status
      setIsConnected(prev => prev);
    }, 30000); // Check every 30 seconds

    return () => {
      unsubscribe();
      clearInterval(connectionTimer);
    };
  }, [maxItems]);

  const updateStats = (newActivities) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const todayActivities = newActivities.filter(activity =>
      new Date(activity.timestamp) >= today
    );

    const activeUsers = new Set(todayActivities.map(a => a.userId)).size;

    // Simple online detection: users active in last 5 minutes
    const fiveMinutesAgo = new Date(now - 5 * 60 * 1000);
    const currentOnline = new Set(
      todayActivities
        .filter(a => new Date(a.timestamp) >= fiveMinutesAgo)
        .map(a => a.userId)
    ).size;

    setStats({
      totalToday: todayActivities.length,
      activeUsers,
      currentOnline
    });
  };

  // Get activity icon
  const getActivityIcon = (type) => {
    switch (type) {
      case ACTIVITY_TYPES.PAGE_VIEW: return <Eye className="w-3 h-3" />;
      case ACTIVITY_TYPES.NAVIGATION: return <Globe className="w-3 h-3" />;
      case ACTIVITY_TYPES.SEARCH: return <Search className="w-3 h-3" />;
      case ACTIVITY_TYPES.BUTTON_CLICK: return <MousePointer className="w-3 h-3" />;
      case ACTIVITY_TYPES.LOGIN: return <User className="w-3 h-3" />;
      case ACTIVITY_TYPES.ERROR: return <AlertCircle className="w-3 h-3" />;
      case ACTIVITY_TYPES.EXPORT: return <Download className="w-3 h-3" />;
      default: return <Activity className="w-3 h-3" />;
    }
  };

  // Get activity color
  const getActivityColor = (type) => {
    switch (type) {
      case ACTIVITY_TYPES.PAGE_VIEW: return 'text-blue-600 bg-blue-100';
      case ACTIVITY_TYPES.NAVIGATION: return 'text-green-600 bg-green-100';
      case ACTIVITY_TYPES.SEARCH: return 'text-purple-600 bg-purple-100';
      case ACTIVITY_TYPES.BUTTON_CLICK: return 'text-orange-600 bg-orange-100';
      case ACTIVITY_TYPES.LOGIN: return 'text-emerald-600 bg-emerald-100';
      case ACTIVITY_TYPES.ERROR: return 'text-red-600 bg-red-100';
      case ACTIVITY_TYPES.EXPORT: return 'text-indigo-600 bg-indigo-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  // Format timestamp for display
  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffSeconds = Math.floor((now - date) / 1000);

    if (diffSeconds < 60) return 'Just now';
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
    return date.toLocaleTimeString();
  };

  // Filter activities
  const filteredActivities = activities.filter(activity => {
    if (filters.type && activity.type !== filters.type) return false;
    if (filters.userId && activity.userId !== filters.userId) return false;
    return true;
  });

  if (compact) {
    return (
      <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-4 ${className}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-sm font-medium text-gray-900">Live Activity</span>
          </div>
          <div className="flex items-center space-x-4 text-xs text-gray-500">
            <span>{stats.currentOnline} online</span>
            <span>{stats.totalToday} today</span>
          </div>
        </div>

        <div className="space-y-2 max-h-32 overflow-y-auto">
          {filteredActivities.slice(0, 5).map((activity, index) => (
            <div key={activity.id || index} className="flex items-center space-x-2 text-xs">
              <div className={`p-1 rounded-full ${getActivityColor(activity.type)}`}>
                {getActivityIcon(activity.type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-gray-900 truncate">{activity.action}</p>
                <p className="text-gray-500">{activity.userEmail || 'Anonymous'}</p>
              </div>
              <span className="text-gray-400">{formatTimestamp(activity.timestamp)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Live Activity Monitor</h3>
              <p className="text-sm text-gray-600">
                Real-time user activity across the application
                {isConnected && <span className="text-green-600 ml-1">● Connected</span>}
                {!isConnected && <span className="text-red-600 ml-1">● Disconnected</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Zap className="w-5 h-5 text-orange-500" />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="p-6 border-b border-gray-200">
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-baylor-green">{stats.currentOnline}</div>
            <div className="text-sm text-gray-600">Currently Online</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.activeUsers}</div>
            <div className="text-sm text-gray-600">Active Today</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{stats.totalToday}</div>
            <div className="text-sm text-gray-600">Total Today</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center space-x-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Activity Type</label>
              <select
                value={filters.type}
                onChange={(e) => setFilters({...filters, type: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-baylor-green focus:border-transparent"
              >
                <option value="">All Types</option>
                {Object.values(ACTIVITY_TYPES).map(type => (
                  <option key={type} value={type}>
                    {type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">User</label>
              <input
                type="text"
                placeholder="Filter by user email..."
                value={filters.userId}
                onChange={(e) => setFilters({...filters, userId: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-baylor-green focus:border-transparent"
              />
            </div>
          </div>
        </div>
      )}

      {/* Activity Feed */}
      <div className="p-6">
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {filteredActivities.length > 0 ? (
            filteredActivities.map((activity, index) => (
              <div key={activity.id || index} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <div className={`p-2 rounded-full ${getActivityColor(activity.type)} flex-shrink-0`}>
                  {getActivityIcon(activity.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {activity.action}
                      </p>
                      <div className="flex items-center space-x-2 mt-1">
                        <span className="text-xs text-gray-600">
                          {activity.userEmail || 'Anonymous'}
                        </span>
                        <span className="text-xs text-gray-400">•</span>
                        <span className="text-xs text-gray-600">
                          {activity.page || 'Unknown page'}
                        </span>
                      </div>
                      {activity.element && (
                        <p className="text-xs text-gray-500 mt-1">
                          Element: {activity.element}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">
                        {formatTimestamp(activity.timestamp)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8">
              <Activity className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h4 className="text-lg font-medium text-gray-900 mb-2">No Recent Activity</h4>
              <p className="text-gray-600">
                {filters.type || filters.userId ?
                  'Try adjusting your filters to see more activities.' :
                  'Waiting for user activity to appear...'
                }
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-3 bg-gray-50 border-t border-gray-200">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Auto-refreshing every few seconds</span>
          <span>Showing last {maxItems} activities</span>
        </div>
      </div>
    </div>
  );
};

export default RealtimeActivityMonitor;
