/**
 * Editor Action Handlers Module
 * Handles play button, export, revert, view JSON, and modal closing
 */

import { callGenericPopup, POPUP_TYPE } from '/scripts/popup.js';
import * as BlueprintModule from '../../blueprint/module.js';
import { escapeHtml } from '../../blueprint/utils.js';
import {
    getCurrentBlueprint,
    setCurrentBlueprint,
    getOriginalBlueprint,
    setHasUnsavedChanges,
} from './state.js';
import { EVENT_NAMESPACE, SELECTORS } from './event-handlers.js';

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
 * Save current blueprint state before starting story
 */
async function saveBlueprintBeforePlay() {
    const blueprintState = BlueprintModule.getBlueprintState();
    blueprintState.blueprint = getCurrentBlueprint();
    await BlueprintModule.saveBlueprintState(blueprintState);
}

/**
 * Handle play button click - start story from current blueprint
 */
async function handlePlayButtonClick(e) {
    e.preventDefault();

    await saveBlueprintBeforePlay();
    closeEditorModal();

    const result = await BlueprintModule.startStoryFromBlueprint(getCurrentBlueprint(), { sourceType: 'editor' });

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
    if (!getCurrentBlueprint()) {
        toastr.warning('No blueprint to export');
        return;
    }

    const { exportBlueprintAsPNG } = await import('../blueprint/export.js');

    const result = await exportBlueprintAsPNG(getCurrentBlueprint());

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
    try {
        setCurrentBlueprint(structuredClone(getOriginalBlueprint()));
    } catch (e) {
        setCurrentBlueprint(JSON.parse(JSON.stringify(getOriginalBlueprint())));
    }
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
// VIEW JSON HANDLING
// ============================================================================

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
            <textarea readonly style="width: 100%; height: 400px; font-family: monospace; font-size: 11px; white-space: pre; overflow: auto;">${escapeHtml(jsonString)}</textarea>
        </div>
        <p style="color: var(--SmartThemeEmColor); font-size: 0.9em;">
            This is the raw JSON data for the blueprint. Click "Copy" to copy to clipboard.
        </p>
    `;

    const result = await callGenericPopup(jsonHtml, POPUP_TYPE.CONFIRM, '', {
        wide: true,
        large: true,
        okButton: 'Copy',
        cancelButton: 'Close'
    });

    if (result) {
        try {
            await navigator.clipboard.writeText(jsonString);
            toastr.success('JSON copied to clipboard');
        } catch (err) {
            console.error('[BlueprintEditor] Failed to copy JSON:', err);
            toastr.error('Failed to copy to clipboard');
        }
    }
}

// ============================================================================
// EVENT SETUP
// ============================================================================

/**
 * Setup editor action handlers (play button, export, revert, view JSON)
 */
export function setupEditorActionHandlers() {
    $(document).on('click' + EVENT_NAMESPACE, SELECTORS.PLAY_BUTTON, handlePlayButtonClick);

    $(document).on('click' + EVENT_NAMESPACE, '#blueprint_export_btn', async function (e) {
        e.preventDefault();
        await handleExportBlueprint();
    });

    $(document).on('click' + EVENT_NAMESPACE, '#blueprint_revert_btn', handleRevertButton);

    $(document).on('click' + EVENT_NAMESPACE, '#blueprint_view_json_btn', handleViewJson);
}
