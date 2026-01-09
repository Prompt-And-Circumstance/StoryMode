/**
 * Story Blueprint Module for Story Mode Extension
 *
 * Provides LLM-generated story structure with scenes, arcs, and resolutions.
 *
 * Architecture:
 * - Rounds/Steps: Individual turns starting with user message (already in StoryMode)
 * - Phases: Setup, Confrontation, Resolution (already in StoryMode)
 * - Scenes: Collections of rounds within a phase (NEW - this module)
 */

// Get the base URL of this extension for loading data files
const extensionBaseUrl = new URL('.', import.meta.url).href;

import { extension_settings, getContext } from '/scripts/extensions.js';
import { saveSettingsDebounced, eventSource, event_types, saveMetadata, generateRaw, online_status, main_api, getRequestHeaders } from '/script.js';
import { power_user } from '/scripts/power-user.js';
import { Popup, POPUP_TYPE, callGenericPopup, POPUP_RESULT } from '/scripts/popup.js';
import { getTokenCountAsync } from '/scripts/tokenizers.js';
import { ConnectionManagerRequestService } from '/scripts/extensions/shared.js';
import { loadStoryTypes, loadAuthorStyles } from './state-manager.js';

// ============================================================================
// UUID POLYFILL (for older browsers)
// ============================================================================

// Ensure crypto.randomUUID() is available (Chrome 92+, Safari 15.4+, Firefox 95+)
if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'undefined') {
    crypto.randomUUID = () => '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
        (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
    );
    console.log('[Story Mode Blueprint] UUID polyfill installed');
}

// Module-level data storage for story types and author styles
let storyTypes = [];
let authorStyles = [];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get connection profiles from Connection Manager extension
 * @returns {Array<Object>} Array of connection profiles with id and name
 */
function getConnectionProfiles() {
    const context = getContext();

    // Check if Connection Manager extension is disabled
    if (context?.extensionSettings?.disabledExtensions?.includes('connection-manager')) {
        console.log('[Story Mode Blueprint] Connection Manager is disabled');
        return [];
    }

    try {
        // Get profiles from extension settings
        const profiles = extension_settings?.connectionManager?.profiles || [];
        return profiles;
    } catch (error) {
        console.warn('[Story Mode Blueprint] Error getting connection profiles:', error);
        return [];
    }
}

/**
 * Generate a unique blueprint identifier using UUID v4
 * @returns {string} A UUID v4 identifier (RFC 4122 format)
 */
export function generateBlueprintId() {
    return crypto.randomUUID();
}

/**
 * Validate that a string is a valid UUID v4
 * @param {string} id - The ID to validate
 * @returns {boolean} True if valid UUID v4 format
 */
export function isValidBlueprintId(id) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

// ============================================================================
// MODULE CONSTANTS
// ============================================================================

export const MODULE_NAME = 'story_mode';

/**
 * Metaphor levels for genre interpretation (literal to symbolic)
 */
export const METAPHOR_LEVELS = {
    LITERAL: 'literal',       // Genre elements are MANDATORY and CONCRETE
    GROUNDED: 'grounded',     // Genre elements exist but are subtle/ambiguous
    MIXED: 'mixed',           // Literal AND metaphorical genre elements
    SYMBOLIC: 'symbolic',     // Social/emotional "monsters" in genre structure
};

/**
 * Story length presets mapping to message targets
 */
export const LENGTH_PRESETS = {
    SHORT: { label: 'Short (~10 messages)', target: 10, sceneCount: '5-7' },
    MEDIUM: { label: 'Medium (~30 messages)', target: 30, sceneCount: '8-12' },
    LONG: { label: 'Long (~60 messages)', target: 60, sceneCount: '12-20' },
};

/**
 * Default master prompt template for blueprint generation
 * This will be loaded from blueprint-master-prompt.txt on init
 */
let DEFAULT_MASTER_PROMPT = '';

/**
 * Default scene summary prompt template
 */
const DEFAULT_SCENE_SUMMARY_PROMPT = `**Story Context:**
{{CONTEXT}}

**Scene Messages:**
{{MESSAGES}}

**Summary Requirements:**
{{REQUIREMENTS}}

Summary:`;

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * @typedef {Object} Blueprint
 * @property {string} blueprint_id - Unique identifier (UUID v4, RFC 4122 format)
 * @property {string} story_type_id - Story type identifier
 * @property {string} story_type_name - Human-readable story type name
 * @property {string} core_premise - The central concept or hook of the story
 * @property {Object} setting - Story setting details
 * @property {string} setting.location - Where the story takes place
 * @property {string} setting.time_period - When the story takes place
 * @property {string} setting.atmosphere - Mood and feeling of the setting
 * @property {Object} protagonist_group - Main character group details
 * @property {string} protagonist_group.description - Description of the group
 * @property {string} protagonist_group.shared_goal - What the group wants to achieve
 * @property {string} protagonist_group.group_dynamic - How the group interacts
 * @property {Object} antagonistic_forces - Opposition details
 * @property {string} antagonistic_forces.description - What opposes the protagonists
 * @property {string} antagonistic_forces.nature - Type of opposition
 * @property {string} antagonistic_forces.motivation - Why the opposition acts
 * @property {Array<string>} antagonistic_forces.manifestations - How the opposition appears
 * @property {Object} arc_structure - Story arc structure
 * @property {string} arc_structure.opening_hook - How the story begins
 * @property {string} arc_structure.escalation_pattern - How tension builds
 * @property {string} arc_structure.climax_nature - What the climax entails
 * @property {string} arc_structure.resolution_style - How the story concludes
 * @property {number} [arc_structure.total_messages_target] - Target round count (optional)
 * @property {Array<CharacterArc>} character_arcs - Character development arcs
 * @property {Array<Scene>} scene_plan - Scenes that make up the story
 * @property {Array<Resolution>} possible_resolutions - Potential endings
 * @property {Object} tone_and_style - Narrative style guidance
 * @property {string} tone_and_style.primary_tone - Overall mood
 * @property {string} tone_and_style.narrative_voice - Perspective and voice
 * @property {string} tone_and_style.pacing - Story rhythm
 * @property {Array<string>} tone_and_style.key_stylistic_elements - Writing techniques
 * @property {Object} content_boundaries - Content restrictions
 * @property {string} content_boundaries.violence_level - Amount of violence
 * @property {string} content_boundaries.romance_level - Amount of romance
 * @property {string} [content_boundaries.other_content_notes] - Other content notes (optional)
 * @property {Object} genre_realism_notes - Genre interpretation settings
 * @property {string} genre_realism_notes.metaphor_level_used - Literal/grounded/mixed/symbolic
 * @property {string} genre_realism_notes.implementation_notes - How to interpret the genre
 * @property {string} [author_style] - Author style ID (optional, imported from settings)
 * @property {number} [total_messages_target] - Legacy field for arc length (optional)
 * @property {string} [opening_message] - Pre-generated opening message (optional)
 */

/**
 * @typedef {Object} CharacterArc
 * @property {string} character_name - Name of the character
 * @property {string} initial_state - Character's starting point
 * @property {Array<string>} key_turning_points - Major character changes
 * @property {string} final_state - Character's ending point
 * @property {string} emotional_trajectory - Emotional journey description
 */

/**
 * @typedef {Object} Scene
 * @property {number} index - Scene number (0-based)
 * @property {string} title - Scene title
 * @property {string} phase - Setup/Confrontation/Resolution
 * @property {string} purpose - Why this scene exists
 * @property {string} situation - What's happening in the scene
 * @property {Array<string>} key_events_if_unchanged - Default plot points
 * @property {Array<string>} choice_points - Where player agency matters
 * @property {Array<string>} character_focus - Which characters are highlighted
 * @property {Array<string>} hooks_for_future - Setup for later scenes
 */

/**
 * @typedef {Object} Resolution
 * @property {string} title - Resolution name
 * @property {string} description - What happens in this ending
 * @property {Array<string>} character_outcomes - What happens to each character
 * @property {string} thematic_resolution - How themes are resolved
 */

/**
 * @typedef {Object} BlueprintState
 * @property {Blueprint} [blueprint] - The blueprint object (contains blueprint_id)
 * @property {number} currentSceneIndex - Current scene index (for manual mode)
 * @property {string} sceneMode - 'auto' or 'manual' scene progression
 * @property {boolean} useBlueprint - Whether blueprint guidance is active
 */

// ============================================================================
// SETTINGS MANAGEMENT
// ============================================================================

/**
 * Get default cover generation settings
 * @returns {Object} Default cover generation settings
 */
function getDefaultCoverGenerationSettings() {
    return {
        enabled: true,
        autoGenerate: false,
        addToGallery: true,
        maxGallerySize: 10,
        defaultQuality: 'high',
        defaultAspectRatio: '2:3',
        defaultStyle: 'auto',
        showPromptOnGenerate: true,
        confirmDeleteCover: true,
        keyboardNavigation: true,
        showGalleryCounter: true,
        autoSelectLatest: true,
    };
}

/**
 * Initialize blueprint settings in extension_settings
 * Called during StoryMode initialization
 */
export async function initBlueprintSettings() {
    // Verify critical imports
    console.log('[Story Mode Blueprint] Verifying imports...');
    console.log('[Story Mode Blueprint] - generateRaw:', typeof generateRaw, generateRaw ? '✓' : '✗ MISSING');
    console.log('[Story Mode Blueprint] - online_status:', typeof online_status, online_status);
    console.log('[Story Mode Blueprint] - main_api:', typeof main_api, main_api);
    console.log('[Story Mode Blueprint] - eventSource:', typeof eventSource, eventSource ? '✓' : '✗ MISSING');
    console.log('[Story Mode Blueprint] - getContext:', typeof getContext, getContext ? '✓' : '✗ MISSING');

    const settings = extension_settings[MODULE_NAME];

    // Initialize blueprintSettings if not present
    if (!settings.blueprintSettings) {
        settings.blueprintSettings = {
            enabled: false,
            useScenePrompts: true,
            masterPrompt: null,
            generationApi: null,
            summarizationEnabled: false,
            summarizeAfterScenes: 2,
            summaryMaxTokens: 500,
            includeSummariesInPrompt: true,
            summaryStyle: 'narrative',
            sceneSummaryPrompt: null,
            coverGeneration: getDefaultCoverGenerationSettings(),
        };
        console.log('[Story Mode Blueprint] Initialized settings');
    } else {
        // Add new settings to existing configurations
        if (settings.blueprintSettings.generationApi === undefined) {
            settings.blueprintSettings.generationApi = null;
        }
        if (settings.blueprintSettings.summarizationEnabled === undefined) {
            settings.blueprintSettings.summarizationEnabled = false;
        }
        if (settings.blueprintSettings.summarizeAfterScenes === undefined) {
            settings.blueprintSettings.summarizeAfterScenes = 2;
        }
        if (settings.blueprintSettings.summaryMaxTokens === undefined) {
            settings.blueprintSettings.summaryMaxTokens = 500;
        }
        if (settings.blueprintSettings.includeSummariesInPrompt === undefined) {
            settings.blueprintSettings.includeSummariesInPrompt = true;
        }
        if (settings.blueprintSettings.summaryStyle === undefined) {
            settings.blueprintSettings.summaryStyle = 'narrative';
        }
        if (settings.blueprintSettings.sceneSummaryPrompt === undefined) {
            settings.blueprintSettings.sceneSummaryPrompt = null;
        }
        if (!settings.blueprintSettings.coverGeneration) {
            settings.blueprintSettings.coverGeneration = getDefaultCoverGenerationSettings();
        }
    }

    // Load default master prompt from file
    if (!DEFAULT_MASTER_PROMPT) {
        await loadDefaultMasterPrompt();
    }

    // Load story types and author styles from data files as fallback
    // In normal operation, these will be set by index.js from localForage
    await loadStoryTypesFromFile();
    await loadAuthorStylesFromFile();
}

/**
 * Load story types from data file (fallback if not set by index.js)
 */
async function loadStoryTypesFromFile() {
    try {
        const response = await fetch(new URL('../data/story_types.json', import.meta.url));
        if (response.ok) {
            storyTypes = await response.json();
            console.log('[Story Mode Blueprint] Loaded story types from file:', storyTypes.length);
        }
    } catch (error) {
        console.warn('[Story Mode Blueprint] Could not load story types from file:', error);
    }
}

/**
 * Load author styles from data file (fallback if not set by index.js)
 */
async function loadAuthorStylesFromFile() {
    try {
        const response = await fetch(new URL('../data/author_styles.json', import.meta.url));
        if (response.ok) {
            authorStyles = await response.json();
            console.log('[Story Mode Blueprint] Loaded author styles from file:', authorStyles.length);
        }
    } catch (error) {
        console.warn('[Story Mode Blueprint] Could not load author styles from file:', error);
    }
}

/**
 * Set story types array (called from index.js)
 * @param {Array} types - Story types array
 */
export function setStoryTypes(types) {
    storyTypes = types;
}

/**
 * Set author styles array (called from index.js)
 * @param {Array} styles - Author styles array
 */
export function setAuthorStyles(styles) {
    authorStyles = styles;
}

/**
 * Get a story type by ID
 * @param {string} id - Story type ID
 * @returns {Object|undefined} Story type object or undefined
 */
export function getStoryTypeById(id) {
    return storyTypes.find(t => t.id === id);
}

/**
 * Get an author style by ID
 * @param {string} id - Author style ID
 * @returns {Object|undefined} Author style object or undefined
 */
export function getAuthorStyleById(id) {
    return authorStyles.find(s => s.id === id);
}

/**
 * Load the default master prompt template from the data file
 */
async function loadDefaultMasterPrompt() {
    try {
        // The module is in lib/, so we need to go up one level to reach data/
        const templateUrl = new URL('../data/blueprint-master-prompt.txt', import.meta.url).href;
        console.log('[Story Mode Blueprint] Loading template from:', templateUrl);
        const response = await fetch(templateUrl);
        if (response.ok) {
            DEFAULT_MASTER_PROMPT = await response.text();
            console.log('[Story Mode Blueprint] Successfully loaded default master prompt template, length:', DEFAULT_MASTER_PROMPT.length);
            console.log('[Story Mode Blueprint] Template starts with:', DEFAULT_MASTER_PROMPT.substring(0, 100) + '...');
            console.log('[Story Mode Blueprint] Template contains STORY_TYPE_JSON:', DEFAULT_MASTER_PROMPT.includes('{{STORY_TYPE_JSON}}'));
        } else {
            console.warn('[Story Mode Blueprint] Could not load master prompt template, status:', response.status, response.statusText);
            DEFAULT_MASTER_PROMPT = getFallbackMasterPrompt();
        }
    } catch (error) {
        console.error('[Story Mode Blueprint] Error loading master prompt:', error);
        DEFAULT_MASTER_PROMPT = getFallbackMasterPrompt();
    }
}

/**
 * Fallback master prompt in case file load fails
 * This is a minimal version for graceful degradation
 */
function getFallbackMasterPrompt() {
    return `You are an expert story designer creating a STORY_BLUEPRINT.

Generate a valid JSON object with this structure:
{
    "story_type_id": "{{STORY_TYPE_ID}}",
    "story_type_name": "{{STORY_TYPE_NAME}}",
    "core_premise": "1-2 sentence summary",
    "setting": { "location": "", "time_period": "", "atmosphere": "" },
    "protagonist_group": { "description": "", "shared_goal": "", "group_dynamic": "" },
    "antagonistic_forces": { "description": "", "nature": "", "motivation": "", "manifestations": [] },
    "arc_structure": { "opening_hook": "", "escalation_pattern": "", "climax_nature": "", "resolution_style": "" },
    "character_arcs": [],
    "scene_plan": [],
    "possible_resolutions": [],
    "tone_and_style": { "primary_tone": "", "narrative_voice": "", "pacing": "", "key_stylistic_elements": [] },
    "content_boundaries": { "violence_level": "", "romance_level": "", "other_content_notes": "" },
    "genre_realism_notes": { "metaphor_level_used": "{{METAPHOR_LEVEL}}", "implementation_notes": "" }
}

Metaphor level: {{METAPHOR_LEVEL}}
Author style: {{AUTHOR_STYLE}}
Characters: {{CHARACTER_DATA}}
Scenario: {{USER_SCENARIO}}
Target messages: {{TOTAL_MESSAGES_TARGET}}

Output ONLY the JSON object. No preamble.`;
}

// ============================================================================
// BLUEPRINT STATE MANAGEMENT
// ============================================================================

/**
 * Get the blueprint state for the current chat
 * @returns {Object} Blueprint state with defaults
 */
export function getBlueprintState() {
    const { chatMetadata } = getContext();

    if (!chatMetadata[MODULE_NAME]) {
        chatMetadata[MODULE_NAME] = {};
    }

    // Ensure blueprint-specific fields exist
    if (!chatMetadata[MODULE_NAME].blueprintState) {
        chatMetadata[MODULE_NAME].blueprintState = {
            blueprint: undefined,
            currentSceneIndex: 0,
            sceneMode: 'auto',
            useBlueprint: false,
            sceneSummaries: {},
            sceneMessageMap: {},
            pendingSummaries: [],
            beatProgress: {
                completedBeats: [],
                currentBeatFocus: null,
                lastUpdated: null,
            },
        };
    }

    // Initialize beatProgress if missing (backward compatibility)
    chatMetadata[MODULE_NAME].blueprintState.beatProgress ||= {
        completedBeats: [],
        currentBeatFocus: null,
        lastUpdated: null,
    };

    return chatMetadata[MODULE_NAME].blueprintState;
}

/**
 * Save the blueprint state for the current chat
 * @param {Object} blueprintState - The blueprint state to save
 */
export async function saveBlueprintState(blueprintState) {
    const { chatMetadata } = getContext();

    if (!chatMetadata[MODULE_NAME]) {
        chatMetadata[MODULE_NAME] = {};
    }

    chatMetadata[MODULE_NAME].blueprintState = blueprintState;

    console.log('[Story Mode Blueprint] Saving blueprint state:', blueprintState);

    // Persist to the server/chat file
    await saveMetadata();

    // Notify that metadata was updated
    eventSource.emit(event_types.CHAT_METADATA_UPDATED);
}


// ============================================================================
// BEAT PROGRESS TRACKING
// ============================================================================

/**
 * Mark a beat as completed
 * @param {number} sceneIndex - Scene index
 * @param {number} beatIndex - Beat index within scene
 * @returns {boolean} True if beat was newly marked completed, false if already completed
 */
export async function markBeatCompleted(sceneIndex, beatIndex) {
    const blueprintState = getBlueprintState();
    const beatId = `scene_${sceneIndex}_beat_${beatIndex}`;

    if (!blueprintState.beatProgress.completedBeats.includes(beatId)) {
        blueprintState.beatProgress.completedBeats.push(beatId);
        blueprintState.beatProgress.lastUpdated = new Date().toISOString();
        await saveBlueprintState(blueprintState);
        console.log(`[Story Mode Blueprint] Beat completed: ${beatId}`);
        return true;
    }

    return false; // Already completed
}

/**
 * Check if a beat has been completed
 * @param {number} sceneIndex - Scene index
 * @param {number} beatIndex - Beat index within scene
 * @returns {boolean} True if beat is completed
 */
export function isBeatCompleted(sceneIndex, beatIndex) {
    const blueprintState = getBlueprintState();
    return blueprintState.beatProgress.completedBeats.includes(`scene_${sceneIndex}_beat_${beatIndex}`);
}

/**
 * Get completed beats for a specific scene
 * @param {number} sceneIndex - Scene index
 * @returns {Array<number>} Array of completed beat indices for this scene
 */
export function getCompletedBeats(sceneIndex) {
    const blueprintState = getBlueprintState();
    const prefix = `scene_${sceneIndex}_beat_`;

    return blueprintState.beatProgress.completedBeats
        .filter(id => id.startsWith(prefix))
        .map(id => parseInt(id.split('_')[3]));
}

/**
 * Reset beat progress for a specific scene or all scenes
 * @param {number|null} sceneIndex - Scene index to reset, or null for all scenes
 */
export async function resetBeatProgress(sceneIndex = null) {
    const blueprintState = getBlueprintState();

    if (sceneIndex === null) {
        // Reset all beats
        blueprintState.beatProgress.completedBeats = [];
        blueprintState.beatProgress.currentBeatFocus = null;
        console.log('[Story Mode Blueprint] All beat progress reset');
    } else {
        // Reset beats for specific scene
        const prefix = `scene_${sceneIndex}_beat_`;
        blueprintState.beatProgress.completedBeats = blueprintState.beatProgress.completedBeats.filter(
            id => !id.startsWith(prefix)
        );
        console.log(`[Story Mode Blueprint] Beat progress reset for scene ${sceneIndex}`);
    }

    blueprintState.beatProgress.lastUpdated = new Date().toISOString();
    await saveBlueprintState(blueprintState);
}

/**
 * Set the current beat focus
 * @param {number|null} sceneIndex - Scene index
 * @param {number|null} beatIndex - Beat index (null to clear focus)
 */
export async function setCurrentBeatFocus(sceneIndex, beatIndex) {
    const blueprintState = getBlueprintState();
    blueprintState.beatProgress.currentBeatFocus = (sceneIndex === null || beatIndex === null)
        ? null
        : `scene_${sceneIndex}_beat_${beatIndex}`;
    await saveBlueprintState(blueprintState);
}


// ============================================================================
// SCENE SUMMARIZATION
// ============================================================================

/**
 * Track a message for scene summarization
 * @param {number} messageId - The message ID to track
 * @param {Object} blueprintState - The blueprint state
 * @param {number} currentStep - Current round/step
 * @param {number} arcLength - Total arc length
 */
export function trackMessageForScene(messageId, blueprintState, currentStep, arcLength) {
    if (!blueprintState?.blueprint || !blueprintState.useBlueprint) {
        return;
    }

    const scene = getCurrentScene(
        blueprintState.blueprint,
        currentStep,
        arcLength,
        blueprintState.sceneMode || 'auto',
        blueprintState.currentSceneIndex || 0
    );

    if (!scene) return;

    const { index: sceneIndex } = scene;

    // Initialize sceneMessageMap structure
    blueprintState.sceneMessageMap ??= {};
    blueprintState.sceneMessageMap[sceneIndex] ??= [];

    // Add message to scene's list if not already tracked
    if (!blueprintState.sceneMessageMap[sceneIndex].includes(messageId)) {
        blueprintState.sceneMessageMap[sceneIndex].push(messageId);
    }
}

/**
 * Check if a scene should be summarized
 * @param {Object} blueprintState - The blueprint state
 * @param {number} sceneIndex - The scene index to check
 * @param {Object} settings - Extension settings
 * @returns {boolean} True if scene should be summarized
 */
function shouldSummarizeScene(blueprintState, sceneIndex, settings) {
    if (!settings.blueprintSettings?.summarizationEnabled) {
        return false;
    }

    if (blueprintState.sceneSummaries?.[sceneIndex]) {
        return false;
    }

    const currentSceneIndex = blueprintState.currentSceneIndex || 0;
    if (sceneIndex >= currentSceneIndex) {
        return false;
    }

    const scenesBehind = currentSceneIndex - sceneIndex;
    const threshold = settings.blueprintSettings?.summarizeAfterScenes || 2;
    if (scenesBehind < threshold) {
        return false;
    }

    const messageIds = blueprintState.sceneMessageMap?.[sceneIndex];
    return messageIds?.length > 0;
}

/**
 * Trigger summarization if conditions are met
 * @param {number} sceneIndex - The scene index to potentially summarize
 * @param {Object} blueprintState - The blueprint state
 * @param {Object} settings - Extension settings
 */
export function triggerSummarizationIfNeeded(sceneIndex, blueprintState, settings) {
    if (shouldSummarizeScene(blueprintState, sceneIndex, settings)) {
        // Fire-and-forget async summarization
        summarizeSceneAsync(sceneIndex, blueprintState, settings).catch(error => {
            console.error(`[Story Mode] Scene ${sceneIndex} summarization failed:`, error);
        });
    }
}

/**
 * Asynchronously summarize a scene (fire-and-forget wrapper)
 * @param {number} sceneIndex - The scene index to summarize
 * @param {Object} blueprintState - The blueprint state
 * @param {Object} settings - Extension settings
 */
async function summarizeSceneAsync(sceneIndex, blueprintState, settings) {
    try {
        await summarizeSceneInternal(sceneIndex, blueprintState, settings);
    } catch (error) {
        console.error(`[Story Mode] Scene ${sceneIndex} summarization error:`, error);

        // Add to pending for retry
        blueprintState.pendingSummaries ??= [];
        if (!blueprintState.pendingSummaries.includes(sceneIndex)) {
            blueprintState.pendingSummaries.push(sceneIndex);
        }

        // Show user notification
        toastr.warning(
            `Scene ${sceneIndex + 1} summarization failed. Will retry later.`,
            'Story Mode',
            { timeOut: 3000 }
        );
    }
}

/**
 * Internal implementation of scene summarization
 * @param {number} sceneIndex - The scene index to summarize
 * @param {Object} blueprintState - The blueprint state
 * @param {Object} settings - Extension settings
 */
async function summarizeSceneInternal(sceneIndex, blueprintState, settings) {
    const messageIds = blueprintState.sceneMessageMap?.[sceneIndex] || [];
    if (messageIds.length === 0) {
        console.warn(`[Story Mode] No messages to summarize for Scene ${sceneIndex}`);
        return;
    }

    const { chat } = getContext();
    const messages = messageIds.map(id => chat[id]).filter(Boolean);

    if (messages.length === 0) {
        console.warn(`[Story Mode] No valid messages found for Scene ${sceneIndex}`);
        return;
    }

    const prompt = buildSummarizationPrompt(messages, blueprintState, sceneIndex, settings);
    const summaryText = await generateSummaryWithPreset({
        prompt,
        systemPrompt: 'You are a skilled fiction editor. Summarize the provided story scene concisely while preserving narrative continuity.',
        responseLength: settings.blueprintSettings?.summaryMaxTokens || 500,
    });

    if (!summaryText?.trim()) {
        throw new Error('Empty summary generated');
    }

    // Store summary
    blueprintState.sceneSummaries ??= {};
    const { blueprint } = blueprintState;
    const sceneTitle = blueprint.scene_plan?.[sceneIndex]?.title || `Scene ${sceneIndex + 1}`;

    blueprintState.sceneSummaries[sceneIndex] = {
        sceneIndex,
        summary: summaryText.trim(),
        timestamp: new Date().toISOString(),
        messageIds,
        sceneTitle,
    };

    await saveBlueprintState(blueprintState);

    if (typeof updateStoryPrompt === 'function') {
        updateStoryPrompt();
    }

    console.log(`[Story Mode] Scene ${sceneIndex + 1} summarized successfully`);
}

/**
 * Generate a summary using the specified API profile
 * @param {Object} options - Options with prompt, systemPrompt, responseLength
 * @returns {Promise<string>} Generated summary text
 */
async function generateSummaryWithPreset(options) {
    const settings = extension_settings[MODULE_NAME];

    // Use summaryApi (same as end-of-arc summary) or fall back to main API
    const selectedProfileId = settings.summaryApi || null;

    if (!selectedProfileId) {
        return await generateRaw(options);
    }

    const messages = [];
    if (options.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: options.prompt });

    try {
        const result = await ConnectionManagerRequestService.sendRequest(
            selectedProfileId,
            messages,
            options.responseLength || 0,
            { stream: false, extractData: true }
        );

        return result.text || result.content || '';
    } catch (error) {
        console.error('[Story Mode] Summary generation error:', error);
        throw error;
    }
}

/**
 * Build a summarization prompt for a scene
 * @param {Array} messages - Array of message objects
 * @param {Object} blueprintState - The blueprint state
 * @param {number} sceneIndex - The scene index
 * @param {Object} settings - Extension settings
 * @returns {string} The summarization prompt
 */
function buildSummarizationPrompt(messages, blueprintState, sceneIndex, settings) {
    const { blueprint } = blueprintState;
    const scene = blueprint.scene_plan?.[sceneIndex];
    const summaryStyle = settings.blueprintSettings?.summaryStyle || 'narrative';

    // Build context lines
    const contextLines = [
        `- Core premise: ${blueprint.core_premise}`,
        `- Scene: ${scene?.title || `Scene ${sceneIndex + 1}`}`,
        `- Phase: ${scene?.phase || 'Unknown'}`,
    ];

    if (scene?.purpose) {
        contextLines.push(`- Purpose: ${scene.purpose}`);
    }

    const context = contextLines.join('\n');

    // Build messages content
    const messagesContent = messages.map(m => {
        const speaker = m.is_user ? 'User' : (m.name || 'Character');
        return `${speaker}: ${m.mes}`;
    }).join('\n\n');

    // Build requirements based on style
    const requirementsMap = {
        narrative: `- Provide a concise narrative summary (2-4 sentences)
- Capture key plot points, character actions, and emotional beats
- Maintain the story's tone and style
- Focus on what happened, not dialogue details
- Output ONLY the summary text, no meta-commentary`,
        bullet: `- Use bullet points for key events
- Each bullet should be 1 sentence
- Focus on actionable plot points
- Output ONLY the bullet list, no intro/outro`,
        both: `- Provide a brief narrative summary (1-2 sentences)
- Follow with bullet points for key events
- Each bullet should be 1 sentence
- Output ONLY the summary and bullets, no intro/outro`,
    };

    const requirements = requirementsMap[summaryStyle];

    // Get the prompt template and replace variables
    let promptTemplate = getEffectiveSceneSummaryPrompt();
    promptTemplate = promptTemplate.replaceAll('{{CONTEXT}}', context);
    promptTemplate = promptTemplate.replaceAll('{{MESSAGES}}', messagesContent);
    promptTemplate = promptTemplate.replaceAll('{{REQUIREMENTS}}', requirements);

    return promptTemplate;
}

/**
 * Process pending summaries (retry failed summarizations)
 * @param {Object} blueprintState - The blueprint state
 * @param {Object} settings - Extension settings
 */
export async function processPendingSummaries(blueprintState, settings) {
    if (!blueprintState.pendingSummaries?.length) {
        return;
    }

    const sceneIndex = blueprintState.pendingSummaries[0];

    if (shouldSummarizeScene(blueprintState, sceneIndex, settings)) {
        await summarizeSceneAsync(sceneIndex, blueprintState, settings);
    }

    blueprintState.pendingSummaries.shift();
    await saveBlueprintState(blueprintState);
}

/**
 * Get nested field value from blueprint using dot notation
 * @param {Object} blueprint - The blueprint object
 * @param {string} path - Dot-notation path (e.g., "setting.location")
 * @returns {*} The field value
 */
function getNestedFieldValue(blueprint, path) {
    return path.split('.').reduce((obj, key) => obj?.[key], blueprint);
}

/**
 * Get the blueprint title with fallback if not present
 * @param {Object} blueprint - The blueprint object
 * @param {Array} characters - Array of character objects with name property
 * @returns {string} The blueprint title or a fallback string
 */
export function getBlueprintTitle(blueprint, characters = []) {
    // If blueprint has a title, return it
    if (blueprint && blueprint.title) {
        return blueprint.title;
    }

    // Fallback: construct title from story type and character names
    const storyType = blueprint?.story_type_name || blueprint?.story_type_id || 'Story';

    if (characters.length > 0) {
        const charNames = characters.slice(0, 2).map(c => c.name || c).join(', ');
        return `${storyType} - ${charNames}`;
    }

    return storyType;
}

/**
 * Sync blueprint settings to chat state
 * This ensures Story Mode settings match the blueprint's configuration
 * @param {Object} blueprint - The blueprint object
 * @param {boolean} showConfirm - Whether to show confirmation dialog (default: true)
 * @returns {Object} { confirmed: boolean, changes: string[] }
 */
export async function syncBlueprintSettings(blueprint, showConfirm = true) {
    const { chatMetadata } = getContext();

    if (!chatMetadata[MODULE_NAME]) {
        chatMetadata[MODULE_NAME] = {};
    }

    const changes = [];
    const detailChanges = [];

    // Sync story type
    if (blueprint.story_type_id) {
        const oldStoryType = chatMetadata[MODULE_NAME].selectedStoryType;
        chatMetadata[MODULE_NAME].selectedStoryType = blueprint.story_type_id;
        if (oldStoryType !== blueprint.story_type_id) {
            changes.push('story type');
            detailChanges.push(`Story Type: ${oldStoryType || 'None'} → ${blueprint.story_type_id}`);
        }
    }

    // Sync author style (check if the field exists on the blueprint, not just truthy)
    // This handles undefined/empty values which represent "None" or "no author style"
    if (Object.prototype.hasOwnProperty.call(blueprint, 'author_style')) {
        const oldAuthorStyle = chatMetadata[MODULE_NAME].selectedAuthorStyle;
        chatMetadata[MODULE_NAME].selectedAuthorStyle = blueprint.author_style || '';
        // Always track if the field exists, even if value is undefined/empty
        if (oldAuthorStyle !== (blueprint.author_style || '')) {
            changes.push('author style');
            const newStyleDisplay = blueprint.author_style || 'None';
            const oldStyleDisplay = oldAuthorStyle || 'None';
            detailChanges.push(`Author Style: ${oldStyleDisplay} → ${newStyleDisplay}`);
        }
    }

    // Sync arc length
    const targetMessages = blueprint.arc_structure?.total_messages_target ||
                           blueprint.total_messages_target ||
                           30;
    const oldArcLength = chatMetadata[MODULE_NAME].arcLength || 30;
    chatMetadata[MODULE_NAME].arcLength = targetMessages;
    if (oldArcLength !== targetMessages) {
        changes.push('arc length');
        detailChanges.push(`Arc Length: ${oldArcLength} → ${targetMessages} rounds`);
    }

    // Reset current step to 0
    const oldStep = chatMetadata[MODULE_NAME].currentStep || 0;
    chatMetadata[MODULE_NAME].currentStep = 0;
    if (oldStep !== 0) {
        changes.push('current step');
        detailChanges.push(`Current Step: ${oldStep} → 0 (reset)`);
    }

    // Reset arc completion flags
    const oldFlags = [];
    if (chatMetadata[MODULE_NAME].arcStarted) {
        chatMetadata[MODULE_NAME].arcStarted = false;
        oldFlags.push('arc started');
    }
    if (chatMetadata[MODULE_NAME].epilogueShown) {
        chatMetadata[MODULE_NAME].epilogueShown = false;
        oldFlags.push('epilogue shown');
    }
    if (chatMetadata[MODULE_NAME].summaryShown) {
        chatMetadata[MODULE_NAME].summaryShown = false;
        oldFlags.push('summary shown');
    }
    if (chatMetadata[MODULE_NAME].endNoticeShown) {
        chatMetadata[MODULE_NAME].endNoticeShown = false;
        oldFlags.push('end notice shown');
    }

    if (oldFlags.length > 0) {
        changes.push('completion flags');
        detailChanges.push(`Completion Flags Reset: ${oldFlags.join(', ')}`);
    }

    // If showConfirm is true and there are changes, show confirmation dialog
    if (showConfirm && changes.length > 0) {
        console.log('[Story Mode Blueprint] syncBlueprintSettings - Showing confirmation dialog for changes:', changes);

        const confirmHtml = `
            <h3>Sync Story Mode Settings to Blueprint</h3>
            <p>This blueprint has different settings than your current Story Mode configuration.</p>
            <p><strong>The following will be updated:</strong></p>
            <ul style="text-align: left; margin: 10px 0;">
                ${detailChanges.map(c => `<li>${c}</li>`).join('')}
            </ul>
            <p>Do you want to apply these changes?</p>
        `;

        const result = await callGenericPopup(
            confirmHtml,
            POPUP_TYPE.CONFIRM
        );

        console.log('[Story Mode Blueprint] syncBlueprintSettings - Popup result:', result, 'POPUP_RESULT.AFFIRMATIVE:', POPUP_RESULT.AFFIRMATIVE);

        if (result !== POPUP_RESULT.AFFIRMATIVE) {
            // User cancelled - rollback changes would be complex, so just log it
            console.log('[Story Mode Blueprint] User cancelled sync, but changes were already applied to local state');
            return { confirmed: false, changes };
        }
    } else {
        console.log('[Story Mode Blueprint] syncBlueprintSettings - Skipping confirmation dialog (showConfirm=' + showConfirm + ', changes.length=' + changes.length + ')');
    }

    console.log('[Story Mode Blueprint] syncBlueprintSettings - Saving metadata...');

    // Persist to the server/chat file
    await saveMetadata();

    console.log('[Story Mode Blueprint] syncBlueprintSettings - Metadata saved successfully');

    // Notify that metadata was updated
    eventSource.emit(event_types.CHAT_METADATA_UPDATED);

    return { confirmed: true, changes };
}

/**
 * Start a story from a blueprint - syncs settings, enables features, optionally generates opening
 *
 * This is the main entry point for the "Start Story from Blueprint" button action.
 * It performs the following:
 * 1. Validates blueprint has required data (scenes, story type)
 * 2. Warns if chat already has messages
 * 3. Syncs blueprint settings to main Story Mode settings
 * 4. Enables all relevant Story Mode features
 * 5. Returns control to caller for opening message generation and dialog close
 *
 * @param {Object} blueprint - The blueprint object to start from
 * @returns {Promise<{success: boolean, warnings?: string[], error?: string}>}
 */
export async function startStoryFromBlueprint(blueprint) {
    const warnings = [];

    // Validate blueprint has required data
    if (!blueprint.scene_plan?.length) {
        return { success: false, error: 'Blueprint has no scenes defined. Cannot start story.' };
    }
    if (!blueprint.story_type_id) {
        return { success: false, error: 'Blueprint has no story type. Cannot start story.' };
    }

    // Validate story type and author style exist
    const existingTypes = storyTypes.length ? storyTypes : await loadStoryTypes();
    if (!existingTypes.some(t => t.id === blueprint.story_type_id)) {
        warnings.push(`Story type "${blueprint.story_type_id}" not found in library. You may need to import it or select another.`);
    }

    if (blueprint.author_style) {
        const existingStyles = authorStyles.length ? authorStyles : await loadAuthorStyles();
        if (!existingStyles.some(s => s.id === blueprint.author_style)) {
            warnings.push(`Author style "${blueprint.author_style}" not found in library. It will be set to None.`);
            blueprint.author_style = '';
        }
    }

    // Check if story is already in progress
    const { chatMetadata, chat } = getContext();
    const chatState = chatMetadata[MODULE_NAME] || {};
    const currentStep = chatState.currentStep || 0;
    const messageCount = chat?.length || 0;

    if (currentStep > 0 || messageCount > 1) {
        const warnHtml = `
            <h3>⚠️ Story Already in Progress</h3>
            <p>You have ${messageCount} message(s) in this chat and are at step ${currentStep} of the story arc.</p>
            <p><strong>Starting from this blueprint will:</strong></p>
            <ul style="text-align: left; margin: 10px 0;">
                <li>Reset the story arc to step 0</li>
                <li>Clear all arc completion flags</li>
                <li>Sync settings to match this blueprint</li>
                <li>Enable Story Mode features</li>
            </ul>
            <p><strong>Existing messages will NOT be deleted.</strong></p>
            <p>Do you want to continue?</p>
        `;

        const result = await callGenericPopup(warnHtml, POPUP_TYPE.CONFIRM);
        if (result !== POPUP_RESULT.AFFIRMATIVE) {
            return { success: false, error: 'User cancelled - story already in progress' };
        }
    }

    // Sync blueprint settings
    await syncBlueprintSettings(blueprint, false);

    // Enable all Story Mode features
    if (!extension_settings[MODULE_NAME]) {
        extension_settings[MODULE_NAME] = {};
    }
    const settings = extension_settings[MODULE_NAME];
    settings.enabled = true;
    settings.storyArcEnabled = true;

    if (!settings.blueprintSettings) {
        settings.blueprintSettings = {};
    }
    settings.blueprintSettings.enabled = true;
    settings.blueprintSettings.useScenePrompts = true;

    if (blueprint.author_style) {
        settings.authorStyleEnabled = true;
    }

    saveSettingsDebounced();

    return { success: true, warnings };
}

/**
 * Get the effective master prompt (custom or default)
 * @returns {string} The master prompt template to use
 */
export function getEffectiveMasterPrompt() {
    const settings = extension_settings[MODULE_NAME];
    return settings.blueprintSettings?.masterPrompt || DEFAULT_MASTER_PROMPT;
}

/**
 * Get the effective scene summary prompt (custom or default)
 * @returns {string} The scene summary prompt template to use
 */
export function getEffectiveSceneSummaryPrompt() {
    const settings = extension_settings[MODULE_NAME];
    return settings.blueprintSettings?.sceneSummaryPrompt || DEFAULT_SCENE_SUMMARY_PROMPT;
}

// ============================================================================
// LLM BLUEPRINT GENERATION
// ============================================================================

/**
 * Build the blueprint request object from UI configuration
 * @param {Object} config - Configuration from UI
 * @returns {Object} Blueprint request object
 */
export function buildBlueprintRequest(config) {
    return {
        story_type_id: config.storyTypeId,
        author_style: config.authorStyleId || undefined,
        character_data: config.characterData,
        persona_data: config.personaData || [],
        user_scenario: config.scenario || '',
        total_messages_target: config.messageTarget || 30,
        genre_interpretation: {
            metaphor_level: config.metaphorLevel || METAPHOR_LEVELS.MIXED,
        },
    };
}

/**
 * Build metaphor level instructions based on selected level
 * @param {string} metaphorLevel - The metaphor level (literal, grounded, mixed, symbolic)
 * @returns {string} The instructions for the selected metaphor level
 */
function buildMetaphorInstructions(metaphorLevel) {
    const level = metaphorLevel.toLowerCase();

    if (level === 'literal') {
        return `**INTERPRETATION RULES:**

**Genre elements are MANDATORY and CONCRETE.**

- For "Monster of the Week" or similar story types, you MUST include actual cases/creatures/spirits/monsters.
- For other story types, genre elements must appear as real, tangible phenomena.
- Metaphor may complement, but not replace, literal genre threats.
- Example: Literal yokai appear and cause concrete supernatural problems; their appearance may also reflect emotional tensions, but the threats themselves are real.`;
    } else if (level === 'grounded') {
        return `**INTERPRETATION RULES:**

**Genre elements exist, but are SUBTLE and AMBIGUOUS.**

- Events can be interpreted as coincidence, psychology, or cultural belief.
- Structurally, events still function as "monsters/cases" but their true nature is plausibly deniable.
- Strange occurrences happen; locals attribute them to folklore, but rational explanations are possible.
- Example: Strange occurrences happen; locals attribute them to folklore, but they follow a clear monster-of-the-week pattern while remaining ambiguous.`;
    } else if (level === 'mixed') {
        return `**INTERPRETATION RULES:**

**Genre elements are BOTH literal AND strongly metaphorical.**

- Threats work as real phenomena AND as emotional/psychological symbols.
- The literal manifestation should mirror or embody the thematic/emotional content.
- Example: A spirit is genuinely real AND visibly manifests the group's unresolved feelings. The supernatural threat is concrete, but its nature and actions symbolize internal conflicts.`;
    } else if (level === 'symbolic') {
        return `**INTERPRETATION RULES:**

**You MAY replace literal genre threats with social, emotional, or situational "monsters" that fulfill the same structural role.**

- You MUST preserve STORY TYPE structure (distinct case-like episodes, escalation, resolution).
- "Monsters" represent social crises, emotional barriers, or systemic problems.
- Example (Monster of the Week): Monsters are "The Silence Between Them," "The Bureaucratic Nightmare," "A Chance Encounter That Changes Everything"—social/emotional crises, not literal creatures.`;
    }

    // Default fallback (shouldn't happen with proper validation)
    return `**INTERPRETATION RULES:**

Genre elements should be interpreted according to the story type's conventions while respecting the user's scenario and character data.`;
}

/**
 * Build the master prompt with template variable replacement
 * @param {Object} request - Blueprint request object
 * @param {Object} storyType - Story type object (with storyPrompt, phasePrompts, etc.)
 * @param {Object} authorStyle - Author style object (optional)
 * @returns {string} The complete master prompt
 */
export function buildMasterPrompt(request, storyType, authorStyle) {
    let prompt = getEffectiveMasterPrompt();

    // Debug: Check which template is being used
    const usingFallback = !DEFAULT_MASTER_PROMPT || prompt === getFallbackMasterPrompt();
    const templateLength = prompt.length;
    console.log('[Story Mode Blueprint] Template debug:', {
        usingFallback,
        templateLength,
        templateStart: prompt.substring(0, 100) + '...',
        hasStoryTypeJson: prompt.includes('{{STORY_TYPE_JSON}}'),
    });

    // Build author style section
    let authorStyleSection = '';
    if (authorStyle && authorStyle.authorPrompt) {
        // Build comprehensive author style section
        const styleParts = [`**User-specified author style:** ${authorStyle.name}`];

        // Add category if available
        if (authorStyle.category) {
            styleParts.push(`- **Category**: ${authorStyle.category}`);
        }

        // Add guidance/description
        styleParts.push(`- **Tone and voice**: ${authorStyle.authorPrompt}`);

        // Add NSFW guidance if available
        if (authorStyle.nsfwPrompt) {
            styleParts.push(`- **NSFW guidance**: ${authorStyle.nsfwPrompt}`);
        }

        // Add heat level if available
        if (authorStyle.heatLevel) {
            styleParts.push(`- **Spice level**: ${authorStyle.heatLevel}/5`);
        }

        authorStyleSection = `
### AUTHOR STYLE GUIDANCE

${styleParts.join('\n')}

You MUST adopt this style's tone, voice, structure, and characteristic narrative devices throughout the blueprint.

Apply the style to:
- Descriptions of scenes, settings, and situations.
- Antagonistic forces (how they behave, what they represent).
- Character arc language and emotional beats.
- Choice points and decision descriptions.
- Tone_and_style section itself.

**Note:** Style should enhance but never override the user's scenario, character data, or genre interpretation level.
`;
    } else {
        authorStyleSection = `
### NO AUTHOR STYLE SPECIFIED

No explicit author style has been requested. Generate the blueprint using the STORY TYPE's default tone and narrative conventions. You may draw on common storytelling best practices and the emotional/thematic underpinnings of the story type itself.
`;
    }

    // Build persona data string with full persona information
    let personaSection = '';
    if (request.persona_data && request.persona_data.length > 0) {
        // Access power_user for persona data
        if (typeof power_user !== 'undefined' && power_user.personas && power_user.persona_descriptions) {
            const personaDataStr = request.persona_data.map(personaRef => {
                const personaName = power_user.personas[personaRef.id];
                const personaDesc = power_user.persona_descriptions[personaRef.id];

                if (personaName && personaDesc) {
                    let text = `**Persona: ${personaName}`;
                    if (personaDesc.title) {
                        text += ` (${personaDesc.title})`;
                    }
                    text += '**\n';
                    if (personaDesc.description) {
                        text += `Description: ${personaDesc.description}\n`;
                    }
                    return text;
                } else {
                    // Fallback if persona not found
                    return `**Persona: ${personaRef.name}**\nDescription: Persona data not available\n`;
                }
            }).join('\n---\n');

            // Build the full persona section with heading and instructions
            personaSection = `---

### PERSONA DATA

${personaDataStr}

This PERSONA_DATA includes optional user personas that define the player character's identity, personality, and behavior in this story.

**You MUST:**
- Treat personas as defining the player character's role and perspective in the story.
- Incorporate persona traits, goals, and behaviors into the protagonist_group and character_arcs.
- If a persona is provided, it represents who the player is role-playing as in this narrative.

---`;
        }
    }
    // If no personas, personaSection remains empty string

    // Build character data string with full character information
    let characterDataStr = '';
    if (request.character_data && request.character_data.length > 0) {
        console.log('[Story Mode Blueprint] Processing', request.character_data.length, 'characters');

        // Format as readable text, not JSON
        characterDataStr = request.character_data.map(char => {
            let text = `**Character: ${char.name}**\n`;
            if (char.description) {
                text += `Description: ${char.description.replace(/\{\{char\}\}/gi, char.name)}\n`;
            }
            if (char.personality) {
                text += `Personality: ${char.personality.replace(/\{\{char\}\}/gi, char.name)}\n`;
            }
            if (char.scenario) {
                text += `Scenario: ${char.scenario.replace(/\{\{char\}\}/gi, char.name)}\n`;
            }
            if (char.greeting) {
                text += `Greeting: ${char.greeting}\n`;
            }
            return text;
        }).join('\n---\n');
    } else {
        characterDataStr = 'No specific character data provided.';
    }

    // Build metaphor instructions based on selected level
    const metaphorInstructions = buildMetaphorInstructions(request.genre_interpretation.metaphor_level);

    // Calculate expected scene count based on target rounds
    const totalRounds = request.total_messages_target;
    let expectedSceneCount;
    if (totalRounds <= 12) {
        expectedSceneCount = '~5–7 scenes';
    } else if (totalRounds <= 30) {
        expectedSceneCount = '~8–12 scenes';
    } else if (totalRounds <= 60) {
        expectedSceneCount = '~12–20 scenes';
    } else if (totalRounds <= 120) {
        expectedSceneCount = '~20–30 scenes';
    } else {
        // For longer stories (up to 500 rounds), scale appropriately
        const scenesPerRound = 0.25; // ~4 rounds per scene
        const calculatedScenes = Math.max(30, Math.round(totalRounds * scenesPerRound));
        expectedSceneCount = `~${calculatedScenes}–${calculatedScenes + 10} scenes`;
    }

    // Debug: Log what we're replacing
    console.log('[Story Mode Blueprint] Replacing variables:', {
        storyTypeId: request.story_type_id,
        storyTypeName: storyType.name,
        metaphorLevel: request.genre_interpretation.metaphor_level,
        metaphorInstructionsLength: metaphorInstructions.length,
        authorStyleName: authorStyle?.name,
        personaSectionLength: personaSection.length,
        characterDataLength: characterDataStr.length,
        scenarioLength: request.user_scenario?.length || 0,
        messageTarget: request.total_messages_target,
    });

    // Replace template variables - do this in the right order!
    prompt = prompt
        // First, replace the large sections
        .replace('{{STORY_TYPE_JSON}}', JSON.stringify(storyType, null, 2))
        .replace('{{AUTHOR_STYLE_SECTION}}', authorStyleSection)
        .replace('{{METAPHOR_INSTRUCTIONS}}', metaphorInstructions)
        .replace('{{PERSONA_SECTION}}', personaSection)
        .replace('{{CHARACTER_DATA}}', characterDataStr)
        .replace('{{USER_SCENARIO}}', request.user_scenario || 'No specific scenario provided.')
        // Then replace the simple variables
        .replace('{{STORY_TYPE_ID}}', request.story_type_id)
        .replace('{{STORY_TYPE_NAME}}', storyType.name || request.story_type_id)
        .replace('{{METAPHOR_LEVEL}}', request.genre_interpretation.metaphor_level)
        .replace('{{AUTHOR_STYLE}}', authorStyle?.name || 'None')
        .replace('{{TOTAL_MESSAGES_TARGET}}', request.total_messages_target.toString())
        .replace('{{EXPECTED_SCENE_COUNT}}', expectedSceneCount);

    // Debug: Check final prompt
    console.log('[Story Mode Blueprint] Final prompt length:', prompt.length);
    console.log('[Story Mode Blueprint] Final prompt starts with:', prompt.substring(0, 200) + '...');

    return prompt;
}

/**
 * Validate a blueprint object against required schema
 * Only checks truly essential fields. Missing optional fields are filled with defaults.
 * @param {Object} blueprint - The blueprint object to validate
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateBlueprint(blueprint) {
    const errors = [];

    // Only truly required fields - everything else can have defaults
    if (!blueprint.story_type_name && !blueprint.story_type_id) {
        errors.push('Blueprint must have either story_type_name or story_type_id');
    }

    if (!blueprint.core_premise) {
        errors.push('Blueprint must have a core_premise');
    }

    // Validate scene_plan is an array with at least one scene
    if (!Array.isArray(blueprint.scene_plan) || blueprint.scene_plan.length === 0) {
        errors.push('scene_plan must be a non-empty array');
    } else {
        // Validate each scene has minimal required fields
        blueprint.scene_plan.forEach((scene, index) => {
            if (!scene.title && !scene.situation) {
                errors.push(`scene_plan[${index}] must have at least a title or situation`);
            }

            // Validate beats array if present
            if (scene.beats && !Array.isArray(scene.beats)) {
                errors.push(`scene_plan[${index}].beats must be an array`);
            } else if (scene.beats) {
                // Validate each beat structure
                scene.beats.forEach((beat, beatIndex) => {
                    if (typeof beat.index !== 'number') {
                        errors.push(`scene_plan[${index}].beats[${beatIndex}].index must be a number`);
                    }
                    if (!beat.title && !beat.description) {
                        errors.push(`scene_plan[${index}].beats[${beatIndex}] must have at least a title or description`);
                    }
                    if (beat.type && !['establishment', 'hook', 'reaction', 'escalation', 'pivot', 'emotional', 'transition'].includes(beat.type)) {
                        errors.push(`scene_plan[${index}].beats[${beatIndex}].type must be one of: establishment, hook, reaction, escalation, pivot, emotional, transition`);
                    }
                });
            }

            // Validate expected_rounds if present
            if (scene.expected_rounds && typeof scene.expected_rounds !== 'number') {
                errors.push(`scene_plan[${index}].expected_rounds must be a number`);
            }
        });
    }

    // Validate character_arcs is an array (if present)
    if (blueprint.character_arcs && !Array.isArray(blueprint.character_arcs)) {
        errors.push('character_arcs must be an array');
    }

    // Validate possible_resolutions is an array (if present)
    if (blueprint.possible_resolutions && !Array.isArray(blueprint.possible_resolutions)) {
        errors.push('possible_resolutions must be an array');
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

/**
 * Normalize a blueprint by filling in missing fields with defaults
 * @param {Object} blueprint - Blueprint object to normalize
 * @returns {Object} Normalized blueprint with all required fields
 */
export function normalizeBlueprint(blueprint) {
    const normalized = { ...blueprint };

    // Generate or validate unique ID (preserve existing IDs for exports/imports)
    if (!normalized.blueprint_id || !isValidBlueprintId(normalized.blueprint_id)) {
        const oldId = normalized.blueprint_id;
        normalized.blueprint_id = generateBlueprintId();
        if (!oldId) {
            console.log('[Story Mode Blueprint] Generated ID for imported blueprint:', normalized.blueprint_id);
        } else {
            console.warn('[Story Mode Blueprint] Invalid blueprint_id format, regenerating:', oldId, '->', normalized.blueprint_id);
        }
    }

    // Essential fields with defaults
    normalized.story_type_id = normalized.story_type_id || normalized.story_type_name?.toLowerCase().replace(/\s+/g, '_') || 'custom';
    normalized.story_type_name = normalized.story_type_name || 'Custom Story';
    normalized.core_premise = normalized.core_premise || 'A custom story';

    // Preserve author style if present (explicitly set to undefined if not in blueprint)
    // This ensures the field exists so syncBlueprintSettings can properly handle it
    if (Object.prototype.hasOwnProperty.call(blueprint, 'author_style')) {
        normalized.author_style = blueprint.author_style;
    } else {
        // Mark as explicitly not set for imported blueprints without the field
        normalized.author_style = undefined;
    }

    // Preserve author style name and prompt if present in the blueprint
    if (blueprint.author_style_name) {
        normalized.author_style_name = blueprint.author_style_name;
    }
    if (blueprint.author_style_prompt) {
        normalized.author_style_prompt = blueprint.author_style_prompt;
    }

    // Preserve opening message if present (with validation)
    if (Object.prototype.hasOwnProperty.call(blueprint, 'opening_message')) {
        const openingMsg = blueprint.opening_message;
        // Validate and sanitize: must be a string, non-empty, and within reasonable length
        if (typeof openingMsg === 'string' && openingMsg.trim().length > 0 && openingMsg.length < 50000) {
            normalized.opening_message = openingMsg.trim();
        } else {
            console.warn('[BlueprintModule] Invalid opening_message in blueprint, discarding');
            normalized.opening_message = undefined;
        }
    } else {
        normalized.opening_message = undefined;
    }

    // Setting with defaults
    normalized.setting = normalized.setting || {
        location: 'Unknown',
        time_period: 'Unknown',
        atmosphere: 'Unknown',
    };
    normalized.setting.location = normalized.setting.location || 'Unknown';
    normalized.setting.time_period = normalized.setting.time_period || 'Unknown';
    normalized.setting.atmosphere = normalized.setting.atmosphere || 'Unknown';

    // Protagonist group with defaults
    normalized.protagonist_group = normalized.protagonist_group || {
        description: 'The protagonists',
        shared_goal: 'To complete their journey',
        group_dynamic: 'Working together',
    };
    normalized.protagonist_group.description = normalized.protagonist_group.description || 'The protagonists';
    normalized.protagonist_group.shared_goal = normalized.protagonist_group.shared_goal || 'To complete their journey';
    normalized.protagonist_group.group_dynamic = normalized.protagonist_group.group_dynamic || 'Working together';

    // Antagonistic forces with defaults
    normalized.antagonistic_forces = normalized.antagonistic_forces || {
        description: 'Opposing forces',
        nature: 'Unknown',
        motivation: 'Opposition to the protagonists',
        manifestations: [],
    };
    normalized.antagonistic_forces.description = normalized.antagonistic_forces.description || 'Opposing forces';
    normalized.antagonistic_forces.nature = normalized.antagonistic_forces.nature || 'Unknown';
    normalized.antagonistic_forces.motivation = normalized.antagonistic_forces.motivation || 'Opposition to the protagonists';
    normalized.antagonistic_forces.manifestations = normalized.antagonistic_forces.manifestations || [];

    // Arc structure with defaults
    normalized.arc_structure = normalized.arc_structure || {
        opening_hook: 'The story begins',
        escalation_pattern: 'Challenges increase',
        climax_nature: 'Confrontation',
        resolution_style: 'The story concludes',
        total_messages_target: 30,
    };
    normalized.arc_structure.opening_hook = normalized.arc_structure.opening_hook || 'The story begins';
    normalized.arc_structure.escalation_pattern = normalized.arc_structure.escalation_pattern || 'Challenges increase';
    normalized.arc_structure.climax_nature = normalized.arc_structure.climax_nature || 'Confrontation';
    normalized.arc_structure.resolution_style = normalized.arc_structure.resolution_style || 'The story concludes';
    normalized.arc_structure.total_messages_target = normalized.arc_structure.total_messages_target || 30;

    // Character arcs - ensure array
    normalized.character_arcs = normalized.character_arcs || [];
    normalized.character_arcs = normalized.character_arcs.map(arc => ({
        character_name: arc.character_name || 'Unknown',
        initial_state: arc.initial_state || 'Starting state',
        key_turning_points: arc.key_turning_points || [],
        final_state: arc.final_state || 'Ending state',
        emotional_trajectory: arc.emotional_trajectory || 'Character journey',
    }));

    // Scene plan - normalize each scene
    normalized.scene_plan = (normalized.scene_plan || []).map((scene, index) => {
        const normalizedScene = {
            index: scene.index ?? index,
            title: scene.title || `Scene ${index + 1}`,
            phase: scene.phase || 'setup',
            purpose: scene.purpose || 'Advance the story',
            situation: scene.situation || 'A scene unfolds',
            key_events_if_unchanged: scene.key_events_if_unchanged || scene.key_events_if_unchallenged || [],
            choice_points: scene.choice_points || [],
            character_focus: scene.character_focus || [],
            hooks_for_future: scene.hooks_for_future || [],
        };

        // Normalize beats array if present
        if (scene.beats && Array.isArray(scene.beats)) {
            normalizedScene.beats = scene.beats.map((beat, beatIndex) => ({
                index: beat.index ?? beatIndex,
                title: beat.title || `Beat ${beatIndex + 1}`,
                description: beat.description || '',
                type: beat.type || 'reaction', // Default to reaction type
                required: beat.required ?? true, // Default to required
                emotional_beat_target: beat.emotional_beat_target || null, // Optional emotional focus
                pacing_constraints: beat.pacing_constraints || null, // Optional pacing guidance
            }));
        } else {
            // Provide empty beats array for compatibility
            normalizedScene.beats = [];
        }

        // Add expected_rounds if present, otherwise it will be calculated dynamically
        if (scene.expected_rounds && typeof scene.expected_rounds === 'number') {
            normalizedScene.expected_rounds = scene.expected_rounds;
        }

        return normalizedScene;
    });

    // Possible resolutions - ensure array
    normalized.possible_resolutions = normalized.possible_resolutions || [];
    normalized.possible_resolutions = normalized.possible_resolutions.map(resolution => ({
        title: resolution.title || 'Resolution',
        description: resolution.description || 'The story concludes',
        character_outcomes: resolution.character_outcomes || [],
        thematic_resolution: resolution.thematic_resolution || 'Themes are resolved',
    }));

    // Tone and style with defaults
    normalized.tone_and_style = normalized.tone_and_style || {
        primary_tone: 'Neutral',
        narrative_voice: 'Third-person',
        pacing: 'Steady',
        key_stylistic_elements: [],
    };
    normalized.tone_and_style.primary_tone = normalized.tone_and_style.primary_tone || 'Neutral';
    normalized.tone_and_style.narrative_voice = normalized.tone_and_style.narrative_voice || 'Third-person';
    normalized.tone_and_style.pacing = normalized.tone_and_style.pacing || 'Steady';
    normalized.tone_and_style.key_stylistic_elements = normalized.tone_and_style.key_stylistic_elements || [];

    // Content boundaries with defaults
    normalized.content_boundaries = normalized.content_boundaries || {
        violence_level: 'None specified',
        romance_level: 'None specified',
        other_content_notes: '',
    };
    normalized.content_boundaries.violence_level = normalized.content_boundaries.violence_level || 'None specified';
    normalized.content_boundaries.romance_level = normalized.content_boundaries.romance_level || 'None specified';
    normalized.content_boundaries.other_content_notes = normalized.content_boundaries.other_content_notes || '';

    // Genre realism notes with defaults
    normalized.genre_realism_notes = normalized.genre_realism_notes || {
        metaphor_level_used: 'mixed',
        implementation_notes: 'Genre elements blend with story themes.',
    };
    normalized.genre_realism_notes.metaphor_level_used = normalized.genre_realism_notes.metaphor_level_used || 'mixed';
    normalized.genre_realism_notes.implementation_notes = normalized.genre_realism_notes.implementation_notes || 'Genre elements blend with story themes.';

    return normalized;
}

/**
 * Parse and validate blueprint JSON from LLM response
 * @param {string} rawResponse - Raw text response from LLM
 * @returns {Object} Parsed and validated blueprint, or null if invalid
 */
export function parseBlueprintResponse(rawResponse) {
    try {
        // Extract JSON from response (handle markdown code blocks)
        let jsonStr = rawResponse.trim();

        // Remove markdown code fences if present
        if (jsonStr.startsWith('```')) {
            const lines = jsonStr.split('\n');
            // Remove first line (```json or ```) and last line (```)
            if (lines[0].includes('json')) {
                lines.shift();
            }
            if (lines[lines.length - 1].trim() === '```') {
                lines.pop();
            }
            jsonStr = lines.join('\n').trim();
        }

        // Parse JSON
        const blueprint = JSON.parse(jsonStr);

        // Normalize blueprint to fill in missing fields with defaults
        const normalizedBlueprint = normalizeBlueprint(blueprint);

        // Validate schema
        const validation = validateBlueprint(normalizedBlueprint);
        if (!validation.valid) {
            console.error('[Story Mode Blueprint] Validation failed:', validation.errors);
            return {
                success: false,
                errors: validation.errors,
                rawResponse,
            };
        }

        return {
            success: true,
            blueprint: normalizedBlueprint,
        };
    } catch (error) {
        console.error('[Story Mode Blueprint] Parse error:', error);

        // Detect if the response might be truncated
        const jsonStr = rawResponse.trim();
        let isLikelyTruncated = false;

        // Check for common signs of truncation
        if (error instanceof SyntaxError) {
            // Count opening and closing braces to detect imbalance
            const openBraces = (jsonStr.match(/\{/g) || []).length;
            const closeBraces = (jsonStr.match(/\}/g) || []).length;
            const openBrackets = (jsonStr.match(/\[/g) || []).length;
            const closeBrackets = (jsonStr.match(/\]/g) || []).length;

            if (openBraces > closeBraces || openBrackets > closeBrackets) {
                isLikelyTruncated = true;
            }

            // Check if response ends mid-sentence or mid-string
            const lastChars = jsonStr.slice(-100);
            if (lastChars.includes('...') || lastChars.endsWith('"') || lastChars.endsWith(',')) {
                isLikelyTruncated = true;
            }
        }

        // Provide helpful error message
        let errorMessage = error.message;
        if (isLikelyTruncated) {
            errorMessage = 'The blueprint response was truncated (incomplete JSON). This usually means the LLM hit the token limit. Try again with a higher token limit in your blueprint settings, or use a simpler story type with fewer scenes.';
            console.warn('[Story Mode Blueprint] Detected likely truncated response:', {
                error: error.message,
                responseLength: jsonStr.length,
                endsWith: jsonStr.slice(-100)
            });
        }

        return {
            success: false,
            errors: [errorMessage],
            rawResponse,
            isLikelyTruncated,
        };
    }
}

/**
 * Generate a blueprint by calling the LLM API
 * @param {Object} request - Blueprint request object
 * @param {Array} storyTypes - Array of available story types
 * @param {Array} authorStyles - Array of available author styles
 * @returns {Object} Generated blueprint or error
 */
export async function generateBlueprint(request, storyTypes, authorStyles) {
    try {
        // Find story type and author style
        const storyType = storyTypes.find(t => t.id === request.story_type_id);
        if (!storyType) {
            throw new Error(`Story type not found: ${request.story_type_id}`);
        }

        const authorStyle = request.author_style
            ? authorStyles.find(s => s.id === request.author_style)
            : null;

        // Build master prompt
        const masterPrompt = buildMasterPrompt(request, storyType, authorStyle);

        // Capture the selected profile ID NOW to ensure consistency
        const selectedProfileId = extension_settings[MODULE_NAME]?.blueprintSettings?.generationApi || null;
        console.log('[Story Mode Blueprint] Captured selectedProfileId at generation time:', selectedProfileId);

        // Get token count for the prompt
        let tokenCount = 0;
        try {
            tokenCount = await getTokenCountAsync(masterPrompt);
        } catch (tokenError) {
            console.warn('[Story Mode Blueprint] Could not count tokens:', tokenError);
            tokenCount = masterPrompt.length; // Fallback to character count
        }

        console.log('[Story Mode Blueprint] Generating blueprint with prompt length:', masterPrompt.length, 'tokens:', tokenCount);

        // Debug: Show prompt before generation
        const promptPreviewHtml = `
            <div style="max-height: 400px; overflow-y: auto;">
                <h3>Blueprint Generation Prompt</h3>
                <p><strong>Prompt length:</strong> ${tokenCount.toLocaleString()} tokens</p>
                <p><strong>Story Type:</strong> ${storyType.name}</p>
                <p><strong>Author Style:</strong> ${authorStyle?.name || 'None'}</p>
                <p><strong>Metaphor Level:</strong> ${request.genre_interpretation.metaphor_level}</p>
                <p><strong>Target Messages:</strong> ${request.total_messages_target}</p>
                <p><strong>Generation Preset:</strong> ${selectedProfileId || 'Main preset (' + main_api + ')'}</p>
                <hr style="margin: 10px 0; border-color: var(--SmartThemeBorderColor);"/>
                <pre style="white-space: pre-wrap; word-wrap: break-word; font-family: monospace; font-size: 0.85em; max-height: 300px; overflow-y: auto; background: var(--black30a); padding: 10px; border-radius: 5px;">${masterPrompt.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
            </div>
        `;

        const popup1 = new Popup(promptPreviewHtml, POPUP_TYPE.TEXT, '', {
            wide: true,
            large: true,
            allowVerticalScrolling: true,
            okButton: 'Generate',
            cancelButton: 'Cancel',
        });
        const result1 = await popup1.show();

        // POPUP_RESULT: AFFIRMATIVE=1 (Generate), NEGATIVE=0 (Cancel), CANCELLED=null (X button)
        if (result1 !== POPUP_RESULT.AFFIRMATIVE) {
            console.log('[Story Mode Blueprint] Generation cancelled by user at prompt dialog, result:', result1);
            return {
                success: false,
                errors: ['Cancelled by user'],
                cancelled: true,
            };
        }

        // Check if API is connected
        if (online_status === 'no_connection') {
            console.error('[Story Mode Blueprint] API not connected:', online_status);
            const errorHtml = `
                <div style="max-height: 400px; overflow-y: auto;">
                    <h3>Blueprint Generation Error</h3>
                    <div class="storymode-error-message">
                        <strong>No API Connection</strong><br><br>
                        The generation API is not connected. Please configure your API settings in SillyTavern before generating a blueprint.<br><br>
                        Current status: <strong>${online_status}</strong>
                    </div>
                </div>
            `;
            new Popup(errorHtml, POPUP_TYPE.TEXT, '', { wide: true, okButton: 'OK' }).show();
            return {
                success: false,
                errors: [`API not connected: ${online_status}`],
            };
        }

        console.log('[Story Mode Blueprint] API status:', online_status, 'Main API:', main_api);

        // Call SillyTavern's generateRaw function
        console.log('[Story Mode Blueprint] Starting generation...');
        console.log('[Story Mode Blueprint] Prompt length:', masterPrompt.length, 'First 200 chars:', masterPrompt.substring(0, 200));

        // Prepare prompts for generateRaw
        const userPrompt = masterPrompt;
        const systemPrompt = 'You are an expert story designer. Output ONLY valid JSON as specified in the user\'s request.';

        console.log('[Story Mode Blueprint] API type:', main_api);

        // Verify generateRaw is available before calling
        if (typeof generateRaw !== 'function') {
            console.error('[Story Mode Blueprint] generateRaw is NOT a function!', typeof generateRaw);
            throw new Error(`generateRaw is not available (type: ${typeof generateRaw})`);
        }
        console.log('[Story Mode Blueprint] generateRaw verified as function, calling...');

        let rawText;
        try {
            // Attempt generation with detailed logging
            console.log('[Story Mode Blueprint] Calling generateRaw with:', {
                promptType: typeof userPrompt,
                promptLength: userPrompt.length,
                systemPromptLength: systemPrompt.length,
                responseLength: 16000,
                api: main_api,
            });

            rawText = await generateWithPreset({
               prompt: userPrompt,
               systemPrompt: systemPrompt,
               responseLength: 16000, // Increased from 8192 to 16000 to handle large blueprint JSON structures
               profileId: selectedProfileId, // Pass the captured profile ID
            });

            console.log('[Story Mode Blueprint] generateWithPreset returned successfully. Response type:', typeof rawText, 'Length:', rawText?.length || 0);

            // Log first 200 chars of response for debugging
            if (rawText && typeof rawText === 'string') {
                console.log('[Story Mode Blueprint] Response preview:', rawText.substring(0, 200));
            } else if (rawText) {
                console.log('[Story Mode Blueprint] Response (non-string):', JSON.stringify(rawText).substring(0, 200));
            }
        } catch (genError) {
            console.error('[Story Mode Blueprint] generateRaw error:', genError);
            console.error('[Story Mode Blueprint] Error details:', {
                message: genError.message,
                stack: genError.stack,
                name: genError.name,
            });
            // Show detailed error to user
            const errorHtml = `
                <div style="max-height: 400px; overflow-y: auto;">
                    <h3>Blueprint Generation Error</h3>
                    <div class="storymode-error-message">
                        <strong>Generation Failed</strong><br><br>
                        ${genError.message || 'Unknown error'}<br><br>
                        Preset: <strong>${extension_settings[MODULE_NAME].blueprintSettings?.generationApi || 'Main preset (' + main_api + ')'}</strong><br>
                        Status: <strong>${online_status}</strong><br><br>
                        <details>
                            <summary>Technical Details</summary>
                            <pre style="margin-top: 10px; white-space: pre-wrap;">${String(genError.stack || genError)}</pre>
                        </details>
                    </div>
                </div>
            `;
            new Popup(errorHtml, POPUP_TYPE.TEXT, '', { wide: true, okButton: 'OK' }).show();
            return {
                success: false,
                errors: [`Generation failed: ${genError.message || genError}`],
            };
        }

        console.log('[Story Mode Blueprint] Received response length:', rawText?.length || 0);

        // Check if we got a valid response
        if (!rawText || typeof rawText !== 'string') {
            console.error('[Story Mode Blueprint] Invalid response type:', typeof rawText);
            const errorHtml = `
                <div style="max-height: 400px; overflow-y: auto;">
                    <h3>Blueprint Generation Error</h3>
                    <div class="storymode-error-message">
                        <strong>Invalid Response</strong><br><br>
                        The API returned an unexpected response type: <strong>${typeof rawText}</strong><br><br>
                        Expected a string but got: ${rawText === null ? 'null' : rawText === undefined ? 'undefined' : JSON.stringify(rawText)}
                    </div>
                </div>
            `;
            new Popup(errorHtml, POPUP_TYPE.TEXT, '', { wide: true, okButton: 'OK' }).show();
            return {
                success: false,
                errors: [`Invalid response type: ${typeof rawText}`],
            };
        }

        if (rawText.trim().length === 0) {
            console.error('[Story Mode Blueprint] Empty response received');
            const errorHtml = `
                <div style="max-height: 400px; overflow-y: auto;">
                    <h3>Blueprint Generation Error</h3>
                    <div class="storymode-error-message">
                        <strong>Empty Response</strong><br><br>
                        The API returned an empty response. This could mean:<br>
                        • The API is not configured correctly<br>
                        • The prompt was too long<br>
                        • The API returned an error instead of text<br><br>
                        Please check your API settings and try again.
                    </div>
                </div>
            `;
            new Popup(errorHtml, POPUP_TYPE.TEXT, '', { wide: true, okButton: 'OK' }).show();
            return {
                success: false,
                errors: ['Empty response from generation API'],
            };
        }

        // Debug: Show raw response
        const responsePreviewHtml = `
            <div style="max-height: 400px; overflow-y: auto;">
                <h3>Generation Response</h3>
                <p><strong>Response length:</strong> ${rawText?.length || 0} characters</p>
                <hr style="margin: 10px 0; border-color: var(--SmartThemeBorderColor);"/>
                <pre style="white-space: pre-wrap; word-wrap: break-word; font-family: monospace; font-size: 0.85em; max-height: 300px; overflow-y: auto; background: var(--black30a); padding: 10px; border-radius: 5px;">${rawText ? rawText.replace(/</g, '&lt;').replace(/>/g, '&gt;') : '(No response)'}</pre>
            </div>
        `;

        const popup2 = new Popup(responsePreviewHtml, POPUP_TYPE.TEXT, '', {
            wide: true,
            large: true,
            allowVerticalScrolling: true,
            okButton: 'Continue',
        });
        await popup2.show();

        // Parse and validate the blueprint
        const result = parseBlueprintResponse(rawText);

        if (result.success) {
            console.log('[Story Mode Blueprint] Blueprint generated successfully');

            // Add metadata from user's config to the blueprint
            const blueprint = result.blueprint;
            blueprint.blueprint_id = generateBlueprintId();
            blueprint.arc_structure = blueprint.arc_structure || {};
            blueprint.arc_structure.total_messages_target = request.total_messages_target;

            // Save author style ID and details into the blueprint
            blueprint.author_style = request.author_style;
            if (request.author_style && authorStyles) {
                const authorStyleObj = authorStyles.find(s => s.id === request.author_style);
                if (authorStyleObj) {
                    blueprint.author_style_name = authorStyleObj.name;
                    blueprint.author_style_prompt = authorStyleObj.authorPrompt;
                }
            }
            console.log('[Story Mode Blueprint] Assigned blueprint ID:', blueprint.blueprint_id);

            return {
                success: true,
                blueprint: blueprint,
            };
        } else {
            console.error('[Story Mode Blueprint] Blueprint validation failed:', result.errors);
            return {
                success: false,
                errors: result.errors,
                rawResponse: result.rawResponse,
            };
        }
    } catch (error) {
        console.error('[Story Mode Blueprint] Generation error:', error);
        return {
            success: false,
            errors: [error.message],
        };
    }
}

// ============================================================================
// PROMPT INJECTION
// ============================================================================

/**
 * Calculate scene pacing information for pacing contracts
 * @param {Object} blueprint - The blueprint object
 * @param {number} currentStep - Current round/step in the story
 * @param {number} arcLength - Total arc length (rounds)
 * @returns {Object|null} Pacing info or null if no blueprint
 */
export function getScenePacingInfo(blueprint, currentStep, arcLength) {
    if (!blueprint || !blueprint.scene_plan || blueprint.scene_plan.length === 0) {
        return null;
    }

    const totalScenes = blueprint.scene_plan.length;

    // Check if any scenes have explicit expected_rounds
    const hasExplicitRounds = blueprint.scene_plan.some(s => s.expected_rounds && typeof s.expected_rounds === 'number');

    let sceneIndex, clampedSceneIndex, scene, sceneStartRound, sceneEndRound, expectedSceneRounds;

    if (hasExplicitRounds) {
        // Use explicit scene durations where provided, calculate dynamically for others
        // First, calculate total explicit rounds and how many scenes have them
        const explicitTotal = blueprint.scene_plan.reduce((sum, s) =>
            sum + (s.expected_rounds || 0), 0
        );
        const scenesWithoutRounds = blueprint.scene_plan.filter(s => !s.expected_rounds).length;

        // Remaining rounds to distribute among scenes without explicit durations
        const remainingRounds = Math.max(0, arcLength - explicitTotal);
        const roundsPerDynamicScene = scenesWithoutRounds > 0
            ? Math.floor(remainingRounds / scenesWithoutRounds)
            : 0;

        // Build cumulative round map to find which scene we're in
        let cumulativeRounds = 0;
        let foundSceneIndex = 0;

        for (let i = 0; i < totalScenes; i++) {
            const sceneRounds = blueprint.scene_plan[i].expected_rounds || roundsPerDynamicScene;
            const sceneEnd = cumulativeRounds + sceneRounds;

            if (currentStep < sceneEnd) {
                foundSceneIndex = i;
                sceneStartRound = cumulativeRounds;
                sceneEndRound = sceneEnd;
                expectedSceneRounds = sceneRounds;
                break;
            }

            cumulativeRounds += sceneRounds;
        }

        // If currentStep is beyond all scenes, clamp to last scene
        if (currentStep >= cumulativeRounds) {
            foundSceneIndex = totalScenes - 1;
            const lastSceneRounds = blueprint.scene_plan[foundSceneIndex].expected_rounds || roundsPerDynamicScene;
            sceneEndRound = cumulativeRounds;
            sceneStartRound = sceneEndRound - lastSceneRounds;
            expectedSceneRounds = lastSceneRounds;
        }

        sceneIndex = foundSceneIndex;
        clampedSceneIndex = foundSceneIndex;
        scene = blueprint.scene_plan[clampedSceneIndex];
    } else {
        // Dynamic calculation: distribute rounds evenly across all scenes
        sceneIndex = Math.floor((currentStep / arcLength) * totalScenes);
        clampedSceneIndex = Math.max(0, Math.min(sceneIndex, totalScenes - 1));
        scene = blueprint.scene_plan[clampedSceneIndex];

        sceneStartRound = Math.floor((clampedSceneIndex / totalScenes) * arcLength);
        sceneEndRound = Math.floor(((clampedSceneIndex + 1) / totalScenes) * arcLength);
        expectedSceneRounds = Math.max(1, sceneEndRound - sceneStartRound);
    }

    // Calculate progress within scene
    const roundInScene = Math.max(0, currentStep - sceneStartRound);
    const roundsRemaining = Math.max(0, sceneEndRound - currentStep);
    const percentThroughScene = expectedSceneRounds > 0
        ? Math.round((roundInScene / expectedSceneRounds) * 100)
        : 0;

    return {
        scene,
        sceneIndex: clampedSceneIndex,
        totalScenes,
        sceneStartRound,
        sceneEndRound,
        expectedSceneRounds,
        roundInScene,
        roundsRemaining,
        percentThroughScene,
    };
}

/**
 * Get the current scene based on blueprint state and round progress
 * @param {Object} blueprint - The blueprint object
 * @param {number} currentStep - Current round/step in the story
 * @param {number} arcLength - Total arc length (rounds)
 * @param {string} sceneMode - 'auto' or 'manual'
 * @param {number} manualSceneIndex - Manual scene index (for manual mode)
 * @returns {Object|null} Current scene object or null if no blueprint
 */
export function getCurrentScene(blueprint, currentStep, arcLength, sceneMode = 'auto', manualSceneIndex = 0) {
    if (!blueprint || !blueprint.scene_plan || blueprint.scene_plan.length === 0) {
        return null;
    }

    let sceneIndex;

    if (sceneMode === 'manual') {
        // Manual mode: use the stored scene index
        sceneIndex = Math.max(0, Math.min(manualSceneIndex, blueprint.scene_plan.length - 1));
    } else {
        // Auto mode: calculate scene based on round progress
        // Distribute scenes evenly across the arc length
        const progress = currentStep / arcLength;
        sceneIndex = Math.floor(progress * blueprint.scene_plan.length);
        // Clamp to valid range
        sceneIndex = Math.max(0, Math.min(sceneIndex, blueprint.scene_plan.length - 1));
    }

    return {
        index: sceneIndex,
        ...blueprint.scene_plan[sceneIndex],
    };
}

/**
 * Advance the scene index manually (for manual mode)
 * @param {number} currentIndex - Current scene index
 * @param {number} direction - 1 for forward, -1 for backward
 * @param {number} maxScenes - Total number of scenes
 * @returns {number} New scene index
 */
export function advanceSceneIndex(currentIndex, direction, maxScenes) {
    let newIndex = currentIndex + direction;
    // Clamp to valid range [0, maxScenes - 1]
    return Math.max(0, Math.min(newIndex, maxScenes - 1));
}

/**
 * Set the scene mode (auto or manual)
 * @param {Object} blueprintState - Current blueprint state
 * @param {string} mode - 'auto' or 'manual'
 * @returns {Object} Updated blueprint state
 */
export function setSceneMode(blueprintState, mode) {
    const newState = { ...blueprintState };
    newState.sceneMode = mode;

    // When switching to auto mode, reset currentSceneIndex
    if (mode === 'auto') {
        newState.currentSceneIndex = 0;
    }

    return newState;
}

/**
 * Build the runtime prompt injection for blueprint guidance with enhanced pacing
 * @param {Object} blueprintState - Blueprint state from chat
 * @param {number} currentStep - Current round/step
 * @param {number} arcLength - Total arc length
 * @returns {string|null} Prompt injection string or null if not enabled
 */
export function buildBlueprintInjection(blueprintState, currentStep, arcLength) {
    if (!blueprintState.useBlueprint || !blueprintState.blueprint) {
        return null;
    }

    const blueprint = blueprintState.blueprint;

    // Get scene pacing info (this calculates position within scene)
    const pacingInfo = getScenePacingInfo(blueprint, currentStep, arcLength);
    if (!pacingInfo) {
        return null;
    }

    const {
        scene,
        sceneIndex,
        totalScenes,
        sceneStartRound,
        sceneEndRound,
        expectedSceneRounds,
        roundInScene,
        roundsRemaining,
        percentThroughScene,
    } = pacingInfo;

    // Build character focus list
    let characterFocusStr = '';
    if (scene.character_focus && scene.character_focus.length > 0) {
        characterFocusStr = scene.character_focus
            .map(cf => `- ${cf.name}: ${cf.emotional_beat_target}`)
            .join('\n');
    } else {
        characterFocusStr = 'No specific character focus for this scene.';
    }

    // Build hooks for future
    let hooksStr = '';
    if (scene.hooks_for_future && scene.hooks_for_future.length > 0) {
        hooksStr = '\n**Hooks for future:**\n' + scene.hooks_for_future.map(h => `- ${h}`).join('\n');
    }

    // Build scene summaries section if enabled and available
    const settings = extension_settings[MODULE_NAME];
    let summariesSection = '';
    if (settings.blueprintSettings?.includeSummariesInPrompt && blueprintState.sceneSummaries) {
        const summaryEntries = Object.entries(blueprintState.sceneSummaries)
            .filter(([sceneIdx]) => parseInt(sceneIdx) < sceneIndex)
            .sort(([a], [b]) => parseInt(a) - parseInt(b))
            .map(([sceneIdx, { sceneTitle, summary }]) =>
                `**Scene ${parseInt(sceneIdx) + 1}: ${sceneTitle}**\n${summary}`
            );

        if (summaryEntries.length > 0) {
            summariesSection = `

**Previous Scene Summaries:**
${summaryEntries.join('\n\n')}

---`;
        }
    }

    // Build beat checklist section if beats exist
    let beatsSection = '';
    if (scene.beats && scene.beats.length > 0 && settings.blueprintSettings?.beatTrackingEnabled !== false) {
        const completedBeats = getCompletedBeats(sceneIndex);
        const totalBeats = scene.beats.length;
        const completedCount = completedBeats.length;

        // Find the current beat focus (first incomplete beat, or last beat if all complete)
        let currentBeatIndex = completedBeats.length;
        if (currentBeatIndex >= totalBeats) {
            currentBeatIndex = totalBeats - 1; // Focus on last beat if all complete
        }

        const beatChecklist = scene.beats.map((beat, idx) => {
            const isCompleted = completedBeats.includes(idx);
            const isCurrent = idx === currentBeatIndex;
            const status = isCompleted ? '✓' : (isCurrent ? '→' : '□');
            const requiredIndicator = beat.required ? '' : ' (optional)';

            return `${status} Beat ${idx + 1}${requiredIndicator}: ${beat.title}${isCurrent ? ' ← DEVELOP THIS' : ''}`;
        }).join('\n');

        beatsSection = `

SCENE BEATS (${completedCount}/${totalBeats} addressed):
${beatChecklist}

⚠️ Address 1-2 beats per round maximum. Focus on the current beat.
⚠️ DO NOT skip ahead to later beats.
⚠️ Use @@BEAT:N@@ marker when completing a beat (e.g., @@BEAT:2@@).

`;
    }

    // Build the enhanced pacing contract injection
    const injection = `
[SCENE PACING CONTRACT]
Scene ${sceneIndex + 1} of ${totalScenes}: "${scene.title}"
Phase: ${scene.phase.toUpperCase()} | Expected duration: Rounds ${sceneStartRound + 1}-${sceneEndRound} (~${expectedSceneRounds} rounds)

CURRENT POSITION:
- Story round: ${currentStep} of ${arcLength}
- Scene round: ${roundInScene + 1} of ${expectedSceneRounds} (${percentThroughScene}% through this scene)
- Rounds remaining in scene: ~${roundsRemaining}

PACING GUIDANCE:
⚠️ DO NOT conclude this scene prematurely.
⚠️ DO NOT advance to Scene ${sceneIndex + 2} until round ${sceneEndRound}+.
⚠️ DO NOT use @@NEXT_SCENE@@ until scene feels complete.

FOCUS FOR THIS ROUND:
- Develop the current situation more deeply
- Show character reactions and internal states
- Build atmosphere and tension gradually

Scene will naturally end around round ${sceneEndRound}. Let it breathe.
[/SCENE PACING CONTRACT]

${beatsSection}

${summariesSection ? '[PREVIOUS SCENES SUMMARY]\n' + summariesSection + '\n[/PREVIOUS SCENES SUMMARY]\n' : ''}

[STORY_BLUEPRINT GUIDANCE]
Core premise: ${blueprint.core_premise}

Current planned scene details:
- Title: ${scene.title}
- Phase: ${scene.phase}
- Purpose: ${scene.purpose}
- Situation: ${scene.situation}

This scene's intended emotional focus:
${characterFocusStr}
${hooksStr}

Remember:
- This is guidance. Follow the user's actions.
- You may adjust, merge, or skip scenes to respect player agency.

Scene Transitions:
If you conclude the current scene and are ready to move to the next scene in the blueprint, end your response with: @@NEXT_SCENE@@
(This marker will be automatically detected and removed; the player will not see it)
[/STORY_BLUEPRINT GUIDANCE]
`;

    return injection.trim();
}

/**
 * Helper function to generate with a specific connection profile
 * Uses ConnectionManagerRequestService to call the API with the selected profile
 * @param {Object} options - Options with prompt, systemPrompt, responseLength, profileId
 * @returns {Promise<string>} Generated text
 */
async function generateWithPreset(options) {
    const selectedProfileId = options.profileId ?? extension_settings[MODULE_NAME]?.blueprintSettings?.generationApi;

    if (!selectedProfileId) {
        console.error('[Story Mode Blueprint] No profile selected!');
        throw new Error('No API profile selected for blueprint generation. Please select a provider in Blueprint Settings.');
    }

    console.log('[Story Mode Blueprint] Using profile:', selectedProfileId);

    const messages = [];
    if (options.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: options.prompt });

    try {
        const result = await ConnectionManagerRequestService.sendRequest(
            selectedProfileId,
            messages,
            options.responseLength || 0,
            { stream: false, extractData: true }
        );

        return result.text || result.content || '';
    } catch (error) {
        console.error('[Story Mode Blueprint] Connection Manager request failed:', error);
        throw error;
    }
}

/**
 * Save an opening message to the current blueprint
 * @param {string} openingText - The opening message text to save
 * @returns {Promise<Object>} Result object with success status
 */
export async function saveOpeningMessageToBlueprint(openingText) {
    const blueprintState = getBlueprintState();
    if (!blueprintState.blueprint) {
        return { success: false, error: 'No blueprint loaded' };
    }
    // Validate and sanitize: must be a string, non-empty, and within reasonable length
    if (typeof openingText !== 'string' || openingText.trim().length === 0) {
        console.warn('[BlueprintModule] Invalid opening message provided (not a non-empty string)');
        return { success: false, error: 'Invalid opening message' };
    }
    if (openingText.length >= 50000) {
        console.warn('[BlueprintModule] Opening message too long, truncating');
        openingText = openingText.substring(0, 50000);
    }
    blueprintState.blueprint.opening_message = openingText.trim();
    await saveBlueprintState(blueprintState);
    console.log('[Story Mode Blueprint] Opening message saved to blueprint');
    return { success: true };
}

/**
 * Get the stored opening message from the current blueprint
 * @returns {string|null} The stored opening message, or null if none exists
 */
export function getStoredOpeningMessage() {
    const blueprintState = getBlueprintState();
    return blueprintState.blueprint?.opening_message || null;
}

/**
 * Generate an opening message for Scene 1 of the blueprint
 * @param {Object} options - Optional parameters
 * @param {boolean} options.saveToBlueprint - Whether to save the generated message to the blueprint (default: false)
 * @returns {Promise<{success: boolean, opening?: string, error?: string}>}
 */
export async function generateOpeningMessage(options = {}) {
    const blueprintState = getBlueprintState();
    if (!blueprintState.blueprint) {
        return { success: false, error: 'No blueprint loaded' };
    }

    const blueprint = blueprintState.blueprint;
    const scene1 = blueprint.scene_plan[0];

    if (!scene1) {
        return { success: false, error: 'Blueprint has no scenes' };
    }

    // Build the prompt for generating the opening message
    const prompt = `You are writing the opening message for an interactive story.

**Story Premise:** ${blueprint.core_premise}

**Setting:**
- Location: ${blueprint.setting.location}
- Time Period: ${blueprint.setting.time_period}
- Atmosphere: ${blueprint.setting.atmosphere}

**Scene 1 (The Opening):**
- Title: ${scene1.title}
- Phase: ${scene1.phase}
- Purpose: ${scene1.purpose}
- Situation: ${scene1.situation}

**Instructions:**
Write the opening narrative message that establishes this scene for the player. This should:
1. Set the scene based on the situation above
2. Create atmosphere appropriate to the setting
3. Provide a clear hook for the player to engage with, but DO NOT ASK A QUESTION AT THE END OF YOUR MESSAGE.
4. Aim for around 500 words or less.

Write ONLY the narrative message itself. No preamble, no explanation, no "Here is the opening:" - just start writing the scene directly.

IMPORTANT: Do not ask a question or otherwise prompt the user at the end of the opening.`;

    // Check API connection
    if (typeof online_status === 'undefined' || online_status === 'no_connection') {
        return { success: false, error: 'API not connected' };
    }

    try {
        console.log('[Story Mode Blueprint] Generating opening message...');

        // Check if a specific API profile is configured for opening message generation
        const selectedProfileId = extension_settings[MODULE_NAME].blueprintSettings?.openingMessageApi;
        let rawText;

        if (selectedProfileId) {
            // Use ConnectionManagerRequestService with the selected profile
            console.log('[Story Mode Blueprint] Using opening message API profile:', selectedProfileId);
            const messages = [
                { role: 'system', content: 'You are a skilled fiction writer writing the opening of an interactive story.' },
                { role: 'user', content: prompt }
            ];

            const result = await ConnectionManagerRequestService.sendRequest(
                selectedProfileId,
                messages,
                0,
                {
                    stream: false,
                    extractData: true,
                }
            );

            rawText = result.text || result.content || '';
        } else {
            // Fall back to generateWithPreset (uses generationApi or main API)
            rawText = await generateWithPreset({
                prompt: prompt,
                systemPrompt: 'You are a skilled fiction writer writing the opening of an interactive story.',
                responseLength: 0,
            });
        }

        if (!rawText || rawText.trim().length === 0) {
            return { success: false, error: 'Empty response from LLM' };
        }

        // Clean up the response
        let opening = rawText.trim();

        // Remove any common prefixes if present
        const prefixesToRemove = [
            'Here is the opening',
            'Here is the opening message',
            'Opening:',
            'The opening:',
            '*',
            '#',
        ];

        for (const prefix of prefixesToRemove) {
            if (opening.toLowerCase().startsWith(prefix.toLowerCase())) {
                opening = opening.substring(prefix.length).trim();
            }
        }

        // Remove markdown code blocks if present
        opening = opening.replace(/^```\w*\n?|\n?```$/g, '').trim();

        console.log('[Story Mode Blueprint] Opening message generated:', opening);

        // Save to blueprint if requested
        const { saveToBlueprint = false } = options;
        if (saveToBlueprint) {
            await saveOpeningMessageToBlueprint(opening);
        }

        return { success: true, opening: opening };

    } catch (error) {
        console.error('[Story Mode Blueprint] Error generating opening message:', error);
        return { success: false, error: error.message || 'Failed to generate opening' };
    }
}

// ============================================================================
// HELPER FUNCTIONS (used by ui-components.js)
// ============================================================================

/**
 * Get the scenario text from current context
 * Falls back to scenario field or recent messages
 * @returns {string} Scenario text
 */
function getScenarioFromContext() {
    const context = getContext();

    // Try to get scenario from chat metadata
    if (context.chatMetadata?.scenario) {
        return context.chatMetadata.scenario;
    }

    // Try to get from character card
    if (context.characterData?.description) {
        return context.characterData.description;
    }

    // Fallback: empty string
    return '';
}

/**
 * Build character selection list HTML
 * Returns checkboxes for all characters in the current chat
 * @returns {string} HTML string
 */
function buildCharacterSelectionList() {
    const context = getContext();
    const characterList = [];

    // Debug: Log what we have in context
    console.log('[Story Mode Blueprint] Context keys:', Object.keys(context));
    console.log('[Story Mode Blueprint] characterId:', context.characterId);
    console.log('[Story Mode Blueprint] groupId:', context.groupId);
    console.log('[Story Mode Blueprint] characters length:', context.characters?.length);
    console.log('[Story Mode Blueprint] groups length:', context.groups?.length);
    console.log('[Story Mode Blueprint] name1 (user):', context.name1);
    console.log('[Story Mode Blueprint] name2 (character):', context.name2);

    // Get the characters array from context
    const allCharacters = context.characters || [];
    const characterId = context.characterId; // This is an index into the characters array
    const groupId = context.groupId; // This is the selected group ID

    // If we have a group chat, get all group members
    if (groupId && context.groups) {
        // Find the group in the groups array
        const group = context.groups.find(g => g.id === groupId);
        console.log('[Story Mode Blueprint] Found group:', group);
        if (group && group.members) {
            // group.members is an array of character filenames (e.g., "Rosie.png")
            // We need to find each character by matching the filename
            group.members.forEach(memberFilename => {
                // Find the character in allCharacters array by matching filename/avatar
                const charIndex = allCharacters.findIndex(c =>
                    c.filename === memberFilename ||
                    c.avatar === memberFilename ||
                    (typeof c === 'string' && c === memberFilename)
                );
                console.log('[Story Mode Blueprint] Group member:', memberFilename, 'found at index:', charIndex);
                if (charIndex !== -1) {
                    const char = allCharacters[charIndex];
                    if (!characterList.find(c => c.id === charIndex.toString())) {
                        characterList.push({
                            id: charIndex.toString(),
                            name: char.name || `Character ${charIndex}`,
                            role: 'group',
                        });
                    }
                }
            });
        }
    } else if (characterId !== null && characterId !== undefined) {
        // Single character chat - characterId may be string or number
        const charIndex = parseInt(characterId, 10);
        const char = allCharacters[charIndex];
        console.log('[Story Mode Blueprint] Single character check - characterId:', characterId, 'charIndex:', charIndex, 'char:', char);
        if (char) {
            characterList.push({
                id: characterId.toString(),
                name: char.name || 'Current Character',
                role: 'main',
            });
        }
    } else {
        console.log('[Story Mode Blueprint] No character detected, characterId:', characterId, 'allCharacters.length:', allCharacters.length);
    }

    console.log('[Story Mode Blueprint] Final characterList:', characterList);

    if (characterList.length === 0) {
        return '<div style="color: var(--SmartThemeQuoteColor); font-style: italic;">No characters detected - using story context only.</div>';
    }

    return characterList.map(char => `
        <div style="padding: 5px;">
            <label class="checkbox_label" style="display: flex; align-items: center; gap: 8px;">
                <input type="checkbox" name="blueprint_character" value="${char.id}" data-name="${char.name}" checked />
                <span>${char.name}</span>
                <small style="color: var(--SmartThemeQuoteColor);">(${char.role})</small>
            </label>
        </div>
    `).join('');
}

/**
 * Build persona selection list HTML
 * Returns checkboxes for all available user personas
 * @returns {string} HTML string
 */
function buildPersonaSelectionList() {
    // Access power_user for persona data
    if (typeof power_user === 'undefined' || !power_user.personas || !power_user.persona_descriptions) {
        return '<div style="color: var(--SmartThemeQuoteColor); font-style: italic;">No personas available.</div>';
    }

    const personaList = [];
    const personaIds = Object.keys(power_user.personas);

    for (const avatarId of personaIds) {
        const personaName = power_user.personas[avatarId];
        const personaDesc = power_user.persona_descriptions[avatarId];
        if (personaName && personaDesc) {
            personaList.push({
                id: avatarId,
                name: personaName,
                description: personaDesc.description || '',
                title: personaDesc.title || '',
            });
        }
    }

    if (personaList.length === 0) {
        return '<div style="color: var(--SmartThemeQuoteColor); font-style: italic;">No personas defined yet. Create personas in the Persona Management panel.</div>';
    }

    return personaList.map(persona => {
        const displayName = persona.title ? `${persona.name} (${persona.title})` : persona.name;
        const descriptionPreview = persona.description
            ? (persona.description.length > 100 ? persona.description.substring(0, 100) + '...' : persona.description)
            : 'No description';

        return `
            <div style="padding: 5px;">
                <label class="checkbox_label" style="display: flex; align-items: flex-start; gap: 8px;">
                    <input type="checkbox" name="blueprint_persona" value="${persona.id}" data-name="${persona.name}" style="margin-top: 3px;" />
                    <div style="flex: 1;">
                        <span>${displayName}</span>
                        <div style="font-size: 0.85em; color: var(--grey70); font-style: italic; margin-top: 2px;">${descriptionPreview}</div>
                    </div>
                </label>
            </div>
        `;
    }).join('');
}

// ============================================================================
// BLUEPRINT VIEWER & IMPORT/EXPORT
// ============================================================================

/**
 * Export a blueprint to a JSON file
 * @param {Object} blueprint - The blueprint object to export
 */
export function exportBlueprint(blueprint) {
    try {
        const dataStr = JSON.stringify(blueprint, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `story-blueprint-${blueprint.story_type_name || 'blueprint'}-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log('[Story Mode Blueprint] Blueprint exported successfully');
    } catch (error) {
        console.error('[Story Mode Blueprint] Export error:', error);
        toastr.error('Failed to export blueprint: ' + error.message);
    }
}

/**
 * Import a blueprint from a JSON file
 * @param {File} file - The file to import
 * @returns {Promise<Object>} The imported and validated blueprint
 */
export async function importBlueprint(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const rawJson = e.target.result;
                const blueprint = JSON.parse(rawJson);

                // Validate the blueprint
                const validation = validateBlueprint(blueprint);
                if (!validation.valid) {
                    const errorMsg = 'Invalid blueprint: ' + validation.errors.join(', ');
                    console.error('[Story Mode Blueprint] Import validation failed:', validation.errors);
                    toastr.error(errorMsg);
                    reject(new Error(errorMsg));
                    return;
                }

                // Normalize the blueprint (fill in missing fields with defaults)
                const normalizedBlueprint = normalizeBlueprint(blueprint);

                console.log('[Story Mode Blueprint] Blueprint imported and normalized successfully');
                toastr.success('Blueprint imported successfully (missing fields filled with defaults)');
                resolve(normalizedBlueprint);
            } catch (error) {
                console.error('[Story Mode Blueprint] Import error:', error);
                toastr.error('Failed to import blueprint: ' + error.message);
                reject(error);
            }
        };

        reader.onerror = () => {
            const error = new Error('Failed to read file');
            console.error('[Story Mode Blueprint] File read error:', error);
            toastr.error('Failed to read blueprint file');
            reject(error);
        };

        reader.readAsText(file);
    });
}

// ============================================================================
// EXPORTS
// ============================================================================

// Named exports for use with import * as
export {
    getScenarioFromContext,
    buildCharacterSelectionList,
    buildPersonaSelectionList,
};

export default {
    initBlueprintSettings,
    getBlueprintState,
    saveBlueprintState,
    syncBlueprintSettings,
    startStoryFromBlueprint,
    getEffectiveMasterPrompt,
    getEffectiveSceneSummaryPrompt,
    buildBlueprintRequest,
    buildMasterPrompt,
    validateBlueprint,
    normalizeBlueprint,
    parseBlueprintResponse,
    generateBlueprint,
    generateOpeningMessage,
    getScenePacingInfo,
    getCurrentScene,
    advanceSceneIndex,
    setSceneMode,
    buildBlueprintInjection,
    exportBlueprint,
    importBlueprint,
    setStoryTypes,
    setAuthorStyles,
    getStoryTypeById,
    getAuthorStyleById,
    METAPHOR_LEVELS,
    LENGTH_PRESETS,
    getScenarioFromContext,
    buildCharacterSelectionList,
    buildPersonaSelectionList,
};
