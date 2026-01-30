/**
 * @file Staged scene generation orchestrator
 * @module generation/staged-scenes
 *
 * Breaks Phase 3 into sub-phases:
 *   3a: Generate lightweight scene plan (outlines only)
 *   3b..3n: Generate full scene details in batches of 3
 *
 * Each sub-step has its own retry loop. On batch failure, completed
 * scenes are preserved and retry resumes from the failed batch.
 */

import { STAGED_SCENE_CONFIG } from '../core/constants.js';
import { generateWithPreset, buildSystemPrompt } from './orchestration.js';
import { robustParseJSON } from '../blueprint/utils.js';
import { validateScenePlanOutput, validateSceneBatchOutput } from './validation.js';
import { buildScenePlanPrompt, buildSceneBatchPrompt } from './staged-prompts.js';
import { isBlueprintDebugMode, getMockStagedResponse } from '../debug/mocks.js';

// ============================================================================
// BATCH CALCULATION
// ============================================================================

/**
 * Calculate batch groupings for scenes
 * @param {number} totalScenes - Total number of scenes
 * @param {number} batchSize - Scenes per batch
 * @returns {Array<Array<number>>} Array of index arrays, e.g. [[0,1,2], [3,4,5], ...]
 */
export function calculateBatches(totalScenes, batchSize) {
    const batches = [];
    for (let i = 0; i < totalScenes; i += batchSize) {
        const endIndex = Math.min(i + batchSize, totalScenes);
        batches.push(Array.from({ length: endIndex - i }, (_, idx) => i + idx));
    }
    return batches;
}

// ============================================================================
// LLM CALL HELPERS
// ============================================================================

/**
 * Call LLM with debug mode support for staged phases
 * @param {string} subPhase - '3a' or '3b'
 * @param {string} prompt - User prompt
 * @param {string} systemPrompt - System prompt
 * @param {number} maxTokens - Max output tokens
 * @param {string} profileId - Connection profile ID
 * @param {number} [batchIndex] - Batch index for 3b mock
 * @returns {Promise<string>} Raw response text
 */
async function callLLMForStagedPhase(subPhase, prompt, systemPrompt, maxTokens, profileId, batchIndex) {
    if (isBlueprintDebugMode()) {
        const mockData = getMockStagedResponse(subPhase, batchIndex);
        await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 400));
        return JSON.stringify(mockData, null, 2);
    }
    return generateWithPreset({
        prompt,
        systemPrompt,
        responseLength: maxTokens,
        profileId,
        phase: 3,
        phaseName: subPhase === '3a' ? 'Scene Plan' : `Scene Batch ${(batchIndex ?? 0) + 1}`,
    });
}

/**
 * Parse and validate a staged phase response
 * @param {string} subPhase - '3a' or '3b'
 * @param {string} rawText - Raw LLM response
 * @param {number} maxTokens - Token budget used
 * @param {Array<number>} [expectedIndices] - Expected indices for batch validation
 * @returns {Object} Parsed data
 */
function parseStagedResponse(subPhase, rawText, maxTokens, expectedIndices) {
    const createError = (message) => {
        const error = new Error(message);
        error.tokensUsed = maxTokens;
        return error;
    };

    if (!rawText?.trim()) {
        throw createError(`Staged ${subPhase}: Empty response (${maxTokens} tokens)`);
    }

    try {
        const data = robustParseJSON(rawText);
        const validator = subPhase === '3a' ? validateScenePlanOutput : validateSceneBatchOutput;
        validator(data, expectedIndices);
        return data;
    } catch (parseError) {
        console.error(`[Story Mode] Staged ${subPhase} parse error:`, parseError);
        console.error(`[Story Mode] Raw response:`, rawText.substring(0, 500));
        const error = createError(`Staged ${subPhase}: Failed to parse JSON - ${parseError.message}`);
        error.rawResponse = rawText;
        throw error;
    }
}

// ============================================================================
// RETRY HELPER
// ============================================================================

/**
 * Execute an operation with retry loop
 * @param {string} operationName - Name for logging
 * @param {Function} operation - Async function to execute
 * @param {Object} callbacks - Callback functions
 * @returns {Promise<*>} Operation result
 */
async function executeWithRetry(operationName, operation, callbacks) {
    const { maxRetries } = STAGED_SCENE_CONFIG;
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const isRetry = attempt > 0;
        const eventType = isRetry ? 'warning' : 'info';
        const message = isRetry
            ? `Retrying ${operationName} (attempt ${attempt + 1}/${maxRetries + 1})...`
            : `${operationName}...`;

        callbacks.onStatusEvent(eventType, message);

        try {
            return await operation(attempt, lastError);
        } catch (error) {
            lastError = error;
            console.warn(`[Story Mode] ${operationName} attempt ${attempt + 1} failed:`, error.message);

            const isFinalAttempt = attempt === maxRetries;
            const statusType = isFinalAttempt ? 'error' : 'warning';
            const statusMsg = isFinalAttempt
                ? `${operationName} failed after ${maxRetries + 1} attempts: ${error.message}`
                : `${operationName} attempt ${attempt + 1} failed: ${error.message}`;

            callbacks.onStatusEvent(statusType, statusMsg);

            if (isFinalAttempt) throw error;
        }
    }
}

// ============================================================================
// SCENE PLAN EXECUTION (Phase 3a)
// ============================================================================

/**
 * Execute the scene plan phase (3a) with retry loop
 * @param {Object} request - Blueprint request
 * @param {Object} storyType - Story type
 * @param {Object} authorStyle - Author style
 * @param {Object} partialBlueprint - Partial blueprint
 * @param {string} profileId - Profile ID
 * @param {Object} callbacks - Callback functions
 * @returns {Promise<Array>} Scene plan outlines
 */
async function executeScenePlan(request, storyType, authorStyle, partialBlueprint, profileId, callbacks) {
    const { planMaxTokens } = STAGED_SCENE_CONFIG;

    const data = await executeWithRetry(
        'Generating scene outlines (Phase 3a)',
        async (attempt, lastError) => {
            const prompt = await buildScenePlanPrompt(request, storyType, authorStyle, partialBlueprint);
            const systemPrompt = buildSystemPrompt(storyType, authorStyle, attempt, lastError);
            const rawText = await callLLMForStagedPhase('3a', prompt, systemPrompt, planMaxTokens, profileId);
            return parseStagedResponse('3a', rawText, planMaxTokens);
        },
        callbacks
    );

    callbacks.onStatusEvent('success', `Scene plan: ${data.scene_plan.length} scene outlines generated`);
    return data.scene_plan;
}

// ============================================================================
// SCENE BATCH EXECUTION (Phase 3b..3n)
// ============================================================================

/**
 * Execute a single scene batch with retry loop
 * @param {number} batchIndex - Batch number (0-based)
 * @param {Array<number>} sceneIndices - Scene indices in this batch
 * @param {Array} plan - Full scene plan from 3a
 * @param {Array} completedScenes - Scenes from prior batches
 * @param {Object} request - Blueprint request
 * @param {Object} storyType - Story type
 * @param {Object} authorStyle - Author style
 * @param {Object} partialBlueprint - Partial blueprint
 * @param {string} profileId - Profile ID
 * @param {Object} callbacks - Callbacks
 * @returns {Promise<Array>} Detailed scene objects
 */
async function executeSceneBatch(
    batchIndex, sceneIndices, plan, completedScenes,
    request, storyType, authorStyle, partialBlueprint, profileId, callbacks
) {
    const { batchMaxTokens, batchSize } = STAGED_SCENE_CONFIG;
    const indicesStr = sceneIndices.map(i => i + 1).join('-');

    const data = await executeWithRetry(
        `Generating scenes ${indicesStr} (batch ${batchIndex + 1})`,
        async (attempt, lastError) => {
            const prompt = await buildSceneBatchPrompt(
                request, storyType, authorStyle, partialBlueprint,
                plan, completedScenes, sceneIndices, batchSize
            );
            const systemPrompt = buildSystemPrompt(storyType, authorStyle, attempt, lastError);
            const rawText = await callLLMForStagedPhase('3b', prompt, systemPrompt, batchMaxTokens, profileId, batchIndex);
            return parseStagedResponse('3b', rawText, batchMaxTokens, sceneIndices);
        },
        callbacks
    );

    callbacks.onStatusEvent('success', `Batch ${batchIndex + 1}: scenes ${indicesStr} complete`);
    return data.scenes;
}

// ============================================================================
// MERGE HELPERS
// ============================================================================

/**
 * Replace outline entries in the scene plan with detailed scenes
 * @param {Object} partialBlueprint - Blueprint with scene_plan of outlines
 * @param {Array} batchScenes - Detailed scenes from a batch
 */
function mergeBatchIntoBlueprint(partialBlueprint, batchScenes) {
    if (!partialBlueprint.scene_plan) return;
    for (const detailedScene of batchScenes) {
        const idx = partialBlueprint.scene_plan.findIndex(s => s.index === detailedScene.index);
        if (idx !== -1) {
            partialBlueprint.scene_plan[idx] = detailedScene;
        } else {
            // Scene index not found in plan — append
            console.warn(`[Story Mode] Batch scene index ${detailedScene.index} not found in plan, appending`);
            partialBlueprint.scene_plan.push(detailedScene);
        }
    }
}

/**
 * Build metadata for retry state
 * @param {Array} plan - Original scene plan
 * @param {Array<Array<number>>} completedBatchIndices - Completed batch index arrays
 * @param {number} failedBatchIndex - Failed batch number
 * @param {number} totalScenes - Total scene count
 * @param {Array} completedScenes - All completed scenes
 * @returns {Object} Staged metadata for retry
 */
function buildRetryState(plan, completedBatchIndices, failedBatchIndex, totalScenes, completedScenes) {
    return {
        plan,
        completedBatches: completedBatchIndices,
        failedBatch: failedBatchIndex,
        totalScenes,
        completedScenes,
    };
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Initialize scene plan (either resume or generate new)
 * @returns {Promise<{ plan, completedScenes, startBatchIndex }>}
 */
async function initializeScenePlan(request, storyType, authorStyle, partialBlueprint, profileId, callbacks, stagedRetry) {
    if (stagedRetry?.stagedMeta) {
        const meta = stagedRetry.stagedMeta;
        callbacks.onStatusEvent('info', `Resuming from batch ${meta.failedBatch + 1} (${meta.completedScenes?.length || 0} scenes already complete)`);
        return {
            plan: meta.plan,
            completedScenes: meta.completedScenes || [],
            startBatchIndex: meta.failedBatch,
        };
    }

    callbacks.onSubProgress({ subPhase: 'plan' });
    const plan = await executeScenePlan(request, storyType, authorStyle, partialBlueprint, profileId, callbacks);
    partialBlueprint.scene_plan = plan.map(s => ({ ...s }));

    return { plan, completedScenes: [], startBatchIndex: 0 };
}

/**
 * Process a single batch with error handling
 * @returns {Promise<{ success, error?, stagedMeta? }>}
 */
async function processBatch(batchIdx, batches, plan, completedScenes, completedBatchIndices, partialBlueprint, request, storyType, authorStyle, profileId, callbacks, totalScenes) {
    const batchSceneIndices = batches[batchIdx];

    callbacks.onSubProgress({
        subPhase: 'batch',
        batch: batchIdx,
        total: batches.length,
        completedScenes: completedScenes.length,
        totalScenes,
    });

    try {
        const batchScenes = await executeSceneBatch(
            batchIdx, batchSceneIndices, plan, completedScenes,
            request, storyType, authorStyle, partialBlueprint, profileId, callbacks
        );

        mergeBatchIntoBlueprint(partialBlueprint, batchScenes);
        completedScenes.push(...batchScenes);
        completedBatchIndices.push(batchSceneIndices);

        return { success: true };
    } catch (batchError) {
        return {
            success: false,
            error: `Failed generating scenes ${batchSceneIndices.map(i => i + 1).join('-')} (batch ${batchIdx + 1}/${batches.length}): ${batchError.message}`,
            stagedMeta: buildRetryState(plan, completedBatchIndices, batchIdx, totalScenes, completedScenes),
        };
    }
}

/**
 * Execute staged Phase 3 — plan + batched scene generation
 *
 * @param {Object} request - Blueprint request object
 * @param {Object} storyType - Story type object
 * @param {Object} authorStyle - Author style (optional)
 * @param {Object} partialBlueprint - Blueprint with Phases 1-2 data
 * @param {string} profileId - Connection profile ID
 * @param {Object} phaseOverrides - Phase override settings
 * @param {Object} callbacks - Callback contract:
 *   - onSubProgress({ subPhase, batch, total, completedScenes, totalScenes })
 *   - onStatusEvent(type, message, details)
 *   - isCancelled() -> boolean
 * @param {Object} [stagedRetry] - Resume state from failed batch
 *   - stagedMeta: { plan, completedBatches, failedBatch, totalScenes, completedScenes }
 * @returns {Promise<Object>} { success, sceneData, error, stagedMeta }
 */
export async function executeStagedPhase3(
    request, storyType, authorStyle, partialBlueprint,
    profileId, phaseOverrides, callbacks, stagedRetry
) {
    const { batchSize } = STAGED_SCENE_CONFIG;

    try {
        const { plan, completedScenes, startBatchIndex } = await initializeScenePlan(
            request, storyType, authorStyle, partialBlueprint, profileId, callbacks, stagedRetry
        );

        const totalScenes = plan.length;
        const batches = calculateBatches(totalScenes, batchSize);
        const completedBatchIndices = batches.slice(0, startBatchIndex);

        // Process batches
        for (let batchIdx = startBatchIndex; batchIdx < batches.length; batchIdx++) {
            if (callbacks.isCancelled()) {
                callbacks.onStatusEvent('warning', 'Generation cancelled by user');
                return {
                    success: false,
                    error: 'Generation cancelled',
                    sceneData: { scene_plan: partialBlueprint.scene_plan },
                    stagedMeta: buildRetryState(plan, completedBatchIndices, batchIdx, totalScenes, completedScenes),
                    cancelled: true,
                };
            }

            const result = await processBatch(
                batchIdx, batches, plan, completedScenes, completedBatchIndices,
                partialBlueprint, request, storyType, authorStyle, profileId, callbacks, totalScenes
            );

            if (!result.success) {
                return {
                    success: false,
                    error: result.error,
                    sceneData: { scene_plan: partialBlueprint.scene_plan },
                    stagedMeta: result.stagedMeta,
                };
            }
        }

        callbacks.onStatusEvent('success', `All ${totalScenes} scenes generated successfully`);
        return { success: true, sceneData: { scene_plan: partialBlueprint.scene_plan } };

    } catch (error) {
        return {
            success: false,
            error: `Scene plan failed: ${error.message}`,
            sceneData: null,
            stagedMeta: null,
        };
    }
}
