/**
 * Field Validation Module
 * Schema-based validation with error display for blueprint form fields
 */

import { validateField as validateSchemaField, isFieldRequired } from '../../lib/blueprint/schema.js';

// ============================================================================
// VALIDATION STATE
// ============================================================================

/**
 * Validation error storage
 * Map of field path -> array of error messages
 */
const validationErrors = new Map();

/**
 * Get all validation errors
 * @returns {Object} Object with field paths as keys and error arrays as values
 */
export function getValidationErrors() {
    return Object.fromEntries(validationErrors);
}

/**
 * Clear all validation errors
 */
export function clearValidationErrors() {
    validationErrors.clear();
    $(document).trigger('validation:cleared');
}

/**
 * Clear validation error for a specific field
 * @param {string} fieldPath - Field path to clear
 */
export function clearFieldError(fieldPath) {
    validationErrors.delete(fieldPath);
    $(document).trigger('validation:cleared', { fieldPath });
}

/**
 * Check if there are any validation errors
 * @returns {boolean} True if errors exist
 */
export function hasErrors() {
    return validationErrors.size > 0;
}

/**
 * Get the number of fields with errors
 * @returns {number} Number of fields with errors
 */
export function getErrorCount() {
    return validationErrors.size;
}

// ============================================================================
// FIELD VALIDATION
// ============================================================================

/**
 * Validate a single field and update UI
 * @param {string} fieldPath - Dot-separated field path
 * @param {*} value - Value to validate
 * @param {jQuery} $field - Optional jQuery element for the field
 * @returns {boolean} True if valid
 */
export function validateField(fieldPath, value, $field = null) {
    const result = validateSchemaField(fieldPath, value);

    if (result.valid) {
        clearFieldError(fieldPath);
        if ($field) clearFieldErrorUI($field);
    } else {
        validationErrors.set(fieldPath, result.errors);
        if ($field) showFieldErrors($field, result.errors);
    }

    $(document).trigger('validation:field-validated', { fieldPath, valid: result.valid });
    return result.valid;
}

/**
 * Validate multiple fields
 * @param {Object} fields - Object with field paths as keys and values as values
 * @returns {boolean} True if all fields are valid
 */
export function validateFields(fields) {
    clearValidationErrors();
    let allValid = true;

    for (const [fieldPath, value] of Object.entries(fields)) {
        const result = validateField(fieldPath, value);
        if (!result.valid) {
            validationErrors.set(fieldPath, result.errors);
            allValid = false;
        }
    }

    $(document).trigger('validation:fields-validated', { valid: allValid });
    return allValid;
}

// ============================================================================
// UI ERROR DISPLAY
// ============================================================================

/**
 * Show validation errors on a field element
 * @param {jQuery} $field - Field element
 * @param {Array<string>} errors - Array of error messages
 */
function showFieldErrors($field, errors) {
    // Remove existing error message
    $field.next('.validation-message').remove();

    // Add error class
    $field.addClass('error');

    // Create error message element
    const $container = $('<div>').addClass('validation-message error');
    errors.forEach(error => {
        $container.append($('<div>').text(error));
    });

    // Insert after field
    $field.after($container);
}

/**
 * Clear field error UI
 * @param {jQuery} $field - Field element
 */
function clearFieldErrorUI($field) {
    $field.removeClass('error');
    $field.next('.validation-message').remove();
}

/**
 * Update field state based on validation
 * @param {jQuery} $field - Field element
 * @param {boolean} isValid - Whether field is valid
 */
export function updateFieldState($field, isValid) {
    if (isValid) {
        $field.removeClass('error');
        $field.next('.validation-message.error').remove();
    } else {
        $field.addClass('error');
    }
}

// ============================================================================
// FIELD REQUIREMENT HELPERS
// ============================================================================

/**
 * Check if a field is required
 * @param {string} fieldPath - Dot-separated field path
 * @returns {boolean} True if required
 */
export function isRequired(fieldPath) {
    return isFieldRequired(fieldPath);
}

/**
 * Add required indicator to field label
 * @param {jQuery} $label - Label element
 */
export function markRequired($label) {
    if (!$label.find('.required').length) {
        $label.append(' <span class="required">*</span>');
    }
}

/**
 * Remove required indicator from field label
 * @param {jQuery} $label - Label element
 */
export function unmarkRequired($label) {
    $label.find('.required').remove();
}

/**
 * Add optional indicator to field label
 * @param {jQuery} $label - Label element
 */
export function markOptional($label) {
    if (!$label.find('.optional').length) {
        $label.append(' <span class="optional">(optional)</span>');
    }
}

// ============================================================================
// VALIDATION SUMMARY
// ============================================================================

/**
 * Get validation summary for display
 * @returns {Object} Summary with count and errors by field
 */
export function getValidationSummary() {
    return {
        errorCount: validationErrors.size,
        errors: getValidationErrors(),
    };
}

/**
 * Trigger validation complete event
 */
export function triggerValidationComplete() {
    $(document).trigger('validation:complete', getValidationSummary());
}

// ============================================================================
// EXPORT FOR DEBUGGING
// ============================================================================

if (typeof window !== 'undefined') {
    window.StoryModeValidation = {
        validateField,
        validateFields,
        clearValidationErrors,
        clearFieldError,
        getValidationErrors,
        hasErrors,
        getErrorCount,
        updateFieldState,
        isRequired,
        markRequired,
        unmarkRequired,
        markOptional,
        getValidationSummary,
        triggerValidationComplete,
    };
}
