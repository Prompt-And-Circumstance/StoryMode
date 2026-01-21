/**
 * File Storage Operations - Blueprint Persistence
 *
 * Core operations for saving/loading blueprints to SillyTavern's file system.
 * Uses manifest for indexing and PNG files for full blueprint data.
 *
 * Key constraints:
 * - Files at user/files/ root only (no subdirectories)
 * - No thumbnail re-encoding (use CSS object-fit on full PNG)
 * - Import preserves original PNG bytes (no canvas re-encoding)
 *
 * @module file-storage
 * @version 1.0.0
 */

import {
    uploadFile,
    downloadFileAsBlob,
    deleteFile,
    fileToBase64,
    blueprintFilename,
    FileNotFoundError,
} from './file-api.js';

import {
    loadManifest,
    flushManifest,
    upsertEntry,
    removeEntry,
    getEntry,
    hasEntry,
    createManifestEntry,
    recordAccess,
    updateFavorite,
} from './manifest.js';

import {
    encodeBlueprintAsPNG,
    decodeBlueprintFromPNG,
} from './storage.js';

import { generateUUID } from './utils.js';

// ============================================================================
// INITIALIZATION
// ============================================================================

let initialized = false;

/**
 * Initialize file storage
 * Loads manifest and verifies integrity
 * @returns {Promise<void>}
 */
export async function initFileStorage() {
    if (initialized) return;

    await loadManifest();
    initialized = true;
    console.log('[FileStorage] Initialized');
}

/**
 * Ensure storage is initialized
 * @returns {Promise<void>}
 */
async function ensureInit() {
    if (!initialized) {
        await initFileStorage();
    }
}

// ============================================================================
// SAVE OPERATIONS
// ============================================================================

/**
 * Save a blueprint to file storage
 * Encodes as PNG and updates manifest
 *
 * @param {Object} blueprint - Full blueprint object
 * @param {Blob|null} coverBlob - Optional cover image blob
 * @returns {Promise<void>}
 */
export async function saveBlueprintToFile(blueprint, coverBlob = null) {
    await ensureInit();

    if (!blueprint.blueprint_id) {
        blueprint.blueprint_id = generateUUID();
    }

    const filename = blueprintFilename(blueprint.blueprint_id);

    // Ensure library metadata exists
    if (!blueprint.libraryData) {
        blueprint.libraryData = {
            dateAdded: new Date().toISOString(),
            accessCount: 0,
        };
    }
    blueprint.libraryData.dateModified = new Date().toISOString();

    // Encode blueprint as PNG
    const pngBlob = await encodeBlueprintAsPNG(blueprint, coverBlob);
    const base64 = await fileToBase64(pngBlob);

    // Upload file
    await uploadFile(filename, base64);

    // Update manifest and flush immediately (ensures refresh sees updated data)
    const entry = createManifestEntry(blueprint, filename);
    console.log(`[FileStorage] Created manifest entry:`, {
        id: entry.blueprint_id,
        title: entry.title,
        fromUserMetadata: blueprint.userMetadata?.title,
        fromBlueprintTitle: blueprint.blueprint_title
    });
    upsertEntry(entry);
    await flushManifest();

    console.log(`[FileStorage] Saved blueprint: ${blueprint.blueprint_id}`);
}

/**
 * Import a PNG file directly without re-encoding
 * Preserves original PNG quality
 *
 * @param {File} file - Original PNG file
 * @returns {Promise<Object>} Imported blueprint
 */
export async function importBlueprintFromPNG(file) {
    await ensureInit();

    // 1. Decode to extract metadata (for manifest entry)
    const blueprint = await decodeBlueprintFromPNG(file);

    // 2. Handle duplicate IDs
    if (hasEntry(blueprint.blueprint_id)) {
        blueprint.blueprint_id = generateUUID();
        if (blueprint.userMetadata) {
            blueprint.userMetadata.title = (blueprint.userMetadata.title || 'Blueprint') + ' (Imported)';
        }
    }

    const filename = blueprintFilename(blueprint.blueprint_id);

    // 3. Convert ORIGINAL file to base64 (NO canvas re-encoding!)
    const base64 = await fileToBase64(file);

    // 4. Upload original bytes
    await uploadFile(filename, base64);

    // 5. Create manifest entry
    if (!blueprint.libraryData) {
        blueprint.libraryData = {
            dateAdded: new Date().toISOString(),
            accessCount: 0,
        };
    }
    blueprint.libraryData.dateModified = new Date().toISOString();

    const entry = createManifestEntry(blueprint, filename);
    upsertEntry(entry);

    // Flush manifest immediately after import
    await flushManifest();

    console.log(`[FileStorage] Imported blueprint: ${blueprint.blueprint_id}`);
    return blueprint;
}

// ============================================================================
// LOAD OPERATIONS
// ============================================================================

/**
 * Load full blueprint from file
 * @param {string} blueprintId - Blueprint ID
 * @returns {Promise<Object|null>} Full blueprint or null
 */
export async function loadBlueprintFromFile(blueprintId) {
    await ensureInit();

    const entry = getEntry(blueprintId);
    if (!entry) {
        console.warn(`[FileStorage] Blueprint not found in manifest: ${blueprintId}`);
        return null;
    }

    try {
        const blob = await downloadFileAsBlob(entry.filename);
        const blueprint = await decodeBlueprintFromPNG(blob);

        // Record access
        recordAccess(blueprintId);

        return blueprint;
    } catch (error) {
        if (error instanceof FileNotFoundError) {
            console.warn(`[FileStorage] PNG file missing, removing from manifest: ${blueprintId}`);
            removeEntry(blueprintId);
            await flushManifest();
            return null;
        }
        throw error;
    }
}

// ============================================================================
// DELETE OPERATIONS
// ============================================================================

/**
 * Delete a blueprint from storage
 * @param {string} blueprintId - Blueprint ID
 * @returns {Promise<boolean>} True if deleted
 */
export async function deleteBlueprintFile(blueprintId) {
    await ensureInit();

    const entry = getEntry(blueprintId);
    if (!entry) {
        console.warn(`[FileStorage] Cannot delete - not in manifest: ${blueprintId}`);
        return false;
    }

    // Remove from manifest first
    removeEntry(blueprintId);

    // Delete PNG file
    try {
        await deleteFile(entry.filename);
    } catch (error) {
        console.warn(`[FileStorage] File delete failed (may not exist): ${error.message}`);
        // Continue even if file delete fails - manifest is source of truth
    }

    // Flush manifest immediately after delete
    await flushManifest();

    console.log(`[FileStorage] Deleted blueprint: ${blueprintId}`);
    return true;
}

// ============================================================================
// METADATA OPERATIONS (Manifest-only, no PNG touch)
// ============================================================================

/**
 * Update favorite status without touching PNG
 * @param {string} blueprintId - Blueprint ID
 * @param {boolean} favorite - New favorite status
 * @returns {Promise<void>}
 */
export async function setFavorite(blueprintId, favorite) {
    await ensureInit();
    updateFavorite(blueprintId, favorite);
    // Debounced save handled by manifest
}

/**
 * Get cover URL for a blueprint
 * Returns the file URL for CSS background-image
 * @param {string} blueprintId - Blueprint ID
 * @returns {string|null} File URL or null
 */
export function getCoverUrl(blueprintId) {
    const entry = getEntry(blueprintId);
    if (!entry) return null;
    return `/user/files/${entry.filename}`;
}

// ============================================================================
// EXPORT
// ============================================================================

export { flushManifest };
