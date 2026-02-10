import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  LOCATION_TYPE,
  applyBuildingConfig,
  buildSpaceKey,
  detectLocationType,
  formatSpaceDisplayName,
  normalizeBuildingConfig,
  normalizeSpaceNumber,
  parseMultiRoom,
  parseRoomLabel,
  parseSpaceKey,
  resolveBuilding,
  resolveBuildingDisplayName,
  slugify,
  validateSpaceKey,
} from "./locationService";

const MAX_BATCH_OPERATIONS = 450;

const DEFAULT_READ_TIMEOUT_MS = 120_000;
const DEFAULT_COMMIT_TIMEOUT_MS = 120_000;

const withTimeout = async (promise, ms, context) => {
  if (!ms || ms <= 0) return promise;
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const label = context ? ` (${context})` : "";
          reject(
            new Error(
              `Timed out${label}. This often means the browser lost connectivity to Firestore. Restore your connection and try again.`,
            ),
          );
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const assertLikelyOnline = () => {
  // navigator.onLine is imperfect, but it catches the obvious offline case.
  if (
    typeof navigator !== "undefined" &&
    navigator &&
    navigator.onLine === false
  ) {
    throw new Error(
      "You appear to be offline. Reconnect to the internet before running the migration.",
    );
  }
};

const createBatchWriter = ({
  timeoutMs = DEFAULT_COMMIT_TIMEOUT_MS,
  onCommit,
  label = "",
} = {}) => {
  let batch = writeBatch(db);
  let opCount = 0;
  let commitCount = 0;
  let currentLabel = label;

  const commit = async () => {
    if (opCount === 0) return;
    const committingOps = opCount;
    const committingLabel = currentLabel || "batch";
    await withTimeout(batch.commit(), timeoutMs, `committing ${committingLabel}`);
    commitCount += 1;
    onCommit?.({ label: committingLabel, ops: committingOps, commitCount });
    batch = writeBatch(db);
    opCount = 0;
  };

  const add = async (apply) => {
    apply(batch);
    opCount += 1;
    if (opCount >= MAX_BATCH_OPERATIONS) {
      await commit();
    }
  };

  const flush = async () => {
    await commit();
  };

  const setLabel = (next) => {
    currentLabel = (next || "").toString().trim();
  };

  return { add, flush, setLabel };
};

const dedupeOrdered = (values = []) => {
  const seen = new Set();
  const result = [];
  (Array.isArray(values) ? values : []).forEach((value) => {
    const v = (value || "").toString().trim();
    if (!v || seen.has(v)) return;
    seen.add(v);
    result.push(v);
  });
  return result;
};

const canonicalizeBuildingCode = (value) => {
  const slug = slugify((value || "").toString().trim());
  return slug ? slug.toUpperCase() : "";
};

const canonicalizeSpaceKey = (value) => {
  const raw = (value || "").toString().trim();
  if (!raw) return "";

  const parsedKey = parseSpaceKey(raw);
  if (parsedKey?.buildingCode && parsedKey?.spaceNumber) {
    const resolvedBuilding = resolveBuilding(parsedKey.buildingCode);
    const buildingCode =
      resolvedBuilding?.code ||
      canonicalizeBuildingCode(parsedKey.buildingCode);
    return buildSpaceKey(buildingCode, parsedKey.spaceNumber);
  }

  const parsedLabel = parseRoomLabel(raw);
  if (parsedLabel?.spaceKey) return parsedLabel.spaceKey;

  return "";
};

const isNonPhysicalSchedule = (schedule) => {
  if (!schedule) return true;
  if (schedule.isOnline) return true;
  const type = (schedule.locationType || "").toString().toLowerCase();
  if (["virtual", "none", "no_room"].includes(type)) return true;
  if (["room", "physical"].includes(type)) return false;

  const displayLabel = Array.isArray(schedule.spaceDisplayNames)
    ? schedule.spaceDisplayNames.join("; ")
    : schedule.locationLabel || "";
  return detectLocationType(displayLabel) !== LOCATION_TYPE.PHYSICAL;
};

const buildCanonicalDisplayNameForKey = (spaceKey) => {
  const parsed = parseSpaceKey(spaceKey);
  if (!parsed?.buildingCode || !parsed?.spaceNumber) return spaceKey;
  const buildingDisplayName = resolveBuildingDisplayName(parsed.buildingCode);
  return formatSpaceDisplayName({
    buildingCode: parsed.buildingCode,
    buildingDisplayName: buildingDisplayName || parsed.buildingCode,
    spaceNumber: parsed.spaceNumber,
  });
};

const deriveCanonicalSpaceKeyFromRoomDoc = ({ docId, data } = {}) => {
  const room = data || {};

  const candidates = [
    (room.spaceKey || "").toString().trim(),
    (docId || "").toString().trim(),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const parsed = parseSpaceKey(candidate);
    if (parsed?.buildingCode && parsed?.spaceNumber) {
      return canonicalizeSpaceKey(candidate);
    }
  }

  const buildingCodeRaw =
    room.buildingCode || room.buildingDisplayName || room.building || "";
  const spaceNumberRaw = room.spaceNumber || room.roomNumber || "";
  const resolvedBuilding = buildingCodeRaw ? resolveBuilding(String(buildingCodeRaw)) : null;
  const buildingCode = resolvedBuilding?.code || canonicalizeBuildingCode(buildingCodeRaw);
  const spaceNumber = normalizeSpaceNumber((spaceNumberRaw || "").toString());
  const fromFields = buildSpaceKey(buildingCode, spaceNumber);
  if (fromFields) return fromFields;

  const parsedLabel = parseRoomLabel(room.displayName || room.name || "");
  if (parsedLabel?.spaceKey) return parsedLabel.spaceKey;

  return "";
};

const mergeRoomDocs = ({ canonicalKey, docs = [] } = {}) => {
  if (!canonicalKey || !Array.isArray(docs) || docs.length === 0) return null;
  const now = new Date().toISOString();

  const base = docs.find((d) => d.id === canonicalKey) || docs[0];
  const merged = { ...(base?.data || {}) };

  const mergeArray = (key) => {
    const combined = new Set();
    docs.forEach((d) => {
      const arr = d?.data?.[key];
      (Array.isArray(arr) ? arr : []).forEach((v) => {
        const value = (v || "").toString().trim();
        if (value) combined.add(value);
      });
    });
    if (combined.size > 0) merged[key] = Array.from(combined);
  };

  // Prefer the most complete values across docs.
  docs.forEach((d) => {
    const data = d?.data || {};
    Object.entries(data).forEach(([key, value]) => {
      if (value === undefined) return;
      const current = merged[key];
      const empty =
        current === undefined ||
        current === null ||
        (typeof current === "string" && current.trim() === "") ||
        (Array.isArray(current) && current.length === 0);
      if (empty) merged[key] = value;
    });
  });

  // Normalize canonical identity fields.
  const parsed = parseSpaceKey(canonicalKey);
  const buildingCode = parsed?.buildingCode || "";
  const spaceNumber = normalizeSpaceNumber(parsed?.spaceNumber || "");
  merged.spaceKey = canonicalKey;
  merged.buildingCode = buildingCode;
  merged.spaceNumber = spaceNumber;
  merged.displayName =
    merged.displayName || buildCanonicalDisplayNameForKey(canonicalKey);
  merged.updatedAt = now;
  if (!merged.createdAt) merged.createdAt = now;

  mergeArray("equipment");
  mergeArray("features");

  // Keep the most permissive active status.
  const anyActive = docs.some((d) => d?.data?.isActive !== false);
  merged.isActive = anyActive;

  // Drop legacy duplicate fields to keep the room schema canonical/clean.
  delete merged.building;
  delete merged.roomNumber;
  delete merged.name;

  return merged;
};

const collectSpaceKeysFromSchedule = ({ schedule, roomIdToCanonical } = {}) => {
  if (!schedule || isNonPhysicalSchedule(schedule)) return [];

  const resolved = [];
  const add = (value) => {
    const raw = (value || "").toString().trim();
    if (!raw) return;
    const mapped = roomIdToCanonical.get(raw);
    const key = mapped || canonicalizeSpaceKey(raw);
    if (key) resolved.push(key);
  };

  const ids = Array.isArray(schedule.spaceIds) ? schedule.spaceIds : [];
  ids.forEach(add);

  if (resolved.length > 0) return dedupeOrdered(resolved);

  const roomLabel = Array.isArray(schedule.spaceDisplayNames)
    ? schedule.spaceDisplayNames.join("; ")
    : schedule.Room || schedule.room || schedule.locationLabel || "";
  const parsedRooms = parseMultiRoom(String(roomLabel || ""));
  (Array.isArray(parsedRooms?.spaceKeys) ? parsedRooms.spaceKeys : []).forEach(
    add,
  );

  return dedupeOrdered(resolved);
};

const collectOfficeSpaceKeysFromPerson = ({ person, roomIdToCanonical } = {}) => {
  if (!person) return [];
  if (person.hasNoOffice === true || person.isRemote === true) return [];

  const resolved = [];
  const add = (value) => {
    const raw = (value || "").toString().trim();
    if (!raw) return;
    const mapped = roomIdToCanonical.get(raw);
    const key = mapped || canonicalizeSpaceKey(raw);
    if (key) resolved.push(key);
  };

  const officeIds = Array.isArray(person.officeSpaceIds)
    ? person.officeSpaceIds
    : [];
  officeIds.forEach(add);

  if (resolved.length > 0) return dedupeOrdered(resolved);

  // Legacy single-field support for migration only.
  add(person.officeSpaceId);
  if (resolved.length > 0) return dedupeOrdered(resolved);

  const officeLabel =
    Array.isArray(person.offices) && person.offices.length > 0
      ? person.offices.join("; ")
      : person.office || "";
  const parsedRooms = parseMultiRoom(String(officeLabel || ""));
  (Array.isArray(parsedRooms?.spaceKeys) ? parsedRooms.spaceKeys : []).forEach(
    add,
  );

  return dedupeOrdered(resolved);
};

const loadBuildingSettings = async () => {
  assertLikelyOnline();
  const snap = await withTimeout(
    getDoc(doc(db, "settings", "buildings")),
    DEFAULT_READ_TIMEOUT_MS,
    "loading settings/buildings",
  );
  const normalized = normalizeBuildingConfig(snap.exists() ? snap.data() : {});
  return {
    ref: doc(db, "settings", "buildings"),
    exists: snap.exists(),
    raw: snap.exists() ? snap.data() : null,
    normalized,
  };
};

const buildCanonicalBuildingConfig = ({ normalized } = {}) => {
  const buildings = Array.isArray(normalized?.buildings) ? normalized.buildings : [];
  const cleaned = buildings
    .filter((b) => {
      const name = (b?.displayName || "").toString().trim();
      if (!name) return false;
      // Remove non-physical placeholders.
      return detectLocationType(name) === LOCATION_TYPE.PHYSICAL;
    })
    .map((b) => {
      const displayName = (b?.displayName || "").toString().trim();
      const originalCode = (b?.code || "").toString().trim();
      // Canonical rule: building codes must be slugified/uppercase and stable.
      // Prefer existing `code` (identity), otherwise derive from displayName.
      const code = canonicalizeBuildingCode(originalCode || displayName);
      const aliases = new Set(
        Array.isArray(b?.aliases)
          ? b.aliases
              .map((a) => (a || "").toString().trim())
              .filter(Boolean)
          : [],
      );
      // Preserve the previous code as an alias so imports/user input can still resolve.
      if (originalCode && originalCode !== code) aliases.add(originalCode);
      return {
        ...b,
        displayName,
        code,
        aliases: Array.from(aliases),
      };
    });

  const collisions = new Map();
  cleaned.forEach((b) => {
    const code = (b?.code || "").toString().trim();
    if (!code) return;
    const entry = collisions.get(code) || [];
    entry.push(b);
    collisions.set(code, entry);
  });

  const codeCollisions = Array.from(collisions.entries())
    .filter(([, list]) => list.length > 1)
    .map(([code, list]) => ({
      code,
      buildings: list.map((b) => ({
        id: b?.id || "",
        displayName: b?.displayName || "",
        originalCode: b?.code || "",
      })),
    }));

  const changes = cleaned
    .map((b) => {
      const original = buildings.find((x) => x?.id === b?.id);
      const before = (original?.code || "").toString().trim();
      const after = (b?.code || "").toString().trim();
      if (!before || !after || before === after) return null;
      return {
        id: b?.id || "",
        displayName: b?.displayName || "",
        from: before,
        to: after,
      };
    })
    .filter(Boolean);

  return {
    version: normalized?.version || 1,
    buildings: cleaned,
    changes,
    codeCollisions,
  };
};

const loadRooms = async () => {
  assertLikelyOnline();
  const snap = await withTimeout(
    getDocs(collection(db, "rooms")),
    DEFAULT_READ_TIMEOUT_MS,
    "loading rooms",
  );
  return snap.docs.map((docSnap) => ({ id: docSnap.id, data: docSnap.data() || {} }));
};

const loadSchedules = async () => {
  assertLikelyOnline();
  const snap = await withTimeout(
    getDocs(collection(db, "schedules")),
    DEFAULT_READ_TIMEOUT_MS,
    "loading schedules",
  );
  return snap.docs.map((docSnap) => ({ id: docSnap.id, data: docSnap.data() || {} }));
};

const loadPeople = async () => {
  assertLikelyOnline();
  const snap = await withTimeout(
    getDocs(collection(db, "people")),
    DEFAULT_READ_TIMEOUT_MS,
    "loading people",
  );
  return snap.docs.map((docSnap) => ({ id: docSnap.id, data: docSnap.data() || {} }));
};

const loadTemperatureCollection = async (name) => {
  assertLikelyOnline();
  const snap = await withTimeout(
    getDocs(collection(db, name)),
    DEFAULT_READ_TIMEOUT_MS,
    `loading ${name}`,
  );
  return snap.docs.map((docSnap) => ({ id: docSnap.id, data: docSnap.data() || {} }));
};

const parseTemperatureDocId = ({ collectionName, docId } = {}) => {
  const parts = String(docId || "").split("__");
  if (collectionName === "temperatureRoomSnapshots") {
    if (parts.length !== 4) return null;
    return {
      buildingKey: parts[0],
      spaceKey: parts[1],
      dateLocal: parts[2],
      snapshotId: parts[3],
    };
  }
  if (collectionName === "temperatureRoomAggregates") {
    if (parts.length !== 3) return null;
    return {
      buildingKey: parts[0],
      spaceKey: parts[1],
      dateLocal: parts[2],
    };
  }
  return null;
};

const buildTemperatureDocId = ({ collectionName, parsed, canonicalSpaceKey } = {}) => {
  if (!parsed || !canonicalSpaceKey) return "";
  if (collectionName === "temperatureRoomSnapshots") {
    return `${parsed.buildingKey}__${canonicalSpaceKey}__${parsed.dateLocal}__${parsed.snapshotId}`;
  }
  if (collectionName === "temperatureRoomAggregates") {
    return `${parsed.buildingKey}__${canonicalSpaceKey}__${parsed.dateLocal}`;
  }
  return "";
};

export const previewCanonicalLocationMigration = async () => {
  const buildingSettings = await loadBuildingSettings();
  const canonicalBuildings = buildCanonicalBuildingConfig({
    normalized: buildingSettings.normalized,
  });
  // Ensure room/schedule/person parsing resolves building aliases using the
  // canonical building codes we are about to enforce.
  applyBuildingConfig({
    version: canonicalBuildings.version,
    buildings: canonicalBuildings.buildings,
  });

  const rooms = await loadRooms();
  const roomIdToCanonical = new Map();
  const canonicalToRoomIds = new Map();
  const invalidRooms = [];
  const nonPhysicalRooms = [];

  rooms.forEach((room) => {
    const canonicalKey = deriveCanonicalSpaceKeyFromRoomDoc({
      docId: room.id,
      data: room.data,
    });
    const displayName = (room.data?.displayName || room.data?.name || "")
      .toString()
      .trim();
    const validation = canonicalKey ? validateSpaceKey(canonicalKey) : { valid: false };
    if (!canonicalKey || !validation.valid) {
      const type = detectLocationType(displayName);
      const item = {
        id: room.id,
        displayName,
        spaceKey: (room.data?.spaceKey || "").toString().trim(),
        reason: canonicalKey ? validation.error || "Invalid spaceKey" : "Unable to derive spaceKey",
      };
      if (type !== LOCATION_TYPE.PHYSICAL) nonPhysicalRooms.push(item);
      else invalidRooms.push(item);
      return;
    }

    roomIdToCanonical.set(room.id, canonicalKey);
    const rawSpaceKey = (room.data?.spaceKey || "").toString().trim();
    if (rawSpaceKey) roomIdToCanonical.set(rawSpaceKey, canonicalKey);

    const list = canonicalToRoomIds.get(canonicalKey) || [];
    list.push(room.id);
    canonicalToRoomIds.set(canonicalKey, list);
  });

  const roomMoves = [];
  const roomFieldFixes = [];
  canonicalToRoomIds.forEach((ids, canonicalKey) => {
    ids.forEach((id) => {
      if (id !== canonicalKey) {
        roomMoves.push({ from: id, to: canonicalKey });
      }
      const room = rooms.find((r) => r.id === id);
      const storedKey = (room?.data?.spaceKey || "").toString().trim();
      if (storedKey && storedKey !== canonicalKey) {
        roomFieldFixes.push({ id, from: storedKey, to: canonicalKey });
      }
    });
  });

  const roomCollisions = Array.from(canonicalToRoomIds.entries())
    .filter(([, ids]) => ids.length > 1)
    .map(([canonicalKey, ids]) => ({ canonicalKey, ids }));

  const schedules = await loadSchedules();
  const scheduleChanges = [];
  const scheduleReferenced = new Set();
  schedules.forEach((item) => {
    const schedule = { id: item.id, ...item.data };
    const nextSpaceIds = collectSpaceKeysFromSchedule({
      schedule,
      roomIdToCanonical,
    });
    nextSpaceIds.forEach((k) => scheduleReferenced.add(k));

    const current = Array.isArray(schedule.spaceIds)
      ? schedule.spaceIds.filter(Boolean).map((v) => v.toString().trim())
      : [];
    const next = nextSpaceIds;
    const changed =
      current.length !== next.length || current.some((v, idx) => v !== next[idx]);
    if (changed) {
      scheduleChanges.push({
        id: schedule.id,
        courseCode: (schedule.courseCode || "").toString(),
        section: (schedule.section || "").toString(),
        term: (schedule.term || "").toString(),
        instructorName: (schedule.instructorName || "").toString(),
        from: current,
        to: next,
      });
    }
  });

  const people = await loadPeople();
  const peopleChanges = [];
  const peopleReferenced = new Set();
  people.forEach((item) => {
    const person = { id: item.id, ...item.data };
    const nextOfficeSpaceIds = collectOfficeSpaceKeysFromPerson({
      person,
      roomIdToCanonical,
    });
    nextOfficeSpaceIds.forEach((k) => peopleReferenced.add(k));

    const current = Array.isArray(person.officeSpaceIds)
      ? person.officeSpaceIds.filter(Boolean).map((v) => v.toString().trim())
      : [];
    const next = nextOfficeSpaceIds;
    const changed =
      current.length !== next.length || current.some((v, idx) => v !== next[idx]);
    if (changed) {
      const name =
        `${person?.firstName || ""} ${person?.lastName || ""}`.trim() ||
        (person?.name || "").toString().trim() ||
        (person?.email || "").toString().trim();
      peopleChanges.push({
        id: person.id,
        name,
        email: (person.email || "").toString(),
        from: current,
        to: next,
      });
    }
  });

  const canonicalRoomKeys = new Set(Array.from(canonicalToRoomIds.keys()));
  const missingRoomKeys = Array.from(
    new Set([...scheduleReferenced, ...peopleReferenced]),
  ).filter((k) => !canonicalRoomKeys.has(k));

  const temperaturePlan = {
    temperatureDevices: { updates: 0 },
    temperatureImports: { updates: 0 },
    temperatureRoomSnapshots: { moves: 0 },
    temperatureRoomAggregates: { moves: 0 },
    temperatureBuildingSettings: { updates: 0 },
  };

  const tempDevices = await loadTemperatureCollection("temperatureDevices");
  tempDevices.forEach((device) => {
    const key =
      device.data?.mapping?.spaceKey || device.data?.spaceKey || "";
    const canonical = canonicalizeSpaceKey(key);
    if (key && canonical && canonical !== key) temperaturePlan.temperatureDevices.updates += 1;
  });

  const tempImports = await loadTemperatureCollection("temperatureImports");
  tempImports.forEach((imp) => {
    const key = imp.data?.spaceKey || "";
    const canonical = canonicalizeSpaceKey(key);
    if (key && canonical && canonical !== key) temperaturePlan.temperatureImports.updates += 1;
  });

  const snapshots = await loadTemperatureCollection("temperatureRoomSnapshots");
  snapshots.forEach((snap) => {
    const parsed = parseTemperatureDocId({
      collectionName: "temperatureRoomSnapshots",
      docId: snap.id,
    });
    if (!parsed?.spaceKey) return;
    const canonical = canonicalizeSpaceKey(parsed.spaceKey);
    const nextId = buildTemperatureDocId({
      collectionName: "temperatureRoomSnapshots",
      parsed,
      canonicalSpaceKey: canonical,
    });
    if (canonical && nextId && nextId !== snap.id) temperaturePlan.temperatureRoomSnapshots.moves += 1;
  });

  const aggregates = await loadTemperatureCollection("temperatureRoomAggregates");
  aggregates.forEach((agg) => {
    const parsed = parseTemperatureDocId({
      collectionName: "temperatureRoomAggregates",
      docId: agg.id,
    });
    if (!parsed?.spaceKey) return;
    const canonical = canonicalizeSpaceKey(parsed.spaceKey);
    const nextId = buildTemperatureDocId({
      collectionName: "temperatureRoomAggregates",
      parsed,
      canonicalSpaceKey: canonical,
    });
    if (canonical && nextId && nextId !== agg.id) temperaturePlan.temperatureRoomAggregates.moves += 1;
  });

  const buildingSettingsDocs = await loadTemperatureCollection(
    "temperatureBuildingSettings",
  );
  buildingSettingsDocs.forEach((docSnap) => {
    const markers = docSnap.data?.markers;
    if (!markers || typeof markers !== "object") return;
    const keys = Object.keys(markers);
    const nextKeys = keys
      .map((k) => canonicalizeSpaceKey(k) || k)
      .filter(Boolean);
    const changed =
      keys.length !== nextKeys.length || keys.some((k, idx) => k !== nextKeys[idx]);
    if (changed) temperaturePlan.temperatureBuildingSettings.updates += 1;
  });

  return {
    buildings: {
      changes: canonicalBuildings.changes,
      collisions: canonicalBuildings.codeCollisions,
      total: canonicalBuildings.buildings.length,
    },
    rooms: {
      total: rooms.length,
      invalidRooms,
      nonPhysicalRooms,
      moves: roomMoves,
      fieldFixes: roomFieldFixes,
      collisions: roomCollisions,
      missingRoomKeys,
    },
    schedules: {
      total: schedules.length,
      updates: scheduleChanges,
    },
    people: {
      total: people.length,
      updates: peopleChanges,
    },
    temperature: temperaturePlan,
  };
};

export const applyCanonicalLocationMigration = async ({ onProgress } = {}) => {
  const startedAt = Date.now();
  const progress = (patch) => {
    try {
      onProgress?.({
        startedAt,
        at: Date.now(),
        ...(patch || {}),
      });
    } catch {
      // Never let progress reporting break a migration.
    }
  };

  progress({ step: "preview", message: "Validating preview (reads)..." });
  const preview = await previewCanonicalLocationMigration();
  if (preview.buildings.collisions.length > 0) {
    throw new Error(
      `Canonical building code collisions detected: ${preview.buildings.collisions
        .map((c) => c.code)
        .join(", ")}. Resolve in settings/buildings before migrating.`,
    );
  }
  if (preview.rooms.invalidRooms.length > 0) {
    throw new Error(
      `Found ${preview.rooms.invalidRooms.length} room records that cannot be canonicalized. Fix or delete them before migrating.`,
    );
  }

  const batchWriter = createBatchWriter({
    label: "rooms",
    onCommit: (info) =>
      progress({
        step: "rooms",
        message: `Committed ${info.ops} ops (${info.label})`,
      }),
  });
  const now = new Date().toISOString();

  // 1) Canonicalize building settings.
  progress({ step: "buildings", message: "Updating settings/buildings..." });
  const buildingSettings = await loadBuildingSettings();
  const canonicalBuildings = buildCanonicalBuildingConfig({
    normalized: buildingSettings.normalized,
  });
  await withTimeout(
    setDoc(
      doc(db, "settings", "buildings"),
      {
        version: canonicalBuildings.version,
        buildings: canonicalBuildings.buildings,
        updatedAt: now,
        createdAt: buildingSettings.raw?.createdAt || now,
      },
      { merge: true },
    ),
    DEFAULT_COMMIT_TIMEOUT_MS,
    "writing settings/buildings",
  );
  applyBuildingConfig({
    version: canonicalBuildings.version,
    buildings: canonicalBuildings.buildings,
  });

  // 2) Canonicalize rooms (docId == spaceKey).
  progress({ step: "rooms", message: "Canonicalizing rooms..." });
  const rooms = await loadRooms();
  const roomIdToCanonical = new Map();
  const canonicalToDocs = new Map();
  const nonPhysicalRoomIds = new Set(
    preview.rooms.nonPhysicalRooms.map((r) => r.id),
  );

  rooms.forEach((room) => {
    if (nonPhysicalRoomIds.has(room.id)) return;
    const canonicalKey = deriveCanonicalSpaceKeyFromRoomDoc({
      docId: room.id,
      data: room.data,
    });
    if (!canonicalKey) return;
    const list = canonicalToDocs.get(canonicalKey) || [];
    list.push(room);
    canonicalToDocs.set(canonicalKey, list);
    roomIdToCanonical.set(room.id, canonicalKey);
    const rawSpaceKey = (room.data?.spaceKey || "").toString().trim();
    if (rawSpaceKey) roomIdToCanonical.set(rawSpaceKey, canonicalKey);
  });

  for (const [canonicalKey, docs] of canonicalToDocs.entries()) {
    const merged = mergeRoomDocs({ canonicalKey, docs });
    if (!merged) continue;

    // Write canonical doc.
    await batchWriter.add((batch) => {
      batch.set(doc(db, "rooms", canonicalKey), merged, { merge: true });
    });

    // Delete non-canonical duplicates.
    for (const d of docs) {
      if (d.id === canonicalKey) continue;
      await batchWriter.add((batch) => {
        batch.delete(doc(db, "rooms", d.id));
      });
    }
  }

  // Delete non-physical placeholder room docs.
  for (const id of nonPhysicalRoomIds) {
    await batchWriter.add((batch) => {
      batch.delete(doc(db, "rooms", id));
    });
  }

  await batchWriter.flush();

  // 3) Ensure referenced spaces exist.
  progress({ step: "seed", message: "Seeding missing referenced spaces..." });
  const canonicalRoomKeys = new Set(Array.from(canonicalToDocs.keys()));
  const scheduleReferenced = new Set();
  const peopleReferenced = new Set();

  const schedules = await loadSchedules();
  schedules.forEach((item) => {
    const schedule = { id: item.id, ...item.data };
    collectSpaceKeysFromSchedule({ schedule, roomIdToCanonical }).forEach((k) =>
      scheduleReferenced.add(k),
    );
  });

  const people = await loadPeople();
  people.forEach((item) => {
    const person = { id: item.id, ...item.data };
    collectOfficeSpaceKeysFromPerson({ person, roomIdToCanonical }).forEach((k) =>
      peopleReferenced.add(k),
    );
  });

  const missingRoomKeys = Array.from(new Set([...scheduleReferenced, ...peopleReferenced]))
    .filter((k) => k && !canonicalRoomKeys.has(k));

  const seedBatchWriter = createBatchWriter({
    label: "seed",
    onCommit: (info) =>
      progress({
        step: "seed",
        message: `Committed ${info.ops} ops (${info.label})`,
      }),
  });
  for (const key of missingRoomKeys) {
    const parsed = parseSpaceKey(key);
    if (!parsed?.buildingCode || !parsed?.spaceNumber) continue;
    const isOffice = peopleReferenced.has(key);
    const payload = {
      spaceKey: key,
      buildingCode: parsed.buildingCode,
      spaceNumber: normalizeSpaceNumber(parsed.spaceNumber),
      displayName: buildCanonicalDisplayNameForKey(key),
      type: isOffice ? "Office" : "Classroom",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    await seedBatchWriter.add((batch) => {
      batch.set(doc(db, "rooms", key), payload, { merge: true });
    });
  }
  await seedBatchWriter.flush();

  // 4) Rewrite schedules to canonical spaceIds.
  progress({ step: "schedules", message: "Rewriting schedules..." });
  const scheduleBatchWriter = createBatchWriter({
    label: "schedules",
    onCommit: (info) =>
      progress({
        step: "schedules",
        message: `Committed ${info.ops} ops (${info.label})`,
      }),
  });
  let schedulesTouched = 0;
  for (const item of schedules) {
    const schedule = { id: item.id, ...item.data };
    const nextSpaceIds = collectSpaceKeysFromSchedule({
      schedule,
      roomIdToCanonical,
    });
    const nextDisplayNames = nextSpaceIds.map(buildCanonicalDisplayNameForKey);

    const payload = isNonPhysicalSchedule(schedule)
      ? { spaceIds: [], spaceDisplayNames: [], updatedAt: now }
      : {
          spaceIds: nextSpaceIds,
          spaceDisplayNames: nextDisplayNames,
          updatedAt: now,
        };

    const current = Array.isArray(schedule.spaceIds)
      ? schedule.spaceIds.filter(Boolean).map((v) => v.toString().trim())
      : [];
    const currentNames = Array.isArray(schedule.spaceDisplayNames)
      ? schedule.spaceDisplayNames.filter(Boolean)
      : [];
    const changedIds =
      current.length !== payload.spaceIds.length ||
      current.some((v, idx) => v !== payload.spaceIds[idx]);
    const changedNames =
      currentNames.length !== payload.spaceDisplayNames.length ||
      currentNames.some((v, idx) => v !== payload.spaceDisplayNames[idx]);
    if (!changedIds && !changedNames) continue;

    await scheduleBatchWriter.add((batch) => {
      batch.update(doc(db, "schedules", schedule.id), payload);
    });
    schedulesTouched += 1;
    if (schedulesTouched % 250 === 0) {
      progress({
        step: "schedules",
        message: `Queued ${schedulesTouched} schedule update(s)...`,
      });
    }
  }
  await scheduleBatchWriter.flush();

  // 5) Rewrite people officeSpaceIds (and remove legacy fields).
  progress({ step: "people", message: "Rewriting people office references..." });
  const peopleBatchWriter = createBatchWriter({
    label: "people",
    onCommit: (info) =>
      progress({
        step: "people",
        message: `Committed ${info.ops} ops (${info.label})`,
      }),
  });
  let peopleTouched = 0;
  for (const item of people) {
    const person = { id: item.id, ...item.data };
    const nextOfficeSpaceIds = collectOfficeSpaceKeysFromPerson({
      person,
      roomIdToCanonical,
    });

    const offices = nextOfficeSpaceIds.map(buildCanonicalDisplayNameForKey);
    const payload = {
      // Canonical: references are authoritative.
      officeSpaceIds: nextOfficeSpaceIds,
      // Denormalized display helpers (derived, never free-text).
      offices,
      officeSpaceId: nextOfficeSpaceIds[0] || "",
      office: offices[0] || "",
      updatedAt: now,
    };

    const current = Array.isArray(person.officeSpaceIds)
      ? person.officeSpaceIds.filter(Boolean).map((v) => v.toString().trim())
      : [];
    const changed =
      current.length !== nextOfficeSpaceIds.length ||
      current.some((v, idx) => v !== nextOfficeSpaceIds[idx]);
    if (
      !changed &&
      person.officeSpaceId === payload.officeSpaceId &&
      person.office === payload.office &&
      Array.isArray(person.offices) &&
      person.offices.length === offices.length &&
      person.offices.every((v, idx) => (v || "").toString() === (offices[idx] || "").toString())
    ) {
      continue;
    }

    await peopleBatchWriter.add((batch) => {
      batch.update(doc(db, "people", person.id), payload);
    });
    peopleTouched += 1;
    if (peopleTouched % 250 === 0) {
      progress({
        step: "people",
        message: `Queued ${peopleTouched} people update(s)...`,
      });
    }
  }
  await peopleBatchWriter.flush();

  // 6) Temperature collections.
  progress({ step: "temperature", message: "Updating temperature collections..." });
  const temperatureBatchWriter = createBatchWriter({
    label: "temperature",
    onCommit: (info) =>
      progress({
        step: "temperature",
        message: `Committed ${info.ops} ops (${info.label})`,
      }),
  });

  const tempDevices = await loadTemperatureCollection("temperatureDevices");
  for (const device of tempDevices) {
    const existing = device.data?.mapping?.spaceKey || device.data?.spaceKey || "";
    if (!existing) continue;
    const canonical = canonicalizeSpaceKey(existing);
    if (!canonical || canonical === existing) continue;
    await temperatureBatchWriter.add((batch) => {
      if (device.data?.mapping && typeof device.data.mapping === "object") {
        batch.update(doc(db, "temperatureDevices", device.id), {
          mapping: {
            ...device.data.mapping,
            spaceKey: canonical,
          },
          updatedAt: now,
        });
      } else {
        batch.update(doc(db, "temperatureDevices", device.id), {
          spaceKey: canonical,
          updatedAt: now,
        });
      }
    });
  }

  const tempImports = await loadTemperatureCollection("temperatureImports");
  for (const imp of tempImports) {
    const existing = imp.data?.spaceKey || "";
    if (!existing) continue;
    const canonical = canonicalizeSpaceKey(existing);
    if (!canonical || canonical === existing) continue;
    await temperatureBatchWriter.add((batch) => {
      batch.update(doc(db, "temperatureImports", imp.id), {
        spaceKey: canonical,
        updatedAt: now,
      });
    });
  }

  await temperatureBatchWriter.flush();

  const moveTemperatureDocs = async (collectionName) => {
    progress({
      step: "temperature",
      message: `Migrating ${collectionName} doc ids...`,
    });
    const items = await loadTemperatureCollection(collectionName);
    const mover = createBatchWriter({
      label: collectionName,
      onCommit: (info) =>
        progress({
          step: "temperature",
          message: `Committed ${info.ops} ops (${info.label})`,
        }),
    });
    for (const item of items) {
      const parsed = parseTemperatureDocId({
        collectionName,
        docId: item.id,
      });
      if (!parsed?.spaceKey) continue;
      const canonical = canonicalizeSpaceKey(parsed.spaceKey);
      if (!canonical) continue;
      const nextId = buildTemperatureDocId({
        collectionName,
        parsed,
        canonicalSpaceKey: canonical,
      });
      if (!nextId || nextId === item.id) {
        // Still update stored field if present.
        if ((item.data?.spaceKey || "") !== canonical) {
          await mover.add((batch) => {
            batch.update(doc(db, collectionName, item.id), {
              spaceKey: canonical,
              updatedAt: now,
            });
          });
        }
        continue;
      }

      await mover.add((batch) => {
        batch.set(doc(db, collectionName, nextId), {
          ...item.data,
          spaceKey: canonical,
          updatedAt: now,
        });
      });
      await mover.add((batch) => {
        batch.delete(doc(db, collectionName, item.id));
      });
    }
    await mover.flush();
  };

  await moveTemperatureDocs("temperatureRoomSnapshots");
  await moveTemperatureDocs("temperatureRoomAggregates");

  progress({
    step: "temperature",
    message: "Updating temperatureBuildingSettings markers...",
  });
  const tempBuildingSettings = await loadTemperatureCollection(
    "temperatureBuildingSettings",
  );
  const settingsBatch = createBatchWriter({
    label: "temperatureBuildingSettings",
    onCommit: (info) =>
      progress({
        step: "temperature",
        message: `Committed ${info.ops} ops (${info.label})`,
      }),
  });
  for (const setting of tempBuildingSettings) {
    const markers = setting.data?.markers;
    if (!markers || typeof markers !== "object") continue;
    const nextMarkers = {};
    let changed = false;
    Object.entries(markers).forEach(([key, value]) => {
      const canonical = canonicalizeSpaceKey(key) || key;
      if (canonical !== key) changed = true;
      const marker = value && typeof value === "object" ? { ...value } : value;
      if (marker && typeof marker === "object" && marker.spaceKey) {
        const markerCanonical = canonicalizeSpaceKey(marker.spaceKey);
        if (markerCanonical && markerCanonical !== marker.spaceKey) {
          marker.spaceKey = markerCanonical;
          changed = true;
        }
      }
      nextMarkers[canonical] = marker;
    });
    if (!changed) continue;
    await settingsBatch.add((batch) => {
      batch.update(doc(db, "temperatureBuildingSettings", setting.id), {
        markers: nextMarkers,
        updatedAt: now,
      });
    });
  }
  await settingsBatch.flush();

  // 7) Set system version marker.
  progress({ step: "finalize", message: "Writing settings/app marker..." });
  await withTimeout(
    updateDoc(doc(db, "settings", "app"), {
      locationModelVersion: 2,
      locationModelUpdatedAt: now,
    }).catch(async () => {
      await setDoc(
        doc(db, "settings", "app"),
        {
          locationModelVersion: 2,
          locationModelUpdatedAt: now,
          updatedAt: now,
          createdAt: now,
        },
        { merge: true },
      );
    }),
    DEFAULT_COMMIT_TIMEOUT_MS,
    "writing settings/app",
  );

  progress({ step: "done", message: "Migration complete." });

  return {
    buildingsUpdated: preview.buildings.changes.length,
    roomsMoved: preview.rooms.moves.length,
    roomsMerged: preview.rooms.collisions.length,
    roomsSeeded: missingRoomKeys.length,
    schedulesUpdated: preview.schedules.updates.length,
    peopleUpdated: preview.people.updates.length,
    temperature: preview.temperature,
  };
};
