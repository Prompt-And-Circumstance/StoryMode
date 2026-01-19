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
import { saveSettingsDebounced, eventSource, event_types, saveMetadata, generateRaw, online_status, main_api, getRequestHeaders, doNewChat } from '/script.js';
import { power_user } from '/scripts/power-user.js';
import { Popup, POPUP_TYPE, callGenericPopup, POPUP_RESULT } from '/scripts/popup.js';
import { getTokenCountAsync } from '/scripts/tokenizers.js';
import { ConnectionManagerRequestService } from '/scripts/extensions/shared.js';
import {
    loadStoryTypes,
    loadAuthorStyles,
    getPacingMode,
    getScenarioState,
    getCurrentSceneIndex,
    setCurrentSceneIndex,
    getChatStoryState,
    saveChatStoryState,
    getBeatState,
    markBeatComplete,
    markBeatSkipped as markBeatSkippedState,
    resetBeatState,
    getCompletedBeatIndices
} from './state-manager.js';
import * as PromptTemplates from './prompt-templates.js';
import { robustParseJSON, validateOpeningMessage, MAX_OPENING_MESSAGE_LENGTH, MIN_OPENING_MESSAGE_LENGTH } from './blueprint-utils.js';
import { isBlueprintDebugMode, getMockPhaseResponse } from './blueprint-debug-mocks.js';
import { MODULE_NAME, METAPHOR_LEVELS, LENGTH_PRESETS, PHASE_CONFIG } from './core/index.js';
import { resolvePlaceholders, checkPrerequisites, validateBlueprint, parseBlueprintResponse, normalizeBlueprint, normalizeCharacterOutcomes, initNormalization } from './blueprint/index.js';
import {
    markBeatCompleted,
    markBeatSkipped,
    isBeatCompleted,
    getCompletedBeats,
    resetBeatProgress,
    resetBeatsForScene,
    setCurrentBeatFocus,
} from './scenario/index.js';
import {
    buildScenarioModeInjection,
    deriveExitTrigger,
    buildSignalsBlock,
} from './scenario/index.js';
import { getLibrary } from './blueprint-integration.js';
import { getCurrentChatCharacters, getAllPersonas } from './blueprint-character-linker.js';
import {
    getBlueprintState,
    saveBlueprintState,
    createRunCopy
} from './blueprint-storage.js';

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
 * Initialize metrics storage on window object
 * Metrics can be accessed via window.__blueprintMetrics for debugging
 */
function initializeMetricsStorage() {
    if (!window.__blueprintMetrics) {
        window.__blueprintMetrics = [];
        console.log('[Story Mode Blueprint] Metrics tracking initialized. Access via: window.__blueprintMetrics');
    }
}

/**
 * Store phase metrics for performance analysis
 * @param {Object} metrics - Metrics object with timing and token data
 */
function storePhaseMetrics(metrics) {
    initializeMetricsStorage();
    window.__blueprintMetrics.push(metrics);

    // Log summary table for easy viewing
    const summary = {
        'Phase': `${metrics.phase} (${metrics.phaseName})`,
        'Duration': `${(metrics.duration / 1000).toFixed(1)}s`,
        'Prompt Tokens': metrics.promptTokens,
        'System Tokens': metrics.systemTokens,
        'Requested Output': metrics.requestedOutputTokens,
        'Actual Output': metrics.actualOutputLength || '?',
        'Tokens/sec': metrics.tokensPerSecond || '?',
        'Success': metrics.success ? '✓' : '✗',
    };

    console.log('[Story Mode Blueprint] Phase Metrics:');
    console.table([summary]);
}

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

// Initialize normalization module with ID functions
// This must happen after generateBlueprintId and isValidBlueprintId are defined
initNormalization(generateBlueprintId, isValidBlueprintId);

/**
 * Default master prompt template for blueprint generation
 * This will be loaded from blueprint-master-prompt.txt on init
 */
let DEFAULT_MASTER_PROMPT = '';

// NOTE: DEFAULT_SCENE_SUMMARY_PROMPT moved to prompt-templates.js
// Use PromptTemplates.getSceneSummaryTemplate() instead

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
 * @property {string} [llmDescriptor] - Human-readable LLM model descriptor (captured at generation time)
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
    "primary_ending": null,
    "alternate_endings": [],
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

// Blueprint state management moved to blueprint-storage.js


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
        getCurrentSceneIndex()
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

    const currentSceneIndex = getCurrentSceneIndex();
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

    const prompt = await buildSummarizationPrompt(messages, blueprintState, sceneIndex, settings);
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
 * @returns {Promise<string>} The summarization prompt
 */
async function buildSummarizationPrompt(messages, blueprintState, sceneIndex, settings) {
    const { blueprint } = blueprintState;
    const scene = blueprint.scene_plan?.[sceneIndex];
    const summaryStyle = settings.blueprintSettings?.summaryStyle || PromptTemplates.SummaryStyle.NARRATIVE;

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

    // Use the new PromptTemplates module
    return await PromptTemplates.buildSceneSummaryPrompt({
        context,
        messages: messagesContent,
        style: summaryStyle,
    });
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
    if (blueprint && blueprint.blueprint_title) {
        return blueprint.blueprint_title;
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

    // Calculate proposed changes WITHOUT applying them yet
    const proposedChanges = {};

    // Check story type change
    if (blueprint.story_type_id) {
        const oldStoryType = chatMetadata[MODULE_NAME].selectedStoryType;
        if (oldStoryType !== blueprint.story_type_id) {
            changes.push('story type');
            detailChanges.push(`Story Type: ${oldStoryType || 'None'} → ${blueprint.story_type_id}`);
            proposedChanges.selectedStoryType = blueprint.story_type_id;
        }
    }

    // Check author style change
    if (Object.prototype.hasOwnProperty.call(blueprint, 'author_style')) {
        const oldAuthorStyle = chatMetadata[MODULE_NAME].selectedAuthorStyle;
        if (oldAuthorStyle !== (blueprint.author_style || '')) {
            changes.push('author style');
            const newStyleDisplay = blueprint.author_style || 'None';
            const oldStyleDisplay = oldAuthorStyle || 'None';
            detailChanges.push(`Author Style: ${oldStyleDisplay} → ${newStyleDisplay}`);
            proposedChanges.selectedAuthorStyle = blueprint.author_style || '';
        }
    }

    // Check arc length change
    const targetMessages = blueprint.arc_structure?.total_messages_target ||
        blueprint.total_messages_target ||
        30;
    const oldArcLength = chatMetadata[MODULE_NAME].arcLength || 30;
    if (oldArcLength !== targetMessages) {
        changes.push('arc length');
        detailChanges.push(`Arc Length: ${oldArcLength} → ${targetMessages} rounds`);
        proposedChanges.arcLength = targetMessages;
    }

    // Check current step change
    const oldStep = chatMetadata[MODULE_NAME].currentStep || 0;
    if (oldStep !== 0) {
        changes.push('current step');
        detailChanges.push(`Current Step: ${oldStep} → 0 (reset)`);
        proposedChanges.currentStep = 0;
    }

    // Check flag changes
    const oldFlags = [];
    if (chatMetadata[MODULE_NAME].arcStarted) {
        oldFlags.push('arc started');
    }
    if (chatMetadata[MODULE_NAME].epilogueShown) {
        oldFlags.push('epilogue shown');
    }
    if (chatMetadata[MODULE_NAME].summaryShown) {
        oldFlags.push('summary shown');
    }
    if (chatMetadata[MODULE_NAME].endNoticeShown) {
        oldFlags.push('end notice shown');
    }

    if (oldFlags.length > 0) {
        changes.push('completion flags');
        detailChanges.push(`Completion Flags Reset: ${oldFlags.join(', ')}`);
        proposedChanges.arcStarted = false;
        proposedChanges.epilogueShown = false;
        proposedChanges.summaryShown = false;
        proposedChanges.endNoticeShown = false;
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
            // User cancelled - do not apply any changes
            console.log('[Story Mode Blueprint] User cancelled sync, no changes applied');
            return { confirmed: false, changes };
        }
    } else {
        console.log('[Story Mode Blueprint] syncBlueprintSettings - Skipping confirmation dialog (showConfirm=' + showConfirm + ', changes.length=' + changes.length + ')');
    }

    // NOW apply the changes after confirmation (or if no confirmation needed)
    if (proposedChanges.selectedStoryType !== undefined) {
        chatMetadata[MODULE_NAME].selectedStoryType = proposedChanges.selectedStoryType;
    }
    if (proposedChanges.selectedAuthorStyle !== undefined) {
        chatMetadata[MODULE_NAME].selectedAuthorStyle = proposedChanges.selectedAuthorStyle;
    }
    if (proposedChanges.arcLength !== undefined) {
        chatMetadata[MODULE_NAME].arcLength = proposedChanges.arcLength;
    }
    if (proposedChanges.currentStep !== undefined) {
        chatMetadata[MODULE_NAME].currentStep = proposedChanges.currentStep;
    }
    if (proposedChanges.arcStarted !== undefined) {
        chatMetadata[MODULE_NAME].arcStarted = proposedChanges.arcStarted;
        chatMetadata[MODULE_NAME].epilogueShown = proposedChanges.epilogueShown;
        chatMetadata[MODULE_NAME].summaryShown = proposedChanges.summaryShown;
        chatMetadata[MODULE_NAME].endNoticeShown = proposedChanges.endNoticeShown;
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
 * 4. Creates a run copy (deep clone) so library/editor blueprints stay pristine
 * 5. Enables all relevant Story Mode features
 * 6. Returns control to caller for opening message generation and dialog close
 *
 * @param {Object} blueprint - The blueprint object to start from
 * @param {Object} options - Optional settings
 * @param {string} options.sourceType - Where the blueprint came from: 'wizard' | 'editor' | 'import' | 'library'
 * @returns {Promise<{success: boolean, warnings?: string[], error?: string}>}
 */
export async function startStoryFromBlueprint(blueprint, options = {}) {
    const { sourceType = 'editor' } = options;
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
            <p><strong>How would you like to proceed?</strong></p>
            <ul style="text-align: left; margin: 10px 0;">
                <li><strong>Start New Chat:</strong> Creates a fresh chat for this blueprint (Recommended).</li>
                <li><strong>Reset Current Chat:</strong> Clears current progress but keeps chat history.</li>
            </ul>
        `;

        const result = await callGenericPopup(warnHtml, POPUP_TYPE.CONFIRM, '', {
            okButton: 'Start New Chat',
            cancelButton: 'Reset Current Chat',
        });

        if (result === POPUP_RESULT.AFFIRMATIVE) {
            // Start New Chat
            console.log('[Story Mode Blueprint] Starting new chat for blueprint...');
            await doNewChat();

            // Re-fetch context after new chat
            // Note: doNewChat should have reset the state, but we'll let the rest of the function run
            // which will sync settings to the new (empty) chat.
        } else if (result === POPUP_RESULT.NEGATIVE) {
            // Reset Current Chat - Show double confirmation?
            // For now, we'll just proceed as the user explicitly chose "Reset Current Chat"
            console.log('[Story Mode Blueprint] Resetting current chat for blueprint...');
        } else {
            // User cancelled (clicked X or outside)
            return { success: false, error: 'User cancelled - story already in progress' };
        }
    }

    // Sync blueprint settings
    await syncBlueprintSettings(blueprint, false);

    // Initialize Scenario Mode state (StoryVerse)
    const newChatState = getChatStoryState();
    newChatState.pacingMode = 'scenario';
    newChatState.scenario = {
        currentSceneIndex: 0,
        beatState: {}
    };
    await saveChatStoryState(newChatState);

    // Ensure blueprint engine is in manual scene mode (Act Director style)
    const blueprintState = getBlueprintState();
    blueprintState.useBlueprint = true;
    blueprintState.blueprint = blueprint;
    blueprintState.sceneMode = 'manual';
    setCurrentSceneIndex(0);

    // Initialize scene summaries tracking if not present
    if (!blueprintState.sceneSummaries) {
        blueprintState.sceneSummaries = {};
    }

    await saveBlueprintState(blueprintState);

    // Refresh UI
    updateStoryPrompt();
    if (typeof window.updateStatusDisplay === 'function') window.updateStatusDisplay();
    if (typeof window.updateWandMenuStatus === 'function') window.updateWandMenuStatus();

    console.log('[Story Mode Blueprint] Story started from blueprint successfully (Scenario Mode active)');

    // Create run copy in chat state (doesn't modify source blueprint)
    // This deep clones the blueprint so library/editor changes won't affect the run
    const runState = createRunCopy(blueprint, sourceType);

    // Enforce Act Director mode (Manual Scene Progression)
    runState.sceneMode = 'manual';
    runState.currentSceneIndex = 0;

    await saveBlueprintState(runState);
    console.log(`[Story Mode Blueprint] Created run copy from ${sourceType} source`);

    // Check for missing characters/personas
    if (blueprint.embeddedResources) {
        const { detectMissingResources } = await import('./blueprint-import.js');
        const { showImportPreviewDialog } = await import('./blueprint-import-ui.js');

        const missing = detectMissingResources(blueprint);

        if (missing.characters.length > 0 || missing.personas.length > 0) {
            toastr.info('This blueprint includes characters/personas. Would you like to import missing ones?');

            // Show preview dialog (non-blocking)
            setTimeout(async () => {
                await showImportPreviewDialog(blueprint.embeddedResources, missing);
            }, 500);
        }
    }

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
 * @returns {Promise<string>} The scene summary prompt template to use
 */
export async function getEffectiveSceneSummaryPrompt() {
    const customTemplate = extension_settings[MODULE_NAME].blueprintSettings?.sceneSummaryPrompt;
    if (customTemplate) {
        return customTemplate;
    }

    return await PromptTemplates.getSceneSummaryTemplate();
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
 * @returns {Promise<string>} The instructions for the selected metaphor level
 */
/**
 * Build metaphor instructions from template
 * @param {string} metaphorLevel - Metaphor level setting
 * @returns {Promise<string>} Metaphor instructions text
 */
async function buildMetaphorInstructions(metaphorLevel) {
    return await PromptTemplates.getMetaphorInstructions(metaphorLevel);
}

/**
 * Build author style section for prompts
 * @param {Object} authorStyle - Author style object
 * @returns {string} Formatted author style section
 */
function buildAuthorStyleSection(authorStyle) {
    if (!authorStyle || !authorStyle.authorPrompt) {
        return `
### NO AUTHOR STYLE SPECIFIED

No explicit author style has been requested. Generate the blueprint using the STORY TYPE's default tone and narrative conventions. You may draw on common storytelling best practices and the emotional/thematic underpinnings of the story type itself.
`;
    }

    const styleParts = [`**User-specified author style:** ${authorStyle.name}`];

    if (authorStyle.category) {
        styleParts.push(`- **Category**: ${authorStyle.category}`);
    }

    styleParts.push(`- **Tone and voice**: ${authorStyle.authorPrompt}`);

    if (authorStyle.nsfwPrompt) {
        styleParts.push(`- **NSFW guidance**: ${authorStyle.nsfwPrompt}`);
    }

    if (authorStyle.heatLevel) {
        styleParts.push(`- **Spice level**: ${authorStyle.heatLevel}/5`);
    }

    return `
### AUTHOR STYLE GUIDANCE

${styleParts.join('\n')}

You MUST adopt this style's tone, voice, structure, and characteristic narrative devices throughout the blueprint.

ACTIVE STYLE APPLICATION:
1. Analyze the STORY TYPE JSON. Actively use its defined 'tropes', 'themes', and 'structure' to inform your scene choices. Do not simply treat it as metadata.
2. Consider *how* ${authorStyle.name} would handle these plot points. Would they focus on internal monologue? Visceral action? Social dynamics? Adjust your scene descriptions to reflect this focus.

Apply the style to:
- Descriptions of scenes, settings, and situations.
- Antagonistic forces (how they behave, what they represent).
- Character arc language and emotional beats.
- Choice points and decision descriptions.
- The 'tone_and_style' section itself.

**Note:** Style should enhance but never override the user's scenario, character data, or genre interpretation level.
`;
}

/**
 * Build persona section for prompts
 * @param {Array<Object>} personaData - Array of persona references
 * @returns {string} Formatted persona section or empty string
 */
function buildPersonaSection(personaData) {
    if (!personaData || personaData.length === 0) {
        return '';
    }

    if (typeof power_user === 'undefined' || !power_user.personas || !power_user.persona_descriptions) {
        return '';
    }

    const personaDataStr = personaData.map(personaRef => {
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
        }

        return `**Persona: ${personaRef.name}**\nDescription: Persona data not available\n`;
    }).join('\n---\n');

    return `---

### PERSONA DATA

${personaDataStr}

This PERSONA_DATA includes optional user personas that define the player character's identity, personality, and behavior in this story.

**You MUST:**
- Treat personas as defining the player character's role and perspective in the story.
- Incorporate persona traits, goals, and behaviors into the protagonist_group and character_arcs.
- If a persona is provided, it represents who the player is role-playing as in this narrative.

---`;
}

/**
 * Build character data section for prompts
 * @param {Array<Object>} characterData - Array of character objects
 * @returns {string} Formatted character data section
 */
function buildCharacterDataSection(characterData) {
    if (!characterData || characterData.length === 0) {
        return 'No specific character data provided.';
    }

    return characterData.map(char => {
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
}

/**
 * Build the master prompt with template variable replacement
 * @param {Object} request - Blueprint request object
 * @param {Object} storyType - Story type object (with storyPrompt, phasePrompts, etc.)
 * @param {Object} authorStyle - Author style object (optional)
 * @returns {Promise<string>} The complete master prompt
 */
export async function buildMasterPrompt(request, storyType, authorStyle) {
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

    // Build prompt sections using helper functions
    const authorStyleSection = buildAuthorStyleSection(authorStyle);
    const personaSection = buildPersonaSection(request.persona_data);
    const characterDataStr = buildCharacterDataSection(request.character_data);
    const metaphorInstructions = await buildMetaphorInstructions(request.genre_interpretation.metaphor_level);

    if (request.character_data && request.character_data.length > 0) {
        console.log('[Story Mode Blueprint] Processing', request.character_data.length, 'characters');
    }

    // Calculate expected scene count based on target rounds
    const expectedSceneCount = getExpectedSceneCount(request.total_messages_target);

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

// ============================================================================
// PHASED GENERATION FUNCTIONS
// ============================================================================

/**
 * Build a phase-specific prompt for phased blueprint generation
 * Dispatcher function that routes to the appropriate phase prompt builder
 * @param {number} phase - Phase number (1-5)
 * @param {Object} request - Blueprint request object
 * @param {Object} storyType - Story type object
 * @param {Object} authorStyle - Author style object (optional)
 * @param {Object} partialBlueprint - Partial blueprint from previous phases
 * @returns {Promise<string>} Phase-specific prompt
 */
export async function buildPhasePrompt(phase, request, storyType, authorStyle, partialBlueprint = {}) {
    switch (phase) {
        case 1:
            return buildFoundationPrompt(request, storyType, authorStyle);
        case 2:
            return buildCharactersPrompt(request, storyType, authorStyle, partialBlueprint);
        case 3:
            return buildScenesPrompt(request, storyType, authorStyle, partialBlueprint);
        case 4:
            return buildResolutionsPrompt(request, storyType, authorStyle, partialBlueprint);
        default:
            throw new Error(`Invalid phase: ${phase}`);
    }
}

/**
 * Build Phase 1: Foundation prompt
 * Generates core_premise, setting, antagonistic_forces, arc_structure, tone_and_style
 * @param {Object} request - Blueprint request object
 * @param {Object} storyType - Story type object
 * @param {Object} authorStyle - Author style object (optional)
 * @returns {Promise<string>} Foundation phase prompt
 */
async function buildFoundationPrompt(request, storyType, authorStyle) {
    const authorStyleSection = buildAuthorStyleSection(authorStyle);
    const personaSection = buildPersonaSection(request.persona_data);
    const characterDataStr = buildCharacterDataSection(request.character_data);
    const metaphorInstructions = await buildMetaphorInstructions(request.genre_interpretation.metaphor_level);
    const expectedSceneCount = getExpectedSceneCount(request.total_messages_target);

    return await PromptTemplates.buildFoundationPrompt({
        storyTypeName: storyType.name,
        storyTypeJson: JSON.stringify(storyType, null, 2),
        authorStyleSection,
        characterData: characterDataStr,
        personaSection,
        userScenario: request.user_scenario || 'No specific scenario provided.',
        metaphorLevel: request.genre_interpretation.metaphor_level,
        metaphorInstructions,
        totalMessagesTarget: request.total_messages_target,
        expectedSceneCount,
    });
}

/**
 * Build Phase 2: Characters prompt
 * Generates protagonist_group and character_arcs
 * Uses different template based on whether character data was provided
 * @param {Object} request - Blueprint request object
 * @param {Object} storyType - Story type object
 * @param {Object} authorStyle - Author style object (optional)
 * @param {Object} partialBlueprint - Blueprint from Phase 1
 * @returns {Promise<string>} Characters phase prompt
 */
async function buildCharactersPrompt(request, storyType, authorStyle, partialBlueprint) {
    const foundation = partialBlueprint.core_premise || '';
    const setting = partialBlueprint.setting || {};
    const antagonist = partialBlueprint.antagonistic_forces || {};
    const arcStructure = partialBlueprint.arc_structure || {};
    const toneAndStyle = partialBlueprint.tone_and_style || {};

    // Build author style section
    let authorStyleSection = '';
    if (authorStyle && authorStyle.authorPrompt) {
        const styleParts = [`**User-specified author style:** ${authorStyle.name}`];

        if (authorStyle.category) {
            styleParts.push(`- **Category**: ${authorStyle.category}`);
        }

        styleParts.push(`- **Tone and voice**: ${authorStyle.authorPrompt}`);

        if (authorStyle.nsfwPrompt) {
            styleParts.push(`- **NSFW guidance**: ${authorStyle.nsfwPrompt}`);
        }

        if (authorStyle.heatLevel) {
            styleParts.push(`- **Spice level**: ${authorStyle.heatLevel}/5`);
        }

        authorStyleSection = `
### AUTHOR STYLE GUIDANCE

${styleParts.join('\n')}

You MUST adopt this style's tone, voice, structure, and characteristic narrative devices throughout the blueprint.

Apply the style to:
- Character descriptions and emotional arcs.
- Group dynamics and interpersonal relationships.
- Emotional trajectory descriptions.
- Character motivation and behavior.

**Note:** Style should enhance but never override the user's scenario or genre interpretation level.
`;
    } else {
        authorStyleSection = `
### NO AUTHOR STYLE SPECIFIED

No explicit author style has been requested. Generate the blueprint using the STORY TYPE's default tone and narrative conventions. You may draw on common storytelling best practices and the emotional/thematic underpinnings of the story type itself.
`;
    }

    // Build persona section
    const personaSection = buildPersonaSection(request.persona_data);

    // Build character data section
    const characterDataStr = buildCharacterDataSection(request.character_data);

    // Get metaphor instructions
    const metaphorInstructions = await buildMetaphorInstructions(request.genre_interpretation.metaphor_level);

    // Calculate expected scene count
    const expectedSceneCount = getExpectedSceneCount(request.total_messages_target);

    // Determine which template to use based on whether character data was provided
    const hasCharacterData = request.character_data && request.character_data.length > 0;

    const builderParams = {
        storyTypeName: storyType.name,
        storyTypeJson: JSON.stringify(storyType, null, 2),
        foundation,
        setting,
        antagonist,
        arcStructure,
        toneAndStyle,
        personaSection,
        authorStyleSection,
        userScenario: request.user_scenario || 'No specific scenario provided.',
        metaphorLevel: request.genre_interpretation.metaphor_level,
        metaphorInstructions,
        totalMessagesTarget: request.total_messages_target,
        expectedSceneCount,
    };

    if (hasCharacterData) {
        console.log('[Story Mode Blueprint] Phase 2: Using provided character data template');
        return await PromptTemplates.buildCharactersPromptWithData({
            ...builderParams,
            characterData: characterDataStr,
        });
    } else {
        console.log('[Story Mode Blueprint] Phase 2: Using generate new characters template');
        return await PromptTemplates.buildCharactersPromptGenerate(builderParams);
    }
}

/**
 * Build Phase 3: Scenes prompt
 * Generates scene_plan with beats (scene-by-scene generation)
 * @param {Object} request - Blueprint request object
 * @param {Object} storyType - Story type object
 * @param {Object} authorStyle - Author style object (optional)
 * @param {Object} partialBlueprint - Blueprint from Phases 1-2
 * @returns {Promise<string>} Scenes phase prompt
 */
async function buildScenesPrompt(request, storyType, authorStyle, partialBlueprint) {
    const foundation = partialBlueprint.core_premise || '';
    const setting = partialBlueprint.setting || {};
    const antagonist = partialBlueprint.antagonistic_forces || {};
    const arcStructure = partialBlueprint.arc_structure || {};
    const toneAndStyle = partialBlueprint.tone_and_style || {};
    const protagonistGroup = partialBlueprint.protagonist_group || {};
    const characters = partialBlueprint.character_arcs || [];
    const expectedSceneCount = getExpectedSceneCount(request.total_messages_target);

    // Build author style section
    let authorStyleSection = '';
    if (authorStyle && authorStyle.authorPrompt) {
        const styleParts = [`**User-specified author style:** ${authorStyle.name}`];
        if (authorStyle.category) {
            styleParts.push(`- **Category**: ${authorStyle.category}`);
        }
        styleParts.push(`- **Tone and voice**: ${authorStyle.authorPrompt}`);
        if (authorStyle.narrativeTechniques) {
            styleParts.push(`- **Narrative techniques**: ${authorStyle.narrativeTechniques}`);
        }
        if (authorStyle.dialogueStyle) {
            styleParts.push(`- **Dialogue style**: ${authorStyle.dialogueStyle}`);
        }
        if (authorStyle.pacingApproach) {
            styleParts.push(`- **Pacing**: ${authorStyle.pacingApproach}`);
        }
        if (authorStyle.thematicFocus) {
            styleParts.push(`- **Thematic focus**: ${authorStyle.thematicFocus}`);
        }

        authorStyleSection = `
### AUTHOR STYLE GUIDANCE
${styleParts.join('\n')}

Apply this author's stylistic approach to the scene generation—emulate their voice, pacing, and sentence structure. Ensure ${authorStyle.name}'s distinctive qualities are present in how scenes are structured and described.
`;
    }

    // Build persona section
    const personaSection = buildPersonaSection(request.persona_data);

    // Get metaphor instructions
    const metaphorInstructions = await buildMetaphorInstructions(request.genre_interpretation.metaphor_level);

    return await PromptTemplates.buildScenesPrompt({
        storyTypeName: storyType.name,
        storyTypeJson: JSON.stringify(storyType, null, 2),
        foundation,
        setting,
        antagonist,
        arcStructure,
        toneAndStyle,
        protagonistGroup,
        characters,
        personaSection,
        authorStyleSection,
        userScenario: request.user_scenario || 'No specific scenario provided.',
        metaphorLevel: request.genre_interpretation.metaphor_level,
        metaphorInstructions,
        totalMessagesTarget: request.total_messages_target,
        expectedSceneCount,
        memorableElement: storyType.memorableElement,
    });
}

/**
 * Build Phase 4: Resolutions prompt
 * Generates possible_resolutions, blueprint_title, cover_prompt
 * @param {Object} request - Blueprint request object
 * @param {Object} storyType - Story type object
 * @param {Object} authorStyle - Author style object (optional)
 * @param {Object} partialBlueprint - Blueprint from Phases 1-3
 * @returns {Promise<string>} Resolutions phase prompt
 */
async function buildResolutionsPrompt(request, storyType, authorStyle, partialBlueprint) {
    const foundation = partialBlueprint.core_premise || '';
    const setting = partialBlueprint.setting || {};
    const antagonist = partialBlueprint.antagonistic_forces || {};
    const arcStructure = partialBlueprint.arc_structure || {};
    const toneAndStyle = partialBlueprint.tone_and_style || {};
    const protagonistGroup = partialBlueprint.protagonist_group || {};
    const characters = partialBlueprint.character_arcs || [];
    const scenes = partialBlueprint.scene_plan || [];

    // Build author style section (matching buildMasterPrompt pattern)
    let authorStyleSection = '';
    if (authorStyle && authorStyle.authorPrompt) {
        const styleParts = [`**User-specified author style:** ${authorStyle.name}`];
        if (authorStyle.category) {
            styleParts.push(`- **Category**: ${authorStyle.category}`);
        }
        styleParts.push(`- **Tone and voice**: ${authorStyle.authorPrompt}`);
        if (authorStyle.narrativeTechniques) {
            styleParts.push(`- **Narrative techniques**: ${authorStyle.narrativeTechniques}`);
        }
        if (authorStyle.dialogueStyle) {
            styleParts.push(`- **Dialogue style**: ${authorStyle.dialogueStyle}`);
        }
        if (authorStyle.pacingApproach) {
            styleParts.push(`- **Pacing**: ${authorStyle.pacingApproach}`);
        }
        if (authorStyle.thematicFocus) {
            styleParts.push(`- **Thematic focus**: ${authorStyle.thematicFocus}`);
        }

        authorStyleSection = `
### AUTHOR STYLE GUIDANCE
${styleParts.join('\n')}

Apply this author's stylistic approach to the resolution generation—consider how they would handle endings, themes, and character outcomes. Ensure ${authorStyle.name}'s distinctive qualities are present in how resolutions are structured.
`;
    }

    // Build persona section
    const personaSection = buildPersonaSection(request.persona_data);

    // Get metaphor instructions
    const metaphorInstructions = await buildMetaphorInstructions(request.genre_interpretation.metaphor_level);

    return await PromptTemplates.buildResolutionsPrompt({
        storyTypeName: storyType.name,
        storyTypeJson: JSON.stringify(storyType, null, 2),
        foundation,
        setting,
        antagonist,
        arcStructure,
        toneAndStyle,
        protagonistGroup,
        characters,
        personaSection,
        authorStyleSection,
        userScenario: request.user_scenario || 'No specific scenario provided.',
        metaphorLevel: request.genre_interpretation.metaphor_level,
        metaphorInstructions,
        sceneCount: scenes.length,
        scenes: scenes,
    });
}



/**
 * Get expected scene count based on target rounds
 * @param {number} totalRounds - Target number of rounds
 * @returns {string} Expected scene count description
 */
function getExpectedSceneCount(totalRounds) {
    if (totalRounds <= 12) {
        return '~5–7 scenes';
    } else if (totalRounds <= 30) {
        return '~8–12 scenes';
    } else if (totalRounds <= 60) {
        return '~12–20 scenes';
    } else if (totalRounds <= 120) {
        return '~20–30 scenes';
    } else {
        const scenesPerRound = 0.25;
        const calculatedScenes = Math.max(30, Math.round(totalRounds * scenesPerRound));
        return `~${calculatedScenes}–${calculatedScenes + 10} scenes`;
    }
}

/**
 * Generate a blueprint name from the blueprint title or core premise
 * @param {Object} blueprint - Blueprint object
 * @returns {string} Generated name
 */
export function generateBlueprintName(blueprint) {
    if (blueprint.blueprint_title) {
        return blueprint.blueprint_title;
    }
    if (blueprint.core_premise) {
        // Extract first 50 characters of premise as fallback
        return blueprint.core_premise.substring(0, 50) + '...';
    }
    return 'Untitled Blueprint';
}

/**
 * Generate a blueprint using phased generation
 * @param {Object} request - Blueprint request object
 * @param {Array} storyTypes - Array of available story types
 * @param {Array} authorStyles - Array of available author styles
 * @param {Function} onPhaseUpdate - Callback for phase updates (phase, progress, data)
 * @returns {Promise<Object>} Generated blueprint or error
 */
/**
 * Generate a blueprint using phased approach (5 phases)
 * @param {Object} request - Blueprint request object
 * @param {Array} storyTypes - Available story types
 * @param {Array} authorStyles - Available author styles
 * @param {Function} onPhaseUpdate - Callback for phase updates (phase, progress, data)
 * @param {Object} options - Generation options
 * @param {number} options.startPhase - Phase to start from (1-5, default: 1)
 * @param {Object} options.partialBlueprint - Partial blueprint to continue from
 * @returns {Promise<Object>} Result object with success, blueprint, and error info
 */
export async function generateBlueprintPhased(request, storyTypes, authorStyles, onPhaseUpdate, options = {}) {
    const { startPhase = 1, partialBlueprint: initialBlueprint = null, phaseTokenOverrides = {} } = options;

    try {
        // Find story type and author style
        const storyType = storyTypes.find(t => t.id === request.story_type_id);
        if (!storyType) {
            throw new Error(`Story type not found: ${request.story_type_id}`);
        }

        const authorStyle = request.author_style
            ? authorStyles.find(s => s.id === request.author_style)
            : null;

        // Capture the selected profile ID
        const selectedProfileId = extension_settings[MODULE_NAME]?.blueprintSettings?.generationApi || null;

        // Initialize or continue with partial blueprint
        const partialBlueprint = initialBlueprint || {
            story_type_id: request.story_type_id,
            story_type_name: storyType.name,
        };
        // Ensure blueprint_id exists (for both new and retry scenarios)
        if (!partialBlueprint.blueprint_id) {
            partialBlueprint.blueprint_id = generateBlueprintId();
        }

        // Track token usage per phase for error reporting
        const phaseTokensUsed = {};

        // Execute phases from startPhase to 5
        for (const phaseNum of [1, 2, 3, 4].filter(p => p >= startPhase)) {
            const config = PHASE_CONFIG[phaseNum];

            // Emit phase update BEFORE starting (to show this phase as "current")
            onPhaseUpdate?.(phaseNum, config.progress, {
                phase: config.name,
                description: config.description,
                partialBlueprint
            });

            try {
                const phaseResult = await executePhase(phaseNum, request, storyType, authorStyle, partialBlueprint, selectedProfileId, phaseTokenOverrides);
                Object.assign(partialBlueprint, validatePhaseResult(phaseResult, phaseNum));
            } catch (phaseError) {
                console.error(`[Story Mode Blueprint] Phase ${phaseNum} error:`, phaseError);
                const errorResult = {
                    success: false,
                    error: phaseError.message,
                    rawResponse: phaseError.rawResponse || null,
                    phase: phaseNum,
                    phaseName: config.name,
                    phaseTokensUsed: phaseError.tokensUsed || phaseTokenOverrides[phaseNum] || config.maxTokens,
                    partialBlueprint: { ...partialBlueprint },
                    request: { ...request }
                };
                // Emit error event with phase information
                onPhaseUpdate?.(phaseNum, config.progress, {
                    phase: config.name,
                    description: config.description,
                    partialBlueprint,
                    error: errorResult
                });
                return errorResult;
            }
        }

        // Add metadata
        partialBlueprint.arc_structure = partialBlueprint.arc_structure || {};
        partialBlueprint.arc_structure.total_messages_target = request.total_messages_target;
        partialBlueprint.author_style = request.author_style;

        if (request.author_style && authorStyles) {
            const authorStyleObj = authorStyles.find(s => s.id === request.author_style);
            if (authorStyleObj) {
                partialBlueprint.author_style_name = authorStyleObj.name;
                partialBlueprint.author_style_prompt = authorStyleObj.authorPrompt;
            }
        }

        // Capture LLM descriptor
        if (selectedProfileId) {
            const profiles = getConnectionProfiles();
            const usedProfile = profiles.find(p => p.id === selectedProfileId);
            if (usedProfile && usedProfile.model) {
                partialBlueprint.llmDescriptor = usedProfile.model;
            } else {
                // Safely extract profile ID prefix for display
                const profilePrefix = selectedProfileId && typeof selectedProfileId === 'string' && selectedProfileId.length >= 8
                    ? selectedProfileId.substring(0, 8)
                    : '????????';
                partialBlueprint.llmDescriptor = `Unknown Profile (${profilePrefix}...)`;
            }
        } else {
            partialBlueprint.llmDescriptor = `Main API (${main_api || 'Unknown'})`;
        }

        console.log('[Story Mode Blueprint] Phased generation complete:', partialBlueprint.blueprint_id);

        return {
            success: true,
            blueprint: partialBlueprint,
        };
    } catch (error) {
        console.error('[Story Mode Blueprint] Phased generation error:', error);
        return {
            success: false,
            error: error.message,
            partialBlueprint: initialBlueprint || null,
            request: { ...request }
        };
    }
}

/**
 * Generate an opening message for the blueprint
 * @param {Object} blueprint - The blueprint object
 * @param {string} [modelOverride] - Optional model override
 * @returns {Promise<string>} Generated opening message
 */
export async function generateOpeningMessage(blueprint, modelOverride = null) {
    // Validate blueprint has required data
    if (!blueprint.scene_plan || blueprint.scene_plan.length === 0) {
        throw new Error('Blueprint must have at least one scene to generate an opening message.');
    }

    const firstScene = blueprint.scene_plan[0];
    const setting = blueprint.setting || {};
    const antagonist = blueprint.antagonistic_forces || {};
    const arcStructure = blueprint.arc_structure || {};
    const toneAndStyle = blueprint.tone_and_style || {};
    const protagonistGroup = blueprint.protagonist_group || {};
    const characters = blueprint.character_arcs || [];

    // Build prompt with full blueprint context
    const prompt = await PromptTemplates.buildOpeningMessagePrompt({
        corePremise: blueprint.core_premise,
        location: setting.location || 'Unknown',
        timePeriod: setting.time_period || 'Unknown',
        atmosphere: setting.atmosphere || 'Unknown',
        antagonist,
        arcStructure,
        toneAndStyle,
        protagonistGroup,
        characters,
        sceneTitle: firstScene.title,
        scenePhase: firstScene.phase,
        scenePurpose: firstScene.purpose,
        sceneSituation: firstScene.situation,
    });

    const systemPrompt = 'You are an expert story narrator. Write a compelling opening message for an interactive story.';

    // Build messages array for the LLM
    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
    ];

    // Call LLM using SillyTavern's built-in generateRaw
    // This avoids connection profile complications and uses the main API
    console.log('[Story Mode] Generating opening message...');
    const response = await generateRaw(prompt, '', false, false, systemPrompt);

    if (!response) {
        throw new Error('No response from LLM');
    }

    return response.trim();
}

/**
 * Validate that a phase result is safe to merge into the blueprint
 * Checks for null, primitive types, arrays, and prototype pollution attempts
 * @param {Object} phaseResult - Result from executePhase
 * @param {number} phase - Phase number for error reporting
 * @returns {Object} Validated phase result
 * @throws {Error} If phase result is invalid
 */
function validatePhaseResult(phaseResult, phase) {
    // Reject null/undefined
    if (!phaseResult || typeof phaseResult !== 'object') {
        throw new Error(`Phase ${phase}: Invalid result - expected object, got ${typeof phaseResult}`);
    }

    // Reject arrays
    if (Array.isArray(phaseResult)) {
        throw new Error(`Phase ${phase}: Invalid result - expected object, got array`);
    }

    // Check for prototype pollution attempts
    const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
    for (const key of dangerousKeys) {
        if (Object.prototype.hasOwnProperty.call(phaseResult, key)) {
            throw new Error(`Phase ${phase}: Invalid result - dangerous key "${key}" detected`);
        }
    }

    return phaseResult;
}

/**
 * Execute a single phase of generation
 * @param {number} phase - Phase number (1-5)
 * @param {Object} request - Blueprint request object
 * @param {Object} storyType - Story type object
 * @param {Object} authorStyle - Author style object (optional)
 * @param {Object} partialBlueprint - Partial blueprint from previous phases
 * @param {string} selectedProfileId - Connection Manager profile ID
 * @param {Object} phaseTokenOverrides - Optional token overrides per phase {phaseNum: maxTokens}
 * @returns {Promise<Object>} Phase result data
 */
/**
 * Validate output for a specific phase
 * @param {number} phase - Phase number
 * @param {Object} data - Phase output data
 * @throws {Error} If validation fails
 */
function validatePhaseOutput(phase, data) {
    if (!data || typeof data !== 'object') {
        throw new Error('Output must be an object');
    }

    if (phase === 3) { // Scenes Phase
        if (!data.scene_plan || !Array.isArray(data.scene_plan)) {
            throw new Error('Response missing "scene_plan" array');
        }
        if (data.scene_plan.length === 0) {
            throw new Error('Scene plan is empty');
        }

        // Strict validation for beats
        data.scene_plan.forEach((scene, index) => {
            if (!scene.beats || !Array.isArray(scene.beats) || scene.beats.length === 0) {
                throw new Error(`Scene ${index + 1} ("${scene.title || 'Untitled'}") is missing "beats" array. Every scene must have at least 3 beats.`);
            }
        });
    }

    if (phase === 4) { // Resolutions Phase
        if (!data.primary_ending) {
            throw new Error('Response missing "primary_ending"');
        }
        if (!data.blueprint_title && !data.title) {
            // check if title is elsewhere or optional? Schema says required in validateBlueprint but maybe less critical here.
            // Let's enforce it.
            if (!data.blueprint_title) throw new Error('Response missing "blueprint_title"');
        }
    }

    return true;
}

/**
 * Execute a single phase of generation with retries
 * @param {number} phase - Phase number (1-5)
 * @param {Object} request - Blueprint request object
 * @param {Object} storyType - Story type object
 * @param {Object} authorStyle - Author style object (optional)
 * @param {Object} partialBlueprint - Partial blueprint from previous phases
 * @param {string} selectedProfileId - Connection Manager profile ID
 * @param {Object} phaseTokenOverrides - Optional token overrides per phase {phaseNum: maxTokens}
 * @returns {Promise<Object>} Phase result data
 */
async function executePhase(phase, request, storyType, authorStyle, partialBlueprint, selectedProfileId, phaseTokenOverrides = {}) {
    const MAX_RETRIES = 2; // Try up to 3 times total (1 initial + 2 retries)
    let lastError = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            // Build phase prompt
            const prompt = await buildPhasePrompt(phase, request, storyType, authorStyle, partialBlueprint);

            // Add retry guidance if this is a retry
            let systemPrompt = 'You are an expert story designer';

            // PERSONA INJECTION: Prime the model with the specific author style
            if (authorStyle && authorStyle.name) {
                systemPrompt += ` specializing in ${storyType.name} stories, writing in the distinct style of ${authorStyle.name}.`;
            } else {
                systemPrompt += '.';
            }

            systemPrompt += ' Output ONLY valid JSON as specified.';

            if (attempt > 0 && lastError) {
                console.log(`[Story Mode Blueprint] Retry attempt ${attempt}/${MAX_RETRIES} for Phase ${phase}. Previous error: ${lastError.message}`);
                systemPrompt += `\n\nPREVIOUS ERROR: Your last response was invalid: ${lastError.message}\nFix this specific error in your new response. Ensure all required fields (like 'beats' arrays) are present.`;
            }

            console.log(`[Story Mode Blueprint] Executing Phase ${phase} (${PHASE_CONFIG[phase].name}) - Attempt ${attempt + 1}/${MAX_RETRIES + 1}...`);

            // Call LLM with phase-specific token limit (use override if provided)
            const phaseConfig = PHASE_CONFIG[phase];
            const maxTokens = phaseTokenOverrides[phase] || phaseConfig.maxTokens;

            // Log token usage
            if (phaseTokenOverrides[phase]) {
                console.log(`[Story Mode Blueprint] Phase ${phase} using OVERRIDDEN token limit: ${maxTokens} (default: ${phaseConfig.maxTokens})`);
            } else {
                console.log(`[Story Mode Blueprint] Phase ${phase} using default token limit: ${maxTokens}`);
            }

            // Check if debug mode is enabled - use mock LLM responses
            let rawText;
            if (isBlueprintDebugMode()) {
                console.log(`[Story Mode Blueprint] DEBUG MODE ENABLED - Using mock response for Phase ${phase}`);
                const mockData = getMockPhaseResponse(phase);
                rawText = JSON.stringify(mockData, null, 2);
                // Simulate a small delay to make it feel more realistic
                await new Promise(resolve => setTimeout(resolve, 500));
            } else {
                rawText = await generateWithPreset({
                    prompt: prompt,
                    systemPrompt: systemPrompt,
                    responseLength: maxTokens,
                    profileId: selectedProfileId,
                    phase: phase, // For metrics tracking
                    phaseName: phaseConfig.name, // For metrics display
                });
            }

            // Log response details for debugging
            console.log(`[Story Mode Blueprint] Phase ${phase} response length:`, rawText?.length || 0);

            if (!rawText || rawText.trim().length === 0) {
                const error = new Error(
                    `Phase ${phase}: Empty response from LLM (using ${maxTokens} tokens). ` +
                    `This may occur with reasoning models that consume all tokens on reasoning. ` +
                    `Try clicking Retry to automatically increase the token limit.`
                );
                error.tokensUsed = maxTokens; // Attach for error handling
                throw error;
            }

            // Parse JSON response
            let phaseData;
            try {
                phaseData = robustParseJSON(rawText);
            } catch (parseError) {
                console.error(`[Story Mode Blueprint] Phase ${phase} parse error:`, parseError);
                console.error(`[Story Mode Blueprint] Raw response preview:`, rawText.substring(0, 500));
                const error = new Error(`Phase ${phase}: Failed to parse JSON response`);
                error.rawResponse = rawText; // Attach raw response for debugging
                error.tokensUsed = maxTokens; // Attach for error handling
                throw error;
            }

            // VALIDATE PHASE OUTPUT (New Validation Step)
            validatePhaseOutput(phase, phaseData);

            console.log(`[Story Mode Blueprint] Phase ${phase} complete:`, Object.keys(phaseData));

            return phaseData;

        } catch (error) {
            lastError = error;
            console.warn(`[Story Mode Blueprint] Phase ${phase} failed attempt ${attempt + 1}: ${error.message}`);

            // If we have retries left, continue loop
            if (attempt < MAX_RETRIES) {
                continue;
            }

            // If no retries left, attach info and rethrow
            if (!error.tokensUsed) {
                // Add token usage helper if not present, though executePhase logic usually adds it
                // We can't easily access maxTokens here unless we duplicate logic, but it's fine
            }
            throw error;
        }
    }
}

/**
 * Validate a blueprint object against required schema
 * Handles both string format ("CharacterName: outcome") and object format ({character_name, outcome})
 * @param {Object} blueprint - Blueprint object to normalize
    return normalized;
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
 * @param {Object} options - Generation options
 * @param {boolean} options.phased - Whether to use phased generation (default: false)
 * @returns {Object} Generated blueprint or error
 */
export async function generateBlueprint(request, storyTypes, authorStyles, options = {}) {
    const { phased = false, startPhase, partialBlueprint } = options;

    // Use phased generation if requested
    if (phased) {
        return generateBlueprintPhased(request, storyTypes, authorStyles, (phase, progress, data) => {
            // Emit phase update event (including error if present)
            eventSource.emit('STORY_MODE_PHASE_UPDATE', {
                phase,
                progress,
                blueprint: data?.partialBlueprint || {},
                error: data?.error || null,
            });
        }, { startPhase, partialBlueprint });
    }

    // Otherwise use traditional single-shot generation
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
        const masterPrompt = await buildMasterPrompt(request, storyType, authorStyle);

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

            // Capture LLM descriptor from the profile used for generation
            if (selectedProfileId) {
                const profiles = getConnectionProfiles();
                const usedProfile = profiles.find(p => p.id === selectedProfileId);
                if (usedProfile && usedProfile.model) {
                    blueprint.llmDescriptor = usedProfile.model; // e.g., "gpt-4-turbo-preview", "claude-opus-4-1"
                } else {
                    // Profile selected but not found (deleted/invalid)
                    blueprint.llmDescriptor = `Unknown Profile (${selectedProfileId.substring(0, 8)}...)`;
                }
            } else {
                // No profile selected - using main API
                blueprint.llmDescriptor = `Main API (${main_api || 'Unknown'})`;
            }
            console.log('[Story Mode Blueprint] Assigned blueprint ID:', blueprint.blueprint_id, 'LLM:', blueprint.llmDescriptor);

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
/**
 * Calculate scene pacing information for pacing contracts
 * @param {Object} blueprint - The blueprint object
 * @param {number} currentStep - Current round/step in the story
 * @param {number} arcLength - Total arc length (rounds)
 * @param {string} sceneMode - 'auto' or 'manual'
 * @param {number} manualSceneIndex - Manual scene index (for manual mode)
 * @returns {Object|null} Pacing info or null if no blueprint
 */
export function getScenePacingInfo(blueprint, currentStep, arcLength, sceneMode = 'auto', manualSceneIndex = 0) {
    if (!blueprint || !blueprint.scene_plan || blueprint.scene_plan.length === 0) {
        return null;
    }

    const totalScenes = blueprint.scene_plan.length;

    // Check if any scenes have explicit expected_rounds
    const hasExplicitRounds = blueprint.scene_plan.some(s => s.expected_rounds && typeof s.expected_rounds === 'number');

    let sceneIndex, clampedSceneIndex, scene, sceneStartRound, sceneEndRound, expectedSceneRounds;

    // Helper to calculate scene boundaries (needed for both modes)
    const calculateSceneBoundaries = () => {
        if (hasExplicitRounds) {
            // Use explicit scene durations
            const explicitTotal = blueprint.scene_plan.reduce((sum, s) =>
                sum + (s.expected_rounds || 0), 0
            );
            const scenesWithoutRounds = blueprint.scene_plan.filter(s => !s.expected_rounds).length;
            const remainingRounds = Math.max(0, arcLength - explicitTotal);
            const roundsPerDynamicScene = scenesWithoutRounds > 0
                ? Math.floor(remainingRounds / scenesWithoutRounds)
                : 0;

            let cumulativeRounds = 0;
            const boundaries = [];
            for (let i = 0; i < totalScenes; i++) {
                const sceneRounds = blueprint.scene_plan[i].expected_rounds || roundsPerDynamicScene;
                const sceneEnd = cumulativeRounds + sceneRounds;
                boundaries.push({ start: cumulativeRounds, end: sceneEnd, rounds: sceneRounds });
                cumulativeRounds += sceneRounds;
            }
            return boundaries;

        } else {
            // Dynamic distribution
            const boundaries = [];
            for (let i = 0; i < totalScenes; i++) {
                const start = Math.floor((i / totalScenes) * arcLength);
                const end = Math.floor(((i + 1) / totalScenes) * arcLength);
                boundaries.push({ start, end, rounds: Math.max(1, end - start) });
            }
            return boundaries;
        }
    };

    const boundaries = calculateSceneBoundaries();

    if (sceneMode === 'manual') {
        // MANUAL MODE: Force the selected scene
        const foundSceneIndex = Math.max(0, Math.min(manualSceneIndex, totalScenes - 1));

        // Use the natural boundaries of this scene to calculate relative progress
        const boundary = boundaries[foundSceneIndex];
        sceneStartRound = boundary.start;
        sceneEndRound = boundary.end;
        expectedSceneRounds = boundary.rounds;

        sceneIndex = foundSceneIndex;
        clampedSceneIndex = foundSceneIndex;
        scene = blueprint.scene_plan[clampedSceneIndex];

    } else {
        // AUTO MODE: Calculate based on currentStep
        let foundSceneIndex = 0;

        // Find which boundary contains the current step
        for (let i = 0; i < totalScenes; i++) {
            if (currentStep < boundaries[i].end) {
                foundSceneIndex = i;
                break;
            }
        }

        // If past the end, clamp to last scene
        if (currentStep >= boundaries[totalScenes - 1].end) {
            foundSceneIndex = totalScenes - 1;
        }

        const boundary = boundaries[foundSceneIndex];
        sceneStartRound = boundary.start;
        sceneEndRound = boundary.end;
        expectedSceneRounds = boundary.rounds;

        sceneIndex = foundSceneIndex;
        clampedSceneIndex = foundSceneIndex;
        scene = blueprint.scene_plan[clampedSceneIndex];
    }

    // Calculate progress within scene
    // Note: In manual mode, this might result in negative numbers (if before start) 
    // or > 100% (if after end), which is informative for the user.
    // However, for the prompt contract, we should probably clamp or explain it.
    // Let's rely on raw calculation but ensure roundInScene is displayed logically.

    // Actually, for the prompt "Scene round: X", we want `currentStep - sceneStart`.
    // If they manually jump back, roundInScene could be huge. 
    // But wait, Manual Mode usually implies "I am forcing this scene context". 
    // The "Scene round" counter tells the AI "we have been in this scene for X rounds effectively".
    // If I am in Round 10, and I Manual Select Scene 1 (frames 0-3), 
    // roundInScene = 10 - 0 = 10. "Scene round: 10 of 3". This correctly signals "We are dragging on".

    const roundInScene = Math.max(0, currentStep - sceneStartRound);
    const roundsRemaining = sceneEndRound - currentStep; // Can be negative in manual/overtime
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
        setCurrentSceneIndex(0);
    }

    return newState;
}

/**
 * Build injection for Scenario Mode (StoryVerse architecture)
 * Uses Abstract Acts, Placeholders, and Signal-based tracking.
 * Uses consolidated XML format with visual beat progress markers and positive exit triggers.
 * Designed to be the single source of pacing information when blueprint is active.
 *
 * @param {Object} blueprintState - The current blueprint state.
 * @param {number} currentStep - Current round number.
 * @param {number} arcLength - Total arc length.
 * @returns {string|null} The consolidated pacing injection, or null if not applicable.
 */
export function buildBlueprintInjection(blueprintState, currentStep, arcLength) {
    const pacingMode = getPacingMode();

    if (!blueprintState.useBlueprint || !blueprintState.blueprint) {
        return null;
    }

    // Switch logic based on Pacing Mode
    if (pacingMode === 'scenario') {
        return buildScenarioModeInjection(blueprintState);
    }

    // Default: Story Mode (Round-based pacing logic)
    const blueprint = blueprintState.blueprint;

    // Get scene pacing info (this calculates position within scene)
    const pacingInfo = getScenePacingInfo(
        blueprint,
        currentStep,
        arcLength,
        blueprintState.sceneMode,
        getCurrentSceneIndex()
    );
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

    const settings = extension_settings[MODULE_NAME];

    // --- Build visual beat progress and exit trigger ---
    let beatProgress = '';
    let currentBeatTitle = '';
    let exitTrigger = '';

    const hasBeats = scene.beats?.length > 0 && settings.blueprintSettings?.beatTrackingEnabled !== false;

    if (hasBeats) {
        const completedBeats = getCompletedBeats(sceneIndex);
        const currentBeatIndex = Math.min(completedBeats.length, scene.beats.length - 1);

        // Find current beat title
        currentBeatTitle = scene.beats[currentBeatIndex]?.title || '';

        // Build compact visual beat markers
        beatProgress = scene.beats.map((beat, idx) => {
            if (completedBeats.includes(idx)) return `[✓ ${beat.title}]`;
            if (idx === currentBeatIndex) return `[→ ${beat.title}]`;
            return `[□ ${beat.title}]`;
        }).join(' ');

        // Exit trigger with final beat
        const finalBeatTitle = scene.beats[scene.beats.length - 1].title.toLowerCase();
        exitTrigger = scene.purpose
            ? `Scene ends when: ${scene.purpose.toLowerCase().replace(/\.$/, '')}, and ${finalBeatTitle} is complete.`
            : 'Scene ends when: all beats are complete and the scene feels resolved.';
    } else {
        // No beats - simpler exit trigger
        exitTrigger = scene.purpose
            ? `Scene ends when: ${scene.purpose.toLowerCase().replace(/\.$/, '')}.`
            : 'Scene ends when: the situation is resolved.';
    }

    // --- Build scene summaries if enabled ---
    let summariesXml = '';
    if (settings.blueprintSettings?.includeSummariesInPrompt && blueprintState.sceneSummaries) {
        const summaryEntries = Object.entries(blueprintState.sceneSummaries)
            .filter(([sceneIdx]) => parseInt(sceneIdx) < sceneIndex)
            .sort(([a], [b]) => parseInt(a) - parseInt(b))
            .map(([sceneIdx, { sceneTitle, summary }]) =>
                `    <scene index="${parseInt(sceneIdx) + 1}" title="${sceneTitle}">${summary}</scene>`
            );

        if (summaryEntries.length > 0) {
            summariesXml = `\n  <previous_scenes>\n${summaryEntries.join('\n')}\n  </previous_scenes>`;
        }
    }

    // --- Build character focus ---
    let characterFocusXml = '';
    if (scene.character_focus && scene.character_focus.length > 0) {
        const focusItems = scene.character_focus
            .map(cf => `    <character name="${cf.name}">${cf.emotional_beat_target}</character>`)
            .join('\n');
        characterFocusXml = `\n  <character_focus>\n${focusItems}\n  </character_focus>`;
    }

    // --- Build tone/style compact ---
    const toneStyle = blueprint.tone_and_style;
    const toneXml = toneStyle
        ? `\n  <tone primary="${toneStyle.primary_tone || 'unspecified'}" voice="${toneStyle.narrative_voice || 'unspecified'}" elements="${(toneStyle.key_stylistic_elements || []).join(', ')}"/>`
        : '';

    // --- Build next scene preview (if not on final scene) ---
    let nextSceneXml = '';
    if (sceneIndex < totalScenes - 1) {
        const nextScene = blueprint.scene_plan[sceneIndex + 1];
        if (nextScene) {
            nextSceneXml = `\n<next_scene title="${nextScene.title}" phase="${nextScene.phase}">
  Upcoming: ${nextScene.purpose || nextScene.situation || 'Continue the story'}
</next_scene>`;
        }
    }

    // --- Build scene completion checklist ---
    let sceneChecklist = '';
    if (hasBeats) {
        const keyEvents = scene.key_events_if_unchallenged?.slice(0, 2).join('; ') || 'scene objectives';
        sceneChecklist = `
SCENE CHECKLIST - Before signaling transition:
□ Exit trigger met: "${exitTrigger}"
□ Key events addressed: ${keyEvents}
□ Current beat complete: ${currentBeatTitle || 'current focus'}`;
    } else {
        sceneChecklist = `
SCENE CHECKLIST - Before signaling transition:
□ Scene purpose fulfilled: ${scene.purpose || 'situation resolved'}`;
    }

    // --- Construct consolidated injection ---
    const injection = `<story_state>
  <scene index="${sceneIndex + 1}" of="${totalScenes}" title="${scene.title}" phase="${scene.phase}">
    <position round="${roundInScene}/${expectedSceneRounds}" remaining="${roundsRemaining}" percent="${percentThroughScene}%"/>
    <beats>${beatProgress}</beats>
    <current_focus>${currentBeatTitle || scene.situation}</current_focus>
    <exit_trigger>${exitTrigger}</exit_trigger>
  </scene>${summariesXml}${characterFocusXml}${toneXml}
</story_state>

<scene_context>
  <premise>${blueprint.core_premise}</premise>
  <situation>${scene.situation}</situation>
  <purpose>${scene.purpose}</purpose>
</scene_context>${nextSceneXml}

<instructions>
PACING MARKERS - Include these in your response when appropriate:

BEAT COMPLETION: When you complete a beat from the list above, output its marker on a new line.
Use the beat's index number (0-based):
  - First beat (index 0) → @@BEAT:0@@
  - Second beat (index 1) → @@BEAT:1@@
  - Third beat (index 2) → @@BEAT:2@@
  - And so on for each beat you complete

A beat is "addressed" when:
- establishment: The setting/mood/situation has been described
- hook: A compelling element has been introduced
- reaction: Characters have responded to events  
- escalation: Tension or stakes have increased
- emotional: A character moment or feeling has been explored
- pivot/transition: The narrative direction has shifted

Example: After describing characters entering (beat 0 "First Steps Inside"):

  The tatami mats creaked softly as they stepped inside...

  @@BEAT:0@@

  Julie paused at the threshold...
${sceneChecklist}

${sceneIndex === totalScenes - 1 ? `STORY COMPLETION: This is the FINAL SCENE. End your response with @@STORY_COMPLETE@@ on its own line when:
1. The exit_trigger condition above has been satisfied
2. Most or all beats show [✓] complete
3. The narrative has reached a satisfying conclusion

Do NOT use @@NEXT_SCENE@@ - use @@STORY_COMPLETE@@ to signal the story is complete.` : `SCENE TRANSITION: End your response with @@NEXT_SCENE@@ on its own line when:
1. The exit_trigger condition above has been satisfied  
2. Most or all beats show [✓] complete
3. The narrative has reached a natural pause`}

These markers are parsed by the system - include them exactly as shown.
</instructions>`;

    return injection.trim();
}

/**
 * Helper function to generate with a specific connection profile
 * Uses ConnectionManagerRequestService to call the API with the selected profile
 * Captures performance metrics for analysis
 * @param {Object} options - Options with prompt, systemPrompt, responseLength, profileId, phase, phaseName
 * @returns {Promise<string>} Generated text
 */
export async function generateWithPreset(options) {
    const selectedProfileId = options.profileId ?? extension_settings[MODULE_NAME]?.blueprintSettings?.generationApi;

    if (!selectedProfileId) {
        console.error('[Story Mode Blueprint] No profile selected!');
        throw new Error('No API profile selected for blueprint generation. Please select a provider in Blueprint Settings.');
    }

    console.log('[Story Mode Blueprint] Using profile:', selectedProfileId);

    // Initialize metrics tracking
    const startTime = performance.now();
    const metrics = {
        phase: options.phase || '?',
        phaseName: options.phaseName || 'Unknown',
        startTime,
        requestedOutputTokens: options.responseLength || 0,
        profileId: selectedProfileId,
    };

    // Count tokens in prompt and system prompt (async)
    try {
        metrics.promptTokens = await getTokenCountAsync(options.prompt);
        metrics.systemTokens = options.systemPrompt ? await getTokenCountAsync(options.systemPrompt) : 0;
        metrics.totalInputTokens = metrics.promptTokens + metrics.systemTokens;
    } catch (tokenError) {
        console.warn('[Story Mode Blueprint] Token counting failed:', tokenError);
        metrics.promptTokens = '?';
        metrics.systemTokens = '?';
        metrics.totalInputTokens = '?';
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

        const endTime = performance.now();
        const output = result.text || result.content || '';

        // Capture success metrics
        metrics.endTime = endTime;
        metrics.duration = endTime - startTime;
        metrics.actualOutputLength = output.length;
        metrics.actualOutputTokens = result.usage?.completion_tokens || '?';
        metrics.totalTokensUsed = result.usage?.total_tokens || '?';
        metrics.success = true;

        // Calculate tokens per second if we have the data
        if (typeof metrics.actualOutputTokens === 'number' && metrics.duration > 0) {
            metrics.tokensPerSecond = Math.round((metrics.actualOutputTokens / metrics.duration) * 1000);
        }

        // Store metrics for analysis
        storePhaseMetrics(metrics);

        return output;
    } catch (error) {
        // Log the full error for debugging
        console.error('[Story Mode Blueprint] Full error object:', error);
        console.error('[Story Mode Blueprint] Error message:', error.message);
        console.error('[Story Mode Blueprint] Error cause:', error.cause);
        console.error('[Story Mode Blueprint] Error cause message:', error.cause?.message);

        // Check if this is a reasoning parameter error (GLM 4.7 doesn't support auto reasoning)
        // The error might be in error.message, error.cause, error.cause.message, or nested in the error object
        const errorString = JSON.stringify(error);
        const errorMessage = error.message || '';
        const errorCauseMessage = error.cause?.message || '';
        const errorCauseString = error.cause ? JSON.stringify(error.cause) : '';

        // Combine all error sources for checking
        const allErrorText = `${errorMessage} ${errorCauseMessage} ${errorString} ${errorCauseString}`;

        // Check for the specific reasoning parameter error
        const hasInvalidOption = allErrorText.includes('Invalid option');
        const hasReasoningLevels = allErrorText.includes('xhigh') || allErrorText.includes('medium') ||
            allErrorText.includes('minimal') || allErrorText.includes('none');

        // Also detect "Bad Request" errors which may indicate reasoning parameter issues with GLM 4.7
        const isBadRequest = errorMessage.includes('Bad Request') ||
            errorCauseMessage.includes('Bad Request') ||
            errorMessage.includes('API request failed');

        const isReasoningError = (hasInvalidOption && hasReasoningLevels) || isBadRequest;

        console.log('[Story Mode Blueprint] Error detection:', {
            hasInvalidOption,
            hasReasoningLevels,
            isBadRequest,
            isReasoningError
        });

        if (isReasoningError) {
            console.warn('[Story Mode Blueprint] ========================================');
            console.warn('[Story Mode Blueprint] DETECTED REASONING PARAMETER ERROR');
            console.warn('[Story Mode Blueprint] Retrying with explicit reasoning effort...');
            console.warn('[Story Mode Blueprint] ========================================');
            console.warn('[Story Mode Blueprint] Original error:', errorMessage || errorString);

            try {
                // Retry with explicit reasoning effort parameter
                // reasoning must be passed in overridePayload (5th param), not custom (4th param)
                // Also disable preset to prevent it from overriding our reasoning setting
                console.log('[Story Mode Blueprint] Sending retry with reasoning: { effort: "high" } in overridePayload (preset disabled)');
                const retryResult = await ConnectionManagerRequestService.sendRequest(
                    selectedProfileId,
                    messages,
                    options.responseLength || 0,
                    { stream: false, extractData: true, includePreset: false },
                    { reasoning: { effort: 'high' }, include_reasoning: true }  // overridePayload
                );

                const endTime = performance.now();
                const output = retryResult.text || retryResult.content || '';

                console.log('[Story Mode Blueprint] ========================================');
                console.log('[Story Mode Blueprint] RETRY SUCCEEDED!');
                console.log('[Story Mode Blueprint] Output length:', output.length);
                console.log('[Story Mode Blueprint] ========================================');

                // Capture success metrics for retry
                metrics.endTime = endTime;
                metrics.duration = endTime - startTime;
                metrics.actualOutputLength = output.length;
                metrics.actualOutputTokens = retryResult.usage?.completion_tokens || '?';
                metrics.totalTokensUsed = retryResult.usage?.total_tokens || '?';
                metrics.success = true;
                metrics.retried = true;
                metrics.retryReason = 'reasoning_parameter_error';

                // Calculate tokens per second if we have the data
                if (typeof metrics.actualOutputTokens === 'number' && metrics.duration > 0) {
                    metrics.tokensPerSecond = Math.round((metrics.actualOutputTokens / metrics.duration) * 1000);
                }

                // Store metrics for analysis
                storePhaseMetrics(metrics);

                console.log('[Story Mode Blueprint] Retry with explicit reasoning effort succeeded');
                return output;
            } catch (retryError) {
                // If retry also fails, capture that error
                const endTime = performance.now();
                metrics.endTime = endTime;
                metrics.duration = endTime - startTime;
                metrics.success = false;
                metrics.error = retryError.message;
                metrics.retried = true;
                metrics.retryReason = 'reasoning_parameter_error';

                storePhaseMetrics(metrics);

                console.error('[Story Mode Blueprint] Retry with explicit reasoning effort failed:', retryError);
                throw retryError;
            }
        }

        // Not a reasoning error, or retry failed - capture original error metrics
        const endTime = performance.now();
        metrics.endTime = endTime;
        metrics.duration = endTime - startTime;
        metrics.success = false;
        metrics.error = error.message;

        storePhaseMetrics(metrics);

        console.error('[Story Mode Blueprint] Connection Manager request failed:', error);
        throw error;
    }
}

/**
 * Save an opening message to the current blueprint.
 *
 * **SECURITY WARNING**: The opening message is stored without sanitization.
 * When displaying this message in HTML context, ALWAYS use escapeHtml()
 * to prevent XSS attacks. This function only validates length and type.
 *
 * @param {string} openingText - The opening message text to save
 * @returns {Promise<Object>} Result object with success status
 */
export async function saveOpeningMessageToBlueprint(openingText) {
    const blueprintState = getBlueprintState();
    if (!blueprintState.blueprint) {
        return { success: false, error: 'No blueprint loaded' };
    }

    // Use shared validation utility
    const validation = validateOpeningMessage(openingText);
    if (!validation.valid) {
        console.warn('[BlueprintModule] Invalid opening message:', validation.error);
        return { success: false, error: validation.error };
    }

    if (validation.truncated) {
        console.warn('[BlueprintModule] Opening message truncated to max length');
    }

    blueprintState.blueprint.opening_message = validation.sanitized;
    await saveBlueprintState(blueprintState);
    console.log('[Story Mode Blueprint] Opening message saved to blueprint state');

    // Also save to library if the blueprint has an ID (i.e., it's from the library)
    if (blueprintState.blueprint.blueprint_id) {
        try {
            const library = await getLibrary();
            await library.saveBlueprint(blueprintState.blueprint);
            console.log('[Story Mode Blueprint] Opening message saved to library');
        } catch (error) {
            console.error('[Story Mode Blueprint] Failed to save opening message to library:', error);
            // Continue anyway - the blueprint state is already saved
        }
    }

    return { success: true };
}

/**
 * Get the stored opening message from the current blueprint.
 *
 * **SECURITY WARNING**: The returned string is NOT sanitized for HTML display.
 * ALWAYS use escapeHtml() when displaying this message in HTML context
 * to prevent XSS attacks.
 *
 * @returns {string|null} The stored opening message, or null if none exists
 */
export function getStoredOpeningMessage() {
    const blueprintState = getBlueprintState();
    return blueprintState.blueprint?.opening_message || null;
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
    // Get character data
    const characterList = getCurrentChatCharacters();

    if (characterList.length === 0) {
        return '<div style="color: var(--SmartThemeQuoteColor); font-style: italic;">No characters detected - using story context only.</div>';
    }

    // Build HTML
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
    // Get persona data
    const personaList = getAllPersonas();

    if (personaList.length === 0) {
        return '<div style="color: var(--SmartThemeQuoteColor); font-style: italic;">No personas defined yet. Create personas in the Persona Management panel.</div>';
    }

    // Build HTML
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

// Re-export constants for backward compatibility
export { MODULE_NAME, METAPHOR_LEVELS, LENGTH_PRESETS, PHASE_CONFIG } from './core/index.js';

// Re-export placeholders for backward compatibility
export { resolvePlaceholders, checkPrerequisites } from './blueprint/index.js';

// Re-export validation functions for backward compatibility
export { validateBlueprint, parseBlueprintResponse } from './blueprint/index.js';

// Re-export normalization functions for backward compatibility
export { normalizeBlueprint, normalizeCharacterOutcomes } from './blueprint/index.js';

// Re-export beat functions for backward compatibility
export {
    markBeatCompleted,
    markBeatSkipped,
    isBeatCompleted,
    getCompletedBeats,
    resetBeatProgress,
    resetBeatsForScene,
    setCurrentBeatFocus,
} from './scenario/index.js';

export default {
    initBlueprintSettings,
    getBlueprintState,
    saveBlueprintState,
    createRunCopy,
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
    MODULE_NAME,
    METAPHOR_LEVELS,
    LENGTH_PRESETS,
    PHASE_CONFIG,
    resolvePlaceholders,
    checkPrerequisites,
    markBeatCompleted,
    markBeatSkipped,
    isBeatCompleted,
    getCompletedBeats,
    resetBeatProgress,
    resetBeatsForScene,
    setCurrentBeatFocus,
    getScenarioFromContext,
    buildCharacterSelectionList,
    buildPersonaSelectionList,
};
