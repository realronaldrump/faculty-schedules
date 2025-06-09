import React, { useState, useEffect } from 'react';
import FacultyScheduleDashboard from './components/FacultyScheduleDashboard';
import SystemsPage from './components/SystemsPage';
import Login from './components/Login';
import DataImportPage from './components/DataImportPage'; // Import new component
import { Settings, BookUser, Upload } from 'lucide-react'; // Import Upload icon
import { db } from './firebase';
import { collection, getDocs, doc, updateDoc, addDoc, query, orderBy } from 'firebase/firestore';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [currentPage, setCurrentPage] = useState('dashboard');
  
  const [scheduleData, setScheduleData] = useState([]);
  const [facultyData, setFacultyData] = useState([]);
  const [editHistory, setEditHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  // This effect runs only when `isAuthenticated` changes to true
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
            // If faculty collection is empty, create it from schedule data
            const uniqueInstructors = [...new Set(schedules.map(item => item.Instructor))];
            const facultyToCreate = uniqueInstructors.map(name => ({
                name,
                isAdjunct: false,
                email: '',
                phone: '',
                office: '', // Add office field to new faculty documents
                jobTitle: '', // Add jobTitle field
            }));
            for (const faculty of facultyToCreate) {
                const docRef = await addDoc(collection(db, 'faculty'), faculty);
                facultyList.push({ ...faculty, id: docRef.id });
            }
        } else {
            facultyList = facultySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        }
        setFacultyData(facultyList);

        // Fetch edit history, ordered by timestamp
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
      // If user logs out, clear data and stop loading
      setScheduleData([]);
      setFacultyData([]);
      setEditHistory([]);
      setLoading(false);
    }
  }, [isAuthenticated]);

  // This effect runs once on initial page load to check for existing login
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
  
  const renderPage = () => {
      switch(currentPage) {
          case 'dashboard':
              return <FacultyScheduleDashboard 
                        scheduleData={scheduleData}
                        facultyData={facultyData}
                        editHistory={editHistory}
                        onDataUpdate={handleDataUpdate}
                        onFacultyUpdate={handleFacultyUpdate}
                        onRevertChange={handleRevertChange}
                        loading={loading}
                        onNavigate={setCurrentPage}
                      />;
          case 'systems':
              return <SystemsPage onNavigate={setCurrentPage} />;
          case 'import':
              return <DataImportPage onNavigate={setCurrentPage} facultyData={facultyData} onFacultyUpdate={handleFacultyUpdate} />;
          default:
              return <FacultyScheduleDashboard onNavigate={setCurrentPage} loading={loading} />;
      }
  }

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-baylor-green text-white shadow-md">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="text-baylor-gold font-bold text-3xl">HSD</div>
            <h1 className="text-xl md:text-2xl font-serif font-bold">Faculty Schedules</h1>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-baylor-gold font-serif italic">Fall 2025</div>
             <button
              onClick={() => setCurrentPage('import')}
              className="text-sm text-white hover:text-baylor-gold transition-colors duration-200 flex items-center space-x-1"
            >
              <Upload size={16} className="mr-1" />
              <span>Import Data</span>
            </button>
            <button
              onClick={() => setCurrentPage('systems')}
              className="text-sm text-white hover:text-baylor-gold transition-colors duration-200 flex items-center space-x-1"
            >
              <Settings size={16} className="mr-1" />
              <span>Baylor Systems</span>
            </button>
            <button
              onClick={handleLogout}
              className="text-sm text-white hover:text-baylor-gold transition-colors duration-200 flex items-center space-x-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V4a1 1 0 00-1-1H3zm11 4a1 1 0 10-2 0v4a1 1 0 102 0V7zm-3 1a1 1 0 10-2 0v3a1 1 0 102 0V8zM8 9a1 1 0 00-2 0v3a1 1 0 102 0V9z" clipRule="evenodd" />
              </svg>
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>
      
      <main className="flex-grow bg-gray-50">
        <div className="container mx-auto px-4 py-6">
            {renderPage()}
        </div>
      </main>
      
      <footer className="bg-baylor-green text-white py-4">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm"> Baylor University Human Sciences and Design</p>
        </div>
      </footer>

      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Confirm Logout</h3>
            <p className="text-gray-600 mb-6">Are you sure you want to logout?</p>
            <div className="flex justify-end space-x-4">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={confirmLogout}
                className="px-4 py-2 bg-baylor-green text-white rounded hover:bg-baylor-green/90"
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