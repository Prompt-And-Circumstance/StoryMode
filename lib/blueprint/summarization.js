/**
 * Scene Summarization Module
 *
 * Handles automatic and manual summarization of completed story scenes.
 * Summaries are generated using the configured API profile and stored
 * in the blueprint state for prompt injection.
 */

import { extension_settings, getContext } from '/scripts/extensions.js';
import { generateRaw } from '/script.js';
import { ConnectionManagerRequestService } from '/scripts/extensions/shared.js';

import { MODULE_NAME } from '../core/index.js';
import { getCurrentSceneIndex } from '../core/state-manager.js';
import { saveBlueprintState } from './storage.js';
import * as PromptTemplates from '../generation/templates.js';

// ============================================================================
// STATE
// ============================================================================

/** Scene index currently being summarized, or null if none */
let summarizingSceneIndex = null;

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get the scene index currently being summarized, or null if none
 * @returns {number|null}
 */
export function getSummarizingSceneIndex() {
    return summarizingSceneIndex;
}

/**
 * Track a message for scene summarization
 * @param {number} messageId - The message ID to track
 * @param {Object} blueprintState - The blueprint state
 * @param {Function} getCurrentScene - Function to get current scene
 * @param {number} currentStep - Current round/step
 * @param {number} arcLength - Total arc length
 */
export function trackMessageForScene(messageId, blueprintState, getCurrentScene, currentStep, arcLength) {
    if (!blueprintState?.blueprint || !blueprintState.useBlueprint) {
        return;
    }

    const scene = getCurrentScene(
        blueprintState.blueprint,
        currentStep,
        arcLength,
        blueprintState.sceneMode || 'auto',
        getCurrentSceneIndex()
    );

    if (!scene) return;

    const { index: sceneIndex } = scene;

    // Initialize sceneMessageMap structure
    blueprintState.sceneMessageMap ??= {};
    blueprintState.sceneMessageMap[sceneIndex] ??= [];

    // Add message to scene's list if not already tracked
    if (!blueprintState.sceneMessageMap[sceneIndex].includes(messageId)) {
        blueprintState.sceneMessageMap[sceneIndex].push(messageId);
    }
}

/**
 * Trigger summarization for all eligible past scenes
 * Called on scene transition - checks ALL past scenes for summarization eligibility
 * @param {number} sceneIndex - The scene index that was just left (unused but kept for API compat)
 * @param {Object} blueprintState - The blueprint state
 * @param {Object} settings - Extension settings
 */
export function triggerSummarizationIfNeeded(sceneIndex, blueprintState, settings) {
    if (!settings.blueprintSettings?.summarizationEnabled) {
        return;
    }

    const currentSceneIndex = getCurrentSceneIndex();

    // Check ALL past scenes for eligibility, not just the one we left
    for (let i = 0; i < currentSceneIndex; i++) {
        if (shouldSummarizeScene(blueprintState, i, settings)) {
            console.log(`[Story Mode] Scene ${i} is now eligible for summarization (${currentSceneIndex - i} scenes behind)`);
            // Fire-and-forget async summarization
            summarizeSceneAsync(i, blueprintState, settings).catch(error => {
                console.error(`[Story Mode] Scene ${i} summarization failed:`, error);
            });
        }
    }
}

/**
 * Trigger catch-up summarization for all eligible scenes
 * Call this when summarization is enabled mid-story to summarize past scenes
 * @param {Object} blueprintState - The blueprint state
 * @param {Object} settings - Extension settings
 * @returns {number} Number of scenes triggered for summarization
 */
export function triggerCatchUpSummarization(blueprintState, settings) {
    if (!settings.blueprintSettings?.summarizationEnabled) {
        return 0;
    }

    const currentSceneIndex = getCurrentSceneIndex();
    const threshold = settings.blueprintSettings?.summarizeAfterScenes || 2;
    let triggered = 0;

    console.log(`[Story Mode] Running catch-up summarization (current scene: ${currentSceneIndex}, threshold: ${threshold})`);

    for (let i = 0; i < currentSceneIndex; i++) {
        if (shouldSummarizeScene(blueprintState, i, settings)) {
            console.log(`[Story Mode] Catch-up: Scene ${i} eligible for summarization`);
            summarizeSceneAsync(i, blueprintState, settings).catch(error => {
                console.error(`[Story Mode] Scene ${i} catch-up summarization failed:`, error);
            });
            triggered++;
        }
    }

    if (triggered > 0) {
        console.log(`[Story Mode] Catch-up summarization triggered for ${triggered} scene(s)`);
    } else {
        console.log(`[Story Mode] No scenes eligible for catch-up summarization`);
    }

    return triggered;
}

/**
 * Get information about when the next auto-summary will occur
 * @param {Object} blueprintState - The blueprint state
 * @param {Object} settings - Extension settings
 * @returns {Object} Info about next auto-summary: { sceneIndex, scenesUntilEligible, message }
 */
export function getNextAutoSummaryInfo(blueprintState, settings) {
    if (!settings.blueprintSettings?.summarizationEnabled) {
        return { message: 'Auto-summarization disabled' };
    }

    if (!blueprintState?.blueprint) {
        return { message: 'No blueprint active' };
    }

    const currentSceneIndex = getCurrentSceneIndex();
    const threshold = settings.blueprintSettings?.summarizeAfterScenes || 2;
    const totalScenes = blueprintState.blueprint.scene_plan?.length || 0;

    // Find the first scene that hasn't been summarized yet
    let nextSceneToSummarize = null;
    for (let i = 0; i < currentSceneIndex; i++) {
        if (!blueprintState.sceneSummaries?.[i]) {
            const hasMessages = blueprintState.sceneMessageMap?.[i]?.length > 0;
            if (hasMessages) {
                nextSceneToSummarize = i;
                break;
            }
        }
    }

    // If all past scenes are summarized, the next one to summarize will be the current scene
    // after we advance threshold scenes
    if (nextSceneToSummarize === null) {
        // Current scene will be summarized when we reach scene (currentSceneIndex + threshold)
        const targetScene = currentSceneIndex + threshold;
        if (targetScene >= totalScenes) {
            return { message: 'All eligible scenes summarized' };
        }
        const scenesUntil = threshold;
        return {
            sceneIndex: currentSceneIndex,
            scenesUntilEligible: scenesUntil,
            message: `Scene ${currentSceneIndex + 1} will be summarized after ${scenesUntil} more scene transition${scenesUntil > 1 ? 's' : ''}`
        };
    }

    // We have an unsummarized scene - when will it become eligible?
    const scenesBehind = currentSceneIndex - nextSceneToSummarize;
    if (scenesBehind >= threshold) {
        // Already eligible - should be summarizing now or pending
        return {
            sceneIndex: nextSceneToSummarize,
            scenesUntilEligible: 0,
            message: `Scene ${nextSceneToSummarize + 1} is eligible now`
        };
    }

    const scenesNeeded = threshold - scenesBehind;
    return {
        sceneIndex: nextSceneToSummarize,
        scenesUntilEligible: scenesNeeded,
        message: `Scene ${nextSceneToSummarize + 1} auto-summarizes after ${scenesNeeded} more scene transition${scenesNeeded > 1 ? 's' : ''}`
    };
}

/**
 * Manually generate a summary for a specific scene (bypasses threshold checks)
 * @param {number} sceneIndex - Scene to summarize
 * @param {Object} blueprintState - Blueprint state
 * @param {Object} settings - Extension settings
 * @returns {Promise<void>}
 */
export async function manuallyGenerateSummary(sceneIndex, blueprintState, settings) {
    // Check if already summarized
    if (blueprintState.sceneSummaries?.[sceneIndex]) {
        throw new Error(`Scene ${sceneIndex + 1} already has a summary`);
    }

    // Check if scene is in the future
    const currentSceneIndex = getCurrentSceneIndex();
    if (sceneIndex >= currentSceneIndex) {
        throw new Error(`Cannot summarize current or future scenes`);
    }

    await summarizeSceneAsync(sceneIndex, blueprintState, settings);
}

// ============================================================================
// INTERNAL FUNCTIONS
// ============================================================================

/**
 * Check if a scene should be summarized
 * @param {Object} blueprintState - The blueprint state
 * @param {number} sceneIndex - The scene index to check
 * @param {Object} settings - Extension settings
 * @returns {boolean} True if scene should be summarized
 */
function shouldSummarizeScene(blueprintState, sceneIndex, settings) {
    if (!settings.blueprintSettings?.summarizationEnabled) {
        return false;
    }

    if (blueprintState.sceneSummaries?.[sceneIndex]) {
        return false;
    }

    const currentSceneIndex = getCurrentSceneIndex();
    if (sceneIndex >= currentSceneIndex) {
        return false;
    }

    const scenesBehind = currentSceneIndex - sceneIndex;
    const threshold = settings.blueprintSettings?.summarizeAfterScenes || 2;
    if (scenesBehind < threshold) {
        return false;
    }

    const messageIds = blueprintState.sceneMessageMap?.[sceneIndex];
    return messageIds?.length > 0;
}

/**
 * Asynchronously summarize a scene (fire-and-forget wrapper)
 * @param {number} sceneIndex - The scene index to summarize
 * @param {Object} blueprintState - The blueprint state
 * @param {Object} settings - Extension settings
 */
async function summarizeSceneAsync(sceneIndex, blueprintState, settings) {
    summarizingSceneIndex = sceneIndex;
    // Trigger UI refresh to show "generating" state
    if (window.updateControllerPanel) window.updateControllerPanel();

    try {
        await summarizeSceneInternal(sceneIndex, blueprintState, settings);
    } catch (error) {
        console.error(`[Story Mode] Scene ${sceneIndex} summarization error:`, error);

        // Add to pending for retry
        blueprintState.pendingSummaries ??= [];
        if (!blueprintState.pendingSummaries.includes(sceneIndex)) {
            blueprintState.pendingSummaries.push(sceneIndex);
        }

        // Show user notification
        if (window.toastr) {
            toastr.warning(
                `Scene ${sceneIndex + 1} summarization failed. Will retry later.`,
                'Story Mode',
                { timeOut: 3000 }
            );
        }
    } finally {
        summarizingSceneIndex = null;
        // Trigger UI refresh to show completion
        if (window.updateControllerPanel) window.updateControllerPanel();
    }
}

/**
 * Internal implementation of scene summarization
 * @param {number} sceneIndex - The scene index to summarize
 * @param {Object} blueprintState - The blueprint state
 * @param {Object} settings - Extension settings
 */
async function summarizeSceneInternal(sceneIndex, blueprintState, settings) {
    const messageIds = blueprintState.sceneMessageMap?.[sceneIndex] || [];
    if (messageIds.length === 0) {
        console.warn(`[Story Mode] No messages to summarize for Scene ${sceneIndex}`);
        return;
    }

    const { chat } = getContext();
    const messages = messageIds.map(id => chat[id]).filter(Boolean);

    if (messages.length === 0) {
        console.warn(`[Story Mode] No valid messages found for Scene ${sceneIndex}`);
        return;
    }

    const prompt = await buildSummarizationPrompt(messages, blueprintState, sceneIndex, settings);
    const summaryText = await generateSummaryWithPreset({
        prompt,
        systemPrompt: 'You are a skilled fiction editor. Summarize the provided story scene concisely while preserving narrative continuity.',
        responseLength: settings.blueprintSettings?.summaryMaxTokens || 500,
    });

    if (!summaryText?.trim()) {
        throw new Error('Empty summary generated');
    }

    // Store summary
    blueprintState.sceneSummaries ??= {};
    const { blueprint } = blueprintState;
    const sceneTitle = blueprint.scene_plan?.[sceneIndex]?.title || `Scene ${sceneIndex + 1}`;

    blueprintState.sceneSummaries[sceneIndex] = {
        sceneIndex,
        summary: summaryText.trim(),
        timestamp: new Date().toISOString(),
        messageIds,
        sceneTitle,
    };

    await saveBlueprintState(blueprintState);

    // Trigger prompt update if available
    if (window.updateStoryPrompt) {
        window.updateStoryPrompt();
    }
}

/**
 * Generate a summary using the specified API profile
 * @param {Object} options - Options with prompt, systemPrompt, responseLength
 * @returns {Promise<string>} Generated summary text
 */
async function generateSummaryWithPreset(options) {
    const settings = extension_settings[MODULE_NAME];

    // Use summaryApi (same as end-of-arc summary) or fall back to main API
    const selectedProfileId = settings.summaryApi || null;

    if (!selectedProfileId) {
        return await generateRaw(options);
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

        return result.text || result.content || '';
    } catch (error) {
        // Check if this is a reasoning parameter error (GLM 4.7 doesn't support auto reasoning)
        const errorString = JSON.stringify(error);
        const errorMessage = error.message || '';
        const errorCauseMessage = error.cause?.message || '';
        const errorCauseString = error.cause ? JSON.stringify(error.cause) : '';
        const allErrorText = `${errorMessage} ${errorCauseMessage} ${errorString} ${errorCauseString}`;

        const hasInvalidOption = allErrorText.includes('Invalid option');
        const hasReasoningLevels = allErrorText.includes('xhigh') || allErrorText.includes('medium') ||
            allErrorText.includes('minimal') || allErrorText.includes('none');
        const isBadRequest = errorMessage.includes('Bad Request') ||
            errorCauseMessage.includes('Bad Request') ||
            errorMessage.includes('API request failed');

        const isReasoningError = (hasInvalidOption && hasReasoningLevels) || isBadRequest;

        if (isReasoningError) {
            console.warn('[Story Mode] Detected reasoning parameter error in scene summarization, retrying with explicit effort...');

            try {
                const retryResult = await ConnectionManagerRequestService.sendRequest(
                    selectedProfileId,
                    messages,
                    options.responseLength || 0,
                    { stream: false, extractData: true, includePreset: false },
                    { reasoning: { effort: 'high' }, include_reasoning: true }
                );

                return retryResult.text || retryResult.content || '';
            } catch (retryError) {
                console.error('[Story Mode] Retry with explicit reasoning effort failed:', retryError);
                throw retryError;
            }
        }

        console.error('[Story Mode] Summary generation error:', error);
        throw error;
    }
}

/**
 * Build a summarization prompt for a scene
 * @param {Array} messages - Array of message objects
 * @param {Object} blueprintState - The blueprint state
 * @param {number} sceneIndex - The scene index
 * @param {Object} settings - Extension settings
 * @returns {Promise<string>} The summarization prompt
 */
async function buildSummarizationPrompt(messages, blueprintState, sceneIndex, settings) {
    const { blueprint } = blueprintState;
    const scene = blueprint.scene_plan?.[sceneIndex];
    const summaryStyle = settings.blueprintSettings?.summaryStyle || PromptTemplates.SummaryStyle.NARRATIVE;

    // Build context lines
    const contextLines = [
        `- Core premise: ${blueprint.core_premise}`,
        `- Scene: ${scene?.title || `Scene ${sceneIndex + 1}`}`,
        `- Phase: ${scene?.phase || 'Unknown'}`,
    ];

    if (scene?.purpose) {
        contextLines.push(`- Purpose: ${scene.purpose}`);
    }

    const context = contextLines.join('\n');

    // Build messages content
    const messagesContent = messages.map(m => {
        const speaker = m.is_user ? 'User' : (m.name || 'Character');
        return `${speaker}: ${m.mes}`;
    }).join('\n\n');

    // Use the PromptTemplates module
    return await PromptTemplates.buildSceneSummaryPrompt({
        context,
        messages: messagesContent,
        style: summaryStyle,
    });
}
