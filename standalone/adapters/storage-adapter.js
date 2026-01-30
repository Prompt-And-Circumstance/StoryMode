/**
 * Storage Adapter Module
 * Bridges localStorage and SillyTavern file storage API
 */

import { getApiUrl } from '../settings-system.js';

// ============================================================================
// STORAGE MODE DETECTION
// ============================================================================

/**
 * Check if backend storage is available
 * @returns {Promise<boolean>} True if backend is available
 */
export async function isStorageAvailable() {
    const apiUrl = getApiUrl();
    if (!apiUrl) return false;

    try {
        const response = await fetch(`${apiUrl}/api/files`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });
        return response.ok;
    } catch {
        return false;
    }
}

/**
 * Get the current storage mode
 * @returns {Promise<'local' | 'backend'>} Storage mode
 */
export async function getStorageMode() {
    const available = await isStorageAvailable();
    return available ? 'backend' : 'local';
}

// ============================================================================
// LOCAL STORAGE OPERATIONS
// ============================================================================

const STORAGE_PREFIX = 'storymode-standalone-';
const STORAGE_BLUEPRINTS = `${STORAGE_PREFIX}blueprints`;

/**
 * Get all blueprints from localStorage
 * @returns {Array<Object>} Array of blueprint metadata
 */
export function getLocalBlueprints() {
    try {
        const data = localStorage.getItem(STORAGE_BLUEPRINTS);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error('[Storage] Failed to get local blueprints:', e);
        return [];
    }
}

/**
 * Save a blueprint to localStorage
 * @param {Object} blueprint - Blueprint to save
 * @returns {boolean} True if saved successfully
 */
export function saveLocalBlueprint(blueprint) {
    try {
        const blueprints = getLocalBlueprints();
        const index = blueprints.findIndex(b => b.id === blueprint.id);

        if (index >= 0) {
            blueprints[index] = blueprint;
        } else {
            blueprints.push(blueprint);
        }

        localStorage.setItem(STORAGE_BLUEPRINTS, JSON.stringify(blueprints));
        return true;
    } catch (e) {
        console.error('[Storage] Failed to save local blueprint:', e);
        return false;
    }
}

/**
 * Delete a blueprint from localStorage
 * @param {string} blueprintId - Blueprint ID to delete
 * @returns {boolean} True if deleted successfully
 */
export function deleteLocalBlueprint(blueprintId) {
    try {
        const blueprints = getLocalBlueprints();
        const filtered = blueprints.filter(b => b.id !== blueprintId);
        localStorage.setItem(STORAGE_BLUEPRINTS, JSON.stringify(filtered));
        return true;
    } catch (e) {
        console.error('[Storage] Failed to delete local blueprint:', e);
        return false;
    }
}

/**
 * Clear all blueprints from localStorage
 * @returns {boolean} True if cleared successfully
 */
export function clearLocalBlueprints() {
    try {
        localStorage.removeItem(STORAGE_BLUEPRINTS);
        return true;
    } catch (e) {
        console.error('[Storage] Failed to clear local blueprints:', e);
        return false;
    }
}

// ============================================================================
// BACKEND STORAGE OPERATIONS (via SillyTavern API)
// ============================================================================

/**
 * Save a blueprint to the backend
 * @param {Object} blueprint - Blueprint to save
 * @returns {Promise<boolean>} True if saved successfully
 */
export async function saveBackendBlueprint(blueprint) {
    const apiUrl = getApiUrl();
    if (!apiUrl) {
        throw new Error('No API URL configured');
    }

    try {
        // Convert blueprint to base64 PNG for storage
        const json = JSON.stringify(blueprint, null, 2);
        const base64 = btoa(unescape(encodeURIComponent(json)));

        const formData = new FormData();
        formData.append('data', base64);
        formData.append('filename', `${blueprint.id}.png`);

        const response = await fetch(`${apiUrl}/api/files/save`, {
            method: 'POST',
            body: formData,
        });

        return response.ok;
    } catch (e) {
        console.error('[Storage] Failed to save backend blueprint:', e);
        throw e;
    }
}

/**
 * Delete a blueprint from the backend
 * @param {string} blueprintId - Blueprint ID to delete
 * @returns {Promise<boolean>} True if deleted successfully
 */
export async function deleteBackendBlueprint(blueprintId) {
    const apiUrl = getApiUrl();
    if (!apiUrl) {
        throw new Error('No API URL configured');
    }

    try {
        const response = await fetch(`${apiUrl}/api/files/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filename: `${blueprintId}.png`,
            }),
        });

        return response.ok;
    } catch (e) {
        console.error('[Storage] Failed to delete backend blueprint:', e);
        throw e;
    }
}

/**
 * List blueprints from the backend
 * @returns {Promise<Array<string>>} Array of blueprint filenames
 */
export async function listBackendBlueprints() {
    const apiUrl = getApiUrl();
    if (!apiUrl) {
        throw new Error('No API URL configured');
    }

    try {
        const response = await fetch(`${apiUrl}/api/files/all?format=true`);
        if (!response.ok) return [];

        const data = await response.json();

        // Filter for blueprint PNG files
        return data
            .filter(f => f.filename.endsWith('.png'))
            .map(f => ({
                filename: f.filename,
                url: f.url,
                modified: f.modified,
            }));
    } catch (e) {
        console.error('[Storage] Failed to list backend blueprints:', e);
        return [];
    }
}

/**
 * Load a blueprint from the backend
 * @param {string} filename - Blueprint filename
 * @returns {Promise<Object|null>} Blueprint object or null
 */
export async function loadBackendBlueprint(filename) {
    const apiUrl = getApiUrl();
    if (!apiUrl) {
        throw new Error('No API URL configured');
    }

    try {
        const response = await fetch(`${apiUrl}/api/files/download?filename=${encodeURIComponent(filename)}`);
        if (!response.ok) return null;

        const data = await response.json();

        // Decode base64 to JSON
        const json = atob(data);
        return JSON.parse(json);
    } catch (e) {
        console.error('[Storage] Failed to load backend blueprint:', e);
        return null;
    }
}

// ============================================================================
// UNIFIED STORAGE API
// ============================================================================

/**
 * Save a blueprint (automatically chooses storage method)
 * @param {Object} blueprint - Blueprint to save
 * @returns {Promise<boolean>} True if saved successfully
 */
export async function saveBlueprint(blueprint) {
    const mode = await getStorageMode();

    if (mode === 'backend') {
        return await saveBackendBlueprint(blueprint);
    } else {
        return saveLocalBlueprint(blueprint);
    }
}

/**
 * Delete a blueprint (automatically chooses storage method)
 * @param {string} blueprintId - Blueprint ID to delete
 * @returns {Promise<boolean>} True if deleted successfully
 */
export async function deleteBlueprint(blueprintId) {
    const mode = await getStorageMode();

    if (mode === 'backend') {
        return await deleteBackendBlueprint(blueprintId);
    } else {
        return deleteLocalBlueprint(blueprintId);
    }
}

/**
 * List all blueprints
 * @returns {Promise<Array<Object>>} Array of blueprint metadata
 */
export async function listBlueprints() {
    const mode = await getStorageMode();

    if (mode === 'backend') {
        const files = await listBackendBlueprints();
        // Convert file info to blueprint metadata
        return files.map(f => ({
            id: f.filename.replace('.png', ''),
            filename: f.filename,
            url: f.url,
            modified: f.modified,
        }));
    } else {
        return getLocalBlueprints();
    }
}

// ============================================================================
// EXPORT FOR DEBUGGING
// ============================================================================

if (typeof window !== 'undefined') {
    window.StoryModeStorage = {
        isStorageAvailable,
        getStorageMode,
        getLocalBlueprints,
        saveLocalBlueprint,
        deleteLocalBlueprint,
        clearLocalBlueprints,
        saveBackendBlueprint,
        deleteBackendBlueprint,
        listBackendBlueprints,
        loadBackendBlueprint,
        saveBlueprint,
        deleteBlueprint,
        listBlueprints,
    };
}
