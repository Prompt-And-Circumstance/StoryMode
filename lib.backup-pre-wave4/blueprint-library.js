/**
 * Blueprint Library Module - Management & Storage
 *
 * Provides a comprehensive library system for storing, organizing, and loading
 * story blueprints using IndexedDB for persistent browser storage.
 *
 * @module blueprint-library
 * @version 1.0.0
 */

// ============================================================================
// IMPORTS
// ============================================================================

import { generateUUID, downloadBlob, loadImage, fileToDataURL } from './blueprint-utils.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const DB_NAME = 'StoryModeBlueprintDB';
const DB_VERSION = 1;

const STORES = {
    BLUEPRINTS: 'blueprints',
    SETTINGS: 'librarySettings',
    PLAY_STATS: 'playStats',
};

const DEFAULT_SETTINGS = {
    id: 'settings',
    version: '1.0.0',
    defaultView: 'grid',
    gridSize: 'medium',
    sortBy: 'created',
    sortOrder: 'desc',
    autoSaveBlueprints: true,
    autoSaveInterval: 300000,
    maxLibrarySize: 1000,
    storageWarningThreshold: 900,
    defaultCoverStyle: 'generated',
    coverQuality: 'high',
    exportFormat: 'png',
    includeCoverOnExport: true,
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
    playHistory: [],
};

const GENRE_TAGS = {
    'horror': ['horror', 'scary', 'dark'],
    'fantasy': ['fantasy', 'magic', 'adventure'],
    'mystery': ['mystery', 'detective', 'suspense'],
    'sci-fi': ['sci-fi', 'science fiction', 'future'],
    'romance': ['romance', 'love', 'relationship'],
    'adventure': ['adventure', 'action', 'journey'],
};

function buildSearchIndex(blueprint) {
    const parts = [];

    if (blueprint.userMetadata?.title) {
        parts.push(blueprint.userMetadata.title);
    }

    if (blueprint.userMetadata?.tags) {
        parts.push(...blueprint.userMetadata.tags);
    }

    if (blueprint.story_type_name) {
        parts.push(blueprint.story_type_name);
    }

    if (blueprint.core_premise) {
        parts.push(blueprint.core_premise);
    }

    if (blueprint.setting?.location) {
        parts.push(blueprint.setting.location);
    }

    if (blueprint.embeddedResources?.characters) {
        blueprint.embeddedResources.characters.forEach(char => {
            parts.push(char.name);
            if (char.description) parts.push(char.description);
        });
    }

    return parts.join(' ').toLowerCase();
}

function extractTags(blueprint) {
    const tags = new Set();

    if (blueprint.userMetadata?.tags) {
        blueprint.userMetadata.tags.forEach(tag => tags.add(tag));
    }

    if (blueprint.story_type_name) {
        tags.add(blueprint.story_type_name.toLowerCase());
    }

    const genre = (blueprint.story_type_name || '').toLowerCase();
    if (GENRE_TAGS[genre]) {
        GENRE_TAGS[genre].forEach(tag => tags.add(tag));
    }

    return Array.from(tags);
}

async function generateThumbnail(source, maxWidth = 100, maxHeight = 150) {
    const img = source instanceof HTMLImageElement
        ? source
        : await loadImage(await fileToDataURL(source));

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const scale = Math.min(maxWidth / img.naturalWidth, maxHeight / img.naturalHeight, 1);

    canvas.width = img.naturalWidth * scale;
    canvas.height = img.naturalHeight * scale;

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png', 0.8);
}

// ============================================================================
// INDEXEDDB HELPERS
// ============================================================================

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(new Error('[BlueprintLibrary] Failed to open database'));
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            if (!db.objectStoreNames.contains(STORES.BLUEPRINTS)) {
                const blueprintStore = db.createObjectStore(STORES.BLUEPRINTS, { keyPath: 'blueprint_id' });
                blueprintStore.createIndex('title', 'userMetadata.title', { unique: false });
                blueprintStore.createIndex('created', 'metadata.createdAt', { unique: false });
                blueprintStore.createIndex('modified', 'metadata.lastModifiedAt', { unique: false });
                blueprintStore.createIndex('favorite', 'userMetadata.favorite', { unique: false });
                blueprintStore.createIndex('folder', 'userMetadata.folder', { unique: false });
                blueprintStore.createIndex('storyType', 'story_type_id', { unique: false });
                blueprintStore.createIndex('searchIndex', 'libraryData.searchIndex', { unique: false });
            }

            if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
                db.createObjectStore(STORES.SETTINGS, { keyPath: 'id' });
            }

            if (!db.objectStoreNames.contains(STORES.PLAY_STATS)) {
                const statsStore = db.createObjectStore(STORES.PLAY_STATS, { keyPath: 'blueprint_id' });
                statsStore.createIndex('lastPlayed', 'lastPlayedAt', { unique: false });
                statsStore.createIndex('timesPlayed', 'timesPlayed', { unique: false });
            }
        };
    });
}

function getTransaction(db, storeNames, mode = 'readonly') {
    return db.transaction(storeNames, mode);
}

const idbHelpers = {
    get(store, key) {
        return new Promise((resolve, reject) => {
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    put(store, item) {
        return new Promise((resolve, reject) => {
            const request = store.put(item);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    getAll(store, index = null, range = null) {
        return new Promise((resolve, reject) => {
            const request = index ? index.getAll(range) : store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    delete(store, key) {
        return new Promise((resolve, reject) => {
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    transactionComplete(tx) {
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    },
};

// ============================================================================
// BLUEPRINT SEARCH CLASS
// ============================================================================

export class BlueprintSearch {
    constructor(db) {
        this.db = db;
    }

    parseQuery(query) {
        if (!query) return [];
        return query.toLowerCase().split(/\s+/).filter(term => term.length > 0);
    }

    async search(query, options = {}) {
        const {
            searchIn = ['title', 'tags', 'premise', 'characters'],
            caseSensitive = false,
            exactPhrase = false,
            storyTypes = [],
            tags = [],
            dateRange = { from: null, to: null },
            favoritesOnly = false,
            minScenes = null,
            maxScenes = null,
        } = options;

        const searchTerms = this.parseQuery(query);

        try {
            const tx = getTransaction(this.db, [STORES.BLUEPRINTS], 'readonly');
            const store = tx.objectStore(STORES.BLUEPRINTS);
            let blueprints = await idbHelpers.getAll(store);

            blueprints = blueprints.filter(blueprint => {
                if (favoritesOnly && !blueprint.userMetadata?.favorite) return false;
                if (storyTypes.length > 0 && !storyTypes.includes(blueprint.story_type_id)) return false;

                if (tags.length > 0) {
                    const blueprintTags = blueprint.libraryData?.matchingTags || [];
                    if (!tags.every(tag => blueprintTags.includes(tag))) return false;
                }

                const sceneCount = blueprint.scene_plan?.length || 0;
                if (minScenes !== null && sceneCount < minScenes) return false;
                if (maxScenes !== null && sceneCount > maxScenes) return false;

                const createdAt = blueprint.metadata?.createdAt ? new Date(blueprint.metadata.createdAt) : null;
                if (dateRange.from && createdAt && createdAt < dateRange.from) return false;
                if (dateRange.to && createdAt && createdAt > dateRange.to) return false;

                return true;
            });

            if (searchTerms.length > 0) {
                const searchFunc = exactPhrase
                    ? bp => (bp.libraryData?.searchIndex || '').includes(query.toLowerCase())
                    : bp => searchTerms.some(term => (bp.libraryData?.searchIndex || '').includes(term));

                blueprints = blueprints.filter(searchFunc);
            }

            return this.rankResults(blueprints, searchTerms);
        } catch (error) {
            console.error('[BlueprintSearch] Search error:', error);
            return [];
        }
    }

    rankResults(results, searchTerms) {
        if (searchTerms.length === 0) return results;

        return results
            .map(blueprint => ({
                blueprint,
                score: this.calculateRelevance(blueprint, searchTerms),
            }))
            .sort((a, b) => b.score - a.score)
            .map(item => item.blueprint);
    }

    calculateRelevance(blueprint, searchTerms) {
        let score = 0;
        const title = (blueprint.userMetadata?.title || '').toLowerCase();
        const searchIndex = blueprint.libraryData?.searchIndex || '';
        const tags = blueprint.libraryData?.matchingTags || [];

        for (const term of searchTerms) {
            if (title.includes(term)) score += 10;
            if (tags.some(tag => tag.toLowerCase().includes(term))) score += 5;
            if (searchIndex.includes(term)) score += 1;
        }

        return score;
    }
}

// ============================================================================
// BLUEPRINT FOLDERS CLASS
// ============================================================================

export class BlueprintFolders {
    constructor(db) {
        this.db = db;
    }

    async getFolders() {
        try {
            const tx = getTransaction(this.db, [STORES.SETTINGS], 'readonly');
            const store = tx.objectStore(STORES.SETTINGS);
            const result = await idbHelpers.get(store, 'settings');
            return result?.folders || DEFAULT_SETTINGS.folders;
        } catch (error) {
            console.error('[BlueprintFolders] Error getting folders:', error);
            return DEFAULT_SETTINGS.folders;
        }
    }

    async createFolder(name, icon = 'fa-folder') {
        const folders = await this.getFolders();
        const folder = {
            id: generateUUID(),
            name,
            icon,
            createdAt: new Date().toISOString(),
            system: false,
            blueprintCount: 0,
        };

        folders.push(folder);
        await this.saveFolders(folders);
        return folder;
    }

    async deleteFolder(folderId) {
        const folders = await this.getFolders();
        const folder = folders.find(f => f.id === folderId);

        if (folder?.system) {
            throw new Error('Cannot delete system folder');
        }

        await this.moveAllFromFolder(folderId, 'all');

        const updated = folders.filter(f => f.id !== folderId);
        await this.saveFolders(updated);
    }

    async addToFolder(blueprintId, folderId) {
        const tx = getTransaction(this.db, [STORES.BLUEPRINTS], 'readwrite');
        const store = tx.objectStore(STORES.BLUEPRINTS);

        const blueprint = await idbHelpers.get(store, blueprintId);
        if (!blueprint) {
            throw new Error('Blueprint not found');
        }

        if (!blueprint.userMetadata) {
            blueprint.userMetadata = {};
        }

        blueprint.userMetadata.folder = folderId;
        await idbHelpers.put(store, blueprint);
        await this.updateFolderCount(folderId);
    }

    async moveToFolder(blueprintId, folderId) {
        await this.addToFolder(blueprintId, folderId);
    }

    async moveAllFromFolder(fromFolderId, toFolderId) {
        const blueprints = await this.getFolderContents(fromFolderId);
        for (const blueprint of blueprints) {
            await this.addToFolder(blueprint.blueprint_id, toFolderId);
        }
        return blueprints.length;
    }

    async getFolderContents(folderId) {
        const tx = getTransaction(this.db, [STORES.BLUEPRINTS], 'readonly');
        const store = tx.objectStore(STORES.BLUEPRINTS);

        if (folderId === 'all') {
            return idbHelpers.getAll(store);
        }

        if (folderId === 'favorites') {
            const index = store.index('favorite');
            return idbHelpers.getAll(store, index, IDBKeyRange.only(true));
        }

        if (folderId === 'recent') {
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const blueprints = await idbHelpers.getAll(store);

            return blueprints
                .filter(bp => {
                    const lastAccessed = bp.libraryData?.lastAccessed
                        ? new Date(bp.libraryData.lastAccessed)
                        : null;
                    return lastAccessed && lastAccessed >= thirtyDaysAgo;
                })
                .sort((a, b) => new Date(b.libraryData?.lastAccessed || 0) - new Date(a.libraryData?.lastAccessed || 0))
                .slice(0, 20);
        }

        const index = store.index('folder');
        return idbHelpers.getAll(store, index, IDBKeyRange.only(folderId));
    }

    async updateFolderCount(folderId) {
        if (['all', 'favorites', 'recent'].includes(folderId)) return;

        const blueprints = await this.getFolderContents(folderId);
        const folders = await this.getFolders();
        const folder = folders.find(f => f.id === folderId);

        if (folder) {
            folder.blueprintCount = blueprints.length;
            await this.saveFolders(folders);
        }
    }

    async saveFolders(folders) {
        const tx = getTransaction(this.db, [STORES.SETTINGS], 'readwrite');
        const store = tx.objectStore(STORES.SETTINGS);

        const settings = (await idbHelpers.get(store, 'settings')) || { ...DEFAULT_SETTINGS };
        settings.folders = folders;
        await idbHelpers.put(store, settings);
    }
}

// ============================================================================
// BLUEPRINT IMPORTER CLASS
// ============================================================================

export class BlueprintImporter {
    constructor(db) {
        this.db = db;
    }

    async importFromFile(file) {
        const { isBlueprintPNG, decodeBlueprintFromPNG, extractMetadataFromPNG } = await import('./blueprint-storage.js');
        const { isExtendedFormat } = await import('./blueprint-png-decoder.js');

        if (!(await isBlueprintPNG(file))) {
            throw new Error('Not a valid blueprint PNG file');
        }

        // Check if extended PNG format (REG-001)
        const arrayBuffer = await file.arrayBuffer();
        const metadata = extractMetadataFromPNG(arrayBuffer);

        const isExtended = isExtendedFormat(metadata);
        console.log(`[Story Mode] Detected PNG format: ${isExtended ? 'extended (v2.0.0)' : 'basic (v1.0.0)'}`);

        let blueprint;
        if (isExtended) {
            try {
                // Use new extended import
                blueprint = await this.importFromExtendedPNG(file);
            } catch (extendedError) {
                console.warn('[Story Mode] Extended format import failed, trying basic format:', extendedError);
                toastr.warning('Extended format import failed, trying basic format...');
                // Fallback to basic format
                blueprint = await decodeBlueprintFromPNG(file);
            }
        } else {
            // Use existing PNG import (v1.0.0 format)
            blueprint = await decodeBlueprintFromPNG(file);
        }

        const existing = await this.getBlueprintById(blueprint.blueprint_id);
        if (existing) {
            const choice = await this.showDuplicateDialog(blueprint, existing);
            if (choice === 'skip') return null;
            if (choice === 'replace') {
                await this.deleteBlueprint(blueprint.blueprint_id);
            } else if (choice === 'rename') {
                blueprint.blueprint_id = generateUUID();
                if (!blueprint.userMetadata) blueprint.userMetadata = {};
                blueprint.userMetadata.title += ' (Imported)';
            }
        }

        blueprint.libraryData = {
            dateAdded: new Date().toISOString(),
            dateModified: new Date().toISOString(),
            lastAccessed: new Date().toISOString(),
            accessCount: 0,
            coverThumbnail: await generateThumbnail(file),
            coverFull: await fileToDataURL(file),
            searchIndex: buildSearchIndex(blueprint),
            matchingTags: extractTags(blueprint),
        };

        await this.saveBlueprint(blueprint);
        await this.initPlayStats(blueprint.blueprint_id);

        return blueprint;
    }

    async showDuplicateDialog(blueprint, existing) {
        console.warn('[BlueprintImporter] Duplicate blueprint detected:', existing.userMetadata?.title);
        return 'rename';
    }

    /**
     * Import from extended PNG format (NEW)
     * @param {File} file
     * @returns {Promise<Object>}
     */
    async importFromExtendedPNG(file) {
        const { importBlueprintFromPNG } = await import('./blueprint-import.js');

        const result = await importBlueprintFromPNG(file, {
            autoImportMissing: false // Show preview dialog
        });

        if (!result.success) {
            throw new Error(result.error);
        }

        // Check for duplicates
        const duplicate = await this.getBlueprintById(result.blueprint.blueprint_id);
        if (duplicate) {
            const overwrite = await this.showDuplicateDialog(result.blueprint, duplicate);
            if (overwrite === 'skip') {
                throw new Error('Import cancelled by user');
            }
            if (overwrite === 'replace') {
                await this.deleteBlueprint(result.blueprint.blueprint_id);
            } else if (overwrite === 'rename') {
                result.blueprint.blueprint_id = generateUUID();
                if (!result.blueprint.userMetadata) result.blueprint.userMetadata = {};
                result.blueprint.userMetadata.title += ' (Imported)';
            }
        }

        // Generate thumbnail
        const thumbnail = await generateThumbnail(file);
        result.blueprint.libraryData = {
            dateAdded: new Date().toISOString(),
            dateModified: new Date().toISOString(),
            lastAccessed: new Date().toISOString(),
            accessCount: 0,
            coverThumbnail: thumbnail,
            coverFull: await fileToDataURL(file),
            searchIndex: buildSearchIndex(result.blueprint),
            matchingTags: extractTags(result.blueprint),
        };

        // Save to library
        await this.saveBlueprint(result.blueprint);
        await this.initPlayStats(result.blueprint.blueprint_id);

        console.log(`[Story Mode] Imported blueprint: ${result.blueprint.core_premise || 'Untitled'}`);
        return result.blueprint;
    }

    async getBlueprintById(blueprintId) {
        const tx = getTransaction(this.db, [STORES.BLUEPRINTS], 'readonly');
        const store = tx.objectStore(STORES.BLUEPRINTS);
        const result = await idbHelpers.get(store, blueprintId);
        return result || null;
    }

    async saveBlueprint(blueprint) {
        const tx = getTransaction(this.db, [STORES.BLUEPRINTS], 'readwrite');
        const store = tx.objectStore(STORES.BLUEPRINTS);
        await idbHelpers.put(store, blueprint);
    }

    async deleteBlueprint(blueprintId) {
        const tx = getTransaction(this.db, [STORES.BLUEPRINTS, STORES.PLAY_STATS], 'readwrite');
        tx.objectStore(STORES.BLUEPRINTS).delete(blueprintId);
        tx.objectStore(STORES.PLAY_STATS).delete(blueprintId);
        await idbHelpers.transactionComplete(tx);
    }

    async initPlayStats(blueprintId) {
        const tx = getTransaction(this.db, [STORES.PLAY_STATS], 'readwrite');
        const store = tx.objectStore(STORES.PLAY_STATS);

        const stats = {
            blueprint_id: blueprintId,
            ...DEFAULT_PLAY_STATS,
        };

        await idbHelpers.put(store, stats);
    }

    async exportToPNG(blueprintId) {
        const { encodeBlueprintAsPNG } = await import('./blueprint-storage.js');

        const blueprint = await this.getBlueprintById(blueprintId);
        if (!blueprint) {
            throw new Error('Blueprint not found');
        }

        const blob = await encodeBlueprintAsPNG(blueprint);
        const filename = `${(blueprint.userMetadata?.title || 'blueprint')
            .replace(/[^a-z0-9]/gi, '_')
            .toLowerCase()}.png`;

        downloadBlob(blob, filename);
    }

    async exportAllBlueprints() {
        const blueprints = await this.getAllBlueprints();
        for (const blueprint of blueprints) {
            await this.exportToPNG(blueprint.blueprint_id);
        }
    }

    async getAllBlueprints() {
        const tx = getTransaction(this.db, [STORES.BLUEPRINTS], 'readonly');
        const store = tx.objectStore(STORES.BLUEPRINTS);
        return idbHelpers.getAll(store);
    }
}

// ============================================================================
// PLAY STATS TRACKER CLASS
// ============================================================================

export class PlayStatsTracker {
    constructor(db) {
        this.db = db;
    }

    async recordPlayStart(blueprintId) {
        const stats = await this.getStats(blueprintId);

        stats.playHistory.push({
            startedAt: new Date().toISOString(),
            completedAt: null,
            progress: { currentStep: 0, currentSceneIndex: 0 },
            abandoned: false,
        });

        stats.timesPlayed++;
        stats.lastPlayedAt = new Date().toISOString();

        await this.saveStats(stats);
        await this.updateAccessData(blueprintId);
    }

    async recordPlayProgress(blueprintId, currentStep, currentSceneIndex) {
        const stats = await this.getStats(blueprintId);

        const currentPlay = stats.playHistory[stats.playHistory.length - 1];
        if (currentPlay) {
            currentPlay.progress = { currentStep, currentSceneIndex };
        }

        await this.saveStats(stats);
    }

    async recordPlayEnd(blueprintId, completed, abandoned = false) {
        const stats = await this.getStats(blueprintId);

        const currentPlay = stats.playHistory[stats.playHistory.length - 1];
        if (currentPlay) {
            currentPlay.completedAt = new Date().toISOString();
            currentPlay.abandoned = abandoned;

            const started = new Date(currentPlay.startedAt);
            const ended = new Date(currentPlay.completedAt);
            stats.totalPlayTime += Math.floor((ended - started) / 1000);
        }

        stats.completed = stats.completed || completed;
        stats.abandoned = stats.abandoned || abandoned;

        await this.saveStats(stats);
    }

    async getStats(blueprintId) {
        const tx = getTransaction(this.db, [STORES.PLAY_STATS], 'readonly');
        const store = tx.objectStore(STORES.PLAY_STATS);

        try {
            const result = await idbHelpers.get(store, blueprintId);
            return result || { blueprint_id: blueprintId, ...DEFAULT_PLAY_STATS };
        } catch (error) {
            return { blueprint_id: blueprintId, ...DEFAULT_PLAY_STATS };
        }
    }

    async saveStats(stats) {
        const tx = getTransaction(this.db, [STORES.PLAY_STATS], 'readwrite');
        const store = tx.objectStore(STORES.PLAY_STATS);
        await idbHelpers.put(store, stats);
    }

    async updateAccessData(blueprintId) {
        const tx = getTransaction(this.db, [STORES.BLUEPRINTS], 'readwrite');
        const store = tx.objectStore(STORES.BLUEPRINTS);

        const blueprint = await idbHelpers.get(store, blueprintId);
        if (blueprint?.libraryData) {
            blueprint.libraryData.lastAccessed = new Date().toISOString();
            blueprint.libraryData.accessCount++;
            await idbHelpers.put(store, blueprint);
        }
    }

    async getRecentlyPlayed(limit = 10) {
        const tx = getTransaction(this.db, [STORES.PLAY_STATS], 'readonly');
        const store = tx.objectStore(STORES.PLAY_STATS);
        const index = store.index('lastPlayed');

        return new Promise((resolve, reject) => {
            const request = index.openCursor(null, 'prev');
            const results = [];

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor && results.length < limit) {
                    results.push(cursor.value);
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    async getMostPlayed(limit = 10) {
        const tx = getTransaction(this.db, [STORES.PLAY_STATS], 'readonly');
        const store = tx.objectStore(STORES.PLAY_STATS);
        const all = await idbHelpers.getAll(store);

        return all
            .filter(s => s.timesPlayed > 0)
            .sort((a, b) => b.timesPlayed - a.timesPlayed)
            .slice(0, limit);
    }
}

// ============================================================================
// BLUEPRINT LIBRARY MAIN CLASS
// ============================================================================

export class BlueprintLibrary {
    constructor() {
        this.db = null;
        this.search = null;
        this.folders = null;
        this.importer = null;
        this.stats = null;
    }

    async init() {
        if (this.db) return;

        try {
            this.db = await openDatabase();
            this.search = new BlueprintSearch(this.db);
            this.folders = new BlueprintFolders(this.db);
            this.importer = new BlueprintImporter(this.db);
            this.stats = new PlayStatsTracker(this.db);

            console.log('[BlueprintLibrary] Library initialized successfully');
        } catch (error) {
            console.error('[BlueprintLibrary] Initialization failed:', error);
            throw error;
        }
    }

    async ensureInit() {
        if (!this.db) await this.init();
    }

    async getSettings() {
        await this.ensureInit();

        const tx = getTransaction(this.db, [STORES.SETTINGS], 'readonly');
        const store = tx.objectStore(STORES.SETTINGS);

        try {
            const result = await idbHelpers.get(store, 'settings');
            return result || { ...DEFAULT_SETTINGS };
        } catch (error) {
            return { ...DEFAULT_SETTINGS };
        }
    }

    async saveSettings(settings) {
        await this.ensureInit();

        const tx = getTransaction(this.db, [STORES.SETTINGS], 'readwrite');
        const store = tx.objectStore(STORES.SETTINGS);
        await idbHelpers.put(store, settings);
    }

    async getAllBlueprints(options = {}) {
        await this.ensureInit();

        const { folderId = 'all', sortBy = 'created', sortOrder = 'desc' } = options;

        const blueprints = folderId === 'all'
            ? await this.importer.getAllBlueprints()
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
                    aVal = 0;
                    bVal = 0;
                    break;
                case 'created':
                default:
                    aVal = new Date(a.metadata?.createdAt || 0);
                    bVal = new Date(b.metadata?.createdAt || 0);
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
        return this.importer.getBlueprintById(blueprintId);
    }

    async saveBlueprint(blueprint) {
        await this.ensureInit();

        if (!blueprint.libraryData) {
            blueprint.libraryData = {};
        }

        blueprint.libraryData.dateModified = new Date().toISOString();

        if (!blueprint.libraryData.searchIndex) {
            blueprint.libraryData.searchIndex = buildSearchIndex(blueprint);
        }
        if (!blueprint.libraryData.matchingTags) {
            blueprint.libraryData.matchingTags = extractTags(blueprint);
        }

        await this.importer.saveBlueprint(blueprint);

        const existingStats = await this.stats.getStats(blueprint.blueprint_id);
        if (!existingStats.timesPlayed) {
            await this.importer.initPlayStats(blueprint.blueprint_id);
        }
    }

    async deleteBlueprint(blueprintId) {
        await this.ensureInit();
        return this.importer.deleteBlueprint(blueprintId);
    }

    async close() {
        if (this.db) {
            this.db.close();
            this.db = null;
            this.search = null;
            this.folders = null;
            this.importer = null;
            this.stats = null;
        }
    }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let globalLibrary = null;

export async function getLibrary() {
    if (!globalLibrary) {
        globalLibrary = new BlueprintLibrary();
        await globalLibrary.init();
    }
    return globalLibrary;
}
