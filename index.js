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

// Import UI Components module (wizard components)
import {
    buildWizardProgressHTML,
    buildWizardPreview,
    buildPrimaryEndingDisplay,
} from './lib/ui/components.js';

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
<button class="storymode-tab" data-tab="library" title="Browse and manage your blueprint collection">
<i class="fa-solid fa-folder-open"></i> Library
</button>
<button class="storymode-tab" data-tab="blueprint" title="View and manage the current story blueprint">
<i class="fa-solid fa-scroll"></i> Blueprint
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
                contentDiv.html('<p class="storymode-form-hint">No blueprint available. Generate one first.</p>');
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

    // Set up all event listeners
    setupUnifiedDialogEventListeners(content);

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

/**
 * Helper function to update blueprint setting and refresh UI
 * @param {string} key - Setting key
 * @param {any} value - Setting value
 */
function updateBlueprintSetting(key, value) {
    if (!extension_settings[MODULE_NAME].blueprintSettings) {
        extension_settings[MODULE_NAME].blueprintSettings = {};
    }
    extension_settings[MODULE_NAME].blueprintSettings[key] = value;
    saveSettingsDebounced();
    updateStoryPrompt();
}

/**
* Setup event listeners for the unified settings dialog.
*
* @param {jQuery} content - The jQuery content object containing the dialog UI.
*/
function setupUnifiedDialogEventListeners(content) {
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
        extension_settings[MODULE_NAME].selectedStoryType = selectedType;
        saveSettingsDebounced();
        const chatState = getChatStoryState();
        chatState.selectedStoryType = selectedType;
        await saveChatStoryState(chatState);
        // Update story type description
        const selectedStoryType = storyTypes.find(t => t.id === selectedType);
        const description = selectedStoryType ? selectedStoryType.storyPrompt : 'Select a story type to see its description';
        content.find('#story_type_description').text(description);
        // One-way sync: Update blueprint dropdown if it exists
        content.find('#blueprint_story_type').val(selectedType);
        updateStoryPrompt();
        updatePreviewInDialog(content);
        updateStatusDisplay();
        refreshSidebar(content);
    });
    // Arc length slider and input
    const updateArcLength = async function (value) {
        const clampedValue = Math.max(5, Math.min(150, parseInt(value)));
        extension_settings[MODULE_NAME].arcLength = clampedValue;
        content.find('#arc_length_slider').val(clampedValue);
        content.find('#arc_length_value').val(clampedValue);
        saveSettingsDebounced();
        const chatState = getChatStoryState();
        chatState.arcLength = clampedValue;
        await saveChatStoryState(chatState);
        updatePreviewInDialog(content);
        updateStatusDisplay();
    };
    content.find('#arc_length_slider').on('input', async function () {
        await updateArcLength($(this).val());
    });
    content.find('#arc_length_value').on('change', async function () {
        await updateArcLength($(this).val());
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
    // Author style selection
    content.find('#author_style_select').on('change', async function () {
        const selectedStyle = $(this).val();
        extension_settings[MODULE_NAME].selectedAuthorStyle = selectedStyle;
        saveSettingsDebounced();
        const chatState = getChatStoryState();
        chatState.selectedAuthorStyle = selectedStyle;
        await saveChatStoryState(chatState);
        // Update author style description
        const selectedAuthorStyle = authorStyles.find(s => s.id === selectedStyle);
        const description = selectedAuthorStyle ? selectedAuthorStyle.authorPrompt : 'Select an author style to see its guidance';
        content.find('#author_style_description').text(description);
        // One-way sync: Update blueprint dropdown if it exists
        content.find('#blueprint_author_style').val(selectedStyle);
        updateStoryPrompt();
        updatePreviewInDialog(content);
        updateStatusDisplay();
        refreshSidebar(content);
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
        content.find('#summary_message_count_value').text(value === 0 ? 'All' : value);
        saveSettingsDebounced();
    });
    // Debug mode toggle
    content.find('#debug_mode_enabled').on('change', function () {
        extension_settings[MODULE_NAME].debugMode = $(this).is(':checked');
        saveSettingsDebounced();
        updateStoryPrompt();
    });
    // Controller Mode dropdown (Disabled / Floating / Docked)
    content.find('#controller_mode_select').on('change', function () {
        const mode = $(this).val();

        if (mode === 'disabled') {
            extension_settings[MODULE_NAME].debugPanelEnabled = false;
        } else if (mode === 'floating') {
            extension_settings[MODULE_NAME].debugPanelEnabled = true;
            extension_settings[MODULE_NAME].debugPanelDocked = false;
        } else if (mode === 'docked') {
            extension_settings[MODULE_NAME].debugPanelEnabled = true;
            extension_settings[MODULE_NAME].debugPanelDocked = true;
        }

        saveSettingsDebounced();
        updateControllerPanel();
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
    // Reset arc button (sidebar)
    content.find('#sidebar_reset_arc_btn').on('click', async function () {
        if (confirm('Reset the story arc? This will set the round counter back to 0.')) {
            const chatState = getChatStoryState();
            chatState.currentStep = 0;
            chatState.arcStarted = false;
            chatState.epilogueShown = false;
            chatState.summaryShown = false;
            chatState.endNoticeShown = false;
            await saveChatStoryState(chatState);
            updateStoryPrompt();
            updateStatusDisplay();
            toastr.success('Story arc reset');
            // Refresh current step display
            content.find('#current_step_display').text('Not Started');
        }
    });
    // Blueprint settings
    content.find('#blueprint_enabled, #blueprint_enabled_tab').on('change', function () {
        const enabled = $(this).is(':checked');
        if (!extension_settings[MODULE_NAME].blueprintSettings) {
            extension_settings[MODULE_NAME].blueprintSettings = {};
        }
        extension_settings[MODULE_NAME].blueprintSettings.enabled = enabled;
        saveSettingsDebounced();
        updateStoryPrompt();
        updateStatusDisplay();
        populateConnectionProfiles(content);
        setupUnifiedDialogEventListeners(content);
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
    content.find('#blueprint_scene_transition_notify').on('change', function () {
        const value = $(this).val() || 'none';
        if (!extension_settings[MODULE_NAME].blueprintSettings) {
            extension_settings[MODULE_NAME].blueprintSettings = {};
        }
        extension_settings[MODULE_NAME].blueprintSettings.sceneTransitionNotify = value;
        saveSettingsDebounced();
    });
    // Scene Summarization settings
    const summarizationSettings = [
        { selector: '#blueprint_summarization_enabled', key: 'summarizationEnabled', transform: v => $(v).is(':checked') },
        { selector: '#blueprint_summarize_after_scenes', key: 'summarizeAfterScenes', transform: v => parseInt($(v).val()) },
        { selector: '#blueprint_summary_max_tokens', key: 'summaryMaxTokens', transform: v => parseInt($(v).val()) },
        { selector: '#blueprint_include_summaries', key: 'includeSummariesInPrompt', transform: v => $(v).is(':checked'), updatePrompt: true },
        { selector: '#blueprint_summary_style', key: 'summaryStyle', transform: v => $(v).val() },
    ];

    summarizationSettings.forEach(({ selector, key, transform, updatePrompt }) => {
        content.find(selector).on('change', function () {
            if (!extension_settings[MODULE_NAME].blueprintSettings) {
                extension_settings[MODULE_NAME].blueprintSettings = {};
            }
            extension_settings[MODULE_NAME].blueprintSettings[key] = transform(this);
            saveSettingsDebounced();
            if (updatePrompt) {
                updateStoryPrompt();
            }
        });
    });
    // Edit scene summary prompt template button
    content.find('#edit_scene_summary_prompt').on('click', async function () {
        const currentPrompt = BlueprintModule.getEffectiveSceneSummaryPrompt();
        const result = await Popup.show.input(
            'Edit Scene Summary Prompt Template',
            'Enter the prompt template for scene summarization. Variables like {{CONTEXT}}, {{MESSAGES}}, and {{REQUIREMENTS}} will be replaced at generation time.',
            currentPrompt,
            { rows: 15, okButton: 'Save', wide: true, large: true }
        );
        if (result) {
            if (!extension_settings[MODULE_NAME].blueprintSettings) {
                extension_settings[MODULE_NAME].blueprintSettings = {};
            }
            extension_settings[MODULE_NAME].blueprintSettings.sceneSummaryPrompt = result;
            saveSettingsDebounced();
            toastr.success('Scene summary prompt template updated');
        }
    });
    // Cover generation settings
    const coverGenerationSettings = [
        { selector: '#cover_gen_enabled', key: 'enabled', transform: v => $(v).is(':checked') },
        { selector: '#cover_auto_generate', key: 'autoGenerate', transform: v => $(v).is(':checked') },
        { selector: '#cover_add_to_gallery', key: 'addToGallery', transform: v => $(v).is(':checked') },
        { selector: '#cover_max_gallery', key: 'maxGallerySize', transform: v => parseInt($(v).val()) || 10 },
        { selector: '#cover_auto_select_latest', key: 'autoSelectLatest', transform: v => $(v).is(':checked') },
        { selector: '#cover_default_quality', key: 'defaultQuality', transform: v => $(v).val() },
        { selector: '#cover_default_aspect', key: 'defaultAspectRatio', transform: v => $(v).val() },
        { selector: '#cover_default_style', key: 'defaultStyle', transform: v => $(v).val() },
        { selector: '#cover_show_prompt', key: 'showPromptOnGenerate', transform: v => $(v).is(':checked') },
        { selector: '#cover_confirm_delete', key: 'confirmDeleteCover', transform: v => $(v).is(':checked') },
        { selector: '#cover_keyboard_nav', key: 'keyboardNavigation', transform: v => $(v).is(':checked') },
        { selector: '#cover_show_counter', key: 'showGalleryCounter', transform: v => $(v).is(':checked') },
    ];

    coverGenerationSettings.forEach(({ selector, key, transform }) => {
        content.find(selector).on('change', function () {
            const settings = extension_settings[MODULE_NAME];
            settings.blueprintSettings = settings.blueprintSettings || {};
            settings.blueprintSettings.coverGeneration = settings.blueprintSettings.coverGeneration || {};
            settings.blueprintSettings.coverGeneration[key] = transform(this);
            saveSettingsDebounced();
        });
    });

    // Scene Image Generation settings
    const sceneImageSettings = [
        { selector: '#scene_image_gen_enabled', key: 'enabled', transform: v => $(v).is(':checked') },
        { selector: '#scene_image_gen_auto', key: 'autoGenerate', transform: v => $(v).is(':checked') },
        { selector: '#scene_image_gen_gallery', key: 'addToGallery', transform: v => $(v).is(':checked') },
        { selector: '#scene_image_gen_style', key: 'imageStyle', transform: v => $(v).val() },
        { selector: '#scene_image_custom_prompt', key: 'customStylePrompt', transform: v => $(v).val() },
    ];

    sceneImageSettings.forEach(({ selector, key, transform }) => {
        content.find(selector).on('change', function () {
            const settings = extension_settings[MODULE_NAME];
            settings.imageGeneration = settings.imageGeneration || {};
            settings.imageGeneration[key] = transform(this);
            saveSettingsDebounced();
            console.log(`[Story Mode] Scene Image Generation setting ${key} changed to:`, transform(this));
        });
    });

    // Show/hide custom prompt group based on image style selection
    content.find('#scene_image_gen_style').on('change', function () {
        const isCustom = $(this).val() === 'custom';
        $('#scene_image_custom_prompt_group').toggle(isCustom);
    });

    content.find('#blueprint_generation_api').on('change', function () {
        const selectedApi = $(this).val() || null;
        extension_settings[MODULE_NAME].blueprintSettings = extension_settings[MODULE_NAME].blueprintSettings || {};
        extension_settings[MODULE_NAME].blueprintSettings.generationApi = selectedApi;
        saveSettingsDebounced();
        console.log('[Story Mode] Settings Dialog: Generation API changed to:', selectedApi || 'main API');
        console.log('[Story Mode] Settings Dialog: Full blueprintSettings.generationApi:', extension_settings[MODULE_NAME].blueprintSettings.generationApi);
    });
    // Opening Message API dropdown
    content.find('#opening_message_api').on('change', function () {
        const selectedApi = $(this).val() || null;
        extension_settings[MODULE_NAME].blueprintSettings = extension_settings[MODULE_NAME].blueprintSettings || {};
        extension_settings[MODULE_NAME].blueprintSettings.openingMessageApi = selectedApi;
        saveSettingsDebounced();
        console.log('[Story Mode] Settings Dialog: Opening Message API changed to:', selectedApi || 'main API');
    });
    // Epilogue API dropdown
    content.find('#epilogue_api').on('change', function () {
        const selectedApi = $(this).val() || null;
        extension_settings[MODULE_NAME].epilogueApi = selectedApi;
        saveSettingsDebounced();
    });
    // Summary API dropdown
    content.find('#summary_api').on('change', function () {
        const selectedApi = $(this).val() || null;
        extension_settings[MODULE_NAME].summaryApi = selectedApi;
        saveSettingsDebounced();
    });
    // Loading Indicator settings
    content.find('#loading_indicator_enabled').on('change', function () {
        const enabled = $(this).is(':checked');
    });
    content.find('#loading_indicator_position').on('change', function () {
        const position = $(this).val();
    });
    content.find('#loading_indicator_animation').on('change', function () {
        const animationStyle = $(this).val();
    });
    content.find('#loading_indicator_gif_url').on('change', function () {
        const customGifUrl = $(this).val() || null;
    });
    content.find('#loading_indicator_phrases').on('change', function () {
        const phrasesText = $(this).val();
        const phrases = phrasesText.split('\n').map(p => p.trim()).filter(p => p.length > 0);
    });
    content.find('#loading_indicator_preview').on('click', function () {
        // Start animated preview
    });
    // Reset Arc button (Story Arc subtab)
    content.find('#reset_arc_btn').on('click', async function () {
        if (confirm('Reset the story arc? This will set the round counter back to 0 and clear arc completion flags.')) {
            const chatState = getChatStoryState();
            chatState.currentStep = 0;
            chatState.arcStarted = false;
            chatState.epilogueShown = false;
            chatState.summaryShown = false;
            chatState.endNoticeShown = false;
            await saveChatStoryState(chatState);
            updateStoryPrompt();
            updateStatusDisplay();
            toastr.success('Story arc reset');
            // Refresh current step display in the Story Arc subtab
            content.find('#current_step_display').text('Step 0 / ' + chatState.arcLength);
        }
    });
    // Wizard mode toggle change handler - save setting
    content.on('change', '#storymode_wizard_disabled', function () {
        const wizardDisabled = $(this).is(':checked');
        const wizardEnabled = !wizardDisabled;
        console.log('[Story Mode] Wizard mode toggled:', wizardEnabled);

        // Save to extension settings
        extension_settings[MODULE_NAME].blueprintSettings = extension_settings[MODULE_NAME].blueprintSettings || {};
        extension_settings[MODULE_NAME].blueprintSettings.wizardMode = {
            enabled: wizardEnabled
        };

        // Save settings
        saveSettingsDebounced();

        // Show toast notification
        toastr.info(wizardEnabled
            ? 'Wizard mode enabled - blueprint generation will open in a dedicated modal window'
            : 'Wizard mode disabled - blueprint generation will use standard single-pass mode'
        );
    });

    // Generate Blueprint button - launch wizard modal
    content.on('click', '#blueprint_generate_btn', async function () {
        const btn = $(this);
        const originalText = btn.html();

        // Check if wizard mode is enabled (default true, unless "Legacy Mode" checked)
        const wizardDisabled = content.find('#storymode_wizard_disabled').is(':checked');
        const wizardEnabled = !wizardDisabled;

        // If wizard mode is enabled, launch the wizard modal
        if (wizardEnabled) {
            await launchWizardModal(content);
            return;
        }

        // Legacy single-pass mode - not fully implemented
        toastr.warning('Legacy single-pass mode is not yet fully implemented. Please use wizard mode (uncheck "Legacy Single-Process Mode" in Advanced Options).');
    });

    // Cancel blueprint generation button (stops the wizard modal)
    content.on('click', '#blueprint_cancel_generation_btn', function () {
        const wizardPopup = window.storyModeWizardPopup;
        if (wizardPopup && !wizardPopup.dlg.hasAttribute('closing')) {
            // Trigger the cancel in the wizard modal
            const popupElement = wizardPopup.content;
            const statusElement = popupElement?.querySelector('#storymode-wizard-status');
            if (statusElement) {
                statusElement.innerHTML = '<span style="color: var(--corruption-red);">Generation cancelled from settings panel.</span>';
            }

            // Set cancellation flag so the async generation loop stops
            wizardPopup.isCancelled = true;

            // Close the wizard popup
            wizardPopup.complete(POPUP_RESULT.CANCELLED);

            // Explicitly restore button states in the settings panel immediately
            content.find('#blueprint_cancel_generation_btn').hide();
            content.find('#blueprint_generate_btn').show();

            // Return to library grid if we were generating from there
            returnToLibraryIfNeeded(content);

            // Clear the global reference
            window.storyModeWizardPopup = null;
            toastr.info('Blueprint generation cancelled');
        }
    });
    // Resolution selection handler - when user clicks on a resolution
    content.on('click', '.storymode-resolution-item', function (e) {
        // Only handle if not clicking the radio button directly (let that work normally)
        if ($(e.target).is('input[type="radio"]')) return;

        // Find the radio button within the clicked item and select it
        const radio = $(this).find('input[type="radio"]');
        radio.prop('checked', true);

        // Update visual selection
        $('.storymode-resolution-item').removeClass('selected');
        $(this).addClass('selected');
    });
    // Import blueprint button - supports both JSON and PNG
    content.find('#import_blueprint_btn').on('click', function () {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.png';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;


            try {
                let blueprint;

                // Check if it's a PNG file
                if (file.name.toLowerCase().endsWith('.png')) {
                    // Verify it's a blueprint PNG
                    const isPNG = await isBlueprintPNG(file);
                    if (!isPNG) {
                        toastr.error('This PNG does not contain blueprint data');
                        return;
                    }
                    blueprint = await decodeBlueprintFromPNG(file);
                    console.log('[Story Mode] Decoded blueprint from PNG:', blueprint);
                } else {
                    // Parse as JSON
                    const text = await file.text();
                    blueprint = JSON.parse(text);
                }

                // Validate blueprint
                const validation = BlueprintModule.validateBlueprint(blueprint);
                if (!validation.valid) {
                    toastr.error('Invalid blueprint: ' + validation.errors.join(', '));
                    return;
                }

                // Create run copy for imported blueprint
                const runState = BlueprintModule.createRunCopy(blueprint, 'import');
                await BlueprintModule.saveBlueprintState(runState);

                // Sync blueprint settings to chat state with confirmation dialog
                await BlueprintModule.syncBlueprintSettings(blueprint, true);

                // Refresh tabs
                content.find('#tab_blueprint').html(buildBlueprintTabContent());
                refreshSidebar(content);
                updateStatusDisplay();
                refreshBlueprintPreview();

                toastr.success(`Blueprint imported from ${file.name.endsWith('.png') ? 'PNG' : 'JSON'}`);
            } catch (error) {
                console.error('[Story Mode] Import error:', error);
                toastr.error('Failed to import: ' + error.message);
            } finally {
            }
        };
        input.click();
    });

    // Export blueprint button
    content.on('click', '#blueprint_export_btn', async function () {
        const blueprintState = BlueprintModule.getBlueprintState();
        if (!blueprintState.blueprint) {
            toastr.error('No blueprint to export');
            return;
        }

        const btn = $(this);
        const originalText = btn.html();
        btn.prop('disabled', true);
        btn.html('<i class="fa-solid fa-spinner fa-spin"></i> Exporting...');

        try {
            // Use the simple JSON export function from blueprint-module.js
            BlueprintModule.exportBlueprint(blueprintState.blueprint);
            toastr.success('Blueprint exported successfully');
        } catch (error) {
            console.error('[Story Mode] Error exporting blueprint:', error);
            toastr.error('Failed to export: ' + error.message);
        } finally {
            btn.prop('disabled', false);
            btn.html(originalText);
        }
    });

    // Edit blueprint button
    content.on('click', '#blueprint_edit_btn', async function () {
        const blueprintState = BlueprintModule.getBlueprintState();
        if (!blueprintState.blueprint) {
            toastr.error('No blueprint to edit');
            return;
        }

        const btn = $(this);
        const originalText = btn.html();
        btn.prop('disabled', true);
        btn.html('<i class="fa-solid fa-spinner fa-spin"></i> Opening...');

        try {
            const editedBlueprint = await openBlueprintEditor(blueprintState.blueprint);
            if (editedBlueprint) {
                // User saved changes
                blueprintState.blueprint = editedBlueprint;
                await BlueprintModule.saveBlueprintState(blueprintState);
                // Refresh tabs to show updated blueprint
                content.find('#tab_blueprint').html(buildBlueprintTabContent());
                refreshSidebar(content);
                updateStatusDisplay();
                // Refresh the blueprint preview in the main panel sidebar
                refreshBlueprintPreview();
                toastr.success('Blueprint updated');
            }
            // If null, user cancelled - no action needed
        } catch (error) {
            console.error('[Story Mode] Error editing blueprint:', error);
            toastr.error('Failed to open blueprint editor');
        } finally {
            btn.prop('disabled', false);
            btn.html(originalText);
        }
    });

    // Clear blueprint button
    content.on('click', '#blueprint_clear_btn', async function () {
        if (!confirm('Clear the current blueprint? This cannot be undone.')) return;
        const blueprintState = BlueprintModule.getBlueprintState();
        blueprintState.blueprint = null;
        blueprintState.useBlueprint = false;
        setCurrentSceneIndex(0);
        await BlueprintModule.saveBlueprintState(blueprintState);
        // Refresh tabs
        content.find('#tab_blueprint').html(buildBlueprintTabContent());
        refreshSidebar(content);
        updateStatusDisplay();
        toastr.success('Blueprint cleared');
    });

    // Scene slider - click on scene marker to jump to that scene
    content.on('click', '.storymode-scene-marker', async function () {
        const sceneIndex = parseInt($(this).data('scene'));
        const startRound = parseInt($(this).data('round'));

        // Check if we're switching from auto to manual mode
        const blueprintState = BlueprintModule.getBlueprintState();
        const wasAutoMode = blueprintState.sceneMode === 'auto';

        const result = await jumpToRound(startRound, sceneIndex);

        if (result.success) {
            toastr.success(result.message);
            if (wasAutoMode) {
                toastr.info('Switched to manual scene mode', 'Story Mode');
            }
            // Refresh the blueprint overview to show updated slider
            const chatState = getChatStoryState();
            const blueprint = blueprintState.blueprint;
            if (blueprint) {
                const currentScene = BlueprintModule.getCurrentScene(
                    blueprint,
                    chatState.currentStep,
                    chatState.arcLength,
                    blueprintState.sceneMode,
                    getCurrentSceneIndex()
                );
                content.find('#blueprint_subtab_content').html(renderBlueprintOverviewSubtab(blueprint, currentScene));
            }
        } else {
            toastr.error(result.message);
        }
    });

    // Scene slider - click on round tick to jump to that round
    content.on('click', '.storymode-round-ticks .tick', async function () {
        const round = parseInt($(this).data('round'));

        // Check if we're switching from auto to manual mode
        const blueprintState = BlueprintModule.getBlueprintState();
        const wasAutoMode = blueprintState.sceneMode === 'auto';

        const result = await jumpToRound(round);

        if (result.success) {
            toastr.success(result.message);
            if (wasAutoMode) {
                toastr.info('Switched to manual scene mode', 'Story Mode');
            }
            // Refresh the blueprint overview to show updated slider
            const chatState = getChatStoryState();
            const blueprint = blueprintState.blueprint;
            if (blueprint) {
                const currentScene = BlueprintModule.getCurrentScene(
                    blueprint,
                    chatState.currentStep,
                    chatState.arcLength,
                    blueprintState.sceneMode,
                    getCurrentSceneIndex()
                );
                content.find('#blueprint_subtab_content').html(renderBlueprintOverviewSubtab(blueprint, currentScene));
            }
        } else {
            toastr.error(result.message);
        }
    });

    // ========================================================================
    // LIBRARY TAB EVENT HANDLERS
    // ========================================================================

    // Initialize library when Library tab is clicked
    content.on('click', '.storymode-tab[data-tab="library"]', async function () {
        await refreshLibraryView(content);
    });

    // Folder selection
    content.on('click', '.storymode-folder-item', async function () {
        const folderId = $(this).data('folder');
        content.find('.storymode-folder-item').removeClass('active');
        $(this).addClass('active');
        await loadBlueprintsForFolder(content, folderId);
    });

    // Search input
    content.on('input', '#library_search_input', debounce(async function () {
        const query = $(this).val().trim();
        if (query.length >= 2) {
            await searchLibraryBlueprints(content, query);
        } else if (query.length === 0) {
            const activeFolder = content.find('.storymode-folder-item.active').data('folder') || 'all';
            await loadBlueprintsForFolder(content, activeFolder);
        }
    }, 300));

    // Generate Blueprint button in Library - show form in-place
    content.on('click', '#library_generate_blueprint_btn, #library_empty_generate_btn', function () {
        // Set flag indicating we're generating from library context
        // This is checked after wizard completion to know where to return
        content.data('generateFromLibrary', true);
        showLibraryGenerateView(content);
    });

    // Back to Library button - return to grid view
    content.on('click', '#library_back_to_grid_btn', function () {
        // Clear the library generation flag when user manually returns
        content.removeData('generateFromLibrary');
        showLibraryGridView(content);
    });

    // Blueprint card actions
    content.on('click', '.storymode-blueprint-card [data-action]', async function (e) {
        e.stopPropagation();
        const action = $(this).data('action');
        const card = $(this).closest('.storymode-blueprint-card');
        const blueprintId = card.data('blueprintId');

        switch (action) {
            case 'load':
                await loadBlueprintFromLibrary(content, blueprintId);
                break;
            case 'play':
                await playBlueprintFromLibrary(content, blueprintId);
                break;
            case 'edit':
                await editBlueprintFromLibrary(content, blueprintId);
                break;
            case 'favorite':
                await toggleBlueprintFavorite(content, blueprintId, $(this));
                break;
            case 'delete':
                await deleteBlueprintFromLibrary(content, blueprintId);
                break;
            case 'export':
                await exportBlueprintFromLibrary(blueprintId);
                break;
        }
    });

    // Library card click - opens editor (same as edit button)
    content.on('click', '.storymode-blueprint-card', async function (e) {
        const $target = $(e.target);
        // Ignore if clicking on action buttons or favorite icon
        if ($target.closest('[data-action], .storymode-card-favorite').length > 0) {
            return;
        }

        const blueprintId = $(this).data('blueprintId');
        if (!blueprintId) return;

        // Open the editor for this blueprint
        await editBlueprintFromLibrary(content, blueprintId);
    });

    // View toggle (grid/list) - single button toggles between views
    content.on('click', '#library_view_toggle', function () {
        const btn = $(this);
        const currentView = btn.data('view');
        const newView = currentView === 'grid' ? 'list' : 'grid';

        // Update button state
        btn.data('view', newView);
        btn.attr('title', newView === 'grid' ? 'Switch to list view' : 'Switch to grid view');
        btn.find('i').toggleClass('fa-list', newView === 'grid').toggleClass('fa-grid-2', newView === 'list');

        // Toggle grid class
        content.find('.storymode-library-grid').toggleClass('list-view', newView === 'list');
    });

    // Sort selection
    content.on('change', '#library_sort_select', async function () {
        const activeFolder = content.find('.storymode-folder-item.active').data('folder') || 'all';
        await loadBlueprintsForFolder(content, activeFolder);
    });

    // Library import button - import PNG/JSON directly to library
    content.on('click', '#library_import_btn', function () {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.png';
        input.multiple = true;
        input.onchange = async (e) => {
            const files = Array.from(e.target.files);
            if (files.length === 0) return;

            let imported = 0;
            let failed = 0;

            for (const file of files) {
                try {
                    let blueprint;

                    if (file.name.toLowerCase().endsWith('.png')) {
                        const isPNG = await isBlueprintPNG(file);
                        if (!isPNG) {
                            console.warn(`[Story Mode] ${file.name} is not a blueprint PNG`);
                            failed++;
                            continue;
                        }
                        blueprint = await decodeBlueprintFromPNG(file);
                    } else {
                        const text = await file.text();
                        blueprint = JSON.parse(text);
                    }

                    // Add to library
                    if (!blueprint.userMetadata) {
                        blueprint.userMetadata = {};
                    }
                    if (!blueprint.userMetadata.title) {
                        blueprint.userMetadata.title = file.name.replace(/\.(json|png)$/i, '');
                    }

                    await createBlueprint(blueprint, { saveToLibrary: true });
                    imported++;
                } catch (error) {
                    console.error(`[Story Mode] Failed to import ${file.name}:`, error);
                    failed++;
                }
            }

            await refreshLibraryView(content);

            if (imported > 0 && failed === 0) {
                toastr.success(`Imported ${imported} blueprint(s)`);
            } else if (imported > 0 && failed > 0) {
                toastr.warning(`Imported ${imported}, failed ${failed}`);
            } else {
                toastr.error('Failed to import any blueprints');
            }
        };
        input.click();
    });
}

// ============================================================================
// LIBRARY HELPER FUNCTIONS
// ============================================================================

/**
 * Simple debounce function for search input
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func.apply(this, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Refresh the entire library view
 */
async function refreshLibraryView(content) {
    try {
        const library = await getLibrary();
        const allBlueprints = await library.getAllBlueprints();

        // Update folder counts
        content.find('#folder_count_all').text(allBlueprints.length);
        content.find('#folder_count_favorites').text(
            allBlueprints.filter(bp => bp.userMetadata?.favorite).length
        );

        // Load blueprints for active folder
        const activeFolder = content.find('.storymode-folder-item.active').data('folder') || 'all';
        await loadBlueprintsForFolder(content, activeFolder);

        // Update stats
        content.find('#library_total_count').text(`${allBlueprints.length} blueprint${allBlueprints.length !== 1 ? 's' : ''}`);
    } catch (error) {
        console.error('[Story Mode] Error refreshing library:', error);
    }
}

/**
 * Load blueprints for a specific folder
 */
async function loadBlueprintsForFolder(content, folderId) {
    try {
        const library = await getLibrary();
        let blueprints;

        if (folderId === 'favorites') {
            const all = await library.getAllBlueprints();
            blueprints = all.filter(bp => bp.userMetadata?.favorite);
        } else if (folderId === 'recent') {
            blueprints = await library.stats.getRecentlyPlayed(20);
        } else {
            blueprints = await library.getAllBlueprints();
        }

        // Apply sort
        const sortValue = content.find('#library_sort_select').val() || 'created-desc';
        const [sortBy, sortOrder] = sortValue.split('-');
        blueprints = sortLibraryBlueprints(blueprints, sortBy, sortOrder);

        renderBlueprintGrid(content, blueprints);
    } catch (error) {
        console.error('[Story Mode] Error loading blueprints:', error);
    }
}

/**
 * Sort blueprints
 */
function sortLibraryBlueprints(blueprints, sortBy, sortOrder) {
    return [...blueprints].sort((a, b) => {
        let comparison = 0;
        switch (sortBy) {
            case 'title':
                const titleA = a.userMetadata?.title || a.core_premise || '';
                const titleB = b.userMetadata?.title || b.core_premise || '';
                comparison = titleA.localeCompare(titleB);
                break;
            case 'created':
                comparison = new Date(a.libraryData?.dateAdded || 0) - new Date(b.libraryData?.dateAdded || 0);
                break;
            case 'played':
                comparison = (a.libraryData?.accessCount || 0) - (b.libraryData?.accessCount || 0);
                break;
        }
        return sortOrder === 'desc' ? -comparison : comparison;
    });
}

/**
 * Search library blueprints
 */
async function searchLibraryBlueprints(content, query) {
    try {
        const results = await searchBlueprints(query);
        renderBlueprintGrid(content, results);
    } catch (error) {
        console.error('[Story Mode] Error searching blueprints:', error);
    }
}

/**
 * Render blueprint grid
 */
function renderBlueprintGrid(content, blueprints) {
    const grid = content.find('#library_blueprint_grid');
    const emptyState = content.find('#library_empty_state');

    if (blueprints.length === 0) {
        grid.find('.storymode-blueprint-card').remove();
        emptyState.show();
    } else {
        emptyState.hide();
        const cardsHtml = blueprints.map(bp => renderBlueprintCard(bp)).join('');
        grid.html(cardsHtml);
    }
}

/**
 * Load blueprint from library into current chat
 */
async function loadBlueprintFromLibrary(content, blueprintId) {
    try {
        const library = await getLibrary();
        const blueprint = await library.getBlueprint(blueprintId);

        if (!blueprint) {
            toastr.error('Blueprint not found');
            return;
        }

        // Create a run copy (deep clone) so library blueprint stays pristine
        const runState = BlueprintModule.createRunCopy(blueprint, 'library');
        await BlueprintModule.saveBlueprintState(runState);

        // Update play stats
        await library.stats.recordPlayStart(blueprintId);

        // Refresh UI
        content.find('#tab_blueprint').html(buildBlueprintTabContent());
        refreshBlueprintPreview();
        updateStatusDisplay();

        toastr.success('Blueprint loaded!');
    } catch (error) {
        console.error('[Story Mode] Error loading blueprint:', error);
        toastr.error('Failed to load blueprint');
    }
}

/**
 * Play blueprint from library - load the blueprint into the current chat
 */
async function playBlueprintFromLibrary(content, blueprintId) {
    try {
        const library = await getLibrary();
        const blueprint = await library.getBlueprint(blueprintId);

        if (!blueprint) {
            toastr.error('Blueprint not found');
            return;
        }

        // Sync blueprint settings to chat state (with confirmation if needed)
        const syncResult = await BlueprintModule.syncBlueprintSettings(blueprint, true);

        if (!syncResult.confirmed && syncResult.changes.length > 0) {
            // User declined to overwrite current blueprint settings
            // Offer to create a new chat instead
            const createNewChat = await callGenericPopup(
                `Would you like to create a new chat to load this blueprint? This will preserve your current conversation.`,
                POPUP_TYPE.CONFIRM
            );

            if (createNewChat !== POPUP_RESULT.AFFIRMATIVE) {
                // User declined new chat too - do nothing
                return;
            }

            // Create new chat
            await doNewChat();
            // Wait a moment for chat to be created
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Create a run copy (deep clone) so library blueprint stays pristine
        const runState = BlueprintModule.createRunCopy(blueprint, 'library');
        await BlueprintModule.saveBlueprintState(runState);

        // Update play stats
        await library.stats.recordPlayStart(blueprintId);

        // Sync blueprint settings again (now without confirmation since we're in a fresh chat)
        await BlueprintModule.syncBlueprintSettings(blueprint, false);

        // Refresh UI
        content.find('#tab_blueprint').html(buildBlueprintTabContent());
        refreshBlueprintPreview();
        updateStatusDisplay();

        toastr.success('Blueprint loaded!');
    } catch (error) {
        console.error('[Story Mode] Error loading blueprint:', error);
        toastr.error('Failed to load blueprint');
    }
}

/**
 * Edit blueprint from library
 */
async function editBlueprintFromLibrary(content, blueprintId) {
    try {
        const library = await getLibrary();
        const blueprint = await library.getBlueprint(blueprintId);

        if (!blueprint) {
            toastr.error('Blueprint not found');
            return;
        }

        const edited = await openBlueprintEditor(blueprint);
        if (edited) {
            await library.saveBlueprint(edited);
            toastr.success('Blueprint updated!');
            await refreshLibraryView(content);
        }
    } catch (error) {
        console.error('[Story Mode] Error editing blueprint:', error);
        toastr.error('Failed to edit blueprint');
    }
}

/**
 * Toggle blueprint favorite status
 */
async function toggleBlueprintFavorite(content, blueprintId, button) {
    try {
        const library = await getLibrary();
        const blueprint = await library.getBlueprint(blueprintId);

        if (!blueprint) return;

        const currentFavorite = blueprint.userMetadata?.favorite || false;
        await setBlueprintFavorite(blueprintId, !currentFavorite);

        // Update button appearance
        button.toggleClass('active');
        button.find('i').toggleClass('fa-solid fa-regular');

        // Update folder counts
        await refreshLibraryView(content);
    } catch (error) {
        console.error('[Story Mode] Error toggling favorite:', error);
    }
}

/**
 * Delete blueprint from library
 */
async function deleteBlueprintFromLibrary(content, blueprintId) {
    if (!confirm('Delete this blueprint from your library? This cannot be undone.')) {
        return;
    }

    try {
        await deleteLibraryBlueprint(blueprintId);
        toastr.success('Blueprint deleted');
        await refreshLibraryView(content);
    } catch (error) {
        console.error('[Story Mode] Error deleting blueprint:', error);
        toastr.error('Failed to delete blueprint');
    }
}

/**
 * Export blueprint from library as PNG (extended format with embedded resources)
 */
async function exportBlueprintFromLibrary(blueprintId) {
    try {
        const library = await getLibrary();
        const blueprint = await library.getBlueprint(blueprintId);

        if (!blueprint) {
            toastr.error('Blueprint not found');
            return;
        }

        // Use new extended PNG export (handles cover, characters, etc.)
        const result = await exportBlueprintAsPNG(blueprint);

        if (result.success) {
            toastr.success(`Blueprint exported: ${result.filename}`);
        } else {
            toastr.error('Export failed: ' + result.error);
        }
    } catch (error) {
        console.error('[Story Mode] Error exporting blueprint:', error);
        toastr.error('Failed to export blueprint: ' + error.message);
    }
}

/**
* Refresh the sidebar content (no-op - sidebar removed)
*/
function refreshSidebar(content) {
    // Sidebar removed - no-op
}

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
            toastr.error('No blueprint loaded', 'Blueprint Error');
            return;
        }

        // Set loading state
        btn.prop('disabled', true);
        btn.html('<i class="fa-solid fa-circle-notch fa-spin"></i> Starting...');

        try {
            // Start the story from blueprint (syncs settings, enables features)
            const result = await BlueprintModule.startStoryFromBlueprint(blueprintState.blueprint);

            if (!result.success) {
                toastr.error(result.error || 'Failed to start story', 'Blueprint Error');
                return;
            }

            // Show any warnings
            result.warnings?.forEach(w => toastr.warning(w, 'Blueprint Warning'));

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
                    toastr.success('Story started from blueprint!', 'Story Mode');
                }
            } else {
                // Legacy blueprint without opening message
                toastr.success('Story started from blueprint!', 'Story Mode');
                toastr.info('This blueprint has no opening message. You can write your own first message.', 'Story Mode', { timeOut: 5000 });
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
            toastr.error(`Failed to start story: ${error.message}`, 'Blueprint Error');
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
// WIZARD UI UPDATE FUNCTIONS
// ============================================================================

/**
 * Gather form data for blueprint generation
 * @param {jQuery} content - The settings dialog content element
 * @returns {Object} Config object for generation
 */
function getWizardFormData(content) {
    const selectedCharacterIds = [];
    content.find('input[name="blueprint_character"]:checked').each(function () {
        const charId = $(this).val();
        if (charId) selectedCharacterIds.push(charId);
    });

    const selectedPersonas = [];
    content.find('input[name="blueprint_persona"]:checked').each(function () {
        const personaId = $(this).val();
        const personaName = $(this).data('name');
        if (personaId) {
            selectedPersonas.push({
                id: personaId,
                name: personaName || personaId
            });
        }
    });

    const scenario = content.find('#blueprint_scenario').val() || '';
    const metaphorLevel = content.find('#blueprint_metaphor_level').val() || 'mixed';
    const storyLength = content.find('#blueprint_story_length').val() || 'medium';
    const customRounds = content.find('#blueprint_custom_rounds').val();
    const customMasterPrompt = content.find('#blueprint_master_prompt').val() || null;
    const storyTypeId = content.find('#blueprint_story_type').val() || '';
    const authorStyleId = content.find('#blueprint_author_style').val() || '';
    const finalStoryLength = customRounds && parseInt(customRounds) > 0 ? parseInt(customRounds) : parseInt(storyLength);

    // Build character data from context
    const context = getContext();
    const characterData = [];

    // Helper to add char if valid
    const addCharIfSelected = (char) => {
        if (char) {
            characterData.push({
                name: char.name,
                description: char.description,
                personality: char.personality,
                scenario: char.scenario,
                greeting: char.greeting
            });
        }
    };

    if (context.groupId) {
        const group = context.groups?.find(g => g.id === context.groupId);
        if (group && group.members) {
            group.members.forEach(memberFilename => {
                const charIndex = (context.characters || []).findIndex(c =>
                    c.filename === memberFilename ||
                    c.avatar === memberFilename ||
                    (typeof c === 'string' && c === memberFilename)
                );
                if (charIndex !== -1 && selectedCharacterIds.includes(charIndex.toString())) {
                    addCharIfSelected(context.characters[charIndex]);
                }
            });
        }
    } else {
        if (selectedCharacterIds.includes(context.characterId?.toString())) {
            addCharIfSelected(context.characters?.[parseInt(context.characterId, 10)]);
        }
    }

    return {
        storyTypeId,
        authorStyleId: authorStyleId || undefined,
        characterData,
        personaData: selectedPersonas,
        scenario,
        messageTarget: finalStoryLength,
        metaphorLevel: metaphorLevel,
        customMasterPrompt: customMasterPrompt
    };
}

/**
 * Create the HTML structure for the wizard modal
 * @returns {string} HTML string
 */
function createWizardModalHtml() {
    return `
        <div class="storymode-wizard-modal">
            <div class="storymode-wizard-header" style="text-align: center; margin-bottom: 20px;">
                <h2 style="margin: 0 0 10px 0;"><i class="fa-solid fa-wand-magic-sparkles"></i> Blueprint Generation Wizard</h2>
                <p id="storymode-wizard-status" style="margin: 0; font-size: 1.1rem; color: var(--gray70);">Initializing...</p>
            </div>
            <div id="storymode-wizard-progress-container"></div>
            <div id="storymode-wizard-preview-container"></div>
            <div id="storymode-resolution-selection-container" style="display: none;"></div>
            <div id="storymode-wizard-cover-container" style="display: none; text-align: center; margin: 20px auto; padding: 20px; background: var(--black10a); border-radius: 8px; max-width: 167px;"></div>
            <div id="storymode-wizard-actions" style="text-align: center; margin-top: 20px;">
                <button id="storymode-wizard-cancel-btn" class="menu_button storymode-btn storymode-btn-secondary" style="margin-right: 10px;">
                    <i class="fa-solid fa-times"></i> Cancel
                </button>
                <button id="storymode-wizard-retry-btn" class="menu_button storymode-btn storymode-btn-warning" style="display: none; margin-right: 10px;">
                    <i class="fa-solid fa-rotate-right"></i> Retry Phase
                </button>
                <button id="storymode-wizard-finish-btn" class="menu_button storymode-btn storymode-btn-primary" style="display: none;">
                    <i class="fa-solid fa-check"></i> Save Blueprint
                </button>
            </div>
            <div id="storymode-wizard-error-details" style="display: none; margin-top: 20px; padding: 15px; background: var(--black10a); border-radius: 8px; border-left: 4px solid var(--corruption-red);">
                <h4 style="margin: 0 0 10px 0; color: var(--corruption-red);"><i class="fa-solid fa-exclamation-triangle"></i> Error Details</h4>
                <p id="storymode-wizard-error-message" style="margin: 0;"></p>
                <p id="storymode-wizard-error-phase" style="margin: 5px 0 0 0; font-size: 0.9rem; color: var(--gray70);"></p>
                <button id="storymode-wizard-show-response-btn" class="menu_button storymode-btn storymode-btn-secondary" style="display: none; margin-top: 10px; font-size: 0.8rem;">
                    <i class="fa-solid fa-code"></i> Show Full Response
                </button>
            </div>
        </div>
    `;
}

/**
 * Validate blueprint for required fields
 * @param {Object} blueprint - The generated blueprint
 * @returns {Array<string>} List of validation error messages
 */
function validateBlueprint(blueprint) {
    const errors = [];
    if (!blueprint.core_premise) errors.push('Missing core premise');
    if (!blueprint.setting) errors.push('Missing setting information');
    if (!blueprint.antagonistic_forces) errors.push('Missing antagonistic forces');
    if (!blueprint.arc_structure) errors.push('Missing arc structure');
    if (!blueprint.scene_plan || blueprint.scene_plan.length === 0) errors.push('No scenes generated');
    return errors;
}

/**
 * Attempt to auto-generate cover image for the blueprint
 * @param {Object} blueprint - The blueprint object
 * @param {HTMLElement} statusElement - Status text element
 * @param {HTMLElement} previewContainer - Preview container element
 */
async function attemptAutoCoverGeneration(blueprint, statusElement, previewContainer) {
    const coverGenSettings = extension_settings[MODULE_NAME]?.blueprintSettings?.coverGeneration;
    if (!coverGenSettings?.autoGenerate) return;

    if (statusElement) {
        statusElement.innerHTML = '<span style="color: #3b82f6;"><i class="fa-solid fa-paintbrush fa-spin"></i> Generating cover image...</span>';
    }

    // Sync LLM-generated cover prompt if available
    if (blueprint.cover_prompt && (!blueprint.metadata || !blueprint.metadata.coverPrompt)) {
        blueprint.metadata = blueprint.metadata || {};
        blueprint.metadata.coverPrompt = {
            positive: blueprint.cover_prompt,
            negative: 'text, watermark, signature, blurry, low quality, distorted, ugly, bad anatomy, extra limbs, cropped, worst quality, low resolution',
            style: 'digital art',
            technical: { aspect_ratio: '2:3' }
        };
    }

    try {
        const coverResult = await generateCoverFromSD(blueprint);
        if (coverResult.success && coverResult.imageUrl) {
            await addCoverToGallery(blueprint, coverResult.imageUrl, blueprint.metadata.coverPrompt);
            setCoverImageUrl(blueprint, coverResult.imageUrl);

            // Update wizard preview if it exists
            if (previewContainer) {
                previewContainer.innerHTML = buildWizardPreview(blueprint, 5);
            }

            if (statusElement) {
                statusElement.innerHTML = '<span style="color: #10b981;">✓ Blueprint and cover generated successfully!</span>';
            }
        } else {
            toastr.warning('Blueprint generated, but cover generation failed: ' + (coverResult.error || 'Unknown error'));
            if (statusElement) {
                statusElement.innerHTML = '<span style="color: #f59e0b;">⚠ Blueprint generated, but cover generation failed.</span>';
            }
        }
    } catch (coverError) {
        console.error('[Story Mode] Cover generation error in wizard:', coverError);
        toastr.warning('Blueprint generated, but cover generation encountered an error.');
    }
}

/**
 * Helper to return to the library tab if appropriate
 * @param {jQuery} content - The settings dialog content element
 * @returns {boolean} True if returned to library, false otherwise
 */
function returnToLibraryIfNeeded(content) {
    if (!content) return false;
    const wasFromLibrary = content.data('generateFromLibrary');
    if (wasFromLibrary) {
        content.removeData('generateFromLibrary');
        showLibraryGridView(content);
        return true;
    }
    return false;
}

/**
 * Launch the wizard modal for phased blueprint generation
 * This creates a dedicated modal window for the wizard UI instead of embedding it in the settings dialog
 * @param {jQuery} content - The settings dialog content element
 */
async function launchWizardModal(content) {
    // Show cancel button, hide generate button
    content.find('#blueprint_generate_btn').hide();
    content.find('#blueprint_cancel_generation_btn').show();

    // Gather form data and create wizard modal
    const config = getWizardFormData(content);
    const wizardHtml = createWizardModalHtml();

    // Create wizard modal
    const wizardPopup = new Popup(wizardHtml, POPUP_TYPE.TEXT, 'Blueprint Wizard', {
        okButton: false,
        cancelButton: false,
        wide: true,
        allowVerticalScrolling: true,
    });

    // Show the popup (fire and forget - don't await, we'll close it manually later)
    wizardPopup.show();

    // Store the popup reference for later use
    window.storyModeWizardPopup = wizardPopup;

    // Get reference to the popup content element
    const popupElement = wizardPopup.content;

    // Initialize with Phase 1 as current (generation starts immediately)
    const progressContainer = popupElement.querySelector('#storymode-wizard-progress-container');
    const previewContainer = popupElement.querySelector('#storymode-wizard-preview-container');
    const statusElement = popupElement.querySelector('#storymode-wizard-status');

    if (progressContainer) {
        progressContainer.innerHTML = buildWizardProgressHTML(1); // Start with Phase 1 as current
    }
    if (previewContainer) {
        previewContainer.innerHTML = buildWizardPreview({}, 0);
    }
    if (statusElement) {
        statusElement.textContent = 'Generating Foundation... (Phase 1/5)';
    }

    // Store for tracking generation state
    wizardPopup.isCancelled = false;
    let failedAtPhase = null;
    let partialBlueprintForRetry = null;
    let requestForRetry = null;
    let lastRawResponse = null;
    let phaseTokensUsed = {}; // Track token limits used per phase
    const MAX_PHASE_TOKENS = 65536; // Maximum safe token limit

    // Phase name lookup (shared across functions)
    const phaseNames = ['', 'Foundation', 'Characters', 'Scenes', 'Resolutions'];

    // Helper: Show error state in wizard
    const showWizardError = (errorResult) => {
        const phase = errorResult.phase || failedAtPhase;
        const message = errorResult.error || errorResult.message || 'Unknown error';
        const statusElement = popupElement.querySelector('#storymode-wizard-status');
        const errorDetailsContainer = popupElement.querySelector('#storymode-wizard-error-details');
        const errorMsg = popupElement.querySelector('#storymode-wizard-error-message');
        const errorPhaseText = popupElement.querySelector('#storymode-wizard-error-phase');
        const retryBtn = popupElement.querySelector('#storymode-wizard-retry-btn');
        const showResponseBtn = popupElement.querySelector('#storymode-wizard-show-response-btn');

        // Store token usage from error result
        if (errorResult.phaseTokensUsed) {
            phaseTokensUsed[phase] = errorResult.phaseTokensUsed;
        }

        const tokenInfo = phaseTokensUsed[phase] ? ` (used ${phaseTokensUsed[phase]} tokens)` : '';

        if (statusElement) {
            statusElement.innerHTML = `<span style="color: var(--corruption-red);">✗ ${errorResult.phase ? 'Retry failed' : 'Generation failed'} at Phase ${phase}${tokenInfo}.</span>`;
        }
        if (errorDetailsContainer) {
            errorDetailsContainer.style.display = 'block';
            if (errorMsg) errorMsg.textContent = message;
            if (errorPhaseText) {
                errorPhaseText.textContent = `Error occurred during ${phaseNames[phase]}. Check the console for details.`;
            }
            if (showResponseBtn && (errorResult.rawResponse || lastRawResponse)) {
                showResponseBtn.style.display = 'inline-block';
                if (errorResult.rawResponse) lastRawResponse = errorResult.rawResponse;
            }
        }
        if (retryBtn) {
            retryBtn.style.display = 'inline-block';
        }
    };

    // Set up cancel button handler immediately
    const cancelBtn = popupElement.querySelector('#storymode-wizard-cancel-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', function () {
            // If generation is complete (finishBtn is visible), this works as "Discard & Close"
            const isComplete = popupElement.querySelector('#storymode-wizard-finish-btn').style.display !== 'none';

            if (isComplete) {
                if (confirm('Are you sure you want to discard this blueprint and close?')) {
                    cleanupWizard();
                    returnToLibraryIfNeeded(content);
                    wizardPopup.complete(POPUP_RESULT.CANCELLED);
                }
            } else if (!wizardPopup.isCancelled && confirm('Are you sure you want to cancel blueprint generation?')) {
                wizardPopup.isCancelled = true;
                const statusElement = popupElement.querySelector('#storymode-wizard-status');
                if (statusElement) {
                    statusElement.innerHTML = '<span style="color: var(--corruption-red);">Generation cancelled by user.</span>';
                }
                cleanupWizard();
                returnToLibraryIfNeeded(content);
                wizardPopup.complete(POPUP_RESULT.CANCELLED);
            }
        });
    }

    // Set up retry button handler
    const retryBtn = popupElement.querySelector('#storymode-wizard-retry-btn');
    if (retryBtn) {
        retryBtn.addEventListener('click', async function () {
            if (!failedAtPhase || !requestForRetry) {
                console.error('[Story Mode] Cannot retry: missing phase or request data');
                return;
            }

            // Hide error UI
            popupElement.querySelector('#storymode-wizard-error-details').style.display = 'none';
            retryBtn.style.display = 'none';

            // Calculate token overrides for Phase 2
            let tokenOverrides = {};
            if (failedAtPhase === 2) {
                const currentTokens = phaseTokensUsed[2] || 8192; // Default to 8192 if not tracked
                const newTokens = Math.min(currentTokens * 2, MAX_PHASE_TOKENS);
                tokenOverrides[2] = newTokens;

                console.log(`[Story Mode] Doubling Phase 2 tokens: ${currentTokens} -> ${newTokens}`);

                // Show notification to user
                if (newTokens >= MAX_PHASE_TOKENS) {
                    toastr.warning(`Phase 2 token limit at maximum (${MAX_PHASE_TOKENS})`);
                } else {
                    toastr.info(`Retrying Phase 2 with ${newTokens} tokens (doubled from ${currentTokens})`);
                }
            }

            // Update status
            const statusElement = popupElement.querySelector('#storymode-wizard-status');
            const tokenInfo = tokenOverrides[failedAtPhase] ? ` with ${tokenOverrides[failedAtPhase]} tokens` : '';
            if (statusElement) {
                statusElement.innerHTML = `<span style="color: #f59e0b;">Retrying ${phaseNames[failedAtPhase]} phase... (Phase ${failedAtPhase}/5)${tokenInfo}</span>`;
            }

            // Reset error state
            const retryPhase = failedAtPhase;
            failedAtPhase = null;

            try {
                const retryResult = await BlueprintModule.generateBlueprint(
                    requestForRetry,
                    storyTypes,
                    authorStyles,
                    {
                        phased: true,
                        startPhase: retryPhase,
                        partialBlueprint: partialBlueprintForRetry,
                        phaseTokenOverrides: tokenOverrides
                    }
                );

                if (wizardPopup.isCancelled || !retryResult.success) {
                    if (!retryResult.success) {
                        failedAtPhase = retryPhase;
                        showWizardError(retryResult);
                    }
                    return;
                }

                // Success - update UI
                const blueprint = retryResult.blueprint;
                popupElement.querySelector('#storymode-wizard-progress-container').innerHTML = buildWizardProgressHTML(5);
                popupElement.querySelector('#storymode-wizard-preview-container').innerHTML = buildWizardPreview(blueprint, 5);
                if (statusElement) {
                    statusElement.innerHTML = '<span style="color: #10b981;">✓ Blueprint generation complete! Review your blueprint below.</span>';
                }
                popupElement.querySelector('#storymode-wizard-cancel-btn').style.display = 'none';
                popupElement.querySelector('#storymode-wizard-finish-btn').style.display = 'inline-block';
                popupElement.blueprintResult = retryResult;
            } catch (retryError) {
                console.error('[Story Mode] Retry error:', retryError);
                failedAtPhase = retryPhase;
                showWizardError({ error: retryError.message, phase: retryPhase });
            }
        });
    }

    // Set up show response button handler
    const showResponseBtn = popupElement.querySelector('#storymode-wizard-show-response-btn');
    if (showResponseBtn) {
        showResponseBtn.addEventListener('click', function () {
            if (lastRawResponse) {
                const responseHtml = `<textarea style="width: 100%; min-height: 400px; font-family: monospace; font-size: 0.85rem; padding: 10px; color: var(--black);" readonly>${escapeHtml(lastRawResponse)}</textarea>`;
                new Popup(responseHtml, POPUP_TYPE.TEXT, 'LLM Raw Response', {
                    okButton: true,
                    cancelButton: false,
                    wide: true,
                }).show();
            }
        });
    }

    // Listen for phase updates to show ending preview when Phase 4 completes
    const handlePhaseUpdate = (data) => {
        const { phase, blueprint } = data;

        // Show ending preview when Phase 4 data arrives
        if (phase === 4 && blueprint?.primary_ending) {
            const resolutionContainer = popupElement.querySelector('#storymode-resolution-selection-container');
            if (resolutionContainer) {
                resolutionContainer.style.display = 'block';
                resolutionContainer.innerHTML = buildPrimaryEndingDisplay(
                    blueprint.primary_ending,
                    blueprint.alternate_endings || []
                );
            }
        }
    };

    // Attach listener using SillyTavern's eventSource
    eventSource.on('STORY_MODE_PHASE_UPDATE', handlePhaseUpdate);

    // Store cleanup function to remove listener later
    const cleanup = () => {
        try {
            if (typeof eventSource.off === 'function') {
                eventSource.off('STORY_MODE_PHASE_UPDATE', handlePhaseUpdate);
            } else if (typeof eventSource.removeListener === 'function') {
                eventSource.removeListener('STORY_MODE_PHASE_UPDATE', handlePhaseUpdate);
            } else if (typeof eventSource.removeEventListener === 'function') {
                eventSource.removeEventListener('STORY_MODE_PHASE_UPDATE', handlePhaseUpdate);
            }
        } catch (e) {
            console.warn('[Story Mode] Failed to remove phase update listener:', e);
        }
    };
    wizardPopup._cleanup = cleanup;

    try {
        // Call buildBlueprintRequest to get the proper request structure
        const request = BlueprintModule.buildBlueprintRequest(config);

        // Call BlueprintModule.generateBlueprint() with phased mode
        const result = await BlueprintModule.generateBlueprint(request, storyTypes, authorStyles, { phased: true });

        // Check if user cancelled
        if (wizardPopup.isCancelled) {
            return;
        }

        if (result.success) {
            const blueprint = result.blueprint;
            const validationErrors = validateBlueprint(blueprint);

            // Update to show completion or validation errors
            const progressContainer = popupElement.querySelector('#storymode-wizard-progress-container');
            const previewContainer = popupElement.querySelector('#storymode-wizard-preview-container');
            const statusElement = popupElement.querySelector('#storymode-wizard-status');
            const actionsContainer = popupElement.querySelector('#storymode-wizard-actions');
            const resolutionContainer = popupElement.querySelector('#storymode-resolution-selection-container');
            const errorDetailsContainer = popupElement.querySelector('#storymode-wizard-error-details');
            const finishBtn = popupElement.querySelector('#storymode-wizard-finish-btn');
            const cancelBtn = popupElement.querySelector('#storymode-wizard-cancel-btn');

            if (validationErrors.length > 0) {
                // Show validation errors
                if (progressContainer) progressContainer.innerHTML = buildWizardProgressHTML(5);
                if (statusElement) statusElement.innerHTML = '<span style="color: #f59e0b;">⚠ Blueprint generation incomplete - some required fields are missing.</span>';

                if (errorDetailsContainer) {
                    errorDetailsContainer.style.display = 'block';
                    const errorMsg = popupElement.querySelector('#storymode-wizard-error-message');
                    const errorPhase = popupElement.querySelector('#storymode-wizard-error-phase');
                    if (errorMsg) errorMsg.textContent = 'The generated blueprint is missing: ' + validationErrors.join(', ');
                    if (errorPhase) errorPhase.textContent = 'The LLM may have returned incomplete data. Try regenerating.';
                }
                if (actionsContainer) actionsContainer.style.display = 'block';
                if (cancelBtn) cancelBtn.style.display = 'none';
                if (finishBtn) {
                    finishBtn.style.display = 'inline-block';
                    finishBtn.textContent = 'Close';
                }

                // Store result for potential save anyway (user choice)
                popupElement.blueprintResult = { success: true, blueprint, validationErrors };
            } else {
                console.log('[Story Mode] Phase generation success. Validating...');

                // Success - show completion
                if (progressContainer) progressContainer.innerHTML = buildWizardProgressHTML(5);
                if (previewContainer) previewContainer.innerHTML = buildWizardPreview(blueprint, 5);

                // Ask user about cover generation instead of auto-generating
                const coverGenSettings = extension_settings[MODULE_NAME]?.blueprintSettings?.coverGeneration;
                if (coverGenSettings?.autoGenerate && blueprint.cover_prompt) {
                    console.log('[Story Mode] Asking user about cover generation...');
                    const coverConfirm = await callGenericPopup(
                        'Generate Cover Image?',
                        'Would you like to generate a cover image for this blueprint?',
                        'Generate',
                        'Skip'
                    );

                    if (coverConfirm === POPUP_RESULT.AFFIRMATIVE) {
                        // User wants to generate cover
                        const coverContainer = popupElement.querySelector('#storymode-wizard-cover-container');
                        if (coverContainer) {
                            coverContainer.style.display = 'block';
                            coverContainer.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; gap: 10px;"><i class="fa-solid fa-paintbrush fa-spin" style="color: #3b82f6; font-size: 1.5em;"></i><span style="color: #3b82f6; font-weight: 500;">Generating cover image...</span></div>';
                        }

                        if (statusElement) {
                            statusElement.innerHTML = '<span style="color: #3b82f6;"><i class="fa-solid fa-paintbrush fa-spin"></i> Generating cover image...</span>';
                        }

                        try {
                            // Sync cover prompt if available
                            if (blueprint.cover_prompt && (!blueprint.metadata || !blueprint.metadata.coverPrompt)) {
                                blueprint.metadata = blueprint.metadata || {};
                                blueprint.metadata.coverPrompt = {
                                    positive: blueprint.cover_prompt,
                                    negative: 'text, watermark, signature, blurry, low quality, distorted, ugly, bad anatomy, extra limbs, cropped, worst quality, low resolution',
                                    style: 'digital art',
                                    technical: { aspect_ratio: '2:3' }
                                };
                            }

                            const coverResult = await generateCoverFromSD(blueprint);
                            if (coverResult.success && coverResult.imageUrl) {
                                await addCoverToGallery(blueprint, coverResult.imageUrl, blueprint.metadata.coverPrompt);
                                setCoverImageUrl(blueprint, coverResult.imageUrl);

                                // Hide the loading animation container
                                if (coverContainer) {
                                    coverContainer.style.display = 'none';
                                }

                                // Update the preview to show the cover image (smaller preview only)
                                if (previewContainer) {
                                    previewContainer.innerHTML = buildWizardPreview(blueprint, 5);
                                }

                                if (statusElement) {
                                    statusElement.innerHTML = '<span style="color: #10b981;">✓ Blueprint and cover generated successfully!</span>';
                                }
                                toastr.success('Cover image generated!');
                            } else {
                                if (coverContainer) {
                                    coverContainer.style.display = 'none';
                                }
                                toastr.warning('Cover generation failed: ' + (coverResult.error || 'Unknown error'));
                                if (statusElement) {
                                    statusElement.innerHTML = '<span style="color: #f59e0b;">⚠ Blueprint complete, but cover generation failed.</span>';
                                }
                            }
                        } catch (coverError) {
                            console.error('[Story Mode] Cover generation error:', coverError);
                            if (coverContainer) {
                                coverContainer.style.display = 'none';
                            }
                            toastr.warning('Blueprint generated, but cover generation encountered an error.');
                            if (statusElement) {
                                statusElement.innerHTML = '<span style="color: #f59e0b;">⚠ Blueprint complete, but cover generation failed.</span>';
                            }
                        }
                    } else {
                        // User skipped cover generation
                        if (statusElement) {
                            statusElement.innerHTML = '<span style="color: #10b981;">✓ Blueprint generation complete! Review your blueprint below.</span>';
                        }
                    }
                } else {
                    // No cover generation needed
                    if (statusElement) {
                        statusElement.innerHTML = '<span style="color: #10b981;">✓ Blueprint generation complete! Review your blueprint below.</span>';
                    }
                }

                // Show finish button, hide cancel
                console.log('[Story Mode] Showing wizard actions...');
                if (actionsContainer) {
                    actionsContainer.style.display = 'block';
                    console.log('[Story Mode] Actions container displayed.');
                } else {
                    console.error('[Story Mode] Actions container not found!');
                }

                if (cancelBtn) {
                    cancelBtn.style.display = 'inline-block';
                    cancelBtn.innerHTML = '<i class="fa-solid fa-xmark"></i> Discard & Close';
                    cancelBtn.title = "Close without saving";
                }
                if (finishBtn) {
                    finishBtn.style.display = 'inline-block';
                    finishBtn.innerHTML = '<i class="fa-solid fa-check"></i> Save & Close';
                }

                // Store the result for the finish button handler
                popupElement.blueprintResult = result;
            }
        } else {
            // Handle generation error
            // Parse error to extract phase information
            let errorPhase = result.phase || null;
            if (!errorPhase && result.error?.includes('Phase ')) {
                const phaseMatch = result.error.match(/Phase (\d)/);
                if (phaseMatch) errorPhase = parseInt(phaseMatch[1]);
            }

            // Store retry state
            failedAtPhase = errorPhase;
            partialBlueprintForRetry = result.partialBlueprint || null;
            requestForRetry = result.request || null;

            // Show error using helper
            showWizardError(result);
            popupElement.querySelector('#storymode-wizard-actions').style.display = 'block';
            popupElement.querySelector('#storymode-wizard-cancel-btn').style.display = 'none';
            popupElement.querySelector('#storymode-wizard-finish-btn').style.display = 'inline-block';
            popupElement.querySelector('#storymode-wizard-finish-btn').textContent = 'Close';
        }
    } catch (error) {
        console.error('[Story Mode] Wizard mode generation error:', error);

        if (wizardPopup.isCancelled) return;

        // Parse error to extract phase information
        let errorPhase = null;
        const errorMessage = error.message || 'Unknown error';
        if (errorMessage.includes('Phase ')) {
            const phaseMatch = errorMessage.match(/Phase (\d)/);
            if (phaseMatch) errorPhase = parseInt(phaseMatch[1]);
        }

        // Store retry state (catch block has no partialBlueprint/request)
        failedAtPhase = errorPhase;
        partialBlueprintForRetry = null;
        requestForRetry = null;

        // Show error using helper
        showWizardError({ error: errorMessage, phase: errorPhase });
        popupElement.querySelector('#storymode-wizard-actions').style.display = 'block';
        popupElement.querySelector('#storymode-wizard-cancel-btn').style.display = 'none';
        popupElement.querySelector('#storymode-wizard-finish-btn').style.display = 'inline-block';
        popupElement.querySelector('#storymode-wizard-finish-btn').textContent = 'Close';
        // No retry button in catch block (missing context)
        popupElement.querySelector('#storymode-wizard-retry-btn').style.display = 'none';
    }

    // Set up finish button handler
    const finishBtn = popupElement.querySelector('#storymode-wizard-finish-btn');
    if (finishBtn) {
        finishBtn.addEventListener('click', async function () {
            const result = popupElement.blueprintResult;
            if (result && result.blueprint) {
                // If there are validation errors, warn user
                if (result.validationErrors && result.validationErrors.length > 0) {
                    const proceed = confirm(
                        `The blueprint has some issues:\n\n${result.validationErrors.join('\n')}\n\nDo you still want to save it?`
                    );
                    if (!proceed) {
                        return;
                    }
                }

                // Sync blueprint settings to chat state with confirmation dialog
                const syncResult = await BlueprintModule.syncBlueprintSettings(result.blueprint, true);

                if (!syncResult.confirmed) {
                    console.log('[Story Mode] User cancelled blueprint sync, blueprint not saved');
                    toastr.warning('Blueprint generated but not saved. Settings sync was cancelled.');

                    // Return to library if from library context, otherwise go to overview
                    if (!returnToLibraryIfNeeded(content)) {
                        content.find('.storymode-blueprint-subtab[data-subtab="overview"]').click();
                    }

                    wizardPopup.complete(POPUP_RESULT.CANCELLED);
                    return;
                }

                // Save to library first (doesn't affect current chat state)
                try {
                    await saveCurrentBlueprintToLibrary({
                        title: result.blueprint.blueprint_title || result.blueprint.core_premise?.substring(0, 50),
                        generateCover: false, // Cover already generated if enabled
                        blueprint: result.blueprint // Pass explicit blueprint to avoid race condition
                    });
                    console.log('[Story Mode] Blueprint auto-saved to library');
                } catch (libError) {
                    console.error('[Story Mode] Failed to auto-save to library:', libError);
                    toastr.warning('Blueprint generated but could not be saved to library');
                }

                // Ask user if they want to start the story now
                const startNowHtml = `
                    <h3>Blueprint Generated Successfully!</h3>
                    <p>Your blueprint has been saved to the library.</p>
                    <p><strong>Would you like to start the story now?</strong></p>
                `;

                const startNow = await callGenericPopup(startNowHtml, POPUP_TYPE.CONFIRM, '', {
                    okButton: 'Start Story Now',
                    cancelButton: 'View in Library',
                });

                if (startNow === POPUP_RESULT.AFFIRMATIVE) {
                    // Create run copy and start story
                    const runState = BlueprintModule.createRunCopy(result.blueprint, 'wizard');
                    await BlueprintModule.saveBlueprintState(runState);

                    // Handle opening message if present
                    if (result.blueprint.opening_message) {
                        const useSaved = await callGenericPopup(
                            `This blueprint has an opening message:\n\n"${result.blueprint.opening_message.substring(0, 150)}${result.blueprint.opening_message.length > 150 ? '...' : ''}"\n\nWould you like to use it to start the story?`,
                            POPUP_TYPE.CONFIRM
                        );
                        if (useSaved === POPUP_RESULT.AFFIRMATIVE) {
                            await pushStoryMessage(result.blueprint.opening_message);
                            await saveChatConditional();
                        }
                    }

                    toastr.success('Story started from blueprint!', 'Story Mode');
                } else {
                    // Just return to library view
                    returnToLibraryIfNeeded(content);
                    // Refresh the library grid to show the new blueprint
                    const activeFolder = content.find('.storymode-folder-item.active').data('folder') || 'all';
                    await loadBlueprintsForFolder(content, activeFolder);
                    toastr.success('Blueprint saved to library!');
                }
            }

            // Close the wizard modal
            cleanupWizard();
            wizardPopup.complete(POPUP_RESULT.AFFIRMATIVE);
        });
    }

    // Clean up function to restore button states and remove event listeners
    function cleanupWizard() {
        // Remove event listener for phase updates
        if (wizardPopup._cleanup) {
            wizardPopup._cleanup();
        }
        // Hide cancel button, show generate button
        content.find('#blueprint_cancel_generation_btn').hide();
        content.find('#blueprint_generate_btn').show();
        // Clear the global reference
        window.storyModeWizardPopup = null;
    }

    // Register cleanup to run when modal closes
    wizardPopup.dlg.addEventListener('close', function () {
        cleanupWizard();
    }, { once: true });
}

/**
 * Update wizard progress indicator
 * @param {number} currentPhase - Current phase number (1-5)
 */
function updateWizardProgress(currentPhase) {
    // Update in wizard modal if active - use stored popup reference
    const wizardPopup = window.storyModeWizardPopup;
    if (wizardPopup && wizardPopup.content) {
        const progressContainer = wizardPopup.content.querySelector('#storymode-wizard-progress-container');
        if (progressContainer) {
            progressContainer.innerHTML = buildWizardProgressHTML(currentPhase);
        }

        // Also update status text
        const statusElement = wizardPopup.content.querySelector('#storymode-wizard-status');
        if (statusElement) {
            const phaseNames = ['', 'Foundation', 'Characters', 'Scenes', 'Resolutions'];
            const phaseName = currentPhase >= 1 && currentPhase <= 5 ? phaseNames[currentPhase] : 'Processing';
            statusElement.textContent = `Generating ${phaseName}... (Phase ${currentPhase}/4)`;
        }
    }
}

/**
 * Update wizard preview panel
 * @param {Object} partialBlueprint - Partial blueprint from completed phases
 * @param {number} currentPhase - Current phase number
 */
function updateWizardPreview(partialBlueprint, currentPhase) {
    // Update in wizard modal if active - use stored popup reference
    const wizardPopup = window.storyModeWizardPopup;
    if (wizardPopup && wizardPopup.content) {
        const previewContainer = wizardPopup.content.querySelector('#storymode-wizard-preview-container');
        if (previewContainer) {
            previewContainer.innerHTML = buildWizardPreview(partialBlueprint, currentPhase);
        }
    }
}

/**
 * Get phase message for display
 * @param {number} phase - Phase number (1-5)
 * @returns {string} Phase message
 */
function getPhaseMessage(phase) {
    return BlueprintModule.PHASE_CONFIG[phase]?.description || 'Processing...';
}

/**
 * Handle auto-cover generation for the wizard
 * @param {Object} blueprint - The generated blueprint
 * @param {HTMLElement} statusElement - Status element to update
 * @param {HTMLElement} previewContainer - Preview container to update
 * @returns {Promise<void>}
 */
async function handleWizardAutoCover(blueprint, statusElement, previewContainer) {
    // Auto-generate cover image if enabled
    const coverGenSettings = extension_settings[MODULE_NAME]?.blueprintSettings?.coverGeneration;
    if (!coverGenSettings?.autoGenerate) return;

    if (statusElement) {
        statusElement.innerHTML = '<span style="color: #3b82f6;"><i class="fa-solid fa-paintbrush fa-spin"></i> Generating cover image...</span>';
    }

    // Sync LLM-generated cover prompt if available
    if (blueprint.cover_prompt && (!blueprint.metadata || !blueprint.metadata.coverPrompt)) {
        blueprint.metadata = blueprint.metadata || {};
        // Create a basic prompt object structure compatible with SD
        blueprint.metadata.coverPrompt = {
            positive: blueprint.cover_prompt,
            negative: 'text, watermark, signature, blurry, low quality, distorted, ugly, bad anatomy, extra limbs, cropped, worst quality, low resolution',
            style: 'digital art',
            technical: { aspect_ratio: '2:3' }
        };
    }

    try {
        const coverResult = await generateCoverFromSD(blueprint);
        if (coverResult.success && coverResult.imageUrl) {
            await addCoverToGallery(blueprint, coverResult.imageUrl, blueprint.metadata.coverPrompt);
            setCoverImageUrl(blueprint, coverResult.imageUrl);

            // Update wizard preview if it exists
            if (previewContainer) {
                // Re-render preview to show new cover
                previewContainer.innerHTML = buildWizardPreview(blueprint, 5);
            }

            if (statusElement) {
                statusElement.innerHTML = '<span style="color: #10b981;">✓ Blueprint and cover generated successfully!</span>';
            }
        } else {
            toastr.warning('Blueprint generated, but cover generation failed: ' + (coverResult.error || 'Unknown error'));
            if (statusElement) {
                statusElement.innerHTML = '<span style="color: #f59e0b;">⚠ Blueprint generated, but cover generation failed.</span>';
            }
        }
    } catch (coverError) {
        console.error('[Story Mode] Cover generation error in wizard:', coverError);
        toastr.warning('Blueprint generated, but cover generation encountered an error.');
    }
}
