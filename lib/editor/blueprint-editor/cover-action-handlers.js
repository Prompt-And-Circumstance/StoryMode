/**
 * Cover Action Handlers Module
 * Handles cover generation, upload, clear, and prompt management
 */

import { callGenericPopup, POPUP_TYPE, POPUP_RESULT } from '/scripts/popup.js';
import * as BlueprintModule from '../../blueprint/module.js';
import { escapeHtml, setNestedValue } from '../../blueprint/utils.js';
import { generateCoverPrompt } from '../../blueprint/storage.js';
import { generatePlaceholderCover } from '../../blueprint/blank-blueprint.js';
import { getCurrentBlueprint, setHasUnsavedChanges } from './state.js';
import { generateCoverFromSD, setCoverImageUrl, buildSDPrompt } from './cover-generation.js';
import { addCoverToGallery, setCoverImage } from './cover-gallery.js';

// Injected helper functions
let _refreshContent = null;
let _updateUnsavedIndicator = null;
let _saveBlueprint = null;

/**
 * Set helper functions (called from event-handlers.js)
 */
export function setHelpers(refreshContentFn, updateIndicatorFn, saveBlueprintFn) {
    _refreshContent = refreshContentFn;
    _updateUnsavedIndicator = updateIndicatorFn;
    _saveBlueprint = saveBlueprintFn;
}

// ============================================================================
// COVER GENERATION HANDLERS
// ============================================================================

/**
 * Handle cover image generation via SD
 */
export async function handleGenerateCover(e) {
    e.preventDefault();

    const btn = $(this);
    const originalText = btn.html();
    btn.prop('disabled', true).html('<i class="fa-solid fa-circle-notch fa-spin"></i> Generating...');

    try {
        const result = await generateCoverFromSD(getCurrentBlueprint());

        if (!result.success) {
            throw new Error(result.error);
        }

        // Add to gallery and set as primary cover
        await addCoverToGallery(getCurrentBlueprint(), result.imageUrl, getCurrentBlueprint().metadata?.coverPrompt);
        setCoverImageUrl(getCurrentBlueprint(), result.imageUrl);

        // Auto-save and refresh
        const saved = _saveBlueprint ? await _saveBlueprint() : false;
        if (!saved) {
            throw new Error('Blueprint validation failed - cover was not saved');
        }
        (_refreshContent && _refreshContent());
        toastr.success('Cover image generated and saved!');
    } catch (err) {
        console.error('[BlueprintEditor] Failed to generate cover:', err);
        toastr.error('Failed to generate cover: ' + err.message);
    } finally {
        const targetBtn = $('#generate_cover_btn').length ? $('#generate_cover_btn') : btn;
        targetBtn.prop('disabled', false).html(originalText);
    }
}

/**
 * Handle generating opening message
 */
export async function handleGenerateOpeningMessage(e) {
    e.preventDefault();

    const btn = $(this);
    const originalText = btn.html();
    btn.prop('disabled', true).html('<i class="fa-solid fa-circle-notch fa-spin"></i> Generating...');

    try {
        const result = await BlueprintModule.generateOpeningMessage(getCurrentBlueprint());

        if (!result) {
            throw new Error('No content generated');
        }

        // Update blueprint
        getCurrentBlueprint().opening_message = result;
        setHasUnsavedChanges(true);
        (_updateUnsavedIndicator && _updateUnsavedIndicator());

        // Update UI
        $('#edit_opening_message').val(result);

        toastr.success('Opening message generated!');
    } catch (err) {
        console.error('[BlueprintEditor] Failed to generate opening message:', err);
        toastr.error('Failed to generate: ' + err.message);
    } finally {
        btn.prop('disabled', false).html(originalText);
    }
}

// ============================================================================
// COVER UPLOAD/CLEAR HANDLERS
// ============================================================================

/**
 * Handle cover image upload
 */
export function handleUploadCover(e) {
    e.preventDefault();

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            toastr.warning('Please select an image file');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            toastr.warning('Large image detected. Consider using a smaller file for better performance.');
        }

        try {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const dataUrl = e.target.result;

                await addCoverToGallery(getCurrentBlueprint(), dataUrl, null, {
                    model: 'Uploaded',
                    prompt: null
                });

                getCurrentBlueprint().metadata.coverImageUrl = dataUrl;
                getCurrentBlueprint().coverImageUrl = dataUrl;

                setHasUnsavedChanges(true);
                (_refreshContent && _refreshContent());
                toastr.success('Image uploaded and added to gallery!');
            };
            reader.readAsDataURL(file);
        } catch (err) {
            console.error('[BlueprintEditor] Failed to upload:', err);
            toastr.error('Failed to upload image');
        }
    };
    input.click();
}

/**
 * Handle cover image removal
 */
export async function handleClearCover(e) {
    e.preventDefault();

    const gallery = getCurrentBlueprint().metadata?.coverGallery || [];
    const currentIndex = getCurrentBlueprint().metadata?.coverGalleryIndex || 0;

    if (!gallery.length || currentIndex === null || currentIndex < 0) {
        toastr.warning('No cover to remove');
        return;
    }

    const confirmMsg = `Remove cover ${currentIndex + 1} of ${gallery.length}?`;
    const result = await callGenericPopup(
        confirmMsg,
        POPUP_TYPE.CONFIRM,
        '',
        { okButton: 'Remove', cancelButton: 'Cancel' }
    );
    if (result !== POPUP_RESULT.AFFIRMATIVE) return;

    gallery.splice(currentIndex, 1);

    if (gallery.length === 0) {
        // Add placeholder cover when all covers are removed
        const blueprint = getCurrentBlueprint();
        const title = blueprint.userMetadata?.title || blueprint.blueprint_title || 'Blueprint';
        const placeholderCover = generatePlaceholderCover(title, 'Add a cover image in the Cover tab');

        blueprint.metadata.coverGallery = [{
            id: blueprint.blueprint_id + '-placeholder',
            url: placeholderCover,
            prompt: 'Placeholder cover',
            timestamp: new Date().toISOString(),
            model: 'SVG Placeholder'
        }];
        blueprint.metadata.coverGalleryIndex = 0;
        blueprint.metadata.coverImageUrl = placeholderCover;
        blueprint.coverImageUrl = placeholderCover;
        toastr.info('Cover removed - placeholder added');
    } else {
        const newIndex = Math.min(currentIndex, gallery.length - 1);
        setCoverImage(newIndex, gallery[newIndex].url, gallery);
        toastr.info(`Cover removed. Now showing ${newIndex + 1} of ${gallery.length}`);
    }

    setHasUnsavedChanges(true);
    (_refreshContent && _refreshContent());
}

// ============================================================================
// PROMPT MANAGEMENT HANDLERS
// ============================================================================

/**
 * Handle prompt regeneration
 */
export async function handleRegeneratePrompt(e) {
    e.preventDefault();

    const result = await callGenericPopup(
        'Regenerate the cover prompt? This will overwrite your current edits.',
        POPUP_TYPE.CONFIRM,
        '',
        { okButton: 'Regenerate', cancelButton: 'Cancel' }
    );
    if (result !== POPUP_RESULT.AFFIRMATIVE) {
        return;
    }

    getCurrentBlueprint().metadata.coverPrompt = generateCoverPrompt(getCurrentBlueprint());
    setHasUnsavedChanges(true);
    (_refreshContent && _refreshContent());
    toastr.success('Cover prompt regenerated');
}

/**
 * Handle copy prompt to clipboard
 */
export async function handleCopyPrompt(e) {
    e.preventDefault();

    const prompt = getCurrentBlueprint().metadata?.coverPrompt;
    if (!prompt) {
        toastr.warning('No cover prompt to copy');
        return;
    }

    const formatted = `Positive: ${prompt.positive || ''}\n\nNegative: ${prompt.negative || ''}\n\nStyle: ${prompt.style || ''}\nMood: ${prompt.mood || ''}\nLighting: ${prompt.lighting || ''}\nColors: ${Array.isArray(prompt.colors) ? prompt.colors.join(', ') : prompt.colors || ''}`;

    try {
        await navigator.clipboard.writeText(formatted);
        toastr.success('Prompt copied to clipboard');
    } catch (err) {
        console.error('[BlueprintEditor] Failed to copy:', err);
        toastr.error('Failed to copy to clipboard');
    }
}

/**
 * Handle debug SD command display
 */
export async function handleDebugSDCommand(e) {
    e.preventDefault();

    const prompt = getCurrentBlueprint().metadata?.coverPrompt;
    if (!prompt) {
        toastr.warning('No cover prompt defined');
        return;
    }

    const fullPrompt = buildSDPrompt(prompt);
    const imageSize = prompt.technical?.image_size || '1024x1536';
    const [width, height] = imageSize.split('x').map(Number);

    const debugHtml = `
        <h3>Stable Diffusion Command Debug</h3>
        <p>This is the exact command that will be sent to Stable Diffusion when you click "Generate Cover".</p>

        <div style="margin: 16px 0;">
            <label style="display: block; margin-bottom: 4px; font-weight: bold;">Full SD Prompt:</label>
            <textarea readonly style="width: 100%; height: 100px; font-family: monospace; font-size: 12px;">${escapeHtml(fullPrompt)}</textarea>
        </div>

        <div style="margin: 16px 0;">
            <label style="display: block; margin-bottom: 4px; font-weight: bold;">Slash Command (copy this):</label>
            <input type="text" id="sd_debug_slash_cmd" readonly value="/sd ${escapeHtml(fullPrompt)}" style="width: 100%; font-family: monospace; font-size: 12px;">
        </div>

        <div style="margin: 16px 0;">
            <strong>Breakdown:</strong>
            <ul style="margin: 8px 0; padding-left: 20px;">
                <li><strong>Positive:</strong> ${escapeHtml(prompt.positive || '(none)')}</li>
                <li><strong>Negative:</strong> ${escapeHtml(prompt.negative || '(none)')}</li>
                <li><strong>Style:</strong> ${escapeHtml(prompt.style || '(none)')}</li>
                <li><strong>Mood:</strong> ${escapeHtml(prompt.mood || '(none)')}</li>
                <li><strong>Lighting:</strong> ${escapeHtml(prompt.lighting || '(none)')}</li>
                <li><strong>Composition:</strong> ${escapeHtml(prompt.composition || '(none)')}</li>
                <li><strong>Image Size:</strong> ${width} x ${height}</li>
            </ul>
        </div>

        <p style="color: var(--SmartThemeEmColor); font-size: 0.9em;">
            Click "Copy" to copy the slash command to clipboard, then paste it in the chat to test manually.
        </p>
    `;

    const result = await callGenericPopup(debugHtml, POPUP_TYPE.CONFIRM, '', {
        customCancelButtonHtml: 'Close',
        okButton: 'Copy'
    });

    if (result) {
        const slashCmd = $('#sd_debug_slash_cmd').val();
        await navigator.clipboard.writeText(slashCmd);
        toastr.success('Copied to clipboard!');
    }
}
