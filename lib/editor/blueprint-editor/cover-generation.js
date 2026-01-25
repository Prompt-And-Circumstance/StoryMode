/**
 * Cover Generation Module
 * Handles Stable Diffusion integration for blueprint cover images
 */

import { extension_settings } from '/scripts/extensions.js';
import { SlashCommandParser } from '/scripts/slash-commands/SlashCommandParser.js';
import { generateCoverPrompt } from '../../blueprint/storage.js';
import { isValidImageUrl } from '../../blueprint/utils.js';
import { isCoverDebugMode, getMockCoverResult } from '../../debug/mocks.js';

/**
 * Build Stable Diffusion prompt from cover prompt object
 * @param {Object} coverPrompt - Cover prompt specification
 * @returns {string} Full SD prompt
 */
export function buildSDPrompt(coverPrompt) {
    const positiveParts = [
        coverPrompt.positive,
        coverPrompt.style,
        coverPrompt.mood,
        coverPrompt.lighting,
        coverPrompt.composition,
    ].filter(Boolean);

    const positive = positiveParts.join(', ');
    // SD slash command format: "positive --no negative"
    return coverPrompt.negative ? `${positive} --no ${coverPrompt.negative}` : positive;
}

/**
 * Set cover image URL on blueprint (both top-level and metadata)
 * @param {Object} blueprint - Blueprint object
 * @param {string} imageUrl - Image URL to set
 */
export function setCoverImageUrl(blueprint, imageUrl) {
    blueprint.metadata = blueprint.metadata || {};
    blueprint.metadata.coverImageUrl = imageUrl;
    blueprint.coverImageUrl = imageUrl;
}

/**
 * Generate cover image using SD extension
 * Core logic extracted for reuse by both editor and auto-generation flows
 *
 * @param {Object} blueprint - Blueprint object (must have metadata.coverPrompt or will auto-generate)
 * @returns {Promise<{success: boolean, imageUrl?: string, error?: string}>}
 */
export async function generateCoverFromSD(blueprint) {
    // Check for debug mode - return mock cover without calling SD
    if (isCoverDebugMode()) {
        await new Promise(r => setTimeout(r, 500)); // Simulate brief delay
        return getMockCoverResult();
    }

    // Validate SD extension
    if (!extension_settings.sd || !extension_settings.sd.source) {
        console.warn('[CoverGeneration] SD settings not initialized, attempting to load...');

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

    // Get or generate cover prompt
    let prompt = blueprint.metadata?.coverPrompt;
    if (!prompt) {
        // Try to generate one (should always succeed due to fallbacks)
        try {
            prompt = generateCoverPrompt(blueprint);
            // Store it for future use
            blueprint.metadata = blueprint.metadata || {};
            blueprint.metadata.coverPrompt = prompt;
        } catch (e) {
            return { success: false, error: 'Could not generate cover prompt from blueprint data' };
        }
    }

    try {
        const fullPrompt = buildSDPrompt(prompt);

        const result = await SlashCommandParser.commands['sd'].callback(
            { quiet: 'true' },
            fullPrompt
        );

        if (typeof result === 'string' && result.trim().length > 0) {
            let imageUrl = result.trim();

            // Convert blob URLs to data URLs (blob URLs are transient and don't survive reload)
            if (imageUrl.startsWith('blob:')) {
                console.log('[CoverGeneration] Converting blob URL to data URL...');
                try {
                    imageUrl = await blobUrlToDataUrl(imageUrl);
                } catch (conversionError) {
                    console.error('[CoverGeneration] Failed to convert blob URL:', conversionError);
                    return { success: false, error: 'Failed to convert image format' };
                }
            }

            // Security: Validate URL before returning
            if (!isValidImageUrl(imageUrl)) {
                console.error('[CoverGeneration] Invalid image URL returned:', imageUrl.substring(0, 50));
                return { success: false, error: 'Invalid image URL returned from provider' };
            }

            return { success: true, imageUrl };
        } else {
            return { success: false, error: 'No image returned from image provider' };
        }
    } catch (err) {
        console.error('[CoverGeneration] Failed to generate cover:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Convert a blob URL to a data URL (base64)
 * @param {string} blobUrl - Blob URL to convert
 * @returns {Promise<string>} Data URL
 */
async function blobUrlToDataUrl(blobUrl) {
    const response = await fetch(blobUrl);
    const blob = await response.blob();

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}
