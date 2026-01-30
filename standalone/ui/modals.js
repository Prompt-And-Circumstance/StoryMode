/**
 * Modal Management Module
 * Handles settings modal and modal tab navigation
 */

import { getSettings, applyTheme, setApiUrl, isValidApiUrl, getThemeOptions } from '../settings-system.js';

// ============================================================================
// SETTINGS MODAL
// ============================================================================

/**
 * Initialize modal event handlers
 */
export function initModals() {
    // Settings modal — use delegation on #settingsModal for reliable binding
    $('#settingsModal').on('click', '#saveSettingsBtn', saveSettings);
    $('#settingsModal').on('click', '#cancelSettingsBtn', closeSettingsModal);
    $('#settingsModal').on('click', '.modal-close', closeSettingsModal);
    $('#settingsModal').on('click', '[data-settings-tab]', handleSettingsTabClick);
}

/**
 * Open the settings modal
 */
export function openSettingsModal() {
    const settings = getSettings();

    // Populate form fields
    $('#apiUrl').val(settings.apiUrl || '');
    $('#themeSelect').val(settings.theme || 'dark');

    // Show modal
    $('#settingsModal').css('display', 'flex');
}

/**
 * Close the settings modal
 */
export function closeSettingsModal() {
    $('#settingsModal').hide();
}

/**
 * Save settings from modal
 */
function saveSettings() {
    const apiUrl = $('#apiUrl').val().trim();
    const theme = $('#themeSelect').val();

    // Validate API URL
    if (apiUrl && !isValidApiUrl(apiUrl)) {
        toastr.error('Invalid API URL format');
        return;
    }

    // Save settings
    setApiUrl(apiUrl);
    applyTheme(theme);

    // Recheck connection
    $(document).trigger('connection:check');

    toastr.success('Settings saved');
    closeSettingsModal();
}

/**
 * Handle settings tab click
 * @param {Event} e - Click event
 */
function handleSettingsTabClick(e) {
    // jQuery .data() camelCases hyphenated attrs, so use .attr() instead
    const tab = $(e.currentTarget).attr('data-settings-tab');

    // Update tab buttons
    $('.modal-tab').removeClass('active');
    $(e.currentTarget).addClass('active');

    // Update tab content panels
    $('#settingsModal .tab-panel').removeClass('active');
    $(`#${tab}Tab`, '#settingsModal').addClass('active');
}

// ============================================================================
// HELP MODAL
// ============================================================================

/**
 * Show help dialog
 * @returns {boolean} False to prevent default
 */
export function showHelp() {
    // Placeholder - will show a help modal
    toastr.info('Help coming soon!');
    return false;
}
