import {
    getStoryTypes,
    setStoryTypes,
    getAuthorStyles,
    setAuthorStyles,
    saveStoryTypesToStorage,
    saveAuthorStylesToStorage,
} from '../core/state-manager.js';
import { escapeHtml } from '../ui/component-system.js';
import { generateAuthorStyle, generateStoryType } from '../generation/style-generator.js';
import { Popup, POPUP_TYPE } from '/scripts/popup.js';
import { getSillyTavernGlobals } from './type-editor-utils.js';

/**
 * Show the style generation popup with inline loading state
 * @param {string} type - 'author' or 'story'
 * @returns {Promise<Object|null>} Generated style object or null if cancelled
 */
function getGenerationLabels(type) {
    const isAuthor = type === 'author';
    return {
        isAuthor,
        title: isAuthor ? 'Generate Author Style' : 'Generate Story Type',
        placeholder: isAuthor
            ? 'e.g., "Stephen King", "noir detective fiction", "Hemingway meets Gothic horror"'
            : 'e.g., "space western", "cozy mystery with supernatural elements"',
        typeLabel: isAuthor ? 'author style' : 'story type',
        helpText: isAuthor
            ? 'You can specify an author name, a writing style, or combine them (e.g., "Stephen King writing cozy mysteries").'
            : 'Describe a genre, combine multiple genres, or describe the kind of story you want.',
    };
}

function createClosingHandler(content, isAuthor, toastr, state) {
    return async (popup) => {
        if (popup.result !== 1) return true;
        if (state.result) return true;
        if (state.generating) return false;

        const description = content.find('#style_description').val()?.trim();
        if (!description) {
            toastr.error('Please enter a description');
            return false;
        }

        state.generating = true;
        popup.okButton.disabled = true;
        popup.cancelButton.disabled = true;
        state.setState('loading');

        try {
            state.result = isAuthor
                ? await generateAuthorStyle(description)
                : await generateStoryType(description);

            toastr.success(`${isAuthor ? 'Author style' : 'Story type'} generated! Review and save below.`);
            popup.complete(1);
            return true;
        } catch (error) {
            console.error('[Story Mode] Style generation failed:', error);
            state.setState('error', `Generation failed: ${error.message}`);
            state.generating = false;
            popup.cancelButton.disabled = false;
            return false;
        }
    };
}

async function showStyleGenerationPopup(type) {
    const { toastr } = getSillyTavernGlobals();
    const { isAuthor, title, placeholder, typeLabel, helpText } = getGenerationLabels(type);

    const content = $(buildGenerationFormHtml(isAuthor, placeholder, helpText, typeLabel));
    const elements = {
        form: content.find('#style_gen_form'),
        loading: content.find('#style_gen_loading'),
        error: content.find('#style_gen_error'),
        errorMsg: content.find('#style_gen_error_msg')
    };

    const state = { result: null, generating: false };
    state.setState = (s, message = '') => {
        elements.form.toggle(s === 'form');
        elements.loading.toggle(s === 'loading');
        elements.error.toggle(s === 'error');
        if (message) elements.errorMsg.text(message);
    };

    const popup = new Popup(content, POPUP_TYPE.CONFIRM, title, {
        okButton: 'Generate',
        cancelButton: 'Cancel',
        onClosing: createClosingHandler(content, isAuthor, toastr, state),
    });

    content.find('#style_gen_retry_btn').on('click', () => {
        state.setState('form');
        popup.okButton.disabled = false;
    });

    const confirmed = await popup.show();
    return (confirmed && state.result) ? state.result : null;
}

function buildGenerationFormHtml(isAuthor, placeholder, helpText, typeLabel) {
    return `
<div class="storymode-generate-popup">
    <div id="style_gen_form">
        <div class="storymode-field">
            <label>Describe the ${isAuthor ? 'writing style' : 'story type'} you want:</label>
            <textarea id="style_description" class="text_pole" rows="3" placeholder="${placeholder}"></textarea>
        </div>
        <small class="notes" style="margin-top: 10px; display: block;">${helpText}</small>
        <div class="storymode-api-reminder" style="margin-top: 12px; padding: 8px 10px; background: var(--black30a); border-radius: 6px; border-left: 3px solid var(--sm-accent);">
            <div style="display: flex; align-items: center; gap: 8px;">
                <i class="fa-solid fa-plug" style="color: var(--sm-accent);"></i>
                <span style="font-size: 0.85em;">
                    <strong>API:</strong> Configure in <em>Settings → API Options → Utilities</em>
                </span>
            </div>
        </div>
    </div>
    <div id="style_gen_loading" style="display: none; text-align: center; padding: 30px 20px;">
        <i class="fa-solid fa-circle-notch fa-spin fa-2x" style="color: var(--sm-accent); margin-bottom: 15px;"></i>
        <p style="font-size: 1.1em; margin: 0;">Generating ${typeLabel}...</p>
        <p class="notes" style="margin-top: 8px;">This may take 10-30 seconds (or longer) depending on your API.</p>
    </div>
    <div id="style_gen_error" style="display: none; text-align: center; padding: 20px;">
        <i class="fa-solid fa-triangle-exclamation fa-2x" style="color: #f44336; margin-bottom: 12px;"></i>
        <p id="style_gen_error_msg" style="color: #f44336; margin: 0;"></p>
        <button id="style_gen_retry_btn" class="menu_button" style="margin-top: 15px;">
            <i class="fa-solid fa-rotate-right"></i> Try Again
        </button>
    </div>
</div>
`;
}

/**
 * Get IDs of default author styles from bundled data
 * @returns {Promise<Set<string>>} Set of default style IDs
 */
async function getDefaultAuthorStyleIds() {
    try {
        const response = await fetch('/scripts/extensions/third-party/Extension-StoryMode/data/author_styles.json');
        const defaults = await response.json();
        return new Set(defaults.map(s => s.id));
    } catch (error) {
        console.error('[Story Mode] Failed to load default author styles:', error);
        return new Set();
    }
}

/**
 * Get IDs of default story types from bundled data
 * @returns {Promise<Set<string>>} Set of default story type IDs
 */
async function getDefaultStoryTypeIds() {
    try {
        const response = await fetch('/scripts/extensions/third-party/Extension-StoryMode/data/story_types.json');
        const defaults = await response.json();
        return new Set(defaults.map(s => s.id));
    } catch (error) {
        console.error('[Story Mode] Failed to load default story types:', error);
        return new Set();
    }
}

/**
 * Show confirmation and remove default styles
 * @param {string} type - 'author' or 'story'
 * @param {jQuery} editorContent - The editor popup content for refreshing
 */
async function removeDefaultStyles(type, editorContent) {
    const { toastr } = getSillyTavernGlobals();
    const isAuthor = type === 'author';
    const itemType = isAuthor ? 'author styles' : 'story types';

    const defaultIds = isAuthor
        ? await getDefaultAuthorStyleIds()
        : await getDefaultStoryTypeIds();

    if (defaultIds.size === 0) {
        toastr.warning('Could not load default styles list');
        return;
    }

    const currentStyles = isAuthor ? getAuthorStyles() : getStoryTypes();
    const stylesToRemove = currentStyles.filter(s => defaultIds.has(s.id));

    if (stylesToRemove.length === 0) {
        toastr.info('No default styles found in your library');
        return;
    }

    const confirmResult = await showRemoveConfirmPopup(isAuthor, itemType, stylesToRemove);
    if (!confirmResult) return;

    const filteredStyles = currentStyles.filter(s => !defaultIds.has(s.id));

    if (isAuthor) {
        setAuthorStyles(filteredStyles);
        await saveAuthorStylesToStorage();
        const { refreshAuthorStylesListInPopup } = await import('./author-style-editor.js');
        refreshAuthorStylesListInPopup(editorContent);
        if (window.updateAuthorStyleDropdown) window.updateAuthorStyleDropdown();
    } else {
        setStoryTypes(filteredStyles);
        await saveStoryTypesToStorage();
        const { refreshStoryTypesListInPopup } = await import('./story-type-editor.js');
        refreshStoryTypesListInPopup(editorContent);
        if (window.updateStoryTypeDropdown) window.updateStoryTypeDropdown();
    }

    toastr.success(`Removed ${stylesToRemove.length} default ${itemType}`);
}

async function showRemoveConfirmPopup(isAuthor, itemType, stylesToRemove) {
    const styleList = stylesToRemove.slice(0, 5).map(s => `• ${escapeHtml(s.name)}`).join('<br>');
    const moreCount = stylesToRemove.length > 5 ? `<br>• ... and ${stylesToRemove.length - 5} more` : '';

    const html = `
<div class="storymode-remove-defaults-popup">
    <p>This will remove all built-in ${itemType} from your library.</p>
    <div class="storymode-warning-box" style="margin: 12px 0; padding: 10px; background: rgba(255, 193, 7, 0.15); border: 1px solid rgba(255, 193, 7, 0.4); border-radius: 6px;">
        <strong style="color: #ffc107;">⚠️ WARNING:</strong> Any changes you've made to the default styles will be permanently lost.
    </div>
    <p><strong>Styles to be removed (${stylesToRemove.length}):</strong></p>
    <div style="margin-left: 10px; font-size: 0.9em; color: var(--SmartThemeQuoteColor);">
        ${styleList}${moreCount}
    </div>
    <div style="margin-top: 15px; padding: 10px; background: var(--black30a); border-radius: 6px;">
        <div style="display: flex; align-items: start; gap: 8px;">
            <i class="fa-solid fa-lightbulb" style="color: var(--sm-accent); margin-top: 2px;"></i>
            <div style="font-size: 0.85em;">
                <strong>Reimport anytime:</strong> Download default styles from<br>
                <a href="https://github.com/Prompt-And-Circumstance/StoryMode/tree/main/data" target="_blank" style="color: var(--sm-accent);">
                    github.com/Prompt-And-Circumstance/StoryMode/data
                </a>
            </div>
        </div>
    </div>
</div>
`;

    const popup = new Popup($(html), POPUP_TYPE.CONFIRM, `Remove Default ${isAuthor ? 'Author Styles' : 'Story Types'}?`, {
        okButton: `Remove ${stylesToRemove.length} Styles`,
        cancelButton: 'Cancel',
    });

    return await popup.show();
}

export {
    showStyleGenerationPopup,
    getDefaultAuthorStyleIds,
    getDefaultStoryTypeIds,
    removeDefaultStyles,
};
