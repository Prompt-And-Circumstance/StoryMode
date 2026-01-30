/**
 * Connection Bridge Module
 * Handles CSRF authentication and communication with SillyTavern backend.
 *
 * SillyTavern protects all API endpoints with CSRF tokens.
 * This module fetches the token on connect and provides
 * authenticated request headers to all other modules.
 */

// Note: getApiUrl is no longer needed here — all API calls use relative URLs
// since the editor is served from within SillyTavern (same-origin).

// ============================================================================
// CONNECTION STATE
// ============================================================================

let connectionStatus = 'unknown'; // 'unknown', 'connected', 'disconnected', 'error'
let csrfToken = null;

// ============================================================================
// CSRF TOKEN
// ============================================================================

/**
 * Fetch a CSRF token from SillyTavern.
 * Uses a relative URL since the standalone editor is served from within
 * SillyTavern — this guarantees same-origin and avoids CORS issues.
 * @returns {Promise<string|null>} CSRF token or null
 */
async function fetchCsrfToken() {
    try {
        const response = await fetch('/csrf-token', {
            method: 'GET',
            signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
            const data = await response.json();
            csrfToken = data.token;
            console.log('[Connection] CSRF token acquired');
            return csrfToken;
        }
    } catch (error) {
        console.warn('[Connection] Failed to fetch CSRF token:', error.message);
    }

    return null;
}

/**
 * Get request headers with CSRF token (mirrors SillyTavern's getRequestHeaders)
 * @param {Object} options
 * @param {boolean} options.omitContentType - Skip Content-Type header
 * @returns {Object} Headers object
 */
export function getRequestHeaders({ omitContentType = false } = {}) {
    const headers = {};

    if (!omitContentType) {
        headers['Content-Type'] = 'application/json';
    }

    if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
    }

    return headers;
}

/**
 * Get the current CSRF token
 * @returns {string|null} CSRF token
 */
export function getCsrfToken() {
    return csrfToken;
}

// ============================================================================
// CONNECTION CHECKING
// ============================================================================

/**
 * Check backend connection by fetching CSRF token
 * If we can get a token, we're connected.
 * @returns {Promise<Object>} Connection status
 */
export async function checkBackendConnection() {
    try {
        const token = await fetchCsrfToken();

        if (token) {
            connectionStatus = 'connected';
            return { connected: true };
        } else {
            connectionStatus = 'error';
            return { connected: false };
        }
    } catch (error) {
        console.error('[Connection] Backend check failed:', error);
        connectionStatus = 'error';
        csrfToken = null;
        return { connected: false };
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
 * Check if connected
 * @returns {boolean} True if connected with valid CSRF token
 */
export function isConnected() {
    return connectionStatus === 'connected' && csrfToken !== null;
}

// ============================================================================
// AUTHENTICATED FETCH
// ============================================================================

/**
 * Make an authenticated fetch request to SillyTavern
 * Automatically includes CSRF token header
 * @param {string} url - Full URL
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>} Fetch response
 */
export async function authenticatedFetch(url, options = {}) {
    const headers = {
        ...getRequestHeaders(),
        ...options.headers,
    };

    return fetch(url, { ...options, headers });
}

// ============================================================================
// DATA LOADERS (story types, author styles)
// ============================================================================

/** Cache for static JSON data */
const dataCache = {};

/**
 * Load a JSON data file from the extension's data/ directory
 * @param {string} filename - JSON filename (e.g., 'story_types.json')
 * @returns {Promise<Array>} Parsed JSON array
 */
async function loadDataFile(filename) {
    if (dataCache[filename]) return dataCache[filename];

    // Resolve relative to standalone/ → ../data/
    const url = new URL(`../../data/${filename}`, import.meta.url).href;
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Failed to load ${filename}: ${response.statusText}`);
    }

    const data = await response.json();
    dataCache[filename] = data;
    return data;
}

/**
 * Get available story types from extension data
 * @returns {Promise<Array>} Story type definitions
 */
export async function getStoryTypes() {
    return loadDataFile('story_types.json');
}

/**
 * Get available author styles from extension data
 * @returns {Promise<Array>} Author style definitions
 */
export async function getAuthorStyles() {
    return loadDataFile('author_styles.json');
}

// ============================================================================
// BLUEPRINT GENERATION (requires LLM backend)
// ============================================================================

/**
 * Generate a blueprint via SillyTavern's LLM API
 * @param {Object} request - Generation parameters from wizard
 * @returns {Promise<Object>} Generated blueprint object
 * @throws {Error} If not connected or generation fails
 */
export async function generateBlueprint(request) {
    if (!isConnected()) {
        throw new Error('Not connected to SillyTavern. Please configure your connection in Settings.');
    }

    const response = await authenticatedFetch('/api/plugins/storymode/generate', {
        method: 'POST',
        body: JSON.stringify(request),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Blueprint generation failed: ${errorText}`);
    }

    return await response.json();
}

// ============================================================================
// COVER GENERATION (requires Stable Diffusion backend)
// ============================================================================

/**
 * Generate a cover image via SillyTavern's SD API
 * @param {Object} request - Generation parameters (prompt, dimensions, etc.)
 * @returns {Promise<string>} Base64 image data
 * @throws {Error} If not connected or SD unavailable
 */
export async function generateCover(request) {
    if (!isConnected()) {
        throw new Error('Not connected to SillyTavern. Please configure your connection in Settings.');
    }

    const response = await authenticatedFetch('/api/sd/generate', {
        method: 'POST',
        body: JSON.stringify(request),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Stable Diffusion generation failed: ${errorText}`);
    }

    const data = await response.json();
    return data.image;
}

// ============================================================================
// EXPORT FOR DEBUGGING
// ============================================================================

if (typeof window !== 'undefined' && window.location?.hostname === 'localhost') {
    window.StoryModeConnection = {
        checkBackendConnection,
        getConnectionStatus,
        isConnected,
        getCsrfToken,
        getRequestHeaders,
        authenticatedFetch,
    };
}
