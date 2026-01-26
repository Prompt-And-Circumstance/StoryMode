/**
 * Import Helper Utilities
 *
 * Pure functions for import operations that can be unit tested
 * without browser dependencies.
 */

/**
 * Keys that could be used for prototype pollution attacks.
 * These are stripped from imported JSON objects.
 */
export const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'];

/**
 * Recursively sanitize an object to prevent prototype pollution.
 * Removes dangerous keys that could modify Object.prototype.
 *
 * @param {any} obj - The object to sanitize
 * @returns {any} Sanitized object (same reference, mutated)
 */
export function sanitizeObject(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    // Handle arrays
    if (Array.isArray(obj)) {
        obj.forEach(item => sanitizeObject(item));
        return obj;
    }

    // Remove dangerous keys (check own properties only)
    // Use Object.hasOwn for accurate own-property detection
    for (const key of DANGEROUS_KEYS) {
        if (Object.hasOwn(obj, key)) {
            delete obj[key];
        }
    }

    // Recurse into nested objects (use Object.keys to avoid prototype chain)
    for (const key of Object.keys(obj)) {
        const value = obj[key];
        if (value && typeof value === 'object') {
            sanitizeObject(value);
        }
    }

    return obj;
}

/**
 * Normalize imported data to an array.
 * Accepts either a single object or an array of objects.
 * Sanitizes data to prevent prototype pollution attacks.
 *
 * @param {Object|Array} data - The imported JSON data
 * @returns {Array} Normalized and sanitized array of items
 * @throws {Error} If data is invalid or empty
 */
export function normalizeImportedData(data) {
    // Sanitize before processing to prevent prototype pollution
    sanitizeObject(data);

    if (Array.isArray(data)) {
        if (data.length === 0) {
            throw new Error('Import file is empty');
        }
        return data;
    }
    if (data && typeof data === 'object' && data.id) {
        return [data];
    }
    throw new Error('Invalid format: expected an object with id or an array of objects');
}

/**
 * Generate a unique ID for a copy of an item.
 * Uses timestamp + random suffix to avoid collisions.
 *
 * @param {string} baseId - The original item ID
 * @returns {string} A unique copy ID
 */
export function generateCopyId(baseId) {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 6);
    return `${baseId}_copy_${timestamp}_${randomSuffix}`;
}

/**
 * Validate that an item has required fields for import.
 *
 * @param {Object} item - The item to validate
 * @param {string[]} requiredFields - Fields that must be present
 * @returns {{ valid: boolean, missing: string[] }} Validation result
 */
export function validateImportItem(item, requiredFields = ['id', 'name']) {
    if (!item || typeof item !== 'object') {
        return { valid: false, missing: requiredFields };
    }

    const missing = requiredFields.filter(field => !item[field]);
    return {
        valid: missing.length === 0,
        missing
    };
}

/**
 * Validate all items in an import batch.
 *
 * @param {Array} items - Array of items to validate
 * @param {string[]} requiredFields - Fields that must be present
 * @returns {{ valid: boolean, errors: string[] }} Validation result
 */
export function validateImportBatch(items, requiredFields = ['id', 'name']) {
    const errors = [];

    if (!Array.isArray(items)) {
        return { valid: false, errors: ['Items must be an array'] };
    }

    items.forEach((item, index) => {
        const result = validateImportItem(item, requiredFields);
        if (!result.valid) {
            errors.push(`Item ${index}: missing ${result.missing.join(', ')}`);
        }
    });

    return {
        valid: errors.length === 0,
        errors
    };
}
