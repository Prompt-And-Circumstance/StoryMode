/**
 * Cover Gallery Module
 * Handles gallery navigation, state management, and cover storage
 */

import { extension_settings } from '/scripts/extensions.js';
import { generateUUID, isValidImageUrl } from '../../blueprint/utils.js';
import { MODULE_NAME } from '../../core/state-manager.js';
import {
    getCurrentBlueprint,
    setHasUnsavedChanges,
} from './state.js';

// Import refresh functions - these will be injected to avoid circular deps
let _refreshContent = null;

/**
 * Set the refresh function (called from main module to avoid circular imports)
 * @param {Function} fn - The refreshContent function
 */
export function setRefreshContent(fn) {
    _refreshContent = fn;
}

/**
 * Set cover image across all state locations
 * @param {number} index - Cover index in gallery
 * @param {string} url - Cover image URL
 * @param {Array} gallery - Gallery array for seed lookup
 */
export function setCoverImage(index, url, gallery) {
    getCurrentBlueprint().metadata.coverGalleryIndex = index;
    getCurrentBlueprint().metadata.coverImageUrl = url;
    getCurrentBlueprint().coverImageUrl = url;

    // Update seed reference from gallery
    const cover = gallery[index];
    if (cover?.seed) {
        const prompt = getCurrentBlueprint().metadata.coverPrompt ||= {};
        prompt.technical ||= {};
        prompt.technical.custom_seed = cover.seed;
    }
}

/**
 * Enforce gallery size limit by removing oldest covers
 * @param {Array} gallery - Gallery array
 * @param {number} maxSize - Maximum gallery size
 */
export function enforceGallerySizeLimit(gallery, maxSize) {
    while (gallery.length >= maxSize) {
        gallery.shift();
    }
}

/**
 * Check if keyboard navigation should be allowed
 * @returns {boolean} True if navigation is allowed
 */
export function canNavigateGallery() {
    if (!$('.storymode-blueprint-editor-container').length) return false;
    if ($('input:focus, textarea:focus, select:focus').length) return false;
    const gallery = getCurrentBlueprint().metadata?.coverGallery || [];
    if (gallery.length <= 1) return false;
    return extension_settings[MODULE_NAME]?.blueprintSettings?.coverGeneration?.keyboardNavigation !== false;
}

/**
 * Announce cover change for screen readers
 * @param {number} index - Current cover index
 * @param {number} total - Total number of covers
 */
export function announceCoverChange(index, total) {
    const statusEl = document.getElementById('cover_gallery_status');
    if (statusEl) {
        statusEl.textContent = `Now showing cover ${index + 1} of ${total}`;
    }
}

/**
 * Navigate to a specific cover in the gallery
 * @param {number} newIndex - Target cover index
 * @returns {boolean} True if navigation succeeded
 */
export function navigateCoverGallery(newIndex) {
    const gallery = getCurrentBlueprint().metadata?.coverGallery || [];
    if (newIndex < 0 || newIndex >= gallery.length) return false;

    setCoverImage(newIndex, gallery[newIndex].url, gallery);
    setHasUnsavedChanges(true);
    if (_refreshContent) _refreshContent();
    announceCoverChange(newIndex, gallery.length);
    return true;
}

/**
 * Add generated cover to blueprint's cover gallery
 * @param {Object} blueprint - Blueprint object
 * @param {string} imageUrl - Generated image URL
 * @param {Object} prompt - Prompt used for generation
 * @param {Object} metadata - Optional cover metadata (model, seed, etc.)
 * @returns {Object} The created cover entry
 */
export async function addCoverToGallery(blueprint, imageUrl, prompt, metadata = {}) {
    // Security: Validate URL before adding to gallery
    if (!isValidImageUrl(imageUrl)) {
        console.error('[CoverGallery] Refusing to add invalid image URL to gallery:', imageUrl.substring(0, 50));
        throw new Error('Invalid image URL. Must start with http://, https://, data:image/, or /');
    }

    blueprint.metadata = blueprint.metadata || {};
    blueprint.metadata.coverGallery = blueprint.metadata.coverGallery || [];

    const maxSize = extension_settings[MODULE_NAME]?.blueprintSettings?.coverGeneration?.maxGallerySize || 10;

    // Remove oldest covers if gallery is full
    enforceGallerySizeLimit(blueprint.metadata.coverGallery, maxSize);

    const coverEntry = {
        id: generateUUID(),
        url: imageUrl,
        prompt: prompt,
        generatedAt: new Date().toISOString(),
        ...metadata
    };

    blueprint.metadata.coverGallery.push(coverEntry);

    // Set index to newly added cover (last item)
    blueprint.metadata.coverGalleryIndex = blueprint.metadata.coverGallery.length - 1;

    // Sync coverImageUrl so encodeBlueprintAsPNG uses the new cover
    blueprint.metadata.coverImageUrl = imageUrl;
    blueprint.coverImageUrl = imageUrl;

    return coverEntry;
}

/**
 * Legacy function - kept for backward compatibility
 * @param {Object} blueprint - Blueprint object
 * @param {string} imageUrl - Generated image URL
 * @param {Object} prompt - Prompt used for generation
 * @param {Object} metadata - Optional cover metadata
 */
export async function addLegacyCoverToGallery(blueprint, imageUrl, prompt, metadata = {}) {
    // Security: Validate URL before adding to gallery
    if (!isValidImageUrl(imageUrl)) {
        console.error('[CoverGallery] Refusing to add invalid image URL to gallery:', imageUrl.substring(0, 50));
        throw new Error('Invalid image URL. Must start with http://, https://, data:image/, or /');
    }

    blueprint.metadata = blueprint.metadata || {};
    blueprint.metadata.coverGallery = blueprint.metadata.coverGallery || [];

    const maxSize = extension_settings[MODULE_NAME]?.blueprintSettings?.coverGeneration?.maxGallerySize || 10;

    // Remove oldest covers if gallery is full
    enforceGallerySizeLimit(blueprint.metadata.coverGallery, maxSize);

    const coverEntry = {
        id: generateUUID(),
        url: imageUrl,
        prompt: prompt ? JSON.parse(JSON.stringify(prompt)) : null,  // Deep copy
        timestamp: new Date().toISOString(),
        seed: metadata.seed || Math.floor(Math.random() * 1000000),
        model: metadata.model || blueprint.metadata.coverModel?.name || 'SD',
        ...metadata
    };

    blueprint.metadata.coverGallery.push(coverEntry);
    blueprint.metadata.coverGalleryIndex = blueprint.metadata.coverGallery.length - 1;
    blueprint.metadata.coverSeed = coverEntry.seed;
}
