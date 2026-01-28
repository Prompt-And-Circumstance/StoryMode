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
import { saveSettingsDebounced, eventSource, event_types, saveMetadata, generateRaw, online_status, main_api } from '/script.js';
import { Popup, POPUP_TYPE, callGenericPopup, POPUP_RESULT } from '/scripts/popup.js';
import { getTokenCountAsync } from '/scripts/tokenizers.js';
import { ConnectionManagerRequestService } from '/scripts/extensions/shared.js';
import {
    loadStoryTypes,
    loadAuthorStyles,
    getStoryTypes,
    getAuthorStyles,
    getPacingMode,
    getCurrentSceneIndex,
    setCurrentSceneIndex,
    getChatStoryState,
    saveChatStoryState
} from '../core/state-manager.js';
import * as PromptTemplates from '../generation/templates.js';
import { MODULE_NAME, METAPHOR_LEVELS, LENGTH_PRESETS, PHASE_CONFIG } from '../core/index.js';
import { resolvePlaceholders, checkPrerequisites, validateBlueprint, parseBlueprintResponse, normalizeBlueprint, normalizeCharacterOutcomes, initNormalization } from './index.js';
import {
    markBeatCompleted,
    markBeatSkipped,
    isBeatCompleted,
    getCompletedBeats,
    resetBeatProgress,
    resetBeatsForScene,
} from '../scenario/index.js';
import {
    buildScenarioModeInjection,
    buildMissingCharactersXml,
} from '../scenario/index.js';
import {
    initPromptBuilders,
    buildBlueprintRequest,
    buildMasterPrompt,
    buildPhasePrompt,
    getExpectedSceneCount,
    initOrchestration,
    generateBlueprint,
    generateBlueprintPhased,
    generateWithPreset,
    generateOpeningMessage,
} from '../generation/index.js';
import {
    getBlueprintState,
    saveBlueprintState,
    createRunCopy
} from './storage.js';
import { storeCoverImage } from '../scene/image-storage.js';
import { blueprintFilename } from './file-api.js';
import { getBlueprintCoverUrl } from './utils.js';

// Import summarization functions (extracted to separate module)
import {
    getSummarizingSceneIndex,
    trackMessageForScene as trackMessageForSceneInternal,
    triggerSummarizationIfNeeded,
    triggerCatchUpSummarization,
    getNextAutoSummaryInfo,
    manuallyGenerateSummary,
} from './summarization.js';

// Re-export summarization functions for backward compatibility
export {
    getSummarizingSceneIndex,
    triggerSummarizationIfNeeded,
    triggerCatchUpSummarization,
    getNextAutoSummaryInfo,
    manuallyGenerateSummary,
};

// Import scene pacing functions (extracted to separate module)
import {
    getScenePacingInfo,
    getCurrentScene,
    advanceSceneIndex,
} from './scene-pacing.js';

// Re-export scene pacing functions for backward compatibility
export {
    getScenePacingInfo,
    getCurrentScene,
    advanceSceneIndex,
};

// Import injection function (extracted to separate module)
import { buildBlueprintInjection } from './injection.js';

// Re-export injection function for backward compatibility
export { buildBlueprintInjection };

// Re-export generateBlueprint for backward compatibility (now in generation/)
export { generateBlueprint };

// ============================================================================
// UUID POLYFILL (for older browsers)
// ============================================================================

// Ensure crypto.randomUUID() is available (Chrome 92+, Safari 15.4+, Firefox 95+)
if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'undefined') {
    crypto.randomUUID = () => '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
        (+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16)
    );
}

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
            injectMissingCharacters: true,
        };
    } else {
        // Add new settings to existing configurations
        if (settings.blueprintSettings.generationApi === undefined) {
            settings.blueprintSettings.generationApi = null;
        }
        if (settings.blueprintSettings.injectMissingCharacters === undefined) {
            settings.blueprintSettings.injectMissingCharacters = true;
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

    // Load story types and author styles if not already loaded
    // Uses state-manager.js as the single source of truth
    if (getStoryTypes().length === 0) {
        await loadStoryTypes();
    }
    if (getAuthorStyles().length === 0) {
        await loadAuthorStyles();
    }
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
// SCENE SUMMARIZATION (wrapper for backward compatibility)
// ============================================================================

/**
 * Track a message for scene summarization
 * Wrapper that injects getCurrentScene dependency
 * @param {number} messageId - The message ID to track
 * @param {Object} blueprintState - The blueprint state
 * @param {number} currentStep - Current round/step
 * @param {number} arcLength - Total arc length
 */
export function trackMessageForScene(messageId, blueprintState, currentStep, arcLength) {
    trackMessageForSceneInternal(messageId, blueprintState, getCurrentScene, currentStep, arcLength);
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
    // Only show this for Story Mode (non-scenario) blueprints
    // Scenario Mode uses beat/scene signals, not round counting
    const isScenarioBlueprint = blueprint.scene_plan && Array.isArray(blueprint.scene_plan) && blueprint.scene_plan.length > 0;
    const targetRounds = calculateTotalRounds(blueprint);
    const oldArcLength = chatMetadata[MODULE_NAME].arcLength || 30;
    if (oldArcLength !== targetRounds) {
        // Still apply the arcLength internally, but only show in dialog for non-scenario blueprints
        proposedChanges.arcLength = targetRounds;
        if (!isScenarioBlueprint) {
            changes.push('story length');
            detailChanges.push(`Story Length: ${oldArcLength} → ${targetRounds} rounds`);
        }
    }

    // Check current step change
    // Only show this for Story Mode (non-scenario) blueprints
    // Scenario Mode tracks progress via beats/scenes, not step counter
    const oldStep = chatMetadata[MODULE_NAME].currentStep || 0;
    if (oldStep !== 0) {
        proposedChanges.currentStep = 0;
        if (!isScenarioBlueprint) {
            changes.push('current step');
            detailChanges.push(`Current Step: ${oldStep} → 0 (reset)`);
        }
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
    if (getStoryTypes().length === 0) await loadStoryTypes();
    const existingTypes = getStoryTypes();
    if (!existingTypes.some(t => t.id === blueprint.story_type_id)) {
        // Check if story type is embedded in the blueprint
        if (blueprint.embeddedResources?.storyType?.id === blueprint.story_type_id) {
            // Auto-import the embedded story type
            const { importStoryTypeIfMissing } = await import('./import.js');
            const { saveStoryTypesToStorage } = await import('../core/state-manager.js');
            const imported = await importStoryTypeIfMissing(blueprint.embeddedResources.storyType);
            if (imported) {
                const saved = await saveStoryTypesToStorage();
                if (saved) {
                    console.log(`[Story Mode] Auto-imported embedded story type: ${blueprint.story_type_id}`);
                } else {
                    console.warn(`[Story Mode] Failed to save auto-imported story type: ${blueprint.story_type_id}`);
                }
            }
        } else {
            warnings.push(`Story type "${blueprint.story_type_id}" not found in library. You may need to import it or select another.`);
        }
    }

    if (blueprint.author_style) {
        if (getAuthorStyles().length === 0) await loadAuthorStyles();
        const existingStyles = getAuthorStyles();
        if (!existingStyles.some(s => s.id === blueprint.author_style)) {
            // Check if author style is embedded in the blueprint
            if (blueprint.embeddedResources?.authorStyle?.id === blueprint.author_style) {
                // Auto-import the embedded author style
                const { importAuthorStyleIfMissing } = await import('./import.js');
                const { saveAuthorStylesToStorage } = await import('../core/state-manager.js');
                const imported = await importAuthorStyleIfMissing(blueprint.embeddedResources.authorStyle);
                if (imported) {
                    const saved = await saveAuthorStylesToStorage();
                    if (saved) {
                        console.log(`[Story Mode] Auto-imported embedded author style: ${blueprint.author_style}`);
                    } else {
                        console.warn(`[Story Mode] Failed to save auto-imported author style: ${blueprint.author_style}`);
                    }
                }
            } else {
                warnings.push(`Author style "${blueprint.author_style}" not found in library. It will be set to None.`);
                blueprint.author_style = '';
            }
        }
    }

    // DELETED: "Story Already in Progress" dialog
    // Scenario Mode uses beat/scene tracking, not rounds.
    // The round counter is irrelevant, so no need to warn about it.

    // Notify user of mode switch
    const toastr = window.toastr;
    if (toastr) {
        toastr.info(`Switched to Scenario Mode: ${blueprint.blueprint_title || blueprint.title || 'Untitled Blueprint'}`);
    }

    // Sync blueprint settings
    await syncBlueprintSettings(blueprint, false);

    // Initialize Scenario Mode state
    const newChatState = getChatStoryState();
    newChatState.pacingMode = 'scenario';  // Switch to Scenario Mode
    newChatState.scenario = {
        currentSceneIndex: 0,
        beatState: {}
    };
    // Note: currentStep is NOT reset - it's simply ignored in Scenario Mode
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
    // Use getBlueprintCoverUrl to handle all cover storage formats (file URL, gallery, base64, etc.)
    try {
        const coverUrl = getBlueprintCoverUrl(blueprint);
        console.log('[Story Mode] Cover URL resolved:', coverUrl ? coverUrl.substring(0, 80) + '...' : 'null');
        if (coverUrl) {
            storeCoverImage(blueprint.blueprint_id, {
                imageData: coverUrl,
                prompt: blueprint.cover_prompt || 'Blueprint cover image',
                generatedAt: Date.now(),
            });
            console.log('[Story Mode] Cover image stored to scene image storage');
        }
    } catch (coverError) {
        console.error('[Story Mode] Error handling cover image:', coverError);
        // Don't fail the whole start operation for cover issues
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
 * Save an opening message to the current blueprint.
 *
 * **SECURITY WARNING**: The opening message is stored without sanitization.
 * When displaying this message in HTML context, ALWAYS use escapeHtml()
 * to prevent XSS attacks. This function only validates length and type.
 *
 * @param {string} openingText - The opening message text to save
 * @returns {Promise<Object>} Result object with success status
 */


// Character/persona selection lists moved to lib/ui/components/character-picker.js
// Use buildChatCharacterPicker, buildPersonaPicker, buildLibraryCharacterPicker instead

// ============================================================================
// EXPORTS
// ============================================================================

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
    buildBlueprintInjection,
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
};
