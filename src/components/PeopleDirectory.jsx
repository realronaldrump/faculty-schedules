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
    <div className="bg-white p-6 rounded-lg shadow-md">
      <div className="flex items-center mb-6">
        <Users className="h-6 w-6 mr-3 text-gray-500" />
        <h1 className="text-2xl font-semibold text-gray-800">People Directory</h1>
      </div>

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
  );
};

export default PeopleDirectory; 