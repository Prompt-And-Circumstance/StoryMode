/**
 * File-Backed Data Persistence Layer
 *
 * Replaces localforage/localStorage with SillyTavern's File API for
 * cross-device persistence. Uses in-memory cache + debounced saves
 * (same pattern as manifest.js).
 *
 * Fallback chain per data key:
 *   File API -> localforage -> default JSON URL -> empty array/object
 *
 * @module file-backed-data
 * @version 1.0.0
 */

import { uploadJSON, downloadJSON, FileNotFoundError } from '../blueprint/file-api.js';
import { sanitizeObject } from '../utils/import-helpers.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const DEBOUNCE_MS = 2000;

/** Server filenames for each data type */
const FILENAMES = {
    storyTypes: 'storymode-story-types.json',
    authorStyles: 'storymode-author-styles.json',
    originalStoryTypes: 'storymode-original-story-types.json',
    originalAuthorStyles: 'storymode-original-author-styles.json',
    playStats: 'storymode-play-stats.json',
};

/** localforage keys for fallback reads */
const LOCALFORAGE_KEYS = {
    storyTypes: 'story_mode_story_types',
    authorStyles: 'story_mode_author_styles',
    originalStoryTypes: 'story_mode_original_story_types',
    originalAuthorStyles: 'story_mode_original_author_styles',
};

/** localStorage key for play stats fallback */
const PLAY_STATS_LOCALSTORAGE_KEY = 'storymode-play-stats';

// ============================================================================
// STATE
// ============================================================================

/** Pending debounced saves: filename -> { data, timer } */
const pendingSaves = new Map();

let unloadRegistered = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Register beforeunload handler to flush pending saves.
 * Call once at startup.
 */
export function initFileBackedData() {
    if (unloadRegistered) return;

    window.addEventListener('beforeunload', flushOnUnload);
    unloadRegistered = true;
    console.log('[Story Mode] File-backed data layer initialized');
}

// ============================================================================
// GENERIC LOAD / SAVE
// ============================================================================

/**
 * Load JSON data from File API with fallback chain.
 * Tries: File API → localforage → default URL → null.
 * Automatically migrates localforage data to File API if found.
 */
async function loadDataFile(filename, localforageKey, defaultUrl) {
    // Try File API
    try {
        return await downloadJSON(filename);
    } catch (e) {
        if (!(e instanceof FileNotFoundError)) {
            console.warn(`[Story Mode] File API error for ${filename}:`, e.message);
        }
    }

    // Try localforage with natural migration
    if (localforageKey && typeof localforage !== 'undefined') {
        try {
            const stored = await localforage.getItem(localforageKey);
            const hasData = stored && (Array.isArray(stored) ? stored.length > 0 : Object.keys(stored).length > 0);
            if (hasData) {
                saveDataDebounced(filename, stored);
                return stored;
            }
        } catch (e) {
            console.warn(`[Story Mode] localforage fallback error for ${localforageKey}:`, e.message);
        }
    }

    // Try default JSON URL
    if (defaultUrl) {
        try {
            const response = await fetch(defaultUrl);
            if (response.ok) return await response.json();
        } catch (e) {
            console.warn(`[Story Mode] Default URL fallback error for ${defaultUrl}:`, e.message);
        }
    }

    return null;
}

/** Save data to File API with debouncing (2s). */
export function saveDataDebounced(filename, data) {
    const existing = pendingSaves.get(filename);
    if (existing?.timer) clearTimeout(existing.timer);

    const timer = setTimeout(async () => {
        try {
            await uploadJSON(filename, data);
            pendingSaves.delete(filename);
        } catch (e) {
            console.error(`[Story Mode] Debounced save failed for ${filename}:`, e.message);
            const entry = pendingSaves.get(filename);
            if (entry) entry.timer = null;
        }
    }, DEBOUNCE_MS);

    pendingSaves.set(filename, { data, timer });
}

/** Save data to File API immediately. Returns true if successful. */
async function saveDataImmediate(filename, data) {
    const existing = pendingSaves.get(filename);
    if (existing?.timer) clearTimeout(existing.timer);
    pendingSaves.delete(filename);

    try {
        await uploadJSON(filename, data);
        return true;
    } catch (e) {
        console.error(`[Story Mode] Immediate save failed for ${filename}:`, e.message);
        return false;
    }
}

/** Force-flush all pending debounced saves immediately. */
export async function flushAllData() {
    const entries = [...pendingSaves.entries()];
    entries.forEach(([_, { timer }]) => timer && clearTimeout(timer));

    const uploads = entries.map(([filename, { data }]) =>
        uploadJSON(filename, data)
            .then(() => pendingSaves.delete(filename))
            .catch(e => console.error(`[Story Mode] Flush failed for ${filename}:`, e.message))
    );

    await Promise.allSettled(uploads);
}

// ============================================================================
// BEFOREUNLOAD HANDLER
// ============================================================================

/**
 * Flush pending saves on page unload.
 * Uses sendBeacon for small payloads, sync XHR for large ones.
 * Matches manifest.js pattern — no explicit auth headers (session cookies suffice).
 */
function flushOnUnload() {
    for (const [filename, { data, timer }] of pendingSaves.entries()) {
        if (timer) clearTimeout(timer);

        try {
            const json = JSON.stringify(data, null, 2);
            const bytes = new TextEncoder().encode(json);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            const base64 = btoa(binary);
            const payload = JSON.stringify({ name: filename, data: base64 });

            // sendBeacon has ~64KB limit; use sync XHR for larger payloads
            if (payload.length < 64000) {
                const blob = new Blob([payload], { type: 'application/json' });
                const sent = navigator.sendBeacon('/api/files/upload', blob);
                if (sent) continue;
            }

            // Fallback: sync XHR (same pattern as manifest.js)
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/files/upload', false);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.send(payload);
        } catch (e) {
            console.error(`[Story Mode] Unload save failed for ${filename}:`, e);
        }
    }

    pendingSaves.clear();
}

// ============================================================================
// CONVENIENCE WRAPPERS: STORY TYPES & AUTHOR STYLES
// ============================================================================

export async function loadStoryTypesFromFile(defaultUrl) {
    const data = await loadDataFile(FILENAMES.storyTypes, LOCALFORAGE_KEYS.storyTypes, defaultUrl);
    return Array.isArray(data) ? data : [];
}

export function saveStoryTypesToFile(data) {
    saveDataDebounced(FILENAMES.storyTypes, data);
}

export async function saveStoryTypesToFileImmediate(data) {
    return saveDataImmediate(FILENAMES.storyTypes, data);
}

export async function loadAuthorStylesFromFile(defaultUrl) {
    const data = await loadDataFile(FILENAMES.authorStyles, LOCALFORAGE_KEYS.authorStyles, defaultUrl);
    return Array.isArray(data) ? data : [];
}

export function saveAuthorStylesToFile(data) {
    saveDataDebounced(FILENAMES.authorStyles, data);
}

export async function saveAuthorStylesToFileImmediate(data) {
    return saveDataImmediate(FILENAMES.authorStyles, data);
}

// ============================================================================
// CONVENIENCE WRAPPERS: ORIGINAL DATA (REVERT FUNCTIONALITY)
// ============================================================================

async function loadOriginalData(filename, localforageKey, currentData) {
    const data = await loadDataFile(filename, localforageKey, null);
    if (Array.isArray(data) && data.length > 0) return data;

    // First load: create backup from current data
    if (currentData?.length > 0) {
        const backup = structuredClone(currentData);
        saveDataDebounced(filename, backup);
        return backup;
    }
    return [];
}

export async function loadOriginalStoryTypesFromFile(currentTypes) {
    return loadOriginalData(FILENAMES.originalStoryTypes, LOCALFORAGE_KEYS.originalStoryTypes, currentTypes);
}

export function saveOriginalStoryTypesToFile(data) {
    saveDataDebounced(FILENAMES.originalStoryTypes, data);
}

export async function loadOriginalAuthorStylesFromFile(currentStyles) {
    return loadOriginalData(FILENAMES.originalAuthorStyles, LOCALFORAGE_KEYS.originalAuthorStyles, currentStyles);
}

export function saveOriginalAuthorStylesToFile(data) {
    saveDataDebounced(FILENAMES.originalAuthorStyles, data);
}

// ============================================================================
// CONVENIENCE WRAPPERS: PLAY STATS
// ============================================================================

export async function loadPlayStatsFromFile() {
    // Try File API
    try {
        const data = await downloadJSON(FILENAMES.playStats);
        if (data && typeof data === 'object') return data;
    } catch (e) {
        if (!(e instanceof FileNotFoundError)) {
            console.warn('[Story Mode] File API error for play stats:', e.message);
        }
    }

    // Fallback to localStorage with natural migration
    try {
        const stored = localStorage.getItem(PLAY_STATS_LOCALSTORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed && typeof parsed === 'object') {
                sanitizeObject(parsed);
                saveDataDebounced(FILENAMES.playStats, parsed);
                return parsed;
            }
        }
    } catch (e) {
        console.warn('[Story Mode] localStorage fallback error for play stats:', e.message);
    }

    return {};
}

export function savePlayStatsToFile(data) {
    saveDataDebounced(FILENAMES.playStats, data);
}
