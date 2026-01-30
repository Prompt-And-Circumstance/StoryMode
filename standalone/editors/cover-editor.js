/**
 * Cover Editor Module
 * Handles cover image management and the Cover tab
 */

import { showSuccess, showInfo, showError } from '../adapters/notification-adapter.js';
import { getConnectionStatus } from '../adapters/connection-bridge.js';
import { openUploadModal, uploadCoverFile } from './cover-upload-modal.js';
import { openGenerateModal } from './cover-generate-modal.js';
import { generateCover } from '../adapters/connection-bridge.js';
import { getCurrentBlueprint } from '../handlers/blueprint-actions.js';

// ============================================================================
// COVER TAB RENDERING
// ============================================================================

/**
 * Render the Cover tab content
 * @param {Object} blueprint - Blueprint object
 * @param {Object} options - Options object
 * @returns {jQuery} Cover tab content
 */
export function renderCoverTab(blueprint, options = {}) {
    const { readonly = false } = options;
    const covers = blueprint.covers || [];
    const currentCover = blueprint.cover || covers[0] || null;

    const $content = $('<div>').addClass('cover-editor');

    // Header
    const $header = $('<div>').addClass('tab-header');
    $header.append($('<h3>').text('Cover Image'));

    const $actions = $('<div>').addClass('tab-actions');
    $actions.append($('<button>')
        .addClass('btn btn-secondary')
        .attr('data-action', 'upload-cover')
        .html('<i class="fa-solid fa-upload"></i> Upload Cover')
        .prop('disabled', readonly));

    // Generate button (only if connected)
    const isConnected = getConnectionStatus() === 'connected';
    if (isConnected && !readonly) {
        $actions.append($('<button>')
            .addClass('btn btn-primary')
            .attr('data-action', 'generate-cover')
            .html('<i class="fa-solid fa-wand-magic-sparkles"></i> Generate Cover'));
    }

    $header.append($actions);
    $content.append($header);

    // Current cover display
    if (currentCover) {
        const $current = $('<div>').addClass('current-cover');
        $current.append($('<h4>').text('Current Cover'));
        const $img = $('<img>').addClass('cover-image-main').attr('src', currentCover);
        $current.append($img);

        if (!readonly) {
            const $removeBtn = $('<button>')
                .addClass('btn btn-sm btn-danger')
                .attr('data-action', 'remove-cover')
                .html('<i class="fa-solid fa-trash"></i> Remove Current Cover');
            $current.append($removeBtn);
        }

        $content.append($current);
    } else {
        const $noCover = $('<div>').addClass('no-cover');
        $noCover.append($('<i>').addClass('fa-solid fa-image'));
        $noCover.append($('<p>').text('No cover image set'));
        $content.append($noCover);
    }

    // Gallery section
    const $gallery = $('<div>').addClass('cover-gallery');
    $gallery.append($('<h4>').text(`Cover Gallery (${covers.length} images)`));

    if (covers.length === 0) {
        $gallery.append($('<p>').addClass('text-muted').text('No cover images in gallery.'));
    } else {
        const $grid = $('<div>').addClass('cover-grid');
        covers.forEach((coverUrl, index) => {
            $grid.append(renderGalleryThumbnail(coverUrl, index, currentCover === coverUrl, readonly));
        });
        $gallery.append($grid);
    }

    $content.append($gallery);

    // Bind events
    bindCoverEvents($content, readonly);

    return $content;
}

/**
 * Render a gallery thumbnail
 * @param {string} coverUrl - Cover image URL
 * @param {number} index - Cover index
 * @param {boolean} isCurrent - Whether this is the current cover
 * @param {boolean} readonly - Whether thumbnail is readonly
 * @returns {jQuery} Thumbnail element
 */
function renderGalleryThumbnail(coverUrl, index, isCurrent, readonly) {
    const $thumb = $('<div>').addClass('cover-thumbnail');
    if (isCurrent) $thumb.addClass('is-current');

    const $img = $('<img>').attr('src', coverUrl);
    $thumb.append($img);

    if (isCurrent) {
        $thumb.append($('<span>').addClass('current-badge').text('Current'));
    }

    if (!readonly) {
        const $actions = $('<div>').addClass('thumbnail-actions');

        if (!isCurrent) {
            const $setBtn = $('<button>')
                .addClass('btn btn-sm btn-primary')
                .attr('data-action', 'set-cover')
                .attr('data-index', index)
                .html('<i class="fa-solid fa-check"></i> Set as Cover');
            $actions.append($setBtn);
        }

        const $deleteBtn = $('<button>')
            .addClass('btn btn-sm btn-danger')
            .attr('data-action', 'delete-cover')
            .attr('data-index', index)
            .html('<i class="fa-solid fa-trash"></i>');

        $actions.append($deleteBtn);
        $thumb.append($actions);
    }

    return $thumb;
}

// ============================================================================
// EVENT BINDING
// ============================================================================

/**
 * Bind events for the Cover tab
 * @param {jQuery} $content - Content element
 * @param {boolean} readonly - Whether tab is readonly
 */
function bindCoverEvents($content, readonly) {
    if (readonly) return;

    // Upload cover button
    $content.on('click.cover-editor', '[data-action="upload-cover"]', function() {
        handleUploadClick();
    });

    // Generate cover button
    $content.on('click.cover-editor', '[data-action="generate-cover"]', function() {
        handleGenerateClick();
    });

    // Remove current cover
    $content.on('click.cover-editor', '[data-action="remove-cover"]', function() {
        removeCurrentCover();
    });

    // Set as cover from gallery
    $content.on('click.cover-editor', '[data-action="set-cover"]', function() {
        const index = $(this).data('index');
        setCurrentCover(index);
    });

    // Delete cover from gallery
    $content.on('click.cover-editor', '[data-action="delete-cover"]', function() {
        const index = $(this).data('index');
        deleteCover(index);
    });
}

// ============================================================================
// COVER OPERATIONS
// ============================================================================

/**
 * Handle upload button click
 */
function handleUploadClick() {
    openUploadModal((file) => {
        uploadCoverFile(file, addCoverToBlueprint);
    });
}

/**
 * Handle generate button click
 */
function handleGenerateClick() {
    const blueprint = getCurrentBlueprint();
    if (!blueprint) {
        showError('No blueprint loaded. Please create or load a blueprint first.');
        return;
    }
    openGenerateModal(blueprint, (params) => {
        generateCoverFromApi(blueprint, params);
    });
}

/**
 * Generate a cover using the backend API
 * @param {Object} blueprint - Blueprint object
 * @param {Object} params - Generation parameters
 */
async function generateCoverFromApi(blueprint, params) {
    try {
        // Show loading state
        showInfo('Generating cover image... This may take 30-60 seconds.');

        // Build generation request
        const request = {
            blueprint_id: blueprint.blueprint_id,
            blueprint_title: blueprint.userMetadata?.title || blueprint.blueprint_title || blueprint.core_premise?.substring(0, 50),
            prompt: params.prompt,
            negative_prompt: params.negative_prompt || 'text, watermark, signature, blurry, low quality, distorted, ugly',
            steps: params.steps || 20,
            cfg_scale: params.cfg_scale || 7,
            width: 600,
            height: 900,
            story_type: blueprint.story_type_name,
            genre: blueprint.tone_and_style?.primary_tone,
        };

        // Call the backend API
        const imageData = await generateCover(request);

        // Add to blueprint
        addCoverToBlueprint(imageData);
        showSuccess('Cover generated successfully!');

    } catch (error) {
        console.error('[Cover Editor] Generation failed:', error);
        // Show user-friendly error message
        if (error.message.includes('not connected') || error.message.includes('No API URL')) {
            showError('Not connected to SillyTavern. Please configure your connection in Settings.');
        } else if (error.message.includes('Stable Diffusion') || error.message.includes('SD')) {
            showError('Stable Diffusion not available. Please ensure SD is configured in SillyTavern.');
        } else {
            showError('Failed to generate cover: ' + error.message);
        }
    }
}

/**
 * Add a cover to the blueprint
 * @param {string} coverData - Base64 image data
 */
function addCoverToBlueprint(coverData) {
    const blueprint = getCurrentBlueprint();
    if (!blueprint) return;

    if (!blueprint.covers) blueprint.covers = [];
    blueprint.covers.push(coverData);

    // Set as current if no current cover
    if (!blueprint.cover) {
        blueprint.cover = coverData;
    }

    $(document).trigger('blueprint:updated', { blueprint });
    $(document).trigger('cover:changed', { cover: blueprint.cover, covers: blueprint.covers });
}

/**
 * Set the current cover from gallery
 * @param {number} index - Cover index
 */
function setCurrentCover(index) {
    const blueprint = getCurrentBlueprint();
    if (!blueprint || !blueprint.covers) return;

    blueprint.cover = blueprint.covers[index];

    $(document).trigger('blueprint:updated', { blueprint });
    $(document).trigger('cover:changed', { cover: blueprint.cover, covers: blueprint.covers });
}

/**
 * Delete a cover from the gallery
 * @param {number} index - Cover index
 */
function deleteCover(index) {
    const blueprint = getCurrentBlueprint();
    if (!blueprint || !blueprint.covers) return;

    const coverUrl = blueprint.covers[index];

    // Check if this is the current cover
    if (blueprint.cover === coverUrl) {
        blueprint.cover = null;
    }

    // Remove from gallery
    blueprint.covers.splice(index, 1);

    $(document).trigger('blueprint:updated', { blueprint });
    $(document).trigger('cover:changed', { cover: blueprint.cover, covers: blueprint.covers });
}

/**
 * Remove the current cover
 */
function removeCurrentCover() {
    const blueprint = getCurrentBlueprint();
    if (!blueprint) return;

    blueprint.cover = null;

    $(document).trigger('blueprint:updated', { blueprint });
    $(document).trigger('cover:changed', { cover: null, covers: blueprint.covers || [] });
}

// ============================================================================
// EXPORT FOR DEBUGGING
// ============================================================================

if (typeof window !== 'undefined') {
    window.StoryModeCoverEditor = {
        renderCoverTab,
        addCoverToBlueprint,
        setCurrentCover,
        deleteCover,
        removeCurrentCover,
    };
}
