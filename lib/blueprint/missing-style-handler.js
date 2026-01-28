/**
 * Missing Style Handler Module
 *
 * Handles the case where a blueprint references story types or author styles
 * that are not embedded in the blueprint and don't exist in the user's library.
 * Provides a graceful fallback to create them manually with prefilled IDs.
 */

import { Popup, POPUP_TYPE } from '/scripts/popup.js';
import {
    getStoryTypes,
    setStoryTypes,
    getAuthorStyles,
    setAuthorStyles,
    saveStoryTypesToStorage,
    saveAuthorStylesToStorage,
} from '../core/state-manager.js';
import { showStoryTypeEditForm, showAuthorStyleEditForm } from '../editor/type-editors.js';
import { escapeHtml } from './utils.js';
import { buildStoryTypeFromInlineFields, buildAuthorStyleFromInlineFields } from './resource-utils.js';

/**
 * Create a default template for a missing style
 * @param {string} type - 'storyType' or 'authorStyle'
 * @param {string} id - The style ID from the blueprint
 * @param {string} name - Optional name hint from the blueprint
 * @returns {Object} Style template
 */
function createStyleTemplate(type, id, name = '') {
    if (type === 'storyType') {
        return {
            id,
            name: name || `New Story Type (${id})`,
            category: ['Custom', 'Imported'],
            storyPrompt: '',
            progressTemplate: 'Arc Progress: Step {currentStep}/{arcLength} ({arcPercent}% complete). Phase: {phase} - Message {positionInPhase}/{totalInPhase} ({phasePercent}% through {phase}).',
            phasePrompts: { setup: '', confrontation: '', resolution: '' },
            memorableElement: null,
        };
    }
    return {
        id,
        name: name || `New Author Style (${id})`,
        category: ['Custom', 'Imported'],
        authorPrompt: '',
        nsfwPrompt: '',
        keywords: [],
    };
}

/**
 * Show a warning dialog when a style is missing and not embedded
 * @param {string} type - 'storyType' or 'authorStyle'
 * @param {string} styleId - The missing style ID
 * @param {string} styleName - The style name (if known)
 * @returns {Promise<boolean>} True if user wants to create manually
 */
async function showMissingStyleWarning(type, styleId, styleName) {
    const isStoryType = type === 'storyType';
    const typeLabel = isStoryType ? 'Story Type' : 'Author Style';
    const typeLabelLower = isStoryType ? 'story type' : 'author style';
    const icon = isStoryType ? 'fa-book' : 'fa-feather';

    const displayName = styleName || styleId;

    const html = `
        <div class="storymode-missing-style-warning" style="text-align: left;">
            <div style="display: flex; align-items: flex-start; gap: 16px; margin-bottom: 16px;">
                <div style="font-size: 2em; color: var(--SmartThemeWarningColor);">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                </div>
                <div>
                    <h3 style="margin: 0 0 8px 0;">${typeLabel} Not Embedded</h3>
                    <p style="margin: 0; opacity: 0.9;">
                        This blueprint references a ${typeLabelLower} that was <strong>not embedded</strong> when the blueprint was created.
                    </p>
                </div>
            </div>

            <div style="background: var(--SmartThemeBlurTintColor); padding: 12px; border-radius: 8px; margin-bottom: 16px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i class="fa-solid ${icon}" style="font-size: 1.3em; color: var(--SmartThemeEmColor);"></i>
                    <div>
                        <div style="font-weight: bold;">${escapeHtml(displayName)}</div>
                        <div style="font-size: 0.85em; opacity: 0.7;">ID: ${escapeHtml(styleId)}</div>
                    </div>
                </div>
            </div>

            <div style="background: rgba(255, 193, 7, 0.1); border: 1px solid rgba(255, 193, 7, 0.3); padding: 12px; border-radius: 8px; margin-bottom: 16px;">
                <p style="margin: 0; font-size: 0.9em;">
                    <strong>What happened?</strong><br>
                    The blueprint creator may have chosen not to embed this ${typeLabelLower},
                    or it may have been removed. Without the embedded data, the full definition cannot be imported automatically.
                </p>
            </div>

            <p style="margin-bottom: 8px;">Would you like to <strong>create this ${typeLabelLower} manually</strong>?</p>
            <p style="font-size: 0.85em; opacity: 0.8;">
                The ID will be prefilled so it matches the blueprint reference.
                You'll need to provide the name and description.
            </p>
        </div>
    `;

    const popup = new Popup($(html), POPUP_TYPE.CONFIRM, 'Missing Style Data', {
        okButton: 'Create Manually',
        cancelButton: 'Skip',
        wide: true,
    });

    return await popup.show();
}

/**
 * Handle adding a missing story type when no embedded data is available
 * @param {string} styleId - The missing style ID from the blueprint
 * @param {string} styleName - Optional name hint
 * @param {Object} inlineData - Optional inline data from blueprint to prefill form
 * @returns {Promise<boolean>} True if style was created
 */
export async function handleMissingStoryType(styleId, styleName = '', inlineData = null) {
    // Check if it already exists (race condition guard)
    const existing = getStoryTypes().find(s => s.id === styleId);
    if (existing) {
        toastr.info('This story type already exists in your library');
        return false;
    }

    // Show warning and ask for confirmation
    const confirmed = await showMissingStyleWarning('storyType', styleId, styleName);
    if (!confirmed) {
        return false;
    }

    // Create template with prefilled ID and name
    const template = createStyleTemplate('storyType', styleId, styleName);

    // Prefill with inline data from blueprint if available
    if (inlineData) {
        if (inlineData.storyPrompt) template.storyPrompt = inlineData.storyPrompt;
        if (inlineData.progressTemplate) template.progressTemplate = inlineData.progressTemplate;
        if (inlineData.phasePrompts) template.phasePrompts = { ...template.phasePrompts, ...inlineData.phasePrompts };
        if (inlineData.category) template.category = inlineData.category;
        if (inlineData.memorableElement) template.memorableElement = inlineData.memorableElement;
    }

    // Show edit form
    const result = await showStoryTypeEditForm(template, true);

    if (result) {
        const { storyType } = result;
        const storyTypes = getStoryTypes();
        storyTypes.push(storyType);
        setStoryTypes(storyTypes);
        await saveStoryTypesToStorage();

        toastr.success(`Created story type "${storyType.name}"`);

        // Update dropdown if available
        if (window.updateStoryTypeDropdown) {
            window.updateStoryTypeDropdown();
        }

        return true;
    }

    return false;
}

/**
 * Handle adding a missing author style when no embedded data is available
 * @param {string} styleId - The missing style ID from the blueprint
 * @param {string} styleName - Optional name hint
 * @param {Object} inlineData - Optional inline data from blueprint to prefill form
 * @returns {Promise<boolean>} True if style was created
 */
export async function handleMissingAuthorStyle(styleId, styleName = '', inlineData = null) {
    // Check if it already exists (race condition guard)
    const existing = getAuthorStyles().find(s => s.id === styleId);
    if (existing) {
        toastr.info('This author style already exists in your library');
        return false;
    }

    // Show warning and ask for confirmation
    const confirmed = await showMissingStyleWarning('authorStyle', styleId, styleName);
    if (!confirmed) {
        return false;
    }

    // Create template with prefilled ID and name
    const template = createStyleTemplate('authorStyle', styleId, styleName);

    // Prefill with inline data from blueprint if available
    if (inlineData) {
        if (inlineData.authorPrompt) template.authorPrompt = inlineData.authorPrompt;
        if (inlineData.nsfwPrompt) template.nsfwPrompt = inlineData.nsfwPrompt;
        if (inlineData.keywords) template.keywords = inlineData.keywords;
        if (inlineData.category) template.category = inlineData.category;
    }

    // Show edit form
    const result = await showAuthorStyleEditForm(template, true);

    if (result) {
        const authorStyles = getAuthorStyles();
        authorStyles.push(result);
        setAuthorStyles(authorStyles);
        await saveAuthorStylesToStorage();

        toastr.success(`Created author style "${result.name}"`);

        // Update dropdown if available
        if (window.updateAuthorStyleDropdown) {
            window.updateAuthorStyleDropdown();
        }

        return true;
    }

    return false;
}

/**
 * Extract all available style data from a blueprint for a given style type.
 * Resolves embedded data, inline fields, effective ID and name in one place.
 *
 * @param {Object} blueprint - The blueprint object
 * @param {string} type - 'storyType' or 'authorStyle'
 * @returns {{styleId: string, styleName: string, embeddedData: Object|null, inlineData: Object|null}}
 */
export function prepareMissingStyleData(blueprint, type) {
    const isStoryType = type === 'storyType';

    const styleId = isStoryType ? blueprint.story_type_id : blueprint.author_style;
    const styleName = isStoryType ? (blueprint.story_type_name || '') : (blueprint.author_style_name || '');
    const embeddedData = blueprint.embeddedResources?.[type] || null;

    // Build inline data from blueprint fields (tier 2 fallback)
    let inlineData = null;
    if (isStoryType && (blueprint.story_type_prompt || blueprint.story_type_name)) {
        inlineData = buildStoryTypeFromInlineFields(blueprint);
    } else if (!isStoryType && (blueprint.author_style_prompt || blueprint.author_style_name)) {
        inlineData = buildAuthorStyleFromInlineFields(blueprint);
    }

    return { styleId, styleName, embeddedData, inlineData };
}

/**
 * One-call helper: extract data from a blueprint and handle a missing style.
 * Combines prepareMissingStyleData + handleMissingStyle so callers don't need
 * to manually extract embedded/inline data from the blueprint.
 *
 * @param {Object} blueprint - The blueprint object
 * @param {string} type - 'storyType' or 'authorStyle'
 * @returns {Promise<boolean>} True if style was created/imported
 */
export async function resolveAndHandleMissingStyle(blueprint, type) {
    const { styleId, styleName, embeddedData, inlineData } = prepareMissingStyleData(blueprint, type);
    if (!styleId) return false;
    return handleMissingStyle(type, styleId, styleName, embeddedData, inlineData);
}

/**
 * Handle adding a missing style (story type or author style)
 * This is the main entry point that dispatches to the appropriate handler.
 *
 * @param {string} type - 'storyType' or 'authorStyle'
 * @param {string} styleId - The missing style ID from the blueprint
 * @param {string} styleName - Optional name hint
 * @param {Object} embeddedData - Embedded style data (may be null)
 * @param {Object} inlineData - Inline data from blueprint for prefilling form (may be null)
 * @returns {Promise<boolean>} True if style was created/imported
 */
export async function handleMissingStyle(type, styleId, styleName = '', embeddedData = null, inlineData = null) {
    const isStoryType = type === 'storyType';

    // If we have embedded data, use the quick import path
    if (embeddedData) {
        return await handleEmbeddedStyleImport(type, embeddedData);
    }

    // No embedded data - offer manual creation (with optional inline data for prefilling)
    if (isStoryType) {
        return await handleMissingStoryType(styleId, styleName, inlineData);
    } else {
        return await handleMissingAuthorStyle(styleId, styleName, inlineData);
    }
}

/**
 * Import an embedded style directly (existing functionality, extracted for clarity)
 * @param {string} type - 'storyType' or 'authorStyle'
 * @param {Object} embeddedData - The embedded style data
 * @returns {Promise<boolean>} True if imported
 */
async function handleEmbeddedStyleImport(type, embeddedData) {
    const isStoryType = type === 'storyType';
    const styles = isStoryType ? getStoryTypes() : getAuthorStyles();

    // Check if already exists
    const existing = styles.find(s => s.id === embeddedData.id);
    if (existing) {
        toastr.info(`This ${isStoryType ? 'story type' : 'author style'} already exists in your library`);
        return false;
    }

    // Add to library
    styles.push(embeddedData);

    if (isStoryType) {
        setStoryTypes(styles);
        await saveStoryTypesToStorage();
        if (window.updateStoryTypeDropdown) window.updateStoryTypeDropdown();
    } else {
        setAuthorStyles(styles);
        await saveAuthorStylesToStorage();
        if (window.updateAuthorStyleDropdown) window.updateAuthorStyleDropdown();
    }

    toastr.success(`Added "${embeddedData.name}" to your ${isStoryType ? 'Story Types' : 'Author Styles'} library`);
    return true;
}

/**
 * Handle multiple missing styles in succession.
 * When a blueprint is provided, uses resolveAndHandleMissingStyle for full
 * data extraction (embedded + inline). Falls back to basic handleMissingStyle
 * when only missingStyles metadata is available.
 *
 * @param {Object} missingStyles - {storyType: {id, name, embedded}, authorStyle: {id, name, embedded}}
 * @param {Object} [blueprint] - The blueprint object (enables inline data extraction)
 * @returns {Promise<{storyTypeCreated: boolean, authorStyleCreated: boolean}>}
 */
export async function handleMultipleMissingStyles(missingStyles, blueprint = null) {
    const results = { storyTypeCreated: false, authorStyleCreated: false };

    if (missingStyles.storyType) {
        results.storyTypeCreated = blueprint
            ? await resolveAndHandleMissingStyle(blueprint, 'storyType')
            : await handleMissingStyle('storyType', missingStyles.storyType.id, missingStyles.storyType.name, missingStyles.storyType.embedded);
    }

    if (missingStyles.authorStyle) {
        results.authorStyleCreated = blueprint
            ? await resolveAndHandleMissingStyle(blueprint, 'authorStyle')
            : await handleMissingStyle('authorStyle', missingStyles.authorStyle.id, missingStyles.authorStyle.name, missingStyles.authorStyle.embedded);
    }

    return results;
}

/**
 * Check if a style is missing from the library
 * @param {string} type - 'storyType' or 'authorStyle'
 * @param {string} styleId - The style ID to check
 * @returns {boolean} True if missing
 */
export function isStyleMissing(type, styleId) {
    if (!styleId) return false;

    const styles = type === 'storyType' ? getStoryTypes() : getAuthorStyles();
    return !styles.some(s => s.id === styleId);
}

/**
 * Get missing style info from a blueprint
 * @param {Object} blueprint - The blueprint object
 * @returns {{storyType: Object|null, authorStyle: Object|null}} Missing style info
 */
export function getMissingStylesFromBlueprint(blueprint) {
    const result = { storyType: null, authorStyle: null };
    const storyTypeId = blueprint.story_type_id;
    const authorStyleId = blueprint.author_style;

    if (storyTypeId && isStyleMissing('storyType', storyTypeId)) {
        result.storyType = {
            id: storyTypeId,
            name: blueprint.story_type_name || '',
            embedded: blueprint.embeddedResources?.storyType || null,
        };
    }

    if (authorStyleId && isStyleMissing('authorStyle', authorStyleId)) {
        result.authorStyle = {
            id: authorStyleId,
            name: blueprint.author_style_name || '',
            embedded: blueprint.embeddedResources?.authorStyle || null,
        };
    }

    return result;
}
