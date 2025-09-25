import React, { useMemo, useState, useEffect } from 'react';
import {
  Users,
  Calendar,
  TrendingUp,
  AlertCircle,
  ChevronRight,
  FileText,
  GraduationCap,
  Building
} from 'lucide-react';
// Recent changes removed from dashboard
import { useAuth } from '../contexts/AuthContext';

const Dashboard = ({ analytics, editHistory, recentChanges = [], onNavigate, selectedSemester }) => {
  const { user, userProfile } = useAuth();

  // Metrics are now derived from the centralized 'analytics' prop
  const metrics = useMemo(() => {
    if (!analytics) return null;

    return {
      facultyCount: analytics.facultyCount,
      adjunctTaughtCourses: analytics.adjunctTaughtSessions,
      roomsInUse: analytics.roomsInUse,
      totalSessions: analytics.totalSessions,
      uniqueCourses: analytics.uniqueCourses,
      busiestDay: analytics.busiestDay
    };
  }, [analytics]);

  const dayNames = { M: 'Monday', T: 'Tuesday', W: 'Wednesday', R: 'Thursday', F: 'Friday' };

  // Quick action cards with updated styling
  const quickActions = [
    {
      title: 'Schedule Group Meeting',
      description: 'Find available times for multiple faculty members',
      icon: Users,
              action: () => onNavigate('scheduling/group-meeting-scheduler'),
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
      action: () => onNavigate('people/people-directory'),
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
          <span className="font-medium">{selectedSemester || 'No semester selected'} Semester</span>
        </div>
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
    </div>
  );
};

export default Dashboard;