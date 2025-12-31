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
} from '/script.js';

import {
    extension_settings,
} from '/scripts/extensions.js';

import { getFileText, download } from '/scripts/utils.js';
import { callGenericPopup, Popup, POPUP_TYPE } from '/scripts/popup.js';

const MODULE_NAME = 'story_mode';

// Get the base URL of this extension
  const extensionBaseUrl = new URL('.', import.meta.url).href;

// Default settings
const defaultSettings = {
    enabled: false,
    storyArcEnabled: false,
    selectedStoryType: '',
    selectedAuthorStyle: '',
    arcLength: 30,
    currentStep: 0,
    authorStyleEnabled: false,
    nsfwEnabled: false,
    epilogueEnabled: false,
    summaryEnabled: false,
    summaryMessageCount: 0, // 0 = entire chat, >0 = last N messages
    debugMode: false,
    position: extension_prompt_types.IN_CHAT,
    depth: 4,
    role: extension_prompt_roles.SYSTEM,
    // Note: storyTypes and authorStyles are now stored in localForage, not extension_settings
};

// Data storage
let storyTypes = [];
let authorStyles = [];
let fuseStoryTypes = null;
let fuseAuthorStyles = null;

// Track regeneration state
let isRegenerating = false;
let isLoadingChat = false;
let lastMessageId = null;

  /**
   * Load story types from localForage storage.
   * Falls back to loading from the JSON file if nothing is stored.
   * Initializes Fuse.js for fuzzy search after loading.
   * 
   * @async
   * @returns {Promise<void>}
   */
async function loadStoryTypes() {
    try {
        // Try to load from localForage first
        const stored = await localforage.getItem('story_mode_story_types');

        if (stored && Array.isArray(stored) && stored.length > 0) {
            storyTypes = stored;
            console.log('[Story Mode] Loaded', storyTypes.length, 'story types from storage');
        } else {
            // Fallback to JSON file on first load
            const response = await fetch(new URL('data/story_types.json', extensionBaseUrl));
            if (response.ok) {
                const data = await response.json();
                storyTypes = data;
                // Save to localForage for future use
                await localforage.setItem('story_mode_story_types', storyTypes);
                console.log('[Story Mode] Loaded', storyTypes.length, 'story types from file and saved to storage');
            }
        }

        // Initialize Fuse.js for fuzzy search
        if (typeof Fuse !== 'undefined') {
            try {
                fuseStoryTypes = new Fuse(storyTypes, {
                    keys: ['name', 'category', 'storyPrompt'],
                    threshold: 0.3,
                });
            } catch (fuseError) {
                console.error('[Story Mode] Failed to initialize Fuse.js:', fuseError);
            }
        }
        
    } catch (error) {
        console.error('[Story Mode] Failed to load story types:', error);
    }
}

  /**
   * Load author styles from localForage storage.
   * Falls back to loading from the JSON file if nothing is stored.
   * Initializes Fuse.js for fuzzy search after loading.
   * 
   * @async
   * @returns {Promise<void>}
   */
async function loadAuthorStyles() {
    try {
        // Try to load from localForage first
        const stored = await localforage.getItem('story_mode_author_styles');

        if (stored && Array.isArray(stored) && stored.length > 0) {
            authorStyles = stored;
            console.log('[Story Mode] Loaded', authorStyles.length, 'author styles from storage');
        } else {
            // Fallback to JSON file on first load
            const response = await fetch(new URL('data/author_styles.json', extensionBaseUrl));
            if (response.ok) {
                const data = await response.json();
                authorStyles = data;
                // Save to localForage for future use
                await localforage.setItem('story_mode_author_styles', authorStyles);
                console.log('[Story Mode] Loaded', authorStyles.length, 'author styles from file and saved to storage');
            }
        }

        // Initialize Fuse.js for fuzzy search
        if (typeof Fuse !== 'undefined') {
            fuseAuthorStyles = new Fuse(authorStyles, {
                keys: ['name', 'category', 'authorPrompt', 'keywords'],
                threshold: 0.3,
            });
        }
    } catch (error) {
        console.error('[Story Mode] Failed to load author styles:', error);
    }
}

  /**
   * Load extension settings from the global extension_settings object.
   * Merges loaded settings with defaults to ensure all properties exist.
   * 
   * @returns {void}
   */
function loadSettings() {
    if (!extension_settings[MODULE_NAME]) {
        extension_settings[MODULE_NAME] = structuredClone(defaultSettings);
    }

    // Merge with defaults
    extension_settings[MODULE_NAME] = Object.assign(
        {},
        defaultSettings,
        extension_settings[MODULE_NAME]
    );

    console.log('[Story Mode] Settings loaded:', extension_settings[MODULE_NAME]);
}

 /**
   * Get the current per-chat story mode state from chat metadata.
   * Initializes the metadata object with global defaults if not present.
   * 
   * @returns {Object} The chat's story mode state containing currentStep, arcStarted,
   *                   epilogueShown, summaryShown, selectedStoryType, selectedAuthorStyle, and arcLength.
   */
function getChatStoryState() {
    // Always pull a fresh context to ensure we're reading the latest state
    const { chatMetadata } = SillyTavern.getContext();

    if (!chatMetadata[MODULE_NAME]) {
        // Initialize new chat with current global settings
        const settings = extension_settings[MODULE_NAME];
        chatMetadata[MODULE_NAME] = {
            currentStep: 0,
            arcStarted: false,
            epilogueShown: false,
            summaryShown: false,
            selectedStoryType: settings.selectedStoryType || '',
            selectedAuthorStyle: settings.selectedAuthorStyle || '',
            arcLength: settings.arcLength || 30,
        };
        console.log('[Story Mode] Initialized new chat with global settings:', chatMetadata[MODULE_NAME]);
    }
    return chatMetadata[MODULE_NAME];
}

  /**
   * Save the per-chat story mode state to metadata and persist to server.
   * Emits a CHAT_METADATA_UPDATED event after saving.
   * 
   * @async
   * @param {Object} state - The story mode state object to save.
   * @returns {Promise<void>}
   */
async function saveChatStoryState(state) {
    // Always pull a fresh context
    const { chatMetadata, saveMetadata } = SillyTavern.getContext();

    // Update this chat's metadata
    chatMetadata[MODULE_NAME] = state;

    console.log('[Story Mode] saving story_mode state:', chatMetadata[MODULE_NAME]);

    // Persist to the server/chat file
    await saveMetadata();

    // Optional notification
    eventSource.emit(event_types.CHAT_METADATA_UPDATED);
}
/**
 * Calculate phase information based on current step and arc length.
 * Divides the story into three phases: setup (33%), confrontation (34%), resolution (33%).
 *
 * @param {number} currentStep - The current step number in the story arc.
 * @param {number} arcLength - The total length of the story arc.
 * @returns {Object} Phase information containing phase, positionInPhase, totalInPhase,
 *                   percentInPhase, phaseStart, and phaseEnd.
 */
function getPhaseInfo(currentStep, arcLength) {
     // Validate inputs
      if (!arcLength || arcLength <= 0) {
          arcLength = 30; // fallback to default
          console.warn('[Story Mode] Invalid arcLength, using default 30');
      }
    // Calculate phase boundaries
    const setupEnd = Math.floor(arcLength * 0.33);
    const confrontationEnd = Math.floor(arcLength * 0.66);

    let phase, phaseStart, phaseEnd, positionInPhase;

    if (currentStep <= setupEnd) {
        phase = 'setup';
        phaseStart = 1;
        phaseEnd = setupEnd;
        positionInPhase = currentStep;
    } else if (currentStep <= confrontationEnd) {
        phase = 'confrontation';
        phaseStart = setupEnd + 1;
        phaseEnd = confrontationEnd;
        positionInPhase = currentStep - setupEnd;
    } else {
        phase = 'resolution';
        phaseStart = confrontationEnd + 1;
        phaseEnd = arcLength;
        positionInPhase = currentStep - confrontationEnd;
    }

    const totalInPhase = phaseEnd - phaseStart + 1;
    const percentInPhase = Math.round((positionInPhase / totalInPhase) * 100);

    return {
        phase,
        positionInPhase,
        totalInPhase,
        percentInPhase,
        phaseStart,
        phaseEnd
    };
}

/**
 * Build the story blueprint from a story type.
 * Returns the story prompt that guides the LLM on narrative structure.
 *
 * @param {Object} storyType - The story type object containing storyPrompt.
 * @returns {string} The story prompt text, or empty string if undefined.
 */
function buildStoryBlueprint(storyType) {
    // Now just return the storyPrompt directly
    return storyType.storyPrompt || '';
}

 /**
   * Build the phase injection text with template variable substitution.
   * Replaces placeholders in the progress template with actual values.
   * Appends phase-specific guidance for the current story phase.
   * 
   * @param {Object} storyType - The story type object containing progressTemplate and phasePrompts.
   * @param {Object} phaseInfo - Phase information from getPhaseInfo (phase, positionInPhase, totalInPhase, etc.).
   * @param {Object} chatState - Current chat story state containing arcLength.
   * @returns {string} The formatted phase injection text with debug notes if debugMode is enabled.
   */
function buildPhaseInjection(storyType, phaseInfo, chatState) {
    const settings = extension_settings[MODULE_NAME];
    const nextStep = chatState.currentStep + 1; // We're about to generate the next message

    // Substitute variables in progress template - use chatState.arcLength
    let progressText = storyType.progressTemplate
        .replace(/{currentStep}/g, nextStep)
        .replace(/{arcLength}/g, chatState.arcLength)
        .replace(/{arcPercent}/g, Math.round((nextStep / chatState.arcLength) * 100))
        .replace(/{phase}/g, phaseInfo.phase)
        .replace(/{positionInPhase}/g, phaseInfo.positionInPhase)
        .replace(/{totalInPhase}/g, phaseInfo.totalInPhase)
        .replace(/{phasePercent}/g, phaseInfo.percentInPhase)
        .replace(/{phaseStart}/g, phaseInfo.phaseStart)
        .replace(/{phaseEnd}/g, phaseInfo.phaseEnd);

    // Get phase guidance
    const phaseGuidance = storyType.phasePrompts?.[phaseInfo.phase] || '';

    let output = `${progressText}\n\n${phaseGuidance}`;

    // Add debug mode instruction (debugMode is global setting, not per-chat)
    if (settings.debugMode) {
        output += `\n\n[IMPORTANT: At the end of your response, include a debug note in this exact format: "(OOC: Step ${nextStep}/${chatState.arcLength}, Phase: ${phaseInfo.phase})"]`;
    }

    return output;
}

 /**
   * Build the full extension prompt injection string.
   * Combines story arc and author style content based on current settings.
   * 
   * @param {boolean} isPreview - If true, ignore arc length limits and build full prompt for preview.
   * @returns {string} The complete injection text, or empty string if disabled.
   */
function buildFullInjection(isPreview) {
    const settings = extension_settings[MODULE_NAME];
    const chatState = getChatStoryState();

    if (!settings.enabled) {
        return '';
    }

    let parts = [];

    // Story arc injection - use chat state for story type and arc length
    if (settings.storyArcEnabled && chatState.selectedStoryType) {
        const storyType = storyTypes.find(t => t.id === chatState.selectedStoryType);

        if (storyType && (chatState.currentStep < chatState.arcLength || isPreview)) {
            const nextStep = chatState.currentStep + 1;
            const phaseInfo = getPhaseInfo(nextStep, chatState.arcLength);

            // Build comprehensive story content
            let storyContent = buildStoryBlueprint(storyType);

            // Add phase guidance - pass chatState instead of settings for arcLength
            const phaseText = buildPhaseInjection(storyType, phaseInfo, chatState);
            storyContent += `\n\n${phaseText}`;
            parts.push(`<story>\n${storyContent}\n</story>`);
        }
    }

    // Author style injection - use chat state for author style
    if (settings.authorStyleEnabled && chatState.selectedAuthorStyle) {
        const authorStyle = authorStyles.find(s => s.id === chatState.selectedAuthorStyle);

        if (authorStyle) {
            let styleContent = authorStyle.authorPrompt;

            if (settings.nsfwEnabled && authorStyle.nsfwPrompt) {
                styleContent += `\n\n${authorStyle.nsfwPrompt}`;
            }

            parts.push(`<style>\n${styleContent}\n</style>`);
        }
    }

    return parts.join('\n\n');
}


/**
   * Update the extension prompt injection in SillyTavern.
   * Clears the prompt if extension is disabled or no content to inject.
   * 
   * @returns {void}
   */
function updateStoryPrompt() {
    const settings = extension_settings[MODULE_NAME];

    if (!settings.enabled) {
        setExtensionPrompt(MODULE_NAME, '', extension_prompt_types.NONE, 0);
        console.debug('[Story Mode] Prompt cleared (disabled)');
        return;
    }

    const promptText = buildFullInjection(false);

    if (!promptText) {
        setExtensionPrompt(MODULE_NAME, '', extension_prompt_types.NONE, 0);
        console.debug('[Story Mode] Prompt cleared (no content)');
        return;
    }

    // Inject the prompt
    setExtensionPrompt(
        MODULE_NAME,
        promptText,
        settings.position,
        settings.depth,
        false,
        settings.role
    );

    console.debug('[Story Mode] Prompt injected:', promptText);
}

 /**
   * Render the compact main panel HTML for the UI sidebar.
   * Returns HTML string containing the enable toggle and status display.
   * 
   * @returns {string} The HTML string for the main story mode panel.
   */
function renderMainPanel() {
    const settings = extension_settings[MODULE_NAME];
    const chatState = getChatStoryState();

    const statusText = settings.enabled
        ? `Enabled | Arc: ${chatState.currentStep}/${chatState.arcLength}`
        : 'Disabled';

    const html = `
        <div id="story_mode_panel" class="storymode-panel">
            <div class=inline-drawer>
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b data-i18n="Story Mode">Story Mode</b>
                    <div class="inline-drawer-icon fa-solid interactable down fa-circle-chevron-down" tabindex="0" role="button"></div>
                </div>
                <div id="story_mode_base_settings" class="inline-drawer-content" style="display: none;">
                    <div class="storymode-settings-panel">
                        <label class="checkbox_label">
                            <input type="checkbox" id="story_mode_enabled" ${settings.enabled ? 'checked' : ''} />
                            <span>Enable Story Mode</span>
                        </label>
                        <div id="story_mode_settings_btn">
                            <button id="open_story_mode_settings" class="menu_button">
                                <i class="fa-solid fa-gear"></i> Story Mode Settings
                            </button>
                        </div>
                    </div>
                     <div class="storymode-status">
                            ${statusText}
                    </div>
                </div>
            </div>
        </div>
    `;

    return html;
}

  /**
   * Show the full settings dialog popup.
   * Displays all story mode configuration options and a prompt preview.
   * 
   * @async
   * @returns {Promise<void>}
   */
async function showSettingsDialog() {
    const settings = extension_settings[MODULE_NAME];
    const chatState = getChatStoryState();

    const html = `
        <div class="storymode-settings-dialog">
            <div class="storymode-header-dialog">
                <h2>Story Mode</h2>
                <p class="storymode-tagline"></p>
            </div>
            <div class="storymode-section" id="story_mode_content">
                <!-- Story Arc Section -->
                <div class="storymode-subsection">
                    <label class="checkbox_label">
                        <input type="checkbox" id="story_arc_enabled" ${settings.storyArcEnabled ? 'checked' : ''} />
                        <span>Enable Story Arc</span>
                    </label>

                    <div id="story_arc_controls" style="${settings.storyArcEnabled ? '' : 'display:none;'}">
                        <div class="storymode-field">
                            <label>Story Type</label>
                            <div class="flex-container">
                                <select id="story_type_select" class="text_pole">
                                    <option value="">None</option>
                                </select>
                                <button id="edit_story_types_btn" class="menu_button" title="Edit Story Types">
                                    <i class="fa-solid fa-pencil"></i>
                                </button>
                            </div>
                        </div>

                        <div class="storymode-field">
                            <label>Arc Length: <span id="arc_length_value">${chatState.arcLength}</span></label>
                            <input type="range" id="arc_length_slider" min="5" max="300" value="${chatState.arcLength}" />
                        </div>

                        <div class="storymode-badge" id="arc_progress_badge">
                            Step ${chatState.currentStep}/${chatState.arcLength} | ${chatState.currentStep > 0 ? getPhaseInfo(chatState.currentStep, chatState.arcLength).phase : 'Not Started'}
                        </div>

                        <button id="reset_arc_btn" class="menu_button">
                            <i class="fa-solid fa-rotate-left"></i> Reset Arc
                        </button>
                    </div>
                </div>

                <!-- Author Style Section -->
                <div class="storymode-subsection">
                    <label class="checkbox_label">
                        <input type="checkbox" id="author_style_enabled" ${settings.authorStyleEnabled ? 'checked' : ''} />
                        <span>Enable Author Style</span>
                    </label>

                    <div id="author_style_controls" style="${settings.authorStyleEnabled ? '' : 'display:none;'}">
                        <div class="storymode-field">
                            <label>Author Style</label>
                            <div class="flex-container">
                                <input type="text" id="author_style_search" class="text_pole" placeholder="Search styles..." />
                                <button id="edit_author_styles_btn" class="menu_button" title="Edit Author Styles">
                                    <i class="fa-solid fa-pencil"></i>
                                </button>
                            </div>
                            <select id="author_style_select" class="text_pole" size="5">
                                <option value="">None</option>
                            </select>
                        </div>

                        <label class="checkbox_label">
                            <input type="checkbox" id="nsfw_enabled" ${settings.nsfwEnabled ? 'checked' : ''} />
                            <span>Include NSFW/Heat Guidance in prompts</span>
                        </label>
                    </div>
                </div>

                <!-- Post-Arc Options -->
                <div class="storymode-subsection">
                    <h4>Post-Arc Options</h4>
                    <label class="checkbox_label">
                        <input type="checkbox" id="epilogue_enabled" ${settings.epilogueEnabled ? 'checked' : ''} />
                        <span>Auto-Epilogue After Arc</span>
                    </label>
                    <label class="checkbox_label">
                        <input type="checkbox" id="summary_enabled" ${settings.summaryEnabled ? 'checked' : ''} />
                        <span>Offer Summary After Epilogue</span>
                    </label>
                    <div class="storymode-field" style="margin-left: 20px;">
                        <label>Messages to Summarize: <span id="summary_message_count_value">${settings.summaryMessageCount === 0 ? 'Entire Chat' : settings.summaryMessageCount}</span></label>
                        <input type="range" id="summary_message_count_slider" min="0" max="300" step="5" value="${settings.summaryMessageCount}" />
                        <small class="notes">0 = entire chat, or select the number of recent messages to include in summary (5-300)</small>
                    </div>
                    <label class="checkbox_label">
                        <input type="checkbox" id="debug_mode_enabled" ${settings.debugMode ? 'checked' : ''} />
                        <span>Debug Mode (Show Step/Phase in AI Responses)</span>
                    </label>
                    <small class="notes">When enabled, the AI will include step and phase information at the end of each response as an out-of-character (OOC) note.</small>
                </div>

                <!-- Injection Settings -->
                <div class="storymode-subsection">
                    <h4>Injection Settings</h4>
                    <div class="storymode-field">
                        <label>Position</label>
                        <select id="injection_position" class="text_pole">
                            <option value="${extension_prompt_types.IN_PROMPT}" ${settings.position === extension_prompt_types.IN_PROMPT ? 'selected' : ''}>In Prompt</option>
                            <option value="${extension_prompt_types.IN_CHAT}" ${settings.position === extension_prompt_types.IN_CHAT ? 'selected' : ''}>In Chat (at depth)</option>
                            <option value="${extension_prompt_types.BEFORE_PROMPT}" ${settings.position === extension_prompt_types.BEFORE_PROMPT ? 'selected' : ''}>Before Prompt</option>
                        </select>
                    </div>
                    <div class="storymode-field">
                        <label>Depth (for In Chat)</label>
                        <input type="number" id="injection_depth" class="text_pole" min="0" max="100" value="${settings.depth}" />
                    </div>
                    <div class="storymode-field">
                        <label>Role</label>
                        <select id="injection_role" class="text_pole">
                            <option value="${extension_prompt_roles.SYSTEM}" ${settings.role === extension_prompt_roles.SYSTEM ? 'selected' : ''}>System</option>
                            <option value="${extension_prompt_roles.USER}" ${settings.role === extension_prompt_roles.USER ? 'selected' : ''}>User</option>
                            <option value="${extension_prompt_roles.ASSISTANT}" ${settings.role === extension_prompt_roles.ASSISTANT ? 'selected' : ''}>Assistant</option>
                        </select>
                    </div>
                </div>

                <!-- Preview -->
                <div class="storymode-subsection">
                    <h4>Prompt Preview</h4>
                    <div id="prompt_preview" class="storymode-preview"></div>
                </div>
            </div>
        </div>
    `;

    const content = $(html);

    // Set up event listeners for the dialog
    setupDialogEventListeners(content);

    // Populate dropdowns
    updateStoryTypeDropdownInDialog(content);
    updateAuthorStyleDropdownInDialog(content);
    updatePreviewInDialog(content);

    // Show popup
    const popup = new Popup(content, POPUP_TYPE.TEXT, '', {
        okButton: 'Close',
        wide: true,
        large: true,
        allowVerticalScrolling: true,
    });

    await popup.show();
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
        if (confirm('Reset the story arc? This will set the step counter back to 0.')) {
            const chatState = getChatStoryState();
            chatState.currentStep = 0;
            chatState.arcStarted = false;
            chatState.epilogueShown = false;
            chatState.summaryShown = false;
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
            badge.text(`Step 0/${chatState.arcLength} | Not Started`);
        } else if (chatState.currentStep >= chatState.arcLength) {
            badge.text(`Arc Complete (${chatState.arcLength}/${chatState.arcLength})`);
        } else {
            const phaseInfo = getPhaseInfo(chatState.currentStep, chatState.arcLength);
            badge.text(`Step ${chatState.currentStep}/${chatState.arcLength} | ${phaseInfo.phase}`);
        }
    }
}

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
        badge.text(`Step 0/${chatState.arcLength} | Not Started`);
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

/**
 * Update arc progress badge
 */
function updateArcBadge() {
    const chatState = getChatStoryState();
    const badge = $('#arc_progress_badge');

    if (chatState.currentStep === 0) {
        badge.text(`Step 0/${chatState.arcLength} | Not Started`);
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

/**
 * Show the story types editor modal.
 * Displays add/import/export controls and a list of editable story types.
 *
 * @async
 * @returns {Promise<void>}
 */
async function showStoryTypesEditor() {
    const html = `
        <div class="storymode-editor">
            <div class="storymode-editor-controls">
                <button id="add_story_type_btn" class="menu_button">
                    <i class="fa-solid fa-plus"></i> Add Story Type
                </button>
                <button id="import_story_types_btn" class="menu_button">
                    <i class="fa-solid fa-file-import"></i> Import JSON
                </button>
                <button id="export_story_types_btn" class="menu_button">
                    <i class="fa-solid fa-file-export"></i> Export JSON
                </button>
                <input type="file" id="import_story_types_file" accept=".json" style="display:none;" />
            </div>
            <div class="storymode-field" style="margin: 15px 0;">
                <input type="text" id="story_types_search" class="text_pole" placeholder="Search story types..." />
            </div>
            <div id="story_types_list" class="storymode-editor-list"></div>
        </div>
    `;

    // Create content wrapper and attach event listeners BEFORE creating popup
    const content = $(html);

    // Attach event listeners to elements within the content
    content.find('#add_story_type_btn').on('click', () => {
        addStoryType().then(() => {
            refreshStoryTypesListInPopup(content);
        });
    });

    content.find('#import_story_types_btn').on('click', () => {
        content.find('#import_story_types_file').click();
    });

    content.find('#import_story_types_file').on('change', (e) => {
        importStoryTypes(e.target).then(() => {
            refreshStoryTypesListInPopup(content);
        });
    });

    content.find('#export_story_types_btn').on('click', () => {
        exportStoryTypes();
    });

    // Search functionality
    content.find('#story_types_search').on('input', function() {
        const query = $(this).val().toLowerCase();
        refreshStoryTypesListInPopup(content, query);
    });

    // Populate the initial list
    refreshStoryTypesListInPopup(content);

    // Create and show popup
    const popup = new Popup(content, POPUP_TYPE.TEXT, '', {
        okButton: 'Close',
        wide: true,
        large: true,
        allowVerticalScrolling: true,
    });

    await popup.show();
}

/**
 * Generic function to refresh a story types list container.
 * Includes search filtering and HTML escaping for security.
 *
 * @param {jQuery} container - The jQuery container element to populate.
 * @param {string} [searchQuery=''] - Optional search query to filter results.
 * @returns {void}
 */
function refreshStoryTypesListGeneric(container, searchQuery = '') {
    if (container.length === 0) return;
    container.empty();

    if (storyTypes.length === 0) {
        container.append('<p class="notes">No story types defined. Click "Add Story Type" to create one.</p>');
        return;
    }

    // Sort alphabetically and filter by search (if provided)
    let filteredTypes = [...storyTypes].sort((a, b) => a.name.localeCompare(b.name));

    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filteredTypes = filteredTypes.filter(type =>
            type.name.toLowerCase().includes(q) ||
            type.category.some(cat => cat.toLowerCase().includes(q)) ||
            (type.storyPrompt && type.storyPrompt.toLowerCase().includes(q))
        );
    }

    if (filteredTypes.length === 0) {
        container.append('<p class="notes">No story types match your search.</p>');
        return;
    }

    filteredTypes.forEach(type => {
        const item = $(`
            <div class="storymode-editor-item">
                <div class="storymode-editor-item-header">
                    <strong>${escapeHtml(type.name)}</strong>
                    <span class="storymode-editor-category">${escapeHtml(type.category.join(', '))}</span>
                </div>
                <div class="storymode-editor-item-content">
                    <p>${escapeHtml(type.storyPrompt || '')}</p>
                </div>
                <div class="storymode-editor-item-actions">
                    <button class="menu_button menu_button_icon" data-id="${type.id}" data-action="edit" title="Edit">
                        <i class="fa-solid fa-pencil"></i>
                    </button>
                    <button class="menu_button menu_button_icon" data-id="${type.id}" data-action="delete" title="Delete">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
        `);

        item.find('[data-action="edit"]').on('click', () => editStoryType(type.id));
        item.find('[data-action="delete"]').on('click', () => deleteStoryType(type.id));

        container.append(item);
    });
}

/**
 * Refresh the story types list in the popup editor.
 * Wraps the generic list function with a content-scoped selector.
 *
 * @param {jQuery} content - The jQuery content object containing the popup.
 * @param {string} [searchQuery=''] - Optional search query to filter results.
 * @returns {void}
 */
function refreshStoryTypesListInPopup(content, searchQuery = '') {
    const container = content.find('#story_types_list');
    refreshStoryTypesListGeneric(container, searchQuery);
}

/**
 * Refresh the story types list in the main editor (global selector).
 * Wraps the generic list function with a global jQuery selector.
 *
 * @returns {void}
 */
function refreshStoryTypesList() {
    const container = $('#story_types_list');
    refreshStoryTypesListGeneric(container);
}


/**
 * Add a new custom story type.
 * Creates a default template and opens the edit form for user customization.
 *
 * @async
 * @returns {Promise<void>}
 */
async function addStoryType() {
    const newType = {
        id: 'custom_' + Date.now(),
        name: 'New Story Type',
        category: ['Custom'],
        storyPrompt: '',
        progressTemplate: 'Arc Progress: Step {currentStep}/{arcLength} ({arcPercent}% complete). Phase: {phase} - Message {positionInPhase}/{totalInPhase} ({phasePercent}% through {phase}).',
        phasePrompts: {
            setup: '',
            confrontation: '',
            resolution: ''
        }
    };

    const result = await showStoryTypeEditForm(newType, true);
    if (result) {
        const { storyType } = result;
        storyTypes.push(storyType);
        await saveStoryTypesToStorage();
        refreshStoryTypesList();
        updateStoryTypeDropdown();
        toastr.success('Story type added');
    }
}

/**
 * Edit an existing story type by ID.
 * Opens the edit form pre-populated with the current type's data.
 *
 * @async
 * @param {string} id - The unique identifier of the story type to edit.
 * @returns {Promise<void>}
 */
async function editStoryType(id) {
    const type = storyTypes.find(t => t.id === id);
    if (!type) return;

    const result = await showStoryTypeEditForm(type, false);
    if (result) {
        const { storyType } = result;
        const index = storyTypes.findIndex(t => t.id === id);
        storyTypes[index] = storyType;
        await saveStoryTypesToStorage();
        refreshStoryTypesList();
        updateStoryTypeDropdown();
        toastr.success('Story type updated');
    }
}

/**
 * Delete a story type by ID.
 * Also clears the selection if the deleted type was currently selected.
 *
 * @async
 * @param {string} id - The unique identifier of the story type to delete.
 * @returns {Promise<void>}
 */
async function deleteStoryType(id) {
    if (!confirm('Delete this story type?')) return;

    storyTypes = storyTypes.filter(t => t.id !== id);
    await saveStoryTypesToStorage();
    refreshStoryTypesList();
    updateStoryTypeDropdown();

    // Clear selection if deleted type was selected
    const chatState = getChatStoryState();
    if (chatState.selectedStoryType === id) {
        chatState.selectedStoryType = '';
        await saveChatStoryState(chatState);
        updateStoryPrompt();
    }

    toastr.success('Story type deleted');
}

/**
 * Escape HTML entities for textarea
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Storage for original (unmodified) versions for revert functionality
let originalStoryTypes = [];

/**
 * Load original (unmodified) story types for revert functionality.
 * Retrieves from localForage or creates a backup from current loaded types.
 *
 * @async
 * @returns {Promise<void>}
 */
async function loadOriginalStoryTypes() {
    try {
        // Try to load from localForage first
        const stored = await localforage.getItem('story_mode_original_story_types');

        if (stored && Array.isArray(stored) && stored.length > 0) {
            originalStoryTypes = stored;
            console.log('[Story Mode] Loaded', originalStoryTypes.length, 'original story types from storage');
        } else if (storyTypes.length > 0) {
            // First load - save current story types as originals (deep copy)
            originalStoryTypes = JSON.parse(JSON.stringify(storyTypes));
            await localforage.setItem('story_mode_original_story_types', originalStoryTypes);
            console.log('[Story Mode] Saved', originalStoryTypes.length, 'original story types for revert functionality');
        }
    } catch (error) {
        console.error('[Story Mode] Error loading original story types:', error);
    }
}

/**
 * Get an original (unmodified) story type by ID.
 * Used to revert user customizations to the default version.
 *
 * @param {string} id - The unique identifier of the story type.
 * @returns {Object|undefined} The original story type object, or undefined if not found.
 */
function getOriginalStoryType(id) {
    return originalStoryTypes.find(t => t.id === id);
}

// Storage for original (unmodified) author styles for revert functionality
let originalAuthorStyles = [];

/**
 * Load original (unmodified) author styles for revert functionality.
 * Retrieves from localForage or creates a backup from current loaded styles.
 *
 * @async
 * @returns {Promise<void>}
 */
async function loadOriginalAuthorStyles() {
    try {
        // Try to load from localForage first
        const stored = await localforage.getItem('story_mode_original_author_styles');

        if (stored && Array.isArray(stored) && stored.length > 0) {
            originalAuthorStyles = stored;
            console.log('[Story Mode] Loaded', originalAuthorStyles.length, 'original author styles from storage');
        } else if (authorStyles.length > 0) {
            // First load - save current author styles as originals (deep copy)
            originalAuthorStyles = JSON.parse(JSON.stringify(authorStyles));
            await localforage.setItem('story_mode_original_author_styles', originalAuthorStyles);
            console.log('[Story Mode] Saved', originalAuthorStyles.length, 'original author styles for revert functionality');
        }
    } catch (error) {
        console.error('[Story Mode] Error loading original author styles:', error);
    }
}

/**
 * Get an original (unmodified) author style by ID.
 * Used to revert user customizations to the default version.
 *
 * @param {string} id - The unique identifier of the author style.
 * @returns {Object|undefined} The original author style object, or undefined if not found.
 */
function getOriginalAuthorStyle(id) {
    return originalAuthorStyles.find(s => s.id === id);
}

/**
 * Show the story type edit form modal.
 * Displays form fields for editing or creating a story type.
 * Includes revert button if editing a non-original type.
 *
 * @async
 * @param {Object} type - The story type object to edit or use as template.
 * @param {boolean} isNew - True if creating a new type, false if editing existing.
 * @returns {Promise<Object|null>} Object with storyType property if saved, null if cancelled.
 */
async function showStoryTypeEditForm(type, isNew) {
    const hasOriginal = !isNew && getOriginalStoryType(type.id);
    const revertButtonHtml = hasOriginal ? `<button id="revert_to_default_btn" class="menu_button" style="margin-top: 10px;">
                    <i class="fa-solid fa-rotate-left"></i> Revert to Original
                </button>` : '';

    const html = `
        <div class="storymode-edit-form">
            <h4>Basic Information</h4>
            <div class="storymode-field">
                <label>Name</label>
                <input type="text" id="edit_type_name" class="text_pole" value="${escapeHtml(type.name || '')}" />
            </div>
            <div class="storymode-field">
                <label>Category (comma-separated)</label>
                <input type="text" id="edit_type_category" class="text_pole" value="${escapeHtml(type.category ? type.category.join(', ') : '')}" />
            </div>

            <h4>Story Blueprint</h4>
            <div class="storymode-field">
                <label>Story Prompt</label>
                <textarea id="edit_type_story_prompt" class="text_pole" rows="15">${escapeHtml(type.storyPrompt || '')}</textarea>
                <small class="notes">The complete story blueprint and guidance for the LLM. Edit freely to customize the storytelling approach.</small>
                ${revertButtonHtml}
            </div>

            <h4>Arc Progress & Phases</h4>
            <div class="storymode-field">
                <label>Progress Template</label>
                <textarea id="edit_type_template" class="text_pole" rows="2">${escapeHtml(type.progressTemplate || '')}</textarea>
                <small class="notes">Variables: {currentStep}, {arcLength}, {arcPercent}, {phase}, {positionInPhase}, {totalInPhase}, {phasePercent}</small>
            </div>
            <div class="storymode-field">
                <label>Setup Phase Prompt (First ~33%)</label>
                <textarea id="edit_type_setup" class="text_pole" rows="2">${escapeHtml(type.phasePrompts ? type.phasePrompts.setup || '' : '')}</textarea>
            </div>
            <div class="storymode-field">
                <label>Confrontation Phase Prompt (Middle ~33%)</label>
                <textarea id="edit_type_confrontation" class="text_pole" rows="2">${escapeHtml(type.phasePrompts ? type.phasePrompts.confrontation || '' : '')}</textarea>
            </div>
            <div class="storymode-field">
                <label>Resolution Phase Prompt (Final ~33%)</label>
                <textarea id="edit_type_resolution" class="text_pole" rows="2">${escapeHtml(type.phasePrompts ? type.phasePrompts.resolution || '' : '')}</textarea>
            </div>

            ${isNew ? `<h4>Template Options</h4>
            <label class="checkbox_label">
                <input type="checkbox" id="mark_as_template" />
                <span>Mark as Template</span>
            </label>
            <small class="notes">If checked, this story type will be marked as a reusable template.</small>` : ''}
        </div>
    `;

    const content = $(html);

    // Set up revert to original button if it exists
    content.find('#revert_to_default_btn').on('click', function() {
        const originalType = getOriginalStoryType(type.id);
        if (originalType) {
            if (confirm(`Revert "${type.name}" to its original story prompt? Your current changes will be lost.`)) {
                // Update the textarea with original content
                content.find('#edit_type_story_prompt').val(originalType.storyPrompt || '');
                toastr.info('Story prompt reverted to original. Click Save to apply changes.');
            }
        }
    });

    const popup = new Popup(content, POPUP_TYPE.TEXT, '', {
        okButton: isNew ? 'Add' : 'Save',
        cancelButton: 'Cancel',
        wide: true,
        large: true,
        allowVerticalScrolling: true,
    });

    const result = await popup.show();

    if (result) {
        const name = content.find('#edit_type_name').val().trim();
        const categoryText = content.find('#edit_type_category').val().trim();
        const storyPrompt = content.find('#edit_type_story_prompt').val().trim();
        const template = content.find('#edit_type_template').val().trim();
        const setup = content.find('#edit_type_setup').val().trim();
        const confrontation = content.find('#edit_type_confrontation').val().trim();
        const resolution = content.find('#edit_type_resolution').val().trim();
        const markAsTemplate = isNew ? content.find('#mark_as_template').is(':checked') : type.isTemplate || false;

        if (!name) {
            toastr.error('Name is required');
            return null;
        }

        const categories = categoryText.split(',').map(c => c.trim()).filter(c => c);

        const editedType = {
            ...type,
            name,
            category: categories,
            storyPrompt,
            progressTemplate: template,
            phasePrompts: {
                setup,
                confrontation,
                resolution
            },
            isTemplate: markAsTemplate
        };

        return {
            storyType: editedType
        };
    }

    return null;
}

/**
 * Import story types from a JSON file.
 * Merges with existing types, replacing duplicates by ID.
 *
 * @async
 * @param {HTMLInputElement} fileInput - The file input element containing the JSON file.
 * @returns {Promise<void>}
 */
async function importStoryTypes(fileInput) {
    const file = fileInput.files[0];
    if (!file) return;

    try {
        const text = await getFileText(file);
        const imported = JSON.parse(text);

        if (!Array.isArray(imported)) {
            throw new Error('Invalid format: expected an array of story types');
        }

        // Validate and merge
        imported.forEach(type => {
            if (!type.id || !type.name) {
                throw new Error('Invalid story type: missing id or name');
            }

            // Check for duplicates
            const existing = storyTypes.findIndex(t => t.id === type.id);
            if (existing >= 0) {
                storyTypes[existing] = type;
            } else {
                storyTypes.push(type);
            }
        });

        await saveStoryTypesToStorage();
        refreshStoryTypesList();
        updateStoryTypeDropdown();

        toastr.success(`Imported ${imported.length} story types`);

        // Clear file input
        $(fileInput).val('');
    } catch (error) {
        console.error('[Story Mode] Import failed:', error);
        toastr.error(`Import failed: ${error.message}`);
    }
}

/**
 * Export story types to a JSON file.
 * Includes timestamp in the generated filename.
 *
 * @returns {void}
 */
function exportStoryTypes() {
    const json = JSON.stringify(storyTypes, null, 2);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    download(json, `story-types-${timestamp}.json`, 'application/json');
    toastr.success('Story types exported');
}

/**
 * Show the author styles editor modal.
 * Displays add/import/export controls and a list of editable author styles.
 *
 * @async
 * @returns {Promise<void>}
 */
async function showAuthorStylesEditor() {
    const html = `
        <div class="storymode-editor">
            <div class="storymode-editor-controls">
                <button id="add_author_style_btn" class="menu_button">
                    <i class="fa-solid fa-plus"></i> Add Author Style
                </button>
                <button id="import_author_styles_btn" class="menu_button">
                    <i class="fa-solid fa-file-import"></i> Import JSON
                </button>
                <button id="export_author_styles_btn" class="menu_button">
                    <i class="fa-solid fa-file-export"></i> Export JSON
                </button>
                <input type="file" id="import_author_styles_file" accept=".json" style="display:none;" />
            </div>
            <div class="storymode-field" style="margin-bottom: 10px;">
                <input type="text" id="author_styles_search" class="text_pole" placeholder="Search author styles..." />
            </div>
            <div id="author_styles_list" class="storymode-editor-list"></div>
        </div>
    `;

    // Create content wrapper and attach event listeners BEFORE creating popup
    const content = $(html);

    // Attach event listeners to elements within the content
    content.find('#add_author_style_btn').on('click', () => {
        addAuthorStyle().then(() => {
            refreshAuthorStylesListInPopup(content);
        });
    });

    content.find('#import_author_styles_btn').on('click', () => {
        content.find('#import_author_styles_file').click();
    });

    content.find('#import_author_styles_file').on('change', (e) => {
        importAuthorStyles(e.target).then(() => {
            refreshAuthorStylesListInPopup(content);
        });
    });

    content.find('#export_author_styles_btn').on('click', () => {
        exportAuthorStyles();
    });

    // Search functionality
    content.find('#author_styles_search').on('input', (e) => {
        const query = $(e.target).val().trim();
        refreshAuthorStylesListInPopup(content, query);
    });

    // Populate the initial list
    refreshAuthorStylesListInPopup(content);

    // Create and show popup
    const popup = new Popup(content, POPUP_TYPE.TEXT, '', {
        okButton: 'Close',
        wide: true,
        large: true,
        allowVerticalScrolling: true,
    });

    await popup.show();
}

/**
 * Generic function to refresh an author styles list container.
 * Includes fuzzy search and NSFW badge display.
 *
 * @param {jQuery} container - The jQuery container element to populate.
 * @param {string} [searchQuery=''] - Optional search query for filtering.
 * @returns {void}
 */
function refreshAuthorStylesListGeneric(container, searchQuery = '') {
    if (container.length === 0) return;
    container.empty();

    if (authorStyles.length === 0) {
        container.append('<p class="notes">No author styles defined. Click "Add Author Style" to create one.</p>');
        return;
    }

    // Filter and sort styles
    let filteredStyles = authorStyles;

    if (searchQuery && fuseAuthorStyles) {
        const results = fuseAuthorStyles.search(searchQuery);
        filteredStyles = results.map(r => r.item);
    } else {
        filteredStyles = [...authorStyles].sort((a, b) => a.name.localeCompare(b.name));
    }

    if (filteredStyles.length === 0) {
        container.append('<p class="notes">No author styles found matching your search.</p>');
        return;
    }

    filteredStyles.forEach(style => {
        const hasNSFW = style.nsfwPrompt && style.nsfwPrompt.length > 0;
        const nsfwBadge = hasNSFW
            ? '<span class="storymode-nsfw-badge" title="Has NSFW Guidance"></span>'
            : '';

        const item = $(`
            <div class="storymode-editor-item">
                <div class="storymode-editor-item-header">
                    <strong>${escapeHtml(style.name)}</strong>
                    <span class="storymode-editor-category">${escapeHtml(style.category.join(', '))}</span>
                    ${nsfwBadge}
                </div>
                <div class="storymode-editor-item-content">
                    <p>${escapeHtml(style.authorPrompt)}</p>
                    ${hasNSFW ? `<p class="storymode-nsfw-text"><strong>NSFW:</strong> ${escapeHtml(style.nsfwPrompt)}</p>` : ''}
                </div>
                <div class="storymode-editor-item-actions">
                    <button class="menu_button menu_button_icon" data-id="${style.id}" data-action="edit" title="Edit">
                        <i class="fa-solid fa-pencil"></i>
                    </button>
                    <button class="menu_button menu_button_icon" data-id="${style.id}" data-action="delete" title="Delete">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
        `);

        item.find('[data-action="edit"]').on('click', () => editAuthorStyle(style.id));
        item.find('[data-action="delete"]').on('click', () => deleteAuthorStyle(style.id));

        container.append(item);
    });
}

/**
 * Refresh the author styles list in the popup editor.
 * Wraps the generic list function with a content-scoped selector.
 *
 * @param {jQuery} content - The jQuery content object containing the popup.
 * @param {string} [searchQuery=''] - Optional search query to filter results.
 * @returns {void}
 */
function refreshAuthorStylesListInPopup(content, searchQuery = '') {
    const container = content.find('#author_styles_list');
    refreshAuthorStylesListGeneric(container, searchQuery);
}

/**
 * Refresh the author styles list in the main editor (global selector).
 * Wraps the generic list function with a global jQuery selector.
 *
 * @returns {void}
 */
function refreshAuthorStylesList() {
    const container = $('#author_styles_list');
    refreshAuthorStylesListGeneric(container);
}


/**
 * Add new author style
 */
async function addAuthorStyle() {
    const newStyle = {
        id: 'custom_' + Date.now(),
        name: 'New Author Style',
        category: ['Custom'],
        authorPrompt: '',
        nsfwPrompt: '',
        keywords: []
    };

    const edited = await showAuthorStyleEditForm(newStyle, true);
    if (edited) {
        authorStyles.push(edited);
        await saveAuthorStylesToStorage();
        refreshAuthorStylesList();
        updateAuthorStyleDropdown();
        toastr.success('Author style added');
    }
}

/**
 * Edit author style
 */
async function editAuthorStyle(id) {
    const style = authorStyles.find(s => s.id === id);
    if (!style) return;

    const edited = await showAuthorStyleEditForm(style, false);
    if (edited) {
        const index = authorStyles.findIndex(s => s.id === id);
        authorStyles[index] = edited;
        await saveAuthorStylesToStorage();
        refreshAuthorStylesList();
        updateAuthorStyleDropdown();
        toastr.success('Author style updated');
    }
}

/**
 * Delete author style
 */
async function deleteAuthorStyle(id) {
    if (!confirm('Delete this author style?')) return;

    authorStyles = authorStyles.filter(s => s.id !== id);
    await saveAuthorStylesToStorage();
    refreshAuthorStylesList();
    updateAuthorStyleDropdown();

    // Clear selection if deleted style was selected
    const chatState = getChatStoryState();
    if (chatState.selectedAuthorStyle === id) {
        chatState.selectedAuthorStyle = '';
        await saveChatStoryState(chatState);
        updateStoryPrompt();
    }

    toastr.success('Author style deleted');
}

/**
 * Show author style edit form
 */
async function showAuthorStyleEditForm(style, isNew) {
    const settings = extension_settings[MODULE_NAME];
    const hasOriginal = !isNew && getOriginalAuthorStyle(style.id);
    const revertButtonHtml = hasOriginal ? `<button id="revert_author_to_original_btn" class="menu_button" style="margin-top: 10px;">
                    <i class="fa-solid fa-rotate-left"></i> Revert to Original
                </button>` : '';

    // Only show NSFW field if NSFW is enabled in settings
    const nsfwFieldHtml = settings.nsfwEnabled ? `
            <div class="storymode-field">
                <label>NSFW/Heat Guidance (Optional)</label>
                <textarea id="edit_style_nsfw" class="text_pole" rows="2">${escapeHtml(style.nsfwPrompt || '')}</textarea>
                <small class="notes">How this author handles mature/adult content. Leave empty if not applicable.</small>
            </div>` : '';

    const html = `
        <div class="storymode-edit-form">
            <div class="storymode-field">
                <label>Name</label>
                <input type="text" id="edit_style_name" class="text_pole" value="${escapeHtml(style.name)}" />
            </div>
            <div class="storymode-field">
                <label>Category (comma-separated)</label>
                <input type="text" id="edit_style_category" class="text_pole" value="${escapeHtml(style.category.join(', '))}" />
            </div>
            <div class="storymode-field">
                <label>Author Style Description</label>
                <textarea id="edit_style_description" class="text_pole" rows="3">${escapeHtml(style.authorPrompt)}</textarea>
                <small class="notes">Describe the author's writing style, voice, and characteristics.</small>
                ${revertButtonHtml}
            </div>
            ${nsfwFieldHtml}
            <div class="storymode-field">
                <label>Keywords (comma-separated)</label>
                <input type="text" id="edit_style_keywords" class="text_pole" value="${escapeHtml(style.keywords.join(', '))}" />
                <small class="notes">Searchable keywords associated with this style.</small>
            </div>

            ${isNew ? `<h4>Template Options</h4>
            <label class="checkbox_label">
                <input type="checkbox" id="mark_style_as_template" />
                <span>Mark as Template</span>
            </label>
            <small class="notes">If checked, this author style will be marked as a reusable template.</small>` : ''}
        </div>
    `;

    const content = $(html);

    // Set up revert to original button if it exists
    content.find('#revert_author_to_original_btn').on('click', function() {
        const originalStyle = getOriginalAuthorStyle(style.id);
        if (originalStyle) {
            if (confirm(`Revert "${style.name}" to its original content? Your current changes will be lost.`)) {
                // Update the textareas with original content
                content.find('#edit_style_description').val(originalStyle.authorPrompt || '');
                content.find('#edit_style_nsfw').val(originalStyle.nsfwPrompt || '');
                toastr.info('Author style reverted to original. Click Save to apply changes.');
            }
        }
    });

    const popup = new Popup(content, POPUP_TYPE.TEXT, '', {
        okButton: isNew ? 'Add' : 'Save',
        cancelButton: 'Cancel',
        wide: true,
        large: false,
        allowVerticalScrolling: true,
    });

    const result = await popup.show();

    if (result) {
        const settings = extension_settings[MODULE_NAME];
        const name = content.find('#edit_style_name').val().trim();
        const categoryText = content.find('#edit_style_category').val().trim();
        const description = content.find('#edit_style_description').val().trim();
        // Only get NSFW value if the field exists (when nsfwEnabled is true)
        const nsfw = settings.nsfwEnabled ? content.find('#edit_style_nsfw').val().trim() : (style.nsfwPrompt || '');
        const keywordsText = content.find('#edit_style_keywords').val().trim();
        const markAsTemplate = isNew ? content.find('#mark_style_as_template').is(':checked') : style.isTemplate || false;

        if (!name || !description) {
            toastr.error('Name and description are required');
            return null;
        }

        const categories = categoryText.split(',').map(c => c.trim()).filter(c => c);
        const keywords = keywordsText.split(',').map(k => k.trim()).filter(k => k);

        return {
            ...style,
            name,
            category: categories,
            authorPrompt: description,
            nsfwPrompt: nsfw,
            keywords,
            isTemplate: markAsTemplate
        };
    }

    return null;
}

/**
 * Import author styles from JSON
 */
async function importAuthorStyles(fileInput) {
    const file = fileInput.files[0];
    if (!file) return;

    try {
        const text = await getFileText(file);
        const imported = JSON.parse(text);

        if (!Array.isArray(imported)) {
            throw new Error('Invalid format: expected an array of author styles');
        }

        // Validate and merge
        imported.forEach(style => {
            if (!style.id || !style.name) {
                throw new Error('Invalid author style: missing id or name');
            }

            // Check for duplicates
            const existing = authorStyles.findIndex(s => s.id === style.id);
            if (existing >= 0) {
                authorStyles[existing] = style;
            } else {
                authorStyles.push(style);
            }
        });

        await saveAuthorStylesToStorage();
        refreshAuthorStylesList();
        updateAuthorStyleDropdown();

        toastr.success(`Imported ${imported.length} author styles`);

        // Clear file input
        $(fileInput).val('');
    } catch (error) {
        console.error('[Story Mode] Import failed:', error);
        toastr.error(`Import failed: ${error.message}`);
    }
}

/**
 * Export author styles to JSON
 */
function exportAuthorStyles() {
    const json = JSON.stringify(authorStyles, null, 2);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    download(json, `author-styles-${timestamp}.json`, 'application/json');
    toastr.success('Author styles exported');
}

/**
 * Save story types to localForage
 */
async function saveStoryTypesToStorage() {
    try {
        await localforage.setItem('story_mode_story_types', storyTypes);
        console.log('[Story Mode] Story types saved to storage');

        // Reinitialize Fuse.js
        if (typeof Fuse !== 'undefined') {
            fuseStoryTypes = new Fuse(storyTypes, {
                keys: ['name', 'category', 'storyPrompt'],
                threshold: 0.3,
            });
        }
    } catch (error) {
        console.error('[Story Mode] Failed to save story types:', error);
        toastr.error('Failed to save story types');
    }
}

/**
 * Save author styles to localForage
 */
async function saveAuthorStylesToStorage() {
    try {
        await localforage.setItem('story_mode_author_styles', authorStyles);
        console.log('[Story Mode] Author styles saved to storage');

        // Reinitialize Fuse.js
        if (typeof Fuse !== 'undefined') {
            fuseAuthorStyles = new Fuse(authorStyles, {
                keys: ['name', 'category', 'authorPrompt', 'keywords'],
                threshold: 0.3,
            });
        }
    } catch (error) {
        console.error('[Story Mode] Failed to save author styles:', error);
        toastr.error('Failed to save author styles');
    }
}

/**
 * Load Fuse.js library for fuzzy search
 */
async function loadFuseJS() {
    if (typeof Fuse !== 'undefined') {
        console.log('[Story Mode] Fuse.js already loaded');
        return;
    }

    try {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/fuse.js@6.6.2/dist/fuse.min.js';
        script.async = true;

        await new Promise((resolve, reject) => {
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });

        console.log('[Story Mode] Fuse.js loaded');
    } catch (error) {
        console.error('[Story Mode] Failed to load Fuse.js:', error);
    }
}

/**
 * Hook: Before generation starts, determine if its a increment in the story or a regenerated story
 */
eventSource.on(event_types.GENERATION_STARTED, () => {
    // Clear the loading flag when generation starts
    isLoadingChat = false;

    if (chat.length > 0) {
        isRegenerating = false; // fresh generation
        console.debug('[Story Mode] Generation started (normal)');
        updateStoryPrompt();
    }
    else {
        isRegenerating = true; // This is the inital message and chat set up, don't increment the story count
        console.debug('[Story Mode] inital message set up - no increment');
    }
});

eventSource.on(event_types.MESSAGE_SWIPED, (data) => {
    isRegenerating = true;
    console.debug('[Story Mode] Swipe/regenerate detected:', data);
    updateStoryPrompt();
});

if (event_types.MESSAGE_REGENERATED) {
    eventSource.on(event_types.MESSAGE_REGENERATED, (data) => {
        isRegenerating = true;
        console.debug('[Story Mode] Regenerate detected:', data);
        updateStoryPrompt();
    });
}

/**
 * Hook: After message is received
 */
async function onMessageReceived(data) {
    const settings = extension_settings[MODULE_NAME];

    if (data && data.is_user) {
        console.debug('[Story Mode] Skipping increment (user message detected)');
        return;
    }

    if (isLoadingChat) {
        console.debug('[Story Mode] Skipping increment (chat is loading)');
        return;
    }

    if (isRegenerating) {
        console.debug('[Story Mode] Skipping increment (regeneration detected)');
        isRegenerating = false;
        return;
    }

    if (!settings.enabled || !settings.storyArcEnabled) {
        console.debug('[Story Mode] Skipping increment (story mode not enabled)');
        return;
    }

    const chatState = getChatStoryState();

    if (chatState.currentStep < chatState.arcLength) {
        const oldStep = chatState.currentStep;
        chatState.currentStep++;
        await saveChatStoryState(chatState);
        console.log(
            `[Story Mode] Step incremented: ${oldStep} → ${chatState.currentStep} (Arc: ${chatState.currentStep}/${chatState.arcLength})`
        );
        updateStoryPrompt();
        updateStatusDisplay();
    } else if (chatState.currentStep === chatState.arcLength) {
        console.log('[Story Mode] Arc completed. Epilogue enabled:', settings.epilogueEnabled );
        // Generate and push epilogue if enabled
        if (settings.epilogueEnabled && !chatState.epilogueShown) {
            toastr.success('[Story Mode] Arc completed - generating epilogue. Please wait while the epilogue generates.');
            const epilogue = await generateEpilogueForStory();
            if (epilogue) {
                await pushStoryMessage(epilogue); // LLM generates the heading
                chatState.epilogueShown = true;
                await saveChatStoryState(chatState);
                console.log('[Story Mode] Epilogue generated and pushed');

                // Wait a moment for UI to settle before generating summary
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        // Generate and push summary if enabled and epilogue is done
        if (settings.summaryEnabled && !chatState.summaryShown) {
            toastr.success('[Story Mode] I will now generate a summary. Please wait while it is generating.');
            const summary = await summarizeChatMainForStory();
            if (summary) {
                await pushStoryMessage(summary); // LLM generates the heading
                chatState.summaryShown = true;
                await saveChatStoryState(chatState);
                console.log('[Story Mode] Summary generated and pushed');

                // Wait a moment for UI to settle before showing end notice
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        // Show end notice if both are done OR the applicable ones are done
      const conditionsMet = 
                        // A) neither epilogue nor summary are enabled
                        (!settings.epilogueEnabled && !settings.summaryEnabled)
                        // B) epilogue enabled and shown, but not waiting on summary
                        || (settings.epilogueEnabled && chatState.epilogueShown &&
                            (!settings.summaryEnabled || chatState.summaryShown))
                        // C) summary enabled and shown, but not waiting on epilogue
                        || (settings.summaryEnabled && chatState.summaryShown &&
                            (!settings.epilogueEnabled || chatState.epilogueShown));

      if (conditionsMet) {
          const NOTICE_TEXT = '**<center>You have reached the end of this story arc. ' +
              'Feel free to continue, or if you would like to start a new arc, ' +
              'click Reset Arc in the Story Mode settings.</center>**';
          await pushStoryMessage(NOTICE_TEXT);
      }
    }
}

// Push a story message (epilogue or summary) into the chat
async function pushStoryMessage(messageText) {
    console.log('[Story Mode] Message to push:', messageText);

    const message = {
        is_user: false,
        mes: messageText, // LLM has already generated the heading
        is_system: false,
        name: 'Story Mode',
        force_avatar: 'img/quill.png', // Use server-relative path (quill icon for story/narrative)
        send_date: Date.now(),
    };

    // Push message to chat array first
    chat.push(message);

    // Render the message in the UI without swipe arrows
    addOneMessage(message, { scroll: true, showSwipes: false });

    console.log('[Story Mode] Message pushed and rendered');
}

// Generate epilogue for the completed story arc
async function generateEpilogueForStory() {
    const ctx = SillyTavern.getContext();
    const { chat } = ctx;

    // Get the recent chat context for the epilogue
    const recentMessages = chat
        .filter(m => !m.is_system && m.mes)
        .slice(-20) // Last 20 messages for full arc context
        .map(m => m.mes)
        .join('\n\n');

    if (!recentMessages.trim()) {
        console.warn('[Story Mode] No messages to create epilogue from');
        return '';
    }

    const systemPrompt = `You are wrapping up a completed story arc. The story has reached its conclusion at the planned arc length. Write an epilogue that:
- Wraps up loose threads
- Brings the narrative to a satisfying close
- Provides closure for character arcs
- Sets the tone for what comes after

IMPORTANT: Start your response with the heading "**Epilogue**" on its own line, followed by a blank line, then write the epilogue content.`;

    const userPrompt = `Based on the recent story context below, write an epilogue that wraps up this story arc:\n\n${recentMessages}`;

    try {
        const epilogue = await generateRaw({
            prompt: userPrompt,
            systemPrompt: systemPrompt,
        });
        return epilogue?.trim() || '';
    } catch (error) {
        console.error('[Story Mode] Failed to generate epilogue:', error);
        return '';
    }
}

//summarize the story
const STORY_SUMMARY_PROMPT = `
You are a summarization assistant for a fictional story. Provide a comprehensive summary of the story arc using at most {{words}} words.

Include:
- **Character Development**: How each major character has changed and grown
- **Key Events**: The most important moments in chronological order
- **Important Elements**: Significant objects, locations, and relationships
- **Major Themes**: The underlying themes and messages explored
- **Resolution Status**: What was resolved and what remains open

Format this as a clear, well-organized narrative summary. Use markdown formatting and section headings to organize the summary.

IMPORTANT: Start your response with the heading "**Story Arc Summary**" on its own line, followed by a blank line, then write the summary content with your subsection headings.
`;

function getStoryTextToSummarize() {
    const ctx = SillyTavern.getContext();
    const { chat } = ctx;
    const settings = extension_settings[MODULE_NAME];

    // Filter non-system messages
    const filteredMessages = chat.filter(m => !m.is_system && m.mes);

    // Use either entire chat (if 0) or last N messages
    const messagesToSummarize = settings.summaryMessageCount === 0
        ? filteredMessages // Entire chat
        : filteredMessages.slice(-settings.summaryMessageCount); // Last N messages

    const parts = messagesToSummarize.map(m => m.mes);

    return parts.join('\n\n');
}

async function summarizeChatMainForStory() {
    const storyText = getStoryTextToSummarize();
    if (!storyText.trim()) {
        console.warn('[Story Mode] No text to summarize');
        return '';
    }

    const settings = extension_settings[MODULE_NAME];
    const words = settings.summaryWords ?? 500; // or fixed number if no setting

    const systemPrompt = STORY_SUMMARY_PROMPT.replace('{{words}}', String(words));

    // Use the currently selected model/preset; just override systemPrompt and prompt
    const summary = await generateRaw({
        prompt: storyText,
        systemPrompt,
        responseLength: settings.summaryMaxTokens ?? 0, // 0 = use preset
    });

    return summary?.trim() || '';
}

/**
 * Hook: Chat changed
 */
function onChatChanged() {
    // Reset flags
    isRegenerating = false;
    isLoadingChat = true; // Set flag to prevent increment during chat load

    // Update UI
    updateStoryPrompt();
    updateStatusDisplay();

    console.debug('[Story Mode] Chat changed, state reloaded');

    // Reset the loading flag after a short delay to allow chat to fully load
    setTimeout(() => {
        isLoadingChat = false;
        console.debug('[Story Mode] Chat loading complete');
    }, 1000);
}

/**
 * Initialize extension
 */
jQuery(async function() {
    console.log('[Story Mode] Extension loading...');

    // Load Fuse.js
    await loadFuseJS();

    // Load settings
    loadSettings();

    // Load data from localForage
    await loadStoryTypes();
    await loadAuthorStyles();

    // Load original versions for revert functionality (must be after loading data)
    await loadOriginalStoryTypes();
    await loadOriginalAuthorStyles();

    // Migration: Check if old data exists in extension_settings and migrate to localForage
    if (extension_settings[MODULE_NAME].storyTypes && extension_settings[MODULE_NAME].storyTypes.length > 0) {
        console.log('[Story Mode] Migrating story types from extension_settings to localForage');
        extension_settings[MODULE_NAME].storyTypes.forEach(customType => {
            const existing = storyTypes.findIndex(t => t.id === customType.id);
            if (existing >= 0) {
                storyTypes[existing] = customType;
            } else {
                storyTypes.push(customType);
            }
        });
        // Save to localForage and clear from extension_settings
        await saveStoryTypesToStorage();
        extension_settings[MODULE_NAME].storyTypes = [];
        saveSettingsDebounced();
    }

    if (extension_settings[MODULE_NAME].authorStyles && extension_settings[MODULE_NAME].authorStyles.length > 0) {
        console.log('[Story Mode] Migrating author styles from extension_settings to localForage');
        extension_settings[MODULE_NAME].authorStyles.forEach(customStyle => {
            const existing = authorStyles.findIndex(s => s.id === customStyle.id);
            if (existing >= 0) {
                authorStyles[existing] = customStyle;
            } else {
                authorStyles.push(customStyle);
            }
        });
        // Save to localForage and clear from extension_settings
        await saveAuthorStylesToStorage();
        extension_settings[MODULE_NAME].authorStyles = [];
        saveSettingsDebounced();
    }

    // Add UI
    await addUI();

    // Register event hooks
    eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
    eventSource.on(event_types.CHAT_CHANGED, onChatChanged);

    // Initial prompt injection
    updateStoryPrompt();

    console.log('[Story Mode] Extension loaded successfully');
});

