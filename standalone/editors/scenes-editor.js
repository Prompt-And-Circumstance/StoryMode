/**
 * Scenes Editor Module
 * Handles scene CRUD operations and the Scenes tab
 */

import { renderArrayEditor } from '../form/array-editor.js';
import { renderCollapsible } from '../form/collapsible.js';
import { Popup } from '../adapters/popup-adapter.js';
import { BLUEPRINT_FIELDS } from '../../lib/blueprint/schema.js';
import { getCurrentBlueprint } from '../handlers/blueprint-actions.js';

// ============================================================================
// SCENES TAB RENDERING
// ============================================================================

/**
 * Render the Scenes tab content
 * @param {Object} blueprint - Blueprint object
 * @param {Object} options - Options object
 * @returns {jQuery} Scenes tab content
 */
export function renderScenesTab(blueprint, options = {}) {
    const { readonly = false } = options;
    const scenes = blueprint.scene_plan || [];

    const $content = $('<div>').addClass('scenes-editor');

    // Header with action buttons
    const $header = $('<div>').addClass('tab-header');
    $header.append($('<h3>').text('Scenes'));

    const $actions = $('<div>').addClass('tab-actions');
    $actions.append($('<span>').addClass('scene-count').text(`${scenes.length} scenes`));
    const $addBtn = $('<button>').addClass('btn btn-primary').attr('data-action', 'add-scene');
    if (readonly) $addBtn.attr('disabled', 'disabled');
    $addBtn.html('<i class="fa-solid fa-plus"></i> Add Scene');
    $actions.append($addBtn);
    $header.append($actions);
    $content.append($header);

    // Scene list
    const $list = $('<div>').addClass('scene-list');
    if (scenes.length === 0) {
        const $empty = $('<div>').addClass('empty-state');
        $empty.append($('<i>').addClass('fa-solid fa-layer-group'));
        $empty.append($('<p>').text('No scenes defined. Add scenes to structure your story.'));
        $list.append($empty);
    } else {
        scenes.forEach((scene, index) => {
            $list.append(renderSceneCard(scene, index, readonly));
        });
    }
    $content.append($list);

    // Bind events
    bindScenesEvents($content, readonly);

    return $content;
}

/**
 * Render a scene card
 * @param {Object} scene - Scene object
 * @param {number} index - Scene index
 * @param {boolean} readonly - Whether card is readonly
 * @returns {jQuery} Scene card element
 */
function renderSceneCard(scene, index, readonly) {
    const $card = $('<div>').addClass('scene-card').data('scene-index', index);

    // Header
    const $header = $('<div>').addClass('scene-card-header');
    $header.append($('<span>').addClass('scene-number').text(`Scene ${index + 1}`));
    $header.append($('<span>').addClass('scene-beat').text(`Beat ${scene.beat || 0}`));
    $header.append($('<span>').addClass('scene-act').text(`Act ${scene.act || 1}`));
    $card.append($header);

    // Body
    const $body = $('<div>').addClass('scene-card-body');
    $body.append($('<h4>').addClass('scene-title').text(scene.title || 'Untitled'));
    $body.append($('<p>').addClass('scene-description').text(scene.description || ''));
    $card.append($body);

    // Actions (if not readonly)
    if (!readonly) {
        const $actions = $('<div>').addClass('scene-card-actions');
        $actions.append($('<button>').addClass('btn btn-sm btn-secondary').attr('data-action', 'edit-scene').html('<i class="fa-solid fa-pen"></i> Edit'));
        $actions.append($('<button>').addClass('btn btn-sm btn-danger').attr('data-action', 'delete-scene').html('<i class="fa-solid fa-trash"></i> Delete'));
        $card.append($actions);
    }

    return $card;
}

// ============================================================================
// EVENT BINDING
// ============================================================================

/**
 * Bind events for the Scenes tab
 * @param {jQuery} $content - Content element
 * @param {boolean} readonly - Whether tab is readonly
 */
function bindScenesEvents($content, readonly) {
    if (readonly) return;

    // Add scene button
    $content.on('click.scenes-editor', '[data-action="add-scene"]', function() {
        openSceneEditModal(null);
    });

    // Edit scene button
    $content.on('click.scenes-editor', '[data-action="edit-scene"]', function() {
        const $card = $(this).closest('.scene-card');
        const index = $card.data('scene-index');
        openSceneEditModal(index);
    });

    // Delete scene button
    $content.on('click.scenes-editor', '[data-action="delete-scene"]', function() {
        const $card = $(this).closest('.scene-card');
        const index = $card.data('scene-index');
        deleteScene(index);
    });
}

// ============================================================================
// SCENE CRUD OPERATIONS
// ============================================================================>

/**
 * Open the scene edit modal
 * @param {number|null} index - Scene index (null for new scene)
 */
function openSceneEditModal(index) {
    const isNew = index === null;
    const title = isNew ? 'Add Scene' : 'Edit Scene';

    // Get current scene data
    let sceneData = {};
    if (!isNew) {
        const blueprint = getCurrentBlueprint();
        sceneData = blueprint.scene_plan?.[index] || {};
    }

    // Build modal content
    const $content = $('<div>').addClass('scene-edit-form');

    // Title
    const $titleGroup = $('<div>').addClass('form-group');
    $titleGroup.append($('<label>').text('Title').append(' <span class="required">*</span>'));
    $titleGroup.append($('<input>')
        .attr('type', 'text')
        .addClass('form-control')
        .attr('name', 'title')
        .val(sceneData.title || '')
        .attr('placeholder', 'Scene title...'));
    $content.append($titleGroup);

    // Beat
    const $beatGroup = $('<div>').addClass('form-group');
    $beatGroup.append($('<label>').text('Beat Position'));
    $beatGroup.append($('<input>')
        .attr('type', 'number')
        .addClass('form-control')
        .attr('name', 'beat')
        .val(sceneData.beat !== undefined ? sceneData.beat : '')
        .attr('min', '0')
        .attr('placeholder', 'Beat number (0, 1, 2...)'));
    $content.append($beatGroup);

    // Act
    const $actGroup = $('<div>').addClass('form-group');
    $actGroup.append($('<label>').text('Act Number'));
    $actGroup.append($('<input>')
        .attr('type', 'number')
        .addClass('form-control')
        .attr('name', 'act')
        .val(sceneData.act !== undefined ? sceneData.act : '1')
        .attr('min', '1')
        .attr('max', '5'));
    $content.append($actGroup);

    // Description
    const $descGroup = $('<div>').addClass('form-group');
    $descGroup.append($('<label>').text('Description'));
    $descGroup.append($('<textarea>')
        .addClass('form-control')
        .attr('name', 'description')
        .attr('rows', '4')
        .val(sceneData.description || '')
        .attr('placeholder', 'What happens in this scene...'));
    $content.append($descGroup);

    // Create modal
    const popup = new Popup($content, 'TEXT', title, {
        wide: true,
        okButton: true,
        cancelButton: true,
    });

    popup.show().then(result => {
        if (result) {
            saveScene(index, extractSceneData($content));
        }
    });
}

/**
 * Extract scene data from form
 * @param {jQuery} $form - Form element
 * @returns {Object} Scene data
 */
function extractSceneData($form) {
    return {
        title: $form.find('[name="title"]').val().trim(),
        beat: Number($form.find('[name="beat"]').val()) || 0,
        act: Number($form.find('[name="act"]').val()) || 1,
        description: $form.find('[name="description"]').val().trim(),
    };
}

/**
 * Save a scene (add or update)
 * @param {number|null} index - Scene index (null for new scene)
 * @param {Object} sceneData - Scene data to save
 */
function saveScene(index, sceneData) {
    const blueprint = getCurrentBlueprint();
    if (!blueprint) return;

    if (!blueprint.scene_plan) blueprint.scene_plan = [];

    if (index === null) {
        // Add new scene
        blueprint.scene_plan.push(sceneData);
    } else {
        // Update existing scene
        blueprint.scene_plan[index] = sceneData;
    }

    // Refresh the tab in-place
    $(document).trigger('blueprint:updated', { blueprint });
    $(document).trigger('scenes:changed', { scenes: blueprint.scene_plan });
    refreshScenesView(blueprint);
}

/**
 * Delete a scene
 * @param {number} index - Scene index to delete
 */
function deleteScene(index) {
    const blueprint = getCurrentBlueprint();
    if (!blueprint || !blueprint.scene_plan) return;

    const scene = blueprint.scene_plan[index];
    const title = scene?.title || `Scene ${index + 1}`;

    const popup = new Popup(
        `Are you sure you want to delete "${title}"?`,
        'TEXT',
        'Delete Scene',
        { okButton: true, cancelButton: true }
    );

    popup.show().then(result => {
        if (result) {
            blueprint.scene_plan.splice(index, 1);
            $(document).trigger('blueprint:updated', { blueprint });
            $(document).trigger('scenes:changed', { scenes: blueprint.scene_plan });
            refreshScenesView(blueprint);
        }
    });
}

/**
 * Reorder scenes
 * @param {number} fromIndex - Source index
 * @param {number} toIndex - Target index
 */
export function reorderScenes(fromIndex, toIndex) {
    const blueprint = getCurrentBlueprint();
    if (!blueprint || !blueprint.scene_plan) return;

    const [scene] = blueprint.scene_plan.splice(fromIndex, 1);
    blueprint.scene_plan.splice(toIndex, 0, scene);

    $(document).trigger('blueprint:updated', { blueprint });
    $(document).trigger('scenes:changed', { scenes: blueprint.scene_plan });
    refreshScenesView(blueprint);
}

// ============================================================================
// VIEW REFRESH
// ============================================================================

/**
 * Refresh the scenes view in-place (re-renders the scene list)
 * @param {Object} blueprint - Blueprint object
 */
function refreshScenesView(blueprint) {
    const $tabPanel = $('#scenesTab .tab-content');
    if (!$tabPanel.length) return;

    $tabPanel.empty();
    const $content = renderScenesTab(blueprint, { readonly: false });
    $tabPanel.append($content);
}

// ============================================================================
// EXPORT FOR DEBUGGING
// ============================================================================

if (typeof window !== 'undefined') {
    window.StoryModeScenesEditor = {
        renderScenesTab,
        saveScene,
        deleteScene,
        reorderScenes,
    };
}
