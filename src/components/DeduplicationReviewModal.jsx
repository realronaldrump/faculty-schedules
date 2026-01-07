import React, { useState, useEffect } from 'react';
import { X, Users, ArrowRight, AlertTriangle, CheckCircle, Mail, Phone, Building, User, ArrowLeftRight } from 'lucide-react';
import { findDuplicatePeople, mergePeople } from '../utils/dataHygiene';

const DeduplicationReviewModal = ({ isOpen, onClose, onDuplicatesResolved }) => {
  const [duplicates, setDuplicates] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [processingMerge, setProcessingMerge] = useState(null);
  const [selectedDuplicates, setSelectedDuplicates] = useState(new Set());
  const [mergeResults, setMergeResults] = useState(null);
  const [fieldSelections, setFieldSelections] = useState({});

  useEffect(() => {
    if (isOpen) {
      loadDuplicates();
    }
  }, [isOpen]);

  const loadDuplicates = async () => {
    setIsLoading(true);
    try {
      const duplicateResults = await findDuplicatePeople();
      setDuplicates(duplicateResults);
      setSelectedDuplicates(new Set());
      setMergeResults(null);
    } catch (error) {
      console.error('Error loading duplicates:', error);
      // Show error inline instead of a blocking browser alert
      setMergeResults({ merged: 0, errors: [{ duplicate: 'Load', error: error.message }], mergedPairs: [] });
    }
    setIsLoading(false);
  };

  const toggleDuplicateSelection = (duplicateIndex) => {
    const newSelected = new Set(selectedDuplicates);
    if (newSelected.has(duplicateIndex)) {
      newSelected.delete(duplicateIndex);
    } else {
      newSelected.add(duplicateIndex);
    }
    setSelectedDuplicates(newSelected);
  };

  const swapPrimary = (index) => {
    setDuplicates(prev => prev.map((d, i) => i === index ? { ...d, primary: d.duplicate, duplicate: d.primary } : d));
    setFieldSelections(prev => {
      const newSelections = { ...prev };
      delete newSelections[index];
      return newSelections;
    });
  };

  const handleSelect = (index, field, source) => {
    setFieldSelections(prev => ({
      ...prev,
      [index]: {
        ...(prev[index] || {}),
        [field]: source
      }
    }));
  };

  const mergeSelectedDuplicates = async () => {
    if (selectedDuplicates.size === 0) return;

    const selectedDuplicatesList = Array.from(selectedDuplicates).map(index => duplicates[index]);

    console.log('Starting merge for:', selectedDuplicatesList.map(d => `${d.primary.firstName} ${d.primary.lastName} <- ${d.duplicate.firstName} ${d.duplicate.lastName}`));

    setProcessingMerge({ current: 0, total: selectedDuplicatesList.length });
    const results = { merged: 0, errors: [], mergedPairs: [] };

    for (let i = 0; i < selectedDuplicatesList.length; i++) {
      const duplicate = selectedDuplicatesList[i];
      setProcessingMerge({ current: i + 1, total: selectedDuplicatesList.length });

      try {
        console.log(`Attempting merge: ${duplicate.primary.id} <- ${duplicate.duplicate.id}`);
        await mergePeople(duplicate.primary.id, duplicate.duplicate.id, fieldSelections[index] || {});
        results.merged++;
        results.mergedPairs.push({
          kept: `${duplicate.primary.firstName} ${duplicate.primary.lastName}`,
          removed: `${duplicate.duplicate.firstName} ${duplicate.duplicate.lastName}`,
          reason: duplicate.reason
        });
      } catch (error) {
        console.error('Merge failed for:', duplicate, error);
        results.errors.push({
          duplicate: `${duplicate.duplicate.firstName} ${duplicate.duplicate.lastName}`,
          error: error.message
        });
      }
    }

    setProcessingMerge(null);
    setMergeResults(results);

    // Reload duplicates to show updated list
    await loadDuplicates();

    if (onDuplicatesResolved) {
      onDuplicatesResolved();
    }
  };

  const getConfidenceColor = (confidence) => {
    if (confidence >= 95) return 'bg-green-100 text-green-800';
    if (confidence >= 85) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const getConfidenceLabel = (confidence) => {
    if (confidence >= 95) return 'Very High';
    if (confidence >= 85) return 'High';
    if (confidence >= 70) return 'Medium';
    return 'Low';
  };

  const formatFieldComparison = (fieldName, value1, value2, label, index) => {
    if (!value1 && !value2) return null;

    const same = value1 === value2;
    const isConflict = value1 && value2 && !same;
    const selection = fieldSelections[index]?.[fieldName] || 'primary';

    return (
      <div className="text-xs">
        <span className="text-gray-500">{label}:</span>
        {isConflict ? (
          <div className="flex items-center space-x-2 mt-1">
            <label className={`flex items-center px-2 py-1 rounded cursor-pointer ${selection === 'primary' ? 'bg-baylor-green/10 text-baylor-green' : 'bg-gray-100 text-gray-800'}`}>
              <input
                type="radio"
                checked={selection === 'primary'}
                onChange={() => handleSelect(index, fieldName, 'primary')}
                className="mr-1"
              />
              {value1}
            </label>
            <ArrowRight className="w-3 h-3 text-gray-400" />
            <label className={`flex items-center px-2 py-1 rounded cursor-pointer ${selection === 'duplicate' ? 'bg-baylor-green/10 text-baylor-green' : 'bg-gray-100 text-gray-800'}`}>
              <input
                type="radio"
                checked={selection === 'duplicate'}
                onChange={() => handleSelect(index, fieldName, 'duplicate')}
                className="mr-1"
              />
              {value2}
            </label>
          </div>
        ) : (
          <div className="flex items-center space-x-2 mt-1">
            <span className={`px-2 py-1 rounded ${same ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
              {value1 || 'Missing'}
            </span>
            {!same && (
              <>
                <ArrowRight className="w-3 h-3 text-gray-400" />
                <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded">
                  {value2 || 'Missing'}
                </span>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-baylor-green" />
            <h2 className="text-xl font-semibold text-gray-900">
              Review Potential Duplicates
            </h2>
            {duplicates.length > 0 && (
              <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-sm rounded-full">
                {duplicates.length} found
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {mergeResults && (
            <div className="mb-6 p-4 bg-baylor-green/5 border border-baylor-green/20 rounded-lg">
              <h3 className="font-medium text-baylor-green mb-2">Merge Results</h3>
              <div className="text-sm text-baylor-green">
                <p>✅ Successfully merged {mergeResults.merged} duplicate pairs</p>
                {mergeResults.errors.length > 0 && (
                  <div className="mt-2">
                    <p className="text-red-800">❌ Errors ({mergeResults.errors.length}):</p>
                    <ul className="list-disc list-inside ml-4">
                      {mergeResults.errors.map((error, index) => (
                        <li key={index}>{error.duplicate}: {error.error}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {mergeResults.mergedPairs.length > 0 && (
                  <div className="mt-2">
                    <p>Merged records:</p>
                    <ul className="list-disc list-inside ml-4">
                      {mergeResults.mergedPairs.map((pair, index) => (
                        <li key={index}>
                          Kept "{pair.kept}", removed "{pair.removed}" ({pair.reason})
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {processingMerge && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-600 mr-3"></div>
                <span className="text-yellow-800">
                  Merging duplicates... ({processingMerge.current}/{processingMerge.total})
                </span>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-baylor-green mx-auto"></div>
              <p className="mt-2 text-gray-600">Analyzing data for duplicates...</p>
            </div>
          ) : duplicates.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Duplicates Found!</h3>
              <p className="text-gray-600">
                Your data is clean - no duplicate records were detected.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-baylor-green/5 border border-baylor-green/20 rounded-lg p-4">
                <h3 className="font-medium text-baylor-green mb-2">Review Instructions</h3>
                <div className="text-sm text-baylor-green">
                  <p className="mb-2">
                    We found {duplicates.length} potential duplicate records. Review each one carefully:
                  </p>
                  <ul className="list-disc list-inside space-y-1">
                    <li><strong>Green confidence:</strong> Very likely the same person - safe to merge</li>
                    <li><strong>Yellow confidence:</strong> Probably the same person - review carefully</li>
                    <li><strong>Red confidence:</strong> Uncertain match - verify before merging</li>
                  </ul>
                  <p className="mt-2">
                    Select the duplicates you want to merge, then click "Merge Selected" below.
                  </p>
                </div>
              </div>

              {duplicates.map((duplicate, index) => (
                <div key={index} className="border rounded-lg overflow-hidden">
                  <div className="bg-gray-50 p-4 border-b">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          checked={selectedDuplicates.has(index)}
                          onChange={() => toggleDuplicateSelection(index)}
                          className="h-4 w-4 text-baylor-green focus:ring-baylor-green border-gray-300 rounded"
                        />
                        <div className="flex items-center space-x-2">
                          <AlertTriangle className="w-4 h-4 text-yellow-600" />
                          <span className="font-medium text-gray-900">{duplicate.reason}</span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getConfidenceColor(duplicate.confidence)}`}>
                          {getConfidenceLabel(duplicate.confidence)} ({duplicate.confidence}%)
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="grid grid-cols-2 gap-6">
                      {/* Primary Record (Keep) */}
                      <div className="border-2 border-green-200 rounded-lg p-4 bg-green-50">
                        <div className="flex items-center space-x-2 mb-3">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                          <h4 className="font-medium text-green-800">Keep This Record</h4>
                        </div>
                        <div className="space-y-2">
                          <div className="font-medium text-gray-900">
                            {duplicate.primary.firstName} {duplicate.primary.lastName}
                          </div>
                          <div className="space-y-1">
                            {duplicate.primary.email && (
                              <div className="flex items-center text-sm text-gray-600">
                                <Mail className="w-3 h-3 mr-1" />
                                {duplicate.primary.email}
                              </div>
                            )}
                            {duplicate.primary.phone && (
                              <div className="flex items-center text-sm text-gray-600">
                                <Phone className="w-3 h-3 mr-1" />
                                {duplicate.primary.phone}
                              </div>
                            )}
                            {duplicate.primary.office && (
                              <div className="flex items-center text-sm text-gray-600">
                                <Building className="w-3 h-3 mr-1" />
                                {duplicate.primary.office}
                              </div>
                            )}
                            {duplicate.primary.jobTitle && (
                              <div className="flex items-center text-sm text-gray-600">
                                <User className="w-3 h-3 mr-1" />
                                {duplicate.primary.jobTitle}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Duplicate Record (Remove) */}
                      <div className="border-2 border-red-200 rounded-lg p-4 bg-red-50">
                        <div className="flex items-center space-x-2 mb-3">
                          <X className="w-4 h-4 text-red-600" />
                          <h4 className="font-medium text-red-800">Remove This Record</h4>
                        </div>
                        <div className="space-y-2">
                          <div className="font-medium text-gray-900">
                            {duplicate.duplicate.firstName} {duplicate.duplicate.lastName}
                          </div>
                          <div className="space-y-1">
                            {duplicate.duplicate.email && (
                              <div className="flex items-center text-sm text-gray-600">
                                <Mail className="w-3 h-3 mr-1" />
                                {duplicate.duplicate.email}
                              </div>
                            )}
                            {duplicate.duplicate.phone && (
                              <div className="flex items-center text-sm text-gray-600">
                                <Phone className="w-3 h-3 mr-1" />
                                {duplicate.duplicate.phone}
                              </div>
                            )}
                            {duplicate.duplicate.office && (
                              <div className="flex items-center text-sm text-gray-600">
                                <Building className="w-3 h-3 mr-1" />
                                {duplicate.duplicate.office}
                              </div>
                            )}
                            {duplicate.duplicate.jobTitle && (
                              <div className="flex items-center text-sm text-gray-600">
                                <User className="w-3 h-3 mr-1" />
                                {duplicate.duplicate.jobTitle}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-center mt-4">
                      <button
                        onClick={() => swapPrimary(index)}
                        className="flex items-center space-x-1 px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                      >
                        <ArrowLeftRight className="w-4 h-4" />
                        <span>Swap Primary</span>
                      </button>
                    </div>

                    {/* Field Comparison */}
                    <div className="mt-4 pt-4 border-t">
                      <h5 className="text-sm font-medium text-gray-700 mb-2">Field Comparison:</h5>
                      <div className="grid grid-cols-2 gap-4">
                        {['firstName', 'lastName', 'email', 'phone', 'office', 'jobTitle', 'department', 'title'].map((field, fieldIndex) => (
                          <React.Fragment key={fieldIndex}>
                            {formatFieldComparison(
                              field,
                              duplicate.primary[field] || '',
                              duplicate.duplicate[field] || '',
                              field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1'),
                              index
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-6">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              {selectedDuplicates.size > 0 && (
                <span>{selectedDuplicates.size} duplicate{selectedDuplicates.size !== 1 ? 's' : ''} selected for merging</span>
              )}
            </div>
            <div className="flex space-x-3">
              <button
                onClick={onClose}
                className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
              >
                Close
              </button>
              {duplicates.length > 0 && (
                <>
                  <button
                    onClick={loadDuplicates}
                    disabled={isLoading || processingMerge}
                    className="px-6 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 disabled:opacity-50"
                  >
                    Refresh Analysis
                  </button>
                  <button
                    onClick={mergeSelectedDuplicates}
                    disabled={selectedDuplicates.size === 0 || processingMerge}
                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    {processingMerge ? 'Merging...' : `Merge Selected (${selectedDuplicates.size})`}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeduplicationReviewModal; 