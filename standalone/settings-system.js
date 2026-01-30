/**
 * Settings and Theme Management System
 * Handles localStorage persistence, theme switching, and settings migration
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const SETTINGS_KEY = 'storymode-standalone-settings';
const SETTINGS_VERSION = 1;

const DEFAULT_SETTINGS = {
    version: SETTINGS_VERSION,
    theme: 'dark',
    apiUrl: 'http://localhost:9999',
    // Future settings can be added here
    autoSave: true,
    showAdvancedOptions: false,
};

// ============================================================================
// STATE
// ============================================================================

let currentSettings = { ...DEFAULT_SETTINGS };

// ============================================================================
// THEME DEFINITIONS
// ============================================================================

/**
 * Theme metadata (CSS variables defined in theme CSS files)
 * Each theme references a CSS file with complete variable definitions
 */
export const THEMES = {
    dark: {
        name: 'Dark',
        cssClass: 'theme-dark',
        dataAttr: 'dark',
    },
    light: {
        name: 'Light',
        cssClass: 'theme-light',
        dataAttr: 'light',
    },
    'rpg-companion': {
        name: 'RPG Companion',
        cssClass: 'theme-rpg-companion',
        dataAttr: 'rpg-companion',
    },
};

// ============================================================================
// SETTINGS MANAGEMENT
// ============================================================================

/**
 * Load settings from localStorage with migration support
 * @returns {Object} Current settings
 */
export function loadSettings() {
    try {
        const stored = localStorage.getItem(SETTINGS_KEY);
        if (!stored) {
            currentSettings = { ...DEFAULT_SETTINGS };
            saveSettings();
            return currentSettings;
        }

        const parsed = JSON.parse(stored);

        // Migrate settings if version mismatch
        if (parsed.version !== SETTINGS_VERSION) {
            currentSettings = migrateSettings(parsed);
            saveSettings();
        } else {
            currentSettings = { ...DEFAULT_SETTINGS, ...parsed };
        }

        return currentSettings;
    } catch (error) {
        console.error('[Settings] Failed to load settings:', error);
        currentSettings = { ...DEFAULT_SETTINGS };
        return currentSettings;
    }
}

/**
 * Save settings to localStorage
 */
export function saveSettings() {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(currentSettings));
    } catch (error) {
        console.error('[Settings] Failed to save settings:', error);
    }
}

/**
 * Get a specific setting value
 * @param {string} key - Setting key
 * @returns {*} Setting value or default
 */
export function getSetting(key) {
    return currentSettings[key] !== undefined ? currentSettings[key] : DEFAULT_SETTINGS[key];
}

/**
 * Set a specific setting value
 * @param {string} key - Setting key
 * @param {*} value - New value
 */
export function setSetting(key, value) {
    currentSettings[key] = value;
    saveSettings();
}

/**
 * Get all current settings
 * @returns {Object} All settings
 */
export function getSettings() {
    return { ...currentSettings };
}

/**
 * Update multiple settings at once
 * @param {Object} updates - Object containing key-value pairs to update
 */
export function updateSettings(updates) {
    currentSettings = { ...currentSettings, ...updates };
    saveSettings();
}

/**
 * Reset settings to defaults
 */
export function resetSettings() {
    currentSettings = { ...DEFAULT_SETTINGS };
    saveSettings();
    applyTheme(currentSettings.theme);
}

/**
 * Migrate settings from older versions
 * @param {Object} oldSettings - Settings from older version
 * @returns {Object} Migrated settings
 */
function migrateSettings(oldSettings) {
    const migrated = { ...DEFAULT_SETTINGS, ...oldSettings };
    migrated.version = SETTINGS_VERSION;

    // Version-specific migrations can be added here
    // Example: if (oldSettings.version === 0) { /* migrate to v1 */ }

    return migrated;
}

// ============================================================================
// THEME MANAGEMENT
// ============================================================================

/**
 * Apply a theme to the document
 * @param {string} themeId - Theme identifier
 */
export function applyTheme(themeId) {
    const theme = THEMES[themeId];
    if (!theme) {
        console.warn(`[Settings] Unknown theme: ${themeId}`);
        return;
    }

    const body = document.body;

    // Remove all existing theme classes
    Object.values(THEMES).forEach(t => {
        if (t.cssClass) body.classList.remove(t.cssClass);
    });

    // Remove data-theme attribute
    body.removeAttribute('data-theme');

    // Apply new theme
    if (theme.cssClass) {
        body.classList.add(theme.cssClass);
    }

    // Set data attribute for CSS selectors
    body.setAttribute('data-theme', theme.dataAttr || themeId);

    // Update current settings
    currentSettings.theme = themeId;
    saveSettings();
}

/**
 * Get the current theme ID
 * @returns {string} Current theme ID
 */
export function getCurrentTheme() {
    return currentSettings.theme;
}

/**
 * Get a theme definition by ID
 * @param {string} themeId - Theme identifier
 * @returns {Object|null} Theme definition or null
 */
export function getTheme(themeId) {
    return THEMES[themeId] || null;
}

/**
 * Get all available themes
 * @returns {Object} All theme definitions
 */
export function getAllThemes() {
    return { ...THEMES };
}

/**
 * Get theme options for select dropdown
 * @returns {Array} Array of {value, label} objects
 */
export function getThemeOptions() {
    return Object.entries(THEMES).map(([id, theme]) => ({
        value: id,
        label: theme.name,
    }));
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the settings system
 * Should be called on app startup
 */
export function initSettings() {
    loadSettings();
    applyTheme(currentSettings.theme);
}

// ============================================================================
// API CONNECTION MANAGEMENT
// ============================================================================

/**
 * Get the configured API URL
 * @returns {string} API URL
 */
export function getApiUrl() {
    return currentSettings.apiUrl || DEFAULT_SETTINGS.apiUrl;
}

/**
 * Set the API URL
 * @param {string} url - New API URL
 */
export function setApiUrl(url) {
    currentSettings.apiUrl = url;
    saveSettings();
}

/**
 * Check if the API URL is configured
 * @returns {boolean} True if configured
 */
export function hasApiUrl() {
    return !!(currentSettings.apiUrl && currentSettings.apiUrl.trim() !== '');
}

/**
 * Validate API URL format
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid
 */
export function isValidApiUrl(url) {
    try {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
        return false;
    }
}

// Expose to window for debugging (localhost only for security)
if (typeof window !== 'undefined' && window.location?.hostname === 'localhost') {
    window.StoryModeSettings = {
        loadSettings, saveSettings, getSetting, setSetting,
        getSettings, updateSettings, resetSettings,
        applyTheme, getCurrentTheme, getTheme, getAllThemes, getThemeOptions,
        getApiUrl, setApiUrl, hasApiUrl, isValidApiUrl,
        THEMES, DEFAULT_SETTINGS,
    };
}
