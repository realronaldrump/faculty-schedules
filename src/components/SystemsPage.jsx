import React from 'react';
import { ArrowLeft } from 'lucide-react';

const SystemsPage = () => {
  const systems = [
    { name: 'Schedule of Classes', description: 'Official Course Schedule System', url: 'https://www1.baylor.edu/scheduleofclasses/' },
    { name: 'CLSS', description: 'Course Listing and Schedule System', url: 'https://registrar.web.baylor.edu/courses-catalogs/clss-class-scheduling-facultystaff' },
    { name: 'ChairSIS', description: 'Department Management System', url: 'https://www1.baylor.edu/ChairSIS/' },
    { name: 'Canvas', description: 'Learning Management System', url: 'https://canvas.baylor.edu/' },
    { name: 'CSGold', description: 'ID Card System', url: 'https://idcard.baylor.edu' }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <button 
          onClick={() => window.history.back()}
          className="flex items-center text-baylor-green hover:text-baylor-gold mb-6 transition-colors"
        >
          <ArrowLeft size={20} className="mr-2" />
          Back to Dashboard
        </button>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h1 className="text-2xl font-serif font-bold text-baylor-green mb-6">Official University Systems</h1>
          
          <div className="grid gap-4">
            {systems.map((system) => (
              <a
                key={system.name}
                href={system.url}
                target={system.url !== '#' ? "_blank" : undefined}
                rel={system.url !== '#' ? "noopener noreferrer" : undefined}
                className="block p-4 border border-baylor-green/20 rounded-lg hover:bg-baylor-green/5 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-medium text-baylor-green">{system.name}</h2>
                    <p className="text-sm text-gray-600">{system.description}</p>
                  </div>
                  <div className="text-baylor-gold">
                    →
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemsPage; 