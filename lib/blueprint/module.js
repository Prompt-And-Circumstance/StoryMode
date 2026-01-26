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
} from '../core/state-manager.js';
import * as PromptTemplates from '../generation/templates.js';
import { robustParseJSON, validateOpeningMessage, MAX_OPENING_MESSAGE_LENGTH, MIN_OPENING_MESSAGE_LENGTH } from './utils.js';
import { isBlueprintDebugMode, getMockPhaseResponse } from '../debug/mocks.js';
import { MODULE_NAME, METAPHOR_LEVELS, LENGTH_PRESETS, PHASE_CONFIG } from '../core/index.js';
import { resolvePlaceholders, checkPrerequisites, validateBlueprint, parseBlueprintResponse, normalizeBlueprint, normalizeCharacterOutcomes, initNormalization } from './index.js';
import {
    markBeatCompleted,
    markBeatSkipped,
    isBeatCompleted,
    getCompletedBeats,
    resetBeatProgress,
    resetBeatsForScene,
    setCurrentBeatFocus,
} from '../scenario/index.js';
import {
    buildScenarioModeInjection,
    deriveExitTrigger,
    buildSignalsBlock,
} from '../scenario/index.js';
import {
    initPromptBuilders,
    buildBlueprintRequest,
    buildMasterPrompt,
    buildPhasePrompt,
    getExpectedSceneCount,
    initOrchestration,
    generateBlueprintPhased,
    generateWithPreset,
    generateOpeningMessage,
} from '../generation/index.js';
import { getLibrary } from './integration.js';
import { getCurrentChatCharacters, getAllPersonas } from './characters/linker.js';
import {
    getBlueprintState,
    saveBlueprintState,
    createRunCopy
} from './storage.js';
import { storeCoverImage } from '../scene/image-storage.js';
import { blueprintFilename } from './file-api.js';

export {
    getBlueprintState,
    saveBlueprintState,
    createRunCopy
};

// ============================================================================
// UUID POLYFILL (for older browsers)
// ============================================================================

// Ensure crypto.randomUUID() is available (Chrome 92+, Safari 15.4+, Firefox 95+)
if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'undefined') {
    crypto.randomUUID = () => '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
        (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
    );
}

// Module-level data storage for story types and author styles
let storyTypes = [];
let authorStyles = [];

// Default rounds per scene when scene_plan doesn't specify expected_rounds
const DEFAULT_ROUNDS_PER_SCENE = 3;

/**
 * Calculate total expected rounds from a blueprint's scene plan.
 * Uses explicit expected_rounds from scenes if defined, otherwise falls back
 * to DEFAULT_ROUNDS_PER_SCENE per scene.
 *
 * @param {Object} blueprint - The blueprint object
 * @returns {number} Total expected rounds (minimum 1)
 */
export function calculateTotalRounds(blueprint) {
    if (!blueprint) {
        return DEFAULT_ROUNDS_PER_SCENE; // Sensible minimum
    }

    const scenePlan = blueprint.scene_plan || [];
    const sceneCount = scenePlan.length;

    if (sceneCount === 0) {
        // No scene plan - fall back to total_messages_target if it looks like a round count,
        // otherwise use a sensible default
        const target = blueprint.arc_structure?.total_messages_target || blueprint.total_messages_target;
        return target && target > 0 ? target : DEFAULT_ROUNDS_PER_SCENE;
    }

    // Check if any scenes have explicit expected_rounds
    const hasExplicitRounds = scenePlan.some(s => s.expected_rounds && typeof s.expected_rounds === 'number');

    if (hasExplicitRounds) {
        // Sum up expected_rounds, using default for scenes without explicit values
        return scenePlan.reduce((sum, scene) => {
            const rounds = (scene.expected_rounds && typeof scene.expected_rounds === 'number')
                ? scene.expected_rounds
                : DEFAULT_ROUNDS_PER_SCENE;
            return sum + rounds;
        }, 0);
    }

    // No explicit rounds defined - use default multiplier
    return sceneCount * DEFAULT_ROUNDS_PER_SCENE;
}

// Module-level state for tracking in-progress summary generation
let summarizingSceneIndex = null;

/**
 * Get the scene index currently being summarized, or null if none
 * @returns {number|null}
 */
export function getSummarizingSceneIndex() {
    return summarizingSceneIndex;
}

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
        const response = await fetch(new URL('../../data/story_types.json', import.meta.url));
        if (response.ok) {
            storyTypes = await response.json();
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
        const response = await fetch(new URL('../../data/author_styles.json', import.meta.url));
        if (response.ok) {
            authorStyles = await response.json();
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
        // The module is in lib/blueprint/, so we need to go up two levels to reach data/
        const templateUrl = new URL('../../data/blueprint-master-prompt.txt', import.meta.url).href;
        const response = await fetch(templateUrl);
        if (response.ok) {
            DEFAULT_MASTER_PROMPT = await response.text();
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
 * Trigger summarization for all eligible past scenes (not just the one we left)
 * Called on scene transition - checks ALL past scenes for summarization eligibility
 * @param {Object} blueprintState - The blueprint state
 * @param {Object} settings - Extension settings
 */
export function triggerSummarizationIfNeeded(sceneIndex, blueprintState, settings) {
    if (!settings.blueprintSettings?.summarizationEnabled) {
        return;
    }

    const currentSceneIndex = getCurrentSceneIndex();

    // Check ALL past scenes for eligibility, not just the one we left
    for (let i = 0; i < currentSceneIndex; i++) {
        if (shouldSummarizeScene(blueprintState, i, settings)) {
            console.log(`[Story Mode] Scene ${i} is now eligible for summarization (${currentSceneIndex - i} scenes behind)`);
            // Fire-and-forget async summarization
            summarizeSceneAsync(i, blueprintState, settings).catch(error => {
                console.error(`[Story Mode] Scene ${i} summarization failed:`, error);
            });
        }
    }
}

/**
 * Trigger catch-up summarization for all eligible scenes
 * Call this when summarization is enabled mid-story to summarize past scenes
 * @param {Object} blueprintState - The blueprint state
 * @param {Object} settings - Extension settings
 */
export function triggerCatchUpSummarization(blueprintState, settings) {
    if (!settings.blueprintSettings?.summarizationEnabled) {
        return;
    }

    const currentSceneIndex = getCurrentSceneIndex();
    const threshold = settings.blueprintSettings?.summarizeAfterScenes || 2;
    let triggered = 0;

    console.log(`[Story Mode] Running catch-up summarization (current scene: ${currentSceneIndex}, threshold: ${threshold})`);

    for (let i = 0; i < currentSceneIndex; i++) {
        if (shouldSummarizeScene(blueprintState, i, settings)) {
            console.log(`[Story Mode] Catch-up: Scene ${i} eligible for summarization`);
            summarizeSceneAsync(i, blueprintState, settings).catch(error => {
                console.error(`[Story Mode] Scene ${i} catch-up summarization failed:`, error);
            });
            triggered++;
        }
    }

    if (triggered > 0) {
        console.log(`[Story Mode] Catch-up summarization triggered for ${triggered} scene(s)`);
    } else {
        console.log(`[Story Mode] No scenes eligible for catch-up summarization`);
    }

    return triggered;
}

/**
 * Get information about when the next auto-summary will occur
 * @param {Object} blueprintState - The blueprint state
 * @param {Object} settings - Extension settings
 * @returns {Object} Info about next auto-summary: { sceneIndex, scenesUntilEligible, message }
 */
export function getNextAutoSummaryInfo(blueprintState, settings) {
    if (!settings.blueprintSettings?.summarizationEnabled) {
        return { message: 'Auto-summarization disabled' };
    }

    if (!blueprintState?.blueprint) {
        return { message: 'No blueprint active' };
    }

    const currentSceneIndex = getCurrentSceneIndex();
    const threshold = settings.blueprintSettings?.summarizeAfterScenes || 2;
    const totalScenes = blueprintState.blueprint.scene_plan?.length || 0;

    // Find the first scene that hasn't been summarized yet
    let nextSceneToSummarize = null;
    for (let i = 0; i < currentSceneIndex; i++) {
        if (!blueprintState.sceneSummaries?.[i]) {
            const hasMessages = blueprintState.sceneMessageMap?.[i]?.length > 0;
            if (hasMessages) {
                nextSceneToSummarize = i;
                break;
            }
        }
    }

    // If all past scenes are summarized, the next one to summarize will be the current scene
    // after we advance threshold scenes
    if (nextSceneToSummarize === null) {
        // Current scene will be summarized when we reach scene (currentSceneIndex + threshold)
        const targetScene = currentSceneIndex + threshold;
        if (targetScene >= totalScenes) {
            return { message: 'All eligible scenes summarized' };
        }
        const scenesUntil = threshold;
        return {
            sceneIndex: currentSceneIndex,
            scenesUntilEligible: scenesUntil,
            message: `Scene ${currentSceneIndex + 1} will be summarized after ${scenesUntil} more scene transition${scenesUntil > 1 ? 's' : ''}`
        };
    }

    // We have an unsummarized scene - when will it become eligible?
    const scenesBehind = currentSceneIndex - nextSceneToSummarize;
    if (scenesBehind >= threshold) {
        // Already eligible - should be summarizing now or pending
        return {
            sceneIndex: nextSceneToSummarize,
            scenesUntilEligible: 0,
            message: `Scene ${nextSceneToSummarize + 1} is eligible now`
        };
    }

    const scenesNeeded = threshold - scenesBehind;
    return {
        sceneIndex: nextSceneToSummarize,
        scenesUntilEligible: scenesNeeded,
        message: `Scene ${nextSceneToSummarize + 1} auto-summarizes after ${scenesNeeded} more scene transition${scenesNeeded > 1 ? 's' : ''}`
    };
}

/**
 * Asynchronously summarize a scene (fire-and-forget wrapper)
 * @param {number} sceneIndex - The scene index to summarize
 * @param {Object} blueprintState - The blueprint state
 * @param {Object} settings - Extension settings
 */
async function summarizeSceneAsync(sceneIndex, blueprintState, settings) {
    summarizingSceneIndex = sceneIndex;
    // Trigger UI refresh to show "generating" state
    if (window.updateControllerPanel) window.updateControllerPanel();

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
    } finally {
        summarizingSceneIndex = null;
        // Trigger UI refresh to show completion
        if (window.updateControllerPanel) window.updateControllerPanel();
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
        // Check if this is a reasoning parameter error (GLM 4.7 doesn't support auto reasoning)
        const errorString = JSON.stringify(error);
        const errorMessage = error.message || '';
        const errorCauseMessage = error.cause?.message || '';
        const errorCauseString = error.cause ? JSON.stringify(error.cause) : '';
        const allErrorText = `${errorMessage} ${errorCauseMessage} ${errorString} ${errorCauseString}`;

        const hasInvalidOption = allErrorText.includes('Invalid option');
        const hasReasoningLevels = allErrorText.includes('xhigh') || allErrorText.includes('medium') ||
            allErrorText.includes('minimal') || allErrorText.includes('none');
        const isBadRequest = errorMessage.includes('Bad Request') ||
            errorCauseMessage.includes('Bad Request') ||
            errorMessage.includes('API request failed');

        const isReasoningError = (hasInvalidOption && hasReasoningLevels) || isBadRequest;

        if (isReasoningError) {
            console.warn('[Story Mode] Detected reasoning parameter error in scene summarization, retrying with explicit effort...');

            try {
                const retryResult = await ConnectionManagerRequestService.sendRequest(
                    selectedProfileId,
                    messages,
                    options.responseLength || 0,
                    { stream: false, extractData: true, includePreset: false },
                    { reasoning: { effort: 'high' }, include_reasoning: true }
                );

                return retryResult.text || retryResult.content || '';
            } catch (retryError) {
                console.error('[Story Mode] Retry with explicit reasoning effort failed:', retryError);
                throw retryError;
            }
        }

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
 * Manually generate a summary for a specific scene (bypasses threshold checks)
 * @param {number} sceneIndex - Scene to summarize
 * @param {Object} blueprintState - Blueprint state
 * @param {Object} settings - Extension settings
 * @returns {Promise<void>}
 */
export async function manuallyGenerateSummary(sceneIndex, blueprintState, settings) {
    // Check if already summarized
    if (blueprintState.sceneSummaries?.[sceneIndex]) {
        throw new Error(`Scene ${sceneIndex + 1} already has a summary`);
    }

    // Check if scene is in the future
    const currentSceneIndex = getCurrentSceneIndex();
    if (sceneIndex >= currentSceneIndex) {
        throw new Error(`Cannot summarize current or future scenes`);
    }

    await summarizeSceneAsync(sceneIndex, blueprintState, settings);
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

    // Check arc length change - calculate actual rounds from scene plan
    const targetRounds = calculateTotalRounds(blueprint);
    const oldArcLength = chatMetadata[MODULE_NAME].arcLength || 30;
    if (oldArcLength !== targetRounds) {
        changes.push('story length');
        detailChanges.push(`Story Length: ${oldArcLength} → ${targetRounds} rounds`);
        proposedChanges.arcLength = targetRounds;
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


        if (result !== POPUP_RESULT.AFFIRMATIVE) {
            // User cancelled - do not apply any changes
            return { confirmed: false, changes };
        }
    } else {
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


    // Persist to the server/chat file
    await saveMetadata();


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
        // Check if story type is embedded in the blueprint
        if (blueprint.embeddedResources?.storyType?.id === blueprint.story_type_id) {
            // Auto-import the embedded story type
            const { importStoryTypeIfMissing } = await import('./import.js');
            const { saveStoryTypesToStorage } = await import('../core/state-manager.js');
            const imported = await importStoryTypeIfMissing(blueprint.embeddedResources.storyType);
            if (imported) {
                await saveStoryTypesToStorage();
                console.log(`[Story Mode] Auto-imported embedded story type: ${blueprint.story_type_id}`);
            }
        } else {
            warnings.push(`Story type "${blueprint.story_type_id}" not found in library. You may need to import it or select another.`);
        }
    }

    if (blueprint.author_style) {
        const existingStyles = authorStyles.length ? authorStyles : await loadAuthorStyles();
        if (!existingStyles.some(s => s.id === blueprint.author_style)) {
            // Check if author style is embedded in the blueprint
            if (blueprint.embeddedResources?.authorStyle?.id === blueprint.author_style) {
                // Auto-import the embedded author style
                const { importAuthorStyleIfMissing } = await import('./import.js');
                const { saveAuthorStylesToStorage } = await import('../core/state-manager.js');
                const imported = await importAuthorStyleIfMissing(blueprint.embeddedResources.authorStyle);
                if (imported) {
                    await saveAuthorStylesToStorage();
                    console.log(`[Story Mode] Auto-imported embedded author style: ${blueprint.author_style}`);
                }
            } else {
                warnings.push(`Author style "${blueprint.author_style}" not found in library. It will be set to None.`);
                blueprint.author_style = '';
            }
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
            await doNewChat();

            // Re-fetch context after new chat
            // Note: doNewChat should have reset the state, but we'll let the rest of the function run
            // which will sync settings to the new (empty) chat.
        } else if (result === POPUP_RESULT.NEGATIVE) {
            // Reset Current Chat - Show double confirmation?
            // For now, we'll just proceed as the user explicitly chose "Reset Current Chat"
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

    // Copy cover image to scene image storage if available
    // This allows the cover to appear in the gallery and sidebar
    if (blueprint.cover_image) {
        storeCoverImage(blueprint.blueprint_id, {
            imageData: blueprint.cover_image,
            prompt: blueprint.cover_prompt || 'Blueprint cover image',
            generatedAt: Date.now(),
        });
        console.log('[Story Mode] Cover image copied to scene image storage');
    }

    // Refresh UI
    updateStoryPrompt();
    if (typeof window.updateStatusDisplay === 'function') window.updateStatusDisplay();
    if (typeof window.updateWandMenuStatus === 'function') window.updateWandMenuStatus();


    // Set coverFileUrl for library blueprints so the cover persists in chat metadata
    // This URL points to the file-backed PNG and survives JSON serialization (unlike large data URLs)
    if (sourceType === 'library' && blueprint.blueprint_id) {
        try {
            const filename = blueprintFilename(blueprint.blueprint_id);
            blueprint.coverFileUrl = `/user/files/${filename}`;
        } catch (e) {
            console.warn('[Story Mode] Could not set coverFileUrl:', e.message);
        }
    }

    // Create run copy in chat state (doesn't modify source blueprint)
    // This deep clones the blueprint so library/editor changes won't affect the run
    const runState = createRunCopy(blueprint, sourceType);

    // Enforce Act Director mode (Manual Scene Progression)
    runState.sceneMode = 'manual';
    runState.currentSceneIndex = 0;

    await saveBlueprintState(runState);

    // Check for missing characters/personas
    if (blueprint.embeddedResources) {
        const { detectMissingResources } = await import('./import.js');
        const { showImportPreviewDialog } = await import('./import-ui.js');

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

// Initialize prompt builders with functions that need module-level state
initPromptBuilders(getEffectiveMasterPrompt, getFallbackMasterPrompt);

// Initialize generation orchestration with dependencies
initOrchestration({
    generateBlueprintId,
    getConnectionProfiles,
    extension_settings,
    MODULE_NAME,
    main_api,
});

// ============================================================================
// LLM BLUEPRINT GENERATION (functions moved to generation/prompts.js)
// ============================================================================

// Re-export for backward compatibility
export { buildBlueprintRequest, buildMasterPrompt, buildPhasePrompt, getExpectedSceneCount };

// Re-export generation orchestration functions for backward compatibility
export { generateBlueprintPhased, generateWithPreset, generateOpeningMessage };

// NOTE: The following functions have been moved to lib/generation/prompts.js:
// - buildBlueprintRequest
// - buildMasterPrompt
// - buildPhasePrompt
// - buildMetaphorInstructions
// - buildAuthorStyleSection
// - buildPersonaSection
// - buildCharacterDataSection
// - buildFoundationPrompt
// - buildCharactersPrompt
// - buildScenesPrompt
// - buildResolutionsPrompt
// - getExpectedSceneCount

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


        // Call SillyTavern's generateRaw function

        // Prepare prompts for generateRaw
        const userPrompt = masterPrompt;
        const systemPrompt = 'You are an expert story designer. Output ONLY valid JSON as specified in the user\'s request.';


        // Verify generateRaw is available before calling
        if (typeof generateRaw !== 'function') {
            console.error('[Story Mode Blueprint] generateRaw is NOT a function!', typeof generateRaw);
            throw new Error(`generateRaw is not available (type: ${typeof generateRaw})`);
        }

        let rawText;
        try {
            rawText = await generateWithPreset({
                prompt: userPrompt,
                systemPrompt: systemPrompt,
                responseLength: 16000, // Increased from 8192 to 16000 to handle large blueprint JSON structures
                profileId: selectedProfileId, // Pass the captured profile ID
            });
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
        const settings = extension_settings[MODULE_NAME];
        const scenarioInjection = buildScenarioModeInjection(blueprintState);

        // Build scene summaries if enabled (same logic as Story Mode)
        let summariesXml = '';
        if (settings.blueprintSettings?.includeSummariesInPrompt && blueprintState.sceneSummaries) {
            const sceneIndex = getCurrentSceneIndex();
            const summaryEntries = Object.entries(blueprintState.sceneSummaries)
                .filter(([idx]) => parseInt(idx) < sceneIndex)
                .sort(([a], [b]) => parseInt(a) - parseInt(b))
                .map(([idx, { sceneTitle, summary }]) =>
                    `  <scene index="${parseInt(idx) + 1}" title="${sceneTitle}">${summary}</scene>`
                );

            if (summaryEntries.length > 0) {
                summariesXml = `<previous_scenes>\n${summaryEntries.join('\n')}\n</previous_scenes>\n\n`;
            }
        }

        return summariesXml + scenarioInjection;
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

    // Also save to library if the blueprint has an ID (i.e., it's from the library)
    if (blueprintState.blueprint.blueprint_id) {
        try {
            const library = await getLibrary();
            await library.saveBlueprint(blueprintState.blueprint);
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

// Character/persona selection lists moved to lib/ui/components/character-picker.js
// Use buildChatCharacterPicker, buildPersonaPicker, buildLibraryCharacterPicker instead

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
    // buildCharacterSelectionList and buildPersonaSelectionList removed
    // Use character-picker.js component instead
};

// Re-export constants for backward compatibility
export { MODULE_NAME, METAPHOR_LEVELS, LENGTH_PRESETS, PHASE_CONFIG } from '../core/index.js';

// Re-export placeholders for backward compatibility
export { resolvePlaceholders, checkPrerequisites } from './index.js';

// Re-export validation functions for backward compatibility
export { validateBlueprint, parseBlueprintResponse } from './index.js';

// Re-export normalization functions for backward compatibility
export { normalizeBlueprint, normalizeCharacterOutcomes } from './index.js';

// Re-export beat functions for backward compatibility
export {
    markBeatCompleted,
    markBeatSkipped,
    isBeatCompleted,
    getCompletedBeats,
    resetBeatProgress,
    resetBeatsForScene,
    setCurrentBeatFocus,
} from '../scenario/index.js';

// Re-export scene index management
export { getCurrentSceneIndex, setCurrentSceneIndex } from '../core/state-manager.js';

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
};
