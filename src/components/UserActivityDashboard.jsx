import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  Users,
  Clock,
  MousePointer,
  Eye,
  Search,
  Filter,
  Download,
  RefreshCw,
  TrendingUp,
  BarChart3,
  PieChart,
  Calendar,
  User,
  Globe,
  AlertCircle,
  Zap
} from 'lucide-react';
import {
  getRecentActivities,
  getActivityStats,
  subscribeToActivities,
  ACTIVITY_TYPES
} from '../utils/activityLogger';
import { db } from '../firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';

const UserActivityDashboard = () => {
  const [activities, setActivities] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [realTimeMode, setRealTimeMode] = useState(false);
  const [userOptions, setUserOptions] = useState([]);
  const [filters, setFilters] = useState({
    userId: '',
    type: '',
    hours: 24
  });

  // Helper function to convert 24-hour to 12-hour format
  const formatHour12 = (hour24) => {
    const hour = parseInt(hour24);
    const period = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${hour12}:00 ${period}`;
  };

  // Load initial data
  useEffect(() => {
    loadActivityData();
  }, [filters]);

  // Real-time subscription
  useEffect(() => {
    let unsubscribe = () => {};

    if (realTimeMode) {
      unsubscribe = subscribeToActivities((newActivities) => {
        setActivities(newActivities);
        calculateStats(newActivities);
      }, { limit: 100, userId: filters.userId || undefined, type: filters.type || undefined });
    }

    return unsubscribe;
  }, [realTimeMode, filters.userId, filters.type]);

  // Load all users for the user filter
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'users'), orderBy('email')));
        const options = snap.docs.map(d => ({ id: d.id, email: d.data().email || d.id }));
        setUserOptions(options);
      } catch (e) {
        console.warn('Failed to load users for activity filter:', e?.code || e);
        setUserOptions([]);
      }
    };
    loadUsers();
  }, []);

  const loadActivityData = async () => {
    setLoading(true);
    try {
      const activityData = await getRecentActivities({
        userId: filters.userId || undefined,
        type: filters.type || undefined,
        hours: filters.hours
      });

      setActivities(activityData);
      calculateStats(activityData);
    } catch (error) {
      console.error('Error loading activity data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = async (activityData) => {
    const statsData = await getActivityStats({ hours: filters.hours });
    setStats(statsData);
  };

  // Group activities by date
  const groupedActivities = useMemo(() => {
    const groups = {};
    activities.forEach(activity => {
      const date = new Date(activity.timestamp).toDateString();
      if (!groups[date]) groups[date] = [];
      groups[date].push(activity);
    });
    return groups;
  }, [activities]);

  // Get activity type icon
  const getActivityIcon = (type) => {
    switch (type) {
      case ACTIVITY_TYPES.PAGE_VIEW: return <Eye className="w-4 h-4" />;
      case ACTIVITY_TYPES.NAVIGATION: return <Globe className="w-4 h-4" />;
      case ACTIVITY_TYPES.SEARCH: return <Search className="w-4 h-4" />;
      case ACTIVITY_TYPES.BUTTON_CLICK: return <MousePointer className="w-4 h-4" />;
      case ACTIVITY_TYPES.LOGIN: return <User className="w-4 h-4" />;
      case ACTIVITY_TYPES.ERROR: return <AlertCircle className="w-4 h-4" />;
      case ACTIVITY_TYPES.EXPORT: return <Download className="w-4 h-4" />;
      default: return <Activity className="w-4 h-4" />;
    }
  };

  // Get activity type color
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

  // Format timestamp
  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMinutes = Math.floor((now - date) / (1000 * 60));

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h ago`;
    return date.toLocaleDateString();
  };

  // Get unique types for filters
  const uniqueTypes = useMemo(() => {
    const types = new Set();
    activities.forEach(activity => types.add(activity.type));
    return Array.from(types).sort();
  }, [activities]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">User Activity Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Monitor and analyze user interactions across the application
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setRealTimeMode(!realTimeMode)}
            className={`btn-secondary flex items-center space-x-2 ${
              realTimeMode ? 'bg-green-100 text-green-700 border-green-300' : ''
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>{realTimeMode ? 'Live' : 'Historical'}</span>
          </button>
          <button
            onClick={loadActivityData}
            className="btn-secondary flex items-center space-x-2"
            disabled={realTimeMode}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Real-time indicator */}
      {realTimeMode && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center space-x-2 text-green-700">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="font-medium">Live Activity Monitoring Active</span>
            <span className="text-sm text-green-600">Real-time updates enabled</span>
          </div>
        </div>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="university-card">
          <div className="university-card-content">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Activities</p>
                <p className="text-3xl font-bold text-baylor-green">{stats.total || 0}</p>
                <p className="text-sm text-gray-500">Last {filters.hours}h</p>
              </div>
              <Activity className="w-8 h-8 text-baylor-green" />
            </div>
          </div>
        </div>

        <div className="university-card">
          <div className="university-card-content">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Active Users</p>
                <p className="text-3xl font-bold text-baylor-green">{Object.keys(stats.byUser || {}).length}</p>
                <p className="text-sm text-gray-500">Unique users</p>
              </div>
              <Users className="w-8 h-8 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="university-card">
          <div className="university-card-content">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Most Active Hour</p>
                <p className="text-3xl font-bold text-baylor-green">
                  {Object.keys(stats.byHour || {}).length > 0 ?
                    formatHour12(Math.max(...Object.keys(stats.byHour).map(h => parseInt(h)))) :
                    '--:--'
                  }
                </p>
                <p className="text-sm text-gray-500">Peak activity</p>
              </div>
              <Clock className="w-8 h-8 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="university-card">
          <div className="university-card-content">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Avg per User</p>
                <p className="text-3xl font-bold text-baylor-green">
                  {stats.total && Object.keys(stats.byUser || {}).length > 0 ?
                    Math.round(stats.total / Object.keys(stats.byUser).length) :
                    0
                  }
                </p>
                <p className="text-sm text-gray-500">Activities per user</p>
              </div>
              <TrendingUp className="w-8 h-8 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="university-card">
        <div className="university-card-content">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-baylor-green">Filters</h3>
            <button
              onClick={() => setFilters({ userId: '', type: '', hours: 24 })}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Clear All
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">User</label>
              <select
                value={filters.userId}
                onChange={(e) => setFilters({...filters, userId: e.target.value})}
                className="input-field"
              >
                <option value="">All Users</option>
                {userOptions.map(u => (
                  <option key={u.id} value={u.id}>{u.email}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Activity Type</label>
              <select
                value={filters.type}
                onChange={(e) => setFilters({...filters, type: e.target.value})}
                className="input-field"
              >
                <option value="">All Types</option>
                {uniqueTypes.map(type => (
                  <option key={type} value={type}>
                    {type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Time Range</label>
              <select
                value={filters.hours}
                onChange={(e) => setFilters({...filters, hours: parseInt(e.target.value)})}
                className="input-field"
              >
                <option value={1}>Last Hour</option>
                <option value={6}>Last 6 Hours</option>
                <option value={24}>Last 24 Hours</option>
                <option value={72}>Last 3 Days</option>
                <option value={168}>Last Week</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Quick Actions</label>
              <div className="flex space-x-2">
                <button
                  onClick={() => setFilters({...filters, type: ACTIVITY_TYPES.ERROR})}
                  className="px-3 py-2 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
                >
                  Errors
                </button>
                <button
                  onClick={() => setFilters({...filters, type: ACTIVITY_TYPES.SEARCH})}
                  className="px-3 py-2 text-sm bg-purple-100 text-purple-700 rounded hover:bg-purple-200"
                >
                  Searches
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Activity Type Breakdown */}
      <div className="university-card">
        <div className="university-card-header">
          <h3 className="university-card-title">Activity Breakdown</h3>
          <p className="text-sm text-gray-600">Distribution of activity types</p>
        </div>
        <div className="university-card-content">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {Object.entries(stats.byType || {}).map(([type, count]) => (
              <div key={type} className="text-center">
                <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full mb-2 ${getActivityColor(type)}`}>
                  {getActivityIcon(type)}
                </div>
                <p className="text-2xl font-bold text-gray-900">{count}</p>
                <p className="text-xs text-gray-600">
                  {type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Activity Timeline */}
      <div className="university-card">
        <div className="university-card-header">
          <h3 className="university-card-title">Recent Activity Timeline</h3>
          <p className="text-sm text-gray-600">Latest user interactions</p>
        </div>
        <div className="university-card-content">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-8 h-8 animate-spin text-baylor-green" />
              <span className="ml-2 text-gray-600">Loading activities...</span>
            </div>
          ) : activities.length > 0 ? (
            <div className="space-y-6">
              {Object.entries(groupedActivities).map(([date, dayActivities]) => (
                <div key={date}>
                  <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <Calendar className="w-5 h-5 mr-2 text-baylor-green" />
                    {date}
                    <span className="ml-2 text-sm font-normal text-gray-500">
                      ({dayActivities.length} activities)
                    </span>
                  </h4>
                  <div className="space-y-3">
                    {dayActivities.map((activity, index) => (
                      <div key={activity.id || index} className="flex items-start space-x-4 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                        <div className={`p-2 rounded-full ${getActivityColor(activity.type)}`}>
                          {getActivityIcon(activity.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900">
                                {activity.action}
                              </p>
                              <div className="flex items-center space-x-4 mt-1 text-xs text-gray-500">
                                <span>{activity.userEmail || 'Anonymous'}</span>
                                <span>•</span>
                                <span>{activity.page}</span>
                                {activity.component && (
                                  <>
                                    <span>•</span>
                                    <span>{activity.component}</span>
                                  </>
                                )}
                              </div>
                              {activity.element && (
                                <p className="text-xs text-gray-600 mt-1">
                                  Element: {activity.element}
                                </p>
                              )}
                              {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                                <details className="mt-2">
                                  <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-800">
                                    View details
                                  </summary>
                                  <div className="mt-2 p-2 bg-white rounded text-xs">
                                    <pre className="whitespace-pre-wrap">
                                      {JSON.stringify(activity.metadata, null, 2)}
                                    </pre>
                                  </div>
                                </details>
                              )}
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-gray-500">
                                {new Date(activity.timestamp).toLocaleTimeString()}
                              </p>
                              <p className="text-xs text-gray-400">
                                {formatTimestamp(activity.timestamp)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Activity className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Activities Found</h3>
              <p className="text-gray-500">
                {filters.userId || filters.type ?
                  'Try adjusting your filters to see more activities.' :
                  'No user activities have been recorded yet.'
                }
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserActivityDashboard;
