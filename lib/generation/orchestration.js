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

    return (errorText.includes('Invalid option') && /xhigh|medium|minimal|none/.test(errorText))
        || /Bad Request|API request failed/.test(error.message || '');
}

// Metrics functions moved to metrics.js

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

        finalizeMetrics(metrics, startTime, result);
        return result.text || result.content || '';

    } catch (error) {
        console.error('[Story Mode Blueprint] Error:', error.message);

        if (!isReasoningParameterError(error)) {
            finalizeMetrics(metrics, startTime, null, error);
            throw error;
        }

        console.warn('[Story Mode Blueprint] Retrying with explicit reasoning effort...');

        try {
            const retryResult = await ConnectionManagerRequestService.sendRequest(
                selectedProfileId,
                messages,
                options.responseLength || 0,
                { stream: false, extractData: true, includePreset: false },
                { reasoning: { effort: 'high' }, include_reasoning: true }
            );

            metrics.retried = true;
            metrics.retryReason = 'reasoning_parameter_error';
            finalizeMetrics(metrics, startTime, retryResult);
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

function buildSystemPrompt(storyType, authorStyle, attempt, lastError) {
    const style = authorStyle?.name
        ? ` specializing in ${storyType.name} stories, writing in the distinct style of ${authorStyle.name}.`
        : '.';

    let prompt = `You are an expert story designer${style} Output ONLY valid JSON as specified.`;

    if (attempt > 0 && lastError) {
        prompt += `\n\nPREVIOUS ERROR: ${lastError.message}\nFix this error. Ensure all required fields (like 'beats' arrays) are present.`;
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

async function executePhase(phase, request, storyType, authorStyle, partialBlueprint, selectedProfileId, phaseOverrides = {}) {
    const MAX_RETRIES = 2;
    let lastError = null;

    // Extract phase-specific overrides
    const phaseOverride = phaseOverrides?.[phase] || {};

    // Use override profile if provided, otherwise use default profile
    // Empty string ('') means "Main API" (uses generateRaw, no preset)
    const effectiveProfileId = phaseOverride.profileId !== undefined
        ? phaseOverride.profileId
        : selectedProfileId;

    // Use override tokens if provided, otherwise use default from config
    const phaseConfig = PHASE_CONFIG[phase];
    const effectiveMaxTokens = phaseOverride.maxTokens || phaseConfig.maxTokens;
    const phaseName = phaseConfig.name;

    // Get profile name for display
    let profileName = 'Main API';
    if (effectiveProfileId) {
        const profiles = _getConnectionProfiles?.() || [];
        const profile = profiles.find(p => p.id === effectiveProfileId);
        profileName = profile?.model || profile?.name || effectiveProfileId.substring(0, 8);
    }

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
// MAIN ORCHESTRATION
// ============================================================

function addBlueprintMetadata(blueprint, request, authorStyles, selectedProfileId) {
    blueprint.arc_structure = blueprint.arc_structure || {};
    blueprint.arc_structure.total_messages_target = request.total_messages_target;
    blueprint.author_style = request.author_style;

    if (request.user_scenario) {
        blueprint.user_scenario = request.user_scenario;
    }

    if (request.author_style) {
        const authorStyleObj = authorStyles.find(s => s.id === request.author_style);
        if (authorStyleObj) {
            blueprint.author_style_name = authorStyleObj.name;
            blueprint.author_style_prompt = authorStyleObj.authorPrompt;
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
    const { startPhase = 1, partialBlueprint: initialBlueprint = null, phaseOverrides = {} } = options;

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

        for (const phaseNum of [1, 2, 3, 4].filter(p => p >= startPhase)) {
            const config = PHASE_CONFIG[phaseNum];

            onPhaseUpdate?.(phaseNum, config.progress, {
                phase: config.name,
                description: config.description,
                partialBlueprint
            });

            try {
                const phaseResult = await executePhase(phaseNum, request, storyType, authorStyle, partialBlueprint, selectedProfileId, phaseOverrides);
                Object.assign(partialBlueprint, validatePhaseResult(phaseResult, phaseNum));
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

        addBlueprintMetadata(partialBlueprint, request, authorStyles, selectedProfileId);

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
    const { startPhase, partialBlueprint, phaseOverrides = {} } = options;

    return generateBlueprintPhased(request, storyTypes, authorStyles, (phase, progress, data) => {
        // Emit phase update event (including error if present)
        eventSource.emit('STORY_MODE_PHASE_UPDATE', {
            phase,
            progress,
            blueprint: data?.partialBlueprint || {},
            error: data?.error || null,
        });
    }, { startPhase, partialBlueprint, phaseOverrides });
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
