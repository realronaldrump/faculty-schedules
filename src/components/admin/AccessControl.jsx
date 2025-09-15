import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../../firebase';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp, collection, getDocs, query, orderBy, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { logUpdate, logDelete } from '../../utils/changeLogger';
import { Shield } from 'lucide-react';
import { getAllRegisteredActionKeys, registerActionKeys } from '../../utils/actionRegistry';

const AccessControl = () => {
  const { userProfile, getAllPageIds, isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rolePermissions, setRolePermissions] = useState({ admin: { '*': true }, staff: {}, faculty: {}, viewer: { 'dashboard': true } });
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [userOverrides, setUserOverrides] = useState({});
  const [userRoles, setUserRoles] = useState([]);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [actionKeys, setActionKeys] = useState(['roomGrids.save', 'roomGrids.delete']);

  const allPages = useMemo(() => getAllPageIds(), [getAllPageIds]);

  const PAGE_GROUPS = useMemo(() => {
    const groups = [
      { name: 'Dashboard', pages: ['dashboard'] },
      { name: 'Scheduling', pages: ['scheduling/faculty-schedules','scheduling/individual-availability','scheduling/room-schedules','scheduling/student-schedules','scheduling/group-meeting-scheduler'] },
      { name: 'Directory', pages: ['people/people-directory','people/email-lists','resources/building-directory','administration/baylor-acronyms'] },
      { name: 'Analytics', pages: ['analytics/department-insights','analytics/course-management'] },
      { name: 'Tools', pages: ['administration/smart-import','administration/data-hygiene','resources/room-grid-generator','administration/recent-changes'] },
      { name: 'System', pages: ['administration/program-management','administration/access-control','administration/baylor-systems'] }
    ];
    // Include any pages not covered above as Other
    const grouped = new Set(groups.flatMap(g => g.pages));
    const others = allPages.filter(p => !grouped.has(p));
    if (others.length > 0) groups.push({ name: 'Other', pages: others });
    return groups;
  }, [allPages]);

  const loadData = async () => {
    setLoading(true);
    try {
      const acRef = doc(db, 'settings', 'accessControl');
      const acSnap = await getDoc(acRef);
      if (acSnap.exists()) {
        const data = acSnap.data() || {};
        setRolePermissions(data.rolePermissions || { admin: { '*': true }, staff: {}, faculty: {} });
      }

      const usersSnap = await getDocs(query(collection(db, 'users'), orderBy('email')));
      const userList = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setUsers(userList);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // Load all registered actions on component mount and when users change
  useEffect(() => {
    const keys = getAllRegisteredActionKeys();
    if (Array.isArray(keys) && keys.length > 0) {
      setActionKeys(prev => Array.from(new Set([...prev, ...keys])));
    }
  }, [users]);

  // Also load actions on component mount to ensure we have the latest
  useEffect(() => {
    const keys = getAllRegisteredActionKeys();
    setActionKeys(Array.from(new Set(keys)));
  }, []);

  const toggleRolePage = (role, pageId) => {
    setRolePermissions(prev => {
      const current = prev[role] || {};
      const nextVal = !(current[pageId] === true);
      return { ...prev, [role]: { ...current, [pageId]: nextVal } };
    });
  };

  const setGroupForRole = (role, pages, value) => {
    setRolePermissions(prev => {
      const current = { ...(prev[role] || {}) };
      pages.forEach(pid => { current[pid] = value; });
      return { ...prev, [role]: current };
    });
  };

  const selectUser = async (uid) => {
    setSelectedUserId(uid);
    if (!uid) { setUserOverrides({}); return; }
    const uRef = doc(db, 'users', uid);
    const uSnap = await getDoc(uRef);
    const data = uSnap.data() || {};
    setUserOverrides(data.permissions || {});
    setUserRoles(Array.isArray(data.roles) ? data.roles : []);
    // Initialize actions map for UI toggles
    const existingActions = (data.actions && typeof data.actions === 'object') ? data.actions : {};
    setUserActions(existingActions);
  };

  const toggleUserPage = (pageId) => {
    setUserOverrides(prev => ({ ...prev, [pageId]: !(prev[pageId] === true) }));
  };

  const saveAccessControl = async () => {
    setSaving(true);
    try {
      const acRef = doc(db, 'settings', 'accessControl');
      const original = (await getDoc(acRef)).data() || {};
      const payload = { rolePermissions, updatedAt: serverTimestamp() };
      await setDoc(acRef, payload, { merge: true });
      await logUpdate('Access Control - Roles', 'settings', 'accessControl', payload, original, 'AccessControl.jsx - saveAccessControl');
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  const saveUserOverrides = async () => {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      const uRef = doc(db, 'users', selectedUserId);
      const original = (await getDoc(uRef)).data() || {};
      const payload = { permissions: userOverrides, actions: userActions, updatedAt: serverTimestamp() };
      await updateDoc(uRef, payload);
      await logUpdate(`User Permissions - ${original.email}`, 'users', selectedUserId, payload, original, 'AccessControl.jsx - saveUserOverrides');
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  const toggleUserRole = (role) => {
    setUserRoles(prev => {
      const has = prev.includes(role);
      if (has) {
        if (role === 'admin' && selectedUserId === userProfile?.uid) {
          return prev;
        }
        return prev.filter(r => r !== role);
      }
      return [...prev, role];
    });
  };

  const saveUserRoles = async () => {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      const uRef = doc(db, 'users', selectedUserId);
      const original = (await getDoc(uRef)).data() || {};
      const rolesToSave = userRoles.length === 0 ? ['viewer'] : Array.from(new Set(userRoles));
      const payload = { roles: rolesToSave, updatedAt: serverTimestamp() };
      await updateDoc(uRef, payload);
      await logUpdate(`User Roles - ${original.email}`, 'users', selectedUserId, payload, original, 'AccessControl.jsx - saveUserRoles');
      await loadData();
    } finally {
      setSaving(false);
    }
  };

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u => (u.email || '').toLowerCase().includes(q));
  }, [users, search]);

  // Per-user action toggles
  const [userActions, setUserActions] = useState({});
  const toggleUserAction = (key) => {
    setUserActions(prev => ({ ...prev, [key]: !(prev[key] === true) }));
  };

  const quickToggleRole = async (uid, role) => {
    try {
      const uRef = doc(db, 'users', uid);
      const snap = await getDoc(uRef);
      const data = snap.data() || {};
      const roles = Array.isArray(data.roles) ? data.roles : [];
      if (role === 'admin' && uid === userProfile?.uid && roles.includes('admin')) {
        return;
      }
      const next = roles.includes(role) ? roles.filter(r => r !== role) : [...roles, role];
      const finalRoles = next.length === 0 ? ['viewer'] : Array.from(new Set(next));
      await updateDoc(uRef, { roles: finalRoles, updatedAt: serverTimestamp() });
      await logUpdate(`User Roles - ${data.email}`, 'users', uid, { roles: finalRoles }, data, 'AccessControl.jsx - quickToggleRole');
      await loadData();
    } catch (e) {}
  };

  const toggleDisable = async (uid, disabled) => {
    try {
      const uRef = doc(db, 'users', uid);
      const snap = await getDoc(uRef);
      const data = snap.data() || {};
      const payload = disabled ? { disabled: true, disabledAt: serverTimestamp(), updatedAt: serverTimestamp() } : { disabled: false, updatedAt: serverTimestamp() };
      await updateDoc(uRef, payload);
      await logUpdate(`User ${disabled ? 'Disabled' : 'Enabled'} - ${data.email}`, 'users', uid, payload, data, 'AccessControl.jsx - toggleDisable');
      await loadData();
    } catch (e) {}
  };

  const openDeleteUserModal = async (uid) => {
    try {
      const uRef = doc(db, 'users', uid);
      const snap = await getDoc(uRef);
      const data = snap.data() || {};
      setDeleteTarget({ id: uid, email: data.email || '' });
    } catch (_) {
      setDeleteTarget({ id: uid, email: '' });
    }
  };

  const confirmDeleteUser = async () => {
    if (!deleteTarget) return;
    const uid = deleteTarget.id;
    try {
      const uRef = doc(db, 'users', uid);
      const snap = await getDoc(uRef);
      const data = snap.data() || {};
      await deleteDoc(uRef);
      await logDelete(`User Profile - ${data.email || uid}`, 'users', uid, data, 'AccessControl.jsx - confirmDeleteUser');
      await loadData();
      if (selectedUserId === uid) {
        setSelectedUserId('');
        setUserOverrides({});
        setUserRoles([]);
      }
    } catch (e) {
      // noop
    } finally {
      setDeleteTarget(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-4">
        <p className="text-gray-700">Only administrators can view this page.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="loading-shimmer w-16 h-16 rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Loading access control...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-baylor-green mb-2">Role-Based Access</h2>
        <p className="text-sm text-gray-600 mb-4">Toggle pages per role. Admins always have full access and are not shown here.</p>
        {['staff', 'faculty', 'viewer'].map(role => (
          <div key={`role-grid-${role}`} className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <div className="font-medium capitalize">{role}</div>
              <div className="space-x-2 text-sm">
                <button className="btn-ghost" onClick={() => setGroupForRole(role, allPages, true)}>Select All</button>
                <button className="btn-ghost" onClick={() => setGroupForRole(role, allPages, false)}>Clear All</button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {PAGE_GROUPS.map(group => (
                <div key={`${role}-${group.name}`} className="border border-gray-100 rounded-md p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium">{group.name}</div>
                    <div className="space-x-2 text-xs">
                      <button className="text-baylor-green hover:underline" onClick={() => setGroupForRole(role, group.pages, true)}>Select</button>
                      <button className="text-gray-500 hover:underline" onClick={() => setGroupForRole(role, group.pages, false)}>Clear</button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {group.pages.map(pid => (
                      <label key={`${role}-${group.name}-${pid}`} className="flex items-center space-x-2 text-sm">
                        <input
                          type="checkbox"
                          checked={Boolean((rolePermissions[role] || {})[pid])}
                          onChange={() => toggleRolePage(role, pid)}
                        />
                        <span>{pid}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="mt-2">
          <button className="btn-primary" onClick={saveAccessControl} disabled={saving}>
            {saving ? 'Saving...' : 'Save Role Access'}
          </button>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold text-baylor-green mb-2">User Overrides</h2>
        <p className="text-sm text-gray-600 mb-4">Manage users: search, assign roles, disable/enable, and set per-page overrides.</p>
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <input
              className="form-input w-64"
              placeholder="Search users by email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-600">
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Roles</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Last Login</th>
                  <th className="py-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(u => (
                  <tr key={u.id} className="border-t border-gray-100">
                    <td className="py-2 pr-4">
                      <button className="text-baylor-green hover:underline" onClick={() => selectUser(u.id)}>{u.email}</button>
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-3">
                        {['viewer','staff','faculty','admin'].map(r => (
                          <label key={`${u.id}-${r}`} className="inline-flex items-center space-x-1">
                            <input type="checkbox" checked={Array.isArray(u.roles) ? u.roles.includes(r) : false} onChange={() => quickToggleRole(u.id, r)} />
                            <span className="capitalize">{r}</span>
                          </label>
                        ))}
                        
                      </div>
                    </td>
                    <td className="py-2 pr-4">
                      {u.disabled ? (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700">Disabled</span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">Active</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">{u.lastLoginAt ? new Date(u.lastLoginAt.seconds ? u.lastLoginAt.seconds * 1000 : u.lastLoginAt).toLocaleString() : '-'}</td>
                    <td className="py-2 pr-4 space-x-2">
                      <button className="btn-ghost" onClick={() => toggleDisable(u.id, !u.disabled)}>{u.disabled ? 'Enable' : 'Disable'}</button>
                      <button className="btn-danger" onClick={() => openDeleteUserModal(u.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="flex items-center space-x-3 mb-4">
          <select className="form-input" value={selectedUserId} onChange={(e) => selectUser(e.target.value)}>
            <option value="">Select a user...</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.email}</option>
            ))}
          </select>
          <button className="btn-primary" onClick={saveUserOverrides} disabled={!selectedUserId || saving}>
            {saving ? 'Saving...' : 'Save User Overrides'}
          </button>
        </div>
        {selectedUserId && (
          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
            <div className="font-medium mb-3">User Roles</div>
            <div className="flex flex-wrap gap-4 text-sm">
              {['viewer', 'staff', 'faculty', 'admin'].map(role => (
                <label key={`role-${role}`} className="inline-flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={userRoles.includes(role)}
                    onChange={() => toggleUserRole(role)}
                  />
                  <span className="capitalize">{role}</span>
                </label>
              ))}
            </div>
            <div className="mt-3">
              <button className="btn-ghost" onClick={saveUserRoles} disabled={saving}>
                {saving ? 'Saving...' : 'Save User Roles'}
              </button>
            </div>
          </div>
        )}
        {selectedUserId && (
          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-baylor-green" />
              <div className="font-medium">User Actions</div>
            </div>
            <p className="text-xs text-gray-600 mb-3">Grant specific actions. Admins automatically have all actions.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-sm">
              {actionKeys.map(key => (
                <label key={`act-${key}`} className="inline-flex items-center space-x-2">
                  <input type="checkbox" checked={Boolean(userActions[key])} onChange={() => toggleUserAction(key)} />
                  <span>{key}</span>
                </label>
              ))}
            </div>
          </div>
        )}
        {selectedUserId && (
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="space-y-2 max-h-72 overflow-y-auto baylor-scrollbar pr-1">
              {allPages.map(pid => (
                <label key={`user-${pid}`} className="flex items-center space-x-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(userOverrides[pid])}
                    onChange={() => toggleUserPage(pid)}
                  />
                  <span>{pid}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {deleteTarget && (
        <div className="modal-overlay">
          <div className="modal-content max-w-md">
            <div className="modal-header">
              <h3 className="modal-title">Delete User Profile</h3>
            </div>
            <div className="modal-body">
              <p className="text-gray-700 mb-2">This will remove the user's profile document from Firestore:</p>
              <p className="text-gray-900 font-medium">{deleteTarget.email || deleteTarget.id}</p>
              <p className="text-gray-600 mt-3">Note: This does not delete the Firebase Authentication account. If the user signs in again, a new profile may be created. To block access, use Disable instead.</p>
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn-danger" onClick={confirmDeleteUser}>Delete Profile</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccessControl;


