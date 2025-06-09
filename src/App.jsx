import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import GroupMeetings from './components/scheduling/GroupMeetings.jsx';
import IndividualAvailability from './components/scheduling/IndividualAvailability';
import RoomSchedules from './components/scheduling/RoomSchedules';
import FacultyDirectory from './components/FacultyDirectory';
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
  const [facultyData, setFacultyData] = useState([]);
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
        { id: 'faculty-directory', label: 'Faculty Directory', path: 'directory/faculty-directory' }
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
        let facultyList = [];
        const facultySnapshot = await getDocs(collection(db, 'faculty'));
        if (facultySnapshot.empty) {
            const uniqueInstructors = [...new Set(schedules.map(item => item.Instructor))];
            const facultyToCreate = uniqueInstructors.map(name => ({
                name,
                isAdjunct: false,
                email: '',
                phone: '',
                office: '',
                jobTitle: '',
            }));
            for (const faculty of facultyToCreate) {
                const docRef = await addDoc(collection(db, 'faculty'), faculty);
                facultyList.push({ ...faculty, id: docRef.id });
            }
        } else {
            facultyList = facultySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        }
        setFacultyData(facultyList);

        // Fetch edit history
        const historyQuery = query(collection(db, "history"), orderBy("timestamp", "desc"));
        const historySnapshot = await getDocs(historyQuery);
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
      setScheduleData([]);
      setFacultyData([]);
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
    const changes = [];
    
    Object.keys(updatedRow).forEach(key => {
        if (key !== 'id' && originalRow[key] !== updatedRow[key]) {
            changes.push({
                rowId: updatedRow.id,
                instructor: updatedRow.Instructor,
                course: updatedRow.Course,
                field: key,
                oldValue: originalRow[key],
                newValue: updatedRow[key],
                timestamp: new Date().toISOString(),
            });
        }
    });

    if (changes.length > 0) {
      try {
        const scheduleDocRef = doc(db, 'schedules', updatedRow.id);
        await updateDoc(scheduleDocRef, updatedRow);

        for (const change of changes) {
            await addDoc(collection(db, 'history'), change);
        }

        const newData = scheduleData.map(row => row.id === updatedRow.id ? updatedRow : row);
        const newHistory = [...changes, ...editHistory];
        setScheduleData(newData);
        setEditHistory(newHistory);
        
      } catch (error) {
        console.error("Error updating document: ", error);
      }
    }
  };

  const handleFacultyUpdate = async (updatedFaculty) => {
    try {
        const facultyDocRef = doc(db, 'faculty', updatedFaculty.id);
        await updateDoc(facultyDocRef, updatedFaculty);
        
        const newData = facultyData.map(faculty => faculty.id === updatedFaculty.id ? updatedFaculty : faculty);
        setFacultyData(newData);
    } catch (error) {
        console.error("Error updating faculty member: ", error);
    }
  };

  const handleRevertChange = async (changeToRevert) => {
    const targetRow = scheduleData.find(row => row.id === changeToRevert.rowId);
    if (targetRow) {
      try {
        const revertedData = { [changeToRevert.field]: changeToRevert.oldValue };
        const scheduleDocRef = doc(db, 'schedules', changeToRevert.rowId);
        await updateDoc(scheduleDocRef, revertedData);
        
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
        
        const revertedRow = { ...targetRow, ...revertedData };
        const newData = scheduleData.map(row => (row.id === revertedRow.id ? revertedRow : row));
        const newHistory = [revertHistoryLog, ...editHistory];
        setScheduleData(newData);
        setEditHistory(newHistory);

      } catch (error) {
        console.error("Error reverting document: ", error);
      }
    }
  };

  const handleLogin = (status) => {
    if (status) {
        localStorage.setItem('isAuthenticated', 'true');
        setIsAuthenticated(true);
    } else {
        localStorage.removeItem('isAuthenticated');
        setIsAuthenticated(false);
    }
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
    const breadcrumbs = ['Dashboard'];
    
    if (pathParts.length > 1) {
      const section = navigationItems.find(item => item.id === pathParts[0]);
      if (section) {
        breadcrumbs.push(section.label);
        if (pathParts.length > 2 && section.children) {
          const subsection = section.children.find(child => child.id === pathParts[1]);
          if (subsection) {
            breadcrumbs.push(subsection.label);
          }
        }
      }
    }
    
    return breadcrumbs;
  };

  // Render the appropriate page component
  const renderPageContent = () => {
    const commonProps = {
      scheduleData,
      facultyData,
      editHistory,
      onDataUpdate: handleDataUpdate,
      onFacultyUpdate: handleFacultyUpdate,
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
        return <FacultyDirectory facultyData={facultyData} onUpdate={handleFacultyUpdate} />;
      case 'analytics/department-insights':
        return <DepartmentInsights {...commonProps} />;
      case 'analytics/course-management':
        return <CourseManagement {...commonProps} />;
      case 'administration/data-import':
        return <DataImportPage onNavigate={setCurrentPage} facultyData={facultyData} onFacultyUpdate={handleFacultyUpdate} />;
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
      {/* Sidebar */}
      <Sidebar 
        navigationItems={navigationItems}
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Breadcrumb */}
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

            {/* Header Actions */}
            <div className="flex items-center space-x-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder="Search..."
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-baylor-green focus:border-baylor-green bg-gray-50 text-sm w-64"
                />
              </div>

              {/* Notifications */}
              <button className="p-2 text-gray-600 hover:text-baylor-green hover:bg-gray-100 rounded-lg transition-colors">
                <Bell size={20} />
              </button>

              {/* User Menu */}
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

        {/* Main Content */}
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

      {/* Logout Confirmation Modal */}
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