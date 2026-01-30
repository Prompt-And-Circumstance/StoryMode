/**
 * Blueprint Action Handlers
 * Handles blueprint CRUD operations (create, import, export)
 */

import { showSuccess, showError, showWarning, showInfo } from '../adapters/notification-adapter.js';

// PNG codec is loaded lazily via dynamic import() to avoid pulling in the
// entire SillyTavern dependency chain at module-parse time.  The chain is:
// storage.js → utils.js → file-api.js → script.js → lib.js (bare "lodash")
// which fails outside ST's Webpack-served environment.
let _pngCodec = null;

/**
 * Lazily load the PNG codec module
 * @returns {Promise<{decodeBlueprintFromPNG: Function, encodeBlueprintAsPNG: Function}>}
 */
async function getPngCodec() {
    if (!_pngCodec) {
        try {
            _pngCodec = await import('../../lib/blueprint/storage.js');
        } catch (err) {
            console.warn('[Blueprint] PNG codec unavailable (expected outside SillyTavern):', err.message);
            throw new Error('PNG import/export requires SillyTavern backend. Use JSON export instead.');
        }
    }
    return _pngCodec;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Download a blob as a file
 * @param {Blob} blob - Blob to download
 * @param {string} filename - Filename for download
 */
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ============================================================================
// STATE
// ============================================================================

let currentBlueprint = null;

// ============================================================================
// BLUEPRINT ACCESSORS
// ============================================================================

/**
 * Get the current blueprint
 * @returns {Object|null} Current blueprint or null
 */
export function getCurrentBlueprint() {
    return currentBlueprint;
}

/**
 * Set the current blueprint
 * @param {Object|null} blueprint - Blueprint to set
 */
export function setCurrentBlueprint(blueprint) {
    currentBlueprint = blueprint;
}

/**
 * Check if there are unsaved changes
 * @returns {boolean} True if has unsaved changes
 */
export function hasUnsavedChanges() {
    // Placeholder - will be implemented with proper change tracking
    return false;
}

// ============================================================================
// BLUEPRINT ACTIONS
// ============================================================================

/**
 * Handle new blueprint creation
 * @returns {boolean} True if created successfully
 */
export function handleNewBlueprint() {
    if (currentBlueprint && hasUnsavedChanges()) {
        if (!confirm('You have unsaved changes. Create new blueprint anyway?')) {
            return false;
        }
    }

    // Create blank blueprint
    currentBlueprint = createBlankBlueprint();

    // Emit event for other modules
    $(document).trigger('blueprint:loaded', { blueprint: currentBlueprint });

    // Update UI
    updateUIState();
    showTabContent();

    showSuccess('New blueprint created');
    return true;
}

/**
 * Handle blueprint import - triggers file input
 */
export function handleImport() {
    $('#fileInput').click();
}

/**
 * Handle file selection for import
 * @param {Event} e - File input change event
 */
export async function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== 'image/png') {
        showError('Please select a PNG file');
        return;
    }

    try {
        const blueprint = await importBlueprintFromPng(file);
        if (blueprint) {
            if (currentBlueprint && hasUnsavedChanges()) {
                if (!confirm('You have unsaved changes. Import anyway?')) {
                    return;
                }
            }

            currentBlueprint = blueprint;

            // Emit event for other modules
            $(document).trigger('blueprint:loaded', { blueprint: currentBlueprint });

            updateUIState();
            showTabContent();
            showSuccess('Blueprint imported successfully');
        }
    } catch (error) {
        console.error('[Blueprint] Import failed:', error);
        showError(`Import failed: ${error.message}`);
    }

    // Reset file input
    $('#fileInput').val('');
}

/**
 * Handle blueprint export to PNG
 * @returns {Promise<boolean>} True if exported successfully
 */
export async function handleExport() {
    if (!currentBlueprint) {
        showWarning('No blueprint to export');
        return false;
    }

    try {
        const { encodeBlueprintAsPNG } = await getPngCodec();
        const pngBlob = await encodeBlueprintAsPNG(currentBlueprint, currentBlueprint.cover || null);
        const title = currentBlueprint.userMetadata?.title || currentBlueprint.blueprint_title || 'blueprint';
        const filename = `${title.replace(/[^a-z0-9]/gi, '_')}-${currentBlueprint.blueprint_id}.png`;
        downloadBlob(pngBlob, filename);
        showSuccess('Blueprint exported as PNG');
        return true;
    } catch (error) {
        console.error('[Blueprint] Export failed:', error);
        showError(`Export failed: ${error.message}`);
        return false;
    }
}

/**
 * Handle JSON export
 * @returns {boolean} True if exported successfully
 */
export function handleJsonExport() {
    if (!currentBlueprint) {
        showWarning('No blueprint to export');
        return false;
    }

    try {
        exportBlueprintToJson(currentBlueprint);
        showSuccess('Blueprint exported as JSON');
        return true;
    } catch (error) {
        console.error('[Blueprint] JSON export failed:', error);
        showError(`Export failed: ${error.message}`);
        return false;
    }
}

// ============================================================================
// UI STATE MANAGEMENT
// ============================================================================

/**
 * Update the overall UI state based on current conditions
 * @param {boolean} hasBlueprint - Whether a blueprint is loaded
 */
export function updateUIState(hasBlueprint) {
    if (hasBlueprint === undefined) {
        hasBlueprint = !!currentBlueprint;
    }

    // Show/hide empty state
    $('#emptyState').toggle(!hasBlueprint);
    $('.sidebar-link[data-tab]').toggle(hasBlueprint);

    // Update header title
    const title = currentBlueprint?.blueprint_title
        ? `${currentBlueprint.blueprint_title} - Story Mode Blueprint Editor`
        : 'Story Mode Blueprint Editor';
    document.title = title;

    // Emit event for other modules
    $(document).trigger('ui:state-changed', { hasBlueprint });
}

/**
 * Show the tab content area
 */
function showTabContent() {
    $(document).trigger('tab:show');
}

// ============================================================================
// BLUEPRINT OPERATIONS
// ============================================================================

/**
 * Create a blank blueprint
 * @returns {Object} Blank blueprint object
 */
function createBlankBlueprint() {
    // Placeholder - will import from lib/blueprint/blank-blueprint.js
    return {
        blueprint_id: crypto.randomUUID(),
        story_type_id: '',
        story_type_name: '',
        core_premise: '',
        setting: {
            location: '',
            time_period: '',
            atmosphere: '',
        },
        protagonist_group: {
            description: '',
            shared_goal: '',
            group_dynamic: '',
        },
        antagonistic_forces: {
            description: '',
            nature: 'external',
            motivation: '',
            manifestations: [],
        },
        arc_structure: {
            opening_hook: '',
            escalation_pattern: '',
            climax_nature: '',
            resolution_style: '',
        },
        character_arcs: [],
        scene_plan: [],
        tone_and_style: {
            primary_tone: '',
            narrative_voice: '',
            pacing: '',
            key_stylistic_elements: [],
        },
        content_boundaries: {
            violence_level: 'none',
            romance_level: 'none',
        },
        genre_realism_notes: {
            metaphor_level_used: 'literal',
            implementation_notes: '',
        },
    };
}

/**
 * Import blueprint from PNG file
 * @param {File} file - PNG file
 * @returns {Promise<Object|null>} Blueprint object or null if cancelled
 */
export async function importBlueprintFromPng(file) {
    try {
        const { decodeBlueprintFromPNG } = await getPngCodec();
        const blueprint = await decodeBlueprintFromPNG(file);
        // Ensure blueprint has required metadata
        blueprint.userMetadata = blueprint.userMetadata || {};
        return blueprint;
    } catch (error) {
        console.error('[Blueprint] PNG decode failed:', error);
        // Show user-friendly error message
        if (error.message.includes('does not contain blueprint data')) {
            showError('This PNG file does not contain a blueprint. Please select a valid blueprint PNG.');
        } else if (error.message.includes('too large')) {
            showError('PNG file is too large. Maximum size is 50MB.');
        } else if (error.message.includes('timeout')) {
            showError('PNG file took too long to process. It may be corrupted.');
        } else {
            showError(`Failed to import blueprint: ${error.message}`);
        }
        return null;
    }
}

/**
 * Export blueprint to PNG (removed - now handled inline in handleExport)
 * @deprecated Use handleExport() instead
 */

/**
 * Export blueprint to JSON file
 * @param {Object} blueprint - Blueprint to export
 */
function exportBlueprintToJson(blueprint) {
    const data = JSON.stringify(blueprint, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const filename = `blueprint-${blueprint.blueprint_id}.json`;
    downloadBlob(blob, filename);
}
