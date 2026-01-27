/**
 * Editor Action Handlers Module
 * Handles play button, export, revert, view JSON, and modal closing
 */

import { callGenericPopup, POPUP_TYPE } from '/scripts/popup.js';
import * as BlueprintModule from '../../blueprint/module.js';
import { escapeHtml, cloneBlueprint, sanitizeFilename, downloadBlob } from '../../blueprint/utils.js';
import {
    getCurrentBlueprint,
    setCurrentBlueprint,
    getOriginalBlueprint,
    getHasUnsavedChanges,
    setHasUnsavedChanges,
} from './state.js';
import { EVENT_NAMESPACE, SELECTORS } from './event-handlers.js';
import { getStoryTypes, getAuthorStyles } from '../../core/state-manager.js';

/** Source type constants for blueprint operations */
const BLUEPRINT_SOURCE = {
    EDITOR: 'editor',
    LIBRARY: 'library',
};
import {
    getBlueprintCharacterNames,
    findCharacterByName,
    findPersonaByName,
} from '../../blueprint/characters/linker.js';

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
 * Uses multiple selectors to handle different SillyTavern popup button variants
 */
function closeEditorModal() {
    const $popup = $(SELECTORS.EDITOR_CONTAINER).closest('.popup');
    const $closeBtn = $popup.find('.popup-button-close, .popup-close, .popup-button-cancel').first();
    if ($closeBtn.length) {
        $closeBtn.trigger('click');
    }
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
 * Save blueprint to state (shared by play button and save & load)
 * @param {Object} blueprint - Blueprint to save
 * @param {boolean} updateTimestamp - Whether to update modified_at
 */
async function saveBlueprintToState(blueprint, updateTimestamp = false) {
    if (updateTimestamp) {
        blueprint.modified_at = new Date().toISOString();
    }
    const blueprintState = BlueprintModule.getBlueprintState();
    blueprintState.blueprint = blueprint;
    await BlueprintModule.saveBlueprintState(blueprintState);
}

/**
 * Handle play button click - start story from current blueprint
 */
async function handlePlayButtonClick(e) {
    e.preventDefault();

    const blueprint = getCurrentBlueprint();
    await saveBlueprintToState(blueprint);

    closeEditorModal();

    const result = await BlueprintModule.startStoryFromBlueprint(blueprint, { sourceType: BLUEPRINT_SOURCE.EDITOR });

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
 * Find the settings dialog content container
 * Uses the modal class selector - the settings dialog uses .storymode-unified-modal
 */
function findSettingsDialogContent() {
    return $('.storymode-unified-modal');
}

/**
 * Enable and switch to a tab in the settings dialog
 * @param {jQuery} content - Settings dialog content
 * @param {string} tabName - Tab name to switch to
 */
function enableAndSwitchToTab(content, tabName) {
    const $tab = content.find(`.storymode-tab[data-tab="${tabName}"]`);
    if ($tab.hasClass('disabled')) {
        $tab.removeClass('disabled').attr('title', 'View and manage the current scenario');
    }
    $tab.trigger('click');
}

/**
 * Load the current blueprint as the active scenario
 * Extracted for reuse by both "Save & Load" and "Discard & Load" paths
 *
 * Note: Uses the blueprint directly instead of re-fetching from library
 * to avoid expensive PNG decode operations.
 */
async function loadBlueprintAsScenario(blueprint) {
    const content = findSettingsDialogContent();
    if (!content.length) {
        toastr.error('Could not find settings dialog');
        return false;
    }

    try {
        const { updateStoryPrompt } = await import('../../core/arc-engine.js');
        const { buildBlueprintTabContent } = await import('../../ui/components.js');

        // First sync: Shows confirmation dialog if there are conflicting settings
        const syncResult = await BlueprintModule.syncBlueprintSettings(blueprint, true);
        if (!syncResult.confirmed && syncResult.changes.length > 0) {
            return false; // User declined to overwrite
        }

        // Create a run copy (deep clone) so original blueprint stays pristine
        const runState = BlueprintModule.createRunCopy(blueprint, BLUEPRINT_SOURCE.EDITOR);
        await BlueprintModule.saveBlueprintState(runState);

        // Second sync: Apply settings without confirmation (user already confirmed above)
        await BlueprintModule.syncBlueprintSettings(blueprint, false);

        // Refresh UI
        content.find('#tab_blueprint').html(buildBlueprintTabContent());
        if (window.updateStatusDisplay) window.updateStatusDisplay();
        updateStoryPrompt();

        enableAndSwitchToTab(content, 'blueprint');
        toastr.success('Scenario loaded!');
        return true;
    } catch (error) {
        console.error('[BlueprintEditor] Failed to load scenario:', error);
        toastr.error(`Failed to load scenario: ${error.message}`);
        return false;
    }
}

/**
 * Show unsaved changes dialog with Save & Load, Discard & Load, Cancel options
 * @returns {Promise<'save'|'discard'|'cancel'>} User's choice
 */
async function showUnsavedChangesDialog() {
    return new Promise((resolve) => {
        let resolved = false;

        const dialogHtml = `
            <h3>Unsaved Changes</h3>
            <p>You have unsaved changes to this blueprint.</p>
            <p>What would you like to do?</p>
            <div style="display: flex; gap: 10px; margin-top: 20px; justify-content: flex-end;">
                <button id="unsaved_cancel_btn" class="menu_button">Cancel</button>
                <button id="unsaved_discard_btn" class="menu_button">Discard & Load</button>
                <button id="unsaved_save_btn" class="menu_button storymode-btn-start">Save & Load</button>
            </div>
        `;

        const cleanup = () => {
            $(document).off('click', '#unsaved_save_btn');
            $(document).off('click', '#unsaved_discard_btn');
            $(document).off('click', '#unsaved_cancel_btn');
        };

        const handleChoice = (choice) => {
            if (resolved) return;
            resolved = true;
            cleanup();
            $('.popup:visible').last().find('.popup-close, .popup-button-close, .popup-button-ok').first().trigger('click');
            resolve(choice);
        };

        $(document).one('click', '#unsaved_save_btn', () => handleChoice('save'));
        $(document).one('click', '#unsaved_discard_btn', () => handleChoice('discard'));
        $(document).one('click', '#unsaved_cancel_btn', () => handleChoice('cancel'));

        // Handle popup closed without button click (ESC key, clicking outside, etc.)
        callGenericPopup(dialogHtml, POPUP_TYPE.TEXT, '', { okButton: false, cancelButton: false })
            .then(() => {
                if (!resolved) {
                    resolved = true;
                    cleanup();
                    resolve('cancel');
                }
            });
    });
}

/**
 * Handle set as current scenario button click - load this blueprint as active scenario
 */
async function handleSetAsCurrentScenario(e) {
    e.preventDefault();

    const currentBlueprint = getCurrentBlueprint();
    if (!currentBlueprint) {
        toastr.warning('No blueprint to load');
        return;
    }

    // Validate early - fail fast if blueprint is invalid
    const validation = BlueprintModule.validateBlueprint(currentBlueprint);
    if (!validation.valid) {
        toastr.error('Blueprint is invalid: ' + validation.errors[0]);
        return;
    }

    // Determine which blueprint to load based on user choice
    let blueprintToLoad = currentBlueprint;

    if (getHasUnsavedChanges()) {
        const choice = await showUnsavedChangesDialog();

        if (choice === 'cancel') return;

        if (choice === 'save') {
            await saveBlueprintToState(currentBlueprint, true);
            toastr.success('Blueprint saved');
            // Load the saved (current) blueprint
            blueprintToLoad = currentBlueprint;
        } else {
            // 'discard' - load the original blueprint without edits
            blueprintToLoad = getOriginalBlueprint();
        }
    }

    const success = await loadBlueprintAsScenario(blueprintToLoad);
    if (success) {
        setHasUnsavedChanges(false);
        closeEditorModal();
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
 * Generate export filename for JSON
 * Reuses pattern from export.js but with .json extension
 * @param {Object} blueprint - Blueprint object
 * @returns {string} Filename for JSON export
 */
function generateJsonExportFilename(blueprint) {
    const baseName = blueprint.userMetadata?.title
        || blueprint.blueprint_title
        || blueprint.story_type_name
        || 'blueprint';
    const sanitized = sanitizeFilename(baseName);
    const timestamp = Date.now();
    return `story-blueprint-${sanitized}-${timestamp}.json`;
}

/**
 * Extract character metadata without images
 * @param {Array<string>} characterNames - Character names to extract
 * @returns {Array<Object>} Character metadata (name, description, avatar filename)
 */
function extractCharacterMetadata(characterNames) {
    const metadata = [];

    for (const name of characterNames) {
        const char = findCharacterByName(name);
        if (char) {
            metadata.push({
                name: char.name,
                avatar: char.avatar,
                description: char.description || '',
                personality: char.personality || '',
                scenario: char.scenario || '',
                first_mes: char.first_mes || '',
                mes_example: char.mes_example || '',
            });
        }
    }

    return metadata;
}

/**
 * Extract persona metadata without images
 * @param {Array<string>} personaNames - Persona names to extract
 * @returns {Array<Object>} Persona metadata (name, description, avatar filename)
 */
function extractPersonaMetadata(personaNames) {
    const metadata = [];

    for (const name of personaNames) {
        const persona = findPersonaByName(name);
        if (persona) {
            metadata.push({
                name: persona.name,
                avatar: persona.avatar,
                description: persona.description || '',
            });
        }
    }

    return metadata;
}

/**
 * Gather embedded metadata for JSON export (without images)
 * Similar to PNG export's gatherEmbeddedResources but strips image data
 * @param {Object} blueprint - Blueprint to enrich
 * @returns {Object} Blueprint with embeddedResources (metadata only)
 */
function gatherJsonMetadata(blueprint) {
    const enriched = { ...blueprint };
    enriched.embeddedResources = {};

    // Characters (metadata only, no PNG)
    const characterNames = getBlueprintCharacterNames(blueprint);
    if (characterNames.length > 0) {
        enriched.embeddedResources.characters = extractCharacterMetadata(characterNames);
    }

    // Personas (metadata only, no avatar image)
    if (blueprint.selectedPersonas?.length > 0) {
        enriched.embeddedResources.personas = extractPersonaMetadata(blueprint.selectedPersonas);
    }

    // Story type definition
    if (blueprint.story_type_id) {
        const storyTypes = getStoryTypes();
        const storyType = storyTypes.find(st => st.id === blueprint.story_type_id);
        if (storyType) {
            enriched.embeddedResources.storyType = storyType;
        }
    }

    // Author style definition
    if (blueprint.author_style) {
        const authorStyles = getAuthorStyles();
        const authorStyle = authorStyles.find(as => as.id === blueprint.author_style);
        if (authorStyle) {
            enriched.embeddedResources.authorStyle = authorStyle;
        }
    }

    return enriched;
}

/**
 * Export blueprint as JSON file with embedded metadata
 * @param {Object} blueprint - Blueprint to export
 */
function exportAsJson(blueprint) {
    // Enrich blueprint with metadata (no images)
    const enriched = gatherJsonMetadata(blueprint);
    const jsonString = JSON.stringify(enriched, null, 2);

    const filename = generateJsonExportFilename(blueprint);
    const blob = new Blob([jsonString], { type: 'application/json' });
    downloadBlob(blob, filename);
    toastr.success(`Exported: ${filename}`);
}

/**
 * Helper to update loading status text
 * @param {string} text - Status message to display
 */
function updateLoadingStatus(text) {
    const statusEl = document.getElementById('blueprint_json_status');
    if (statusEl) {
        statusEl.textContent = text;
    }
}

/**
 * Helper to yield to the UI thread between operations
 * @returns {Promise<void>}
 */
function yieldToUI() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Handle view JSON button click
 * Shows popup immediately with loading state, then populates JSON asynchronously
 */
async function handleViewJson(e) {
    e.preventDefault();

    const blueprint = getCurrentBlueprint();
    if (!blueprint) {
        toastr.warning('No blueprint to display');
        return;
    }

    // Show popup immediately with loading state
    const jsonHtml = `
        <h3>Blueprint JSON</h3>
        <div style="margin: 16px 0; position: relative;">
            <div id="blueprint_json_loading" style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: var(--SmartThemeBlurTintColor); border-radius: 4px; gap: 12px;">
                <i class="fa-solid fa-circle-notch fa-spin fa-2x"></i>
                <span id="blueprint_json_status" style="font-size: 0.9em; color: var(--SmartThemeEmColor);">Preparing...</span>
            </div>
            <textarea id="blueprint_json_textarea" readonly style="width: 100%; height: 300px; font-family: monospace; font-size: 11px; white-space: pre; overflow: auto;"></textarea>
        </div>
        <div style="margin: 12px 0; display: flex; gap: 10px;">
            <button id="blueprint_json_copy_btn" class="menu_button" disabled>
                <i class="fa-solid fa-copy"></i>&nbsp;Copy to Clipboard
            </button>
            <button id="blueprint_json_export_btn" class="menu_button" disabled>
                <i class="fa-solid fa-download"></i>&nbsp;Export as JSON
            </button>
        </div>
        <p style="color: var(--SmartThemeEmColor); font-size: 0.9em;">
            Copy shows raw blueprint. Export adds character/style metadata for sharing.
        </p>
    `;

    // Variable to store JSON once generated
    let jsonString = null;

    // Setup click handlers (will use jsonString once available)
    $(document).one('click', '#blueprint_json_copy_btn', async function() {
        if (!jsonString) return;
        const textarea = document.getElementById('blueprint_json_textarea');
        if (textarea) await copyToClipboard(jsonString, textarea);
    });

    $(document).one('click', '#blueprint_json_export_btn', function() {
        if (!jsonString) return;
        exportAsJson(blueprint);
    });

    // Show popup (non-blocking)
    const popupPromise = callGenericPopup(jsonHtml, POPUP_TYPE.TEXT, '', {
        wide: true,
        large: true,
        okButton: 'Close'
    });

    // Defer JSON generation to next frame so popup renders first
    // Display raw blueprint (lightweight), export adds enriched metadata
    requestAnimationFrame(async () => {
        await yieldToUI();

        updateLoadingStatus('Formatting JSON...');
        await yieldToUI();

        // Display raw blueprint JSON (fast, no character data bloat)
        jsonString = JSON.stringify(blueprint, null, 2);

        // Update UI
        const textarea = document.getElementById('blueprint_json_textarea');
        const loading = document.getElementById('blueprint_json_loading');
        const copyBtn = document.getElementById('blueprint_json_copy_btn');
        const exportBtn = document.getElementById('blueprint_json_export_btn');

        if (textarea) {
            textarea.value = jsonString;
        }
        if (loading) {
            loading.style.display = 'none';
        }
        if (copyBtn) {
            copyBtn.disabled = false;
        }
        if (exportBtn) {
            exportBtn.disabled = false;
        }
    });

    await popupPromise;
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
