import React, { useState, useEffect } from 'react';
import FacultyScheduleDashboard from './components/FacultyScheduleDashboard';
import Login from './components/Login';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Check if user is already authenticated
    const auth = localStorage.getItem('isAuthenticated');
    if (auth === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

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
              onClick={() => {
                localStorage.removeItem('isAuthenticated');
                setIsAuthenticated(false);
              }}
              className="text-sm text-white hover:text-baylor-gold"
            >
              Logout
            </button>
          </div>
        </div>
      </header>
      
      <main className="flex-grow bg-gray-50">
        <div className="container mx-auto px-4 py-6">
          <FacultyScheduleDashboard />
        </div>
      </main>
      
      <footer className="bg-baylor-green text-white py-4">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm"> Baylor University Human Sciences and Design</p>
        </div>
      </footer>
    </div>
  );
}

export default App; 