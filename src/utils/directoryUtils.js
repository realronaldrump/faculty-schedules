/**
 * Directory Utilities
 * 
 * Shared helper functions for directory components:
 * - FacultyDirectory
 * - StaffDirectory
 * - AdjunctDirectory
 * - StudentDirectory
 */

import { getBuildingDisplay } from './locationService';
import { resolveOfficeLocation } from './spaceUtils';

/**
 * Format a 10-digit phone number as (XXX) XXX - XXXX
 * @param {string} phoneStr - Raw phone number (digits only or formatted)
 * @returns {string} Formatted phone number or '-' if invalid
 */
export const formatPhoneNumber = (phoneStr) => {
    if (!phoneStr) return '-';
    const cleaned = ('' + phoneStr).replace(/\D/g, '');
    if (cleaned.length === 10) {
        const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
        if (match) {
            return `(${match[1]}) ${match[2]} - ${match[3]}`;
        }
    }
    return phoneStr;
};

/**
 * Extract building name from an office location string
 * @param {string} officeLocation - Full office location (e.g., "CASHION BUILDING 123")
 * @returns {string} Building name only, or 'No Building' if not provided
 */
export const extractBuildingName = (officeLocation) => {
    if (!officeLocation || officeLocation.trim() === '') {
        return 'No Building';
    }

    const building = getBuildingDisplay(officeLocation);
    if (!building || !building.trim()) return 'No Building';
    return building;
};

/**
 * Extract room number from an office location string
 * @param {string} officeLocation
 * @returns {string}
 */
export const extractRoomNumberFromOffice = (officeLocation) => {
    if (!officeLocation || officeLocation.trim() === '') {
        return '';
    }

    const office = officeLocation.trim();

    const roomMatch = office.match(/(\d+[A-Za-z]?)$/);
    if (roomMatch) {
        return roomMatch[1];
    }

    const complexMatch = office.match(/\s+(\d{2,4}[A-Za-z]?)\s*$/);
    if (complexMatch) {
        return complexMatch[1];
    }

    return '';
};

/**
 * Resolve office building + room using canonical space references when available.
 * @param {Object} person
 * @param {Map|Object} spacesByKey
 * @returns {{ buildingName: string, roomNumber: string }}
 */
export const resolveOfficeDetails = (person, spacesByKey) => {
    const resolved = resolveOfficeLocation(person, spacesByKey);
    if (resolved?.buildingDisplayName || resolved?.spaceNumber) {
        return {
            buildingName: resolved.buildingDisplayName || 'No Building',
            roomNumber: resolved.spaceNumber || ''
        };
    }

    const office = person?.office || '';
    return {
        buildingName: extractBuildingName(office),
        roomNumber: extractRoomNumberFromOffice(office)
    };
};

/**
 * Validate common directory entry fields
 * @param {Object} data - The data object to validate
 * @param {Object} options - Validation options
 * @param {boolean} options.requireEmail - Whether email is required (default: false)
 * @param {boolean} options.requirePhone - Whether phone is required (default: false)
 * @returns {Object} Object with field names as keys and error messages as values
 */
export const validateDirectoryEntry = (data, options = {}) => {
    const errors = {};

    // Email validation
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        errors.email = 'Please enter a valid email address.';
    } else if (options.requireEmail && !data.email) {
        errors.email = 'Email is required.';
    }

    // Phone validation
    const phoneDigits = (data.phone || '').replace(/\D/g, '');
    if (data.phone && phoneDigits.length !== 10) {
        errors.phone = 'Phone number must contain exactly 10 digits.';
    } else if (options.requirePhone && !data.phone && !data.hasNoPhone) {
        errors.phone = 'Phone number is required (or check "No Phone").';
    }

    // Baylor ID validation
    if (data.baylorId && !/^\d{9}$/.test(data.baylorId)) {
        errors.baylorId = 'Baylor ID must be exactly 9 digits.';
    }

    return errors;
};

/**
 * Get input field CSS class based on error state
 * @param {string} fieldName - Name of the field
 * @param {Object} errors - Errors object
 * @returns {string} CSS class string
 */
export const getDirectoryInputClass = (fieldName, errors) => {
    const baseClass = "w-full p-1 border rounded bg-baylor-gold/10";
    return errors[fieldName] ? `${baseClass} border-red-500` : `${baseClass} border-baylor-gold`;
};

/**
 * Dedupe directory records based on name/email, keeping the record with more fields populated.
 * @param {Array} records
 * @returns {Array}
 */
export const dedupeDirectoryRecords = (records = []) => {
    if (!Array.isArray(records)) return [];

    const uniqueMap = new Map();
    records.forEach((record) => {
        const key = `${record.name?.toLowerCase()}-${(record.email || 'no-email').toLowerCase()}`;
        if (!uniqueMap.has(key)) {
            uniqueMap.set(key, record);
            return;
        }
        const existing = uniqueMap.get(key);
        const existingFields = Object.values(existing).filter((value) => value && value !== '').length;
        const newFields = Object.values(record).filter((value) => value && value !== '').length;
        if (newFields > existingFields) {
            uniqueMap.set(key, record);
        }
    });

    return Array.from(uniqueMap.values());
};

/**
 * Build common filter option lists from directory records.
 * @param {Array} records
 * @param {Object} options
 * @param {boolean} options.includePrograms
 * @returns {Object}
 */
export const buildDirectoryFilterOptions = (records = [], { includePrograms = false, spacesByKey } = {}) => {
    const programsSet = new Set();
    const jobTitles = new Set();
    const buildings = new Set();

    if (!Array.isArray(records)) {
        return { programs: [], jobTitles: [], buildings: [] };
    }

    records.forEach((person) => {
        if (includePrograms && person.program?.name) {
            programsSet.add(person.program.name);
        }
        if (person.jobTitle) {
            jobTitles.add(person.jobTitle);
        }
        const resolved = resolveOfficeDetails(person, spacesByKey);
        buildings.add(resolved.buildingName || 'No Building');
    });

    return {
        programs: Array.from(programsSet).sort(),
        jobTitles: Array.from(jobTitles).sort(),
        buildings: Array.from(buildings).sort()
    };
};
