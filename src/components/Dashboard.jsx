import React, { useMemo, useCallback } from 'react';
import {
  Users,
  Calendar,
  AlertCircle,
  ChevronRight,
  FileText,
  GraduationCap,
  Building,
  Clock,
  DoorOpen,
  UserCheck,
  Timer
} from 'lucide-react';
// Recent changes removed from dashboard
import { useAuth } from '../contexts/AuthContext';

const Dashboard = ({ analytics, editHistory, recentChanges = [], onNavigate, selectedSemester }) => {
  const { user, userProfile, canAccess } = useAuth();

  const displayName = userProfile?.displayName || user?.displayName || (user?.email ? user.email.split('@')[0] : '');
  const firstName = displayName ? displayName.split(' ')[0] : 'there';

  const hasAccess = useCallback((pageId) => {
    if (!pageId) return true;
    if (typeof canAccess !== 'function') return true;
    return canAccess(pageId);
  }, [canAccess]);

  const formatMinutes = (minutes) => {
    if (minutes === null || minutes === undefined || minutes === Number.POSITIVE_INFINITY) {
      return 'No upcoming bookings';
    }
    if (minutes <= 0) {
      return 'Now';
    }
    const rounded = Math.round(minutes);
    if (rounded < 60) {
      return `${rounded} min`;
    }
    const hours = Math.floor(rounded / 60);
    const mins = rounded % 60;
    if (mins === 0) {
      return `${hours} hr${hours > 1 ? 's' : ''}`;
    }
    return `${hours}h ${mins}m`;
  };

  const formatCourseLabel = (courseCode, section) => {
    if (!courseCode && !section) return 'Course';
    if (courseCode && section) return `${courseCode} • ${section}`;
    return courseCode || section || 'Course';
  };

  const quickActions = useMemo(() => {
    const actions = [
      {
        title: 'Faculty Directory',
        description: 'Contact information and faculty details',
        icon: GraduationCap,
        path: 'people/people-directory',
        color: 'bg-purple-600',
        textColor: 'text-purple-600',
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
        color: 'bg-blue-600',
        textColor: 'text-blue-600',
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

    if (hasAccess('administration/import-wizard')) {
      actions.push({
        title: 'Import Data',
        description: 'Refresh faculty information and schedules',
        icon: FileText,
        path: 'administration/import-wizard',
        color: 'bg-baylor-gold',
        textColor: 'text-baylor-green',
        requiredAccess: 'administration/import-wizard'
      });
    }

    return actions
      .filter(action => !action.requiredAccess || hasAccess(action.requiredAccess))
      .map(action => ({ ...action, action: () => onNavigate(action.path) }));
  }, [hasAccess, onNavigate]);

  const summaryCards = useMemo(() => {
    if (!analytics) return [];
    const liveSnapshot = analytics.liveSnapshot || {};
    const roomStats = analytics.roomStats || {};
    const facultyStats = analytics.facultyStats || {};
    const nextRelease = roomStats.releasingSoon && roomStats.releasingSoon[0];

    return [
      {
        title: 'Classes in Session',
        value: liveSnapshot.totals?.activeClasses ?? 0,
        subtitle: `${liveSnapshot.currentDayLabel || 'Today'} overview`,
        icon: Calendar,
        accent: 'bg-blue-100 text-blue-700'
      },
      {
        title: 'Rooms Occupied',
        value: `${roomStats.roomsInUseNow ?? 0}/${roomStats.totalRoomsToday ?? 0}`,
        subtitle: `${roomStats.occupancyRate ?? 0}% utilization`,
        icon: Building,
        accent: 'bg-green-100 text-green-700'
      },
      {
        title: 'Faculty Teaching Now',
        value: facultyStats.currentlyTeachingCount ?? 0,
        subtitle: `${facultyStats.totalScheduledToday ?? 0} scheduled today`,
        icon: Users,
        accent: 'bg-amber-100 text-amber-700'
      },
      {
        title: 'Next Room Free',
        value: nextRelease ? formatMinutes(nextRelease.minutesUntilFree) : 'All clear',
        subtitle: nextRelease ? `${nextRelease.room} wrapping ${nextRelease.endTime || ''}`.trim() : 'No rooms in session',
        icon: DoorOpen,
        accent: 'bg-purple-100 text-purple-700'
      }
    ];
  }, [analytics]);

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
            {hasAccess('administration/import-wizard') ? (
              <button 
                onClick={() => onNavigate('administration/import-wizard')}
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

      {summaryCards.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
          {summaryCards.map((card, index) => {
            const IconComponent = card.icon;
            return (
              <div key={`${card.title}-${index}`} className="university-card">
                <div className="university-card-content flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">{card.title}</p>
                    <p className="text-3xl font-semibold text-baylor-green mt-3">{card.value}</p>
                    <p className="text-xs text-gray-500 mt-3">{card.subtitle}</p>
                  </div>
                  <div className={`${card.accent} rounded-xl p-3`}> 
                    <IconComponent className="w-5 h-5" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Live department snapshot */}
      <div className="university-card mb-8">
        <div className="university-card-header">
          <h2 className="university-card-title">Live Department Snapshot</h2>
          <p className="university-card-subtitle">
            Real-time overview of {(analytics.liveSnapshot?.currentDayLabel || 'today')}&apos;s teaching activity
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-6 mt-6">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Clock className="w-4 h-4 text-baylor-green" />
                Classes in Session
              </div>
              <span className="text-xs text-gray-500">
                {analytics.liveSnapshot?.totals?.activeClasses ?? 0} total today
              </span>
            </div>
            <div className="space-y-4">
              {analytics.liveSnapshot?.classesInSession?.length ? (
                analytics.liveSnapshot.classesInSession.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 border border-gray-100 rounded-xl hover:border-baylor-gold/60 transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {formatCourseLabel(item.courseCode, item.section)}
                        </p>
                        {item.courseTitle && (
                          <p className="text-xs text-gray-500 mt-1">{item.courseTitle}</p>
                        )}
                        <p className="text-xs text-gray-500 mt-3">
                          {item.instructor} • {item.room}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-baylor-green">
                          {item.startTime} – {item.endTime}
                        </p>
                        <p className="text-xs text-amber-600 mt-2">
                          {formatMinutes(item.minutesUntilEnd)} remaining
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4 border border-dashed border-gray-200 rounded-xl text-sm text-gray-500 bg-gray-50">
                  No classes are in session right now.
                </div>
              )}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Timer className="w-4 h-4 text-baylor-green" />
                Starting in the Next Hour
              </div>
              <span className="text-xs text-gray-500">
                {analytics.liveSnapshot?.totals?.upcomingClasses ?? 0} total upcoming
              </span>
            </div>
            <div className="space-y-4">
              {analytics.liveSnapshot?.upcomingClasses?.length ? (
                analytics.liveSnapshot.upcomingClasses.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 border border-gray-100 rounded-xl hover:border-baylor-gold/60 transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {formatCourseLabel(item.courseCode, item.section)}
                        </p>
                        {item.courseTitle && (
                          <p className="text-xs text-gray-500 mt-1">{item.courseTitle}</p>
                        )}
                        <p className="text-xs text-gray-500 mt-3">
                          {item.instructor} • {item.room}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-baylor-green">{item.startTime}</p>
                        <p className="text-xs text-amber-600 mt-2">
                          Starts in {formatMinutes(item.minutesUntilStart)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4 border border-dashed border-gray-200 rounded-xl text-sm text-gray-500 bg-gray-50">
                  No classes are starting in the next hour.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Room availability */}
      <div className="university-card mb-8">
        <div className="university-card-header">
          <h2 className="university-card-title">Room Availability</h2>
          <p className="university-card-subtitle">
            {analytics.roomStats?.occupancyRate ?? 0}% of rooms in use • {analytics.roomStats?.roomsIdleNow ?? 0} open now
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-6 mt-6">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <DoorOpen className="w-4 h-4 text-baylor-green" />
              Open Right Now
            </h3>
            <div className="space-y-3">
              {analytics.roomStats?.freeRooms?.length ? (
                analytics.roomStats.freeRooms.map((room) => (
                  <div
                    key={room.room}
                    className="p-4 border border-gray-100 rounded-xl hover:border-baylor-gold/60 transition-shadow"
                  >
                    <p className="text-sm font-semibold text-gray-900">{room.room}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {room.minutesUntilNext !== null && room.minutesUntilNext !== Number.POSITIVE_INFINITY
                        ? `Next class in ${formatMinutes(room.minutesUntilNext)}${room.nextStartTime ? ` • ${room.nextStartTime}` : ''}`
                        : 'No more classes scheduled today'}
                    </p>
                    {room.nextCourse && (
                      <p className="text-xs text-gray-400 mt-1">
                        {room.nextCourse}{room.nextInstructor ? ` • ${room.nextInstructor}` : ''}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <div className="p-4 border border-dashed border-gray-200 rounded-xl text-sm text-gray-500 bg-gray-50">
                  All scheduled rooms are currently in use.
                </div>
              )}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-baylor-green" />
              Releasing Soon
            </h3>
            <div className="space-y-3">
              {analytics.roomStats?.releasingSoon?.length ? (
                analytics.roomStats.releasingSoon.map((room) => (
                  <div
                    key={room.room}
                    className="p-4 border border-gray-100 rounded-xl hover:border-baylor-gold/60 transition-shadow"
                  >
                    <p className="text-sm font-semibold text-gray-900">{room.room}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {room.currentCourse}{room.currentInstructor ? ` • ${room.currentInstructor}` : ''}
                    </p>
                    <p className="text-xs text-amber-600 mt-2">
                      Free in {formatMinutes(room.minutesUntilFree)}{room.endTime ? ` • ${room.endTime}` : ''}
                    </p>
                  </div>
                ))
              ) : (
                <div className="p-4 border border-dashed border-gray-200 rounded-xl text-sm text-gray-500 bg-gray-50">
                  No rooms are wrapping up in the next half hour.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Faculty availability */}
      <div className="university-card mb-8">
        <div className="university-card-header">
          <h2 className="university-card-title">Faculty Availability</h2>
          <p className="university-card-subtitle">
            {analytics.facultyStats?.currentlyTeachingCount ?? 0} teaching now • {analytics.facultyStats?.availableNowCount ?? 0} available • {analytics.facultyStats?.returningSoonCount ?? 0} wrapping up shortly
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-6 mt-6">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Users className="w-4 h-4 text-baylor-green" />
              Teaching Right Now
            </h3>
            <div className="space-y-3">
              {analytics.facultyStats?.currentlyTeaching?.length ? (
                analytics.facultyStats.currentlyTeaching.map((faculty) => (
                  <div
                    key={faculty.name}
                    className="p-4 border border-gray-100 rounded-xl hover:border-baylor-gold/60 transition-shadow"
                  >
                    <p className="text-sm font-semibold text-gray-900">{faculty.name}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {faculty.currentCourse}{faculty.currentRoom ? ` • ${faculty.currentRoom}` : ''}
                    </p>
                    <p className="text-xs text-amber-600 mt-2">
                      Free in {formatMinutes(faculty.minutesUntilFree)}{faculty.currentEndTime ? ` • ${faculty.currentEndTime}` : ''}
                    </p>
                  </div>
                ))
              ) : (
                <div className="p-4 border border-dashed border-gray-200 rounded-xl text-sm text-gray-500 bg-gray-50">
                  No faculty are actively teaching right now.
                </div>
              )}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-baylor-green" />
              Available Now
            </h3>
            <div className="space-y-3">
              {analytics.facultyStats?.availableNow?.length ? (
                analytics.facultyStats.availableNow.map((faculty) => (
                  <div
                    key={faculty.name}
                    className="p-4 border border-gray-100 rounded-xl hover:border-baylor-gold/60 transition-shadow"
                  >
                    <p className="text-sm font-semibold text-gray-900">{faculty.name}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {faculty.nextCourse
                        ? `Next: ${faculty.nextCourse}${faculty.nextRoom ? ` • ${faculty.nextRoom}` : ''}`
                        : 'No remaining classes today'}
                    </p>
                    <p className="text-xs text-baylor-green mt-2">
                      {faculty.nextStartMinutes !== null && faculty.nextStartMinutes !== Number.POSITIVE_INFINITY
                        ? `Free for ${formatMinutes(faculty.nextStartMinutes)}`
                        : 'Available for the rest of the day'}
                    </p>
                  </div>
                ))
              ) : (
                <div className="p-4 border border-dashed border-gray-200 rounded-xl text-sm text-gray-500 bg-gray-50">
                  All scheduled faculty are currently teaching.
                </div>
              )}
            </div>
          </div>
          {analytics.facultyStats?.availableSoon?.length ? (
            <div className="md:col-span-2 bg-baylor-green/5 border border-baylor-green/30 rounded-xl p-4 mt-2">
              <p className="text-sm font-semibold text-baylor-green mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Wrapping up in the next 30 minutes
              </p>
              <div className="flex flex-wrap gap-3">
                {analytics.facultyStats.availableSoon.map((faculty) => (
                  <div
                    key={faculty.name}
                    className="px-4 py-2 bg-white border border-baylor-green/40 rounded-lg text-sm shadow-sm"
                  >
                    <span className="font-semibold text-baylor-green">{faculty.name}</span>
                    <span className="text-gray-500 ml-2">
                      {formatMinutes(faculty.minutesUntilFree)} remaining
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
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
