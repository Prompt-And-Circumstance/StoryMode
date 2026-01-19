/**
 * @file Beat tracking for Scenario Mode
 * @module scenario/beats
 *
 * Manages beat state (completed, skipped) for StoryVerse scenes.
 * Uses scenario.beatState as authoritative source, with legacy sync.
 */

import {
    getBeatState,
    markBeatComplete,
    markBeatSkipped as markBeatSkippedState,
    resetBeatState,
    getCompletedBeatIndices,
} from '../core/state-manager.js';
import { getBlueprintState, saveBlueprintState } from '../blueprint/storage.js';

/**
 * Mark a beat as completed
 * Uses scenario.beatState as authoritative source, syncs to legacy beatProgress.
 * @param {number} sceneIndex - Scene index
 * @param {number} beatIndex - Beat index within scene
 * @returns {Promise<boolean>} True if beat was newly marked completed
 */
export async function markBeatCompleted(sceneIndex, beatIndex) {
    console.log(`[Story Mode] Marking beat ${beatIndex} in scene ${sceneIndex} as complete`);

    // Update authoritative state (scenario.beatState)
    markBeatComplete(beatIndex);

    // Legacy sync (for backward compatibility with saved states)
    const blueprintState = getBlueprintState();
    const beatId = `scene_${sceneIndex}_beat_${beatIndex}`;
    if (!blueprintState.beatProgress.completedBeats.includes(beatId)) {
        blueprintState.beatProgress.completedBeats.push(beatId);
        blueprintState.beatProgress.lastUpdated = new Date().toISOString();
        await saveBlueprintState(blueprintState);
        return true;
    }
    return false;
}

/**
 * Mark a beat as skipped
 * Uses scenario.beatState as authoritative source.
 * @param {number} sceneIndex - Scene index
 * @param {number} beatIndex - Beat index within scene
 * @returns {Promise<boolean>} True if beat was newly marked skipped
 */
export async function markBeatSkipped(sceneIndex, beatIndex) {
    console.log(`[Story Mode] Marking beat ${beatIndex} in scene ${sceneIndex} as skipped`);

    // Update authoritative state (scenario.beatState)
    markBeatSkippedState(beatIndex);
    return true;
}

/**
 * Check if a beat has been completed
 * @param {number} sceneIndex - Scene index
 * @param {number} beatIndex - Beat index within scene
 * @returns {boolean} True if beat is completed
 */
export function isBeatCompleted(sceneIndex, beatIndex) {
    // Use new authoritative state
    const beatState = getBeatState();
    return beatState[beatIndex]?.status === 'complete';
}

/**
 * Get completed beats for a specific scene
 * Uses scenario.beatState as authoritative source.
 * @param {number} sceneIndex - Scene index (kept for API compatibility)
 * @returns {Array<number>} Array of completed beat indices for this scene
 */
export function getCompletedBeats(sceneIndex) {
    // Use new unified accessor
    return getCompletedBeatIndices();
}

/**
 * Reset beat progress for a specific scene or all scenes
 * Uses scenario.beatState as authoritative source, syncs to legacy beatProgress.
 * @param {number|null} sceneIndex - Scene index to reset, or null for all scenes
 */
export async function resetBeatProgress(sceneIndex = null) {
    // Reset authoritative state
    resetBeatState();

    // Legacy sync
    const blueprintState = getBlueprintState();
    if (sceneIndex === null) {
        // Reset all beats
        blueprintState.beatProgress.completedBeats = [];
        blueprintState.beatProgress.currentBeatFocus = null;
        console.log('[Story Mode Blueprint] All beat progress reset');
    } else {
        // Reset beats for specific scene
        const prefix = `scene_${sceneIndex}_beat_`;
        blueprintState.beatProgress.completedBeats = blueprintState.beatProgress.completedBeats.filter(
            id => !id.startsWith(prefix)
        );
        console.log(`[Story Mode Blueprint] Beat progress reset for scene ${sceneIndex}`);
    }

    blueprintState.beatProgress.lastUpdated = new Date().toISOString();
    await saveBlueprintState(blueprintState);
}

/**
 * Reset beat progress for a specific scene (alias for backward compatibility)
 * @param {number} sceneIndex - Scene index to reset
 * @param {boolean} resetAll - If true, reset all scenes
 */
export async function resetBeatsForScene(sceneIndex, resetAll = false) {
    await resetBeatProgress(resetAll ? null : sceneIndex);
}

/**
 * Set the current beat focus
 * @param {number|null} sceneIndex - Scene index
 * @param {number|null} beatIndex - Beat index (null to clear focus)
 */
export async function setCurrentBeatFocus(sceneIndex, beatIndex) {
    const blueprintState = getBlueprintState();
    blueprintState.beatProgress.currentBeatFocus = (sceneIndex === null || beatIndex === null)
        ? null
        : `scene_${sceneIndex}_beat_${beatIndex}`;
    await saveBlueprintState(blueprintState);
}
