/**
 * Scene Image Generator Module
 *
 * Handles async image generation via SillyTavern SD extension.
 * Uses the same approach as cover generation (SlashCommandParser.commands['sd']).
 */

import { extension_settings } from '/scripts/extensions.js';
import { SlashCommandParser } from '/scripts/slash-commands/SlashCommandParser.js';
import { MODULE_NAME } from '../core/state-manager.js';
import { isValidImageUrl } from '../blueprint/utils.js';
import * as ImagePrompt from './image-prompt.js';
import * as ImageStorage from './image-storage.js';
import { addImageToCharacterGallery } from './image-preview.js';

// Import SillyTavern globals for character detection
import { characters, this_chid } from '/script.js';
import { groups, selected_group } from '/scripts/group-chats.js';

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
    // Workaround for SD lazy initialization bug: force reload settings to ensure fresh state
    if (typeof window.loadExtensionSettings === 'function') {
        await window.loadExtensionSettings('stable-diffusion');
    }

    // Check SD extension availability
    if (!extension_settings.sd || !extension_settings.sd.source) {
        console.warn('[Scene Image Generator] SD settings not initialized even after load attempt.');

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

            // Auto-add to character gallery if enabled
            if (settings.addToGallery) {
                console.log('[Scene Image Generator] Auto-add to gallery enabled, attempting to add...');
                await tryAutoAddToGallery(scene, imageUrl, blueprint);
            }

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
 * Try to automatically add generated scene image to character gallery.
 * Uses scene's character_focus to determine target characters.
 * @param {Object} scene - Scene object
 * @param {string} imageUrl - Generated image URL or data
 * @param {Object} blueprint - Blueprint object
 */
async function tryAutoAddToGallery(scene, imageUrl, blueprint) {
    try {
        // Determine target character(s) from scene focus
        let targetCharacters = [];

        // Priority 1: Scene character focus
        if (scene.character_focus?.length > 0) {
            targetCharacters = scene.character_focus.map(cf => cf.name || cf).filter(Boolean);
        }

        // Priority 2: Group chat members (if in a group chat)
        if (targetCharacters.length === 0 && selected_group && groups) {
            const currentGroup = groups.find(g => g.id === selected_group);
            if (currentGroup?.members) {
                targetCharacters = currentGroup.members
                    .map(memberId => {
                        const char = characters?.find(c => c.avatar === memberId);
                        return char?.name;
                    })
                    .filter(Boolean);
            }
        }

        // Priority 3: Single character chat
        if (targetCharacters.length === 0 && this_chid !== undefined && characters?.[this_chid]) {
            const char = characters[this_chid];
            if (char?.name) {
                targetCharacters = [char.name];
            }
        }

        if (targetCharacters.length === 0) {
            console.warn('[Scene Image Generator] No target characters found for auto-add to gallery');
            return;
        }

        // Add to first character's gallery (or all if multiple focused)
        // For scenes with multiple character focus, use the first one
        const targetCharacter = targetCharacters[0];

        console.log(`[Scene Image Generator] Auto-adding scene ${scene.index + 1} image to ${targetCharacter}'s gallery`);

        const success = await addImageToCharacterGallery(targetCharacter, imageUrl, scene);

        if (success) {
            console.log(`[Scene Image Generator] Successfully auto-added to ${targetCharacter}'s gallery`);
        } else {
            console.warn(`[Scene Image Generator] Failed to auto-add to ${targetCharacter}'s gallery`);
        }

    } catch (error) {
        console.error('[Scene Image Generator] Error during auto-add to gallery:', error);
        // Don't throw - auto-add failure shouldn't break generation
    }
}
