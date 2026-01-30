/**
 * Standalone Utility Adapter
 *
 * Provides pure utility functions from lib/blueprint/utils.js without
 * pulling in the SillyTavern dependency chain (utils → file-api → script.js).
 * These are exact copies of the originals — kept in sync manually.
 *
 * @module utils-adapter
 */

/**
 * Set nested object property using dot notation
 * @param {Object} obj - Target object
 * @param {string} path - Dot-notation path (e.g., 'setting.location')
 * @param {any} value - Value to set
 */
export function setNestedValue(obj, path, value) {
    const parts = path.split('.');
    let target = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        if (!target[parts[i]] || typeof target[parts[i]] !== 'object' || target[parts[i]] === null) {
            target[parts[i]] = {};
        }
        target = target[parts[i]];
    }
    target[parts[parts.length - 1]] = value;
}

/**
 * Get nested object property using dot notation
 * @param {Object} obj - Target object
 * @param {string} path - Dot-notation path (e.g., 'setting.location')
 * @param {any} defaultValue - Default value if path doesn't exist
 * @returns {any} Value at path or defaultValue
 */
export function getNestedValue(obj, path, defaultValue = '') {
    const parts = path.split('.');
    let target = obj;
    for (const part of parts) {
        if (target == null || typeof target !== 'object') {
            return defaultValue;
        }
        target = target[part];
        if (target === undefined) {
            return defaultValue;
        }
    }
    return target ?? defaultValue;
}

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} text - Raw text
 * @returns {string} Escaped text
 */
export function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
