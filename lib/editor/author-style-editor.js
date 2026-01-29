import {
    getAuthorStyles,
    setAuthorStyles,
    getFuseAuthorStyles,
    saveAuthorStylesToStorage,
    getChatStoryState,
    saveChatStoryState,
} from '../core/state-manager.js';
import { escapeHtml } from '../ui/component-system.js';
import { Popup, POPUP_TYPE } from '/scripts/popup.js';
import { getSillyTavernGlobals, exportSingleStyle } from './type-editor-utils.js';
import { importAuthorStyles, exportAuthorStyles } from './import-export.js';
import { showStyleGenerationPopup, removeDefaultStyles } from './style-generation.js';
import { showAuthorStyleEditForm } from './author-style-form.js';

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
<button id="generate_author_style_btn" class="menu_button" title="Generate a new author style with AI">
<i class="fa-solid fa-wand-magic-sparkles"></i> Generate with AI
</button>
<button id="add_author_style_btn" class="menu_button" title="Create a new author style">
<i class="fa-solid fa-plus"></i> Add new Author Style
</button>
<button id="import_author_styles_btn" class="menu_button" title="Import author styles from a JSON file">
<i class="fa-solid fa-file-import"></i> Import JSON
</button>
<button id="export_author_styles_btn" class="menu_button" title="Export all author styles to a JSON file">
<i class="fa-solid fa-file-export"></i> Export JSON
</button>
<button id="remove_default_author_styles_btn" class="menu_button" title="Remove all built-in author styles">
<i class="fa-solid fa-eraser"></i> Remove Defaults
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

    bindAuthorEditorEvents(content);

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

async function handleGenerateAuthorStyle(content) {
    const result = await showStyleGenerationPopup('author');
    if (!result) return;
    const edited = await showAuthorStyleEditForm(result, true);
    if (!edited) return;
    const authorStyles = getAuthorStyles();
    authorStyles.push(edited);
    setAuthorStyles(authorStyles);
    await saveAuthorStylesToStorage();
    refreshAuthorStylesListInPopup(content);
    if (window.updateAuthorStyleDropdown) window.updateAuthorStyleDropdown();
    const { toastr } = getSillyTavernGlobals();
    toastr.success('Author style added');
}

function bindAuthorEditorEvents(content) {
    content.find('#generate_author_style_btn').on('click', () => handleGenerateAuthorStyle(content));
    content.find('#add_author_style_btn').on('click', () => {
        addAuthorStyle().then(() => refreshAuthorStylesListInPopup(content));
    });
    content.find('#import_author_styles_btn').on('click', () => {
        content.find('#import_author_styles_file').click();
    });
    content.find('#import_author_styles_file').on('change', (e) => {
        importAuthorStyles(e.target).then(() => refreshAuthorStylesListInPopup(content));
    });
    content.find('#export_author_styles_btn').on('click', () => exportAuthorStyles());
    content.find('#remove_default_author_styles_btn').on('click', () => removeDefaultStyles('author', content));

    content.on('click', '.export_single_btn', function() {
        const row = $(this).closest('.storymode-editor-item');
        const styleId = row.data('id');
        const authorStyles = getAuthorStyles();
        const style = authorStyles.find(s => s.id === styleId);
        if (style) exportSingleStyle(style, 'author');
    });

    content.find('#author_styles_search').on('input', (e) => {
        const query = $(e.target).val().trim();
        refreshAuthorStylesListInPopup(content, query);
    });
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
        const item = buildAuthorStyleListItem(style);
        container.append(item);
    });
}

function buildAuthorStyleListItem(style) {
    const hasNSFW = style.nsfwPrompt && style.nsfwPrompt.length > 0;
    const nsfwBadge = hasNSFW
        ? '<span class="storymode-nsfw-badge" title="Has NSFW Guidance"></span>'
        : '';

    const nsfwHtml = hasNSFW
        ? `<div class="storymode-nsfw-text"><strong>NSFW:</strong> ${escapeHtml(style.nsfwPrompt)}</div>`
        : '';

    const itemHtml = `
<div class="storymode-editor-item" data-id="${style.id}">
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
<button class="menu_button menu_button_icon export_single_btn" title="Export as JSON">
<i class="fa-solid fa-file-export"></i>
</button>
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

    return item;
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

// Re-export form function for external consumers
export { showAuthorStyleEditForm };

export {
    showAuthorStylesEditor,
    refreshAuthorStylesListGeneric,
    refreshAuthorStylesListInPopup,
    refreshAuthorStylesList,
    addAuthorStyle,
    editAuthorStyle,
    deleteAuthorStyle,
};
