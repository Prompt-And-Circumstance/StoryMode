import {
    getOriginalAuthorStyle,
    MODULE_NAME,
} from '../core/state-manager.js';
import { escapeHtml, ui } from '../ui/component-system.js';
import { createHelpIcon } from '../ui/components.js';
import { callGenericPopup, Popup, POPUP_TYPE, POPUP_RESULT } from '/scripts/popup.js';
import { getSillyTavernGlobals } from './type-editor-utils.js';

/**
 * Show author style edit form
 * Uses a validation loop to keep the form open if validation fails.
 */
function extractAuthorFormValues(content, settings, style) {
    const name = content.find('#edit_style_name').val()?.trim() || '';
    const categoryText = content.find('#edit_style_category').val()?.trim() || '';
    const description = content.find('#edit_style_description').val()?.trim() || '';
    const nsfw = settings?.nsfwEnabled
        ? (content.find('#edit_style_nsfw').val()?.trim() || '')
        : (style.nsfwPrompt || '');
    const keywordsText = content.find('#edit_style_keywords').val()?.trim() || '';
    return { name, categoryText, description, nsfw, keywordsText };
}

async function showAuthorStyleEditForm(style, isNew) {
    const { extension_settings, toastr } = getSillyTavernGlobals();
    const settings = extension_settings?.[MODULE_NAME] || {};
    const hasOriginal = !isNew && getOriginalAuthorStyle(style.id);

    let currentValues = {
        name: style.name || '',
        category: style.category ? style.category.join(', ') : '',
        keywords: style.keywords ? style.keywords.join(', ') : '',
        description: style.authorPrompt || '',
        nsfw: style.nsfwPrompt || '',
    };

    while (true) {
        const content = buildAuthorFormContent(currentValues, settings, hasOriginal);
        bindAuthorFormEvents(content, style, toastr);

        const popup = new Popup(content, POPUP_TYPE.CONFIRM, '', {
            okButton: isNew ? 'Add' : 'Save',
            cancelButton: 'Cancel',
            allowVerticalScrolling: true,
        });

        const result = await popup.show();
        if (!result) return null;

        const { name, categoryText, description, nsfw, keywordsText } = extractAuthorFormValues(content, settings, style);
        currentValues = { name, category: categoryText, keywords: keywordsText, description, nsfw };

        if (!name || !description) {
            toastr.error('Name and description are required');
            continue;
        }

        const categories = categoryText.split(',').map(c => c.trim()).filter(c => c);
        const keywords = keywordsText.split(',').map(k => k.trim()).filter(k => k);

        return { ...style, name, category: categories, authorPrompt: description, nsfwPrompt: nsfw, keywords };
    }
}

function buildAuthorFormContent(currentValues, settings, hasOriginal) {
    const headerContent = hasOriginal ? `
<div style="display: flex; justify-content: flex-end; margin-bottom: 12px;">
    <button id="revert_author_to_original_btn" class="menu_button" title="Reset to original" style="padding: 4px 12px; font-size: 0.9em;">
        <i class="fa-solid fa-rotate-left"></i> Revert to Original
    </button>
</div>
` : '';

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
    ${headerContent}
    ${ui.card({ id: 'edit_style_basic_info', title: 'Basic Information', icon: 'fa-solid fa-info-circle', content: basicInfoContent })}
    ${ui.card({ id: 'edit_style_description_card', title: 'Writing Style', icon: 'fa-solid fa-pen-fancy', content: styleDescriptionContent })}
    ${settings?.nsfwEnabled ? ui.card({ id: 'edit_style_nsfw_card', title: 'NSFW Guidance', icon: 'fa-solid fa-fire', content: nsfwContent }) : ''}
</div>
`;

    return $(html);
}

function bindAuthorFormEvents(content, style, toastr) {
    // Set up revert to original button if it exists
    content.find('#revert_author_to_original_btn').on('click', async function () {
        const originalStyle = getOriginalAuthorStyle(style.id);
        if (originalStyle) {
            const result = await callGenericPopup(
                `Revert "${style.name}" to its original content? Your current changes will be lost.`,
                POPUP_TYPE.CONFIRM,
                '',
                { okButton: 'Revert', cancelButton: 'Cancel' }
            );
            if (result === POPUP_RESULT.AFFIRMATIVE) {
                content.find('#edit_style_description').val(originalStyle.authorPrompt || '');
                content.find('#edit_style_nsfw').val(originalStyle.nsfwPrompt || '');
                toastr.info('Author style reverted to original. Click Save to apply changes.');
            }
        }
    });
}

export { showAuthorStyleEditForm };
