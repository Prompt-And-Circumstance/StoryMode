/**
 * Library Storage Adapter for Standalone Editor
 * Provides library access through SillyTavern's file API
 */

import { showError } from './notification-adapter.js';
import { getRequestHeaders } from './connection-bridge.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const FILE_PREFIX = 'storymode-';
const MANIFEST_FILE = 'storymode-manifest.json';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Ensure filename has the storymode prefix
 * @param {string} filename - Original filename
 * @returns {string} Prefixed filename
 */
function ensurePrefix(filename) {
    if (filename.startsWith(FILE_PREFIX)) return filename;
    return FILE_PREFIX + filename;
}

/**
 * Convert filename to URL for downloading
 * @param {string} filename - File name
 * @returns {string} URL path
 */
function toFileUrl(filename) {
    const prefixed = ensurePrefix(filename);
    return `/user/files/${prefixed}`;
}

// ============================================================================
// FILE API WRAPPERS
// ============================================================================

/**
 * Read a file from SillyTavern's file storage.
 * Uses relative URLs since the editor is served from SillyTavern (same-origin).
 * @param {string} filename - File name (will be auto-prefixed)
 * @returns {Promise<any>} File contents (parsed JSON or raw text)
 */
async function readFile(filename) {
    const fileUrl = toFileUrl(filename);

    const response = await fetch(fileUrl, {
        method: 'GET',
        headers: getRequestHeaders(),
    });

    if (!response.ok) {
        if (response.status === 404) {
            return null; // File doesn't exist
        }
        throw new Error(`Failed to read file: ${response.statusText}`);
    }

    const text = await response.text();

    // Try to parse as JSON
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

/**
 * Write a file to SillyTavern's file storage
 * Uses the upload endpoint with base64 encoding
 * @param {string} filename - File name (will be auto-prefixed)
 * @param {any} content - File content (will be JSON.stringify'd if object)
 * @returns {Promise<void>}
 */
async function writeFile(filename, content) {
    // Convert content to string if object
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content, null, 2);

    // Encode to base64
    const base64 = btoa(unescape(encodeURIComponent(contentStr)));

    const response = await fetch('/api/files/upload', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
            name: ensurePrefix(filename),
            data: base64,
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to write file: ${response.statusText}`);
    }
}

/**
 * Delete a file from SillyTavern's file storage
 * @param {string} filename - File name (will be auto-prefixed)
 * @returns {Promise<void>}
 */
async function deleteFile(filename) {
    const prefixed = ensurePrefix(filename);
    const path = `user/files/${prefixed}`;

    const response = await fetch('/api/files/delete', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ path }),
    });

    if (!response.ok) {
        throw new Error(`Failed to delete file: ${response.statusText}`);
    }
}

// ============================================================================
// MANIFEST OPERATIONS
// ============================================================================

/**
 * Load the blueprint manifest
 * @returns {Promise<Object>} Manifest object with blueprints array
 */
export async function loadManifest() {
    try {
        const manifest = await readFile(MANIFEST_FILE);
        if (!manifest) {
            return { version: '1.0.0', blueprints: [] };
        }
        return manifest;
    } catch (error) {
        console.error('[LibraryStorage] Failed to load manifest:', error);
        return { version: '1.0.0', blueprints: [] };
    }
}

/**
 * Save the blueprint manifest
 * @param {Object} manifest - Manifest object
 * @returns {Promise<void>}
 */
export async function saveManifest(manifest) {
    await writeFile(MANIFEST_FILE, manifest);
}

// ============================================================================
// BLUEPRINT OPERATIONS
// ============================================================================

/**
 * Get all blueprints from the library
 * @returns {Promise<Array>} Array of blueprint manifest entries
 */
export async function getAllBlueprints() {
    const manifest = await loadManifest();
    return manifest.blueprints || [];
}

/**
 * Get a specific blueprint by ID
 * @param {string} blueprintId - Blueprint ID
 * @returns {Promise<Object|null>} Blueprint object or null if not found
 */
export async function getBlueprintById(blueprintId) {
    const manifest = await loadManifest();
    const entry = manifest.blueprints.find(b => b.blueprint_id === blueprintId);

    if (!entry) {
        return null;
    }

    // Load blueprint from PNG file
    // Files are at root level: user/files/storymode-bp-{uuid}.png
    const filename = `bp-${blueprintId}.png`;
    const blueprint = await readBlueprintPNG(filename);
    return blueprint;
}

/**
 * Save a blueprint to the library
 * @param {Object} blueprint - Blueprint object
 * @returns {Promise<void>}
 */
export async function saveBlueprint(blueprint) {
    const manifest = await loadManifest();
    const blueprintId = blueprint.blueprint_id || blueprint.id;

    if (!blueprintId) {
        throw new Error('Blueprint must have an ID');
    }

    // Update or add manifest entry
    const existingIndex = manifest.blueprints.findIndex(b => b.blueprint_id === blueprintId);
    const entry = {
        blueprint_id: blueprintId,
        title: blueprint.userMetadata?.title || blueprint.blueprint_title || 'Untitled',
        blueprint_title: blueprint.blueprint_title,
        story_type_name: blueprint.story_type_name,
        created_at: blueprint.created_at || new Date().toISOString(),
        modified_at: new Date().toISOString(),
        favorite: blueprint.userMetadata?.favorite || false,
        coverImageUrl: blueprint.coverImageUrl || blueprint.metadata?.coverImageUrl,
        metadata: blueprint.metadata,
    };

    if (existingIndex >= 0) {
        manifest.blueprints[existingIndex] = entry;
    } else {
        manifest.blueprints.push(entry);
    }

    // Save manifest
    await saveManifest(manifest);

    // Save blueprint as PNG
    // Files are at root level: user/files/storymode-bp-{uuid}.png
    const filename = `bp-${blueprintId}.png`;
    await saveBlueprintPNG(filename, blueprint);
}

/**
 * Delete a blueprint from the library
 * @param {string} blueprintId - Blueprint ID
 * @returns {Promise<void>}
 */
export async function deleteBlueprint(blueprintId) {
    const manifest = await loadManifest();

    // Remove from manifest
    manifest.blueprints = manifest.blueprints.filter(b => b.blueprint_id !== blueprintId);
    await saveManifest(manifest);

    // Delete PNG file
    // Files are at root level: user/files/storymode-bp-{uuid}.png
    const filename = `bp-${blueprintId}.png`;
    try {
        await deleteFile(filename);
    } catch (error) {
        console.warn('[LibraryStorage] Failed to delete blueprint file:', error);
    }
}

/**
 * Toggle favorite status for a blueprint
 * @param {string} blueprintId - Blueprint ID
 * @param {boolean} favorite - New favorite status
 * @returns {Promise<void>}
 */
export async function setFavorite(blueprintId, favorite) {
    const manifest = await loadManifest();
    const entry = manifest.blueprints.find(b => b.blueprint_id === blueprintId);

    if (entry) {
        entry.favorite = favorite;
        await saveManifest(manifest);
    }
}

// ============================================================================
// PNG CODEC (Placeholder - needs proper implementation)
// ============================================================================

/**
 * Read blueprint from PNG file
 * @param {string} filename - File name
 * @returns {Promise<Object>} Blueprint object
 */
async function readBlueprintPNG(filename) {
    // For now, just read as JSON (should use PNG codec)
    // TODO: Implement proper PNG decoding
    const content = await readFile(filename);
    return content;
}

/**
 * Save blueprint as PNG file
 * @param {string} filename - File name
 * @param {Object} blueprint - Blueprint object
 * @returns {Promise<void>}
 */
async function saveBlueprintPNG(filename, blueprint) {
    // For now, just save as JSON (should use PNG codec)
    // TODO: Implement proper PNG encoding
    await writeFile(filename, blueprint);
}
