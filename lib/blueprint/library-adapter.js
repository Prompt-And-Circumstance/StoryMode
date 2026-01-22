/**
 * Library Adapter - Drop-in Replacement for BlueprintLibrary
 *
 * Provides the same interface as the IndexedDB-based BlueprintLibrary
 * but uses file-based storage via SillyTavern's /api/files/* endpoints.
 *
 * @module library-adapter
 * @version 1.0.0
 */

import {
    initFileStorage,
    saveBlueprintToFile,
    loadBlueprintFromFile,
    deleteBlueprintFile,
    importBlueprintFromPNG,
    setFavorite,
    getCoverUrl,
    flushManifest,
} from './file-storage.js';

import {
    loadManifest,
    listAllEntries,
    listFavorites,
    listRecent,
    searchEntries,
    getEntry,
    hasEntry,
    recordAccess,
    updateFavorite,
    upsertEntry,
    createManifestEntry,
} from './manifest.js';

import { generateUUID, getBlueprintCoverUrl, isValidImageUrl, loadImage } from './utils.js';
import { blueprintFilename } from './file-api.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_SETTINGS = {
    id: 'settings',
    version: '2.0.0',
    defaultView: 'grid',
    gridSize: 'medium',
    sortBy: 'created',
    sortOrder: 'desc',
    folders: [
        { id: 'all', name: 'All Blueprints', icon: 'fa-folder', system: true },
        { id: 'favorites', name: 'Favorites', icon: 'fa-star', system: true },
        { id: 'recent', name: 'Recently Played', icon: 'fa-clock', system: true },
    ],
};

const DEFAULT_PLAY_STATS = {
    timesPlayed: 0,
    lastPlayedAt: null,
    totalPlayTime: 0,
    completed: false,
    abandoned: false,
    rating: null,
    notes: '',
};

// ============================================================================
// SETTINGS STORAGE (in localStorage)
// ============================================================================

const SETTINGS_KEY = 'storymode-library-settings';
const PLAY_STATS_KEY = 'storymode-play-stats';

function loadSettings() {
    try {
        const stored = localStorage.getItem(SETTINGS_KEY);
        return stored ? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) } : { ...DEFAULT_SETTINGS };
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
        console.error('[LibraryAdapter] Failed to save settings:', e);
    }
}

function loadPlayStats() {
    try {
        const stored = localStorage.getItem(PLAY_STATS_KEY);
        return stored ? JSON.parse(stored) : {};
    } catch {
        return {};
    }
}

function savePlayStats(stats) {
    try {
        localStorage.setItem(PLAY_STATS_KEY, JSON.stringify(stats));
    } catch (e) {
        console.error('[LibraryAdapter] Failed to save play stats:', e);
    }
}

// ============================================================================
// HELPER: Convert manifest entry to card-compatible format
// ============================================================================

/**
 * Convert manifest entry to format expected by UI
 * @param {Object} entry - Manifest entry
 * @returns {Object} Card-compatible blueprint stub
 */
function entryToCardFormat(entry) {
    return {
        blueprint_id: entry.blueprint_id,
        title: entry.title, // Direct title for card renderer
        userMetadata: {
            title: entry.title,
            favorite: entry.favorite,
        },
        story_type_name: entry.story_type_name,
        // Fake array for .length check in UI
        scene_plan: new Array(entry.scene_count),
        libraryData: {
            dateAdded: entry.created_at,
            dateModified: entry.modified_at,
            lastAccessed: entry.last_accessed_at,
            accessCount: entry.access_count,
        },
        // For getBlueprintCoverUrl() - add cache-busting timestamp
        coverFileUrl: `/user/files/${entry.filename}?t=${new Date(entry.modified_at).getTime()}`,
        metadata: {
            createdAt: entry.created_at,
        },
    };
}

// ============================================================================
// SEARCH CLASS
// ============================================================================

export class FileBackedSearch {
    parseQuery(query) {
        if (!query) return [];
        return query.toLowerCase().split(/\s+/).filter(term => term.length > 0);
    }

    async search(query, options = {}) {
        const { favoritesOnly = false, storyTypes = [], minScenes = null, maxScenes = null } = options;

        let entries = favoritesOnly ? listFavorites() : searchEntries(query);

        // Apply additional filters
        if (storyTypes.length > 0) {
            entries = entries.filter(e =>
                storyTypes.includes(e.story_type_name)
            );
        }
        if (minScenes !== null) {
            entries = entries.filter(e => e.scene_count >= minScenes);
        }
        if (maxScenes !== null) {
            entries = entries.filter(e => e.scene_count <= maxScenes);
        }

        const terms = this.parseQuery(query);
        return this.rankResults(entries.map(entryToCardFormat), terms);
    }

    rankResults(results, searchTerms) {
        if (searchTerms.length === 0) return results;

        return results
            .map(bp => ({
                blueprint: bp,
                score: this.calculateRelevance(bp, searchTerms),
            }))
            .sort((a, b) => b.score - a.score)
            .map(item => item.blueprint);
    }

    calculateRelevance(blueprint, searchTerms) {
        let score = 0;
        const title = (blueprint.userMetadata?.title || '').toLowerCase();
        const storyType = (blueprint.story_type_name || '').toLowerCase();

        for (const term of searchTerms) {
            if (title.includes(term)) score += 10;
            if (storyType.includes(term)) score += 5;
        }

        return score;
    }
}

// ============================================================================
// FOLDERS CLASS
// ============================================================================

export class FileBackedFolders {
    async getFolders() {
        const settings = loadSettings();
        return settings.folders || DEFAULT_SETTINGS.folders;
    }

    async createFolder(name, icon = 'fa-folder') {
        const settings = loadSettings();
        const folders = settings.folders || [...DEFAULT_SETTINGS.folders];

        const folder = {
            id: generateUUID(),
            name,
            icon,
            createdAt: new Date().toISOString(),
            system: false,
        };

        folders.push(folder);
        saveSettings({ ...settings, folders });
        return folder;
    }

    async deleteFolder(folderId) {
        const settings = loadSettings();
        const folders = settings.folders || [];
        const folder = folders.find(f => f.id === folderId);

        if (folder?.system) {
            throw new Error('Cannot delete system folder');
        }

        const updated = folders.filter(f => f.id !== folderId);
        saveSettings({ ...settings, folders: updated });
    }

    async getFolderContents(folderId) {
        let entries;

        switch (folderId) {
            case 'all':
                entries = listAllEntries();
                break;
            case 'favorites':
                entries = listFavorites();
                break;
            case 'recent':
                entries = listRecent(20);
                break;
            default:
                entries = listAllEntries();
        }

        return entries.map(entryToCardFormat);
    }

    async addToFolder(blueprintId, folderId) {
        // For system folders like favorites, update the entry
        if (folderId === 'favorites') {
            updateFavorite(blueprintId, true);
        }
        // Custom folders not fully implemented - would need folder field in manifest
    }
}

// ============================================================================
// IMPORTER CLASS
// ============================================================================

export class FileBackedImporter {
    async importFromFile(file) {
        return importBlueprintFromPNG(file);
    }

    async getBlueprintById(blueprintId) {
        return loadBlueprintFromFile(blueprintId);
    }

    async saveBlueprint(blueprint) {
        // Extract cover as canvas before saving to ensure it's embedded in PNG
        const coverCanvas = await extractCoverAsCanvas(blueprint);
        return saveBlueprintToFile(blueprint, coverCanvas);
    }

    async deleteBlueprint(blueprintId) {
        return deleteBlueprintFile(blueprintId);
    }

    async getAllBlueprints() {
        const entries = listAllEntries();
        return entries.map(entryToCardFormat);
    }

    async exportToPNG(blueprintId) {
        const { downloadBlob } = await import('./utils.js');
        const { encodeBlueprintAsPNG } = await import('./storage.js');

        const blueprint = await loadBlueprintFromFile(blueprintId);
        if (!blueprint) throw new Error('Blueprint not found');

        const blob = await encodeBlueprintAsPNG(blueprint);
        const filename = `${(blueprint.userMetadata?.title || 'blueprint')
            .replace(/[^a-z0-9]/gi, '_')
            .toLowerCase()}.png`;

        downloadBlob(blob, filename);
    }

    async initPlayStats(blueprintId) {
        const allStats = loadPlayStats();
        if (!allStats[blueprintId]) {
            allStats[blueprintId] = { blueprint_id: blueprintId, ...DEFAULT_PLAY_STATS };
            savePlayStats(allStats);
        }
    }
}

// ============================================================================
// STATS TRACKER CLASS
// ============================================================================

export class FileBackedStats {
    async recordPlayStart(blueprintId) {
        const allStats = loadPlayStats();
        if (!allStats[blueprintId]) {
            allStats[blueprintId] = { blueprint_id: blueprintId, ...DEFAULT_PLAY_STATS };
        }

        allStats[blueprintId].timesPlayed++;
        allStats[blueprintId].lastPlayedAt = new Date().toISOString();
        savePlayStats(allStats);

        // Update manifest access count
        recordAccess(blueprintId);
    }

    async recordPlayProgress(blueprintId, currentStep, currentSceneIndex) {
        // Progress not persisted in this implementation
    }

    async recordPlayEnd(blueprintId, completed, abandoned = false) {
        const allStats = loadPlayStats();
        if (allStats[blueprintId]) {
            if (completed) allStats[blueprintId].completed = true;
            if (abandoned) allStats[blueprintId].abandoned = true;
            savePlayStats(allStats);
        }
    }

    async getStats(blueprintId) {
        const allStats = loadPlayStats();
        return allStats[blueprintId] || { blueprint_id: blueprintId, ...DEFAULT_PLAY_STATS };
    }

    async saveStats(stats) {
        if (stats.blueprint_id) {
            const allStats = loadPlayStats();
            allStats[stats.blueprint_id] = stats;
            savePlayStats(allStats);
        }
    }

    async getRecentlyPlayed(limit = 10) {
        const allStats = loadPlayStats();
        return Object.values(allStats)
            .filter(s => s.lastPlayedAt)
            .sort((a, b) => new Date(b.lastPlayedAt) - new Date(a.lastPlayedAt))
            .slice(0, limit);
    }

    async getMostPlayed(limit = 10) {
        const allStats = loadPlayStats();
        return Object.values(allStats)
            .filter(s => s.timesPlayed > 0)
            .sort((a, b) => b.timesPlayed - a.timesPlayed)
            .slice(0, limit);
    }
}

// ============================================================================
// COVER EXTRACTION HELPER
// ============================================================================

/**
 * Extract the current cover image from a blueprint as an HTMLCanvasElement.
 * This ensures the cover is properly loaded before PNG encoding, avoiding
 * issues with blob: URLs that become invalid after page refresh.
 *
 * @param {Object} blueprint - Blueprint object
 * @returns {Promise<HTMLCanvasElement|null>} Cover as canvas, or null if no cover
 */
async function extractCoverAsCanvas(blueprint) {
    const coverUrl = getBlueprintCoverUrl(blueprint);

    if (!coverUrl || !isValidImageUrl(coverUrl)) {
        return null;
    }

    try {
        const img = await loadImage(coverUrl);
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width || 600;
        canvas.height = img.naturalHeight || img.height || 900;
        canvas.getContext('2d').drawImage(img, 0, 0);
        return canvas;
    } catch (error) {
        console.warn('[LibraryAdapter] Failed to extract cover:', error.message);
        return null;
    }
}

// ============================================================================
// MAIN LIBRARY CLASS
// ============================================================================

export class FileBackedLibrary {
    constructor() {
        this.search = null;
        this.folders = null;
        this.importer = null;
        this.stats = null;
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;

        await initFileStorage();

        this.search = new FileBackedSearch();
        this.folders = new FileBackedFolders();
        this.importer = new FileBackedImporter();
        this.stats = new FileBackedStats();
        this.initialized = true;

        console.log('[FileBackedLibrary] Initialized');
    }

    async ensureInit() {
        if (!this.initialized) await this.init();
    }

    async getSettings() {
        return loadSettings();
    }

    async saveSettings(settings) {
        saveSettings(settings);
    }

    async getAllBlueprints(options = {}) {
        await this.ensureInit();

        const { folderId = 'all', sortBy = 'created', sortOrder = 'desc' } = options;

        const blueprints = folderId === 'all'
            ? listAllEntries().map(entryToCardFormat)
            : await this.folders.getFolderContents(folderId);

        return this.sortBlueprints(blueprints, sortBy, sortOrder);
    }

    sortBlueprints(blueprints, sortBy, sortOrder) {
        const sorted = [...blueprints];

        sorted.sort((a, b) => {
            let aVal, bVal;

            switch (sortBy) {
                case 'title':
                    aVal = (a.userMetadata?.title || '').toLowerCase();
                    bVal = (b.userMetadata?.title || '').toLowerCase();
                    break;
                case 'modified':
                    aVal = new Date(a.libraryData?.dateModified || 0);
                    bVal = new Date(b.libraryData?.dateModified || 0);
                    break;
                case 'timesPlayed':
                    aVal = a.libraryData?.accessCount || 0;
                    bVal = b.libraryData?.accessCount || 0;
                    break;
                case 'created':
                default:
                    aVal = new Date(a.libraryData?.dateAdded || a.metadata?.createdAt || 0);
                    bVal = new Date(b.libraryData?.dateAdded || b.metadata?.createdAt || 0);
                    break;
            }

            if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        return sorted;
    }

    async getBlueprint(blueprintId) {
        await this.ensureInit();
        return loadBlueprintFromFile(blueprintId);
    }

    async saveBlueprint(blueprint) {
        await this.ensureInit();

        if (!blueprint.libraryData) {
            blueprint.libraryData = {
                dateAdded: new Date().toISOString(),
                accessCount: 0,
            };
        }
        blueprint.libraryData.dateModified = new Date().toISOString();

        // Extract cover as canvas before saving to ensure it's embedded in PNG
        // This fixes the issue where blob: URLs become invalid after page refresh
        const coverCanvas = await extractCoverAsCanvas(blueprint);

        await saveBlueprintToFile(blueprint, coverCanvas);
    }

    async deleteBlueprint(blueprintId) {
        await this.ensureInit();
        return deleteBlueprintFile(blueprintId);
    }

    /**
     * Import PNG file directly without re-encoding
     */
    async importPNGFile(blueprint, pngFile) {
        await this.ensureInit();
        return importBlueprintFromPNG(pngFile);
    }

    /**
     * Set favorite status efficiently
     */
    async setFavorite(blueprintId, favorite) {
        await this.ensureInit();
        setFavorite(blueprintId, favorite);
    }

    async close() {
        await flushManifest();
        this.initialized = false;
    }
}

// ============================================================================
// SINGLETON
// ============================================================================

let globalLibrary = null;

export async function getLibrary() {
    if (!globalLibrary) {
        globalLibrary = new FileBackedLibrary();
        await globalLibrary.init();
    }
    return globalLibrary;
}

export function resetLibrary() {
    globalLibrary = null;
}

// Re-export for convenience
export { flushManifest as flushPendingManifestSave };
