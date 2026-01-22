/**
 * Scene Image Preview Module
 *
 * Displays generated scene images in a draggable popup.
 * Provides options to add to gallery, download, delete, and copy prompt.
 */

import { escapeHtml } from '../ui/component-system.js';
import * as BlueprintModule from '../blueprint/module.js';
import * as ImageStorage from './image-storage.js';
import * as ImageGenerator from './image-generator.js';

// Import SillyTavern utils for gallery upload
import { saveBase64AsFile, getFileExtension } from '/scripts/utils.js';

// Import SillyTavern functions for message handling
import { chat, addOneMessage, system_message_types, this_chid, characters } from '/script.js';

// Import group chat globals
import { groups, selected_group } from '/scripts/group-chats.js';

// Import proper context function
import { getContext } from '/scripts/extensions.js';

// ============================================================================
// STATE
// ============================================================================

let currentPopup = null;
let currentSceneIndex = null;
let currentBlueprintId = null;

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Show the image preview popup for a scene.
 * @param {number} sceneIndex - Scene index (0-based)
 */
export function showImagePreviewPopup(sceneIndex) {
    // Remove existing popup
    closeImagePreviewPopup();

    const blueprintState = BlueprintModule.getBlueprintState();
    if (!blueprintState?.blueprint) {
        if (window.toastr) toastr.info('No active blueprint to show images for.');
        return;
    }

    const blueprint = blueprintState.blueprint;
    const blueprintId = blueprint.blueprint_id;
    const scene = blueprint.scene_plan?.[sceneIndex];

    if (!scene) {
        if (window.toastr) toastr.info(`Scene ${sceneIndex + 1} not found.`);
        return;
    }

    // Add index to scene for use in preview
    scene.index = sceneIndex;

    // Get stored image data
    const imageData = ImageStorage.getSceneImage(blueprintId, sceneIndex);

    if (!imageData?.imageData) {
        if (window.toastr) toastr.info(`No image generated for scene ${sceneIndex + 1} yet.`);
        return;
    }

    // Store state
    currentSceneIndex = sceneIndex;
    currentBlueprintId = blueprintId;

    // Render popup
    const contentHtml = renderPreviewContent(scene, imageData, blueprint);
    currentPopup = $(`<div class="storymode-image-preview">${contentHtml}</div>`);
    $('body').append(currentPopup);

    // Bind events
    bindPreviewEvents(currentPopup, blueprint, scene, imageData);

    // Close on Escape
    $(document).on('keydown.sceneImagePreview', (e) => {
        if (e.key === 'Escape') closeImagePreviewPopup();
    });

    // Close on click outside
    setTimeout(() => {
        $(document).on('click.sceneImagePreview', (e) => {
            if (!$(e.target).closest('.storymode-image-preview').length) {
                closeImagePreviewPopup();
            }
        });
    }, 100);

}

/**
 * Close the image preview popup.
 */
export function closeImagePreviewPopup() {
    if (currentPopup) {
        // Cleanup drag handler if exists
        if (currentPopup.data('cleanupDrag')) {
            currentPopup.data('cleanupDrag')();
        }

        currentPopup.remove();
        currentPopup = null;
    }

    // Remove document event listeners
    $(document).off('keydown.sceneImagePreview');
    $(document).off('click.sceneImagePreview');

    currentSceneIndex = null;
    currentBlueprintId = null;
}

/**
 * Check if the preview popup is currently open.
 * @returns {boolean} True if popup is open
 */
export function isPreviewOpen() {
    return currentPopup !== null;
}

/**
 * Export addToCharacterGallery for use by other modules (e.g., auto-add after generation)
 * @param {string} characterName - Character name
 * @param {string} imageData - Base64 or URL of image
 * @param {Object} scene - Scene object
 * @returns {Promise<boolean>} True if successful
 */
export async function addImageToCharacterGallery(characterName, imageData, scene) {
    return await addToCharacterGallery(characterName, imageData, scene);
}

// ============================================================================
// RENDERING
// ============================================================================

/**
 * Render the preview popup content.
 * @param {Object} scene - Scene object
 * @param {Object} imageData - Stored image data
 * @param {Object} blueprint - Full blueprint
 * @returns {string} HTML content
 */
function renderPreviewContent(scene, imageData, blueprint) {
    // Get characters in scene for "Add to Gallery" options
    const characterOptions = buildCharacterOptions(scene);
    const hasCharacterOptions = characterOptions.length > 0;

    console.log('[Scene Image Preview] Character options:', {
        optionsLength: characterOptions.length,
        hasOptions: hasCharacterOptions,
        charactersGlobal: characters?.length,
        selectedGroup: selected_group,
        thisChid: this_chid,
        sceneFocus: scene.character_focus?.length
    });

    // Build thumbnail gallery for all scene images
    const thumbnailGallery = buildThumbnailGallery(blueprint, scene.index);

    return `
        <div class="storymode-image-preview-header">
            <div class="storymode-preview-title">
                <i class="fa-solid fa-image"></i>
                <span>Scene ${scene.index + 1}: ${escapeHtml(scene.title || 'Untitled')}</span>
            </div>
            <button class="storymode-preview-close" title="Close (Esc)">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>
        <div class="storymode-image-preview-body">
            <div class="storymode-image-container">
                <img src="${imageData.imageData}"
                     alt="Scene ${scene.index + 1}"
                     class="storymode-image-preview-img">
            </div>
            ${thumbnailGallery}
            <div class="storymode-image-prompt">
                <div class="storymode-prompt-header">
                    <span>Prompt</span>
                    <div class="storymode-prompt-actions">
                        <button class="storymode-edit-prompt-btn" title="Edit prompt">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="storymode-copy-prompt-btn" data-prompt="${escapeHtml(imageData.prompt)}" title="Copy prompt to clipboard">
                            <i class="fa-regular fa-copy"></i>
                        </button>
                    </div>
                </div>
                <div class="storymode-prompt-text" data-prompt="${escapeHtml(imageData.prompt)}" title="Click to edit">${escapeHtml(imageData.prompt || 'No prompt available')}</div>
                <textarea class="storymode-prompt-edit hidden" placeholder="Enter image prompt...">${escapeHtml(imageData.prompt || '')}</textarea>
                <div class="storymode-prompt-edit-actions hidden">
                    <button class="storymode-save-prompt-btn menu_button">
                        <i class="fa-solid fa-check"></i> Save
                    </button>
                    <button class="storymode-cancel-prompt-btn menu_button">
                        <i class="fa-solid fa-xmark"></i> Cancel
                    </button>
                </div>
            </div>
            <div class="storymode-image-meta">
                <span class="storymode-meta-item">
                    <i class="fa-regular fa-clock"></i>
                    ${imageData.generatedAt ? new Date(imageData.generatedAt).toLocaleString() : 'Unknown'}
                </span>
                ${imageData.sdProfile ? `
                    <span class="storymode-meta-item">
                        <i class="fa-solid fa-server"></i>
                        SD Profile
                    </span>
                ` : ''}
            </div>
        </div>
        <div class="storymode-image-preview-actions">
            ${hasCharacterOptions ? `
                <div class="storymode-add-to-gallery">
                    <select class="storymode-gallery-select" title="Select character to add image to gallery">
                        <option value="">Add to character gallery...</option>
                        ${characterOptions}
                    </select>
                    <button class="storymode-add-gallery-btn" title="Add selected image to character gallery">
                        <i class="fa-solid fa-plus"></i> Add
                    </button>
                </div>
            ` : ''}
            <button class="storymode-add-to-chat-btn" title="Add image to the current chat message">
                <i class="fa-solid fa-comment-medical"></i> Add to Chat
            </button>
            <button class="storymode-download-btn" title="Download image">
                <i class="fa-solid fa-download"></i> Download
            </button>
            <button class="storymode-regenerate-btn" title="Regenerate with new seed">
                <i class="fa-solid fa-rotate"></i> Regenerate
            </button>
            <button class="storymode-delete-btn" title="Delete this image">
                <i class="fa-solid fa-trash"></i> Delete
            </button>
        </div>
    `;
}

/**
 * Build thumbnail gallery HTML for all generated scene images.
 * @param {Object} blueprint - Blueprint object
 * @param {number} currentSceneIndex - Currently displayed scene index
 * @returns {string} HTML for thumbnail gallery
 */
function buildThumbnailGallery(blueprint, currentSceneIndex) {
    const blueprintId = blueprint.blueprint_id;
    const allSceneImages = ImageStorage.getAllBlueprintImages(blueprintId);

    if (!allSceneImages || Object.keys(allSceneImages).length <= 1) {
        // No gallery needed if only one or no images
        return '';
    }

    // Build thumbnail items for each scene with an image
    const thumbnails = [];
    const scenePlan = blueprint.scene_plan || [];

    for (let i = 0; i < scenePlan.length; i++) {
        const imageData = allSceneImages[i];
        if (imageData?.imageData) {
            const isActive = i === currentSceneIndex;
            const scene = scenePlan[i];
            thumbnails.push(`
                <div class="storymode-scene-thumb ${isActive ? 'active' : ''}" 
                     data-scene-index="${i}" 
                     title="Scene ${i + 1}: ${escapeHtml(scene?.title || 'Untitled')}">
                    <img src="${imageData.imageData}" alt="Scene ${i + 1}">
                    <span class="storymode-scene-thumb-label">${i + 1}</span>
                </div>
            `);
        }
    }

    if (thumbnails.length <= 1) {
        return '';
    }

    return `
        <div class="storymode-scene-gallery">
            <div class="storymode-scene-gallery-header">
                <i class="fa-solid fa-images"></i>
                <span>Scene Images (${thumbnails.length})</span>
            </div>
            <div class="storymode-scene-gallery-track">
                ${thumbnails.join('')}
            </div>
        </div>
    `;
}

/**
 * Build character options for "Add to Gallery" dropdown.
 * Uses SillyTavern global imports (characters, selected_group, this_chid)
 * @param {Object} scene - Scene object
 * @returns {string} HTML option elements joined as a string (empty string if no characters)
 */
function buildCharacterOptions(scene) {
    console.log('[Scene Image Preview] buildCharacterOptions called');
    console.log('[Scene Image Preview] Globals:', {
        charactersCount: characters?.length,
        selectedGroup: selected_group,
        thisChid: this_chid,
        groupsCount: groups?.length,
        sceneCharacterFocusCount: scene?.character_focus?.length
    });

    const options = [];
    const addedNames = new Set();

    // Priority 1: Group chat members (if in a group chat)
    if (selected_group && groups) {
        console.log('[Scene Image Preview] In group chat, selected_group:', selected_group);
        const currentGroup = groups.find(g => g.id === selected_group);
        console.log('[Scene Image Preview] Current group:', currentGroup);

        if (currentGroup?.members) {
            console.log('[Scene Image Preview] Group members:', currentGroup.members);
            for (const memberId of currentGroup.members) {
                // Match by avatar
                const char = characters?.find(c => c.avatar === memberId);
                console.log('[Scene Image Preview] Checking member:', memberId, 'found char:', char?.name);

                if (char?.name && !addedNames.has(char.name.toLowerCase())) {
                    options.push(`<option value="${escapeHtml(char.name)}">${escapeHtml(char.name)}</option>`);
                    addedNames.add(char.name.toLowerCase());
                }
            }
        }
    }
    // Priority 2: Single character chat (if not in a group)
    else if (this_chid !== undefined && characters?.[this_chid]) {
        const char = characters[this_chid];
        console.log('[Scene Image Preview] Single character chat:', char.name);

        if (char.name && !addedNames.has(char.name.toLowerCase())) {
            options.push(`<option value="${escapeHtml(char.name)}">${escapeHtml(char.name)}</option>`);
            addedNames.add(char.name.toLowerCase());
        }
    }

    // Priority 3: Add characters from scene focus if blueprint has character data
    if (scene.character_focus?.length > 0) {
        console.log('[Scene Image Preview] Adding from scene character_focus');
        for (const cf of scene.character_focus) {
            const name = cf.name;
            if (name && !addedNames.has(name.toLowerCase())) {
                options.push(`<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`);
                addedNames.add(name.toLowerCase());
            }
        }
    }

    // Fallback: Add ALL loaded characters if nothing found yet
    if (options.length === 0 && characters?.length > 0) {
        console.log('[Scene Image Preview] No specific characters found, adding all loaded characters');
        for (const char of characters) {
            if (char?.name && !addedNames.has(char.name.toLowerCase())) {
                options.push(`<option value="${escapeHtml(char.name)}">${escapeHtml(char.name)}</option>`);
                addedNames.add(char.name.toLowerCase());
            }
        }
    }

    // If still nothing, add placeholder
    if (options.length === 0) {
        console.warn('[Scene Image Preview] No characters detected at all');
        options.push(`<option value="">No characters detected</option>`);
    }

    // Return joined string for template insertion
    const result = options.join('');
    console.log('[Scene Image Preview] buildCharacterOptions result:', {
        optionsCount: options.length,
        resultLength: result.length,
        addedNames: Array.from(addedNames)
    });
    return result;
}

// ============================================================================
// EVENT HANDLING
// ============================================================================

/**
 * Bind event handlers to the preview popup.
 * @param {jQuery} popup - Popup element
 * @param {Object} blueprint - Blueprint object
 * @param {Object} scene - Scene object
 * @param {Object} imageData - Image data
 */
function bindPreviewEvents(popup, blueprint, scene, imageData) {
    // Close button
    popup.find('.storymode-preview-close').on('click', closeImagePreviewPopup);

    // Copy prompt button
    popup.find('.storymode-copy-prompt-btn').on('click', function () {
        const prompt = $(this).data('prompt');
        copyToClipboard(prompt);
    });

    // Download button
    popup.find('.storymode-download-btn').on('click', async function () {
        const btn = $(this);
        const originalHtml = btn.html();

        btn.prop('disabled', true);
        btn.html('<i class="fa-solid fa-circle-notch fa-spin"></i> Downloading...');

        try {
            await downloadImage(imageData.imageData, `scene-${scene.index + 1}-${blueprint.blueprint_id.slice(0, 8)}`);
        } finally {
            btn.prop('disabled', false);
            btn.html(originalHtml);
        }
    });

    // Delete button
    popup.find('.storymode-delete-btn').on('click', () => {
        deleteSceneImage(blueprint.blueprint_id, scene.index);
    });

    // Regenerate button
    popup.find('.storymode-regenerate-btn').on('click', async function () {
        const btn = $(this);
        const originalHtml = btn.html();

        btn.prop('disabled', true);
        btn.html('<i class="fa-solid fa-circle-notch fa-spin"></i> Generating...');

        try {
            const result = await ImageGenerator.generateSceneImage(scene, blueprint);

            if (result.success) {
                if (window.toastr) toastr.success('Image regenerated successfully');
                closeImagePreviewPopup();
                showImagePreviewPopup(scene.index);
            } else {
                if (window.toastr) toastr.error(`Failed to regenerate: ${result.error}`);
            }
        } finally {
            btn.prop('disabled', false);
            btn.html(originalHtml);
        }
    });

    // Add to gallery button
    popup.find('.storymode-add-gallery-btn').on('click', async function () {
        const btn = $(this);
        const select = popup.find('.storymode-gallery-select');
        const characterName = select.val();

        if (!characterName) {
            if (window.toastr) toastr.info('Please select a character first');
            return;
        }

        const originalHtml = btn.html();
        btn.prop('disabled', true);
        btn.html('<i class="fa-solid fa-circle-notch fa-spin"></i> Adding...');

        try {
            await addToCharacterGallery(characterName, imageData.imageData, scene);
        } finally {
            btn.prop('disabled', false);
            btn.html(originalHtml);
        }
    });

    // Thumbnail gallery navigation
    popup.find('.storymode-scene-thumb').on('click', function () {
        const targetIndex = parseInt($(this).data('scene-index'), 10);
        if (!isNaN(targetIndex) && targetIndex !== scene.index) {
            closeImagePreviewPopup();
            showImagePreviewPopup(targetIndex);
        }
    });

    // Add to Chat button
    popup.find('.storymode-add-to-chat-btn').on('click', async function () {
        const btn = $(this);
        const originalHtml = btn.html();

        btn.prop('disabled', true);
        btn.html('<i class="fa-solid fa-circle-notch fa-spin"></i> Adding...');

        try {
            await addImageToChat(imageData.imageData, scene, blueprint);
            if (window.toastr) toastr.success('Image added to chat');
        } catch (error) {
            console.error('[Scene Image Preview] Failed to add image to chat:', error);
            if (window.toastr) toastr.error('Failed to add image to chat');
        } finally {
            btn.prop('disabled', false);
            btn.html(originalHtml);
        }
    });

    // Prompt editing handlers
    const promptText = popup.find('.storymode-prompt-text');
    const promptEdit = popup.find('.storymode-prompt-edit');
    const promptEditActions = popup.find('.storymode-prompt-edit-actions');

    function enterEditMode() {
        promptText.addClass('hidden');
        promptEdit.removeClass('hidden').focus();
        promptEditActions.removeClass('hidden');
    }

    function exitEditMode(save = false) {
        if (save) {
            const newPrompt = promptEdit.val().trim();
            if (newPrompt !== imageData.prompt) {
                // Update storage
                ImageStorage.storeSceneImage(blueprint.blueprint_id, scene.index, {
                    ...imageData,
                    prompt: newPrompt
                });
                // Update display
                promptText.text(newPrompt || 'No prompt available');
                promptText.data('prompt', newPrompt);
                popup.find('.storymode-copy-prompt-btn').data('prompt', newPrompt);
                imageData.prompt = newPrompt;
                if (window.toastr) toastr.success('Prompt saved');
            }
        } else {
            // Reset textarea to original value
            promptEdit.val(imageData.prompt || '');
        }
        promptText.removeClass('hidden');
        promptEdit.addClass('hidden');
        promptEditActions.addClass('hidden');
    }

    // Click on prompt text or edit button to enter edit mode
    promptText.on('click', enterEditMode);
    popup.find('.storymode-edit-prompt-btn').on('click', enterEditMode);

    // Save and cancel buttons
    popup.find('.storymode-save-prompt-btn').on('click', () => exitEditMode(true));
    popup.find('.storymode-cancel-prompt-btn').on('click', () => exitEditMode(false));

    // Allow Escape to cancel, Enter+Ctrl to save
    promptEdit.on('keydown', function (e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            exitEditMode(false);
        } else if (e.key === 'Enter' && e.ctrlKey) {
            e.preventDefault();
            exitEditMode(true);
        }
    });

    // Make draggable (import makeDraggable from controller-panel if available)
    if (typeof window.makeDraggable === 'function') {
        window.makeDraggable(
            popup,
            popup.find('.storymode-image-preview-header'),
            'sceneImagePreviewDrag',
            null,
            '.storymode-preview-close'
        );
    } else {
        // Simple drag implementation
        setupSimpleDrag(popup);
    }
}

/**
 * Copy text to clipboard.
 * @param {string} text - Text to copy
 */
function copyToClipboard(text) {
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text)
            .then(() => {
                if (window.toastr) toastr.success('Prompt copied to clipboard');
            })
            .catch(() => {
                fallbackCopy(text);
            });
    } else {
        fallbackCopy(text);
    }
}

/**
 * Fallback copy method for older browsers.
 * @param {string} text - Text to copy
 */
function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
        if (window.toastr) toastr.success('Prompt copied to clipboard');
    } catch (err) {
        if (window.toastr) toastr.error('Failed to copy prompt');
    }
    document.body.removeChild(textarea);
}

/**
 * Download image to local device.
 * @param {string} imageData - Base64 or URL of image
 * @param {string} filename - Filename without extension
 */
async function downloadImage(imageData, filename) {
    try {
        if (imageData.startsWith('data:image/')) {
            // Base64 data URL - direct download
            const link = document.createElement('a');
            link.href = imageData;
            link.download = `${filename}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            if (window.toastr) toastr.success('Image download started');
        } else if (imageData.startsWith('http') || imageData.startsWith('/')) {
            // Remote URL or local path - fetch and convert to blob for CORS-safe download
            const response = await fetch(imageData);
            if (!response.ok) throw new Error('Failed to fetch image');

            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = `${filename}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Clean up blob URL after a short delay
            setTimeout(() => URL.revokeObjectURL(blobUrl), 100);

            if (window.toastr) toastr.success('Image download started');
        } else {
            if (window.toastr) toastr.error('Invalid image data format');
        }
    } catch (error) {
        console.error('[Scene Image Preview] Download failed:', error);
        if (window.toastr) toastr.error(`Download failed: ${error.message}`);
    }
}

/**
 * Delete a scene image with confirmation.
 * @param {string} blueprintId - Blueprint ID
 * @param {number} sceneIndex - Scene index
 */
function deleteSceneImage(blueprintId, sceneIndex) {
    if (!confirm('Are you sure you want to delete this scene image? This action cannot be undone.')) {
        return;
    }

    const success = ImageStorage.deleteSceneImage(blueprintId, sceneIndex);

    if (success) {
        if (window.toastr) toastr.success('Image deleted');
        closeImagePreviewPopup();

        // Trigger panel update to refresh thumbnail
        if (typeof window.updateControllerPanel === 'function') {
            window.updateControllerPanel();
        }
    } else {
        if (window.toastr) toastr.error('Failed to delete image');
    }
}

/**
 * Add image to character gallery.
 * Uses SillyTavern's saveBase64AsFile API from utils.js
 * @param {string} characterName - Character name
 * @param {string} imageData - Base64 or URL of image
 * @param {Object} scene - Scene object
 * @returns {Promise<boolean>} True if successful
 */
async function addToCharacterGallery(characterName, imageData, scene) {
    try {
        // Find character by name and get gallery folder
        let galleryFolder = null;

        // Search in characters array
        if (characters?.length > 0) {
            const targetChar = characters.find(c => c.name === characterName);
            if (targetChar) {
                // Get extension settings for custom gallery folders
                const context = getContext();
                const customFolder = context?.extensionSettings?.gallery?.folders?.[targetChar.avatar];
                // Use custom folder name or strip extension from avatar filename
                if (customFolder) {
                    galleryFolder = customFolder;
                } else if (targetChar.avatar) {
                    // Strip extension from avatar filename (e.g., "Julie.png" -> "Julie")
                    galleryFolder = targetChar.avatar.replace(/\.[^.]+$/, '');
                }
            }
        }

        if (!galleryFolder) {
            // Fallback: use character name as folder
            console.warn('[Scene Image Preview] Character not found, using name as folder:', characterName);
            galleryFolder = characterName;
        }

        // Convert image data to base64 string
        let base64Data;
        let extension = 'png';

        if (imageData.startsWith('data:image/')) {
            // Extract base64 from data URL
            base64Data = imageData.split(',')[1];
            const mimeString = imageData.split(',')[0].split(':')[1].split(';')[0];
            // Get extension from MIME type (image/png -> png)
            extension = mimeString.split('/')[1] || 'png';
        } else if (imageData.startsWith('http') || imageData.startsWith('/')) {
            // Fetch remote URL and convert to base64
            const response = await fetch(imageData);
            if (!response.ok) throw new Error('Failed to fetch image');
            const blob = await response.blob();

            // Convert blob to base64
            const reader = new FileReader();
            base64Data = await new Promise((resolve, reject) => {
                reader.onloadend = () => {
                    const dataUrl = reader.result;
                    resolve(dataUrl.split(',')[1]);
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });

            // Try to get extension from blob type or URL
            if (blob.type) {
                extension = blob.type.split('/')[1] || 'png';
            } else {
                // Try to extract from URL
                const match = imageData.match(/\.(\w+)(\?|$)/);
                extension = match ? match[1] : 'png';
            }
        } else {
            throw new Error('Invalid image data format');
        }

        // Use SillyTavern's saveBase64AsFile to upload to gallery
        // Parameters: (base64Data, galleryFolder, filename, extension)
        const savedPath = await saveBase64AsFile(base64Data, galleryFolder, '', extension);

        console.log(`[Scene Image Preview] Saved to gallery: ${savedPath}`);

        if (window.toastr) {
            toastr.success(`Image added to ${characterName}'s gallery`);
        }

        return true;
    } catch (error) {
        console.error('[Scene Image Preview] Failed to add to gallery:', error);
        if (window.toastr) {
            toastr.error(`Failed to add to gallery: ${error.message}`);
        }
        return false;
    }
}

/**
 * Push a new Story Mode message with an image attachment.
 * Reuses the pattern from epilogue/opening messages.
 * @param {string} imageUrl - URL or base64 data of the image
 * @param {Object} scene - Scene object
 * @param {Object} blueprint - Blueprint object
 */
async function pushStoryMessageWithImage(imageUrl, scene, blueprint) {
    const messageText = `Scene ${scene.index + 1}: ${scene.title || 'Untitled'}`;

    const message = {
        is_user: false,
        mes: messageText,
        is_system: false,
        name: 'Story Mode',
        force_avatar: 'img/quill.png', // Use server-relative path (quill icon for story/narrative)
        send_date: Date.now(),
        extra: {
            type: system_message_types.NARRATOR,
            image: imageUrl,
            image_swipes: [imageUrl],
            title: messageText,
            inline_image: true,
        },
    };

    // Push message to chat array first
    chat.push(message);

    // Render the message in the UI without swipe arrows
    addOneMessage(message, { scroll: true, showSwipes: false });

    // Save the chat
    const context = getContext();
    if (context?.saveChat) {
        await context.saveChat();
    } else if (typeof window.saveChat === 'function') {
        await window.saveChat();
    } else {
        console.warn('[Scene Image Preview] saveChat not available, changes may not persist');
    }
}

/**
 * Add image to the current chat as an inline attachment.
 * Uses SillyTavern's appendMediaToMessage function.
 * If no AI messages exist, creates a new Story Mode message with the image.
 * @param {string} imageUrl - URL or base64 data of the image
 * @param {Object} scene - Scene object
 * @param {Object} blueprint - Blueprint object
 */
async function addImageToChat(imageUrl, scene, blueprint) {
    // Use global chat array from SillyTavern
    const chatMessages = window.chat;

    if (!chatMessages) {
        throw new Error('No active chat found');
    }

    // Get the last AI message (most recent non-user message)
    let targetMessageIndex = -1;
    for (let i = chatMessages.length - 1; i >= 0; i--) {
        if (!chatMessages[i].is_user) {
            targetMessageIndex = i;
            break;
        }
    }

    // If no AI message found, create a new Story Mode message with the image
    if (targetMessageIndex === -1) {
        console.log('[Scene Image Preview] No AI messages found, creating new Story Mode message with image');
        await pushStoryMessageWithImage(imageUrl, scene, blueprint);
        return;
    }

    const message = chatMessages[targetMessageIndex];
    const messageElement = $(`.mes[mesid="${targetMessageIndex}"]`);

    if (!messageElement.length) {
        throw new Error('Could not find message element in DOM');
    }

    // Initialize message.extra if needed
    if (!message.extra) {
        message.extra = {};
    }

    // Initialize image_swipes array if needed
    if (!Array.isArray(message.extra.image_swipes)) {
        message.extra.image_swipes = [];
    }

    // If there's an existing image, add it to swipes first
    if (message.extra.image && !message.extra.image_swipes.includes(message.extra.image)) {
        message.extra.image_swipes.push(message.extra.image);
    }

    // Add the new image to swipes
    message.extra.image_swipes.push(imageUrl);

    // Set the new image as the current image
    message.extra.image = imageUrl;
    message.extra.title = `Scene ${scene.index + 1}: ${scene.title || 'Untitled'}`;
    message.extra.inline_image = true;

    // Use SillyTavern's appendMediaToMessage if available
    if (typeof window.appendMediaToMessage === 'function') {
        window.appendMediaToMessage(message, messageElement);
    } else {
        // Fallback: Try importing from script.js
        try {
            const { appendMediaToMessage } = await import('/script.js');
            appendMediaToMessage(message, messageElement);
        } catch (e) {
            console.warn('[Scene Image Preview] appendMediaToMessage not available, message updated but UI may not refresh');
            throw new Error('appendMediaToMessage function not available');
        }
    }

    // Save the chat
    const context = getContext();
    if (context?.saveChat) {
        await context.saveChat();
    } else if (typeof window.saveChat === 'function') {
        await window.saveChat();
    } else {
        console.warn('[Scene Image Preview] saveChat not available, changes may not persist');
    }
}

/**
 * Setup simple drag functionality for popup.
 * @param {jQuery} element - Element to make draggable
 */
function setupSimpleDrag(element) {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let offsetX = 0;
    let offsetY = 0;

    element.find('.storymode-image-preview-header').css('cursor', 'grab');

    element.find('.storymode-image-preview-header').on('mousedown', function (e) {
        if (e.button !== 0) return;
        if ($(e.target).closest('button').length) return;

        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = element[0].getBoundingClientRect();
        offsetX = rect.left;
        offsetY = rect.top;

        element.find('.storymode-image-preview-header').css('cursor', 'grabbing');
        e.preventDefault();
    });

    $(document).on('mousemove.sceneImagePreviewDrag', function (e) {
        if (!isDragging) return;

        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        element.css({
            left: (offsetX + deltaX) + 'px',
            top: (offsetY + deltaY) + 'px',
            right: 'auto',
            bottom: 'auto',
        });
    });

    $(document).on('mouseup.sceneImagePreviewDrag', function () {
        if (!isDragging) return;

        isDragging = false;
        element.find('.storymode-image-preview-header').css('cursor', 'grab');
    });

    // Cleanup helper
    element.data('cleanupDrag', () => {
        $(document).off('mousemove.sceneImagePreviewDrag');
        $(document).off('mouseup.sceneImagePreviewDrag');
    });
}
