/**
 * Settings Dialog Event Handlers
 * Handles all event bindings for the unified settings dialog
 */

import { saveSettingsDebounced, characters, this_chid } from '/script.js';
import { groups, selected_group } from '/scripts/group-chats.js';
import { extension_settings } from '/scripts/extensions.js';
import { POPUP_RESULT } from '/scripts/popup.js';

import { updateControllerPanel } from '../ui/controller-panel.js';
import {
    MODULE_NAME,
    getChatStoryState,
    saveChatStoryState,
} from '../core/state-manager.js';
import { updateStoryPrompt } from '../core/arc-engine.js';
import {
    showStoryTypesEditor,
    showAuthorStylesEditor,
} from '../editor/type-editors.js';
import {
    showLibraryGenerateView,
    showLibraryGridView,
} from '../ui/components.js';
import {
    refreshLibraryView,
    loadBlueprintsForFolder,
    refreshSidebar,
} from './library-view.js';
import { initPickerInteractions, initLibrarySearch } from '../ui/components/character-picker.js';

import { setupPacingEvents } from './settings-pacing.js';
import { setupBlueprintEvents } from './settings-blueprint.js';
import { setupLibraryEvents } from './settings-library.js';

/**
 * Helper function to update blueprint setting and refresh UI
 * @param {string} key - Setting key
 * @param {any} value - Setting value
 */
export function updateBlueprintSetting(key, value) {
    if (!extension_settings[MODULE_NAME].blueprintSettings) {
        extension_settings[MODULE_NAME].blueprintSettings = {};
    }
    extension_settings[MODULE_NAME].blueprintSettings[key] = value;
    saveSettingsDebounced();
    toastr.success('Settings saved');
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
 * @param {Function} context.refreshBlueprintPreview - Refresh blueprint preview callback
 * @param {Function} context.setupEventListeners - Setup event listeners callback
 * @param {Function} context.populateConnectionProfiles - Populate connection profiles callback
 */
export function setupUnifiedDialogEventListeners(content, context) {
    const { updateStatusDisplay, refreshBlueprintPreview } = context;

    // Create library callbacks object
    const libraryCallbacks = {
        refreshBlueprintPreview,
        updateStatusDisplay,
        showLibraryGridView,
        loadBlueprintsForFolder: (c, folderId) => loadBlueprintsForFolder(c, folderId, libraryCallbacks),
        refreshLibraryView: (c) => refreshLibraryView(c, libraryCallbacks),
        switchToTab: (c, tabName) => {
            const $tab = c.find(`.storymode-tab[data-tab="${tabName}"]`);
            if ($tab.hasClass('disabled')) {
                $tab.removeClass('disabled');
                $tab.attr('title', 'View and manage the current scenario');
            }
            c.find('.storymode-tab').removeClass('active');
            $tab.addClass('active');
            c.find('.storymode-tab-pane').removeClass('active');
            c.find(`#tab_${tabName}`).addClass('active');
        },
    };

    initPickerInteractions();
    initLibrarySearch();

    // Delegate to extracted setup modules
    const fullContext = { ...context, libraryCallbacks };
    setupPacingEvents(content, fullContext);
    setupBlueprintEvents(content, fullContext);
    setupLibraryEvents(content, fullContext);

    // Inline handlers for this module
    bindGenericApiHandler(content);
    bindFeatureToggles(content);
    bindStoryTypeAndArcLength(content, context);
    bindAuthorStyles(content, context);
    bindCharacterGroupStyles(content, updateStatusDisplay);
    bindSimpleToggles(content);
    bindControllerAndInjection(content);
    bindCloseButton(content);

    // Edit buttons (use event delegation for dynamically rendered tab content)
    content.on('click', '#edit_story_types_btn', showStoryTypesEditor);
    content.on('click', '#edit_author_styles_btn', showAuthorStylesEditor);
}

function bindGenericApiHandler(content) {
    content.on('change', '.storymode-api-select[data-setting-path]', function() {
        const $select = $(this);
        const settingPath = $select.data('setting-path');
        const value = $select.val() || '';
        const parts = settingPath.split('.');
        let target = extension_settings[MODULE_NAME];
        for (let i = 0; i < parts.length - 1; i++) {
            target[parts[i]] = target[parts[i]] || {};
            target = target[parts[i]];
        }
        target[parts[parts.length - 1]] = value;
        saveSettingsDebounced();
        toastr.success('Settings saved');
    });
}

function bindFeatureToggles(content) {
    function createFeatureToggleHandler(featureKey, controlsSelector, label) {
        return function() {
            const enabled = $(this).prop('checked');
            extension_settings[MODULE_NAME][featureKey] = enabled;
            saveSettingsDebounced();
            const controls = content.find(controlsSelector);
            enabled ? controls.slideDown(200) : controls.slideUp(200);
            updateStoryPrompt();
            if (toastr) toastr.info(`${label} ${enabled ? 'enabled' : 'disabled'}`);
            if (window.updateStatusDisplay) window.updateStatusDisplay();
            updateControllerPanel();
        };
    }

    content.on('change', '#story_type_enabled',
        createFeatureToggleHandler('storyTypeEnabled', '#story_type_controls', 'Story Type'));
    content.on('change', '#story_arc_enabled',
        createFeatureToggleHandler('storyArcEnabled', '#story_arc_controls', 'Story Arc'));
}

function bindStoryTypeAndArcLength(content, context) {
    const { storyTypes, updateStatusDisplay } = context;

    content.find('#story_type_select').on('change', async function () {
        const selectedType = $(this).val();
        extension_settings[MODULE_NAME].selectedStoryType = selectedType;
        saveSettingsDebounced();
        toastr.success('Settings saved');
        const chatState = getChatStoryState();
        chatState.selectedStoryType = selectedType;
        await saveChatStoryState(chatState);
        const selectedStoryType = storyTypes.find(t => t.id === selectedType);
        const description = selectedStoryType ? selectedStoryType.storyPrompt : 'Select a story type to see its description';
        content.find('#story_type_description').text(description);
        content.find('#blueprint_story_type').val(selectedType);
        updateStoryPrompt();
        updateStatusDisplay();
        refreshSidebar(content);
    });

    const updateArcLength = async function (value) {
        const clampedValue = Math.max(5, Math.min(150, parseInt(value)));
        extension_settings[MODULE_NAME].arcLength = clampedValue;
        content.find('#arc_length_slider').val(clampedValue);
        content.find('#arc_length_value').val(clampedValue);
        saveSettingsDebounced();
        toastr.success('Settings saved');
        const chatState = getChatStoryState();
        chatState.arcLength = clampedValue;
        await saveChatStoryState(chatState);
        updateStatusDisplay();
    };
    content.find('#arc_length_slider').on('input', async function () {
        await updateArcLength($(this).val());
    });
    content.find('#arc_length_value').on('change', async function () {
        await updateArcLength($(this).val());
    });
}

function bindAuthorStyles(content, context) {
    const { authorStyles, updateStatusDisplay } = context;

    content.find('#author_style_enabled').on('change', function () {
        const enabled = $(this).is(':checked');
        extension_settings[MODULE_NAME].authorStyleEnabled = enabled;
        content.find('#author_style_controls').toggle(enabled);
        saveSettingsDebounced();
        toastr.success('Settings saved');
        updateStoryPrompt();
    });

    content.find('#default_author_style_select').on('change', function () {
        const selectedStyle = $(this).val();
        extension_settings[MODULE_NAME].defaultAuthorStyle = selectedStyle;
        saveSettingsDebounced();
        toastr.success('Settings saved');
    });

    content.find('#author_style_select').on('change', async function () {
        const selectedStyle = $(this).val();
        const chatState = getChatStoryState();
        chatState.selectedAuthorStyle = selectedStyle;
        await saveChatStoryState(chatState);
        const selectedAuthorStyle = authorStyles.find(s => s.id === selectedStyle);
        const description = selectedAuthorStyle ? selectedAuthorStyle.authorPrompt : 'Select an author style to see its guidance';
        content.find('#author_style_description').text(description);
        content.find('#blueprint_author_style').val(selectedStyle);
        updateStoryPrompt();
        updateStatusDisplay();
        refreshSidebar(content);
    });
}

function bindCharacterGroupStyles(content, updateStatusDisplay) {
    content.find('#character_author_style_select').on('change', function () {
        // Just update the dropdown value, don't save yet
    });
    content.find('#save_character_author_style_btn').on('click', async function () {
        await saveCharacterAuthorStyle(content, updateStatusDisplay);
    });
    content.on('change', '#group_author_style_select', function () {
        // Just update the dropdown value, don't save yet
    });
    content.on('click', '#save_group_author_style_btn', async function () {
        await saveGroupAuthorStyle(content, updateStatusDisplay);
    });
}

function bindControllerAndInjection(content) {
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
        toastr.success('Settings saved');
        updateControllerPanel();
    });

    content.find('#injection_position').on('change', function () {
        extension_settings[MODULE_NAME].position = parseInt($(this).val());
        saveSettingsDebounced();
        toastr.success('Settings saved');
        updateStoryPrompt();
    });
    content.find('#injection_depth').on('change', function () {
        extension_settings[MODULE_NAME].depth = parseInt($(this).val());
        saveSettingsDebounced();
        toastr.success('Settings saved');
        updateStoryPrompt();
    });
    content.find('#injection_role').on('change', function () {
        extension_settings[MODULE_NAME].role = parseInt($(this).val());
        saveSettingsDebounced();
        toastr.success('Settings saved');
        updateStoryPrompt();
    });
}

async function saveCharacterAuthorStyle(content, updateStatusDisplay) {
    if (this_chid === undefined || !characters?.[this_chid]) {
        toastr.error('No character selected');
        return;
    }

    const selectedStyle = content.find('#character_author_style_select').val();
    const char = characters[this_chid];

    if (!char.data) char.data = {};
    if (!char.data.extensions) char.data.extensions = {};
    if (!char.data.extensions.story_mode) char.data.extensions.story_mode = {};
    char.data.extensions.story_mode.authorStyle = selectedStyle || '';

    try {
        const { getRequestHeaders } = await import('/script.js');
        const saveDataRequest = {
            avatar: char.avatar,
            data: {
                extensions: {
                    story_mode: { authorStyle: selectedStyle || '' },
                },
            },
        };
        const mergeResponse = await fetch('/api/characters/merge-attributes', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(saveDataRequest),
        });
        if (!mergeResponse.ok) {
            throw new Error(`Server returned ${mergeResponse.status}`);
        }
        toastr.success(`Author style saved to ${char.name}`);
        updateStoryPrompt();
        updateStatusDisplay();
        if (window.updateControllerPanel) window.updateControllerPanel();
    } catch (error) {
        toastr.error('Failed to save character');
        console.error('[Story Mode] Failed to save character author style:', error);
    }
}

async function saveGroupAuthorStyle(content, updateStatusDisplay) {
    if (selected_group === null) {
        toastr.error('No group selected');
        return;
    }

    const selectedStyle = content.find('#group_author_style_select').val();
    const group = groups?.find(g => g.id === selected_group);

    if (!extension_settings[MODULE_NAME].groupAuthorStyles) {
        extension_settings[MODULE_NAME].groupAuthorStyles = {};
    }
    extension_settings[MODULE_NAME].groupAuthorStyles[selected_group] = selectedStyle || '';

    try {
        saveSettingsDebounced();
        toastr.success(`Author style saved to group: ${group?.name || 'Group'}`);
        updateStoryPrompt();
        updateStatusDisplay();
        if (window.updateControllerPanel) window.updateControllerPanel();
    } catch (error) {
        toastr.error('Failed to save group author style');
        console.error('[Story Mode] Failed to save group author style:', error);
    }
}

function bindSimpleToggles(content) {
    content.find('#nsfw_enabled').on('change', function () {
        extension_settings[MODULE_NAME].nsfwEnabled = $(this).is(':checked');
        saveSettingsDebounced();
        toastr.success('Settings saved');
        updateStoryPrompt();
    });
    content.find('#epilogue_enabled').on('change', function () {
        extension_settings[MODULE_NAME].epilogueEnabled = $(this).is(':checked');
        saveSettingsDebounced();
        toastr.success('Settings saved');
    });
    content.find('#summary_enabled').on('change', function () {
        extension_settings[MODULE_NAME].summaryEnabled = $(this).is(':checked');
        saveSettingsDebounced();
        toastr.success('Settings saved');
    });
    content.find('#next_adventure_enabled').on('change', function () {
        extension_settings[MODULE_NAME].nextAdventureEnabled = $(this).is(':checked');
        saveSettingsDebounced();
        toastr.success('Settings saved');
    });
    content.find('#summary_message_count_slider').on('input', function () {
        const value = parseInt($(this).val());
        extension_settings[MODULE_NAME].summaryMessageCount = value;
        content.find('#summary_message_count_value').text(value === 0 ? 'All' : value);
        saveSettingsDebounced();
        toastr.success('Settings saved');
    });
    content.find('#debug_mode_enabled').on('change', function () {
        extension_settings[MODULE_NAME].debugMode = $(this).is(':checked');
        saveSettingsDebounced();
        toastr.success('Settings saved');
        updateStoryPrompt();
    });
}

/**
 * Bind the global modal close button handler
 * This is separate from tab-specific handlers because the close button
 * should work regardless of which tab is currently active.
 * @param {jQuery} content - The settings dialog content element
 */
function bindCloseButton(content) {
    content.on('click', '#storymode_settings_close_btn', function () {
        const popup = window.storyModeSettingsPopup;
        if (popup) {
            popup.complete(POPUP_RESULT.AFFIRMATIVE);
        }
    });
}
