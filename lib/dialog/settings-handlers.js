/**
 * Settings Dialog Event Handlers
 * Handles all event bindings for the unified settings dialog
 */

import { saveSettingsDebounced, saveChatConditional, eventSource } from '/script.js';
import { LIBRARY_EVENTS } from '../blueprint/file-storage.js';
import { extension_settings } from '/scripts/extensions.js';
import { Popup, POPUP_RESULT, callGenericPopup, POPUP_TYPE } from '/scripts/popup.js';

import * as BlueprintModule from '../blueprint/module.js';
import { openBlueprintEditor } from '../editor/blueprint-editor.js';
import {
    createBlueprint,
    decodeBlueprintFromPNG,
    isBlueprintPNG,
    getLibrary,
} from '../blueprint/integration.js';
import { updateControllerPanel } from '../ui/controller-panel.js';
import {
    MODULE_NAME,
    getChatStoryState,
    saveChatStoryState,
    getCurrentSceneIndex,
    setCurrentSceneIndex,
} from '../core/state-manager.js';
import { updateStoryPrompt } from '../core/arc-engine.js';
import { jumpToRound, pushStoryMessage } from '../core/event-handlers.js';
import {
    showStoryTypesEditor,
    showAuthorStylesEditor,
} from '../editor/type-editors.js';
import {
    buildBlueprintTabContent,
    renderBlueprintOverviewSubtab,
    showLibraryGenerateView,
    showLibraryGridView,
    renderMainPanel,
} from '../ui/components.js';
import {
    debounce,
    refreshLibraryView,
    loadBlueprintsForFolder,
    searchLibraryBlueprints,
    loadBlueprintFromLibrary,
    playBlueprintFromLibrary,
    editBlueprintFromLibrary,
    toggleBlueprintFavorite,
    deleteBlueprintFromLibrary,
    exportBlueprintFromLibrary,
    refreshSidebar,
    returnToLibraryIfNeeded,
} from './library-view.js';
import { launchWizardModal } from './wizard.js';

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
 * @param {Object} context - Context object with callbacks and state
 * @param {Array} context.storyTypes - Story types array
 * @param {Array} context.authorStyles - Author styles array
 * @param {Function} context.updateStatusDisplay - Update status display callback
 * @param {Function} context.updatePreviewInDialog - Update preview in dialog callback
 * @param {Function} context.refreshBlueprintPreview - Refresh blueprint preview callback
 * @param {Function} context.setupEventListeners - Setup event listeners callback
 * @param {Function} context.populateConnectionProfiles - Populate connection profiles callback
 */
export function setupUnifiedDialogEventListeners(content, context) {
    const {
        storyTypes,
        authorStyles,
        updateStatusDisplay,
        updatePreviewInDialog,
        refreshBlueprintPreview,
        setupEventListeners,
        populateConnectionProfiles,
    } = context;

    // Create library callbacks object
    const libraryCallbacks = {
        refreshBlueprintPreview,
        updateStatusDisplay,
        showLibraryGridView,
        loadBlueprintsForFolder: (c, folderId) => loadBlueprintsForFolder(c, folderId, libraryCallbacks),
        refreshLibraryView: (c) => refreshLibraryView(c, libraryCallbacks),
    };

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
        setupUnifiedDialogEventListeners(content, context);
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
        content.find(selector).on('change', async function () {
            if (!extension_settings[MODULE_NAME].blueprintSettings) {
                extension_settings[MODULE_NAME].blueprintSettings = {};
            }
            const newValue = transform(this);
            extension_settings[MODULE_NAME].blueprintSettings[key] = newValue;
            saveSettingsDebounced();
            if (updatePrompt) {
                updateStoryPrompt();
            }

            // Trigger catch-up summarization when summarization is enabled
            if (key === 'summarizationEnabled' && newValue === true) {
                const blueprintState = BlueprintModule.getBlueprintState();
                if (blueprintState?.blueprint && blueprintState.useBlueprint) {
                    const triggered = BlueprintModule.triggerCatchUpSummarization(
                        blueprintState,
                        extension_settings[MODULE_NAME]
                    );
                    if (triggered > 0) {
                        toastr.info(`Started catch-up summarization for ${triggered} eligible scene(s)`, 'Story Mode');
                    }
                    // Refresh controller panel to show status
                    if (window.updateControllerPanel) window.updateControllerPanel();
                }
            }
        });
    });

    // Edit scene summary prompt template button
    content.find('#edit_scene_summary_prompt').on('click', async function () {
        const currentPrompt = await BlueprintModule.getEffectiveSceneSummaryPrompt();

        // Load style requirements using the template system (handles custom + fallback)
        const PromptTemplates = await import('../generation/templates.js');

        let narrativeReqs, bulletReqs, bothReqs;

        try {
            // Use getSummaryRequirements which already handles custom/default fallback
            narrativeReqs = await PromptTemplates.getSummaryRequirements('narrative');
            bulletReqs = await PromptTemplates.getSummaryRequirements('bullet');
            bothReqs = await PromptTemplates.getSummaryRequirements('both');

            // If any are empty, provide helpful defaults
            if (!narrativeReqs || !narrativeReqs.trim()) {
                narrativeReqs = 'Write a narrative paragraph (3-5 sentences) summarizing the key events of this scene.';
            }
            if (!bulletReqs || !bulletReqs.trim()) {
                bulletReqs = 'Create a bullet-point list with:\n- One bullet per significant event\n- Each bullet is a complete sentence';
            }
            if (!bothReqs || !bothReqs.trim()) {
                bothReqs = 'Provide:\n1. Overview (2-3 sentences)\n2. Key Events (bullet points)';
            }
        } catch (error) {
            console.error('[Story Mode] Error loading summary requirements:', error);
            toastr.error('Failed to load summary requirements templates');
            return;
        }

        // Create tabbed editor with main template + style requirements
        const popupHtml = `
            <div class="storymode-prompt-editor">
                <p style="margin-bottom: 12px; color: var(--SmartThemeBodyColor); line-height: 1.5;">
                    Customize the prompt template and style-specific requirements for scene summarization.
                </p>

                <!-- Tab Navigation -->
                <div class="storymode-prompt-tabs" style="display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 2px solid var(--SmartThemeBorderColor);">
                    <button class="storymode-prompt-tab active" data-tab="main" style="padding: 8px 16px; background: var(--sm-accent); color: white; border: none; border-radius: 6px 6px 0 0; cursor: pointer; font-weight: 600;">
                        Main Template
                    </button>
                    <button class="storymode-prompt-tab" data-tab="narrative" style="padding: 8px 16px; background: var(--black30a); color: var(--SmartThemeBodyColor); border: none; border-radius: 6px 6px 0 0; cursor: pointer;">
                        Narrative Style
                    </button>
                    <button class="storymode-prompt-tab" data-tab="bullet" style="padding: 8px 16px; background: var(--black30a); color: var(--SmartThemeBodyColor); border: none; border-radius: 6px 6px 0 0; cursor: pointer;">
                        Bullet Style
                    </button>
                    <button class="storymode-prompt-tab" data-tab="both" style="padding: 8px 16px; background: var(--black30a); color: var(--SmartThemeBodyColor); border: none; border-radius: 6px 6px 0 0; cursor: pointer;">
                        Both Style
                    </button>
                </div>

                <!-- Main Template Tab -->
                <div class="storymode-prompt-tab-content" data-tab="main">
                    <div style="margin-bottom: 12px; padding: 12px; background: var(--black30a); border-radius: 6px; border-left: 3px solid var(--sm-accent); font-size: 0.9em;">
                        <div style="margin-bottom: 6px; font-weight: 600; color: var(--SmartThemeBodyColor);">Available Placeholders:</div>
                        <div style="color: var(--SmartThemeQuoteColor); line-height: 1.6;">
                            <code style="color: var(--sm-accent);">{{CONTEXT}}</code> = Story premise, scene title, phase, purpose<br>
                            <code style="color: var(--sm-accent);">{{MESSAGES}}</code> = All dialogue and actions from this scene<br>
                            <code style="color: var(--sm-accent);">{{REQUIREMENTS}}</code> = Style-specific instructions (see other tabs)
                        </div>
                    </div>
                    <textarea id="scene_summary_main_input" class="text_pole textarea_compact" style="width: 100%; min-height: 320px; font-family: monospace; font-size: 0.9em;">${currentPrompt.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
                </div>

                <!-- Narrative Style Tab -->
                <div class="storymode-prompt-tab-content" data-tab="narrative" style="display: none;">
                    <div style="margin-bottom: 12px; padding: 12px; background: var(--black30a); border-radius: 6px; border-left: 3px solid var(--sm-accent); font-size: 0.9em; color: var(--SmartThemeQuoteColor);">
                        Instructions for <strong style="color: var(--SmartThemeBodyColor);">narrative paragraph</strong> summaries. Injected as {{REQUIREMENTS}} when Summary Style = "Narrative paragraphs".
                    </div>
                    <textarea id="scene_summary_narrative_input" class="text_pole textarea_compact" style="width: 100%; min-height: 320px; font-family: monospace; font-size: 0.9em;">${narrativeReqs.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
                </div>

                <!-- Bullet Style Tab -->
                <div class="storymode-prompt-tab-content" data-tab="bullet" style="display: none;">
                    <div style="margin-bottom: 12px; padding: 12px; background: var(--black30a); border-radius: 6px; border-left: 3px solid var(--sm-accent); font-size: 0.9em; color: var(--SmartThemeQuoteColor);">
                        Instructions for <strong style="color: var(--SmartThemeBodyColor);">bullet-point</strong> summaries. Injected as {{REQUIREMENTS}} when Summary Style = "Bullet points".
                    </div>
                    <textarea id="scene_summary_bullet_input" class="text_pole textarea_compact" style="width: 100%; min-height: 320px; font-family: monospace; font-size: 0.9em;">${bulletReqs.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
                </div>

                <!-- Both Style Tab -->
                <div class="storymode-prompt-tab-content" data-tab="both" style="display: none;">
                    <div style="margin-bottom: 12px; padding: 12px; background: var(--black30a); border-radius: 6px; border-left: 3px solid var(--sm-accent); font-size: 0.9em; color: var(--SmartThemeQuoteColor);">
                        Instructions for <strong style="color: var(--SmartThemeBodyColor);">combined narrative + bullets</strong> summaries. Injected as {{REQUIREMENTS}} when Summary Style = "Both".
                    </div>
                    <textarea id="scene_summary_both_input" class="text_pole textarea_compact" style="width: 100%; min-height: 320px; font-family: monospace; font-size: 0.9em;">${bothReqs.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
                </div>
            </div>
        `;

        // Bind tab switching logic BEFORE opening popup
        $(document).off('click.sceneSummaryTabs').on('click.sceneSummaryTabs', '.storymode-prompt-tab', function() {
            const tabName = $(this).data('tab');

            // Update tab buttons
            $('.storymode-prompt-tab').css({
                'background': 'var(--black30a)',
                'color': 'var(--SmartThemeBodyColor)'
            }).removeClass('active');
            $(this).css({
                'background': 'var(--sm-accent)',
                'color': 'white'
            }).addClass('active');

            // Update tab content
            $('.storymode-prompt-tab-content').hide();
            $(`.storymode-prompt-tab-content[data-tab="${tabName}"]`).show();
        });

        const result = await callGenericPopup(popupHtml, POPUP_TYPE.TEXT, '', {
            okButton: 'Save All',
            cancelButton: 'Cancel',
            wide: true,
            large: true,
            allowVerticalScrolling: false
        });

        if (result === POPUP_RESULT.AFFIRMATIVE) {
            const mainTemplate = $('#scene_summary_main_input').val();
            const narrativeTemplate = $('#scene_summary_narrative_input').val();
            const bulletTemplate = $('#scene_summary_bullet_input').val();
            const bothTemplate = $('#scene_summary_both_input').val();

            if (mainTemplate && mainTemplate.trim()) {
                if (!extension_settings[MODULE_NAME].blueprintSettings) {
                    extension_settings[MODULE_NAME].blueprintSettings = {};
                }

                // Save main template
                extension_settings[MODULE_NAME].blueprintSettings.sceneSummaryPrompt = mainTemplate;

                // Save style requirements
                extension_settings[MODULE_NAME].blueprintSettings.summaryRequirements_narrative = narrativeTemplate;
                extension_settings[MODULE_NAME].blueprintSettings.summaryRequirements_bullet = bulletTemplate;
                extension_settings[MODULE_NAME].blueprintSettings.summaryRequirements_both = bothTemplate;

                saveSettingsDebounced();
                toastr.success('Scene summary templates updated');
            }
        }

        // Clean up event listener
        $(document).off('click.sceneSummaryTabs');
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
    });

    // Opening Message API dropdown
    content.find('#opening_message_api').on('change', function () {
        const selectedApi = $(this).val() || null;
        extension_settings[MODULE_NAME].blueprintSettings = extension_settings[MODULE_NAME].blueprintSettings || {};
        extension_settings[MODULE_NAME].blueprintSettings.openingMessageApi = selectedApi;
        saveSettingsDebounced();
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

    // Loading Indicator settings (placeholders for future implementation)
    content.find('#loading_indicator_enabled').on('change', function () {
        // const enabled = $(this).is(':checked');
    });
    content.find('#loading_indicator_position').on('change', function () {
        // const position = $(this).val();
    });
    content.find('#loading_indicator_animation').on('change', function () {
        // const animationStyle = $(this).val();
    });
    content.find('#loading_indicator_gif_url').on('change', function () {
        // const customGifUrl = $(this).val() || null;
    });
    content.find('#loading_indicator_phrases').on('change', function () {
        // const phrasesText = $(this).val();
        // const phrases = phrasesText.split('\n').map(p => p.trim()).filter(p => p.length > 0);
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
        // Check if wizard mode is enabled (default true, unless "Legacy Mode" checked)
        const wizardDisabled = content.find('#storymode_wizard_disabled').is(':checked');
        const wizardEnabled = !wizardDisabled;

        // If wizard mode is enabled, launch the wizard modal
        if (wizardEnabled) {
            await launchWizardModal(content, {
                returnToLibraryIfNeeded: (c) => returnToLibraryIfNeeded(c, { showLibraryGridView }),
                loadBlueprintsForFolder: (c, folderId) => loadBlueprintsForFolder(c, folderId, libraryCallbacks)
            });
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
            returnToLibraryIfNeeded(content, { showLibraryGridView });

            // Clear the global reference
            window.storyModeWizardPopup = null;
            toastr.info('Scenario blueprint generation cancelled');
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
                        toastr.error('This PNG does not contain scenario blueprint data');
                        return;
                    }
                    blueprint = await decodeBlueprintFromPNG(file);
                } else {
                    // Parse as JSON
                    const text = await file.text();
                    blueprint = JSON.parse(text);
                }

                // Validate blueprint
                const validation = BlueprintModule.validateBlueprint(blueprint);
                if (!validation.valid) {
                    toastr.error('Invalid scenario blueprint: ' + validation.errors.join(', '));
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

                toastr.success(`Scenario blueprint imported from ${file.name.endsWith('.png') ? 'PNG' : 'JSON'}`);
            } catch (error) {
                console.error('[Story Mode] Import error:', error);
                toastr.error('Failed to import: ' + error.message);
            }
        };
        input.click();
    });

    // Export blueprint button
    content.on('click', '#blueprint_export_btn', async function () {
        const blueprintState = BlueprintModule.getBlueprintState();
        if (!blueprintState.blueprint) {
            toastr.error('No scenario blueprint to export');
            return;
        }

        const btn = $(this);
        const originalText = btn.html();
        btn.prop('disabled', true);
        btn.html('<i class="fa-solid fa-spinner fa-spin"></i> Exporting...');

        try {
            // Use the simple JSON export function from blueprint-module.js
            BlueprintModule.exportBlueprint(blueprintState.blueprint);
            toastr.success('Scenario blueprint exported successfully');
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
            toastr.error('No scenario blueprint to edit');
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
                toastr.success('Scenario blueprint updated');
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
        if (!confirm('Clear the current scenario? This cannot be undone.')) return;
        const blueprintState = BlueprintModule.getBlueprintState();
        blueprintState.blueprint = null;
        blueprintState.useBlueprint = false;
        setCurrentSceneIndex(0);
        await BlueprintModule.saveBlueprintState(blueprintState);
        // Refresh tabs
        content.find('#tab_blueprint').html(buildBlueprintTabContent());
        refreshSidebar(content);
        updateStatusDisplay();
        toastr.success('Scenario cleared');
    });

    // Inject opening message button
    content.on('click', '#inject_opening_message_btn', async function () {
        const blueprintState = BlueprintModule.getBlueprintState();
        if (!blueprintState.blueprint?.opening_message) {
            toastr.error('No opening message available');
            return;
        }

        const btn = $(this);
        const originalText = btn.html();
        btn.prop('disabled', true);
        btn.html('<i class="fa-solid fa-spinner fa-spin"></i> Inserting...');

        try {
            await pushStoryMessage(blueprintState.blueprint.opening_message);
            await saveChatConditional();
            toastr.success('Opening message inserted into chat');

            // Close the settings dialog to return to chat
            if (window.storyModeSettingsPopup) {
                window.storyModeSettingsPopup.complete(POPUP_RESULT.AFFIRMATIVE);
            }
        } catch (error) {
            console.error('[Story Mode] Error inserting opening message:', error);
            toastr.error('Failed to insert opening message');
            // Don't restore button state on error - let finally handle it
        } finally {
            btn.prop('disabled', false);
            btn.html(originalText);
        }
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

    // Listen for library update events (e.g., from blueprint duplication)
    const handleLibraryUpdate = async (data) => {
        // Only refresh if the library tab is currently visible
        if (content.find('.storymode-tab[data-tab="library"]').hasClass('active')) {
            await refreshLibraryView(content, libraryCallbacks);
        }
    };
    eventSource.on(LIBRARY_EVENTS.BLUEPRINT_ADDED, handleLibraryUpdate);
    eventSource.on(LIBRARY_EVENTS.BLUEPRINT_DELETED, handleLibraryUpdate);
    eventSource.on(LIBRARY_EVENTS.BLUEPRINT_UPDATED, handleLibraryUpdate);

    // Initialize library when Library tab is clicked
    content.on('click', '.storymode-tab[data-tab="library"]', async function () {
        await refreshLibraryView(content, libraryCallbacks);
    });

    // Folder selection
    content.on('click', '.storymode-folder-item', async function () {
        const folderId = $(this).data('folder');
        content.find('.storymode-folder-item').removeClass('active');
        $(this).addClass('active');
        await loadBlueprintsForFolder(content, folderId, libraryCallbacks);
    });

    // Search input
    content.on('input', '#library_search_input', debounce(async function () {
        const query = $(this).val().trim();
        if (query.length >= 2) {
            await searchLibraryBlueprints(content, query);
        } else if (query.length === 0) {
            const activeFolder = content.find('.storymode-folder-item.active').data('folder') || 'all';
            await loadBlueprintsForFolder(content, activeFolder, libraryCallbacks);
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
                await loadBlueprintFromLibrary(content, blueprintId, libraryCallbacks);
                break;
            case 'play':
                await playBlueprintFromLibrary(content, blueprintId, libraryCallbacks);
                break;
            case 'edit':
                await editBlueprintFromLibrary(content, blueprintId, libraryCallbacks);
                break;
            case 'favorite':
                await toggleBlueprintFavorite(content, blueprintId, $(this), libraryCallbacks);
                break;
            case 'delete':
                await deleteBlueprintFromLibrary(content, blueprintId, libraryCallbacks);
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
        await editBlueprintFromLibrary(content, blueprintId, libraryCallbacks);
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
        await loadBlueprintsForFolder(content, activeFolder, libraryCallbacks);
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
            let skipped = 0;
            const library = await getLibrary();

            for (const file of files) {
                console.log('[SettingsHandlers] Processing file:', file.name);
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

                    // Check for duplicate
                    const existing = await library.getBlueprint(blueprint.blueprint_id);
                    if (existing) {
                        const existingTitle = existing.userMetadata?.title || 'Untitled';
                        const newTitle = blueprint.userMetadata?.title || 'Untitled';

                        const dialogHtml = `
                            <div style="padding: 10px;">
                                <p style="margin-bottom: 15px;">A blueprint with this ID already exists:</p>
                                <div style="background: var(--SmartThemeBlurTintColor); padding: 10px; border-radius: 5px; margin-bottom: 15px;">
                                    <strong>Existing:</strong> ${existingTitle}<br>
                                    <strong>Importing:</strong> ${newTitle}
                                </div>
                                <p>What would you like to do?</p>
                            </div>
                        `;

                        const result = await callGenericPopup(dialogHtml, POPUP_TYPE.CONFIRM, 'Duplicate Blueprint', {
                            okButton: 'Add as Copy',
                            cancelButton: 'Replace Existing',
                        });

                        console.log('[SettingsHandlers] Dialog result:', result, 'type:', typeof result);
                        console.log('[SettingsHandlers] POPUP_RESULT values:', POPUP_RESULT);

                        // Check for various result formats
                        const isOk = result === true || result === POPUP_RESULT.AFFIRMATIVE || result === 1;
                        const isCancel = result === false || result === POPUP_RESULT.NEGATIVE || result === 0;
                        const isClosed = result === null || result === undefined || result === POPUP_RESULT.CANCELLED;

                        console.log('[SettingsHandlers] isOk:', isOk, 'isCancel:', isCancel, 'isClosed:', isClosed);

                        if (isClosed) {
                            console.log('[SettingsHandlers] Dialog was closed/cancelled');
                            skipped++;
                            continue;
                        }

                        if (isOk) {
                            // Add as copy - generate new ID and append "(Copy)" to title
                            const { generateUUID } = await import('../blueprint/utils.js');
                            const oldId = blueprint.blueprint_id;
                            blueprint.blueprint_id = generateUUID();
                            blueprint.userMetadata.title = (blueprint.userMetadata.title || 'Blueprint') + ' (Copy)';
                            console.log('[SettingsHandlers] Add as Copy: oldId=', oldId, 'newId=', blueprint.blueprint_id);
                            console.log('[SettingsHandlers] New title:', blueprint.userMetadata.title);
                        } else if (isCancel) {
                            console.log('[SettingsHandlers] Replace: keeping ID', blueprint.blueprint_id);
                        } else {
                            console.log('[SettingsHandlers] Unknown result, skipping');
                            skipped++;
                            continue;
                        }
                    }

                    console.log('[SettingsHandlers] Calling createBlueprint with ID:', blueprint.blueprint_id);
                    await createBlueprint(blueprint, { saveToLibrary: true });
                    console.log('[SettingsHandlers] createBlueprint completed successfully');
                    imported++;
                } catch (error) {
                    console.error(`[Story Mode] Failed to import ${file.name}:`, error);
                    failed++;
                }
            }

            await refreshLibraryView(content, libraryCallbacks);

            if (imported > 0 && failed === 0 && skipped === 0) {
                toastr.success(`Imported ${imported} blueprint(s)`);
            } else if (imported > 0) {
                let msg = `Imported ${imported}`;
                if (failed > 0) msg += `, failed ${failed}`;
                if (skipped > 0) msg += `, skipped ${skipped}`;
                toastr.warning(msg);
            } else if (skipped > 0) {
                toastr.info(`Import skipped (${skipped} cancelled)`);
            } else {
                toastr.error('Failed to import any blueprints');
            }
        };
        input.click();
    });
}
