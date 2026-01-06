/**
 * Directory Utilities
 * 
 * Shared helper functions for directory components:
 * - FacultyDirectory
 * - StaffDirectory
 * - AdjunctDirectory
 * - StudentDirectory
 */

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

    const office = officeLocation.trim();

    // Handle common building name patterns
    const buildingKeywords = ['BUILDING', 'HALL', 'GYMNASIUM', 'TOWER', 'CENTER', 'COMPLEX'];

    // Check if office contains building keywords
    for (const keyword of buildingKeywords) {
        const keywordIndex = office.toUpperCase().indexOf(keyword);
        if (keywordIndex !== -1) {
            // Include everything up to and including the keyword
            const endIndex = keywordIndex + keyword.length;
            return office.substring(0, endIndex).trim();
        }
    }

    // If no building keywords found, try to extract building name before room numbers
    // Look for patterns where building name ends before standalone numbers
    const match = office.match(/^([A-Za-z\s]+?)(\s+\d+.*)?$/);
    if (match && match[1]) {
        return match[1].trim();
    }

    // Handle special cases like "801 WASHINGTON TOWER" where number is part of building name
    // If it starts with a number followed by words, keep it all as building name
    const startsWithNumber = office.match(/^\d+\s+[A-Za-z]/);
    if (startsWithNumber) {
        // Look for room-like patterns at the end
        const roomPattern = office.match(/^(.+?)(\s+\d{2,4}(\s+\d+)*)$/);
        if (roomPattern) {
            return roomPattern[1].trim();
        }
        return office; // Keep whole thing if no clear room pattern
    }

    return office; // Fallback: return the whole office location
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
