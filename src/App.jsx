import React, { useState, useEffect, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import GroupMeetings from './components/scheduling/GroupMeetings.jsx';
import IndividualAvailability from './components/scheduling/IndividualAvailability';
import RoomSchedules from './components/scheduling/RoomSchedules';
import FacultyDirectory from './components/FacultyDirectory';
import StaffDirectory from './components/StaffDirectory';
import DepartmentInsights from './components/analytics/DepartmentInsights.jsx';
import CourseManagement from './components/analytics/CourseManagement';
import DataImportPage from './components/DataImportPage';
import SystemsPage from './components/SystemsPage';
import MigrationPage from './components/MigrationPage';
import Login from './components/Login';
import { Home, Calendar, Users, BarChart3, Settings, Bell, Search, User } from 'lucide-react';
import { db } from './firebase';
import { collection, getDocs, doc, updateDoc, addDoc, query, orderBy, writeBatch, getDoc } from 'firebase/firestore';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // Raw data from Firebase
  const [rawScheduleData, setRawScheduleData] = useState([]);
  const [rawFaculty, setRawFaculty] = useState([]);
  const [rawStaff, setRawStaff] = useState([]);
  const [rawCourses, setRawCourses] = useState([]);
  const [rawRooms, setRawRooms] = useState([]);
  const [editHistory, setEditHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  // Lookup maps for efficient access
  const [lookupMaps, setLookupMaps] = useState({
    faculty: {},
    staff: {},
    courses: {},
    rooms: {}
  });

  // Navigation structure
  const navigationItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: Home,
      path: 'dashboard'
    },
    {
      id: 'scheduling',
      label: 'Scheduling',
      icon: Calendar,
      children: [
        { id: 'group-meetings', label: 'Group Meetings', path: 'scheduling/group-meetings' },
        { id: 'individual-availability', label: 'Individual Availability', path: 'scheduling/individual-availability' },
        { id: 'room-schedules', label: 'Room Schedules', path: 'scheduling/room-schedules' }
      ]
    },
    {
      id: 'directory',
      label: 'Directory',
      icon: Users,
      children: [
        { id: 'faculty-directory', label: 'Faculty Directory', path: 'directory/faculty-directory' },
        { id: 'staff-directory', label: 'Staff Directory', path: 'directory/staff-directory' }
      ]
    },
    {
      id: 'analytics',
      label: 'Data & Analytics',
      icon: BarChart3,
      children: [
        { id: 'department-insights', label: 'Department Insights', path: 'analytics/department-insights' },
        { id: 'course-management', label: 'Course Management', path: 'analytics/course-management' }
      ]
    },
    {
      id: 'administration',
      label: 'Administration',
      icon: Settings,
      children: [
        { id: 'data-import', label: 'Data Import', path: 'administration/data-import' },
        { id: 'database-migration', label: 'Database Migration', path: 'administration/database-migration' },
        { id: 'baylor-systems', label: 'Baylor Systems', path: 'administration/baylor-systems' }
      ]
    }
  ];

  // Create lookup maps from raw data
  useEffect(() => {
    const facultyMap = {};
    const staffMap = {};
    const coursesMap = {};
    const roomsMap = {};

    rawFaculty.forEach(faculty => {
      facultyMap[faculty.id] = faculty;
    });

    rawStaff.forEach(staff => {
      staffMap[staff.id] = staff;
    });

    rawCourses.forEach(course => {
      coursesMap[course.id] = course;
    });

    rawRooms.forEach(room => {
      roomsMap[room.id] = room;
    });

    setLookupMaps({
      faculty: facultyMap,
      staff: staffMap,
      courses: coursesMap,
      rooms: roomsMap
    });
  }, [rawFaculty, rawStaff, rawCourses, rawRooms]);

  // Denormalized schedule data for easy component consumption
  const scheduleData = useMemo(() => {
    return rawScheduleData.map(schedule => ({
      ...schedule,
      // Resolve references to actual names for display
      Instructor: schedule.facultyId ? (lookupMaps.faculty[schedule.facultyId]?.name || 'Unknown Faculty') : 'Staff',
      Course: schedule.courseId ? (lookupMaps.courses[schedule.courseId]?.courseCode || schedule.courseCode || 'Unknown Course') : (schedule.courseCode || 'Unknown Course'),
      'Course Title': schedule.courseId ? (lookupMaps.courses[schedule.courseId]?.title || schedule.courseTitle || '') : (schedule.courseTitle || ''),
      Room: schedule.roomId ? (lookupMaps.rooms[schedule.roomId]?.name || schedule.roomName || 'Unknown Room') : (schedule.roomName || 'Unknown Room'),
      // Keep the original IDs for database operations
      facultyId: schedule.facultyId,
      courseId: schedule.courseId,
      roomId: schedule.roomId
    }));
  }, [rawScheduleData, lookupMaps]);

  // Centralized Analytics Calculation
  const departmentAnalytics = useMemo(() => {
    if (scheduleData.length === 0) return null;

    const parseTime = (timeStr) => {
        if (!timeStr) return null;
        const cleaned = timeStr.toLowerCase().replace(/\s+/g, '');
        let hour, minute, ampm;
        if (cleaned.includes(':')) {
            const parts = cleaned.split(':');
            hour = parseInt(parts[0]);
            minute = parseInt(parts[1].replace(/[^\d]/g, ''));
            ampm = cleaned.includes('pm') ? 'pm' : 'am';
        } else {
            const match = cleaned.match(/(\d+)(am|pm)/);
            if (match) { hour = parseInt(match[1]); minute = 0; ampm = match[2]; } else return null;
        }
        if (ampm === 'pm' && hour !== 12) hour += 12;
        if (ampm === 'am' && hour === 12) hour = 0;
        return hour * 60 + (minute || 0);
    };

    const uniqueRoomsList = [...new Set(scheduleData.map(item => item.Room).filter(Boolean))].filter(room => room.toLowerCase() !== 'online').sort();
    const roomsInUse = uniqueRoomsList.length;

    const allInstructors = [...new Set(scheduleData.map(item => item.Instructor))];
    const facultyCount = allInstructors.filter(i => i && i !== 'Staff').length;

    const facultyWorkload = {};
    const roomUtilization = {};
    uniqueRoomsList.forEach(room => { roomUtilization[room] = { classes: 0, hours: 0, staffTaughtClasses: 0 }; });

    const processedSessions = new Set();
    const dayStats = {};
    
    scheduleData.forEach(item => {
        const instructor = item.Instructor.includes('Staff') ? 'Staff' : item.Instructor;
        const start = parseTime(item['Start Time']);
        const end = parseTime(item['End Time']);
        const duration = (start !== null && end !== null) ? (end - start) / 60 : 0;
        
        if (roomUtilization[item.Room]) {
            roomUtilization[item.Room].classes++;
            roomUtilization[item.Room].hours += duration;
            if (instructor === 'Staff') roomUtilization[item.Room].staffTaughtClasses++;
        }

        const sessionKey = `${item.Instructor}-${item.Course}-${item.Day}-${item['Start Time']}-${item['End Time']}`;
        // This logic ensures we count unique class sessions, not just rows in the CSV/DB
        if (!processedSessions.has(sessionKey)) {
            processedSessions.add(sessionKey);

            dayStats[item.Day] = (dayStats[item.Day] || 0) + 1;

            if (instructor !== 'Staff') {
                if (!facultyWorkload[instructor]) {
                    facultyWorkload[instructor] = { courseSet: new Set(), totalHours: 0 };
                }
                facultyWorkload[instructor].courseSet.add(item.Course);
                facultyWorkload[instructor].totalHours += duration;
            }
        }
    });

    const finalFacultyWorkload = Object.fromEntries(
        Object.entries(facultyWorkload).map(([instructor, data]) => [
            instructor,
            { courses: data.courseSet.size, totalHours: data.totalHours }
        ])
    );
    
    const totalSessions = processedSessions.size;
    const staffTaughtSessions = scheduleData.filter(s => s.Instructor.includes('Staff')).length;

    const busiestDay = Object.entries(dayStats).reduce((max, [day, count]) => 
        count > max.count ? { day, count } : max, { day: '', count: 0 });

    const uniqueCourses = [...new Set(scheduleData.map(item => item.Course))].length;

    return {
      facultyCount,
      staffTaughtSessions,
      roomsInUse,
      totalSessions,
      uniqueCourses,
      busiestDay,
      facultyWorkload: finalFacultyWorkload,
      roomUtilization,
      uniqueRooms: uniqueRoomsList,
      uniqueInstructors: allInstructors,
    };
}, [scheduleData]);

  // Directory data with source tracking
  const { facultyDirectoryData, staffDirectoryData } = useMemo(() => {
    const facultyWithSource = rawFaculty.map(f => ({ ...f, sourceCollection: 'faculty' }));
    const staffWithSource = rawStaff.map(s => ({ ...s, sourceCollection: 'staff' }));

    const facultyDir = [
        ...facultyWithSource,
        ...staffWithSource.filter(s => s.isAlsoFaculty)
    ];

    const staffDir = [
        ...staffWithSource,
        ...facultyWithSource.filter(f => f.isAlsoStaff)
    ];

    return { facultyDirectoryData: facultyDir, staffDirectoryData: staffDir };
  }, [rawFaculty, rawStaff]);

  // Load data effect
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // Load all collections in parallel
        const [scheduleSnapshot, facultySnapshot, staffSnapshot, coursesSnapshot, roomsSnapshot, historySnapshot] = await Promise.all([
          getDocs(collection(db, 'schedules')),
          getDocs(collection(db, 'faculty')),
          getDocs(collection(db, 'staff')),
          getDocs(collection(db, 'courses')),
          getDocs(collection(db, 'rooms')),
          getDocs(query(collection(db, 'history'), orderBy('timestamp', 'desc')))
        ]);

        // Process schedules
        const schedules = scheduleSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        setRawScheduleData(schedules);

        // Process faculty
        let faculty = facultySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        
        // If no faculty data but we have schedules, migrate the data
        if (faculty.length === 0 && schedules.length > 0) {
          faculty = await migrateInstructorData(schedules);
        }
        setRawFaculty(faculty);

        // Process staff
        const staff = staffSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        setRawStaff(staff);

        // Process courses
        let courses = coursesSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        
        // If no course data but we have schedules, migrate the data
        if (courses.length === 0 && schedules.length > 0) {
          courses = await migrateCourseData(schedules);
        }
        setRawCourses(courses);

        // Process rooms
        let rooms = roomsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        
        // If no room data but we have schedules, migrate the data
        if (rooms.length === 0 && schedules.length > 0) {
          rooms = await migrateRoomData(schedules);
        }
        setRawRooms(rooms);

        // Process history
        const history = historySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        setEditHistory(history);

      } catch (error) {
        console.error("Firestore Read/Write Error:", error);
        alert("Could not load or initialize data from the database. This is likely a Firestore security rule issue.");
      }
      setLoading(false);
    };

    if (isAuthenticated) {
      loadData();
    } else {
      setRawScheduleData([]);
      setRawFaculty([]);
      setRawStaff([]);
      setRawCourses([]);
      setRawRooms([]);
      setEditHistory([]);
      setLoading(false);
    }
  }, [isAuthenticated]);

  // Migration functions
  const migrateInstructorData = async (schedules) => {
    const uniqueInstructors = [...new Set(schedules.map(item => item.Instructor || item.instructor))].filter(name => name && name !== 'Staff');
    const facultyToCreate = uniqueInstructors.map(name => ({
      name,
      isAdjunct: false,
      email: '',
      phone: '',
      office: '',
      jobTitle: '',
      isAlsoStaff: false
    }));

    const batch = writeBatch(db);
    const createdFaculty = [];

    for (const faculty of facultyToCreate) {
      const docRef = doc(collection(db, 'faculty'));
      batch.set(docRef, faculty);
      createdFaculty.push({ ...faculty, id: docRef.id });
    }

    await batch.commit();
    return createdFaculty;
  };

  const migrateCourseData = async (schedules) => {
    const uniqueCourses = [...new Set(schedules.map(item => item.Course || item.course))].filter(Boolean);
    const coursesToCreate = uniqueCourses.map(courseCode => ({
      courseCode,
      title: schedules.find(s => (s.Course || s.course) === courseCode)?.['Course Title'] || schedules.find(s => (s.Course || s.course) === courseCode)?.courseTitle || '',
      description: '',
      credits: 3,
      department: 'HSD'
    }));

    const batch = writeBatch(db);
    const createdCourses = [];

    for (const course of coursesToCreate) {
      const docRef = doc(collection(db, 'courses'));
      batch.set(docRef, course);
      createdCourses.push({ ...course, id: docRef.id });
    }

    await batch.commit();
    return createdCourses;
  };

  const migrateRoomData = async (schedules) => {
    const uniqueRooms = [...new Set(schedules.map(item => item.Room || item.room))].filter(Boolean);
    const roomsToCreate = uniqueRooms.map(roomName => ({
      name: roomName,
      building: roomName.split(' ')[0] || 'Unknown',
      roomNumber: roomName.split(' ')[1] || '',
      capacity: null,
      equipment: []
    }));

    const batch = writeBatch(db);
    const createdRooms = [];

    for (const room of roomsToCreate) {
      const docRef = doc(collection(db, 'rooms'));
      batch.set(docRef, room);
      createdRooms.push({ ...room, id: docRef.id });
    }

    await batch.commit();
    return createdRooms;
  };

  // Check auth status on load
  useEffect(() => {
    const checkAuthStatus = () => {
      setLoading(true);
      const auth = localStorage.getItem('isAuthenticated');
      if (auth === 'true') {
        setIsAuthenticated(true);
      } else {
        setLoading(false);
      }
    };
    checkAuthStatus();
  }, []);

  // Helper function to find or create entities
  const findOrCreateFaculty = async (name) => {
    // First try to find existing faculty
    let faculty = rawFaculty.find(f => f.name === name);
    
    if (!faculty) {
      // Create new faculty member
      const newFaculty = {
        name,
        isAdjunct: false,
        email: '',
        phone: '',
        office: '',
        jobTitle: '',
        isAlsoStaff: false
      };
      
      const docRef = await addDoc(collection(db, 'faculty'), newFaculty);
      faculty = { ...newFaculty, id: docRef.id };
      setRawFaculty(prev => [...prev, faculty]);
    }
    
    return faculty.id;
  };

  const findOrCreateCourse = async (courseCode, courseTitle = '') => {
    let course = rawCourses.find(c => c.courseCode === courseCode);
    
    if (!course) {
      const newCourse = {
        courseCode,
        title: courseTitle,
        description: '',
        credits: 3,
        department: 'HSD'
      };
      
      const docRef = await addDoc(collection(db, 'courses'), newCourse);
      course = { ...newCourse, id: docRef.id };
      setRawCourses(prev => [...prev, course]);
    }
    
    return course.id;
  };

  const findOrCreateRoom = async (roomName) => {
    let room = rawRooms.find(r => r.name === roomName);
    
    if (!room) {
      const newRoom = {
        name: roomName,
        building: roomName.split(' ')[0] || 'Unknown',
        roomNumber: roomName.split(' ')[1] || '',
        capacity: null,
        equipment: []
      };
      
      const docRef = await addDoc(collection(db, 'rooms'), newRoom);
      room = { ...newRoom, id: docRef.id };
      setRawRooms(prev => [...prev, room]);
    }
    
    return room.id;
  };

  // Data update handlers
  const handleDataUpdate = async (updatedRow) => {
    const originalRow = rawScheduleData.find(r => r.id === updatedRow.id);
    
    // Convert display values back to IDs for storage
    const normalizedRow = { ...updatedRow };
    
    // Handle faculty ID
    if (updatedRow.Instructor !== originalRow.Instructor) {
      if (updatedRow.Instructor === 'Staff') {
        normalizedRow.facultyId = null;
      } else {
        normalizedRow.facultyId = await findOrCreateFaculty(updatedRow.Instructor);
      }
    }
    
    // Handle course ID
    if (updatedRow.Course !== originalRow.Course) {
      normalizedRow.courseId = await findOrCreateCourse(updatedRow.Course, updatedRow['Course Title']);
    }
    
    // Handle room ID
    if (updatedRow.Room !== originalRow.Room) {
      normalizedRow.roomId = await findOrCreateRoom(updatedRow.Room);
    }

    // Remove display fields before saving
    const { Instructor, Course, 'Course Title': courseTitle, Room, ...dataToSave } = normalizedRow;
    
    // Track changes for history
    const changes = Object.keys(updatedRow).reduce((acc, key) => {
        if (key !== 'id' && originalRow[key] !== updatedRow[key]) {
            acc.push({
                rowId: updatedRow.id,
                instructor: updatedRow.Instructor,
                course: updatedRow.Course,
                field: key,
                oldValue: originalRow[key],
                newValue: updatedRow[key],
                timestamp: new Date().toISOString(),
            });
        }
        return acc;
    }, []);

    if (changes.length > 0 || normalizedRow.facultyId !== originalRow.facultyId || normalizedRow.courseId !== originalRow.courseId || normalizedRow.roomId !== originalRow.roomId) {
      try {
        await updateDoc(doc(db, 'schedules', updatedRow.id), dataToSave);
        
        for (const change of changes) {
            await addDoc(collection(db, 'history'), change);
        }
        
        setRawScheduleData(rawScheduleData.map(row => row.id === updatedRow.id ? { ...row, ...dataToSave } : row));
        setEditHistory(prev => [...changes, ...prev]);
      } catch (error) {
        console.error("Error updating document: ", error);
      }
    }
  };

  const handleFacultyUpdate = async (facultyToUpdate) => {
    try {
        if (facultyToUpdate.id) {
            const docRef = doc(db, 'faculty', facultyToUpdate.id);
            await updateDoc(docRef, facultyToUpdate);
            setRawFaculty(rawFaculty.map(f => f.id === facultyToUpdate.id ? facultyToUpdate : f));
        } else {
            const docRef = await addDoc(collection(db, 'faculty'), facultyToUpdate);
            const newFacultyMember = { ...facultyToUpdate, id: docRef.id };
            setRawFaculty([...rawFaculty, newFacultyMember]);
        }
    } catch (error) {
        console.error("Error updating/creating faculty", error);
    }
  };

  const handleStaffUpdate = async (staffToUpdate) => {
      try {
          if (staffToUpdate.id) {
              const staffDocRef = doc(db, 'staff', staffToUpdate.id);
              await updateDoc(staffDocRef, staffToUpdate);
              setRawStaff(rawStaff.map(staff => staff.id === staffToUpdate.id ? staffToUpdate : staff));
          } else {
              const docRef = await addDoc(collection(db, 'staff'), staffToUpdate);
              const newStaff = { ...staffToUpdate, id: docRef.id };
              setRawStaff([...rawStaff, newStaff]);
          }
      } catch (error) {
          console.error("Error updating/creating staff member: ", error);
      }
  };

  const handleRevertChange = async (changeToRevert) => {
    const targetRow = rawScheduleData.find(row => row.id === changeToRevert.rowId);
    if (targetRow) {
      try {
        // Convert the old value back to appropriate ID if needed
        let revertData = { [changeToRevert.field]: changeToRevert.oldValue };
        
        if (changeToRevert.field === 'Instructor') {
          if (changeToRevert.oldValue === 'Staff') {
            revertData.facultyId = null;
          } else {
            revertData.facultyId = await findOrCreateFaculty(changeToRevert.oldValue);
          }
          delete revertData.Instructor;
        } else if (changeToRevert.field === 'Course') {
          revertData.courseId = await findOrCreateCourse(changeToRevert.oldValue);
          delete revertData.Course;
        } else if (changeToRevert.field === 'Room') {
          revertData.roomId = await findOrCreateRoom(changeToRevert.oldValue);
          delete revertData.Room;
        }
        
        await updateDoc(doc(db, 'schedules', changeToRevert.rowId), revertData);
        
        const revertHistoryLog = {
            rowId: changeToRevert.rowId,
            instructor: targetRow.Instructor,
            course: targetRow.Course,
            field: changeToRevert.field,
            oldValue: changeToRevert.newValue,
            newValue: changeToRevert.oldValue,
            timestamp: new Date().toISOString(),
            isRevert: true,
        };
        await addDoc(collection(db, 'history'), revertHistoryLog);
        
        const updatedRow = { ...targetRow, ...revertData };
        setRawScheduleData(rawScheduleData.map(row => (row.id === updatedRow.id ? updatedRow : row)));
        setEditHistory([revertHistoryLog, ...editHistory]);
      } catch (error) {
        console.error("Error reverting document: ", error);
      }
    }
  };

  const handleLogin = (status) => {
    localStorage.setItem('isAuthenticated', status ? 'true' : 'false');
    if (!status) localStorage.removeItem('isAuthenticated');
    setIsAuthenticated(status);
  };

  const handleLogout = () => setShowLogoutConfirm(true);

  const confirmLogout = () => {
    handleLogin(false);
    setShowLogoutConfirm(false);
    setCurrentPage('dashboard');
  };

  // Get current page breadcrumb
  const getCurrentBreadcrumb = () => {
    const pathParts = currentPage.split('/');
    let breadcrumbs = [];
    if (currentPage === 'dashboard') return ['Dashboard'];
    
    const section = navigationItems.find(item => item.id === pathParts[0]);
    if (section) {
        breadcrumbs.push(section.label);
        if (pathParts.length > 1 && section.children) {
            const subsection = section.children.find(child => child.path.endsWith(pathParts[1]));
            if (subsection) breadcrumbs.push(subsection.label);
        }
    }
    return ['Dashboard', ...breadcrumbs];
  };

  // Render the appropriate page component
  const renderPageContent = () => {
    const commonProps = {
      scheduleData,
      facultyData: rawFaculty,
      editHistory,
      onDataUpdate: handleDataUpdate,
      onRevertChange: handleRevertChange,
      loading,
      onNavigate: setCurrentPage,
      analytics: departmentAnalytics,
      lookupMaps
    };

    switch(currentPage) {
      case 'dashboard':
        return <Dashboard {...commonProps} />;
      case 'scheduling/group-meetings':
        return <GroupMeetings {...commonProps} />;
      case 'scheduling/individual-availability':
        return <IndividualAvailability {...commonProps} />;
      case 'scheduling/room-schedules':
        return <RoomSchedules {...commonProps} />;
      case 'directory/faculty-directory':
        return <FacultyDirectory
          directoryData={facultyDirectoryData}
          onFacultyUpdate={handleFacultyUpdate}
          onStaffUpdate={handleStaffUpdate}
        />;
      case 'directory/staff-directory':
        return <StaffDirectory
          directoryData={staffDirectoryData}
          onFacultyUpdate={handleFacultyUpdate}
          onStaffUpdate={handleStaffUpdate}
        />;
      case 'analytics/department-insights':
        return <DepartmentInsights {...commonProps} />;
      case 'analytics/course-management':
        return <CourseManagement {...commonProps} />;
      case 'administration/data-import':
        return <DataImportPage 
          onNavigate={setCurrentPage} 
          facultyData={rawFaculty} 
          onFacultyUpdate={handleFacultyUpdate}
          findOrCreateFaculty={findOrCreateFaculty}
          findOrCreateCourse={findOrCreateCourse}
          findOrCreateRoom={findOrCreateRoom}
        />;
      case 'administration/database-migration':
        return <MigrationPage onNavigate={setCurrentPage} />;
      case 'administration/baylor-systems':
        return <SystemsPage onNavigate={setCurrentPage} />;
      default:
        return <Dashboard {...commonProps} />;
    }
  };

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="h-screen flex bg-gray-50">
      <Sidebar 
        navigationItems={navigationItems}
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              {getCurrentBreadcrumb().map((crumb, index) => (
                <React.Fragment key={index}>
                  {index > 0 && <span>/</span>}
                  <span className={index === getCurrentBreadcrumb().length - 1 ? 'text-baylor-green font-medium' : 'hover:text-baylor-green cursor-pointer'}>
                    {crumb}
                  </span>
                </React.Fragment>
              ))}
            </div>
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder="Search..."
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-baylor-green focus:border-baylor-green bg-gray-50 text-sm w-64"
                />
              </div>
              <button className="p-2 text-gray-600 hover:text-baylor-green hover:bg-gray-100 rounded-lg transition-colors">
                <Bell size={20} />
              </button>
              <div className="flex items-center space-x-3">
                <div className="text-right">
                  <div className="text-sm font-medium text-gray-900">Davis Deaton</div>
                  <div className="text-xs text-gray-500">Human Sciences & Design</div>
                </div>
                <button 
                  onClick={handleLogout}
                  className="p-2 text-gray-600 hover:text-baylor-green hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <User size={20} />
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <div className="p-6">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-baylor-green mx-auto mb-4"></div>
                  <p className="text-gray-600">Loading...</p>
                </div>
              </div>
            ) : (
              renderPageContent()
            )}
          </div>
        </main>
      </div>

      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Confirm Logout</h3>
            <p className="text-gray-600 mb-6">Are you sure you want to logout?</p>
            <div className="flex justify-end space-x-4">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmLogout}
                className="px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;