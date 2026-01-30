/**
 * Dropdown Component
 * Enum dropdown fields with label, options array, and validation support
 */

import { DROPDOWN_OPTIONS } from '../../lib/blueprint/schema.js';
import { markRequired, markOptional } from './validation.js';

// ============================================================================
// DROPDOWN RENDERING
// ============================================================================

/**
 * Render a dropdown field
 * @param {Object} config - Dropdown configuration
 * @returns {jQuery} jQuery element containing the dropdown
 */
export function renderDropdown(config) {
    const {
        fieldPath,
        label,
        value,
        options = [],
        required = false,
        placeholder = 'Select...',
        disabled = false,
        description = null,
    } = config;

    // Get options from DROPDOWN_OPTIONS if a key is provided
    let dropdownOptions = options;
    if (typeof options === 'string' && DROPDOWN_OPTIONS[options]) {
        dropdownOptions = DROPDOWN_OPTIONS[options];
    }

    const fieldId = fieldPath.replace(/\./g, '-');
    const $container = $('<div>').addClass('form-group');

    // Build label
    const $label = $('<label>').attr('for', fieldId).text(label);
    if (required) {
        markRequired($label);
    } else {
        markOptional($label);
    }
    $container.append($label);

    // Build select
    const $select = $('<select>')
        .attr('id', fieldId)
        .attr('name', fieldId)
        .addClass('form-control')
        .prop('disabled', disabled);

    // Add placeholder option if specified
    if (placeholder) {
        $select.append($('<option>').attr('value', '').text(placeholder));
    }

    // Add options
    dropdownOptions.forEach(opt => {
        const optValue = typeof opt === 'string' ? opt : opt.value;
        const optLabel = typeof opt === 'string' ? opt : opt.label;
        $select.append($('<option>').attr('value', optValue).text(optLabel));
    });

    // Set selected value
    if (value !== undefined && value !== null && value !== '') {
        $select.val(value);
    }

    $container.append($select);

    // Add field hint if description provided
    if (description) {
        const $hint = $('<div>').addClass('field-hint').text(description);
        $container.append($hint);
    }

    // Store field path for validation
    $select.data('field-path', fieldPath);

    return $container;
}

/**
 * Create a dropdown for story type selection
 * @param {string} fieldPath - Field path
 * @param {string} label - Field label
 * @param {string} value - Current value
 * @param {Array} availableTypes - Available story types
 * @returns {jQuery} Dropdown element
 */
export function renderStoryTypeDropdown(fieldPath, label, value, availableTypes) {
    const options = availableTypes.map(type => ({
        value: type.story_type_id,
        label: type.name,
    }));

    return renderDropdown({
        fieldPath,
        label,
        value,
        options,
        required: true,
    });
}

/**
 * Create a dropdown for author style selection
 * @param {string} fieldPath - Field path
 * @param {string} label - Field label
 * @param {string} value - Current value
 * @param {Array} availableStyles - Available author styles
 * @returns {jQuery} Dropdown element
 */
export function renderAuthorStyleDropdown(fieldPath, label, value, availableStyles) {
    const options = availableStyles.map(style => ({
        value: style.id,
        label: style.name,
    }));

    return renderDropdown({
        fieldPath,
        label,
        value,
        options,
        required: false,
    });
}

// ============================================================================
// DROPDOWN OPTIONS FROM SCHEMA
// ============================================================================

/**
 * Get dropdown options for a field path
 * @param {string} fieldPath - Dot-separated field path
 * @returns {Array|null} Array of options or null
 */
export function getFieldDropdownOptions(fieldPath) {
    // Map field paths to dropdown option keys
    const optionMap = {
        'antagonistic_forces.nature': 'antagonistNature',
        'genre_realism_notes.metaphor_level_used': 'metaphorLevel',
        'content_boundaries.violence_level': 'violenceLevel',
        'content_boundaries.romance_level': 'romanceLevel',
    };

    const optionKey = optionMap[fieldPath];
    return DROPDOWN_OPTIONS[optionKey] || null;
}

/**
 * Check if a field should be rendered as a dropdown
 * @param {string} fieldPath - Dot-separated field path
 * @returns {boolean} True if field has dropdown options
 */
export function isDropdownField(fieldPath) {
    return getFieldDropdownOptions(fieldPath) !== null;
}

// ============================================================================
// EXPORT FOR DEBUGGING
// ============================================================================

if (typeof window !== 'undefined') {
    window.StoryModeForm = {
        renderDropdown,
        renderStoryTypeDropdown,
        renderAuthorStyleDropdown,
        getFieldDropdownOptions,
        isDropdownField,
    };
}
