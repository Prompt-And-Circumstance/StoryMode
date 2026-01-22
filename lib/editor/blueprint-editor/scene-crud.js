/**
 * Scene CRUD Module
 * Handles adding, editing, deleting, and reordering scenes
 */

import { callGenericPopup, POPUP_TYPE } from '/scripts/popup.js';
import { escapeHtml, buildSelectOptions } from '../../blueprint/utils.js';
import { DROPDOWN_OPTIONS } from '../../blueprint/schema.js';
import {
    getCurrentBlueprint,
    setHasUnsavedChanges,
} from './state.js';

// Default scene template for new scenes
const DEFAULT_SCENE = {
    phase: 'setup',
    purpose: 'Advancing the story',
    situation: 'A new scene unfolds',
    key_events_if_unchanged: [],
    choice_points: [],
    character_focus: [],
    hooks_for_future: []
};

// Refresh functions - injected to avoid circular deps
let _refreshContent = null;
let _refreshLeftPanel = null;

/**
 * Set the refresh functions (called from main module)
 * @param {Function} contentFn - The refreshContent function
 * @param {Function} leftPanelFn - The refreshLeftPanel function
 */
export function setRefreshFunctions(contentFn, leftPanelFn) {
    _refreshContent = contentFn;
    _refreshLeftPanel = leftPanelFn;
}

/**
 * Add a new scene to the blueprint
 */
export function addScene() {
    if (!getCurrentBlueprint().scene_plan) {
        getCurrentBlueprint().scene_plan = [];
    }

    const index = getCurrentBlueprint().scene_plan.length;
    getCurrentBlueprint().scene_plan.push({
        ...DEFAULT_SCENE,
        index,
        title: `Scene ${index + 1}`
    });

    setHasUnsavedChanges(true);
    if (_refreshContent) _refreshContent();
    if (_refreshLeftPanel) _refreshLeftPanel(); // Update scene count in left panel
}

/**
 * Edit an existing scene (show modal)
 * @param {number} index - Scene index to edit
 */
export async function editScene(index) {
    const scene = getCurrentBlueprint().scene_plan[index];
    if (!scene) return;

    // Build edit form
    const formHtml = `
        <h3>Edit Scene ${index + 1}</h3>
        <div class="storymode-form-group" style="margin-bottom: 12px;">
            <label for="scene_edit_title">Title</label>
            <input type="text" id="scene_edit_title" class="text_pole" value="${escapeHtml(scene.title)}" style="width: 100%;">
        </div>
        <div class="storymode-form-group" style="margin-bottom: 12px;">
            <label for="scene_edit_phase">Phase</label>
            <select id="scene_edit_phase" class="text_pole" style="width: 100%;">
                ${buildSelectOptions(DROPDOWN_OPTIONS.scenePhase, scene.phase)}
            </select>
        </div>
        <div class="storymode-form-group" style="margin-bottom: 12px;">
            <label for="scene_edit_purpose">Purpose</label>
            <textarea id="scene_edit_purpose" class="storymode-textarea" rows="3" style="width: 100%;">${escapeHtml(scene.purpose || '')}</textarea>
        </div>
        <div class="storymode-form-group" style="margin-bottom: 12px;">
            <label for="scene_edit_situation">Situation</label>
            <textarea id="scene_edit_situation" class="storymode-textarea" rows="5" style="width: 100%;">${escapeHtml(scene.situation || '')}</textarea>
        </div>
    `;

    const result = await callGenericPopup(formHtml, POPUP_TYPE.CONFIRM, null, {
        wide: true,
        okButton: 'Save Scene',
        cancelButton: 'Cancel'
    });

    if (result) {
        // Save changes
        scene.title = $('#scene_edit_title').val();
        scene.phase = $('#scene_edit_phase').val();
        scene.purpose = $('#scene_edit_purpose').val();
        scene.situation = $('#scene_edit_situation').val();
        setHasUnsavedChanges(true);
        if (_refreshContent) _refreshContent();
    }
}

/**
 * Delete a scene from the blueprint
 * @param {number} index - Scene index to delete
 */
export async function deleteScene(index) {
    const scene = getCurrentBlueprint().scene_plan[index];
    const sceneTitle = scene?.title || `Scene ${index + 1}`;

    const result = await callGenericPopup(
        `Are you sure you want to delete "${escapeHtml(sceneTitle)}"?`,
        POPUP_TYPE.CONFIRM,
        null,
        { okButton: 'Delete', cancelButton: 'Cancel' }
    );

    if (result) {
        getCurrentBlueprint().scene_plan.splice(index, 1);
        // Reindex scenes
        getCurrentBlueprint().scene_plan.forEach((s, i) => s.index = i);
        setHasUnsavedChanges(true);
        if (_refreshContent) _refreshContent();
        if (_refreshLeftPanel) _refreshLeftPanel(); // Update scene count in left panel
    }
}

/**
 * Reorder scenes (after drag-and-drop)
 * @param {number} fromIndex - Original position
 * @param {number} toIndex - New position
 */
export function reorderScene(fromIndex, toIndex) {
    const scenes = getCurrentBlueprint().scene_plan;
    const [removed] = scenes.splice(fromIndex, 1);
    scenes.splice(toIndex, 0, removed);
    // Reindex scenes
    scenes.forEach((s, i) => s.index = i);
    setHasUnsavedChanges(true);
    if (_refreshContent) _refreshContent();
    // Note: Scene count doesn't change on reorder, so no need to refresh left panel
}
