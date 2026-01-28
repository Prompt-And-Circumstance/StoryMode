/**
 * Scene Pacing Module
 *
 * Handles scene progression calculations for blueprint-driven stories.
 * Provides functions to determine current scene, calculate pacing info,
 * and advance scenes in manual mode.
 *
 * These are pure functions with no external state dependencies.
 */

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get detailed pacing information for the current scene.
 * Calculates scene boundaries based on expected_rounds (if defined) or
 * distributes scenes evenly across the arc length.
 *
 * @param {Object} blueprint - The blueprint object
 * @param {number} currentStep - Current round/step in the story
 * @param {number} arcLength - Total arc length (rounds)
 * @param {string} sceneMode - 'auto' or 'manual'
 * @param {number} manualSceneIndex - Manual scene index (for manual mode)
 * @returns {Object|null} Pacing info or null if no blueprint
 */
export function getScenePacingInfo(blueprint, currentStep, arcLength, sceneMode = 'auto', manualSceneIndex = 0) {
    if (!blueprint || !blueprint.scene_plan || blueprint.scene_plan.length === 0) {
        return null;
    }

    const totalScenes = blueprint.scene_plan.length;

    // Check if any scenes have explicit expected_rounds
    const hasExplicitRounds = blueprint.scene_plan.some(s => s.expected_rounds && typeof s.expected_rounds === 'number');

    let sceneIndex, clampedSceneIndex, scene, sceneStartRound, sceneEndRound, expectedSceneRounds;

    // Helper to calculate scene boundaries (needed for both modes)
    const calculateSceneBoundaries = () => {
        if (hasExplicitRounds) {
            // Use explicit scene durations
            const explicitTotal = blueprint.scene_plan.reduce((sum, s) =>
                sum + (s.expected_rounds || 0), 0
            );
            const scenesWithoutRounds = blueprint.scene_plan.filter(s => !s.expected_rounds).length;
            const remainingRounds = Math.max(0, arcLength - explicitTotal);
            const roundsPerDynamicScene = scenesWithoutRounds > 0
                ? Math.floor(remainingRounds / scenesWithoutRounds)
                : 0;

            let cumulativeRounds = 0;
            const boundaries = [];
            for (let i = 0; i < totalScenes; i++) {
                const sceneRounds = blueprint.scene_plan[i].expected_rounds || roundsPerDynamicScene;
                const sceneEnd = cumulativeRounds + sceneRounds;
                boundaries.push({ start: cumulativeRounds, end: sceneEnd, rounds: sceneRounds });
                cumulativeRounds += sceneRounds;
            }
            return boundaries;

        } else {
            // Dynamic distribution
            const boundaries = [];
            for (let i = 0; i < totalScenes; i++) {
                const start = Math.floor((i / totalScenes) * arcLength);
                const end = Math.floor(((i + 1) / totalScenes) * arcLength);
                boundaries.push({ start, end, rounds: Math.max(1, end - start) });
            }
            return boundaries;
        }
    };

    const boundaries = calculateSceneBoundaries();

    if (sceneMode === 'manual') {
        // MANUAL MODE: Force the selected scene
        const foundSceneIndex = Math.max(0, Math.min(manualSceneIndex, totalScenes - 1));

        // Use the natural boundaries of this scene to calculate relative progress
        const boundary = boundaries[foundSceneIndex];
        sceneStartRound = boundary.start;
        sceneEndRound = boundary.end;
        expectedSceneRounds = boundary.rounds;

        sceneIndex = foundSceneIndex;
        clampedSceneIndex = foundSceneIndex;
        scene = blueprint.scene_plan[clampedSceneIndex];

    } else {
        // AUTO MODE: Calculate based on currentStep
        let foundSceneIndex = 0;

        // Find which boundary contains the current step
        for (let i = 0; i < totalScenes; i++) {
            if (currentStep < boundaries[i].end) {
                foundSceneIndex = i;
                break;
            }
        }

        // If past the end, clamp to last scene
        if (currentStep >= boundaries[totalScenes - 1].end) {
            foundSceneIndex = totalScenes - 1;
        }

        const boundary = boundaries[foundSceneIndex];
        sceneStartRound = boundary.start;
        sceneEndRound = boundary.end;
        expectedSceneRounds = boundary.rounds;

        sceneIndex = foundSceneIndex;
        clampedSceneIndex = foundSceneIndex;
        scene = blueprint.scene_plan[clampedSceneIndex];
    }

    // Calculate progress within scene
    // Note: In manual mode, this might result in negative numbers (if before start)
    // or > 100% (if after end), which is informative for the user.
    const roundInScene = Math.max(0, currentStep - sceneStartRound);
    const roundsRemaining = sceneEndRound - currentStep; // Can be negative in manual/overtime
    const percentThroughScene = expectedSceneRounds > 0
        ? Math.round((roundInScene / expectedSceneRounds) * 100)
        : 0;

    return {
        scene,
        sceneIndex: clampedSceneIndex,
        totalScenes,
        sceneStartRound,
        sceneEndRound,
        expectedSceneRounds,
        roundInScene,
        roundsRemaining,
        percentThroughScene,
    };
}

/**
 * Get the current scene based on blueprint state and round progress.
 * Simpler than getScenePacingInfo - just returns the scene object with index.
 *
 * @param {Object} blueprint - The blueprint object
 * @param {number} currentStep - Current round/step in the story
 * @param {number} arcLength - Total arc length (rounds)
 * @param {string} sceneMode - 'auto' or 'manual'
 * @param {number} manualSceneIndex - Manual scene index (for manual mode)
 * @returns {Object|null} Current scene object with index, or null if no blueprint
 */
export function getCurrentScene(blueprint, currentStep, arcLength, sceneMode = 'auto', manualSceneIndex = 0) {
    if (!blueprint || !blueprint.scene_plan || blueprint.scene_plan.length === 0) {
        return null;
    }

    let sceneIndex;

    if (sceneMode === 'manual') {
        // Manual mode: use the stored scene index
        sceneIndex = Math.max(0, Math.min(manualSceneIndex, blueprint.scene_plan.length - 1));
    } else {
        // Auto mode: calculate scene based on round progress
        // Distribute scenes evenly across the arc length
        const progress = currentStep / arcLength;
        sceneIndex = Math.floor(progress * blueprint.scene_plan.length);
        // Clamp to valid range
        sceneIndex = Math.max(0, Math.min(sceneIndex, blueprint.scene_plan.length - 1));
    }

    return {
        index: sceneIndex,
        ...blueprint.scene_plan[sceneIndex],
    };
}

/**
 * Advance the scene index manually (for manual mode).
 * Clamps result to valid range [0, maxScenes - 1].
 *
 * @param {number} currentIndex - Current scene index
 * @param {number} direction - 1 for forward, -1 for backward
 * @param {number} maxScenes - Total number of scenes
 * @returns {number} New scene index
 */
export function advanceSceneIndex(currentIndex, direction, maxScenes) {
    const newIndex = currentIndex + direction;
    // Clamp to valid range [0, maxScenes - 1]
    return Math.max(0, Math.min(newIndex, maxScenes - 1));
}
