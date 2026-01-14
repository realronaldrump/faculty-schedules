/**
 * Location Service - Centralized Building and Space Management
 *
 * This is the SINGLE SOURCE OF TRUTH for all location-related operations.
 * All building/room/office parsing, normalization, and resolution must go through this service.
 *
 * Key Concepts:
 * - Building: A physical structure with a stable buildingId, code, displayName, and aliases
 * - Space: A room/office/lab within a building (unified model for classrooms + offices)
 * - SpaceKey: Unique identifier format: buildingCode:spaceNumber (e.g., "GOEBEL:101")
 * - Virtual/None: Handled as location types, NOT as space records
 *
 * Design Principles:
 * - Idempotent operations (same input always produces same output)
 * - No creation of "combined multi-room" records
 * - Clear separation between parsing and resolution
 * - Actionable error messages
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Location types - determines how to interpret and store location data
 */
export const LOCATION_TYPE = Object.freeze({
  PHYSICAL: 'physical',    // Regular room/space with buildingId + spaceNumber
  VIRTUAL: 'virtual',      // Online, Zoom, etc. - no physical location
  NONE: 'none',            // No room needed, TBA, etc.
  UNKNOWN: 'unknown'       // Could not be parsed
});

/**
 * Space types - classification of physical spaces
 */
export const SPACE_TYPE = Object.freeze({
  CLASSROOM: 'Classroom',
  OFFICE: 'Office',
  LAB: 'Lab',
  STUDIO: 'Studio',
  CONFERENCE: 'Conference',
  OTHER: 'Other'
});

/**
 * Patterns that indicate virtual/no-room locations
 */
const VIRTUAL_PATTERNS = [
  /^online$/i,
  /online\s*[-–—]/i,
  /\bonline\b/i,
  /^zoom$/i,
  /\bzoom\b/i,
  /^virtual$/i,
  /\bvirtual\b/i,
  /^synchronous\s+online$/i,
  /^asynchronous$/i,
  /^remote$/i
];

const NO_ROOM_PATTERNS = [
  /^tba$/i,
  /^to\s+be\s+(announced|assigned)$/i,
  /^no\s+room\s+needed$/i,
  /^no\s+room$/i,
  /^\(none\s+assigned\)$/i,
  /^none\s+assigned$/i,
  /^n\/?a$/i,
  /^general\s+assignment/i,
  /^off\s+campus$/i,
  /^arranged$/i
];

/**
 * Multi-room separator patterns
 */
const MULTI_ROOM_SEPARATORS = /\s*[;,\n]\s*|\s*\/\s*(?=\D)|\s+and\s+/i;

const expandSharedRoomNumbers = (label) => {
  if (!label || typeof label !== 'string' || !label.includes('/')) return [label];

  const firstDigitIndex = label.search(/\d/);
  if (firstDigitIndex === -1) return [label];

  const prefix = label.slice(0, firstDigitIndex).trim();
  const suffix = label.slice(firstDigitIndex).trim();
  if (!suffix.includes('/')) return [label];

  const tokens = suffix.split('/').map((token) => token.trim()).filter(Boolean);
  if (tokens.length < 2 || !tokens.every((token) => /\d/.test(token))) {
    return [label];
  }

  const prefixWithSpace = prefix ? `${prefix} ` : '';
  return tokens.map((token) => `${prefixWithSpace}${token}`);
};

// ============================================================================
// INTERNAL STATE (Building Configuration Cache)
// ============================================================================

let buildingConfig = {
  version: 1,
  buildings: [],
  buildingsById: new Map(),
  buildingsByCode: new Map(),
  aliasToBuilding: new Map()
};

// ============================================================================
// CONFIGURATION MANAGEMENT
// ============================================================================

/**
 * Apply building configuration from Firestore
 * @param {Object} config - Building configuration object
 */
export const applyBuildingConfig = (config) => {
  const buildings = Array.isArray(config?.buildings) ? config.buildings : [];

  // Build lookup maps
  const buildingsById = new Map();
  const buildingsByCode = new Map();
  const aliasToBuilding = new Map();

  buildings.forEach((building) => {
    if (!building || building.isActive === false) return;

    const id = building.id || building.code;
    if (id) buildingsById.set(id, building);
    if (building.code) {
      buildingsByCode.set(building.code.toUpperCase(), building);
      aliasToBuilding.set(building.code.toLowerCase(), building);
    }
    if (building.displayName) {
      aliasToBuilding.set(building.displayName.toLowerCase(), building);
    }
    (building.aliases || []).forEach((alias) => {
      if (alias) aliasToBuilding.set(alias.toLowerCase(), building);
    });
  });

  buildingConfig = {
    version: config?.version || 1,
    buildings,
    buildingsById,
    buildingsByCode,
    aliasToBuilding
  };
};

/**
 * Get current building configuration
 */
export const getBuildingConfig = () => buildingConfig;

/**
 * Get list of active buildings for UI dropdowns
 */
export const getActiveBuildings = () => {
  return buildingConfig.buildings.filter((b) => b.isActive !== false);
};

/**
 * Get canonical building list for dropdowns
 */
export const getCanonicalBuildingList = () => {
  return getActiveBuildings()
    .map((b) => b.displayName)
    .filter(Boolean)
    .sort();
};

// ============================================================================
// NORMALIZATION FUNCTIONS
// ============================================================================

/**
 * Slugify a string for use as part of a key
 * @param {string} value - Raw string
 * @returns {string} Normalized slug (lowercase, underscores)
 */
export const slugify = (value) => {
  if (!value || typeof value !== 'string') return '';
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
};

/**
 * Normalize a space number (room number)
 * Handles formats: "101", "103.06", "205A", "103-A"
 * @param {string} value - Raw room/space number
 * @returns {string} Normalized space number (uppercase, no extra spaces)
 */
export const normalizeSpaceNumber = (value) => {
  if (!value || typeof value !== 'string') return '';
  return value.toString().replace(/\s+/g, '').toUpperCase();
};

/**
 * Detect the type of location from a raw string
 * @param {string} raw - Raw location string
 * @returns {string} LOCATION_TYPE value
 */
export const detectLocationType = (raw) => {
  if (!raw || typeof raw !== 'string') return LOCATION_TYPE.NONE;

  const trimmed = raw.trim();
  if (!trimmed) return LOCATION_TYPE.NONE;

  // Check virtual patterns
  for (const pattern of VIRTUAL_PATTERNS) {
    if (pattern.test(trimmed)) return LOCATION_TYPE.VIRTUAL;
  }

  // Check no-room patterns
  for (const pattern of NO_ROOM_PATTERNS) {
    if (pattern.test(trimmed)) return LOCATION_TYPE.NONE;
  }

  return LOCATION_TYPE.PHYSICAL;
};

/**
 * Check if a location string represents a virtual/online location
 */
export const isVirtualLocation = (raw) => {
  return detectLocationType(raw) === LOCATION_TYPE.VIRTUAL;
};

/**
 * Check if a location string represents "no room needed" / TBA
 */
export const isNoRoomLocation = (raw) => {
  return detectLocationType(raw) === LOCATION_TYPE.NONE;
};

/**
 * Check if a location string should be skipped (not a physical room)
 */
export const isSkippableLocation = (raw) => {
  const type = detectLocationType(raw);
  return type !== LOCATION_TYPE.PHYSICAL;
};

// ============================================================================
// PARSING FUNCTIONS
// ============================================================================

/**
 * Split a multi-room string into individual room strings
 * Handles: semicolon, newline, "and", forward slash (when not part of room number)
 *
 * @param {string} value - Raw room string (possibly containing multiple rooms)
 * @returns {string[]} Array of individual room strings
 *
 * @example
 * splitMultiRoom("Goebel 101; Goebel 109") // ["Goebel 101", "Goebel 109"]
 * splitMultiRoom("FCS 211 and FCS 213") // ["FCS 211", "FCS 213"]
 */
export const splitMultiRoom = (value) => {
  if (!value || typeof value !== 'string') return [];

  const parts = value
    .split(MULTI_ROOM_SEPARATORS)
    .map((part) => part.trim())
    .filter(Boolean);

  const expanded = parts.flatMap((part) => expandSharedRoomNumbers(part));

  // Deduplicate while preserving order
  return [...new Set(expanded)];
};

/**
 * Extract room/space number from a room label string
 * Handles: "Goebel 101" → "101", "FCS 103.06" → "103.06", "Jones 205A" → "205A"
 *
 * @param {string} label - Full room label
 * @returns {string} Extracted space number, or empty string if not found
 */
export const extractSpaceNumber = (label) => {
  if (!label || typeof label !== 'string') return '';

  const trimmed = label.trim();
  if (!trimmed) return '';

  // Handle room strings without spaces (just a number)
  if (/^\d+[A-Za-z]?$/.test(trimmed)) return normalizeSpaceNumber(trimmed);

  // Clean up and split
  const cleaned = trimmed.replace(/\s+/g, ' ').trim();

  // Try to match decimal room numbers first (e.g., 103.06, 103.06A)
  const decimalMatch = cleaned.match(/(\d{2,4}\.\d{1,3}[A-Za-z]?)\s*$/);
  if (decimalMatch?.[1]) return normalizeSpaceNumber(decimalMatch[1]);

  // Match standard room numbers (e.g., 101, 205A, 302-B)
  const simpleMatch = cleaned.match(/(\d{2,4}[A-Za-z]?(?:-[A-Za-z])?)\s*$/);
  if (simpleMatch?.[1]) return normalizeSpaceNumber(simpleMatch[1]);

  // Match any trailing token containing digits
  const tokenMatch = cleaned.match(/([\w./-]+)\s*$/);
  if (tokenMatch?.[1] && /\d/.test(tokenMatch[1])) {
    return normalizeSpaceNumber(tokenMatch[1]);
  }

  return '';
};

/**
 * Extract building name from a room label string
 * Uses the building configuration for alias resolution
 *
 * @param {string} label - Full room label (e.g., "Goebel Building 101")
 * @returns {Object|null} Building record, or null if not found
 */
export const extractBuilding = (label) => {
  if (!label || typeof label !== 'string') return null;

  const trimmed = label.trim();
  if (!trimmed) return null;

  const lowered = trimmed.toLowerCase();

  // Check for exact alias matches first
  for (const building of getActiveBuildings()) {
    // Check aliases
    for (const alias of building.aliases || []) {
      if (lowered.startsWith(alias.toLowerCase())) {
        return building;
      }
    }
    // Check code
    if (building.code && lowered.startsWith(building.code.toLowerCase())) {
      return building;
    }
    // Check display name
    if (building.displayName && lowered.startsWith(building.displayName.toLowerCase())) {
      return building;
    }
  }

  // Fallback: Extract building words (everything before the room number)
  const withoutParens = trimmed.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const parts = withoutParens.split(' ');
  const buildingParts = [];

  for (const part of parts) {
    // Stop at room number
    if (/^\d/.test(part)) break;
    if (/^[A-Z]-?\d+$/i.test(part)) break;
    buildingParts.push(part);
  }

  if (buildingParts.length === 0) return null;

  const extractedName = buildingParts.join(' ').trim();
  const extractedLower = extractedName.toLowerCase();

  // Try to match extracted name to known buildings
  for (const building of getActiveBuildings()) {
    if (building.displayName?.toLowerCase() === extractedLower) return building;
    if (building.code?.toLowerCase() === extractedLower) return building;
    for (const alias of building.aliases || []) {
      if (alias.toLowerCase() === extractedLower) return building;
    }
  }

  // Return a pseudo-building for unrecognized buildings
  return {
    code: slugify(extractedName).toUpperCase(),
    displayName: extractedName,
    aliases: [],
    isActive: true,
    _unrecognized: true
  };
};

/**
 * Parse a single room label into structured components
 *
 * @param {string} label - Single room label (e.g., "Goebel Building 101")
 * @returns {Object|null} Parsed room data, or null if not a physical room
 *
 * @example
 * parseRoomLabel("Goebel Building 101")
 * // {
 * //   raw: "Goebel Building 101",
 * //   locationType: "physical",
 * //   building: { code: "GOEBEL", displayName: "Goebel", ... },
 * //   spaceNumber: "101",
 * //   spaceKey: "GOEBEL:101",
 * //   displayName: "Goebel 101"
 * // }
 */
export const parseRoomLabel = (label) => {
  if (!label || typeof label !== 'string') return null;

  const raw = label.trim();
  if (!raw) return null;

  // Check if this is a non-physical location
  const locationType = detectLocationType(raw);
  if (locationType !== LOCATION_TYPE.PHYSICAL) {
    return {
      raw,
      locationType,
      building: null,
      spaceNumber: '',
      spaceKey: '',
      displayName: raw,
      locationLabel: raw
    };
  }

  // Extract building and room number
  const building = extractBuilding(raw);
  const spaceNumber = extractSpaceNumber(raw);

  if (!building || !spaceNumber) {
    // Could not fully parse - return partial result
    return {
      raw,
      locationType: LOCATION_TYPE.UNKNOWN,
      building,
      spaceNumber,
      spaceKey: '',
      displayName: raw,
      parseError: !building ? 'Could not identify building' : 'Could not identify room number'
    };
  }

  // Build the canonical space key
  const buildingCode = building.code || slugify(building.displayName).toUpperCase();
  const spaceKey = `${buildingCode}:${spaceNumber}`;
  const displayName = `${building.displayName} ${spaceNumber}`;

  return {
    raw,
    locationType: LOCATION_TYPE.PHYSICAL,
    building,
    buildingCode,
    spaceNumber,
    spaceKey,
    displayName
  };
};

/**
 * Parse a room string that may contain multiple rooms
 *
 * @param {string} value - Raw room string (possibly multi-room)
 * @returns {Object} Parse result with array of parsed rooms
 *
 * @example
 * parseMultiRoom("Goebel 101; Goebel 109")
 * // {
 * //   raw: "Goebel 101; Goebel 109",
 * //   locationType: "physical",
 * //   rooms: [
 * //     { spaceKey: "GOEBEL:101", displayName: "Goebel 101", ... },
 * //     { spaceKey: "GOEBEL:109", displayName: "Goebel 109", ... }
 * //   ],
 * //   spaceKeys: ["GOEBEL:101", "GOEBEL:109"],
 * //   displayNames: ["Goebel 101", "Goebel 109"]
 * // }
 */
export const parseMultiRoom = (value) => {
  if (!value || typeof value !== 'string') {
    return {
      raw: value,
      locationType: LOCATION_TYPE.NONE,
      rooms: [],
      spaceKeys: [],
      displayNames: []
    };
  }

  const raw = value.trim();
  if (!raw) {
    return {
      raw,
      locationType: LOCATION_TYPE.NONE,
      rooms: [],
      spaceKeys: [],
      displayNames: []
    };
  }

  // Check if the entire string is virtual/no-room
  const wholeType = detectLocationType(raw);
  if (wholeType !== LOCATION_TYPE.PHYSICAL) {
    return {
      raw,
      locationType: wholeType,
      rooms: [],
      spaceKeys: [],
      displayNames: [],
      locationLabel: raw
    };
  }

  // Split and parse each room
  const parts = splitMultiRoom(raw);
  const rooms = [];
  const spaceKeys = [];
  const displayNames = [];
  const errors = [];

  for (const part of parts) {
    const parsed = parseRoomLabel(part);
    if (!parsed) continue;

    if (parsed.locationType === LOCATION_TYPE.PHYSICAL && parsed.spaceKey) {
      rooms.push(parsed);
      spaceKeys.push(parsed.spaceKey);
      displayNames.push(parsed.displayName);
    } else if (parsed.parseError) {
      errors.push({ input: part, error: parsed.parseError });
    }
    // Skip virtual/none parts within a multi-room string
  }

  return {
    raw,
    locationType: rooms.length > 0 ? LOCATION_TYPE.PHYSICAL : LOCATION_TYPE.UNKNOWN,
    rooms,
    spaceKeys,
    displayNames,
    errors: errors.length > 0 ? errors : undefined
  };
};

// ============================================================================
// SPACE KEY UTILITIES
// ============================================================================

/**
 * Build a canonical space key from components
 * @param {string} buildingCode - Building code (e.g., "GOEBEL")
 * @param {string} spaceNumber - Space number (e.g., "101")
 * @returns {string} Space key (e.g., "GOEBEL:101")
 */
export const buildSpaceKey = (buildingCode, spaceNumber) => {
  const code = (buildingCode || '').toString().toUpperCase().trim();
  const number = normalizeSpaceNumber(spaceNumber);
  if (!code || !number) return '';
  return `${code}:${number}`;
};

/**
 * Parse a space key into its components
 * @param {string} spaceKey - Space key (e.g., "GOEBEL:101")
 * @returns {Object|null} { buildingCode, spaceNumber } or null if invalid
 */
export const parseSpaceKey = (spaceKey) => {
  if (!spaceKey || typeof spaceKey !== 'string') return null;
  const parts = spaceKey.split(':');
  if (parts.length !== 2) return null;
  return {
    buildingCode: parts[0],
    spaceNumber: parts[1]
  };
};

/**
 * Validate a space key format
 * @param {string} spaceKey - Space key to validate
 * @returns {Object} { valid: boolean, error?: string }
 */
export const validateSpaceKey = (spaceKey) => {
  if (!spaceKey || typeof spaceKey !== 'string') {
    return { valid: false, error: 'Space key is required' };
  }

  const parts = spaceKey.split(':');
  if (parts.length !== 2) {
    return { valid: false, error: 'Space key must be in format "BUILDING:NUMBER"' };
  }

  const [buildingCode, spaceNumber] = parts;
  if (!buildingCode) {
    return { valid: false, error: 'Building code is required' };
  }
  if (!spaceNumber) {
    return { valid: false, error: 'Space number is required' };
  }
  if (!/^[A-Z0-9_]+$/.test(buildingCode)) {
    return { valid: false, error: 'Building code must be uppercase alphanumeric' };
  }
  if (!/^[\dA-Z./-]+$/.test(spaceNumber)) {
    return { valid: false, error: 'Space number contains invalid characters' };
  }

  return { valid: true };
};

// ============================================================================
// BUILDING RESOLUTION
// ============================================================================

/**
 * Resolve a building name/alias to its canonical building record
 * @param {string} input - Building name, code, or alias
 * @returns {Object|null} Building record or null if not found
 */
export const resolveBuilding = (input) => {
  if (!input || typeof input !== 'string') return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  const lowered = trimmed.toLowerCase();

  // Check alias map
  const building = buildingConfig.aliasToBuilding.get(lowered);
  if (building) return building;

  // Check code (case-insensitive)
  const byCode = buildingConfig.buildingsByCode.get(trimmed.toUpperCase());
  if (byCode) return byCode;

  return null;
};

/**
 * Normalize a building name to its canonical display name
 * @param {string} input - Raw building name
 * @returns {string} Canonical display name, or original if not found
 */
export const normalizeBuildingName = (input) => {
  const building = resolveBuilding(input);
  return building?.displayName || input?.trim() || '';
};

// ============================================================================
// DISPLAY UTILITIES
// ============================================================================

/**
 * Get display-friendly location string for a schedule/section
 * @param {Object} schedule - Schedule object with location fields
 * @returns {string} Display string for the location
 */
export const getLocationDisplay = (schedule) => {
  if (!schedule) return '';

  // Check for virtual/online
  if (schedule.isOnline || schedule.locationType === 'virtual') {
    return schedule.locationLabel || 'Online';
  }

  // Check for no room
  if (schedule.locationType === 'no_room' || schedule.locationType === 'none') {
    return schedule.locationLabel || 'No Room Needed';
  }

  // Check for space display names array
  if (Array.isArray(schedule.spaceDisplayNames) && schedule.spaceDisplayNames.length > 0) {
    return schedule.spaceDisplayNames.join('; ');
  }

  // Legacy: Check for roomNames array
  if (Array.isArray(schedule.roomNames) && schedule.roomNames.length > 0) {
    return schedule.roomNames.join('; ');
  }

  // Legacy: Check for single roomName
  if (schedule.roomName) {
    return schedule.roomName;
  }

  return '';
};

/**
 * Get building name for display from a location
 * @param {string} roomString - Full room string
 * @returns {string} Building display name
 */
export const getBuildingDisplay = (roomString) => {
  const parsed = parseRoomLabel(roomString);
  if (!parsed?.building) return '';
  return parsed.building.displayName || '';
};

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Validate location data for a schedule
 * @param {Object} data - Schedule data with location fields
 * @returns {Object} { valid: boolean, errors: string[], warnings: string[] }
 */
export const validateScheduleLocation = (data) => {
  const errors = [];
  const warnings = [];

  const locationType = data.locationType || 'room';

  if (locationType === 'room' || locationType === 'physical') {
    // Should have space references
    const hasSpaces = Array.isArray(data.spaceIds) && data.spaceIds.length > 0;
    const hasRooms = Array.isArray(data.roomIds) && data.roomIds.length > 0;
    const hasRoomNames = Array.isArray(data.roomNames) && data.roomNames.length > 0;
    const hasRoomName = Boolean(data.roomName);

    if (!hasSpaces && !hasRooms) {
      if (hasRoomNames || hasRoomName) {
        warnings.push('Location has room names but no resolved space/room IDs');
      } else {
        warnings.push('Physical location schedule has no room assignment');
      }
    }
  }

  if (locationType === 'virtual' || data.isOnline) {
    // Should not have physical space references
    if (Array.isArray(data.spaceIds) && data.spaceIds.length > 0) {
      warnings.push('Virtual/online schedule has space IDs assigned');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
};

/**
 * Validate office location for a person
 * @param {Object} data - Person data with office fields
 * @returns {Object} { valid: boolean, errors: string[], warnings: string[] }
 */
export const validatePersonOffice = (data) => {
  const errors = [];
  const warnings = [];

  const hasOffice = Boolean(data.office);
  const hasOfficeSpaceId = Boolean(data.officeSpaceId || data.officeRoomId);
  const hasNoOffice = data.hasNoOffice === true || data.isRemote === true;

  if (hasNoOffice && hasOffice) {
    warnings.push('Person marked as no office but has office string');
  }

  if (hasOffice && !hasOfficeSpaceId && !hasNoOffice) {
    warnings.push('Person has office string but no resolved officeSpaceId');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
};

// ============================================================================
// EXPORT DEFAULT
// ============================================================================

export default {
  // Constants
  LOCATION_TYPE,
  SPACE_TYPE,

  // Configuration
  applyBuildingConfig,
  getBuildingConfig,
  getActiveBuildings,
  getCanonicalBuildingList,

  // Normalization
  slugify,
  normalizeSpaceNumber,
  detectLocationType,
  isVirtualLocation,
  isNoRoomLocation,
  isSkippableLocation,

  // Parsing
  splitMultiRoom,
  extractSpaceNumber,
  extractBuilding,
  parseRoomLabel,
  parseMultiRoom,

  // Space Keys
  buildSpaceKey,
  parseSpaceKey,
  validateSpaceKey,

  // Building Resolution
  resolveBuilding,
  normalizeBuildingName,

  // Display
  getLocationDisplay,
  getBuildingDisplay,

  // Validation
  validateScheduleLocation,
  validatePersonOffice
};
