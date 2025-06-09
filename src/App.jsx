import React, { useState, useEffect } from 'react';
import FacultyScheduleDashboard from './components/FacultyScheduleDashboard';
import SystemsPage from './components/SystemsPage';
import Login from './components/Login';
import { Settings } from 'lucide-react';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [currentPage, setCurrentPage] = useState('dashboard');

  // State for schedule data and edit history has been lifted here
  const [scheduleData, setScheduleData] = useState([]);
  const [editHistory, setEditHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  // Helper to parse CSV content
  const parseCsv = (csvText) => {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length === 0) return [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    return lines.slice(1).map(line => {
      const values = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') inQuotes = !inQuotes;
        else if (char === ',' && !inQuotes) {
          values.push(current.trim().replace(/"/g, ''));
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim().replace(/"/g, ''));
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = values[index] || '';
      });
      return obj;
    });
  };

  // Load data on initial mount from CSV, then check localStorage for edits
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const response = await fetch('/HSD_Instructor_Schedules.csv');
        const csvContent = await response.text();
        // Assign a unique ID to each row for stable editing
        const parsedData = parseCsv(csvContent).map((row, index) => ({ ...row, id: index }));

        const savedData = localStorage.getItem('scheduleData');
        const savedHistory = localStorage.getItem('editHistory');

        setScheduleData(savedData ? JSON.parse(savedData) : parsedData);
        setEditHistory(savedHistory ? JSON.parse(savedHistory) : []);
      } catch (error) {
        console.error("Failed to load schedule data:", error);
        // Fallback to empty array on error
        setScheduleData([]);
        setEditHistory([]);
      }
      setLoading(false);
    };

    const auth = localStorage.getItem('isAuthenticated');
    if (auth === 'true') {
      setIsAuthenticated(true);
      loadData();
    } else {
      setLoading(false);
    }
  }, [isAuthenticated]);

  // Handler to process a data update
  const handleDataUpdate = (updatedRow) => {
    const originalRow = scheduleData.find(r => r.id === updatedRow.id);
    const changes = [];
    
    // Compare original and updated row to create history items
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
        const newData = scheduleData.map(row => row.id === updatedRow.id ? updatedRow : row);
        // Prepend new changes to the history
        const newHistory = [...changes, ...editHistory];

        setScheduleData(newData);
        setEditHistory(newHistory);

        // Persist changes to localStorage
        localStorage.setItem('scheduleData', JSON.stringify(newData));
        localStorage.setItem('editHistory', JSON.stringify(newHistory));
    }
  };

  // Handler to revert a change from the history
  const handleRevertChange = (changeToRevert, indexToRevert) => {
    const targetRow = scheduleData.find(row => row.id === changeToRevert.rowId);
    if (targetRow) {
        const revertedRow = { ...targetRow, [changeToRevert.field]: changeToRevert.oldValue };
        const newData = scheduleData.map(row => (row.id === revertedRow.id ? revertedRow : row));
        
        // A new history item is created to log the revert action
        const revertHistoryLog = {
            rowId: revertedRow.id,
            instructor: revertedRow.Instructor,
            course: revertedRow.Course,
            field: changeToRevert.field,
            oldValue: changeToRevert.newValue, // The value we are changing from
            newValue: changeToRevert.oldValue, // The value we are reverting to
            timestamp: new Date().toISOString(),
            isRevert: true,
        };
        const newHistory = [revertHistoryLog, ...editHistory];

        setScheduleData(newData);
        setEditHistory(newHistory);
        localStorage.setItem('scheduleData', JSON.stringify(newData));
        localStorage.setItem('editHistory', JSON.stringify(newHistory));
    }
  };


  const handleLogout = () => setShowLogoutConfirm(true);

  const confirmLogout = () => {
    localStorage.removeItem('isAuthenticated');
    setIsAuthenticated(false);
    setShowLogoutConfirm(false);
    setCurrentPage('dashboard');
  };

  if (!isAuthenticated) {
    return <Login onLogin={setIsAuthenticated} />;
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
        {currentPage === 'dashboard' ? (
          <div className="container mx-auto px-4 py-6">
            <FacultyScheduleDashboard 
              scheduleData={scheduleData}
              editHistory={editHistory}
              onDataUpdate={handleDataUpdate}
              onRevertChange={handleRevertChange}
              loading={loading}
              onNavigate={setCurrentPage}
            />
          </div>
        ) : (
          <SystemsPage onNavigate={setCurrentPage} />
        )}
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