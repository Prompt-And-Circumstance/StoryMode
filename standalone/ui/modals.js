/**
 * Modal Management Module
 * Handles settings modal and modal tab navigation
 */

import { getSettings, applyTheme, setApiUrl, isValidApiUrl, getThemeOptions, getCurrentTheme } from '../settings-system.js';
import { checkConnection } from './connection.js';
import { getCsrfToken } from '../adapters/connection-bridge.js';

// ============================================================================
// SETTINGS MODAL
// ============================================================================

// Track original theme for revert on cancel
let originalTheme = null;

/**
 * Initialize modal event handlers
 */
export function initModals() {
    // Settings modal — use delegation on #settingsModal for reliable binding
    $('#settingsModal').on('click', '#saveSettingsBtn', saveSettings);
    $('#settingsModal').on('click', '#cancelSettingsBtn', closeSettingsModal);
    $('#settingsModal').on('click', '.modal-close', closeSettingsModal);
    $('#settingsModal').on('click', '[data-settings-tab]', handleSettingsTabClick);

    // Live theme preview
    $('#settingsModal').on('change', '#themeSelect', handleThemePreview);

    // Test connection button
    $('#settingsModal').on('click', '#testConnectionBtn', handleTestConnection);
}

/**
 * Open the settings modal
 */
export function openSettingsModal() {
    const settings = getSettings();

    // Store original theme for revert on cancel
    originalTheme = getCurrentTheme();

    // Auto-detect URL from current browser location
    const currentOrigin = window.location.origin;
    const autoDetectedUrl = currentOrigin.includes('127.0.0.1') || currentOrigin.includes('localhost')
        ? currentOrigin
        : settings.apiUrl || 'http://localhost:8000';

    // Populate form fields
    $('#apiUrl').val(settings.apiUrl || autoDetectedUrl);
    $('#themeSelect').val(settings.theme || 'dark');

    // Update suggested URL based on current location
    const currentUrl = window.location.href;
    const basePath = currentUrl.substring(0, currentUrl.lastIndexOf('/') + 1);
    $('#suggestedUrl').text(basePath);

    // Clear any previous test results
    $('#connectionTestResult').html('');

    // Show modal
    $('#settingsModal').css('display', 'flex');
}

/**
 * Close the settings modal
 * Reverts theme if cancelled
 */
export function closeSettingsModal() {
    // Revert theme to original if user cancelled
    if (originalTheme && getCurrentTheme() !== originalTheme) {
        applyTheme(originalTheme);
    }

    $('#settingsModal').hide();
    originalTheme = null;
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

    // Clear original theme so closeSettingsModal doesn't revert
    originalTheme = null;

    // Recheck connection
    $(document).trigger('connection:check');

    toastr.success('Settings saved');
    closeSettingsModal();
}

/**
 * Handle theme select change (live preview)
 * @param {Event} e - Change event
 */
function handleThemePreview(e) {
    const theme = $(e.target).val();
    applyTheme(theme);
}

/**
 * Handle test connection button click
 */
async function handleTestConnection() {
    const apiUrl = $('#apiUrl').val().trim();
    const resultSpan = $('#connectionTestResult');
    const btn = $('#testConnectionBtn');

    // Validate URL format
    if (!apiUrl) {
        resultSpan.html('<span style="color: var(--SmartThemeQuoteColor);">Please enter a URL</span>');
        return;
    }

    if (!isValidApiUrl(apiUrl)) {
        resultSpan.html('<span style="color: #ff6b6b;">Invalid URL format</span>');
        return;
    }

    // Temporarily update API URL for testing
    const originalUrl = getSettings().apiUrl;
    setApiUrl(apiUrl);

    // Show loading state
    btn.prop('disabled', true);
    resultSpan.html('<i class="fa-solid fa-spinner fa-spin"></i> Testing...');

    try {
        // Test connection
        const connected = await checkConnection();

        if (connected) {
            const token = getCsrfToken();
            const tokenPreview = token ? token.substring(0, 8) + '...' : 'none';
            resultSpan.html(`<span style="color: #51cf66;"><i class="fa-solid fa-check"></i> Connected (token: ${tokenPreview})</span>`);
            toastr.success('Successfully connected to SillyTavern');
        } else {
            resultSpan.html('<span style="color: #ff6b6b;"><i class="fa-solid fa-xmark"></i> Connection failed</span>');
            toastr.error('Could not connect to SillyTavern. Check the URL and make sure the server is running.');
        }
    } catch (error) {
        resultSpan.html('<span style="color: #ff6b6b;"><i class="fa-solid fa-xmark"></i> Error</span>');
        toastr.error(`Connection test failed: ${error.message}`);
    } finally {
        btn.prop('disabled', false);
    }
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
