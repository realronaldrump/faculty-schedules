/**
 * BuildingManagement - Admin component for managing buildings
 *
 * Provides CRUD operations for buildings including:
 * - Add/edit/delete buildings
 * - Manage building aliases
 * - View spaces in each building
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  Building2,
  Plus,
  Edit2,
  Trash2,
  Save,
  X,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Tag,
  MapPin
} from 'lucide-react';
import { collection, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAppConfig } from '../../contexts/AppConfigContext';
import { useUI } from '../../contexts/UIContext';
import { ConfirmationDialog } from '../CustomAlert';
import { extractSpaceNumber, formatSpaceDisplayName, normalizeSpaceNumber } from '../../utils/locationService';

const BuildingManagement = () => {
  const { buildingConfig, saveBuildingConfig } = useAppConfig();
  const { showNotification } = useUI();

  const [editingBuilding, setEditingBuilding] = useState(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [expandedBuilding, setExpandedBuilding] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form state for editing/creating
  const [formData, setFormData] = useState({
    code: '',
    displayName: '',
    aliases: [],
    isActive: true,
    campus: '',
    address: ''
  });
  const [aliasInput, setAliasInput] = useState('');

  const buildings = useMemo(() => {
    return (buildingConfig?.buildings || []).sort((a, b) =>
      (a.displayName || '').localeCompare(b.displayName || '')
    );
  }, [buildingConfig]);

  const resetForm = useCallback(() => {
    setFormData({
      code: '',
      displayName: '',
      aliases: [],
      isActive: true,
      campus: '',
      address: ''
    });
    setAliasInput('');
    setEditingBuilding(null);
    setIsAddingNew(false);
  }, []);

  const handleEdit = useCallback((building) => {
    setFormData({
      code: building.code || '',
      displayName: building.displayName || '',
      aliases: [...(building.aliases || [])],
      isActive: building.isActive !== false,
      campus: building.campus || '',
      address: building.address || ''
    });
    setEditingBuilding(building.code);
    setIsAddingNew(false);
  }, []);

  const handleAddNew = useCallback(() => {
    resetForm();
    setIsAddingNew(true);
  }, [resetForm]);

  const handleAddAlias = useCallback(() => {
    const alias = aliasInput.trim();
    if (!alias) return;
    if (formData.aliases.includes(alias)) {
      showNotification('warning', 'Duplicate Alias', 'This alias already exists.');
      return;
    }
    setFormData(prev => ({
      ...prev,
      aliases: [...prev.aliases, alias]
    }));
    setAliasInput('');
  }, [aliasInput, formData.aliases, showNotification]);

  const handleRemoveAlias = useCallback((aliasToRemove) => {
    setFormData(prev => ({
      ...prev,
      aliases: prev.aliases.filter(a => a !== aliasToRemove)
    }));
  }, []);

  const validateForm = useCallback(() => {
    if (!formData.code.trim()) {
      showNotification('warning', 'Missing Code', 'Building code is required.');
      return false;
    }
    if (!/^[A-Z0-9_]+$/.test(formData.code.trim().toUpperCase())) {
      showNotification('warning', 'Invalid Code', 'Building code must be uppercase letters, numbers, and underscores only.');
      return false;
    }
    if (!formData.displayName.trim()) {
      showNotification('warning', 'Missing Name', 'Display name is required.');
      return false;
    }
    // Check for duplicate code (when adding new)
    if (isAddingNew) {
      const existingCodes = buildings.map(b => b.code?.toUpperCase());
      if (existingCodes.includes(formData.code.trim().toUpperCase())) {
        showNotification('warning', 'Duplicate Code', 'A building with this code already exists.');
        return false;
      }
    }
    return true;
  }, [formData, isAddingNew, buildings, showNotification]);

  const handleSave = useCallback(async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      const updatedBuilding = {
        code: formData.code.trim().toUpperCase(),
        displayName: formData.displayName.trim(),
        aliases: formData.aliases,
        isActive: formData.isActive,
        campus: formData.campus.trim(),
        address: formData.address.trim()
      };

      const previous = buildings.find(b => b.code === editingBuilding);
      const displayNameChanged = !isAddingNew && previous && previous.displayName !== updatedBuilding.displayName;
      if (displayNameChanged) {
        const normalizedAliases = new Set(updatedBuilding.aliases.map(alias => alias.toLowerCase()));
        const previousName = previous.displayName?.trim();
        if (previousName && !normalizedAliases.has(previousName.toLowerCase())) {
          updatedBuilding.aliases = [...updatedBuilding.aliases, previousName];
        }
      }

      let updatedBuildings;
      if (isAddingNew) {
        updatedBuildings = [...buildings, updatedBuilding];
      } else {
        updatedBuildings = buildings.map(b =>
          b.code === editingBuilding ? updatedBuilding : b
        );
      }

      await saveBuildingConfig({
        ...buildingConfig,
        buildings: updatedBuildings
      });

      if (displayNameChanged) {
        const roomsSnap = await getDocs(query(
          collection(db, 'rooms'),
          where('buildingCode', '==', updatedBuilding.code)
        ));
        if (!roomsSnap.empty) {
          const batch = writeBatch(db);
          roomsSnap.docs.forEach((docSnap) => {
            const room = docSnap.data() || {};
            const rawNumber = room.spaceNumber || room.roomNumber || extractSpaceNumber(room.displayName || room.name || '');
            const spaceNumber = normalizeSpaceNumber(rawNumber);
            const displayName = spaceNumber
              ? formatSpaceDisplayName({
                buildingCode: updatedBuilding.code,
                buildingDisplayName: updatedBuilding.displayName,
                spaceNumber
              })
              : (room.displayName || room.name || '');
            batch.set(docSnap.ref, {
              buildingCode: updatedBuilding.code,
              buildingDisplayName: updatedBuilding.displayName,
              building: updatedBuilding.displayName,
              spaceNumber: spaceNumber || room.spaceNumber || '',
              roomNumber: spaceNumber || room.roomNumber || '',
              displayName,
              name: displayName,
              updatedAt: new Date().toISOString()
            }, { merge: true });
          });
          await batch.commit();
        }
      }

      showNotification('success', 'Building Saved', `${updatedBuilding.displayName} has been saved.`);
      resetForm();
    } catch (error) {
      console.error('Error saving building:', error);
      showNotification('error', 'Save Failed', 'Failed to save building. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [formData, isAddingNew, editingBuilding, buildings, buildingConfig, saveBuildingConfig, validateForm, resetForm, showNotification]);

  const handleDelete = useCallback(async (building) => {
    setSaving(true);
    try {
      const updatedBuildings = buildings.map(b => (
        b.code === building.code
          ? { ...b, isActive: false }
          : b
      ));
      await saveBuildingConfig({
        ...buildingConfig,
        buildings: updatedBuildings
      });
      showNotification('success', 'Building Deactivated', `${building.displayName} has been deactivated.`);
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting building:', error);
      showNotification('error', 'Deactivate Failed', 'Failed to deactivate building. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [buildings, buildingConfig, saveBuildingConfig, showNotification]);

  const toggleExpanded = useCallback((code) => {
    setExpandedBuilding(prev => prev === code ? null : code);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="w-6 h-6 text-baylor-green" />
          <h2 className="text-xl font-semibold text-gray-900">Building Management</h2>
        </div>
        {!isAddingNew && !editingBuilding && (
          <button
            onClick={handleAddNew}
            className="flex items-center gap-2 px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 transition-colors"
          >
            <Plus size={18} />
            Add Building
          </button>
        )}
      </div>

      {/* Add/Edit Form */}
      {(isAddingNew || editingBuilding) && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            {isAddingNew ? 'Add New Building' : 'Edit Building'}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Code */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Building Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                placeholder="e.g., GOEBEL"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-baylor-green/20 focus:border-baylor-green"
                disabled={!!editingBuilding}
              />
              <p className="mt-1 text-xs text-gray-500">Used in space keys (e.g., GOEBEL:101)</p>
            </div>

            {/* Display Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Display Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.displayName}
                onChange={(e) => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
                placeholder="e.g., Goebel"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-baylor-green/20 focus:border-baylor-green"
              />
            </div>

            {/* Campus */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Campus
              </label>
              <input
                type="text"
                value={formData.campus}
                onChange={(e) => setFormData(prev => ({ ...prev, campus: e.target.value }))}
                placeholder="e.g., Main Campus"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-baylor-green/20 focus:border-baylor-green"
              />
            </div>

            {/* Address */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Address
              </label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                placeholder="e.g., 1234 S University Parks Dr"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-baylor-green/20 focus:border-baylor-green"
              />
            </div>

            {/* Active Toggle */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                className="w-4 h-4 text-baylor-green rounded focus:ring-baylor-green"
              />
              <label htmlFor="isActive" className="text-sm font-medium text-gray-700">
                Active Building
              </label>
            </div>
          </div>

          {/* Aliases */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Aliases (alternative names that resolve to this building)
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={aliasInput}
                onChange={(e) => setAliasInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddAlias())}
                placeholder="Add alias (e.g., Goebel Building)"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-baylor-green/20 focus:border-baylor-green"
              />
              <button
                onClick={handleAddAlias}
                className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <Plus size={18} />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.aliases.map((alias, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-baylor-green/10 text-baylor-green rounded-full text-sm"
                >
                  <Tag size={12} />
                  {alias}
                  <button
                    onClick={() => handleRemoveAlias(alias)}
                    className="ml-1 hover:text-red-600"
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
              {formData.aliases.length === 0 && (
                <span className="text-sm text-gray-400 italic">No aliases defined</span>
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
              {saving ? 'Saving...' : 'Save Building'}
            </button>
          </div>
        </div>
      )}

      {/* Buildings List */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <p className="text-sm text-gray-600">
            {buildings.length} building{buildings.length !== 1 ? 's' : ''} configured
          </p>
        </div>

        {buildings.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Building2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>No buildings configured yet.</p>
            <button
              onClick={handleAddNew}
              className="mt-3 text-baylor-green hover:underline"
            >
              Add your first building
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {buildings.map((building) => (
              <div key={building.code} className="hover:bg-gray-50">
                <div
                  className="px-4 py-3 flex items-center justify-between cursor-pointer"
                  onClick={() => toggleExpanded(building.code)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${building.isActive !== false ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <div>
                      <p className="font-medium text-gray-900">{building.displayName}</p>
                      <p className="text-sm text-gray-500">Code: {building.code}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {building.aliases?.length > 0 && (
                      <span className="text-xs text-gray-400">
                        {building.aliases.length} alias{building.aliases.length !== 1 ? 'es' : ''}
                      </span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEdit(building); }}
                      className="p-1.5 text-gray-400 hover:text-baylor-green rounded"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirm(building); }}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                    >
                      <Trash2 size={16} />
                    </button>
                    {expandedBuilding === building.code ? (
                      <ChevronUp size={18} className="text-gray-400" />
                    ) : (
                      <ChevronDown size={18} className="text-gray-400" />
                    )}
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedBuilding === building.code && (
                  <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
                    {building.campus && (
                      <p className="text-sm text-gray-600 mb-1">
                        <MapPin size={14} className="inline mr-1" />
                        {building.campus}
                      </p>
                    )}
                    {building.address && (
                      <p className="text-sm text-gray-600 mb-2">{building.address}</p>
                    )}
                    {building.aliases?.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-medium text-gray-500 mb-1">Aliases:</p>
                        <div className="flex flex-wrap gap-1">
                          {building.aliases.map((alias, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center px-2 py-0.5 bg-white border border-gray-200 rounded text-xs text-gray-600"
                            >
                              {alias}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Deactivate Confirmation */}
      <ConfirmationDialog
        isOpen={!!deleteConfirm}
        title="Deactivate Building"
        message={`Deactivate "${deleteConfirm?.displayName}"? Spaces remain intact, but the building will be hidden from active lists.`}
        confirmLabel="Deactivate"
        confirmVariant="danger"
        onConfirm={() => handleDelete(deleteConfirm)}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
};

export default BuildingManagement;
