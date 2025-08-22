import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import FacultyDirectory from './FacultyDirectory';
import StaffDirectory from './StaffDirectory';
import AdjunctDirectory from './AdjunctDirectory';
import StudentDirectory from './StudentDirectory';
import { Users, GraduationCap, UserCheck, UserPlus, User } from 'lucide-react';

// Local tab definitions to switch between directory views
const tabs = [
  { id: 'faculty', label: 'Faculty', icon: GraduationCap, description: 'Full-time faculty members' },
  { id: 'staff', label: 'Staff', icon: UserCheck, description: 'Administrative and support staff' },
  { id: 'adjunct', label: 'Adjunct', icon: UserPlus, description: 'Part-time and adjunct faculty' },
  { id: 'student', label: 'Student', icon: User, description: 'Student workers and assistants' },
];

const PeopleDirectory = (props) => {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Allow an optional initialTab prop to deep-link directly to a specific view
  const { initialTab = 'faculty' } = props;
  
  // Get tab from URL parameter or use initialTab
  const getInitialTab = () => {
    const urlParams = new URLSearchParams(location.search);
    const tabParam = urlParams.get('tab');
    return tabs.find(tab => tab.id === tabParam) ? tabParam : initialTab;
  };
  
  const [activeTab, setActiveTab] = useState(getInitialTab);

  // Update URL when tab changes
  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    const urlParams = new URLSearchParams(location.search);
    urlParams.set('tab', tabId);
    navigate(`${location.pathname}?${urlParams.toString()}`, { replace: true });
  };

  // Update tab if URL parameter changes
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam && tabs.find(tab => tab.id === tabParam)) {
      setActiveTab(tabParam);
    }
  }, [location.search]);

  return (
    <div className="space-y-6">
      {/* Quick Access Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`p-4 rounded-lg border-2 transition-all duration-200 hover:shadow-md ${
                activeTab === tab.id
                  ? 'border-baylor-green bg-baylor-green/5 shadow-md'
                  : 'border-gray-200 bg-white hover:border-baylor-green/30 hover:bg-baylor-green/2'
              }`}
            >
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${
                  activeTab === tab.id 
                    ? 'bg-baylor-green text-white' 
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <h3 className={`font-medium text-sm ${
                    activeTab === tab.id ? 'text-baylor-green' : 'text-gray-900'
                  }`}>
                    {tab.label}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">{tab.description}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Main Directory Content */}
      <div className="university-card">
        <div className="university-card-header flex justify-between items-center">
          <div>
            <h2 className="university-card-title">People Directory</h2>
            <p className="university-card-subtitle">Manage faculty, staff, adjunct, and student worker information.</p>
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
                  onClick={() => handleTabChange(tab.id)}
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
            {activeTab === 'student' && <StudentDirectory {...props} />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PeopleDirectory; 