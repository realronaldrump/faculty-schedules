import React, { useMemo, useState } from 'react';
import { IdCard, Search, Edit, Save, X, Filter, CheckCircle2, AlertCircle, Download } from 'lucide-react';

const hasRole = (person, roleKey) => {
  const roles = person?.roles;
  if (!roles) return false;
  if (Array.isArray(roles)) return roles.includes(roleKey);
  if (typeof roles === 'object') return roles[roleKey] === true;
  return false;
};

const getDisplayRoleLabels = (person) => {
  const labels = [];
  if (hasRole(person, 'faculty')) labels.push('Faculty');
  if (hasRole(person, 'staff')) labels.push('Staff');
  if (hasRole(person, 'student')) labels.push('Student');
  if (person.isAdjunct) labels.push('Adjunct'); // derive adjunct only from explicit flag
  return labels;
};

const BaylorIDManager = ({ directoryData = [], onFacultyUpdate, onStaffUpdate, onStudentUpdate, showNotification, canEdit }) => {
  const [filterText, setFilterText] = useState('');
  const [roleChecks, setRoleChecks] = useState({ faculty: true, staff: true, student: true });
  const [adjunctOnly, setAdjunctOnly] = useState(false);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [baylorIdDraft, setBaylorIdDraft] = useState('');
  const [error, setError] = useState('');

  const people = useMemo(() => Array.isArray(directoryData) ? directoryData : [], [directoryData]);

  const filtered = useMemo(() => {
    const term = filterText.trim().toLowerCase();
    return people
      .filter((p) => {
        if (!p) return false;
        const includeByRole = (
          (roleChecks.faculty && hasRole(p, 'faculty')) ||
          (roleChecks.staff && hasRole(p, 'staff')) ||
          (roleChecks.student && hasRole(p, 'student'))
        );
        if (!includeByRole) return false;
        if (adjunctOnly && !p.isAdjunct) return false;
        if (onlyMissing && (p.baylorId && p.baylorId.trim() !== '')) return false;
        if (!term) return true;
        const name = (p.name || '').toLowerCase();
        const email = (p.email || '').toLowerCase();
        const id = (p.baylorId || '').toLowerCase();
        return name.includes(term) || email.includes(term) || id.includes(term);
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [people, filterText, roleChecks, adjunctOnly, onlyMissing]);

  const exportToCSV = () => {
    const headers = ['Name', 'Baylor ID'];
    const rows = filtered.map(person => [
      person.name || '',
      person.baylorId || ''
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `baylor-id-export-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const startEdit = (person) => {
    setEditingId(person.id);
    setBaylorIdDraft(person.baylorId || '');
    setError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setBaylorIdDraft('');
    setError('');
  };

  const validateId = (value) => {
    if (!value) return 'Baylor ID must be 9 digits';
    const digits = value.replace(/\D/g, '');
    if (digits.length !== 9) return 'Baylor ID must be exactly 9 digits';
    return '';
  };

  const saveId = async (person) => {
    const validation = validateId(baylorIdDraft);
    if (validation) {
      setError(validation);
      return;
    }
    if (!canEdit()) {
      showNotification?.('warning', 'Permission Denied', 'Only admins can modify Baylor IDs.');
      return;
    }
    const payload = { id: person.id, baylorId: baylorIdDraft.replace(/\D/g, '') };
    const roles = getRoleLabels(person);
    try {
      if (roles.includes('student') && onStudentUpdate) {
        await onStudentUpdate(payload);
      } else if (roles.includes('staff') && !roles.includes('faculty') && onStaffUpdate) {
        await onStaffUpdate(payload);
      } else if (onFacultyUpdate) {
        await onFacultyUpdate(payload, person);
      }
      setEditingId(null);
      setBaylorIdDraft('');
      setError('');
      showNotification?.('success', 'Baylor ID Updated', `${person.name}'s Baylor ID was updated.`);
    } catch (e) {
      setError(e?.message || 'Failed to save.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="university-card">
        <div className="university-card-header flex justify-between items-center">
          <div>
            <h2 className="university-card-title">Baylor ID Manager</h2>
            <p className="university-card-subtitle">Quickly view and update Baylor IDs across directory members.</p>
          </div>
          <div className="p-3 bg-baylor-green/10 rounded-lg">
             <IdCard className="h-6 w-6 text-baylor-green" />
          </div>
        </div>

        <div className="university-card-content">
          <div className="flex flex-wrap gap-3 items-center mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Search by name, email, or ID..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="w-64 pl-10 p-2 border border-gray-300 rounded-lg focus:ring-baylor-green focus:border-baylor-green"
              />
            </div>
            <div className="flex items-center gap-3">
              <Filter size={16} className="text-gray-500" />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={roleChecks.faculty}
                  onChange={(e) => setRoleChecks(prev => ({ ...prev, faculty: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
                />
                Faculty
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={roleChecks.staff}
                  onChange={(e) => setRoleChecks(prev => ({ ...prev, staff: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
                />
                Staff
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={roleChecks.student}
                  onChange={(e) => setRoleChecks(prev => ({ ...prev, student: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
                />
                Student
              </label>
              <label className="flex items-center gap-2 text-sm ml-2">
                <input
                  type="checkbox"
                  checked={adjunctOnly}
                  onChange={(e) => setAdjunctOnly(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
                />
                Adjunct only
              </label>
              <label className="flex items-center gap-2 text-sm ml-2">
                <input
                  type="checkbox"
                  checked={onlyMissing}
                  onChange={(e) => setOnlyMissing(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
                />
                Only show missing IDs
              </label>
            </div>
            <button
              onClick={exportToCSV}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Download size={18} />
              Export CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-baylor-green/5">
                  <th className="px-4 py-3 text-left font-serif font-semibold text-baylor-green">Name</th>
                  <th className="px-4 py-3 text-left font-serif font-semibold text-baylor-green">Roles</th>
                  <th className="px-4 py-3 text-left font-serif font-semibold text-baylor-green">Baylor ID</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filtered.map((person) => {
                  const roles = getDisplayRoleLabels(person);
                  const isEditing = editingId === person.id;
                  const hasId = person.baylorId && person.baylorId.trim() !== '';
                  return (
                    <tr key={person.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="text-gray-900 font-medium">{person.name || '-'}</div>
                        <div className="text-xs text-gray-500">{person.email || ''}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {roles.length === 0 ? (
                            <span className="text-xs text-gray-500">Unassigned</span>
                          ) : roles.map((r) => (
                            <span key={r} className="px-2 py-0.5 bg-gray-100 rounded-full text-xs text-gray-700">{r}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <div>
                            <input
                              value={baylorIdDraft}
                              onChange={(e) => {
                                const v = e.target.value.replace(/\D/g, '').slice(0, 9);
                                setBaylorIdDraft(v);
                                if (error) setError('');
                              }}
                              placeholder="9 digits"
                              className={`w-48 p-2 border rounded ${error ? 'border-red-500' : 'border-gray-300'}`}
                            />
                            {error && (
                              <div className="flex items-center gap-1 text-red-600 text-xs mt-1">
                                <AlertCircle size={12} />
                                {error}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            {hasId ? (
                              <span className="inline-flex items-center gap-1 text-gray-800">
                                <CheckCircle2 size={14} className="text-green-600" />
                                {person.baylorId}
                              </span>
                            ) : (
                              <span className="text-gray-500 italic">Missing</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <div className="flex gap-1 justify-end">
                            <button
                              onClick={() => saveId(person)}
                              className="p-2 text-baylor-green hover:bg-baylor-green/10 rounded-full"
                              title="Save"
                            >
                              <Save size={16} />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-2 text-red-600 hover:bg-red-100 rounded-full"
                              title="Cancel"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEdit(person)}
                            className="p-2 text-blue-600 hover:bg-blue-100 rounded-full"
                            title="Edit Baylor ID"
                          >
                            <Edit size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-12">
              <IdCard className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No people found</h3>
              <p className="mt-1 text-sm text-gray-500">Adjust your search or filters.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BaylorIDManager;


