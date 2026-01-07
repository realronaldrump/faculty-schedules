import React, { useState, useEffect } from 'react';
import {
  X,
  RotateCcw,
  Clock,
  CheckCircle,
  AlertCircle,
  Trash2,
  Eye,
  Calendar,
  Users,
  MapPin,
  Database,
  AlertTriangle
} from 'lucide-react';
import { getImportTransactions, rollbackTransaction, deleteTransaction, diagnoseRollbackEffectiveness, manualCleanupImportedData } from '../utils/importTransactionUtils';

const ImportHistoryModal = ({ onClose, showNotification, onDataRefresh }) => {
  const [transactions, setTransactions] = useState([]);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [showConfirmRollback, setShowConfirmRollback] = useState(null);

  useEffect(() => {
    loadTransactions();
  }, []);

  const loadTransactions = async () => {
    try {
      const allTransactions = await getImportTransactions();
      // Sort by timestamp, most recent first
      const sorted = allTransactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      setTransactions(sorted);
    } catch (error) {
      console.error('Error loading transactions:', error);
      setTransactions([]);
    }
  };

  const handleRollback = async (transactionId) => {
    setIsRollingBack(true);
    try {
      await rollbackTransaction(transactionId);
      showNotification('success', 'Import Rolled Back', 'All changes have been successfully reversed');
      await loadTransactions();
      onDataRefresh?.();
      setShowConfirmRollback(null);
    } catch (error) {
      console.error('Error rolling back transaction:', error);
      showNotification('error', 'Rollback Failed', error.message || 'Failed to roll back the import');
    } finally {
      setIsRollingBack(false);
    }
  };

  const handleDeleteTransaction = async (transactionId) => {
    try {
      await deleteTransaction(transactionId);
      await loadTransactions();
      showNotification('success', 'Transaction Deleted', 'Import record has been removed');
    } catch (error) {
      console.error('Error deleting transaction:', error);
      showNotification('error', 'Delete Failed', 'Failed to delete the transaction record');
    }
  };

  const handleDiagnoseRollback = async (transactionId) => {
    try {
      console.log('🔍 Starting rollback diagnosis...');
      await diagnoseRollbackEffectiveness(transactionId);
      showNotification('info', 'Diagnosis Complete', 'Check browser console for rollback diagnostic results');
    } catch (error) {
      console.error('Error diagnosing rollback:', error);
      showNotification('error', 'Diagnosis Failed', 'Failed to diagnose rollback effectiveness');
    }
  };

  const handleManualCleanup = async (transactionId) => {
    setIsCleaningUp(true);
    try {
      console.log('🧹 Starting manual cleanup...');
      const result = await manualCleanupImportedData(transactionId);
      console.log('✅ Manual cleanup result:', result);

      if (result.cleaned > 0) {
        showNotification('success', 'Manual Cleanup Complete', `Successfully deleted ${result.cleaned} documents`);
        onDataRefresh?.();
      } else if (result.errors > 0) {
        showNotification('warning', 'Cleanup Completed with Errors', `${result.errors} documents could not be deleted. Check console for details.`);
      } else {
        showNotification('info', 'Nothing to Clean Up', 'No documents were found that needed deletion');
      }
    } catch (error) {
      console.error('Error during manual cleanup:', error);
      showNotification('error', 'Manual Cleanup Failed', error.message || 'Failed to clean up imported data');
    } finally {
      setIsCleaningUp(false);
    }
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'committed': return 'text-baylor-green bg-baylor-green/10';
      case 'rolled_back': return 'text-red-600 bg-red-50';
      case 'preview': return 'text-baylor-gold bg-baylor-gold/10';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'committed': return CheckCircle;
      case 'rolled_back': return RotateCcw;
      case 'preview': return Clock;
      default: return AlertCircle;
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'committed': return 'Applied';
      case 'rolled_back': return 'Rolled Back';
      case 'preview': return 'Preview Only';
      default: return status;
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

  const TransactionDetails = ({ transaction }) => {
    const allChanges = transaction.getAllChanges();
    const groupedChanges = {
      schedules: { added: [], modified: [], deleted: [] },
      people: { added: [], modified: [], deleted: [] },
      rooms: { added: [], modified: [], deleted: [] }
    };

    allChanges.forEach(change => {
      const actionKey = change.action === 'add' ? 'added' :
        change.action === 'modify' ? 'modified' : 'deleted';
      groupedChanges[change.collection][actionKey].push(change);
    });

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-lg font-bold text-green-600">
              {Object.values(groupedChanges.schedules).reduce((sum, arr) => sum + arr.length, 0)}
            </div>
            <div className="text-sm text-gray-600">Schedule Changes</div>
          </div>
          <div>
            <div className="text-lg font-bold text-baylor-green">
              {Object.values(groupedChanges.people).reduce((sum, arr) => sum + arr.length, 0)}
            </div>
            <div className="text-sm text-gray-600">People Changes</div>
          </div>
          <div>
            <div className="text-lg font-bold text-baylor-gold">
              {Object.values(groupedChanges.rooms).reduce((sum, arr) => sum + arr.length, 0)}
            </div>
            <div className="text-sm text-gray-600">Room Changes</div>
          </div>
        </div>

        <div className="space-y-3">
          {Object.entries(groupedChanges).map(([collection, actions]) => {
            const CollectionIcon = getCollectionIcon(collection);
            const hasChanges = Object.values(actions).some(arr => arr.length > 0);

            if (!hasChanges) return null;

            return (
              <div key={collection} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center space-x-2 mb-2">
                  <CollectionIcon className="w-4 h-4 text-gray-600" />
                  <span className="font-medium text-gray-900 capitalize">{collection}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div className="text-center">
                    <div className="font-semibold text-green-600">{actions.added.length}</div>
                    <div className="text-gray-600">Added</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-baylor-green">{actions.modified.length}</div>
                    <div className="text-gray-600">Modified</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-red-600">{actions.deleted.length}</div>
                    <div className="text-gray-600">Deleted</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const ConfirmRollbackModal = ({ transaction, onConfirm, onCancel, isLoading }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-60">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
        <div className="p-6">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-red-100 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Confirm Rollback</h3>
              <p className="text-sm text-gray-600">This action will reverse all changes</p>
            </div>
          </div>

          <div className="mb-6">
            <p className="text-gray-700 mb-3">
              Are you sure you want to roll back the import for <strong>{transaction.semester}</strong>?
            </p>
            <p className="text-sm text-gray-600 bg-red-50 p-3 rounded-lg">
              ⚠️ This will permanently delete all {transaction.stats.totalChanges} imported records
              and restore the database to its previous state. This action cannot be undone.
            </p>
          </div>

          <div className="flex items-center justify-end space-x-3">
            <button
              onClick={onCancel}
              disabled={isLoading}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center space-x-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Rolling Back...</span>
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4" />
                  <span>Roll Back Import</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Import History</h2>
              <p className="text-gray-600 mt-1">
                Manage and review all data imports
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
          <div className="flex-1 overflow-hidden">
            {transactions.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <Database className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No Import History</h3>
                  <p className="text-gray-600">No imports have been performed yet.</p>
                </div>
              </div>
            ) : (
              <div className="flex h-full">
                {/* Transaction List */}
                <div className="w-1/2 border-r border-gray-200 overflow-y-auto">
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900 mb-3">Import Transactions</h3>
                    <div className="space-y-3">
                      {transactions.map((transaction) => {
                        const StatusIcon = getStatusIcon(transaction.status);
                        return (
                          <div
                            key={transaction.id}
                            onClick={() => setSelectedTransaction(transaction)}
                            className={`p-4 border rounded-lg cursor-pointer transition-colors ${selectedTransaction?.id === transaction.id
                                ? 'border-baylor-green bg-baylor-green/5'
                                : 'border-gray-200 hover:border-gray-300'
                              }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center space-x-2">
                                <StatusIcon className="w-4 h-4 text-gray-600" />
                                <span className="font-medium text-gray-900">
                                  {transaction.semester}
                                </span>
                              </div>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(transaction.status)}`}>
                                {getStatusLabel(transaction.status)}
                              </span>
                            </div>
                            <div className="text-sm text-gray-600 mb-2">
                              {formatDate(transaction.timestamp)}
                            </div>
                            <div className="text-sm text-gray-700">
                              {transaction.stats.totalChanges} changes
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Transaction Details */}
                <div className="w-1/2 overflow-y-auto">
                  {selectedTransaction ? (
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-gray-900">Import Details</h3>
                        <div className="flex items-center space-x-2">
                          {selectedTransaction.status === 'committed' && (
                            <button
                              onClick={() => setShowConfirmRollback(selectedTransaction)}
                              className="px-3 py-1 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm flex items-center space-x-1"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Roll Back</span>
                            </button>
                          )}
                          {selectedTransaction.status === 'rolled_back' && (
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => handleDiagnoseRollback(selectedTransaction.id)}
                                className="px-3 py-1 bg-baylor-green/10 text-baylor-green rounded-lg hover:bg-baylor-green/20 transition-colors text-sm flex items-center space-x-1"
                              >
                                <Eye className="w-3 h-3" />
                                <span>Diagnose</span>
                              </button>
                              <button
                                onClick={() => handleManualCleanup(selectedTransaction.id)}
                                disabled={isCleaningUp}
                                className="px-3 py-1 bg-baylor-gold/20 text-baylor-gold rounded-lg hover:bg-baylor-gold/30 disabled:opacity-50 transition-colors text-sm flex items-center space-x-1"
                              >
                                {isCleaningUp ? (
                                  <div className="w-3 h-3 border border-baylor-gold border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                  <Database className="w-3 h-3" />
                                )}
                                <span>{isCleaningUp ? 'Cleaning...' : 'Manual Cleanup'}</span>
                              </button>
                            </div>
                          )}
                          {selectedTransaction.status !== 'committed' && selectedTransaction.status !== 'rolled_back' && (
                            <button
                              onClick={() => handleDeleteTransaction(selectedTransaction.id)}
                              className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm flex items-center space-x-1"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Delete</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="bg-gray-50 rounded-lg p-4">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="font-medium text-gray-600">Type:</span>
                              <span className="ml-2 text-gray-900 capitalize">{selectedTransaction.type}</span>
                            </div>
                            <div>
                              <span className="font-medium text-gray-600">Semester:</span>
                              <span className="ml-2 text-gray-900">{selectedTransaction.semester}</span>
                            </div>
                            <div>
                              <span className="font-medium text-gray-600">Date:</span>
                              <span className="ml-2 text-gray-900">{formatDate(selectedTransaction.timestamp)}</span>
                            </div>
                            <div>
                              <span className="font-medium text-gray-600">Status:</span>
                              <span className={`ml-2 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(selectedTransaction.status)}`}>
                                {getStatusLabel(selectedTransaction.status)}
                              </span>
                            </div>
                          </div>
                        </div>

                        <TransactionDetails transaction={selectedTransaction} />

                        {selectedTransaction.status === 'rolled_back' && (
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                            <div className="flex items-center space-x-2">
                              <AlertTriangle className="w-4 h-4 text-yellow-600" />
                              <span className="text-sm font-medium text-yellow-700">
                                Transaction marked as rolled back
                              </span>
                            </div>
                            <p className="text-sm text-yellow-600 mt-1">
                              This transaction shows as rolled back, but the actual data may still exist in the database.
                              Use the "Diagnose" button to check and "Manual Cleanup" to remove any remaining data.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <Eye className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-600">Select an import to view details</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirm Rollback Modal */}
      {showConfirmRollback && (
        <ConfirmRollbackModal
          transaction={showConfirmRollback}
          onConfirm={() => handleRollback(showConfirmRollback.id)}
          onCancel={() => setShowConfirmRollback(null)}
          isLoading={isRollingBack}
        />
      )}
    </>
  );
};

export default ImportHistoryModal; 