/**
 * Scene Image Storage Module
 *
 * Manages caching and persistence for generated scene images.
 * Stores images per-blueprint, per-scene with size-aware limits.
 */

import { saveSettingsDebounced } from '/script.js';
import { extension_settings } from '/scripts/extensions.js';
import { MODULE_NAME } from '../core/state-manager.js';

// ============================================================================
// MODULE CONSTANTS
// ============================================================================

/** Maximum number of images to store per blueprint */
const MAX_IMAGES_PER_BLUEPRINT = 50;

/** Maximum total images across all blueprints */
const MAX_TOTAL_IMAGES = 200;

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

/**
 * Initialize scene image storage in extension settings.
 * Ensures the storage structure exists.
 */
export function initializeStorage() {
    const settings = extension_settings[MODULE_NAME];

    if (!settings.sceneImages) {
        settings.sceneImages = {};
        saveSettingsDebounced();
    }
}

/**
 * Get the scene images storage object.
 * @returns {Object} Scene images storage
 */
function getStorage() {
    initializeStorage();
    return extension_settings[MODULE_NAME].sceneImages || {};
}

/**
 * Save the scene images storage object.
 */
function saveStorage() {
    saveSettingsDebounced();
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Store a generated scene image.
 * @param {string} blueprintId - Blueprint UUID
 * @param {number} sceneIndex - Scene index (0-based)
 * @param {Object} imageData - Image data object
 * @param {string} imageData.prompt - The prompt used for generation
 * @param {string} imageData.imageData - Base64 or URL of the image
 * @param {string} [ imageData.sdProfile] - SD profile ID used for generation
 * @returns {boolean} True if stored successfully
 */
export function storeSceneImage(blueprintId, sceneIndex, imageData) {
    // Validate parameters with bounds checking
    if (!blueprintId || typeof sceneIndex !== 'number' || !imageData) {
        console.warn('[Scene Image Storage] Invalid parameters for storeSceneImage');
        return false;
    }

    // Add sceneIndex bounds checking
    if (sceneIndex < 0 || sceneIndex >= 1000 || !Number.isInteger(sceneIndex)) {
        console.warn('[Scene Image Storage] Invalid sceneIndex (must be 0-999):', sceneIndex);
        return false;
    }

    const storage = getStorage();

    // Initialize blueprint storage if needed
    if (!storage[blueprintId]) {
        storage[blueprintId] = {};
    }

    // Store the image with metadata
    storage[blueprintId][sceneIndex] = {
        prompt: imageData.prompt || '',
        imageData: imageData.imageData || '',
        sdProfile: imageData.sdProfile || null,
        generatedAt: Date.now(),
    };

    // Enforce size limits
    enforceStorageLimits(storage);

    saveStorage();
    return true;
}

/**
 * Retrieve a stored scene image.
 * @param {string} blueprintId - Blueprint UUID
 * @param {number} sceneIndex - Scene index (0-based)
 * @returns {Object|null} Image data object or null if not found
 */
export function getSceneImage(blueprintId, sceneIndex) {
    const storage = getStorage();
    return storage[blueprintId]?.[sceneIndex] || null;
}

/**
 * Get all scene images for a blueprint.
 * @param {string} blueprintId - Blueprint UUID
 * @returns {Object} Map of scene index to image data
 */
export function getAllBlueprintImages(blueprintId) {
    const storage = getStorage();
    return storage[blueprintId] || {};
}

/**
 * Delete a specific scene image.
 * @param {string} blueprintId - Blueprint UUID
 * @param {number} sceneIndex - Scene index (0-based)
 * @returns {boolean} True if deleted successfully
 */
export function deleteSceneImage(blueprintId, sceneIndex) {
    const storage = getStorage();

    if (!storage[blueprintId] || storage[blueprintId][sceneIndex] === undefined) {
        return false;
    }

    delete storage[blueprintId][sceneIndex];

    // Clean up empty blueprint storage
    if (Object.keys(storage[blueprintId]).length === 0) {
        delete storage[blueprintId];
    }

    saveStorage();
    return true;
}

/**
 * Delete all images for a blueprint.
 * @param {string} blueprintId - Blueprint UUID
 * @returns {number} Number of images deleted
 */
export function deleteBlueprintImages(blueprintId) {
    const storage = getStorage();

    if (!storage[blueprintId]) {
        return 0;
    }

    const count = Object.keys(storage[blueprintId]).length;
    delete storage[blueprintId];

    saveStorage();
    return count;
}

/**
 * Clear all stored scene images.
 * @returns {number} Number of images deleted
 */
export function clearAllImages() {
    const storage = getStorage();
    const blueprintIds = Object.keys(storage);
    let count = 0;

    for (const id of blueprintIds) {
        count += Object.keys(storage[id]).length;
    }

    extension_settings[MODULE_NAME].sceneImages = {};
    saveStorage();

    return count;
}

/**
 * Get storage statistics.
 * @returns {Object} Storage stats
 */
export function getStorageStats() {
    const storage = getStorage();
    const blueprintIds = Object.keys(storage);
    let totalImages = 0;
    let oldestTimestamp = Date.now();
    let newestTimestamp = 0;
    let totalSizeBytes = 0;

    for (const id of blueprintIds) {
        const scenes = Object.keys(storage[id]);
        for (const sceneKey of scenes) {
            const img = storage[id][sceneKey];
            totalImages++;
            if (img.generatedAt < oldestTimestamp) oldestTimestamp = img.generatedAt;
            if (img.generatedAt > newestTimestamp) newestTimestamp = img.generatedAt;

            // Estimate size (rough calculation for base64)
            if (img.imageData?.startsWith('data:')) {
                totalSizeBytes += img.imageData.length * 0.75; // Base64 to bytes approximation
            }
        }
    }

    return {
        totalBlueprints: blueprintIds.length,
        totalImages,
        oldestImage: oldestTimestamp !== Date.now() ? new Date(oldestTimestamp) : null,
        newestImage: newestTimestamp > 0 ? new Date(newestTimestamp) : null,
        estimatedSizeBytes: totalSizeBytes,
        estimatedSizeMB: (totalSizeBytes / (1024 * 1024)).toFixed(2),
    };
}

// ============================================================================
// STORAGE LIMITS
// ============================================================================

/**
 * Enforce storage limits by removing oldest images.
 * @param {Object} storage - Storage object
 */
function enforceStorageLimits(storage) {
    // Count total images across all blueprints
    let totalImages = 0;
    const blueprintEntries = [];

    for (const [blueprintId, scenes] of Object.entries(storage)) {
        const sceneCount = Object.keys(scenes).length;
        totalImages += sceneCount;
        blueprintEntries.push({ blueprintId, scenes, count: sceneCount });
    }

    // Enforce per-blueprint limit
    for (const entry of blueprintEntries) {
        if (entry.count > MAX_IMAGES_PER_BLUEPRINT) {
            removeOldestImages(entry.scenes, entry.count - MAX_IMAGES_PER_BLUEPRINT);
            entry.count = MAX_IMAGES_PER_BLUEPRINT;
        }
    }

    // Recalculate total
    totalImages = blueprintEntries.reduce((sum, e) => sum + Object.keys(e.scenes).length, 0);

    // Enforce total limit
    if (totalImages > MAX_TOTAL_IMAGES) {
        const excess = totalImages - MAX_TOTAL_IMAGES;
        removeOldestImagesAcrossBlueprints(storage, excess);
    }
}

/**
 * Remove oldest images from a single blueprint's scenes.
 * @param {Object} scenes - Scenes object for a blueprint
 * @param {number} count - Number of images to remove
 */
function removeOldestImages(scenes, count) {
    // Sort scenes by generated timestamp
    const sortedEntries = Object.entries(scenes)
        .sort(([, a], [, b]) => (a.generatedAt || 0) - (b.generatedAt || 0));

    // Remove oldest entries
    for (let i = 0; i < count && i < sortedEntries.length; i++) {
        const [sceneIndex] = sortedEntries[i];
        delete scenes[sceneIndex];
    }
}

/**
 * Remove oldest images across all blueprints.
 * @param {Object} storage - Full storage object
 * @param {number} count - Number of images to remove
 */
function removeOldestImagesAcrossBlueprints(storage, count) {
    // Collect all images with timestamps
    const allImages = [];

    for (const [blueprintId, scenes] of Object.entries(storage)) {
        for (const [sceneIndex, img] of Object.entries(scenes)) {
            allImages.push({
                blueprintId,
                sceneIndex,
                timestamp: img.generatedAt || 0,
            });
        }
    }

    // Sort by timestamp (oldest first)
    allImages.sort((a, b) => a.timestamp - b.timestamp);

    // Remove oldest images
    for (let i = 0; i < count && i < allImages.length; i++) {
        const { blueprintId, sceneIndex } = allImages[i];
        delete storage[blueprintId][sceneIndex];

        // Clean up empty blueprint storage
        if (Object.keys(storage[blueprintId]).length === 0) {
            delete storage[blueprintId];
        }
    }

}
