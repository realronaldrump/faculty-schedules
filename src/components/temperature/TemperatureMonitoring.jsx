import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  FileUp,
  History,
  Image as ImageIcon,
  LayoutGrid,
  Map as MapIcon,
  Pencil,
  Save,
  Thermometer,
  Trash2,
  X
} from 'lucide-react';
import Papa from 'papaparse';
import { v4 as uuidv4 } from 'uuid';
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  serverTimestamp,
  deleteDoc,
  orderBy,
  limit
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useData } from '../../contexts/DataContext.jsx';
import { useUI } from '../../contexts/UIContext.jsx';
import { resolveBuildingDisplayName } from '../../utils/locationService';
import { resolveSpaceDisplayName } from '../../utils/spaceUtils';
import { formatMinutesToLabel, formatMinutesToTime, parseTime } from '../../utils/timeUtils';
import {
  detectGoveeCsvColumns,
  extractRoomTokens,
  formatDateInTimeZone,
  getMinutesSinceMidnight,
  normalizeMatchText,
  normalizeRoomNumber,
  parseDeviceLabelFromFilename,
  parseLocalTimestamp,
  toBuildingKey,
  toDateKey,
  toDeviceDayId,
  toDeviceId,
  toSnapshotDocId,
  zonedTimeToUtc
} from '../../utils/temperatureUtils';
import ConfirmDialog from '../shared/ConfirmDialog';

const DEFAULT_TIMEZONE = 'America/Chicago';
const AUTO_MATCH_THRESHOLD = 0.85;
const DEFAULT_SNAPSHOT_TIMES = [
  { label: '8:30 AM', minutes: 8 * 60 + 30, toleranceMinutes: 15 },
  { label: '4:30 PM', minutes: 16 * 60 + 30, toleranceMinutes: 15 }
];

const buildDefaultSettings = ({ buildingCode, buildingName }) => ({
  buildingCode,
  buildingName,
  timezone: DEFAULT_TIMEZONE,
  snapshotTimes: DEFAULT_SNAPSHOT_TIMES.map((slot) => ({
    id: uuidv4(),
    ...slot
  })),
  floorplan: null,
  markers: {}
});

const sortRooms = (a, b) => {
  const aNum = parseInt(a.spaceNumber || a.roomNumber || '', 10);
  const bNum = parseInt(b.spaceNumber || b.roomNumber || '', 10);
  if (!Number.isNaN(aNum) && !Number.isNaN(bNum) && aNum !== bNum) {
    return aNum - bNum;
  }
  return (a.displayName || a.name || '').localeCompare(b.displayName || b.name || '', undefined, { numeric: true });
};

const getRoomLabel = (room, spacesByKey) => {
  if (!room) return 'Unknown';
  const key = room.spaceKey || room.id || '';
  const resolved = key ? resolveSpaceDisplayName(key, spacesByKey) : '';
  return resolved || room.displayName || room.name || room.roomNumber || room.id || 'Unknown';
};

const toCsvSafe = (value) => {
  const str = value == null ? '' : String(value);
  return `"${str.replace(/"/g, '""')}"`;
};

const isValidTimeZone = (timeZone) => {
  if (!timeZone) return false;
  try {
    Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return true;
  } catch (_) {
    return false;
  }
};

const TemperatureMonitoring = () => {
  const { isAdmin, loading: authLoading, user } = useAuth();
  const { spacesList = [], spacesByKey, roomsLoading } = useData();
  const { showNotification } = useUI();
  const mapRef = useRef(null);
  const dragStateRef = useRef(null);

  const [selectedBuilding, setSelectedBuilding] = useState('');
  const [buildingSettings, setBuildingSettings] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsExists, setSettingsExists] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSnapshotId, setSelectedSnapshotId] = useState('');
  const [viewMode, setViewMode] = useState('floorplan');
  const [snapshotDocs, setSnapshotDocs] = useState([]);
  const [hiddenBuildingCodes, setHiddenBuildingCodes] = useState(new Set());
  const [showHidden, setShowHidden] = useState(false);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [deviceDocs, setDeviceDocs] = useState({});
  const [importHistory, setImportHistory] = useState([]);

  const [importItems, setImportItems] = useState([]);
  const [importing, setImporting] = useState(false);
  const [mappingOverrides, setMappingOverrides] = useState({});
  const [pendingMappings, setPendingMappings] = useState([]);

  const [editingPositions, setEditingPositions] = useState(false);
  const [markerDrafts, setMarkerDrafts] = useState({});
  const [activePlacementRoomId, setActivePlacementRoomId] = useState('');

  const [newSnapshotTime, setNewSnapshotTime] = useState('');
  const [newSnapshotTolerance, setNewSnapshotTolerance] = useState(15);

  const [historicalStart, setHistoricalStart] = useState('');
  const [historicalEnd, setHistoricalEnd] = useState('');
  const [historicalRoomId, setHistoricalRoomId] = useState('');
  const [historicalDocs, setHistoricalDocs] = useState([]);
  const [historicalLoading, setHistoricalLoading] = useState(false);
  const [buildingIsHidden, setBuildingIsHidden] = useState(false);

  const [exportStart, setExportStart] = useState('');
  const [exportEnd, setExportEnd] = useState('');
  const [exportRoomIds, setExportRoomIds] = useState([]);
  const [exportSnapshotIds, setExportSnapshotIds] = useState([]);
  const [exporting, setExporting] = useState(false);

  const [recomputeStart, setRecomputeStart] = useState('');
  const [recomputeEnd, setRecomputeEnd] = useState('');
  const [recomputing, setRecomputing] = useState(false);

  const [showDeleteFloorplanConfirm, setShowDeleteFloorplanConfirm] = useState(false);

  const formatSnapshotTemp = (snapshot) => {
    if (!snapshot || snapshot.status === 'missing') return 'No data';
    if (snapshot.temperatureF != null) return `${Math.round(snapshot.temperatureF)} F`;
    if (snapshot.temperatureC != null) return `${Math.round(snapshot.temperatureC)} C`;
    return 'No data';
  };

  const normalizeMarkerMap = (markers = {}) => {
    if (!markers || typeof markers !== 'object') return {};
    const next = {};
    Object.entries(markers).forEach(([key, value]) => {
      if (!key) return;
      const direct = roomLookup[key] || (spacesByKey instanceof Map ? spacesByKey.get(key) : null);
      if (direct) {
        next[key] = value;
        return;
      }
      const byId = spacesList.find((room) => room.id === key);
      if (byId?.spaceKey) {
        next[byId.spaceKey] = value;
        return;
      }
      next[key] = value;
    });
    return next;
  };

  const roomsByBuilding = useMemo(() => {
    const grouped = {};
    (spacesList || []).forEach((room) => {
      if (room?.isActive === false) return;
      const buildingCode = (room.buildingCode || room.building || '').toString().trim().toUpperCase();
      if (!buildingCode) return;
      if (buildingCode.toLowerCase() === 'online' || buildingCode.toLowerCase() === 'off campus') return;
      if (!grouped[buildingCode]) grouped[buildingCode] = [];
      grouped[buildingCode].push(room);
    });
    Object.keys(grouped).forEach((key) => {
      grouped[key].sort(sortRooms);
    });
    return grouped;
  }, [spacesList]);

  const buildingOptions = useMemo(() => {
    return Object.keys(roomsByBuilding)
      .filter(code => showHidden || !hiddenBuildingCodes.has(code) || code === selectedBuilding)
      .map((code) => ({
        code,
        name: resolveBuildingDisplayName(code) || code
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [roomsByBuilding, hiddenBuildingCodes, showHidden, selectedBuilding]);

  const buildingList = useMemo(() => buildingOptions.map((item) => item.code), [buildingOptions]);

  const selectedBuildingName = useMemo(() => (
    selectedBuilding ? (resolveBuildingDisplayName(selectedBuilding) || selectedBuilding) : ''
  ), [selectedBuilding]);

  const roomsForBuilding = useMemo(() => {
    return roomsByBuilding[selectedBuilding] || [];
  }, [roomsByBuilding, selectedBuilding]);

  const roomLookup = useMemo(() => {
    const lookup = {};
    roomsForBuilding.forEach((room) => {
      const key = room.spaceKey || room.id;
      if (key) lookup[key] = room;
    });
    return lookup;
  }, [roomsForBuilding]);

  const snapshotTimes = buildingSettings?.snapshotTimes || [];

  const snapshotLookup = useMemo(() => {
    const map = {};
    snapshotDocs.forEach((docData) => {
      const roomId = docData.spaceKey || docData.roomId;
      if (!roomId) return;
      if (!map[roomId]) map[roomId] = {};
      map[roomId][docData.snapshotTimeId] = docData;
    });
    return map;
  }, [snapshotDocs]);

  const hasUnresolvedMappings = useMemo(() => {
    return pendingMappings.some((item) => !mappingOverrides[item.deviceId] && !item.suggestedRoomId);
  }, [pendingMappings, mappingOverrides]);

  const importSummary = useMemo(() => {
    const summary = {
      fileCount: importItems.length,
      deviceCount: 0,
      totalRows: 0,
      parsedRows: 0,
      duplicateCount: 0,
      errorCount: 0,
      readyCount: 0
    };
    const deviceIds = new Set();
    importItems.forEach((item) => {
      summary.totalRows += item.rowCount ?? 0;
      summary.parsedRows += item.parsedCount ?? 0;
      summary.errorCount += item.errorCount ?? 0;
      if (item.duplicate) summary.duplicateCount += 1;
      if (item.deviceId) deviceIds.add(item.deviceId);
      if (!item.duplicate && (item.errorCount ?? 0) === 0 && (item.parsedCount ?? 0) > 0) {
        summary.readyCount += 1;
      }
    });
    summary.deviceCount = deviceIds.size;
    return summary;
  }, [importItems]);

  useEffect(() => {
    if (!selectedBuilding && buildingList.length > 0) {
      setSelectedBuilding(buildingList[0]);
    }
  }, [buildingList, selectedBuilding]);

  useEffect(() => {
    if (!isAdmin) return;
    const fetchHidden = async () => {
      try {
        const q = query(collection(db, 'temperatureBuildingSettings'), where('hidden', '==', true));
        const snap = await getDocs(q);
        const codes = new Set(snap.docs.map(d => d.data().buildingCode));
        setHiddenBuildingCodes(codes);
      } catch (err) {
        console.error('Error fetching hidden buildings:', err);
      }
    };
    fetchHidden();
  }, [isAdmin]);

  useEffect(() => {
    if (!selectedBuilding) return;
    setImportItems([]);
    setPendingMappings([]);
    setMappingOverrides({});
    setExportRoomIds([]);
    setExportSnapshotIds([]);
    setHistoricalRoomId('');
    setHistoricalDocs([]);
  }, [selectedBuilding]);

  useEffect(() => {
    if (authLoading || !user) return;
    if (!selectedBuilding) return;
    let active = true;

    const loadSettings = async () => {
      setSettingsLoading(true);
      try {
        const buildingName = resolveBuildingDisplayName(selectedBuilding) || selectedBuilding;
        const buildingKey = toBuildingKey(selectedBuilding);
        const legacyKey = toBuildingKey(buildingName);
        let snap = await getDoc(doc(db, 'temperatureBuildingSettings', buildingKey));
        let usedLegacy = false;
        if (!snap.exists() && legacyKey !== buildingKey) {
          const legacySnap = await getDoc(doc(db, 'temperatureBuildingSettings', legacyKey));
          if (legacySnap.exists()) {
            snap = legacySnap;
            usedLegacy = true;
          }
        }
        if (!active) return;
        if (snap.exists()) {
          const data = snap.data();
          const defaultTimes = buildDefaultSettings({ buildingCode: selectedBuilding, buildingName }).snapshotTimes;
          const nextTimes = Array.isArray(data.snapshotTimes) && data.snapshotTimes.length > 0
            ? data.snapshotTimes
            : defaultTimes;
          const nextSettings = {
            ...data,
            buildingCode: selectedBuilding,
            buildingName,
            snapshotTimes: [...nextTimes].sort((a, b) => (a.minutes || 0) - (b.minutes || 0)),
            markers: normalizeMarkerMap(data.markers || {})
          };
          setBuildingSettings(nextSettings);
          setBuildingIsHidden(data.hidden === true);
          setSettingsExists(true);
          if (usedLegacy && isAdmin) {
            await setDoc(doc(db, 'temperatureBuildingSettings', buildingKey), {
              ...nextSettings,
              migratedFrom: legacyKey,
              updatedAt: new Date().toISOString()
            }, { merge: true });
          }
        } else {
          setBuildingSettings(buildDefaultSettings({ buildingCode: selectedBuilding, buildingName }));
          setBuildingIsHidden(false);
          setSettingsExists(false);
        }
      } catch (error) {
        console.error('Error loading temperature settings:', error);
        showNotification('error', 'Settings Load Failed', 'Unable to load temperature settings for this building.');
        const buildingName = resolveBuildingDisplayName(selectedBuilding) || selectedBuilding;
        setBuildingSettings(buildDefaultSettings({ buildingCode: selectedBuilding, buildingName }));
        setBuildingIsHidden(false);
        setSettingsExists(false);
      } finally {
        if (active) setSettingsLoading(false);
      }
    };

    const loadImportHistory = async () => {
      try {
        const buildingKey = toBuildingKey(selectedBuilding);
        const q = query(
          collection(db, 'temperatureImports'),
          where('_id', '>=', buildingKey),
          where('_id', '<=', buildingKey + '\uf8ff'),
          limit(20)
        );
        const snap = await getDocs(q);
        const items = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => new Date(b.createdAt?.seconds * 1000) - new Date(a.createdAt?.seconds * 1000));
        setImportHistory(items);
      } catch (err) {
        console.error('Failed to load history', err);
      }
    };

    loadSettings();
    if (isAdmin) loadImportHistory();

    return () => {
      active = false;
    };
  }, [selectedBuilding, showNotification, authLoading, user, isAdmin]);

  useEffect(() => {
    if (!selectedDate && buildingSettings?.timezone) {
      setSelectedDate(formatDateInTimeZone(new Date(), buildingSettings.timezone));
    }
  }, [buildingSettings?.timezone, selectedDate]);

  useEffect(() => {
    if (snapshotTimes.length === 0) return;
    const exists = snapshotTimes.some((slot) => slot.id === selectedSnapshotId);
    if (!selectedSnapshotId || !exists) {
      setSelectedSnapshotId(snapshotTimes[0].id);
    }
  }, [selectedSnapshotId, snapshotTimes]);

  useEffect(() => {
    if (authLoading || !user) return;
    if (!selectedBuilding) return;
    let active = true;
    const loadDevices = async () => {
      try {
        const buildingName = resolveBuildingDisplayName(selectedBuilding) || selectedBuilding;
        let snap = await getDocs(query(
          collection(db, 'temperatureDevices'),
          where('buildingCode', '==', selectedBuilding)
        ));
        const usedLegacy = snap.empty && buildingName;
        if (usedLegacy) {
          snap = await getDocs(query(
            collection(db, 'temperatureDevices'),
            where('buildingName', '==', buildingName)
          ));
        }
        if (!active) return;
        const map = {};
        snap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          map[docSnap.id] = { id: docSnap.id, ...data };
          if (usedLegacy && isAdmin) {
            setDoc(docSnap.ref, {
              buildingCode: selectedBuilding,
              buildingName
            }, { merge: true }).catch(() => null);
          }
        });
        setDeviceDocs(map);
      } catch (error) {
        console.error('Error loading devices:', error);
      }
    };
    loadDevices();
    return () => {
      active = false;
    };
  }, [selectedBuilding, authLoading, user, isAdmin]);

  useEffect(() => {
    if (authLoading || !user) return;
    if (!selectedBuilding || !selectedDate) return;
    let active = true;
    const loadSnapshots = async () => {
      setSnapshotLoading(true);
      try {
        const buildingName = resolveBuildingDisplayName(selectedBuilding) || selectedBuilding;
        let snap = await getDocs(query(
          collection(db, 'temperatureRoomSnapshots'),
          where('buildingCode', '==', selectedBuilding),
          where('dateLocal', '==', selectedDate)
        ));
        const usedLegacy = snap.empty && buildingName;
        if (usedLegacy) {
          snap = await getDocs(query(
            collection(db, 'temperatureRoomSnapshots'),
            where('buildingName', '==', buildingName),
            where('dateLocal', '==', selectedDate)
          ));
        }
        if (!active) return;
        const items = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        if (usedLegacy && isAdmin) {
          items.forEach((docData) => {
            if (!docData?.id) return;
            setDoc(doc(db, 'temperatureRoomSnapshots', docData.id), {
              buildingCode: selectedBuilding,
              buildingName
            }, { merge: true }).catch(() => null);
          });
        }
        setSnapshotDocs(items);
      } catch (error) {
        console.error('Error loading snapshots:', error);
        showNotification('error', 'Snapshot Load Failed', 'Unable to load temperature snapshots for this date.');
      } finally {
        if (active) setSnapshotLoading(false);
      }
    };
    loadSnapshots();
    return () => {
      active = false;
    };
  }, [selectedBuilding, selectedDate, showNotification, authLoading, user, isAdmin]);

  useEffect(() => {
    if (!selectedBuilding) return;
    const today = formatDateInTimeZone(new Date(), buildingSettings?.timezone || DEFAULT_TIMEZONE);
    if (!historicalStart) setHistoricalStart(today);
    if (!historicalEnd) setHistoricalEnd(today);
    if (!exportStart) setExportStart(today);
    if (!exportEnd) setExportEnd(today);
    if (!recomputeStart) setRecomputeStart(today);
    if (!recomputeEnd) setRecomputeEnd(today);
  }, [
    selectedBuilding,
    buildingSettings?.timezone,
    historicalStart,
    historicalEnd,
    exportStart,
    exportEnd,
    recomputeStart,
    recomputeEnd
  ]);

  const updateMarkerDraft = (roomId, xPct, yPct) => {
    setMarkerDrafts((prev) => ({
      ...prev,
      [roomId]: {
        xPct: Math.max(0, Math.min(100, xPct)),
        yPct: Math.max(0, Math.min(100, yPct))
      }
    }));
  };

  const handleMarkerPointerDown = (roomId, event) => {
    if (!editingPositions || !mapRef.current) return;
    event.preventDefault();
    const rect = mapRef.current.getBoundingClientRect();
    dragStateRef.current = {
      roomId,
      rect
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handlePointerMove = (event) => {
    const state = dragStateRef.current;
    if (!state || !mapRef.current) return;
    const { rect, roomId } = state;
    const xPct = ((event.clientX - rect.left) / rect.width) * 100;
    const yPct = ((event.clientY - rect.top) / rect.height) * 100;
    updateMarkerDraft(roomId, xPct, yPct);
  };

  const handlePointerUp = () => {
    dragStateRef.current = null;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
  };

  const handleMapClick = (event) => {
    if (!editingPositions || !activePlacementRoomId || !mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    const xPct = ((event.clientX - rect.left) / rect.width) * 100;
    const yPct = ((event.clientY - rect.top) / rect.height) * 100;
    updateMarkerDraft(activePlacementRoomId, xPct, yPct);
    setActivePlacementRoomId('');
  };

  const startEditingPositions = () => {
    setEditingPositions(true);
    setMarkerDrafts(buildingSettings?.markers || {});
    setActivePlacementRoomId('');
  };

  const cancelEditingPositions = () => {
    setEditingPositions(false);
    setMarkerDrafts({});
    setActivePlacementRoomId('');
  };

  const saveMarkerPositions = async () => {
    if (!selectedBuilding || !isAdmin) return;
    try {
      const buildingKey = toBuildingKey(selectedBuilding);
      await setDoc(doc(db, 'temperatureBuildingSettings', buildingKey), {
        buildingCode: selectedBuilding,
        buildingName: selectedBuildingName || selectedBuilding,
        markers: markerDrafts,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setBuildingSettings((prev) => ({
        ...prev,
        markers: markerDrafts
      }));
      setEditingPositions(false);
      showNotification('success', 'Marker Positions Saved', 'Floorplan markers updated successfully.');
    } catch (error) {
      console.error('Error saving marker positions:', error);
      showNotification('error', 'Save Failed', 'Unable to save floorplan markers.');
    }
  };

  const handleFloorplanUpload = async (file) => {
    if (!file || !selectedBuilding || !isAdmin) return;

    // specific check for Firestore document size limit (approx 1MB minus metadata)
    if (file.size > 900 * 1024) {
      showNotification('error', 'File Too Large', 'For database storage, image must be under 900KB. Please compress the PNG.');
      return;
    }

    try {
      const { base64, width, height } = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            resolve({
              base64: e.target.result,
              width: img.width,
              height: img.height
            });
          };
          img.onerror = () => reject(new Error('Invalid image file.'));
          img.src = e.target.result;
        };
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
      });

      const buildingKey = toBuildingKey(selectedBuilding);

      // Store directly in Firestore structure
      const floorplan = {
        storagePath: null, // No external storage used
        downloadUrl: base64, // Data URL serves as the source
        width,
        height,
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'temperatureBuildingSettings', buildingKey), {
        buildingCode: selectedBuilding,
        buildingName: selectedBuildingName || selectedBuilding,
        floorplan,
        updatedAt: serverTimestamp()
      }, { merge: true });

      setBuildingSettings((prev) => ({
        ...prev,
        floorplan
      }));
      showNotification('success', 'Floorplan Saved', 'Floorplan saved directly to database.');
    } catch (error) {
      console.error('Error saving floorplan:', error);
      showNotification('error', 'Save Failed', 'Unable to save floorplan to database.');
    }
  };

  const handleDeleteFloorplan = () => {
    if (!selectedBuilding || !isAdmin) return;
    setShowDeleteFloorplanConfirm(true);
  };

  const confirmDeleteFloorplan = async () => {
    setShowDeleteFloorplanConfirm(false);
    try {
      const buildingKey = toBuildingKey(selectedBuilding);
      await setDoc(doc(db, 'temperatureBuildingSettings', buildingKey), {
        floorplan: null,
        updatedAt: serverTimestamp()
      }, { merge: true });

      setBuildingSettings((prev) => ({
        ...prev,
        floorplan: null
      }));
      showNotification('success', 'Floorplan Deleted', 'Floorplan has been removed.');
    } catch (error) {
      console.error('Error deleting floorplan:', error);
      showNotification('error', 'Delete Failed', 'Unable to delete floorplan.');
    }
  };

  const handleAddSnapshotTime = () => {
    const minutes = parseTime(newSnapshotTime);
    if (minutes == null) {
      showNotification('error', 'Invalid Time', 'Use a format like "8:30 AM".');
      return;
    }
    const tolerance = Number(newSnapshotTolerance) || 0;
    const nextTimes = [
      ...(buildingSettings?.snapshotTimes || []),
      {
        id: uuidv4(),
        label: formatMinutesToTime(minutes),
        minutes,
        toleranceMinutes: tolerance
      }
    ].sort((a, b) => a.minutes - b.minutes);
    setBuildingSettings((prev) => ({ ...prev, snapshotTimes: nextTimes }));
    setNewSnapshotTime('');
    setNewSnapshotTolerance(15);
  };

  const handleUpdateSnapshotTime = (id, updates) => {
    const nextTimes = (buildingSettings?.snapshotTimes || []).map((slot) =>
      slot.id === id ? { ...slot, ...updates } : slot
    ).sort((a, b) => a.minutes - b.minutes);
    setBuildingSettings((prev) => ({ ...prev, snapshotTimes: nextTimes }));
  };

  const handleRemoveSnapshotTime = (id) => {
    const nextTimes = (buildingSettings?.snapshotTimes || []).filter((slot) => slot.id !== id);
    setBuildingSettings((prev) => ({ ...prev, snapshotTimes: nextTimes }));
    if (selectedSnapshotId === id && nextTimes.length > 0) {
      setSelectedSnapshotId(nextTimes[0].id);
    }
  };

  const saveBuildingSettings = async () => {
    if (!selectedBuilding || !buildingSettings || !isAdmin) return;
    if (!isValidTimeZone(buildingSettings.timezone || DEFAULT_TIMEZONE)) {
      showNotification('error', 'Invalid Timezone', 'Please enter a valid IANA timezone (e.g., America/Chicago).');
      return;
    }
    try {
      const buildingKey = toBuildingKey(selectedBuilding);
      const sortedTimes = [...(buildingSettings.snapshotTimes || [])].sort((a, b) => (a.minutes || 0) - (b.minutes || 0));
      const payload = {
        buildingCode: selectedBuilding,
        buildingName: selectedBuildingName || selectedBuilding,
        timezone: buildingSettings.timezone || DEFAULT_TIMEZONE,
        snapshotTimes: sortedTimes,
        markers: buildingSettings.markers || {},
        floorplan: buildingSettings.floorplan || null,
        updatedAt: serverTimestamp(),
        hidden: buildingIsHidden
      };
      if (!settingsExists) payload.createdAt = serverTimestamp();
      await setDoc(doc(db, 'temperatureBuildingSettings', buildingKey), payload, { merge: true });

      setHiddenBuildingCodes(prev => {
        const next = new Set(prev);
        if (buildingIsHidden) next.add(selectedBuilding);
        else next.delete(selectedBuilding);
        return next;
      });

      setSettingsExists(true);
      showNotification('success', 'Settings Saved', 'Temperature settings updated for this building.');
    } catch (error) {
      console.error('Error saving settings:', error);
      showNotification('error', 'Save Failed', 'Unable to save temperature settings.');
    }
  };

  const suggestRoomMatch = (label) => {
    const roomsList = roomsForBuilding;
    if (!label || roomsList.length === 0) {
      return { roomId: '', confidence: 0, method: 'none' };
    }
    const labelNormalized = normalizeMatchText(label);
    const labelTokens = extractRoomTokens(label).map(normalizeRoomNumber);
    let best = null;
    roomsList.forEach((room) => {
      const roomNumber = normalizeRoomNumber(room.spaceNumber || room.roomNumber || '');
      const roomLabel = normalizeMatchText(getRoomLabel(room, spacesByKey));
      let score = 0;
      let method = '';
      if (roomNumber && labelTokens.includes(roomNumber)) {
        score = 0.95;
        method = 'exact_room_number';
      } else if (roomNumber) {
        const digits = roomNumber.replace(/\D/g, '');
        if (digits && labelTokens.some((token) => token.replace(/\D/g, '') === digits)) {
          score = 0.85;
          method = 'room_number';
        }
        if (labelNormalized.includes(roomNumber.toLowerCase())) {
          score = Math.max(score, 0.75);
          method = method || 'room_number_text';
        }
      }
      if (!score && roomLabel && labelNormalized.includes(roomLabel)) {
        score = 0.8;
        method = 'label_match';
      }
      if (!score) return;
      if (!best || score > best.score) {
        best = { room, score, method, tied: false };
      } else if (best && score === best.score) {
        best.tied = true;
      }
    });
    if (!best) return { roomId: '', confidence: 0, method: 'none' };
    let confidence = best.score;
    if (best.tied) confidence = Math.min(confidence, 0.65);
    return {
      roomId: best.room.spaceKey || best.room.id,
      confidence,
      method: best.method
    };
  };

  const hashFile = async (file) => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  const parseCsvFile = (file) => new Promise((resolve, reject) => {
    Papa.parse(file, {
      skipEmptyLines: true,
      complete: (results) => {
        if (!results.data || results.data.length === 0) {
          reject(new Error('CSV is empty.'));
          return;
        }
        const [headerRow, ...rows] = results.data;
        resolve({ headerRow, rows });
      },
      error: (error) => reject(error)
    });
  });

  const buildPendingMappings = (items) => {
    const seen = new Set();
    return items
      .filter((item) => item.deviceId && (!item.suggestedRoomId || item.matchConfidence < AUTO_MATCH_THRESHOLD))
      .filter((item) => {
        if (seen.has(item.deviceId)) return false;
        seen.add(item.deviceId);
        return true;
      })
      .map((item) => ({
        deviceId: item.deviceId,
        deviceLabel: item.deviceLabel,
        suggestedRoomId: item.suggestedRoomId,
        matchConfidence: item.matchConfidence,
        matchMethod: item.matchMethod
      }));
  };

  const pruneMappingOverrides = (overrides, items) => {
    const deviceIds = new Set(items.map((item) => item.deviceId).filter(Boolean));
    return Object.keys(overrides).reduce((acc, deviceId) => {
      if (deviceIds.has(deviceId)) acc[deviceId] = overrides[deviceId];
      return acc;
    }, {});
  };

  const handleCsvSelection = async (event) => {
    if (!isAdmin) return;
    const files = Array.from(event.target.files || []);
    if (!selectedBuilding || files.length === 0) return;
    event.target.value = '';
    setImportItems([]);
    setPendingMappings([]);
    setMappingOverrides({});
    const nextItems = [];
    for (const file of files) {
      try {
        const fileHash = await hashFile(file);
        const importDocId = `${toBuildingKey(selectedBuilding)}__${fileHash}`;
        const importDoc = await getDoc(doc(db, 'temperatureImports', importDocId));
        const duplicate = importDoc.exists();
        const parsed = await parseCsvFile(file);
        const { timestampIndex, temperatureIndex, humidityIndex, temperatureUnit } = detectGoveeCsvColumns(parsed.headerRow || []);
        if (timestampIndex === -1 || temperatureIndex === -1) {
          nextItems.push({
            id: uuidv4(),
            file,
            fileName: file.name,
            fileHash,
            duplicate,
            errors: ['Missing required timestamp or temperature columns.'],
            errorCount: 1,
            samples: []
          });
          continue;
        }
        const samples = [];
        let minTimestamp = '';
        let maxTimestamp = '';
        let parsedCount = 0;
        let errorCount = 0;
        parsed.rows.forEach((row) => {
          const rawTimestamp = row[timestampIndex];
          const rawTemperature = row[temperatureIndex];
          const rawHumidity = humidityIndex > -1 ? row[humidityIndex] : null;
          const parts = parseLocalTimestamp(rawTimestamp);
          if (!parts) {
            errorCount += 1;
            return;
          }
          const tempVal = Number.parseFloat(rawTemperature);
          if (Number.isNaN(tempVal)) {
            errorCount += 1;
            return;
          }
          const humidityVal = rawHumidity == null || rawHumidity === ''
            ? null
            : Number.parseFloat(rawHumidity);
          const tempF = temperatureUnit === 'C'
            ? (tempVal * 9 / 5) + 32
            : tempVal;
          const tempC = temperatureUnit === 'C'
            ? tempVal
            : ((tempVal - 32) * 5 / 9);
          samples.push({
            localTimestamp: parts.raw,
            parts,
            temperatureF: Number.isFinite(tempF) ? Number(tempF) : null,
            temperatureC: Number.isFinite(tempC) ? Number(tempC) : null,
            humidity: Number.isFinite(humidityVal) ? Number(humidityVal) : null
          });
          parsedCount += 1;
          if (!minTimestamp || parts.raw < minTimestamp) minTimestamp = parts.raw;
          if (!maxTimestamp || parts.raw > maxTimestamp) maxTimestamp = parts.raw;
        });
        const deviceLabel = parseDeviceLabelFromFilename(file.name);
        const deviceId = toDeviceId(selectedBuilding, deviceLabel);
        const existingDevice = deviceDocs[deviceId];
        const existingRoomKey = existingDevice?.mapping?.spaceKey || existingDevice?.mapping?.roomId || '';
        const suggestion = existingRoomKey
          ? {
            roomId: existingRoomKey,
            confidence: existingDevice.mapping.confidence ?? 1,
            method: existingDevice.mapping.method || existingDevice.mapping.matchMethod || 'existing'
          }
          : suggestRoomMatch(deviceLabel);
        nextItems.push({
          id: uuidv4(),
          file,
          fileName: file.name,
          fileHash,
          duplicate,
          deviceLabel,
          deviceId,
          temperatureUnit: temperatureUnit || 'F',
          rowCount: parsed.rows.length,
          parsedCount,
          errorCount,
          minTimestamp,
          maxTimestamp,
          samples,
          suggestedRoomId: suggestion.roomId,
          matchConfidence: suggestion.confidence,
          matchMethod: suggestion.method
        });
      } catch (error) {
        console.error('CSV parse error:', error);
        nextItems.push({
          id: uuidv4(),
          file,
          fileName: file.name,
          errors: ['Unable to parse this CSV file.'],
          errorCount: 1,
          samples: []
        });
      }
    }
    setImportItems(nextItems);
    setPendingMappings(buildPendingMappings(nextItems));
  };

  const handleRemoveImportItem = (itemId) => {
    setImportItems((prevItems) => {
      const nextItems = prevItems.filter((item) => item.id !== itemId);
      setPendingMappings(buildPendingMappings(nextItems));
      setMappingOverrides((prevOverrides) => pruneMappingOverrides(prevOverrides, nextItems));
      return nextItems;
    });
  };

  const handleClearImports = () => {
    setImportItems([]);
    setPendingMappings([]);
    setMappingOverrides({});
  };

  const recomputeSnapshotsForDay = async ({
    buildingCode,
    buildingName,
    roomId,
    spaceKey,
    dateLocal,
    samples,
    timezone,
    deviceId,
    deviceLabel
  }) => {
    for (const snapshot of snapshotTimes) {
      const targetMinutes = snapshot.minutes;
      const tolerance = snapshot.toleranceMinutes ?? 15;
      let bestSample = null;
      let bestDelta = null;
      for (let delta = 0; delta <= tolerance; delta += 1) {
        const candidates = delta === 0 ? [targetMinutes] : [targetMinutes - delta, targetMinutes + delta];
        for (const minute of candidates) {
          if (minute < 0 || minute > 1439) continue;
          const sample = samples[String(minute)];
          if (!sample) continue;
          bestSample = sample;
          bestDelta = Math.abs(minute - targetMinutes);
          break;
        }
        if (bestSample) break;
      }
      const stableBuilding = buildingCode || buildingName || '';
      const stableRoom = spaceKey || roomId;
      const snapshotId = toSnapshotDocId(stableBuilding, stableRoom, dateLocal, snapshot.id);
      const snapshotRef = doc(db, 'temperatureRoomSnapshots', snapshotId);
      const existingSnap = await getDoc(snapshotRef);
      const status = bestSample ? 'ok' : 'missing';
      const recomputedUtc = bestSample?.rawLocal
        ? (() => {
          const parsed = parseLocalTimestamp(bestSample.rawLocal);
          const utcDate = parsed ? zonedTimeToUtc(parsed, timezone) : null;
          return utcDate ? Timestamp.fromDate(utcDate) : bestSample.utc;
        })()
        : null;
      const payload = {
        buildingCode: buildingCode || '',
        buildingName: buildingName || buildingCode || '',
        roomId: stableRoom,
        spaceKey: stableRoom,
        roomName: getRoomLabel(roomLookup[stableRoom] || { id: stableRoom }, spacesByKey),
        dateLocal,
        snapshotTimeId: snapshot.id,
        snapshotLabel: snapshot.label || formatMinutesToTime(snapshot.minutes),
        targetMinutes,
        toleranceMinutes: tolerance,
        timezone,
        status,
        temperatureF: bestSample ? bestSample.temperatureF : null,
        temperatureC: bestSample ? bestSample.temperatureC : null,
        humidity: bestSample ? bestSample.humidity : null,
        deltaMinutes: bestSample ? bestDelta : null,
        sourceDeviceId: bestSample ? deviceId : null,
        sourceDeviceLabel: bestSample ? deviceLabel : null,
        sourceReadingLocal: bestSample ? bestSample.rawLocal : null,
        sourceReadingUtc: bestSample ? recomputedUtc : null,
        updatedAt: serverTimestamp()
      };
      if (!existingSnap.exists()) payload.createdAt = serverTimestamp();
      if (existingSnap.exists()) {
        const existing = existingSnap.data();
        const same = existing.status === payload.status
          && existing.temperatureF === payload.temperatureF
          && existing.temperatureC === payload.temperatureC
          && existing.humidity === payload.humidity
          && existing.deltaMinutes === payload.deltaMinutes
          && existing.sourceReadingLocal === payload.sourceReadingLocal;
        if (same) continue;
      }
      await setDoc(snapshotRef, payload, { merge: true });
    }
  };

  const handleImport = async () => {
    if (!isAdmin || !selectedBuilding || !buildingSettings) return;
    if (importItems.length === 0) return;
    if (!isValidTimeZone(buildingSettings.timezone || DEFAULT_TIMEZONE)) {
      showNotification('error', 'Invalid Timezone', 'Update the building timezone before importing.');
      return;
    }
    const unresolved = pendingMappings.filter((item) => {
      const override = mappingOverrides[item.deviceId];
      return !override && !item.suggestedRoomId;
    });
    if (unresolved.length > 0) {
      showNotification('error', 'Mapping Required', 'Please resolve device-to-room mappings before importing.');
      return;
    }
    setImporting(true);
    const deviceCache = { ...deviceDocs };
    let totalNewReadings = 0;
    let totalConflicts = 0;
    try {
      for (const item of importItems) {
        if (item.duplicate) continue;
        if (!item.deviceId || !item.samples || item.samples.length === 0) continue;
        const deviceId = item.deviceId;
        const deviceLabel = item.deviceLabel || deviceId;
        const existingDevice = deviceCache[deviceId];
        const latestLocal = existingDevice?.latestLocalTimestamp || '';
        const roomId = mappingOverrides[deviceId]
          || item.suggestedRoomId
          || existingDevice?.mapping?.spaceKey
          || existingDevice?.mapping?.roomId
          || '';
        const spaceKey = roomId;
        if (!spaceKey) continue;
        const timezone = buildingSettings.timezone || DEFAULT_TIMEZONE;

        const samplesByDate = {};
        let newLatestLocal = latestLocal;
        let newLatestUtc = existingDevice?.latestUtc || null;
        let newLatestUtcDate = newLatestUtc?.toDate
          ? newLatestUtc.toDate()
          : (newLatestUtc instanceof Date ? newLatestUtc : null);
        item.samples.forEach((sample) => {
          if (latestLocal && sample.localTimestamp <= latestLocal) return;
          if (sample.localTimestamp > newLatestLocal) newLatestLocal = sample.localTimestamp;
          const utcDate = zonedTimeToUtc(sample.parts, timezone);
          if (utcDate && (!newLatestUtcDate || utcDate > newLatestUtcDate)) {
            newLatestUtcDate = utcDate;
            newLatestUtc = Timestamp.fromDate(utcDate);
          }
          const dateKey = toDateKey(sample.parts);
          const minuteKey = String(getMinutesSinceMidnight(sample.parts));
          if (!samplesByDate[dateKey]) samplesByDate[dateKey] = {};
          samplesByDate[dateKey][minuteKey] = {
            temperatureF: sample.temperatureF,
            temperatureC: sample.temperatureC,
            humidity: sample.humidity,
            rawLocal: sample.localTimestamp,
            utc: utcDate ? Timestamp.fromDate(utcDate) : null
          };
        });

        const updatedDates = new Set();
        const daySamplesCache = {};
        let deviceNewReadings = 0;
        let deviceConflicts = 0;

        for (const [dateKey, entries] of Object.entries(samplesByDate)) {
          const docId = toDeviceDayId(deviceId, dateKey);
          const dayRef = doc(db, 'temperatureDeviceReadings', docId);
          const daySnap = await getDoc(dayRef);
          const existingData = daySnap.exists() ? daySnap.data() : null;
          const existingSamples = existingData?.samples || {};
          const newEntries = {};
          let conflicts = 0;
          Object.entries(entries).forEach(([minuteKey, sample]) => {
            const existing = existingSamples[minuteKey];
            if (existing) {
              const same = existing.temperatureF === sample.temperatureF
                && existing.temperatureC === sample.temperatureC
                && existing.humidity === sample.humidity
                && existing.rawLocal === sample.rawLocal;
              if (!same) conflicts += 1;
              return;
            }
            newEntries[minuteKey] = sample;
          });
          const newCount = Object.keys(newEntries).length;
          if (newCount === 0) {
            daySamplesCache[dateKey] = existingSamples;
            deviceConflicts += conflicts;
            continue;
          }
          const metadata = {
            buildingCode: selectedBuilding,
            buildingName: selectedBuildingName || selectedBuilding,
            deviceId,
            deviceLabel,
            dateLocal: dateKey,
            timezone,
            updatedAt: serverTimestamp()
          };
          if (!daySnap.exists()) metadata.createdAt = serverTimestamp();
          const updatePayload = { ...metadata };
          if (daySnap.exists()) {
            Object.entries(newEntries).forEach(([minuteKey, sample]) => {
              updatePayload[`samples.${minuteKey}`] = sample;
            });
            updatePayload.sampleCount = (existingData?.sampleCount || Object.keys(existingSamples).length) + newCount;
            await updateDoc(dayRef, updatePayload);
          } else {
            await setDoc(dayRef, {
              ...metadata,
              sampleCount: newCount,
              samples: newEntries
            }, { merge: true });
          }
          deviceNewReadings += newCount;
          deviceConflicts += conflicts;
          updatedDates.add(dateKey);
          daySamplesCache[dateKey] = { ...existingSamples, ...newEntries };
        }

        if (deviceNewReadings > 0) {
          totalNewReadings += deviceNewReadings;
          totalConflicts += deviceConflicts;
          const importDocId = `${toBuildingKey(selectedBuilding)}__${item.fileHash}`;
          await setDoc(doc(db, 'temperatureImports', importDocId), {
            buildingCode: selectedBuilding,
            buildingName: selectedBuildingName || selectedBuilding,
            deviceId,
            deviceLabel,
            fileName: item.fileName,
            fileHash: item.fileHash,
            rowCount: item.rowCount || 0,
            parsedCount: item.parsedCount || 0,
            newReadings: deviceNewReadings,
            dateRange: {
              start: item.minTimestamp,
              end: item.maxTimestamp
            },
            temperatureUnit: item.temperatureUnit || 'F',
            createdAt: serverTimestamp()
          }, { merge: true });
        }

        const manualOverride = Boolean(mappingOverrides[deviceId]);
        const mappingPayload = {
          roomId: spaceKey,
          spaceKey,
          method: manualOverride
            ? 'manual'
            : (item.matchMethod || existingDevice?.mapping?.method || existingDevice?.mapping?.matchMethod || 'auto'),
          confidence: manualOverride
            ? 1
            : (item.matchConfidence ?? existingDevice?.mapping?.confidence ?? 1),
          updatedAt: serverTimestamp(),
          manual: manualOverride
        };
        const existingMapping = existingDevice?.mapping || {};
        const existingRoomKey = existingMapping.spaceKey || existingMapping.roomId || '';
        const mappingChanged = existingRoomKey !== mappingPayload.spaceKey
          || Boolean(existingMapping.manual) !== Boolean(mappingPayload.manual)
          || (existingMapping.method || existingMapping.matchMethod || 'auto') !== mappingPayload.method;
        const latestLocalChanged = newLatestLocal && newLatestLocal !== latestLocal;
        const shouldUpdateDevice = deviceNewReadings > 0 || mappingChanged || latestLocalChanged;
        if (shouldUpdateDevice) {
          await setDoc(doc(db, 'temperatureDevices', deviceId), {
            buildingCode: selectedBuilding,
            buildingName: selectedBuildingName || selectedBuilding,
            label: deviceLabel,
            labelNormalized: normalizeMatchText(deviceLabel),
            mapping: mappingPayload,
            latestLocalTimestamp: newLatestLocal || latestLocal || null,
            latestUtc: newLatestUtc || existingDevice?.latestUtc || null,
            lastImportedAt: deviceNewReadings > 0 ? serverTimestamp() : existingDevice?.lastImportedAt || null,
            updatedAt: serverTimestamp(),
            createdAt: existingDevice ? existingDevice.createdAt || serverTimestamp() : serverTimestamp()
          }, { merge: true });
          deviceCache[deviceId] = {
            ...(deviceCache[deviceId] || {}),
            buildingCode: selectedBuilding,
            buildingName: selectedBuildingName || selectedBuilding,
            label: deviceLabel,
            labelNormalized: normalizeMatchText(deviceLabel),
            mapping: mappingPayload,
            latestLocalTimestamp: newLatestLocal || latestLocal || null,
            latestUtc: newLatestUtc || existingDevice?.latestUtc || null
          };
        }

        if (updatedDates.size > 0 && snapshotTimes.length > 0) {
          for (const dateKey of updatedDates) {
            const samples = daySamplesCache[dateKey] || {};
            await recomputeSnapshotsForDay({
              buildingCode: selectedBuilding,
              buildingName: selectedBuildingName || selectedBuilding,
              roomId: spaceKey,
              spaceKey,
              dateLocal: dateKey,
              samples,
              timezone,
              deviceId,
              deviceLabel
            });
          }
        }
      }
      setDeviceDocs(deviceCache);
      if (totalNewReadings === 0) {
        showNotification('success', 'No New Readings', 'All selected files were already imported.');
      } else {
        const conflictNote = totalConflicts > 0 ? ` (${totalConflicts} conflicts skipped)` : '';
        showNotification('success', 'Import Complete', `${totalNewReadings} new readings added${conflictNote}.`);
      }
      setImportItems([]);
      setPendingMappings([]);
      setMappingOverrides({});
    } catch (error) {
      console.error('Import error:', error);
      showNotification('error', 'Import Failed', 'Unable to import temperature CSVs.');
    } finally {
      setImporting(false);
    }
  };

  const handleRecomputeSnapshots = async () => {
    if (!isAdmin || !selectedBuilding || !recomputeStart || !recomputeEnd) return;
    if (!isValidTimeZone(buildingSettings?.timezone || DEFAULT_TIMEZONE)) {
      showNotification('error', 'Invalid Timezone', 'Update the building timezone before recomputing.');
      return;
    }
    if (recomputeStart > recomputeEnd) {
      showNotification('error', 'Invalid Range', 'Start date must be before end date.');
      return;
    }
    setRecomputing(true);
    try {
      const buildingName = selectedBuildingName || selectedBuilding;
      let snap = await getDocs(query(
        collection(db, 'temperatureDeviceReadings'),
        where('buildingCode', '==', selectedBuilding),
        where('dateLocal', '>=', recomputeStart),
        where('dateLocal', '<=', recomputeEnd)
      ));
      if (snap.empty && buildingName) {
        snap = await getDocs(query(
          collection(db, 'temperatureDeviceReadings'),
          where('buildingName', '==', buildingName),
          where('dateLocal', '>=', recomputeStart),
          where('dateLocal', '<=', recomputeEnd)
        ));
      }
      for (const docSnap of snap.docs) {
        const data = docSnap.data();
        const device = deviceDocs[data.deviceId];
        const roomId = device?.mapping?.spaceKey || device?.mapping?.roomId;
        if (!roomId) continue;
        const samples = data.samples || {};
        await recomputeSnapshotsForDay({
          buildingCode: selectedBuilding,
          buildingName: selectedBuildingName || selectedBuilding,
          roomId,
          spaceKey: roomId,
          dateLocal: data.dateLocal,
          samples,
          timezone: buildingSettings?.timezone || DEFAULT_TIMEZONE,
          deviceId: data.deviceId,
          deviceLabel: device?.label || data.deviceId
        });
      }
      showNotification('success', 'Snapshots Recomputed', 'Snapshot results updated for the selected range.');
    } catch (error) {
      console.error('Recompute error:', error);
      showNotification('error', 'Recompute Failed', 'Unable to recompute snapshots.');
    } finally {
      setRecomputing(false);
    }
  };

  const loadHistorical = async () => {
    if (!selectedBuilding || !historicalStart || !historicalEnd) return;
    if (historicalStart > historicalEnd) {
      showNotification('error', 'Invalid Range', 'Start date must be before end date.');
      return;
    }
    setHistoricalLoading(true);
    try {
      const buildingName = selectedBuildingName || selectedBuilding;
      let snap = await getDocs(query(
        collection(db, 'temperatureRoomSnapshots'),
        where('buildingCode', '==', selectedBuilding),
        where('dateLocal', '>=', historicalStart),
        where('dateLocal', '<=', historicalEnd)
      ));
      if (snap.empty && buildingName) {
        snap = await getDocs(query(
          collection(db, 'temperatureRoomSnapshots'),
          where('buildingName', '==', buildingName),
          where('dateLocal', '>=', historicalStart),
          where('dateLocal', '<=', historicalEnd)
        ));
      }
      const docs = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setHistoricalDocs(docs);
    } catch (error) {
      console.error('Historical load error:', error);
      showNotification('error', 'Historical Load Failed', 'Unable to load historical snapshot data.');
    } finally {
      setHistoricalLoading(false);
    }
  };

  const handleSnapshotExport = async () => {
    if (!selectedBuilding || !exportStart || !exportEnd) return;
    if (exportStart > exportEnd) {
      showNotification('error', 'Invalid Range', 'Start date must be before end date.');
      return;
    }
    setExporting(true);
    try {
      const buildingName = selectedBuildingName || selectedBuilding;
      let snap = await getDocs(query(
        collection(db, 'temperatureRoomSnapshots'),
        where('buildingCode', '==', selectedBuilding),
        where('dateLocal', '>=', exportStart),
        where('dateLocal', '<=', exportEnd)
      ));
      if (snap.empty && buildingName) {
        snap = await getDocs(query(
          collection(db, 'temperatureRoomSnapshots'),
          where('buildingName', '==', buildingName),
          where('dateLocal', '>=', exportStart),
          where('dateLocal', '<=', exportEnd)
        ));
      }
      const docs = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      const filtered = docs.filter((docData) => {
        const roomKey = docData.spaceKey || docData.roomId;
        if (exportRoomIds.length > 0 && !exportRoomIds.includes(roomKey)) return false;
        if (exportSnapshotIds.length > 0 && !exportSnapshotIds.includes(docData.snapshotTimeId)) return false;
        return true;
      });
      const headers = [
        'Building',
        'Room',
        'Date',
        'Snapshot Time',
        'Temperature F',
        'Temperature C',
        'Humidity',
        'Status',
        'Timezone',
        'Delta Minutes',
        'Source Local Timestamp',
        'Source UTC Timestamp',
        'Device Label'
      ];
      const rows = filtered.map((docData) => {
        const roomKey = docData.spaceKey || docData.roomId;
        return ([
          docData.buildingName || selectedBuildingName || selectedBuilding,
          docData.roomName || getRoomLabel(roomLookup[roomKey] || { id: roomKey }, spacesByKey),
          docData.dateLocal || '',
          docData.snapshotLabel || '',
          docData.temperatureF ?? '',
          docData.temperatureC ?? '',
          docData.humidity ?? '',
          docData.status || '',
          docData.timezone || buildingSettings?.timezone || DEFAULT_TIMEZONE,
          docData.deltaMinutes ?? '',
          docData.sourceReadingLocal || '',
          docData.sourceReadingUtc?.toDate ? docData.sourceReadingUtc.toDate().toISOString() : '',
          docData.sourceDeviceLabel || ''
        ]);
      });
      const csvContent = [
        headers.map(toCsvSafe).join(','),
        ...rows.map((row) => row.map(toCsvSafe).join(','))
      ].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `temperature-snapshots-${selectedBuilding}-${exportStart}-to-${exportEnd}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      showNotification('success', 'Export Ready', `Exported ${rows.length} snapshot rows.`);
    } catch (error) {
      console.error('Export error:', error);
      showNotification('error', 'Export Failed', 'Unable to export snapshot data.');
    } finally {
      setExporting(false);
    }
  };

  const handleRawExport = async () => {
    if (!selectedBuilding || !exportStart || !exportEnd) return;
    if (exportStart > exportEnd) {
      showNotification('error', 'Invalid Range', 'Start date must be before end date.');
      return;
    }
    setExporting(true);
    try {
      const buildingName = selectedBuildingName || selectedBuilding;
      let snap = await getDocs(query(
        collection(db, 'temperatureDeviceReadings'),
        where('buildingCode', '==', selectedBuilding),
        where('dateLocal', '>=', exportStart),
        where('dateLocal', '<=', exportEnd)
      ));
      if (snap.empty && buildingName) {
        snap = await getDocs(query(
          collection(db, 'temperatureDeviceReadings'),
          where('buildingName', '==', buildingName),
          where('dateLocal', '>=', exportStart),
          where('dateLocal', '<=', exportEnd)
        ));
      }
      const rows = [];
      snap.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const device = deviceDocs[data.deviceId] || {};
        const roomId = device?.mapping?.spaceKey || device?.mapping?.roomId || '';
        if (exportRoomIds.length > 0 && roomId && !exportRoomIds.includes(roomId)) return;
        const roomName = roomId ? getRoomLabel(roomLookup[roomId] || { id: roomId }, spacesByKey) : '';
        const samples = data.samples || {};
        Object.values(samples).forEach((sample) => {
          rows.push([
            buildingName || selectedBuilding,
            roomName,
            device.label || data.deviceId,
            sample.rawLocal || '',
            buildingSettings?.timezone || DEFAULT_TIMEZONE,
            sample.temperatureF ?? '',
            sample.temperatureC ?? '',
            sample.humidity ?? ''
          ]);
        });
      });
      const headers = [
        'Building',
        'Room',
        'Device Label',
        'Local Timestamp',
        'Timezone',
        'Temperature F',
        'Temperature C',
        'Humidity'
      ];
      const csvContent = [
        headers.map(toCsvSafe).join(','),
        ...rows.map((row) => row.map(toCsvSafe).join(','))
      ].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `temperature-raw-${selectedBuilding}-${exportStart}-to-${exportEnd}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      showNotification('success', 'Export Ready', `Exported ${rows.length} raw readings.`);
    } catch (error) {
      console.error('Raw export error:', error);
      showNotification('error', 'Export Failed', 'Unable to export raw readings.');
    } finally {
      setExporting(false);
    }
  };

  const markerMap = editingPositions ? markerDrafts : (buildingSettings?.markers || {});
  const missingMarkers = roomsForBuilding.filter((room) => {
    const roomKey = room.spaceKey || room.id;
    if (!roomKey) return false;
    return !markerMap[roomKey];
  });

  const currentSnapshotLabel = snapshotTimes.find((slot) => slot.id === selectedSnapshotId)?.label || '';

  const floorplanData = buildingSettings?.floorplan;

  const renderFloorplan = () => {
    if (roomsLoading || settingsLoading) {
      return (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-600">
          Loading floorplan data...
        </div>
      );
    }
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Floorplan View</h2>
            <p className="text-sm text-gray-600">
              {selectedDate || 'Select a date'} - {currentSnapshotLabel || 'Select a snapshot time'}
            </p>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2">
              {!editingPositions ? (
                <button className="btn-secondary" onClick={startEditingPositions}>
                  <Pencil className="w-4 h-4 mr-2" /> Edit Positions
                </button>
              ) : (
                <>
                  <button className="btn-primary" onClick={saveMarkerPositions}>
                    <Save className="w-4 h-4 mr-2" /> Save Positions
                  </button>
                  <button className="btn-ghost" onClick={cancelEditingPositions}>
                    <X className="w-4 h-4 mr-2" /> Cancel
                  </button>
                </>
              )}
              <label className="btn-secondary cursor-pointer">
                <ImageIcon className="w-4 h-4 mr-2" /> Upload PNG
                <input
                  type="file"
                  accept="image/png"
                  className="hidden"
                  onChange={(event) => handleFloorplanUpload(event.target.files?.[0])}
                />
              </label>
            </div>
          )}
        </div>

        {floorplanData?.downloadUrl && isAdmin && !editingPositions && (
          <div className="flex justify-end mb-4">
            <button
              className="btn-ghost text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={handleDeleteFloorplan}
            >
              <Trash2 className="w-4 h-4 mr-2" /> Delete Floorplan
            </button>
          </div>
        )}

        {!floorplanData?.downloadUrl ? (
          <div className="border border-dashed border-gray-300 rounded-lg p-10 text-center">
            <MapIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-700 font-medium">No floorplan uploaded yet.</p>
            <p className="text-sm text-gray-500">Upload a PNG floorplan to begin placing temperature markers.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
            <div className="relative border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
              <div
                ref={mapRef}
                className={`relative ${editingPositions ? 'cursor-crosshair' : ''}`}
                onClick={handleMapClick}
              >
                <img src={floorplanData.downloadUrl} alt={`${selectedBuilding} floorplan`} className="w-full h-auto block" />
                {roomsForBuilding.map((room) => {
                  const roomKey = room.spaceKey || room.id;
                  if (!roomKey) return null;
                  const marker = markerMap[roomKey];
                  if (!marker) return null;
                  const snapshot = snapshotLookup[roomKey]?.[selectedSnapshotId];
                  const isMissing = !snapshot || snapshot.status === 'missing';
                  const tempLabel = formatSnapshotTemp(snapshot);
                  return (
                    <button
                      key={roomKey}
                      type="button"
                      onPointerDown={(event) => handleMarkerPointerDown(roomKey, event)}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-xs font-semibold shadow-sm ${isMissing ? 'bg-gray-300 text-gray-700' : 'bg-baylor-green text-white'}`}
                      style={{ left: `${marker.xPct}%`, top: `${marker.yPct}%` }}
                      title={`${getRoomLabel(room, spacesByKey)} - ${tempLabel}`}
                    >
                      <div className="flex flex-col items-center leading-tight">
                        <span>{room.spaceNumber || room.roomNumber || room.name}</span>
                        <span>{tempLabel}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4">
              {editingPositions && (
                <div className="bg-baylor-green/5 border border-baylor-green/20 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-baylor-green mb-2">Edit Mode</h3>
                  <p className="text-xs text-gray-600 mb-3">
                    Drag existing markers or choose a room below, then click the map to place it.
                  </p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {missingMarkers.length === 0 ? (
                      <div className="text-xs text-gray-600">All rooms have markers placed.</div>
                    ) : (
                      missingMarkers.map((room) => {
                        const roomKey = room.spaceKey || room.id;
                        if (!roomKey) return null;
                        return (
                          <button
                            key={roomKey}
                            className={`w-full text-left px-3 py-2 rounded-md border text-xs ${activePlacementRoomId === roomKey ? 'border-baylor-green bg-baylor-green/10' : 'border-gray-200 hover:border-baylor-green/50'}`}
                            onClick={() => setActivePlacementRoomId(roomKey)}
                          >
                            {getRoomLabel(room, spacesByKey)}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Snapshot Summary</h3>
                <div className="text-sm text-gray-600 space-y-1">
                  <div>{roomsForBuilding.length} rooms in building</div>
                  <div>{Object.keys(snapshotLookup).length} rooms with data</div>
                  <div>Timezone: {buildingSettings?.timezone || DEFAULT_TIMEZONE}</div>
                </div>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Missing Data</h3>
                <div className="text-xs text-gray-600 max-h-40 overflow-y-auto space-y-1">
                  {roomsForBuilding.filter((room) => {
                    const roomKey = room.spaceKey || room.id;
                    const snapshot = roomKey ? snapshotLookup[roomKey]?.[selectedSnapshotId] : null;
                    return !snapshot || snapshot.status === 'missing';
                  }).map((room) => (
                    <div key={room.spaceKey || room.id}>{getRoomLabel(room, spacesByKey)}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderDailyTable = () => (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Daily Snapshot Table</h2>
          <p className="text-sm text-gray-600">Date: {selectedDate || 'Select a date'}</p>
        </div>
        <div className="text-sm text-gray-600">
          {snapshotTimes.length} snapshot times
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-2 text-gray-600 font-semibold">Room</th>
              {snapshotTimes.map((slot) => (
                <th key={slot.id} className="text-left px-4 py-2 text-gray-600 font-semibold">
                  {slot.label || formatMinutesToLabel(slot.minutes)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {roomsForBuilding.map((room) => {
              const roomKey = room.spaceKey || room.id;
              if (!roomKey) return null;
              return (
                <tr key={roomKey}>
                  <td className="px-4 py-2 font-medium text-gray-800">{getRoomLabel(room, spacesByKey)}</td>
                  {snapshotTimes.map((slot) => {
                    const snapshot = snapshotLookup[roomKey]?.[slot.id];
                    const isMissing = !snapshot || snapshot.status === 'missing';
                    return (
                      <td key={slot.id} className="px-4 py-2">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${isMissing ? 'bg-gray-200 text-gray-600' : 'bg-baylor-green/10 text-baylor-green'}`}>
                          {formatSnapshotTemp(snapshot)}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  const missingCounts = useMemo(() => {
    const counts = {};
    historicalDocs.forEach((docData) => {
      if (docData.status !== 'missing') return;
      const roomKey = docData.spaceKey || docData.roomId;
      if (!roomKey) return;
      counts[roomKey] = (counts[roomKey] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([roomId, count]) => ({ roomId, count }))
      .sort((a, b) => b.count - a.count);
  }, [historicalDocs]);

  const renderHistorical = () => {
    const roomSnapshots = historicalRoomId
      ? historicalDocs.filter((docData) => (docData.spaceKey || docData.roomId) === historicalRoomId)
      : [];

    const dates = Array.from(new Set(roomSnapshots.map((docData) => docData.dateLocal))).sort();

    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Historical View</h2>
            <p className="text-sm text-gray-600">Track snapshot history across dates.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              className="form-input"
              value={historicalStart}
              onChange={(e) => setHistoricalStart(e.target.value)}
            />
            <span className="text-gray-500">to</span>
            <input
              type="date"
              className="form-input"
              value={historicalEnd}
              onChange={(e) => setHistoricalEnd(e.target.value)}
            />
            <button className="btn-secondary" onClick={loadHistorical} disabled={historicalLoading}>
              {historicalLoading ? 'Loading...' : 'Load'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          <div>
            <label className="form-label">Room</label>
            <select
              className="form-input"
              value={historicalRoomId}
              onChange={(e) => setHistoricalRoomId(e.target.value)}
            >
              <option value="">Select a room...</option>
              {roomsForBuilding.map((room) => {
                const roomKey = room.spaceKey || room.id;
                if (!roomKey) return null;
                return (
                  <option key={roomKey} value={roomKey}>{getRoomLabel(room, spacesByKey)}</option>
                );
              })}
            </select>
            {historicalRoomId && (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-4 py-2 text-gray-600 font-semibold">Date</th>
                      {snapshotTimes.map((slot) => (
                        <th key={slot.id} className="text-left px-4 py-2 text-gray-600 font-semibold">
                          {slot.label || formatMinutesToLabel(slot.minutes)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {dates.map((dateKey) => (
                      <tr key={dateKey}>
                        <td className="px-4 py-2 font-medium text-gray-800">{dateKey}</td>
                        {snapshotTimes.map((slot) => {
                          const snapshot = roomSnapshots.find((docData) => docData.dateLocal === dateKey && docData.snapshotTimeId === slot.id);
                          const isMissing = !snapshot || snapshot.status === 'missing';
                          return (
                            <td key={slot.id} className="px-4 py-2">
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${isMissing ? 'bg-gray-200 text-gray-600' : 'bg-baylor-green/10 text-baylor-green'}`}>
                                {formatSnapshotTemp(snapshot)}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Problem Rooms</h3>
            {missingCounts.length === 0 ? (
              <div className="text-xs text-gray-600">No missing data in this range.</div>
            ) : (
              <div className="space-y-2 text-xs text-gray-600">
                {missingCounts.slice(0, 8).map((item) => (
                  <div key={item.roomId} className="flex items-center justify-between">
                    <span>{getRoomLabel(roomLookup[item.roomId] || { id: item.roomId }, spacesByKey)}</span>
                    <span className="text-gray-500">{item.count} missing</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderImport = () => (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Bulk Import</h2>
          <p className="text-sm text-gray-600">Upload Govee CSV exports and map devices to rooms.</p>
        </div>
        {importItems.length > 0 && (
          <button
            className="btn-ghost flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleClearImports}
            disabled={importing}
          >
            <X className="w-4 h-4" /> Clear list
          </button>
        )}
      </div>

      <input
        id="temperature-import-csvs"
        type="file"
        accept=".csv"
        multiple
        className="hidden"
        onChange={handleCsvSelection}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border border-dashed border-baylor-green/40 bg-baylor-green/5 rounded-lg p-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-white border border-baylor-green/20 flex items-center justify-center">
              <FileUp className="w-5 h-5 text-baylor-green" />
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900">Select Govee CSV exports</div>
              <div className="text-xs text-gray-500">
                Upload one or more CSV files. We'll detect timestamps, temperature, and humidity automatically.
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <label htmlFor="temperature-import-csvs" className="btn-secondary cursor-pointer inline-flex items-center">
              <FileUp className="w-4 h-4 mr-2" /> Choose CSVs
            </label>
            {importItems.length > 0 && (
              <span className="text-xs text-gray-500">Selecting new files replaces the current list.</span>
            )}
          </div>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Import Summary</h3>
            <span className={`text-xs font-medium ${importItems.length ? 'text-baylor-green' : 'text-gray-500'}`}>
              {importItems.length ? 'Ready for review' : 'Awaiting files'}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg bg-white border border-gray-200 p-3">
              <div className="text-xs text-gray-500">Files</div>
              <div className="text-lg font-semibold text-gray-900">{importSummary.fileCount}</div>
            </div>
            <div className="rounded-lg bg-white border border-gray-200 p-3">
              <div className="text-xs text-gray-500">Devices</div>
              <div className="text-lg font-semibold text-gray-900">{importSummary.deviceCount}</div>
            </div>
            <div className="rounded-lg bg-white border border-gray-200 p-3">
              <div className="text-xs text-gray-500">Rows Parsed</div>
              <div className="text-lg font-semibold text-gray-900">
                {importSummary.totalRows > 0 ? `${importSummary.parsedRows}/${importSummary.totalRows}` : '0'}
              </div>
            </div>
            <div className="rounded-lg bg-white border border-gray-200 p-3">
              <div className="text-xs text-gray-500">Duplicates</div>
              <div className="text-lg font-semibold text-gray-600">{importSummary.duplicateCount}</div>
            </div>
            <div className="rounded-lg bg-white border border-gray-200 p-3">
              <div className="text-xs text-gray-500">Errors</div>
              <div className="text-lg font-semibold text-amber-700">{importSummary.errorCount}</div>
            </div>
            <div className="rounded-lg bg-white border border-gray-200 p-3">
              <div className="text-xs text-gray-500">Ready</div>
              <div className="text-lg font-semibold text-baylor-green">{importSummary.readyCount}</div>
            </div>
          </div>
        </div>
      </div>

      {importItems.length === 0 ? (
        <div className="border border-dashed border-gray-300 rounded-lg p-8 text-center text-gray-600">
          <FileUp className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-700">No CSVs selected yet.</p>
          <p className="text-xs text-gray-500">Use the upload panel above to add Govee exports.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Selected Files</h3>
            <span className="text-xs text-gray-500">{importSummary.fileCount} files</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2 text-gray-600 font-semibold">File</th>
                  <th className="text-left px-4 py-2 text-gray-600 font-semibold">Device</th>
                  <th className="text-left px-4 py-2 text-gray-600 font-semibold">Rows</th>
                  <th className="text-left px-4 py-2 text-gray-600 font-semibold">Date Range</th>
                  <th className="text-left px-4 py-2 text-gray-600 font-semibold">Status</th>
                  <th className="text-left px-4 py-2 text-gray-600 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {importItems.map((item) => {
                  const rowTotal = item.rowCount ?? 0;
                  const parsedRows = item.parsedCount ?? 0;
                  const rowsLabel = rowTotal > 0 ? `${parsedRows}/${rowTotal}` : parsedRows > 0 ? `${parsedRows}` : '-';
                  return (
                    <tr key={item.id}>
                      <td className="px-4 py-2 font-medium text-gray-800">{item.fileName}</td>
                      <td className="px-4 py-2 text-gray-700">{item.deviceLabel || '-'}</td>
                      <td className="px-4 py-2 text-gray-700">{rowsLabel}</td>
                      <td className="px-4 py-2 text-gray-700">
                        {item.minTimestamp && item.maxTimestamp ? `${item.minTimestamp} -> ${item.maxTimestamp}` : '-'}
                      </td>
                      <td className="px-4 py-2 text-gray-700">
                        {item.duplicate ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-100 px-2 py-1 text-xs text-gray-600">
                            <AlertTriangle className="w-3 h-3" /> Duplicate
                          </span>
                        ) : item.errorCount > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
                            <AlertTriangle className="w-3 h-3" /> {item.errorCount} errors
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-baylor-green/20 bg-baylor-green/10 px-2 py-1 text-xs text-baylor-green">
                            <CheckCircle2 className="w-3 h-3" /> Ready
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-gray-700">
                        <button
                          type="button"
                          className="btn-ghost flex items-center gap-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => handleRemoveImportItem(item.id)}
                          disabled={importing}
                          aria-label={`Remove ${item.fileName}`}
                        >
                          <X className="w-3 h-3" />
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {pendingMappings.length > 0 && (
            <div className="bg-baylor-gold/10 border border-baylor-gold/30 rounded-lg p-4 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Device Mapping Review</h3>
                <p className="text-xs text-gray-500">Confirm which rooms should receive readings for each device.</p>
              </div>
              <div className="space-y-2">
                {pendingMappings.map((item) => (
                  <div key={item.deviceId} className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium text-gray-800">{item.deviceLabel}</div>
                      <div className="text-xs text-gray-500">
                        Suggested: {item.suggestedRoomId ? getRoomLabel(roomLookup[item.suggestedRoomId] || { id: item.suggestedRoomId }, spacesByKey) : 'None'} | Confidence {Math.round((item.matchConfidence || 0) * 100)}%
                      </div>
                    </div>
                    <select
                      className="form-input md:max-w-xs"
                      value={mappingOverrides[item.deviceId] || item.suggestedRoomId || ''}
                      onChange={(e) => setMappingOverrides((prev) => ({ ...prev, [item.deviceId]: e.target.value }))}
                    >
                      <option value="">Select room...</option>
                      {roomsForBuilding.map((room) => {
                        const roomKey = room.spaceKey || room.id;
                        if (!roomKey) return null;
                        return (
                          <option key={roomKey} value={roomKey}>{getRoomLabel(room, spacesByKey)}</option>
                        );
                      })}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="text-sm text-gray-600">
              Duplicates are skipped automatically. Resolve any mapping prompts before importing.
            </div>
            <button className="btn-primary" onClick={handleImport} disabled={importing || hasUnresolvedMappings}>
              {importing ? 'Importing...' : 'Import Now'}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const renderExport = () => (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Export Data</h2>
        <p className="text-sm text-gray-600">Download snapshot or raw readings using current filters.</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <label className="form-label">Date range</label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              className="form-input"
              value={exportStart}
              onChange={(e) => setExportStart(e.target.value)}
            />
            <span className="text-gray-500">to</span>
            <input
              type="date"
              className="form-input"
              value={exportEnd}
              onChange={(e) => setExportEnd(e.target.value)}
            />
          </div>
          <label className="form-label">Rooms (optional)</label>
          <select
            className="form-input"
            multiple
            value={exportRoomIds}
            onChange={(e) => setExportRoomIds(Array.from(e.target.selectedOptions).map((opt) => opt.value))}
          >
            {roomsForBuilding.map((room) => {
              const roomKey = room.spaceKey || room.id;
              if (!roomKey) return null;
              return (
                <option key={roomKey} value={roomKey}>{getRoomLabel(room, spacesByKey)}</option>
              );
            })}
          </select>
          <label className="form-label">Snapshot times (optional)</label>
          <select
            className="form-input"
            multiple
            value={exportSnapshotIds}
            onChange={(e) => setExportSnapshotIds(Array.from(e.target.selectedOptions).map((opt) => opt.value))}
          >
            {snapshotTimes.map((slot) => (
              <option key={slot.id} value={slot.id}>{slot.label || formatMinutesToLabel(slot.minutes)}</option>
            ))}
          </select>
        </div>
        <div className="space-y-3">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-2 text-sm text-gray-600">
              <Download className="w-4 h-4 mt-0.5 text-gray-400" />
              <div>
                <div className="font-medium text-gray-800">Snapshot Export</div>
                <div>Includes temperature, humidity, snapshot time, and delta to target.</div>
              </div>
            </div>
            <button className="btn-primary w-full" onClick={handleSnapshotExport} disabled={exporting}>
              {exporting ? 'Exporting...' : 'Export Snapshots CSV'}
            </button>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-2 text-sm text-gray-600">
              <Download className="w-4 h-4 mt-0.5 text-gray-400" />
              <div>
                <div className="font-medium text-gray-800">Raw Readings Export</div>
                <div>Full daily readings with local timestamps.</div>
              </div>
            </div>
            <button className="btn-secondary w-full" onClick={handleRawExport} disabled={exporting}>
              {exporting ? 'Exporting...' : 'Export Raw Readings CSV'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Temperature Settings</h2>
        <p className="text-sm text-gray-600">Manage timezone and snapshot intervals for this building.</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className="form-label">Building Timezone</label>
            <input
              type="text"
              className="form-input"
              value={buildingSettings?.timezone || DEFAULT_TIMEZONE}
              onChange={(e) => setBuildingSettings((prev) => ({ ...prev, timezone: e.target.value }))}
            />
            <p className="text-xs text-gray-500 mt-1">Default: {DEFAULT_TIMEZONE}</p>
          </div>

          <div>
            <label className="form-label">Snapshot Times</label>
            <div className="space-y-2">
              {snapshotTimes.map((slot) => (
                <div key={slot.id} className="flex items-center gap-2">
                  <input
                    type="text"
                    className="form-input"
                    value={slot.label || formatMinutesToTime(slot.minutes)}
                    onChange={(e) => {
                      const nextLabel = e.target.value;
                      const parsedMinutes = parseTime(nextLabel);
                      if (parsedMinutes == null) {
                        handleUpdateSnapshotTime(slot.id, { label: nextLabel });
                      } else {
                        handleUpdateSnapshotTime(slot.id, {
                          minutes: parsedMinutes,
                          label: formatMinutesToTime(parsedMinutes)
                        });
                      }
                    }}
                  />
                  <input
                    type="number"
                    min="0"
                    className="form-input w-24"
                    value={slot.toleranceMinutes ?? 15}
                    onChange={(e) => handleUpdateSnapshotTime(slot.id, { toleranceMinutes: Number(e.target.value) })}
                  />
                  <button className="btn-ghost" onClick={() => handleRemoveSnapshotTime(slot.id)}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="text"
                className="form-input"
                placeholder="Add time (e.g., 12:00 PM)"
                value={newSnapshotTime}
                onChange={(e) => setNewSnapshotTime(e.target.value)}
              />
              <input
                type="number"
                min="0"
                className="form-input w-24"
                value={newSnapshotTolerance}
                onChange={(e) => setNewSnapshotTolerance(Number(e.target.value))}
              />
              <button className="btn-secondary" onClick={handleAddSnapshotTime}>Add</button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button className="btn-primary" onClick={saveBuildingSettings}>Save Settings</button>
            <button className="btn-ghost" onClick={() => setBuildingSettings(buildDefaultSettings({ buildingCode: selectedBuilding, buildingName: selectedBuildingName }))}>Reset Defaults</button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">Recompute Snapshots</h3>
            <p className="text-xs text-gray-600">
              If timezone or mappings change, recompute snapshots for the selected range.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                className="form-input"
                value={recomputeStart}
                onChange={(e) => setRecomputeStart(e.target.value)}
              />
              <span className="text-gray-500">to</span>
              <input
                type="date"
                className="form-input"
                value={recomputeEnd}
                onChange={(e) => setRecomputeEnd(e.target.value)}
              />
            </div>
            <button className="btn-secondary w-full" onClick={handleRecomputeSnapshots} disabled={recomputing}>
              {recomputing ? 'Recomputing...' : 'Recompute Snapshots'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const viewTabs = [
    { id: 'floorplan', label: 'Floorplan', icon: MapIcon },
    { id: 'daily', label: 'Daily', icon: LayoutGrid },
    { id: 'historical', label: 'Historical', icon: History },
    ...(isAdmin ? [{ id: 'import', label: 'Import', icon: FileUp }] : []),
    { id: 'export', label: 'Export', icon: Download },
    ...(isAdmin ? [{ id: 'settings', label: 'Settings', icon: Thermometer }] : [])
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Temperature Monitoring</h1>
          <p className="text-gray-600">Bulk import Govee exports, map rooms, and visualize daily snapshots.</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Thermometer className="w-4 h-4 text-baylor-green" />
          {selectedBuilding ? `Building: ${selectedBuildingName || selectedBuilding}` : 'Select a building'}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <MapIcon className="w-4 h-4 text-gray-400" />
              <select
                className="form-input"
                value={selectedBuilding}
                onChange={(e) => setSelectedBuilding(e.target.value)}
              >
                <option value="">Select building...</option>
                {buildingOptions.map((building) => (
                  <option key={building.code} value={building.code}>{building.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <input
                type="date"
                className="form-input"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Thermometer className="w-4 h-4 text-gray-400" />
              <select
                className="form-input"
                value={selectedSnapshotId}
                onChange={(e) => setSelectedSnapshotId(e.target.value)}
              >
                {snapshotTimes.map((slot) => (
                  <option key={slot.id} value={slot.id}>
                    {slot.label || formatMinutesToLabel(slot.minutes)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {viewTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = viewMode === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setViewMode(tab.id)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition ${isActive ? 'bg-baylor-green text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {snapshotLoading && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 text-gray-600">
          Loading snapshot data...
        </div>
      )}

      {!snapshotLoading && viewMode === 'floorplan' && renderFloorplan()}
      {!snapshotLoading && viewMode === 'daily' && renderDailyTable()}
      {!snapshotLoading && viewMode === 'historical' && renderHistorical()}
      {viewMode === 'import' && renderImport()}
      {viewMode === 'export' && renderExport()}
      {viewMode === 'settings' && renderSettings()}

      <ConfirmDialog
        isOpen={showDeleteFloorplanConfirm}
        title="Delete Floorplan"
        message="Are you sure you want to delete the floorplan? This action cannot be undone."
        onConfirm={confirmDeleteFloorplan}
        onCancel={() => setShowDeleteFloorplanConfirm(false)}
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
};

export default TemperatureMonitoring;