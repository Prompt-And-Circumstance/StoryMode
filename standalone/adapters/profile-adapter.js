/**
 * Profile Adapter Module
 * Handles Connection Manager profile integration
 */

import { getApiUrl, isValidApiUrl } from '../settings-system.js';
import { getConnectionStatus } from './connection-bridge.js';

// Cache for profiles
const profileCache = new Map();
let cacheExpiry = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// PROFILE RETRIEVAL
// ============================================================================

/**
 * Get all Connection Manager profiles
 * @returns {Promise<Array<Object>>} Array of profile objects
 */
export async function getProfiles() {
    const apiUrl = getApiUrl();
    const connectionStatus = getConnectionStatus();

    // Check cache first
    if (profileCache.has('all') && Date.now() < cacheExpiry) {
        return profileCache.get('all');
    }

    if (!isValidApiUrl(apiUrl) || connectionStatus !== 'connected') {
        return [];
    }

    try {
        const response = await fetch(`${apiUrl}/api/profiles/list`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
            // If profiles endpoint doesn't exist, return empty
            // (Connection Manager may not be installed)
            return [];
        }

        const data = await response.json();
        const profiles = data.profiles || [];

        // Cache the results
        profileCache.set('all', profiles);
        cacheExpiry = Date.now() + CACHE_DURATION;

        return profiles;
    } catch (error) {
        console.error('[Profile Adapter] Failed to fetch profiles:', error);
        return [];
    }
}

/**
 * Get a specific profile by ID
 * @param {string} profileId - Profile ID
 * @returns {Promise<Object|null>} Profile object or null
 */
export async function getProfile(profileId) {
    const profiles = await getProfiles();
    return profiles.find(p => p.id === profileId) || null;
}

/**
 * Get the current active profile
 * @returns {Promise<Object|null>} Active profile or null
 */
export async function getActiveProfile() {
    const profiles = await getProfiles();
    return profiles.find(p => p.active) || null;
}

// ============================================================================
// PROFILE DATA EXTRACTION
// ============================================================================

/**
 * Extract API endpoint from a profile
 * @param {Object} profile - Profile object
 * @returns {string} API URL
 */
export function getProfileApiUrl(profile) {
    if (!profile) return '';

    return profile.endpoint || profile.apiUrl || profile.url || '';
}

/**
 * Extract API key from a profile
 * @param {Object} profile - Profile object
 * @returns {string} API key
 */
export function getProfileApiKey(profile) {
    if (!profile) return '';

    return profile.apiKey || profile.key || '';
}

/**
 * Extract model name from a profile
 * @param {Object} profile - Profile object
 * @returns {string} Model name
 */
export function getProfileModel(profile) {
    if (!profile) return '';

    return profile.model || profile.modelName || '';
}

/**
 * Check if a profile has valid configuration
 * @param {Object} profile - Profile object
 * @returns {boolean} True if profile is valid
 */
export function isProfileValid(profile) {
    if (!profile) return false;
    return !!getProfileApiUrl(profile);
}

/**
 * Get profile display name
 * @param {Object} profile - Profile object
 * @returns {string} Display name
 */
export function getProfileName(profile) {
    if (!profile) return 'Unknown Profile';

    return profile.name ||
           profile.label ||
           getProfileModel(profile) ||
           'Unnamed Profile';
}

// ============================================================================
// PROFILE SELECTION
// ============================================================================>

/**
 * Format profiles for dropdown options
 * @returns {Promise<Array<Object>>} Array of dropdown options
 */
export async function getProfileOptions() {
    const profiles = await getProfiles();

    return profiles
        .filter(isProfileValid)
        .map(profile => ({
            value: profile.id,
            label: getProfileName(profile),
            description: getProfileModel(profile) || 'No model specified',
        }));
}

/**
 * Auto-select the best profile for blueprint generation
 * @returns {Promise<Object|null>} Best profile or null
 */
export async function selectBestProfile() {
    const profiles = await getProfiles();
    const validProfiles = profiles.filter(isProfileValid);

    if (validProfiles.length === 0) return null;

    // Prefer active profile
    const active = validProfiles.find(p => p.active);
    if (active) return active;

    // Otherwise return first valid profile
    return validProfiles[0];
}

/**
 * Use a profile's configuration for an API request
 * @param {Object} profile - Profile object
 * @returns {Object} Request configuration
 */
export function buildProfileRequest(profile) {
    return {
        apiUrl: getProfileApiUrl(profile),
        apiKey: getProfileApiKey(profile),
        model: getProfileModel(profile),
        headers: {
            'Content-Type': 'application/json',
            ...(getProfileApiKey(profile) && {
                'Authorization': `Bearer ${getProfileApiKey(profile)}`,
            }),
        },
    };
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Clear the profile cache
 */
export function clearCache() {
    profileCache.clear();
    cacheExpiry = 0;
}

/**
 * Force refresh profiles from backend
 * @returns {Promise<Array<Object>>} Array of profile objects
 */
export async function refreshProfiles() {
    clearCache();
    return await getProfiles();
}

// ============================================================================
// AVAILABILITY CHECK
// ============================================================================

/**
 * Check if Connection Manager is available
 * @returns {Promise<boolean>} True if Connection Manager is installed
 */
export async function isConnectionManagerAvailable() {
    const profiles = await getProfiles();
    return profiles.length > 0;
}

// ============================================================================
// EXPORT FOR DEBUGGING
// ============================================================================

if (typeof window !== 'undefined') {
    window.StoryModeProfile = {
        getProfiles,
        getProfile,
        getActiveProfile,
        getProfileApiUrl,
        getProfileApiKey,
        getProfileModel,
        isProfileValid,
        getProfileName,
        getProfileOptions,
        selectBestProfile,
        buildProfileRequest,
        clearCache,
        refreshProfiles,
        isConnectionManagerAvailable,
    };
}
