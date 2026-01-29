import {
    getStoryTypes,
    setStoryTypes,
    getAuthorStyles,
    setAuthorStyles,
    saveStoryTypesToStorage,
    saveAuthorStylesToStorage,
} from '../core/state-manager.js';
import { escapeHtml } from '../ui/component-system.js';
import { Popup, POPUP_TYPE } from '/scripts/popup.js';
import { download, getFileText } from '/scripts/utils.js';
import {
    normalizeImportedData,
    generateCopyId,
} from '../utils/import-helpers.js';
import { getSillyTavernGlobals } from './type-editor-utils.js';

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
function buildDuplicateResolutionHtml(itemType, itemName) {
    return `
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
}

async function showDuplicateResolutionPopup(itemType, itemName) {
    const content = $(buildDuplicateResolutionHtml(itemType, itemName));

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
async function mergeImportedItems(imported, getItems, itemTypeSingular, toastr, fileInput) {
    const finalItems = [...getItems()];
    let importedCount = 0;
    let skippedCount = 0;

    for (const item of imported) {
        const existingIndex = finalItems.findIndex(i => i.id === item.id);

        if (existingIndex < 0) {
            finalItems.push(item);
            importedCount++;
            continue;
        }

        const resolution = await showDuplicateResolutionPopup(itemTypeSingular, item.name);

        if (resolution === null) {
            $(fileInput).val('');
            toastr.info('Import cancelled');
            return null;
        }

        if (resolution === 'replace') {
            finalItems[existingIndex] = item;
            importedCount++;
        } else if (resolution === 'copy') {
            finalItems.push({
                ...item,
                id: generateCopyId(item.id),
                name: `${item.name} (Copy)`
            });
            importedCount++;
        } else {
            skippedCount++;
        }
    }

    return { finalItems, importedCount, skippedCount };
}

async function parseAndValidateImport(fileInput, itemTypeSingular) {
    const file = fileInput.files[0];
    if (!file) return null;

    const text = await getFileText(file);
    const rawData = JSON.parse(text);
    const imported = normalizeImportedData(rawData);

    for (const item of imported) {
        if (!item.id || !item.name) {
            throw new Error(`Invalid ${itemTypeSingular}: missing id or name`);
        }
    }
    return imported;
}

async function importItems(fileInput, config) {
    const { toastr } = getSillyTavernGlobals();
    const { itemTypePlural, itemTypeSingular, getItems, setItems, saveToStorage, refreshList, updateDropdown } = config;

    try {
        const imported = await parseAndValidateImport(fileInput, itemTypeSingular);
        if (!imported) return;

        const choice = await showImportChoicePopup(itemTypePlural, imported.length);
        if (choice === null) {
            $(fileInput).val('');
            return;
        }

        let finalItems, importedCount, skippedCount;
        if (choice === 'replace') {
            finalItems = imported;
            importedCount = imported.length;
            skippedCount = 0;
        } else {
            const result = await mergeImportedItems(imported, getItems, itemTypeSingular, toastr, fileInput);
            if (!result) return;
            ({ finalItems, importedCount, skippedCount } = result);
        }

        setItems(finalItems);
        const saved = await saveToStorage();
        refreshList();
        if (updateDropdown) updateDropdown();

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
    // Import refreshStoryTypesList lazily to avoid circular dependency
    const { refreshStoryTypesList } = await import('./story-type-editor.js');
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
 * Import author styles from a JSON file.
 * Accepts single object or array. Prompts user to replace all or merge with existing styles.
 *
 * @async
 * @param {HTMLInputElement} fileInput - The file input element containing the JSON file.
 * @returns {Promise<void>}
 */
async function importAuthorStyles(fileInput) {
    // Import refreshAuthorStylesList lazily to avoid circular dependency
    const { refreshAuthorStylesList } = await import('./author-style-editor.js');
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

export {
    showImportChoicePopup,
    showDuplicateResolutionPopup,
    importItems,
    importStoryTypes,
    exportStoryTypes,
    importAuthorStyles,
    exportAuthorStyles,
};
