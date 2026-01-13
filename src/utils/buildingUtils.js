/**
 * Building Utilities - Single Source of Truth for Building Names
 *
 * Building definitions are loaded from Firestore (settings/buildings).
 */

export const DEFAULT_BUILDING_CONFIG = {
    version: 1,
    buildings: []
};

let cachedConfig = { ...DEFAULT_BUILDING_CONFIG, buildings: [] };
let aliasMap = new Map();

const normalizeBuilding = (building) => {
    if (!building || typeof building !== 'object') return null;
    const code = typeof building.code === 'string' ? building.code.trim() : '';
    const displayName = typeof building.displayName === 'string' ? building.displayName.trim() : '';
    const aliases = Array.isArray(building.aliases)
        ? building.aliases.map((alias) => (alias || '').toString().trim()).filter(Boolean)
        : [];
    const isActive = building.isActive !== false;
    if (!code && !displayName) return null;
    return {
        code,
        displayName: displayName || code,
        aliases,
        isActive
    };
};

export const normalizeBuildingConfig = (raw = {}) => {
    const buildings = Array.isArray(raw.buildings) ? raw.buildings : [];
    const normalized = buildings.map(normalizeBuilding).filter(Boolean);
    return {
        version: raw.version || DEFAULT_BUILDING_CONFIG.version,
        buildings: normalized
    };
};

const getActiveBuildings = () => {
    return cachedConfig.buildings.filter((b) => b.isActive !== false);
};

const buildAliasMap = (buildings) => {
    const map = new Map();
    buildings.forEach((building) => {
        const canonical = building.displayName || building.code;
        if (!canonical) return;
        map.set(canonical.toLowerCase(), canonical);
        if (building.code) {
            map.set(building.code.toLowerCase(), canonical);
        }
        (building.aliases || []).forEach((alias) => {
            map.set(alias.toLowerCase(), canonical);
        });
    });
    return map;
};

export const setBuildingConfig = (raw) => {
    cachedConfig = normalizeBuildingConfig(raw);
    aliasMap = buildAliasMap(getActiveBuildings());
    return cachedConfig;
};

export const getBuildingConfig = () => cachedConfig;

/**
 * Normalize a building name to its canonical display name
 * @param {string} buildingName - Raw building name from any source
 * @returns {string} Canonical building display name, or original if not recognized
 */
export const normalizeBuildingName = (buildingName) => {
    if (!buildingName || typeof buildingName !== 'string') return '';

    const trimmed = buildingName.trim();
    if (!trimmed) return '';

    const normalized = aliasMap.get(trimmed.toLowerCase());
    if (normalized) return normalized;

    const lowered = trimmed.toLowerCase();
    for (const building of getActiveBuildings()) {
        if (building.code && lowered.startsWith(building.code.toLowerCase())) {
            return building.displayName;
        }
        for (const alias of building.aliases || []) {
            if (lowered.startsWith(alias.toLowerCase())) {
                return building.displayName;
            }
        }
    }

    return trimmed;
};

/**
 * Extract building name from a room string
 * Handles formats like:
 * - "GOEBEL 101"
 * - "Mary Gibbs Jones 213"
 * - "Mary Gibbs Jones (FCS) 213"
 * - "Piper Building 302"
 * 
 * @param {string} roomString - Full room string
 * @returns {string} Normalized building name
 */
export const getBuildingFromRoom = (roomString) => {
    if (!roomString || typeof roomString !== 'string') return '';

    const room = roomString.trim();
    if (!room) return '';

    const lowered = room.toLowerCase();
    if (lowered === 'online' || lowered.includes('online')) return 'Online';
    if (lowered === 'tba' || lowered === 'to be announced') return '';
    if (lowered.includes('no room needed')) return '';
    if (lowered.includes('off campus')) return 'Off Campus';

    for (const building of getActiveBuildings()) {
        for (const alias of building.aliases || []) {
            if (lowered.startsWith(alias.toLowerCase())) {
                return building.displayName;
            }
        }
        if (building.code && lowered.startsWith(building.code.toLowerCase())) {
            return building.displayName;
        }
    }

    const withoutParens = room.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
    const parts = withoutParens.split(' ');

    const buildingParts = [];
    for (const part of parts) {
        if (/^\d/.test(part)) break;
        if (/^[A-Z]-?\d+$/i.test(part)) break;
        buildingParts.push(part);
    }

    if (buildingParts.length > 0) {
        const extractedBuilding = buildingParts.join(' ').trim();
        return normalizeBuildingName(extractedBuilding);
    }

    return normalizeBuildingName(parts[0] || room);
};

/**
 * Get list of all canonical building names for dropdowns/filters
 * @returns {string[]} Array of building display names
 */
export const getCanonicalBuildingList = () => {
    return getActiveBuildings()
        .map((building) => building.displayName)
        .filter(Boolean)
        .sort();
};

/**
 * Normalize an array of building names
 * @param {string[]} buildings - Array of building names
 * @returns {string[]} Array of normalized, unique building names
 */
export const normalizeBuildings = (buildings) => {
    if (!Array.isArray(buildings)) return [];

    const normalized = new Set();
    buildings.forEach(b => {
        const n = normalizeBuildingName(b);
        if (n && n !== 'Online' && n !== 'Off Campus') {
            normalized.add(n);
        }
    });

    return Array.from(normalized).sort();
};

/**
 * Check if a building name matches a filter
 * @param {string} buildingName - Building name to check
 * @param {string} filterBuilding - Filter building name
 * @returns {boolean} True if matches
 */
export const buildingMatches = (buildingName, filterBuilding) => {
    if (!filterBuilding) return true;
    const normalizedName = normalizeBuildingName(buildingName);
    const normalizedFilter = normalizeBuildingName(filterBuilding);
    return normalizedName === normalizedFilter;
};

export default {
    DEFAULT_BUILDING_CONFIG,
    normalizeBuildingConfig,
    setBuildingConfig,
    getBuildingConfig,
    normalizeBuildingName,
    getBuildingFromRoom,
    getCanonicalBuildingList,
    normalizeBuildings,
    buildingMatches
};
