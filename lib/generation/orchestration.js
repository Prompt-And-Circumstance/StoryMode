/**
 * @file Generation orchestration for phased blueprint creation
 * @module generation/orchestration
 *
 * Handles the multi-phase blueprint generation process including:
 * - Phase execution with retries
 * - LLM calls via Connection Manager
 * - Metrics tracking
 * - Opening message generation
 */

import { PHASE_CONFIG } from '../core/constants.js';
import { buildPhasePrompt } from './prompts.js';
import { robustParseJSON } from '../blueprint/utils.js';
import { isBlueprintDebugMode, getMockPhaseResponse } from '../debug/mocks.js';
import { ConnectionManagerRequestService } from '/scripts/extensions/shared.js';
import { getTokenCountAsync } from '/scripts/tokenizers.js';
import { generateRaw } from '/script.js';
import * as PromptTemplates from './templates.js';

// Module-level state (set via initOrchestration)
let _generateBlueprintId = null;
let _getConnectionProfiles = null;
let _extension_settings = null;
let _MODULE_NAME = null;
let _main_api = null;

/**
 * Initialize orchestration module with required dependencies
 * Must be called before using any generation functions
 * @param {Object} deps - Dependencies object
 */
export function initOrchestration(deps) {
    _generateBlueprintId = deps.generateBlueprintId;
    _getConnectionProfiles = deps.getConnectionProfiles;
    _extension_settings = deps.extension_settings;
    _MODULE_NAME = deps.MODULE_NAME;
    _main_api = deps.main_api;
}

// ============================================================
// METRICS TRACKING
// ============================================================

/**
 * Initialize metrics storage in window global
 */
function initializeMetricsStorage() {
    if (!window.__blueprintMetrics) {
        window.__blueprintMetrics = [];
        console.log('[Story Mode Blueprint] Metrics tracking initialized. Access via: window.__blueprintMetrics');
    }
}

/**
 * Store phase metrics for performance analysis
 * @param {Object} metrics - Metrics object with timing and token data
 */
function storePhaseMetrics(metrics) {
    initializeMetricsStorage();
    window.__blueprintMetrics.push(metrics);

    // Log summary table for easy viewing
    const summary = {
        'Phase': `${metrics.phase} (${metrics.phaseName})`,
        'Duration': `${(metrics.duration / 1000).toFixed(1)}s`,
        'Prompt Tokens': metrics.promptTokens,
        'System Tokens': metrics.systemTokens,
        'Requested Output': metrics.requestedOutputTokens,
        'Actual Output': metrics.actualOutputLength || '?',
        'Tokens/sec': metrics.tokensPerSecond || '?',
        'Success': metrics.success ? '✓' : '✗',
    };

    console.log('[Story Mode Blueprint] Phase Metrics:');
    console.table([summary]);
}

// ============================================================
// VALIDATION HELPERS
// ============================================================

/**
 * Validate that a phase result is safe to merge into the blueprint
 * Checks for null, primitive types, arrays, and prototype pollution attempts
 * @param {Object} phaseResult - Result from executePhase
 * @param {number} phase - Phase number for error reporting
 * @returns {Object} Validated phase result
 * @throws {Error} If phase result is invalid
 */
function validatePhaseResult(phaseResult, phase) {
    // Reject null/undefined
    if (!phaseResult || typeof phaseResult !== 'object') {
        throw new Error(`Phase ${phase}: Invalid result - expected object, got ${typeof phaseResult}`);
    }

    // Reject arrays
    if (Array.isArray(phaseResult)) {
        throw new Error(`Phase ${phase}: Invalid result - expected object, got array`);
    }

    // Check for prototype pollution attempts
    const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
    for (const key of dangerousKeys) {
        if (Object.prototype.hasOwnProperty.call(phaseResult, key)) {
            throw new Error(`Phase ${phase}: Invalid result - dangerous key "${key}" detected`);
        }
    }

    return phaseResult;
}

/**
 * Validate output for a specific phase
 * @param {number} phase - Phase number
 * @param {Object} data - Phase output data
 * @throws {Error} If validation fails
 */
function validatePhaseOutput(phase, data) {
    if (!data || typeof data !== 'object') {
        throw new Error('Output must be an object');
    }

    if (phase === 3) { // Scenes Phase
        if (!data.scene_plan || !Array.isArray(data.scene_plan)) {
            throw new Error('Response missing "scene_plan" array');
        }
        if (data.scene_plan.length === 0) {
            throw new Error('Scene plan is empty');
        }

        // Strict validation for beats
        data.scene_plan.forEach((scene, index) => {
            if (!scene.beats || !Array.isArray(scene.beats) || scene.beats.length === 0) {
                throw new Error(`Scene ${index + 1} ("${scene.title || 'Untitled'}") is missing "beats" array. Every scene must have at least 3 beats.`);
            }
        });
    }

    if (phase === 4) { // Resolutions Phase
        if (!data.primary_ending) {
            throw new Error('Response missing "primary_ending"');
        }
        if (!data.blueprint_title && !data.title) {
            if (!data.blueprint_title) throw new Error('Response missing "blueprint_title"');
        }
    }

    return true;
}

// ============================================================
// LLM CLIENT
// ============================================================

/**
 * Generate text using Connection Manager with preset configuration
 * Includes retry logic for reasoning parameter errors (GLM 4.7)
 * @param {Object} options - Options with prompt, systemPrompt, responseLength, profileId, phase, phaseName
 * @returns {Promise<string>} Generated text
 */
export async function generateWithPreset(options) {
    const selectedProfileId = options.profileId ?? _extension_settings[_MODULE_NAME]?.blueprintSettings?.generationApi;

    if (!selectedProfileId) {
        console.error('[Story Mode Blueprint] No profile selected!');
        throw new Error('No API profile selected for blueprint generation. Please select a provider in Blueprint Settings.');
    }

    console.log('[Story Mode Blueprint] Using profile:', selectedProfileId);

    // Initialize metrics tracking
    const startTime = performance.now();
    const metrics = {
        phase: options.phase || '?',
        phaseName: options.phaseName || 'Unknown',
        startTime,
        requestedOutputTokens: options.responseLength || 0,
        profileId: selectedProfileId,
    };

    // Count tokens in prompt and system prompt (async)
    try {
        metrics.promptTokens = await getTokenCountAsync(options.prompt);
        metrics.systemTokens = options.systemPrompt ? await getTokenCountAsync(options.systemPrompt) : 0;
        metrics.totalInputTokens = metrics.promptTokens + metrics.systemTokens;
    } catch (tokenError) {
        console.warn('[Story Mode Blueprint] Token counting failed:', tokenError);
        metrics.promptTokens = '?';
        metrics.systemTokens = '?';
        metrics.totalInputTokens = '?';
    }

    const messages = [];
    if (options.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: options.prompt });

    try {
        const result = await ConnectionManagerRequestService.sendRequest(
            selectedProfileId,
            messages,
            options.responseLength || 0,
            { stream: false, extractData: true }
        );

        const endTime = performance.now();
        const output = result.text || result.content || '';

        // Capture success metrics
        metrics.endTime = endTime;
        metrics.duration = endTime - startTime;
        metrics.actualOutputLength = output.length;
        metrics.actualOutputTokens = result.usage?.completion_tokens || '?';
        metrics.totalTokensUsed = result.usage?.total_tokens || '?';
        metrics.success = true;

        // Calculate tokens per second if we have the data
        if (typeof metrics.actualOutputTokens === 'number' && metrics.duration > 0) {
            metrics.tokensPerSecond = Math.round((metrics.actualOutputTokens / metrics.duration) * 1000);
        }

        // Store metrics for analysis
        storePhaseMetrics(metrics);

        return output;
    } catch (error) {
        // Log the full error for debugging
        console.error('[Story Mode Blueprint] Full error object:', error);
        console.error('[Story Mode Blueprint] Error message:', error.message);
        console.error('[Story Mode Blueprint] Error cause:', error.cause);
        console.error('[Story Mode Blueprint] Error cause message:', error.cause?.message);

        // Check if this is a reasoning parameter error (GLM 4.7 doesn't support auto reasoning)
        // The error might be in error.message, error.cause, error.cause.message, or nested in the error object
        const errorString = JSON.stringify(error);
        const errorMessage = error.message || '';
        const errorCauseMessage = error.cause?.message || '';
        const errorCauseString = error.cause ? JSON.stringify(error.cause) : '';

        // Combine all error sources for checking
        const allErrorText = `${errorMessage} ${errorCauseMessage} ${errorString} ${errorCauseString}`;

        // Check for the specific reasoning parameter error
        const hasInvalidOption = allErrorText.includes('Invalid option');
        const hasReasoningLevels = allErrorText.includes('xhigh') || allErrorText.includes('medium') ||
            allErrorText.includes('minimal') || allErrorText.includes('none');

        // Also detect "Bad Request" errors which may indicate reasoning parameter issues with GLM 4.7
        const isBadRequest = errorMessage.includes('Bad Request') ||
            errorCauseMessage.includes('Bad Request') ||
            errorMessage.includes('API request failed');

        const isReasoningError = (hasInvalidOption && hasReasoningLevels) || isBadRequest;

        console.log('[Story Mode Blueprint] Error detection:', {
            hasInvalidOption,
            hasReasoningLevels,
            isBadRequest,
            isReasoningError
        });

        if (isReasoningError) {
            console.warn('[Story Mode Blueprint] ========================================');
            console.warn('[Story Mode Blueprint] DETECTED REASONING PARAMETER ERROR');
            console.warn('[Story Mode Blueprint] Retrying with explicit reasoning effort...');
            console.warn('[Story Mode Blueprint] ========================================');
            console.warn('[Story Mode Blueprint] Original error:', errorMessage || errorString);

            try {
                // Retry with explicit reasoning effort parameter
                // reasoning must be passed in overridePayload (5th param), not custom (4th param)
                // Also disable preset to prevent it from overriding our reasoning setting
                console.log('[Story Mode Blueprint] Sending retry with reasoning: { effort: "high" } in overridePayload (preset disabled)');
                const retryResult = await ConnectionManagerRequestService.sendRequest(
                    selectedProfileId,
                    messages,
                    options.responseLength || 0,
                    { stream: false, extractData: true, includePreset: false },
                    { reasoning: { effort: 'high' }, include_reasoning: true }  // overridePayload
                );

                const endTime = performance.now();
                const output = retryResult.text || retryResult.content || '';

                console.log('[Story Mode Blueprint] ========================================');
                console.log('[Story Mode Blueprint] RETRY SUCCEEDED!');
                console.log('[Story Mode Blueprint] Output length:', output.length);
                console.log('[Story Mode Blueprint] ========================================');

                // Capture success metrics for retry
                metrics.endTime = endTime;
                metrics.duration = endTime - startTime;
                metrics.actualOutputLength = output.length;
                metrics.actualOutputTokens = retryResult.usage?.completion_tokens || '?';
                metrics.totalTokensUsed = retryResult.usage?.total_tokens || '?';
                metrics.success = true;
                metrics.retried = true;
                metrics.retryReason = 'reasoning_parameter_error';

                // Calculate tokens per second if we have the data
                if (typeof metrics.actualOutputTokens === 'number' && metrics.duration > 0) {
                    metrics.tokensPerSecond = Math.round((metrics.actualOutputTokens / metrics.duration) * 1000);
                }

                // Store metrics for analysis
                storePhaseMetrics(metrics);

                console.log('[Story Mode Blueprint] Retry with explicit reasoning effort succeeded');
                return output;
            } catch (retryError) {
                // If retry also fails, capture that error
                const endTime = performance.now();
                metrics.endTime = endTime;
                metrics.duration = endTime - startTime;
                metrics.success = false;
                metrics.error = retryError.message;
                metrics.retried = true;
                metrics.retryReason = 'reasoning_parameter_error';

                storePhaseMetrics(metrics);

                console.error('[Story Mode Blueprint] Retry with explicit reasoning effort failed:', retryError);
                throw retryError;
            }
        }

        // Not a reasoning error, or retry failed - capture original error metrics
        const endTime = performance.now();
        metrics.endTime = endTime;
        metrics.duration = endTime - startTime;
        metrics.success = false;
        metrics.error = error.message;

        storePhaseMetrics(metrics);

        console.error('[Story Mode Blueprint] Connection Manager request failed:', error);
        throw error;
    }
}

// ============================================================
// PHASE EXECUTION
// ============================================================

/**
 * Execute a single phase of generation with retries
 * @param {number} phase - Phase number (1-4)
 * @param {Object} request - Blueprint request object
 * @param {Object} storyType - Story type object
 * @param {Object} authorStyle - Author style object (optional)
 * @param {Object} partialBlueprint - Partial blueprint from previous phases
 * @param {string} selectedProfileId - Connection Manager profile ID
 * @param {Object} phaseTokenOverrides - Optional token overrides per phase
 * @returns {Promise<Object>} Phase result data
 */
async function executePhase(phase, request, storyType, authorStyle, partialBlueprint, selectedProfileId, phaseTokenOverrides = {}) {
    const MAX_RETRIES = 2; // Try up to 3 times total (1 initial + 2 retries)
    let lastError = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            // Build phase prompt
            const prompt = await buildPhasePrompt(phase, request, storyType, authorStyle, partialBlueprint);

            // Add retry guidance if this is a retry
            let systemPrompt = 'You are an expert story designer';

            // PERSONA INJECTION: Prime the model with the specific author style
            if (authorStyle && authorStyle.name) {
                systemPrompt += ` specializing in ${storyType.name} stories, writing in the distinct style of ${authorStyle.name}.`;
            } else {
                systemPrompt += '.';
            }

            systemPrompt += ' Output ONLY valid JSON as specified.';

            if (attempt > 0 && lastError) {
                console.log(`[Story Mode Blueprint] Retry attempt ${attempt}/${MAX_RETRIES} for Phase ${phase}. Previous error: ${lastError.message}`);
                systemPrompt += `\n\nPREVIOUS ERROR: Your last response was invalid: ${lastError.message}\nFix this specific error in your new response. Ensure all required fields (like 'beats' arrays) are present.`;
            }

            console.log(`[Story Mode Blueprint] Executing Phase ${phase} (${PHASE_CONFIG[phase].name}) - Attempt ${attempt + 1}/${MAX_RETRIES + 1}...`);

            // Call LLM with phase-specific token limit (use override if provided)
            const phaseConfig = PHASE_CONFIG[phase];
            const maxTokens = phaseTokenOverrides[phase] || phaseConfig.maxTokens;

            // Log token usage
            if (phaseTokenOverrides[phase]) {
                console.log(`[Story Mode Blueprint] Phase ${phase} using OVERRIDDEN token limit: ${maxTokens} (default: ${phaseConfig.maxTokens})`);
            } else {
                console.log(`[Story Mode Blueprint] Phase ${phase} using default token limit: ${maxTokens}`);
            }

            // Check if debug mode is enabled - use mock LLM responses
            let rawText;
            if (isBlueprintDebugMode()) {
                console.log(`[Story Mode Blueprint] DEBUG MODE ENABLED - Using mock response for Phase ${phase}`);
                const mockData = getMockPhaseResponse(phase);
                rawText = JSON.stringify(mockData, null, 2);
                // Simulate a small delay to make it feel more realistic
                await new Promise(resolve => setTimeout(resolve, 500));
            } else {
                rawText = await generateWithPreset({
                    prompt: prompt,
                    systemPrompt: systemPrompt,
                    responseLength: maxTokens,
                    profileId: selectedProfileId,
                    phase: phase, // For metrics tracking
                    phaseName: phaseConfig.name, // For metrics display
                });
            }

            // Log response details for debugging
            console.log(`[Story Mode Blueprint] Phase ${phase} response length:`, rawText?.length || 0);

            if (!rawText || rawText.trim().length === 0) {
                const error = new Error(
                    `Phase ${phase}: Empty response from LLM (using ${maxTokens} tokens). ` +
                    `This may occur with reasoning models that consume all tokens on reasoning. ` +
                    `Try clicking Retry to automatically increase the token limit.`
                );
                error.tokensUsed = maxTokens; // Attach for error handling
                throw error;
            }

            // Parse JSON response
            let phaseData;
            try {
                phaseData = robustParseJSON(rawText);
            } catch (parseError) {
                console.error(`[Story Mode Blueprint] Phase ${phase} parse error:`, parseError);
                console.error(`[Story Mode Blueprint] Raw response preview:`, rawText.substring(0, 500));
                const error = new Error(`Phase ${phase}: Failed to parse JSON response`);
                error.rawResponse = rawText; // Attach raw response for debugging
                error.tokensUsed = maxTokens; // Attach for error handling
                throw error;
            }

            // VALIDATE PHASE OUTPUT (New Validation Step)
            validatePhaseOutput(phase, phaseData);

            console.log(`[Story Mode Blueprint] Phase ${phase} complete:`, Object.keys(phaseData));

            return phaseData;

        } catch (error) {
            lastError = error;
            console.warn(`[Story Mode Blueprint] Phase ${phase} failed attempt ${attempt + 1}: ${error.message}`);

            // If we have retries left, continue loop
            if (attempt < MAX_RETRIES) {
                continue;
            }

            // If no retries left, attach info and rethrow
            if (!error.tokensUsed) {
                // Add token usage helper if not present, though executePhase logic usually adds it
                // We can't easily access maxTokens here unless we duplicate logic, but it's fine
            }
            throw error;
        }
    }
}

// ============================================================
// MAIN ORCHESTRATION
// ============================================================

/**
 * Generate a blueprint using phased approach (4 phases)
 * @param {Object} request - Blueprint request object
 * @param {Array} storyTypes - Array of available story types
 * @param {Array} authorStyles - Array of available author styles
 * @param {Function} onPhaseUpdate - Callback for phase progress updates
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} Result object with success, blueprint, and error info
 */
export async function generateBlueprintPhased(request, storyTypes, authorStyles, onPhaseUpdate, options = {}) {
    const { startPhase = 1, partialBlueprint: initialBlueprint = null, phaseTokenOverrides = {} } = options;

    try {
        // Find story type and author style
        const storyType = storyTypes.find(t => t.id === request.story_type_id);
        if (!storyType) {
            throw new Error(`Story type not found: ${request.story_type_id}`);
        }

        const authorStyle = request.author_style
            ? authorStyles.find(s => s.id === request.author_style)
            : null;

        // Capture the selected profile ID
        const selectedProfileId = _extension_settings[_MODULE_NAME]?.blueprintSettings?.generationApi || null;

        // Initialize or continue with partial blueprint
        const partialBlueprint = initialBlueprint || {
            story_type_id: request.story_type_id,
            story_type_name: storyType.name,
        };
        // Ensure blueprint_id exists (for both new and retry scenarios)
        if (!partialBlueprint.blueprint_id) {
            partialBlueprint.blueprint_id = _generateBlueprintId();
        }

        // Track token usage per phase for error reporting
        const phaseTokensUsed = {};

        // Execute phases from startPhase to 5
        for (const phaseNum of [1, 2, 3, 4].filter(p => p >= startPhase)) {
            const config = PHASE_CONFIG[phaseNum];

            // Emit phase update BEFORE starting (to show this phase as "current")
            onPhaseUpdate?.(phaseNum, config.progress, {
                phase: config.name,
                description: config.description,
                partialBlueprint
            });

            try {
                const phaseResult = await executePhase(phaseNum, request, storyType, authorStyle, partialBlueprint, selectedProfileId, phaseTokenOverrides);
                Object.assign(partialBlueprint, validatePhaseResult(phaseResult, phaseNum));
            } catch (phaseError) {
                console.error(`[Story Mode Blueprint] Phase ${phaseNum} error:`, phaseError);
                const errorResult = {
                    success: false,
                    error: phaseError.message,
                    rawResponse: phaseError.rawResponse || null,
                    phase: phaseNum,
                    phaseName: config.name,
                    phaseTokensUsed: phaseError.tokensUsed || phaseTokenOverrides[phaseNum] || config.maxTokens,
                    partialBlueprint: { ...partialBlueprint },
                    request: { ...request }
                };
                // Emit error event with phase information
                onPhaseUpdate?.(phaseNum, config.progress, {
                    phase: config.name,
                    description: config.description,
                    partialBlueprint,
                    error: errorResult
                });
                return errorResult;
            }
        }

        // Add metadata
        partialBlueprint.arc_structure = partialBlueprint.arc_structure || {};
        partialBlueprint.arc_structure.total_messages_target = request.total_messages_target;
        partialBlueprint.author_style = request.author_style;

        // Preserve user's original scenario input
        if (request.user_scenario) {
            partialBlueprint.user_scenario = request.user_scenario;
        }

        if (request.author_style && authorStyles) {
            const authorStyleObj = authorStyles.find(s => s.id === request.author_style);
            if (authorStyleObj) {
                partialBlueprint.author_style_name = authorStyleObj.name;
                partialBlueprint.author_style_prompt = authorStyleObj.authorPrompt;
            }
        }

        // Capture LLM descriptor
        if (selectedProfileId) {
            const profiles = _getConnectionProfiles();
            const usedProfile = profiles.find(p => p.id === selectedProfileId);
            if (usedProfile && usedProfile.model) {
                partialBlueprint.llmDescriptor = usedProfile.model;
            } else {
                // Safely extract profile ID prefix for display
                const profilePrefix = selectedProfileId && typeof selectedProfileId === 'string' && selectedProfileId.length >= 8
                    ? selectedProfileId.substring(0, 8)
                    : '????????';
                partialBlueprint.llmDescriptor = `Unknown Profile (${profilePrefix}...)`;
            }
        } else {
            partialBlueprint.llmDescriptor = `Main API (${_main_api || 'Unknown'})`;
        }

        console.log('[Story Mode Blueprint] Phased generation complete:', partialBlueprint.blueprint_id);

        return {
            success: true,
            blueprint: partialBlueprint,
        };
    } catch (error) {
        console.error('[Story Mode Blueprint] Phased generation error:', error);
        return {
            success: false,
            error: error.message,
            partialBlueprint: initialBlueprint || null,
            request: { ...request }
        };
    }
}

/**
 * Generate an opening message for the blueprint
 * @param {Object} blueprint - The blueprint object
 * @param {string} [modelOverride] - Optional model override
 * @returns {Promise<string>} Generated opening message
 */
export async function generateOpeningMessage(blueprint, modelOverride = null) {
    // Validate blueprint has required data
    if (!blueprint.scene_plan || blueprint.scene_plan.length === 0) {
        throw new Error('Blueprint must have at least one scene to generate an opening message.');
    }

    const firstScene = blueprint.scene_plan[0];
    const setting = blueprint.setting || {};
    const antagonist = blueprint.antagonistic_forces || {};
    const arcStructure = blueprint.arc_structure || {};
    const toneAndStyle = blueprint.tone_and_style || {};
    const protagonistGroup = blueprint.protagonist_group || {};
    const characters = blueprint.character_arcs || [];

    // Build prompt with full blueprint context
    const prompt = await PromptTemplates.buildOpeningMessagePrompt({
        corePremise: blueprint.core_premise,
        location: setting.location || 'Unknown',
        timePeriod: setting.time_period || 'Unknown',
        atmosphere: setting.atmosphere || 'Unknown',
        antagonist,
        arcStructure,
        toneAndStyle,
        protagonistGroup,
        characters,
        sceneTitle: firstScene.title,
        scenePhase: firstScene.phase,
        scenePurpose: firstScene.purpose,
        sceneSituation: firstScene.situation,
    });

    const systemPrompt = 'You are an expert story narrator. Write a compelling opening message for an interactive story.';

    // Build messages array for the LLM
    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
    ];

    // Call LLM using SillyTavern's built-in generateRaw
    // This avoids connection profile complications and uses the main API
    console.log('[Story Mode] Generating opening message...');
    const response = await generateRaw(prompt, '', false, false, systemPrompt);

    if (!response) {
        throw new Error('No response from LLM');
    }

    return response.trim();
}
