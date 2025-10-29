import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../../firebase';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp, collection, getDocs, query, orderBy, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { logUpdate, logDelete } from '../../utils/changeLogger';
import { Shield, Users, Lock, Eye, Key, AlertCircle, CheckCircle, XCircle, Trash2, Search } from 'lucide-react';
import { getAllRegisteredActionKeys } from '../../utils/actionRegistry';

const AccessControl = () => {
  const { userProfile, getAllPageIds, isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('roles'); // 'roles' | 'users'
  const [activeRoleTab, setActiveRoleTab] = useState('pages'); // 'pages' | 'actions'
  const [rolePermissions, setRolePermissions] = useState({
    admin: { pages: { '*': true }, actions: { '*': true } },
    staff: { pages: {}, actions: {} },
    faculty: { pages: {}, actions: {} },
    viewer: { pages: { 'dashboard': true }, actions: {} }
  });
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [userOverrides, setUserOverrides] = useState({});
  const [userActions, setUserActions] = useState({});
  const [userRoles, setUserRoles] = useState([]);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [actionKeys, setActionKeys] = useState([]);

  const allPages = useMemo(() => getAllPageIds(), [getAllPageIds]);

  const ACTION_GROUPS = useMemo(() => {
    const groups = [
      { name: 'Directory', actions: actionKeys.filter(a => a.startsWith('directory.')) },
      { name: 'Schedule', actions: actionKeys.filter(a => a.startsWith('schedule.')) },
      { name: 'Room', actions: actionKeys.filter(a => a.startsWith('room')) },
      { name: 'Program', actions: actionKeys.filter(a => a.startsWith('program.')) },
      { name: 'Course', actions: actionKeys.filter(a => a.startsWith('course.')) },
      { name: 'Data Management', actions: actionKeys.filter(a => a.startsWith('data.')) },
      { name: 'Analytics', actions: actionKeys.filter(a => a.startsWith('analytics.')) },
      { name: 'System', actions: actionKeys.filter(a => a.startsWith('system.')) },
      { name: 'CRN', actions: actionKeys.filter(a => a.startsWith('crn.')) },
    ];
    const grouped = new Set(groups.flatMap(g => g.actions));
    const others = actionKeys.filter(a => !grouped.has(a));
    if (others.length > 0) groups.push({ name: 'Other', actions: others });
    return groups.filter(g => g.actions.length > 0);
  }, [actionKeys]);

  const PAGE_GROUPS = useMemo(() => {
    const groups = [
      { name: 'Dashboard', pages: ['dashboard'] },
      { name: 'Scheduling', pages: ['scheduling/faculty-schedules','scheduling/individual-availability','scheduling/room-schedules','scheduling/student-schedules','scheduling/group-meeting-scheduler'] },
      { name: 'Directory', pages: ['people/people-directory','people/email-lists','resources/building-directory','administration/baylor-acronyms','people/baylor-id-manager'] },
      { name: 'Analytics', pages: ['analytics/department-insights','analytics/student-worker-analytics','analytics/course-management','analytics/program-management'] },
      { name: 'Tools', pages: ['administration/import-wizard','administration/data-hygiene','administration/crn-tools','administration/outlook-export','resources/room-grid-generator','administration/recent-changes'] },
      { name: 'System', pages: ['administration/access-control','administration/user-activity','administration/baylor-systems'] }
    ];
    const grouped = new Set(groups.flatMap(g => g.pages));
    const others = allPages.filter(p => !grouped.has(p));
    if (others.length > 0) groups.push({ name: 'Other', pages: others });
    return groups;
  }, [allPages]);

  const normalizeRolePermissions = (raw) => {
    const input = raw || {};
    const roleKeys = new Set(['admin','staff','faculty','viewer', ...Object.keys(input)]);
    const normalized = {};
    roleKeys.forEach((role) => {
      const value = input[role];
      if (value && typeof value === 'object' && (value.pages || value.actions)) {
        normalized[role] = {
          pages: (value.pages && typeof value.pages === 'object') ? { ...value.pages } : {},
          actions: (value.actions && typeof value.actions === 'object') ? { ...value.actions } : {}
        };
      } else if (value && typeof value === 'object') {
        normalized[role] = { pages: { ...value }, actions: {} };
      } else {
        normalized[role] = { pages: {}, actions: {} };
      }
    });
    if (!normalized.admin) normalized.admin = { pages: {}, actions: {} };
    if (!normalized.admin.pages || Object.keys(normalized.admin.pages).length === 0) normalized.admin.pages = { '*': true };
    if (!normalized.admin.actions || Object.keys(normalized.admin.actions).length === 0) normalized.admin.actions = { '*': true };
    if (!normalized.viewer) normalized.viewer = { pages: {}, actions: {} };
    if (!normalized.viewer.pages) normalized.viewer.pages = {};
    if (!Object.prototype.hasOwnProperty.call(normalized.viewer.pages, 'dashboard')) {
      normalized.viewer.pages['dashboard'] = true;
    }
    return normalized;
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const acRef = doc(db, 'settings', 'accessControl');
      const acSnap = await getDoc(acRef);
      if (acSnap.exists()) {
        const data = acSnap.data() || {};
        setRolePermissions(normalizeRolePermissions(data.rolePermissions));
      }

      const usersSnap = await getDocs(query(collection(db, 'users'), orderBy('email')));
      const userList = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setUsers(userList);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const keys = getAllRegisteredActionKeys();
    setActionKeys(Array.from(new Set(keys)));
  }, []);

  const toggleRolePage = (role, pageId) => {
    setRolePermissions(prev => {
      const current = prev[role] || { pages: {}, actions: {} };
      const pages = current.pages || {};
      const nextVal = !(pages[pageId] === true);
      return { ...prev, [role]: { ...current, pages: { ...pages, [pageId]: nextVal } } };
    });
  };

  const setGroupForRole = (role, pages, value) => {
    setRolePermissions(prev => {
      const current = { ...(prev[role] || { pages: {}, actions: {} }) };
      const pagesMap = { ...(current.pages || {}) };
      pages.forEach(pid => { pagesMap[pid] = value; });
      return { ...prev, [role]: { ...current, pages: pagesMap } };
    });
  };

  const toggleRoleAction = (role, actionKey) => {
    setRolePermissions(prev => {
      const current = prev[role] || { pages: {}, actions: {} };
      const actions = current.actions || {};
      const nextVal = !(actions[actionKey] === true);
      return { ...prev, [role]: { ...current, actions: { ...actions, [actionKey]: nextVal } } };
    });
  };

  const setActionsForRole = (role, keys, value) => {
    setRolePermissions(prev => {
      const current = { ...(prev[role] || { pages: {}, actions: {} }) };
      const actionsMap = { ...(current.actions || {}) };
      keys.forEach(k => { actionsMap[k] = value; });
      return { ...prev, [role]: { ...current, actions: actionsMap } };
    });
  };

  const selectUser = async (uid) => {
    setSelectedUserId(uid);
    if (!uid) { 
      setUserOverrides({});
      setUserActions({});
      setUserRoles([]);
      return;
    }
    const uRef = doc(db, 'users', uid);
    const uSnap = await getDoc(uRef);
    const data = uSnap.data() || {};
    setUserOverrides(data.permissions || {});
    setUserRoles(Array.isArray(data.roles) ? data.roles : []);
    const existingActions = (data.actions && typeof data.actions === 'object') ? data.actions : {};
    setUserActions(existingActions);
  };

  const toggleUserPage = (pageId) => {
    setUserOverrides(prev => ({ ...prev, [pageId]: !(prev[pageId] === true) }));
  };

  const toggleUserAction = (key) => {
    setUserActions(prev => ({ ...prev, [key]: !(prev[key] === true) }));
  };

  const saveAccessControl = async () => {
    setSaving(true);
    try {
      const acRef = doc(db, 'settings', 'accessControl');
      const original = (await getDoc(acRef)).data() || {};
      const payload = { rolePermissions: normalizeRolePermissions(rolePermissions), updatedAt: serverTimestamp() };
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
        setUserActions({});
      }
    } catch (e) {
      // noop
    } finally {
      setDeleteTarget(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h2>
        <p className="text-gray-600">Only administrators can view this page.</p>
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

  const selectedUser = users.find(u => u.id === selectedUserId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-baylor-green to-baylor-green/80 rounded-lg p-6 text-white">
        <div className="flex items-center gap-3 mb-2">
          <Shield className="w-8 h-8" />
          <h1 className="text-2xl font-bold">Access Control</h1>
        </div>
        <p className="text-white/90">Manage role-based permissions and user access across the application</p>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-900">
            <p className="font-medium mb-1">Dynamic Permission System</p>
            <p className="text-blue-700">Pages and actions are automatically detected from the app. Admins always have full access to everything.</p>
          </div>
        </div>
      </div>

      {/* Main Tabs */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex">
            <button
              onClick={() => setActiveTab('roles')}
              className={`flex items-center gap-2 px-6 py-4 font-medium border-b-2 transition-colors ${
                activeTab === 'roles'
                  ? 'border-baylor-green text-baylor-green'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Lock className="w-4 h-4" />
              Role Permissions
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`flex items-center gap-2 px-6 py-4 font-medium border-b-2 transition-colors ${
                activeTab === 'users'
                  ? 'border-baylor-green text-baylor-green'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Users className="w-4 h-4" />
              User Management
            </button>
          </nav>
        </div>

        <div className="p-6">
          {/* ROLE PERMISSIONS TAB */}
          {activeTab === 'roles' && (
            <div className="space-y-6">
              {/* Role Sub-tabs */}
              <div className="flex items-center gap-2 border-b border-gray-200">
                <button
                  onClick={() => setActiveRoleTab('pages')}
                  className={`flex items-center gap-2 px-4 py-2 font-medium border-b-2 -mb-px transition-colors ${
                    activeRoleTab === 'pages'
                      ? 'border-baylor-green text-baylor-green'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Eye className="w-4 h-4" />
                  Page Access
                </button>
                <button
                  onClick={() => setActiveRoleTab('actions')}
                  className={`flex items-center gap-2 px-4 py-2 font-medium border-b-2 -mb-px transition-colors ${
                    activeRoleTab === 'actions'
                      ? 'border-baylor-green text-baylor-green'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Key className="w-4 h-4" />
                  Database Actions
                </button>
              </div>

              {/* Page Access */}
              {activeRoleTab === 'pages' && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">Control which pages each role can view. Admin role has access to all pages automatically.</p>
                  
                  {['staff', 'faculty', 'viewer'].map(role => (
                    <div key={`role-pages-${role}`} className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-b border-gray-200">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${
                            role === 'staff' ? 'bg-blue-500' :
                            role === 'faculty' ? 'bg-purple-500' :
                            'bg-gray-500'
                          }`}></div>
                          <h3 className="font-semibold text-gray-900 capitalize">{role}</h3>
                          <span className="text-xs text-gray-500">
                            ({Object.values(((rolePermissions[role] || {}).pages || {})).filter(v => v === true).length} pages granted)
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            className="text-xs px-3 py-1 bg-baylor-green text-white rounded hover:bg-baylor-green/90"
                            onClick={() => setGroupForRole(role, allPages, true)}
                          >
                            Select All
                          </button>
                          <button 
                            className="text-xs px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                            onClick={() => setGroupForRole(role, allPages, false)}
                          >
                            Clear All
                          </button>
                        </div>
                      </div>
                      
                      <div className="p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {PAGE_GROUPS.map(group => (
                            <div key={`${role}-${group.name}`} className="bg-gray-50 rounded-lg p-3">
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="text-sm font-semibold text-gray-700">{group.name}</h4>
                                <div className="flex items-center gap-1">
                                  <button 
                                    className="text-xs text-baylor-green hover:underline"
                                    onClick={() => setGroupForRole(role, group.pages, true)}
                                  >
                                    All
                                  </button>
                                  <span className="text-xs text-gray-400">|</span>
                                  <button 
                                    className="text-xs text-gray-500 hover:underline"
                                    onClick={() => setGroupForRole(role, group.pages, false)}
                                  >
                                    None
                                  </button>
                                </div>
                              </div>
                              <div className="space-y-1.5">
                                {group.pages.map(pid => (
                                  <label key={`${role}-${pid}`} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-white/50 rounded px-2 py-1">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(((rolePermissions[role] || {}).pages || {})[pid])}
                                      onChange={() => toggleRolePage(role, pid)}
                                      className="rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
                                    />
                                    <span className="text-gray-700">{pid}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Database Actions */}
              {activeRoleTab === 'actions' && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">Control which database operations each role can perform. Admin role has all actions automatically.</p>
                  
                  {['staff', 'faculty', 'viewer'].map(role => (
                    <div key={`role-actions-${role}`} className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-b border-gray-200">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${
                            role === 'staff' ? 'bg-blue-500' :
                            role === 'faculty' ? 'bg-purple-500' :
                            'bg-gray-500'
                          }`}></div>
                          <h3 className="font-semibold text-gray-900 capitalize">{role}</h3>
                          <span className="text-xs text-gray-500">
                            ({Object.values(((rolePermissions[role] || {}).actions || {})).filter(v => v === true).length} actions granted)
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            className="text-xs px-3 py-1 bg-baylor-green text-white rounded hover:bg-baylor-green/90"
                            onClick={() => setActionsForRole(role, actionKeys, true)}
                          >
                            Select All
                          </button>
                          <button 
                            className="text-xs px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                            onClick={() => setActionsForRole(role, actionKeys, false)}
                          >
                            Clear All
                          </button>
                        </div>
                      </div>
                      
                      <div className="p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {ACTION_GROUPS.map(group => (
                            <div key={`${role}-act-${group.name}`} className="bg-gray-50 rounded-lg p-3">
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="text-sm font-semibold text-gray-700">{group.name}</h4>
                                <div className="flex items-center gap-1">
                                  <button 
                                    className="text-xs text-baylor-green hover:underline"
                                    onClick={() => setActionsForRole(role, group.actions, true)}
                                  >
                                    All
                                  </button>
                                  <span className="text-xs text-gray-400">|</span>
                                  <button 
                                    className="text-xs text-gray-500 hover:underline"
                                    onClick={() => setActionsForRole(role, group.actions, false)}
                                  >
                                    None
                                  </button>
                                </div>
                              </div>
                              <div className="space-y-1.5">
                                {group.actions.map(key => (
                                  <label key={`${role}-${key}`} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-white/50 rounded px-2 py-1">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(((rolePermissions[role] || {}).actions || {})[key])}
                                      onChange={() => toggleRoleAction(role, key)}
                                      className="rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
                                    />
                                    <span className="text-gray-700 font-mono text-xs">{key}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Save Button */}
              <div className="flex items-center justify-end pt-4 border-t border-gray-200">
                <button 
                  className="px-6 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  onClick={saveAccessControl}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save Role Permissions'}
                </button>
              </div>
            </div>
          )}

          {/* USER MANAGEMENT TAB */}
          {activeTab === 'users' && (
            <div className="space-y-6">
              {/* Search and User List */}
              <div>
                <div className="flex items-center gap-4 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      className="form-input pl-10 w-full"
                      placeholder="Search users by email..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <div className="text-sm text-gray-600">
                    {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}
                  </div>
                </div>

                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">User</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Roles</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Last Login</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredUsers.map(u => (
                        <tr key={u.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <button 
                              className="text-baylor-green hover:underline font-medium text-sm"
                              onClick={() => selectUser(u.id)}
                            >
                              {u.email}
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              {['viewer','staff','faculty','admin'].map(r => (
                                <label key={`${u.id}-${r}`} className="inline-flex items-center gap-1 text-xs">
                                  <input 
                                    type="checkbox" 
                                    checked={Array.isArray(u.roles) ? u.roles.includes(r) : false}
                                    onChange={() => quickToggleRole(u.id, r)}
                                    className="rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
                                  />
                                  <span className="capitalize text-gray-700">{r}</span>
                                </label>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {u.disabled ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700">
                                <XCircle className="w-3 h-3" />
                                Disabled
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">
                                <CheckCircle className="w-3 h-3" />
                                Active
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {u.lastLoginAt ? new Date(u.lastLoginAt.seconds ? u.lastLoginAt.seconds * 1000 : u.lastLoginAt).toLocaleString() : '-'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <button 
                                className="text-xs px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                                onClick={() => toggleDisable(u.id, !u.disabled)}
                              >
                                {u.disabled ? 'Enable' : 'Disable'}
                              </button>
                              <button 
                                className="text-xs px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
                                onClick={() => openDeleteUserModal(u.id)}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* User Override Panel */}
              {selectedUserId && selectedUser && (
                <div className="border border-baylor-green rounded-lg overflow-hidden">
                  <div className="bg-baylor-green text-white px-4 py-3 flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">User Overrides</h3>
                      <p className="text-sm text-white/80">{selectedUser.email}</p>
                    </div>
                    <button
                      className="px-4 py-2 bg-white text-baylor-green rounded hover:bg-gray-100 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={saveUserOverrides}
                      disabled={saving || (Array.isArray(selectedUser.roles) && selectedUser.roles.includes('admin'))}
                    >
                      {saving ? 'Saving...' : 'Save Overrides'}
                    </button>
                  </div>

                  <div className="p-6 space-y-6">
                    {/* User Roles */}
                    <div>
                      <h4 className="font-medium text-gray-900 mb-3">Roles</h4>
                      <div className="flex items-center gap-4">
                        {['viewer', 'staff', 'faculty', 'admin'].map(role => (
                          <label key={`sel-role-${role}`} className="inline-flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={userRoles.includes(role)}
                              onChange={() => toggleUserRole(role)}
                              className="rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
                            />
                            <span className="capitalize text-sm font-medium text-gray-700">{role}</span>
                          </label>
                        ))}
                      </div>
                      <button 
                        className="mt-3 text-sm px-4 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                        onClick={saveUserRoles}
                        disabled={saving}
                      >
                        Save Roles
                      </button>
                    </div>

                    {/* Admin Notice */}
                    {Array.isArray(selectedUser.roles) && selectedUser.roles.includes('admin') && (
                      <div className="bg-baylor-green/10 border border-baylor-green/30 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                          <Shield className="w-5 h-5 text-baylor-green mt-0.5 flex-shrink-0" />
                          <div>
                            <h4 className="font-semibold text-baylor-green mb-1">Administrator Access</h4>
                            <p className="text-sm text-gray-700">
                              This user has the <strong>Admin</strong> role and automatically has access to all pages and actions. 
                              Overrides are not needed and are disabled below.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Show current role permissions */}
                    {Array.isArray(selectedUser.roles) && !selectedUser.roles.includes('admin') && selectedUser.roles.length > 0 && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                          <div>
                            <h4 className="font-semibold text-blue-900 mb-1">Current Role Permissions</h4>
                            <p className="text-sm text-blue-800 mb-2">
                              This user has the following role{selectedUser.roles.length > 1 ? 's' : ''}: <strong>{selectedUser.roles.join(', ')}</strong>
                            </p>
                            <p className="text-xs text-blue-700">
                              Pages: {(() => {
                                const grantedPages = new Set();
                                selectedUser.roles.forEach(role => {
                                  const rolePages = ((rolePermissions[role] || {}).pages || {});
                                  if (rolePages['*']) {
                                    allPages.forEach(p => grantedPages.add(p));
                                  } else {
                                    Object.entries(rolePages).forEach(([page, val]) => {
                                      if (val === true) grantedPages.add(page);
                                    });
                                  }
                                });
                                return grantedPages.size;
                              })()} granted via role • 
                              Actions: {(() => {
                                const grantedActions = new Set();
                                selectedUser.roles.forEach(role => {
                                  const roleActions = ((rolePermissions[role] || {}).actions || {});
                                  if (roleActions['*']) {
                                    actionKeys.forEach(a => grantedActions.add(a));
                                  } else {
                                    Object.entries(roleActions).forEach(([action, val]) => {
                                      if (val === true) grantedActions.add(action);
                                    });
                                  }
                                });
                                return grantedActions.size;
                              })()} granted via role
                            </p>
                            <p className="text-xs text-blue-700 mt-1">
                              Use overrides below to grant <em>additional</em> permissions beyond what their role provides.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* User Actions */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Key className="w-4 h-4 text-baylor-green" />
                        <h4 className="font-medium text-gray-900">Action Overrides</h4>
                        <span className="text-xs text-gray-500">({Object.values(userActions).filter(v => v === true).length} additional granted)</span>
                        {Array.isArray(selectedUser.roles) && selectedUser.roles.includes('admin') && (
                          <span className="text-xs text-amber-600 font-medium">⚠️ Disabled (Admin role)</span>
                        )}
                      </div>
                      <div className={`bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto baylor-scrollbar ${
                        Array.isArray(selectedUser.roles) && selectedUser.roles.includes('admin') ? 'opacity-50 pointer-events-none' : ''
                      }`}>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {actionKeys.map(key => (
                            <label key={`user-act-${key}`} className="inline-flex items-center gap-2 text-xs cursor-pointer hover:bg-white rounded px-2 py-1">
                              <input 
                                type="checkbox"
                                checked={Boolean(userActions[key])}
                                onChange={() => toggleUserAction(key)}
                                disabled={Array.isArray(selectedUser.roles) && selectedUser.roles.includes('admin')}
                                className="rounded border-gray-300 text-baylor-green focus:ring-baylor-green disabled:opacity-50 disabled:cursor-not-allowed"
                              />
                              <span className="text-gray-700 font-mono">{key}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* User Page Access */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Eye className="w-4 h-4 text-baylor-green" />
                        <h4 className="font-medium text-gray-900">Page Access Overrides</h4>
                        <span className="text-xs text-gray-500">({Object.values(userOverrides).filter(v => v === true).length} additional granted)</span>
                        {Array.isArray(selectedUser.roles) && selectedUser.roles.includes('admin') && (
                          <span className="text-xs text-amber-600 font-medium">⚠️ Disabled (Admin role)</span>
                        )}
                      </div>
                      <div className={`bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto baylor-scrollbar ${
                        Array.isArray(selectedUser.roles) && selectedUser.roles.includes('admin') ? 'opacity-50 pointer-events-none' : ''
                      }`}>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {allPages.map(pid => (
                            <label key={`user-page-${pid}`} className="inline-flex items-center gap-2 text-xs cursor-pointer hover:bg-white rounded px-2 py-1">
                              <input
                                type="checkbox"
                                checked={Boolean(userOverrides[pid])}
                                onChange={() => toggleUserPage(pid)}
                                disabled={Array.isArray(selectedUser.roles) && selectedUser.roles.includes('admin')}
                                className="rounded border-gray-300 text-baylor-green focus:ring-baylor-green disabled:opacity-50 disabled:cursor-not-allowed"
                              />
                              <span className="text-gray-700">{pid}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {!selectedUserId && (
                <div className="text-center py-12 text-gray-500">
                  <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>Select a user from the table above to manage their overrides</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="modal-overlay">
          <div className="modal-content max-w-md">
            <div className="modal-header">
              <div className="flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-600" />
                <h3 className="modal-title">Delete User Profile</h3>
              </div>
            </div>
            <div className="modal-body">
              <p className="text-gray-700 mb-2">This will remove the user's profile document from Firestore:</p>
              <p className="text-gray-900 font-medium bg-gray-100 rounded px-3 py-2">{deleteTarget.email || deleteTarget.id}</p>
              <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-sm text-amber-900">
                  <strong>Note:</strong> This does not delete the Firebase Authentication account. If the user signs in again, a new profile may be created. To block access, use Disable instead.
                </p>
              </div>
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
