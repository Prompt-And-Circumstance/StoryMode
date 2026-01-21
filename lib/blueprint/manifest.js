/**
 * Manifest Manager - Blueprint Index Storage
 *
 * Manages a lightweight JSON manifest for listing blueprints without
 * loading full PNG files. Debounces saves for frequent updates.
 *
 * @module manifest
 * @version 1.0.0
 */

import {
    uploadJSON,
    downloadJSON,
    getManifestFilename,
    FileNotFoundError,
} from './file-api.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const MANIFEST_VERSION = 1;
const DEBOUNCE_MS = 2000;

// ============================================================================
// MANIFEST SCHEMA
// ============================================================================

/**
 * @typedef {Object} ManifestEntry
 * @property {string} blueprint_id - UUID
 * @property {string} title - Display title
 * @property {string} story_type_name - Story type for badge
 * @property {number} scene_count - Number of scenes
 * @property {boolean} favorite - Starred status
 * @property {number} access_count - Play count
 * @property {string} last_accessed_at - ISO timestamp
 * @property {string} created_at - ISO timestamp
 * @property {string} modified_at - ISO timestamp
 * @property {string} filename - PNG filename
 */

/**
 * @typedef {Object} Manifest
 * @property {number} version - Schema version
 * @property {string} lastModified - ISO timestamp
 * @property {ManifestEntry[]} blueprints - All entries
 */

// ============================================================================
// STATE
// ============================================================================

let cachedManifest = null;
let pendingSave = null;
let debounceTimer = null;
let isInitialized = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Load manifest from server or create if missing
 * @returns {Promise<Manifest>} Loaded manifest
 */
export async function loadManifest() {
    if (cachedManifest) {
        return cachedManifest;
    }

    try {
        const manifest = await downloadJSON(getManifestFilename());

        // Validate structure
        if (!manifest || typeof manifest.version !== 'number') {
            console.warn('[Manifest] Invalid manifest structure, creating new');
            cachedManifest = createEmptyManifest();
        } else {
            cachedManifest = manifest;
        }
    } catch (error) {
        if (error instanceof FileNotFoundError) {
            console.log('[Manifest] No manifest found, creating new');
            cachedManifest = createEmptyManifest();
            await saveManifestImmediate();
        } else {
            console.error('[Manifest] Load error:', error);
            throw error;
        }
    }

    isInitialized = true;
    registerUnloadHandler();
    return cachedManifest;
}

/**
 * Create an empty manifest
 * @returns {Manifest} Empty manifest
 */
function createEmptyManifest() {
    return {
        version: MANIFEST_VERSION,
        lastModified: new Date().toISOString(),
        blueprints: [],
    };
}

// ============================================================================
// SAVE OPERATIONS
// ============================================================================

/**
 * Save manifest with debouncing (2s delay)
 * Use for frequent updates like metadata changes
 */
export function saveManifestDebounced() {
    if (!cachedManifest) return;

    cachedManifest.lastModified = new Date().toISOString();
    pendingSave = true;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
        await saveManifestImmediate();
    }, DEBOUNCE_MS);
}

/**
 * Force immediate save (flush pending)
 * Use for critical operations like delete or before page unload
 * @returns {Promise<void>}
 */
export async function flushManifest() {
    clearTimeout(debounceTimer);

    if (pendingSave && cachedManifest) {
        await saveManifestImmediate();
    }
}

/**
 * Internal: Save manifest to server immediately
 * @returns {Promise<void>}
 */
async function saveManifestImmediate() {
    if (!cachedManifest) return;

    try {
        await uploadJSON(getManifestFilename(), cachedManifest);
        pendingSave = false;
        console.log('[Manifest] Saved successfully');
    } catch (error) {
        console.error('[Manifest] Save failed:', error);
        throw error;
    }
}

// ============================================================================
// ENTRY OPERATIONS
// ============================================================================

/**
 * Add or update a manifest entry
 * @param {ManifestEntry} entry - Entry to upsert
 */
export function upsertEntry(entry) {
    if (!cachedManifest) {
        throw new Error('Manifest not initialized - call loadManifest() first');
    }

    const index = cachedManifest.blueprints.findIndex(
        e => e.blueprint_id === entry.blueprint_id
    );

    if (index >= 0) {
        cachedManifest.blueprints[index] = entry;
    } else {
        cachedManifest.blueprints.push(entry);
    }

    saveManifestDebounced();
}

/**
 * Remove an entry from manifest
 * @param {string} blueprintId - Blueprint ID to remove
 */
export function removeEntry(blueprintId) {
    if (!cachedManifest) return;

    cachedManifest.blueprints = cachedManifest.blueprints.filter(
        e => e.blueprint_id !== blueprintId
    );

    saveManifestDebounced();
}

/**
 * Get a specific entry by ID
 * @param {string} blueprintId - Blueprint ID
 * @returns {ManifestEntry|null} Entry or null
 */
export function getEntry(blueprintId) {
    if (!cachedManifest) return null;
    return cachedManifest.blueprints.find(e => e.blueprint_id === blueprintId) || null;
}

/**
 * Check if an entry exists
 * @param {string} blueprintId - Blueprint ID
 * @returns {boolean} True if exists
 */
export function hasEntry(blueprintId) {
    return getEntry(blueprintId) !== null;
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get all manifest entries
 * @returns {ManifestEntry[]} All entries
 */
export function listAllEntries() {
    if (!cachedManifest) return [];
    return [...cachedManifest.blueprints];
}

/**
 * Get favorite entries
 * @returns {ManifestEntry[]} Favorite entries
 */
export function listFavorites() {
    if (!cachedManifest) return [];
    return cachedManifest.blueprints.filter(e => e.favorite);
}

/**
 * Get recently accessed entries
 * @param {number} limit - Maximum entries to return
 * @returns {ManifestEntry[]} Recent entries, sorted by last_accessed_at descending
 */
export function listRecent(limit = 20) {
    if (!cachedManifest) return [];

    return [...cachedManifest.blueprints]
        .filter(e => e.last_accessed_at)
        .sort((a, b) => new Date(b.last_accessed_at) - new Date(a.last_accessed_at))
        .slice(0, limit);
}

/**
 * Search entries by title (case-insensitive)
 * @param {string} query - Search query
 * @returns {ManifestEntry[]} Matching entries
 */
export function searchEntries(query) {
    if (!cachedManifest || !query) return listAllEntries();

    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return listAllEntries();

    return cachedManifest.blueprints.filter(entry => {
        const searchable = [
            entry.title || '',
            entry.story_type_name || '',
        ].join(' ').toLowerCase();

        return terms.every(term => searchable.includes(term));
    });
}

// ============================================================================
// METADATA UPDATES
// ============================================================================

/**
 * Update favorite status
 * @param {string} blueprintId - Blueprint ID
 * @param {boolean} favorite - New favorite status
 */
export function updateFavorite(blueprintId, favorite) {
    const entry = getEntry(blueprintId);
    if (!entry) return;

    entry.favorite = favorite;
    entry.modified_at = new Date().toISOString();
    saveManifestDebounced();
}

/**
 * Update access count and timestamp
 * @param {string} blueprintId - Blueprint ID
 */
export function recordAccess(blueprintId) {
    const entry = getEntry(blueprintId);
    if (!entry) return;

    entry.access_count = (entry.access_count || 0) + 1;
    entry.last_accessed_at = new Date().toISOString();
    saveManifestDebounced();
}

/**
 * Update entry title
 * @param {string} blueprintId - Blueprint ID
 * @param {string} title - New title
 */
export function updateTitle(blueprintId, title) {
    const entry = getEntry(blueprintId);
    if (!entry) return;

    entry.title = title;
    entry.modified_at = new Date().toISOString();
    saveManifestDebounced();
}

// ============================================================================
// UNLOAD HANDLING
// ============================================================================

let unloadHandlerRegistered = false;

/**
 * Register beforeunload handler to flush pending saves
 */
function registerUnloadHandler() {
    if (unloadHandlerRegistered) return;

    window.addEventListener('beforeunload', () => {
        if (pendingSave && cachedManifest) {
            // Use sendBeacon for reliable delivery during page unload
            // Falls back to sync XHR if sendBeacon fails
            try {
                const json = JSON.stringify(cachedManifest, null, 2);
                const base64 = btoa(unescape(encodeURIComponent(json)));
                const payload = JSON.stringify({
                    name: getManifestFilename(),
                    data: base64,
                });

                // Try sendBeacon first (modern, reliable for unload)
                const blob = new Blob([payload], { type: 'application/json' });
                const sent = navigator.sendBeacon('/api/files/upload', blob);

                if (!sent) {
                    // Fallback to sync XHR (deprecated but works)
                    const xhr = new XMLHttpRequest();
                    xhr.open('POST', '/api/files/upload', false);
                    xhr.setRequestHeader('Content-Type', 'application/json');
                    xhr.send(payload);
                }
            } catch (e) {
                console.error('[Manifest] Save on unload failed:', e);
            }
        }
    });

    unloadHandlerRegistered = true;
}

// ============================================================================
// UTILITY
// ============================================================================

/**
 * Create a manifest entry from a blueprint object
 * @param {Object} blueprint - Full blueprint object
 * @param {string} filename - PNG filename
 * @returns {ManifestEntry} Manifest entry
 */
export function createManifestEntry(blueprint, filename) {
    const now = new Date().toISOString();

    return {
        blueprint_id: blueprint.blueprint_id,
        title: blueprint.blueprint_title || blueprint.userMetadata?.title || blueprint.core_premise?.substring(0, 50) || 'Untitled',
        story_type_name: blueprint.story_type_name || 'Unknown',
        scene_count: blueprint.scene_plan?.length || 0,
        favorite: blueprint.userMetadata?.favorite || false,
        access_count: blueprint.libraryData?.accessCount || 0,
        last_accessed_at: blueprint.libraryData?.lastAccessed || now,
        created_at: blueprint.libraryData?.dateAdded || blueprint.metadata?.createdAt || now,
        modified_at: blueprint.libraryData?.dateModified || now,
        filename: filename,
    };
}

/**
 * Reset manifest state (for testing)
 */
export function resetManifest() {
    cachedManifest = null;
    pendingSave = null;
    isInitialized = false;
    clearTimeout(debounceTimer);
}

/**
 * Check if manifest is initialized
 * @returns {boolean}
 */
export function isManifestInitialized() {
    return isInitialized;
}
