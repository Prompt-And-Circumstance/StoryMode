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

import { generateUUID, escapeHtml } from './utils.js';
import { callGenericPopup, POPUP_TYPE } from '/scripts/popup.js';
import { eventSource } from '/script.js';

// Custom event for library updates
export const LIBRARY_EVENTS = {
    BLUEPRINT_ADDED: 'storymode_library_blueprint_added',
    BLUEPRINT_DELETED: 'storymode_library_blueprint_deleted',
    BLUEPRINT_UPDATED: 'storymode_library_blueprint_updated',
};

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

    const isNew = !blueprint.blueprint_id || !hasEntry(blueprint.blueprint_id);

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

    // Encode blueprint as PNG with cover
    const pngBlob = await encodeBlueprintAsPNG(blueprint, coverBlob);
    const base64 = await fileToBase64(pngBlob);

    // Upload file
    await uploadFile(filename, base64);

    // Update manifest and flush immediately (ensures refresh sees updated data)
    const entry = createManifestEntry(blueprint, filename);
    upsertEntry(entry);
    await flushManifest();

    // Emit event for library UI to refresh
    const eventType = isNew ? LIBRARY_EVENTS.BLUEPRINT_ADDED : LIBRARY_EVENTS.BLUEPRINT_UPDATED;
    eventSource.emit(eventType, {
        blueprint_id: blueprint.blueprint_id,
        title: blueprint.userMetadata?.title || blueprint.blueprint_title,
        source: isNew ? 'create' : 'update',
    });
}

/**
 * Show dialog when importing a duplicate blueprint
 * @param {string} existingTitle - Title of the existing blueprint
 * @param {string} newTitle - Title of the blueprint being imported
 * @returns {Promise<'replace'|'add-new'|'cancel'>} User's choice
 */
async function showDuplicateImportDialog(existingTitle, newTitle) {
    const html = `
        <div style="padding: 10px;">
            <p style="margin-bottom: 15px;">A blueprint with this ID already exists in your library:</p>
            <div style="background: var(--SmartThemeBlurTintColor); padding: 10px; border-radius: 5px; margin-bottom: 15px;">
                <strong>Existing:</strong> ${escapeHtml(existingTitle)}<br>
                <strong>Importing:</strong> ${escapeHtml(newTitle)}
            </div>
            <p>What would you like to do?</p>
        </div>
    `;

    const result = await callGenericPopup(html, POPUP_TYPE.CONFIRM, 'Duplicate Blueprint', {
        okButton: 'Add as Copy',
        cancelButton: 'Replace Existing',
    });

    // Popup returns numeric values: 1 = AFFIRMATIVE (ok), 0 = NEGATIVE (cancel), null = closed
    if (result === 1) return 'add-new';
    if (result === 0) return 'replace';
    return 'cancel';
}

/**
 * Import a PNG file directly without re-encoding
 * Preserves original PNG quality
 *
 * @param {File} file - Original PNG file
 * @returns {Promise<Object|null>} Imported blueprint, or null if cancelled
 */
export async function importBlueprintFromPNG(file) {
    await ensureInit();

    // 1. Decode to extract metadata (for manifest entry)
    const blueprint = await decodeBlueprintFromPNG(file);
    const originalId = blueprint.blueprint_id;

    // 2. Handle duplicate IDs - ask user what to do
    if (hasEntry(blueprint.blueprint_id)) {
        const existingEntry = getEntry(blueprint.blueprint_id);
        const existingTitle = existingEntry?.title || 'Untitled';
        const newTitle = blueprint.userMetadata?.title || 'Untitled';

        const choice = await showDuplicateImportDialog(existingTitle, newTitle);

        if (choice === 'cancel') {
            return null;
        }

        if (choice === 'add-new') {
            // Use duplicateBlueprint to create a proper copy with new ID
            // This re-encodes the PNG with correct metadata
            const duplicated = await duplicateBlueprint(blueprint, { titleSuffix: ' (Copy)' });
            console.log(`[FileStorage] Imported as duplicate: ${originalId} -> ${duplicated.blueprint_id}`);
            return duplicated;
        }
        // choice === 'replace': keep original ID, will overwrite existing file below
    }

    // 3. Standard import path (no duplicate, or replace existing)
    const filename = blueprintFilename(blueprint.blueprint_id);

    // Convert file to base64 (keep original bytes for quality)
    const base64 = await fileToBase64(file);

    // 4. Upload file
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

    // Emit event for library UI to refresh
    eventSource.emit(LIBRARY_EVENTS.BLUEPRINT_ADDED, {
        blueprint_id: blueprint.blueprint_id,
        title: blueprint.userMetadata?.title || blueprint.blueprint_title,
        source: 'import',
    });

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

    const title = entry.title;

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

    // Emit event for library UI to refresh
    eventSource.emit(LIBRARY_EVENTS.BLUEPRINT_DELETED, {
        blueprint_id: blueprintId,
        title: title,
    });

    return true;
}

// ============================================================================
// DUPLICATE OPERATIONS
// ============================================================================

/**
 * Create a duplicate of an existing blueprint with a new ID
 * This creates a completely independent copy in the library.
 *
 * @param {string} blueprintId - ID of the blueprint to duplicate
 * @param {Object} options - Optional settings
 * @param {string} options.titleSuffix - Suffix to append to title (default: " (Copy)")
 * @returns {Promise<Object>} The new duplicated blueprint
 */
export async function duplicateBlueprintById(blueprintId, options = {}) {
    await ensureInit();

    const { titleSuffix = ' (Copy)' } = options;

    // Load the source blueprint
    const sourceBlueprint = await loadBlueprintFromFile(blueprintId);
    if (!sourceBlueprint) {
        throw new Error(`Blueprint not found: ${blueprintId}`);
    }

    return duplicateBlueprint(sourceBlueprint, { titleSuffix });
}

/**
 * Create a duplicate of a blueprint object with a new ID
 * This creates a completely independent copy and saves it to the library.
 *
 * @param {Object} sourceBlueprint - The blueprint object to duplicate
 * @param {Object} options - Optional settings
 * @param {string} options.titleSuffix - Suffix to append to title (default: " (Copy)")
 * @returns {Promise<Object>} The new duplicated blueprint
 */
export async function duplicateBlueprint(sourceBlueprint, options = {}) {
    await ensureInit();

    const { titleSuffix = ' (Copy)' } = options;

    // Deep clone the blueprint
    const newBlueprint = JSON.parse(JSON.stringify(sourceBlueprint));

    // Assign new ID
    newBlueprint.blueprint_id = generateUUID();

    // Update title - check all possible title locations
    const originalTitle = sourceBlueprint.blueprint_title ||
                          sourceBlueprint.userMetadata?.title ||
                          sourceBlueprint.core_premise?.substring(0, 30) ||
                          'Blueprint';
    const newTitle = originalTitle + titleSuffix;

    // Update all title locations to ensure consistency
    newBlueprint.userMetadata = newBlueprint.userMetadata || {};
    newBlueprint.userMetadata.title = newTitle;
    if (newBlueprint.blueprint_title) {
        newBlueprint.blueprint_title = newTitle;
    }

    // Reset library metadata for the new copy
    newBlueprint.libraryData = {
        dateAdded: new Date().toISOString(),
        accessCount: 0,
    };

    // Update metadata timestamps
    if (newBlueprint.metadata) {
        newBlueprint.metadata.createdAt = new Date().toISOString();
    }

    // Save the new blueprint to file storage
    // We need to re-encode as PNG with the new metadata
    const pngBlob = await encodeBlueprintAsPNG(newBlueprint, null);
    const base64 = await fileToBase64(pngBlob);
    const filename = blueprintFilename(newBlueprint.blueprint_id);

    await uploadFile(filename, base64);

    // Update manifest
    const entry = createManifestEntry(newBlueprint, filename);
    upsertEntry(entry);
    await flushManifest();

    console.log(`[FileStorage] Duplicated blueprint: ${sourceBlueprint.blueprint_id} -> ${newBlueprint.blueprint_id}`);

    // Emit event for library UI to refresh
    eventSource.emit(LIBRARY_EVENTS.BLUEPRINT_ADDED, {
        blueprint_id: newBlueprint.blueprint_id,
        title: newBlueprint.userMetadata?.title || newBlueprint.blueprint_title,
        source: 'duplicate',
    });

    return newBlueprint;
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
