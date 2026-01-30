/**
 * Connection Bridge Module
 * Handles communication with the SillyTavern backend for Story Mode extension
 */

import { getApiUrl, isValidApiUrl } from '../settings-system.js';

// ============================================================================
// CONNECTION STATE
// ============================================================================

let connectionStatus = 'unknown'; // 'unknown', 'connected', 'disconnected', 'error'
let backendVersion = null;
let extensionInstalled = false;

// ============================================================================
// CONNECTION CHECKING
// ============================================================================

/**
 * Check if the Story Mode extension is installed on the backend
 * @param {string} apiUrl - API URL to check
 * @returns {Promise<boolean>} True if extension is installed
 */
export async function isExtensionInstalled(apiUrl) {
    try {
        const response = await fetch(`${apiUrl}/api/storymode/status`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });
        return response.ok;
    } catch {
        return false;
    }
}

/**
 * Check backend connection and extension availability
 * @returns {Promise<Object>} Connection status object
 */
export async function checkBackendConnection() {
    const apiUrl = getApiUrl();

    if (!isValidApiUrl(apiUrl)) {
        connectionStatus = 'disconnected';
        extensionInstalled = false;
        backendVersion = null;
        return { connected: false, installed: false, version: null };
    }

    try {
        // First check if backend is reachable
        const healthResponse = await fetch(`${apiUrl}/api/health`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });

        if (!healthResponse.ok) {
            connectionStatus = 'error';
            return { connected: false, installed: false, version: null };
        }

        // Check if Story Mode extension is installed
        const extensionInstalled = await isExtensionInstalled(apiUrl);

        if (extensionInstalled) {
            // Get extension version
            const statusResponse = await fetch(`${apiUrl}/api/storymode/status`);
            if (statusResponse.ok) {
                const data = await statusResponse.json();
                backendVersion = data.version || 'unknown';
                connectionStatus = 'connected';
                extensionInstalled = true;
                return { connected: true, installed: true, version: backendVersion };
            }
        }

        connectionStatus = 'connected';
        extensionInstalled = false;
        return { connected: true, installed: false, version: null };

    } catch (error) {
        console.error('[Connection] Backend check failed:', error);
        connectionStatus = 'error';
        extensionInstalled = false;
        backendVersion = null;
        return { connected: false, installed: false, version: null };
    }
}

/**
 * Get the current connection status
 * @returns {string} Connection status
 */
export function getConnectionStatus() {
    return connectionStatus;
}

/**
 * Check if the extension is installed
 * @returns {boolean} True if installed
 */
export function isInstalled() {
    return extensionInstalled;
}

/**
 * Get the backend version
 * @returns {string|null} Backend version
 */
export function getBackendVersion() {
    return backendVersion;
}

// ============================================================================
// API CALLS
// ============================================================================

/**
 * Make an API call to the Story Mode backend
 * @param {string} endpoint - API endpoint
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} Response data
 */
export async function apiCall(endpoint, options = {}) {
    const apiUrl = getApiUrl();

    if (!isValidApiUrl(apiUrl)) {
        throw new Error('No API URL configured');
    }

    if (connectionStatus !== 'connected') {
        throw new Error('Not connected to backend');
    }

    const url = `${apiUrl}/api/storymode${endpoint}`;
    const defaultOptions = {
        headers: { 'Content-Type': 'application/json' },
    };

    try {
        const response = await fetch(url, { ...defaultOptions, ...options });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Request failed' }));
            throw new Error(error.message || `HTTP ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`[Connection] API call failed: ${endpoint}`, error);
        throw error;
    }
}

/**
 * Get available story types from the backend
 * @returns {Promise<Array<Object>>} Array of story types
 */
export async function getStoryTypes() {
    try {
        const data = await apiCall('/story-types');
        return data.story_types || [];
    } catch (error) {
        console.error('[Connection] Failed to get story types:', error);
        return [];
    }
}

/**
 * Get available author styles from the backend
 * @returns {Promise<Array<Object>>} Array of author styles
 */
export async function getAuthorStyles() {
    try {
        const data = await apiCall('/author-styles');
        return data.author_styles || [];
    } catch (error) {
        console.error('[Connection] Failed to get author styles:', error);
        return [];
    }
}

/**
 * Generate a blueprint using the backend AI
 * @param {Object} params - Generation parameters
 * @returns {Promise<Object>} Generated blueprint
 */
export async function generateBlueprint(params) {
    try {
        const data = await apiCall('/generate', {
            method: 'POST',
            body: JSON.stringify(params),
        });
        return data.blueprint;
    } catch (error) {
        console.error('[Connection] Blueprint generation failed:', error);
        throw error;
    }
}

/**
 * Generate a cover image using the backend
 * @param {Object} params - Generation parameters
 * @returns {Promise<string>} Base64 image data
 */
export async function generateCover(params) {
    try {
        const data = await apiCall('/generate-cover', {
            method: 'POST',
            body: JSON.stringify(params),
        });
        return data.image;
    } catch (error) {
        console.error('[Connection] Cover generation failed:', error);
        throw error;
    }
}

// ============================================================================
// EVENT NOTIFICATIONS
// ============================================================================

/**
 * Notify other parts of the app about connection changes
 * @param {Object} status - Connection status object
 */
function notifyConnectionChange(status) {
    $(document).trigger('connection:changed', status);
}

/**
 * Refresh connection status and notify listeners
 * @returns {Promise<Object>} Connection status object
 */
export async function refreshConnection() {
    const status = await checkBackendConnection();
    notifyConnectionChange(status);
    return status;
}

// ============================================================================
// EXPORT FOR DEBUGGING (localhost only for security)
// ============================================================================

if (typeof window !== 'undefined' && window.location?.hostname === 'localhost') {
    window.StoryModeConnection = {
        checkBackendConnection,
        getConnectionStatus,
        isInstalled,
        getBackendVersion,
        apiCall,
        getStoryTypes,
        getAuthorStyles,
        generateBlueprint,
        generateCover,
        refreshConnection,
    };
}
