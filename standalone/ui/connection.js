/**
 * Connection Management Module
 * Handles SillyTavern backend connection detection and status display
 */

import { getApiUrl, isValidApiUrl } from '../settings-system.js';

// ============================================================================
// STATE
// ============================================================================

let isConnected = false;

// ============================================================================
// CONNECTION STATUS
// ============================================================================

/**
 * Check connection to SillyTavern backend
 * @returns {Promise<boolean>} True if connected
 */
export async function checkConnection() {
    const apiUrl = getApiUrl();

    if (!apiUrl || !isValidApiUrl(apiUrl)) {
        setConnectionStatus(false, 'Invalid API URL configured');
        return false;
    }

    try {
        const response = await fetch(`${apiUrl}/api/storymode/status`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            },
            signal: AbortSignal.timeout(5000), // 5 second timeout
        });

        if (response.ok) {
            setConnectionStatus(true, 'Connected to SillyTavern');
            return true;
        } else {
            setConnectionStatus(false, 'SillyTavern not responding');
            return false;
        }
    } catch (error) {
        // Connection failed - expected in standalone mode
        setConnectionStatus(false, 'Offline mode');
        console.info('[Connection] Running in offline mode - SillyTavern not detected');
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
    // For now, all features work in offline mode
    // This can be extended to hide/show specific features
}

/**
 * Get the current connection status
 * @returns {boolean} True if connected
 */
export function getConnectionStatus() {
    return isConnected;
}
