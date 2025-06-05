import React from 'react';
import FacultyScheduleDashboard from './components/FacultyScheduleDashboard';

function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-baylor-green text-white shadow-md">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="text-baylor-gold font-bold text-3xl">BU</div>
            <h1 className="text-xl md:text-2xl font-serif font-bold">Baylor Faculty Schedules</h1>
          </div>
          <div className="text-baylor-gold font-serif italic">Sic 'em Bears!</div>
        </div>
      </header>
      
      <main className="flex-grow bg-gray-50">
        <div className="container mx-auto px-4 py-6">
          <FacultyScheduleDashboard />
        </div>
      </main>
      
      <footer className="bg-baylor-green text-white py-4">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm"> Baylor University Human Sciences and Design Department - Fall 2025.</p>
        </div>
      </footer>
    </div>
  );
}

export default App; 