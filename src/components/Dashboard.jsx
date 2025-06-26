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
  Settings
} from 'lucide-react';

const Dashboard = ({ analytics, editHistory, onNavigate }) => {

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
      recentChanges: editHistory.slice(0, 5)
    };
  }, [analytics, editHistory]);

  const dayNames = { M: 'Monday', T: 'Tuesday', W: 'Wednesday', R: 'Thursday', F: 'Friday' };

  // Quick action cards
  const quickActions = [
    {
      title: 'Schedule Group Meeting',
      description: 'Find available times for multiple faculty',
      icon: Users,
      action: () => onNavigate('scheduling/group-meetings'),
      color: 'bg-blue-500'
    },
    {
      title: 'Check Room Availability',
      description: 'View room schedules and availability',
      icon: MapPin,
      action: () => onNavigate('scheduling/room-schedules'),
      color: 'bg-green-500'
    },
    {
      title: 'Faculty Directory',
      description: 'Contact information and details',
      icon: Users,
      action: () => onNavigate('directory/faculty-directory'),
      color: 'bg-purple-500'
    },
    {
      title: 'Import Data',
      description: 'Update faculty information from CSV',
      icon: Plus,
      action: () => onNavigate('administration/data-import'),
      color: 'bg-orange-500'
    }
  ];

  const MetricCard = ({ title, value, subtitle, icon: Icon, onClick, trend }) => (
    <div 
      className={`bg-white rounded-xl shadow-sm border border-gray-200 p-6 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-3xl font-bold text-baylor-green mt-1">{value}</p>
          {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <div className="p-3 bg-baylor-green/10 rounded-lg">
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

  const QuickActionCard = ({ title, description, icon: Icon, action, color }) => (
    <div 
      className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 cursor-pointer hover:shadow-md transition-all duration-200 group"
      onClick={action}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 group-hover:text-baylor-green transition-colors">{title}</h3>
          <p className="text-sm text-gray-600 mt-1">{description}</p>
        </div>
        <div className={`p-3 ${color} rounded-lg ml-4`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
      <div className="flex items-center mt-4 text-sm text-baylor-green font-medium">
        <span>Get started</span>
        <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
      </div>
    </div>
  );

  if (!metrics) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Data Available</h2>
          <p className="text-gray-600">Upload schedule data to see dashboard metrics</p>
          <button 
            onClick={() => onNavigate('administration/data-import')}
            className="mt-4 px-6 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 transition-colors"
          >
            Import Data
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="bg-gradient-to-r from-baylor-green to-baylor-green/80 rounded-xl text-white p-8">
        <h1 className="text-3xl font-bold mb-2">Davis's HSD Dashboard</h1>
        <p className="text-baylor-gold text-lg">A central dashboard for managing faculty schedules and resources and various other HSD Admin tasks</p>
        <div className="flex items-center mt-4 text-baylor-gold/80">
          <Calendar className="w-5 h-5 mr-2" />
          <span>Fall 2025 Semester</span>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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

      {/* Quick Actions */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {quickActions.map((action, index) => (
            <QuickActionCard key={index} {...action} />
          ))}
        </div>
      </div>

      {/* Recent Activity & Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Changes */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Recent Changes</h3>
            <button 
              onClick={() => onNavigate('analytics/course-management')}
              className="text-sm text-baylor-green hover:text-baylor-green/80 font-medium"
            >
              View all
            </button>
          </div>
          <div className="space-y-3">
            {metrics.recentChanges.length > 0 ? (
              metrics.recentChanges.map((change, index) => (
                <div key={index} className="flex items-start space-x-3 py-2">
                  <div className="w-2 h-2 bg-baylor-gold rounded-full mt-2 flex-shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900">
                      <span className="font-medium">{change.instructor}</span> - {change.course}
                    </p>
                    <p className="text-xs text-gray-500">
                      {change.field} updated • {new Date(change.timestamp).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-sm py-4">No recent changes</p>
            )}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Department Overview</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-600">Unique Courses</span>
              <span className="font-semibold text-baylor-green">{metrics.uniqueCourses}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-600">Adjunct-Taught Sessions</span>
              <span className="font-semibold text-baylor-green">{metrics.adjunctTaughtCourses}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-600">Faculty Utilization</span>
              <span className="font-semibold text-baylor-green">
                {Math.round((metrics.facultyCount / (metrics.facultyCount + 1)) * 100)}%
              </span>
            </div>
            <button 
              onClick={() => onNavigate('analytics/department-insights')}
              className="w-full mt-4 px-4 py-2 bg-baylor-green/10 text-baylor-green rounded-lg hover:bg-baylor-green/20 transition-colors font-medium text-sm"
            >
              View Detailed Analytics
            </button>
          </div>
        </div>
      </div>

      {/* System Links */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">University Systems</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button 
            onClick={() => onNavigate('administration/baylor-systems')}
            className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left"
          >
            <Settings className="w-5 h-5 text-baylor-green mr-3" />
            <div>
              <p className="font-medium text-gray-900">Baylor Systems</p>
              <p className="text-sm text-gray-500">Access official university tools</p>
            </div>
          </button>
          <button 
            onClick={() => onNavigate('analytics/course-management')}
            className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left"
          >
            <FileText className="w-5 h-5 text-baylor-green mr-3" />
            <div>
              <p className="font-medium text-gray-900">Course Data</p>
              <p className="text-sm text-gray-500">Manage schedule information</p>
            </div>
          </button>
          <button 
            onClick={() => onNavigate('directory/faculty-directory')}
            className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left"
          >
            <Search className="w-5 h-5 text-baylor-green mr-3" />
            <div>
              <p className="font-medium text-gray-900">Faculty Search</p>
              <p className="text-sm text-gray-500">Find contact information</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;