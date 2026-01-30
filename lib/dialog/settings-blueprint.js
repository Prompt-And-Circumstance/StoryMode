import * as BlueprintModule from '../blueprint/module.js';
import { openBlueprintEditor } from '../editor/blueprint-editor.js';
import { MODULE_NAME, getChatStoryState, saveChatStoryState, getCurrentSceneIndex, setCurrentSceneIndex } from '../core/state-manager.js';
import { updateStoryPrompt } from '../core/arc-engine.js';
import { updateControllerPanel } from '../ui/controller-panel.js';
import { saveSettingsDebounced, saveChatConditional } from '/script.js';
import { extension_settings } from '/scripts/extensions.js';
import { callGenericPopup, POPUP_TYPE, POPUP_RESULT } from '/scripts/popup.js';
import { buildBlueprintTabContent, renderBlueprintOverviewSubtab, renderMainPanel, showLibraryGridView } from '../ui/components.js';
import { jumpToRound, pushStoryMessage } from '../core/event-handlers.js';
import { updatePhaseStatusIndicators, resetPhaseOverrides } from '../ui/components/phase-override-panel.js';
import { launchWizardModal } from './wizard.js';
import { returnToLibraryIfNeeded, refreshSidebar, loadBlueprintsForFolder } from './library-view.js';
import { updateBlueprintSetting } from './settings-handlers.js';
import {
    setupSummarizationSettings,
    setupEditSceneSummaryPrompt,
    setupCoverGenerationSettings,
    setupSceneImageSettings,
} from './settings-blueprint-prompts.js';

export function setupBlueprintEvents(content, context) {
    const { libraryCallbacks, updateStatusDisplay, refreshBlueprintPreview } = context;

    bindBlueprintToggles(content, context);

    // Delegated setup functions
    setupSummarizationSettings(content);
    setupEditSceneSummaryPrompt(content);
    setupCoverGenerationSettings(content);
    setupSceneImageSettings(content);
    setupApiDropdowns(content);
    bindResetArcAndWizard(content, updateStatusDisplay);
    setupPhaseOverrideHandlers(content);
    setupBlueprintGenerationHandlers(content, libraryCallbacks);
    setupBlueprintManagementHandlers(content, { updateStatusDisplay, refreshBlueprintPreview, libraryCallbacks });
    setupOpeningMessageHandler(content);
    setupSceneSliderHandlers(content);
}

function bindBlueprintToggles(content, context) {
    const { updateStatusDisplay, setupEventListeners, populateConnectionProfiles } = context;

    content.find('#blueprint_enabled, #blueprint_enabled_tab').on('change', function () {
        const enabled = $(this).is(':checked');
        if (!extension_settings[MODULE_NAME].blueprintSettings) {
            extension_settings[MODULE_NAME].blueprintSettings = {};
        }
        extension_settings[MODULE_NAME].blueprintSettings.enabled = enabled;
        saveSettingsDebounced();
        toastr.success('Settings saved');
        updateStoryPrompt();
        updateStatusDisplay();
        populateConnectionProfiles(content);
    });

    content.find('#blueprint_use_scene_prompts').on('change', function () {
        const enabled = $(this).is(':checked');
        if (!extension_settings[MODULE_NAME].blueprintSettings) {
            extension_settings[MODULE_NAME].blueprintSettings = {};
        }
        extension_settings[MODULE_NAME].blueprintSettings.useScenePrompts = enabled;
        saveSettingsDebounced();
        toastr.success('Settings saved');
        updateStoryPrompt();
    });

    content.find('#blueprint_beat_tracking').on('change', function () {
        updateBlueprintSetting('beatTrackingEnabled', $(this).is(':checked'));
        $('#story_mode_panel').replaceWith(renderMainPanel());
        setupEventListeners();
    });

    content.find('#blueprint_inject_missing_characters').on('change', function () {
        updateBlueprintSetting('injectMissingCharacters', $(this).is(':checked'));
    });

    content.find('#staged_scene_generation').on('change', function () {
        updateBlueprintSetting('useStagedSceneGeneration', $(this).is(':checked'));
    });

    content.find('#blueprint_scene_transition_notify').on('change', function () {
        const value = $(this).val() || 'none';
        if (!extension_settings[MODULE_NAME].blueprintSettings) {
            extension_settings[MODULE_NAME].blueprintSettings = {};
        }
        extension_settings[MODULE_NAME].blueprintSettings.sceneTransitionNotify = value;
        saveSettingsDebounced();
        toastr.success('Settings saved');
    });
}

function bindResetArcAndWizard(content, updateStatusDisplay) {
    content.find('#reset_arc_btn').on('click', async function () {
        const result = await callGenericPopup(
            'Reset the story arc? This will set the round counter back to 0 and clear arc completion flags.',
            POPUP_TYPE.CONFIRM,
            '',
            { okButton: 'Reset Arc', cancelButton: 'Cancel' }
        );
        if (result === POPUP_RESULT.AFFIRMATIVE) {
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
            content.find('#current_step_display').text('Step 0 / ' + chatState.arcLength);
        }
    });

    content.on('change', '#storymode_wizard_disabled', function () {
        const wizardDisabled = $(this).is(':checked');
        const wizardEnabled = !wizardDisabled;
        extension_settings[MODULE_NAME].blueprintSettings = extension_settings[MODULE_NAME].blueprintSettings || {};
        extension_settings[MODULE_NAME].blueprintSettings.wizardMode = { enabled: wizardEnabled };
        saveSettingsDebounced();
        toastr.info(wizardEnabled
            ? 'Wizard mode enabled - blueprint generation will open in a dedicated modal window'
            : 'Wizard mode disabled - blueprint generation will use standard single-pass mode'
        );
    });
}

function setupApiDropdowns(content) {
    content.find('#blueprint_generation_api').on('change', function () {
        const selectedApi = $(this).val() || null;
        extension_settings[MODULE_NAME].blueprintSettings = extension_settings[MODULE_NAME].blueprintSettings || {};
        extension_settings[MODULE_NAME].blueprintSettings.generationApi = selectedApi;
        saveSettingsDebounced();
        toastr.success('Settings saved');
    });

    content.find('#opening_message_api').on('change', function () {
        const selectedApi = $(this).val() || null;
        extension_settings[MODULE_NAME].blueprintSettings = extension_settings[MODULE_NAME].blueprintSettings || {};
        extension_settings[MODULE_NAME].blueprintSettings.openingMessageApi = selectedApi;
        saveSettingsDebounced();
        toastr.success('Settings saved');
    });

    content.find('#epilogue_api').on('change', function () {
        const selectedApi = $(this).val() || null;
        extension_settings[MODULE_NAME].epilogueApi = selectedApi;
        saveSettingsDebounced();
        toastr.success('Settings saved');
    });

    content.find('#summary_api').on('change', function () {
        const selectedApi = $(this).val() || null;
        extension_settings[MODULE_NAME].summaryApi = selectedApi;
        saveSettingsDebounced();
        toastr.success('Settings saved');
    });

    content.find('#next_adventure_api').on('change', function () {
        const selectedApi = $(this).val() || null;
        extension_settings[MODULE_NAME].nextAdventureApi = selectedApi;
        saveSettingsDebounced();
        toastr.success('Settings saved');
    });
}

function setupPhaseOverrideHandlers(content) {
    content.on('click', '#phase_override_reset', function () {
        const defaultProfileId = extension_settings[MODULE_NAME]?.blueprintSettings?.generationApi || null;
        resetPhaseOverrides(content, defaultProfileId);
    });

    content.on('change', '.phase-profile-select, .phase-tokens-input', function () {
        const defaultProfileId = extension_settings[MODULE_NAME]?.blueprintSettings?.generationApi || null;
        updatePhaseStatusIndicators(content, defaultProfileId);
    });
}

function setupBlueprintGenerationHandlers(content, libraryCallbacks) {
    content.on('click', '#blueprint_generate_btn', async function () {
        const wizardDisabled = content.find('#storymode_wizard_disabled').is(':checked');
        const wizardEnabled = !wizardDisabled;

        if (wizardEnabled) {
            await launchWizardModal(content, {
                returnToLibraryIfNeeded: (c) => returnToLibraryIfNeeded(c, { showLibraryGridView }),
                loadBlueprintsForFolder: (c, folderId) => loadBlueprintsForFolder(c, folderId, libraryCallbacks)
            });
            return;
        }

        toastr.warning('Legacy single-pass mode is not yet fully implemented. Please use wizard mode (uncheck "Legacy Single-Process Mode" in Advanced Options).');
    });

    content.on('click', '#blueprint_cancel_generation_btn', function () {
        const wizardPopup = window.storyModeWizardPopup;
        if (wizardPopup && !wizardPopup.dlg.hasAttribute('closing')) {
            const popupElement = wizardPopup.content;
            const statusElement = popupElement?.querySelector('#storymode-wizard-status');
            if (statusElement) {
                statusElement.innerHTML = '<span style="color: var(--corruption-red);">Generation cancelled from settings panel.</span>';
            }
            wizardPopup.isCancelled = true;
            wizardPopup.complete(POPUP_RESULT.CANCELLED);
            content.find('#blueprint_cancel_generation_btn').hide();
            content.find('#blueprint_generate_btn').show();
            returnToLibraryIfNeeded(content, { showLibraryGridView });
            window.storyModeWizardPopup = null;
            toastr.info('Scenario blueprint generation cancelled');
        }
    });

    content.on('click', '#blueprint_return_to_library_btn', function () {
        content.removeData('generateFromLibrary');
        showLibraryGridView(content);
    });

    content.on('click', '.storymode-resolution-item', function (e) {
        if ($(e.target).is('input[type="radio"]')) return;
        const radio = $(this).find('input[type="radio"]');
        radio.prop('checked', true);
        $('.storymode-resolution-item').removeClass('selected');
        $(this).addClass('selected');
    });
}

function setupBlueprintManagementHandlers(content, callbacks) {
    const { updateStatusDisplay, refreshBlueprintPreview, libraryCallbacks } = callbacks;
    bindExportButton(content);
    bindEditButton(content, updateStatusDisplay, refreshBlueprintPreview);
    bindClearButton(content, { updateStatusDisplay, libraryCallbacks });
}

function bindExportButton(content) {
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
            const { exportBlueprintAsPNG } = await import('../blueprint/export.js');
            const result = await exportBlueprintAsPNG(blueprintState.blueprint);
            if (!result.success) {
                throw new Error(result.error || 'Export failed');
            }
            toastr.success(`Blueprint exported: ${result.filename}`);
        } catch (error) {
            console.error('[Story Mode] Error exporting blueprint:', error);
            toastr.error('Failed to export: ' + error.message);
        } finally {
            btn.prop('disabled', false);
            btn.html(originalText);
        }
    });
}

function bindEditButton(content, updateStatusDisplay, refreshBlueprintPreview) {
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
                blueprintState.blueprint = editedBlueprint;
                await BlueprintModule.saveBlueprintState(blueprintState);
                content.find('#tab_blueprint').html(buildBlueprintTabContent());
                refreshSidebar(content);
                updateStatusDisplay();
                refreshBlueprintPreview();
                toastr.success('Scenario blueprint updated');
            }
        } catch (error) {
            console.error('[Story Mode] Error editing blueprint:', error);
            toastr.error('Failed to open blueprint editor');
        } finally {
            btn.prop('disabled', false);
            btn.html(originalText);
        }
    });
}

function bindClearButton(content, callbacks) {
    const { updateStatusDisplay, libraryCallbacks } = callbacks;
    content.on('click', '#blueprint_clear_btn', async function () {
        const result = await callGenericPopup(
            'Clear the current scenario? This cannot be undone.',
            POPUP_TYPE.CONFIRM,
            '',
            { okButton: 'Clear Scenario', cancelButton: 'Cancel' }
        );
        if (result !== POPUP_RESULT.AFFIRMATIVE) return;

        // Clear the blueprint state
        const blueprintState = BlueprintModule.getBlueprintState();
        blueprintState.blueprint = null;
        blueprintState.useBlueprint = false;
        setCurrentSceneIndex(0);
        await BlueprintModule.saveBlueprintState(blueprintState);

        // Rebuild the blueprint tab content
        content.find('#tab_blueprint').html(buildBlueprintTabContent());

        // Switch to library tab and show grid view
        if (libraryCallbacks?.switchToTab) {
            libraryCallbacks.switchToTab(content, 'library');
            showLibraryGridView(content);
        }

        refreshSidebar(content);
        updateStatusDisplay();
        toastr.success('Scenario cleared');
    });
}

function setupOpeningMessageHandler(content) {
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
            if (window.storyModeSettingsPopup) {
                window.storyModeSettingsPopup.complete(POPUP_RESULT.AFFIRMATIVE);
            }
        } catch (error) {
            console.error('[Story Mode] Error inserting opening message:', error);
            toastr.error('Failed to insert opening message');
        } finally {
            btn.prop('disabled', false);
            btn.html(originalText);
        }
    });
}

function setupSceneSliderHandlers(content) {
    content.on('click', '.storymode-scene-marker', async function () {
        const startRound = parseInt($(this).data('round'));
        const blueprintState = BlueprintModule.getBlueprintState();
        const wasAutoMode = blueprintState.sceneMode === 'auto';
        const result = await jumpToRound(startRound, parseInt($(this).data('scene')));
        if (result.success) {
            toastr.success(result.message);
            if (wasAutoMode) {
                toastr.info('Switched to manual scene mode', 'Story Mode');
            }
            refreshSceneSlider(content, blueprintState);
        } else {
            toastr.error(result.message);
        }
    });

    content.on('click', '.storymode-round-ticks .tick', async function () {
        const round = parseInt($(this).data('round'));
        const blueprintState = BlueprintModule.getBlueprintState();
        const wasAutoMode = blueprintState.sceneMode === 'auto';
        const result = await jumpToRound(round);
        if (result.success) {
            toastr.success(result.message);
            if (wasAutoMode) {
                toastr.info('Switched to manual scene mode', 'Story Mode');
            }
            refreshSceneSlider(content, blueprintState);
        } else {
            toastr.error(result.message);
        }
    });
}

function refreshSceneSlider(content, blueprintState) {
    const chatState = getChatStoryState();
    const blueprint = blueprintState.blueprint;
    if (blueprint) {
        const currentScene = BlueprintModule.getCurrentScene(
            blueprint, chatState.currentStep, chatState.arcLength,
            blueprintState.sceneMode, getCurrentSceneIndex()
        );
        content.find('#blueprint_subtab_content').html(renderBlueprintOverviewSubtab(blueprint, currentScene));
    }
}
