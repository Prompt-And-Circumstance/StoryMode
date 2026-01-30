/**
 * Validation helpers for blueprint generation
 * @module generation/validation
 */

/**
 * Validate that a phase result is safe to merge
 */
export function validatePhaseResult(phaseResult, phase) {
    if (!phaseResult || typeof phaseResult !== 'object') {
        throw new Error(`Phase ${phase}: Invalid result - expected object, got ${typeof phaseResult}`);
    }

    if (Array.isArray(phaseResult)) {
        throw new Error(`Phase ${phase}: Invalid result - expected object, got array`);
    }

    const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
    for (const key of dangerousKeys) {
        if (Object.prototype.hasOwnProperty.call(phaseResult, key)) {
            throw new Error(`Phase ${phase}: Invalid result - dangerous key "${key}" detected`);
        }
    }

    return phaseResult;
}

/**
 * Validate phase output data
 */
export function validatePhaseOutput(phase, data) {
    if (!data || typeof data !== 'object') {
        throw new Error('Output must be an object');
    }

    if (phase === 3) {
        if (!Array.isArray(data.scene_plan) || data.scene_plan.length === 0) {
            throw new Error('Response missing or empty "scene_plan" array');
        }

        data.scene_plan.forEach((scene, i) => {
            if (!Array.isArray(scene.beats) || scene.beats.length === 0) {
                const title = scene.title || 'Untitled';
                throw new Error(`Scene ${i + 1} ("${title}") missing "beats" array. Every scene must have at least 3 beats.`);
            }
        });
    }

    if (phase === 4) {
        if (!data.primary_ending) throw new Error('Response missing "primary_ending"');
        if (!data.blueprint_title && !data.title) throw new Error('Response missing "blueprint_title"');
    }

    return true;
}

/**
 * Get scene identifier for error messages
 * @param {Object} scene - Scene object
 * @param {number} index - Scene index
 * @returns {string} Human-readable identifier
 */
function getSceneIdentifier(scene, index) {
    return scene.title ? `("${scene.title}")` : index;
}

/**
 * Validate scene plan output (Phase 3a - lightweight outlines)
 * @param {Object} data - Parsed JSON output
 * @returns {boolean} True if valid
 * @throws {Error} If validation fails
 */
export function validateScenePlanOutput(data) {
    if (!data || typeof data !== 'object') {
        throw new Error('Scene plan output must be an object');
    }
    if (!Array.isArray(data.scene_plan) || data.scene_plan.length === 0) {
        throw new Error('Scene plan missing or empty "scene_plan" array');
    }

    const requiredFields = ['title', 'phase', 'purpose'];
    data.scene_plan.forEach((scene, i) => {
        const missing = requiredFields.find(field => !scene[field]);
        if (missing) {
            throw new Error(`Scene plan outline ${getSceneIdentifier(scene, i)} missing "${missing}"`);
        }
    });

    return true;
}

/**
 * Validate scene batch output (Phase 3b..3n - full detail)
 * @param {Object} data - Parsed JSON output
 * @param {Array<number>} expectedIndices - Expected scene indices
 * @returns {boolean} True if valid
 * @throws {Error} If validation fails
 */
export function validateSceneBatchOutput(data, expectedIndices) {
    if (!data || typeof data !== 'object') {
        throw new Error('Scene batch output must be an object');
    }
    if (!Array.isArray(data.scenes) || data.scenes.length === 0) {
        throw new Error('Scene batch missing or empty "scenes" array');
    }

    data.scenes.forEach((scene, i) => {
        if (!Array.isArray(scene.beats) || scene.beats.length === 0) {
            throw new Error(`Batch scene ${i} ${getSceneIdentifier(scene, i)} missing "beats" array`);
        }
    });

    // Warn (but don't throw) if indices don't match expected
    if (expectedIndices?.length) {
        const actualIndices = data.scenes.map(s => s.index);
        const missing = expectedIndices.filter(idx => !actualIndices.includes(idx));
        if (missing.length > 0) {
            console.warn(`[Story Mode] Scene batch: expected indices ${expectedIndices}, got ${actualIndices}. Missing: ${missing}`);
        }
    }

    return true;
}
