/**
 * Notification Adapter Module
 * Wraps toastr.js for toast notifications in standalone mode
 */

// ============================================================================
// NOTIFICATION API
// ============================================================================

/**
 * Show a success notification
 * @param {string} message - Message to display
 * @param {Object} options - Toast options
 */
export function showSuccess(message, options = {}) {
    toastr.success(message, options.title || 'Success', {
        timeOut: 3000,
        extendedTimeOut: 1000,
        closeButton: true,
        ...options,
    });
}

/**
 * Show an error notification
 * @param {string} message - Error message to display
 * @param {Object} options - Toast options
 */
export function showError(message, options = {}) {
    toastr.error(message, options.title || 'Error', {
        timeOut: 5000,
        extendedTimeOut: 2000,
        closeButton: true,
        ...options,
    });
}

/**
 * Show a warning notification
 * @param {string} message - Warning message to display
 * @param {Object} options - Toast options
 */
export function showWarning(message, options = {}) {
    toastr.warning(message, options.title || 'Warning', {
        timeOut: 4000,
        extendedTimeOut: 2000,
        closeButton: true,
        ...options,
    });
}

/**
 * Show an info notification
 * @param {string} message - Info message to display
 * @param {Object} options - Toast options
 */
export function showInfo(message, options = {}) {
    toastr.info(message, options.title || 'Info', {
        timeOut: 3000,
        extendedTimeOut: 1000,
        closeButton: true,
        ...options,
    });
}

/**
 * Clear all active toast notifications
 */
export function clearAll() {
    toastr.clear();
}

/**
 * Remove a specific toast notification
 * @param {jQuery} $toast - Toast element to remove
 */
export function removeToast($toast) {
    toastr.remove($toast);
}

// ============================================================================
// CONVENIENCE EXPORTS (toastr API passthrough)
// ============================================================================

/**
 * Get toastr options for customization
 * @returns {Object} Toast options
 */
export function getOptions() {
    return toastr.options;
}

/**
 * Set toastr options
 * @param {Object} options - Toast options to set
 */
export function setOptions(options) {
    toastr.options = Object.assign(toastr.options, options);
}

// ============================================================================
// EXPORT FOR DEBUGGING
// ============================================================================

if (typeof window !== 'undefined') {
    window.StoryModeNotification = {
        showSuccess,
        showError,
        showWarning,
        showInfo,
        clearAll,
        removeToast,
        getOptions,
        setOptions,
    };
}
