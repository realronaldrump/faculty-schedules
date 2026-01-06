/**
 * Time Utilities
 * 
 * Centralized time parsing and formatting functions used across
 * schedule visualization components.
 */

/**
 * Parse a time string into minutes from midnight.
 * 
 * @param {string} timeStr - Time string like "9:30 AM", "2pm", "14:00"
 * @returns {number|null} Minutes from midnight (0-1439) or null if invalid
 * 
 * @example
 * parseTime("9:30 AM")  // 570
 * parseTime("2pm")      // 840
 * parseTime("12:00 PM") // 720
 */
export const parseTime = (timeStr) => {
    if (!timeStr) return null;

    const cleaned = timeStr.toLowerCase().replace(/\s+/g, '');
    let hour, minute, ampm;

    if (cleaned.includes(':')) {
        const parts = cleaned.split(':');
        hour = parseInt(parts[0]);
        minute = parseInt(parts[1].replace(/[^\d]/g, ''));
        ampm = cleaned.includes('pm') ? 'pm' : 'am';
    } else {
        const match = cleaned.match(/(\d+)(am|pm)/);
        if (match) {
            hour = parseInt(match[1]);
            minute = 0;
            ampm = match[2];
        } else {
            return null;
        }
    }

    if (ampm === 'pm' && hour !== 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;

    return hour * 60 + (minute || 0);
};

/**
 * Format minutes from midnight into a readable time string.
 * 
 * @param {number} minutes - Minutes from midnight (0-1439)
 * @returns {string} Formatted time like "9:30 AM"
 * 
 * @example
 * formatMinutesToTime(570)  // "9:30 AM"
 * formatMinutesToTime(840)  // "2:00 PM"
 * formatMinutesToTime(0)    // "12:00 AM"
 */
export const formatMinutesToTime = (minutes) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${displayHour}:${m.toString().padStart(2, '0')} ${ampm}`;
};

/**
 * Format minutes from midnight into a short label (no minutes if :00).
 * 
 * @param {number} minutes - Minutes from midnight
 * @returns {string} Short time like "9 AM" or "9:30 AM"
 */
export const formatMinutesToLabel = (minutes) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;

    if (m === 0) {
        return `${displayHour} ${ampm}`;
    }
    return `${displayHour}:${m.toString().padStart(2, '0')} ${ampm}`;
};
