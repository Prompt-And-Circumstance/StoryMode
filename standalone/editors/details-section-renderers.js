/**
 * Details Section Renderers Module
 * Functions for rendering each collapsible section in the Details tab
 */

import { renderCollapsible } from '../form/collapsible.js';
import { renderNestedField } from '../form/nested-form.js';
import { renderStringField, renderNumberField, renderDropdownField } from './details-field-renderers.js';

// ============================================================================
// SECTION RENDERERS
// ============================================================================

/**
 * Render Core Identity section
 * @param {Object} blueprint - Blueprint object
 * @param {Array} storyTypes - Available story types
 * @param {Array} authorStyles - Available author styles
 * @param {boolean} readonly - Whether fields are readonly
 * @returns {jQuery} Section element
 */
export function renderCoreIdentitySection(blueprint, storyTypes, authorStyles, readonly) {
    const $section = renderCollapsible({
        id: 'details-core-identity',
        title: 'Core Identity',
        icon: 'fa-solid fa-fingerprint',
        expanded: true,
    });

    const $grid = $('<div>').addClass('form-row col-2');

    // Title
    $grid.append(renderStringField('title', 'Title', blueprint.title, { required: true, readonly }));

    // Story Type
    if (storyTypes.length > 0) {
        const typeOptions = storyTypes.map(t => ({ value: t.story_type_id, label: t.name }));
        $grid.append(renderDropdownField('story_type_id', 'Story Type', blueprint.story_type_id, typeOptions, {
            required: true,
            readonly,
        }));
    }

    // Author Style
    if (authorStyles.length > 0) {
        const styleOptions = authorStyles.map(s => ({ value: s.id, label: s.name }));
        $grid.append(renderDropdownField('author_style_id', 'Author Style', blueprint.author_style_id, styleOptions, {
            required: false,
            readonly,
        }));
    }

    $section.find('.collapsible-content').append($grid);
    return $section;
}

/**
 * Render Narrative Structure section
 * @param {Object} blueprint - Blueprint object
 * @param {boolean} readonly - Whether fields are readonly
 * @returns {jQuery} Section element
 */
export function renderNarrativeStructureSection(blueprint, readonly) {
    const $section = renderCollapsible({
        id: 'details-narrative-structure',
        title: 'Narrative Structure',
        icon: 'fa-solid fa-sitemap',
        expanded: false,
    });

    const $grid = $('<div>').addClass('form-row col-2');

    // Arc Length
    $grid.append(renderNumberField('arc_length', 'Arc Length (Rounds)', blueprint.arc_length, {
        required: true,
        min: 1,
        max: 100,
        readonly,
    }));

    // Scene Count (if scenario mode)
    const sceneCount = blueprint.scenes?.length || 0;
    $grid.append(renderNumberField('scene_count', 'Scene Count', sceneCount, { readonly: true }));

    // Core Premise (full width)
    $grid.append(renderStringField('core_premise', 'Core Premise', blueprint.core_premise, {
        required: true,
        isMultiLine: true,
        rows: 6,
        readonly,
    }));

    $section.find('.collapsible-content').append($grid);
    return $section;
}

/**
 * Render Story Content section
 * @param {Object} blueprint - Blueprint object
 * @param {boolean} readonly - Whether fields are readonly
 * @returns {jQuery} Section element
 */
export function renderStoryContentSection(blueprint, readonly) {
    const $section = renderCollapsible({
        id: 'details-story-content',
        title: 'Story Content',
        icon: 'fa-solid fa-book-open',
        expanded: false,
    });

    const $content = $section.find('.collapsible-content');

    // Setting (nested)
    $content.append(renderNestedField({
        fieldPath: 'setting',
        label: 'Setting',
        value: blueprint.setting || {},
        required: true,
        disabled: readonly,
    }));

    // Protagonist Group (nested)
    $content.append(renderNestedField({
        fieldPath: 'protagonist_group',
        label: 'Protagonist Group',
        value: blueprint.protagonist_group || {},
        required: true,
        disabled: readonly,
    }));

    // Antagonistic Forces (nested)
    $content.append(renderNestedField({
        fieldPath: 'antagonistic_forces',
        label: 'Antagonistic Forces',
        value: blueprint.antagonistic_forces || {},
        required: false,
        disabled: readonly,
    }));

    return $section;
}

/**
 * Render Character Arcs section
 * @param {Object} blueprint - Blueprint object
 * @param {boolean} readonly - Whether fields are readonly
 * @returns {jQuery} Section element
 */
export function renderCharacterArcsSection(blueprint, readonly) {
    const $section = renderCollapsible({
        id: 'details-character-arcs',
        title: 'Character Arcs',
        icon: 'fa-solid fa-users',
        expanded: false,
    });

    const $content = $section.find('.collapsible-content');

    // Character arcs is an array, show summary for now
    const arcCount = blueprint.character_arcs?.length || 0;
    const $summary = $('<div>').addClass('form-group');
    $summary.append($('<label>').text('Character Arcs'));
    $summary.append($('<div>').addClass('text-muted').text(
        arcCount > 0
            ? `${arcCount} character arc(s) defined. Use the Character Arcs tab to manage.`
            : 'No character arcs defined. Use the Character Arcs tab to add them.'
    ));
    $content.append($summary);

    return $section;
}

/**
 * Render Content Boundaries section
 * @param {Object} blueprint - Blueprint object
 * @param {boolean} readonly - Whether fields are readonly
 * @returns {jQuery} Section element
 */
export function renderContentBoundariesSection(blueprint, readonly) {
    const $section = renderCollapsible({
        id: 'details-content-boundaries',
        title: 'Content Boundaries',
        icon: 'fa-solid fa-shield-halved',
        expanded: false,
    });

    // Content Boundaries (nested)
    const $nested = renderNestedField({
        fieldPath: 'content_boundaries',
        label: 'Content Boundaries',
        value: blueprint.content_boundaries || {},
        required: false,
        disabled: readonly,
    });

    $section.find('.collapsible-content').append($nested);
    return $section;
}

/**
 * Render Genre Metadata section
 * @param {Object} blueprint - Blueprint object
 * @param {boolean} readonly - Whether fields are readonly
 * @returns {jQuery} Section element
 */
export function renderGenreMetadataSection(blueprint, readonly) {
    const $section = renderCollapsible({
        id: 'details-genre-metadata',
        title: 'Genre Metadata',
        icon: 'fa-solid fa-tags',
        expanded: false,
    });

    // Genre Realism Notes (nested)
    const $nested = renderNestedField({
        fieldPath: 'genre_realism_notes',
        label: 'Genre Realism Notes',
        value: blueprint.genre_realism_notes || {},
        required: false,
        disabled: readonly,
    });

    $section.find('.collapsible-content').append($nested);
    return $section;
}
