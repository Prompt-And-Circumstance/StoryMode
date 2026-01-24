/**
 * State Manager Module for Story Mode Extension
 *
 * Handles all state management including:
 * - Extension settings (global and per-chat)
 * - Story types and author styles data
 * - LocalForage persistence
 * - Fuse.js fuzzy search initialization
 */

import {
    eventSource,
    event_types,
    saveSettingsDebounced,
    extension_prompt_types,
    extension_prompt_roles,
    saveMetadata,
} from '/script.js';
import { extension_settings, getContext } from '/scripts/extensions.js';

// ============================================================================
// MODULE CONSTANTS
// ============================================================================

export const MODULE_NAME = 'story_mode';

/** Base URL for loading extension data files */
export const extensionBaseUrl = new URL('../..', import.meta.url).href;

/** Default extension settings */
export const defaultSettings = {
    enabled: false,
    storyArcEnabled: false,
    selectedStoryType: '',
    selectedAuthorStyle: '',
    arcLength: 30,
    currentStep: 0,
    authorStyleEnabled: false,
    nsfwEnabled: false,
    epilogueEnabled: false,
    summaryEnabled: false,
    nextAdventureEnabled: false,
    summaryMessageCount: 0, // 0 = entire chat, >0 = last N messages
    debugMode: false,
    debugPanelEnabled: false,
    debugPanelRolledUp: false,
    position: extension_prompt_types.IN_CHAT,
    depth: 4,
    role: extension_prompt_roles.SYSTEM,
    epilogueApi: null,
    summaryApi: null,
    nextAdventureApi: null,
    // Note: storyTypes and authorStyles are stored in localForage, not extension_settings
    // Scene Image Generation settings
    imageGeneration: {
        enabled: false,
        sdProfile: null,
        autoGenerate: false,
        addToGallery: false,
        imageStyle: 'auto',
        customStylePrompt: '',
    },
    // Scene Images storage (per-blueprint, per-scene)
    sceneImages: {},
};

// ============================================================================
// DATA STORAGE
// ============================================================================

/** Story type definitions */
let storyTypes = [];

/** Author style definitions */
let authorStyles = [];

/** Fuse.js instance for story type search */
let fuseStoryTypes = null;

/** Fuse.js instance for author style search */
let fuseAuthorStyles = null;

/** Original (unmodified) story types for revert functionality */
let originalStoryTypes = [];

/** Original (unmodified) author styles for revert functionality */
let originalAuthorStyles = [];

// ============================================================================
// DATA ACCESSORS
// ============================================================================

/**
 * Get the current story types array
 * @returns {Array} Story types array
 */
export function getStoryTypes() {
    return storyTypes;
}

/**
 * Get the current author styles array
 * @returns {Array} Author styles array
 */
export function getAuthorStyles() {
    return authorStyles;
}

/**
 * Get Fuse.js instance for story type search
 * @returns {Fuse|null} Fuse instance or null
 */
export function getFuseStoryTypes() {
    return fuseStoryTypes;
}

/**
 * Get Fuse.js instance for author style search
 * @returns {Fuse|null} Fuse instance or null
 */
export function getFuseAuthorStyles() {
    return fuseAuthorStyles;
}

/**
 * Set the story types array (used during data updates)
 * @param {Array} types - New story types array
 */
export function setStoryTypes(types) {
    storyTypes = types;
}

/**
 * Set the author styles array (used during data updates)
 * @param {Array} styles - New author styles array
 */
export function setAuthorStyles(styles) {
    authorStyles = styles;
}

// ============================================================================
// SETTINGS MANAGEMENT
// ============================================================================

/**
 * Load extension settings from the global extension_settings object.
 * Merges loaded settings with defaults to ensure all properties exist.
 */
export function loadSettings() {
    if (!extension_settings[MODULE_NAME]) {
        extension_settings[MODULE_NAME] = structuredClone(defaultSettings);
    }

    // Merge with defaults
    extension_settings[MODULE_NAME] = Object.assign(
        {},
        defaultSettings,
        extension_settings[MODULE_NAME]
    );

}

/**
 * Get the extension settings object
 * @returns {Object} Extension settings
 */
export function getSettings() {
    return extension_settings[MODULE_NAME];
}

// ============================================================================
// CHAT STATE MANAGEMENT
// ============================================================================

/**
 * Get the current per-chat story mode state from chat metadata.
 * Initializes the metadata object with global defaults if not present.
 *
 * @returns {Object} The chat's story mode state containing currentStep, arcStarted,
 *                   epilogueShown, summaryShown, selectedStoryType, selectedAuthorStyle, and arcLength.
 */
export function getChatStoryState() {
    // Always pull a fresh context to ensure we're reading the latest state
    const { chatMetadata } = getContext();
    if (!chatMetadata[MODULE_NAME]) {
        // Initialize new chat with current global settings
        const settings = extension_settings[MODULE_NAME];
        chatMetadata[MODULE_NAME] = {
            currentStep: 0,
            arcStarted: false,
            epilogueShown: false,
            summaryShown: false,
            nextAdventureShown: false,
            endNoticeShown: false,
            savedEpilogue: null,
            savedSummary: null,
            savedNextAdventure: null,
            selectedStoryType: settings.selectedStoryType || '',
            selectedAuthorStyle: settings.selectedAuthorStyle || '',
            arcLength: settings.arcLength || 30,
            pacingMode: 'story', // 'story' | 'scenario'
            scenario: {
                currentSceneIndex: 0,
                beatState: {}, // { 0: { status: 'complete' } }
            }
        };
    } else {
        // Migration: Ensure new properties exist for existing chats
        if (!chatMetadata[MODULE_NAME].pacingMode) {
            chatMetadata[MODULE_NAME].pacingMode = 'story';
        }
        if (!chatMetadata[MODULE_NAME].scenario) {
            chatMetadata[MODULE_NAME].scenario = {
                currentSceneIndex: 0,
                beatState: {}
            };
        }
        if (chatMetadata[MODULE_NAME].nextAdventureShown === undefined) {
            chatMetadata[MODULE_NAME].nextAdventureShown = false;
        }
        if (chatMetadata[MODULE_NAME].savedEpilogue === undefined) {
            chatMetadata[MODULE_NAME].savedEpilogue = null;
        }
        if (chatMetadata[MODULE_NAME].savedSummary === undefined) {
            chatMetadata[MODULE_NAME].savedSummary = null;
        }
        if (chatMetadata[MODULE_NAME].savedNextAdventure === undefined) {
            chatMetadata[MODULE_NAME].savedNextAdventure = null;
        }
    }
    return chatMetadata[MODULE_NAME];
}

/**
 * Save the per-chat story mode state to metadata and persist to server.
 * Emits a CHAT_METADATA_UPDATED event after saving.
 *
 * @async
 * @param {Object} state - The story mode state object to save.
 */
export async function saveChatStoryState(state) {
    // Always pull a fresh context
    const { chatMetadata } = getContext();

    // Update this chat's metadata
    chatMetadata[MODULE_NAME] = state;

    // Persist to the server/chat file
    await saveMetadata();

    // Optional notification
    eventSource.emit(event_types.CHAT_METADATA_UPDATED);
}

/**
 * Get the current pacing mode ('story' or 'scenario')
 * @returns {string} The current pacing mode
 */
export function getPacingMode() {
    const state = getChatStoryState();
    return state.pacingMode || 'story';
}

/**
 * Set the pacing mode
 * @param {string} mode - 'story' or 'scenario'
 */
export function setPacingMode(mode) {
    const state = getChatStoryState();
    state.pacingMode = mode;
    saveChatStoryState(state);
}

/**
 * Get the scenario state object
 * @returns {Object} The scenario state { currentSceneIndex, beatState }
 */
export function getScenarioState() {
    const state = getChatStoryState();
    // specific safety check
    if (!state.scenario) {
        state.scenario = { currentSceneIndex: 0, beatState: {} };
        saveChatStoryState(state);
    }
    return state.scenario;
}

/**
 * Update the scenario state partially
 * @param {Object} updates - Object containing properties to update
 */
export function updateScenarioState(updates) {
    const state = getChatStoryState();
    if (!state.scenario) state.scenario = { currentSceneIndex: 0, beatState: {} };

    state.scenario = { ...state.scenario, ...updates };
    saveChatStoryState(state);
}

/**
 * Get the current scene index (authoritative source)
 * @returns {number} Current scene index
 */
export function getCurrentSceneIndex() {
    const scenario = getScenarioState();
    return scenario.currentSceneIndex || 0;
}

/**
 * Set the current scene index
 * @param {number} index - New scene index
 */
export function setCurrentSceneIndex(index) {
    updateScenarioState({ currentSceneIndex: index });
}

// ============================================================================
// BEAT STATE MANAGEMENT
// ============================================================================

/**
 * Get beat state for current scene
 * @returns {Object} Beat state map { beatIndex: { status, timestamp } }
 */
export function getBeatState() {
    const scenario = getScenarioState();
    return scenario.beatState || {};
}

/**
 * Mark a beat as complete
 * @param {number} beatIndex - Beat index
 */
export function markBeatComplete(beatIndex) {
    const state = getChatStoryState();
    if (!state.scenario.beatState) state.scenario.beatState = {};
    state.scenario.beatState[beatIndex] = {
        status: 'complete',
        timestamp: Date.now()
    };
    saveChatStoryState(state);
}

/**
 * Mark a beat as skipped
 * @param {number} beatIndex - Beat index
 */
export function markBeatSkipped(beatIndex) {
    const state = getChatStoryState();
    if (!state.scenario.beatState) state.scenario.beatState = {};
    state.scenario.beatState[beatIndex] = {
        status: 'skipped',
        timestamp: Date.now()
    };
    saveChatStoryState(state);
}

/**
 * Reset beat state (e.g., on scene change)
 */
export function resetBeatState() {
    const state = getChatStoryState();
    state.scenario.beatState = {};
    saveChatStoryState(state);
}

/**
 * Get completed beat indices for current scene
 * @returns {number[]} Array of completed beat indices
 */
export function getCompletedBeatIndices() {
    const beatState = getBeatState();
    return Object.entries(beatState)
        .filter(([_, state]) => state.status === 'complete')
        .map(([idx, _]) => parseInt(idx));
}

// ============================================================================
// DATA LOADING
// ============================================================================

/**
 * Load story types from localForage storage.
 * Falls back to loading from the JSON file if nothing is stored.
 * Initializes Fuse.js for fuzzy search after loading.
 *
 * @async
 */
export async function loadStoryTypes() {
    try {
        // Try to load from localForage first
        const stored = await localforage.getItem('story_mode_story_types');
        if (stored && Array.isArray(stored) && stored.length > 0) {
            storyTypes = stored;
        } else {
            // Fallback to JSON file on first load
            const response = await fetch(new URL('data/story_types.json', extensionBaseUrl));
            if (response.ok) {
                const data = await response.json();
                storyTypes = data;
                // Save to localForage for future use
                await localforage.setItem('story_mode_story_types', storyTypes);
            }
        }
        // Initialize Fuse.js for fuzzy search
        initFuseStoryTypes();
    } catch (error) {
        console.error('[Story Mode] Failed to load story types:', error);
    }
}

/**
 * Load author styles from localForage storage.
 * Falls back to loading from the JSON file if nothing is stored.
 * Initializes Fuse.js for fuzzy search after loading.
 *
 * @async
 */
export async function loadAuthorStyles() {
    try {
        // Try to load from localForage first
        const stored = await localforage.getItem('story_mode_author_styles');
        if (stored && Array.isArray(stored) && stored.length > 0) {
            authorStyles = stored;
        } else {
            // Fallback to JSON file on first load
            const response = await fetch(new URL('data/author_styles.json', extensionBaseUrl));
            if (response.ok) {
                const data = await response.json();
                authorStyles = data;
                // Save to localForage for future use
                await localforage.setItem('story_mode_author_styles', authorStyles);
            }
        }
        // Initialize Fuse.js for fuzzy search
        initFuseAuthorStyles();
    } catch (error) {
        console.error('[Story Mode] Failed to load author styles:', error);
    }
}

// ============================================================================
// DATA PERSISTENCE
// ============================================================================

/**
 * Save story types to localForage storage.
 * Reinitializes Fuse.js after saving.
 *
 * @async
 */
export async function saveStoryTypesToStorage() {
    try {
        await localforage.setItem('story_mode_story_types', storyTypes);
        initFuseStoryTypes();
    } catch (error) {
        console.error('[Story Mode] Failed to save story types:', error);
        toastr.error('Failed to save story types');
    }
}

/**
 * Save author styles to localForage storage.
 * Reinitializes Fuse.js after saving.
 *
 * @async
 */
export async function saveAuthorStylesToStorage() {
    try {
        await localforage.setItem('story_mode_author_styles', authorStyles);
        initFuseAuthorStyles();
    } catch (error) {
        console.error('[Story Mode] Failed to save author styles:', error);
        toastr.error('Failed to save author styles');
    }
}

// ============================================================================
// FUSE.JS INITIALIZATION
// ============================================================================

/**
 * Initialize Fuse.js for story type fuzzy search
 */
function initFuseStoryTypes() {
    if (typeof Fuse !== 'undefined') {
        try {
            fuseStoryTypes = new Fuse(storyTypes, {
                keys: ['name', 'category', 'storyPrompt'],
                threshold: 0.3,
            });
        } catch (fuseError) {
            console.error('[Story Mode] Failed to initialize Fuse.js for story types:', fuseError);
        }
    }
}

/**
 * Initialize Fuse.js for author style fuzzy search
 */
function initFuseAuthorStyles() {
    if (typeof Fuse !== 'undefined') {
        try {
            fuseAuthorStyles = new Fuse(authorStyles, {
                keys: ['name', 'category', 'authorPrompt', 'keywords'],
                threshold: 0.3,
            });
        } catch (fuseError) {
            console.error('[Story Mode] Failed to initialize Fuse.js for author styles:', fuseError);
        }
    }
}

/**
 * Load Fuse.js library for fuzzy search
 *
 * @async
 */
export async function loadFuseJS() {
    if (typeof Fuse !== 'undefined') {
        return;
    }
    try {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/fuse.js@6.6.2/dist/fuse.min.js';
        script.async = true;
        await new Promise((resolve, reject) => {
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    } catch (error) {
        console.error('[Story Mode] Failed to load Fuse.js:', error);
    }
}

// ============================================================================
// ORIGINAL DATA (FOR REVERT FUNCTIONALITY)
// ============================================================================

/**
 * Load original (unmodified) story types for revert functionality.
 * Retrieves from localForage or creates a backup from current loaded types.
 *
 * @async
 */
export async function loadOriginalStoryTypes() {
    try {
        // Try to load from localForage first
        const stored = await localforage.getItem('story_mode_original_story_types');
        if (stored && Array.isArray(stored) && stored.length > 0) {
            originalStoryTypes = stored;
        } else if (storyTypes.length > 0) {
            // First load - save current story types as originals (deep copy)
            originalStoryTypes = JSON.parse(JSON.stringify(storyTypes));
            await localforage.setItem('story_mode_original_story_types', originalStoryTypes);
        }
    } catch (error) {
        console.error('[Story Mode] Error loading original story types:', error);
    }
}

/**
 * Load original (unmodified) author styles for revert functionality.
 * Retrieves from localForage or creates a backup from current loaded styles.
 *
 * @async
 */
export async function loadOriginalAuthorStyles() {
    try {
        // Try to load from localForage first
        const stored = await localforage.getItem('story_mode_original_author_styles');
        if (stored && Array.isArray(stored) && stored.length > 0) {
            originalAuthorStyles = stored;
        } else if (authorStyles.length > 0) {
            // First load - save current author styles as originals (deep copy)
            originalAuthorStyles = JSON.parse(JSON.stringify(authorStyles));
            await localforage.setItem('story_mode_original_author_styles', originalAuthorStyles);
        }
    } catch (error) {
        console.error('[Story Mode] Error loading original author styles:', error);
    }
}

/**
 * Get an original (unmodified) story type by ID.
 * Used to revert user customizations to the default version.
 *
 * @param {string} id - The unique identifier of the story type.
 * @returns {Object|undefined} The original story type object, or undefined if not found.
 */
export function getOriginalStoryType(id) {
    return originalStoryTypes.find(t => t.id === id);
}

/**
 * Get an original (unmodified) author style by ID.
 * Used to revert user customizations to the default version.
 *
 * @param {string} id - The unique identifier of the author style.
 * @returns {Object|undefined} The original author style object, or undefined if not found.
 */
export function getOriginalAuthorStyle(id) {
    return originalAuthorStyles.find(s => s.id === id);
}

// ============================================================================
// CONNECTION PROFILES
// ============================================================================

/**
 * Get connection profiles from Connection Manager extension
 * @returns {Array<Object>} Array of connection profiles with id and name
 */
export function getConnectionProfiles() {
    const context = getContext();

    // Check if Connection Manager extension is disabled
    if (context?.extensionSettings?.disabledExtensions?.includes('connection-manager')) {
        return [];
    }

    try {
        // Get profiles from extension settings
        const profiles = extension_settings?.connectionManager?.profiles || [];
        return profiles;
    } catch (error) {
        console.warn('[Story Mode] Error getting connection profiles:', error);
        return [];
    }
}

// ============================================================================
// MIGRATION
// ============================================================================

/**
 * Migrate story types and author styles from old extension_settings storage to localForage.
 * This handles the transition from the old storage format.
 *
 * @async
 */
export async function migrateFromExtensionSettings() {
    // Migrate story types
    if (extension_settings[MODULE_NAME].storyTypes && extension_settings[MODULE_NAME].storyTypes.length > 0) {
        extension_settings[MODULE_NAME].storyTypes.forEach(customType => {
            const existing = storyTypes.findIndex(t => t.id === customType.id);
            if (existing >= 0) {
                storyTypes[existing] = customType;
            } else {
                storyTypes.push(customType);
            }
        });
        // Save to localForage and clear from extension_settings
        await saveStoryTypesToStorage();
        extension_settings[MODULE_NAME].storyTypes = [];
        saveSettingsDebounced();
    }

    // Migrate author styles
    if (extension_settings[MODULE_NAME].authorStyles && extension_settings[MODULE_NAME].authorStyles.length > 0) {
        extension_settings[MODULE_NAME].authorStyles.forEach(customStyle => {
            const existing = authorStyles.findIndex(s => s.id === customStyle.id);
            if (existing >= 0) {
                authorStyles[existing] = customStyle;
            } else {
                authorStyles.push(customStyle);
            }
        });
        // Save to localForage and clear from extension_settings
        await saveAuthorStylesToStorage();
        extension_settings[MODULE_NAME].authorStyles = [];
        saveSettingsDebounced();
    }
}
