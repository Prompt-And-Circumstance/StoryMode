import {
    getStoryTypes,
    setStoryTypes,
    saveStoryTypesToStorage,
    getChatStoryState,
    saveChatStoryState,
} from '../core/state-manager.js';
import { escapeHtml } from '../ui/component-system.js';
import { callGenericPopup, Popup, POPUP_TYPE, POPUP_RESULT } from '/scripts/popup.js';
import { getSillyTavernGlobals, exportSingleStyle } from './type-editor-utils.js';
import { importStoryTypes, exportStoryTypes } from './import-export.js';
import { showStyleGenerationPopup, removeDefaultStyles } from './style-generation.js';
import { showStoryTypeEditForm, buildMemorableElementFields, extractMemorableElement } from './story-type-form.js';

/**
 * Show the story types editor modal.
 * Displays add/import/export controls and a list of editable story types.
 *
 * @async
 * @returns {Promise<void>}
 */
async function showStoryTypesEditor() {
    const html = `
<div class="storymode-editor">
<div class="storymode-editor-controls">
<button id="generate_story_type_btn" class="menu_button" title="Generate a new story type with AI">
<i class="fa-solid fa-wand-magic-sparkles"></i> Generate with AI
</button>
<button id="add_story_type_btn" class="menu_button" title="Create a new story type">
<i class="fa-solid fa-plus"></i> Add new Story Type
</button>
<button id="import_story_types_btn" class="menu_button" title="Import story types from a JSON file">
<i class="fa-solid fa-file-import"></i> Import JSON
</button>
<button id="export_story_types_btn" class="menu_button" title="Export all story types to a JSON file">
<i class="fa-solid fa-file-export"></i> Export JSON
</button>
<button id="remove_default_story_types_btn" class="menu_button" title="Remove all built-in story types">
<i class="fa-solid fa-eraser"></i> Remove Defaults
</button>
<input type="file" id="import_story_types_file" accept=".json" style="display:none;" />
</div>
<div class="storymode-field" style="margin: 15px 0;">
<input type="text" id="story_types_search" class="text_pole" placeholder="Search story types..." />
</div>
<div id="story_types_list" class="storymode-editor-list"></div>
</div>
`;
    // Create content wrapper and attach event listeners BEFORE creating popup
    const content = $(html);

    bindStoryEditorEvents(content);

    // Populate the initial list
    refreshStoryTypesListInPopup(content);

    // Create and show popup
    const popup = new Popup(content, POPUP_TYPE.TEXT, '', {
        okButton: 'Close',
        wide: true,
        large: true,
        allowVerticalScrolling: true,
    });

    await popup.show();
}

async function handleGenerateStoryType(content) {
    const result = await showStyleGenerationPopup('story');
    if (!result) return;
    const edited = await showStoryTypeEditForm(result, true);
    if (!edited) return;
    const { storyType } = edited;
    const storyTypes = getStoryTypes();
    storyTypes.push(storyType);
    setStoryTypes(storyTypes);
    await saveStoryTypesToStorage();
    refreshStoryTypesListInPopup(content);
    if (window.updateStoryTypeDropdown) window.updateStoryTypeDropdown();
    const { toastr } = getSillyTavernGlobals();
    toastr.success('Story type added');
}

function bindStoryEditorEvents(content) {
    content.find('#generate_story_type_btn').on('click', () => handleGenerateStoryType(content));
    content.find('#add_story_type_btn').on('click', () => {
        addStoryType().then(() => refreshStoryTypesListInPopup(content));
    });
    content.find('#import_story_types_btn').on('click', () => {
        content.find('#import_story_types_file').click();
    });
    content.find('#import_story_types_file').on('change', (e) => {
        importStoryTypes(e.target).then(() => refreshStoryTypesListInPopup(content));
    });
    content.find('#export_story_types_btn').on('click', () => exportStoryTypes());
    content.find('#remove_default_story_types_btn').on('click', () => removeDefaultStyles('story', content));

    content.on('click', '.export_single_btn', function() {
        const row = $(this).closest('.storymode-editor-item');
        const styleId = row.data('id');
        const storyTypes = getStoryTypes();
        const style = storyTypes.find(s => s.id === styleId);
        if (style) exportSingleStyle(style, 'story');
    });

    content.find('#story_types_search').on('input', function () {
        const query = $(this).val().toLowerCase();
        refreshStoryTypesListInPopup(content, query);
    });
}

/**
 * Generic function to refresh a story types list container.
 * Includes search filtering and HTML escaping for security.
 *
 * @param {jQuery} container - The jQuery container element to populate.
 * @param {string} [searchQuery=''] - Optional search query to filter results.
 * @returns {void}
 */
function refreshStoryTypesListGeneric(container, searchQuery = '') {
    if (container.length === 0) return;

    container.empty();

    const storyTypes = getStoryTypes();
    if (storyTypes.length === 0) {
        container.append('<p class="notes">No story types defined. Click "Add Story Type" to create one.</p>');
        return;
    }

    // Sort alphabetically and filter by search (if provided)
    let filteredTypes = [...storyTypes].sort((a, b) => a.name.localeCompare(b.name));

    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filteredTypes = filteredTypes.filter(type =>
            type.name.toLowerCase().includes(q) ||
            type.category.some(cat => cat.toLowerCase().includes(q)) ||
            (type.storyPrompt && type.storyPrompt.toLowerCase().includes(q))
        );
    }

    if (filteredTypes.length === 0) {
        container.append('<p class="notes">No story types match your search.</p>');
        return;
    }

    filteredTypes.forEach(type => {
        const item = buildStoryTypeListItem(type);
        container.append(item);
    });
}

function buildStoryTypeListItem(type) {
    const itemHtml = `
<div class="storymode-editor-item" data-id="${type.id}">
<div class="storymode-editor-item-header">
<strong>${escapeHtml(type.name)}</strong>
<span class="storymode-editor-category">${escapeHtml(type.category.join(', '))}</span>
</div>
<div class="storymode-editor-item-content">
<p>${escapeHtml(type.storyPrompt || '')}</p>
</div>
<div class="storymode-editor-item-actions">
<button class="menu_button menu_button_icon export_single_btn" title="Export as JSON">
<i class="fa-solid fa-file-export"></i>
</button>
<button class="menu_button menu_button_icon" data-id="${type.id}" data-action="edit" title="Edit">
<i class="fa-solid fa-pencil"></i>
</button>
<button class="menu_button menu_button_icon" data-id="${type.id}" data-action="delete" title="Delete">
<i class="fa-solid fa-trash"></i>
</button>
</div>
</div>
`;

    const item = $(itemHtml);

    item.find('[data-action="edit"]').on('click', () => editStoryType(type.id));
    item.find('[data-action="delete"]').on('click', () => deleteStoryType(type.id));

    return item;
}

/**
 * Refresh the story types list in the popup editor.
 * Wraps the generic list function with a content-scoped selector.
 *
 * @param {jQuery} content - The jQuery content object containing the popup.
 * @param {string} [searchQuery=''] - Optional search query to filter results.
 * @returns {void}
 */
function refreshStoryTypesListInPopup(content, searchQuery = '') {
    const container = content.find('#story_types_list');
    refreshStoryTypesListGeneric(container, searchQuery);
}

/**
 * Refresh the story types list in the main editor (global selector).
 * Wraps the generic list function with a global jQuery selector.
 *
 * @returns {void}
 */
function refreshStoryTypesList() {
    const container = $('#story_types_list');
    refreshStoryTypesListGeneric(container);
}

/**
 * Add a new custom story type.
 * Creates a default template and opens the edit form for user customization.
 *
 * @async
 * @returns {Promise<void>}
 */
async function addStoryType() {
    const { toastr } = getSillyTavernGlobals();
    const newType = {
        id: 'custom_' + Date.now(),
        name: 'New Story Type',
        category: ['Custom'],
        storyPrompt: '',
        progressTemplate: 'Arc Progress: Step {currentStep}/{arcLength} ({arcPercent}% complete). Phase: {phase} - Message {positionInPhase}/{totalInPhase} ({phasePercent}% through {phase}).',
        phasePrompts: {
            setup: '',
            confrontation: '',
            resolution: ''
        }
    };

    const result = await showStoryTypeEditForm(newType, true);

    if (result) {
        const { storyType } = result;
        const storyTypes = getStoryTypes();
        storyTypes.push(storyType);
        setStoryTypes(storyTypes);
        const saved = await saveStoryTypesToStorage();
        refreshStoryTypesList();

        // Call updateStoryTypeDropdown from window if available
        if (window.updateStoryTypeDropdown) {
            window.updateStoryTypeDropdown();
        }

        if (saved) {
            toastr.success('Story type added');
        }
    }
}

/**
 * Edit an existing story type by ID.
 * Opens the edit form pre-populated with the current type's data.
 *
 * @async
 * @param {string} id - The unique identifier of the story type to edit.
 * @returns {Promise<void>}
 */
async function editStoryType(id) {
    const { toastr } = getSillyTavernGlobals();
    const storyTypes = getStoryTypes();
    const type = storyTypes.find(t => t.id === id);
    if (!type) return;

    const result = await showStoryTypeEditForm(type, false);

    if (result) {
        const { storyType } = result;
        const index = storyTypes.findIndex(t => t.id === id);
        storyTypes[index] = storyType;
        setStoryTypes(storyTypes);
        const saved = await saveStoryTypesToStorage();
        refreshStoryTypesList();

        // Call updateStoryTypeDropdown from window if available
        if (window.updateStoryTypeDropdown) {
            window.updateStoryTypeDropdown();
        }

        if (saved) {
            toastr.success('Story type updated');
        }
    }
}

/**
 * Delete a story type by ID.
 * Also clears the selection if the deleted type was currently selected.
 *
 * @async
 * @param {string} id - The unique identifier of the story type to delete.
 * @returns {Promise<void>}
 */
async function deleteStoryType(id) {
    const { toastr } = getSillyTavernGlobals();
    const result = await callGenericPopup(
        'Delete this story type?',
        POPUP_TYPE.CONFIRM,
        '',
        { okButton: 'Delete', cancelButton: 'Cancel' }
    );
    if (result !== POPUP_RESULT.AFFIRMATIVE) return;

    const storyTypes = getStoryTypes();
    const index = storyTypes.findIndex(t => t.id === id);
    if (index >= 0) {
        storyTypes.splice(index, 1);
        setStoryTypes(storyTypes);
    }

    const saved = await saveStoryTypesToStorage();
    refreshStoryTypesList();

    // Call updateStoryTypeDropdown from window if available
    if (window.updateStoryTypeDropdown) {
        window.updateStoryTypeDropdown();
    }

    // Clear selection if deleted type was selected
    const chatState = getChatStoryState();
    if (chatState.selectedStoryType === id) {
        chatState.selectedStoryType = '';
        await saveChatStoryState(chatState);

        // Call updateStoryPrompt from window if available
        if (window.updateStoryPrompt) {
            window.updateStoryPrompt();
        }
    }

    if (saved) {
        toastr.success('Story type deleted');
    }
}

// Re-export form functions for external consumers
export { showStoryTypeEditForm, buildMemorableElementFields, extractMemorableElement };

export {
    showStoryTypesEditor,
    refreshStoryTypesListGeneric,
    refreshStoryTypesListInPopup,
    refreshStoryTypesList,
    addStoryType,
    editStoryType,
    deleteStoryType,
};
