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
    getChatStoryState,
    saveChatStoryState,
    MODULE_NAME,
} from '../core/state-manager.js';

import { escapeHtml, ui } from '../ui/component-system.js';
import { createHelpIcon, createHelpIconFromLines } from '../ui/components.js';
import { Popup, POPUP_TYPE } from '/scripts/popup.js';
import { download, getFileText } from '/scripts/utils.js';
import {
    sanitizeObject,
    normalizeImportedData,
    generateCopyId,
} from '../utils/import-helpers.js';

// Access SillyTavern globals lazily at runtime to avoid race conditions during module load
const getSillyTavernGlobals = () => ({
    extension_settings: window.extension_settings,
    toastr: window.toastr,
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
    content.find('#story_types_search').on('input', function () {
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
        const itemHtml = `
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
`;

        const item = $(itemHtml);

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
    if (!confirm('Delete this story type?')) return;

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

    const basicInfoContent = `
<div class="storymode-form-row">
    <div class="storymode-field">
        <label>Name ${createHelpIcon('Display name for this story type')}</label>
        <input type="text" id="edit_type_name" class="text_pole" value="${escapeHtml(type.name || '')}" />
    </div>
    <div class="storymode-field">
        <label>Category ${createHelpIcon('Comma-separated genres for filtering')}</label>
        <input type="text" id="edit_type_category" class="text_pole" placeholder="e.g., Mystery, Horror" value="${escapeHtml(type.category ? type.category.join(', ') : '')}" />
    </div>
</div>
`;

    const storyBlueprintContent = `
<div class="storymode-field">
    <label>Story Prompt ${createHelpIcon('Complete narrative guidance for the AI')}</label>
    <textarea id="edit_type_story_prompt" class="text_pole" rows="12">${escapeHtml(type.storyPrompt || '')}</textarea>
    <small class="notes">The complete story blueprint and guidance for the LLM. Edit freely to customize the storytelling approach.</small>
    ${hasOriginal ? `<button id="revert_to_default_btn" class="storymode-revert-btn" title="Reset to original"><i class="fa-solid fa-rotate-left"></i> Revert to Original</button>` : ''}
</div>
`;

    const arcPhasesContent = `
<div class="storymode-field">
    <label>Progress Template ${createHelpIcon('Variables: {currentStep}, {arcLength}, {arcPercent}, {phase}')}</label>
    <textarea id="edit_type_template" class="text_pole" rows="2">${escapeHtml(type.progressTemplate || '')}</textarea>
</div>
<div class="storymode-field">
    <label>Setup Phase (First ~33%) ${createHelpIcon('World-building, character introduction')}</label>
    <textarea id="edit_type_setup" class="text_pole" rows="2">${escapeHtml(type.phasePrompts ? type.phasePrompts.setup || '' : '')}</textarea>
</div>
<div class="storymode-field">
    <label>Confrontation Phase (Middle ~33%) ${createHelpIcon('Rising action, escalating stakes')}</label>
    <textarea id="edit_type_confrontation" class="text_pole" rows="2">${escapeHtml(type.phasePrompts ? type.phasePrompts.confrontation || '' : '')}</textarea>
</div>
<div class="storymode-field">
    <label>Resolution Phase (Final ~33%) ${createHelpIcon('Climax, resolution, conclusion')}</label>
    <textarea id="edit_type_resolution" class="text_pole" rows="2">${escapeHtml(type.phasePrompts ? type.phasePrompts.resolution || '' : '')}</textarea>
</div>
`;

    const html = `
<div class="storymode-edit-form">
    <div class="storymode-form-grid">
        <div class="storymode-form-column">
            ${ui.card({
                id: 'edit_basic_info',
                title: 'Basic Information',
                icon: 'fa-solid fa-info-circle',
                content: basicInfoContent
            })}
            ${ui.card({
                id: 'edit_story_blueprint',
                title: 'Story Prompt',
                icon: 'fa-solid fa-scroll',
                content: storyBlueprintContent
            })}
        </div>
        <div class="storymode-form-column">
            ${ui.card({
                id: 'edit_arc_phases',
                title: 'Arc Phases',
                icon: 'fa-solid fa-chart-line',
                content: arcPhasesContent
            })}
        </div>
    </div>
</div>
`;

    const content = $(html);

    // Set up revert to original button if it exists
    content.find('#revert_to_default_btn').on('click', function () {
        const originalType = getOriginalStoryType(type.id);
        if (originalType) {
            if (confirm(`Revert "${type.name}" to its original story prompt? Your current changes will be lost.`)) {
                // Update the textarea with original content
                content.find('#edit_type_story_prompt').val(originalType.storyPrompt || '');
                toastr.info('Story prompt reverted to original. Click Save to apply changes.');
            }
        }
    });

    const popup = new Popup(content, POPUP_TYPE.CONFIRM, '', {
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
            }
        };

        return {
            storyType: editedType
        };
    }

    return null;
}

/**
 * Show import choice popup - replace all or merge.
 *
 * @param {string} itemType - Description of items being imported (e.g., "story types")
 * @param {number} count - Number of items being imported
 * @returns {Promise<string|null>} 'replace', 'merge', or null if cancelled
 */
async function showImportChoicePopup(itemType, count) {
    const html = `
<div style="text-align: center; padding: 10px;">
    <p>Importing <strong>${count}</strong> ${itemType}.</p>
    <p>How would you like to handle existing ${itemType}?</p>
    <div style="display: flex; gap: 10px; justify-content: center; margin-top: 15px;">
        <button id="import_replace_btn" class="menu_button">
            <i class="fa-solid fa-arrows-rotate"></i> Replace All
        </button>
        <button id="import_merge_btn" class="menu_button">
            <i class="fa-solid fa-code-merge"></i> Merge
        </button>
    </div>
    <small class="notes" style="display: block; margin-top: 10px;">
        <strong>Replace:</strong> Remove all existing ${itemType} and use only imported ones.<br>
        <strong>Merge:</strong> Keep existing ${itemType}, add new ones. You'll be prompted for duplicates.
    </small>
</div>
`;
    const content = $(html);

    return new Promise((resolve) => {
        const popup = new Popup(content, POPUP_TYPE.TEXT, 'Import Options', {
            okButton: false,
            cancelButton: 'Cancel',
        });

        content.find('#import_replace_btn').on('click', () => {
            popup.complete(1);
            resolve('replace');
        });

        content.find('#import_merge_btn').on('click', () => {
            popup.complete(1);
            resolve('merge');
        });

        popup.show().then((result) => {
            if (result === 0 || result === null) {
                resolve(null);
            }
        });
    });
}

/**
 * Show duplicate item resolution popup.
 * Asks user whether to replace existing item or add as new copy.
 *
 * @param {string} itemType - Type of item (e.g., "story type", "author style")
 * @param {string} itemName - Name of the duplicate item
 * @returns {Promise<string|null>} 'replace', 'copy', 'skip', or null if cancelled
 */
async function showDuplicateResolutionPopup(itemType, itemName) {
    const html = `
<div style="text-align: center; padding: 10px;">
    <p>A ${itemType} named <strong>"${escapeHtml(itemName)}"</strong> already exists.</p>
    <p>What would you like to do?</p>
    <div style="display: flex; gap: 10px; justify-content: center; margin-top: 15px; flex-wrap: wrap;">
        <button id="dup_replace_btn" class="menu_button">
            <i class="fa-solid fa-arrows-rotate"></i> Replace Existing
        </button>
        <button id="dup_copy_btn" class="menu_button">
            <i class="fa-solid fa-copy"></i> Add as Copy
        </button>
        <button id="dup_skip_btn" class="menu_button">
            <i class="fa-solid fa-forward"></i> Skip
        </button>
    </div>
    <small class="notes" style="display: block; margin-top: 10px;">
        <strong>Replace:</strong> Overwrite the existing ${itemType} with the imported one.<br>
        <strong>Add as Copy:</strong> Keep both - import with a new unique ID.<br>
        <strong>Skip:</strong> Don't import this ${itemType}.
    </small>
</div>
`;
    const content = $(html);

    return new Promise((resolve) => {
        const popup = new Popup(content, POPUP_TYPE.TEXT, 'Duplicate Found', {
            okButton: false,
            cancelButton: 'Cancel All',
        });

        content.find('#dup_replace_btn').on('click', () => {
            popup.complete(1);
            resolve('replace');
        });

        content.find('#dup_copy_btn').on('click', () => {
            popup.complete(1);
            resolve('copy');
        });

        content.find('#dup_skip_btn').on('click', () => {
            popup.complete(1);
            resolve('skip');
        });

        popup.show().then((result) => {
            if (result === 0 || result === null) {
                resolve(null); // Cancel all
            }
        });
    });
}

/**
 * Generic import function for story types and author styles.
 * Handles file parsing, validation, duplicate resolution, and storage.
 *
 * @async
 * @param {HTMLInputElement} fileInput - The file input element containing the JSON file.
 * @param {Object} config - Configuration for the import operation.
 * @param {string} config.itemTypePlural - Plural name for display (e.g., "story types").
 * @param {string} config.itemTypeSingular - Singular name for display (e.g., "story type").
 * @param {Function} config.getItems - Function to get current items array.
 * @param {Function} config.setItems - Function to set items array.
 * @param {Function} config.saveToStorage - Async function to persist items.
 * @param {Function} config.refreshList - Function to refresh the UI list.
 * @param {Function|undefined} config.updateDropdown - Optional function to update dropdown.
 * @returns {Promise<void>}
 */
async function importItems(fileInput, config) {
    const { toastr } = getSillyTavernGlobals();
    const {
        itemTypePlural,
        itemTypeSingular,
        getItems,
        setItems,
        saveToStorage,
        refreshList,
        updateDropdown
    } = config;

    const file = fileInput.files[0];
    if (!file) return;

    try {
        const text = await getFileText(file);
        const rawData = JSON.parse(text);

        // Normalize to array (handles both single object and array)
        const imported = normalizeImportedData(rawData);

        // Validate all items before prompting
        for (const item of imported) {
            if (!item.id || !item.name) {
                throw new Error(`Invalid ${itemTypeSingular}: missing id or name`);
            }
        }

        // Ask user whether to replace or merge
        const choice = await showImportChoicePopup(itemTypePlural, imported.length);
        if (choice === null) {
            $(fileInput).val('');
            return; // User cancelled
        }

        let finalItems;
        let importedCount = 0;
        let skippedCount = 0;

        if (choice === 'replace') {
            finalItems = imported;
            importedCount = imported.length;
        } else {
            // Merge: handle duplicates individually
            finalItems = [...getItems()];
            let cancelled = false;

            for (const item of imported) {
                if (cancelled) break;

                const existingIndex = finalItems.findIndex(i => i.id === item.id);
                if (existingIndex >= 0) {
                    // Duplicate found - ask user
                    const resolution = await showDuplicateResolutionPopup(itemTypeSingular, item.name);

                    if (resolution === null) {
                        // User cancelled all
                        cancelled = true;
                        break;
                    } else if (resolution === 'replace') {
                        finalItems[existingIndex] = item;
                        importedCount++;
                    } else if (resolution === 'copy') {
                        // Add as copy with new unique ID
                        const copyItem = {
                            ...item,
                            id: generateCopyId(item.id),
                            name: `${item.name} (Copy)`
                        };
                        finalItems.push(copyItem);
                        importedCount++;
                    } else {
                        // Skip
                        skippedCount++;
                    }
                } else {
                    // No duplicate - just add
                    finalItems.push(item);
                    importedCount++;
                }
            }

            if (cancelled) {
                $(fileInput).val('');
                toastr.info('Import cancelled');
                return;
            }
        }

        setItems(finalItems);
        const saved = await saveToStorage();
        refreshList();

        if (updateDropdown) {
            updateDropdown();
        }

        if (saved) {
            const action = choice === 'replace' ? 'Replaced with' : 'Imported';
            const skipMsg = skippedCount > 0 ? ` (${skippedCount} skipped)` : '';
            toastr.success(`${action} ${importedCount} ${itemTypePlural}${skipMsg}`);
        }

        $(fileInput).val('');
    } catch (error) {
        console.error(`[Story Mode] Import ${itemTypePlural} failed:`, error);
        toastr.error(`Import failed: ${error.message}`);
    }
}

/**
 * Import story types from a JSON file.
 * Accepts single object or array. Prompts user to replace all or merge with existing types.
 *
 * @async
 * @param {HTMLInputElement} fileInput - The file input element containing the JSON file.
 * @returns {Promise<void>}
 */
async function importStoryTypes(fileInput) {
    return importItems(fileInput, {
        itemTypePlural: 'story types',
        itemTypeSingular: 'story type',
        getItems: getStoryTypes,
        setItems: setStoryTypes,
        saveToStorage: saveStoryTypesToStorage,
        refreshList: refreshStoryTypesList,
        updateDropdown: window.updateStoryTypeDropdown
    });
}

/**
 * Export story types to a JSON file.
 * Includes timestamp in the generated filename.
 *
 * @returns {void}
 */
function exportStoryTypes() {
    const { toastr } = getSillyTavernGlobals();
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

        const nsfwHtml = hasNSFW
            ? `<div class="storymode-nsfw-text"><strong>NSFW:</strong> ${escapeHtml(style.nsfwPrompt)}</div>`
            : '';

        const itemHtml = `
<div class="storymode-editor-item">
<div class="storymode-editor-item-header">
<strong>${escapeHtml(style.name)}</strong>
<span class="storymode-editor-category">${escapeHtml(style.category.join(', '))}</span>
${nsfwBadge}
</div>
<div class="storymode-editor-item-content">
<p>${escapeHtml(style.authorPrompt)}</p>
</div>
${nsfwHtml}
<div class="storymode-editor-item-actions">
<button class="menu_button menu_button_icon" data-id="${style.id}" data-action="edit" title="Edit">
<i class="fa-solid fa-pencil"></i>
</button>
<button class="menu_button menu_button_icon" data-id="${style.id}" data-action="delete" title="Delete">
<i class="fa-solid fa-trash"></i>
</button>
</div>
</div>
`;

        const item = $(itemHtml);

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
        const saved = await saveAuthorStylesToStorage();
        refreshAuthorStylesList();

        // Call updateAuthorStyleDropdown from window if available
        if (window.updateAuthorStyleDropdown) {
            window.updateAuthorStyleDropdown();
        }

        if (saved) {
            toastr.success('Author style added');
        }
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
        const saved = await saveAuthorStylesToStorage();
        refreshAuthorStylesList();

        // Call updateAuthorStyleDropdown from window if available
        if (window.updateAuthorStyleDropdown) {
            window.updateAuthorStyleDropdown();
        }

        if (saved) {
            toastr.success('Author style updated');
        }
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

    const saved = await saveAuthorStylesToStorage();
    refreshAuthorStylesList();

    // Call updateAuthorStyleDropdown from window if available
    if (window.updateAuthorStyleDropdown) {
        window.updateAuthorStyleDropdown();
    }

    // Clear selection if deleted style was selected
    const chatState = getChatStoryState();
    if (chatState.selectedAuthorStyle === id) {
        chatState.selectedAuthorStyle = '';
        await saveChatStoryState(chatState);

        // Call updateStoryPrompt from window if available
        if (window.updateStoryPrompt) {
            window.updateStoryPrompt();
        }
    }

    if (saved) {
        toastr.success('Author style deleted');
    }
}

/**
 * Show author style edit form
 * Uses a validation loop to keep the form open if validation fails.
 */
async function showAuthorStyleEditForm(style, isNew) {
    const { extension_settings, toastr } = getSillyTavernGlobals();
    const settings = extension_settings?.[MODULE_NAME] || {};
    const hasOriginal = !isNew && getOriginalAuthorStyle(style.id);

    // Track current form values for re-population on validation failure
    let currentValues = {
        name: style.name || '',
        category: style.category ? style.category.join(', ') : '',
        keywords: style.keywords ? style.keywords.join(', ') : '',
        description: style.authorPrompt || '',
        nsfw: style.nsfwPrompt || '',
    };

    // Loop until valid submission or cancellation
    while (true) {
        const basicInfoContent = `
<div class="storymode-form-row">
    <div class="storymode-field">
        <label>Name ${createHelpIcon('Display name for this author style')}</label>
        <input type="text" id="edit_style_name" class="text_pole" value="${escapeHtml(currentValues.name)}" />
    </div>
    <div class="storymode-field">
        <label>Category ${createHelpIcon('Comma-separated style categories')}</label>
        <input type="text" id="edit_style_category" class="text_pole" placeholder="e.g., Classic, Literary" value="${escapeHtml(currentValues.category)}" />
    </div>
</div>
<div class="storymode-field">
    <label>Keywords ${createHelpIcon('Searchable terms for finding this style')}</label>
    <input type="text" id="edit_style_keywords" class="text_pole" placeholder="e.g., poetic, minimalist, stream-of-consciousness" value="${escapeHtml(currentValues.keywords)}" />
</div>
`;

        const styleDescriptionContent = `
<div class="storymode-field">
    <label>Style Description ${createHelpIcon('Describe voice, sentence structure, literary techniques')}</label>
    <textarea id="edit_style_description" class="text_pole" rows="6">${escapeHtml(currentValues.description)}</textarea>
    <small class="notes">Describe the author's writing style, voice, and characteristics.</small>
    ${hasOriginal ? `<button id="revert_author_to_original_btn" class="storymode-revert-btn" title="Reset to original"><i class="fa-solid fa-rotate-left"></i> Revert to Original</button>` : ''}
</div>
`;

        const nsfwContent = `
<div class="storymode-field">
    <label>NSFW/Heat Guidance ${createHelpIcon('How this author handles mature content')}</label>
    <textarea id="edit_style_nsfw" class="text_pole" rows="3">${escapeHtml(currentValues.nsfw)}</textarea>
    <small class="notes">How this author handles mature/adult content. Leave empty if not applicable.</small>
</div>
`;

        const html = `
<div class="storymode-edit-form">
    ${ui.card({
        id: 'edit_style_basic_info',
        title: 'Basic Information',
        icon: 'fa-solid fa-info-circle',
        content: basicInfoContent
    })}
    ${ui.card({
        id: 'edit_style_description_card',
        title: 'Writing Style',
        icon: 'fa-solid fa-pen-fancy',
        content: styleDescriptionContent
    })}
    ${settings?.nsfwEnabled ? ui.card({
        id: 'edit_style_nsfw',
        title: 'NSFW Guidance',
        icon: 'fa-solid fa-fire',
        content: nsfwContent
    }) : ''}
</div>
`;

        const content = $(html);

        // Set up revert to original button if it exists
        content.find('#revert_author_to_original_btn').on('click', function () {
            const originalStyle = getOriginalAuthorStyle(style.id);
            if (originalStyle) {
                if (confirm(`Revert "${style.name}" to its original content? Your current changes will be lost.`)) {
                    content.find('#edit_style_description').val(originalStyle.authorPrompt || '');
                    content.find('#edit_style_nsfw').val(originalStyle.nsfwPrompt || '');
                    toastr.info('Author style reverted to original. Click Save to apply changes.');
                }
            }
        });

        const popup = new Popup(content, POPUP_TYPE.CONFIRM, '', {
            okButton: isNew ? 'Add' : 'Save',
            cancelButton: 'Cancel',
            allowVerticalScrolling: true,
        });

        const result = await popup.show();

        // User cancelled - exit loop
        if (!result) {
            return null;
        }

        // Capture current values from form (before DOM removal)
        const name = content.find('#edit_style_name').val()?.trim() || '';
        const categoryText = content.find('#edit_style_category').val()?.trim() || '';
        const description = content.find('#edit_style_description').val()?.trim() || '';
        const nsfw = settings?.nsfwEnabled
            ? (content.find('#edit_style_nsfw').val()?.trim() || '')
            : (style.nsfwPrompt || '');
        const keywordsText = content.find('#edit_style_keywords').val()?.trim() || '';

        // Update current values for potential re-display
        currentValues = { name, category: categoryText, keywords: keywordsText, description, nsfw };

        // Validate required fields
        if (!name || !description) {
            toastr.error('Name and description are required');
            continue; // Re-show form with preserved values
        }

        // Validation passed - return the edited style
        const categories = categoryText.split(',').map(c => c.trim()).filter(c => c);
        const keywords = keywordsText.split(',').map(k => k.trim()).filter(k => k);

        return {
            ...style,
            name,
            category: categories,
            authorPrompt: description,
            nsfwPrompt: nsfw,
            keywords
        };
    }
}

/**
 * Import author styles from a JSON file.
 * Accepts single object or array. Prompts user to replace all or merge with existing styles.
 *
 * @async
 * @param {HTMLInputElement} fileInput - The file input element containing the JSON file.
 * @returns {Promise<void>}
 */
async function importAuthorStyles(fileInput) {
    return importItems(fileInput, {
        itemTypePlural: 'author styles',
        itemTypeSingular: 'author style',
        getItems: getAuthorStyles,
        setItems: setAuthorStyles,
        saveToStorage: saveAuthorStylesToStorage,
        refreshList: refreshAuthorStylesList,
        updateDropdown: window.updateAuthorStyleDropdown
    });
}

/**
 * Export author styles to JSON
 */
function exportAuthorStyles() {
    const { toastr } = getSillyTavernGlobals();
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
