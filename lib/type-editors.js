/**
 * Type Editors Module
 * Handles CRUD operations for story types and author styles
 */

import {
    getStoryTypes,
    setStoryTypes,
    getAuthorStyles,
    setAuthorStyles,
    getFuseAuthorStyles,
    saveStoryTypesToStorage,
    saveAuthorStylesToStorage,
    getOriginalStoryType,
    getOriginalAuthorStyle,
    MODULE_NAME,
} from './state-manager.js';

import { escapeHtml } from './ui-component-system.js';
import { createHelpIcon, createHelpIconFromLines } from './ui-components.js';
import { Popup, POPUP_TYPE } from '/scripts/popup.js';

// Access SillyTavern globals lazily at runtime to avoid race conditions during module load
const getSillyTavernGlobals = () => ({
    extension_settings: window.extension_settings,
    toastr: window.toastr,
    getFileText: window.getFileText,
    download: window.download,
});

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
<button id="add_story_type_btn" class="menu_button" title="Create a new story type">
<i class="fa-solid fa-plus"></i> Add Story Type
</button>
<button id="import_story_types_btn" class="menu_button" title="Import story types from a JSON file">
<i class="fa-solid fa-file-import"></i> Import JSON
</button>
<button id="export_story_types_btn" class="menu_button" title="Export all story types to a JSON file">
<i class="fa-solid fa-file-export"></i> Export JSON
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

    // Attach event listeners to elements within the content
    content.find('#add_story_type_btn').on('click', () => {
        addStoryType().then(() => {
            refreshStoryTypesListInPopup(content);
        });
    });

    content.find('#import_story_types_btn').on('click', () => {
        content.find('#import_story_types_file').click();
    });

    content.find('#import_story_types_file').on('change', (e) => {
        importStoryTypes(e.target).then(() => {
            refreshStoryTypesListInPopup(content);
        });
    });

    content.find('#export_story_types_btn').on('click', () => {
        exportStoryTypes();
    });

    // Search functionality
    content.find('#story_types_search').on('input', function() {
        const query = $(this).val().toLowerCase();
        refreshStoryTypesListInPopup(content, query);
    });

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
        const item = $(`
<div class="storymode-editor-item">
<div class="storymode-editor-item-header">
<strong>${escapeHtml(type.name)}</strong>
<span class="storymode-editor-category">${escapeHtml(type.category.join(', '))}</span>
</div>
<div class="storymode-editor-item-content">
<p>${escapeHtml(type.storyPrompt || '')}</p>
</div>
<div class="storymode-editor-item-actions">
<button class="menu_button menu_button_icon" data-id="${type.id}" data-action="edit" title="Edit">
<i class="fa-solid fa-pencil"></i>
</button>
<button class="menu_button menu_button_icon" data-id="${type.id}" data-action="delete" title="Delete">
<i class="fa-solid fa-trash"></i>
</button>
</div>
</div>
`);

        item.find('[data-action="edit"]').on('click', () => editStoryType(type.id));
        item.find('[data-action="delete"]').on('click', () => deleteStoryType(type.id));

        container.append(item);
    });
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
        await saveStoryTypesToStorage();
        refreshStoryTypesList();

        // Call updateStoryTypeDropdown from window if available
        if (window.updateStoryTypeDropdown) {
            window.updateStoryTypeDropdown();
        }

        toastr.success('Story type added');
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
        await saveStoryTypesToStorage();
        refreshStoryTypesList();

        // Call updateStoryTypeDropdown from window if available
        if (window.updateStoryTypeDropdown) {
            window.updateStoryTypeDropdown();
        }

        toastr.success('Story type updated');
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
    if (!confirm('Delete this story type?')) return;

    const storyTypes = getStoryTypes();
    const index = storyTypes.findIndex(t => t.id === id);
    if (index >= 0) {
        storyTypes.splice(index, 1);
        setStoryTypes(storyTypes);
    }

    await saveStoryTypesToStorage();
    refreshStoryTypesList();

    // Call updateStoryTypeDropdown from window if available
    if (window.updateStoryTypeDropdown) {
        window.updateStoryTypeDropdown();
    }

    // Clear selection if deleted type was selected
    const { getChatStoryState, saveChatStoryState } = await import('./state-manager.js');
    const chatState = getChatStoryState();
    if (chatState.selectedStoryType === id) {
        chatState.selectedStoryType = '';
        await saveChatStoryState(chatState);

        // Call updateStoryPrompt from window if available
        if (window.updateStoryPrompt) {
            window.updateStoryPrompt();
        }
    }

    toastr.success('Story type deleted');
}

/**
 * Show the story type edit form modal.
 * Displays form fields for editing or creating a story type.
 * Includes revert button if editing a non-original type.
 *
 * @async
 * @param {Object} type - The story type object to edit or use as template.
 * @param {boolean} isNew - True if creating a new type, false if editing existing.
 * @returns {Promise<Object|null>} Object with storyType property if saved, null if cancelled.
 */
async function showStoryTypeEditForm(type, isNew) {
    const { toastr } = getSillyTavernGlobals();
    const hasOriginal = !isNew && getOriginalStoryType(type.id);
    const revertButtonHtml = hasOriginal ? `<button id="revert_to_default_btn" class="menu_button" style="margin-top: 10px;" title="Reset this story type to its original predefined version">
<i class="fa-solid fa-rotate-left"></i> Revert to Original
</button>` : '';

    const html = `
<div class="storymode-edit-form">
<h4>Basic Information</h4>
<div class="storymode-field">
<label>Name ${createHelpIcon('Display name for this story type')}</label>
<input type="text" id="edit_type_name" class="text_pole" value="${escapeHtml(type.name || '')}" />
</div>
<div class="storymode-field">
<label>Category (comma-separated) ${createHelpIcon('Comma-separated genres for filtering (e.g., Mystery, Horror)')}</label>
<input type="text" id="edit_type_category" class="text_pole" value="${escapeHtml(type.category ? type.category.join(', ') : '')}" />
</div>
<h4>Story Blueprint</h4>
<div class="storymode-field">
<label>Story Prompt ${createHelpIcon('Complete narrative guidance for the AI. Defines the story\'s tone, pacing, and focus.')}</label>
<textarea id="edit_type_story_prompt" class="text_pole" rows="15">${escapeHtml(type.storyPrompt || '')}</textarea>
<small class="notes">The complete story blueprint and guidance for the LLM. Edit freely to customize the storytelling approach.</small>
${revertButtonHtml}
</div>
<h4>Arc Progress & Phases</h4>
<div class="storymode-field">
<label>Progress Template ${createHelpIconFromLines([
'Variables: {currentStep}, {arcLength}, {arcPercent}',
'{phase}, {positionInPhase}, {totalInPhase}, {phasePercent}'
])}</label>
<textarea id="edit_type_template" class="text_pole" rows="2">${escapeHtml(type.progressTemplate || '')}</textarea>
<small class="notes">Variables: {currentStep}, {arcLength}, {arcPercent}, {phase}, {positionInPhase}, {totalInPhase}, {phasePercent}</small>
</div>
<div class="storymode-field">
<label>Setup Phase Prompt (First ~33%) ${createHelpIcon('Guidance for the first 33% of the story: world-building, character introduction')}</label>
<textarea id="edit_type_setup" class="text_pole" rows="2">${escapeHtml(type.phasePrompts ? type.phasePrompts.setup || '' : '')}</textarea>
</div>
<div class="storymode-field">
<label>Confrontation Phase Prompt (Middle ~33%) ${createHelpIcon('Guidance for the middle 33%: rising action, escalating stakes')}</label>
<textarea id="edit_type_confrontation" class="text_pole" rows="2">${escapeHtml(type.phasePrompts ? type.phasePrompts.confrontation || '' : '')}</textarea>
</div>
<div class="storymode-field">
<label>Resolution Phase Prompt (Final ~33%) ${createHelpIcon('Guidance for the final 33%: climax, resolution, conclusion')}</label>
<textarea id="edit_type_resolution" class="text_pole" rows="2">${escapeHtml(type.phasePrompts ? type.phasePrompts.resolution || '' : '')}</textarea>
</div>
${isNew ? `<h4>Template Options</h4>
<label class="checkbox_label">
<input type="checkbox" id="mark_as_template" />
<span>Mark as Template</span>
</label>
<small class="notes">If checked, this story type will be marked as a reusable template.</small>` : ''}
</div>
`;

    const content = $(html);

    // Set up revert to original button if it exists
    content.find('#revert_to_default_btn').on('click', function() {
        const originalType = getOriginalStoryType(type.id);
        if (originalType) {
            if (confirm(`Revert "${type.name}" to its original story prompt? Your current changes will be lost.`)) {
                // Update the textarea with original content
                content.find('#edit_type_story_prompt').val(originalType.storyPrompt || '');
                toastr.info('Story prompt reverted to original. Click Save to apply changes.');
            }
        }
    });

    const popup = new Popup(content, POPUP_TYPE.TEXT, '', {
        okButton: isNew ? 'Add' : 'Save',
        cancelButton: 'Cancel',
        wide: true,
        large: true,
        allowVerticalScrolling: true,
    });

    const result = await popup.show();

    if (result) {
        const name = content.find('#edit_type_name').val().trim();
        const categoryText = content.find('#edit_type_category').val().trim();
        const storyPrompt = content.find('#edit_type_story_prompt').val().trim();
        const template = content.find('#edit_type_template').val().trim();
        const setup = content.find('#edit_type_setup').val().trim();
        const confrontation = content.find('#edit_type_confrontation').val().trim();
        const resolution = content.find('#edit_type_resolution').val().trim();
        const markAsTemplate = isNew ? content.find('#mark_as_template').is(':checked') : type.isTemplate || false;

        if (!name) {
            toastr.error('Name is required');
            return null;
        }

        const categories = categoryText.split(',').map(c => c.trim()).filter(c => c);

        const editedType = {
            ...type,
            name,
            category: categories,
            storyPrompt,
            progressTemplate: template,
            phasePrompts: {
                setup,
                confrontation,
                resolution
            },
            isTemplate: markAsTemplate
        };

        return {
            storyType: editedType
        };
    }

    return null;
}

/**
 * Import story types from a JSON file.
 * Merges with existing types, replacing duplicates by ID.
 *
 * @async
 * @param {HTMLInputElement} fileInput - The file input element containing the JSON file.
 * @returns {Promise<void>}
 */
async function importStoryTypes(fileInput) {
    const { getFileText, toastr } = getSillyTavernGlobals();
    const file = fileInput.files[0];
    if (!file) return;

    try {
        const text = await getFileText(file);
        const imported = JSON.parse(text);

        if (!Array.isArray(imported)) {
            throw new Error('Invalid format: expected an array of story types');
        }

        const storyTypes = getStoryTypes();

        // Validate and merge
        imported.forEach(type => {
            if (!type.id || !type.name) {
                throw new Error('Invalid story type: missing id or name');
            }

            // Check for duplicates
            const existing = storyTypes.findIndex(t => t.id === type.id);
            if (existing >= 0) {
                storyTypes[existing] = type;
            } else {
                storyTypes.push(type);
            }
        });

        setStoryTypes(storyTypes);
        await saveStoryTypesToStorage();
        refreshStoryTypesList();

        // Call updateStoryTypeDropdown from window if available
        if (window.updateStoryTypeDropdown) {
            window.updateStoryTypeDropdown();
        }

        toastr.success(`Imported ${imported.length} story types`);

        // Clear file input
        $(fileInput).val('');
    } catch (error) {
        console.error('[Story Mode] Import failed:', error);
        toastr.error(`Import failed: ${error.message}`);
    }
}

/**
 * Export story types to a JSON file.
 * Includes timestamp in the generated filename.
 *
 * @returns {void}
 */
function exportStoryTypes() {
    const { download, toastr } = getSillyTavernGlobals();
    const storyTypes = getStoryTypes();
    const json = JSON.stringify(storyTypes, null, 2);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    download(json, `story-types-${timestamp}.json`, 'application/json');
    toastr.success('Story types exported');
}

/**
 * Show the author styles editor modal.
 * Displays add/import/export controls and a list of editable author styles.
 *
 * @async
 * @returns {Promise<void>}
 */
async function showAuthorStylesEditor() {
    const html = `
<div class="storymode-editor">
<div class="storymode-editor-controls">
<button id="add_author_style_btn" class="menu_button" title="Create a new author style">
<i class="fa-solid fa-plus"></i> Add Author Style
</button>
<button id="import_author_styles_btn" class="menu_button" title="Import author styles from a JSON file">
<i class="fa-solid fa-file-import"></i> Import JSON
</button>
<button id="export_author_styles_btn" class="menu_button" title="Export all author styles to a JSON file">
<i class="fa-solid fa-file-export"></i> Export JSON
</button>
<input type="file" id="import_author_styles_file" accept=".json" style="display:none;" />
</div>
<div class="storymode-field" style="margin-bottom: 10px;">
<input type="text" id="author_styles_search" class="text_pole" placeholder="Search author styles..." />
</div>
<div id="author_styles_list" class="storymode-editor-list"></div>
</div>
`;
    // Create content wrapper and attach event listeners BEFORE creating popup
    const content = $(html);

    // Attach event listeners to elements within the content
    content.find('#add_author_style_btn').on('click', () => {
        addAuthorStyle().then(() => {
            refreshAuthorStylesListInPopup(content);
        });
    });

    content.find('#import_author_styles_btn').on('click', () => {
        content.find('#import_author_styles_file').click();
    });

    content.find('#import_author_styles_file').on('change', (e) => {
        importAuthorStyles(e.target).then(() => {
            refreshAuthorStylesListInPopup(content);
        });
    });

    content.find('#export_author_styles_btn').on('click', () => {
        exportAuthorStyles();
    });

    // Search functionality
    content.find('#author_styles_search').on('input', (e) => {
        const query = $(e.target).val().trim();
        refreshAuthorStylesListInPopup(content, query);
    });

    // Populate the initial list
    refreshAuthorStylesListInPopup(content);

    // Create and show popup
    const popup = new Popup(content, POPUP_TYPE.TEXT, '', {
        okButton: 'Close',
        wide: true,
        large: true,
        allowVerticalScrolling: true,
    });

    await popup.show();
}

/**
 * Generic function to refresh an author styles list container.
 * Includes fuzzy search and NSFW badge display.
 *
 * @param {jQuery} container - The jQuery container element to populate.
 * @param {string} [searchQuery=''] - Optional search query for filtering.
 * @returns {void}
 */
function refreshAuthorStylesListGeneric(container, searchQuery = '') {
    if (container.length === 0) return;

    container.empty();

    const authorStyles = getAuthorStyles();
    if (authorStyles.length === 0) {
        container.append('<p class="notes">No author styles defined. Click "Add Author Style" to create one.</p>');
        return;
    }

    // Filter and sort styles
    let filteredStyles = authorStyles;
    const fuseAuthorStyles = getFuseAuthorStyles();
    if (searchQuery && fuseAuthorStyles) {
        const results = fuseAuthorStyles.search(searchQuery);
        filteredStyles = results.map(r => r.item);
    } else {
        filteredStyles = [...authorStyles].sort((a, b) => a.name.localeCompare(b.name));
    }

    if (filteredStyles.length === 0) {
        container.append('<p class="notes">No author styles found matching your search.</p>');
        return;
    }

    filteredStyles.forEach(style => {
        const hasNSFW = style.nsfwPrompt && style.nsfwPrompt.length > 0;
        const nsfwBadge = hasNSFW
            ? '<span class="storymode-nsfw-badge" title="Has NSFW Guidance"></span>'
            : '';

        const item = $(`
<div class="storymode-editor-item">
<div class="storymode-editor-item-header">
<strong>${escapeHtml(style.name)}</strong>
<span class="storymode-editor-category">${escapeHtml(style.category.join(', '))}</span>
${nsfwBadge}
</div>
<div class="storymode-editor-item-content">
<p>${escapeHtml(style.authorPrompt)}</p>
${hasNSFW ? `<p class="storymode-nsfw-text"><strong>NSFW:</strong> ${escapeHtml(style.nsfwPrompt)}</p>` : ''}
</div>
<div class="storymode-editor-item-actions">
<button class="menu_button menu_button_icon" data-id="${style.id}" data-action="edit" title="Edit">
<i class="fa-solid fa-pencil"></i>
</button>
<button class="menu_button menu_button_icon" data-id="${style.id}" data-action="delete" title="Delete">
<i class="fa-solid fa-trash"></i>
</button>
</div>
</div>
`);

        item.find('[data-action="edit"]').on('click', () => editAuthorStyle(style.id));
        item.find('[data-action="delete"]').on('click', () => deleteAuthorStyle(style.id));

        container.append(item);
    });
}

/**
 * Refresh the author styles list in the popup editor.
 * Wraps the generic list function with a content-scoped selector.
 *
 * @param {jQuery} content - The jQuery content object containing the popup.
 * @param {string} [searchQuery=''] - Optional search query to filter results.
 * @returns {void}
 */
function refreshAuthorStylesListInPopup(content, searchQuery = '') {
    const container = content.find('#author_styles_list');
    refreshAuthorStylesListGeneric(container, searchQuery);
}

/**
 * Refresh the author styles list in the main editor (global selector).
 * Wraps the generic list function with a global jQuery selector.
 *
 * @returns {void}
 */
function refreshAuthorStylesList() {
    const container = $('#author_styles_list');
    refreshAuthorStylesListGeneric(container);
}

/**
 * Add new author style
 */
async function addAuthorStyle() {
    const { toastr } = getSillyTavernGlobals();
    const newStyle = {
        id: 'custom_' + Date.now(),
        name: 'New Author Style',
        category: ['Custom'],
        authorPrompt: '',
        nsfwPrompt: '',
        keywords: []
    };

    const edited = await showAuthorStyleEditForm(newStyle, true);

    if (edited) {
        const authorStyles = getAuthorStyles();
        authorStyles.push(edited);
        setAuthorStyles(authorStyles);
        await saveAuthorStylesToStorage();
        refreshAuthorStylesList();

        // Call updateAuthorStyleDropdown from window if available
        if (window.updateAuthorStyleDropdown) {
            window.updateAuthorStyleDropdown();
        }

        toastr.success('Author style added');
    }
}

/**
 * Edit author style
 */
async function editAuthorStyle(id) {
    const { toastr } = getSillyTavernGlobals();
    const authorStyles = getAuthorStyles();
    const style = authorStyles.find(s => s.id === id);
    if (!style) return;

    const edited = await showAuthorStyleEditForm(style, false);

    if (edited) {
        const index = authorStyles.findIndex(s => s.id === id);
        authorStyles[index] = edited;
        setAuthorStyles(authorStyles);
        await saveAuthorStylesToStorage();
        refreshAuthorStylesList();

        // Call updateAuthorStyleDropdown from window if available
        if (window.updateAuthorStyleDropdown) {
            window.updateAuthorStyleDropdown();
        }

        toastr.success('Author style updated');
    }
}

/**
 * Delete author style
 */
async function deleteAuthorStyle(id) {
    const { toastr } = getSillyTavernGlobals();
    if (!confirm('Delete this author style?')) return;

    const authorStyles = getAuthorStyles();
    const index = authorStyles.findIndex(s => s.id === id);
    if (index >= 0) {
        authorStyles.splice(index, 1);
        setAuthorStyles(authorStyles);
    }

    await saveAuthorStylesToStorage();
    refreshAuthorStylesList();

    // Call updateAuthorStyleDropdown from window if available
    if (window.updateAuthorStyleDropdown) {
        window.updateAuthorStyleDropdown();
    }

    // Clear selection if deleted style was selected
    const { getChatStoryState, saveChatStoryState } = await import('./state-manager.js');
    const chatState = getChatStoryState();
    if (chatState.selectedAuthorStyle === id) {
        chatState.selectedAuthorStyle = '';
        await saveChatStoryState(chatState);

        // Call updateStoryPrompt from window if available
        if (window.updateStoryPrompt) {
            window.updateStoryPrompt();
        }
    }

    toastr.success('Author style deleted');
}

/**
 * Show author style edit form
 */
async function showAuthorStyleEditForm(style, isNew) {
    const { extension_settings, toastr } = getSillyTavernGlobals();
    const settings = extension_settings[MODULE_NAME];
    const hasOriginal = !isNew && getOriginalAuthorStyle(style.id);
    const revertButtonHtml = hasOriginal ? `<button id="revert_author_to_original_btn" class="menu_button" style="margin-top: 10px;" title="Reset this author style to its original predefined version">
<i class="fa-solid fa-rotate-left"></i> Revert to Original
</button>` : '';

    // Only show NSFW field if NSFW is enabled in settings
    const nsfwFieldHtml = settings.nsfwEnabled ? `
<div class="storymode-field">
<label>NSFW/Heat Guidance (Optional) ${createHelpIcon('How this author handles mature content (if enabled in settings)')}</label>
<textarea id="edit_style_nsfw" class="text_pole" rows="2">${escapeHtml(style.nsfwPrompt || '')}</textarea>
<small class="notes">How this author handles mature/adult content. Leave empty if not applicable.</small>
</div>` : '';

    const html = `
<div class="storymode-edit-form">
<div class="storymode-field">
<label>Name ${createHelpIcon('Display name for this author style')}</label>
<input type="text" id="edit_style_name" class="text_pole" value="${escapeHtml(style.name)}" />
</div>
<div class="storymode-field">
<label>Category (comma-separated) ${createHelpIcon('Comma-separated style categories (e.g., Classic, Modern, Literary)')}</label>
<input type="text" id="edit_style_category" class="text_pole" value="${escapeHtml(style.category.join(', '))}" />
</div>
<div class="storymode-field">
<label>Author Style Description ${createHelpIcon('Describe the author\'s writing style, voice, sentence structure, and literary techniques')}</label>
<textarea id="edit_style_description" class="text_pole" rows="3">${escapeHtml(style.authorPrompt)}</textarea>
<small class="notes">Describe the author's writing style, voice, and characteristics.</small>
${revertButtonHtml}
</div>
${nsfwFieldHtml}
<div class="storymode-field">
<label>Keywords (comma-separated) ${createHelpIcon('Searchable terms for finding this style')}</label>
<input type="text" id="edit_style_keywords" class="text_pole" value="${escapeHtml(style.keywords.join(', '))}" />
<small class="notes">Searchable keywords associated with this style.</small>
</div>
${isNew ? `<h4>Template Options</h4>
<label class="checkbox_label">
<input type="checkbox" id="mark_style_as_template" />
<span>Mark as Template</span>
</label>
<small class="notes">If checked, this author style will be marked as a reusable template.</small>` : ''}
</div>
`;

    const content = $(html);

    // Set up revert to original button if it exists
    content.find('#revert_author_to_original_btn').on('click', function() {
        const originalStyle = getOriginalAuthorStyle(style.id);
        if (originalStyle) {
            if (confirm(`Revert "${style.name}" to its original content? Your current changes will be lost.`)) {
                // Update the textareas with original content
                content.find('#edit_style_description').val(originalStyle.authorPrompt || '');
                content.find('#edit_style_nsfw').val(originalStyle.nsfwPrompt || '');
                toastr.info('Author style reverted to original. Click Save to apply changes.');
            }
        }
    });

    const popup = new Popup(content, POPUP_TYPE.TEXT, '', {
        okButton: isNew ? 'Add' : 'Save',
        cancelButton: 'Cancel',
        wide: true,
        large: false,
        allowVerticalScrolling: true,
    });

    const result = await popup.show();

    if (result) {
        const settings = extension_settings[MODULE_NAME];
        const name = content.find('#edit_style_name').val().trim();
        const categoryText = content.find('#edit_style_category').val().trim();
        const description = content.find('#edit_style_description').val().trim();
        // Only get NSFW value if the field exists (when nsfwEnabled is true)
        const nsfw = settings.nsfwEnabled ? content.find('#edit_style_nsfw').val().trim() : (style.nsfwPrompt || '');
        const keywordsText = content.find('#edit_style_keywords').val().trim();
        const markAsTemplate = isNew ? content.find('#mark_style_as_template').is(':checked') : style.isTemplate || false;

        if (!name || !description) {
            toastr.error('Name and description are required');
            return null;
        }

        const categories = categoryText.split(',').map(c => c.trim()).filter(c => c);
        const keywords = keywordsText.split(',').map(k => k.trim()).filter(k => k);

        return {
            ...style,
            name,
            category: categories,
            authorPrompt: description,
            nsfwPrompt: nsfw,
            keywords,
            isTemplate: markAsTemplate
        };
    }

    return null;
}

/**
 * Import author styles from JSON
 */
async function importAuthorStyles(fileInput) {
    const { getFileText, toastr } = getSillyTavernGlobals();
    const file = fileInput.files[0];
    if (!file) return;

    try {
        const text = await getFileText(file);
        const imported = JSON.parse(text);

        if (!Array.isArray(imported)) {
            throw new Error('Invalid format: expected an array of author styles');
        }

        const authorStyles = getAuthorStyles();

        // Validate and merge
        imported.forEach(style => {
            if (!style.id || !style.name) {
                throw new Error('Invalid author style: missing id or name');
            }

            // Check for duplicates
            const existing = authorStyles.findIndex(s => s.id === style.id);
            if (existing >= 0) {
                authorStyles[existing] = style;
            } else {
                authorStyles.push(style);
            }
        });

        setAuthorStyles(authorStyles);
        await saveAuthorStylesToStorage();
        refreshAuthorStylesList();

        // Call updateAuthorStyleDropdown from window if available
        if (window.updateAuthorStyleDropdown) {
            window.updateAuthorStyleDropdown();
        }

        toastr.success(`Imported ${imported.length} author styles`);

        // Clear file input
        $(fileInput).val('');
    } catch (error) {
        console.error('[Story Mode] Import failed:', error);
        toastr.error(`Import failed: ${error.message}`);
    }
}

/**
 * Export author styles to JSON
 */
function exportAuthorStyles() {
    const { download, toastr } = getSillyTavernGlobals();
    const authorStyles = getAuthorStyles();
    const json = JSON.stringify(authorStyles, null, 2);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    download(json, `author-styles-${timestamp}.json`, 'application/json');
    toastr.success('Author styles exported');
}

// Re-export for external access
export {
    showStoryTypesEditor,
    showAuthorStylesEditor,
    addStoryType,
    editStoryType,
    deleteStoryType,
    addAuthorStyle,
    editAuthorStyle,
    deleteAuthorStyle,
    showStoryTypeEditForm,
    showAuthorStyleEditForm,
    importStoryTypes,
    exportStoryTypes,
    importAuthorStyles,
    exportAuthorStyles,
    refreshStoryTypesList,
    refreshAuthorStylesList,
};
