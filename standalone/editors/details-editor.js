/**
 * Details Editor Module
 * Orchestrates the Details tab using form components
 */

import {
    renderCoreIdentitySection,
    renderNarrativeStructureSection,
    renderStoryContentSection,
    renderCharacterArcsSection,
    renderContentBoundariesSection,
    renderGenreMetadataSection,
} from './details-section-renderers.js';
import { extractNestedValues } from '../form/nested-form.js';
import { BLUEPRINT_FIELDS } from '../../lib/blueprint/schema.js';
import { extractFieldValue, setNestedValue } from './details-field-renderers.js';
import { validateField } from '../../lib/blueprint/schema.js';
import { clearValidationErrors } from '../form/validation.js';

// ============================================================================
// DETAILS TAB RENDERING
// ============================================================================

/**
 * Render the Details tab content
 * @param {Object} blueprint - Blueprint object
 * @param {Object} options - Options object
 * @returns {jQuery} Details tab content
 */
export function renderDetailsTab(blueprint, options = {}) {
    const { storyTypes = [], authorStyles = [], readonly = false } = options;

    const $content = $('<div>').addClass('details-editor');

    // Section: Core Identity
    $content.append(renderCoreIdentitySection(blueprint, storyTypes, authorStyles, readonly));

    // Section: Narrative Structure
    $content.append(renderNarrativeStructureSection(blueprint, readonly));

    // Section: Story Content
    $content.append(renderStoryContentSection(blueprint, readonly));

    // Section: Character Arcs
    $content.append(renderCharacterArcsSection(blueprint, readonly));

    // Section: Content Boundaries
    $content.append(renderContentBoundariesSection(blueprint, readonly));

    // Section: Genre Metadata
    $content.append(renderGenreMetadataSection(blueprint, readonly));

    // Bind field change events for validation
    bindFieldValidation($content);

    return $content;
}

// ============================================================================
// VALUE EXTRACTION
// ============================================================================

/**
 * Extract values from the Details tab
 * @param {jQuery} $content - Details tab content
 * @returns {Object} Extracted blueprint data
 */
export function extractDetailsValues($content) {
    const result = {};

    // Simple fields
    $content.find('[data-field-path]').each(function() {
        const $field = $(this);
        const path = $field.data('field-path');

        // Skip nested fields (handled separately)
        if (path.includes('.')) return;

        const value = extractFieldValue($field);
        setNestedValue(result, path, value);
    });

    // Nested fields
    const nestedPaths = ['setting', 'protagonist_group', 'antagonistic_forces', 'content_boundaries', 'genre_realism_notes'];
    nestedPaths.forEach(path => {
        const $container = $content.find(`.nested-field`).filter(function() {
            return $(this).find(`[data-field-path="${path}"]`).length > 0;
        });

        if ($container.length) {
            const fieldDef = BLUEPRINT_FIELDS[path] || { nested: {} };
            result[path] = extractNestedValues($container, fieldDef);
        }
    });

    return result;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Bind field validation events
 * @param {jQuery} $content - Details tab content
 */
function bindFieldValidation($content) {
    $content.on('input.details-editor', '[data-field-path]', function() {
        const $field = $(this);
        const path = $field.data('field-path');
        const value = extractFieldValue($field);

        // Clear error on input
        $field.removeClass('error');
        $field.next('.validation-message.error').remove();

        // Validate on blur
        $field.one('blur.details-editor', function() {
            validateField(path, value, $field);
        });
    });
}

/**
 * Validate all fields in Details tab
 * @param {jQuery} $content - Details tab content
 * @returns {boolean} True if all valid
 */
export function validateDetailsTab($content) {
    clearValidationErrors();
    let allValid = true;

    $content.find('[data-field-path]').each(function() {
        const $field = $(this);
        const path = $field.data('field-path');
        const value = extractFieldValue($field);

        if (!validateField(path, value, $field)) {
            allValid = false;
        }
    });

    return allValid;
}

// ============================================================================
// EXPORT FOR DEBUGGING
// ============================================================================

if (typeof window !== 'undefined') {
    window.StoryModeDetailsEditor = {
        renderDetailsTab,
        extractDetailsValues,
        validateDetailsTab,
    };
}
