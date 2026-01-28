/**
 * @file AI-assisted style generation
 * @module generation/style-generator
 */

import { generateWithPreset } from './orchestration.js';
import { loadTemplate, renderTemplate } from './templates.js';
import { robustParseJSON } from '../blueprint/utils.js';
import { extension_settings } from '/scripts/extensions.js';
import { MODULE_NAME } from '../core/state-manager.js';

/**
 * Get the configured style generation API profile
 * @returns {string} Profile ID or empty string for default
 */
function getStyleGenerationProfile() {
    return extension_settings[MODULE_NAME]?.utilityApis?.styleGeneration || '';
}

/**
 * Generate a unique ID with timestamp suffix to prevent collisions
 * @param {string} baseId - The base ID from LLM
 * @returns {string} Unique ID with prefix and timestamp
 */
function generateUniqueId(baseId) {
    const cleanId = baseId.replace(/^generated_/, '');
    return `generated_${cleanId}_${Date.now()}`;
}

/**
 * Generate an author style from a natural language description
 * @param {string} description - User's description (author name, style, or mashup)
 * @returns {Promise<Object>} Generated author style object
 */
export async function generateAuthorStyle(description) {
    const template = await loadTemplate('style-generation/author-style-prompt.txt');
    const prompt = renderTemplate(template, { USER_DESCRIPTION: description });

    const selectedProfile = getStyleGenerationProfile();

    // Note: selectedProfile can be empty string to use default API
    const response = await generateWithPreset({
        prompt,
        systemPrompt: 'You are an expert on writing styles. Output only valid JSON.',
        responseLength: 2000,
        profileId: selectedProfile || undefined,  // undefined = use default
        phase: 'style',
        phaseName: 'Author Style Generation'
    });

    const result = robustParseJSON(response);

    if (!result?.id || !result.name || !result.authorPrompt) {
        throw new Error('Invalid response: missing required fields (id, name, authorPrompt)');
    }

    return {
        ...result,
        id: generateUniqueId(result.id),
        category: result.category || ['Custom'],
        keywords: result.keywords || [],
        nsfwPrompt: result.nsfwPrompt || ''
    };
}

/**
 * Generate a story type from a natural language description
 * @param {string} description - User's description (genre, mashup, etc.)
 * @returns {Promise<Object>} Generated story type object
 */
export async function generateStoryType(description) {
    const template = await loadTemplate('style-generation/story-type-prompt.txt');
    const prompt = renderTemplate(template, { USER_DESCRIPTION: description });

    const selectedProfile = getStyleGenerationProfile();

    const response = await generateWithPreset({
        prompt,
        systemPrompt: 'You are an expert story designer. Output only valid JSON.',
        responseLength: 3000,
        profileId: selectedProfile || undefined,
        phase: 'style',
        phaseName: 'Story Type Generation'
    });

    const result = robustParseJSON(response);

    if (!result?.id || !result.name || !result.storyPrompt) {
        throw new Error('Invalid response: missing required fields (id, name, storyPrompt)');
    }

    return {
        ...result,
        id: generateUniqueId(result.id),
        category: result.category || ['Custom'],
        progressTemplate: result.progressTemplate || 'Arc Progress: Step {currentStep}/{arcLength} ({arcPercent}% complete). Phase: {phase}.',
        phasePrompts: result.phasePrompts || { setup: '', confrontation: '', resolution: '' }
    };
}
