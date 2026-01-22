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
    doNewChat,
} from '/script.js';

import {
    extension_settings,
    getContext,
} from '/scripts/extensions.js';
import { getFileText, download } from '/scripts/utils.js';
import { callGenericPopup, Popup, POPUP_TYPE, POPUP_RESULT } from '/scripts/popup.js';
import { Popper } from '/lib.js';

// Import Blueprint module (Story Blueprints feature)
import * as BlueprintModule from './lib/blueprint/module.js';

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
    decodeBlueprintFromPNG,
    isBlueprintPNG,
    saveCurrentBlueprintToLibrary,
} from './lib/blueprint/integration.js';

// Import Scene Image Generation modules
import * as SceneImageStorage from './lib/scene/image-storage.js';
import * as SceneImageGenerator from './lib/scene/image-generator.js';

// Import Blueprint Export module (extended PNG format)
import { exportBlueprintAsPNG } from './lib/blueprint/export.js';

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
    getOriginalStoryType,
    getOriginalAuthorStyle,
    getConnectionProfiles,
    migrateFromExtensionSettings,
    getCurrentSceneIndex,
    setCurrentSceneIndex,
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

// Import UI Component System module (for utilities)
import { escapeHtml } from './lib/ui/component-system.js';

// Import UI Components module
import {
    renderMainPanel,
    renderBlueprintPreview,
    buildSidebarContent,
    buildStoryArcSubtab,
    buildAuthorStyleSubtab,
    buildBlueprintSettingsSubtab,
    buildPostArcOptionsSubtab,
    buildAPIOptionsSubtab,
    buildGenreStyleTabContent,
    buildSettingsTabContent,
    buildGenerateBlueprintSubtab,
    buildBlueprintTabContent,
    renderBlueprintOverviewSubtab,
    renderBlueprintScenesSubtab,
    renderBlueprintCharactersSubtab,
    renderBlueprintJsonSubtab,
    buildLibraryTabContent,
    showLibraryGenerateView,
    showLibraryGridView,
    renderBlueprintCard,
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

// Local aliases for backward compatibility with existing code
// These will be replaced as we extract more modules
const getStoryTypesLocal = () => getStoryTypes();
const getAuthorStylesLocal = () => getAuthorStyles();

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
let lastMessageId = null;

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
async function showSettingsDialog(initialTab = 'genre-style') {
    const settings = extension_settings[MODULE_NAME];
    const chatState = getChatStoryState();
    const html = `
<div class="storymode-unified-modal">
<!-- Modal Heading -->
<div class="storymode-modal-heading">
<h2><i class="fa-solid fa-book-open"></i> Story Mode</h2>
</div>
<!-- Content Area -->
<div class="storymode-content-area">
<!-- Tab Navigation -->
<div class="storymode-tabs">
<button class="storymode-tab active" data-tab="genre-style" title="Configure story arc and writing style">
<i class="fa-solid fa-book-open"></i> Genre & Style
</button>
<button class="storymode-tab" data-tab="library" title="Browse and manage your scenario blueprint collection">
<i class="fa-solid fa-folder-open"></i> Library
</button>
<button class="storymode-tab" data-tab="blueprint" title="View and manage the current scenario">
<i class="fa-solid fa-scroll"></i> Current Scenario
</button>
<button class="storymode-tab" data-tab="settings" title="Configure extension settings and API options">
<i class="fa-solid fa-gear"></i> Settings
</button>
</div>
<!-- Tab Content -->
<div class="storymode-tab-content">
<div id="tab_genre-style" class="storymode-tab-pane active">
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

    /**
     * Return to library grid view if generation was initiated from library context.
     * Clears the context flag and switches views.
     * @returns {boolean} True if returned to library, false if not from library context
     */
    function returnToLibraryIfNeeded() {
        const wasFromLibrary = content.data('generateFromLibrary');
        if (wasFromLibrary) {
            content.removeData('generateFromLibrary');
            showLibraryGridView(content);
            return true;
        }
        return false;
    }

    // Tab switching - attached to content BEFORE showing popup
    const $tabs = content.find('.storymode-tab');
    const $tabPanes = content.find('.storymode-tab-pane');
    $tabs.on('click', function () {
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

        console.log('[Story Mode] Tab pane classes after switch:');
        $tabPanes.each(function () {
            console.log('[Story Mode]', $(this).attr('id'), 'has active:', $(this).hasClass('active'));
        });
    });

    // Subtab switching (handles both Genre & Style and Settings tab subtabs)
    content.on('click', '.storymode-settings-subtab', function () {
        const subtabName = $(this).data('subtab');
        // Update subtab buttons
        content.find('.storymode-settings-subtab').removeClass('active');
        $(this).addClass('active');
        // Update subtab panes
        content.find('.storymode-settings-subtab-pane').removeClass('active');
        content.find(`#settings_subtab_${subtabName}`).addClass('active');
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
            const blueprintState = BlueprintModule.getBlueprintState();
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
        updatePreviewInDialog,
        refreshBlueprintPreview,
        setupEventListeners,
        populateConnectionProfiles,
    };
    setupUnifiedDialogEventListeners(content, settingsContext);

    // Populate connection profiles dropdown
    populateConnectionProfiles(content);

    // Update prompt preview
    updatePreviewInDialog(content);

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
    });

    await popup.show();
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
    // Master toggle
    $('#story_mode_enabled').on('change', function () {
        const enabled = $(this).is(':checked');
        extension_settings[MODULE_NAME].enabled = enabled;
        saveSettingsDebounced();
        updateStoryPrompt();
        updateStatusDisplay();
    });
    // Open settings dialog
    $('#open_story_mode_settings').on('click', showSettingsDialog);

    // Start Story from Blueprint button (in settings dialog)
    $(document).on('click', '#start_story_from_blueprint_btn', async function () {
        const btn = $(this);
        const originalText = btn.html();
        const blueprintState = BlueprintModule.getBlueprintState();

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

            // Close the settings dialog (try multiple methods for reliability)
            const popup = btn.closest('.popup');
            const okButton = popup.find('.popup-button-ok');
            if (okButton.length > 0) {
                okButton.trigger('click');
            } else {
                // Fallback: close all popups
                $('.popup').find('.popup-close, .popup-button-cancel, .popup-button-ok').trigger('click');
            }

            // Update main panel UI
            updateStatusDisplay();
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
/**
* Setup event listeners for the settings dialog.
* Handles all form inputs including toggles, dropdowns, sliders, and buttons.
*
* @param {jQuery} content - The jQuery content object containing the dialog UI.
* @returns {void}
*/
function setupDialogEventListeners(content) {
    // Master toggle in dialog (syncs with main)
    content.find('#story_mode_enabled').on('change', function () {
        const enabled = $(this).is(':checked');
        extension_settings[MODULE_NAME].enabled = enabled;
        $('#story_mode_enabled').prop('checked', enabled); // Sync with main panel
        content.find('#story_mode_content').toggle(enabled);
        saveSettingsDebounced();
        updateStoryPrompt();
        updateStatusDisplay();
    });
    // Story arc toggle
    content.find('#story_arc_enabled').on('change', function () {
        const enabled = $(this).is(':checked');
        extension_settings[MODULE_NAME].storyArcEnabled = enabled;
        content.find('#story_arc_controls').toggle(enabled);
        saveSettingsDebounced();
        updateStoryPrompt();
        updatePreviewInDialog(content);
        updateStatusDisplay();
    });
    // Story type selection
    content.find('#story_type_select').on('change', async function () {
        const selectedType = $(this).val();
        // Update global settings (default for new chats)
        extension_settings[MODULE_NAME].selectedStoryType = selectedType;
        saveSettingsDebounced();
        // Update current chat metadata
        const chatState = getChatStoryState();
        chatState.selectedStoryType = selectedType;
        await saveChatStoryState(chatState);
        // Update story type description
        const selectedStoryType = storyTypes.find(t => t.id === selectedType);
        const description = selectedStoryType ? selectedStoryType.storyPrompt : 'Select a story type to see its description';
        content.find('#story_type_description').text(description);
        updateStoryPrompt();
        updatePreviewInDialog(content);
        updateStatusDisplay();
    });
    // Arc length slider
    content.find('#arc_length_slider').on('input', async function () {
        const value = parseInt($(this).val());
        // Update global settings (default for new chats)
        extension_settings[MODULE_NAME].arcLength = value;
        content.find('#arc_length_value').text(value);
        saveSettingsDebounced();
        // Update current chat metadata
        const chatState = getChatStoryState();
        chatState.arcLength = value;
        await saveChatStoryState(chatState);
        updateArcBadgeInDialog(content);
        updatePreviewInDialog(content);
        updateStatusDisplay();
    });
    // Reset arc
    content.find('#reset_arc_btn').on('click', function () {
        if (confirm('Reset the story arc? This will set the round counter back to 0.')) {
            const chatState = getChatStoryState();
            chatState.currentStep = 0;
            chatState.arcStarted = false;
            chatState.epilogueShown = false;
            chatState.summaryShown = false;
            chatState.endNoticeShown = false;
            saveChatStoryState(chatState);
            updateArcBadgeInDialog(content);
            updateStoryPrompt();
            updatePreviewInDialog(content);
            updateStatusDisplay();
            toastr.success('Story arc reset');
        }
    });
    // Author style toggle
    content.find('#author_style_enabled').on('change', function () {
        const enabled = $(this).is(':checked');
        extension_settings[MODULE_NAME].authorStyleEnabled = enabled;
        content.find('#author_style_controls').toggle(enabled);
        saveSettingsDebounced();
        updateStoryPrompt();
        updatePreviewInDialog(content);
    });
    // Author style search
    content.find('#author_style_search').on('input', function () {
        const query = $(this).val();
        updateAuthorStyleDropdownInDialog(content, query);
    });
    // Author style selection
    content.find('#author_style_select').on('change', async function () {
        const selectedStyle = $(this).val();
        // Update global settings (default for new chats)
        extension_settings[MODULE_NAME].selectedAuthorStyle = selectedStyle;
        saveSettingsDebounced();
        // Update current chat metadata
        const chatState = getChatStoryState();
        chatState.selectedAuthorStyle = selectedStyle;
        await saveChatStoryState(chatState);
        // Update author style description
        const selectedAuthorStyle = authorStyles.find(s => s.id === selectedStyle);
        const description = selectedAuthorStyle ? selectedAuthorStyle.authorPrompt : 'Select an author style to see its guidance';
        content.find('#author_style_description').text(description);
        updateStoryPrompt();
        updatePreviewInDialog(content);
        updateStatusDisplay();
    });
    // NSFW toggle
    content.find('#nsfw_enabled').on('change', function () {
        extension_settings[MODULE_NAME].nsfwEnabled = $(this).is(':checked');
        saveSettingsDebounced();
        updateStoryPrompt();
        updatePreviewInDialog(content);
    });
    // Epilogue toggle
    content.find('#epilogue_enabled').on('change', function () {
        extension_settings[MODULE_NAME].epilogueEnabled = $(this).is(':checked');
        saveSettingsDebounced();
    });
    // Summary toggle
    content.find('#summary_enabled').on('change', function () {
        extension_settings[MODULE_NAME].summaryEnabled = $(this).is(':checked');
        saveSettingsDebounced();
    });
    // Summary message count slider
    content.find('#summary_message_count_slider').on('input', function () {
        const value = parseInt($(this).val());
        extension_settings[MODULE_NAME].summaryMessageCount = value;
        content.find('#summary_message_count_value').text(value === 0 ? 'Entire Chat' : value);
        saveSettingsDebounced();
    });
    // Debug mode toggle
    content.find('#debug_mode_enabled').on('change', function () {
        extension_settings[MODULE_NAME].debugMode = $(this).is(':checked');
        saveSettingsDebounced();
        updateStoryPrompt();
    });
    // Blueprint settings
    content.find('#blueprint_enabled').on('change', function () {
        const enabled = $(this).is(':checked');
        if (!extension_settings[MODULE_NAME].blueprintSettings) {
            extension_settings[MODULE_NAME].blueprintSettings = {};
        }
        extension_settings[MODULE_NAME].blueprintSettings.enabled = enabled;
        content.find('#blueprint_controls').toggle(enabled);
        saveSettingsDebounced();
        updateStoryPrompt();
        updateStatusDisplay();
        // Refresh main panel to show/hide generate button
        $('#story_mode_panel').replaceWith(renderMainPanel());
        setupEventListeners();
    });
    content.find('#blueprint_use_scene_prompts').on('change', function () {
        const enabled = $(this).is(':checked');
        if (!extension_settings[MODULE_NAME].blueprintSettings) {
            extension_settings[MODULE_NAME].blueprintSettings = {};
        }
        extension_settings[MODULE_NAME].blueprintSettings.useScenePrompts = enabled;
        saveSettingsDebounced();
        updateStoryPrompt();
    });
    content.find('#blueprint_beat_tracking').on('change', function () {
        updateBlueprintSetting('beatTrackingEnabled', $(this).is(':checked'));
        // Refresh main panel to show/hide beat progress
        $('#story_mode_panel').replaceWith(renderMainPanel());
        setupEventListeners();
    });
    content.find('#blueprint_generation_api').on('change', function () {
        const selectedApi = $(this).val() || null;
        if (!extension_settings[MODULE_NAME].blueprintSettings) {
            extension_settings[MODULE_NAME].blueprintSettings = {};
        }
        extension_settings[MODULE_NAME].blueprintSettings.generationApi = selectedApi;
        saveSettingsDebounced();
        console.log('[Story Mode] Generation API changed to:', selectedApi || 'main API');
    });
    content.find('#edit_blueprint_master_prompt').on('click', async function () {
        const currentPrompt = BlueprintModule.getEffectiveMasterPrompt();
        const result = await Popup.show.input(
            'Edit Blueprint Master Prompt Template',
            'Enter the master prompt template for blueprint generation. Variables like {{STORY_TYPE_JSON}}, {{METAPHOR_LEVEL}}, etc. will be replaced at generation time.',
            currentPrompt,
            { rows: 15, okButton: 'Save', wide: true, large: true }
        );
        if (result) {
            if (!extension_settings[MODULE_NAME].blueprintSettings) {
                extension_settings[MODULE_NAME].blueprintSettings = {};
            }
            extension_settings[MODULE_NAME].blueprintSettings.masterPrompt = result;
            saveSettingsDebounced();
            toastr.success('Blueprint master prompt template updated');
        }
    });
    // Injection settings
    content.find('#injection_position').on('change', function () {
        extension_settings[MODULE_NAME].position = parseInt($(this).val());
        saveSettingsDebounced();
        updateStoryPrompt();
    });
    content.find('#injection_depth').on('change', function () {
        extension_settings[MODULE_NAME].depth = parseInt($(this).val());
        saveSettingsDebounced();
        updateStoryPrompt();
    });
    content.find('#injection_role').on('change', function () {
        extension_settings[MODULE_NAME].role = parseInt($(this).val());
        saveSettingsDebounced();
        updateStoryPrompt();
    });
    // Edit buttons
    content.find('#edit_story_types_btn').on('click', showStoryTypesEditor);
    content.find('#edit_author_styles_btn').on('click', showAuthorStylesEditor);
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
            const blueprintState = BlueprintModule.getBlueprintState();
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
    const blueprintState = BlueprintModule.getBlueprintState();
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
* Update the prompt preview section in the settings dialog.
* Shows the full injection text with arc length ignored for preview purposes.
*
* @param {jQuery} content - The jQuery content object containing the dialog.
* @returns {void}
*/
function updatePreviewInDialog(content) {
    const preview = content.find('#prompt_preview');
    const promptText = buildFullInjection(true);
    if (promptText) {
        preview.text(promptText);
    } else {
        preview.text('(No prompt will be injected with current settings)');
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

/**
* Update prompt preview
*/
function updatePreview() {
    const preview = $('#prompt_preview');
    const promptText = buildFullInjection(true);
    if (promptText) {
        preview.text(promptText);
    } else {
        preview.text('(No prompt will be injected with current settings)');
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
    // Update UI
    updateStoryPrompt();
    updateStatusDisplay();
    refreshBlueprintPreview();
    updateWandMenuStatus();
    console.debug('[Story Mode] Chat changed, state reloaded');
    // Reset the loading flag after a short delay to allow chat to fully load
    setTimeout(() => {
        setLoadingChat(false);
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

    // Pass loaded story types and author styles to blueprint module
    BlueprintModule.setStoryTypes(storyTypes);
    BlueprintModule.setAuthorStyles(authorStyles);
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

