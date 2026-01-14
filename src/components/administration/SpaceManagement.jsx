/**
 * SpaceManagement - Admin component for managing spaces (rooms/offices)
 *
 * Provides CRUD operations for spaces including:
 * - Add/edit/delete spaces
 * - Filter by building/type
 * - View/edit capacity and equipment
 * - Space type assignment
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  DoorOpen,
  Plus,
  Edit2,
  Trash2,
  Save,
  X,
  Search,
  Filter,
  AlertCircle,
  Users,
  MonitorSpeaker,
  Building2,
  RefreshCw
} from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { useAppConfig } from '../../contexts/AppConfigContext';
import { useUI } from '../../contexts/UIContext';
import { ConfirmationDialog } from '../CustomAlert';
import { SPACE_TYPE, buildSpaceKey } from '../../utils/locationService';
import { generateSpaceId, SPACE_SCHEMA } from '../../utils/canonicalSchema';
import { doc, setDoc, deleteDoc, collection, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';

const SpaceManagement = () => {
  const { roomsData, refreshRooms, loadRooms } = useData();
  const { buildingConfig } = useAppConfig();
  const { showNotification } = useUI();

  const [searchQuery, setSearchQuery] = useState('');
  const [buildingFilter, setBuildingFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [editingSpace, setEditingSpace] = useState(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load rooms on mount
  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  // Form state
  const [formData, setFormData] = useState({
    buildingCode: '',
    spaceNumber: '',
    type: SPACE_TYPE.Classroom,
    capacity: '',
    equipment: [],
    notes: ''
  });
  const [equipmentInput, setEquipmentInput] = useState('');

  // Get buildings for dropdown
  const buildings = useMemo(() => {
    return (buildingConfig?.buildings || [])
      .filter(b => b.isActive !== false)
      .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
  }, [buildingConfig]);

  // Filter and search spaces
  const filteredSpaces = useMemo(() => {
    let spaces = Object.entries(roomsData || {}).map(([id, data]) => ({
      id,
      ...data
    }));

    // Apply building filter
    if (buildingFilter !== 'all') {
      spaces = spaces.filter(s =>
        (s.buildingCode || s.building || '').toUpperCase() === buildingFilter.toUpperCase()
      );
    }

    // Apply type filter
    if (typeFilter !== 'all') {
      spaces = spaces.filter(s => s.type === typeFilter);
    }

    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      spaces = spaces.filter(s =>
        (s.spaceKey || '').toLowerCase().includes(query) ||
        (s.displayName || s.name || '').toLowerCase().includes(query) ||
        (s.spaceNumber || s.roomNumber || '').toLowerCase().includes(query) ||
        (s.building || '').toLowerCase().includes(query)
      );
    }

    // Sort by building, then space number
    return spaces.sort((a, b) => {
      const buildingCompare = (a.buildingCode || a.building || '').localeCompare(b.buildingCode || b.building || '');
      if (buildingCompare !== 0) return buildingCompare;
      return (a.spaceNumber || a.roomNumber || '').localeCompare(b.spaceNumber || b.roomNumber || '', undefined, { numeric: true });
    });
  }, [roomsData, buildingFilter, typeFilter, searchQuery]);

  // Get unique building codes from actual data
  const dataBuildings = useMemo(() => {
    const codes = new Set();
    Object.values(roomsData || {}).forEach(room => {
      const code = room.buildingCode || room.building;
      if (code) codes.add(code.toUpperCase());
    });
    return Array.from(codes).sort();
  }, [roomsData]);

  const resetForm = useCallback(() => {
    setFormData({
      buildingCode: buildings[0]?.code || '',
      spaceNumber: '',
      type: SPACE_TYPE.Classroom,
      capacity: '',
      equipment: [],
      notes: ''
    });
    setEquipmentInput('');
    setEditingSpace(null);
    setIsAddingNew(false);
  }, [buildings]);

  const handleEdit = useCallback((space) => {
    setFormData({
      buildingCode: (space.buildingCode || space.building || '').toUpperCase(),
      spaceNumber: space.spaceNumber || space.roomNumber || '',
      type: space.type || SPACE_TYPE.Classroom,
      capacity: space.capacity || '',
      equipment: [...(space.equipment || [])],
      notes: space.notes || ''
    });
    setEditingSpace(space);
    setIsAddingNew(false);
  }, []);

  const handleAddNew = useCallback(() => {
    resetForm();
    setIsAddingNew(true);
  }, [resetForm]);

  const handleAddEquipment = useCallback(() => {
    const item = equipmentInput.trim();
    if (!item) return;
    if (formData.equipment.includes(item)) {
      showNotification('warning', 'Duplicate Item', 'This equipment item already exists.');
      return;
    }
    setFormData(prev => ({
      ...prev,
      equipment: [...prev.equipment, item]
    }));
    setEquipmentInput('');
  }, [equipmentInput, formData.equipment, showNotification]);

  const handleRemoveEquipment = useCallback((itemToRemove) => {
    setFormData(prev => ({
      ...prev,
      equipment: prev.equipment.filter(e => e !== itemToRemove)
    }));
  }, []);

  const validateForm = useCallback(() => {
    if (!formData.buildingCode) {
      showNotification('warning', 'Missing Building', 'Please select a building.');
      return false;
    }
    if (!formData.spaceNumber.trim()) {
      showNotification('warning', 'Missing Space Number', 'Space number is required.');
      return false;
    }
    return true;
  }, [formData, showNotification]);

  const handleSave = useCallback(async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      const buildingCode = formData.buildingCode.toUpperCase();
      const spaceNumber = formData.spaceNumber.trim();
      const spaceKey = buildSpaceKey(buildingCode, spaceNumber);
      const buildingRecord = buildings.find(b => b.code === buildingCode);

      // Build new space document
      const spaceDoc = {
        // New canonical fields
        spaceKey,
        spaceNumber,
        buildingCode,
        buildingDisplayName: buildingRecord?.displayName || buildingCode,
        type: formData.type,
        capacity: formData.capacity ? parseInt(formData.capacity, 10) : null,
        equipment: formData.equipment,
        notes: formData.notes.trim(),
        isActive: true,

        // Legacy fields for backward compatibility
        building: buildingRecord?.displayName || buildingCode,
        roomNumber: spaceNumber,
        name: `${buildingRecord?.displayName || buildingCode} ${spaceNumber}`,
        displayName: `${buildingRecord?.displayName || buildingCode} ${spaceNumber}`,

        // Timestamps
        updatedAt: new Date().toISOString()
      };

      let docId;
      if (isAddingNew) {
        docId = generateSpaceId(buildingCode, spaceNumber);
        spaceDoc.createdAt = new Date().toISOString();
      } else {
        docId = editingSpace.id;
      }

      await setDoc(doc(db, 'rooms', docId), spaceDoc, { merge: true });

      showNotification('success', 'Space Saved', `${spaceKey} has been saved.`);
      resetForm();

      // Refresh rooms data
      if (refreshRooms) {
        await refreshRooms();
      }
    } catch (error) {
      console.error('Error saving space:', error);
      showNotification('error', 'Save Failed', 'Failed to save space. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [formData, isAddingNew, editingSpace, buildings, validateForm, resetForm, showNotification, refreshRooms]);

  const handleDelete = useCallback(async (space) => {
    setSaving(true);
    try {
      await deleteDoc(doc(db, 'rooms', space.id));
      showNotification('success', 'Space Deleted', `${space.spaceKey || space.name} has been deleted.`);
      setDeleteConfirm(null);

      // Refresh rooms data
      if (refreshRooms) {
        await refreshRooms();
      }
    } catch (error) {
      console.error('Error deleting space:', error);
      showNotification('error', 'Delete Failed', 'Failed to delete space. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [showNotification, refreshRooms]);

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    try {
      if (refreshRooms) {
        await refreshRooms();
      }
      showNotification('success', 'Refreshed', 'Spaces data has been refreshed.');
    } catch (error) {
      showNotification('error', 'Refresh Failed', 'Failed to refresh spaces data.');
    } finally {
      setLoading(false);
    }
  }, [refreshRooms, showNotification]);

  const getSpaceTypeColor = (type) => {
    switch (type) {
      case SPACE_TYPE.Classroom: return 'bg-blue-100 text-blue-800';
      case SPACE_TYPE.Office: return 'bg-green-100 text-green-800';
      case SPACE_TYPE.Lab: return 'bg-purple-100 text-purple-800';
      case SPACE_TYPE.Studio: return 'bg-orange-100 text-orange-800';
      case SPACE_TYPE.Conference: return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <DoorOpen className="w-6 h-6 text-baylor-green" />
          <h2 className="text-xl font-semibold text-gray-900">Space Management</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          {!isAddingNew && !editingSpace && (
            <button
              onClick={handleAddNew}
              className="flex items-center gap-2 px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 transition-colors"
            >
              <Plus size={18} />
              Add Space
            </button>
          )}
        </div>
      </div>

      {/* Add/Edit Form */}
      {(isAddingNew || editingSpace) && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            {isAddingNew ? 'Add New Space' : `Edit Space: ${editingSpace?.spaceKey || editingSpace?.name}`}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Building */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Building <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.buildingCode}
                onChange={(e) => setFormData(prev => ({ ...prev, buildingCode: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-baylor-green/20 focus:border-baylor-green"
                disabled={!!editingSpace}
              >
                <option value="">Select building...</option>
                {buildings.map(b => (
                  <option key={b.code} value={b.code}>{b.displayName} ({b.code})</option>
                ))}
              </select>
            </div>

            {/* Space Number */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Space Number <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.spaceNumber}
                onChange={(e) => setFormData(prev => ({ ...prev, spaceNumber: e.target.value }))}
                placeholder="e.g., 101 or 101A"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-baylor-green/20 focus:border-baylor-green"
                disabled={!!editingSpace}
              />
            </div>

            {/* Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Space Type
              </label>
              <select
                value={formData.type}
                onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-baylor-green/20 focus:border-baylor-green"
              >
                {Object.values(SPACE_TYPE).map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            {/* Capacity */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Capacity
              </label>
              <input
                type="number"
                value={formData.capacity}
                onChange={(e) => setFormData(prev => ({ ...prev, capacity: e.target.value }))}
                placeholder="e.g., 30"
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-baylor-green/20 focus:border-baylor-green"
              />
            </div>

            {/* Notes */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <input
                type="text"
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="e.g., Requires keycard access"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-baylor-green/20 focus:border-baylor-green"
              />
            </div>
          </div>

          {/* Equipment */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Equipment
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={equipmentInput}
                onChange={(e) => setEquipmentInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddEquipment())}
                placeholder="Add equipment (e.g., Projector, Whiteboard)"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-baylor-green/20 focus:border-baylor-green"
              />
              <button
                onClick={handleAddEquipment}
                className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <Plus size={18} />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.equipment.map((item, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-sm"
                >
                  <MonitorSpeaker size={12} />
                  {item}
                  <button
                    onClick={() => handleRemoveEquipment(item)}
                    className="ml-1 hover:text-red-600"
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
              {formData.equipment.length === 0 && (
                <span className="text-sm text-gray-400 italic">No equipment listed</span>
              )}
            </div>
          </div>

          {/* Form Actions */}
          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={resetForm}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 transition-colors disabled:opacity-50"
            >
              <Save size={18} />
              {saving ? 'Saving...' : 'Save Space'}
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search spaces..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-baylor-green/20 focus:border-baylor-green"
          />
        </div>

        {/* Building Filter */}
        <select
          value={buildingFilter}
          onChange={(e) => setBuildingFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-baylor-green/20 focus:border-baylor-green"
        >
          <option value="all">All Buildings</option>
          {dataBuildings.map(code => {
            const building = buildings.find(b => b.code === code);
            return (
              <option key={code} value={code}>
                {building?.displayName || code}
              </option>
            );
          })}
        </select>

        {/* Type Filter */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-baylor-green/20 focus:border-baylor-green"
        >
          <option value="all">All Types</option>
          {Object.values(SPACE_TYPE).map(type => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
      </div>

      {/* Spaces List */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
          <p className="text-sm text-gray-600">
            {filteredSpaces.length} space{filteredSpaces.length !== 1 ? 's' : ''}
            {buildingFilter !== 'all' || typeFilter !== 'all' || searchQuery ? ' (filtered)' : ''}
          </p>
        </div>

        {filteredSpaces.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <DoorOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>
              {searchQuery || buildingFilter !== 'all' || typeFilter !== 'all'
                ? 'No spaces match your filters.'
                : 'No spaces found.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Space Key</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Building</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Number</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Capacity</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredSpaces.map((space) => (
                  <tr key={space.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm text-baylor-green">
                        {space.spaceKey || `${space.buildingCode || space.building}:${space.spaceNumber || space.roomNumber}`}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {space.buildingDisplayName || space.building}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {space.spaceNumber || space.roomNumber}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${getSpaceTypeColor(space.type)}`}>
                        {space.type || 'Unknown'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-600">
                      {space.capacity ? (
                        <span className="flex items-center justify-center gap-1">
                          <Users size={14} />
                          {space.capacity}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleEdit(space)}
                        className="p-1.5 text-gray-400 hover:text-baylor-green rounded"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(space)}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded ml-1"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation */}
      <ConfirmationDialog
        isOpen={!!deleteConfirm}
        title="Delete Space"
        message={`Are you sure you want to delete "${deleteConfirm?.spaceKey || deleteConfirm?.name}"? Schedules referencing this space may need to be updated.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={() => handleDelete(deleteConfirm)}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
};

export default SpaceManagement;
