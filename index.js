/**
* Story Mode Extension for SillyTavern
* Provides narrative scaffolding with story arcs, phases, and author styles
*/
import {
    eventSource,
    event_types,
    saveSettingsDebounced,
    setExtensionPrompt,
    extension_prompt_types,
    extension_prompt_roles,
    chat,
    chat_metadata,
    saveMetadata,
    generateRaw,
    addOneMessage,
    animation_duration,
    sendSystemMessage,
    system_message_types,
    saveChatConditional,
    main_api,
    characters,
    this_chid,
} from '/script.js';

import {
    extension_settings,
    getContext,
} from '/scripts/extensions.js';
import { groups, selected_group } from '/scripts/group-chats.js';
import { callGenericPopup, Popup, POPUP_TYPE, POPUP_RESULT } from '/scripts/popup.js';

// Import Blueprint module (Story Blueprints feature)
import * as BlueprintModule from './lib/blueprint/module.js';
import { getBlueprintState } from './lib/blueprint/storage.js';

// Import Blueprint Editor module
import { openBlueprintEditor, generateCoverFromSD, addCoverToGallery, setCoverImageUrl } from './lib/editor/blueprint-editor.js';

// Import Blueprint Integration module (Library API + PNG Storage)
import {
    getLibrary,
    initBlueprintIntegration,
    createBlueprint,
    editLibraryBlueprint,
    deleteLibraryBlueprint,
    searchBlueprints,
    getBlueprintsFromFolder,
    setBlueprintFavorite,
    encodeBlueprintAsPNG,
} from './lib/blueprint/integration.js';

// Import Scene Image Generation modules
import * as SceneImageStorage from './lib/scene/image-storage.js';

// Import Controller Panel module
import { updateControllerPanel } from './lib/ui/controller-panel.js';

// Import State Manager module
import {
    MODULE_NAME,
    extensionBaseUrl,
    defaultSettings,
    getStoryTypes,
    getAuthorStyles,
    setStoryTypes as setStoryTypesInManager,
    setAuthorStyles as setAuthorStylesInManager,
    getFuseStoryTypes,
    getFuseAuthorStyles,
    loadSettings,
    getSettings,
    getChatStoryState,
    saveChatStoryState,
    loadStoryTypes,
    loadAuthorStyles,
    saveStoryTypesToStorage,
    saveAuthorStylesToStorage,
    loadFuseJS,
    loadOriginalStoryTypes,
    loadOriginalAuthorStyles,
    getConnectionProfiles,
    migrateFromExtensionSettings,
    getCurrentSceneIndex,
} from './lib/core/state-manager.js';

// Import Arc Engine module
import {
    getPhaseInfo,
    buildStoryBlueprint,
    buildPhaseInjection,
    buildFullInjection,
    updateStoryPrompt,
} from './lib/core/arc-engine.js';

// Import Wand Menu module
import {
    registerWandMenuEntry,
    updateWandMenuStatus,
} from './lib/ui/wand-menu.js';

// Import UI Components module
import {
    renderMainPanel,
    renderBlueprintPreview,
    buildStoryArcSubtab,
    buildAuthorStyleSubtab,
    buildBlueprintSettingsSubtab,
    buildPostArcOptionsSubtab,
    buildAPIOptionsSubtab,
    buildOverviewTabContent,
    buildGenreStyleTabContent,
    buildSettingsTabContent,
    buildGenerateBlueprintSubtab,
    buildBlueprintTabContent,
    renderBlueprintOverviewSubtab,
    renderBlueprintOpeningSubtab,
    renderBlueprintScenesSubtab,
    renderBlueprintCharactersSubtab,
    renderBlueprintJsonSubtab,
    buildLibraryTabContent,
    showLibraryGridView,
} from './lib/ui/components.js';

// Import Type Editors module
import {
    showStoryTypesEditor,
    showAuthorStylesEditor,
    addStoryType,
    editStoryType,
    deleteStoryType,
    addAuthorStyle,
    editAuthorStyle,
    deleteAuthorStyle,
    showStoryTypeEditForm,
    showAuthorStyleEditForm,
    importStoryTypes,
    exportStoryTypes,
    importAuthorStyles,
    exportAuthorStyles,
    refreshStoryTypesList,
    refreshAuthorStylesList,
} from './lib/editor/type-editors.js';

// Import Event Handlers module
import {
    onMessageReceived,
    onUserMessageRendered,
    handleUserMessageStep,
    handleAIMessageChecks,
    handleArcCompletion,
    pushStoryMessage,
    generateEpilogueForStory,
    summarizeChatMainForStory,
    setRegenerating,
    setLoadingChat,
    isRegenerating as getIsRegenerating,
    isLoadingChat as getIsLoadingChat,
    jumpToRound,
} from './lib/core/event-handlers.js';

// Import Wizard module
import {
    launchWizardModal,
    updateWizardProgress,
    updateWizardPreview,
} from './lib/dialog/wizard.js';

// Import Library View module
import {
    debounce,
    refreshLibraryView,
    loadBlueprintsForFolder,
    sortLibraryBlueprints,
    searchLibraryBlueprints,
    renderBlueprintGrid,
    loadBlueprintFromLibrary,
    playBlueprintFromLibrary,
    editBlueprintFromLibrary,
    toggleBlueprintFavorite,
    deleteBlueprintFromLibrary,
    exportBlueprintFromLibrary,
    refreshSidebar,
    returnToLibraryIfNeeded,
} from './lib/dialog/library-view.js';

// Import Settings Handlers module
import { setupUnifiedDialogEventListeners } from './lib/dialog/settings-handlers.js';

// Convenience accessors that return the arrays directly for existing code
let storyTypes = [];
let authorStyles = [];
let fuseStoryTypes = null;
let fuseAuthorStyles = null;

// Function to sync local references with state manager
function syncDataReferences() {
    storyTypes = getStoryTypes();
    authorStyles = getAuthorStyles();
    fuseStoryTypes = getFuseStoryTypes();
    fuseAuthorStyles = getFuseAuthorStyles();
}

// Track regeneration state (now managed by event-handlers module)
// Use getter functions to access: getIsRegenerating(), getIsLoadingChat()
// Use setter functions to modify: setRegenerating(value), setLoadingChat(value)

// Arc engine functions now imported from arc-engine.js
// UI rendering functions now imported from ui-components.js
// Event handler functions now imported from event-handlers.js

console.log('[Story Mode] All modules imported and initialized successfully');

/**
* Show the full settings dialog popup with unified modal layout.
* Displays sidebar with overview and tabbed content area.
*
* @async
* @returns {Promise<void>}
*/
async function showSettingsDialog(initialTab = 'overview') {
    // Guard against re-entrancy: close existing dialog before opening a new one
    if (window.storyModeSettingsPopup) {
        try {
            await window.storyModeSettingsPopup.complete(POPUP_RESULT.AFFIRMATIVE);
        } catch { /* popup may already be closing */ }
    }

    const settings = extension_settings[MODULE_NAME];
    const chatState = getChatStoryState();
    const blueprintState = getBlueprintState();
    const hasBlueprint = blueprintState?.blueprint && blueprintState.useBlueprint;
    const blueprintTabDisabled = !hasBlueprint ? 'disabled' : '';
    const blueprintTabTitle = hasBlueprint
        ? 'View and manage the current scenario'
        : 'No scenario loaded - load one from the Library';
    const html = `
<div class="storymode-unified-modal">
<!-- Modal Heading -->
<div class="storymode-modal-heading">
<h2><i class="fa-solid fa-book-open"></i> Story Mode</h2>
<button id="storymode_settings_close_btn" class="storymode-header-close" style="margin-left: auto;">
<i class="fa-solid fa-times"></i> Close
</button>
</div>
<!-- Content Area -->
<div class="storymode-content-area">
<!-- Tab Navigation -->
<div class="storymode-tabs">
<button class="storymode-tab active" data-tab="overview" title="Mode selection and current configuration overview">
<i class="fa-solid fa-home"></i> Overview
</button>
<button class="storymode-tab" data-tab="genre-style" title="Configure story arc and writing style">
<i class="fa-solid fa-book-open"></i> Genre & Style
</button>
<button class="storymode-tab" data-tab="library" title="Browse and manage your scenario blueprint collection">
<i class="fa-solid fa-folder-open"></i> Library
</button>
<button class="storymode-tab ${blueprintTabDisabled}" data-tab="blueprint" title="${blueprintTabTitle}">
<i class="fa-solid fa-scroll"></i> Current Scenario
</button>
<button class="storymode-tab" data-tab="settings" title="Configure extension settings and API options">
<i class="fa-solid fa-gear"></i> Settings
</button>
</div>
<!-- Tab Content -->
<div class="storymode-tab-content">
<div id="tab_overview" class="storymode-tab-pane active">
${buildOverviewTabContent()}
</div>
<div id="tab_genre-style" class="storymode-tab-pane">
${buildGenreStyleTabContent()}
</div>
<div id="tab_library" class="storymode-tab-pane">
${buildLibraryTabContent()}
</div>
<div id="tab_blueprint" class="storymode-tab-pane">
${buildBlueprintTabContent()}
</div>
<div id="tab_settings" class="storymode-tab-pane">
${buildSettingsTabContent()}
</div>
</div>
</div>
</div>
`;
    const content = $(html);

    // Tab switching - attached to content BEFORE showing popup
    const $tabs = content.find('.storymode-tab');
    const $tabPanes = content.find('.storymode-tab-pane');
    $tabs.on('click', function () {
        // Ignore clicks on disabled tabs
        if ($(this).hasClass('disabled')) return;

        const tabName = $(this).data('tab');
        console.log('[Story Mode] Tab clicked:', tabName);

        // Clear library generation context when switching away from Library tab
        if (tabName !== 'library') {
            content.removeData('generateFromLibrary');
            // Also reset to grid view if generate view was showing
            if (content.find('#library_generate_view').is(':visible')) {
                showLibraryGridView(content);
            }
        }

        // Update tab buttons
        $tabs.removeClass('active');
        $(this).addClass('active');

        // Update tab panes - use class manipulation only (CSS handles display)
        $tabPanes.removeClass('active');
        content.find(`#tab_${tabName}`).addClass('active');

    });

    // Subtab switching (handles both Genre & Style and Settings tab subtabs)
    content.on('click', '.storymode-settings-subtab', function () {
        const subtabName = $(this).data('subtab');
        const $activeTabPane = content.find('.storymode-tab-pane.active');

        // Update subtab buttons (only within the active main tab)
        $activeTabPane.find('.storymode-settings-subtab').removeClass('active');
        $(this).addClass('active');

        // Update subtab panes (only within the active main tab)
        $activeTabPane.find('.storymode-settings-subtab-pane').removeClass('active');
        $activeTabPane.find(`#settings_subtab_${subtabName}`).addClass('active');

        // Re-populate connection profiles if switching to API Options tab
        if (subtabName === 'api_options') {
            populateConnectionProfiles(content);
        }
    });

    // Blueprint subtab switching
    content.on('click', '.storymode-blueprint-subtab', function () {
        const subtabName = $(this).data('subtab');
        // Update subtab buttons
        content.find('.storymode-blueprint-subtab').removeClass('active');
        $(this).addClass('active');

        // Update content
        const contentDiv = content.find('#blueprint_subtab_content');
        if (subtabName === 'generate') {
            // Show generate form
            contentDiv.html(buildGenerateBlueprintSubtab());
        } else {
            // Show blueprint detail tabs
            const blueprintState = getBlueprintState();
            const blueprint = blueprintState.blueprint;
            if (!blueprint) {
                contentDiv.html('<p class="storymode-form-hint">No scenario blueprint available. Generate one first.</p>');
                return;
            }
            const chatState = getChatStoryState();
            const currentScene = BlueprintModule.getCurrentScene(
                blueprint,
                chatState.currentStep,
                chatState.arcLength,
                blueprintState.sceneMode || 'auto',
                getCurrentSceneIndex()
            );
            if (subtabName === 'overview') {
                contentDiv.html(renderBlueprintOverviewSubtab(blueprint, currentScene));
            } else if (subtabName === 'opening') {
                contentDiv.html(renderBlueprintOpeningSubtab(blueprint));
            } else if (subtabName === 'scenes') {
                contentDiv.html(renderBlueprintScenesSubtab(blueprint));
            } else if (subtabName === 'characters') {
                contentDiv.html(renderBlueprintCharactersSubtab(blueprint));
            } else if (subtabName === 'json') {
                contentDiv.html(renderBlueprintJsonSubtab(blueprint));
            }
        }
    });

    // Set up all event listeners with context
    const settingsContext = {
        storyTypes,
        authorStyles,
        updateStatusDisplay,
        refreshBlueprintPreview,
        setupEventListeners,
        populateConnectionProfiles,
    };
    setupUnifiedDialogEventListeners(content, settingsContext);

    // Populate connection profiles dropdown
    populateConnectionProfiles(content);

    // Activate initial tab if specified
    if (initialTab && initialTab !== 'genre-style') {
        $tabs.removeClass('active');
        $tabPanes.removeClass('active');
        $tabs.filter(`[data-tab="${initialTab}"]`).addClass('active');
        content.find(`#tab_${initialTab}`).addClass('active');

        // Initialize tab-specific content for the initial tab
        if (initialTab === 'library') {
            // Defer to allow popup to render first
            setTimeout(() => refreshLibraryView(content), 0);
        }
    }

    // Show popup (panel-style without close button)
    const popup = new Popup(content, POPUP_TYPE.TEXT, 'Story Mode Settings', {
        wide: true,
        large: true,
        allowVerticalScrolling: true,
        okButton: false,
    });

    // Store popup reference globally so event handlers can close it
    window.storyModeSettingsPopup = popup;

    await popup.show();

    // Clear reference when popup closes
    window.storyModeSettingsPopup = null;
}
/**
* Populate connection profiles dropdowns in the dialog
*/
function populateConnectionProfiles(content) {
    const settings = extension_settings[MODULE_NAME];
    const profiles = getConnectionProfiles();

    console.log('[Story Mode] populateConnectionProfiles - Found profiles:', profiles.length);

    // Define all dropdown selectors and their corresponding settings keys
    const dropdowns = [
        { selector: '#blueprint_generation_api', settingsKey: 'blueprintSettings.generationApi' },
        { selector: '#opening_message_api', settingsKey: 'blueprintSettings.openingMessageApi' },
        { selector: '#epilogue_api', settingsKey: 'epilogueApi' },
        { selector: '#summary_api', settingsKey: 'summaryApi' },
        { selector: '#next_adventure_api', settingsKey: 'nextAdventureApi' },
        { selector: '#style_generation_api', settingsKey: 'utilityApis.styleGeneration' },
    ];

    dropdowns.forEach(({ selector, settingsKey }) => {
        const dropdown = content.find(selector);
        if (dropdown.length === 0) return;

        // Get selected value from nested settings path
        const keys = settingsKey.split('.');
        let selectedProfileId = settings;
        for (const key of keys) {
            selectedProfileId = selectedProfileId?.[key];
        }
        selectedProfileId = selectedProfileId || '';

        dropdown.empty();
        dropdown.append('<option value="">Default API</option>');

        if (profiles.length === 0) {
            dropdown.append('<option value="" disabled>No profiles available</option>');
            return;
        }

        profiles.forEach(profile => {
            const option = $('<option>').val(profile.id).text(`${profile.name} (${profile.id})`);
            dropdown.append(option);
        });

        dropdown.val(selectedProfileId || '');
    });
}

// ============================================================================
// LIBRARY HELPER FUNCTIONS (moved to lib/dialog/library-view.js)
// ============================================================================

// Create callbacks object for library functions
const libraryCallbacks = {
    refreshBlueprintPreview,
    updateStatusDisplay,
    showLibraryGridView,
    loadBlueprintsForFolder: (content, folderId) => loadBlueprintsForFolder(content, folderId, libraryCallbacks),
    refreshLibraryView: (content) => refreshLibraryView(content, libraryCallbacks),
    switchToTab: (content, tabName) => {
        const $tab = content.find(`.storymode-tab[data-tab="${tabName}"]`);
        // Enable the tab if it was disabled (e.g., blueprint tab with no scenario loaded)
        if ($tab.hasClass('disabled')) {
            $tab.removeClass('disabled');
            $tab.attr('title', 'View and manage the current scenario');
        }
        // Switch to the tab
        content.find('.storymode-tab').removeClass('active');
        $tab.addClass('active');
        content.find('.storymode-tab-pane').removeClass('active');
        content.find(`#tab_${tabName}`).addClass('active');
    },
};

/**
* Add UI components to the SillyTavern extensions panel.
* Renders the main control panel and sets up event listeners.
*
* @async
* @returns {Promise<void>}
*/
async function addUI() {
    const container = $('#extensions_settings2');
    if (container.length === 0) {
        console.warn('[Story Mode] Extensions settings container not found');
        return;
    }
    container.append(renderMainPanel());
    setupEventListeners();
    updateStatusDisplay();
    console.log('[Story Mode] UI added');
}

/**
* Setup event listeners for the main control panel.
* Handles the enable toggle and settings dialog button.
*
* @returns {void}
*/
function setupEventListeners() {
    // Clean up existing delegated handlers to prevent stacking
    $(document).off('click.storymode');
    $('#story_mode_enabled').off('change');
    $('#open_story_mode_settings').off('click');

    // Master toggle
    $('#story_mode_enabled').on('change', function () {
        const enabled = $(this).is(':checked');
        extension_settings[MODULE_NAME].enabled = enabled;
        saveSettingsDebounced();
        toastr.success('Settings saved');
        updateStoryPrompt();
        updateStatusDisplay();
    });
    // Open settings dialog
    $('#open_story_mode_settings').on('click', () => showSettingsDialog());

    // Start Story from Blueprint button (in settings dialog)
    $(document).on('click.storymode', '#start_story_from_blueprint_btn', async function () {
        const btn = $(this);
        const originalText = btn.html();
        const blueprintState = getBlueprintState();

        if (!blueprintState.blueprint) {
            toastr.error('No scenario loaded', 'Scenario Error');
            return;
        }

        // Set loading state
        btn.prop('disabled', true);
        btn.html('<i class="fa-solid fa-circle-notch fa-spin"></i> Starting...');

        try {
            // Start the story from blueprint (syncs settings, enables features)
            const result = await BlueprintModule.startStoryFromBlueprint(blueprintState.blueprint);

            if (!result.success) {
                toastr.error(result.error || 'Failed to start story', 'Scenario Error');
                return;
            }

            // Show any warnings
            result.warnings?.forEach(w => toastr.warning(w, 'Scenario Warning'));

            // Handle opening message logic (simplified - no generation option)
            const savedOpening = blueprintState.blueprint?.opening_message;

            if (savedOpening) {
                // Ask if user wants to use the saved opening message
                const useSaved = await callGenericPopup(
                    `This blueprint has a saved opening message:\n\n"${savedOpening.substring(0, 150)}${savedOpening.length > 150 ? '...' : ''}"\n\nWould you like to use it to start the story?`,
                    POPUP_TYPE.CONFIRM
                );

                if (useSaved === POPUP_RESULT.AFFIRMATIVE) {
                    await pushStoryMessage(savedOpening);
                    await saveChatConditional();
                    toastr.success('Story started with opening message!', 'Story Mode');
                } else {
                    toastr.success('Story started from scenario!', 'Story Mode');
                }
            } else {
                // Legacy blueprint without opening message
                toastr.success('Story started from scenario!', 'Story Mode');
                toastr.info('This scenario blueprint has no opening message. You can write your own first message.', 'Story Mode', { timeOut: 5000 });
            }

            // Close the settings dialog using stored popup reference
            // (avoids race condition with confirm popup DOM removal)
            if (window.storyModeSettingsPopup) {
                window.storyModeSettingsPopup.complete(POPUP_RESULT.AFFIRMATIVE);
            }

            // Update main panel UI (renderMainPanel handles its own state reads)
            $('#story_mode_panel').replaceWith(renderMainPanel());
            setupEventListeners();
        } catch (error) {
            console.error('[Story Mode] Error starting story from blueprint:', error);
            toastr.error(`Failed to start story: ${error.message}`, 'Scenario Error');
        } finally {
            btn.prop('disabled', false);
            btn.html(originalText);
        }
    });
}

// Make setupEventListeners globally accessible for blueprint-module.js
window.setupEventListeners = setupEventListeners;

// Make showSettingsDialog globally accessible for wand-menu.js
window.showStoryModeSettings = showSettingsDialog;

/**
* Update the status display on the main panel.
* Shows current story type, author style, and arc progress.
*
* @returns {void}
*/
function updateStatusDisplay() {
    const settings = extension_settings[MODULE_NAME];
    const chatState = getChatStoryState();
    let statusText;
    if (!settings.enabled) {
        statusText = 'Disabled';
    } else {
        // Get story type name from CHAT STATE (per-chat)
        const storyName = settings.storyArcEnabled && chatState.selectedStoryType
            ? storyTypes.find(t => t.id === chatState.selectedStoryType)?.name || 'None'
            : 'None';
        // Get author style name from CHAT STATE (per-chat)
        const authorName = settings.authorStyleEnabled && chatState.selectedAuthorStyle
            ? authorStyles.find(s => s.id === chatState.selectedAuthorStyle)?.name || 'Disabled'
            : 'Disabled';
        // Build compact status - all values from CHAT STATE
        statusText = `Story: ${storyName} | Author: ${authorName} | Arc ${chatState.currentStep}/${chatState.arcLength}`;
        // Add blueprint indicator if enabled and active
        if (settings.blueprintSettings?.enabled) {
            const blueprintState = getBlueprintState();
            if (blueprintState.useBlueprint && blueprintState.blueprint) {
                const currentScene = BlueprintModule.getCurrentScene(
                    blueprintState.blueprint,
                    chatState.currentStep,
                    chatState.arcLength,
                    blueprintState.sceneMode,
                    getCurrentSceneIndex()
                );
                if (currentScene) {
                    statusText += ` | <span class="storymode-blueprint-indicator"><i class="fa-solid fa-scroll"></i> Blueprint: Scene ${currentScene.index + 1}/${blueprintState.blueprint.scene_plan.length}</span>`;
                }
            }
        }
    }
    //update the status text
    const statusEl = $('.storymode-status');
    if (statusEl.length > 0) {
        statusEl.html(`<small>${statusText}</small>`);
    }
    // Also update the arc badge if the settings dialog is currently open
    const badge = $('#arc_progress_badge');
    if (badge.length > 0) {
        if (chatState.currentStep === 0) {
            badge.text(`Round 0/${chatState.arcLength} | Not Started`);
        } else if (chatState.currentStep >= chatState.arcLength) {
            badge.text(`Arc Complete (${chatState.arcLength}/${chatState.arcLength})`);
        } else {
            const phaseInfo = getPhaseInfo(chatState.currentStep, chatState.arcLength);
            badge.text(`Step ${chatState.currentStep}/${chatState.arcLength} | ${phaseInfo.phase}`);
        }
    }

    // Update Story Controller Panel
    updateControllerPanel();
}





/**
* Refresh the blueprint preview section in the main panel.
* Updates or adds/removes the blueprint preview based on current blueprint state.
*
* @returns {void}
*/
function refreshBlueprintPreview() {
    const settings = extension_settings[MODULE_NAME];
    const blueprintState = getBlueprintState();
    const baseSettings = $('#story_mode_base_settings');

    // Remove existing blueprint preview if present
    baseSettings.find('.storymode-blueprint-preview').remove();

    // Show blueprint preview if enabled and blueprint exists
    if (settings.blueprintSettings?.enabled && blueprintState.blueprint) {
        const previewHtml = renderBlueprintPreview(blueprintState);
        // Insert after the status display
        const statusDiv = baseSettings.find('.storymode-status');
        statusDiv.after(previewHtml);
    }
}

// Make functions globally accessible for blueprint-module.js, type-editors.js, and event-handlers.js
window.updateStatusDisplay = updateStatusDisplay;
window.updateStoryPrompt = updateStoryPrompt;
window.refreshBlueprintPreview = refreshBlueprintPreview;
window.updateControllerPanel = updateControllerPanel;
window.updateWandMenuStatus = updateWandMenuStatus;

/**
* Update the story type dropdown in the settings dialog.
* Populates options from the storyTypes array with the current selection preserved.
*
* @param {jQuery} content - The jQuery content object containing the dialog.
* @returns {void}
*/
function updateStoryTypeDropdownInDialog(content) {
    const dropdown = content.find('#story_type_select');
    const chatState = getChatStoryState();
    const selected = chatState.selectedStoryType; // Read from chat state
    dropdown.empty();
    dropdown.append('<option value="">None</option>');
    // Sort story types alphabetically by name
    const sortedTypes = [...storyTypes].sort((a, b) => a.name.localeCompare(b.name));
    sortedTypes.forEach(type => {
        const option = $('<option></option>')
            .val(type.id)
            .text(type.name + ' (' + type.category.join(', ') + ')');
        if (type.id === selected) {
            option.prop('selected', true);
        }
        dropdown.append(option);
    });
    // Update story type description
    const selectedStoryType = storyTypes.find(t => t.id === selected);
    const description = selectedStoryType ? selectedStoryType.storyPrompt : 'Select a story type to see its description';
    const descriptionEl = content.find('#story_type_description');
    if (descriptionEl.length > 0) {
        descriptionEl.text(description);
    }
}
/**
* Update the author style dropdown in the settings dialog.
* Supports optional fuzzy search via the searchQuery parameter.
*
* @param {jQuery} content - The jQuery content object containing the dialog.
* @param {string} [searchQuery=''] - Optional search query for filtering styles.
* @returns {void}
*/
function updateAuthorStyleDropdownInDialog(content, searchQuery = '') {
    const dropdown = content.find('#author_style_select');
    const chatState = getChatStoryState();
    const selected = chatState.selectedAuthorStyle; // Read from chat state
    dropdown.empty();
    dropdown.append('<option value="">None</option>');
    let filteredStyles = authorStyles;
    // Apply fuzzy search if query provided
    if (searchQuery && fuseAuthorStyles) {
        const results = fuseAuthorStyles.search(searchQuery);
        filteredStyles = results.map(r => r.item);
    } else {
        // Sort alphabetically by name when not searching
        filteredStyles = [...authorStyles].sort((a, b) => a.name.localeCompare(b.name));
    }
    filteredStyles.forEach(style => {
        const option = $('<option></option>')
            .val(style.id)
            .text(style.name + ' (' + style.category.join(', ') + ')');
        if (style.id === selected) {
            option.prop('selected', true);
        }
        dropdown.append(option);
    });
    // Update author style description
    const selectedAuthorStyle = authorStyles.find(s => s.id === selected);
    const description = selectedAuthorStyle ? selectedAuthorStyle.authorPrompt : 'Select an author style to see its guidance';
    const descriptionEl = content.find('#author_style_description');
    if (descriptionEl.length > 0) {
        descriptionEl.text(description);
    }

    // Also populate the default author style dropdown
    const defaultDropdown = content.find('#default_author_style_select');
    if (defaultDropdown.length > 0) {
        const settings = extension_settings[MODULE_NAME];
        const defaultSelected = settings.defaultAuthorStyle;
        defaultDropdown.empty();
        defaultDropdown.append('<option value="">None</option>');
        filteredStyles.forEach(style => {
            const option = $('<option></option>')
                .val(style.id)
                .text(style.name + ' (' + style.category.join(', ') + ')');
            if (style.id === defaultSelected) {
                option.prop('selected', true);
            }
            defaultDropdown.append(option);
        });
    }
}

/**
* Update the arc progress badge in the settings dialog.
* Displays current step, arc length, and current phase.
*
* @param {jQuery} content - The jQuery content object containing the dialog.
* @returns {void}
*/
function updateArcBadgeInDialog(content) {
    const chatState = getChatStoryState();
    const badge = content.find('#arc_progress_badge');
    if (chatState.currentStep === 0) {
        badge.text(`Round 0/${chatState.arcLength} | Not Started`);
    } else if (chatState.currentStep >= chatState.arcLength) {
        badge.text(`Arc Complete (${chatState.arcLength}/${chatState.arcLength})`);
    } else {
        const phaseInfo = getPhaseInfo(chatState.currentStep, chatState.arcLength);
        badge.text(`Step ${chatState.currentStep}/${chatState.arcLength} | ${phaseInfo.phase}`);
    }
}

/**
* Update story type dropdown
*/
function updateStoryTypeDropdown() {
    const dropdown = $('#story_type_select');
    const chatState = getChatStoryState();
    const selected = chatState.selectedStoryType;
    dropdown.empty();
    dropdown.append('<option value="">None</option>');
    // Sort story types alphabetically by name
    const sortedTypes = [...storyTypes].sort((a, b) => a.name.localeCompare(b.name));
    sortedTypes.forEach(type => {
        const option = $('<option></option>')
            .val(type.id)
            .text(type.name + ' (' + type.category.join(', ') + ')');
        if (type.id === selected) {
            option.prop('selected', true);
        }
        dropdown.append(option);
    });
}

// Make updateStoryTypeDropdown globally accessible for type-editors.js
window.updateStoryTypeDropdown = updateStoryTypeDropdown;

/**
* Update author style dropdown with optional search
*/
function updateAuthorStyleDropdown(searchQuery = '') {
    const dropdown = $('#author_style_select');
    const chatState = getChatStoryState();
    const selected = chatState.selectedAuthorStyle;
    dropdown.empty();
    dropdown.append('<option value="">None</option>');
    let filteredStyles = authorStyles;
    // Apply fuzzy search if query provided
    if (searchQuery && fuseAuthorStyles) {
        const results = fuseAuthorStyles.search(searchQuery);
        filteredStyles = results.map(r => r.item);
    } else {
        // Sort alphabetically by name when not searching
        filteredStyles = [...authorStyles].sort((a, b) => a.name.localeCompare(b.name));
    }
    filteredStyles.forEach(style => {
        const option = $('<option></option>')
            .val(style.id)
            .text(style.name + ' (' + style.category.join(', ') + ')');
        if (style.id === selected) {
            option.prop('selected', true);
        }
        dropdown.append(option);
    });
}

// Make updateAuthorStyleDropdown globally accessible for type-editors.js
window.updateAuthorStyleDropdown = updateAuthorStyleDropdown;

/**
* Update arc progress badge
*/
function updateArcBadge() {
    const chatState = getChatStoryState();
    const badge = $('#arc_progress_badge');
    if (chatState.currentStep === 0) {
        badge.text(`Round 0/${chatState.arcLength} | Not Started`);
    } else if (chatState.currentStep >= chatState.arcLength) {
        badge.text(`Arc Complete (${chatState.arcLength}/${chatState.arcLength})`);
    } else {
        const phaseInfo = getPhaseInfo(chatState.currentStep, chatState.arcLength);
        badge.text(`Step ${chatState.currentStep}/${chatState.arcLength} | ${phaseInfo.phase}`);
    }
}

// Type editor functions now imported from type-editors.js
// Event handler functions now imported from event-handlers.js

/**
 * Hook: Chat changed
 */
function onChatChanged() {
    // Reset flags
    setRegenerating(false);
    setLoadingChat(true); // Set flag to prevent increment during chat load

    // Debug: Log blueprint state on chat change
    const blueprintState = getBlueprintState();
    const summaryCount = Object.keys(blueprintState?.sceneSummaries || {}).length;
    console.debug('[Story Mode] Chat changed - blueprintState has', summaryCount, 'summaries, useBlueprint:', blueprintState?.useBlueprint);

    // Update UI
    updateStoryPrompt();
    updateStatusDisplay();
    refreshBlueprintPreview();
    updateWandMenuStatus();
    console.debug('[Story Mode] Chat changed, state reloaded');
    // Reset the loading flag after a short delay to allow chat to fully load
    setTimeout(() => {
        setLoadingChat(false);
        // Refresh controller panel again after chat is fully loaded
        // This ensures scene images and other metadata are displayed correctly
        updateControllerPanel();
        console.debug('[Story Mode] Chat loading complete');
    }, 1000);
}

/**
 * Initialize extension
 */
jQuery(async function () {
    console.log('[Story Mode] Extension loading...');

    // Load Fuse.js (from state-manager)
    await loadFuseJS();

    // Load settings (from state-manager)
    loadSettings();

    // Load data from localForage (from state-manager)
    await loadStoryTypes();
    await loadAuthorStyles();

    // Sync local references with state manager
    syncDataReferences();

    // Load original versions for revert functionality (from state-manager)
    await loadOriginalStoryTypes();
    await loadOriginalAuthorStyles();

    // Migration: Check if old data exists in extension_settings (from state-manager)
    await migrateFromExtensionSettings();

    // Sync again after migration
    syncDataReferences();

    // Initialize Blueprint module
    await BlueprintModule.initBlueprintSettings();
    console.log('[Story Mode] Blueprint module initialized');

    // Initialize Loading Indicator module
    console.log('[Story Mode] Loading Indicator module initialized');

    // Initialize Scene Image Storage (with graceful degradation)
    try {
        SceneImageStorage.initializeStorage();
        console.log('[Story Mode] Scene Image Storage initialized');
    } catch (error) {
        console.warn('[Story Mode] Scene Image Storage initialization failed, disabling feature:', error);
        // Disable image generation if storage initialization fails
        const settings = extension_settings[MODULE_NAME];
        if (settings.imageGeneration) {
            settings.imageGeneration.enabled = false;
        }
    }

    // Add UI
    await addUI();

    // Initialize controller panel
    updateControllerPanel();

    // Register wand menu entry
    registerWandMenuEntry();

    // Register event hooks
    eventSource.on(event_types.GENERATION_STARTED, () => {
        // Clear the loading flag when generation starts
        setLoadingChat(false);
        if (chat.length > 0) {
            setRegenerating(false); // fresh generation
            console.debug('[Story Mode] Generation started (normal)');
            updateStoryPrompt();
        } else {
            setRegenerating(true); // This is the initial message and chat set up, don't increment the story count
            console.debug('[Story Mode] initial message set up - no increment');
        }
    });

    eventSource.on(event_types.MESSAGE_SWIPED, (data) => {
        setRegenerating(true);
        console.debug('[Story Mode] Swipe/regenerate detected:', data);
        updateStoryPrompt();
    });

    if (event_types.MESSAGE_REGENERATED) {
        eventSource.on(event_types.MESSAGE_REGENERATED, (data) => {
            setRegenerating(true);
            console.debug('[Story Mode] Regenerate detected:', data);
            updateStoryPrompt();
        });
    }

    eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
    eventSource.on(event_types.USER_MESSAGE_RENDERED, onUserMessageRendered);
    eventSource.on(event_types.CHAT_CHANGED, onChatChanged);

    // ============================================================================
    // WIZARD MODE EVENT HANDLERS
    // ============================================================================

    /**
     * Handle phase updates during wizard mode blueprint generation
     * Updates the wizard UI with progress and partial blueprint data
     */
    eventSource.on('STORY_MODE_PHASE_UPDATE', (data) => {
        console.log('[Story Mode] Phase update received:', data);
        const { phase, progress, blueprint } = data;

        // Update wizard progress indicator
        updateWizardProgress(phase);

        // Update wizard preview panel
        updateWizardPreview(blueprint, phase);
    });

    // Initial prompt injection
    updateStoryPrompt();

    console.log('[Story Mode] Extension loaded successfully');
});

// ============================================================================
// LIBRARY HELPERS (used by wizard and library tabs)
// ============================================================================

// Wizard functions moved to lib/dialog/wizard.js:
// - getWizardFormData, createWizardModalHtml, validateBlueprint, launchWizardModal
// - updateWizardProgress, updateWizardPreview, getPhaseMessage, handleWizardAutoCover
//
// Library functions moved to lib/dialog/library-view.js:
// - debounce, refreshLibraryView, loadBlueprintsForFolder, sortLibraryBlueprints
// - searchLibraryBlueprints, renderBlueprintGrid, loadBlueprintFromLibrary
// - playBlueprintFromLibrary, editBlueprintFromLibrary, toggleBlueprintFavorite
// - deleteBlueprintFromLibrary, exportBlueprintFromLibrary, refreshSidebar
// - returnToLibraryIfNeeded

