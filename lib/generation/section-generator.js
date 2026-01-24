/**
 * Section generation for wizard panel
 * @module generation/section-generator
 */

import { PHASE_CONFIG } from '../core/constants.js';
import { buildPhasePrompt } from './prompts.js';
import { robustParseJSON } from '../blueprint/utils.js';
import { isBlueprintDebugMode, getMockPhaseResponse } from '../debug/mocks.js';
import { validatePhaseOutput } from './validation.js';
import { generateWithPreset } from './orchestration.js';

export const SECTION_CONFIG = {
    foundation: {
        name: 'Foundation',
        phaseNumber: 1,
        required: [],
        message: null
    },
    characters: {
        name: 'Characters',
        phaseNumber: 2,
        required: ['core_premise'],
        message: 'Please fill in the Core Premise first, or generate the Foundation section.'
    },
    scenes: {
        name: 'Scenes',
        phaseNumber: 3,
        required: ['core_premise', 'character_arcs'],
        message: 'Please complete Foundation and Characters sections first.'
    },
    resolution: {
        name: 'Resolution',
        phaseNumber: 4,
        required: ['core_premise', 'character_arcs', 'scene_plan'],
        message: 'Please complete Foundation, Characters, and Scenes sections first.'
    }
};

export function checkSectionPrerequisites(sectionId, blueprint) {
    const config = SECTION_CONFIG[sectionId];
    if (!config) {
        return { canGenerate: false, missing: [], message: 'Unknown section' };
    }

    const missing = [];
    for (const field of config.required) {
        const value = blueprint[field];
        if (!value || (Array.isArray(value) && value.length === 0) ||
            (typeof value === 'string' && value.trim() === '')) {
            missing.push(field.replace(/_/g, ' '));
        }
    }

    if (missing.length > 0) {
        return {
            canGenerate: false,
            missing,
            message: config.message || `Please complete these sections first: ${missing.join(', ')}`
        };
    }

    return { canGenerate: true, missing: [], message: null };
}

function buildSystemPrompt(storyType, authorStyle) {
    const style = authorStyle?.name
        ? ` specializing in ${storyType.name} stories, writing in the distinct style of ${authorStyle.name}.`
        : '.';
    return `You are an expert story designer${style} Output ONLY valid JSON as specified.`;
}

export async function generateSection(sectionId, blueprint, context, extensionSettings, moduleName) {
    const config = SECTION_CONFIG[sectionId];
    if (!config) throw new Error(`Unknown section: ${sectionId}`);

    const { getStoryTypes, getAuthorStyles } = await import('../core/state-manager.js');
    const storyTypes = getStoryTypes();
    const authorStyles = getAuthorStyles();

    const storyType = storyTypes.find(t => t.id === context.storyTypeId);
    if (!storyType) throw new Error(`Story type not found: ${context.storyTypeId}`);

    const authorStyle = context.authorStyleId ? authorStyles.find(s => s.id === context.authorStyleId) : null;

    // Build request with all fields expected by prompt builders
    // Use existing blueprint data where available, fall back to defaults
    const request = {
        story_type_id: context.storyTypeId,
        user_scenario: context.scenario || blueprint.user_scenario || '',
        author_style: context.authorStyleId || null,
        total_messages_target: blueprint.arc_structure?.total_messages_target || 30,
        genre_interpretation: {
            metaphor_level: blueprint.genre_realism_notes?.metaphor_level_used || 'mixed'
        },
        character_data: [], // Will be populated from blueprint character_arcs if needed
        persona_data: []    // Will be populated if personas are linked
    };

    const prompt = await buildPhasePrompt(config.phaseNumber, request, storyType, authorStyle, blueprint);
    const systemPrompt = buildSystemPrompt(storyType, authorStyle);
    const selectedProfileId = extensionSettings?.[moduleName]?.blueprintSettings?.generationApi || null;

    let rawText;
    if (isBlueprintDebugMode()) {
        const mockData = getMockPhaseResponse(config.phaseNumber);
        rawText = JSON.stringify(mockData, null, 2);
        await new Promise(resolve => setTimeout(resolve, 500));
    } else {
        rawText = await generateWithPreset({
            prompt,
            systemPrompt,
            responseLength: PHASE_CONFIG[config.phaseNumber].maxTokens,
            profileId: selectedProfileId,
            phase: config.phaseNumber,
            phaseName: config.name
        });
    }

    if (!rawText?.trim()) {
        throw new Error(`Empty response from LLM for ${config.name} section`);
    }

    const sectionData = robustParseJSON(rawText);
    validatePhaseOutput(config.phaseNumber, sectionData);

    return sectionData;
}
