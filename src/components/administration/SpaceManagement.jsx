/**
 * SpaceManagement - Admin component for managing spaces (rooms/offices)
 *
 * Provides CRUD operations for spaces including:
 * - Add/edit/delete spaces
 * - Bulk add spaces (e.g., "101-120")
 * - Filter by building/type/usage
 * - View/edit capacity and equipment
 * - Space type assignment
 * - Usage indicators (schedules, offices, temperature)
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
  Users,
  MonitorSpeaker,
  RefreshCw,
  Calendar,
  Briefcase,
  Thermometer,
  ChevronDown,
  ChevronUp,
  Layers
} from 'lucide-react';
import { useData } from '../../contexts/DataContext';
import { useAppConfig } from '../../contexts/AppConfigContext';
import { useUI } from '../../contexts/UIContext';
import { usePeople } from '../../contexts/PeopleContext';
import { ConfirmationDialog } from '../CustomAlert';
import { SPACE_TYPE, buildSpaceKey, formatSpaceDisplayName, normalizeSpaceNumber } from '../../utils/locationService';
import { generateSpaceId, validateSpace } from '../../utils/canonicalSchema';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';

const SpaceManagement = () => {
  const { roomsData, spacesByKey, spacesList, refreshRooms, loadRooms, scheduleData = [] } = useData();
  const { buildingConfig } = useAppConfig();
  const { showNotification } = useUI();
  const { people = [], loadPeople } = usePeople();

  const [searchQuery, setSearchQuery] = useState('');
  const [buildingFilter, setBuildingFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [usageFilter, setUsageFilter] = useState('all'); // all, scheduled, office, unused
  const [editingSpace, setEditingSpace] = useState(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [isBulkAdding, setIsBulkAdding] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showStats, setShowStats] = useState(true);

  // Load rooms and people on mount
  useEffect(() => {
    loadRooms();
    loadPeople();
  }, [loadRooms, loadPeople]);

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

  // Bulk add state
  const [bulkData, setBulkData] = useState({
    buildingCode: '',
    startNumber: '',
    endNumber: '',
    prefix: '',
    suffix: '',
    type: SPACE_TYPE.Classroom
  });

  // Get buildings for dropdown
  const buildings = useMemo(() => {
    return (buildingConfig?.buildings || [])
      .filter(b => b.isActive !== false)
      .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
  }, [buildingConfig]);

  // Calculate usage data for each space
  const spaceUsage = useMemo(() => {
    const usage = {};

    // Check schedules for room usage
    (scheduleData || []).forEach(schedule => {
      const rooms = schedule.spaceIds || schedule.roomIds || [];
      const roomNames = schedule.roomNames || (schedule.Room ? schedule.Room.split(';').map(r => r.trim()) : []);

      // Use spaceIds if available
      rooms.forEach(spaceKey => {
        if (!spaceKey) return;
        if (!usage[spaceKey]) usage[spaceKey] = { scheduled: 0, offices: 0, temperature: false };
        usage[spaceKey].scheduled++;
      });

      // Also track by room name for legacy data
      roomNames.forEach(roomName => {
        if (!roomName) return;
        // Try to find matching space
        const spaces = Array.isArray(spacesList) ? spacesList : Object.values(roomsData || {});
        const match = spaces.find(s =>
          s.displayName === roomName ||
          s.name === roomName ||
          `${s.buildingDisplayName || s.building} ${s.spaceNumber || s.roomNumber}` === roomName
        );
        if (match) {
          const key = match.spaceKey || match.id;
          if (!usage[key]) usage[key] = { scheduled: 0, offices: 0, temperature: false };
          usage[key].scheduled++;
        }
      });
    });

    // Check people for office assignments
    (people || []).forEach(person => {
      const officeIds = person.officeSpaceIds || (person.officeSpaceId ? [person.officeSpaceId] : []);
      officeIds.forEach(spaceKey => {
        if (!spaceKey) return;
        if (!usage[spaceKey]) usage[spaceKey] = { scheduled: 0, offices: 0, temperature: false };
        usage[spaceKey].offices++;
      });
    });

    return usage;
  }, [scheduleData, people, spacesList, roomsData]);

  // Filter and search spaces
  const filteredSpaces = useMemo(() => {
    let spaces = Array.isArray(spacesList) ? [...spacesList] : Object.entries(roomsData || {}).map(([id, data]) => ({
      id,
      ...data
    }));

    // Only show active spaces in management list
    spaces = spaces.filter(s => s.isActive !== false);

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

    // Apply usage filter
    if (usageFilter !== 'all') {
      spaces = spaces.filter(s => {
        const key = s.spaceKey || s.id;
        const usage = spaceUsage[key] || { scheduled: 0, offices: 0 };

        switch (usageFilter) {
          case 'scheduled':
            return usage.scheduled > 0;
          case 'office':
            return usage.offices > 0;
          case 'unused':
            return usage.scheduled === 0 && usage.offices === 0;
          default:
            return true;
        }
      });
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
  }, [roomsData, spacesList, buildingFilter, typeFilter, usageFilter, searchQuery, spaceUsage]);

  // Calculate statistics
  const stats = useMemo(() => {
    const allSpaces = Array.isArray(spacesList) ? spacesList : Object.values(roomsData || {});
    const activeSpaces = allSpaces.filter(s => s.isActive !== false);

    const byType = {};
    Object.values(SPACE_TYPE).forEach(type => { byType[type] = 0; });

    let withSchedules = 0;
    let withOffices = 0;
    let unused = 0;

    activeSpaces.forEach(s => {
      const key = s.spaceKey || s.id;
      const usage = spaceUsage[key] || { scheduled: 0, offices: 0 };

      if (s.type) byType[s.type] = (byType[s.type] || 0) + 1;
      if (usage.scheduled > 0) withSchedules++;
      if (usage.offices > 0) withOffices++;
      if (usage.scheduled === 0 && usage.offices === 0) unused++;
    });

    return {
      total: activeSpaces.length,
      byType,
      withSchedules,
      withOffices,
      unused
    };
  }, [spacesList, roomsData, spaceUsage]);

  // Get unique building codes from actual data
  const dataBuildings = useMemo(() => {
    const codes = new Set();
    const source = Array.isArray(spacesList) && spacesList.length > 0 ? spacesList : Object.values(roomsData || {});
    source.forEach(room => {
      const code = room.buildingCode || room.building;
      if (code) codes.add(code.toUpperCase());
    });
    // Also include buildings from config that aren't in data yet
    buildings.forEach(b => {
      if (b.code) codes.add(b.code.toUpperCase());
    });
    return Array.from(codes).sort();
  }, [roomsData, spacesList, buildings]);

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
    setIsBulkAdding(false);
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
    setIsBulkAdding(false);
  }, []);

  const handleAddNew = useCallback(() => {
    resetForm();
    setIsAddingNew(true);
    setIsBulkAdding(false);
  }, [resetForm]);

  const handleBulkAdd = useCallback(() => {
    setBulkData({
      buildingCode: buildings[0]?.code || '',
      startNumber: '',
      endNumber: '',
      prefix: '',
      suffix: '',
      type: SPACE_TYPE.Classroom
    });
    setIsBulkAdding(true);
    setIsAddingNew(false);
    setEditingSpace(null);
  }, [buildings]);

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
      const spaceNumber = normalizeSpaceNumber(formData.spaceNumber.trim());
      const spaceKey = buildSpaceKey(buildingCode, spaceNumber);
      if (!spaceKey) {
        showNotification('warning', 'Invalid Space', 'Please provide a valid building and space number.');
        return;
      }
      const buildingRecord = buildings.find(b => b.code === buildingCode);
      const buildingDisplayName = buildingRecord?.displayName || buildingCode;
      const buildingId = buildingRecord?.id || buildingCode.toLowerCase();
      const displayName = formatSpaceDisplayName({ buildingCode, buildingDisplayName, spaceNumber });

      if (isAddingNew) {
        const existing = spacesByKey instanceof Map
          ? spacesByKey.get(spaceKey)
          : spacesByKey?.[spaceKey];
        if (existing) {
          showNotification('warning', 'Duplicate Space', `${spaceKey} already exists.`);
          return;
        }
      }

      // Build new space document
      const spaceDoc = {
        // New canonical fields
        spaceKey,
        spaceNumber,
        buildingCode,
        buildingDisplayName,
        buildingId,
        type: formData.type,
        capacity: formData.capacity ? parseInt(formData.capacity, 10) : null,
        equipment: formData.equipment,
        notes: formData.notes.trim(),
        isActive: true,

        // Legacy fields for backward compatibility
        building: buildingDisplayName,
        roomNumber: spaceNumber,
        name: displayName,
        displayName: displayName,

        // Timestamps
        updatedAt: new Date().toISOString()
      };

      const validation = validateSpace(spaceDoc);
      if (!validation.isValid) {
        showNotification('warning', 'Validation Failed', validation.errors.join(' '));
        return;
      }

      let docId;
      if (isAddingNew) {
        docId = generateSpaceId({ buildingCode, spaceNumber }) || spaceKey;
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
  }, [formData, isAddingNew, editingSpace, buildings, validateForm, resetForm, showNotification, refreshRooms, spacesByKey]);

  const handleBulkSave = useCallback(async () => {
    if (!bulkData.buildingCode) {
      showNotification('warning', 'Missing Building', 'Please select a building.');
      return;
    }

    const start = parseInt(bulkData.startNumber, 10);
    const end = parseInt(bulkData.endNumber, 10);

    if (isNaN(start) || isNaN(end)) {
      showNotification('warning', 'Invalid Range', 'Please enter valid start and end numbers.');
      return;
    }

    if (start > end) {
      showNotification('warning', 'Invalid Range', 'Start number must be less than or equal to end number.');
      return;
    }

    if (end - start > 50) {
      showNotification('warning', 'Range Too Large', 'Maximum 50 spaces can be added at once.');
      return;
    }

    setSaving(true);
    try {
      const buildingCode = bulkData.buildingCode.toUpperCase();
      const buildingRecord = buildings.find(b => b.code === buildingCode);
      const buildingDisplayName = buildingRecord?.displayName || buildingCode;
      const buildingId = buildingRecord?.id || buildingCode.toLowerCase();

      const spacesToCreate = [];
      const existingKeys = [];

      for (let num = start; num <= end; num++) {
        const spaceNumber = `${bulkData.prefix}${num}${bulkData.suffix}`.toUpperCase();
        const spaceKey = buildSpaceKey(buildingCode, spaceNumber);

        const existing = spacesByKey instanceof Map
          ? spacesByKey.get(spaceKey)
          : spacesByKey?.[spaceKey];

        if (existing) {
          existingKeys.push(spaceKey);
          continue;
        }

        const displayName = formatSpaceDisplayName({ buildingCode, buildingDisplayName, spaceNumber });
        const docId = generateSpaceId({ buildingCode, spaceNumber }) || spaceKey;

        spacesToCreate.push({
          docId,
          data: {
            spaceKey,
            spaceNumber,
            buildingCode,
            buildingDisplayName,
            buildingId,
            type: bulkData.type,
            capacity: null,
            equipment: [],
            notes: '',
            isActive: true,
            building: buildingDisplayName,
            roomNumber: spaceNumber,
            name: displayName,
            displayName: displayName,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        });
      }

      if (spacesToCreate.length === 0) {
        showNotification('warning', 'No New Spaces', 'All spaces in this range already exist.');
        return;
      }

      // Save all spaces
      for (const space of spacesToCreate) {
        await setDoc(doc(db, 'rooms', space.docId), space.data);
      }

      const message = existingKeys.length > 0
        ? `Created ${spacesToCreate.length} spaces. ${existingKeys.length} already existed.`
        : `Created ${spacesToCreate.length} spaces.`;

      showNotification('success', 'Bulk Add Complete', message);
      resetForm();

      if (refreshRooms) {
        await refreshRooms();
      }
    } catch (error) {
      console.error('Error in bulk add:', error);
      showNotification('error', 'Bulk Add Failed', 'Failed to create spaces. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [bulkData, buildings, spacesByKey, showNotification, resetForm, refreshRooms]);

  const handleDelete = useCallback(async (space) => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'rooms', space.id), {
        isActive: false,
        updatedAt: new Date().toISOString(),
        deletedAt: new Date().toISOString()
      }, { merge: true });
      showNotification('success', 'Space Deactivated', `${space.spaceKey || space.name} has been deactivated.`);
      setDeleteConfirm(null);

      // Refresh rooms data
      if (refreshRooms) {
        await refreshRooms();
      }
    } catch (error) {
      console.error('Error deleting space:', error);
      showNotification('error', 'Deactivate Failed', 'Failed to deactivate space. Please try again.');
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

  const renderUsageIndicators = (space) => {
    const key = space.spaceKey || space.id;
    const usage = spaceUsage[key] || { scheduled: 0, offices: 0 };

    return (
      <div className="flex items-center gap-2">
        {usage.scheduled > 0 && (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-xs"
            title={`${usage.scheduled} scheduled class${usage.scheduled !== 1 ? 'es' : ''}`}
          >
            <Calendar size={10} />
            {usage.scheduled}
          </span>
        )}
        {usage.offices > 0 && (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-50 text-green-700 rounded text-xs"
            title={`${usage.offices} office assignment${usage.offices !== 1 ? 's' : ''}`}
          >
            <Briefcase size={10} />
            {usage.offices}
          </span>
        )}
        {usage.scheduled === 0 && usage.offices === 0 && (
          <span className="text-xs text-gray-400">—</span>
        )}
      </div>
    );
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
          {!isAddingNew && !editingSpace && !isBulkAdding && (
            <>
              <button
                onClick={handleBulkAdd}
                className="flex items-center gap-2 px-4 py-2 border border-baylor-green text-baylor-green rounded-lg hover:bg-baylor-green/5 transition-colors"
              >
                <Layers size={18} />
                Bulk Add
              </button>
              <button
                onClick={handleAddNew}
                className="flex items-center gap-2 px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 transition-colors"
              >
                <Plus size={18} />
                Add Space
              </button>
            </>
          )}
        </div>
      </div>

      {/* Statistics Summary */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <button
          onClick={() => setShowStats(!showStats)}
          className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
        >
          <span className="text-sm font-medium text-gray-700">
            Space Inventory: {stats.total} total spaces
          </span>
          {showStats ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showStats && (
          <div className="p-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-baylor-green">{stats.total}</div>
              <div className="text-xs text-gray-500">Total Spaces</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.withSchedules}</div>
              <div className="text-xs text-gray-500 flex items-center justify-center gap-1">
                <Calendar size={10} /> With Classes
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{stats.withOffices}</div>
              <div className="text-xs text-gray-500 flex items-center justify-center gap-1">
                <Briefcase size={10} /> As Offices
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-400">{stats.unused}</div>
              <div className="text-xs text-gray-500">Unused</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-500">{stats.byType[SPACE_TYPE.Classroom] || 0}</div>
              <div className="text-xs text-gray-500">Classrooms</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-500">{stats.byType[SPACE_TYPE.Office] || 0}</div>
              <div className="text-xs text-gray-500">Offices</div>
            </div>
          </div>
        )}
      </div>

      {/* Bulk Add Form */}
      {isBulkAdding && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Bulk Add Spaces</h3>
          <p className="text-sm text-gray-600 mb-4">
            Add multiple spaces at once by specifying a range of room numbers.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Building */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Building <span className="text-red-500">*</span>
              </label>
              <select
                value={bulkData.buildingCode}
                onChange={(e) => setBulkData(prev => ({ ...prev, buildingCode: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-baylor-green/20 focus:border-baylor-green"
              >
                <option value="">Select building...</option>
                {buildings.map(b => (
                  <option key={b.code} value={b.code}>{b.displayName} ({b.code})</option>
                ))}
              </select>
            </div>

            {/* Start Number */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Number <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={bulkData.startNumber}
                onChange={(e) => setBulkData(prev => ({ ...prev, startNumber: e.target.value }))}
                placeholder="e.g., 101"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-baylor-green/20 focus:border-baylor-green"
              />
            </div>

            {/* End Number */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Number <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={bulkData.endNumber}
                onChange={(e) => setBulkData(prev => ({ ...prev, endNumber: e.target.value }))}
                placeholder="e.g., 120"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-baylor-green/20 focus:border-baylor-green"
              />
            </div>

            {/* Prefix */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Prefix (optional)
              </label>
              <input
                type="text"
                value={bulkData.prefix}
                onChange={(e) => setBulkData(prev => ({ ...prev, prefix: e.target.value }))}
                placeholder="e.g., A or 1"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-baylor-green/20 focus:border-baylor-green"
              />
            </div>

            {/* Suffix */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Suffix (optional)
              </label>
              <input
                type="text"
                value={bulkData.suffix}
                onChange={(e) => setBulkData(prev => ({ ...prev, suffix: e.target.value }))}
                placeholder="e.g., A or B"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-baylor-green/20 focus:border-baylor-green"
              />
            </div>

            {/* Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Space Type
              </label>
              <select
                value={bulkData.type}
                onChange={(e) => setBulkData(prev => ({ ...prev, type: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-baylor-green/20 focus:border-baylor-green"
              >
                {Object.values(SPACE_TYPE).map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Preview */}
          {bulkData.buildingCode && bulkData.startNumber && bulkData.endNumber && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">
                <strong>Preview:</strong> Will create spaces from{' '}
                <span className="font-mono text-baylor-green">
                  {bulkData.buildingCode}:{bulkData.prefix}{bulkData.startNumber}{bulkData.suffix}
                </span>{' '}
                to{' '}
                <span className="font-mono text-baylor-green">
                  {bulkData.buildingCode}:{bulkData.prefix}{bulkData.endNumber}{bulkData.suffix}
                </span>
                {' '}({Math.max(0, parseInt(bulkData.endNumber, 10) - parseInt(bulkData.startNumber, 10) + 1)} spaces)
              </p>
            </div>
          )}

          {/* Form Actions */}
          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={resetForm}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleBulkSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-baylor-green text-white rounded-lg hover:bg-baylor-green/90 transition-colors disabled:opacity-50"
            >
              <Layers size={18} />
              {saving ? 'Creating...' : 'Create Spaces'}
            </button>
          </div>
        </div>
      )}

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

        {/* Usage Filter */}
        <select
          value={usageFilter}
          onChange={(e) => setUsageFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-baylor-green/20 focus:border-baylor-green"
        >
          <option value="all">All Usage</option>
          <option value="scheduled">With Classes</option>
          <option value="office">As Offices</option>
          <option value="unused">Unused</option>
        </select>
      </div>

      {/* Spaces List */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
          <p className="text-sm text-gray-600">
            {filteredSpaces.length} space{filteredSpaces.length !== 1 ? 's' : ''}
            {buildingFilter !== 'all' || typeFilter !== 'all' || usageFilter !== 'all' || searchQuery ? ' (filtered)' : ''}
          </p>
        </div>

        {filteredSpaces.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <DoorOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>
              {searchQuery || buildingFilter !== 'all' || typeFilter !== 'all' || usageFilter !== 'all'
                ? 'No spaces match your filters.'
                : 'No spaces found. Click "Add Space" or "Bulk Add" to create some.'}
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
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Usage</th>
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
                    <td className="px-4 py-3 text-center">
                      {renderUsageIndicators(space)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleEdit(space)}
                        className="p-1.5 text-gray-400 hover:text-baylor-green rounded"
                        title="Edit space"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(space)}
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded ml-1"
                        title="Deactivate space"
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
        message={`Deactivate "${deleteConfirm?.spaceKey || deleteConfirm?.name}"? References will be preserved, but the space will be hidden from active lists.`}
        confirmLabel="Deactivate"
        confirmVariant="danger"
        onConfirm={() => handleDelete(deleteConfirm)}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
};

export default SpaceManagement;
