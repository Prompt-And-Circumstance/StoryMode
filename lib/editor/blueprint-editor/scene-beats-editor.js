/**
 * Scene Beats Editor Module
 * Handles rendering and editing of beats within scenes
 */

import { escapeHtml, buildSelectOptions } from '../../blueprint/utils.js';
import { DROPDOWN_OPTIONS } from '../../blueprint/schema.js';
import { callGenericPopup, POPUP_TYPE } from '/scripts/popup.js';

/**
 * Render a list of beats for embedding in the scene edit modal
 * @param {Array} beats - Array of beat objects (may be undefined)
 * @returns {string} HTML for beat list section
 */
export function renderBeatsEditor(beats = []) {
    if (!beats || beats.length === 0) {
        return `
            <div class="storymode-beats-section" style="margin-top: 4px; padding: 12px; border-radius: 4px; border-left: 3px solid var(--SmartThemeEmColor);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <label style="font-weight: bold;">Beats (Optional)</label>
                    <button type="button" class="menu_button" data-beat-action="add" style="padding: 4px 8px; font-size: 0.9em;">
                        <i class="fa-solid fa-plus"></i> Add Beat
                    </button>
                </div>
                <p style="color: var(--SmartThemeEmColor); margin: 0;">No beats defined yet. Beats provide fine-grained story structure for Scenario Mode.</p>
            </div>
        `;
    }

    return `
        <div class="storymode-beats-section" style="margin-top: 4px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <label style="font-weight: bold;">Beats (${beats.length})</label>
                <button type="button" class="menu_button" data-beat-action="add" style="padding: 4px 8px; font-size: 0.9em;">
                    <i class="fa-solid fa-plus"></i> Add Beat
                </button>
            </div>
            <div class="storymode-beats-list">
                ${beats.map((beat, idx) => `
                    <div class="storymode-beat-card" data-beat-index="${idx}">
                        <div class="storymode-beat-drag-handle" data-beat-index="${idx}" title="Drag to reorder">
                            <i class="fa-solid fa-grip-vertical"></i>
                        </div>
                        <div class="storymode-beat-content">
                            <strong>${escapeHtml(beat.title || 'Untitled Beat')}</strong>
                            ${beat.type ? `<span class="storymode-beat-tag storymode-beat-tag-type">${escapeHtml(beat.type)}</span>` : ''}
                            ${beat.required ? `<span class="storymode-beat-tag storymode-beat-tag-required">Required</span>` : ''}
                            ${beat.description ? `<div class="storymode-beat-description">${escapeHtml(beat.description)}</div>` : ''}
                        </div>
                        <div class="storymode-beat-actions">
                            <button type="button" class="menu_button" data-beat-action="edit" data-beat-index="${idx}" title="Edit beat">
                                <i class="fa-solid fa-pen"></i>
                            </button>
                            <button type="button" class="menu_button" data-beat-action="delete" data-beat-index="${idx}" title="Delete beat">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

/**
 * Show beat edit modal
 * @param {Object} beat - Beat object to edit (or empty object for new beat)
 * @returns {Promise<Object|null>} Updated beat object or null if cancelled
 */
export async function showBeatEditModal(beat = {}) {
    // Create unique IDs to avoid conflicts with multiple modals
    const beatId = Math.random().toString(36).slice(2, 9);
    const titleId = `beat_edit_title_${beatId}`;
    const typeId = `beat_edit_type_${beatId}`;
    const descId = `beat_edit_description_${beatId}`;
    const requiredId = `beat_edit_required_${beatId}`;

    // Temporary storage for form data - updated via handlers while modal is open
    let formData = {
        title: beat.title || '',
        type: beat.type || '',
        description: beat.description || '',
        required: beat.required || false
    };

    const formHtml = `
        <h4 style="margin-top: 0; margin-bottom: 16px;">Edit Beat</h4>
        <div class="storymode-form-group" style="margin-bottom: 12px;">
            <label for="${titleId}">Title *</label>
            <input type="text" id="${titleId}" class="text_pole" value="${escapeHtml(beat.title || '')}" style="width: 100%;" placeholder="e.g., Hero discovers the artifact" data-beat-form="title">
        </div>
        <div class="storymode-form-group" style="margin-bottom: 12px;">
            <label for="${typeId}">Type</label>
            <select id="${typeId}" class="text_pole" style="width: 100%;" data-beat-form="type">
                <option value="">-- Select Type --</option>
                ${buildSelectOptions(DROPDOWN_OPTIONS.beatType, beat.type || '')}
            </select>
        </div>
        <div class="storymode-form-group" style="margin-bottom: 12px;">
            <label for="${descId}">Description</label>
            <textarea id="${descId}" class="storymode-textarea" rows="4" style="width: 100%;" placeholder="What happens in this beat?" data-beat-form="description">${escapeHtml(beat.description || '')}</textarea>
        </div>
        <div class="storymode-form-group" style="margin-bottom: 12px;">
            <label style="display: flex; align-items: center; gap: 8px;">
                <input type="checkbox" id="${requiredId}" ${beat.required ? 'checked' : ''} data-beat-form="required">
                <span>Required for scene completion</span>
            </label>
        </div>
    `;

    // Set up temporary event handlers to capture form changes while modal is open
    const captureFormData = (e) => {
        const field = e.target.dataset.beatForm;
        if (field === 'required') {
            formData.required = e.target.checked;
        } else {
            formData[field] = e.target.value;
        }
    };

    // Attach handlers to capture changes
    $(document).on('change.beatEditor input.beatEditor', `[data-beat-form]`, captureFormData);

    const result = await callGenericPopup(formHtml, POPUP_TYPE.CONFIRM, null, {
        wide: true,
        okButton: 'Save Beat',
        cancelButton: 'Cancel'
    });

    // Clean up event handlers
    $(document).off('change.beatEditor input.beatEditor', `[data-beat-form]`, captureFormData);

    if (result) {
        try {
            const title = (formData.title || '').trim();

            if (!title) {
                toastr.warning('Beat title is required');
                return null;
            }

            const capturedValues = {
                title,
                type: formData.type || undefined,
                description: (formData.description || '').trim() || undefined,
                required: formData.required || false
            };

            // Filter out empty strings from optional fields
            if (!capturedValues.type || capturedValues.type === '') {
                delete capturedValues.type;
            }
            if (!capturedValues.description || capturedValues.description === '') {
                delete capturedValues.description;
            }

            return capturedValues;
        } catch (error) {
            console.error('[Story Mode] Error processing beat form data:', error);
            toastr.error('Error saving beat. Please try again.');
            return null;
        }
    }

    return null;
}

/**
 * Add a new beat to the beats array
 * @param {Array} beats - Current beats array
 * @param {Object} newBeat - New beat object (without index)
 * @returns {Array} Updated beats array with new beat appended
 */
export function addBeatToScene(beats = [], newBeat) {
    const index = beats.length;
    return [...beats, { index, ...newBeat }];
}

/**
 * Update an existing beat in the beats array
 * @param {Array} beats - Current beats array
 * @param {number} beatIndex - Index of beat to update
 * @param {Object} updatedBeat - Updated beat fields
 * @returns {Array} Updated beats array
 */
export function updateBeatInScene(beats = [], beatIndex, updatedBeat) {
    return beats.map((b, i) =>
        i === beatIndex ? { ...b, ...updatedBeat } : b
    );
}

/**
 * Delete a beat from the beats array
 * @param {Array} beats - Current beats array
 * @param {number} beatIndex - Index of beat to delete
 * @returns {Array} Updated beats array with beat removed and indices adjusted
 */
export function deleteBeatFromScene(beats = [], beatIndex) {
    return beats
        .filter((_, i) => i !== beatIndex)
        .map((b, i) => ({ ...b, index: i }));
}

/**
 * Reorder beats via drag-and-drop
 * @param {Array} beats - Current beats array
 * @param {number} fromIndex - Original position
 * @param {number} toIndex - New position
 * @returns {Array} Updated beats array with adjusted indices
 */
export function reorderBeatsInScene(beats = [], fromIndex, toIndex) {
    const reordered = beats.slice();
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    return reordered.map((b, i) => ({ ...b, index: i }));
}
