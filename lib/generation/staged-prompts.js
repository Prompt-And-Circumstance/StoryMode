/**
 * @file Prompt builders for staged scene generation
 * @module generation/staged-prompts
 *
 * Builds prompts for Phase 3a (scene plan) and Phase 3b (scene batches).
 * Uses shared context assembly to avoid duplication with prompts.js.
 */

import * as PromptTemplates from './templates.js';
import { getExpectedSceneCount } from './prompts.js';
import { power_user } from '/scripts/power-user.js';

// ============================================================================
// SHARED CONTEXT HELPERS
// ============================================================================

// Author style field definitions: [label, propertyKey, isRequired]
const AUTHOR_STYLE_FIELDS = [
    ['Category', 'category', false],
    ['Tone and voice', 'authorPrompt', true],
    ['Narrative techniques', 'narrativeTechniques', false],
    ['Dialogue style', 'dialogueStyle', false],
    ['Pacing', 'pacingApproach', false],
    ['Thematic focus', 'thematicFocus', false],
];

/**
 * Build author style section for prompts
 * @param {Object} authorStyle - Author style object
 * @returns {string} Formatted author style section
 */
function buildAuthorStyleSection(authorStyle) {
    if (!authorStyle?.authorPrompt) {
        return 'No explicit author style has been requested.';
    }

    const styleParts = [`**User-specified author style:** ${authorStyle.name}`];
    AUTHOR_STYLE_FIELDS.forEach(([label, key, required]) => {
        const value = authorStyle[key];
        if (value || required) styleParts.push(`- **${label}**: ${value}`);
    });

    return `${styleParts.join('\n')}\n\nApply this author's stylistic approach throughout.`;
}

/**
 * Format a single persona entry
 * @param {Object} personaRef - Persona reference object
 * @returns {string} Formatted persona text
 */
function formatPersona(personaRef) {
    const personaName = power_user.personas[personaRef.id];
    const personaDesc = power_user.persona_descriptions[personaRef.id];

    if (!personaName || !personaDesc) {
        return `**Persona: ${personaRef.name}**\nDescription: Persona data not available\n`;
    }

    const title = personaDesc.title ? ` (${personaDesc.title})` : '';
    const desc = personaDesc.description ? `Description: ${personaDesc.description}\n` : '';
    return `**Persona: ${personaName}${title}**\n${desc}`;
}

/**
 * Build persona section for prompts
 * @param {Array<Object>} personaData - Array of persona references
 * @returns {string} Formatted persona section or empty string
 */
function buildPersonaSection(personaData) {
    if (!personaData?.length) return '';
    if (typeof power_user === 'undefined' || !power_user.personas || !power_user.persona_descriptions) return '';

    const personaDataStr = personaData.map(formatPersona).join('\n---\n');
    return `---\n### PERSONA DATA\n\n${personaDataStr}\n\n---`;
}

/**
 * Format a single character arc
 * @param {Object} char - Character arc object
 * @returns {string} Formatted character arc text
 */
function formatCharacterArc(char) {
    const lines = [`**${char.character_name}:** ${char.initial_state}`];

    if (char.key_turning_points?.length) {
        lines.push(`*Key Turning Points:* ${char.key_turning_points.join(', ')}`);
    }
    if (char.final_state) {
        lines.push(`*Final State:* ${char.final_state}`);
    }
    if (char.emotional_trajectory) {
        lines.push(`*Emotional Journey:* ${char.emotional_trajectory}`);
    }

    return lines.join('\n');
}

/**
 * Build character arcs summary for template injection
 * @param {Array} characters - Character arcs from Phase 2
 * @returns {string} Formatted summary
 */
function buildCharacterArcsSummary(characters) {
    if (!characters?.length) return 'No character arcs defined yet.';
    return characters.map(formatCharacterArc).join('\n\n');
}

/**
 * Build common template variables shared by both plan and batch prompts
 * @param {Object} request - Blueprint request object
 * @param {Object} storyType - Story type object
 * @param {Object} authorStyle - Author style object (optional)
 * @param {Object} partialBlueprint - Partial blueprint from previous phases
 * @returns {Promise<Object>} Template variables object
 */
async function buildCommonSceneContext(request, storyType, authorStyle, partialBlueprint) {
    const setting = partialBlueprint.setting || {};
    const antagonist = partialBlueprint.antagonistic_forces || {};
    const arcStructure = partialBlueprint.arc_structure || {};
    const toneAndStyle = partialBlueprint.tone_and_style || {};
    const protagonistGroup = partialBlueprint.protagonist_group || {};
    const characters = partialBlueprint.character_arcs || [];
    const memorableElement = storyType.memorableElement;

    const metaphorInstructions = await PromptTemplates.getMetaphorInstructions(
        request.genre_interpretation.metaphor_level
    );
    const setupHooksList = memorableElement?.setup_hooks?.map(h => `- ${h}`).join('\n') || '- No specific setup hooks defined';

    return {
        STORY_TYPE_JSON: JSON.stringify(storyType, null, 2),
        FOUNDATION: partialBlueprint.core_premise || '',
        SETTING_LOCATION: setting.location || 'Unknown',
        SETTING_TIME: setting.time_period || 'Unknown time',
        SETTING_ATMOSPHERE: setting.atmosphere || 'Unknown',
        ANTAGONIST_DESCRIPTION: antagonist.description || 'Unknown',
        ANTAGONIST_NATURE: antagonist.nature || 'Unknown',
        ARC_OPENING: arcStructure.opening_hook || 'Unknown',
        ARC_ESCALATION: arcStructure.escalation_pattern || 'Unknown',
        ARC_CLIMAX: arcStructure.climax_nature || 'Unknown',
        ARC_RESOLUTION: arcStructure.resolution_style || 'Unknown',
        TONE_PRIMARY: toneAndStyle.primary_tone || 'Unknown',
        TONE_VOICE: toneAndStyle.narrative_voice || 'Unknown',
        TONE_PACING: toneAndStyle.pacing || 'Unknown',
        TONE_STYLISTIC_ELEMENTS: toneAndStyle.key_stylistic_elements?.join(', ') || 'None specified',
        PROTAGONIST_GROUP_DESCRIPTION: protagonistGroup.description || 'Unknown',
        PROTAGONIST_GROUP_SHARED_GOAL: protagonistGroup.shared_goal || 'Unknown',
        CHARACTER_ARCS_SUMMARY: buildCharacterArcsSummary(characters),
        PERSONA_SECTION: buildPersonaSection(request.persona_data),
        AUTHOR_STYLE_SECTION: buildAuthorStyleSection(authorStyle),
        USER_SCENARIO: request.user_scenario || 'No specific scenario provided.',
        METAPHOR_LEVEL: request.genre_interpretation.metaphor_level,
        METAPHOR_INSTRUCTIONS: metaphorInstructions,
        TOTAL_MESSAGES_TARGET: request.total_messages_target,
        EXPECTED_SCENE_COUNT: getExpectedSceneCount(request.total_messages_target),
        MEMORABLE_ELEMENT_TYPE: memorableElement?.type || 'signature_moment',
        MEMORABLE_ELEMENT_NAME: memorableElement?.name || 'The Defining Moment',
        MEMORABLE_ELEMENT_DESCRIPTION: memorableElement?.description || 'A pivotal scene that crystallizes the story\'s themes',
        MEMORABLE_ELEMENT_PLACEMENT: memorableElement?.placement || 'resolution',
        MEMORABLE_ELEMENT_SETUP_HOOKS: setupHooksList,
    };
}

// ============================================================================
// SCENE PLAN PROMPT (Phase 3a)
// ============================================================================

/**
 * Build the scene plan prompt for Phase 3a
 * Generates lightweight outlines without beats/events/choices
 * @param {Object} request - Blueprint request
 * @param {Object} storyType - Story type object
 * @param {Object} authorStyle - Author style (optional)
 * @param {Object} partialBlueprint - Partial blueprint from Phases 1-2
 * @returns {Promise<string>} Complete scene plan prompt
 */
export async function buildScenePlanPrompt(request, storyType, authorStyle, partialBlueprint) {
    const template = await PromptTemplates.loadTemplate('phased-generation/scene-plan-prompt.txt');
    const variables = await buildCommonSceneContext(request, storyType, authorStyle, partialBlueprint);
    return PromptTemplates.renderTemplate(template, variables);
}

// ============================================================================
// SCENE BATCH PROMPT (Phase 3b..3n)
// ============================================================================

/**
 * Extract character name from character focus entry
 * @param {string|Object} cf - Character focus (string name or object with name property)
 * @returns {string} Character name
 */
function getCharacterName(cf) {
    return typeof cf === 'string' ? cf : cf.name;
}

/**
 * Format a scene as a compact summary
 * @param {Object} scene - Scene object
 * @returns {string} Formatted summary line
 */
function formatSceneSummary(scene) {
    const focus = scene.character_focus?.map(getCharacterName).join(', ') || 'none';
    const hooks = scene.hooks_for_future?.join('; ') || 'none';
    const content = scene.situation || scene.purpose;
    return `Scene ${scene.index}: "${scene.title}" [${scene.phase}] - ${content} | Focus: ${focus} | Hooks: ${hooks}`;
}

/**
 * Compress completed scenes for context injection
 * Full JSON for the immediately preceding batch, compact summaries for all earlier scenes.
 * @param {Array} completedScenes - All completed scenes so far
 * @param {number} currentBatchStart - Start index of current batch
 * @param {number} batchSize - Size of each batch
 * @returns {{ summaryText: string, previousBatchJson: string }}
 */
export function compressCompletedScenes(completedScenes, currentBatchStart, batchSize) {
    const defaults = {
        summaryText: 'No completed scenes yet.',
        previousBatchJson: 'No previous batch.',
    };

    if (!completedScenes?.length) return defaults;

    const prevBatchStart = currentBatchStart - batchSize;
    const olderScenes = completedScenes.filter(s => s.index < prevBatchStart);
    const prevBatchScenes = completedScenes.filter(s => s.index >= prevBatchStart && s.index < currentBatchStart);

    return {
        summaryText: olderScenes.length
            ? olderScenes.map(formatSceneSummary).join('\n')
            : 'No earlier scenes (this is the first or second batch).',
        previousBatchJson: prevBatchScenes.length
            ? JSON.stringify(prevBatchScenes, null, 2)
            : 'No previous batch (this is the first batch).',
    };
}

/**
 * Build the scene batch prompt for Phase 3b..3n
 * Generates full scene detail for a batch of scenes
 * @param {Object} request - Blueprint request
 * @param {Object} storyType - Story type object
 * @param {Object} authorStyle - Author style (optional)
 * @param {Object} partialBlueprint - Partial blueprint
 * @param {Array} plan - Full scene plan outlines from 3a
 * @param {Array} completedScenes - Scenes completed in earlier batches
 * @param {Array<number>} batchIndices - Scene indices to generate in this batch
 * @param {number} batchSize - Batch size for compression
 * @returns {Promise<string>} Complete batch prompt
 */
export async function buildSceneBatchPrompt(
    request, storyType, authorStyle, partialBlueprint,
    plan, completedScenes, batchIndices, batchSize
) {
    const template = await PromptTemplates.loadTemplate('phased-generation/scene-batch-prompt.txt');
    const commonVars = await buildCommonSceneContext(request, storyType, authorStyle, partialBlueprint);

    // Compress completed scenes with tiered strategy
    const currentBatchStart = Math.min(...batchIndices);
    const { summaryText, previousBatchJson } = compressCompletedScenes(completedScenes, currentBatchStart, batchSize);

    // Extract outlines for the batch scenes
    const batchOutlines = plan.filter(s => batchIndices.includes(s.index));
    const batchOutlinesText = JSON.stringify(batchOutlines, null, 2);
    const batchIndicesText = batchIndices.join(', ');

    const batchVars = {
        ...commonVars,
        SCENE_PLAN_JSON: JSON.stringify(plan, null, 2),
        COMPLETED_SCENES_SUMMARY: summaryText,
        PREVIOUS_BATCH_JSON: previousBatchJson,
        BATCH_OUTLINES: batchOutlinesText,
        BATCH_SCENE_INDICES: batchIndicesText,
    };

    return PromptTemplates.renderTemplate(template, batchVars);
}
