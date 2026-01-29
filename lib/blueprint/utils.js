/**
 * Blueprint Utilities Module - Shared Helper Functions
 *
 * Centralized utility functions used across all blueprint modules.
 * Eliminates code duplication and provides consistent behavior.
 *
 * @module blueprint-utils
 * @version 1.0.0
 */

import { blueprintFilename, isValidUUID } from './file-api.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Maximum length for opening message text (characters)
 * @constant {number}
 */
export const MAX_OPENING_MESSAGE_LENGTH = 50000;

/**
 * Minimum length for opening message text (characters)
 * @constant {number}
 */
export const MIN_OPENING_MESSAGE_LENGTH = 1;

/**
 * Core Narrative Types for StoryVerse
 * The 7 fundamental beat types that all other types map to.
 * @constant {string[]}
 */
export const CORE_BEAT_TYPES = [
    'establishment',
    'hook',
    'reaction',
    'escalation',
    'pivot',
    'emotional',
    'transition'
];

/**
 * Mapping from Human-Friendly types to Core Narrative Types
 * @constant {Object.<string, string>}
 */
export const BEAT_TYPE_MAPPING = {
    // Core types map to themselves
    'establishment': 'establishment',
    'hook': 'hook',
    'reaction': 'reaction',
    'escalation': 'escalation',
    'pivot': 'pivot',
    'emotional': 'emotional',
    'transition': 'transition',

    // Human-friendly mapped types
    'action': 'escalation',
    'dialogue': 'reaction',
    'discovery': 'hook',
    'conflict': 'escalation',
    'resolution': 'transition',
    'climax': 'escalation'
};

/**
 * Resolve a beat type to a Core Narrative Type
 * @param {string} type - The input beat type (e.g. "action")
 * @returns {string} The corresponding Core Narrative Type (e.g. "escalation")
 */
export function resolveBeatType(type) {
    if (!type) return 'reaction'; // Default fallback
    const normalized = type.toLowerCase().trim();
    return BEAT_TYPE_MAPPING[normalized] || 'reaction'; // Default unknown to reaction
}

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

/**
 * Deep clone an object using structuredClone with JSON fallback
 * @param {any} obj - Object to clone
 * @returns {any} Cloned object
 */
export function cloneBlueprint(obj) {
    try {
        return structuredClone(obj);
    } catch {
        return JSON.parse(JSON.stringify(obj));
    }
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

/**
 * Check if a character/persona name is delinked from a blueprint
 * @param {Object} blueprint - Blueprint object
 * @param {string} name - Character or persona name
 * @returns {boolean} True if delinked
 */
export function isDelinked(blueprint, name) {
    if (!blueprint?.delinkedCharacters?.length) return false;
    const normalized = normalizeCharacterName(name);
    return blueprint.delinkedCharacters.some(n => normalizeCharacterName(n) === normalized);
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
        // Ensure parent object exists without replacing existing objects
        // Note: typeof null === 'object' in JS, so check for null explicitly
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
 * Safely parse JSON with fallback
 * @param {string} text - JSON string
 * @param {*} fallback - Fallback value if parsing fails
 * @returns {*} Parsed object or fallback
 */
export function safeParseJSON(text, fallback = null) {
    // Return fallback for null/undefined/empty without logging
    if (text == null || text === '' || text === 'undefined') {
        return fallback;
    }
    try {
        return JSON.parse(text);
    } catch (e) {
        console.warn('[BlueprintUtils] Failed to parse JSON:', e);
        return fallback;
    }
}

/**
 * Robustly parse JSON from LLM responses.
 * Handles markdown code blocks, trailing commas, and common syntax issues.
 * @param {string} text - Raw text from LLM
 * @param {Object} options - Parsing options
 * @param {boolean} options.tryRepair - Whether to attempt basic syntax repair (default: true)
 * @returns {Object} Parsed JSON object
 * @throws {Error} If parsing fails even after cleanup/repair
 */
export function robustParseJSON(text, options = { tryRepair: true }) {
    if (!text || typeof text !== 'string') {
        throw new Error('Input to robustParseJSON must be a non-empty string');
    }

    let cleanText = text.trim();

    // 1. Remove markdown code blocks
    cleanText = cleanText.replace(/^```[a-z]*\s*\n?/i, '');
    cleanText = cleanText.replace(/\n?```\s*$/i, '');
    cleanText = cleanText.trim();

    // 2. Extract first JSON object/array if there's surrounding text
    // (Search for first { or [ and last } or ])
    const firstBrace = cleanText.indexOf('{');
    const firstBracket = cleanText.indexOf('[');
    let startIdx = -1;
    let endIdx = -1;

    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
        startIdx = firstBrace;
        endIdx = cleanText.lastIndexOf('}');
    } else if (firstBracket !== -1) {
        startIdx = firstBracket;
        endIdx = cleanText.lastIndexOf(']');
    }

    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        cleanText = cleanText.substring(startIdx, endIdx + 1);
    }

    // 3. Try standard parse first
    try {
        return JSON.parse(cleanText);
    } catch (firstError) {
        if (!options.tryRepair) {
            throw firstError;
        }

        // 4. Try repairs
        try {
            let repaired = cleanText;

            // Remove trailing commas in arrays/objects: ,] -> ] and ,} -> }
            repaired = repaired.replace(/,\s*\]/g, ']');
            repaired = repaired.replace(/,\s*\}/g, '}');

            // Fix mismatched brackets for innermost structures (primitives only inside)
            // [ ... } -> [ ... ]
            repaired = repaired.replace(/\[\s*([^[\]{}]+?)\s*\}\s*(,|]|}|\n|$)/g, '[$1]$2');
            // { ... ] -> { ... }
            repaired = repaired.replace(/\{\s*([^[\]{}]+?)\s*\]\s*(,|]|}|\n|$)/g, '{$1}$2');

            // Handle common LLM quirk: unbalanced brackets/braces at the very end
            // (e.g. LLM output ends with } but should be ])
            // We just try the standard parse first after trailing comma cleanup
            return JSON.parse(repaired);
        } catch (repairError) {
            // Last ditch: if it looks like it just needs a closing bracket/brace
            try {
                if (cleanText.startsWith('[') && !cleanText.endsWith(']')) {
                    return JSON.parse(cleanText + ']');
                }
                if (cleanText.startsWith('{') && !cleanText.endsWith('}')) {
                    return JSON.parse(cleanText + '}');
                }
            } catch (e) { /* ignore */ }

            // Throw the original error if repair fails
            throw firstError;
        }
    }
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate and sanitize an opening message.
 *
 * **SECURITY WARNING**: This function only validates length and type.
 * When displaying opening messages in HTML context, ALWAYS use escapeHtml()
 * to prevent XSS attacks. The opening message may contain user-generated
 * or LLM-generated content that could include malicious scripts.
 *
 * @param {string} openingMessage - The opening message to validate
 * @returns {Object} Validation result with:
 *   - valid {boolean}: Whether the message is valid
 *   - sanitized {string|null}: The sanitized message (truncated if needed)
 *   - error {string|undefined}: Error message if invalid
 */
export function validateOpeningMessage(openingMessage) {
    // Type check
    if (typeof openingMessage !== 'string') {
        return { valid: false, sanitized: null, error: 'Opening message must be a string' };
    }

    // Empty check
    if (openingMessage.trim().length < MIN_OPENING_MESSAGE_LENGTH) {
        return { valid: false, sanitized: null, error: 'Opening message cannot be empty' };
    }

    // Length check with truncation
    if (openingMessage.length > MAX_OPENING_MESSAGE_LENGTH) {
        console.warn(`[BlueprintUtils] Opening message too long (${openingMessage.length}), truncating to ${MAX_OPENING_MESSAGE_LENGTH}`);
        return {
            valid: true,
            sanitized: openingMessage.trim().substring(0, MAX_OPENING_MESSAGE_LENGTH),
            truncated: true
        };
    }

    return { valid: true, sanitized: openingMessage.trim() };
}

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
 * 1. blueprint.coverFileUrl (file-backed storage - full PNG served by server)
 * 2. blueprint.cover_image (standard schema field - base64 or URL)
 * 3. blueprint.coverImageUrl (legacy direct URL)
 * 4. blueprint.libraryData.coverThumbnail (library thumbnail data URL)
 * 5. blueprint.metadata.coverGallery[index].url (gallery with index)
 * 6. Computed from sourceBlueprintId (fallback for existing saved chats)
 *
 * @param {Object} blueprint - Blueprint object
 * @param {Object} blueprintState - Optional blueprint state with sourceBlueprintId
 * @returns {string|null} Cover URL or null if not found
 */
export function getBlueprintCoverUrl(blueprint, blueprintState = null) {
    if (!blueprint) return null;

    // File-backed storage URL (priority - serves full PNG, use CSS object-fit)
    if (blueprint.coverFileUrl) {
        return blueprint.coverFileUrl;
    }

    // Standard schema field (cover_image - base64 or URL)
    if (blueprint.cover_image) {
        return blueprint.cover_image;
    }

    // Direct URL (legacy format)
    if (blueprint.coverImageUrl) {
        return blueprint.coverImageUrl;
    }

    // Library thumbnail (data URL)
    if (blueprint.libraryData?.coverThumbnail) {
        return blueprint.libraryData.coverThumbnail;
    }

    // Gallery with index
    const gallery = blueprint.metadata?.coverGallery;
    if (gallery?.length) {
        const index = blueprint.metadata?.coverGalleryIndex ?? 0;
        return gallery[index]?.url || null;
    }

    // Fallback: Compute coverFileUrl from sourceBlueprintId (for existing saved chats)
    // This handles run copies that were saved before coverFileUrl was set
    const sourceId = blueprintState?.sourceBlueprintId || blueprint.sourceBlueprintId;
    if (sourceId && isValidUUID(sourceId)) {
        try {
            const filename = blueprintFilename(sourceId);
            return `/user/files/${filename}`;
        } catch (e) {
            // blueprintFilename throws on invalid UUID, but we already checked isValidUUID
            console.warn('[BlueprintUtils] Failed to compute coverFileUrl from sourceBlueprintId:', e.message);
        }
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

    // Block blob: URLs - they're transient and don't survive page reloads
    // Blob URLs should be converted to data URLs before storage
    if (url.startsWith('blob:')) {
        console.warn('[Story Mode] Rejecting blob URL (transient, will not survive reload):', url.substring(0, 50));
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

// ============================================================================
// DATA URL CONVERSION (for export/import feature)
// ============================================================================

/**
 * Convert Blob to data URL
 * @param {Blob} blob - Blob to convert
 * @returns {Promise<string>} Data URL
 */
export async function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/**
 * Convert data URL to Blob with validation
 * @param {string} dataURL - Data URL to convert
 * @returns {Blob} Blob object
 * @throws {Error} If data URL is invalid or unsafe
 */
export function dataURLtoBlob(dataURL) {
    // Validate type
    if (!dataURL || typeof dataURL !== 'string') {
        throw new Error('Invalid data URL: must be a string');
    }

    // Validate structure
    if (!dataURL.startsWith('data:')) {
        throw new Error('Invalid data URL: must start with data:');
    }

    const parts = dataURL.split(',');
    if (parts.length !== 2) {
        throw new Error('Invalid data URL: malformed structure');
    }

    // Validate and extract MIME type
    const mimeMatch = parts[0].match(/^data:([^;]+);base64$/);
    if (!mimeMatch) {
        throw new Error('Invalid data URL: must be base64 encoded');
    }

    const mime = mimeMatch[1];

    // Validate MIME type is safe (images only)
    if (!mime.startsWith('image/')) {
        throw new Error(`Invalid data URL: unsafe MIME type ${mime}`);
    }

    // Decode with error handling
    try {
        const bstr = atob(parts[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new Blob([u8arr], { type: mime });
    } catch (e) {
        throw new Error(`Invalid base64 encoding: ${e.message}`);
    }
}

/**
 * Convert data URL to File
 * @param {string} dataURL - Data URL to convert
 * @param {string} filename - Filename for the file
 * @returns {File} File object
 */
export function dataURLtoFile(dataURL, filename) {
    const blob = dataURLtoBlob(dataURL);
    return new File([blob], filename, { type: blob.type });
}

/**
 * Estimate the decoded size of a base64 data URL
 * @param {string} dataUrl - Data URL to estimate
 * @returns {number} Estimated size in bytes
 */
export function estimateDataURLSize(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string') {
        return 0;
    }
    const base64Length = dataUrl.split(',')[1]?.length || 0;
    return Math.round(base64Length * 0.75); // Base64 is ~33% larger
}

/**
 * Format bytes to human-readable string
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size (e.g., "5.2 MB")
 */
export function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Validate resource sizes against limits
 * @param {Array} resources - Array of resource objects
 * @param {string} resourceType - Type name for error messages
 * @param {string} dataUrlField - Field name containing data URL
 * @param {number} maxSizeBytes - Maximum allowed size
 * @returns {Object} {valid: boolean, error?: string}
 */
export function validateResourceSizes(resources, resourceType, dataUrlField, maxSizeBytes) {
    if (!resources) return { valid: true };

    for (const resource of resources) {
        const size = estimateDataURLSize(resource[dataUrlField]);
        if (size > maxSizeBytes) {
            return {
                valid: false,
                error: `${resourceType} "${resource.name}" exceeds ${formatBytes(maxSizeBytes)} limit (${formatBytes(size)})`
            };
        }
    }

    return { valid: true };
}

/**
 * Safe JSON parsing with size limit and prototype pollution protection
 * Extends robustParseJSON with security checks
 * @param {string} jsonString - JSON string to parse
 * @param {number} maxSizeKB - Maximum size in KB (default: 500)
 * @returns {Object} Parsed JSON object
 * @throws {Error} If parsing fails, size exceeded, or malicious content detected
 */
export function safeParseWithLimit(jsonString, maxSizeKB = 500) {
    if (typeof jsonString !== 'string') {
        throw new Error('JSON input must be a string');
    }
    if (jsonString.length > maxSizeKB * 1024) {
        throw new Error(`JSON exceeds size limit: ${jsonString.length} bytes (max ${maxSizeKB * 1024})`);
    }

    const parsed = robustParseJSON(jsonString, { tryRepair: false });

    // Check for prototype pollution (check OWN properties only, not inherited)
    if (parsed && typeof parsed === 'object') {
        if (Object.hasOwn(parsed, '__proto__') || Object.hasOwn(parsed, 'constructor')) {
            throw new Error('Potentially malicious JSON detected: prototype pollution attempt');
        }
    }

    return parsed;
}
