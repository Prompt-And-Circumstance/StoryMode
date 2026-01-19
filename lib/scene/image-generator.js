/**
 * Scene Image Generator Module
 *
 * Handles async image generation via SillyTavern SD extension.
 * Uses the same approach as cover generation (SlashCommandParser.commands['sd']).
 */

import { extension_settings } from '/scripts/extensions.js';
import { SlashCommandParser } from '/scripts/slash-commands/SlashCommandParser.js';
import { MODULE_NAME } from '../core/state-manager.js';
import * as ImagePrompt from './image-prompt.js';
import * as ImageStorage from './image-storage.js';

// ============================================================================
// MODULE CONSTANTS
// ============================================================================

/** Generation state tracking */
let isGenerating = false;
let currentBlueprintId = null;
let currentSceneIndex = null;

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Check if an image is currently being generated.
 * @returns {boolean} True if generation is in progress
 */
export function isGenerationInProgress() {
    return isGenerating;
}

/**
 * Get the current generation state.
 * @returns {Object} Generation state
 */
export function getGenerationState() {
    return {
        isGenerating,
        blueprintId: currentBlueprintId,
        sceneIndex: currentSceneIndex,
    };
}

/**
 * Generate a scene image using the SD extension.
 * Uses the same approach as cover generation (SlashCommandParser.commands['sd']).
 *
 * @param {Object} scene - Scene object from blueprint
 * @param {Object} blueprint - Full blueprint object
 * @param {Object} options - Optional generation settings
 * @param {string} [options.styleOverride] - Custom style override for prompt
 * @returns {Promise<Object>} Generation result with success, imageData, or error
 */
export async function generateSceneImage(scene, blueprint, options = {}) {
    if (isGenerating) {
        return { success: false, error: 'Generation already in progress' };
    }

    const settings = extension_settings[MODULE_NAME]?.imageGeneration || {};

    if (!settings.enabled) {
        return { success: false, error: 'Scene image generation is disabled' };
    }

    // Check SD extension availability (same as cover generation)
    if (!extension_settings.sd || !extension_settings.sd.source) {
        console.warn('[Scene Image Generator] SD settings not initialized, attempting to load...');

        if (typeof window.loadExtensionSettings === 'function') {
            await window.loadExtensionSettings('stable-diffusion');
        }

        if (!extension_settings.sd || !extension_settings.sd.source) {
            return {
                success: false,
                error: 'SD extension not configured. Configure it in Extensions → Image Generation.'
            };
        }
    }

    // Check if SD slash command is available
    if (!SlashCommandParser?.commands?.sd) {
        return { success: false, error: 'SD slash command not available' };
    }

    // Set generation state
    isGenerating = true;
    currentBlueprintId = blueprint.blueprint_id;
    currentSceneIndex = scene.index;

    try {
        // Generate prompt using scene image prompt module
        const prompt = ImagePrompt.generateSceneImagePrompt(
            scene,
            blueprint,
            { styleOverride: options.styleOverride }
        );

        if (!prompt) {
            throw new Error('Failed to generate image prompt');
        }

        console.log(`[Scene Image Generator] Generated prompt for scene ${scene.index}:`, prompt);
        console.log('[Scene Image Generator] Image Provider:', extension_settings.sd.source);

        // Call SD extension using SlashCommandParser (same as cover generation)
        const result = await SlashCommandParser.commands['sd'].callback(
            { quiet: 'true' },
            prompt
        );

        if (typeof result === 'string' && result.trim().length > 0) {
            const imageUrl = result.trim();

            // Validate URL before storing
            if (!isValidImageUrl(imageUrl)) {
                console.error('[Scene Image Generator] Invalid image URL returned:', imageUrl.substring(0, 50));
                throw new Error('Invalid image URL returned from provider');
            }

            // Store the generated image
            ImageStorage.storeSceneImage(
                blueprint.blueprint_id,
                scene.index,
                {
                    prompt,
                    imageData: imageUrl,
                    provider: extension_settings.sd.source,
                }
            );

            console.log(`[Scene Image Generator] Successfully generated image for scene ${scene.index}`);

            return {
                success: true,
                imageData: imageUrl,
                prompt,
                sceneIndex: scene.index,
            };
        } else {
            throw new Error('No image returned from image provider');
        }

    } catch (error) {
        console.error('[Scene Image Generator] Generation failed:', error);
        return {
            success: false,
            error: error.message || 'Unknown error occurred',
        };
    } finally {
        isGenerating = false;
        currentBlueprintId = null;
        currentSceneIndex = null;
    }
}

/**
 * Check if the SD extension is available and configured.
 * @returns {boolean} True if SD is available
 */
export function isSDAvailable() {
    return !!(
        extension_settings.sd?.source &&
        SlashCommandParser?.commands?.sd
    );
}

/**
 * Get available SD profiles from Connection Manager.
 * @deprecated SD profiles are no longer used - scenes use the global SD extension
 * @returns {Array<Object>} Empty array (maintained for backward compatibility)
 */
export function getSDProfiles() {
    console.warn('[Scene Image Generator] getSDProfiles() is deprecated. Scene images now use the global SD extension.');
    return [];
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validate that a URL is safe to use as an image source.
 * Prevents XSS via javascript: or other malicious URL schemes.
 *
 * @param {string} url - URL to validate
 * @returns {boolean} True if URL is safe for image src
 */
function isValidImageUrl(url) {
    if (typeof url !== 'string') return false;
    const trimmed = url.trim();
    return trimmed.startsWith('http://') ||
        trimmed.startsWith('https://') ||
        trimmed.startsWith('data:image/') ||
        trimmed.startsWith('/');  // Allow local file paths from SD extension
}
