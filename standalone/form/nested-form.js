/**
 * Nested Form Component
 * Handles nested object fields like setting, protagonist_group, antagonistic_forces
 */

import { getNestedValue, setNestedValue } from '../adapters/utils-adapter.js';
import { getFieldDefinition, DROPDOWN_OPTIONS } from '../../lib/blueprint/schema.js';
import { markRequired, markOptional } from './validation.js';
import { renderDropdown } from './dropdown.js';

// ============================================================================
// NESTED FORM RENDERING
// ============================================================================

/**
 * Render a nested object field
 * @param {Object} config - Field configuration
 * @returns {jQuery} jQuery element containing the nested form
 */
export function renderNestedField(config) {
    const {
        fieldPath,
        label,
        value = {},
        required = false,
        disabled = false,
    } = config;

    const fieldDef = getFieldDefinition(fieldPath);
    if (!fieldDef || !fieldDef.nested) {
        console.warn(`[NestedForm] No nested definition found for ${fieldPath}`);
        return $('<div>').text(`Field ${fieldPath} not configured`);
    }

    const $container = $('<div>').addClass('nested-field');

    // Section header
    const $header = $('<div>').addClass('nested-field-header');
    $header.append($('<h4>').text(label));
    if (required) {
        $header.append(' <span class="badge badge-primary">Required</span>');
    } else {
        $header.append(' <span class="badge badge-secondary">Optional</span>');
    }
    $container.append($header);

    // Field grid for nested fields
    const $grid = $('<div>').addClass('form-row col-2');

    // Render each nested field
    Object.entries(fieldDef.nested).forEach(([fieldName, fieldDef]) => {
        const nestedPath = `${fieldPath}.${fieldName}`;
        const $field = renderFieldByType(nestedPath, fieldName, fieldDef, value[fieldName], {
            required: fieldDef.required,
            disabled,
        });
        $grid.append($field);
    });

    $container.append($grid);

    return $container;
}

/**
 * Render a field based on its type
 * @param {string} fullPath - Full field path
 * @param {string} fieldName - Field name
 * @param {Object} fieldDef - Field definition
 * @param {*} value - Current value
 * @param {Object} options - Additional options
 * @returns {jQuery} Field element
 */
function renderFieldByType(fullPath, fieldName, fieldDef, value, options = {}) {
    const { required = false, disabled = false } = options;
    const fieldId = fullPath.replace(/\./g, '-');

    if (fieldDef.enum) {
        // Dropdown field
        return renderDropdown({
            fieldPath: fullPath,
            label: formatLabel(fieldName),
            value,
            options: fieldDef.enum,
            required,
            disabled,
        });
    }

    switch (fieldDef.type) {
        case 'string':
            return renderStringField(fullPath, fieldName, value, {
                required,
                disabled,
                ...options,
            });
        case 'number':
            return renderNumberField(fullPath, fieldName, value, {
                required,
                disabled,
                ...options,
            });
        case 'boolean':
            return renderBooleanField(fullPath, fieldName, value, {
                disabled,
                ...options,
            });
        case 'array':
            return renderArrayField(fullPath, fieldName, value, {
                disabled,
                ...options,
            });
        default:
            return $('<div>').addClass('text-muted').text(`Type ${fieldDef.type} not implemented`);
    }
}

/**
 * Format a field name as a label
 * @param {string} fieldName - Field name (snake_case or camelCase)
 * @returns {string} Formatted label
 */
function formatLabel(fieldName) {
    return fieldName
        .replace(/_/g, ' ')
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .trim();
}

/**
 * Render a string field
 * @param {string} fieldPath - Full field path
 * @param {string} fieldName - Field name
 * @param {string} value - Field value
 * @param {Object} options - Field options
 * @returns {jQuery} Field element
 */
function renderStringField(fieldPath, fieldName, value, options = {}) {
    const { required = false, disabled = false, placeholder = '', isMultiLine = false } = options;
    const fieldId = fieldPath.replace(/\./g, '-');

    const $container = $('<div>').addClass('form-group');
    const $label = $('<label>').attr('for', fieldId).text(formatLabel(fieldName));

    if (required) markRequired($label);
    else markOptional($label);

    $container.append($label);

    const $input = $('<input>')
        .attr('type', isMultiLine ? 'textarea' : 'text')
        .attr('id', fieldId)
        .attr('name', fieldId)
        .addClass('form-control')
        .val(value || '')
        .prop('disabled', disabled)
        .attr('placeholder', placeholder)
        .data('field-path', fieldPath);

    if (fieldPath === 'core_premise') {
        $input.attr('rows', 8);
    }

    $container.append($input);
    return $container;
}

/**
 * Render a number field
 * @param {string} fieldPath - Full field path
 * @param {string} fieldName - Field name
 * @param {number} value - Field value
 * @param {Object} options - Field options
 * @returns {jQuery} Field element
 */
function renderNumberField(fieldPath, fieldName, value, options = {}) {
    const { required = false, disabled = false, min, max } = options;
    const fieldId = fieldPath.replace(/\./g, '-');

    const $container = $('<div>').addClass('form-group');
    const $label = $('<label>').attr('for', fieldId).text(formatLabel(fieldName));

    if (required) markRequired($label);
    else markOptional($label);

    $container.append($label);

    const $input = $('<input>')
        .attr('type', 'number')
        .attr('id', fieldId)
        .attr('name', fieldId)
        .addClass('form-control')
        .val(value || '')
        .prop('disabled', disabled)
        .data('field-path', fieldPath);

    if (min !== undefined) $input.attr('min', min);
    if (max !== undefined) $input.attr('max', max);

    $container.append($input);
    return $container;
}

/**
 * Render a boolean field
 * @param {string} fieldPath - Full field path
 * @param {string} fieldName - Field name
 * @param {boolean} value - Field value
 * @param {Object} options - Field options
 * @returns {jQuery} Field element
 */
function renderBooleanField(fieldPath, fieldName, value, options = {}) {
    const { disabled = false } = options;
    const fieldId = fieldPath.replace(/\./g, '-');

    const $container = $('<div>').addClass('form-check');

    const $input = $('<input>')
        .attr('type', 'checkbox')
        .attr('id', fieldId)
        .attr('name', fieldId)
        .prop('disabled', disabled)
        .prop('checked', value || false)
        .data('field-path', fieldPath);

    const $label = $('<label>')
        .attr('for', fieldId)
        .addClass('form-check-label')
        .text(formatLabel(fieldName));

    $container.append($input, $label);
    return $container;
}

/**
 * Render an array field
 * @param {string} fieldPath - Full field path
 * @param {string} fieldName - Field name
 * @param {Array} value - Field value
 * @param {Object} options - Field options
 * @returns {jQuery} Field element
 */
function renderArrayField(fieldPath, fieldName, value, options = {}) {
    const { disabled = false, placeholder = 'No items' } = options;

    const $container = $('<div>').addClass('array-field');

    const $header = $('<div>').addClass('array-field-header');
    $header.append($('<span>').text(formatLabel(fieldName)));
    $header.append(` (${value?.length || 0} items)`);
    $container.append($header);

    if (value && value.length > 0) {
        const $list = $('<div>').addClass('array-items');
        value.forEach((item, index) => {
            $list.append($('<div>').addClass('array-item').text(JSON.stringify(item)));
        });
        $container.append($list);
    } else {
        $container.append($('<div>').addClass('empty-state').text(placeholder));
    }

    return $container;
}

// ============================================================================
// NESTED VALUE EXTRACTION
// ============================================================================

/**
 * Extract values from a nested form
 * @param {jQuery} $container - Container element
 * @param {Object} fieldDef - Field definition with nested schema
 * @returns {Object} Extracted nested object
 */
export function extractNestedValues($container, fieldDef) {
    const result = {};

    Object.entries(fieldDef.nested).forEach(([fieldName, nestedDef]) => {
        const $field = $container.find(`[name="${fieldName}"]`);
        const value = extractFieldValue($field, nestedDef);

        if (nestedDef.type === 'array' && !Array.isArray(value)) {
            // Handle arrays that return as comma-separated strings
            result[fieldName] = value ? value.split(',').map(v => v.trim()) : [];
        } else {
            result[fieldName] = value;
        }
    });

    return result;
}

/**
 * Extract value from a form field based on its type
 * @param {jQuery} $field - Field element
 * @param {Object} fieldDef - Field definition
 * @returns {*} Extracted value
 */
function extractFieldValue($field, fieldDef) {
    if ($field.length === 0) return null;

    switch (fieldDef.type) {
        case 'string':
            return $field.val();
        case 'number':
            return Number($field.val()) || 0;
        case 'boolean':
            return $field.prop('checked');
        case 'array':
            return $field.val(); // Arrays need special handling
        default:
            return $field.val();
    }
}

// ============================================================================
// EXPORT FOR DEBUGGING
// ============================================================================

if (typeof window !== 'undefined') {
    window.StoryModeNestedForm = {
        renderNestedField,
        renderFieldByType,
        extractNestedValues,
        formatLabel,
    };
}
