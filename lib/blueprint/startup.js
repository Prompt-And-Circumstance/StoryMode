import { extension_settings, getContext } from '/scripts/extensions.js';
import { saveSettingsDebounced, saveMetadata } from '/script.js';
import { MODULE_NAME } from '../core/index.js';
import {
    getStoryTypes,
    getAuthorStyles,
    loadStoryTypes,
    loadAuthorStyles,
    getChatStoryState,
    saveChatStoryState,
    getCurrentSceneIndex,
    setCurrentSceneIndex,
    getPacingMode,
} from '../core/state-manager.js';
import { updateStoryPrompt } from '../core/arc-engine.js';
import { getBlueprintState, saveBlueprintState, createRunCopy } from './storage.js';
import { storeCoverImage } from '../scene/image-storage.js';
import { blueprintFilename } from './file-api.js';
import { getBlueprintCoverUrl } from './utils.js';
import { resolveAndHandleMissingStyle } from './missing-style-handler.js';
import { calculateBlueprintSettingsChanges, applyBlueprintSettingsToState, applyScenarioModeToState } from './settings-sync.js';

/**
 * Prompt user to import missing styles (story types and author styles).
 * Uses the unified resolveAndHandleMissingStyle helper which handles
 * embedded data (quick import), inline data (prefilled form), and
 * non-embedded styles (manual creation dialog) uniformly.
 *
 * NOTE: This function does NOT mutate the blueprint. If the user skips
 * author style creation, the caller is responsible for clearing
 * `author_style` on the run copy (not the library original).
 *
 * @param {Object} blueprint
 * @param {Object} missingInfo - from detectMissingResources()
 * @returns {Promise<{warnings: string[], skippedAuthorStyle: boolean}>}
 */
async function promptForMissingStyles(blueprint, missingInfo) {
    const warnings = [];
    let skippedAuthorStyle = false;

    try {
        if (missingInfo.storyType?.missing) {
            const created = await resolveAndHandleMissingStyle(blueprint, 'storyType');
            if (!created) {
                warnings.push(`Story type "${blueprint.story_type_id}" not found. You may need to create it manually.`);
            }
        }
        if (missingInfo.authorStyle?.missing) {
            const created = await resolveAndHandleMissingStyle(blueprint, 'authorStyle');
            if (!created) {
                skippedAuthorStyle = true;
                warnings.push('Author style was skipped. It has been set to None for this run.');
            }
        }
    } catch (error) {
        console.error('[Story Mode] Style import failed:', error);
        const toastr = window.toastr;
        if (toastr) toastr.error(`Import failed: ${error.message}`);
    }

    return { warnings, skippedAuthorStyle };
}

/**
 * Validate blueprint resources exist (story types, author styles).
 * This function is READ-ONLY — it generates warnings but does NOT mutate
 * the blueprint. When the user skips author style creation, the caller
 * (startStoryFromBlueprint) clears the reference on the run copy.
 *
 * @param {Object} blueprint
 * @returns {Promise<string[]>} Warnings for missing resources
 */
async function validateBlueprintResources(blueprint) {
    const warnings = [];

    if (getStoryTypes().length === 0) await loadStoryTypes();
    const existingTypes = getStoryTypes();
    if (!existingTypes.some(t => t.id === blueprint.story_type_id)) {
        warnings.push(`Story type "${blueprint.story_type_id}" not found in library. You may need to import it or select another.`);
    }

    if (blueprint.author_style) {
        if (getAuthorStyles().length === 0) await loadAuthorStyles();
        const existingStyles = getAuthorStyles();
        if (!existingStyles.some(s => s.id === blueprint.author_style)) {
            warnings.push(`Author style "${blueprint.author_style}" not found in library.`);
        }
    }

    return warnings;
}

/**
 * Initialize Scenario Mode state for blueprint
 * @param {Object} blueprint
 */
async function initializeScenarioMode(blueprint) {
    const newChatState = getChatStoryState();
    newChatState.pacingMode = 'scenario';
    newChatState.scenario = { currentSceneIndex: 0, beatState: {} };
    await saveChatStoryState(newChatState);

    const blueprintState = getBlueprintState();
    blueprintState.useBlueprint = true;
    blueprintState.blueprint = blueprint;
    blueprintState.sceneMode = 'manual';
    blueprintState.sceneSummaries = blueprintState.sceneSummaries || {};
    setCurrentSceneIndex(0);

    await saveBlueprintState(blueprintState);
}

/**
 * Handle blueprint cover image storage
 * @param {Object} blueprint
 */
function handleBlueprintCover(blueprint) {
    try {
        const coverUrl = getBlueprintCoverUrl(blueprint);
        console.log('[Story Mode] Cover URL resolved:', coverUrl ? coverUrl.substring(0, 80) + '...' : 'null');
        if (coverUrl) {
            storeCoverImage(blueprint.blueprint_id, {
                imageData: coverUrl,
                prompt: blueprint.cover_prompt || 'Blueprint cover image',
                generatedAt: Date.now(),
            });
            console.log('[Story Mode] Cover image stored to scene image storage');
        }
    } catch (coverError) {
        console.error('[Story Mode] Error handling cover image:', coverError);
    }
}

/**
 * Prompt user to import missing characters (non-blocking)
 * @param {Object} blueprint
 */
async function promptForMissingCharacters(blueprint) {
    if (!blueprint.embeddedResources) return;

    const { detectMissingResources } = await import('./import.js');
    const missing = detectMissingResources(blueprint);

    if (missing.characters.length === 0 && missing.personas.length === 0) return;

    const { showImportPreviewDialog, showImportResultDialog } = await import('./import-ui.js');
    const { importCharacterCard, importPersona } = await import('./characters/linker.js');
    const { getCharacters } = await import('/script.js');

    // Use setTimeout so the dialog doesn't block blueprint loading
    setTimeout(async () => {
        try {
            const selections = await showImportPreviewDialog(blueprint.embeddedResources, missing);
            if (!selections) return; // User cancelled

            const selectedCharNames = new Set((selections.characters || []).map(n => n.toLowerCase().trim()));
            const selectedPersonaNames = new Set((selections.personas || []).map(n => n.toLowerCase().trim()));
            const result = { imported: [], skipped: [], failed: [] };

            // Import selected characters
            const embeddedChars = blueprint.embeddedResources.characters || [];
            for (const char of embeddedChars) {
                if (!selectedCharNames.has((char.name || '').toLowerCase().trim())) continue;
                try {
                    const importResult = await importCharacterCard(char.pngDataUrl, char.name);
                    if (importResult.success) {
                        result.imported.push(char.name);
                    } else {
                        result.failed.push({ name: char.name, error: importResult.error });
                    }
                } catch (err) {
                    result.failed.push({ name: char.name, error: err.message });
                }
            }

            // Import selected personas
            const embeddedPersonas = blueprint.embeddedResources.personas || [];
            for (const persona of embeddedPersonas) {
                if (!selectedPersonaNames.has((persona.name || '').toLowerCase().trim())) continue;
                try {
                    const importResult = await importPersona(persona);
                    if (importResult.success) {
                        result.imported.push(persona.name);
                    } else {
                        result.failed.push({ name: persona.name, error: importResult.error });
                    }
                } catch (err) {
                    result.failed.push({ name: persona.name, error: err.message });
                }
            }

            // Refresh SillyTavern's character list
            if (result.imported.length > 0) {
                await getCharacters();
            }

            await showImportResultDialog(result);

            // Refresh controller panel to reflect updated counts
            if (result.imported.length > 0) {
                const { updateControllerPanel } = await import('../ui/controller-panel.js');
                updateControllerPanel();
            }
        } catch (error) {
            console.error('[Story Mode] Import flow error:', error);
            const t = window.toastr;
            if (t) t.error(`Import failed: ${error.message}`);
        }
    }, 500);
}

/**
 * Enable all Story Mode features for blueprint
 * @param {Object} blueprint
 */
function enableStoryModeFeatures(blueprint) {
    if (!extension_settings[MODULE_NAME]) {
        extension_settings[MODULE_NAME] = {};
    }
    const settings = extension_settings[MODULE_NAME];
    settings.enabled = true;
    settings.storyArcEnabled = true;

    if (!settings.blueprintSettings) {
        settings.blueprintSettings = {};
    }
    settings.blueprintSettings.enabled = true;
    settings.blueprintSettings.useScenePrompts = true;

    if (blueprint.author_style) {
        settings.authorStyleEnabled = true;
    }

    saveSettingsDebounced();
}

/**
 * Start a story from a blueprint - syncs settings, enables features, optionally generates opening
 *
 * This is the main entry point for the "Start Story from Blueprint" button action.
 * It performs the following:
 * 1. Validates blueprint has required data (scenes, story type)
 * 2. Prompts for missing styles/characters
 * 3. Syncs blueprint settings to main Story Mode settings
 * 4. Creates a run copy (deep clone) so library/editor blueprints stay pristine
 * 5. Enables all relevant Story Mode features
 *
 * PERFORMANCE: This function accumulates all state changes in memory and performs
 * a single saveMetadata() call at the end, rather than multiple sequential saves.
 *
 * @param {Object} blueprint - The blueprint object to start from
 * @param {Object} options - Optional settings
 * @param {string} options.sourceType - Where the blueprint came from: 'wizard' | 'editor' | 'import' | 'library'
 * @param {boolean} options.settingsAlreadySynced - If true, skip applying settings (already done by caller with dialog)
 * @returns {Promise<{success: boolean, warnings?: string[], error?: string}>}
 */
export async function startStoryFromBlueprint(blueprint, options = {}) {
    const { sourceType = 'editor', settingsAlreadySynced = false } = options;

    // --- Validation (no state changes) ---
    if (!blueprint.scene_plan?.length) {
        return { success: false, error: 'Blueprint has no scenes defined. Cannot start story.' };
    }
    if (!blueprint.story_type_id) {
        return { success: false, error: 'Blueprint has no story type. Cannot start story.' };
    }

    // --- Resource detection and prompts (may show dialogs, no persistent state changes) ---
    const { detectMissingResources } = await import('./import.js');
    const missingInfo = detectMissingResources(blueprint);

    const styleResult = await promptForMissingStyles(blueprint, missingInfo);
    const warnings = [
        ...styleResult.warnings,
        ...await validateBlueprintResources(blueprint),
    ];

    // --- Notify user ---
    const toastr = window.toastr;
    if (toastr) {
        toastr.info(`Switched to Scenario Mode: ${blueprint.blueprint_title || blueprint.title || 'Untitled Blueprint'}`);
    }

    // --- Accumulate all state changes in memory ---
    const { chatMetadata } = getContext();

    // Ensure base state object exists
    if (!chatMetadata[MODULE_NAME]) {
        chatMetadata[MODULE_NAME] = {};
    }
    const chatState = chatMetadata[MODULE_NAME];

    // Ensure blueprintState exists
    if (!chatState.blueprintState) {
        chatState.blueprintState = {};
    }
    const blueprintState = chatState.blueprintState;

    // 1. Apply blueprint settings (story type, author style, arc length, flags)
    //    Skip if caller already synced via dialog (avoids duplicate work)
    if (!settingsAlreadySynced) {
        const { proposedChanges } = calculateBlueprintSettingsChanges(chatState, blueprint);
        applyBlueprintSettingsToState(chatState, proposedChanges);
    }

    // 2. Apply scenario mode initialization
    applyScenarioModeToState(chatState, blueprintState, blueprint);

    // 3. Handle cover image (stores in memory cache, no disk write)
    handleBlueprintCover(blueprint);

    // 4. Set coverFileUrl for library blueprints
    if (sourceType === 'library' && blueprint.blueprint_id) {
        try {
            const filename = blueprintFilename(blueprint.blueprint_id);
            blueprint.coverFileUrl = `/user/files/${filename}`;
        } catch (e) {
            console.warn('[Story Mode] Could not set coverFileUrl:', e.message);
        }
    }

    // 5. Create run copy (in memory - createRunCopy doesn't save)
    const runState = createRunCopy(blueprint, sourceType);
    runState.sceneMode = 'manual';
    runState.currentSceneIndex = 0;

    // Clear dangling author style on the run copy (not the library original)
    if (styleResult.skippedAuthorStyle && runState.blueprint) {
        runState.blueprint.author_style = '';
    }

    // Store run state in chat metadata
    chatState.blueprintState = runState;

    // --- SINGLE SAVE: Persist all accumulated changes ---
    try {
        await saveMetadata();
    } catch (error) {
        console.error('[Story Mode] Failed to save accumulated state:', error);
        const toastrRef = window.toastr;
        if (toastrRef) toastrRef.error('Failed to save story state. Blueprint may not load correctly.');
        return { success: false, error: `Save failed: ${error.message}` };
    }

    // --- Post-save operations ---
    // UI updates (no disk writes)
    updateStoryPrompt();
    if (typeof window.updateStatusDisplay === 'function') window.updateStatusDisplay();
    if (typeof window.updateWandMenuStatus === 'function') window.updateWandMenuStatus();

    // Character import prompt (may show dialog, uses setTimeout so non-blocking)
    await promptForMissingCharacters(blueprint);

    // Enable features (uses saveSettingsDebounced - separate from chat metadata)
    enableStoryModeFeatures(blueprint);

    return { success: true, warnings };
}

export {
    promptForMissingStyles,
    validateBlueprintResources,
    initializeScenarioMode,
    handleBlueprintCover,
    promptForMissingCharacters,
    enableStoryModeFeatures,
};
