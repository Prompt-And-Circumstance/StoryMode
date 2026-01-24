/**
 * Metrics tracking for blueprint generation
 * @module generation/metrics
 */

import { getTokenCountAsync } from '/scripts/tokenizers.js';

function initializeStorage() {
    if (!window.__blueprintMetrics) window.__blueprintMetrics = [];
}

function buildSummary(m) {
    return {
        'Phase': `${m.phase} (${m.phaseName})`,
        'Duration': `${(m.duration / 1000).toFixed(1)}s`,
        'Prompt Tokens': m.promptTokens,
        'System Tokens': m.systemTokens,
        'Requested Output': m.requestedOutputTokens,
        'Actual Output': m.actualOutputLength || '?',
        'Tokens/sec': m.tokensPerSecond || '?',
        'Success': m.success ? '✓' : '✗',
    };
}

export function storeMetrics(metrics) {
    initializeStorage();
    window.__blueprintMetrics.push(metrics);
    console.table([buildSummary(metrics)]);
}

export function finalizeMetrics(metrics, startTime, result, error = null) {
    metrics.endTime = performance.now();
    metrics.duration = metrics.endTime - startTime;

    if (error) {
        metrics.success = false;
        metrics.error = error.message;
    } else {
        const output = result.text || result.content || '';
        metrics.actualOutputLength = output.length;
        metrics.actualOutputTokens = result.usage?.completion_tokens || '?';
        metrics.totalTokensUsed = result.usage?.total_tokens || '?';
        metrics.success = true;

        if (typeof metrics.actualOutputTokens === 'number' && metrics.duration > 0) {
            metrics.tokensPerSecond = Math.round((metrics.actualOutputTokens / metrics.duration) * 1000);
        }
    }

    storeMetrics(metrics);
}

export async function countTokens(prompt, systemPrompt) {
    try {
        const promptTokens = await getTokenCountAsync(prompt);
        const systemTokens = systemPrompt ? await getTokenCountAsync(systemPrompt) : 0;
        return { promptTokens, systemTokens, totalInputTokens: promptTokens + systemTokens };
    } catch (error) {
        console.warn('[Story Mode Blueprint] Token counting failed:', error);
        return { promptTokens: '?', systemTokens: '?', totalInputTokens: '?' };
    }
}
