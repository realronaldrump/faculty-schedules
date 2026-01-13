import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, ClipboardList, X } from 'lucide-react';

const sortChanges = (a, b) => {
  const order = { rooms: 0, people: 1 };
  const aOrder = order[a.collection] ?? 99;
  const bOrder = order[b.collection] ?? 99;
  if (aOrder !== bOrder) return aOrder - bOrder;
  return (a.label || '').localeCompare(b.label || '', undefined, { numeric: true });
};

const formatValue = (value) => {
  if (value === null) return 'null';
  if (value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch (_) {
    return String(value);
  }
};

const buildDependencyIndex = (changes) => {
  const dependents = new Map();
  changes.forEach((change) => {
    const deps = Array.isArray(change.dependsOn) ? change.dependsOn : [];
    deps.forEach((depId) => {
      if (!dependents.has(depId)) dependents.set(depId, new Set());
      dependents.get(depId).add(change.id);
    });
  });
  return dependents;
};

const expandAllDependents = (dependentsIndex, rootId) => {
  const result = new Set();
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.shift();
    const deps = dependentsIndex.get(current);
    if (!deps) continue;
    deps.forEach((depId) => {
      if (result.has(depId)) return;
      result.add(depId);
      queue.push(depId);
    });
  }
  return result;
};

const OfficeRoomBackfillPreviewModal = ({
  isOpen,
  plan,
  onClose,
  onApply,
  applying = false
}) => {
  const changes = useMemo(() => {
    if (!plan?.changes || !Array.isArray(plan.changes)) return [];
    return [...plan.changes].sort(sortChanges);
  }, [plan]);

  const dependentsIndex = useMemo(() => buildDependencyIndex(changes), [changes]);

  const [selected, setSelected] = useState(() => new Set());
  const [expanded, setExpanded] = useState(() => new Set());

  useEffect(() => {
    if (!isOpen) return;
    const initial = new Set(changes.map((c) => c.id));
    setSelected(initial);
    setExpanded(new Set());
  }, [isOpen, changes]);

  const stats = useMemo(() => {
    const byCollection = changes.reduce((acc, change) => {
      acc[change.collection] = (acc[change.collection] || 0) + 1;
      return acc;
    }, {});
    const selectedCount = selected.size;
    return {
      total: changes.length,
      selected: selectedCount,
      rooms: byCollection.rooms || 0,
      people: byCollection.people || 0
    };
  }, [changes, selected]);

  const changeById = useMemo(() => {
    const map = new Map();
    changes.forEach((change) => map.set(change.id, change));
    return map;
  }, [changes]);

  const toggleOne = (changeId) => {
    const change = changeById.get(changeId);
    if (!change) return;

    const next = new Set(selected);

    if (next.has(changeId)) {
      // Removing: also remove any dependents (to avoid dangling references).
      next.delete(changeId);
      const dependents = expandAllDependents(dependentsIndex, changeId);
      dependents.forEach((depId) => next.delete(depId));
      setSelected(next);
      return;
    }

    // Adding: also add dependencies.
    next.add(changeId);
    const deps = Array.isArray(change.dependsOn) ? change.dependsOn : [];
    deps.forEach((depId) => next.add(depId));
    setSelected(next);
  };

  const toggleExpanded = (changeId) => {
    const next = new Set(expanded);
    if (next.has(changeId)) next.delete(changeId);
    else next.add(changeId);
    setExpanded(next);
  };

  const selectAll = () => setSelected(new Set(changes.map((c) => c.id)));
  const selectNone = () => setSelected(new Set());

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[85vh] mx-4 flex flex-col">
        <div className="flex items-start justify-between p-6 border-b">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-emerald-100 rounded-lg">
              <ClipboardList className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Preview: Backfill Office Rooms</h3>
              <p className="text-sm text-gray-600 mt-1">
                {stats.selected} selected of {stats.total} changes (Rooms: {stats.rooms}, People: {stats.people})
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" disabled={applying}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 border-b bg-gray-50 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={selectAll}
              disabled={applying || changes.length === 0}
            >
              Select All
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={selectNone}
              disabled={applying || changes.length === 0}
            >
              Select None
            </button>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <button
              type="button"
              className="btn-ghost"
              onClick={onClose}
              disabled={applying}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary flex items-center"
              onClick={() => onApply(Array.from(selected))}
              disabled={applying || selected.size === 0}
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              {applying ? 'Applying…' : 'Apply Selected'}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {changes.length === 0 ? (
            <div className="p-8 text-center text-gray-600">
              No backfill changes detected.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {changes.map((change) => {
                const isSelected = selected.has(change.id);
                const isExpanded = expanded.has(change.id);
                const actionLabel = change.action === 'upsert'
                  ? 'Upsert'
                  : (change.action === 'merge' ? 'Update' : (change.action || 'Change'));

                const dependsOn = Array.isArray(change.dependsOn) ? change.dependsOn : [];
                const hasDetails = change.before || (change.data && Object.keys(change.data).length > 0) || dependsOn.length > 0;

                return (
                  <div key={change.id} className="p-4 hover:bg-gray-50">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
                        checked={isSelected}
                        onChange={() => toggleOne(change.id)}
                        disabled={applying}
                      />
                      <button
                        type="button"
                        onClick={() => toggleExpanded(change.id)}
                        className="mt-0.5 text-gray-500 hover:text-gray-700"
                        disabled={!hasDetails}
                        aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                      >
                        {hasDetails ? (isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />) : null}
                      </button>
                      <div className="flex-1">
                        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{change.label}</div>
                            <div className="text-xs text-gray-500 mt-1">
                              {change.collection} · {actionLabel} · {change.documentId}
                            </div>
                          </div>
                        </div>

                        {isExpanded && hasDetails && (
                          <div className="mt-3 bg-white border border-gray-200 rounded-lg p-3 text-sm">
                            {dependsOn.length > 0 && (
                              <div className="text-xs text-gray-500 mb-3">
                                Depends on: {dependsOn.join(', ')}
                              </div>
                            )}

                            {change.before && (
                              <div className="mb-3">
                                <div className="text-xs font-medium text-gray-700 mb-1">Before</div>
                                <pre className="text-xs bg-gray-50 p-2 rounded border border-gray-100 overflow-x-auto">
                                  {formatValue(change.before)}
                                </pre>
                              </div>
                            )}

                            {change.data && Object.keys(change.data).length > 0 && (
                              <div>
                                <div className="text-xs font-medium text-gray-700 mb-1">After</div>
                                <pre className="text-xs bg-gray-50 p-2 rounded border border-gray-100 overflow-x-auto">
                                  {formatValue(change.data)}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OfficeRoomBackfillPreviewModal;

