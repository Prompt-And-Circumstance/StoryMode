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
import {
    renderBeatsEditor,
    showBeatEditModal,
    addBeatToScene,
    updateBeatInScene,
    deleteBeatFromScene,
    reorderBeatsInScene,
} from './scene-beats-editor.js';

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

// Temporary edit state - holds beats being edited in the scene modal
let _currentEditState = {
    sceneIndex: null,
    beats: [],
};

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
 * Get the current edit state (beats being edited)
 */
export function getCurrentEditState() {
    return _currentEditState;
}

/**
 * Update the current edit state
 */
export function updateEditState(state) {
    _currentEditState = { ..._currentEditState, ...state };
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

    // Initialize edit state with beats for this session
    const initialBeats = (scene.beats && scene.beats.length > 0) ? [...scene.beats] : [];
    updateEditState({ sceneIndex: index, beats: initialBeats });

    // Build edit form with beats section
    const beatsHtml = renderBeatsEditor(initialBeats);
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
        ${beatsHtml}
    `;

    // Capture form values before popup closes using a closure
    let capturedValues = null;

    // Set up a one-time listener to capture values when OK is clicked
    const captureHandler = function(e) {
        const $this = $(this);
        if ($this.hasClass('popup-button-ok')) {
            capturedValues = {
                title: $('#scene_edit_title').val(),
                phase: $('#scene_edit_phase').val(),
                purpose: $('#scene_edit_purpose').val(),
                situation: $('#scene_edit_situation').val()
            };
        }
    };

    $(document).one('click', '.popup-button-ok', captureHandler);

    const result = await callGenericPopup(formHtml, POPUP_TYPE.CONFIRM, null, {
        wide: true,
        large: true,
        okButton: 'Save Scene',
        cancelButton: 'Cancel'
    });

    // Remove handler if it wasn't triggered (e.g., user cancelled)
    $(document).off('click', '.popup-button-ok', captureHandler);

    if (result && capturedValues) {
        // Save changes using captured values
        scene.title = capturedValues.title;
        scene.phase = capturedValues.phase;
        scene.purpose = capturedValues.purpose;
        scene.situation = capturedValues.situation;
        const editState = getCurrentEditState();
        scene.beats = editState.beats.length > 0 ? editState.beats : undefined;
        setHasUnsavedChanges(true);
        if (_refreshContent) _refreshContent();
    } else if (result && !capturedValues) {
        console.error('[SceneCRUD] Failed to capture form values before popup closed');
        toastr.error('Failed to save scene: form data not captured');
    }

    // Clear edit state
    updateEditState({ sceneIndex: null, beats: [] });
}

/**
 * Add a new beat to the scene being edited (updates edit state)
 * @returns {Promise<boolean>} True if beat was added
 */
export async function addBeatToCurrentScene() {
    const newBeat = await showBeatEditModal({});
    if (newBeat) {
        const editState = getCurrentEditState();
        const updated = addBeatToScene(editState.beats, newBeat);
        updateEditState({ beats: updated });
        return true;
    }
    return false;
}

/**
 * Edit an existing beat in the scene (updates edit state)
 * @param {number} beatIndex - Index of beat to edit
 * @returns {Promise<boolean>} True if beat was updated
 */
export async function editBeatInCurrentScene(beatIndex) {
    const editState = getCurrentEditState();
    if (beatIndex < 0 || beatIndex >= editState.beats.length) return false;
    const beat = editState.beats[beatIndex];
    const updated = await showBeatEditModal(beat);
    if (updated) {
        const newBeats = updateBeatInScene(editState.beats, beatIndex, updated);
        updateEditState({ beats: newBeats });
        return true;
    }
    return false;
}

/**
 * Delete a beat from the scene (updates edit state with confirmation)
 * @param {number} beatIndex - Index of beat to delete
 * @returns {Promise<boolean>} True if beat was deleted
 */
export async function deleteBeatFromCurrentScene(beatIndex) {
    const editState = getCurrentEditState();
    if (beatIndex < 0 || beatIndex >= editState.beats.length) return false;
    const beat = editState.beats[beatIndex];
    const result = await callGenericPopup(
        `Delete beat "${escapeHtml(beat.title || 'Untitled')}"?`,
        POPUP_TYPE.CONFIRM,
        null,
        { okButton: 'Delete', cancelButton: 'Cancel' }
    );
    if (result) {
        const newBeats = deleteBeatFromScene(editState.beats, beatIndex);
        updateEditState({ beats: newBeats });
        return true;
    }
    return false;
}

/**
 * Reorder beats within the scene (updates edit state)
 * @param {number} fromIndex - Original position
 * @param {number} toIndex - New position
 */
export function reorderBeatsInCurrentScene(fromIndex, toIndex) {
    const editState = getCurrentEditState();
    const updated = reorderBeatsInScene(editState.beats, fromIndex, toIndex);
    updateEditState({ beats: updated });
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
    if (!scenes || scenes.length === 0) return;

    const [removed] = scenes.splice(fromIndex, 1);
    scenes.splice(toIndex, 0, removed);
    scenes.forEach((s, i) => s.index = i);
    setHasUnsavedChanges(true);
    if (_refreshContent) _refreshContent();
}
