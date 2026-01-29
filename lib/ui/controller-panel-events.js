import { saveSettingsDebounced } from '/script.js';
import { extension_settings } from '/scripts/extensions.js';

import {
    MODULE_NAME,
    getChatStoryState,
    getPacingMode,
    setPacingMode,
    getCurrentSceneIndex,
} from '../core/state-manager.js';

import * as BlueprintModule from '../blueprint/module.js';
import { getBlueprintState } from '../blueprint/storage.js';
import * as ImageGenerator from '../scene/image-generator.js';
import * as ImagePreview from '../scene/image-preview.js';

import { updateStoryPrompt } from '../core/arc-engine.js';
import { showScenarioCharactersPopup } from './components/scenario-characters.js';

import {
    showDebugDetailPopup,
    showSummaryPopup,
    showPromptInspector,
    openBlueprintLibrary,
    openStoryModeSettings,
} from './controller-panel-popups.js';

import { showArcHistoryPopup } from './controller-panel-arc-history.js';
import { makeDraggable } from './controller-panel-drag.js';

// Circular import: updateControllerPanel is in controller-panel.js which imports from us.
// ES modules handle this fine -- the binding resolves before any function is called at runtime.
import { updateControllerPanel } from './controller-panel.js';

/**
 * Bind events for the docked sidebar content
 */
function bindDockedContentEvents(panel) {
    const content = panel.find('.storymode-sidebar-content');

    content.off('click');
    content.off('input');

    bindContentPopupHandlers(content);
    bindPacingModeHandlers(content);

    // Header buttons persist across content updates — remove old handlers to prevent accumulation
    panel.find('#storymode-dock-toggle-sidebar').off('click').on('click', () => toggleDockMode());
    panel.find('#storymode-prompt-inspector-sidebar').off('click').on('click', () => showPromptInspector());
    panel.find('#storymode-library-btn-sidebar').off('click').on('click', () => openBlueprintLibrary());
    panel.find('#storymode-settings-btn-sidebar').off('click').on('click', () => openStoryModeSettings());

    content.on('click', '#storymode-debug-arc-history-link', () => showArcHistoryPopup());

    bindOocEvents(content);
}

function bindContentPopupHandlers(content) {
    content.on('click', '#storymode-debug-scene-link', () => {
        console.log('[Story Mode] Scene link clicked (sidebar)');
        showDebugDetailPopup('scene');
    });
    content.on('click', '#storymode-debug-beats-link', () => showDebugDetailPopup('beats'));
    content.on('click', '#storymode-debug-summary-link', () => showSummaryPopup());
    content.on('click', '#storymode-debug-characters-link', () => showScenarioCharactersPopup());
    content.on('click', '#storymode-debug-image-link', (e) => {
        if ($(e.target).closest('button').length) return;
        handleImageSectionClick(e);
    });
    content.on('click', '#storymode-generate-image-btn', handleGenerateImage);
    content.on('click', '#storymode-open-library-notice', () => openBlueprintLibrary());
}

function bindPacingModeHandlers(container) {
    container.on('click', '#storymode-mode-story', async function () {
        if (getPacingMode() === 'story') return;
        await switchPacingMode('story');
    });
    container.on('click', '#storymode-mode-scenario', async function () {
        if (getPacingMode() === 'scenario') return;
        await switchPacingMode('scenario');
    });
}

function bindOocEvents(container) {
    container.on('click', '#storymode-ooc-header, .storymode-ooc-toggle', function (e) {
        e.stopPropagation();
        const oocPanel = container.find('.storymode-ooc-panel');
        const isRolledUp = oocPanel.hasClass('sm-ooc-rolled-up');

        if (isRolledUp) {
            oocPanel.removeClass('sm-ooc-rolled-up');
            extension_settings[MODULE_NAME].oocPanelRolledUp = false;
        } else {
            oocPanel.addClass('sm-ooc-rolled-up');
            extension_settings[MODULE_NAME].oocPanelRolledUp = true;
        }

        const icon = container.find('.storymode-ooc-toggle i');
        icon.toggleClass('fa-chevron-down', !isRolledUp);
        icon.toggleClass('fa-chevron-up', isRolledUp);

        saveSettingsDebounced();
    });

    container.on('click', '#storymode-ooc-clear-btn', function () {
        const textarea = container.find('#storymode-ooc-textarea');
        textarea.val('');
        extension_settings[MODULE_NAME].oocText = '';
        saveSettingsDebounced();
        updateStoryPrompt();
    });

    let oocUpdateTimeout = null;
    container.on('input', '#storymode-ooc-textarea', function () {
        extension_settings[MODULE_NAME].oocText = $(this).val();
        saveSettingsDebounced();

        clearTimeout(oocUpdateTimeout);
        oocUpdateTimeout = setTimeout(() => {
            updateStoryPrompt();
        }, 500);
    });
}

/**
 * Switch pacing mode
 * @param {string} newMode - 'story' or 'scenario'
 */
async function switchPacingMode(newMode) {
    setPacingMode(newMode);

    // Refresh UI
    updateControllerPanel();
    if (window.updateWandMenuStatus) window.updateWandMenuStatus();
    if (window.updateStoryPrompt) window.updateStoryPrompt();
}

/**
 * Bind events to the panel elements
 * @param {jQuery} panel - The panel element
 * @param {Object} settings - Extension settings
 */
function bindPanelEvents(panel, settings) {
    bindFloatingHeaderEvents(panel);
    bindFloatingPopupHandlers(panel);
    bindPacingModeHandlers(panel);
    bindOocEvents(panel);
    bindFloatingChromeEvents(panel, settings);
}

function bindFloatingHeaderEvents(panel) {
    panel.find('.storymode-debug-header').on('dblclick', function () {
        const isRolledUp = panel.hasClass('sm-rolled-up');
        if (isRolledUp) {
            panel.removeClass('sm-rolled-up');
            extension_settings[MODULE_NAME].debugPanelRolledUp = false;
        } else {
            panel.addClass('sm-rolled-up');
            extension_settings[MODULE_NAME].debugPanelRolledUp = true;
        }
        saveSettingsDebounced();
    });
}

function bindFloatingPopupHandlers(panel) {
    panel.on('click', '#storymode-debug-scene-link', () => {
        console.log('[Story Mode] Scene link clicked (floating)');
        showDebugDetailPopup('scene');
    });
    panel.on('click', '#storymode-debug-beats-link', () => showDebugDetailPopup('beats'));
    panel.on('click', '#storymode-debug-summary-link', () => showSummaryPopup());
    panel.on('click', '#storymode-debug-characters-link', () => showScenarioCharactersPopup());
    panel.on('click', '#storymode-prompt-inspector', () => showPromptInspector());
    panel.on('click', '#storymode-library-btn', () => openBlueprintLibrary());
    panel.on('click', '#storymode-settings-btn', () => openStoryModeSettings());
    panel.on('click', '#storymode-debug-image-link', handleImageSectionClick);
    panel.on('click', '#storymode-generate-image-btn', handleGenerateImage);
    panel.on('click', '#storymode-open-library-notice', () => openBlueprintLibrary());
    panel.on('click', '#storymode-debug-arc-history-link', () => showArcHistoryPopup());
}

function bindFloatingChromeEvents(panel, settings) {
    if (settings.debugPanelPosition) {
        panel.css({
            top: settings.debugPanelPosition.top,
            bottom: 'auto',
            left: settings.debugPanelPosition.left,
            right: 'auto'
        });
    }

    panel.find('#storymode-debug-close').on('click', () => {
        extension_settings[MODULE_NAME].debugPanelEnabled = false;
        saveSettingsDebounced();
        panel.remove();
        $('#debug_panel_enabled').prop('checked', false);
        if (typeof window.updateWandMenuStatus === 'function') {
            window.updateWandMenuStatus();
        }
    });

    panel.find('#storymode-dock-toggle').on('click', () => toggleDockMode());

    makeDraggable(panel, panel.find('.storymode-debug-header'), 'debugPanelDrag', (rect) => {
        extension_settings[MODULE_NAME].debugPanelPosition = {
            left: rect.left + 'px',
            top: rect.top + 'px'
        };
        saveSettingsDebounced();
    }, '#storymode-debug-close');
}

/**
 * Toggle the panel between docked and floating modes.
 */
function toggleDockMode() {
    const settings = extension_settings[MODULE_NAME];
    settings.debugPanelDocked = !settings.debugPanelDocked;
    saveSettingsDebounced();
    updateControllerPanel();
}

/**
 * Handle click on image section (show preview if clicking outside button).
 * @param {jQuery.Event} e - Click event
 */
function handleImageSectionClick(e) {
    if ($(e.target).closest('#storymode-generate-image-btn').length) {
        return;
    }

    const chatState = getChatStoryState();
    const blueprintState = getBlueprintState();

    if (!blueprintState?.blueprint) {
        if (window.toastr) toastr.info('No active scenario.');
        return;
    }

    const imageSection = $(e.target).closest('#storymode-debug-image-link');
    const showingCover = imageSection.data('showing-cover') === true || imageSection.data('showing-cover') === 'true';

    if (showingCover) {
        ImagePreview.showImagePreviewPopup('cover');
        return;
    }

    const scene = BlueprintModule.getCurrentScene(
        blueprintState.blueprint,
        chatState.currentStep,
        chatState.arcLength,
        blueprintState.sceneMode || 'auto',
        getCurrentSceneIndex()
    );

    if (!scene) {
        if (window.toastr) toastr.info('Current scene not found.');
        return;
    }

    ImagePreview.showImagePreviewPopup(scene.index);
}

/**
 * Handle click on generate/regenerate button.
 * @param {jQuery.Event} e - Click event
 */
async function handleGenerateImage(e) {
    e.stopPropagation();
    const btn = $(e.currentTarget);
    if (btn.prop('disabled')) return;

    const chatState = getChatStoryState();
    const blueprintState = getBlueprintState();

    if (!blueprintState?.blueprint) {
        if (window.toastr) toastr.info('No active scenario.');
        return;
    }

    const scene = BlueprintModule.getCurrentScene(
        blueprintState.blueprint,
        chatState.currentStep,
        chatState.arcLength,
        blueprintState.sceneMode || 'auto',
        getCurrentSceneIndex()
    );

    if (!scene) {
        if (window.toastr) toastr.info('Current scene not found.');
        return;
    }

    const originalHtml = btn.html();
    btn.prop('disabled', true);
    btn.html('<i class="fa-solid fa-circle-notch fa-spin"></i> Generating...');

    try {
        const result = await ImageGenerator.generateSceneImage(scene, blueprintState.blueprint);

        if (result.success) {
            if (window.toastr) toastr.success('Scene image generated successfully');
            updateControllerPanel();
        } else {
            if (window.toastr) toastr.error(`Generation failed: ${result.error}`);
        }
    } catch (error) {
        console.error('[Controller Panel] Image generation error:', error);
        if (window.toastr) toastr.error(`Generation error: ${error.message}`);
    } finally {
        btn.prop('disabled', false);
        btn.html(originalHtml);
    }
}

export {
    bindDockedContentEvents,
    bindPanelEvents,
    switchPacingMode,
    toggleDockMode,
    handleImageSectionClick,
    handleGenerateImage,
    makeDraggable,
};
