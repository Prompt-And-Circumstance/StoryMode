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

import { PHASE_CONFIG, STAGED_SCENE_CONFIG } from '../core/constants.js';
import { buildPhasePrompt } from './prompts.js';
import { robustParseJSON } from '../blueprint/utils.js';
import { isBlueprintDebugMode, getMockPhaseResponse } from '../debug/mocks.js';
import { getExpectedSceneCount } from './prompts.js';
import { ConnectionManagerRequestService } from '/scripts/extensions/shared.js';
import { generateRaw, eventSource } from '/script.js';
import * as PromptTemplates from './templates.js';
import { validatePhaseResult, validatePhaseOutput } from './validation.js';
import { finalizeMetrics, countTokens } from './metrics.js';

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

// Metrics and validation extracted to separate modules

// ============================================================
// STATUS EVENTS
// ============================================================

/**
 * Emit a detailed status event for the wizard UI
 * @param {string} type - Event type: 'info', 'success', 'warning', 'error'
 * @param {string} message - Status message
 * @param {Object} details - Additional details (phase, phaseName, etc.)
 */
function emitStatusEvent(type, message, details = {}) {
    if (typeof eventSource?.emit === 'function') {
        eventSource.emit('STORY_MODE_GENERATION_STATUS', {
            type,
            message,
            timestamp: Date.now(),
            ...details
        });
    }
}

// ============================================================
// LLM CLIENT
// ============================================================

function isReasoningParameterError(error) {
    const errorText = [
        error.message || '',
        error.cause?.message || '',
        JSON.stringify(error),
        error.cause ? JSON.stringify(error.cause) : ''
    ].join(' ');

    const hasInvalidOption = errorText.includes('Invalid option') && /xhigh|medium|minimal|none/.test(errorText);
    const hasBadRequest = /Bad Request|API request failed/.test(errorText);
    return hasInvalidOption || hasBadRequest;
}

// Metrics functions moved to metrics.js

/**
 * Send request to LLM
 * @param {string} profileId - Profile ID
 * @param {Array} messages - Message array
 * @param {number} maxTokens - Max tokens
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Result object
 */
async function sendLLMRequest(profileId, messages, maxTokens, options = {}) {
    return ConnectionManagerRequestService.sendRequest(
        profileId,
        messages,
        maxTokens,
        { stream: false, extractData: true, ...options }
    );
}

/**
 * Generate text using Connection Manager with preset configuration
 * Includes retry logic for reasoning parameter errors (GLM 4.7)
 * @param {Object} options - Options with prompt, systemPrompt, responseLength, profileId, phase, phaseName
 * @returns {Promise<string>} Generated text
 */
export async function generateWithPreset(options) {
    const selectedProfileId = options.profileId ?? _extension_settings[_MODULE_NAME]?.blueprintSettings?.generationApi;

    if (!selectedProfileId) {
        throw new Error('No API profile selected for blueprint generation. Please select a provider in Blueprint Settings.');
    }

    const startTime = performance.now();
    const metrics = {
        phase: options.phase || '?',
        phaseName: options.phaseName || 'Unknown',
        startTime,
        requestedOutputTokens: options.responseLength || 0,
        profileId: selectedProfileId,
        ...(await countTokens(options.prompt, options.systemPrompt))
    };

    const messages = [];
    if (options.systemPrompt) messages.push({ role: 'system', content: options.systemPrompt });
    messages.push({ role: 'user', content: options.prompt });

    try {
        const result = await sendLLMRequest(selectedProfileId, messages, options.responseLength || 0);
        finalizeMetrics(metrics, startTime, result);

        // Check for truncation (response hit token limit)
        const finishReason = result.choices?.[0]?.finish_reason || result.finish_reason;
        if (finishReason === 'length') {
            const actualTokens = result.usage?.completion_tokens || options.responseLength;
            throw new Error(`Response truncated at ${actualTokens} tokens (will retry with doubled token budget)`);
        }

        return result.text || result.content || '';
    } catch (error) {
        console.error('[Story Mode Blueprint] Error:', error.message);

        if (!isReasoningParameterError(error)) {
            finalizeMetrics(metrics, startTime, null, error);
            throw error;
        }

        console.warn('[Story Mode Blueprint] Retrying with explicit reasoning effort...');

        try {
            const retryResult = await sendLLMRequest(
                selectedProfileId,
                messages,
                options.responseLength || 0,
                { includePreset: false },
                { reasoning: { effort: 'high' }, include_reasoning: true }
            );

            metrics.retried = true;
            metrics.retryReason = 'reasoning_parameter_error';
            finalizeMetrics(metrics, startTime, retryResult);

            // Check for truncation on retry
            const retryFinishReason = retryResult.choices?.[0]?.finish_reason || retryResult.finish_reason;
            if (retryFinishReason === 'length') {
                const actualTokens = retryResult.usage?.completion_tokens || options.responseLength;
                throw new Error(`Response truncated at ${actualTokens} tokens (will retry with doubled token budget)`);
            }

            return retryResult.text || retryResult.content || '';
        } catch (retryError) {
            metrics.retried = true;
            metrics.retryReason = 'reasoning_parameter_error';
            finalizeMetrics(metrics, startTime, null, retryError);
            throw retryError;
        }
    }
}

// ============================================================
// PHASE EXECUTION
// ============================================================

/**
 * Build system prompt for generation (shared across phased and staged)
 * @param {Object} storyType - Story type object
 * @param {Object} authorStyle - Author style (optional)
 * @param {number} attempt - Current retry attempt (0 = first try)
 * @param {Error|null} lastError - Previous error if retrying
 * @returns {string} System prompt
 */
export function buildSystemPrompt(storyType, authorStyle, attempt, lastError) {
    const style = authorStyle?.name
        ? ` specializing in ${storyType.name} stories, writing in the distinct style of ${authorStyle.name}.`
        : '.';

    let prompt = `You are an expert story designer${style} Output ONLY valid JSON as specified.`;

    if (attempt > 0 && lastError) {
        prompt += `\n\nPREVIOUS ERROR: ${lastError.message}\nFix this error and ensure all required fields are present.`;
    }

    return prompt;
}

/**
 * Call LLM for phase (with debug mode support)
 */
async function callLLMForPhase(phase, prompt, systemPrompt, maxTokens, selectedProfileId) {
    if (isBlueprintDebugMode()) {
        const mockData = getMockPhaseResponse(phase);
        await new Promise(resolve => setTimeout(resolve, 500));
        return JSON.stringify(mockData, null, 2);
    }

    const phaseConfig = PHASE_CONFIG[phase];
    return await generateWithPreset({
        prompt,
        systemPrompt,
        responseLength: maxTokens,
        profileId: selectedProfileId,
        phase,
        phaseName: phaseConfig.name
    });
}

function parsePhaseResponse(phase, rawText, maxTokens) {
    if (!rawText?.trim()) {
        const msg = `Phase ${phase}: Empty response (${maxTokens} tokens). ` +
            `This may occur with reasoning models. Try clicking Retry to increase token limit.`;
        const error = new Error(msg);
        error.tokensUsed = maxTokens;
        throw error;
    }

    try {
        const phaseData = robustParseJSON(rawText);
        validatePhaseOutput(phase, phaseData);
        return phaseData;
    } catch (parseError) {
        console.error(`[Story Mode Blueprint] Phase ${phase} parse error:`, parseError);
        console.error(`[Story Mode Blueprint] Raw response:`, rawText.substring(0, 500));
        const error = new Error(`Phase ${phase}: Failed to parse JSON response`);
        error.rawResponse = rawText;
        error.tokensUsed = maxTokens;
        throw error;
    }
}

/**
 * Get display name for a profile
 * @param {string} profileId - Profile ID (or null/empty for Main API)
 * @returns {string} Display name
 */
function getProfileDisplayName(profileId) {
    if (!profileId) return 'Main API';

    const profiles = _getConnectionProfiles?.() || [];
    const profile = profiles.find(p => p.id === profileId);

    return profile?.model || profile?.name || profileId.substring(0, 8);
}

async function executePhase(phase, request, storyType, authorStyle, partialBlueprint, selectedProfileId, phaseOverrides = {}) {
    const MAX_RETRIES = 2;
    let lastError = null;

    const phaseOverride = phaseOverrides?.[phase] || {};
    const effectiveProfileId = phaseOverride.profileId !== undefined ? phaseOverride.profileId : selectedProfileId;
    const phaseConfig = PHASE_CONFIG[phase];
    const effectiveMaxTokens = phaseOverride.maxTokens || phaseConfig.maxTokens;
    const phaseName = phaseConfig.name;
    const profileName = getProfileDisplayName(effectiveProfileId);

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            // Emit: Phase started
            if (attempt === 0) {
                emitStatusEvent('info', `Starting ${phaseName} phase...`, { phase, phaseName });
            } else {
                emitStatusEvent('warning', `Retrying ${phaseName} (attempt ${attempt + 1}/${MAX_RETRIES + 1})...`, { phase, phaseName });
            }

            const prompt = await buildPhasePrompt(phase, request, storyType, authorStyle, partialBlueprint);
            const systemPrompt = buildSystemPrompt(storyType, authorStyle, attempt, lastError);

            // Count tokens in prompt
            const tokenCounts = await countTokens(prompt, systemPrompt);
            const estimatedInputTokens = tokenCounts.totalInputTokens || 0;

            // Emit: Prompt ready (completed task, so use success)
            emitStatusEvent('success',
                `Prompt prepared (~${estimatedInputTokens} tokens) → sending to ${profileName}`,
                { phase, phaseName, inputTokens: estimatedInputTokens, profile: profileName }
            );

            let rawText;

            // Emit: Waiting for response
            emitStatusEvent('info',
                `Waiting for response from ${profileName} (max ${effectiveMaxTokens} tokens)...`,
                { phase, phaseName, maxTokens: effectiveMaxTokens, profile: profileName }
            );

            // Handle null/empty profileId - fall back to generateRaw (Main API)
            if (!effectiveProfileId) {
                console.log(`[Story Mode Blueprint] Phase ${phase}: Using Main API (no profile)`);

                // Call Main API directly (bypasses Connection Manager presets)
                const result = await generateRaw({
                    prompt: prompt,
                    systemPrompt: systemPrompt,
                    responseLength: effectiveMaxTokens
                });
                rawText = result || '';

            } else {
                // Use Connection Manager with preset
                rawText = await callLLMForPhase(phase, prompt, systemPrompt, effectiveMaxTokens, effectiveProfileId);
            }

            // Emit: Response received
            const responseLength = rawText?.length || 0;
            const responseTokens = Math.ceil(responseLength / 4); // Rough estimate
            emitStatusEvent('success',
                `Response received (${responseLength} chars, ~${responseTokens} tokens)`,
                { phase, phaseName, responseLength, responseTokens }
            );

            // Emit: Parsing (in progress)
            emitStatusEvent('info', `Parsing and validating ${phaseName} data...`, { phase, phaseName });

            const result = parsePhaseResponse(phase, rawText, effectiveMaxTokens);

            // Emit: Phase complete (implies parsing succeeded)
            emitStatusEvent('success', `${phaseName} phase completed successfully`, { phase, phaseName });

            return result;

        } catch (error) {
            lastError = error;
            console.warn(`[Story Mode Blueprint] Phase ${phase} attempt ${attempt + 1} failed: ${error.message}`);

            // Emit: Attempt failed (but not the final error if we're retrying)
            if (attempt < MAX_RETRIES) {
                emitStatusEvent('warning',
                    `${phaseName} attempt ${attempt + 1} failed: ${error.message}`,
                    { phase, phaseName, error: error.message }
                );
            } else {
                emitStatusEvent('error',
                    `${phaseName} phase failed after ${MAX_RETRIES + 1} attempts: ${error.message}`,
                    { phase, phaseName, error: error.message }
                );
            }

            if (attempt === MAX_RETRIES) throw error;
        }
    }
}

// ============================================================
// STAGED GENERATION HELPERS
// ============================================================

/**
 * Determine whether staged scene generation should be used
 * @param {Object} request - Blueprint request
 * @returns {boolean} True if staged mode should be used
 */
function shouldUseStagedGeneration(request) {
    const setting = _extension_settings?.[_MODULE_NAME]?.blueprintSettings?.useStagedSceneGeneration;
    if (setting === false) return false; // Explicitly disabled
    // Default true (undefined or true)
    // Auto-fallback: <= threshold scenes uses monolithic
    const sceneText = getExpectedSceneCount(request.total_messages_target);
    const sceneMatch = sceneText.match(/(\d+)/);
    const sceneCount = sceneMatch ? parseInt(sceneMatch[1]) : 10;
    return sceneCount > STAGED_SCENE_CONFIG.autoFallbackThreshold;
}

/**
 * Map staged sub-progress to the Phase 3 progress range (40% - 70%)
 * @param {Object} data - Sub-progress data from staged generation
 * @returns {number} Progress percentage (40-70)
 */
function calculateSubProgress(data) {
    const PHASE_3_START = PHASE_CONFIG[2].progress; // 40
    const PHASE_3_END = PHASE_CONFIG[3].progress;   // 70
    const range = PHASE_3_END - PHASE_3_START;

    if (data.subPhase === 'plan') {
        return PHASE_3_START + Math.round(range * 0.1); // 10% of phase 3 range for plan
    }
    if (data.subPhase === 'batch' && data.total > 0) {
        const batchProgress = (data.batch + 1) / data.total;
        return PHASE_3_START + Math.round(range * (0.1 + 0.9 * batchProgress));
    }
    return PHASE_3_START;
}

// ============================================================
// MAIN ORCHESTRATION
// ============================================================

function addBlueprintMetadata(blueprint, request, storyTypes, authorStyles, selectedProfileId) {
    blueprint.arc_structure = blueprint.arc_structure || {};
    blueprint.arc_structure.total_messages_target = request.total_messages_target;
    blueprint.author_style = request.author_style;

    if (request.user_scenario) {
        blueprint.user_scenario = request.user_scenario;
    }

    // Inline story type fields for export fallback
    if (request.story_type_id) {
        const storyTypeObj = storyTypes.find(s => s.id === request.story_type_id);
        if (storyTypeObj) {
            blueprint.story_type_prompt = storyTypeObj.storyPrompt || '';
            blueprint.story_type_category = storyTypeObj.category || [];
            blueprint.story_type_progress_template = storyTypeObj.progressTemplate || '';
            blueprint.story_type_phase_prompts = storyTypeObj.phasePrompts || {};
            blueprint.story_type_memorable_element = storyTypeObj.memorableElement || null;
        }
    }

    if (request.author_style) {
        const authorStyleObj = authorStyles.find(s => s.id === request.author_style);
        if (authorStyleObj) {
            blueprint.author_style_name = authorStyleObj.name;
            blueprint.author_style_prompt = authorStyleObj.authorPrompt;
            blueprint.author_style_nsfw_prompt = authorStyleObj.nsfwPrompt || '';
        }
    }

    if (selectedProfileId) {
        const profiles = _getConnectionProfiles();
        const usedProfile = profiles.find(p => p.id === selectedProfileId);
        blueprint.llmDescriptor = usedProfile?.model || `Unknown Profile (${selectedProfileId.substring(0, 8)}...)`;
    } else {
        blueprint.llmDescriptor = `Main API (${_main_api || 'Unknown'})`;
    }
}

export async function generateBlueprintPhased(request, storyTypes, authorStyles, onPhaseUpdate, options = {}) {
    const { startPhase = 1, partialBlueprint: initialBlueprint = null, phaseOverrides = {}, stagedRetry } = options;

    try {
        const storyType = storyTypes.find(t => t.id === request.story_type_id);
        if (!storyType) throw new Error(`Story type not found: ${request.story_type_id}`);

        const authorStyle = request.author_style ? authorStyles.find(s => s.id === request.author_style) : null;
        const selectedProfileId = _extension_settings[_MODULE_NAME]?.blueprintSettings?.generationApi || null;

        const partialBlueprint = initialBlueprint || {
            story_type_id: request.story_type_id,
            story_type_name: storyType.name,
        };

        if (!partialBlueprint.blueprint_id) {
            partialBlueprint.blueprint_id = _generateBlueprintId();
        }

        // Track cancellation state from wizard
        let _isCancelled = false;
        const wizardPopup = typeof window !== 'undefined' ? window.storyModeWizardPopup : null;

        for (const phaseNum of [1, 2, 3, 4].filter(p => p >= startPhase)) {
            const config = PHASE_CONFIG[phaseNum];

            onPhaseUpdate?.(phaseNum, config.progress, {
                phase: config.name,
                description: config.description,
                partialBlueprint
            });

            try {
                // Phase 3: Conditionally use staged generation
                if (phaseNum === 3 && (shouldUseStagedGeneration(request) || stagedRetry)) {
                    const { executeStagedPhase3 } = await import('./staged-scenes.js');

                    const stagedCallbacks = {
                        onSubProgress: (data) => {
                            const progress = calculateSubProgress(data);
                            onPhaseUpdate?.(3, progress, {
                                phase: config.name,
                                description: config.description,
                                partialBlueprint,
                                subProgress: data,
                            });
                        },
                        onStatusEvent: (type, message, details) => {
                            emitStatusEvent(type, message, { phase: 3, phaseName: 'Scenes', ...details });
                        },
                        isCancelled: () => _isCancelled || (wizardPopup?.isCancelled === true),
                    };

                    const stagedResult = await executeStagedPhase3(
                        request, storyType, authorStyle, partialBlueprint,
                        selectedProfileId, phaseOverrides, stagedCallbacks, stagedRetry
                    );

                    if (!stagedResult.success) {
                        const errorResult = {
                            success: false,
                            error: stagedResult.error,
                            phase: 3,
                            phaseName: config.name,
                            partialBlueprint: { ...partialBlueprint },
                            request: { ...request },
                            stagedMeta: stagedResult.stagedMeta,
                            cancelled: stagedResult.cancelled || false,
                        };
                        onPhaseUpdate?.(3, config.progress, {
                            phase: config.name,
                            description: config.description,
                            partialBlueprint,
                            error: errorResult,
                        });
                        return errorResult;
                    }

                    // Staged success — scene_plan is already merged into partialBlueprint
                    // Validate the merged result
                    validatePhaseResult({ scene_plan: partialBlueprint.scene_plan }, 3);
                } else {
                    // Standard (monolithic) phase execution
                    const phaseResult = await executePhase(phaseNum, request, storyType, authorStyle, partialBlueprint, selectedProfileId, phaseOverrides);
                    Object.assign(partialBlueprint, validatePhaseResult(phaseResult, phaseNum));
                }
            } catch (phaseError) {
                console.error(`[Story Mode Blueprint] Phase ${phaseNum} error:`, phaseError);
                const errorResult = {
                    success: false,
                    error: phaseError.message,
                    rawResponse: phaseError.rawResponse || null,
                    phase: phaseNum,
                    phaseName: config.name,
                    phaseTokensUsed: phaseError.tokensUsed || phaseOverrides[phaseNum]?.maxTokens || config.maxTokens,
                    partialBlueprint: { ...partialBlueprint },
                    request: { ...request }
                };

                onPhaseUpdate?.(phaseNum, config.progress, {
                    phase: config.name,
                    description: config.description,
                    partialBlueprint,
                    error: errorResult
                });

                return errorResult;
            }
        }

        addBlueprintMetadata(partialBlueprint, request, storyTypes, authorStyles, selectedProfileId);

        return { success: true, blueprint: partialBlueprint };

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
 * Generate a blueprint using phased generation.
 * This is the main entry point for blueprint generation.
 *
 * @param {Object} request - Blueprint request object
 * @param {Array} storyTypes - Array of available story types
 * @param {Array} authorStyles - Array of available author styles
 * @param {Object} options - Generation options
 * @param {number} options.startPhase - Phase to start from (for retries)
 * @param {Object} options.partialBlueprint - Partial blueprint (for retries)
 * @param {Object} options.phaseOverrides - Per-phase setting overrides
 * @returns {Promise<Object>} Generated blueprint or error
 */
export async function generateBlueprint(request, storyTypes, authorStyles, options = {}) {
    const { startPhase, partialBlueprint, phaseOverrides = {}, stagedRetry } = options;

    return generateBlueprintPhased(request, storyTypes, authorStyles, (phase, progress, data) => {
        // Emit phase update event (including error if present)
        eventSource.emit('STORY_MODE_PHASE_UPDATE', {
            phase,
            progress,
            blueprint: data?.partialBlueprint || {},
            error: data?.error || null,
            subProgress: data?.subProgress || null,
        });
    }, { startPhase, partialBlueprint, phaseOverrides, stagedRetry });
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

    // Get opening message profile from settings (if configured)
    const openingMessageProfileId = _extension_settings[_MODULE_NAME]?.blueprintSettings?.openingMessageApi || null;
    const OPENING_MESSAGE_DEFAULT_TOKENS = 8192;

    let response;

    // Handle profile selection with Main API fallback
    if (!openingMessageProfileId) {
        // Fall back to Main API (preserves current behavior)
        console.log('[Story Mode] Opening message: Using Main API (no profile configured)');
        const result = await generateRaw({
            prompt: prompt,
            systemPrompt: systemPrompt,
            responseLength: OPENING_MESSAGE_DEFAULT_TOKENS
        });
        response = result || '';
    } else {
        // Use Connection Manager with configured profile
        console.log(`[Story Mode] Opening message: Using profile ${openingMessageProfileId}`);
        try {
            const result = await ConnectionManagerRequestService.sendRequest(
                openingMessageProfileId,
                messages,
                OPENING_MESSAGE_DEFAULT_TOKENS,
                { stream: false, extractData: true }
            );
            response = result.text || result.content || '';
        } catch (error) {
            console.error('[Story Mode] Opening message generation error:', error);
            // Fall back to Main API on error
            console.log('[Story Mode] Opening message: Falling back to Main API after error');
            const fallbackResult = await generateRaw({
                prompt: prompt,
                systemPrompt: systemPrompt,
                responseLength: OPENING_MESSAGE_DEFAULT_TOKENS
            });
            response = fallbackResult || '';
        }
    }

    if (!response) {
        throw new Error('No response from LLM');
    }

    return response.trim();
}

// ============================================================
// SECTION GENERATION (delegated to section-generator.js)
// ============================================================

export { SECTION_CONFIG, checkSectionPrerequisites } from './section-generator.js';

export async function generateSection(sectionId, blueprint, context) {
    const { generateSection: genSection } = await import('./section-generator.js');
    return genSection(sectionId, blueprint, context, _extension_settings, _MODULE_NAME);
}
