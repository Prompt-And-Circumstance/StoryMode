/**
 * Wand Menu Module for Story Mode Extension
 * Handles the extensions menu dropdown for quick story arc controls
 */

import {
    saveSettingsDebounced,
    animation_duration,
} from '/script.js';
import {
    extension_settings,
} from '/scripts/extensions.js';
import { Popper } from '/lib.js';

import {
    MODULE_NAME,
    getChatStoryState,
    saveChatStoryState,
    getStoryTypes,
    getAuthorStyles,
    getPacingMode,
    getCurrentSceneIndex,
} from '../core/state-manager.js';

import * as BlueprintModule from '../blueprint/module.js';

import {
    getPhaseInfo,
    updateStoryPrompt,
} from '../core/arc-engine.js';

import {
    generateEpilogueForStory,
    summarizeChatMainForStory,
    generateNextAdventureForStory,
    formatNextAdventureMessage,
    pushStoryMessage,
} from '../core/event-handlers.js';


/**
 * Get the current status text for the wand menu
 *
 * @returns {string} Status text with round, phase, and story type info
 */
export function getWandMenuStatusText() {
    const settings = extension_settings[MODULE_NAME];
    const chatState = getChatStoryState();

    if (!settings.enabled) {
        return 'Story Mode: Disabled';
    }

    // Get story types and author styles from state manager
    const storyTypes = getStoryTypes();
    const authorStyles = getAuthorStyles();

    const storyName = settings.storyArcEnabled && chatState.selectedStoryType
        ? storyTypes.find(t => t.id === chatState.selectedStoryType)?.name || 'None'
        : 'None';

    const authorName = settings.authorStyleEnabled && chatState.selectedAuthorStyle
        ? authorStyles.find(s => s.id === chatState.selectedAuthorStyle)?.name || ''
        : '';

    let status = '';
    const pacingMode = getPacingMode();

    if (pacingMode === 'scenario') {
        const blueprintState = BlueprintModule.getBlueprintState();
        const currentScene = getCurrentSceneIndex() + 1;
        const totalScenes = blueprintState.blueprint?.scene_plan?.length || '?';
        status = `Scene: ${currentScene}/${totalScenes}`;
    } else {
        status = `Round: ${chatState.currentStep}/${chatState.arcLength}`;
    }
    if (storyName !== 'None') {
        status += `\nStory: ${storyName}`;
    }
    if (authorName) {
        status += `\nAuthor: ${authorName}`;
    }

    return status;
}

/**
 * Update the status display in the wand menu dropdown
 *
 * @returns {void}
 */
export function updateWandMenuStatus() {
    const statusEl = $('#story_mode_dropdown_status');
    if (statusEl.length > 0) {
        const statusText = getWandMenuStatusText();
        // Convert newlines to <br> for HTML display
        statusEl.html(statusText.replace(/\n/g, '<br>'));
    }

    // Update controller toggle text based on panel visibility
    const settings = extension_settings[MODULE_NAME];
    const isControllerVisible = settings.debugPanelEnabled === true;
    const controllerText = $('#wand_controller_text');
    const controllerIcon = $('#wand_toggle_controller i');

    if (controllerText.length > 0) {
        controllerText.text(isControllerVisible ? 'Hide Controller' : 'Show Controller');
    }
    if (controllerIcon.length > 0) {
        controllerIcon.removeClass('fa-eye fa-eye-slash');
        controllerIcon.addClass(isControllerVisible ? 'fa-eye-slash' : 'fa-eye');
    }

    // Also update the dropdown content visibility based on enabled state
    updateDropdownContent();
}

/**
 * Update dropdown content based on enabled state
 * Shows/hides buttons based on whether Story Mode is enabled
 *
 * @returns {void}
 */
export function updateDropdownContent() {
    const settings = extension_settings[MODULE_NAME];
    const chatState = getChatStoryState();
    const isEnabled = settings.enabled;
    const hasStoryType = settings.storyArcEnabled && chatState.selectedStoryType;
    const dropdown = $('#story_mode_dropdown');

    if (dropdown.length === 0) return;

    // Show/hide status section
    dropdown.find('#story_mode_dropdown_status').toggle(isEnabled);

    // Show/hide arc control buttons (only show when enabled AND story type is selected)
    dropdown.find('#wand_step_forward').toggle(isEnabled && hasStoryType);
    dropdown.find('#wand_step_back').toggle(isEnabled && hasStoryType);
    dropdown.find('#wand_reset_arc').toggle(isEnabled && hasStoryType);
    dropdown.find('#wand_generate_epilogue').toggle(isEnabled);
    dropdown.find('#wand_generate_summary').toggle(isEnabled);
    dropdown.find('#wand_generate_next_adventure').toggle(isEnabled);

    // Show/hide dividers based on visible buttons
    const arcControlsVisible = isEnabled && hasStoryType;
    const generationVisible = isEnabled;
    dropdown.find('.wand-menu-divider').eq(0).toggle(arcControlsVisible && generationVisible);
    dropdown.find('.wand-menu-divider').eq(1).toggle(generationVisible);

    // Show/hide enable button (only show when disabled)
    const enableBtn = dropdown.find('#wand_enable');
    const disableBtn = dropdown.find('#wand_disable');

    if (!isEnabled) {
        // Show enable button, hide disable button
        if (enableBtn.length === 0) {
            // Create enable button if it doesn't exist
            dropdown.find('.list-group').append(`
                <li class="list-group-item" id="wand_enable" title="Enable Story Mode">
                    <i class="fa-solid fa-power-off"></i> Enable Story Mode
                </li>
            `);

            // Set up click handler for the new enable button
            dropdown.find('#wand_enable').on('click', async function () {
                await enableStoryMode();
            });
        } else {
            enableBtn.show();
        }
        disableBtn.hide();
    } else {
        // Hide enable button, show disable button
        enableBtn.hide();
        disableBtn.show();
    }
}

/**
 * Manually increment the story step by 1
 *
 * @async
 * @returns {Promise<void>}
 */
export async function incrementStoryStep() {
    const chatState = getChatStoryState();
    chatState.currentStep++;
    await saveChatStoryState(chatState);

    updateStoryPrompt();

    // Update displays (access global functions)
    if (typeof window.updateStatusDisplay === 'function') {
        window.updateStatusDisplay();
    }
    updateWandMenuStatus();

    toastr.info(`Step advanced to ${chatState.currentStep}/${chatState.arcLength}`);
}

/**
 * Manually decrement the story step by 1
 *
 * @async
 * @returns {Promise<void>}
 */
export async function decrementStoryStep() {
    const chatState = getChatStoryState();

    if (chatState.currentStep <= 0) {
        toastr.warning('Already at step 0');
        return;
    }

    chatState.currentStep--;
    await saveChatStoryState(chatState);

    updateStoryPrompt();

    // Update displays (access global functions)
    if (typeof window.updateStatusDisplay === 'function') {
        //   window.updateStatusDisplay();
    }
    updateWandMenuStatus();

    toastr.info(`Step moved back to ${chatState.currentStep}/${chatState.arcLength}`);
}

/**
 * Reset the story arc to step 0
 *
 * @async
 * @returns {Promise<void>}
 */
export async function resetStoryArc() {
    const chatState = getChatStoryState();
    chatState.currentStep = 0;
    chatState.arcStarted = false;
    chatState.epilogueShown = false;
    chatState.summaryShown = false;
    chatState.endNoticeShown = false;
    await saveChatStoryState(chatState);

    updateStoryPrompt();

    // Update displays (access global functions)
    if (typeof window.updateStatusDisplay === 'function') {
        window.updateStatusDisplay();
    }
    updateWandMenuStatus();

    toastr.success('Story arc reset to round 0');
}

/**
 * Disable Story Mode for the current chat
 *
 * @async
 * @returns {Promise<void>}
 */
export async function disableStoryMode() {
    extension_settings[MODULE_NAME].enabled = false;
    saveSettingsDebounced();

    // Update the main panel toggle
    $('#story_mode_enabled').prop('checked', false);

    updateStoryPrompt();

    // Update displays (access global functions)
    if (typeof window.updateStatusDisplay === 'function') {
        window.updateStatusDisplay();
    }
    updateWandMenuStatus();

    // Close the dropdown
    $('#story_mode_dropdown').fadeOut(animation_duration);

    toastr.info('Story Mode disabled');
}

/**
 * Enable Story Mode for the current chat
 *
 * @async
 * @returns {Promise<void>}
 */
export async function enableStoryMode() {
    extension_settings[MODULE_NAME].enabled = true;
    saveSettingsDebounced();

    // Update the main panel toggle
    $('#story_mode_enabled').prop('checked', true);

    updateStoryPrompt();

    // Update displays (access global functions)
    if (typeof window.updateStatusDisplay === 'function') {
        window.updateStatusDisplay();
    }
    updateWandMenuStatus();

    // Close the dropdown
    $('#story_mode_dropdown').fadeOut(animation_duration);

    toastr.success('Story Mode enabled');
}

/**
 * Toggle the Story Controller panel visibility
 * Shows the panel if hidden, hides it if visible
 *
 * @returns {void}
 */
export function toggleController() {
    const settings = extension_settings[MODULE_NAME];

    // Toggle the debugPanelEnabled setting
    settings.debugPanelEnabled = !settings.debugPanelEnabled;
    saveSettingsDebounced();

    // Update the controller panel
    if (typeof window.updateControllerPanel === 'function') {
        window.updateControllerPanel();
    }

    // Show feedback
    if (settings.debugPanelEnabled) {
        toastr.info('Controller panel shown');
    } else {
        toastr.info('Controller panel hidden');
    }
}

/**
 * Check if user confirms regeneration
 */
function confirmRegeneration(taskName, shownFlag) {
    if (!shownFlag) return true;
    const messages = {
        epilogue: 'An epilogue has already been generated for this arc. Generate another?',
        summary: 'A summary has already been generated for this arc. Generate another?',
        nextAdventure: 'Next adventure options have already been generated. Generate new options?'
    };
    return confirm(messages[taskName] || 'Already generated. Generate again?');
}

/**
 * Validate generation result
 */
function validateResult(result, taskName) {
    if (taskName === 'nextAdventure') {
        return result && result.scenarios?.length > 0;
    }
    return result && result.trim();
}

/**
 * Save generated content to chat state
 */
function saveGeneratedContent(chatState, taskName, result) {
    const timestamp = new Date().toISOString();

    if (taskName === 'summary') {
        chatState.savedSummary = { text: result, timestamp };
    } else if (taskName === 'nextAdventure') {
        chatState.savedNextAdventure = {
            themes: result.themes || [],
            scenarios: result.scenarios,
            timestamp
        };
    }
}

/**
 * Generate content (epilogue, summary, or next adventure) with unified error handling
 */
async function generateContent(taskName, generatorFn, chatState, stateKey, formatFn = null) {
    if (!confirmRegeneration(taskName, chatState[stateKey])) return;

    try {
        const result = await generatorFn();

        if (!validateResult(result, taskName)) {
            toastr.error(`Failed to generate ${taskName}: No content generated`, 'Story Mode');
            return;
        }

        saveGeneratedContent(chatState, taskName, result);

        const messageText = formatFn ? formatFn(result) : result;
        await pushStoryMessage(messageText);

        chatState[stateKey] = true;
        await saveChatStoryState(chatState);

        toastr.success(`${taskName.charAt(0).toUpperCase() + taskName.slice(1)} generated successfully!`, 'Story Mode');
    } catch (error) {
        console.error(`[Story Mode] Error generating ${taskName}:`, error);
        toastr.error(`Failed to generate ${taskName}: ${error.message}`, 'Story Mode');
    }
}

/**
 * Generate an epilogue for the current chat
 */
export async function generateEpilogue() {
    const chatState = getChatStoryState();
    await generateContent('epilogue', generateEpilogueForStory, chatState, 'epilogueShown');
}

/**
 * Generate a summary of the current chat
 */
export async function generateSummary() {
    const chatState = getChatStoryState();
    await generateContent('summary', summarizeChatMainForStory, chatState, 'summaryShown');
}

/**
 * Generate next adventure options for the current chat
 */
export async function generateNextAdventure() {
    const chatState = getChatStoryState();
    await generateContent('nextAdventure', generateNextAdventureForStory, chatState, 'nextAdventureShown', formatNextAdventureMessage);
}

/**
 * Create and register the wand menu button and dropdown
 * Adds a Story Mode button to the extensions menu with quick controls
 *
 * @async
 * @returns {Promise<void>}
 */
export async function registerWandMenuEntry() {
    const $menu = $('#extensionsMenu');
    if ($menu.length === 0) {
        console.warn('[Story Mode] Extensions menu not found');
        return;
    }

    // Don't add if already exists
    if ($('#story_mode_wand_button').length > 0) {
        return;
    }

    // Create the button HTML
    const buttonHtml = `
        <div id="story_mode_wand_button" class="list-group-item flex-container flexGap5 interactable" title="Quick controls for Story Mode">
            <i class="fa-solid fa-book-open"></i>
            <span>Story Mode</span>
        </div>
    `;

    // Create the dropdown HTML with grouped sections
    const dropdownHtml = `
        <div id="story_mode_dropdown">
            <ul class="list-group">
                <span id="story_mode_dropdown_status" title="Current round, story type, and author style">Loading...</span>

                <!-- Arc Controls Group -->
                <li class="list-group-item" id="wand_step_forward" title="Manually advance one round (use after editing the chat)">
                    <i class="fa-solid fa-forward"></i> Go Forward One Round
                </li>
                <li class="list-group-item" id="wand_step_back" title="Manually go back one round">
                    <i class="fa-solid fa-backward"></i> Go Back One Round
                </li>
                <li class="list-group-item" id="wand_reset_arc" title="Restart the story arc from the beginning">
                    <i class="fa-solid fa-rotate-left"></i> Reset Arc
                </li>

                <hr class="wand-menu-divider">

                <!-- Generation Commands Group -->
                <li class="list-group-item" id="wand_generate_epilogue" title="Create an ending narrative for the current arc">
                    <i class="fa-solid fa-scroll"></i> Generate Epilogue
                </li>
                <li class="list-group-item" id="wand_generate_summary" title="Generate a summary of the story so far">
                    <i class="fa-solid fa-file-lines"></i> Generate Summary
                </li>
                <li class="list-group-item" id="wand_generate_next_adventure" title="Generate scenario options for continuing the story">
                    <i class="fa-solid fa-route"></i> Generate Next Adventure
                </li>

                <hr class="wand-menu-divider">

                <!-- Settings Group -->
                <li class="list-group-item" id="wand_toggle_controller" title="Show or hide the Story Controller panel">
                    <i class="fa-solid fa-eye"></i> <span id="wand_controller_text">Show Controller</span>
                </li>
                <li class="list-group-item" id="wand_library" title="Browse your blueprint library">
                    <i class="fa-solid fa-book"></i> Browse Library
                </li>
                <li class="list-group-item" id="wand_settings" title="Open full settings dialog">
                    <i class="fa-solid fa-gear"></i> Open Settings
                </li>
                <li class="list-group-item" id="wand_disable" title="Completely disable Story Mode">
                    <i class="fa-solid fa-power-off"></i> Disable Story Mode Entirely
                </li>
            </ul>
        </div>
    `;

    // Add button to extensions menu
    $menu.append(buttonHtml);

    // Add dropdown to body (hidden by default)
    $(dropdownHtml).appendTo('body').hide();

    const button = $('#story_mode_wand_button');
    const dropdown = $('#story_mode_dropdown');

    // Create Popper instance for positioning
    let popper = Popper.createPopper(button.get(0), dropdown.get(0), {
        placement: 'top',
    });

    // Toggle dropdown on button click
    button.on('click', function (e) {
        e.preventDefault();
        e.stopPropagation();

        if (dropdown.is(':visible')) {
            dropdown.fadeOut(animation_duration);
        } else {
            // Update status before showing
            updateWandMenuStatus();
            dropdown.fadeIn(animation_duration);
            popper.update();
        }
    });

    // Close dropdown when clicking outside
    $(document).on('click touchend', function (e) {
        const target = $(e.target);
        if (target.is(dropdown) || target.closest(dropdown).length) return;
        if (target.is(button) || target.closest(button).length) return;
        dropdown.fadeOut(animation_duration);
    });

    // Set up action button handlers
    dropdown.find('#wand_step_forward').on('click', async function () {
        await incrementStoryStep();
        updateWandMenuStatus();
        dropdown.fadeOut(animation_duration);
    });

    dropdown.find('#wand_step_back').on('click', async function () {
        await decrementStoryStep();
        updateWandMenuStatus();
        dropdown.fadeOut(animation_duration);
    });

    dropdown.find('#wand_reset_arc').on('click', async function () {
        if (confirm('Reset the story arc to step 0?')) {
            await resetStoryArc();
            updateWandMenuStatus();
        }
        dropdown.fadeOut(animation_duration);
    });

    dropdown.find('#wand_generate_epilogue').on('click', async function () {
        await generateEpilogue();
        updateWandMenuStatus();
        dropdown.fadeOut(animation_duration);
    });

    dropdown.find('#wand_generate_summary').on('click', async function () {
        await generateSummary();
        updateWandMenuStatus();
        dropdown.fadeOut(animation_duration);
    });

    dropdown.find('#wand_generate_next_adventure').on('click', async function () {
        await generateNextAdventure();
        updateWandMenuStatus();
        dropdown.fadeOut(animation_duration);
    });

    dropdown.find('#wand_disable').on('click', async function () {
        await disableStoryMode();
    });

    dropdown.find('#wand_settings').on('click', async function () {
        if (typeof window.showStoryModeSettings === 'function') {
            await window.showStoryModeSettings();
        }
        dropdown.fadeOut(animation_duration);
    });

    dropdown.find('#wand_library').on('click', async function () {
        if (typeof window.showStoryModeSettings === 'function') {
            await window.showStoryModeSettings('library');
        }
        dropdown.fadeOut(animation_duration);
    });

    dropdown.find('#wand_toggle_controller').on('click', function () {
        toggleController();
        updateWandMenuStatus();
        dropdown.fadeOut(animation_duration);
    });

}
