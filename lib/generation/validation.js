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
