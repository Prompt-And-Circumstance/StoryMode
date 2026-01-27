/**
 * Editor Action Handlers Module
 * Handles play button, export, revert, view JSON, and modal closing
 */

import { callGenericPopup, POPUP_TYPE } from '/scripts/popup.js';
import * as BlueprintModule from '../../blueprint/module.js';
import { escapeHtml, cloneBlueprint } from '../../blueprint/utils.js';
import {
    getCurrentBlueprint,
    setCurrentBlueprint,
    getOriginalBlueprint,
    getHasUnsavedChanges,
    setHasUnsavedChanges,
} from './state.js';
import { EVENT_NAMESPACE, SELECTORS } from './event-handlers.js';
import { playBlueprintFromLibrary } from '../../dialog/library-view.js';

// Injected refresh function
let _refreshEditor = null;

/**
 * Set the refresh function (called from main module)
 * @param {Function} refreshFn - The refreshEditor function
 */
export function setRefreshEditor(refreshFn) {
    _refreshEditor = refreshFn;
}

// ============================================================================
// MODAL CONTROL
// ============================================================================

/**
 * Close the blueprint editor modal
 */
function closeEditorModal() {
    $(SELECTORS.EDITOR_CONTAINER).closest('.popup').find(SELECTORS.POPUP_CANCEL).click();
}

/**
 * Close the settings dialog and all popups
 */
function closeSettingsDialog() {
    $('.popup:visible').each(function() {
        const $popup = $(this);
        const $closeBtn = $popup.find('.pop-button-cancel, .pop-button-ok, .popup-close').first();
        if ($closeBtn.length > 0) {
            $closeBtn.trigger('click');
        }
    });
}

// ============================================================================
// POPUP DISPLAYS
// ============================================================================

/**
 * Show warnings popup for story startup
 * @param {Array<string>} warnings - List of warnings to display
 */
async function showWarningsPopup(warnings) {
    const warningHtml = `
        <h3>Story Started with Warnings</h3>
        <ul style="text-align: left;">
            ${warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}
        </ul>
    `;
    await callGenericPopup(warningHtml, POPUP_TYPE.TEXT, null, { wide: true });
}

/**
 * Show error popup for failed story startup
 * @param {string} error - Error message to display
 */
async function showErrorPopup(error) {
    const errorHtml = `<h3>Failed to Start Story</h3><p>${escapeHtml(error)}</p>`;
    await callGenericPopup(errorHtml, POPUP_TYPE.TEXT, null, { wide: true });
}

// ============================================================================
// PLAY BUTTON HANDLING
// ============================================================================

/**
 * Handle play button click - start story from current blueprint
 */
async function handlePlayButtonClick(e) {
    e.preventDefault();

    const blueprint = getCurrentBlueprint();
    const blueprintState = BlueprintModule.getBlueprintState();
    blueprintState.blueprint = blueprint;
    await BlueprintModule.saveBlueprintState(blueprintState);

    closeEditorModal();

    const result = await BlueprintModule.startStoryFromBlueprint(blueprint, { sourceType: 'editor' });

    if (result.success) {
        if (result.warnings?.length > 0) {
            await showWarningsPopup(result.warnings);
        }
        closeSettingsDialog();
    } else {
        await showErrorPopup(result.error);
    }
}

// ============================================================================
// EXPORT HANDLING
// ============================================================================

/**
 * Handle blueprint export
 */
async function handleExportBlueprint() {
    const blueprint = getCurrentBlueprint();
    if (!blueprint) {
        toastr.warning('No blueprint to export');
        return;
    }

    const { exportBlueprintAsPNG } = await import('../../blueprint/export.js');
    const result = await exportBlueprintAsPNG(blueprint);

    if (result.success) {
        toastr.success(`Blueprint exported: ${result.filename}`);
    } else {
        toastr.error(`Export failed: ${result.error}`);
    }
}

// ============================================================================
// REVERT HANDLING
// ============================================================================

/**
 * Revert to original blueprint (discard all changes)
 */
function revertToOriginal() {
    setCurrentBlueprint(cloneBlueprint(getOriginalBlueprint()));
    setHasUnsavedChanges(false);
    if (_refreshEditor) _refreshEditor();
}

/**
 * Handle revert button click
 */
async function handleRevertButton(e) {
    e.preventDefault();

    const confirmed = await callGenericPopup(
        'Revert all changes to the original blueprint?',
        POPUP_TYPE.CONFIRM,
        null,
        { okButton: 'Revert', cancelButton: 'Cancel' }
    );

    if (confirmed) {
        revertToOriginal();
        toastr.info('Changes reverted');
    }
}

// ============================================================================
// DUPLICATE HANDLING
// ============================================================================

/**
 * Handle duplicate button click - create a copy of this blueprint in the library
 */
async function handleDuplicateBlueprint(e) {
    e.preventDefault();

    const blueprint = getCurrentBlueprint();
    if (!blueprint) {
        toastr.warning('No blueprint to duplicate');
        return;
    }

    const title = blueprint.userMetadata?.title || 'Untitled';
    const confirmed = await callGenericPopup(
        `<h3>Duplicate Blueprint</h3>
        <p>Create a copy of "<strong>${escapeHtml(title)}</strong>" in your library?</p>
        <p style="color: var(--SmartThemeQuoteColor); font-size: 0.9em;">
            The copy will have a new ID and "(Copy)" appended to the title.
        </p>`,
        POPUP_TYPE.CONFIRM,
        '',
        { okButton: 'Duplicate', cancelButton: 'Cancel' }
    );

    if (!confirmed) return;

    try {
        const { duplicateBlueprint } = await import('../../blueprint/file-storage.js');
        const newBlueprint = await duplicateBlueprint(blueprint, { titleSuffix: ' (Copy)' });
        const newTitle = newBlueprint.userMetadata?.title || 'Blueprint';

        toastr.success(`Created duplicate: ${newTitle}`);

        const editNew = await callGenericPopup(
            `<h3>Blueprint Duplicated</h3>
            <p>The copy "<strong>${escapeHtml(newTitle)}</strong>" has been saved to your library.</p>
            <p>Would you like to switch to editing the new copy?</p>`,
            POPUP_TYPE.CONFIRM,
            '',
            { okButton: 'Edit New Copy', cancelButton: 'Stay Here' }
        );

        if (editNew) {
            setCurrentBlueprint(cloneBlueprint(newBlueprint));
            setHasUnsavedChanges(false);
            if (_refreshEditor) _refreshEditor();
        }
    } catch (error) {
        console.error('[BlueprintEditor] Failed to duplicate blueprint:', error);
        toastr.error(`Failed to duplicate: ${error.message}`);
    }
}

/**
 * Handle set as current scenario button click - load this blueprint as active scenario
 */
async function handleSetAsCurrentScenario(e) {
    e.preventDefault();

    const blueprint = getCurrentBlueprint();
    if (!blueprint) {
        toastr.warning('No blueprint to load');
        return;
    }

    if (getHasUnsavedChanges()) {
        const confirmDiscard = await callGenericPopup(
            `<h3>Unsaved Changes</h3>
            <p>You have unsaved changes. If you load this blueprint now, your changes will be lost.</p>
            <p>Discard changes and load this blueprint as the current scenario?</p>`,
            POPUP_TYPE.CONFIRM,
            '',
            { okButton: 'Discard & Load', cancelButton: 'Cancel' }
        );
        if (!confirmDiscard) return;
    }

    const editorPopup = $(SELECTORS.EDITOR_CONTAINER).closest('.popup');
    const content = editorPopup.parent().closest('.popup').find('.popup-content').first();

    if (!content.length) {
        toastr.error('Could not find settings dialog');
        return;
    }

    try {
        const { updateStoryPrompt } = await import('../../core/arc-engine.js');
        const { buildBlueprintTabContent } = await import('../../ui/components.js');

        const callbacks = {
            refreshBlueprintPreview: () => content.find('#tab_blueprint').html(buildBlueprintTabContent()),
            updateStatusDisplay: () => {
                if (window.updateStatusDisplay) window.updateStatusDisplay();
                updateStoryPrompt();
            },
            switchToTab: (c, tabName) => {
                const $tab = c.find(`.storymode-tab[data-tab="${tabName}"]`);
                if ($tab.hasClass('disabled')) {
                    $tab.removeClass('disabled').attr('title', 'View and manage the current scenario');
                }
                $tab.trigger('click');
            }
        };

        await playBlueprintFromLibrary(content, blueprint.blueprint_id, callbacks);

        setHasUnsavedChanges(false);
        closeEditorModal();
    } catch (error) {
        console.error('[BlueprintEditor] Failed to set as current scenario:', error);
        toastr.error(`Failed to load scenario: ${error.message}`);
    }
}

// ============================================================================
// VIEW JSON HANDLING
// ============================================================================

/**
 * Copy text to clipboard with fallback strategies
 */
async function copyToClipboard(text, textarea) {
    textarea.select();

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            toastr.success('JSON copied to clipboard');
        } else if (document.execCommand('copy')) {
            toastr.success('JSON copied to clipboard');
        } else {
            toastr.warning('Please copy manually (Ctrl+C / Cmd+C)');
        }
    } catch (err) {
        console.error('[BlueprintEditor] Failed to copy JSON:', err);
        toastr.warning('Auto-copy failed. Content is selected - press Ctrl+C (Cmd+C) to copy');
    }
}

/**
 * Handle view JSON button click
 */
async function handleViewJson(e) {
    e.preventDefault();

    const blueprint = getCurrentBlueprint();
    if (!blueprint) {
        toastr.warning('No blueprint to display');
        return;
    }

    const jsonString = JSON.stringify(blueprint, null, 2);

    const jsonHtml = `
        <h3>Blueprint JSON</h3>
        <div style="margin: 16px 0;">
            <textarea id="blueprint_json_textarea" readonly style="width: 100%; height: 400px; font-family: monospace; font-size: 11px; white-space: pre; overflow: auto;">${escapeHtml(jsonString)}</textarea>
        </div>
        <div style="margin: 12px 0;">
            <button id="blueprint_json_copy_btn" class="menu_button">
                <i class="fa-solid fa-copy"></i> Copy to Clipboard
            </button>
        </div>
        <p style="color: var(--SmartThemeEmColor); font-size: 0.9em;">
            Click the button above to copy, or select text and copy manually.
        </p>
    `;

    $(document).one('click', '#blueprint_json_copy_btn', async function() {
        const textarea = document.getElementById('blueprint_json_textarea');
        if (textarea) await copyToClipboard(jsonString, textarea);
    });

    await callGenericPopup(jsonHtml, POPUP_TYPE.TEXT, '', {
        wide: true,
        large: true,
        okButton: 'Close'
    });
}

// ============================================================================
// EVENT SETUP
// ============================================================================

/**
 * Setup editor action handlers (play button, export, revert, view JSON, duplicate)
 */
export function setupEditorActionHandlers() {
    $(document).on('click' + EVENT_NAMESPACE, SELECTORS.PLAY_BUTTON, handlePlayButtonClick);

    $(document).on('click' + EVENT_NAMESPACE, '#blueprint_set_as_current_btn', handleSetAsCurrentScenario);

    $(document).on('click' + EVENT_NAMESPACE, '#blueprint_export_btn', async function (e) {
        e.preventDefault();
        await handleExportBlueprint();
    });

    $(document).on('click' + EVENT_NAMESPACE, '#blueprint_revert_btn', handleRevertButton);

    $(document).on('click' + EVENT_NAMESPACE, '#blueprint_view_json_btn', handleViewJson);

    $(document).on('click' + EVENT_NAMESPACE, '#blueprint_duplicate_btn', handleDuplicateBlueprint);

    // Info toggle handler - shows/hides left panel
    $(document).on('click' + EVENT_NAMESPACE, '.storymode-info-toggle', function(e) {
        e.preventDefault();
        const leftPanel = $('.storymode-editor-left-panel');
        const toggle = $(this);
        leftPanel.toggleClass('collapsed');
        toggle.toggleClass('active', !leftPanel.hasClass('collapsed'));
    });
}
