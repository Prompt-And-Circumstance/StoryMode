/**
 * Scene Image Storage Module
 *
 * Manages persistence for generated scene images.
 * Stores images in chat metadata so they travel with the chat.
 */

import { getContext } from '/scripts/extensions.js';
import { saveMetadata } from '/script.js';
import { MODULE_NAME } from '../core/state-manager.js';

// ============================================================================
// MODULE CONSTANTS
// ============================================================================

/** Maximum number of scene images per chat */
const MAX_IMAGES_PER_CHAT = 50;

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

/**
 * Get the scene images storage object from chat metadata.
 * @returns {Object} Scene images storage (sceneIndex -> imageData)
 */
function getStorage() {
    const { chatMetadata } = getContext();

    if (!chatMetadata) {
        console.warn('[Scene Image Storage] No chat metadata available');
        return {};
    }

    if (!chatMetadata[MODULE_NAME]) {
        chatMetadata[MODULE_NAME] = {};
    }

    if (!chatMetadata[MODULE_NAME].sceneImages) {
        chatMetadata[MODULE_NAME].sceneImages = {};
    }

    return chatMetadata[MODULE_NAME].sceneImages;
}

/**
 * Save the scene images storage to chat metadata.
 */
async function saveStorage() {
    await saveMetadata();
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Initialize scene image storage in chat metadata.
 * Called when starting a new story or loading a chat.
 */
export function initializeStorage() {
    getStorage(); // Ensures structure exists
}

/**
 * Store a generated scene image.
 * @param {string} blueprintId - Blueprint UUID (kept for API compatibility, not used for keying)
 * @param {number} sceneIndex - Scene index (0-based)
 * @param {Object} imageData - Image data object
 * @param {string} imageData.prompt - The prompt used for generation
 * @param {string} imageData.imageData - Base64 or URL of the image
 * @param {string} [imageData.sdProfile] - SD profile ID used for generation
 * @returns {boolean} True if stored successfully
 */
export function storeSceneImage(blueprintId, sceneIndex, imageData) {
    // Validate parameters
    if (typeof sceneIndex !== 'number' || !imageData) {
        console.warn('[Scene Image Storage] Invalid parameters for storeSceneImage');
        return false;
    }

    // Bounds checking
    if (sceneIndex < 0 || sceneIndex >= 1000 || !Number.isInteger(sceneIndex)) {
        console.warn('[Scene Image Storage] Invalid sceneIndex (must be 0-999):', sceneIndex);
        return false;
    }

    const storage = getStorage();

    // Store the image with metadata
    storage[sceneIndex] = {
        prompt: imageData.prompt || '',
        imageData: imageData.imageData || '',
        sdProfile: imageData.sdProfile || null,
        generatedAt: Date.now(),
    };

    // Enforce size limits
    enforceStorageLimits(storage);

    // Save asynchronously
    saveStorage().catch(err => {
        console.error('[Scene Image Storage] Failed to save:', err);
    });

    return true;
}

/**
 * Retrieve a stored scene image.
 * @param {string} blueprintId - Blueprint UUID (kept for API compatibility, not used)
 * @param {number} sceneIndex - Scene index (0-based)
 * @returns {Object|null} Image data object or null if not found
 */
export function getSceneImage(blueprintId, sceneIndex) {
    const storage = getStorage();
    return storage[sceneIndex] || null;
}

/**
 * Get all scene images for the current chat.
 * @param {string} blueprintId - Blueprint UUID (kept for API compatibility, not used)
 * @returns {Object} Map of scene index to image data
 */
export function getAllBlueprintImages(blueprintId) {
    return getStorage();
}

/**
 * Special key for cover image in storage
 */
export const COVER_IMAGE_KEY = 'cover';

/**
 * Store the cover image as part of scene images.
 * This allows the cover to be displayed in the gallery alongside scene images.
 * @param {string} blueprintId - Blueprint UUID (kept for API compatibility)
 * @param {Object} imageData - Image data object
 * @param {string} imageData.prompt - The prompt used for generation
 * @param {string} imageData.imageData - Base64 or URL of the image
 * @returns {boolean} True if stored successfully
 */
export function storeCoverImage(blueprintId, imageData) {
    if (!imageData?.imageData) {
        console.warn('[Scene Image Storage] Invalid cover image data');
        return false;
    }

    const storage = getStorage();

    storage[COVER_IMAGE_KEY] = {
        prompt: imageData.prompt || '',
        imageData: imageData.imageData,
        sdProfile: imageData.sdProfile || null,
        generatedAt: imageData.generatedAt || Date.now(),
        isCover: true,
    };

    saveStorage().catch(err => {
        console.error('[Scene Image Storage] Failed to save cover:', err);
    });

    return true;
}

/**
 * Get the stored cover image.
 * @param {string} blueprintId - Blueprint UUID (kept for API compatibility)
 * @returns {Object|null} Cover image data or null
 */
export function getCoverImage(blueprintId) {
    const storage = getStorage();
    return storage[COVER_IMAGE_KEY] || null;
}

/**
 * Delete the cover image.
 * @param {string} blueprintId - Blueprint UUID (kept for API compatibility)
 * @returns {boolean} True if deleted
 */
export function deleteCoverImage(blueprintId) {
    const storage = getStorage();

    if (storage[COVER_IMAGE_KEY] === undefined) {
        return false;
    }

    delete storage[COVER_IMAGE_KEY];

    saveStorage().catch(err => {
        console.error('[Scene Image Storage] Failed to save after cover delete:', err);
    });

    return true;
}

/**
 * Delete a specific scene image.
 * @param {string} blueprintId - Blueprint UUID (kept for API compatibility, not used)
 * @param {number} sceneIndex - Scene index (0-based)
 * @returns {boolean} True if deleted successfully
 */
export function deleteSceneImage(blueprintId, sceneIndex) {
    const storage = getStorage();

    if (storage[sceneIndex] === undefined) {
        return false;
    }

    delete storage[sceneIndex];

    saveStorage().catch(err => {
        console.error('[Scene Image Storage] Failed to save after delete:', err);
    });

    return true;
}

/**
 * Delete all images for the current chat.
 * @param {string} blueprintId - Blueprint UUID (kept for API compatibility, not used)
 * @returns {number} Number of images deleted
 */
export function deleteBlueprintImages(blueprintId) {
    const { chatMetadata } = getContext();

    if (!chatMetadata?.[MODULE_NAME]?.sceneImages) {
        return 0;
    }

    const count = Object.keys(chatMetadata[MODULE_NAME].sceneImages).length;
    chatMetadata[MODULE_NAME].sceneImages = {};

    saveStorage().catch(err => {
        console.error('[Scene Image Storage] Failed to save after bulk delete:', err);
    });

    return count;
}

/**
 * Clear all stored scene images for the current chat.
 * @returns {number} Number of images deleted
 */
export function clearAllImages() {
    return deleteBlueprintImages(null);
}

/**
 * Get storage statistics for the current chat.
 * @returns {Object} Storage stats
 */
export function getStorageStats() {
    const storage = getStorage();
    const sceneIndices = Object.keys(storage);
    let oldestTimestamp = Date.now();
    let newestTimestamp = 0;
    let totalSizeBytes = 0;

    for (const sceneKey of sceneIndices) {
        const img = storage[sceneKey];
        if (img.generatedAt < oldestTimestamp) oldestTimestamp = img.generatedAt;
        if (img.generatedAt > newestTimestamp) newestTimestamp = img.generatedAt;

        // Estimate size (rough calculation for base64)
        if (img.imageData?.startsWith('data:')) {
            totalSizeBytes += img.imageData.length * 0.75; // Base64 to bytes approximation
        }
    }

    return {
        totalImages: sceneIndices.length,
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
    const sceneIndices = Object.keys(storage);

    if (sceneIndices.length <= MAX_IMAGES_PER_CHAT) {
        return;
    }

    // Sort by generated timestamp (oldest first)
    const sortedEntries = sceneIndices
        .map(idx => ({ idx, timestamp: storage[idx]?.generatedAt || 0 }))
        .sort((a, b) => a.timestamp - b.timestamp);

    // Remove oldest entries until under limit
    const toRemove = sortedEntries.length - MAX_IMAGES_PER_CHAT;
    for (let i = 0; i < toRemove; i++) {
        delete storage[sortedEntries[i].idx];
    }
}
