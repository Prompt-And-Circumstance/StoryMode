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
} from '/script.js';

import {
    extension_settings,
    getContext,
} from '/scripts/extensions.js';
import { getFileText, download } from '/scripts/utils.js';
import { callGenericPopup, Popup, POPUP_TYPE, POPUP_RESULT } from '/scripts/popup.js';
import { Popper } from '/lib.js';

// Import Blueprint module (Story Blueprints feature)
import * as BlueprintModule from './lib/blueprint-module.js';

// Import Blueprint Editor module
import { openBlueprintEditor } from './lib/blueprint-editor.js';

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
} from './lib/blueprint-integration.js';

// Import Loading Indicator module
import * as LoadingIndicator from './lib/loading-indicator.js';

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
} from './lib/state-manager.js';

// Import Arc Engine module
import {
    getPhaseInfo,
    buildStoryBlueprint,
    buildPhaseInjection,
    buildFullInjection,
    updateStoryPrompt,
} from './lib/arc-engine.js';

// Import Wand Menu module
import {
    registerWandMenuEntry,
    updateWandMenuStatus,
} from './lib/wand-menu.js';

// Import UI Components module
import {
    escapeHtml,
    renderMainPanel,
    renderBlueprintPreview,
    buildSidebarContent,
    buildStoryArcSubtab,
    buildAuthorStyleSubtab,
    buildBlueprintSettingsSubtab,
    buildPostArcOptionsSubtab,
    buildAPIOptionsSubtab,
    buildSettingsTabContent,
    buildGenerateBlueprintSubtab,
    buildBlueprintTabContent,
    renderBlueprintOverviewSubtab,
    renderBlueprintScenesSubtab,
    renderBlueprintCharactersSubtab,
    renderBlueprintJsonSubtab,
    buildSummaryTabContent,
    buildLibraryTabContent,
    renderBlueprintCard,
} from './lib/ui-components.js';

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
} from './lib/type-editors.js';

// Import Event Handlers module
import {
    onMessageReceived,
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
} from './lib/event-handlers.js';

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
async function showSettingsDialog() {
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
<button class="storymode-tab active" data-tab="settings" title="Configure story arc, author style, and blueprint settings">
<i class="fa-solid fa-gear"></i> Settings
</button>
<button class="storymode-tab" data-tab="blueprint" title="Generate and manage story blueprints">
<i class="fa-solid fa-scroll"></i> Blueprint
</button>
<button class="storymode-tab" data-tab="summary" title="View story arc summaries">
<i class="fa-solid fa-file-lines"></i> Summary
</button>
<button class="storymode-tab" data-tab="library" title="Save and manage your blueprint collection">
<i class="fa-solid fa-folder-open"></i> Library
</button>
</div>
<!-- Tab Content -->
<div class="storymode-tab-content">
<div id="tab_settings" class="storymode-tab-pane active">
${buildSettingsTabContent()}
</div>
<div id="tab_blueprint" class="storymode-tab-pane">
${buildBlueprintTabContent()}
</div>
<div id="tab_summary" class="storymode-tab-pane">
${buildSummaryTabContent()}
</div>
<div id="tab_library" class="storymode-tab-pane">
${buildLibraryTabContent()}
</div>
</div>
</div>
</div>
`;
const content = $(html);

// Tab switching - attached to content BEFORE showing popup
content.find('.storymode-tab').on('click', function() {
    const tabName = $(this).data('tab');
    console.log('[Story Mode] Tab clicked:', tabName);

    // Update tab buttons
    content.find('.storymode-tab').removeClass('active');
    $(this).addClass('active');

    // Update tab panes - use class manipulation only (CSS handles display)
    content.find('.storymode-tab-pane').removeClass('active');
    content.find(`#tab_${tabName}`).addClass('active');

    console.log('[Story Mode] Tab pane classes after switch:');
    content.find('.storymode-tab-pane').each(function() {
        console.log('[Story Mode]', $(this).attr('id'), 'has active:', $(this).hasClass('active'));
    });
});

// Settings subtab switching
content.on('click', '.storymode-settings-subtab', function() {
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
content.on('click', '.storymode-blueprint-subtab', function() {
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
            blueprintState.currentSceneIndex || 0
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

// Show popup
const popup = new Popup(content, POPUP_TYPE.TEXT, 'Story Mode Settings', {
okButton: 'Close',
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
        { selector: '#summary_api', settingsKey: 'summaryApi' }
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
content.find('#story_arc_enabled').on('change', function() {
const enabled = $(this).is(':checked');
extension_settings[MODULE_NAME].storyArcEnabled = enabled;
content.find('#story_arc_controls').toggle(enabled);
saveSettingsDebounced();
updateStoryPrompt();
updatePreviewInDialog(content);
updateStatusDisplay();
});
// Story type selection
content.find('#story_type_select').on('change', async function() {
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
const updateArcLength = async function(value) {
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
content.find('#arc_length_slider').on('input', async function() {
await updateArcLength($(this).val());
});
content.find('#arc_length_value').on('change', async function() {
await updateArcLength($(this).val());
});
// Author style toggle
content.find('#author_style_enabled').on('change', function() {
const enabled = $(this).is(':checked');
extension_settings[MODULE_NAME].authorStyleEnabled = enabled;
content.find('#author_style_controls').toggle(enabled);
saveSettingsDebounced();
updateStoryPrompt();
updatePreviewInDialog(content);
});
// Author style selection
content.find('#author_style_select').on('change', async function() {
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
content.find('#nsfw_enabled').on('change', function() {
extension_settings[MODULE_NAME].nsfwEnabled = $(this).is(':checked');
saveSettingsDebounced();
updateStoryPrompt();
updatePreviewInDialog(content);
});
// Epilogue toggle
content.find('#epilogue_enabled').on('change', function() {
extension_settings[MODULE_NAME].epilogueEnabled = $(this).is(':checked');
saveSettingsDebounced();
});
// Summary toggle
content.find('#summary_enabled').on('change', function() {
extension_settings[MODULE_NAME].summaryEnabled = $(this).is(':checked');
saveSettingsDebounced();
});
// Summary message count slider
content.find('#summary_message_count_slider').on('input', function() {
const value = parseInt($(this).val());
extension_settings[MODULE_NAME].summaryMessageCount = value;
content.find('#summary_message_count_value').text(value === 0 ? 'All' : value);
saveSettingsDebounced();
});
// Debug mode toggle
content.find('#debug_mode_enabled').on('change', function() {
extension_settings[MODULE_NAME].debugMode = $(this).is(':checked');
saveSettingsDebounced();
updateStoryPrompt();
});
// Injection settings
content.find('#injection_position').on('change', function() {
extension_settings[MODULE_NAME].position = parseInt($(this).val());
saveSettingsDebounced();
updateStoryPrompt();
});
content.find('#injection_depth').on('change', function() {
extension_settings[MODULE_NAME].depth = parseInt($(this).val());
saveSettingsDebounced();
updateStoryPrompt();
});
content.find('#injection_role').on('change', function() {
extension_settings[MODULE_NAME].role = parseInt($(this).val());
saveSettingsDebounced();
updateStoryPrompt();
});
// Edit buttons
content.find('#edit_story_types_btn').on('click', showStoryTypesEditor);
content.find('#edit_author_styles_btn').on('click', showAuthorStylesEditor);
// Reset arc button (sidebar)
content.find('#sidebar_reset_arc_btn').on('click', async function() {
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
content.find('#blueprint_enabled, #blueprint_enabled_tab').on('change', function() {
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
content.find('#blueprint_use_scene_prompts').on('change', function() {
const enabled = $(this).is(':checked');
if (!extension_settings[MODULE_NAME].blueprintSettings) {
extension_settings[MODULE_NAME].blueprintSettings = {};
}
extension_settings[MODULE_NAME].blueprintSettings.useScenePrompts = enabled;
saveSettingsDebounced();
updateStoryPrompt();
});
content.find('#blueprint_beat_tracking').on('change', function() {
    updateBlueprintSetting('beatTrackingEnabled', $(this).is(':checked'));
    // Refresh main panel to show/hide beat progress
    $('#story_mode_panel').replaceWith(renderMainPanel());
    setupEventListeners();
});
content.find('#blueprint_scene_transition_notify').on('change', function() {
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
    content.find(selector).on('change', function() {
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
content.find('#edit_scene_summary_prompt').on('click', async function() {
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
    content.find(selector).on('change', function() {
        const settings = extension_settings[MODULE_NAME];
        settings.blueprintSettings = settings.blueprintSettings || {};
        settings.blueprintSettings.coverGeneration = settings.blueprintSettings.coverGeneration || {};
        settings.blueprintSettings.coverGeneration[key] = transform(this);
        saveSettingsDebounced();
    });
});
content.find('#blueprint_generation_api').on('change', function() {
const selectedApi = $(this).val() || null;
extension_settings[MODULE_NAME].blueprintSettings = extension_settings[MODULE_NAME].blueprintSettings || {};
extension_settings[MODULE_NAME].blueprintSettings.generationApi = selectedApi;
saveSettingsDebounced();
console.log('[Story Mode] Settings Dialog: Generation API changed to:', selectedApi || 'main API');
console.log('[Story Mode] Settings Dialog: Full blueprintSettings.generationApi:', extension_settings[MODULE_NAME].blueprintSettings.generationApi);
});
// Opening message API dropdown
content.find('#opening_message_api').on('change', function() {
const selectedApi = $(this).val() || null;
extension_settings[MODULE_NAME].blueprintSettings = extension_settings[MODULE_NAME].blueprintSettings || {};
extension_settings[MODULE_NAME].blueprintSettings.openingMessageApi = selectedApi;
saveSettingsDebounced();
});
// Epilogue API dropdown
content.find('#epilogue_api').on('change', function() {
const selectedApi = $(this).val() || null;
extension_settings[MODULE_NAME].epilogueApi = selectedApi;
saveSettingsDebounced();
});
// Summary API dropdown
content.find('#summary_api').on('change', function() {
const selectedApi = $(this).val() || null;
extension_settings[MODULE_NAME].summaryApi = selectedApi;
saveSettingsDebounced();
});
// Loading Indicator settings
content.find('#loading_indicator_enabled').on('change', function() {
const enabled = $(this).is(':checked');
LoadingIndicator.updateSettings({ enabled });
});
content.find('#loading_indicator_position').on('change', function() {
const position = $(this).val();
LoadingIndicator.updateSettings({ position });
});
content.find('#loading_indicator_animation').on('change', function() {
const animationStyle = $(this).val();
LoadingIndicator.updateSettings({ animationStyle });
});
content.find('#loading_indicator_gif_url').on('change', function() {
const customGifUrl = $(this).val() || null;
LoadingIndicator.updateSettings({ customGifUrl });
});
content.find('#loading_indicator_phrases').on('change', function() {
const phrasesText = $(this).val();
const phrases = phrasesText.split('\n').map(p => p.trim()).filter(p => p.length > 0);
LoadingIndicator.updateSettings({ phrases });
});
content.find('#loading_indicator_preview').on('click', function() {
// Start animated preview
LoadingIndicator.startPreview();
});
// Reset Arc button (Story Arc subtab)
content.find('#reset_arc_btn').on('click', async function() {
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
// Generate blueprint button (Generate Blueprint subtab)
content.on('click', '#blueprint_generate_btn', async function() {
const btn = $(this);
const originalText = btn.html();
// Set loading state
btn.prop('disabled', true);
btn.html('<i class="fa-solid fa-circle-notch fa-spin"></i> Generating...');
LoadingIndicator.show('Generating story blueprint...');
try {
// Gather form data
const selectedCharacterIds = [];
content.find('input[name="blueprint_character"]:checked').each(function() {
const charId = $(this).val();
if (charId) {
selectedCharacterIds.push(charId);
}
});
console.log('[Story Mode] Selected character IDs:', selectedCharacterIds);
const selectedPersonas = [];
content.find('input[name="blueprint_persona"]:checked').each(function() {
const personaId = $(this).val();
const personaName = $(this).data('name');
if (personaId) {
selectedPersonas.push({
id: personaId,
name: personaName || personaId
});
}
});
console.log('[Story Mode] Selected personas:', selectedPersonas);
const scenario = content.find('#blueprint_scenario').val() || '';
const metaphorLevel = content.find('#blueprint_metaphor_level').val() || 'mixed';
const storyLength = content.find('#blueprint_story_length').val() || 'medium';
const customRounds = content.find('#blueprint_custom_rounds').val();
const customMasterPrompt = content.find('#blueprint_master_prompt').val() || null;
// Get story type and author style from new dropdowns
const storyTypeId = content.find('#blueprint_story_type').val() || '';
const authorStyleId = content.find('#blueprint_author_style').val() || '';
// Use custom rounds if provided and valid, otherwise use the selected story length
const finalStoryLength = customRounds && parseInt(customRounds) > 0 ? parseInt(customRounds) : parseInt(storyLength);
// Build character data from context
const context = getContext();
const characterData = [];
if (context.groupId) {
// Group chat: get all characters from the group
const group = context.groups?.find(g => g.id === context.groupId);
if (group && group.members) {
group.members.forEach(memberFilename => {
// Find the character in the characters array by matching filename
const charIndex = (context.characters || []).findIndex(c =>
c.filename === memberFilename ||
c.avatar === memberFilename ||
(typeof c === 'string' && c === memberFilename)
);
if (charIndex !== -1 && selectedCharacterIds.includes(charIndex.toString())) {
const char = context.characters[charIndex];
if (char) {
characterData.push({
name: char.name,
description: char.description,
personality: char.personality,
scenario: char.scenario,
greeting: char.greeting
});
}
}
});
}
} else {
// Single chat: get the main character
if (selectedCharacterIds.includes(context.characterId?.toString())) {
const char = context.characters?.[parseInt(context.characterId, 10)];
if (char) {
characterData.push({
name: char.name,
description: char.description,
personality: char.personality,
scenario: char.scenario,
greeting: char.greeting
});
}
}
}
// Build request config object
const config = {
    storyTypeId,
    authorStyleId: authorStyleId || undefined,
    characterData,
    personaData: selectedPersonas,
    scenario,
    messageTarget: finalStoryLength,
    metaphorLevel: metaphorLevel,
    customMasterPrompt: customMasterPrompt
};
console.log('[Story Mode] Blueprint config:', {
    storyTypeId: config.storyTypeId,
    authorStyleId: config.authorStyleId,
    characterDataCount: config.characterData.length,
    personaDataCount: config.personaData.length,
    messageTarget: config.messageTarget
});
// Call buildBlueprintRequest to get the proper request structure
const request = BlueprintModule.buildBlueprintRequest(config);
// Call BlueprintModule.generateBlueprint() with properly structured request
const result = await BlueprintModule.generateBlueprint(request, storyTypes, authorStyles);
if (result.success) {
    // Sync blueprint settings to chat state with confirmation dialog
    const syncResult = await BlueprintModule.syncBlueprintSettings(result.blueprint, true);

    // Check if user cancelled the sync
    if (!syncResult.confirmed) {
        console.log('[Story Mode] User cancelled blueprint sync, blueprint not saved');
        toastr.warning('Blueprint generated but not saved. Settings sync was cancelled.');
        content.find('.storymode-blueprint-subtab[data-subtab="overview"]').click();
        return;
    }

    // Save the blueprint to blueprint state
    console.log('[Story Mode] Saving blueprint to blueprint state...');
    const blueprintState = BlueprintModule.getBlueprintState();
    blueprintState.blueprint = result.blueprint;
    blueprintState.useBlueprint = true;
    blueprintState.currentSceneIndex = 0;
    blueprintState.sceneMode = 'auto';
    await BlueprintModule.saveBlueprintState(blueprintState);
    console.log('[Story Mode] Blueprint saved to blueprint state');

    toastr.success('Blueprint generated and settings synced');
    content.find('.storymode-blueprint-subtab[data-subtab="overview"]').click();
    refreshSidebar(content);
    updateStatusDisplay();
} else {
    // Extract error message from either string or array
    const errorMessage = result.error || result.errors?.join(', ') || 'Unknown error';
    toastr.error(`Failed to generate blueprint: ${errorMessage}`);

    if (result.isLikelyTruncated) {
        console.warn('[Story Mode] Blueprint response was truncated. Consider increasing the token limit.');
    }
}
} catch (error) {
console.error('[Story Mode] Error generating blueprint:', error);
toastr.error(`Failed to generate blueprint: ${error.message}`);
} finally {
// Restore button state
LoadingIndicator.hide();
btn.prop('disabled', false);
btn.html(originalText);
}
});
// Load blueprint button (Generate Blueprint subtab)
content.on('click', '#blueprint_import_btn', function() {
const input = document.createElement('input');
input.type = 'file';
input.accept = '.json';
input.onchange = async (e) => {
const file = e.target.files[0];
if (file) {
try {
const reader = new FileReader();
reader.onload = async (event) => {
try {
const blueprint = JSON.parse(event.target.result);
// Validate blueprint
const validation = BlueprintModule.validateBlueprint(blueprint);
if (!validation.valid) {
toastr.error('Invalid blueprint: ' + validation.errors.join(', '));
return;
}
const blueprintState = BlueprintModule.getBlueprintState();
blueprintState.blueprint = blueprint;
blueprintState.useBlueprint = true;
blueprintState.currentSceneIndex = 0;
blueprintState.sceneMode = 'auto';
await BlueprintModule.saveBlueprintState(blueprintState);
// Sync blueprint settings to chat state with confirmation dialog
await BlueprintModule.syncBlueprintSettings(blueprint, true);
toastr.success('Blueprint loaded and settings synced');
// Switch to Overview tab
content.find('.storymode-blueprint-subtab[data-subtab="overview"]').click();
// Refresh sidebar
refreshSidebar(content);
updateStatusDisplay();
} catch (parseError) {
console.error('[Story Mode] Error parsing blueprint JSON:', parseError);
toastr.error('Invalid blueprint JSON');
}
};
reader.readAsText(file);
} catch (error) {
console.error('[Story Mode] Error reading blueprint file:', error);
toastr.error('Failed to read file');
}
}
};
input.click();
});
// Generate opening message button (Blueprint Overview subtab)
content.on('click', '#generate_opening_message_btn', async function() {
const btn = $(this);
btn.prop('disabled', true);
LoadingIndicator.show('Crafting opening message...');
try {
const result = await BlueprintModule.generateOpeningMessage();
if (result.success) {
// Create and add the system message directly
await pushStoryMessage(result.opening);
await saveChatConditional();
toastr.success('Opening message generated and added to chat');
} else {
toastr.error(`Failed to generate opening: ${result.error || 'Unknown error'}`);
btn.prop('disabled', false);
}
} catch (error) {
console.error('[Story Mode] Error generating opening message:', error);
toastr.error(`Failed to generate opening: ${error.message}`);
btn.prop('disabled', false);
} finally {
LoadingIndicator.hide();
btn.prop('disabled', false);
}
});
// Import blueprint button - supports both JSON and PNG
content.find('#import_blueprint_btn').on('click', function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.png';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        LoadingIndicator.show('Importing blueprint...');

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

            // Load into state
            const blueprintState = BlueprintModule.getBlueprintState();
            blueprintState.blueprint = blueprint;
            blueprintState.useBlueprint = true;
            blueprintState.currentSceneIndex = 0;
            blueprintState.sceneMode = 'auto';
            await BlueprintModule.saveBlueprintState(blueprintState);

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
            LoadingIndicator.hide();
        }
    };
    input.click();
});

// Export blueprint button
content.on('click', '#blueprint_export_btn', async function() {
    const blueprintState = BlueprintModule.getBlueprintState();
    if (!blueprintState.blueprint) {
        toastr.error('No blueprint to export');
        return;
    }

    const btn = $(this);
    const originalText = btn.html();
    btn.prop('disabled', true);
    btn.html('<i class="fa-solid fa-spinner fa-spin"></i> Exporting...');
    LoadingIndicator.show('Exporting blueprint as JSON...');

    try {
        // Use the simple JSON export function from blueprint-module.js
        BlueprintModule.exportBlueprint(blueprintState.blueprint);
        toastr.success('Blueprint exported successfully');
    } catch (error) {
        console.error('[Story Mode] Error exporting blueprint:', error);
        toastr.error('Failed to export: ' + error.message);
    } finally {
        LoadingIndicator.hide();
        btn.prop('disabled', false);
        btn.html(originalText);
    }
});

    // Edit blueprint button
    content.on('click', '#blueprint_edit_btn', async function() {
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
    content.on('click', '#blueprint_clear_btn', async function() {
    if (!confirm('Clear the current blueprint? This cannot be undone.')) return;
    const blueprintState = BlueprintModule.getBlueprintState();
    blueprintState.blueprint = null;
    blueprintState.useBlueprint = false;
    blueprintState.currentSceneIndex = 0;
    await BlueprintModule.saveBlueprintState(blueprintState);
    // Refresh tabs
    content.find('#tab_blueprint').html(buildBlueprintTabContent());
    refreshSidebar(content);
    updateStatusDisplay();
    toastr.success('Blueprint cleared');
    });

    // Scene slider - click on scene marker to jump to that scene
    content.on('click', '.storymode-scene-marker', async function() {
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
                    blueprintState.currentSceneIndex
                );
                content.find('#blueprint_subtab_content').html(renderBlueprintOverviewSubtab(blueprint, currentScene));
            }
        } else {
            toastr.error(result.message);
        }
    });

    // Scene slider - click on round tick to jump to that round
    content.on('click', '.storymode-round-ticks .tick', async function() {
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
                    blueprintState.currentSceneIndex
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
    content.on('click', '.storymode-tab[data-tab="library"]', async function() {
        await refreshLibraryView(content);
    });

    // Folder selection
    content.on('click', '.storymode-folder-item', async function() {
        const folderId = $(this).data('folder');
        content.find('.storymode-folder-item').removeClass('active');
        $(this).addClass('active');
        await loadBlueprintsForFolder(content, folderId);
    });

    // Search input
    content.on('input', '#library_search_input', debounce(async function() {
        const query = $(this).val().trim();
        if (query.length >= 2) {
            await searchLibraryBlueprints(content, query);
        } else if (query.length === 0) {
            const activeFolder = content.find('.storymode-folder-item.active').data('folder') || 'all';
            await loadBlueprintsForFolder(content, activeFolder);
        }
    }, 300));

    // Save current blueprint to library
    content.on('click', '#library_save_current_btn, #library_empty_save_btn', async function() {
        const blueprintState = BlueprintModule.getBlueprintState();
        if (!blueprintState.blueprint) {
            toastr.error('No blueprint to save. Generate one first in the Blueprint tab.');
            return;
        }

        const btn = $(this);
        btn.prop('disabled', true);

        try {
            // Add user metadata if not present
            if (!blueprintState.blueprint.userMetadata) {
                blueprintState.blueprint.userMetadata = {};
            }
            if (!blueprintState.blueprint.userMetadata.title) {
                blueprintState.blueprint.userMetadata.title = blueprintState.blueprint.core_premise?.substring(0, 50) || 'Untitled Blueprint';
            }

            await createBlueprint(blueprintState.blueprint, { saveToLibrary: true });
            toastr.success('Blueprint saved to library!');
            await refreshLibraryView(content);
        } catch (error) {
            console.error('[Story Mode] Error saving blueprint to library:', error);
            toastr.error('Failed to save blueprint: ' + error.message);
        } finally {
            btn.prop('disabled', false);
        }
    });

    // Blueprint card actions
    content.on('click', '.storymode-blueprint-card [data-action]', async function(e) {
        e.stopPropagation();
        const action = $(this).data('action');
        const card = $(this).closest('.storymode-blueprint-card');
        const blueprintId = card.data('blueprint-id');

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

    // Blueprint cover image click - opens editor
    content.on('click', '.storymode-blueprint-card .storymode-card-cover', async function(e) {
        // Don't trigger if clicking the favorite button
        if ($(e.target).closest('.storymode-card-favorite').length > 0) {
            return;
        }
        const card = $(this).closest('.storymode-blueprint-card');
        const blueprintId = card.data('blueprint-id');
        await editBlueprintFromLibrary(content, blueprintId);
    });

    // View toggle (grid/list)
    content.on('click', '#library_view_grid, #library_view_list', function() {
        const viewType = $(this).attr('id') === 'library_view_grid' ? 'grid' : 'list';
        content.find('.storymode-view-toggle .menu_button').removeClass('active');
        $(this).addClass('active');
        content.find('.storymode-library-grid').toggleClass('list-view', viewType === 'list');
    });

    // Sort selection
    content.on('change', '#library_sort_select', async function() {
        const activeFolder = content.find('.storymode-folder-item.active').data('folder') || 'all';
        await loadBlueprintsForFolder(content, activeFolder);
    });

    // Library import button - import PNG/JSON directly to library
    content.on('click', '#library_import_btn', function() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.png';
        input.multiple = true;
        input.onchange = async (e) => {
            const files = Array.from(e.target.files);
            if (files.length === 0) return;

            LoadingIndicator.show(`Importing ${files.length} blueprint(s)...`);
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

            LoadingIndicator.hide();
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

        // Load into current blueprint state
        const blueprintState = BlueprintModule.getBlueprintState();
        blueprintState.blueprint = blueprint;
        blueprintState.useBlueprint = true;
        await BlueprintModule.saveBlueprintState(blueprintState);

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
 * Play blueprint from library - load and immediately start the story
 */
async function playBlueprintFromLibrary(content, blueprintId) {
    try {
        const library = await getLibrary();
        const blueprint = await library.getBlueprint(blueprintId);

        if (!blueprint) {
            toastr.error('Blueprint not found');
            return;
        }

        // Load into current blueprint state
        const blueprintState = BlueprintModule.getBlueprintState();
        blueprintState.blueprint = blueprint;
        blueprintState.useBlueprint = true;
        await BlueprintModule.saveBlueprintState(blueprintState);

        // Update play stats
        await library.stats.recordPlayStart(blueprintId);

        // Start the story from the blueprint
        const result = await BlueprintModule.startStoryFromBlueprint(blueprint);

        if (result.success) {
            if (result.warnings?.length > 0) {
                const warningHtml = `
                    <h3>Story Started with Warnings</h3>
                    <ul style="text-align: left;">
                        ${result.warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}
                    </ul>
                `;
                await callGenericPopup(warningHtml, POPUP_TYPE.TEXT, null, { wide: true });
            }
            // Close settings dialog and trigger opening message
            $('#story_mode_settings_dialog').find('.pop-button-ok').trigger('click');
        } else {
            await callGenericPopup(
                `<h3>Failed to Start Story</h3><p>${escapeHtml(result.error)}</p>`,
                POPUP_TYPE.TEXT,
                null,
                { wide: true }
            );
        }
    } catch (error) {
        console.error('[Story Mode] Error playing blueprint:', error);
        toastr.error('Failed to play blueprint');
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
 * Export blueprint from library as PNG
 */
async function exportBlueprintFromLibrary(blueprintId) {
    try {
        const library = await getLibrary();
        const blueprint = await library.getBlueprint(blueprintId);

        if (!blueprint) {
            toastr.error('Blueprint not found');
            return;
        }

        LoadingIndicator.show('Exporting blueprint...');

        // Export as PNG with embedded metadata
        const pngBlob = await encodeBlueprintAsPNG(blueprint);
        const filename = `${(blueprint.userMetadata?.title || 'blueprint').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.png`;

        // Trigger download
        const url = URL.createObjectURL(pngBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        toastr.success('Blueprint exported as PNG');
    } catch (error) {
        console.error('[Story Mode] Error exporting blueprint:', error);
        toastr.error('Failed to export blueprint: ' + error.message);
    } finally {
        LoadingIndicator.hide();
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
$('#story_mode_enabled').on('change', function() {
const enabled = $(this).is(':checked');
extension_settings[MODULE_NAME].enabled = enabled;
saveSettingsDebounced();
updateStoryPrompt();
updateStatusDisplay();
});
// Open settings dialog
$('#open_story_mode_settings').on('click', showSettingsDialog);
// Generate opening message button
$(document).on('click', '#generate_opening_btn', async function() {
const btn = $(this);
const statusDiv = $('#generate_opening_status');
const originalText = btn.html();
// Check if save to blueprint is enabled
const saveToBlueprint = $('#save_opening_to_blueprint').is(':checked');
// Set loading state
btn.prop('disabled', true);
btn.html('<i class="fa-solid fa-circle-notch fa-spin"></i> Generating...');
statusDiv.text('Generating opening message...').show();
LoadingIndicator.show('Generating opening message...');
try {
const result = await BlueprintModule.generateOpeningMessage({ saveToBlueprint });
if (result.success) {
// Note: We no longer auto-push the opening message to chat
// The user can use "Start Story" which will prompt for saved opening message
const statusText = saveToBlueprint
    ? 'Opening message generated and saved to blueprint! Use "Start Story" to add it to chat.'
    : 'Opening message generated! (not saved)';
statusDiv.text(statusText).css('color', 'var(--SmartThemeQuoteColor)');
toastr.success(statusText, 'Blueprint');
// Refresh the blueprint tab UI to show the stored message
if (saveToBlueprint) {
    const blueprintState = BlueprintModule.getBlueprintState();
    if (blueprintState.blueprint) {
        // Refresh the blueprint tab to show the updated opening message
        $(document).trigger('story_mode_blueprint_updated');
    }
}
} else {
// Show error
statusDiv.text(`Error: ${result.error}`).css('color', 'var(--corruption)');
toastr.error(`Failed to generate opening: ${result.error}`, 'Blueprint Error');
}
} catch (error) {
console.error('[Story Mode] Error generating opening message:', error);
statusDiv.text('Error generating opening').css('color', 'var(--corruption)');
toastr.error(`Failed to generate opening: ${error.message}`, 'Blueprint Error');
} finally {
// Restore button state
btn.prop('disabled', false);
btn.html(originalText);
LoadingIndicator.hide();
}
});
/**
 * Helper function to generate and push an opening message.
 * Reduces duplication in start_story_from_blueprint_btn handler.
 * @param {jQuery} btn - The button element to show loading state on
 * @param {string} successMessage - Success message for toast notification
 * @returns {Promise<boolean>} - True if successful, false otherwise
 */
async function generateAndPushOpening(btn, successMessage) {
    btn.html('<i class="fa-solid fa-circle-notch fa-spin"></i> Generating opening...');
    const openingResult = await BlueprintModule.generateOpeningMessage({ saveToBlueprint: true });

    if (!openingResult.success) {
        toastr.error(`Failed to generate opening: ${openingResult.error}`, 'Blueprint Error');
        toastr.info('Story started successfully, but opening generation failed', 'Story Mode');
        return false;
    }

    await pushStoryMessage(openingResult.opening);
    await saveChatConditional();
    toastr.success(successMessage, 'Story Mode');
    return true;
}

// Start Story from Blueprint button (in settings dialog)
$(document).on('click', '#start_story_from_blueprint_btn', async function() {
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
    LoadingIndicator.show('Starting story from blueprint...');

    try {
        // Start the story from blueprint (syncs settings, enables features)
        const result = await BlueprintModule.startStoryFromBlueprint(blueprintState.blueprint);

        if (!result.success) {
            toastr.error(result.error || 'Failed to start story', 'Blueprint Error');
            return;
        }

        // Show any warnings
        result.warnings?.forEach(w => toastr.warning(w, 'Blueprint Warning'));

        // Handle opening message logic
        const savedOpening = blueprintState.blueprint?.opening_message;
        let shouldGenerateOpening = false;
        let openingUsed = false;

        if (savedOpening) {
            // Ask if user wants to use the saved opening message
            const useSaved = await callGenericPopup(
                `This blueprint has a saved opening message:\n\n"${savedOpening.substring(0, 100)}${savedOpening.length > 100 ? '...' : ''}"\n\nWould you like to use this saved opening message?`,
                POPUP_TYPE.CONFIRM
            );

            if (useSaved === POPUP_RESULT.AFFIRMATIVE) {
                await pushStoryMessage(savedOpening);
                await saveChatConditional();
                toastr.success('Story started with saved opening message!', 'Story Mode');
                openingUsed = true;
            } else {
                // Ask if they want to generate a new one instead
                const generateNew = await callGenericPopup(
                    'Would you like to generate a new opening message instead?',
                    POPUP_TYPE.CONFIRM
                );
                shouldGenerateOpening = (generateNew === POPUP_RESULT.AFFIRMATIVE);
            }
        } else {
            // No saved opening - ask if user wants to generate one
            const generateOpening = await callGenericPopup(
                'Would you like to generate an opening message for Scene 1?',
                POPUP_TYPE.CONFIRM
            );
            shouldGenerateOpening = (generateOpening === POPUP_RESULT.AFFIRMATIVE);
        }

        // Generate opening if requested (using the same code path for both cases)
        if (shouldGenerateOpening) {
            await generateAndPushOpening(btn, savedOpening
                ? 'Story started with new opening message!'
                : 'Story started with opening message!');
            openingUsed = true;
        } else if (!openingUsed) {
            toastr.success('Story started from blueprint!', 'Story Mode');
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
        LoadingIndicator.hide();
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
content.find('#story_mode_enabled').on('change', function() {
const enabled = $(this).is(':checked');
extension_settings[MODULE_NAME].enabled = enabled;
$('#story_mode_enabled').prop('checked', enabled); // Sync with main panel
content.find('#story_mode_content').toggle(enabled);
saveSettingsDebounced();
updateStoryPrompt();
updateStatusDisplay();
});
// Story arc toggle
content.find('#story_arc_enabled').on('change', function() {
const enabled = $(this).is(':checked');
extension_settings[MODULE_NAME].storyArcEnabled = enabled;
content.find('#story_arc_controls').toggle(enabled);
saveSettingsDebounced();
updateStoryPrompt();
updatePreviewInDialog(content);
updateStatusDisplay();
});
// Story type selection
content.find('#story_type_select').on('change', async function() {
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
content.find('#arc_length_slider').on('input', async function() {
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
content.find('#reset_arc_btn').on('click', function() {
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
content.find('#author_style_enabled').on('change', function() {
const enabled = $(this).is(':checked');
extension_settings[MODULE_NAME].authorStyleEnabled = enabled;
content.find('#author_style_controls').toggle(enabled);
saveSettingsDebounced();
updateStoryPrompt();
updatePreviewInDialog(content);
});
// Author style search
content.find('#author_style_search').on('input', function() {
const query = $(this).val();
updateAuthorStyleDropdownInDialog(content, query);
});
// Author style selection
content.find('#author_style_select').on('change', async function() {
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
content.find('#nsfw_enabled').on('change', function() {
extension_settings[MODULE_NAME].nsfwEnabled = $(this).is(':checked');
saveSettingsDebounced();
updateStoryPrompt();
updatePreviewInDialog(content);
});
// Epilogue toggle
content.find('#epilogue_enabled').on('change', function() {
extension_settings[MODULE_NAME].epilogueEnabled = $(this).is(':checked');
saveSettingsDebounced();
});
// Summary toggle
content.find('#summary_enabled').on('change', function() {
extension_settings[MODULE_NAME].summaryEnabled = $(this).is(':checked');
saveSettingsDebounced();
});
// Summary message count slider
content.find('#summary_message_count_slider').on('input', function() {
const value = parseInt($(this).val());
extension_settings[MODULE_NAME].summaryMessageCount = value;
content.find('#summary_message_count_value').text(value === 0 ? 'Entire Chat' : value);
saveSettingsDebounced();
});
// Debug mode toggle
content.find('#debug_mode_enabled').on('change', function() {
extension_settings[MODULE_NAME].debugMode = $(this).is(':checked');
saveSettingsDebounced();
updateStoryPrompt();
});
// Blueprint settings
content.find('#blueprint_enabled').on('change', function() {
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
content.find('#blueprint_use_scene_prompts').on('change', function() {
const enabled = $(this).is(':checked');
if (!extension_settings[MODULE_NAME].blueprintSettings) {
extension_settings[MODULE_NAME].blueprintSettings = {};
}
extension_settings[MODULE_NAME].blueprintSettings.useScenePrompts = enabled;
saveSettingsDebounced();
updateStoryPrompt();
});
content.find('#blueprint_beat_tracking').on('change', function() {
    updateBlueprintSetting('beatTrackingEnabled', $(this).is(':checked'));
    // Refresh main panel to show/hide beat progress
    $('#story_mode_panel').replaceWith(renderMainPanel());
    setupEventListeners();
});
content.find('#blueprint_generation_api').on('change', function() {
const selectedApi = $(this).val() || null;
if (!extension_settings[MODULE_NAME].blueprintSettings) {
extension_settings[MODULE_NAME].blueprintSettings = {};
}
extension_settings[MODULE_NAME].blueprintSettings.generationApi = selectedApi;
saveSettingsDebounced();
console.log('[Story Mode] Generation API changed to:', selectedApi || 'main API');
});
content.find('#edit_blueprint_master_prompt').on('click', async function() {
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
content.find('#injection_position').on('change', function() {
extension_settings[MODULE_NAME].position = parseInt($(this).val());
saveSettingsDebounced();
updateStoryPrompt();
});
content.find('#injection_depth').on('change', function() {
extension_settings[MODULE_NAME].depth = parseInt($(this).val());
saveSettingsDebounced();
updateStoryPrompt();
});
content.find('#injection_role').on('change', function() {
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
blueprintState.currentSceneIndex
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
jQuery(async function() {
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
    LoadingIndicator.init();
    console.log('[Story Mode] Loading Indicator module initialized');

    // Add UI
    await addUI();

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
    eventSource.on(event_types.CHAT_CHANGED, onChatChanged);

    // Initial prompt injection
    updateStoryPrompt();

    console.log('[Story Mode] Extension loaded successfully');
});