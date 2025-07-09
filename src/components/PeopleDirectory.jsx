import React, { useState } from 'react';
import FacultyDirectory from './FacultyDirectory';
import StaffDirectory from './StaffDirectory';
import AdjunctDirectory from './AdjunctDirectory';

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
    <div className="flex flex-col h-full">
      {/* Tab header */}
      <div className="mb-4 border-b border-gray-200">
        <nav className="-mb-px flex space-x-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors duration-150
                ${activeTab === tab.id
                  ? 'border-baylor-green text-baylor-green'
                  : 'border-transparent text-gray-500 hover:text-baylor-green hover:border-baylor-green'}`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'faculty' && <FacultyDirectory {...props} />}
        {activeTab === 'staff' && <StaffDirectory {...props} />}
        {activeTab === 'adjunct' && <AdjunctDirectory {...props} />}
      </div>
    </div>
  );
};

export default PeopleDirectory; 