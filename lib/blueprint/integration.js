/**
 * Blueprint Integration Module - Orchestrator
 *
 * Coordinates between all blueprint-related modules:
 * - blueprint-storage.js (PNG file format)
 * - library-adapter.js (File-based storage via /api/files/*)
 * - blueprint-merger.js (Character conflict resolution)
 * - blueprint-editor.js (Blueprint editing UI)
 *
 * This module provides a unified API for all blueprint operations,
 * handling the workflow between modules.
 *
 * @module blueprint-integration
 * @version 2.0.0
 */

// ============================================================================
// IMPORTS
// ============================================================================

import { getContext } from '/scripts/extensions.js';
import {
    getLibrary,
    FileBackedLibrary,
    FileBackedSearch,
    FileBackedFolders,
    FileBackedImporter,
    FileBackedStats,
    flushPendingManifestSave,
} from './library-adapter.js';
import { getMerger } from './merger.js';
import {
    encodeBlueprintAsPNG,
    decodeBlueprintFromPNG,
    isBlueprintPNG,
    generateCoverImage,
} from './storage.js';
import { validateOpeningMessage } from './utils.js';
import { openBlueprintEditor } from '../editor/blueprint-editor.js';
import {
    generateUUID,
    loadBlueprintOrThrow as loadBlueprintOrThrowUtil,
    validateBlueprint,
} from './utils.js';
import { checkMigrationNeeded, promptAndMigrate } from './migration.js';

// Re-export storage functions
export {
    encodeBlueprintAsPNG,
    decodeBlueprintFromPNG,
    isBlueprintPNG,
    generateCoverPrompt,
    generateCoverImage,
} from './storage.js';

// Re-export library classes (with compatible names)
export {
    getLibrary,
    FileBackedLibrary as BlueprintLibrary,
    FileBackedSearch as BlueprintSearch,
    FileBackedFolders as BlueprintFolders,
    FileBackedImporter as BlueprintImporter,
    FileBackedStats as PlayStatsTracker,
    flushPendingManifestSave,
} from './library-adapter.js';

// Re-export merger classes
export {
    getMerger,
    BlueprintMerger,
    CharacterMerger,
} from './merger.js';

// Re-export editor function
export { openBlueprintEditor };

// CSS is loaded via @import in main style.css

// ============================================================================
// HELPERS
// ============================================================================

// Cached library instance to avoid repeated async calls
let _cachedLibrary = null;

/**
 * Get library instance with caching
 * @returns {Promise<BlueprintLibrary>} Cached library instance
 */
async function getLibraryCached() {
    if (!_cachedLibrary) {
        _cachedLibrary = await getLibrary();
    }
    return _cachedLibrary;
}

/**
 * Invalidate library cache (call after library operations)
 */
function invalidateLibraryCache() {
    _cachedLibrary = null;
}

/**
 * Helper to load blueprint or throw error
 */
async function loadBlueprintOrThrow(blueprintId) {
    const library = await getLibraryCached();
    return loadBlueprintOrThrowUtil(blueprintId, library.getBlueprint.bind(library));
}

/**
 * Helper to generate cover with error handling
 */
async function generateCoverIfNeeded(blueprint, shouldGenerate) {
    if (!shouldGenerate) return null;

    try {
        return await generateCoverImage(blueprint);
    } catch (error) {
        console.warn('[BlueprintIntegration] Cover generation failed:', error);
        return null;
    }
}

/**
 * Helper to handle optional editor workflow
 */
async function openEditorIfNeeded(blueprint, shouldOpen) {
    if (!shouldOpen) return blueprint;

    const edited = await openBlueprintEditor(blueprint);
    if (!edited) return blueprint; // User cancelled

    const library = await getLibraryCached();
    await library.saveBlueprint(edited);
    invalidateLibraryCache();
    return edited;
}

// ============================================================================
// MAIN WORKFLOWS
// ============================================================================

/**
 * Create a new blueprint and add it to the library
 */
export async function createBlueprint(blueprint, options = {}) {
    const { saveToLibrary = true, generateCover = false, openEditor = false } = options;

    // Ensure blueprint has required ID
    if (!blueprint.blueprint_id) {
        blueprint.blueprint_id = generateUUID();
    }

    // Generate cover if requested
    const coverImage = await generateCoverIfNeeded(blueprint, generateCover);
    if (coverImage) {
        blueprint.coverImage = coverImage;
    }

    // Save to library if requested
    if (saveToLibrary) {
        const library = await getLibraryCached();
        await library.saveBlueprint(blueprint);
        invalidateLibraryCache();
    }

    // Open editor if requested
    return openEditorIfNeeded(blueprint, openEditor);
}

/**
 * Load a blueprint from the library and open it for editing
 */
export async function editLibraryBlueprint(blueprintId) {
    const blueprint = await loadBlueprintOrThrow(blueprintId);
    const edited = await openBlueprintEditor(blueprint);

    if (!edited) return null; // User cancelled

    const library = await getLibraryCached();
    await library.saveBlueprint(edited);
    invalidateLibraryCache();
    return edited;
}

/**
 * Import a blueprint from a PNG file
 * Uses importPNGFile to preserve original PNG bytes (no re-encoding)
 */
export async function importBlueprintFromPNG(file, options = {}) {
    const { saveToLibrary = true, openEditor = false, resolveCharacterConflicts = true } = options;

    // Verify and decode
    if (!(await isBlueprintPNG(file))) {
        throw new Error('Not a valid blueprint PNG file');
    }

    const blueprint = await decodeBlueprintFromPNG(file);

    // Resolve character conflicts if requested
    if (resolveCharacterConflicts) {
        const merger = getMerger();
        const result = await merger.mergeBlueprint(blueprint, {
            resolveCharacterConflicts: true,
            importStoryType: true,
            importAuthorStyle: true,
            syncSettings: false,
        });

        if (!result.success && result.errors.length > 0) {
            console.warn('[BlueprintIntegration] Import had errors:', result.errors);
        }
    }

    // Save to library - use importPNGFile to store original file directly
    if (saveToLibrary) {
        const library = await getLibraryCached();
        await library.importPNGFile(blueprint, file);
        invalidateLibraryCache();
    }

    // Open editor if requested
    return openEditorIfNeeded(blueprint, openEditor);
}

/**
 * Export a blueprint to a PNG file
 */
export async function exportBlueprintToPNG(blueprintId, options = {}) {
    const { generateNewCover = false } = options;
    const blueprint = await loadBlueprintOrThrow(blueprintId);

    // Generate new cover if requested
    const coverImage = await generateCoverIfNeeded(blueprint, generateNewCover);

    // Encode and trigger download
    const blob = await encodeBlueprintAsPNG(blueprint, coverImage);
    const filename = `${(blueprint.userMetadata?.title || 'blueprint')
        .replace(/[^a-z0-9]/gi, '_')
        .toLowerCase()}.png`;

    // Download helper
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
 * Start a story from a library blueprint
 */
export async function startStoryFromLibrary(blueprintId, options = {}) {
    const {
        resolveCharacterConflicts = true,
        importStoryType = true,
        importAuthorStyle = true,
        syncSettings = true,
        useOpeningMessage = true,  // Changed from generateOpeningMessage
    } = options;

    const blueprint = await loadBlueprintOrThrow(blueprintId);

    // Check if story is already in progress
    const context = getContext?.();
    const currentStep = context?.chatMetadata?.story_mode?.currentStep || 0;
    const messageCount = context?.chat?.length || 0;

    if (currentStep > 0 || messageCount > 1) {
        if (!confirm('Story already in progress. Starting a new blueprint will reset your current progress. Continue?')) {
            return { cancelled: true };
        }
    }

    // Merge blueprint (for story type / author style import)
    const merger = getMerger();
    const mergeResult = await merger.mergeBlueprint(blueprint, {
        resolveCharacterConflicts,
        importStoryType,
        importAuthorStyle,
        syncSettings,
    });

    if (!mergeResult.success && mergeResult.errors.length > 0) {
        console.warn('[BlueprintIntegration] Merge had errors:', mergeResult.errors);
    }

    // Create run copy in chat state (doesn't modify library)
    // This deep clones the blueprint so library stays pristine
    const BlueprintModule = await import('./module.js');
    const runState = BlueprintModule.createRunCopy(blueprint, 'library');
    await BlueprintModule.saveBlueprintState(runState);

    // Record play start
    const library = await getLibraryCached();
    await library.stats.recordPlayStart(blueprintId);

    // Use stored opening message if available and requested
    let openingUsed = false;
    if (useOpeningMessage && blueprint.opening_message) {
        // Validate opening message before use (defensive programming)
        const validation = validateOpeningMessage(blueprint.opening_message);
        if (!validation.valid) {
            console.warn('[BlueprintIntegration] Invalid opening message in blueprint, skipping:', validation.error);
        } else {
            try {
                if (window.pushStoryMessage) {
                    await window.pushStoryMessage(validation.sanitized);
                    openingUsed = true;
                }
            } catch (error) {
                console.warn('[BlueprintIntegration] Failed to push opening message:', error);
            }
        }
    }

    return { success: true, blueprint, mergeResult, openingUsed };
}

// ============================================================================
// LIBRARY MANAGEMENT
// ============================================================================

/**
 * Duplicate a blueprint in the library
 */
export async function duplicateBlueprint(blueprintId, newTitle = null) {
    const library = await getLibraryCached();
    const original = await loadBlueprintOrThrow(blueprintId);

    const duplicate = structuredClone(original);
    duplicate.blueprint_id = generateUUID();

    if (duplicate.userMetadata) {
        duplicate.userMetadata.title = newTitle || `${duplicate.userMetadata.title} (Copy)`;
    }

    // Reset library metadata
    if (duplicate.libraryData) {
        delete duplicate.libraryData.dateAdded;
        delete duplicate.libraryData.dateModified;
        delete duplicate.libraryData.lastAccessed;
        delete duplicate.libraryData.accessCount;
    }

    await library.saveBlueprint(duplicate);
    invalidateLibraryCache();
    return duplicate;
}

/**
 * Delete a blueprint from the library
 */
export async function deleteLibraryBlueprint(blueprintId) {
    const library = await getLibraryCached();
    await library.deleteBlueprint(blueprintId);
    invalidateLibraryCache();
}

/**
 * Search the blueprint library
 */
export async function searchBlueprints(query, options = {}) {
    const library = await getLibraryCached();
    return library.search.search(query, options);
}

/**
 * Get blueprints from a folder
 */
export async function getBlueprintsFromFolder(folderId, options = {}) {
    const library = await getLibraryCached();
    const { sortBy = 'created', sortOrder = 'desc' } = options;

    if (folderId === 'all') {
        return library.getAllBlueprints({ sortBy, sortOrder });
    }

    const blueprints = await library.folders.getFolderContents(folderId);
    return library.sortBlueprints(blueprints, sortBy, sortOrder);
}

/**
 * Add a blueprint to a folder
 */
export async function addBlueprintToFolder(blueprintId, folderId) {
    const library = await getLibraryCached();
    await library.folders.addToFolder(blueprintId, folderId);
    invalidateLibraryCache();
}

/**
 * Create a new folder
 */
export async function createBlueprintFolder(name, icon = 'fa-folder') {
    const library = await getLibraryCached();
    const result = library.folders.createFolder(name, icon);
    invalidateLibraryCache();
    return result;
}

/**
 * Delete a folder
 */
export async function deleteBlueprintFolder(folderId) {
    const library = await getLibraryCached();
    await library.folders.deleteFolder(folderId);
    invalidateLibraryCache();
}

// ============================================================================
// METADATA & STATS
// ============================================================================

/**
 * Get library settings
 */
export async function getLibrarySettings() {
    const library = await getLibraryCached();
    return library.getSettings();
}

/**
 * Save library settings
 */
export async function saveLibrarySettings(settings) {
    const library = await getLibraryCached();
    await library.saveSettings(settings);
    invalidateLibraryCache();
}

/**
 * Get play statistics for a blueprint
 */
export async function getBlueprintStats(blueprintId) {
    const library = await getLibraryCached();
    return library.stats.getStats(blueprintId);
}

/**
 * Record play progress
 */
export async function recordPlayProgress(blueprintId, currentStep, currentSceneIndex) {
    const library = await getLibraryCached();
    await library.stats.recordPlayProgress(blueprintId, currentStep, currentSceneIndex);
}

/**
 * Record play end
 */
export async function recordPlayEnd(blueprintId, completed, abandoned = false) {
    const library = await getLibraryCached();
    await library.stats.recordPlayEnd(blueprintId, completed, abandoned);
}

/**
 * Get recently played blueprints
 */
export async function getRecentlyPlayed(limit = 10) {
    const library = await getLibraryCached();
    return library.stats.getRecentlyPlayed(limit);
}

/**
 * Get most played blueprints
 */
export async function getMostPlayed(limit = 10) {
    const library = await getLibraryCached();
    return library.stats.getMostPlayed(limit);
}

/**
 * Favorite/unfavorite a blueprint
 * Uses direct setFavorite() for efficiency (doesn't reload entire blueprint)
 */
export async function setBlueprintFavorite(blueprintId, favorite) {
    const library = await getLibraryCached();
    await library.setFavorite(blueprintId, favorite);
    invalidateLibraryCache();
}

/**
 * Rate a blueprint (1-5)
 */
export async function rateBlueprint(blueprintId, rating) {
    if (rating < 1 || rating > 5) {
        throw new Error('Rating must be between 1 and 5');
    }

    const library = await getLibraryCached();
    const stats = await library.stats.getStats(blueprintId);
    stats.rating = rating;
    await library.stats.saveStats(stats);
    invalidateLibraryCache();
}

/**
 * Add notes to a blueprint
 */
export async function addBlueprintNotes(blueprintId, notes) {
    const library = await getLibraryCached();
    const stats = await library.stats.getStats(blueprintId);
    stats.notes = notes;
    await library.stats.saveStats(stats);
    invalidateLibraryCache();
}

/**
 * Get library statistics
 */
export async function getLibraryStatistics() {
    const library = await getLibraryCached();
    const allBlueprints = await library.getAllBlueprints();

    const stats = {
        totalBlueprints: allBlueprints.length,
        favorites: allBlueprints.filter(bp => bp.userMetadata?.favorite).length,
        totalPlays: 0,
        completed: 0,
        byStoryType: {},
        byGenre: {},
    };

    // Aggregate statistics
    for (const blueprint of allBlueprints) {
        const playStats = await library.stats.getStats(blueprint.blueprint_id);
        stats.totalPlays += playStats.timesPlayed || 0;
        if (playStats.completed) {
            stats.completed++;
        }

        const storyType = blueprint.story_type_name || 'Unknown';
        stats.byStoryType[storyType] = (stats.byStoryType[storyType] || 0) + 1;

        const genre = storyType.toLowerCase().split(' ')[0];
        stats.byGenre[genre] = (stats.byGenre[genre] || 0) + 1;
    }

    return stats;
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Get the current blueprint from blueprint state
 */
export async function getCurrentBlueprint() {
    try {
        return window.getBlueprintState ? await window.getBlueprintState() : null;
    } catch (error) {
        console.warn('[BlueprintIntegration] Could not get current blueprint:', error);
        return null;
    }
}

/**
 * Save the current blueprint to the library
 */
export async function saveCurrentBlueprintToLibrary(options = {}) {
    const { title = null, description = null, tags = [], generateCover = false, blueprint = null } = options;

    let current = blueprint;
    if (!current) {
        current = await getCurrentBlueprint();
    }

    if (!current) {
        throw new Error('No current blueprint to save');
    }

    // Add metadata
    current.userMetadata = current.userMetadata || {};
    if (title) current.userMetadata.title = title;
    if (description) current.userMetadata.description = description;
    if (tags.length > 0) current.userMetadata.tags = tags;

    return createBlueprint(current, { saveToLibrary: true, generateCover });
}

// ============================================================================
// LIFECYCLE
// ============================================================================

/**
 * Initialize the blueprint integration
 * Handles one-time migration from IndexedDB if needed
 */
export async function initBlueprintIntegration() {
    try {
        // Check for one-time migration from IndexedDB
        if (await checkMigrationNeeded()) {
            await promptAndMigrate();
        }

        const library = await getLibraryCached();
        getMerger(); // Initialize merger
        console.log('[BlueprintIntegration] Initialized successfully (file-backed storage v2.0.0)');
        return { library, success: true };
    } catch (error) {
        console.error('[BlueprintIntegration] Initialization failed:', error);
        return { success: false, error };
    }
}

/**
 * Close the blueprint integration
 */
export async function closeBlueprintIntegration() {
    try {
        const library = await getLibraryCached();
        await library.close();
        console.log('[BlueprintIntegration] Closed successfully');
    } catch (error) {
        console.error('[BlueprintIntegration] Close failed:', error);
    }
}
