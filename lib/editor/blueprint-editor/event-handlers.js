/**
 * Event Handlers Module
 * Document-level event delegation for the blueprint editor
 */

import { callGenericPopup, POPUP_TYPE } from '/scripts/popup.js';
import * as BlueprintModule from '../../blueprint/module.js';
import { getStoryTypes, getAuthorStyles } from '../../core/state-manager.js';
import { resolveAndHandleMissingStyle } from '../../blueprint/missing-style-handler.js';

import {
    getCurrentBlueprint,
    getActiveTab,
    setActiveTab,
    setHasUnsavedChanges,
} from './state.js';

import {
    addScene,
    editScene,
    deleteScene,
    reorderScene,
    addBeatToCurrentScene,
    editBeatInCurrentScene,
    deleteBeatFromCurrentScene,
    reorderBeatsInCurrentScene,
    getCurrentEditState,
} from './scene-crud.js';

import { renderBeatsEditor } from './scene-beats-editor.js';

import { renderCharactersTab } from './characters-tab.js';
import { setupCharacterTabHandlers as setupCharTabHandlers } from './character-handlers.js';

import {
    handleGenerateCover,
    handleUploadCover,
    handleClearCover,
    handleRegeneratePrompt,
    handleCopyPrompt,
    handleDebugSDCommand,
    handleGenerateOpeningMessage,
    setHelpers as setCoverActionHelpers,
} from './cover-action-handlers.js';

import {
    setupCoverFieldHandlers,
    setupCoverGalleryHandlers,
    setHelper as setCoverFieldHelper,
} from './cover-handlers.js';

// Editor action handlers (extracted for file size)
import { setupEditorActionHandlers } from './editor-action-handlers.js';

// Injected functions from main module
let _refreshContent = null;
let _refreshEditor = null;
let _refreshLeftPanel = null;
let _updateField = null;
let _updateUnsavedIndicator = null;
let _saveBlueprint = null;

export function setRefreshFunctions(contentFn, editorFn, leftPanelFn) {
    _refreshContent = contentFn;
    _refreshEditor = editorFn;
    _refreshLeftPanel = leftPanelFn;
}

export function setHelperFunctions(updateFieldFn, updateIndicatorFn, saveBlueprintFn) {
    _updateField = updateFieldFn;
    _updateUnsavedIndicator = updateIndicatorFn;
    _saveBlueprint = saveBlueprintFn;
    setCoverActionHelpers(_refreshContent, updateIndicatorFn, saveBlueprintFn);
    setCoverFieldHelper(updateIndicatorFn);
}

// Wrapper functions for injected helpers
function updateField(field, value) {
    if (_updateField) _updateField(field, value);
}

function updateUnsavedIndicator() {
    if (_updateUnsavedIndicator) _updateUnsavedIndicator();
}

async function saveBlueprint() {
    if (_saveBlueprint) return await _saveBlueprint();
    return false;
}

export const EVENT_NAMESPACE = '.blueprintEditor';

// Selector constants for event handlers
export const SELECTORS = {
    EDITOR_CONTAINER: '.storymode-blueprint-editor-container',
    PLAY_BUTTON: '#blueprint_editor_play_btn',
    POPUP_CANCEL: '.pop-button-cancel',
    SETTINGS_DIALOG: '#story_mode_settings_dialog',
    SETTINGS_OK: '.pop-button-ok'
};

/**
 * Setup document-level event listeners for the blueprint editor
 */
export function setupDocumentEventListeners() {

    // Remove any existing listeners to prevent duplicates
    $(document).off(EVENT_NAMESPACE);

    // Attach all event handler groups
    setupFieldHandlers();
    setupTabHandlers();
    setupSceneHandlers();
    setupBeatHandlers();
    setupCoverFieldHandlers(EVENT_NAMESPACE);
    setupCoverActionHandlers();
    setupCoverGalleryHandlers(EVENT_NAMESPACE);
    setupCharTabHandlers(EVENT_NAMESPACE);
    setupEditorActionHandlers();

}

/**
 * Handle story type field changes
 */
function handleStoryTypeChange(value) {
    const storyTypes = getStoryTypes();
    const selectedType = storyTypes.find(st => st.id === value);
    if (selectedType) {
        getCurrentBlueprint().story_type_name = selectedType.name;
        // Sync wizard panel dropdown
        $('#wizard_story_type').val(value);
        (_refreshLeftPanel && _refreshLeftPanel());
    }
}

/**
 * Handle author style field changes
 */
function handleAuthorStyleChange(value) {
    const authorStyles = getAuthorStyles();
    const selectedStyle = authorStyles.find(as => as.id === value);

    if (selectedStyle) {
        getCurrentBlueprint().author_style_name = selectedStyle.name;
    } else if (value === '') {
        getCurrentBlueprint().author_style_name = 'None';
    }

    // Sync wizard panel dropdown
    $('#wizard_author_style').val(value);
    (_refreshLeftPanel && _refreshLeftPanel());
}

/**
 * Handle user scenario field changes - sync to wizard panel
 */
function handleUserScenarioChange(value) {
    $('#wizard_scenario').val(value);
}

/**
 * Field handlers for special blueprint fields
 */
const FIELD_HANDLERS = {
    'story_type_id': handleStoryTypeChange,
    'author_style': handleAuthorStyleChange,
    'user_scenario': handleUserScenarioChange,
    'arc_structure.total_messages_target': () => (_refreshLeftPanel && _refreshLeftPanel()),
    'blueprint_title': () => (_refreshLeftPanel && _refreshLeftPanel())
};

/**
 * Setup handlers for blueprint field changes
 */
function setupFieldHandlers() {
    $(document).on('change' + EVENT_NAMESPACE + ' input' + EVENT_NAMESPACE, '[data-field]', function () {
        const field = $(this).data('field');
        const value = $(this).val();
        updateField(field, value);

        const handler = FIELD_HANDLERS[field];
        if (handler) handler(value);
    });

    // Scene count dropdown handler
    $(document).on('change' + EVENT_NAMESPACE, '#edit_scene_count', function () {
        const bp = getCurrentBlueprint();
        const customValue = $('#edit_custom_scenes').val();
        // Only use dropdown if no custom value
        if (!customValue) {
            const sceneCount = parseInt($(this).val()) || 10;
            if (!bp.arc_structure) bp.arc_structure = {};
            bp.arc_structure.total_messages_target = sceneCount;
            setHasUnsavedChanges(true);
            (_refreshLeftPanel && _refreshLeftPanel());
        }
    });

    // Custom scenes input handler
    $(document).on('change' + EVENT_NAMESPACE, '#edit_custom_scenes', function () {
        const bp = getCurrentBlueprint();
        const value = $(this).val();
        if (value && parseInt(value) > 0) {
            if (!bp.arc_structure) bp.arc_structure = {};
            bp.arc_structure.total_messages_target = parseInt(value);
            setHasUnsavedChanges(true);
            (_refreshLeftPanel && _refreshLeftPanel());
        }
    });

    // Add missing story type to library
    $(document).on('click' + EVENT_NAMESPACE, '#add_story_type_btn', async function (e) {
        e.preventDefault();
        await handleAddMissingStyle($(this), 'storyType');
    });

    // Add missing author style to library
    $(document).on('click' + EVENT_NAMESPACE, '#add_author_style_btn', async function (e) {
        e.preventDefault();
        await handleAddMissingStyle($(this), 'authorStyle');
    });
}

/**
 * Handle adding a missing style to the library.
 * Uses resolveAndHandleMissingStyle which extracts embedded data, inline
 * fields, and style ID/name from the blueprint automatically.
 *
 * @param {jQuery} btn - The button element
 * @param {string} type - 'storyType' or 'authorStyle'
 */
async function handleAddMissingStyle(btn, type) {
    const bp = getCurrentBlueprint();
    const typeName = type === 'storyType' ? 'story type' : 'author style';

    const originalHtml = btn.html();
    btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i>');

    try {
        const created = await resolveAndHandleMissingStyle(bp, type);

        if (created) {
            if (_refreshContent) _refreshContent();
        } else {
            btn.prop('disabled', false).html(originalHtml);
        }
    } catch (error) {
        console.error(`[Story Mode] Failed to add ${typeName}:`, error);
        toastr.error(`Failed to add ${typeName}: ${error.message}`);
        btn.prop('disabled', false).html(originalHtml);
    }
}

/**
 * Setup tab switching handlers
 */
function setupTabHandlers() {
    $(document).on('click' + EVENT_NAMESPACE, '.storymode-tab', function () {
        const tab = $(this).data('tab');
        if (tab !== getActiveTab()) {
            setActiveTab(tab);
            (_refreshEditor && _refreshEditor());
        }
    });
}

/**
 * Setup scene CRUD and drag-drop handlers
 */
function setupSceneHandlers() {
    $(document).on('click' + EVENT_NAMESPACE, '#add_scene_btn', (e) => {
        e.preventDefault();
        addScene();
    });

    $(document).on('click' + EVENT_NAMESPACE, '.scene-edit-btn', function (e) {
        e.preventDefault();
        editScene(parseInt($(this).data('index')));
    });

    $(document).on('click' + EVENT_NAMESPACE, '.scene-delete-btn', function (e) {
        e.preventDefault();
        deleteScene(parseInt($(this).data('index')));
    });

    setupSceneDragDrop();
}

/**
 * Setup beat CRUD handlers (within scene edit modal)
 */
function setupBeatHandlers() {
    // Add beat button
    $(document).on('click' + EVENT_NAMESPACE, '[data-beat-action="add"]', async function (e) {
        e.preventDefault();
        if (!$(this).closest('.storymode-beats-section').length) return;

        const added = await addBeatToCurrentScene();
        if (added) {
            refreshBeatsDisplay($(this).closest('.storymode-beats-section'));
        }
    });

    // Edit beat button
    $(document).on('click' + EVENT_NAMESPACE, '[data-beat-action="edit"]', async function (e) {
        e.preventDefault();
        const beatIndex = parseInt($(this).data('beat-index'));
        const updated = await editBeatInCurrentScene(beatIndex);
        if (updated) {
            refreshBeatsDisplay($(this).closest('.storymode-beats-section'));
        }
    });

    // Delete beat button
    $(document).on('click' + EVENT_NAMESPACE, '[data-beat-action="delete"]', async function (e) {
        e.preventDefault();
        const beatIndex = parseInt($(this).data('beat-index'));
        const deleted = await deleteBeatFromCurrentScene(beatIndex);
        if (deleted) {
            refreshBeatsDisplay($(this).closest('.storymode-beats-section'));
        }
    });

    // Drag-drop reordering for beats
    setupBeatDragDrop();
}

function setupBeatDragDrop() {
    // Use mouse-based reordering instead of HTML5 drag-drop (more reliable in popups)
    let dragState = { card: null, index: null, isDragging: false };

    const clearState = () => {
        $('.storymode-beat-card').removeClass('dragging drag-over');
        dragState = { card: null, index: null, isDragging: false };
    };

    // Mousedown on handle starts drag
    $(document).on('mousedown' + EVENT_NAMESPACE, '.storymode-beat-drag-handle', function (e) {
        e.preventDefault();
        const card = $(this).closest('.storymode-beat-card');
        dragState.card = card;
        dragState.index = parseInt($(this).data('beat-index'));
        dragState.isDragging = true;
        card.addClass('dragging');
    });

    // Mousemove highlights potential drop targets
    $(document).on('mousemove' + EVENT_NAMESPACE, function (e) {
        if (!dragState.isDragging) return;

        // Find card under cursor
        const elemUnder = document.elementFromPoint(e.clientX, e.clientY);
        const cardUnder = $(elemUnder).closest('.storymode-beat-card');

        // Clear all drag-over states
        $('.storymode-beat-card').removeClass('drag-over');

        // Highlight if over a different card
        if (cardUnder.length && !cardUnder.is(dragState.card)) {
            cardUnder.addClass('drag-over');
        }
    });

    // Mouseup completes the reorder
    $(document).on('mouseup' + EVENT_NAMESPACE, function (e) {
        if (!dragState.isDragging) return;

        const elemUnder = document.elementFromPoint(e.clientX, e.clientY);
        const cardUnder = $(elemUnder).closest('.storymode-beat-card');
        const beatsSection = dragState.card.closest('.storymode-beats-section');

        if (cardUnder.length && !cardUnder.is(dragState.card)) {
            const targetIndex = parseInt(cardUnder.data('beat-index'));
            if (targetIndex !== dragState.index && !isNaN(targetIndex) && dragState.index !== null) {
                reorderBeatsInCurrentScene(dragState.index, targetIndex);
                refreshBeatsDisplay(beatsSection);
            }
        }

        clearState();
    });
}

/**
 * Helper: Refresh beats display in modal from edit state
 */
function refreshBeatsDisplay(beatsSection) {
    const editState = getCurrentEditState();
    const newHtml = renderBeatsEditor(editState.beats);
    beatsSection.replaceWith(newHtml);
}

function setupSceneDragDrop() {
    // Use mouse-based reordering instead of HTML5 drag-drop (more reliable in popups)
    let dragState = { card: null, index: null, isDragging: false };

    const clearState = () => {
        $('.storymode-scene-card').removeClass('dragging drag-over');
        dragState = { card: null, index: null, isDragging: false };
    };

    // Mousedown on handle starts drag
    $(document).on('mousedown' + EVENT_NAMESPACE, '.storymode-scene-drag-handle', function (e) {
        e.preventDefault();
        const card = $(this).closest('.storymode-scene-card');
        dragState.card = card;
        dragState.index = parseInt($(this).data('scene-index'));
        dragState.isDragging = true;
        card.addClass('dragging');
    });

    // Mousemove highlights potential drop targets
    $(document).on('mousemove' + EVENT_NAMESPACE, function (e) {
        if (!dragState.isDragging) return;

        // Find card under cursor
        const elemUnder = document.elementFromPoint(e.clientX, e.clientY);
        const cardUnder = $(elemUnder).closest('.storymode-scene-card');

        // Clear all drag-over states
        $('.storymode-scene-card').removeClass('drag-over');

        // Highlight if over a different card
        if (cardUnder.length && !cardUnder.is(dragState.card)) {
            cardUnder.addClass('drag-over');
        }
    });

    // Mouseup on a card completes the reorder
    $(document).on('mouseup' + EVENT_NAMESPACE, function (e) {
        if (!dragState.isDragging) return;

        const elemUnder = document.elementFromPoint(e.clientX, e.clientY);
        const cardUnder = $(elemUnder).closest('.storymode-scene-card');

        if (cardUnder.length && !cardUnder.is(dragState.card)) {
            const targetIndex = parseInt(cardUnder.data('scene-index'));
            if (targetIndex !== dragState.index && !isNaN(targetIndex) && dragState.index !== null) {
                reorderScene(dragState.index, targetIndex);
            }
        }

        clearState();
    });
}

// Cover field handlers extracted to cover-handlers.js

/**
 * Setup cover action button handlers (generate, upload, clear, etc.)
 */
function setupCoverActionHandlers() {
    // Generate cover
    $(document).on('click' + EVENT_NAMESPACE, '#generate_cover_btn', handleGenerateCover);

    // Upload cover
    $(document).on('click' + EVENT_NAMESPACE, '#upload_cover_btn', handleUploadCover);

    // Clear cover
    $(document).on('click' + EVENT_NAMESPACE, '#clear_cover_btn', handleClearCover);

    // Regenerate prompt
    $(document).on('click' + EVENT_NAMESPACE, '#regenerate_prompt_btn', handleRegeneratePrompt);

    // Copy prompt
    $(document).on('click' + EVENT_NAMESPACE, '#copy_prompt_btn', handleCopyPrompt);

    // Generate opening message
    $(document).on('click' + EVENT_NAMESPACE, '#generate_opening_message_btn', handleGenerateOpeningMessage);

    // Debug SD command
    $(document).on('click' + EVENT_NAMESPACE, '#debug_sd_cmd_btn', handleDebugSDCommand);
}

// Character tab handlers extracted to characters-tab.js

