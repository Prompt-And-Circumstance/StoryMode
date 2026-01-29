import { extension_settings, getContext } from '/scripts/extensions.js';
import { saveMetadata } from '/script.js';
import { MODULE_NAME } from '../core/index.js';
import { callGenericPopup, POPUP_TYPE, POPUP_RESULT } from '/scripts/popup.js';

// Default rounds per scene when scene_plan doesn't specify expected_rounds
export const DEFAULT_ROUNDS_PER_SCENE = 3;

/**
 * Calculate total expected rounds from a blueprint's scene plan.
 * Uses explicit expected_rounds from scenes if defined, otherwise falls back
 * to DEFAULT_ROUNDS_PER_SCENE per scene.
 *
 * @param {Object} blueprint - The blueprint object
 * @returns {number} Total expected rounds (minimum 1)
 */
export function calculateTotalRounds(blueprint) {
    if (!blueprint) {
        return DEFAULT_ROUNDS_PER_SCENE; // Sensible minimum
    }

    const scenePlan = blueprint.scene_plan || [];
    const sceneCount = scenePlan.length;

    if (sceneCount === 0) {
        // No scene plan - fall back to total_messages_target if it looks like a round count,
        // otherwise use a sensible default
        const target = blueprint.arc_structure?.total_messages_target || blueprint.total_messages_target;
        return target && target > 0 ? target : DEFAULT_ROUNDS_PER_SCENE;
    }

    // Check if any scenes have explicit expected_rounds
    const hasExplicitRounds = scenePlan.some(s => s.expected_rounds && typeof s.expected_rounds === 'number');

    if (hasExplicitRounds) {
        // Sum up expected_rounds, using default for scenes without explicit values
        return scenePlan.reduce((sum, scene) => {
            const rounds = (scene.expected_rounds && typeof scene.expected_rounds === 'number')
                ? scene.expected_rounds
                : DEFAULT_ROUNDS_PER_SCENE;
            return sum + rounds;
        }, 0);
    }

    // No explicit rounds defined - use default multiplier
    return sceneCount * DEFAULT_ROUNDS_PER_SCENE;
}

// ============================================================================
// PURE STATE MODIFICATION FUNCTIONS
// These functions modify state objects in memory WITHOUT saving to disk.
// Used by startStoryFromBlueprint to accumulate changes and save once.
// ============================================================================

/**
 * Calculate what settings changes would be needed to sync a blueprint.
 * This is a PURE function - it only reads state, does not modify anything.
 *
 * @param {Object} currentState - The current chat state (chatMetadata[MODULE_NAME])
 * @param {Object} blueprint - The blueprint to sync from
 * @returns {Object} { proposedChanges, changes, detailChanges }
 *   - proposedChanges: Object with the actual values to apply
 *   - changes: Array of human-readable change names (for dialog)
 *   - detailChanges: Array of detailed change descriptions (for dialog)
 */
export function calculateBlueprintSettingsChanges(currentState, blueprint) {
    const state = currentState || {};
    const changes = [];
    const detailChanges = [];
    const proposedChanges = {};

    // Check story type change
    if (blueprint.story_type_id) {
        const oldStoryType = state.selectedStoryType;
        if (oldStoryType !== blueprint.story_type_id) {
            changes.push('story type');
            detailChanges.push(`Story Type: ${oldStoryType || 'None'} → ${blueprint.story_type_id}`);
            proposedChanges.selectedStoryType = blueprint.story_type_id;
        }
    }

    // Check author style change
    if (Object.prototype.hasOwnProperty.call(blueprint, 'author_style')) {
        const oldAuthorStyle = state.selectedAuthorStyle;
        if (oldAuthorStyle !== (blueprint.author_style || '')) {
            changes.push('author style');
            const newStyleDisplay = blueprint.author_style || 'None';
            const oldStyleDisplay = oldAuthorStyle || 'None';
            detailChanges.push(`Author Style: ${oldStyleDisplay} → ${newStyleDisplay}`);
            proposedChanges.selectedAuthorStyle = blueprint.author_style || '';
        }
    }

    // Check arc length change
    const isScenarioBlueprint = blueprint.scene_plan && Array.isArray(blueprint.scene_plan) && blueprint.scene_plan.length > 0;
    const targetRounds = calculateTotalRounds(blueprint);
    const oldArcLength = state.arcLength || 30;
    if (oldArcLength !== targetRounds) {
        proposedChanges.arcLength = targetRounds;
        if (!isScenarioBlueprint) {
            changes.push('story length');
            detailChanges.push(`Story Length: ${oldArcLength} → ${targetRounds} rounds`);
        }
    }

    // Check current step change
    const oldStep = state.currentStep || 0;
    if (oldStep !== 0) {
        proposedChanges.currentStep = 0;
        if (!isScenarioBlueprint) {
            changes.push('current step');
            detailChanges.push(`Current Step: ${oldStep} → 0 (reset)`);
        }
    }

    // Check flag changes
    const oldFlags = [];
    if (state.arcStarted) oldFlags.push('arc started');
    if (state.epilogueShown) oldFlags.push('epilogue shown');
    if (state.summaryShown) oldFlags.push('summary shown');
    if (state.endNoticeShown) oldFlags.push('end notice shown');

    if (oldFlags.length > 0) {
        changes.push('completion flags');
        detailChanges.push(`Completion Flags Reset: ${oldFlags.join(', ')}`);
        proposedChanges.arcStarted = false;
        proposedChanges.epilogueShown = false;
        proposedChanges.summaryShown = false;
        proposedChanges.endNoticeShown = false;
    }

    return { proposedChanges, changes, detailChanges };
}

/**
 * Apply blueprint settings changes to a state object IN MEMORY.
 * Does NOT save to disk - caller is responsible for saving.
 *
 * @param {Object} state - The state object to modify (mutated in place)
 * @param {Object} proposedChanges - Changes from calculateBlueprintSettingsChanges
 */
export function applyBlueprintSettingsToState(state, proposedChanges) {
    if (proposedChanges.selectedStoryType !== undefined) {
        state.selectedStoryType = proposedChanges.selectedStoryType;
    }
    if (proposedChanges.selectedAuthorStyle !== undefined) {
        state.selectedAuthorStyle = proposedChanges.selectedAuthorStyle;
    }
    if (proposedChanges.arcLength !== undefined) {
        state.arcLength = proposedChanges.arcLength;
    }
    if (proposedChanges.currentStep !== undefined) {
        state.currentStep = proposedChanges.currentStep;
    }
    if (proposedChanges.arcStarted !== undefined) {
        state.arcStarted = proposedChanges.arcStarted;
        state.epilogueShown = proposedChanges.epilogueShown;
        state.summaryShown = proposedChanges.summaryShown;
        state.endNoticeShown = proposedChanges.endNoticeShown;
    }
}

/**
 * Apply scenario mode initialization to state objects IN MEMORY.
 * Does NOT save to disk - caller is responsible for saving.
 *
 * @param {Object} chatState - The chat state object to modify (mutated in place)
 * @param {Object} blueprintState - The blueprint state object to modify (mutated in place)
 * @param {Object} blueprint - The blueprint being loaded
 */
export function applyScenarioModeToState(chatState, blueprintState, blueprint) {
    // Update chat state for scenario mode
    chatState.pacingMode = 'scenario';
    if (!chatState.scenario) {
        chatState.scenario = {};
    }
    chatState.scenario.currentSceneIndex = 0;
    chatState.scenario.beatState = {};

    // Update blueprint state
    blueprintState.useBlueprint = true;
    blueprintState.blueprint = blueprint;
    blueprintState.sceneMode = 'manual';
    blueprintState.sceneSummaries = blueprintState.sceneSummaries || {};
    blueprintState.currentSceneIndex = 0;
}

/**
 * Sync blueprint settings to chat state
 * This ensures Story Mode settings match the blueprint's configuration.
 * Delegates to pure functions for calculation and application.
 *
 * @param {Object} blueprint - The blueprint object
 * @param {boolean} showConfirm - Whether to show confirmation dialog (default: true)
 * @returns {Object} { confirmed: boolean, changes: string[] }
 */
export async function syncBlueprintSettings(blueprint, showConfirm = true) {
    const { chatMetadata } = getContext();

    if (!chatMetadata[MODULE_NAME]) {
        chatMetadata[MODULE_NAME] = {};
    }

    // Calculate proposed changes using the pure function
    const { proposedChanges, changes, detailChanges } =
        calculateBlueprintSettingsChanges(chatMetadata[MODULE_NAME], blueprint);

    // If showConfirm is true and there are changes, show confirmation dialog
    if (showConfirm && changes.length > 0) {
        const confirmHtml = `
            <h3>Sync Story Mode Settings to Blueprint</h3>
            <p>This blueprint has different settings than your current Story Mode configuration.</p>
            <p><strong>The following will be updated:</strong></p>
            <ul style="text-align: left; margin: 10px 0;">
                ${detailChanges.map(c => `<li>${c}</li>`).join('')}
            </ul>
            <p>Do you want to apply these changes?</p>
        `;

        const result = await callGenericPopup(
            confirmHtml,
            POPUP_TYPE.CONFIRM
        );

        if (result !== POPUP_RESULT.AFFIRMATIVE) {
            return { confirmed: false, changes };
        }
    }

    // Apply changes using the pure function and persist
    applyBlueprintSettingsToState(chatMetadata[MODULE_NAME], proposedChanges);
    await saveMetadata();

    return { confirmed: true, changes };
}
