import React, { useState } from 'react';
import FacultyDirectory from './FacultyDirectory';
import StaffDirectory from './StaffDirectory';
import AdjunctDirectory from './AdjunctDirectory';
import { Users } from 'lucide-react';

// Local tab definitions to switch between directory views
const tabs = [
  { id: 'faculty', label: 'Faculty' },
  { id: 'staff', label: 'Staff' },
  { id: 'adjunct', label: 'Adjunct' },
];

const PeopleDirectory = (props) => {
  // Allow an optional initialTab prop to deep-link directly to a specific view
  const { initialTab = 'faculty' } = props;
  const [activeTab, setActiveTab] = useState(initialTab);

  return (
    <div className="university-card">
      <div className="university-card-header flex justify-between items-center">
        <div>
          <h2 className="university-card-title">People Directory</h2>
          <p className="university-card-subtitle">Manage faculty, staff, and adjunct information.</p>
        </div>
        <div className="p-3 bg-baylor-green/10 rounded-lg">
           <Users className="h-6 w-6 text-baylor-green" />
        </div>
      </div>

      <div className="university-card-content">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-6" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm transition-colors duration-150 focus:outline-none ${
                  activeTab === tab.id
                    ? 'border-baylor-green text-baylor-green'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="mt-6">
          {activeTab === 'faculty' && <FacultyDirectory {...props} />}
          {activeTab === 'staff' && <StaffDirectory {...props} />}
          {activeTab === 'adjunct' && <AdjunctDirectory {...props} />}
        </div>
      </div>
    </div>
  );
};

export default PeopleDirectory; 