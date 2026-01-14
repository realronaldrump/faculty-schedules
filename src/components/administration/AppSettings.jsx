import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Settings, Calendar, Building2, DoorOpen, Save } from 'lucide-react';
import { db, COLLECTIONS } from '../../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { logUpdate, logCreate } from '../../utils/changeLogger';
import { useAuth } from '../../contexts/AuthContext';
import { useSchedules } from '../../contexts/ScheduleContext';
import { useUI } from '../../contexts/UIContext';
import { useAppConfig } from '../../contexts/AppConfigContext';
import { backfillTermMetadata } from '../../utils/termDataUtils';
import { ConfirmationDialog } from '../CustomAlert';
import BuildingManagement from './BuildingManagement';
import SpaceManagement from './SpaceManagement';

const AppSettings = () => {
  const navigate = useNavigate();
  const { availableSemesters = [], termOptions = [], refreshTerms } = useSchedules();
  const { showNotification } = useUI();
  const { canAccess } = useAuth();
  const { termConfig, saveTermConfig } = useAppConfig();
  const [defaultTerm, setDefaultTerm] = useState('');
  const [selectedTerm, setSelectedTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [termActionLoading, setTermActionLoading] = useState('');
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState(null);
  const [showBackfillConfirm, setShowBackfillConfirm] = useState(false);
  const [termConfigDraft, setTermConfigDraft] = useState('');
  const [savingConfigs, setSavingConfigs] = useState(false);
  const [locationTab, setLocationTab] = useState('buildings');
  const [activeSection, setActiveSection] = useState('terms');

  const isAdmin = canAccess && canAccess('administration/app-settings');

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

  useEffect(() => {
    setTermConfigDraft(JSON.stringify(termConfig, null, 2));
  }, [termConfig]);

  // Save default term setting
  const handleSaveDefaultTerm = async () => {
    if (!selectedTerm) {
      showNotification?.('warning', 'No Term Selected', 'Please select a term to set as default.');
      return;
    }

    setSaving(true);
    try {
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

      await setDoc(settingsRef, newSettings, { merge: true });

      if (originalData) {
        await logUpdate(
          `App Settings - Default Term changed to ${selectedTerm}`,
          'settings',
          'app',
          newSettings,
          originalData,
          'AppSettings.jsx - handleSaveDefaultTerm'
        );
      } else {
        await logCreate(
          `App Settings - Default Term set to ${selectedTerm}`,
          'settings',
          'app',
          newSettings,
          'AppSettings.jsx - handleSaveDefaultTerm'
        );
      }

      setDefaultTerm(selectedTerm);
      showNotification?.('success', 'Default Term Updated', `The default term has been set to ${selectedTerm}. This will be the default view for all users.`);
    } catch (error) {
      console.error('Error saving default term:', error);
      let errorMessage = 'Failed to save default term setting.';
      if (error.code === 'permission-denied') {
        errorMessage = 'Permission denied. Please ensure you have admin privileges.';
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

      await logUpdate(
        'App Settings - Default Term cleared (will use most recent)',
        'settings',
        'app',
        newSettings,
        originalData,
        'AppSettings.jsx - handleClearDefaultTerm'
      );

      setDefaultTerm('');
      setSelectedTerm('');
      showNotification?.('success', 'Default Term Cleared', 'The app will now default to the most recent term.');
    } catch (error) {
      console.error('Error clearing default term:', error);
      showNotification?.('error', 'Clear Failed', 'Failed to clear default term setting.');
    } finally {
      setSaving(false);
    }
  };

  const updateTermLifecycle = async (term, updates, actionLabel) => {
    if (!term?.termCode) {
      showNotification?.('warning', 'Missing Term Code', 'Term code is required to update lifecycle status.');
      return;
    }
    setTermActionLoading(term.termCode);
    try {
      const termRef = doc(db, COLLECTIONS.TERMS, term.termCode);
      const payload = {
        term: term.term || term.termCode,
        termCode: term.termCode,
        ...updates,
        updatedAt: new Date().toISOString()
      };
      await setDoc(termRef, payload, { merge: true });
      await logUpdate(
        `Term - ${term.term || term.termCode} (${actionLabel})`,
        COLLECTIONS.TERMS,
        term.termCode,
        payload,
        term,
        'AppSettings.jsx - updateTermLifecycle'
      );
      await refreshTerms?.();
      showNotification?.('success', 'Term Updated', `${term.term || term.termCode} updated successfully.`);
    } catch (error) {
      console.error('Error updating term lifecycle:', error);
      showNotification?.('error', 'Update Failed', 'Failed to update term lifecycle.');
    } finally {
      setTermActionLoading('');
    }
  };

  const handleArchiveTerm = async (term) => {
    await updateTermLifecycle(term, {
      status: 'archived',
      locked: true,
      archivedAt: new Date().toISOString()
    }, 'archived');
  };

  const handleRestoreTerm = async (term) => {
    await updateTermLifecycle(term, {
      status: 'active',
      locked: false,
      archivedAt: null
    }, 'restored');
  };

  const handleToggleTermLock = async (term) => {
    if (term?.status === 'archived') return;
    await updateTermLifecycle(term, {
      status: term.status || 'active',
      locked: !term.locked
    }, term.locked ? 'unlocked' : 'locked');
  };

  const handleBackfillTerms = () => {
    setShowBackfillConfirm(true);
  };

  const handleConfirmBackfillTerms = async () => {
    if (isBackfilling) return;
    setShowBackfillConfirm(false);
    setIsBackfilling(true);
    setBackfillResult(null);
    try {
      const result = await backfillTermMetadata();
      setBackfillResult(result);
      await refreshTerms?.();
      showNotification?.('success', 'Backfill Complete', `Updated ${result.schedulesUpdated} schedules and upserted ${result.termsUpserted} terms.`);
    } catch (error) {
      console.error('Backfill error:', error);
      showNotification?.('error', 'Backfill Failed', error.message || 'Unable to backfill terms.');
    } finally {
      setIsBackfilling(false);
    }
  };

  const handleCancelBackfillTerms = () => {
    if (isBackfilling) return;
    setShowBackfillConfirm(false);
  };

  const handleSaveTermConfig = async () => {
    if (!termConfigDraft.trim()) {
      showNotification?.('warning', 'Missing Config', 'Term configuration cannot be empty.');
      return;
    }
    setSavingConfigs(true);
    try {
      const parsed = JSON.parse(termConfigDraft);
      await saveTermConfig(parsed);
      await refreshTerms?.();
      showNotification?.('success', 'Term Settings Saved', 'Term mapping configuration updated.');
    } catch (error) {
      console.error('Error saving term config:', error);
      showNotification?.('error', 'Save Failed', 'Term configuration JSON is invalid or could not be saved.');
    } finally {
      setSavingConfigs(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <button 
          onClick={() => navigate('/dashboard')}
          className="flex items-center text-baylor-green hover:text-baylor-green/80 transition-colors font-medium"
        >
          <ArrowLeft size={20} className="mr-2" />
          Back to Dashboard
        </button>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
          <Settings className="w-12 h-12 text-amber-600 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-amber-800 mb-2">Admin Access Required</h2>
          <p className="text-amber-700">
            You need administrator privileges to access app settings.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Backfill Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showBackfillConfirm}
        title="Backfill Term Metadata"
        message="This will scan all schedules and ensure each term has metadata in the terms collection. Continue?"
        confirmText="Run Backfill"
        cancelText="Cancel"
        onConfirm={handleConfirmBackfillTerms}
        onCancel={handleCancelBackfillTerms}
      />

      {/* Back Navigation */}
      <button 
        onClick={() => navigate('/dashboard')}
        className="flex items-center text-baylor-green hover:text-baylor-green/80 transition-colors font-medium"
      >
        <ArrowLeft size={20} className="mr-2" />
        Back to Dashboard
      </button>

      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">App Settings</h1>
        <p className="text-gray-600">Configure application-wide settings, terms, and locations</p>
      </div>

      {/* Section Navigation */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveSection('terms')}
          className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
            activeSection === 'terms'
              ? 'border-baylor-green text-baylor-green font-medium'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Calendar size={18} />
          Terms & Semesters
        </button>
        <button
          onClick={() => setActiveSection('locations')}
          className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
            activeSection === 'locations'
              ? 'border-baylor-green text-baylor-green font-medium'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Building2 size={18} />
          Locations
        </button>
      </div>

      {/* Terms Section */}
      {activeSection === 'terms' && (
        <div className="space-y-6">
          {/* Default Term Setting */}
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
                    Control which term is shown by default to all users
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-start">
                <Calendar className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-blue-800 mb-1">How Default Term Works</h3>
                  <p className="text-sm text-blue-700">
                    By default, the app shows the most recent term. Override this to highlight a specific semester.
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
                      <option key={semester} value={semester}>{semester}</option>
                    ))}
                  </select>
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

          {/* Term Configuration */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-baylor-green/10 rounded-lg">
                  <Calendar className="w-5 h-5 text-baylor-green" />
                </div>
                <div>
                  <h2 className="text-lg font-serif font-semibold text-baylor-green">Term Configuration</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Define how term codes map to semester names and recency order.
                  </p>
                </div>
              </div>
            </div>

            <p className="text-xs text-gray-500 mb-3">
              Update <span className="font-medium">codeToSeason</span> and <span className="font-medium">seasonOrder</span> to match your institution's term codes.
            </p>

            <textarea
              value={termConfigDraft}
              onChange={(e) => setTermConfigDraft(e.target.value)}
              className="w-full min-h-[180px] border border-gray-300 rounded-lg p-3 text-sm font-mono focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
              spellCheck={false}
              disabled={savingConfigs}
            />

            <div className="flex items-center space-x-3 pt-3">
              <button
                onClick={handleSaveTermConfig}
                disabled={savingConfigs}
                className="btn-primary flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4 mr-2" />
                {savingConfigs ? 'Saving...' : 'Save Term Configuration'}
              </button>
            </div>
          </div>

          {/* Term Lifecycle Management */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <Calendar className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                  <h2 className="text-lg font-serif font-semibold text-baylor-green">Term Lifecycle Management</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Archive or lock past terms to keep schedules read-only.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-4">
              <button
                onClick={handleBackfillTerms}
                disabled={isBackfilling}
                className="btn-ghost flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isBackfilling ? 'Backfilling...' : 'Backfill Term Metadata'}
              </button>
              {backfillResult && (
                <span className="text-xs text-gray-600">
                  Updated {backfillResult.schedulesUpdated} schedules · Upserted {backfillResult.termsUpserted} terms
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                  <tr>
                    <th className="py-2 pr-4">Term</th>
                    <th className="py-2 pr-4">Code</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Locked</th>
                    <th className="py-2 pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {termOptions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-3 text-gray-500">No terms found. Run backfill to populate.</td>
                    </tr>
                  )}
                  {termOptions.map((term) => {
                    const isArchived = term.status === 'archived';
                    const isLocked = term.locked === true || isArchived;
                    return (
                      <tr key={term.termCode || term.term}>
                        <td className="py-2 pr-4 font-medium text-gray-800">{term.term || term.termCode}</td>
                        <td className="py-2 pr-4 text-gray-600">{term.termCode || '—'}</td>
                        <td className="py-2 pr-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${isArchived ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}`}>
                            {isArchived ? 'Archived' : 'Active'}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-gray-700">{isLocked ? 'Yes' : 'No'}</td>
                        <td className="py-2 pr-4">
                          <div className="flex flex-wrap gap-2">
                            {isArchived ? (
                              <button
                                onClick={() => handleRestoreTerm(term)}
                                disabled={termActionLoading === term.termCode}
                                className="btn-ghost text-xs"
                              >
                                Restore
                              </button>
                            ) : (
                              <button
                                onClick={() => handleArchiveTerm(term)}
                                disabled={termActionLoading === term.termCode}
                                className="btn-ghost text-xs"
                              >
                                Archive
                              </button>
                            )}
                            <button
                              onClick={() => handleToggleTermLock(term)}
                              disabled={isArchived || termActionLoading === term.termCode}
                              className="btn-ghost text-xs"
                            >
                              {isLocked ? 'Unlock' : 'Lock'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Locations Section */}
      {activeSection === 'locations' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-baylor-gold/20 rounded-lg">
                <Building2 className="w-5 h-5 text-baylor-green" />
              </div>
              <div>
                <h2 className="text-lg font-serif font-semibold text-baylor-green">Location Management</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Manage buildings and spaces (classrooms, offices, labs) used across the app.
                </p>
              </div>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex border-b border-gray-200 mb-6">
            <button
              onClick={() => setLocationTab('buildings')}
              className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
                locationTab === 'buildings'
                  ? 'border-baylor-green text-baylor-green font-medium'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Building2 size={18} />
              Buildings
            </button>
            <button
              onClick={() => setLocationTab('spaces')}
              className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
                locationTab === 'spaces'
                  ? 'border-baylor-green text-baylor-green font-medium'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <DoorOpen size={18} />
              Spaces
            </button>
          </div>

          {/* Tab Content */}
          {locationTab === 'buildings' ? <BuildingManagement /> : <SpaceManagement />}
        </div>
      )}
    </div>
  );
};

export default AppSettings;
