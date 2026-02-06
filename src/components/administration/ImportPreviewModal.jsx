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

const INTERNAL_SCHEDULE_DIFF_KEYS = new Set([
  'identityKey',
  'identityKeys',
  'identitySource',
  'updatedAt',
  'spaceIds',
  'spaceDisplayNames',
  'instructorId',
  'instructorIds',
  'instructorAssignments'
]);

const FIELD_LABELS = {
  courseCode: 'Course Code',
  courseTitle: 'Course Title',
  section: 'Section',
  crn: 'CRN',
  credits: 'Credits',
  term: 'Semester',
  termCode: 'Semester Code',
  academicYear: 'Academic Year',
  instructorName: 'Instructor',
  instructorBaylorId: 'Instructor Baylor ID',
  instructorIds: 'Instructor IDs',
  instructorAssignments: 'Instructor Assignments',
  spaceIds: 'Space IDs',
  spaceDisplayNames: 'Locations',
  locationType: 'Location Type',
  locationLabel: 'Location',
  scheduleType: 'Schedule Type',
  status: 'Status',
  meetingPatterns: 'Meeting Patterns',
  instructionMethod: 'Instruction Method',
  firstName: 'First Name',
  lastName: 'Last Name',
  name: 'Name',
  email: 'Email',
  phone: 'Phone',
  office: 'Office',
  officeSpaceId: 'Office Space ID',
  title: 'Title',
  jobTitle: 'Job Title',
  department: 'Department',
  baylorId: 'Baylor ID',
  externalIds: 'External IDs',
  'externalIds.clssInstructorId': 'CLSS Instructor ID',
  'externalIds.baylorId': 'Baylor ID (external)',
  'externalIds.emails': 'External Emails'
};

const HUMAN_LABEL_OVERRIDES = {
  clssInstructorId: 'CLSS Instructor ID',
  clssId: 'CLSS ID',
  baylorId: 'Baylor ID',
  officeSpaceId: 'Office Space ID',
  crn: 'CRN'
};

const humanizeKey = (key) => {
  const normalized = key === undefined || key === null ? '' : String(key);
  if (!normalized) return '';
  if (HUMAN_LABEL_OVERRIDES[normalized]) return HUMAN_LABEL_OVERRIDES[normalized];
  return normalized
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
};

const formatKeyLabel = (key) => {
  if (key === undefined || key === null) return '';
  const normalized = String(key);
  if (FIELD_LABELS[normalized]) return FIELD_LABELS[normalized];
  if (normalized.includes('.')) {
    const [root, ...rest] = normalized.split('.');
    const rootLabel = FIELD_LABELS[root] || humanizeKey(root);
    const tail = rest.join('.');
    const fullKey = `${root}.${tail}`;
    const tailLabel = FIELD_LABELS[fullKey] || humanizeKey(tail);
    return `${rootLabel}: ${tailLabel}`;
  }
  return humanizeKey(normalized);
};

const formatValue = (value) => {
  if (value === undefined || value === null || value === '') return '-';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '-';
    return value.map((entry) => formatValue(entry)).join(', ');
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value).filter(([, entryValue]) => {
      if (entryValue === undefined || entryValue === null || entryValue === '') return false;
      if (Array.isArray(entryValue) && entryValue.length === 0) return false;
      return true;
    });
    if (entries.length === 0) return '-';
    return entries
      .map(([entryKey, entryValue]) => `${formatKeyLabel(entryKey)}: ${formatValue(entryValue)}`)
      .join(', ');
  }
  return String(value);
};

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
  const changeMeta = useMemo(() => {
    const metaById = new Map();
    const visibleChanges = [];
    const internalOnlyChanges = [];

    allChanges.forEach((change) => {
      let displayDiff = Array.isArray(change.diff) ? change.diff : [];
      let internalDiff = [];
      let internalOnly = false;

      if (change.collection === 'schedules' && change.action === 'modify') {
        const updateKeys = Object.keys(change.newData || {});
        const visibleKeys = updateKeys.filter((key) => !INTERNAL_SCHEDULE_DIFF_KEYS.has(key));
        internalOnly = updateKeys.length > 0 && visibleKeys.length === 0;

        if (Array.isArray(change.diff) && change.diff.length > 0) {
          internalDiff = change.diff.filter((entry) => INTERNAL_SCHEDULE_DIFF_KEYS.has(entry.key));
          displayDiff = change.diff.filter((entry) => !INTERNAL_SCHEDULE_DIFF_KEYS.has(entry.key));
        }
      }

      metaById.set(change.id, { displayDiff, internalDiff, internalOnly });
      if (internalOnly) {
        internalOnlyChanges.push(change);
      } else {
        visibleChanges.push(change);
      }
    });

    return { metaById, visibleChanges, internalOnlyChanges };
  }, [allChanges]);
  const visibleChanges = changeMeta.visibleChanges;
  const internalOnlyChanges = changeMeta.internalOnlyChanges;
  const people = useMemo(() => Array.isArray(directoryPeople) ? directoryPeople : [], [directoryPeople]);
  const previewSummary = useMemo(() => transaction?.previewSummary || null, [transaction]);
  const validation = useMemo(() => transaction?.validation || {}, [transaction]);
  const validationErrors = Array.isArray(validation.errors) ? validation.errors : [];
  const validationWarnings = Array.isArray(validation.warnings) ? validation.warnings : [];
  const collisionSummary = validation?.identityCollisionSummary || null;
  const displayWarnings = useMemo(
    () => validationWarnings.filter((warn) => !/duplicate schedule identities/i.test(warn)),
    [validationWarnings]
  );

  const groupedChanges = useMemo(() => {
    const groups = {
      schedules: { added: [], modified: [], deleted: [] },
      people: { added: [], modified: [], deleted: [] },
      rooms: { added: [], modified: [], deleted: [] }
    };

    visibleChanges.forEach(change => {
      const actionKey = change.action === 'add' ? 'added' :
        change.action === 'modify' ? 'modified' : 'deleted';
      groups[change.collection][actionKey].push(change);
    });

    return groups;
  }, [visibleChanges]);

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
    const selectedVisible = visibleChanges.filter((change) => selectedChanges.has(change.id));
    return {
      totalVisible: visibleChanges.length,
      selectedVisible: selectedVisible.length,
      selectedTotal: selectedChanges.size,
      internalOnly: internalOnlyChanges.length,
      schedules: selectedVisible.filter(change => change.collection === 'schedules').length,
      people: selectedVisible.filter(change => change.collection === 'people').length,
      rooms: selectedVisible.filter(change => change.collection === 'rooms').length
    };
  }, [selectedChanges, visibleChanges, internalOnlyChanges]);

  const visibleChangeIds = useMemo(
    () => new Set(visibleChanges.map((change) => change.id)),
    [visibleChanges]
  );
  const internalChangeIds = useMemo(
    () => new Set(internalOnlyChanges.map((change) => change.id)),
    [internalOnlyChanges]
  );

  const updateSelectedChanges = (nextSelected) => {
    const merged = new Set(nextSelected);
    internalChangeIds.forEach((id) => merged.add(id));
    setSelectedChanges(merged);
    const allVisibleSelected = visibleChangeIds.size > 0 &&
      Array.from(visibleChangeIds).every((id) => merged.has(id));
    setSelectAll(allVisibleSelected);
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
      updateSelectedChanges(initial);
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
      updateSelectedChanges(new Set(visibleChanges.map(c => c.id)));
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
      if (change.action !== 'modify' || !selectedChanges.has(change.id)) return;
      const meta = changeMeta.metaById.get(change.id);
      const diff = meta?.displayDiff || change.diff || [];
      if (diff.length === 0) return;
      const selectedSet = selectedFieldsByChange[change.id];
      if (selectedSet && selectedSet.size > 0) {
        fieldMap[change.id] = Array.from(selectedSet);
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

  const getDisplayData = (change) => {
    if (!change) return {};
    if (change.action === 'modify') {
      return { ...(change.originalData || {}), ...(change.newData || {}) };
    }
    if (change.action === 'delete') {
      return change.originalData || {};
    }
    return change.newData || {};
  };

  const formatChangeTitle = (change) => {
    const data = getDisplayData(change);
    if (change.collection === 'schedules') {
      const courseCode = data.courseCode || '';
      const section = data.section || '';
      const title = data.courseTitle || '';
      const crn = data.crn || '';
      const base = [courseCode, section].filter(Boolean).join(' ') || crn || 'Schedule';
      return title ? `${base} - ${title}` : base;
    } else if (change.collection === 'people') {
      const first = data.firstName || '';
      const last = data.lastName || '';
      return `${first} ${last}`.trim() || 'Person';
    } else if (change.collection === 'rooms') {
      return data.displayName || 'Room';
    }
    return 'Unknown';
  };

  const formatChangeDetails = (change) => {
    const data = getDisplayData(change);
    if (change.collection === 'schedules') {
      const meetingSummary = Array.isArray(data.meetingPatterns)
        ? data.meetingPatterns
          .map((pattern) => {
            if (pattern.day && pattern.startTime && pattern.endTime) {
              return `${pattern.day} ${pattern.startTime}-${pattern.endTime}`;
            }
            return pattern.raw || '';
          })
          .filter(Boolean)
          .join('\n')
        : '';

      const roomLabels = Array.isArray(data.spaceDisplayNames) && data.spaceDisplayNames.length > 0
        ? data.spaceDisplayNames.join(', ')
        : '';

      return {
        'Course Code': data.courseCode || '',
        'Course Title': data.courseTitle || '',
        'Section': data.section || '',
        'CRN': data.crn || '',
        'Credits': data.credits ?? '',
        'Semester': data.term || '',
        'Semester Code': data.termCode || '',
        'Academic Year': data.academicYear || '',
        'Instructor(s)': data.instructorName || '',
        'Instructor Baylor ID': data.instructorBaylorId || '',
        'Instructor IDs (linked)': Array.isArray(data.instructorIds)
          ? data.instructorIds.join(', ')
          : (data.instructorId || ''),
        'Location Type': data.locationType || '',
        'Location Label': data.locationLabel || '',
        'Locations': roomLabels,
        'Space IDs': Array.isArray(data.spaceIds)
          ? data.spaceIds.join(', ')
          : '',
        'Schedule Type': data.scheduleType || '',
        'Status': data.status || '',
        'Meeting Patterns': meetingSummary
      };
    } else if (change.collection === 'people') {
      return {
        'Name': `${data.firstName || ''} ${data.lastName || ''}`.trim(),
        'Email': data.email,
        'Phone': data.phone || '',
        'Office': data.office || '',
        'Title': data.title || '',
        'Job Title': data.jobTitle || '',
        'Department': data.department || ''
      };
    } else if (change.collection === 'rooms') {
      return {
        'Name': data.name,
        'Display Name': data.displayName,
        'Building': data.building || '',
        'Type': data.type || ''
      };
    }
    return {};
  };

  const getChangeSummary = (change) => {
    if (!change || change.action !== 'modify') return '';
    const meta = changeMeta.metaById.get(change.id);
    const diff = meta?.displayDiff || change.diff || [];
    if (!diff || diff.length === 0) {
      if (meta?.internalOnly || (Array.isArray(meta?.internalDiff) && meta.internalDiff.length > 0)) {
        return 'Internal metadata update';
      }
      return 'No visible field changes';
    }
    if (diff.length === 1) {
      const entry = diff[0];
      return `${formatKeyLabel(entry.key)} -> ${formatValue(entry.to)}`;
    }
    const labels = diff.map((entry) => formatKeyLabel(entry.key));
    const preview = labels.slice(0, 3).join(', ');
    const more = labels.length > 3 ? ` +${labels.length - 3} more` : '';
    return `Changes: ${preview}${more}`;
  };

  const renderFieldDiffs = (change) => {
    const meta = changeMeta.metaById.get(change.id);
    const diff = meta?.displayDiff || change.diff || [];
    const internalDiff = meta?.internalDiff || [];
    const internalOnly = meta?.internalOnly || false;

      if (!diff || diff.length === 0) {
      if (internalOnly || internalDiff.length > 0) {
        return (
          <div className="mt-3 text-xs text-gray-600">
            No visible field changes. Internal linking metadata will be updated automatically.
          </div>
        );
      }
      return null;
    }

    const selectedSet = selectedFieldsByChange[change.id] || new Set(diff.map(d => d.key));

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
        [change.id]: checked ? new Set(diff.map(d => d.key)) : new Set()
      }));
    };

    const allChecked = selectedSet.size === diff.length;

    return (
      <div className="mt-3">
        <div className="flex items-center mb-2">
          <label className="flex items-center space-x-2 cursor-pointer text-sm text-gray-700">
            <input type="checkbox" className="form-checkbox h-4 w-4 text-baylor-green" checked={allChecked} onChange={(e) => toggleAllFields(e.target.checked)} />
            <span>Select all fields ({selectedSet.size}/{diff.length})</span>
          </label>
        </div>
        {internalDiff.length > 0 && (
          <div className="text-xs text-gray-500 mb-2">
            Internal linking metadata will also be updated.
          </div>
        )}
        <div className="divide-y divide-gray-100">
          {diff.map(({ key, from, to }) => (
            <label key={key} className="flex items-start py-2 space-x-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 form-checkbox h-4 w-4 text-baylor-green"
                checked={selectedSet.has(key)}
                onChange={() => toggleField(key)}
              />
              <div className="flex-1">
                <div className="text-xs text-gray-500">{formatKeyLabel(key)}</div>
                <div className="text-sm text-gray-900">{formatValue(to)}</div>
                <div className="text-xs text-gray-500 line-through">{formatValue(from)}</div>
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
                <div className="text-2xl font-bold text-gray-900">{stats.totalVisible}</div>
                <div className="text-sm text-gray-600">Visible Changes</div>
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
                    Select All ({stats.selectedVisible}/{stats.totalVisible})
                  </span>
                </label>
              </div>
              <div className="text-sm text-gray-600">
                {stats.selectedVisible} visible change{stats.selectedVisible === 1 ? '' : 's'} selected
                {stats.internalOnly > 0 ? ` + ${stats.internalOnly} internal update${stats.internalOnly === 1 ? '' : 's'}` : ''}
              </div>
            </div>

            {stats.internalOnly > 0 && (
              <div className="mt-2 text-xs text-gray-500">
                Internal updates keep schedule links and identity metadata in sync and do not change class details.
              </div>
            )}

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
                {previewSummary.schedulesMetadataOnly > 0 && (
                  <div className="mt-2 text-xs text-gray-500">
                    {previewSummary.schedulesMetadataOnly} schedule update{previewSummary.schedulesMetadataOnly === 1 ? '' : 's'} are internal-only changes.
                  </div>
                )}
              </div>
            )}
          </div>

          {(validationErrors.length > 0 || displayWarnings.length > 0 || collisionSummary) && (
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

              {collisionSummary && (
                <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                  <div className="text-sm font-semibold text-yellow-800">
                    Duplicate schedules found in existing data
                  </div>
                  <p className="text-xs text-yellow-700 mt-1">
                    {collisionSummary.total} schedule identity collisions were detected (same CRN/section/meeting/room).
                    Imports will update the preferred record for each key. Consider resolving duplicates in Data Hygiene.
                  </p>
                  {collisionSummary.byType && Object.keys(collisionSummary.byType).length > 0 && (
                    <div className="mt-2 text-xs text-yellow-700">
                      {Object.entries(collisionSummary.byType)
                        .map(([type, count]) => `${type.toUpperCase()}: ${count}`)
                        .join(' • ')}
                    </div>
                  )}
                  {Array.isArray(collisionSummary.examples) && collisionSummary.examples.length > 0 && (
                    <details className="mt-2 text-xs text-yellow-700">
                      <summary className="cursor-pointer">View examples</summary>
                      <ul className="list-disc list-inside mt-1 space-y-1">
                        {collisionSummary.examples.map((example, idx) => (
                          <li key={`collision-${idx}`}>
                            {example.key} (kept {example.preferredId || example.existingId || 'unknown'})
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}

              {displayWarnings.length > 0 && (
                <div>
                  <div className="text-sm font-semibold text-yellow-700 mb-2">Warnings</div>
                  <ul className="list-disc list-inside text-sm text-yellow-700 space-y-1">
                    {displayWarnings.map((warn, idx) => (
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
                  const canCreatePerson = Boolean(issue.pendingPersonChangeId);
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
                        <div>
                          <button
                            onClick={() => applyResolution(issue, { action: 'create' })}
                            disabled={!canCreatePerson}
                            className="text-sm px-3 py-2 bg-baylor-green text-white rounded-md hover:bg-baylor-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Create new person
                          </button>
                          {!canCreatePerson && (
                            <div className="mt-1 text-xs text-gray-500">
                              Create disabled: missing identifier in import data.
                            </div>
                          )}
                        </div>
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
            {visibleChanges.length === 0 && internalOnlyChanges.length > 0 && (
              <div className="text-sm text-gray-600 mb-4">
                No visible changes detected. Only internal updates will be applied.
              </div>
            )}
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
                                  {change.action === 'modify' && !showDetails[change.id] && (
                                    <div className="ml-7 mt-2 text-xs text-gray-600">
                                      {getChangeSummary(change)}
                                    </div>
                                  )}

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
                disabled={stats.selectedTotal === 0 || unresolvedMatchCount > 0 || isCommitting}
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
                    <span>
                      Apply Selected Changes ({stats.selectedVisible}
                      {stats.internalOnly > 0 ? ` + ${stats.internalOnly} internal` : ''})
                    </span>
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
