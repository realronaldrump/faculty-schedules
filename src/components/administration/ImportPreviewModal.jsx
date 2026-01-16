import React, { useState, useMemo } from 'react';
import {
  X,
  Users,
  Calendar,
  MapPin,
  Eye,
  EyeOff,
  Check,
  AlertTriangle,
  Database
} from 'lucide-react';
import { usePeople } from '../../contexts/PeopleContext';

const ImportPreviewModal = ({
  transaction,
  onClose,
  onCommit,
  onCancel,
  isCommitting = false
}) => {
  const [selectedChanges, setSelectedChanges] = useState(new Set());
  const [expandedSections, setExpandedSections] = useState(new Set(['schedules', 'people', 'rooms']));
  const [showDetails, setShowDetails] = useState({});
  const [selectAll, setSelectAll] = useState(true);
  // Per-change field selections for 'modify' actions: changeId -> Set(fieldKey)
  const [selectedFieldsByChange, setSelectedFieldsByChange] = useState({});
  const { people: directoryPeople, loadPeople } = usePeople();
  const [matchResolutions, setMatchResolutions] = useState({});
  const [matchSearchTerms, setMatchSearchTerms] = useState({});

  const allChanges = useMemo(() => transaction?.getAllChanges() || [], [transaction]);
  const matchingIssues = useMemo(() => transaction?.matchingIssues || [], [transaction]);
  const people = useMemo(() => Array.isArray(directoryPeople) ? directoryPeople : [], [directoryPeople]);
  const previewSummary = useMemo(() => transaction?.previewSummary || null, [transaction]);
  const validation = useMemo(() => transaction?.validation || {}, [transaction]);
  const validationErrors = Array.isArray(validation.errors) ? validation.errors : [];
  const validationWarnings = Array.isArray(validation.warnings) ? validation.warnings : [];

  const groupedChanges = useMemo(() => {
    const groups = {
      schedules: { added: [], modified: [], deleted: [] },
      people: { added: [], modified: [], deleted: [] },
      rooms: { added: [], modified: [], deleted: [] }
    };

    allChanges.forEach(change => {
      const actionKey = change.action === 'add' ? 'added' :
        change.action === 'modify' ? 'modified' : 'deleted';
      groups[change.collection][actionKey].push(change);
    });

    return groups;
  }, [allChanges]);

  const pendingPersonChangeIds = useMemo(() => {
    return new Set(
      matchingIssues
        .map((issue) => issue.pendingPersonChangeId)
        .filter(Boolean)
    );
  }, [matchingIssues]);

  // Build index of groupKey -> changeIds for cascading select/deselect
  const groupIndex = useMemo(() => {
    const index = new Map();
    allChanges.forEach((c) => {
      if (!c.groupKey) return;
      if (!index.has(c.groupKey)) index.set(c.groupKey, []);
      index.get(c.groupKey).push(c.id);
    });
    return index;
  }, [allChanges]);

  const stats = useMemo(() => {
    const selected = Array.from(selectedChanges);
    return {
      total: allChanges.length,
      selected: selected.length,
      schedules: selected.filter(id => allChanges.find(c => c.id === id)?.collection === 'schedules').length,
      people: selected.filter(id => allChanges.find(c => c.id === id)?.collection === 'people').length,
      rooms: selected.filter(id => allChanges.find(c => c.id === id)?.collection === 'rooms').length
    };
  }, [selectedChanges, allChanges]);

  const updateSelectedChanges = (nextSelected) => {
    setSelectedChanges(nextSelected);
    setSelectAll(nextSelected.size === allChanges.length);
  };

  React.useEffect(() => {
    if (matchingIssues.length > 0) {
      loadPeople();
    }
  }, [matchingIssues.length, loadPeople]);

  React.useEffect(() => {
    setMatchResolutions({});
    setMatchSearchTerms({});
  }, [transaction?.id]);

  // Initialize with all changes selected, excluding pending people until resolved
  React.useEffect(() => {
    if (allChanges.length > 0 && selectedChanges.size === 0) {
      const initial = new Set(allChanges.map(c => c.id));
      pendingPersonChangeIds.forEach((id) => initial.delete(id));
      setSelectedChanges(initial);
      setSelectAll(initial.size === allChanges.length);
    }
  }, [allChanges, pendingPersonChangeIds, transaction?.id]);

  const toggleChange = (changeId) => {
    const newSelected = new Set(selectedChanges);
    const change = allChanges.find(c => c.id === changeId);
    const related = change?.groupKey ? (groupIndex.get(change.groupKey) || []) : [changeId];

    const removing = newSelected.has(changeId);
    related.forEach((id) => {
      if (removing) newSelected.delete(id); else newSelected.add(id);
    });
    updateSelectedChanges(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectAll) {
      updateSelectedChanges(new Set());
    } else {
      updateSelectedChanges(new Set(allChanges.map(c => c.id)));
    }
  };

  const toggleSection = (sectionId) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId);
    } else {
      newExpanded.add(sectionId);
    }
    setExpandedSections(newExpanded);
  };

  const toggleDetails = (changeId) => {
    setShowDetails(prev => ({
      ...prev,
      [changeId]: !prev[changeId]
    }));
  };

  const unresolvedMatchCount = useMemo(
    () => matchingIssues.filter(issue => !matchResolutions[issue.id]).length,
    [matchingIssues, matchResolutions]
  );

  const applyResolution = (issue, resolution) => {
    setMatchResolutions(prev => ({
      ...prev,
      [issue.id]: resolution
    }));

    if (issue.pendingPersonChangeId) {
      const nextSelected = new Set(selectedChanges);
      if (resolution.action === 'create') {
        nextSelected.add(issue.pendingPersonChangeId);
      } else {
        nextSelected.delete(issue.pendingPersonChangeId);
      }
      updateSelectedChanges(nextSelected);
    }
  };

  const clearResolution = (issue) => {
    setMatchResolutions(prev => {
      const next = { ...prev };
      delete next[issue.id];
      return next;
    });
    if (issue.pendingPersonChangeId) {
      const nextSelected = new Set(selectedChanges);
      nextSelected.delete(issue.pendingPersonChangeId);
      updateSelectedChanges(nextSelected);
    }
  };

  const handleCommit = () => {
    const selectedChangeIds = Array.from(selectedChanges);
    // Build mapping of selected field keys for modify changes
    const fieldMap = {};
    allChanges.forEach((change) => {
      if (change.action === 'modify' && selectedChanges.has(change.id) && change.diff && change.diff.length > 0) {
        const selectedSet = selectedFieldsByChange[change.id];
        if (selectedSet && selectedSet.size > 0) {
          fieldMap[change.id] = Array.from(selectedSet);
        }
      }
    });
    onCommit(
      transaction.id,
      selectedChangeIds.length === allChanges.length ? null : selectedChangeIds,
      fieldMap,
      matchResolutions
    );
  };

  const getCollectionIcon = (collection) => {
    switch (collection) {
      case 'schedules': return Calendar;
      case 'people': return Users;
      case 'rooms': return MapPin;
      default: return Database;
    }
  };

  const getActionColor = (action) => {
    switch (action) {
      case 'add': return 'text-baylor-green bg-baylor-green/10';
      case 'modify': return 'text-baylor-gold bg-baylor-gold/10';
      case 'delete': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getActionLabel = (action) => {
    switch (action) {
      case 'add': return 'Add';
      case 'modify': return 'Update';
      case 'delete': return 'Delete';
      default: return action;
    }
  };

  const formatChangeTitle = (change) => {
    if (change.collection === 'schedules') {
      return `${change.newData.courseCode} - ${change.newData.courseTitle}`;
    } else if (change.collection === 'people') {
      return `${change.newData.firstName} ${change.newData.lastName}`;
    } else if (change.collection === 'rooms') {
      return change.newData.displayName || change.newData.name;
    }
    return 'Unknown';
  };

  const formatChangeDetails = (change) => {
    if (change.collection === 'schedules') {
      const meetingSummary = Array.isArray(change.newData.meetingPatterns)
        ? change.newData.meetingPatterns
          .map((pattern) => {
            if (pattern.day && pattern.startTime && pattern.endTime) {
              return `${pattern.day} ${pattern.startTime}-${pattern.endTime}`;
            }
            return pattern.raw || '';
          })
          .filter(Boolean)
          .join('\n')
        : '';

      return {
        'Course Code': change.newData.courseCode || '',
        'Course Title': change.newData.courseTitle || '',
        'Section': change.newData.section || '',
        'CRN': change.newData.crn || '',
        'Credits': change.newData.credits ?? '',
        'Semester': change.newData.term || '',
        'Semester Code': change.newData.termCode || '',
        'Academic Year': change.newData.academicYear || '',
        'Instructor(s)': change.newData.instructorName || '',
        'Instructor Baylor ID': change.newData.instructorBaylorId || '',
        'Instructor IDs (linked)': Array.isArray(change.newData.instructorIds)
          ? change.newData.instructorIds.join(', ')
          : (change.newData.instructorId || ''),
        'Location Type': change.newData.locationType || '',
        'Location Label': change.newData.locationLabel || '',
        'Room Names': Array.isArray(change.newData.roomNames)
          ? change.newData.roomNames.join(', ')
          : (change.newData.roomName || ''),
        'Room IDs': Array.isArray(change.newData.roomIds)
          ? change.newData.roomIds.join(', ')
          : '',
        'Schedule Type': change.newData.scheduleType || '',
        'Status': change.newData.status || '',
        'Meeting Patterns': meetingSummary
      };
    } else if (change.collection === 'people') {
      return {
        'Name': `${change.newData.firstName} ${change.newData.lastName}`,
        'Email': change.newData.email,
        'Phone': change.newData.phone || '',
        'Office': change.newData.office || '',
        'Title': change.newData.title || '',
        'Job Title': change.newData.jobTitle || '',
        'Department': change.newData.department || ''
      };
    } else if (change.collection === 'rooms') {
      return {
        'Name': change.newData.name,
        'Display Name': change.newData.displayName,
        'Building': change.newData.building || '',
        'Type': change.newData.type || ''
      };
    }
    return {};
  };

  const renderFieldDiffs = (change) => {
    if (!change.diff || change.diff.length === 0) return null;
    const selectedSet = selectedFieldsByChange[change.id] || new Set(change.diff.map(d => d.key));

    const toggleField = (key) => {
      setSelectedFieldsByChange((prev) => {
        const curr = new Set(prev[change.id] || []);
        if (curr.has(key)) curr.delete(key); else curr.add(key);
        return { ...prev, [change.id]: curr };
      });
    };

    const toggleAllFields = (checked) => {
      setSelectedFieldsByChange((prev) => ({
        ...prev,
        [change.id]: checked ? new Set(change.diff.map(d => d.key)) : new Set()
      }));
    };

    const allChecked = selectedSet.size === change.diff.length;

    return (
      <div className="mt-3">
        <div className="flex items-center mb-2">
          <label className="flex items-center space-x-2 cursor-pointer text-sm text-gray-700">
            <input type="checkbox" className="form-checkbox h-4 w-4 text-baylor-green" checked={allChecked} onChange={(e) => toggleAllFields(e.target.checked)} />
            <span>Select all fields ({selectedSet.size}/{change.diff.length})</span>
          </label>
        </div>
        <div className="divide-y divide-gray-100">
          {change.diff.map(({ key, from, to }) => (
            <label key={key} className="flex items-start py-2 space-x-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 form-checkbox h-4 w-4 text-baylor-green"
                checked={selectedSet.has(key)}
                onChange={() => toggleField(key)}
              />
              <div className="flex-1">
                <div className="text-xs text-gray-500">{key}</div>
                <div className="text-sm text-gray-900">{String(to || '')}</div>
                <div className="text-xs text-gray-500 line-through">{String(from || '')}</div>
              </div>
            </label>
          ))}
        </div>
      </div>
    );
  };

  if (!transaction) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Import Preview</h2>
            <p className="text-gray-600 mt-1">
              Review changes before applying to {transaction.semester}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* Stats Summary */}
          <div className="p-6 bg-gray-50 border-b border-gray-200">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
                <div className="text-sm text-gray-600">Total Changes</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{stats.schedules}</div>
                <div className="text-sm text-gray-600">Schedule Entries</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-baylor-green">{stats.people}</div>
                <div className="text-sm text-gray-600">People</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-baylor-gold">{stats.rooms}</div>
                <div className="text-sm text-gray-600">Rooms</div>
              </div>
            </div>

            {/* Selection Controls */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
              <div className="flex items-center space-x-4">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectAll}
                    onChange={toggleSelectAll}
                    className="form-checkbox h-4 w-4 text-baylor-green"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Select All ({stats.selected}/{stats.total})
                  </span>
                </label>
              </div>
              <div className="text-sm text-gray-600">
                {stats.selected} changes selected for import
              </div>
            </div>

            {previewSummary && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Preview Summary
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs text-gray-700">
                  <div>
                    <div className="font-semibold">{previewSummary.rowsProcessed ?? 0}</div>
                    <div>Rows processed</div>
                  </div>
                  <div>
                    <div className="font-semibold text-green-700">{previewSummary.schedulesAdded ?? 0}</div>
                    <div>Schedules added</div>
                  </div>
                  <div>
                    <div className="font-semibold text-baylor-gold">{previewSummary.schedulesUpdated ?? 0}</div>
                    <div>Schedules updated</div>
                  </div>
                  <div>
                    <div className="font-semibold text-gray-600">{previewSummary.schedulesUnchanged ?? 0}</div>
                    <div>Schedules unchanged</div>
                  </div>
                  <div>
                    <div className="font-semibold text-red-600">{previewSummary.rowsSkipped ?? 0}</div>
                    <div>Rows skipped</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {(validationErrors.length > 0 || validationWarnings.length > 0) && (
            <div className="p-6 border-b border-gray-200 bg-white">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Validation Results</h3>
                  <p className="text-sm text-gray-600">Review warnings or errors detected while parsing rows.</p>
                </div>
                {validationErrors.length > 0 && (
                  <div className="text-sm text-red-600 font-semibold">
                    {validationErrors.length} error{validationErrors.length === 1 ? '' : 's'}
                  </div>
                )}
              </div>

              {validationErrors.length > 0 && (
                <div className="mb-4">
                  <div className="text-sm font-semibold text-red-600 mb-2">Errors (rows skipped)</div>
                  <ul className="list-disc list-inside text-sm text-red-600 space-y-1">
                    {validationErrors.map((err, idx) => (
                      <li key={`err-${idx}`}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {validationWarnings.length > 0 && (
                <div>
                  <div className="text-sm font-semibold text-yellow-700 mb-2">Warnings</div>
                  <ul className="list-disc list-inside text-sm text-yellow-700 space-y-1">
                    {validationWarnings.map((warn, idx) => (
                      <li key={`warn-${idx}`}>{warn}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {matchingIssues.length > 0 && (
            <div className="p-6 border-b border-gray-200 bg-white">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Resolve People Matches</h3>
                  <p className="text-sm text-gray-600">
                    Link imported instructors to existing people or explicitly create new records.
                  </p>
                </div>
                {unresolvedMatchCount > 0 && (
                  <div className="flex items-center space-x-2 text-sm text-red-600">
                    <AlertTriangle className="w-4 h-4" />
                    <span>{unresolvedMatchCount} unresolved</span>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                {matchingIssues.map((issue) => {
                  const proposed = issue.proposedPerson || {};
                  const proposedName = `${proposed.firstName || ''} ${proposed.lastName || ''}`.trim() || 'Unnamed';
                  const resolution = matchResolutions[issue.id];
                  const searchTerm = matchSearchTerms[issue.id] || '';
                  const normalizedSearch = searchTerm.trim().toLowerCase();
                  const searchResults = normalizedSearch.length >= 2
                    ? people
                      .filter((person) => {
                        const name = `${person.firstName || ''} ${person.lastName || ''}`.toLowerCase();
                        const email = (person.email || '').toLowerCase();
                        const id = (person.baylorId || '').toLowerCase();
                        return name.includes(normalizedSearch) || email.includes(normalizedSearch) || id.includes(normalizedSearch);
                      })
                      .slice(0, 6)
                    : [];

                  const resolvedPerson = resolution?.action === 'link'
                    ? people.find((person) => person.id === resolution.personId) ||
                      issue.candidates?.find((candidate) => candidate.id === resolution.personId)
                    : null;

                  return (
                    <div key={issue.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-sm font-semibold text-gray-900">{proposedName}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            {proposed.baylorId ? `Baylor ID ${proposed.baylorId}` : 'No Baylor ID'}{' '}
                            {proposed.email ? `• ${proposed.email}` : ''}
                          </div>
                          {issue.importType === 'schedule' && Array.isArray(issue.scheduleChangeIds) && (
                            <div className="text-xs text-gray-500 mt-1">
                              {issue.scheduleChangeIds.length} schedule{issue.scheduleChangeIds.length === 1 ? '' : 's'} affected
                            </div>
                          )}
                          {issue.reason && (
                            <div className="text-xs text-gray-500 mt-1">{issue.reason}</div>
                          )}
                        </div>
                        <div className="text-xs">
                          {resolution ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full bg-green-100 text-green-800">
                              {resolution.action === 'create' ? 'Create new' : 'Linked'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded-full bg-yellow-100 text-yellow-800">
                              Needs resolution
                            </span>
                          )}
                        </div>
                      </div>

                      {resolution?.action === 'link' && resolvedPerson && (
                        <div className="mt-2 text-xs text-gray-600">
                          Linked to {resolvedPerson.firstName} {resolvedPerson.lastName}
                          {resolvedPerson.baylorId ? ` • ${resolvedPerson.baylorId}` : ''}
                        </div>
                      )}

                      {issue.candidates?.length > 0 && (
                        <div className="mt-3">
                          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                            Suggested matches
                          </div>
                          <div className="space-y-2">
                            {issue.candidates.map((candidate) => (
                              <div key={candidate.id} className="flex items-center justify-between border border-gray-200 rounded-md px-3 py-2">
                                <div>
                                  <div className="text-sm font-medium text-gray-900">
                                    {candidate.firstName} {candidate.lastName}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {candidate.email || 'No email'}{candidate.baylorId ? ` • ${candidate.baylorId}` : ''}
                                  </div>
                                </div>
                                <button
                                  onClick={() => applyResolution(issue, { action: 'link', personId: candidate.id })}
                                  className="text-sm px-3 py-1 border border-gray-300 rounded-md hover:bg-gray-50"
                                >
                                  Link
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="mt-3">
                        <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                          Search people
                        </div>
                        <input
                          type="text"
                          value={searchTerm}
                          onChange={(e) => setMatchSearchTerms(prev => ({ ...prev, [issue.id]: e.target.value }))}
                          placeholder="Search by name, email, or Baylor ID..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                        />
                        {normalizedSearch.length >= 2 && (
                          <div className="mt-2 space-y-2">
                            {searchResults.length === 0 ? (
                              <div className="text-xs text-gray-500">No people found.</div>
                            ) : (
                              searchResults.map((person) => (
                                <div key={person.id} className="flex items-center justify-between border border-gray-200 rounded-md px-3 py-2">
                                  <div>
                                    <div className="text-sm font-medium text-gray-900">
                                      {person.firstName} {person.lastName}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      {person.email || 'No email'}{person.baylorId ? ` • ${person.baylorId}` : ''}
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => applyResolution(issue, { action: 'link', personId: person.id })}
                                    className="text-sm px-3 py-1 border border-gray-300 rounded-md hover:bg-gray-50"
                                  >
                                    Link
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <button
                          onClick={() => applyResolution(issue, { action: 'create' })}
                          className="text-sm px-3 py-2 bg-baylor-green text-white rounded-md hover:bg-baylor-green/90"
                        >
                          Create new person
                        </button>
                        {resolution && (
                          <button
                            onClick={() => clearResolution(issue)}
                            className="text-sm text-gray-600 hover:text-gray-900"
                          >
                            Clear selection
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Changes List */}
          <div className="p-6">
            {Object.entries(groupedChanges).map(([collection, actions]) => {
              const CollectionIcon = getCollectionIcon(collection);
              const hasChanges = Object.values(actions).some(arr => arr.length > 0);

              if (!hasChanges) return null;

              return (
                <div key={collection} className="mb-6">
                  <button
                    onClick={() => toggleSection(collection)}
                    className="flex items-center space-x-3 w-full text-left p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <CollectionIcon className="w-5 h-5 text-gray-600" />
                    <span className="font-semibold text-gray-900 capitalize">
                      {collection}
                    </span>
                    <span className="text-sm text-gray-500">
                      ({Object.values(actions).reduce((sum, arr) => sum + arr.length, 0)} changes)
                    </span>
                  </button>

                  {expandedSections.has(collection) && (
                    <div className="mt-3 space-y-2">
                      {Object.entries(actions).map(([action, changes]) => {
                        if (changes.length === 0) return null;

                        return (
                          <div key={action}>
                            <h4 className="text-sm font-medium text-gray-700 mb-2 capitalize">
                              {getActionLabel(action)} ({changes.length})
                            </h4>
                            <div className="space-y-2">
                              {changes.map((change) => (
                                <div
                                  key={change.id}
                                  className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-3">
                                      <input
                                        type="checkbox"
                                        checked={selectedChanges.has(change.id)}
                                        onChange={() => toggleChange(change.id)}
                                        className="form-checkbox h-4 w-4 text-baylor-green"
                                      />
                                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getActionColor(change.action)}`}>
                                        {getActionLabel(change.action)}
                                      </span>
                                      <span className="font-medium text-gray-900">
                                        {formatChangeTitle(change)}
                                      </span>
                                    </div>
                                    <button
                                      onClick={() => toggleDetails(change.id)}
                                      className="p-1 hover:bg-gray-100 rounded transition-colors"
                                    >
                                      {showDetails[change.id] ?
                                        <EyeOff className="w-4 h-4 text-gray-500" /> :
                                        <Eye className="w-4 h-4 text-gray-500" />
                                      }
                                    </button>
                                  </div>

                                  {showDetails[change.id] && (
                                    <div className="mt-3 pt-3 border-t border-gray-100">
                                      <div className="grid grid-cols-2 gap-3 text-sm">
                                        {Object.entries(formatChangeDetails(change)).map(([key, value]) => (
                                          <div key={key}>
                                            <span className="font-medium text-gray-600">{key}:</span>
                                            <span className="ml-2 text-gray-900">{value}</span>
                                          </div>
                                        ))}
                                      </div>

                                      {change.action === 'modify' && renderFieldDiffs(change)}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            {unresolvedMatchCount > 0 ? (
              <div className="flex items-center space-x-2 text-sm text-red-600">
                <AlertTriangle className="w-4 h-4" />
                <span>
                  Resolve all people matches before applying changes.
                </span>
              </div>
            ) : (
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <AlertTriangle className="w-4 h-4" />
                <span>
                  Changes will be applied to the database and can be rolled back later if needed.
                </span>
              </div>
            )}
            <div className="flex items-center space-x-3">
              <button
                onClick={onCancel}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                disabled={isCommitting}
              >
                Cancel
              </button>
              <button
                onClick={handleCommit}
                disabled={stats.selected === 0 || unresolvedMatchCount > 0 || isCommitting}
                className="px-6 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {isCommitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Applying Changes...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Apply Selected Changes ({stats.selected})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImportPreviewModal; 
