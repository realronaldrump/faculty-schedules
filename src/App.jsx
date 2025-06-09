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
import Login from './components/Login';
import { Home, Calendar, Users, BarChart3, Settings, Bell, Search, User } from 'lucide-react';
import { db } from './firebase';
import { collection, getDocs, doc, updateDoc, addDoc, query, orderBy } from 'firebase/firestore';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  const [scheduleData, setScheduleData] = useState([]);
  const [rawFaculty, setRawFaculty] = useState([]);
  const [rawStaff, setRawStaff] = useState([]);
  const [editHistory, setEditHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  // Navigation structure for the new UI
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
        { id: 'baylor-systems', label: 'Baylor Systems', path: 'administration/baylor-systems' }
      ]
    }
  ];

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
        // Fetch schedule data
        const scheduleSnapshot = await getDocs(collection(db, 'schedules'));
        const schedules = scheduleSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        setScheduleData(schedules);

        // Fetch or create faculty data
        const facultySnapshot = await getDocs(collection(db, 'faculty'));
        if (facultySnapshot.empty && schedules.length > 0) {
            const uniqueInstructors = [...new Set(schedules.map(item => item.Instructor))];
            const facultyToCreate = uniqueInstructors.map(name => ({
                name, isAdjunct: false, email: '', phone: '', office: '', jobTitle: '',
            }));
            const createdFaculty = [];
            for (const faculty of facultyToCreate) {
                const docRef = await addDoc(collection(db, 'faculty'), faculty);
                createdFaculty.push({ ...faculty, id: docRef.id });
            }
            setRawFaculty(createdFaculty);
        } else {
            setRawFaculty(facultySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
        }

        // Fetch staff data
        const staffSnapshot = await getDocs(collection(db, 'staff'));
        setRawStaff(staffSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));

        // Fetch edit history
        const historyQuery = query(collection(db, "history"), orderBy("timestamp", "desc"));
        const historySnapshot = await getDocs(historyQuery);
        setEditHistory(historySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));

      } catch (error) {
        console.error("Firestore Read/Write Error:", error);
        alert("Could not load or initialize data from the database. This is likely a Firestore security rule issue.");
      }
      setLoading(false);
    };

    if (isAuthenticated) {
      loadData();
    } else {
      setScheduleData([]);
      setRawFaculty([]);
      setRawStaff([]);
      setEditHistory([]);
      setLoading(false);
    }
  }, [isAuthenticated]);

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

  // Data update handlers
  const handleDataUpdate = async (updatedRow) => {
    const originalRow = scheduleData.find(r => r.id === updatedRow.id);
    const changes = Object.keys(updatedRow).reduce((acc, key) => {
        if (key !== 'id' && originalRow[key] !== updatedRow[key]) {
            acc.push({
                rowId: updatedRow.id, instructor: updatedRow.Instructor, course: updatedRow.Course,
                field: key, oldValue: originalRow[key], newValue: updatedRow[key],
                timestamp: new Date().toISOString(),
            });
        }
        return acc;
    }, []);

    if (changes.length > 0) {
      try {
        await updateDoc(doc(db, 'schedules', updatedRow.id), updatedRow);
        for (const change of changes) {
            await addDoc(collection(db, 'history'), change);
        }
        setScheduleData(scheduleData.map(row => row.id === updatedRow.id ? updatedRow : row));
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
    const targetRow = scheduleData.find(row => row.id === changeToRevert.rowId);
    if (targetRow) {
      try {
        const revertedData = { [changeToRevert.field]: changeToRevert.oldValue };
        await updateDoc(doc(db, 'schedules', changeToRevert.rowId), revertedData);
        
        const revertHistoryLog = {
            rowId: changeToRevert.rowId, instructor: targetRow.Instructor, course: targetRow.Course,
            field: changeToRevert.field, oldValue: changeToRevert.newValue, newValue: changeToRevert.oldValue,
            timestamp: new Date().toISOString(), isRevert: true,
        };
        await addDoc(collection(db, 'history'), revertHistoryLog);
        
        const revertedRow = { ...targetRow, ...revertedData };
        setScheduleData(scheduleData.map(row => (row.id === revertedRow.id ? revertedRow : row)));
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
      onNavigate: setCurrentPage
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
        />;
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