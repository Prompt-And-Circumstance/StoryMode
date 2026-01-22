/**
 * Blueprint Editor Module - Split-Panel Architecture
 *
 * Left Panel: Blueprint info display
 * Right Panel: Tabbed editor (Blueprint Details, Scenes)
 *
 * Architecture:
 * - Opens as a wide modal using callGenericPopup()
 * - Split-panel layout: fixed left panel (280px), flexible right panel
 * - Two tabs: Details (all blueprint fields), Scenes (scene CRUD)
 * - Immediate field updates with validation on save
 * - Revert functionality to discard changes
 * - Event delegation for robust dynamic element handling
 */

// ============================================================================
// IMPORTS
// ============================================================================

import { callGenericPopup, POPUP_TYPE } from '/scripts/popup.js';
import * as BlueprintModule from '../blueprint/module.js';
import {
    escapeHtml,
    setNestedValue,
    generateUUID,
    isValidImageUrl,
} from '../blueprint/utils.js';
import {
    getCurrentBlueprint,
    setCurrentBlueprint,
    getOriginalBlueprint,
    setOriginalBlueprint,
    getActiveTab,
    setActiveTab,
    getHasUnsavedChanges,
    setHasUnsavedChanges,
    initializeState,
} from './blueprint-editor/state.js';

// Cover generation and gallery modules
import {
    setCoverImageUrl,
    generateCoverFromSD,
} from './blueprint-editor/cover-generation.js';
import {
    addCoverToGallery,
    setRefreshContent as setGalleryRefresh,
} from './blueprint-editor/cover-gallery.js';
import { setRefreshFunctions as setSceneRefresh } from './blueprint-editor/scene-crud.js';

// Tab renderer modules (used by refreshContent)
import { renderDetailsTab } from './blueprint-editor/details-tab.js';
import { renderScenesTab } from './blueprint-editor/scenes-tab.js';
import { renderCoverTab } from './blueprint-editor/cover-tab.js';

// Panel renderers
import { renderLeftPanel, renderRightPanel } from './blueprint-editor/panels.js';

// Event handlers module
import {
    setupDocumentEventListeners,
    setRefreshFunctions as setEventRefresh,
    setHelperFunctions as setEventHelpers,
} from './blueprint-editor/event-handlers.js';

// Editor action handlers (for revert/view JSON)
import { setRefreshEditor as setEditorActionRefresh } from './blueprint-editor/editor-action-handlers.js';

// Load editor CSS
// CSS is loaded via @import in main style.css

// ============================================================================
// CONSTANTS
// ============================================================================

export const MODULE_NAME = 'story_mode';

// ============================================================================
// RENDER HELPERS
// ============================================================================

/**
 * Refresh the editor right panel content
 * Re-renders and re-attaches event listeners using delegation
 */
function refreshEditor() {
    const rightPanel = $('.storymode-editor-right-panel');
    if (rightPanel.length) {
        rightPanel.html(renderRightPanel());
    }
}

/**
 * Refresh only the left panel (blueprint info sidebar)
 */
function refreshLeftPanel() {
    const leftPanel = $('.storymode-editor-left-panel');
    if (leftPanel.length) {
        leftPanel.html(renderLeftPanel());
    }
}

/**
 * Refresh only the content area (preserves tabs)
 */
function refreshContent() {
    const content = $('.storymode-editor-content');
    if (content.length) {
        switch (getActiveTab()) {
            case 'details':
                content.html(renderDetailsTab());
                break;
            case 'scenes':
                content.html(renderScenesTab());
                break;
            case 'cover':
                content.html(renderCoverTab());
                break;
            default:
                content.html(renderDetailsTab());
        }
    }
}

// Wire up refresh functions for extracted modules
setGalleryRefresh(refreshContent);
setSceneRefresh(refreshContent, refreshLeftPanel);
setEventRefresh(refreshContent, refreshEditor, refreshLeftPanel);
setEditorActionRefresh(refreshEditor);

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Ensures the cover gallery is initialized, migrating legacy single-cover blueprints
 * @param {Object} blueprint - The blueprint to initialize
 * @returns {Object} The blueprint with gallery initialized
 */
function ensureGalleryInitialized(blueprint) {
    if (!blueprint.metadata) {
        blueprint.metadata = {};
    }

    // Already has gallery - nothing to do
    if (Array.isArray(blueprint.metadata.coverGallery)) {
        return blueprint;
    }

    // Initialize empty gallery
    blueprint.metadata.coverGallery = [];
    blueprint.metadata.coverGalleryIndex = null;

    // Migrate existing single cover if present
    const existingCover = blueprint.coverImageUrl || blueprint.metadata.coverImageUrl;
    if (existingCover && isValidImageUrl(existingCover)) {

        blueprint.metadata.coverGallery.push({
            id: generateUUID(),
            url: existingCover,
            prompt: blueprint.metadata.coverPrompt || null,
            timestamp: blueprint.metadata.createdAt || new Date().toISOString(),
            seed: blueprint.metadata.coverSeed || null,
            model: blueprint.metadata.coverModel?.name || 'Imported (Legacy)'
        });

        blueprint.metadata.coverGalleryIndex = 0;
    } else if (existingCover) {
        console.warn('[BlueprintEditor] Skipping legacy cover migration: invalid URL', existingCover.substring(0, 50));
    }

    return blueprint;
}

/**
 * Open the blueprint editor (split-panel view)
 * @param {Object} blueprint - The blueprint to edit (cloned for safety)
 * @returns {Promise<Object>} Saved blueprint or null if cancelled
 */
export async function openBlueprintEditor(blueprint) {

    // Clone blueprint using structuredClone (modern, faster than JSON method)
    try {
        setCurrentBlueprint(structuredClone(blueprint));
        setOriginalBlueprint(structuredClone(blueprint));
    } catch (e) {
        // Fallback for older browsers
        setCurrentBlueprint(JSON.parse(JSON.stringify(blueprint)));
        setOriginalBlueprint(JSON.parse(JSON.stringify(blueprint)));
    }

    // Initialize gallery (handles migration from legacy single-cover blueprints)
    setCurrentBlueprint(ensureGalleryInitialized(getCurrentBlueprint()));

    setActiveTab('details');
    setHasUnsavedChanges(false);

    // Build the split-panel HTML
    const html = buildEditorHtml();

    // Show modal using callGenericPopup (returns true if saved, false if cancelled)
    // Store promise first so we can set up event listeners before awaiting
    const resultPromise = callGenericPopup(html, POPUP_TYPE.CONFIRM, null, {
        wide: true,
        large: true,
        okButton: 'Save Changes',
        cancelButton: 'Cancel',
    });

    // Set up event listeners immediately on document level
    // This bypasses the need to find the specific popup container
    setupDocumentEventListeners();

    // Now await the user's response
    const result = await resultPromise;

    if (result) {
        // User clicked Save
        const saved = await saveBlueprint();
        return saved ? getCurrentBlueprint() : null;
    } else {
        // User clicked Cancel or X
        if (getHasUnsavedChanges()) {
            const confirmDiscard = await callGenericPopup(
                'You have unsaved changes. Are you sure you want to discard them?',
                POPUP_TYPE.CONFIRM,
                null,
                { okButton: 'Discard Changes', cancelButton: 'Keep Editing' }
            );
            if (!confirmDiscard) {
                // User wants to keep editing - reopen editor
                return await openBlueprintEditor(getCurrentBlueprint());
            }
        }
        return null;
    }
}

/**
 * Build the editor HTML structure
 * @returns {string} Complete HTML for the editor
 */
function buildEditorHtml() {
    return `
    <div class="storymode-blueprint-editor-container">
        <div class="storymode-editor-title-bar">
            <div class="storymode-editor-title">
                <i class="fa-solid fa-pen-to-square"></i> Edit Blueprint
            </div>
            <div class="storymode-editor-title-actions">
                <button class="menu_button" id="blueprint_view_json_btn" title="View raw JSON">
                    <i class="fa-solid fa-code"></i> View JSON
                </button>
                <button class="menu_button" id="blueprint_export_btn" title="Export as PNG with embedded resources">
                    <i class="fa-solid fa-download"></i> Export
                </button>
            </div>
        </div>
        <div class="storymode-blueprint-editor">
            ${renderLeftPanel()}
            ${renderRightPanel()}
        </div>
        <div class="storymode-editor-footer">
            <div class="storymode-editor-footer-left">
                ${getHasUnsavedChanges() ? '<span class="storymode-unsaved-message"><i class="fa-solid fa-circle-exclamation"></i> You have unsaved changes</span>' : ''}
            </div>
            <div class="storymode-editor-footer-right">
                <button class="menu_button" id="blueprint_revert_btn" ${!getHasUnsavedChanges() ? 'disabled' : ''}>
                    <i class="fa-solid fa-rotate-left"></i> Revert
                </button>
            </div>
        </div>
    </div>
    `;
}

// ============================================================================
// EDITING HELPERS
// ============================================================================

/**
 * Save a single field to currentBlueprint (immediate, no persistence yet)
 * @param {string} fieldPath - Dot-notation path (e.g., 'setting.location')
 * @param {any} value - New value
 */
function updateField(fieldPath, value) {
    setNestedValue(getCurrentBlueprint(), fieldPath, value);
    setHasUnsavedChanges(true);
    // Update unsaved indicator in UI
    updateUnsavedIndicator();
}

/**
 * Update the unsaved changes indicator in the UI
 */
function updateUnsavedIndicator() {
    const indicator = $('.storymode-unsaved-indicator');
    if (getHasUnsavedChanges() && indicator.length === 0) {
        // Add indicator to active tab
        $('.storymode-tab.active').append('<span class="storymode-unsaved-indicator"></span>');
    } else if (!getHasUnsavedChanges()) {
        indicator.remove();
    }
}

/**
 * Save blueprint to blueprintState (persist changes)
 * @returns {Promise<boolean>} True if saved successfully, false otherwise
 */
async function saveBlueprint() {

    // Validate blueprint using existing validation function
    const validation = BlueprintModule.validateBlueprint(getCurrentBlueprint());
    if (!validation.valid) {
        console.error('[BlueprintEditor] Validation failed:', validation.errors);
        const errorHtml = `
            <h3>Blueprint Validation Failed</h3>
            <p>The blueprint has errors that must be fixed before saving:</p>
            <ul>
                ${validation.errors.map(e => `<li>${escapeHtml(e)}</li>`).join('')}
            </ul>
        `;
        await callGenericPopup(errorHtml, POPUP_TYPE.TEXT, null, { wide: true });
        return false;
    }

    // Add modification timestamp
    getCurrentBlueprint().modified_at = new Date().toISOString();

    // Save to blueprintState
    const blueprintState = BlueprintModule.getBlueprintState();
    blueprintState.blueprint = getCurrentBlueprint();
    await BlueprintModule.saveBlueprintState(blueprintState);


    // Update story prompt if available
    if (typeof window.updateStoryPrompt === 'function') {
        window.updateStoryPrompt();
    }

    setHasUnsavedChanges(false);
    toastr.success('Blueprint saved successfully!');
    return true;
}

// Wire up event helpers (must be after function definitions)
setEventHelpers(updateField, updateUnsavedIndicator, saveBlueprint);

// Re-export for external consumers
export { setCoverImageUrl, generateCoverFromSD, addCoverToGallery };

