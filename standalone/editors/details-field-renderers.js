/**
 * Details Field Renderers Module
 * Helper functions for rendering individual field types in the Details tab
 */

import { renderDropdown } from '../form/dropdown.js';

// ============================================================================
// STRING FIELD RENDERER
// ============================================================================

/**
 * Render a string field
 * @param {string} fieldPath - Field path
 * @param {string} label - Field label
 * @param {string} value - Field value
 * @param {Object} options - Field options
 * @returns {jQuery} Field element
 */
export function renderStringField(fieldPath, label, value, options = {}) {
    const { required = false, readonly = false, isMultiLine = false, rows = 3, placeholder = '' } = options;
    const fieldId = fieldPath.replace(/\./g, '-');

    const $container = $('<div>').addClass('form-group');
    const $label = $('<label>').attr('for', fieldId).text(label);

    if (required) $label.append(' <span class="required">*</span>');

    $container.append($label);

    let $input;
    if (isMultiLine) {
        $input = $('<textarea>')
            .attr('id', fieldId)
            .attr('name', fieldId)
            .addClass('form-control')
            .attr('rows', rows)
            .val(value || '')
            .prop('disabled', readonly)
            .attr('placeholder', placeholder)
            .data('field-path', fieldPath);
    } else {
        $input = $('<input>')
            .attr('type', 'text')
            .attr('id', fieldId)
            .attr('name', fieldId)
            .addClass('form-control')
            .val(value || '')
            .prop('disabled', readonly)
            .attr('placeholder', placeholder)
            .data('field-path', fieldPath);
    }

    $container.append($input);
    return $container;
}

// ============================================================================
// NUMBER FIELD RENDERER
// ============================================================================

/**
 * Render a number field
 * @param {string} fieldPath - Field path
 * @param {string} label - Field label
 * @param {number} value - Field value
 * @param {Object} options - Field options
 * @returns {jQuery} Field element
 */
export function renderNumberField(fieldPath, label, value, options = {}) {
    const { required = false, readonly = false, min, max } = options;
    const fieldId = fieldPath.replace(/\./g, '-');

    const $container = $('<div>').addClass('form-group');
    const $label = $('<label>').attr('for', fieldId).text(label);

    if (required) $label.append(' <span class="required">*</span>');

    $container.append($label);

    const $input = $('<input>')
        .attr('type', 'number')
        .attr('id', fieldId)
        .attr('name', fieldId)
        .addClass('form-control')
        .val(value || '')
        .prop('disabled', readonly)
        .data('field-path', fieldPath);

    if (min !== undefined) $input.attr('min', min);
    if (max !== undefined) $input.attr('max', max);

    $container.append($input);
    return $container;
}

// ============================================================================
// DROPDOWN FIELD RENDERER
// ============================================================================

/**
 * Render a dropdown field
 * @param {string} fieldPath - Field path
 * @param {string} label - Field label
 * @param {string} value - Field value
 * @param {Array} optionsArray - Array of option objects with value/label
 * @param {Object} fieldOptions - Field options
 * @returns {jQuery} Field element
 */
export function renderDropdownField(fieldPath, label, value, optionsArray, fieldOptions = {}) {
    const { required = false, readonly = false } = fieldOptions;

    return renderDropdown({
        fieldPath,
        label,
        value,
        options: optionsArray,
        required,
        disabled: readonly,
    });
}

// ============================================================================
// FIELD VALUE EXTRACTION
// ============================================================================

/**
 * Extract value from a field element
 * @param {jQuery} $field - Field element
 * @returns {*} Field value
 */
export function extractFieldValue($field) {
    if ($field.is('input[type="text"], textarea')) {
        return $field.val();
    } else if ($field.is('input[type="number"]')) {
        return Number($field.val()) || 0;
    } else if ($field.is('input[type="checkbox"]')) {
        return $field.prop('checked');
    } else if ($field.is('select')) {
        return $field.val();
    }
    return $field.val();
}

// ============================================================================
// NESTED VALUE HELPER
// ============================================================================

/**
 * Set a nested value by path
 * @param {Object} obj - Target object
 * @param {string} path - Dot-separated path
 * @param {*} value - Value to set
 */
export function setNestedValue(obj, path, value) {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
        if (!(keys[i] in current)) {
            current[keys[i]] = {};
        }
        current = current[keys[i]];
    }

    current[keys[keys.length - 1]] = value;
}
