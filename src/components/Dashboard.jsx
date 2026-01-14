import React, { useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Calendar,
  AlertCircle,
  ChevronRight,
  FileText,
  GraduationCap,
  Building
} from 'lucide-react';
// Recent changes removed from dashboard
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';

const Dashboard = () => {
  const navigate = useNavigate();
  const { analytics, selectedSemester } = useData();
  const { user, userProfile, canAccess } = useAuth();

  const displayName = userProfile?.displayName || user?.displayName || (user?.email ? user.email.split('@')[0] : '');
  const firstName = displayName ? displayName.split(' ')[0] : 'there';

  const hasAccess = useCallback((pageId) => {
    if (!pageId) return true;
    if (typeof canAccess !== 'function') return true;
    return canAccess(pageId);
  }, [canAccess]);

  const handleNavigate = useCallback((path) => {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    navigate(normalized);
  }, [navigate]);

  const quickActions = useMemo(() => {
    const actions = [
      {
        title: 'Faculty Directory',
        description: 'Contact information and faculty details',
        icon: GraduationCap,
        path: 'people/people-directory',
        color: 'bg-baylor-green',
        textColor: 'text-baylor-green',
        requiredAccess: 'people/people-directory'
      },
      {
        title: 'Student Worker Schedules',
        description: 'See student assignments and availability',
        icon: Users,
        path: 'scheduling/student-schedules',
        color: 'bg-amber-500',
        textColor: 'text-amber-600',
        requiredAccess: 'scheduling/student-schedules'
      },
      {
        title: 'Schedule Group Meeting',
        description: 'Find overlapping availability across faculty',
        icon: Calendar,
        path: 'scheduling/group-meeting-scheduler',
        color: 'bg-baylor-gold',
        textColor: 'text-baylor-gold',
        requiredAccess: 'scheduling/group-meeting-scheduler'
      },
      {
        title: 'Check Room Availability',
        description: 'View classroom schedules in real time',
        icon: Building,
        path: 'scheduling/room-schedules',
        color: 'bg-green-600',
        textColor: 'text-green-600',
        requiredAccess: 'scheduling/room-schedules'
      }
    ];

    if (hasAccess('tools/import-wizard')) {
      actions.push({
        title: 'Import Data',
        description: 'Refresh faculty information and schedules',
        icon: FileText,
        path: 'tools/import-wizard',
        color: 'bg-baylor-gold',
        textColor: 'text-baylor-green',
        requiredAccess: 'tools/import-wizard'
      });
    }

    return actions
      .filter(action => !action.requiredAccess || hasAccess(action.requiredAccess))
      .map(action => ({ ...action, action: () => handleNavigate(action.path) }));
  }, [hasAccess, handleNavigate]);

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

  if (!analytics) {
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
              Once schedule data is available you&apos;ll see tailored quick links here.
            </p>
            {hasAccess('tools/import-wizard') ? (
              <button
                onClick={() => handleNavigate('tools/import-wizard')}
                className="btn-primary"
              >
                <FileText className="w-4 h-4 mr-2 inline-block" />
                Import Data
              </button>
            ) : (
              <p className="text-gray-500 text-sm">
                Need this data? Reach out to an administrator to trigger the next import.
              </p>
            )}
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
        <div className="mt-6 text-white/90 space-y-3">
          <div className="flex items-center">
            <Calendar className="w-5 h-5 mr-2" />
            <span className="font-medium">{selectedSemester || 'No semester selected'} Semester</span>
          </div>
          <p className="text-sm md:text-base">
            Welcome back, {firstName}! Jump into the tools you use most below.
          </p>
        </div>
      </div>
      {/* Quick Actions Section */}
      <div className="mb-8">
        <div className="university-card-header">
          <h2 className="university-card-title">Quick Actions</h2>
          <p className="university-card-subtitle">Common administrative tasks and tools</p>
        </div>
        {quickActions.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            {quickActions.map((action, index) => (
              <QuickActionCard key={`${action.title}-${index}`} {...action} />
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm mt-6">
            No shortcuts are assigned to your role yet. Let us know what you use most and we&apos;ll add it here.
          </p>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
