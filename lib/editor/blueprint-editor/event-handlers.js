/**
 * Event Handlers Module
 * Document-level event delegation for the blueprint editor
 */

import { callGenericPopup, POPUP_TYPE } from '/scripts/popup.js';
import * as BlueprintModule from '../../blueprint/module.js';
import { getStoryTypes, getAuthorStyles } from '../../core/state-manager.js';
import { escapeHtml, setNestedValue } from '../../blueprint/utils.js';
import { generateCoverPrompt } from '../../blueprint/storage.js';

import {
    getCurrentBlueprint,
    getActiveTab,
    setActiveTab,
    setHasUnsavedChanges,
} from './state.js';

// Cover generation imports now in cover-action-handlers.js

import {
    navigateCoverGallery,
    canNavigateGallery,
} from './cover-gallery.js';

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

// Cover action handlers (extracted for file size)
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
    // Wire up cover action handlers
    setCoverActionHelpers(_refreshContent, updateIndicatorFn, saveBlueprintFn);
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
    setupCoverFieldHandlers();
    setupCoverActionHandlers();
    setupCoverGalleryHandlers();
    setupCharacterTabHandlers();
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

    (_refreshLeftPanel && _refreshLeftPanel());
}

/**
 * Field handlers for special blueprint fields
 */
const FIELD_HANDLERS = {
    'story_type_id': handleStoryTypeChange,
    'author_style': handleAuthorStyleChange,
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

/**
 * Setup drag-and-drop for beat reordering within scenes
 */
function setupBeatDragDrop() {
    let draggedBeat = null;
    let draggedIndex = null;

    const clearBeatDragState = () => {
        $('.storymode-beat-card').removeClass('dragging drag-over');
        draggedBeat = null;
        draggedIndex = null;
    };

    $(document).on('dragstart' + EVENT_NAMESPACE, '.storymode-beat-card', function () {
        draggedBeat = $(this);
        draggedIndex = parseInt($(this).data('beat-index'));
        $(this).addClass('dragging');
    });

    $(document).on('dragend' + EVENT_NAMESPACE, '.storymode-beat-card', clearBeatDragState);

    $(document).on('dragover' + EVENT_NAMESPACE, '.storymode-beat-card', function (e) {
        e.preventDefault();
        if (draggedBeat && !draggedBeat.is($(this))) {
            $(this).addClass('drag-over');
        }
    });

    $(document).on('dragleave' + EVENT_NAMESPACE, '.storymode-beat-card', function () {
        $(this).removeClass('drag-over');
    });

    $(document).on('drop' + EVENT_NAMESPACE, '.storymode-beat-card', function (e) {
        e.preventDefault();
        $(this).removeClass('drag-over');

        if (draggedBeat && !draggedBeat.is($(this))) {
            const targetIndex = parseInt($(this).data('beat-index'));
            if (targetIndex !== draggedIndex && draggedIndex !== null) {
                reorderBeatsInCurrentScene(draggedIndex, targetIndex);
                refreshBeatsDisplay($(this).closest('.storymode-beats-section'));
            }
        }

        clearBeatDragState();
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

/**
 * Setup drag-and-drop for scene reordering
 */
function setupSceneDragDrop() {
    let draggedScene = null;
    let draggedIndex = null;

    const clearDragState = () => {
        $('.storymode-scene-card').removeClass('dragging drag-over');
        draggedScene = null;
        draggedIndex = null;
    };

    $(document).on('dragstart' + EVENT_NAMESPACE, '.storymode-scene-card', function () {
        draggedScene = $(this);
        draggedIndex = parseInt($(this).data('scene-index'));
        $(this).addClass('dragging');
    });

    $(document).on('dragend' + EVENT_NAMESPACE, '.storymode-scene-card', clearDragState);

    $(document).on('dragover' + EVENT_NAMESPACE, '.storymode-scene-card', function (e) {
        e.preventDefault();
        if (draggedScene && !draggedScene.is($(this))) {
            $(this).addClass('drag-over');
        }
    });

    $(document).on('dragleave' + EVENT_NAMESPACE, '.storymode-scene-card', function () {
        $(this).removeClass('drag-over');
    });

    $(document).on('drop' + EVENT_NAMESPACE, '.storymode-scene-card', function (e) {
        e.preventDefault();
        $(this).removeClass('drag-over');

        if (draggedScene && !draggedScene.is($(this))) {
            const targetIndex = parseInt($(this).data('scene-index'));
            if (targetIndex !== draggedIndex) {
                reorderScene(draggedIndex, targetIndex);
            }
        }

        clearDragState();
    });
}

/**
 * Parse cover field value with special handling
 */
function parseCoverFieldValue(field, value) {
    if (field === 'colors') {
        return value.split(',').map(c => c.trim()).filter(c => c);
    }
    return value;
}

/**
 * Ensure cover prompt is initialized
 */
function ensureCoverPromptInitialized() {
    getCurrentBlueprint().metadata = getCurrentBlueprint().metadata || {};
    if (!getCurrentBlueprint().metadata.coverPrompt) {
        getCurrentBlueprint().metadata.coverPrompt = generateCoverPrompt(getCurrentBlueprint());
    }
}

/**
 * Setup cover prompt field change handlers
 */
function setupCoverFieldHandlers() {
    $(document).on('change' + EVENT_NAMESPACE + ' input' + EVENT_NAMESPACE, '[data-cover-field]', function () {
        const field = $(this).data('cover-field');
        let value = parseCoverFieldValue(field, $(this).val());

        ensureCoverPromptInitialized();

        if (field.includes('.')) {
            setNestedValue(getCurrentBlueprint().metadata.coverPrompt, field, value);
        } else {
            getCurrentBlueprint().metadata.coverPrompt[field] = value;
        }

        setHasUnsavedChanges(true);
        updateUnsavedIndicator();
    });
}

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

/**
 * Setup character tab handlers (CQ-002)
 */
function setupCharacterTabHandlers() {
    // Refresh character links button
    $(document).on('click' + EVENT_NAMESPACE, '#refresh_character_links', async function (e) {
        e.preventDefault();
        const btn = $(this);

        if (btn.prop('disabled')) return;

        btn.prop('disabled', true);

        try {
            // Re-render characters tab
            const newContent = renderCharactersTab();
            $('.storymode-characters-tab').html($(newContent).find('.storymode-characters-tab').html());

            toastr.success('Character links refreshed');
        } catch (error) {
            console.error('[Story Mode] Failed to refresh character links:', error);
            toastr.error('Failed to refresh character links');
        } finally {
            btn.prop('disabled', false);
        }
    });
}

/**
 * Setup cover gallery navigation handlers
 */
function setupCoverGalleryHandlers() {
    $(document).on('click' + EVENT_NAMESPACE, '.storymode-cover-nav-prev, .storymode-cover-nav-next', function (e) {
        e.preventDefault();
        const newIndex = parseInt($(this).data('index'));
        navigateCoverGallery(newIndex);
    });

    $(document).on('click' + EVENT_NAMESPACE, '.storymode-cover-carousel-item', function (e) {
        e.preventDefault();
        const index = parseInt($(this).data('index'));
        if (!isNaN(index)) {
            navigateCoverGallery(index);
        }
    });

    $(document).on('keydown' + EVENT_NAMESPACE, function (e) {
        if (!canNavigateGallery()) return;

        const currentIndex = getCurrentBlueprint().metadata?.coverGalleryIndex || 0;
        const gallery = getCurrentBlueprint().metadata?.coverGallery;

        if (e.key === 'ArrowLeft' && currentIndex > 0) {
            e.preventDefault();
            navigateCoverGallery(currentIndex - 1);
        } else if (e.key === 'ArrowRight' && currentIndex < gallery.length - 1) {
            e.preventDefault();
            navigateCoverGallery(currentIndex + 1);
        }
    });
}

// Editor action handlers imported from editor-action-handlers.js

