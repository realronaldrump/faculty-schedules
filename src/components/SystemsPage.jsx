import React, { useState, useEffect } from 'react';
import { ArrowLeft, ExternalLink, Settings, GraduationCap, Calendar, IdCard, BookOpen, Save } from 'lucide-react';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { logUpdate, logCreate } from '../utils/changeLogger';
import { useAuth } from '../contexts/AuthContext';

const SystemsPage = ({ onNavigate, availableSemesters, showNotification }) => {
  const { canAccess } = useAuth();
  const [defaultTerm, setDefaultTerm] = useState('');
  const [selectedTerm, setSelectedTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Check if user is admin
  const isAdmin = canAccess && canAccess('administration/baylor-systems');

  // Load current default term setting
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settingsRef = doc(db, 'settings', 'app');
        const settingsSnap = await getDoc(settingsRef);
        
        if (settingsSnap.exists()) {
          const data = settingsSnap.data();
          setDefaultTerm(data.defaultTerm || '');
          setSelectedTerm(data.defaultTerm || '');
        }
      } catch (error) {
        console.error('Error loading settings:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, []);

  // Save default term setting
  const handleSaveDefaultTerm = async () => {
    if (!selectedTerm) {
      showNotification?.('warning', 'No Term Selected', 'Please select a term to set as default.');
      return;
    }

    setSaving(true);
    try {
      console.log('🔒 Attempting to save default term setting...');
      console.log('🔒 isAdmin check result:', isAdmin);
      
      const settingsRef = doc(db, 'settings', 'app');
      const settingsSnap = await getDoc(settingsRef);
      const originalData = settingsSnap.exists() ? settingsSnap.data() : null;
      
      const newSettings = {
        defaultTerm: selectedTerm,
        updatedAt: new Date().toISOString()
      };

      if (!settingsSnap.exists()) {
        newSettings.createdAt = new Date().toISOString();
      }

      console.log('🔒 Writing to settings/app with data:', newSettings);
      await setDoc(settingsRef, newSettings, { merge: true });
      console.log('✅ Successfully saved default term setting');

      // Log the change
      if (originalData) {
        await logUpdate(
          `App Settings - Default Term changed to ${selectedTerm}`,
          'settings',
          'app',
          newSettings,
          originalData,
          'SystemsPage.jsx - handleSaveDefaultTerm'
        );
      } else {
        await logCreate(
          `App Settings - Default Term set to ${selectedTerm}`,
          'settings',
          'app',
          newSettings,
          'SystemsPage.jsx - handleSaveDefaultTerm'
        );
      }

      setDefaultTerm(selectedTerm);
      showNotification?.('success', 'Default Term Updated', `The default term has been set to ${selectedTerm}. This will be the default view for all users.`);
    } catch (error) {
      console.error('❌ Error saving default term:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      
      let errorMessage = 'Failed to save default term setting.';
      
      if (error.code === 'permission-denied') {
        errorMessage = 'Permission denied. Please ensure:\n1. You are logged in as an admin\n2. Firestore security rules have been deployed\n3. Your admin privileges are properly configured';
      }
      
      showNotification?.('error', 'Save Failed', errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleClearDefaultTerm = async () => {
    setSaving(true);
    try {
      const settingsRef = doc(db, 'settings', 'app');
      const settingsSnap = await getDoc(settingsRef);
      const originalData = settingsSnap.exists() ? settingsSnap.data() : null;
      
      const newSettings = {
        defaultTerm: null,
        updatedAt: new Date().toISOString()
      };

      await setDoc(settingsRef, newSettings, { merge: true });

      // Log the change
      await logUpdate(
        'App Settings - Default Term cleared (will use most recent)',
        'settings',
        'app',
        newSettings,
        originalData,
        'SystemsPage.jsx - handleClearDefaultTerm'
      );

      setDefaultTerm('');
      setSelectedTerm('');
      showNotification?.('success', 'Default Term Cleared', 'The app will now default to the most recent term.');
    } catch (error) {
      console.error('Error clearing default term:', error);
      showNotification?.('error', 'Clear Failed', 'Failed to clear default term setting. Please try again.');
    } finally {
      setSaving(false);
    }
  };
  const systems = [
    { 
      name: 'Schedule of Classes', 
      description: 'Official University course schedule and enrollment system',
      url: 'https://www1.baylor.edu/scheduleofclasses/',
      icon: Calendar,
      category: 'Academic',
      color: 'bg-baylor-green'
    },
    { 
      name: 'CLSS', 
      description: 'Course Listing and Schedule System for faculty and staff',
      url: 'https://registrar.web.baylor.edu/courses-catalogs/clss-class-scheduling-facultystaff',
      icon: BookOpen,
      category: 'Academic',
      color: 'bg-baylor-green'
    },
    { 
      name: 'ChairSIS', 
      description: 'Program Management and Administrative System',
      url: 'https://www1.baylor.edu/ChairSIS/',
      icon: Settings,
      category: 'Administrative',
      color: 'bg-baylor-green'
    },
    { 
      name: 'Canvas', 
      description: 'Learning Management System for courses and content',
      url: 'https://canvas.baylor.edu/',
      icon: GraduationCap,
      category: 'Academic',
      color: 'bg-baylor-gold'
    },
    { 
      name: 'CSGold', 
      description: 'ID Card System for campus identification and access',
      url: 'https://idcard.baylor.edu',
      icon: IdCard,
      category: 'Campus Services',
      color: 'bg-baylor-gold'
    }
  ];

  const categories = [...new Set(systems.map(system => system.category))];

  const SystemCard = ({ system }) => {
    const Icon = system.icon;
    
    return (
      <a
        href={system.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group block p-6 bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 hover:border-baylor-green/30"
      >
        <div className="flex items-start space-x-4">
          <div className={`p-3 ${system.color} rounded-lg group-hover:scale-110 transition-transform duration-200`}>
            <Icon className="w-6 h-6 text-white" />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 group-hover:text-baylor-green transition-colors">
                {system.name}
              </h3>
              <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-baylor-green transition-colors" />
            </div>
            
            <p className="text-gray-600 mt-1 text-sm leading-relaxed">
              {system.description}
            </p>
            
            <div className="mt-3 flex items-center">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                {system.category}
              </span>
              <span className="ml-3 text-xs text-baylor-green font-medium group-hover:underline">
                Visit System →
              </span>
            </div>
          </div>
        </div>
      </a>
    );
  };

  const CategorySection = ({ category, systemsInCategory }) => (
    <div className="space-y-4">
      <h2 className="text-lg font-serif font-semibold text-baylor-green border-b border-baylor-gold/30 pb-2">
        {category} Systems
      </h2>
      <div className="grid gap-4">
        {systemsInCategory.map((system) => (
          <SystemCard key={system.name} system={system} />
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Back Navigation */}
      <button 
        onClick={() => onNavigate('dashboard')}
        className="flex items-center text-baylor-green hover:text-baylor-green/80 transition-colors font-medium"
      >
        <ArrowLeft size={20} className="mr-2" />
        Back to Dashboard
      </button>

      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">System Settings & Resources</h1>
        <p className="text-gray-600">Configure app settings and access official Baylor University tools</p>
      </div>

      {/* Admin Settings Section - Default Term */}
      {isAdmin && (
        <div className="bg-white rounded-lg shadow-sm border-2 border-baylor-green/20 p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-baylor-green/10 rounded-lg">
                <Settings className="w-5 h-5 text-baylor-green" />
              </div>
              <div>
                <h2 className="text-lg font-serif font-semibold text-baylor-green">
                  Default Term Setting
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  Control which term is shown by default to all users when they first access the app
                </p>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <Calendar className="w-5 h-5 text-blue-600 mt-0.5" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800 mb-1">
                  How Default Term Works
                </h3>
                <p className="text-sm text-blue-700">
                  By default, the app shows the most recent term (based on year and semester). As an admin, you can override this 
                  to show a specific term instead. This is useful when you want to highlight a particular semester, such as the 
                  upcoming term instead of the current one.
                </p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="loading-shimmer w-8 h-8 rounded"></div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Default Term
                  {defaultTerm && (
                    <span className="ml-2 text-xs text-baylor-green font-normal">
                      (Currently: {defaultTerm})
                    </span>
                  )}
                </label>
                <select
                  value={selectedTerm}
                  onChange={(e) => setSelectedTerm(e.target.value)}
                  className="w-full md:w-96 border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
                  disabled={saving}
                >
                  <option value="">Use most recent term (automatic)</option>
                  {availableSemesters && availableSemesters.map((semester) => (
                    <option key={semester} value={semester}>
                      {semester}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-2">
                  {selectedTerm 
                    ? `When set, all users will see "${selectedTerm}" by default when they log in.`
                    : 'The app will automatically show the most recent term based on the data.'}
                </p>
              </div>

              <div className="flex items-center space-x-3 pt-2">
                <button
                  onClick={handleSaveDefaultTerm}
                  disabled={saving || !selectedTerm || selectedTerm === defaultTerm}
                  className="btn-primary flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? 'Saving...' : 'Save Default Term'}
                </button>

                {defaultTerm && (
                  <button
                    onClick={handleClearDefaultTerm}
                    disabled={saving}
                    className="btn-ghost flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Clear Override
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Divider */}
      {isAdmin && (
        <div className="border-t border-gray-200"></div>
      )}

      {/* Quick Access Banner */}
      <div className="university-header rounded-xl p-8">
        <div className="university-brand">
          <div className="university-logo">
            <ExternalLink className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="university-title">Official University Resources</h2>
            <p className="university-subtitle">
              Direct links to essential Baylor systems for faculty and staff
            </p>
          </div>
        </div>
      </div>

      {/* Systems Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
          <div className="w-12 h-12 bg-baylor-green/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-6 h-6 text-baylor-green" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">Academic Systems</h3>
          <p className="text-sm text-gray-600">Course management, scheduling, and learning platforms</p>
        </div>
        
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
          <div className="w-12 h-12 bg-baylor-green/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Settings className="w-6 h-6 text-baylor-green" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">Administrative</h3>
                          <p className="text-sm text-gray-600">Program management and administrative tools</p>
        </div>
        
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
          <div className="w-12 h-12 bg-baylor-green/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <IdCard className="w-6 h-6 text-baylor-green" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">Campus Services</h3>
          <p className="text-sm text-gray-600">ID cards, access control, and campus utilities</p>
        </div>
      </div>

      {/* Systems by Category */}
      <div className="space-y-8">
        {categories.map(category => (
          <CategorySection
            key={category}
            category={category}
            systemsInCategory={systems.filter(system => system.category === category)}
          />
        ))}
      </div>

      {/* Important Notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <ExternalLink className="w-5 h-5 text-amber-600" />
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-amber-800 mb-1">
              External Systems Notice
            </h3>
            <p className="text-sm text-amber-700">
              These links will open in new tabs and direct you to official Baylor University systems. 
              You may need to authenticate with your Baylor credentials to access certain resources. 
              For technical support with these systems, please contact the appropriate Baylor IT department.
            </p>
          </div>
        </div>
      </div>

      {/* Help Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-serif font-semibold text-baylor-green mb-4">
          Need Help?
        </h2>
        
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-medium text-gray-900 mb-2">IT Support</h3>
            <p className="text-sm text-gray-600 mb-3">
              For technical issues with university systems, contact Baylor IT Services.
            </p>
            <a 
              href="https://www.baylor.edu/its/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sm text-baylor-green hover:underline font-medium"
            >
              Visit Baylor IT Services →
            </a>
          </div>
          
          <div>
            <h3 className="font-medium text-gray-900 mb-2">HSD Dashboard Support</h3>
            <p className="text-sm text-gray-600 mb-3">
              For questions about this HSD Dashboard application, contact Davis! (davis_deaton1@balyor.edu).
            </p>
            <button 
              onClick={() => onNavigate('dashboard')}
              className="text-sm text-baylor-green hover:underline font-medium"
            >
              Return to Dashboard →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemsPage;