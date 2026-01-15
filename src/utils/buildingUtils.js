/**
 * Building Utilities - Facade for Location Service
 *
 * This module provides backward-compatible functions that delegate to locationService.
 * New code should import directly from locationService instead.
 *
 * @deprecated Import from locationService.js instead
 */

import {
  applyBuildingConfig as _applyBuildingConfig,
  getBuildingConfig as _getBuildingConfig,
  getActiveBuildings,
  getCanonicalBuildingList as _getCanonicalBuildingList,
  normalizeBuildingName as _normalizeBuildingName,
  resolveBuilding,
  parseRoomLabel,
  getBuildingDisplay,
  slugify
} from './locationService';

export const DEFAULT_BUILDING_CONFIG = {
    version: 1,
    buildings: []
};

// Legacy cache variable - now just a proxy to locationService
let cachedConfig = { ...DEFAULT_BUILDING_CONFIG, buildings: [] };

const normalizeBuilding = (building) => {
    if (!building || typeof building !== 'object') return null;
    const rawCode = typeof building.code === 'string' ? building.code.trim() : '';
    const code = rawCode ? rawCode.toUpperCase() : '';
    const displayName = typeof building.displayName === 'string' ? building.displayName.trim() : '';
    const aliases = Array.isArray(building.aliases)
        ? building.aliases.map((alias) => (alias || '').toString().trim()).filter(Boolean)
        : [];
    const isActive = building.isActive !== false;
    const idSource = code || displayName;
    const id = idSource ? slugify(idSource).toLowerCase() : '';
    if (!code && !displayName) return null;
    return {
        id,
        code,
        displayName: displayName || code,
        aliases,
        isActive,
        campus: building.campus || '',
        address: building.address || ''
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

export const setBuildingConfig = (raw) => {
    cachedConfig = normalizeBuildingConfig(raw);
    // Delegate to locationService
    _applyBuildingConfig(cachedConfig);
    return cachedConfig;
};

export const getBuildingConfig = () => _getBuildingConfig();

/**
 * Normalize a building name to its canonical display name
 * @param {string} buildingName - Raw building name from any source
 * @returns {string} Canonical building display name, or original if not recognized
 */
export const normalizeBuildingName = (buildingName) => {
    return _normalizeBuildingName(buildingName);
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
    return getBuildingDisplay(roomString);
};

/**
 * Get list of all canonical building names for dropdowns/filters
 * @returns {string[]} Array of building display names
 */
export const getCanonicalBuildingList = () => {
    return _getCanonicalBuildingList();
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
