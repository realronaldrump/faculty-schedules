import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Settings, Calendar, Building2, DoorOpen, Save, HelpCircle, Archive, Lock, Unlock, RotateCcw, Trash2, GitMerge, ChevronDown, ChevronUp, AlertTriangle, BookOpen, Info, Plus, X } from 'lucide-react';
import { db, COLLECTIONS } from '../../firebase';
import { doc, getDoc, setDoc, collection, query, where, getDocs, deleteDoc, writeBatch } from 'firebase/firestore';
import { logUpdate, logCreate, logDelete, logBulkUpdate } from '../../utils/changeLogger';
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
  const [savingConfigs, setSavingConfigs] = useState(false);
  const [locationTab, setLocationTab] = useState('buildings');
  const [activeSection, setActiveSection] = useState('terms');
  
  // Term Configuration State (visual editor)
  const [seasonMappings, setSeasonMappings] = useState([]);
  const [seasonOrder, setSeasonOrder] = useState([]);
  const [showAddMapping, setShowAddMapping] = useState(false);
  const [newMappingCode, setNewMappingCode] = useState('');
  const [newMappingSeason, setNewMappingSeason] = useState('');
  
  // Term Lifecycle State
  const [termCourseCounts, setTermCourseCounts] = useState({});
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [expandedTermInfo, setExpandedTermInfo] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [showMergeDialog, setShowMergeDialog] = useState(null);
  const [mergeTargetTerm, setMergeTargetTerm] = useState('');
  const [showHelpPanel, setShowHelpPanel] = useState(false);

  const isAdmin = canAccess && canAccess('administration/app-settings');

  // Initialize season mappings from termConfig
  useEffect(() => {
    if (termConfig) {
      const mappings = Object.entries(termConfig.codeToSeason || {}).map(([code, season]) => ({
        code,
        season
      }));
      setSeasonMappings(mappings);
      setSeasonOrder(termConfig.seasonOrder || ['Winter', 'Spring', 'Summer', 'Fall']);
    }
  }, [termConfig]);

  // Fetch course counts for all terms
  const fetchTermCourseCounts = useCallback(async () => {
    if (termOptions.length === 0) return;
    setLoadingCounts(true);
    try {
      const counts = {};
      for (const term of termOptions) {
        const termCode = term.termCode;
        const termLabel = term.term;
        
        // Query by termCode first, then by term label
        let countQuery;
        if (termCode) {
          countQuery = query(collection(db, COLLECTIONS.SCHEDULES), where('termCode', '==', termCode));
        } else {
          countQuery = query(collection(db, COLLECTIONS.SCHEDULES), where('term', '==', termLabel));
        }
        
        const snapshot = await getDocs(countQuery);
        counts[termCode || termLabel] = snapshot.size;
      }
      setTermCourseCounts(counts);
    } catch (error) {
      console.error('Error fetching term course counts:', error);
    } finally {
      setLoadingCounts(false);
    }
  }, [termOptions]);

  useEffect(() => {
    fetchTermCourseCounts();
  }, [fetchTermCourseCounts]);

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

  // Visual term config handlers
  const handleAddSeasonMapping = () => {
    if (!newMappingCode.trim() || !newMappingSeason.trim()) {
      showNotification?.('warning', 'Missing Values', 'Please enter both a code and season name.');
      return;
    }
    if (seasonMappings.some(m => m.code === newMappingCode.trim())) {
      showNotification?.('warning', 'Duplicate Code', 'This code already exists.');
      return;
    }
    setSeasonMappings([...seasonMappings, { code: newMappingCode.trim(), season: newMappingSeason.trim() }]);
    setNewMappingCode('');
    setNewMappingSeason('');
    setShowAddMapping(false);
  };

  const handleRemoveSeasonMapping = (code) => {
    setSeasonMappings(seasonMappings.filter(m => m.code !== code));
  };

  const handleUpdateSeasonMapping = (code, newSeason) => {
    setSeasonMappings(seasonMappings.map(m => m.code === code ? { ...m, season: newSeason } : m));
  };

  const handleMoveSeasonOrder = (index, direction) => {
    const newOrder = [...seasonOrder];
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= newOrder.length) return;
    [newOrder[index], newOrder[newIndex]] = [newOrder[newIndex], newOrder[index]];
    setSeasonOrder(newOrder);
  };

  const handleSaveTermConfig = async () => {
    setSavingConfigs(true);
    try {
      const codeToSeason = {};
      seasonMappings.forEach(m => {
        codeToSeason[m.code] = m.season;
      });
      
      const newConfig = {
        version: termConfig.version || 1,
        codeToSeason,
        seasonOrder,
        twoDigitYearBase: termConfig.twoDigitYearBase || 2000
      };
      
      await saveTermConfig(newConfig);
      await refreshTerms?.();
      showNotification?.('success', 'Settings Saved', 'Semester settings have been updated.');
    } catch (error) {
      console.error('Error saving term config:', error);
      showNotification?.('error', 'Save Failed', 'Could not save semester settings.');
    } finally {
      setSavingConfigs(false);
    }
  };

  // Term deletion handler
  const handleDeleteTerm = async (term) => {
    if (!term?.termCode) {
      showNotification?.('warning', 'Missing Term', 'Cannot delete term without a term code.');
      return;
    }
    
    const courseCount = termCourseCounts[term.termCode] || 0;
    
    setTermActionLoading(term.termCode);
    try {
      if (courseCount > 0) {
        // Delete all schedules for this term
        const schedulesQuery = query(
          collection(db, COLLECTIONS.SCHEDULES),
          where('termCode', '==', term.termCode)
        );
        const schedulesSnapshot = await getDocs(schedulesQuery);
        
        const batch = writeBatch(db);
        schedulesSnapshot.docs.forEach(docSnap => {
          batch.delete(docSnap.ref);
        });
        
        // Delete the term document
        const termRef = doc(db, COLLECTIONS.TERMS, term.termCode);
        batch.delete(termRef);
        
        await batch.commit();
        
        await logBulkUpdate(
          `Deleted term ${term.term || term.termCode} and ${courseCount} courses`,
          COLLECTIONS.TERMS,
          courseCount,
          'AppSettings.jsx - handleDeleteTerm',
          { action: 'delete_term_with_courses', termCode: term.termCode }
        );
      } else {
        // Just delete the term document
        const termRef = doc(db, COLLECTIONS.TERMS, term.termCode);
        await deleteDoc(termRef);
        
        await logDelete(
          `Deleted empty term ${term.term || term.termCode}`,
          COLLECTIONS.TERMS,
          term.termCode,
          term,
          'AppSettings.jsx - handleDeleteTerm'
        );
      }
      
      await refreshTerms?.();
      await fetchTermCourseCounts();
      showNotification?.('success', 'Term Deleted', `${term.term || term.termCode} has been permanently deleted.`);
    } catch (error) {
      console.error('Error deleting term:', error);
      showNotification?.('error', 'Delete Failed', 'Could not delete the term.');
    } finally {
      setTermActionLoading('');
      setShowDeleteConfirm(null);
    }
  };

  // Term merge handler
  const handleMergeTerm = async (sourceTerm) => {
    if (!sourceTerm?.termCode || !mergeTargetTerm) {
      showNotification?.('warning', 'Missing Selection', 'Please select a target term to merge into.');
      return;
    }
    
    const targetTermData = termOptions.find(t => t.termCode === mergeTargetTerm);
    if (!targetTermData) {
      showNotification?.('error', 'Invalid Target', 'Target term not found.');
      return;
    }
    
    setTermActionLoading(sourceTerm.termCode);
    try {
      // Update all schedules from source term to target term
      const schedulesQuery = query(
        collection(db, COLLECTIONS.SCHEDULES),
        where('termCode', '==', sourceTerm.termCode)
      );
      const schedulesSnapshot = await getDocs(schedulesQuery);
      
      const batch = writeBatch(db);
      let updatedCount = 0;
      
      schedulesSnapshot.docs.forEach(docSnap => {
        batch.update(docSnap.ref, {
          term: targetTermData.term,
          termCode: targetTermData.termCode,
          mergedFrom: sourceTerm.termCode,
          updatedAt: new Date().toISOString()
        });
        updatedCount++;
      });
      
      // Delete the source term document
      const sourceTermRef = doc(db, COLLECTIONS.TERMS, sourceTerm.termCode);
      batch.delete(sourceTermRef);
      
      await batch.commit();
      
      await logBulkUpdate(
        `Merged ${updatedCount} courses from ${sourceTerm.term || sourceTerm.termCode} into ${targetTermData.term}`,
        COLLECTIONS.SCHEDULES,
        updatedCount,
        'AppSettings.jsx - handleMergeTerm',
        { action: 'merge_terms', source: sourceTerm.termCode, target: targetTermData.termCode }
      );
      
      await refreshTerms?.();
      await fetchTermCourseCounts();
      showNotification?.('success', 'Terms Merged', `${updatedCount} courses moved from ${sourceTerm.term || sourceTerm.termCode} to ${targetTermData.term}.`);
    } catch (error) {
      console.error('Error merging terms:', error);
      showNotification?.('error', 'Merge Failed', 'Could not merge the terms.');
    } finally {
      setTermActionLoading('');
      setShowMergeDialog(null);
      setMergeTargetTerm('');
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

          {/* Semester Settings (formerly Term Configuration) */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-baylor-green/10 rounded-lg">
                  <Calendar className="w-5 h-5 text-baylor-green" />
                </div>
                <div>
                  <h2 className="text-lg font-serif font-semibold text-baylor-green">Semester Settings</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Configure how your institution's semester codes are displayed
                  </p>
                </div>
              </div>
            </div>

            {/* Info Box */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-start">
                <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-blue-800 mb-1">What are semester codes?</h3>
                  <p className="text-sm text-blue-700">
                    Your course data uses numeric codes (like "40" or "30") to identify semesters. 
                    These settings map those codes to friendly names like "Spring" or "Fall".
                  </p>
                </div>
              </div>
            </div>

            {/* Semester Code Mappings */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Semester Code Mappings</h3>
              <p className="text-xs text-gray-500 mb-3">
                Map the numeric codes from your course data to semester names
              </p>
              
              <div className="space-y-2">
                {seasonMappings.map((mapping) => (
                  <div key={mapping.code} className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                    <div className="flex-1 grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Code</label>
                        <div className="font-mono text-sm bg-white border border-gray-200 rounded px-3 py-1.5">
                          {mapping.code}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Semester Name</label>
                        <select
                          value={mapping.season}
                          onChange={(e) => handleUpdateSeasonMapping(mapping.code, e.target.value)}
                          className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
                        >
                          <option value="Winter">Winter</option>
                          <option value="Spring">Spring</option>
                          <option value="Summer">Summer</option>
                          <option value="Fall">Fall</option>
                        </select>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveSeasonMapping(mapping.code)}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                      title="Remove mapping"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
                
                {/* Add New Mapping */}
                {showAddMapping ? (
                  <div className="flex items-center gap-3 bg-baylor-green/5 border border-baylor-green/20 rounded-lg p-3">
                    <div className="flex-1 grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Code</label>
                        <input
                          type="text"
                          value={newMappingCode}
                          onChange={(e) => setNewMappingCode(e.target.value)}
                          placeholder="e.g., 60"
                          className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm font-mono focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Semester Name</label>
                        <select
                          value={newMappingSeason}
                          onChange={(e) => setNewMappingSeason(e.target.value)}
                          className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
                        >
                          <option value="">Select...</option>
                          <option value="Winter">Winter</option>
                          <option value="Spring">Spring</option>
                          <option value="Summer">Summer</option>
                          <option value="Fall">Fall</option>
                        </select>
                      </div>
                    </div>
                    <button
                      onClick={handleAddSeasonMapping}
                      className="p-1.5 text-baylor-green hover:bg-baylor-green/10 rounded transition-colors"
                      title="Add mapping"
                    >
                      <Save size={16} />
                    </button>
                    <button
                      onClick={() => { setShowAddMapping(false); setNewMappingCode(''); setNewMappingSeason(''); }}
                      className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition-colors"
                      title="Cancel"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAddMapping(true)}
                    className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-baylor-green hover:text-baylor-green transition-colors"
                  >
                    <Plus size={16} />
                    Add Code Mapping
                  </button>
                )}
              </div>
            </div>

            {/* Semester Order */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Semester Display Order</h3>
              <p className="text-xs text-gray-500 mb-3">
                Set the order of semesters within each academic year (earliest to latest)
              </p>
              
              <div className="space-y-1">
                {seasonOrder.map((season, index) => (
                  <div key={season} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                    <span className="text-xs text-gray-400 w-6">{index + 1}.</span>
                    <span className="flex-1 text-sm font-medium text-gray-700">{season}</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleMoveSeasonOrder(index, -1)}
                        disabled={index === 0}
                        className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        title="Move up"
                      >
                        <ChevronUp size={16} />
                      </button>
                      <button
                        onClick={() => handleMoveSeasonOrder(index, 1)}
                        disabled={index === seasonOrder.length - 1}
                        className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        title="Move down"
                      >
                        <ChevronDown size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center space-x-3 pt-3 border-t border-gray-100">
              <button
                onClick={handleSaveTermConfig}
                disabled={savingConfigs}
                className="btn-primary flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4 mr-2" />
                {savingConfigs ? 'Saving...' : 'Save Semester Settings'}
              </button>
            </div>
          </div>

          {/* Your Semesters (formerly Term Lifecycle Management) */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <BookOpen className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                  <h2 className="text-lg font-serif font-semibold text-baylor-green">Your Semesters</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    View and manage all semesters with course data
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowHelpPanel(!showHelpPanel)}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-baylor-green transition-colors"
              >
                <HelpCircle size={16} />
                {showHelpPanel ? 'Hide Help' : 'What do these actions do?'}
              </button>
            </div>

            {/* Help Panel */}
            {showHelpPanel && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Understanding Semester Actions</h3>
                <div className="grid md:grid-cols-2 gap-4 text-sm">
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 bg-blue-100 rounded">
                      <Lock size={14} className="text-blue-600" />
                    </div>
                    <div>
                      <span className="font-medium text-gray-800">Lock</span>
                      <p className="text-gray-600 text-xs mt-0.5">
                        Prevents any edits to courses in this semester. Courses are still visible and searchable. 
                        Use this when a semester is complete but you want to keep it active.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 bg-amber-100 rounded">
                      <Archive size={14} className="text-amber-600" />
                    </div>
                    <div>
                      <span className="font-medium text-gray-800">Archive</span>
                      <p className="text-gray-600 text-xs mt-0.5">
                        Hides this semester from the main semester dropdown. Data is preserved and can be restored anytime.
                        Archived semesters are automatically locked.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 bg-purple-100 rounded">
                      <GitMerge size={14} className="text-purple-600" />
                    </div>
                    <div>
                      <span className="font-medium text-gray-800">Merge</span>
                      <p className="text-gray-600 text-xs mt-0.5">
                        Moves all courses from this semester into another semester. Use this to fix duplicate semesters 
                        or combine data. The source semester is deleted after merging.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 bg-red-100 rounded">
                      <Trash2 size={14} className="text-red-600" />
                    </div>
                    <div>
                      <span className="font-medium text-gray-800">Delete</span>
                      <p className="text-gray-600 text-xs mt-0.5">
                        <strong className="text-red-600">Permanently removes</strong> this semester and all its courses. 
                        This action cannot be undone. Consider archiving or merging instead.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Actions Bar */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <button
                onClick={handleBackfillTerms}
                disabled={isBackfilling}
                className="btn-ghost flex items-center text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RotateCcw size={14} className={`mr-1.5 ${isBackfilling ? 'animate-spin' : ''}`} />
                {isBackfilling ? 'Scanning...' : 'Scan for New Semesters'}
              </button>
              {backfillResult && (
                <span className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded">
                  Found {backfillResult.termsUpserted} semesters from {backfillResult.schedulesUpdated} courses
                </span>
              )}
              {loadingCounts && (
                <span className="text-xs text-gray-500">Loading course counts...</span>
              )}
            </div>

            {/* Semester Cards */}
            <div className="space-y-3">
              {termOptions.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="font-medium">No semesters found</p>
                  <p className="text-sm mt-1">Click "Scan for New Semesters" to discover semesters from your course data.</p>
                </div>
              ) : (
                termOptions.map((term) => {
                  const isArchived = term.status === 'archived';
                  const isLocked = term.locked === true || isArchived;
                  const courseCount = termCourseCounts[term.termCode] || termCourseCounts[term.term] || 0;
                  const isExpanded = expandedTermInfo === term.termCode;
                  const isLoading = termActionLoading === term.termCode;
                  
                  // Check for potential duplicates (same display name, different codes)
                  const duplicates = termOptions.filter(t => 
                    t.term === term.term && t.termCode !== term.termCode
                  );
                  const hasDuplicates = duplicates.length > 0;
                  
                  return (
                    <div 
                      key={term.termCode || term.term}
                      className={`border rounded-lg transition-all ${
                        isArchived 
                          ? 'bg-amber-50/50 border-amber-200' 
                          : hasDuplicates
                            ? 'bg-red-50/50 border-red-200'
                            : 'bg-white border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {/* Main Row */}
                      <div className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            {/* Semester Name & Status */}
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-gray-800">
                                  {term.term || term.termCode}
                                </span>
                                {hasDuplicates && (
                                  <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full flex items-center gap-1">
                                    <AlertTriangle size={12} />
                                    Duplicate
                                  </span>
                                )}
                                {isArchived && (
                                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">
                                    Archived
                                  </span>
                                )}
                                {isLocked && !isArchived && (
                                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full flex items-center gap-1">
                                    <Lock size={10} />
                                    Locked
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-gray-500 mt-0.5">
                                Code: <span className="font-mono">{term.termCode || 'None'}</span>
                                {hasDuplicates && (
                                  <span className="ml-2 text-red-600">
                                    (Also exists with code: {duplicates.map(d => d.termCode).join(', ')})
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          {/* Course Count & Expand */}
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <div className="text-lg font-semibold text-gray-700">
                                {loadingCounts ? '...' : courseCount.toLocaleString()}
                              </div>
                              <div className="text-xs text-gray-500">
                                {courseCount === 1 ? 'course' : 'courses'}
                              </div>
                            </div>
                            <button
                              onClick={() => setExpandedTermInfo(isExpanded ? null : term.termCode)}
                              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                              {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                            </button>
                          </div>
                        </div>
                      </div>
                      
                      {/* Expanded Actions */}
                      {isExpanded && (
                        <div className="border-t border-gray-100 p-4 bg-gray-50/50">
                          <div className="flex flex-wrap gap-2">
                            {/* Lock/Unlock */}
                            {!isArchived && (
                              <button
                                onClick={() => handleToggleTermLock(term)}
                                disabled={isLoading}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 transition-colors"
                              >
                                {isLocked ? <Unlock size={14} /> : <Lock size={14} />}
                                {isLocked ? 'Unlock Editing' : 'Lock Editing'}
                              </button>
                            )}
                            
                            {/* Archive/Restore */}
                            {isArchived ? (
                              <button
                                onClick={() => handleRestoreTerm(term)}
                                disabled={isLoading}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 transition-colors"
                              >
                                <RotateCcw size={14} />
                                Restore to Active
                              </button>
                            ) : (
                              <button
                                onClick={() => handleArchiveTerm(term)}
                                disabled={isLoading}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-amber-200 text-amber-700 rounded-lg text-sm hover:bg-amber-50 disabled:opacity-50 transition-colors"
                              >
                                <Archive size={14} />
                                Archive
                              </button>
                            )}
                            
                            {/* Merge */}
                            {courseCount > 0 && (
                              <button
                                onClick={() => { setShowMergeDialog(term); setMergeTargetTerm(''); }}
                                disabled={isLoading}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-purple-200 text-purple-700 rounded-lg text-sm hover:bg-purple-50 disabled:opacity-50 transition-colors"
                              >
                                <GitMerge size={14} />
                                Merge Into...
                              </button>
                            )}
                            
                            {/* Delete */}
                            <button
                              onClick={() => setShowDeleteConfirm(term)}
                              disabled={isLoading}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-200 text-red-600 rounded-lg text-sm hover:bg-red-50 disabled:opacity-50 transition-colors"
                            >
                              <Trash2 size={14} />
                              Delete
                            </button>
                          </div>
                          
                          {/* Additional Info */}
                          <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-500">
                            {term.createdAt && (
                              <span>Created: {new Date(term.createdAt).toLocaleDateString()}</span>
                            )}
                            {term.archivedAt && (
                              <span className="ml-4">Archived: {new Date(term.archivedAt).toLocaleDateString()}</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Delete Confirmation Dialog */}
          {showDeleteConfirm && (
            <ConfirmationDialog
              isOpen={true}
              title="Delete Semester?"
              message={
                <div className="space-y-3">
                  <p>
                    You are about to delete <strong>{showDeleteConfirm.term || showDeleteConfirm.termCode}</strong>.
                  </p>
                  {(termCourseCounts[showDeleteConfirm.termCode] || 0) > 0 ? (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-red-800">
                            This will permanently delete {termCourseCounts[showDeleteConfirm.termCode]} courses!
                          </p>
                          <p className="text-sm text-red-700 mt-1">
                            This action cannot be undone. Consider merging or archiving instead.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-600">
                      This semester has no courses and will be removed.
                    </p>
                  )}
                </div>
              }
              confirmText={`Delete ${(termCourseCounts[showDeleteConfirm.termCode] || 0) > 0 ? 'Everything' : 'Semester'}`}
              cancelText="Cancel"
              variant="danger"
              onConfirm={() => handleDeleteTerm(showDeleteConfirm)}
              onCancel={() => setShowDeleteConfirm(null)}
            />
          )}

          {/* Merge Dialog */}
          {showMergeDialog && (
            <ConfirmationDialog
              isOpen={true}
              title="Merge Semester"
              message={
                <div className="space-y-4">
                  <p>
                    Move all <strong>{termCourseCounts[showMergeDialog.termCode] || 0} courses</strong> from 
                    <strong> {showMergeDialog.term || showMergeDialog.termCode}</strong> into another semester.
                  </p>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select target semester:
                    </label>
                    <select
                      value={mergeTargetTerm}
                      onChange={(e) => setMergeTargetTerm(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-baylor-green focus:border-baylor-green"
                    >
                      <option value="">Choose a semester...</option>
                      {termOptions
                        .filter(t => t.termCode !== showMergeDialog.termCode)
                        .map(t => (
                          <option key={t.termCode} value={t.termCode}>
                            {t.term} ({termCourseCounts[t.termCode] || 0} courses)
                          </option>
                        ))
                      }
                    </select>
                  </div>
                  
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm">
                    <p className="text-purple-800">
                      After merging, <strong>{showMergeDialog.term || showMergeDialog.termCode}</strong> will be deleted.
                    </p>
                  </div>
                </div>
              }
              confirmText="Merge Courses"
              cancelText="Cancel"
              confirmDisabled={!mergeTargetTerm}
              onConfirm={() => handleMergeTerm(showMergeDialog)}
              onCancel={() => { setShowMergeDialog(null); setMergeTargetTerm(''); }}
            />
          )}
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
