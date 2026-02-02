/**
 * Story Mode Standalone Scenario Blueprint Editor
 * Main application orchestrator
 */

import { initSettings } from './settings-system.js';
import { initTabNavigation, switchTab, loadTabContent, getActiveTab } from './ui/routing.js';
import { checkConnection, getConnectionStatus, initConnectionUI } from './ui/connection.js';
import { openSettingsModal, showHelp, initModals } from './ui/modals.js';
import {
    getCurrentBlueprint,
    handleNewBlueprint,
    handleImport,
    handleFileSelect,
    handleExport,
    handleJsonExport,
    setCurrentBlueprint,
    updateUIState,
} from './handlers/blueprint-actions.js';
import { showBlueprintWizard } from './wizards/blueprint-wizard.js';
import { showLibrary, hideLibrary, initLibraryHandlers } from './ui/library-view.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const APP_NAME = 'Story Mode Scenario Blueprint Editor';
const APP_VERSION = '1.0.0';

// ============================================================================
// STATE
// ============================================================================

let isInitialized = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the application
 */
async function initApp() {
    console.log(`[${APP_NAME}] v${APP_VERSION} initializing...`);

    // Initialize settings system
    initSettings();

    // Initialize UI modules
    initTabNavigation();
    initModals();
    initLibraryHandlers();
    initConnectionUI();

    // Set up event handlers
    setupEventHandlers();

    // Check connection status
    await checkConnection();

    // Show library as default view
    const status = getConnectionStatus();
    if (status) {
        try {
            await showLibrary();
        } catch (error) {
            console.error('[App] Failed to load library:', error);
            // Fall back to empty state
            hideLibrary();
            updateUIState();
        }
    } else {
        // No connection - show empty state with connection prompt
        hideLibrary();
        updateUIState();
    }

    isInitialized = true;
    console.log(`[${APP_NAME}] Initialization complete`);
}

/**
 * Set up all event handlers
 */
function setupEventHandlers() {
    // Header actions
    $('#settingsBtn').on('click', openSettingsModal);
    $('#helpBtn').on('click', showHelp);

    // Sidebar actions
    $('#libraryLink').on('click', async (e) => {
        e.preventDefault();
        await showLibrary();
    });
    $('#generateBlueprintLink').on('click', handleGenerateWizard);
    $('#newBlueprintLink').on('click', handleNewBlueprint);
    $('#importLink').on('click', handleImport);
    $('#exportLink').on('click', handleExport);
    $('#jsonExportLink').on('click', handleJsonExport);
    $('#configureConnectionLink').on('click', openSettingsModal);

    // Empty state actions
    $('#generateBlueprintBtn').on('click', handleGenerateWizard);
    $('#newBlueprintBtn').on('click', handleNewBlueprint);
    $('#importBtn').on('click', handleImport);

    // File input
    $('#fileInput').on('change', handleFileSelect);

    // Keyboard shortcuts
    $(document).on('keydown.standalone-app', handleKeyboard);

    // Custom event handlers for inter-module communication (namespaced to avoid extension conflicts)
    $(document).on('blueprint:loaded.standalone-app', handleBlueprintLoaded);
    $(document).on('connection:check.standalone-app', async () => {
        await checkConnection();
    });
    $(document).on('tab:changed.standalone-app', handleTabChanged);
    $(document).on('tab:show.standalone-app', handleTabShow);
    $(document).on('open-settings', () => {
        openSettingsModal();
        // Switch to API tab
        setTimeout(() => {
            $('.modal-tab[data-tab="api"]').click();
        }, 100);
    });

    // Library event handlers
    $(document).on('library:blueprint-selected.standalone-app', handleLibraryBlueprintSelected);
    $(document).on('library:new-blueprint.standalone-app', handleNewBlueprint);
    $(document).on('library:import.standalone-app', handleImport);
}

/**
 * Handle blueprint loaded event
 * @param {Event} e - Event
 * @param {Object} data - Event data
 */
function handleBlueprintLoaded(e, data) {
    console.log('[App] Blueprint loaded:', data.blueprint);
    // Additional handling when blueprint is loaded
}

/**
 * Handle blueprint selected from library
 * @param {Event} e - Event
 * @param {Object} data - Event data with blueprint
 */
function handleLibraryBlueprintSelected(e, data) {
    console.log('[App] Blueprint selected from library:', data.blueprint);

    // Hide library
    hideLibrary();

    // Set the blueprint
    setCurrentBlueprint(data.blueprint);

    // Trigger blueprint loaded event
    $(document).trigger('blueprint:loaded', { blueprint: data.blueprint });

    // Update UI to show editor tabs
    updateUIState();

    // Show the details tab by default
    switchTab('details');
}

/**
 * Handle generate wizard
 */
async function handleGenerateWizard() {
    const blueprint = await showBlueprintWizard();
    if (blueprint) {
        // Wizard already sets the blueprint and triggers the event
        // Just update UI state
        updateUIState();
    }
}

/**
 * Handle tab changed event
 * @param {Event} e - Event
 * @param {Object} data - Event data with tabId
 */
function handleTabChanged(e, data) {
    const { tabId } = data;
    const blueprint = getCurrentBlueprint();

    if (blueprint) {
        loadTabContent(tabId);
    }
}

/**
 * Handle tab show event
 */
function handleTabShow() {
    const tabId = getActiveTab();
    const blueprint = getCurrentBlueprint();

    if (blueprint) {
        loadTabContent(tabId);
    }
}

/**
 * Handle keyboard shortcuts
 * @param {KeyboardEvent} e - Keyboard event
 */
function handleKeyboard(e) {
    // Ctrl/Cmd + S - Save/Export
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (getCurrentBlueprint()) {
            handleExport();
        }
    }

    // Ctrl/Cmd + N - New blueprint
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        handleNewBlueprint();
    }

    // Ctrl/Cmd + O - Open/Import
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        handleImport();
    }

    // Escape - Close modals
    if (e.key === 'Escape') {
        // Close modals
        $('.modal-container').parent().hide();
    }

    // Alt + D/E/S/C - Switch tabs
    if (e.altKey) {
        switch (e.key.toLowerCase()) {
            case 'd':
                e.preventDefault();
                switchTab('details');
                break;
            case 'e':
                e.preventDefault();
                switchTab('scenes');
                break;
            case 's':
                e.preventDefault();
                switchTab('characters');
                break;
            case 'c':
                e.preventDefault();
                switchTab('cover');
                break;
        }
    }
}

// ============================================================================
// UI STATE MANAGEMENT
// ============================================================================

// updateUIState is imported from blueprint-actions.js

// ============================================================================
// PUBLIC API (for debugging)
// ============================================================================

/**
 * Get app state for debugging
 * @returns {Object} App state
 */
export function getAppState() {
    return {
        isInitialized,
        version: APP_VERSION,
        isConnected: getConnectionStatus(),
        activeTab: getActiveTab(),
        hasBlueprint: !!getCurrentBlueprint(),
    };
}

// ============================================================================
// APP STARTUP
// ============================================================================

// Initialize when DOM is ready
$(document).ready(function () {
    initApp();
});

// Export for debugging (localhost only for security)
if (typeof window !== 'undefined' && window.location?.hostname === 'localhost') {
    window.StoryModeApp = {
        initApp,
        checkConnection,
        switchTab,
        handleNewBlueprint,
        handleImport,
        handleExport,
        handleJsonExport,
        handleGenerateWizard,
        currentBlueprint: getCurrentBlueprint,
        isConnected: getConnectionStatus,
        getActiveTab,
        getState: getAppState,
    };
}
