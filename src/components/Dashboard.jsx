import React, { useMemo } from 'react';
import { 
  Users, 
  Calendar, 
  MapPin, 
  BookOpen, 
  Clock, 
  TrendingUp, 
  AlertCircle,
  ChevronRight,
  Plus,
  Search,
  FileText,
  Settings,
  GraduationCap,
  Building
} from 'lucide-react';
import { formatChangeForDisplay } from '../utils/recentChanges';

const Dashboard = ({ analytics, editHistory, recentChanges = [], onNavigate, selectedSemester }) => {

  // Metrics are now derived from the centralized 'analytics' prop
  const metrics = useMemo(() => {
    if (!analytics) return null;

    return {
      facultyCount: analytics.facultyCount,
      adjunctTaughtCourses: analytics.adjunctTaughtSessions,
      roomsInUse: analytics.roomsInUse,
      totalSessions: analytics.totalSessions,
      uniqueCourses: analytics.uniqueCourses,
      busiestDay: analytics.busiestDay,
      recentChanges: recentChanges.slice(0, 5)
    };
  }, [analytics, recentChanges]);

  const dayNames = { M: 'Monday', T: 'Tuesday', W: 'Wednesday', R: 'Thursday', F: 'Friday' };

  // Quick action cards with updated styling
  const quickActions = [
    {
      title: 'Schedule Group Meeting',
      description: 'Find available times for multiple faculty members',
      icon: Users,
      action: () => onNavigate('scheduling/group-meetings'),
      color: 'bg-blue-600',
      textColor: 'text-blue-600'
    },
    {
      title: 'Check Room Availability',
      description: 'View room schedules and classroom availability',
      icon: Building,
      action: () => onNavigate('scheduling/room-schedules'),
      color: 'bg-green-600',
      textColor: 'text-green-600'
    },
    {
      title: 'Faculty Directory',
      description: 'Contact information and faculty details',
      icon: GraduationCap,
      action: () => onNavigate('directory/faculty-directory'),
      color: 'bg-purple-600',
      textColor: 'text-purple-600'
    },
    {
      title: 'Import Data',
      description: 'Update faculty information and schedules',
      icon: FileText,
      action: () => onNavigate('administration/smart-import'),
      color: 'bg-baylor-gold',
      textColor: 'text-baylor-green'
    }
  ];

  const MetricCard = ({ title, value, subtitle, icon: Icon, onClick, trend }) => (
    <div 
      className={`metric-card group ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="metric-label">{title}</p>
          <p className="metric-value">{value}</p>
          {subtitle && <p className="metric-subtitle">{subtitle}</p>}
        </div>
        <div className="metric-icon">
          <Icon className="w-6 h-6 text-baylor-green" />
        </div>
      </div>
      {trend && (
        <div className="flex items-center mt-4 text-sm">
          <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
          <span className="text-green-500 font-medium">{trend}</span>
        </div>
      )}
    </div>
  );

  const QuickActionCard = ({ title, description, icon: Icon, action, color, textColor }) => (
    <div 
      className="university-card cursor-pointer group hover:shadow-lg transition-all duration-300 hover:scale-[1.02]"
      onClick={action}
    >
      <div className="university-card-content">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-baylor-green group-hover:text-baylor-gold transition-colors">
              {title}
            </h3>
            <p className="text-gray-600 mt-1 text-sm leading-relaxed">{description}</p>
          </div>
          <div className={`p-3 ${color} rounded-xl ml-4 group-hover:scale-110 transition-transform`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
        </div>
        <div className="flex items-center mt-4 text-sm font-medium group-hover:translate-x-1 transition-transform">
          <span className={textColor}>Get started</span>
          <ChevronRight className="w-4 h-4 ml-1" />
        </div>
      </div>
    </div>
  );

  if (!metrics) {
    return (
      <div className="page-content">
        {/* University System Header */}
        <div className="page-header">
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Faculty Schedule Management System</p>
        </div>
        
        <div className="university-card">
          <div className="university-card-content text-center py-12">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-10 h-10 text-gray-400" />
            </div>
            <h2 className="text-2xl font-semibold text-gray-900 mb-3">No Data Available</h2>
            <p className="text-gray-600 mb-8 max-w-md mx-auto leading-relaxed">
              Import schedule data to see dashboard metrics and faculty information
            </p>
            <button 
              onClick={() => onNavigate('administration/smart-import')}
              className="btn-primary"
            >
              <FileText className="w-4 h-4 mr-2 inline-block" />
              Import Data
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      {/* Professional University Header */}
      <div className="university-header rounded-xl p-8 mb-8">
        <div className="university-brand">
          <div className="university-logo">
            <GraduationCap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="university-title">HSD Faculty Dashboard</h1>
            <p className="university-subtitle">
              Central management system for Human Sciences & Design faculty schedules and resources
            </p>
          </div>
        </div>
        <div className="flex items-center mt-6 text-white/90">
          <Calendar className="w-5 h-5 mr-2" />
          <span className="font-medium">{selectedSemester || 'Fall 2025'} Semester</span>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <MetricCard
          title="Faculty Members"
          value={metrics.facultyCount}
          subtitle="Active this semester"
          icon={Users}
          onClick={() => onNavigate('directory/faculty-directory')}
        />
        <MetricCard
          title="Weekly Sessions"
          value={metrics.totalSessions}
          subtitle={`${metrics.adjunctTaughtCourses} adjunct-taught`}
          icon={BookOpen}
          onClick={() => onNavigate('analytics/course-management')}
        />
        <MetricCard
          title="Classrooms"
          value={metrics.roomsInUse}
          subtitle="In active use"
          icon={MapPin}
          onClick={() => onNavigate('scheduling/room-schedules')}
        />
        <MetricCard
          title="Busiest Day"
          value={dayNames[metrics.busiestDay.day]?.substring(0, 3) || 'N/A'}
          subtitle={`${metrics.busiestDay.count} sessions`}
          icon={Clock}
          onClick={() => onNavigate('analytics/department-insights')}
        />
      </div>

      {/* Quick Actions Section */}
      <div className="mb-8">
        <div className="university-card-header">
          <h2 className="university-card-title">Quick Actions</h2>
          <p className="university-card-subtitle">Common administrative tasks and tools</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          {quickActions.map((action, index) => (
            <QuickActionCard key={index} {...action} />
          ))}
        </div>
      </div>

      {/* Recent Activity & System Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Changes */}
        <div className="university-card">
          <div className="university-card-header">
            <h3 className="university-card-title">Recent Changes</h3>
            <button 
              onClick={() => onNavigate('analytics/recent-changes')}
              className="btn-ghost text-sm"
            >
              View all
            </button>
          </div>
          <div className="university-card-content">
            <div className="space-y-4">
              {metrics.recentChanges.length > 0 ? (
                metrics.recentChanges.map((change, index) => {
                  const formattedChange = formatChangeForDisplay(change);
                  return (
                    <div key={change.id || index} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                      <div className="w-2 h-2 bg-baylor-green rounded-full mt-2 flex-shrink-0"></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          <span className={`${formattedChange.actionColor} font-semibold`}>
                            {formattedChange.displayAction}
                          </span>
                          {' '}- {formattedChange.displayEntity}
                        </p>
                        {formattedChange.detailedDescription && (
                          <p className="text-xs text-gray-600 mt-1 truncate">
                            {formattedChange.detailedDescription}
                          </p>
                        )}
                        <div className="flex items-center justify-between mt-1">
                          <p className="text-xs text-gray-500">
                            {formattedChange.timeAgo}
                          </p>
                          <p className="text-xs text-gray-400">
                            {formattedChange.displaySource}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8">
                  <Clock className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 text-sm">No recent changes</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* System Information */}
        <div className="university-card">
          <div className="university-card-header">
            <h3 className="university-card-title">System Information</h3>
          </div>
          <div className="university-card-content">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-sm font-medium text-gray-900">System Status</span>
                </div>
                <span className="status-badge status-success">Online</span>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <Users className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-gray-900">Active Faculty</span>
                </div>
                <span className="text-sm font-semibold text-blue-600">{metrics.facultyCount}</span>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-baylor-green/5 rounded-lg">
                <div className="flex items-center space-x-3">
                  <Calendar className="w-4 h-4 text-baylor-green" />
                  <span className="text-sm font-medium text-gray-900">Current Semester</span>
                </div>
                <span className="text-sm font-semibold text-baylor-green">{selectedSemester}</span>
              </div>
              
              <div className="pt-4 border-t border-gray-100">
                <button 
                  onClick={() => onNavigate('administration/baylor-systems')}
                  className="btn-secondary w-full justify-center"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  System Administration
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;