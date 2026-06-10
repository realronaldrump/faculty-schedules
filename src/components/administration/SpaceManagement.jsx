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

import { useState, useMemo, useCallback, useEffect } from "react";
import { useLocation } from "react-router-dom";
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
  ChevronDown,
  ChevronUp,
  Layers,
} from "lucide-react";
import { useData } from "../../contexts/DataContext";
import { useAppConfig } from "../../contexts/AppConfigContext";
import { useUI } from "../../contexts/UIContext";
import { usePeople } from "../../contexts/PeopleContext";
import ConfirmDialog from "../shared/ConfirmDialog";
import { HelpTooltip } from "../help/Tooltip";
import {
  SPACE_TYPE,
  buildSpaceKey,
  formatSpaceDisplayName,
  normalizeSpaceNumber,
  parseRoomLabel,
  parseSpaceKey,
  resolveBuilding,
  resolveBuildingDisplayName,
} from "../../utils/locationService";
import { normalizeSpaceRecord } from "../../utils/spaceUtils";
import { validateSpace } from "../../utils/canonicalSchema";
import { standardizeRoom } from "../../utils/hygieneCore";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "../../firebase";
import SpaceUsageDetailModal from "./SpaceUsageDetailModal";

const getCanonicalSpaceKeyFromSpace = (space) => {
  if (!space) return "";
  const raw = (space.spaceKey || space.id || "").toString().trim();
  if (!raw) return "";
  const parsed = parseSpaceKey(raw);
  if (!parsed?.buildingCode || !parsed?.spaceNumber) return "";
  return buildSpaceKey(parsed.buildingCode, parsed.spaceNumber);
};

const SpaceManagement = () => {
  const location = useLocation();
  const {
    roomsData,
    spacesByKey,
    spacesList,
    refreshRooms,
    loadRooms,
    scheduleData = [],
  } = useData();
  const { buildingConfig } = useAppConfig();
  const { showNotification } = useUI();
  const { people = [], loadPeople } = usePeople();

  const [searchQuery, setSearchQuery] = useState("");
  const [buildingFilter, setBuildingFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [usageFilter, setUsageFilter] = useState("all"); // all, scheduled, office, unused
  const [editingSpace, setEditingSpace] = useState(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [isBulkAdding, setIsBulkAdding] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showStats, setShowStats] = useState(true);
  const [usageDetail, setUsageDetail] = useState(null); // { space, mode: 'scheduled' | 'office' }

  // Load rooms and people on mount
  useEffect(() => {
    loadRooms();
    loadPeople();
  }, [loadRooms, loadPeople]);

  // Allow deep links from People Directory, schedules, etc.
  // Example: /facilities/spaces?spaceKey=MARY_GIBBS_JONES:110&usage=office
  useEffect(() => {
    const params = new URLSearchParams(location.search || "");
    const rawParam =
      params.get("spaceKey") ||
      params.get("space") ||
      params.get("office") ||
      "";
    const rawValue = (rawParam || "").toString().trim();
    if (!rawValue) return;

    let canonical = "";
    const parsedKey = parseSpaceKey(rawValue);
    if (parsedKey?.buildingCode && parsedKey?.spaceNumber) {
      canonical = buildSpaceKey(parsedKey.buildingCode, parsedKey.spaceNumber);
    } else {
      const parsedLabel = parseRoomLabel(rawValue);
      if (parsedLabel?.spaceKey) canonical = parsedLabel.spaceKey;
    }

    setSearchQuery(canonical || rawValue);

    const usage = (params.get("usage") || params.get("mode") || "")
      .toString()
      .trim()
      .toLowerCase();
    if (usage === "office") setUsageFilter("office");
    if (usage === "scheduled" || usage === "class" || usage === "classes") {
      setUsageFilter("scheduled");
    }
  }, [location.search]);

  // Form state
  const [formData, setFormData] = useState({
    buildingCode: "",
    spaceNumber: "",
    type: SPACE_TYPE.CLASSROOM,
    capacity: "",
    equipment: [],
    notes: "",
  });
  const [equipmentInput, setEquipmentInput] = useState("");

  // Bulk add state
  const [bulkData, setBulkData] = useState({
    buildingCode: "",
    startNumber: "",
    endNumber: "",
    prefix: "",
    suffix: "",
    type: SPACE_TYPE.CLASSROOM,
  });

  // Get buildings for dropdown
  const buildings = useMemo(() => {
    return (buildingConfig?.buildings || [])
      .filter((b) => b.isActive !== false)
      .sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
  }, [buildingConfig]);

  // Calculate usage data for each space
  const spaceUsage = useMemo(() => {
    const usage = {};

    const ensure = (spaceKey) => {
      if (!spaceKey) return null;
      if (!usage[spaceKey]) {
        usage[spaceKey] = {
          scheduled: 0,
          offices: 0,
          temperature: false,
          schedules: [],
          officePeople: [],
        };
      }
      return usage[spaceKey];
    };

    const canonicalizeSpaceKey = (value) => {
      const raw = (value || "").toString().trim();
      if (!raw) return "";

      const parsed = parseSpaceKey(raw);
      if (parsed?.buildingCode && parsed?.spaceNumber) {
        return buildSpaceKey(parsed.buildingCode, parsed.spaceNumber);
      }
      return "";
    };

    // Check schedules for room usage
    (scheduleData || []).forEach((schedule) => {
      const keys = [];
      const seen = new Set();

      const roomIds = Array.isArray(schedule.spaceIds) ? schedule.spaceIds : [];
      roomIds.forEach((rawSpaceId) => {
        const key = canonicalizeSpaceKey(rawSpaceId);
        if (!key || seen.has(key)) return;
        seen.add(key);
        keys.push(key);
      });

      keys.forEach((spaceKey) => {
        const record = ensure(spaceKey);
        if (!record) return;
        record.schedules.push(schedule);
      });
    });

    // Check people for office assignments
    (people || []).forEach((person) => {
      if (person?.isActive === false) return;
      if (person?.hasNoOffice === true || person?.isRemote === true) return;

      const officeSpaceIds = Array.isArray(person.officeSpaceIds)
        ? person.officeSpaceIds
        : [];

      const uniqueOfficeKeys = new Set();
      officeSpaceIds.forEach((rawSpaceId) => {
        const key = canonicalizeSpaceKey(rawSpaceId);
        if (key) uniqueOfficeKeys.add(key);
      });

      Array.from(uniqueOfficeKeys).forEach((spaceKey) => {
        if (!spaceKey) return;
        const record = ensure(spaceKey);
        if (!record) return;
        record.officePeople.push(person);
      });
    });

    Object.values(usage).forEach((record) => {
      // Keep counts consistent with the unique items we can display.
      const uniqueSchedules = new Map();
      (Array.isArray(record.schedules) ? record.schedules : []).forEach((s) => {
        const key = s?.id || s?._originalId;
        if (!key) return;
        if (!uniqueSchedules.has(key)) uniqueSchedules.set(key, s);
      });
      record.schedules = Array.from(uniqueSchedules.values());
      record.scheduled = record.schedules.length;

      const uniquePeople = new Map();
      (Array.isArray(record.officePeople) ? record.officePeople : []).forEach(
        (p) => {
          const key =
            p?.id ||
            p?.email ||
            `${p?.firstName || ""} ${p?.lastName || ""}`.trim();
          if (!key) return;
          if (!uniquePeople.has(key)) uniquePeople.set(key, p);
        },
      );
      record.officePeople = Array.from(uniquePeople.values());
      record.offices = record.officePeople.length;
    });

    return usage;
  }, [scheduleData, people]);

  // Filter and search spaces
  const filteredSpaces = useMemo(() => {
    let spaces = Array.isArray(spacesList)
      ? [...spacesList]
      : Object.entries(roomsData || {}).map(([id, data]) => ({
          id,
          ...data,
        }));

    // Only show active spaces in management list
    spaces = spaces.filter((s) => s.isActive !== false);

    // Apply building filter
    if (buildingFilter !== "all") {
      const target = buildingFilter.toUpperCase();
      spaces = spaces.filter((s) => {
        const normalized = normalizeSpaceRecord(s, s?.id || "");
        const rawCode = (normalized.buildingCode || "").toString().trim();
        const rawName = (normalized.buildingDisplayName || "")
          .toString()
          .trim();
        const resolved = resolveBuilding(rawCode) || resolveBuilding(rawName);
        const canonicalCode = (
          resolved?.code ||
          rawCode
        )
          .toString()
          .trim()
          .toUpperCase();
        return canonicalCode === target;
      });
    }

    // Apply type filter
    if (typeFilter !== "all") {
      spaces = spaces.filter((s) => s.type === typeFilter);
    }

    // Apply usage filter
    if (usageFilter !== "all") {
      spaces = spaces.filter((s) => {
        const key = getCanonicalSpaceKeyFromSpace(s);
        const usage = spaceUsage[key] || { scheduled: 0, offices: 0 };

        switch (usageFilter) {
          case "scheduled":
            return usage.scheduled > 0;
          case "office":
            return usage.offices > 0;
          case "unused":
            return usage.scheduled === 0 && usage.offices === 0;
          default:
            return true;
        }
      });
    }

    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      spaces = spaces.filter(
        (s) =>
          (s.spaceKey || "").toLowerCase().includes(query) ||
          (s.displayName || "").toLowerCase().includes(query) ||
          (s.spaceNumber || "").toLowerCase().includes(query) ||
          (s.buildingDisplayName || "").toLowerCase().includes(query),
      );
    }

    // Sort by building, then space number
    return spaces.sort((a, b) => {
      const aNorm = normalizeSpaceRecord(a, a?.id || "");
      const bNorm = normalizeSpaceRecord(b, b?.id || "");
      const buildingCompare = (aNorm.buildingCode || "").localeCompare(
        bNorm.buildingCode || "",
      );
      if (buildingCompare !== 0) return buildingCompare;
      return (aNorm.spaceNumber || "").localeCompare(
        bNorm.spaceNumber || "",
        undefined,
        { numeric: true },
      );
    });
  }, [
    roomsData,
    spacesList,
    buildingFilter,
    typeFilter,
    usageFilter,
    searchQuery,
    spaceUsage,
  ]);

  // Calculate statistics
  const stats = useMemo(() => {
    const allSpaces = Array.isArray(spacesList)
      ? spacesList
      : Object.values(roomsData || {});
    const activeSpaces = allSpaces.filter((s) => s.isActive !== false);

    const byType = {};
    Object.values(SPACE_TYPE).forEach((type) => {
      byType[type] = 0;
    });

    let withSchedules = 0;
    let withOffices = 0;
    let unused = 0;

    activeSpaces.forEach((s) => {
      const key = getCanonicalSpaceKeyFromSpace(s);
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
      unused,
    };
  }, [spacesList, roomsData, spaceUsage]);

  // Get unique canonical building options from actual data
  const dataBuildingOptions = useMemo(() => {
    const optionsByCode = new Map();
    const source =
      Array.isArray(spacesList) && spacesList.length > 0
        ? spacesList
        : Object.values(roomsData || {});

    source.forEach((room) => {
      if (!room || room.isActive === false) return;
      const normalized = normalizeSpaceRecord(room, room.id || "");
      const rawCode = (normalized.buildingCode || "").toString().trim();
      const rawName = (normalized.buildingDisplayName || "").toString().trim();
      const resolved = resolveBuilding(rawCode) || resolveBuilding(rawName);
      const code = (
        resolved?.code ||
        rawCode
      )
        .toString()
        .trim()
        .toUpperCase();
      if (!code) return;
      const displayName =
        resolved?.displayName ||
        resolveBuildingDisplayName(code) ||
        rawName ||
        code;
      if (!optionsByCode.has(code)) {
        optionsByCode.set(code, { code, displayName });
      }
    });

    return Array.from(optionsByCode.values()).sort((a, b) =>
      (a.displayName || "").localeCompare(b.displayName || ""),
    );
  }, [roomsData, spacesList]);

  const resetForm = useCallback(() => {
    setFormData({
      buildingCode: buildings[0]?.code || "",
      spaceNumber: "",
      type: SPACE_TYPE.CLASSROOM,
      capacity: "",
      equipment: [],
      notes: "",
    });
    setEquipmentInput("");
    setEditingSpace(null);
    setIsAddingNew(false);
    setIsBulkAdding(false);
  }, [buildings]);

  const handleEdit = useCallback((space) => {
    const normalized = normalizeSpaceRecord(space, space?.id || "");
    setFormData({
      buildingCode: (normalized.buildingCode || "").toUpperCase(),
      spaceNumber: normalized.spaceNumber || "",
      type: normalized.type || SPACE_TYPE.CLASSROOM,
      capacity: normalized.capacity || "",
      equipment: [...(normalized.equipment || [])],
      notes: normalized.notes || "",
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
      buildingCode: buildings[0]?.code || "",
      startNumber: "",
      endNumber: "",
      prefix: "",
      suffix: "",
      type: SPACE_TYPE.CLASSROOM,
    });
    setIsBulkAdding(true);
    setIsAddingNew(false);
    setEditingSpace(null);
  }, [buildings]);

  const handleAddEquipment = useCallback(() => {
    const item = equipmentInput.trim();
    if (!item) return;
    if (formData.equipment.includes(item)) {
      showNotification(
        "warning",
        "Duplicate Item",
        "This equipment item already exists.",
      );
      return;
    }
    setFormData((prev) => ({
      ...prev,
      equipment: [...prev.equipment, item],
    }));
    setEquipmentInput("");
  }, [equipmentInput, formData.equipment, showNotification]);

  const handleRemoveEquipment = useCallback((itemToRemove) => {
    setFormData((prev) => ({
      ...prev,
      equipment: prev.equipment.filter((e) => e !== itemToRemove),
    }));
  }, []);

  const validateForm = useCallback(() => {
    if (!formData.buildingCode) {
      showNotification(
        "warning",
        "Missing Building",
        "Please select a building.",
      );
      return false;
    }
    if (!formData.spaceNumber.trim()) {
      showNotification(
        "warning",
        "Missing Space Number",
        "Space number is required.",
      );
      return false;
    }
    return true;
  }, [formData, showNotification]);

  const handleSave = useCallback(async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      const rawBuildingCode = (formData.buildingCode || "").toString().trim();
      const spaceNumber = normalizeSpaceNumber(formData.spaceNumber.trim());
      const spaceKey = buildSpaceKey(rawBuildingCode, spaceNumber);
      if (!spaceKey) {
        showNotification(
          "warning",
          "Invalid Space",
          "Please provide a valid building and space number.",
        );
        return;
      }

      const parsedKey = parseSpaceKey(spaceKey);
      const buildingCode = (
        parsedKey?.buildingCode || rawBuildingCode
      ).toString().trim().toUpperCase();
      const resolvedBuilding =
        resolveBuilding(rawBuildingCode) || resolveBuilding(buildingCode);
      const buildingDisplayName =
        resolvedBuilding?.displayName ||
        resolveBuildingDisplayName(buildingCode) ||
        rawBuildingCode ||
        buildingCode;
      const buildingId = resolvedBuilding?.id || buildingCode.toLowerCase();

      const previousSpaceKey = editingSpace
        ? getCanonicalSpaceKeyFromSpace(editingSpace)
        : "";
      const isKeyChange =
        !!editingSpace && !!previousSpaceKey && previousSpaceKey !== spaceKey;

      if (isKeyChange) {
        const existing =
          spacesByKey instanceof Map
            ? spacesByKey.get(spaceKey)
            : spacesByKey?.[spaceKey];
        if (existing && existing.id !== editingSpace.id) {
          showNotification(
            "warning",
            "Duplicate Space",
            `${spaceKey} already exists.`,
          );
          return;
        }

        const existingById = roomsData?.[spaceKey];
        if (existingById && existingById.id !== editingSpace.id) {
          showNotification(
            "warning",
            "Duplicate Space",
            `${spaceKey} already exists.`,
          );
          return;
        }
      }

      const displayName = formatSpaceDisplayName({
        buildingCode,
        buildingDisplayName,
        spaceNumber,
      });

      if (isAddingNew) {
        const existing =
          spacesByKey instanceof Map
            ? spacesByKey.get(spaceKey)
            : spacesByKey?.[spaceKey];
        if (existing) {
          showNotification(
            "warning",
            "Duplicate Space",
            `${spaceKey} already exists.`,
          );
          return;
        }
      }

      // Build new space document
      const spaceDoc = {
        // Canonical fields (no legacy duplicates)
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
        displayName,

        // Timestamps
        updatedAt: new Date().toISOString(),
      };

      // Apply hygieneCore standardization for consistent data quality
      const standardizedDoc = standardizeRoom(spaceDoc);

      const validation = validateSpace(standardizedDoc);
      if (!validation.isValid) {
        showNotification(
          "warning",
          "Validation Failed",
          validation.errors.join(" "),
        );
        return;
      }

      if (isAddingNew) {
        standardizedDoc.createdAt = new Date().toISOString();
      }

      // If the canonical spaceKey changes, move the room document to the new deterministic ID.
      const shouldMoveDoc =
        !isAddingNew && isKeyChange && editingSpace?.id && editingSpace.id !== spaceKey;
      if (shouldMoveDoc) {
        standardizedDoc.createdAt =
          editingSpace?.createdAt || standardizedDoc.createdAt || new Date().toISOString();
        await setDoc(doc(db, "rooms", spaceKey), standardizedDoc, { merge: true });
        await deleteDoc(doc(db, "rooms", editingSpace.id));
      } else {
        await setDoc(doc(db, "rooms", spaceKey), standardizedDoc, { merge: true });
      }

      // If the canonical spaceKey changed, update references in schedules/people.
      if (isKeyChange) {
        const nowIso = new Date().toISOString();
        let schedulesUpdated = 0;
        let peopleUpdated = 0;

        // Update schedules that reference the previous key.
        const schedulesSnap = await getDocs(
          query(
            collection(db, "schedules"),
            where("spaceIds", "array-contains", previousSpaceKey),
          ),
        );
        if (!schedulesSnap.empty) {
          let batch = writeBatch(db);
          let ops = 0;
          for (const scheduleDoc of schedulesSnap.docs) {
            const s = scheduleDoc.data() || {};
            const currentIds = Array.isArray(s.spaceIds) ? s.spaceIds : [];
            if (!currentIds.includes(previousSpaceKey)) continue;

            const nextIdsRaw = currentIds.map((id) =>
              id === previousSpaceKey ? spaceKey : id,
            );
            const nextIds = [];
            const seen = new Set();
            nextIdsRaw
              .map((id) => (id || "").toString().trim())
              .filter(Boolean)
              .forEach((id) => {
                if (seen.has(id)) return;
                seen.add(id);
                nextIds.push(id);
              });

            const currentNames = Array.isArray(s.spaceDisplayNames)
              ? s.spaceDisplayNames
              : [];
            const idToName = new Map();
            currentIds.forEach((id, idx) => {
              const key = (id || "").toString().trim();
              if (!key) return;
              const name = (currentNames[idx] || "").toString().trim();
              if (!name) return;
              if (!idToName.has(key)) idToName.set(key, name);
            });
            if (displayName) idToName.set(spaceKey, displayName);

            const nextNames = nextIds.map((id) => idToName.get(id) || "");
            const hasAnyName = nextNames.some((n) => (n || "").trim());

            batch.update(doc(db, "schedules", scheduleDoc.id), {
              spaceIds: nextIds,
              spaceDisplayNames: hasAnyName ? nextNames : [],
              updatedAt: nowIso,
            });
            ops += 1;
            schedulesUpdated += 1;
            if (ops >= 450) {
              await batch.commit();
              batch = writeBatch(db);
              ops = 0;
            }
          }
          if (ops > 0) await batch.commit();
        }

        // Update people officeSpaceId / officeSpaceIds references.
        const peopleByPrimary = await getDocs(
          query(
            collection(db, "people"),
            where("officeSpaceId", "==", previousSpaceKey),
          ),
        );
        const peopleByList = await getDocs(
          query(
            collection(db, "people"),
            where("officeSpaceIds", "array-contains", previousSpaceKey),
          ),
        );
        const peopleDocs = new Map();
        peopleByPrimary.docs.forEach((d) => peopleDocs.set(d.id, d));
        peopleByList.docs.forEach((d) => peopleDocs.set(d.id, d));

        if (peopleDocs.size > 0) {
          let batch = writeBatch(db);
          let ops = 0;
          for (const personDoc of peopleDocs.values()) {
            const p = personDoc.data() || {};
            const updates = {};

            if ((p.officeSpaceId || "") === previousSpaceKey) {
              updates.officeSpaceId = spaceKey;
            }

            if (Array.isArray(p.officeSpaceIds) && p.officeSpaceIds.length > 0) {
              const nextRaw = p.officeSpaceIds.map((id) =>
                id === previousSpaceKey ? spaceKey : id,
              );
              const next = [];
              const seen = new Set();
              nextRaw
                .map((id) => (id || "").toString().trim())
                .filter(Boolean)
                .forEach((id) => {
                  if (seen.has(id)) return;
                  seen.add(id);
                  next.push(id);
                });
              updates.officeSpaceIds = next;
            }

            if (Object.keys(updates).length === 0) continue;
            updates.updatedAt = nowIso;
            batch.update(doc(db, "people", personDoc.id), updates);
            ops += 1;
            peopleUpdated += 1;
            if (ops >= 450) {
              await batch.commit();
              batch = writeBatch(db);
              ops = 0;
            }
          }
          if (ops > 0) await batch.commit();
        }

        showNotification(
          "success",
          "References Updated",
          `Updated ${schedulesUpdated} schedule${schedulesUpdated === 1 ? "" : "s"} and ${peopleUpdated} people record${peopleUpdated === 1 ? "" : "s"} to use ${spaceKey}.`,
        );
      }

      showNotification("success", "Space Saved", `${spaceKey} has been saved.`);
      resetForm();

      // Refresh rooms data
      if (refreshRooms) {
        await refreshRooms();
      }
    } catch (error) {
      console.error("Error saving space:", error);
      showNotification(
        "error",
        "Save Failed",
        "Failed to save space. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }, [
    formData,
    isAddingNew,
    editingSpace,
    buildings,
    validateForm,
    resetForm,
    showNotification,
    refreshRooms,
    spacesByKey,
    roomsData,
  ]);

  const handleBulkSave = useCallback(async () => {
    if (!bulkData.buildingCode) {
      showNotification(
        "warning",
        "Missing Building",
        "Please select a building.",
      );
      return;
    }

    const start = parseInt(bulkData.startNumber, 10);
    const end = parseInt(bulkData.endNumber, 10);

    if (isNaN(start) || isNaN(end)) {
      showNotification(
        "warning",
        "Invalid Range",
        "Please enter valid start and end numbers.",
      );
      return;
    }

    if (start > end) {
      showNotification(
        "warning",
        "Invalid Range",
        "Start number must be less than or equal to end number.",
      );
      return;
    }

    if (end - start > 50) {
      showNotification(
        "warning",
        "Range Too Large",
        "Maximum 50 spaces can be added at once.",
      );
      return;
    }

    setSaving(true);
    try {
      const rawBuildingCode = (bulkData.buildingCode || "").toString().trim();
      const sampleSpaceNumber = `${bulkData.prefix}${start}${bulkData.suffix}`.toUpperCase();
      const sampleKey = buildSpaceKey(rawBuildingCode, sampleSpaceNumber);
      const parsedKey = parseSpaceKey(sampleKey);
      const buildingCode = (
        parsedKey?.buildingCode || rawBuildingCode
      ).toString().trim().toUpperCase();
      const resolvedBuilding =
        resolveBuilding(rawBuildingCode) || resolveBuilding(buildingCode);
      const buildingDisplayName =
        resolvedBuilding?.displayName ||
        resolveBuildingDisplayName(buildingCode) ||
        rawBuildingCode ||
        buildingCode;
      const buildingId = resolvedBuilding?.id || buildingCode.toLowerCase();

      const spacesToCreate = [];
      const existingKeys = [];

      for (let num = start; num <= end; num++) {
        const spaceNumber =
          `${bulkData.prefix}${num}${bulkData.suffix}`.toUpperCase();
        const spaceKey = buildSpaceKey(buildingCode, spaceNumber);

        const existing =
          spacesByKey instanceof Map
            ? spacesByKey.get(spaceKey)
            : spacesByKey?.[spaceKey];

        if (existing) {
          existingKeys.push(spaceKey);
          continue;
        }

        const displayName = formatSpaceDisplayName({
          buildingCode,
          buildingDisplayName,
          spaceNumber,
        });

        spacesToCreate.push({
          docId: spaceKey,
          data: {
            spaceKey,
            spaceNumber,
            buildingCode,
            buildingDisplayName,
            buildingId,
            type: bulkData.type,
            capacity: null,
            equipment: [],
            notes: "",
            isActive: true,
            displayName,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        });
      }

      if (spacesToCreate.length === 0) {
        showNotification(
          "warning",
          "No New Spaces",
          "All spaces in this range already exist.",
        );
        return;
      }

      // Save all spaces with standardization
      for (const space of spacesToCreate) {
        const standardizedData = standardizeRoom(space.data);
        await setDoc(doc(db, "rooms", space.docId), standardizedData);
      }

      const message =
        existingKeys.length > 0
          ? `Created ${spacesToCreate.length} spaces. ${existingKeys.length} already existed.`
          : `Created ${spacesToCreate.length} spaces.`;

      showNotification("success", "Bulk Add Complete", message);
      resetForm();

      if (refreshRooms) {
        await refreshRooms();
      }
    } catch (error) {
      console.error("Error in bulk add:", error);
      showNotification(
        "error",
        "Bulk Add Failed",
        "Failed to create spaces. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }, [
    bulkData,
    buildings,
    spacesByKey,
    showNotification,
    resetForm,
    refreshRooms,
  ]);

  const handleDelete = useCallback(
    async (space) => {
      setSaving(true);
      try {
        await setDoc(
          doc(db, "rooms", space.id),
          {
            isActive: false,
            updatedAt: new Date().toISOString(),
            deletedAt: new Date().toISOString(),
          },
          { merge: true },
        );
        showNotification(
          "success",
          "Space Deactivated",
          `${space.spaceKey || "Space"} has been deactivated.`,
        );
        setDeleteConfirm(null);

        // Refresh rooms data
        if (refreshRooms) {
          await refreshRooms();
        }
      } catch (error) {
        console.error("Error deleting space:", error);
        showNotification(
          "error",
          "Deactivate Failed",
          "Failed to deactivate space. Please try again.",
        );
      } finally {
        setSaving(false);
      }
    },
    [showNotification, refreshRooms],
  );

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    try {
      if (refreshRooms) {
        await refreshRooms();
      }
      showNotification(
        "success",
        "Refreshed",
        "Spaces data has been refreshed.",
      );
    } catch (error) {
      showNotification(
        "error",
        "Refresh Failed",
        "Failed to refresh spaces data.",
      );
    } finally {
      setLoading(false);
    }
  }, [refreshRooms, showNotification]);

  const getSpaceTypeColor = (type) => {
    switch (type) {
      case SPACE_TYPE.CLASSROOM:
        return "bg-blue-100 text-blue-800";
      case SPACE_TYPE.OFFICE:
        return "bg-green-100 text-green-800";
      case SPACE_TYPE.LAB:
        return "bg-purple-100 text-purple-800";
      case SPACE_TYPE.STUDIO:
        return "bg-orange-100 text-orange-800";
      case SPACE_TYPE.CONFERENCE:
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const renderUsageIndicators = (space) => {
    const key = getCanonicalSpaceKeyFromSpace(space);
    const usage = spaceUsage[key] || { scheduled: 0, offices: 0 };

    return (
      <div className="flex items-center justify-center gap-2">
        {usage.scheduled > 0 && (
          <button
            type="button"
            onClick={() => setUsageDetail({ space, mode: "scheduled" })}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-xs hover:bg-blue-100 transition-colors"
            title={`${usage.scheduled} scheduled class${usage.scheduled !== 1 ? "es" : ""}`}
          >
            <Calendar size={10} />
            {usage.scheduled}
          </button>
        )}
        {usage.offices > 0 && (
          <button
            type="button"
            onClick={() => setUsageDetail({ space, mode: "office" })}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-50 text-green-700 rounded text-xs hover:bg-green-100 transition-colors"
            title={`${usage.offices} office assignment${usage.offices !== 1 ? "s" : ""}`}
          >
            <Briefcase size={10} />
            {usage.offices}
          </button>
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
          <h2 className="text-xl font-semibold text-gray-900">
            Space Management
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
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
              <div className="text-2xl font-bold text-baylor-green">
                {stats.total}
              </div>
              <div className="text-xs text-gray-500">Total Spaces</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {stats.withSchedules}
              </div>
              <div className="text-xs text-gray-500 flex items-center justify-center gap-1">
                <Calendar size={10} /> With Classes
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {stats.withOffices}
              </div>
              <div className="text-xs text-gray-500 flex items-center justify-center gap-1">
                <Briefcase size={10} /> As Offices
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-400">
                {stats.unused}
              </div>
              <div className="text-xs text-gray-500">Unused</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-500">
                {stats.byType[SPACE_TYPE.CLASSROOM] || 0}
              </div>
              <div className="text-xs text-gray-500">Classrooms</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-500">
                {stats.byType[SPACE_TYPE.OFFICE] || 0}
              </div>
              <div className="text-xs text-gray-500">Offices</div>
            </div>
          </div>
        )}
      </div>

      {/* Bulk Add Form */}
      {isBulkAdding && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Bulk Add Spaces
          </h3>
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
                onChange={(e) =>
                  setBulkData((prev) => ({
                    ...prev,
                    buildingCode: e.target.value,
                  }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-baylor-green/20 focus:border-baylor-green"
              >
                <option value="">Select building...</option>
                {buildings.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.displayName} ({b.code})
                  </option>
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
                onChange={(e) =>
                  setBulkData((prev) => ({
                    ...prev,
                    startNumber: e.target.value,
                  }))
                }
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
                onChange={(e) =>
                  setBulkData((prev) => ({
                    ...prev,
                    endNumber: e.target.value,
                  }))
                }
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
                onChange={(e) =>
                  setBulkData((prev) => ({ ...prev, prefix: e.target.value }))
                }
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
                onChange={(e) =>
                  setBulkData((prev) => ({ ...prev, suffix: e.target.value }))
                }
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
                onChange={(e) =>
                  setBulkData((prev) => ({ ...prev, type: e.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-baylor-green/20 focus:border-baylor-green"
              >
                {Object.values(SPACE_TYPE).map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Preview */}
          {bulkData.buildingCode &&
            bulkData.startNumber &&
            bulkData.endNumber && (
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">
                  <strong>Preview:</strong> Will create spaces from{" "}
                  <span className="font-mono text-baylor-green">
                    {bulkData.buildingCode}:{bulkData.prefix}
                    {bulkData.startNumber}
                    {bulkData.suffix}
                  </span>{" "}
                  to{" "}
                  <span className="font-mono text-baylor-green">
                    {bulkData.buildingCode}:{bulkData.prefix}
                    {bulkData.endNumber}
                    {bulkData.suffix}
                  </span>{" "}
                  (
                  {Math.max(
                    0,
                    parseInt(bulkData.endNumber, 10) -
                      parseInt(bulkData.startNumber, 10) +
                      1,
                  )}{" "}
                  spaces)
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
              {saving ? "Creating..." : "Create Spaces"}
            </button>
          </div>
        </div>
      )}

      {/* Add/Edit Form */}
      {(isAddingNew || editingSpace) && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            {isAddingNew
              ? "Add New Space"
              : `Edit Space: ${editingSpace?.spaceKey || editingSpace?.name}`}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Building */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Building <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.buildingCode}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    buildingCode: e.target.value,
                  }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-baylor-green/20 focus:border-baylor-green"
              >
                <option value="">Select building...</option>
                {buildings.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.displayName} ({b.code})
                  </option>
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
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    spaceNumber: e.target.value,
                  }))
                }
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
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, type: e.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-baylor-green/20 focus:border-baylor-green"
              >
                {Object.values(SPACE_TYPE).map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
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
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, capacity: e.target.value }))
                }
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
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, notes: e.target.value }))
                }
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
                onKeyDown={(e) =>
                  e.key === "Enter" &&
                  (e.preventDefault(), handleAddEquipment())
                }
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
                <span className="text-sm text-gray-400 italic">
                  No equipment listed
                </span>
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
              {saving ? "Saving..." : "Save Space"}
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
          {dataBuildingOptions.map(({ code, displayName }) => {
            return (
              <option key={code} value={code}>
                {displayName || code}
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
          {Object.values(SPACE_TYPE).map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
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
            {filteredSpaces.length} space
            {filteredSpaces.length !== 1 ? "s" : ""}
            {buildingFilter !== "all" ||
            typeFilter !== "all" ||
            usageFilter !== "all" ||
            searchQuery
              ? " (filtered)"
              : ""}
          </p>
        </div>

        {filteredSpaces.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <DoorOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>
              {searchQuery ||
              buildingFilter !== "all" ||
              typeFilter !== "all" ||
              usageFilter !== "all"
                ? "No spaces match your filters."
                : 'No spaces found. Click "Add Space" or "Bulk Add" to create some.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="university-table">
              <thead>
                <tr>
                  <th className="table-header-cell">Space Key</th>
                  <th className="table-header-cell">Building</th>
                  <th className="table-header-cell">Number</th>
                  <th className="table-header-cell">Type</th>
                  <th className="table-header-cell text-center">Capacity</th>
                  <th className="table-header-cell text-center">
                    <span
                      className="inline-flex items-center justify-center gap-1 w-full"
                      title="Shows how many scheduled classes (blue) and office assignments (green) are held in this space. Click a badge for details."
                    >
                      Usage
                      <HelpTooltip
                        content={
                          <div className="space-y-1">
                            <div className="font-medium">What “Usage” shows</div>
                            <div>Blue badge: number of scheduled classes in this space.</div>
                            <div>Green badge: number of office assignments in this space.</div>
                            <div className="opacity-90">Click a badge to view details.</div>
                          </div>
                        }
                        position="top"
                        variant="help"
                        size={14}
                        className="ml-0.5"
                      />
                    </span>
                  </th>
                  <th className="table-header-cell text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSpaces.map((space) => (
                  <tr key={space.id}>
                    <td className="px-4 py-3">
                      <span className="text-sm font-semibold text-baylor-green">
                        {space.spaceKey ||
                          `${space.buildingCode || space.building}:${space.spaceNumber || space.roomNumber}`}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {space.buildingDisplayName || space.building}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {space.spaceNumber || space.roomNumber}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 text-xs rounded-full ${getSpaceTypeColor(space.type)}`}
                      >
                        {space.type || "Unknown"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-gray-600">
                      {(() => {
                        const key = getCanonicalSpaceKeyFromSpace(space);
                        const usage = spaceUsage[key] || {};
                        const hasOfficeOccupant =
                          space.type === SPACE_TYPE.OFFICE &&
                          Array.isArray(usage.officePeople) &&
                          usage.officePeople.length > 0;
                        const effectiveCapacity = hasOfficeOccupant
                          ? 1
                          : space.capacity;

                        if (!effectiveCapacity) return "-";

                        if (hasOfficeOccupant) {
                          return (
                            <button
                              type="button"
                              onClick={() =>
                                setUsageDetail({ space, mode: "office" })
                              }
                              className="flex items-center justify-center gap-1 w-full hover:underline"
                              title="Occupied office (click to view occupant)"
                            >
                              <Users size={14} />
                              {effectiveCapacity}
                            </button>
                          );
                        }

                        return (
                          <span className="flex items-center justify-center gap-1">
                            <Users size={14} />
                            {effectiveCapacity}
                          </span>
                        );
                      })()}
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

      <SpaceUsageDetailModal
        isOpen={!!usageDetail}
        space={usageDetail?.space || null}
        usage={
          usageDetail?.space
            ? spaceUsage[getCanonicalSpaceKeyFromSpace(usageDetail.space)] ||
              null
            : null
        }
        mode={usageDetail?.mode || "scheduled"}
        onClose={() => setUsageDetail(null)}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteConfirm}
        title="Delete Space"
        message={`Deactivate "${deleteConfirm?.spaceKey || deleteConfirm?.name}"? References will be preserved, but the space will be hidden from active lists.`}
        confirmText="Deactivate"
        variant="danger"
        onConfirm={() => handleDelete(deleteConfirm)}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
};

export default SpaceManagement;
