/**
 * Connection Management Module
 * Handles SillyTavern backend connection detection and status display.
 * Delegates to connection-bridge for CSRF token management.
 */

import { getApiUrl, isValidApiUrl } from '../settings-system.js';
import { checkBackendConnection, isConnected as isBridgeConnected } from '../adapters/connection-bridge.js';

// ============================================================================
// STATE
// ============================================================================

let isConnected = false;

// ============================================================================
// CONNECTION STATUS
// ============================================================================

/**
 * Check connection to SillyTavern backend
 * Uses the connection bridge which handles CSRF token acquisition
 * @returns {Promise<boolean>} True if connected
 */
export async function checkConnection() {
    const apiUrl = getApiUrl();

    if (!apiUrl || !isValidApiUrl(apiUrl)) {
        setConnectionStatus(false, 'API URL not configured');
        return false;
    }

    try {
        const result = await checkBackendConnection();

        if (result.connected) {
            setConnectionStatus(true, `Connected to SillyTavern (${apiUrl})`);
            return true;
        } else {
            setConnectionStatus(false, 'Could not connect - check URL and server');
            return false;
        }
    } catch (error) {
        setConnectionStatus(false, `Connection error: ${error.message}`);
        console.info('[Connection] Running in offline mode:', error.message);
        return false;
    }
}

/**
 * Set the connection status and update UI
 * @param {boolean} connected - Whether connected
 * @param {string} message - Status message
 */
function setConnectionStatus(connected, message) {
    isConnected = connected;

    const banner = $('#connectionBanner');
    const statusText = $('#connectionStatusText');
    const statusDot = banner.find('.status-dot');

    if (connected) {
        banner.removeClass('disconnected').addClass('connected');
        statusText.text(message);
        statusDot.addClass('online');
    } else {
        banner.removeClass('connected').addClass('disconnected');
        statusText.text(message);
        statusDot.removeClass('online');
    }

    // Emit event for other modules to respond
    $(document).trigger('connection:changed', { connected, message });

    // Update connection-aware UI elements
    updateConnectionAwareUI();
}

/**
 * Update UI elements that depend on connection status
 */
function updateConnectionAwareUI() {
    // Show/hide features that require connection
}

/**
 * Get the current connection status
 * @returns {boolean} True if connected
 */
export function getConnectionStatus() {
    return isConnected;
}

/**
 * Initialize connection UI (make banner clickable)
 */
export function initConnectionUI() {
    $('#connectionBanner').on('click', function() {
        if (!isConnected) {
            $(document).trigger('open-settings');
        }
    });

    $(document).on('connection:changed', function(e, data) {
        if (!data.connected) {
            $('#connectionBanner').css('cursor', 'pointer').attr('title', 'Click to configure connection');
        } else {
            $('#connectionBanner').css('cursor', 'default').attr('title', '');
        }
    });
}
