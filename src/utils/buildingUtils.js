/**
 * Building Utilities - Single Source of Truth for Building Names
 * 
 * This module provides centralized building name standardization to ensure
 * consistent naming across the entire application.
 */

/**
 * Canonical building definitions
 * Each building has:
 * - code: Short code used in room strings (e.g., "GOEBEL 101")
 * - displayName: Human-readable display name
 * - aliases: Alternative names/codes that should map to this building
 */
export const BUILDINGS = {
    GOEBEL: {
        code: 'GOEBEL',
        displayName: 'Goebel',
        aliases: ['goebel', 'GOEBEL', 'Goebel', 'Goebel Building', 'GOEBEL BUILDING']
    },
    MARY_GIBBS_JONES: {
        code: 'MARY',
        displayName: 'Mary Gibbs Jones',
        aliases: ['mary', 'MARY', 'Mary', 'Mary Gibbs Jones', 'MARY GIBBS JONES', 'FCS', 'Mary Gibbs Jones (FCS)']
    },
    PIPER: {
        code: 'PIPER',
        displayName: 'Piper',
        aliases: ['piper', 'PIPER', 'Piper', 'Piper Building', 'PIPER BUILDING']
    },
    GENERAL: {
        code: 'GENERAL',
        displayName: 'General',
        aliases: ['general', 'GENERAL', 'General', 'General Assignment', 'General Assignment Room']
    }
};

// Build a lookup map for quick alias resolution
const buildAliasMap = () => {
    const map = new Map();
    Object.values(BUILDINGS).forEach(building => {
        building.aliases.forEach(alias => {
            map.set(alias.toLowerCase(), building.displayName);
        });
        // Also map the code
        map.set(building.code.toLowerCase(), building.displayName);
    });
    return map;
};

const ALIAS_MAP = buildAliasMap();

/**
 * Normalize a building name to its canonical display name
 * @param {string} buildingName - Raw building name from any source
 * @returns {string} Canonical building display name, or original if not recognized
 */
export const normalizeBuildingName = (buildingName) => {
    if (!buildingName || typeof buildingName !== 'string') return '';

    const trimmed = buildingName.trim();
    if (!trimmed) return '';

    // Check alias map first
    const normalized = ALIAS_MAP.get(trimmed.toLowerCase());
    if (normalized) return normalized;

    // Check if it starts with a known building code
    const lowered = trimmed.toLowerCase();
    for (const building of Object.values(BUILDINGS)) {
        if (lowered.startsWith(building.code.toLowerCase())) {
            return building.displayName;
        }
        // Check if any alias is a prefix
        for (const alias of building.aliases) {
            if (lowered.startsWith(alias.toLowerCase())) {
                return building.displayName;
            }
        }
    }

    // Return cleaned version of original if not recognized
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

    // Handle special cases
    const lowered = room.toLowerCase();
    if (lowered === 'online' || lowered.includes('online')) return 'Online';
    if (lowered === 'tba' || lowered === 'to be announced') return '';
    if (lowered.includes('no room needed')) return '';
    if (lowered.includes('off campus')) return 'Off Campus';

    // Remove room number suffix (everything after last word that contains a digit)
    // But handle cases like "Mary Gibbs Jones (FCS) 213"

    // First, try to match known building patterns
    for (const building of Object.values(BUILDINGS)) {
        for (const alias of building.aliases) {
            if (lowered.startsWith(alias.toLowerCase())) {
                return building.displayName;
            }
        }
    }

    // Fallback: extract text before the room number
    // Pattern: everything before a token that starts with digits or is purely digits
    const withoutParens = room.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
    const parts = withoutParens.split(' ');

    // Find where the room number starts
    let buildingParts = [];
    for (const part of parts) {
        // Stop if this part is or starts with a number (room number)
        if (/^\d/.test(part)) break;
        // Stop if this looks like a room identifier (letter + numbers)
        if (/^[A-Z]-?\d+$/i.test(part)) break;
        buildingParts.push(part);
    }

    if (buildingParts.length > 0) {
        const extractedBuilding = buildingParts.join(' ').trim();
        return normalizeBuildingName(extractedBuilding);
    }

    // Last resort: take first word
    return normalizeBuildingName(parts[0] || room);
};

/**
 * Get list of all canonical building names for dropdowns/filters
 * @returns {string[]} Array of building display names
 */
export const getCanonicalBuildingList = () => {
    return Object.values(BUILDINGS).map(b => b.displayName).sort();
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
    BUILDINGS,
    normalizeBuildingName,
    getBuildingFromRoom,
    getCanonicalBuildingList,
    normalizeBuildings,
    buildingMatches
};
