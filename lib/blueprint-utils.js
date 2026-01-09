/**
 * Blueprint Utilities Module - Shared Helper Functions
 *
 * Centralized utility functions used across all blueprint modules.
 * Eliminates code duplication and provides consistent behavior.
 *
 * @module blueprint-utils
 * @version 1.0.0
 */

// ============================================================================
// UUID GENERATION
// ============================================================================

/**
 * Generate a UUID v4
 * @returns {string} UUID v4 string
 */
export function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// ============================================================================
// HTML ESCAPING
// ============================================================================

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
export function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.toString().replace(/[&<>"']/g, m => map[m]);
}

// ============================================================================
// TEXT PROCESSING
// ============================================================================

/**
 * Truncate text to a maximum length
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
export function truncateText(text, maxLength = 200) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
}

/**
 * Sanitize a filename for safe filesystem use
 * @param {string} filename - Original filename
 * @returns {string} Sanitized filename
 */
export function sanitizeFilename(filename) {
    return filename
        .replace(/[<>:"/\\|?*]/g, '')
        .replace(/\s+/g, '-')
        .substring(0, 200);
}

/**
 * Normalize a character name for comparison
 * @param {string} name - Character name
 * @returns {string} Normalized name
 */
export function normalizeCharacterName(name) {
    return name.toLowerCase().trim();
}

// ============================================================================
// OBJECT UTILITIES
// ============================================================================

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
        target = target[parts[i]] || (target[parts[i]] = {});
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
 * Safely parse JSON with fallback
 * @param {string} text - JSON string
 * @param {*} fallback - Fallback value if parsing fails
 * @returns {*} Parsed object or fallback
 */
export function safeParseJSON(text, fallback = null) {
    try {
        return JSON.parse(text);
    } catch (e) {
        console.warn('[BlueprintUtils] Failed to parse JSON:', e);
        return fallback;
    }
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Check if a value is a character object
 * @param {*} value - Value to check
 * @returns {boolean} True if character object
 */
export function isCharacterObject(value) {
    return value && typeof value === 'object' && typeof value.name === 'string' && value.name.length > 0;
}

/**
 * Validate a blueprint object
 * @param {Object} blueprint - Blueprint to validate
 * @returns {Object} Validation result { valid, errors, warnings }
 */
export function validateBlueprint(blueprint) {
    const errors = [];
    const warnings = [];

    if (!blueprint.blueprint_id) errors.push('Missing blueprint_id');
    if (!blueprint.story_type_id) errors.push('Missing story_type_id');
    if (!blueprint.scene_plan?.length) errors.push('No scenes defined');
    if (!blueprint.core_premise) warnings.push('No core premise defined');
    if (!blueprint.userMetadata?.title) warnings.push('No title defined');

    return { valid: errors.length === 0, errors, warnings };
}

// ============================================================================
// FILE & BLOB UTILITIES
// ============================================================================

/**
 * Convert file to data URL
 * @param {File} file - File to convert
 * @returns {Promise<string>} Data URL
 */
export function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/**
 * Load an image from a source
 * @param {string} src - Image source (URL or data URL)
 * @returns {Promise<HTMLImageElement>} Loaded image
 */
export function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

/**
 * Trigger a browser download
 * @param {Blob} blob - Blob to download
 * @param {string} filename - Download filename
 */
export function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Convert various input types to Uint8Array
 * @param {Blob|File|Uint8Array|ArrayBuffer} data - Data to convert
 * @returns {Promise<Uint8Array>} Bytes array
 */
export async function toBytes(data) {
    if (data instanceof Blob || data instanceof File) {
        return new Uint8Array(await data.arrayBuffer());
    }
    if (data instanceof ArrayBuffer) {
        return new Uint8Array(data);
    }
    return data;
}

// ============================================================================
// ASYNC HELPERS
// ============================================================================

/**
 * Helper to load blueprint or throw error
 * @param {string} blueprintId - Blueprint ID
 * @param {Function} getBlueprint - Getter function
 * @returns {Promise<Object>} Blueprint object
 * @throws {Error} If blueprint not found
 */
export async function loadBlueprintOrThrow(blueprintId, getBlueprint) {
    const blueprint = await getBlueprint(blueprintId);
    if (!blueprint) {
        throw new Error(`Blueprint not found: ${blueprintId}`);
    }
    return blueprint;
}

/**
 * Retry an async function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} delay - Initial delay in ms
 * @returns {Promise<*>} Result of function
 */
export async function retryAsync(fn, maxRetries = 3, delay = 1000) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
        }
    }
}

// ============================================================================
// DOM HELPERS
// ============================================================================

/**
 * Build select options HTML from array
 * @param {Array<{value: string, label: string}>} options - Array of option objects
 * @param {string} selectedValue - Currently selected value
 * @returns {string} HTML string of option elements
 */
export function buildSelectOptions(options, selectedValue) {
    return options.map(opt =>
        `<option value="${opt.value}" ${selectedValue === opt.value ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`
    ).join('');
}

/**
 * Build a safe class name from a string
 * @param {string} str - Input string
 * @returns {string} Safe class name
 */
export function toClassName(str) {
    return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ============================================================================
// BLUEPRINT COVER IMAGE UTILITIES
// ============================================================================

/**
 * Extract cover image URL from a blueprint object.
 * Checks multiple possible locations in priority order:
 * 1. blueprint.coverImageUrl (legacy direct URL)
 * 2. blueprint.libraryData.coverThumbnail (library thumbnail)
 * 3. blueprint.metadata.coverGallery[index].url (gallery with index)
 *
 * @param {Object} blueprint - Blueprint object
 * @returns {string|null} Cover URL or null if not found
 */
export function getBlueprintCoverUrl(blueprint) {
    if (!blueprint) return null;

    // Direct URL (legacy format)
    if (blueprint.coverImageUrl) {
        return blueprint.coverImageUrl;
    }

    // Library thumbnail
    if (blueprint.libraryData?.coverThumbnail) {
        return blueprint.libraryData.coverThumbnail;
    }

    // Gallery with index
    const gallery = blueprint.metadata?.coverGallery;
    if (gallery?.length) {
        const index = blueprint.metadata?.coverGalleryIndex ?? 0;
        return gallery[index]?.url || null;
    }

    return null;
}

/**
 * Validate a URL is safe for use in CSS background-image.
 * Blocks dangerous protocols (javascript:, vbscript:, file:, data:text/html, etc.)
 * Allows: http:, https:, and data:image/* (PNG, GIF, JPEG, WebP)
 *
 * @param {string} url - URL to validate
 * @returns {boolean} True if URL is safe for CSS url() context
 */
export function isValidImageUrl(url) {
    if (!url || typeof url !== 'string') return false;

    // Block dangerous protocols immediately
    if (/^(javascript:|vbscript:|file:|data:text|data:application)/i.test(url)) {
        return false;
    }

    // Allow http: and https: (covers localhost, LAN, VPN, and remote)
    if (/^https?:/i.test(url)) {
        try {
            const parsed = new URL(url);
            return ['http:', 'https:'].includes(parsed.protocol);
        } catch {
            return false;
        }
    }

    // Allow data:image/* (PNG, GIF, JPEG, WebP) for embedded images
    if (url.toLowerCase().startsWith('data:')) {
        return /^data:image\/(png|gif|jpeg|jpg|webp);base64,/i.test(url);
    }

    // Allow relative paths (e.g., /img/cover.png, ./covers/img.jpg, covers/img.png)
    // These are safe when escaped with escapeHtml() in CSS background-image context
    return true;
}
