import React, { useState } from 'react';
import { X, AlertTriangle, Search, Trash2, Database, Users, Calendar, MapPin, Eye, EyeOff } from 'lucide-react';
import { findOrphanedImportedData, cleanupOrphanedImportedData } from '../../utils/importTransactionUtils';

const OrphanedDataCleanupModal = ({ isOpen, onClose, showNotification }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [orphanedData, setOrphanedData] = useState(null);
  const [selected, setSelected] = useState({ schedules: {}, people: {}, rooms: {} });
  const [semesterFilter, setSemesterFilter] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [confirmCleanup, setConfirmCleanup] = useState(false);
  const [skipConfirmation, setSkipConfirmation] = useState(false);

  const handleScan = async () => {
    setIsScanning(true);
    try {
      console.log('🔍 Starting scan for orphaned data...');
      const results = await findOrphanedImportedData(semesterFilter || null);
      setOrphanedData(results);
      const nextSelected = { schedules: {}, people: {}, rooms: {} };
      results.schedules.forEach((it) => { if (it?.id) nextSelected.schedules[it.id] = true; });
      results.people.forEach((it) => { if (it?.id) nextSelected.people[it.id] = true; });
      results.rooms.forEach((it) => { if (it?.id) nextSelected.rooms[it.id] = true; });
      setSelected(nextSelected);

      if (results.total > 0) {
        showNotification('warning', 'Orphaned Data Found', `Found ${results.total} potentially orphaned records`);
      } else {
        showNotification('success', 'No Orphaned Data', 'No orphaned imported data found');
      }
    } catch (error) {
      console.error('Error scanning for orphaned data:', error);
      showNotification('error', 'Scan Failed', 'Failed to scan for orphaned data');
    } finally {
      setIsScanning(false);
    }
  };

  const toggleItem = (collection, id) => {
    setSelected((prev) => ({
      ...prev,
      [collection]: { ...prev[collection], [id]: !prev[collection]?.[id] }
    }));
  };

  const setAllInCollection = (collection, value) => {
    if (!orphanedData) return;
    setSelected((prev) => {
      const next = { ...prev, [collection]: {} };
      orphanedData[collection].forEach((it) => { if (it?.id) next[collection][it.id] = value; });
      return next;
    });
  };

  const countSelected = (collection) => Object.values(selected[collection] || {}).filter(Boolean).length;

  const getSelectedData = () => {
    if (!orphanedData) return { schedules: [], people: [], rooms: [], total: 0 };
    const selSchedules = orphanedData.schedules.filter((it) => selected.schedules[it.id]);
    const selPeople = orphanedData.people.filter((it) => selected.people[it.id]);
    const selRooms = orphanedData.rooms.filter((it) => selected.rooms[it.id]);
    return { schedules: selSchedules, people: selPeople, rooms: selRooms, total: selSchedules.length + selPeople.length + selRooms.length };
  };

  const handleCleanup = async () => {
    const selectedData = getSelectedData();
    if (!orphanedData || selectedData.total === 0) {
      showNotification('info', 'Nothing to Clean', 'No orphaned data to clean up');
      return;
    }

    setIsCleaning(true);
    let cleanupResult = null;

    try {
      console.log('🧹 Starting cleanup of orphaned data...');

      // Skip dry run and confirmation if user opted out
      if (skipConfirmation) {
        console.log('⏭️ Skipping dry run and confirmation as requested');
        cleanupResult = await cleanupOrphanedImportedData(selectedData, true);
        console.log('Cleanup result:', cleanupResult);
      } else {
        // Check if we need to show confirmation first
        if (!confirmCleanup) {
          console.log('🔍 Showing confirmation dialog...');
          // First do a dry run to show what would be deleted
          const dryRunResult = await cleanupOrphanedImportedData(selectedData, false);
          console.log('Dry run result:', dryRunResult);

          // Ask for confirmation
          setConfirmCleanup(true);
          setIsCleaning(false);
          return;
        } else {
          console.log('✅ Confirmation already given, proceeding with deletion...');
          // Actually perform the cleanup
          cleanupResult = await cleanupOrphanedImportedData(selectedData, true);
          console.log('Cleanup result:', cleanupResult);
        }
      }

      // Handle results only if we actually performed cleanup
      if (cleanupResult && cleanupResult.deleted > 0) {
        showNotification('success', 'Cleanup Complete',
          `Successfully deleted ${cleanupResult.deleted} orphaned records`);
        // Refresh the scan results
        setOrphanedData(null);
        setConfirmCleanup(false);
      } else if (cleanupResult && cleanupResult.errors > 0) {
        showNotification('warning', 'Cleanup Completed with Errors',
          `${cleanupResult.errors} records could not be deleted`);
      } else if (cleanupResult) {
        showNotification('info', 'Nothing Deleted', 'No records were found to delete');
      }
    } catch (error) {
      console.error('Error during cleanup:', error);
      showNotification('error', 'Cleanup Failed', error.message || 'Failed to clean up orphaned data');
    } finally {
      setIsCleaning(false);
      setConfirmCleanup(false);
    }
  };

  const getCollectionIcon = (collection) => {
    switch (collection) {
      case 'schedules': return Calendar;
      case 'people': return Users;
      case 'rooms': return MapPin;
      default: return Database;
    }
  };

  const getCollectionColor = (collection) => {
    switch (collection) {
      case 'schedules': return 'text-blue-600 bg-blue-50';
      case 'people': return 'text-green-600 bg-green-50';
      case 'rooms': return 'text-purple-600 bg-purple-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Orphaned Data Cleanup</h2>
            <p className="text-gray-600 mt-1">
              Find and remove imported schedules for a specific term. People and rooms are only eligible if not referenced by any other term.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden p-6">
          {/* Scan Section */}
          <div className="mb-6">
            <div className="flex items-center space-x-4 mb-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Semester Filter (optional)
                </label>
                <input
                  type="text"
                  value={semesterFilter}
                  onChange={(e) => setSemesterFilter(e.target.value)}
                  placeholder="e.g., Spring 2024"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-baylor-green focus:border-transparent"
                />
              </div>
              <div className="pt-6">
                <button
                  onClick={handleScan}
                  disabled={isScanning}
                  className="px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 disabled:opacity-50 flex items-center space-x-2"
                >
                  {isScanning ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                  <span>{isScanning ? 'Scanning...' : 'Scan for Orphaned Data'}</span>
                </button>
              </div>
            </div>

            {orphanedData && (
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">Scan Results</h3>
                    <p className="text-sm text-gray-600">
                      Found {orphanedData.total} potentially orphaned records
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setShowDetails(!showDetails)}
                      className="px-3 py-1 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center space-x-1"
                    >
                      {showDetails ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      <span>{showDetails ? 'Hide' : 'Show'} Details</span>
                    </button>
                    <button onClick={() => setAllInCollection('schedules', true)} className="px-2 py-1 text-xs border border-gray-300 rounded">All Schedules</button>
                    <button onClick={() => setAllInCollection('schedules', false)} className="px-2 py-1 text-xs border border-gray-300 rounded">No Schedules</button>
                    <button onClick={() => setAllInCollection('people', true)} className="px-2 py-1 text-xs border border-gray-300 rounded">All People</button>
                    <button onClick={() => setAllInCollection('people', false)} className="px-2 py-1 text-xs border border-gray-300 rounded">No People</button>
                    <button onClick={() => setAllInCollection('rooms', true)} className="px-2 py-1 text-xs border border-gray-300 rounded">All Rooms</button>
                    <button onClick={() => setAllInCollection('rooms', false)} className="px-2 py-1 text-xs border border-gray-300 rounded">No Rooms</button>
                  </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-3 gap-4 mt-4">
                  <div className="bg-white p-3 rounded-lg border border-gray-200">
                    <div className="flex items-center space-x-2">
                      <Calendar className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-medium">Schedules</span>
                    </div>
                    <div className="text-lg font-bold text-blue-600">{countSelected('schedules')} / {orphanedData.schedules.length} selected</div>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-gray-200">
                    <div className="flex items-center space-x-2">
                      <Users className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium">People</span>
                    </div>
                    <div className="text-lg font-bold text-green-600">{countSelected('people')} / {orphanedData.people.length} selected</div>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-gray-200">
                    <div className="flex items-center space-x-2">
                      <MapPin className="w-4 h-4 text-purple-600" />
                      <span className="text-sm font-medium">Rooms</span>
                    </div>
                    <div className="text-lg font-bold text-purple-600">{countSelected('rooms')} / {orphanedData.rooms.length} selected</div>
                  </div>
                </div>

                {/* Detailed View */}
                {showDetails && (
                  <div className="mt-4 space-y-3">
                    {Object.entries(orphanedData).filter(([key]) => key !== 'total').map(([collection, items]) => {
                      if (items.length === 0) return null;

                      const IconComponent = getCollectionIcon(collection);
                      const colorClass = getCollectionColor(collection);

                      return (
                        <div key={collection} className="bg-white border border-gray-200 rounded-lg p-3">
                          <div className="flex items-center space-x-2 mb-2">
                            <IconComponent className={`w-4 h-4 ${colorClass.split(' ')[0]}`} />
                            <span className="font-medium text-gray-900 capitalize">{collection}</span>
                            <span className="text-sm text-gray-500">({items.length} items)</span>
                          </div>
                          <div className="space-y-1 max-h-56 overflow-y-auto">
                            {(showDetails ? items : items.slice(0, 10)).map((item, index) => (
                              <label key={index} className="flex items-center space-x-2 text-sm text-gray-600 bg-gray-50 px-2 py-1 rounded">
                                <input type="checkbox" className="rounded border-gray-300" checked={!!selected[collection]?.[item.id]} onChange={() => toggleItem(collection, item.id)} />
                                {collection === 'schedules' && `${item.courseCode || 'Unknown'} - ${item.term || 'Unknown'}`}
                                {collection === 'people' && `${item.firstName || ''} ${item.lastName || ''}`.trim()}
                                {collection === 'rooms' && `${item.name || item.displayName || 'Unknown'}`}
                                <span className="text-xs text-gray-400 ml-2">({item.reason})</span>
                              </label>
                            ))}
                            {(!showDetails && items.length > 10) && (
                              <div className="text-sm text-gray-500 italic">
                                ... and {items.length - 10} more items (click Show Details to view all)
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Cleanup Section */}
          {orphanedData && orphanedData.total > 0 && (
            <div className="border-t border-gray-200 pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Clean Up Data</h3>
                  <p className="text-sm text-gray-600">
                    Permanently delete the {orphanedData.total} orphaned records. People and rooms will only be deleted if unreferenced by other terms.
                  </p>
                  <div className="mt-2">
                    <label className="flex items-center space-x-2 text-sm">
                      <input
                        type="checkbox"
                        checked={skipConfirmation}
                        onChange={(e) => setSkipConfirmation(e.target.checked)}
                        className="rounded border-gray-300"
                      />
                      <span className="text-gray-700">Skip confirmation (advanced users only)</span>
                    </label>
                  </div>
                </div>

                {!confirmCleanup ? (
                  <button
                    onClick={handleCleanup}
                    disabled={isCleaning}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center space-x-2"
                  >
                    {isCleaning ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                    <span>{isCleaning ? 'Processing...' : skipConfirmation ? 'Delete Immediately' : 'Clean Up Data'}</span>
                  </button>
                ) : (
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => setConfirmCleanup(false)}
                      disabled={isCleaning}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCleanup}
                      disabled={isCleaning}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center space-x-2"
                    >
                      {isCleaning ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                      <span>{isCleaning ? 'Deleting...' : 'Confirm Delete'}</span>
                    </button>
                  </div>
                )}
              </div>

              {confirmCleanup && (
                <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                    <span className="font-medium text-red-700">Confirm Deletion</span>
                  </div>
                  <p className="text-sm text-red-600 mt-1">
                    This will permanently delete {orphanedData.total} records from the database.
                    This action cannot be undone. Make sure you've backed up any important data.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Warning */}
          <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5 text-yellow-600" />
              <span className="font-medium text-yellow-700">Important Warning</span>
            </div>
            <p className="text-sm text-yellow-600 mt-1">
              This tool targets schedules in the selected term. People/rooms only show as deletable if they are not used by any schedules in other terms.
              Always review the scan results carefully and consider backing up your data before cleanup.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrphanedDataCleanupModal;
