/**
 * Event Handlers Module
 * Handles message events, arc progression, and completion tasks
 */

import {
    chat,
    generateRaw,
    addOneMessage,
    system_message_types,
} from '/script.js';

import { extension_settings, getContext } from '/scripts/extensions.js';
import { ConnectionManagerRequestService } from '/scripts/extensions/shared.js';
import { callGenericPopup, Popup, POPUP_TYPE, POPUP_RESULT } from '/scripts/popup.js';

import {
    MODULE_NAME,
    getChatStoryState,
    saveChatStoryState,
    getCurrentSceneIndex,
    setCurrentSceneIndex,
    resetBeatState,
} from './state-manager.js';

import {
    updateStoryPrompt,
} from './arc-engine.js';

import * as BlueprintModule from './blueprint-module.js';
import * as SceneImageGenerator from './scene-image-generator.js';

/**
 * Helper function to update message display after removing markers
 * @param {number} messageId - Message ID
 * @param {string} messageText - Updated message text
 */
function updateMessageDisplay(messageId, messageText) {
    const messageElement = $(`.mes[mesid="${messageId}"]`);
    if (messageElement.length > 0) {
        messageElement.find('.mes_text').text(messageText);
    }
}

// Re-export for external access
export {
    onMessageReceived,
    onUserMessageRendered,
    handleUserMessageStep,
    handleAIMessageChecks,
    handleArcCompletion,
    pushStoryMessage,
    generateEpilogueForStory,
    summarizeChatMainForStory,
    getStoryTextToSummarize,
    STORY_SUMMARY_PROMPT,
    setRegenerating,
    setLoadingChat,
    isRegenerating,
    isLoadingChat,
    jumpToRound,
};

// Import toastr from window (it's globally available in SillyTavern)
const toastr = window.toastr;

// Track regeneration and loading state
let isRegenerating = false;
let isLoadingChat = false;

/**
 * Set the regenerating flag
 * @param {boolean} value - New value for isRegenerating
 */
function setRegenerating(value) {
    isRegenerating = value;
}

/**
 * Set the loading chat flag
 * @param {boolean} value - New value for isLoadingChat
 */
function setLoadingChat(value) {
    isLoadingChat = value;
}

/**
 * Jump to a specific round/scene in the story
 *
 * This enables users to navigate to any point in the story arc.
 * When jumping, the scene mode is switched to 'manual' so the scene
 * index is stored directly rather than auto-calculated from round position.
 *
 * @param {number} targetRound - Target round number (0-based)
 * @param {number} [targetScene=null] - Target scene index (optional, calculated if not provided)
 * @returns {Promise<Object>} { success: boolean, message: string }
 */
async function jumpToRound(targetRound, targetScene = null) {
    const chatState = getChatStoryState();
    const blueprintState = BlueprintModule.getBlueprintState();

    // Validate bounds
    if (targetRound < 0 || targetRound > chatState.arcLength) {
        return { success: false, message: `Round ${targetRound} is out of bounds (0-${chatState.arcLength})` };
    }

    // Calculate scene if not provided and blueprint exists
    if (targetScene === null && blueprintState.blueprint) {
        const sceneCount = blueprintState.blueprint.scene_plan?.length || 1;
        targetScene = Math.floor((targetRound / chatState.arcLength) * sceneCount);
        // Clamp to valid range
        targetScene = Math.min(targetScene, sceneCount - 1);
    }

    // Update states
    blueprintState.sceneMode = 'manual';
    chatState.currentStep = targetRound;
    if (targetScene !== null) {
        setCurrentSceneIndex(targetScene);
    }

    // Save both states
    await saveChatStoryState(chatState);
    await BlueprintModule.saveBlueprintState(blueprintState);

    // Refresh prompt and UI
    updateStoryPrompt();
    refreshUI();

    const sceneInfo = targetScene !== null ? `, Scene ${targetScene + 1}` : '';
    return { success: true, message: `Jumped to round ${targetRound + 1}${sceneInfo}` };
}

/**
 * Refresh all UI components for Story Mode
 */
function refreshUI() {
    const updateFunctions = [
        window.updateStatusDisplay,
        window.updateWandMenuStatus,
        window.refreshBlueprintPreview
    ];
    updateFunctions.forEach(fn => fn?.());
}

/**
 * Parse story signals from text (StoryVerse architecture)
 * @param {string} text - Message text
 * @returns {Object} { cleanText, signals: Array<{type, value}> }
 */
function parseStorySignals(text) {
    const signals = [];
    let cleanText = text;

    // Pattern definitions
    const patterns = [
        { type: 'BEAT', regex: /@@BEAT:(\d+)@@/g },
        { type: 'SKIP', regex: /@@SKIP:(\d+)@@/g },
        { type: 'NEXT_SCENE', regex: /@@NEXT_SCENE@@/g },
        { type: 'STORY_COMPLETE', regex: /@@STORY_COMPLETE@@/g }
    ];

    patterns.forEach(p => {
        const matches = [...cleanText.matchAll(p.regex)];
        matches.forEach(m => {
            signals.push({ type: p.type, value: m[1] });
        });
        cleanText = cleanText.replace(p.regex, '');
    });

    return { cleanText: cleanText.trim(), signals };
}

/**
 * Process all story signals in a message
 * @param {Object} message - Message object
 * @param {number} messageId - Message ID
 * @param {Object} blueprintState - Blueprint state
 * @returns {boolean} True if any signals were processed
 */
async function processStorySignals(message, messageId, blueprintState) {
    const { cleanText, signals } = parseStorySignals(message.mes);

    if (signals.length === 0) return false;

    const settings = extension_settings[MODULE_NAME];
    console.log('[Story Mode] Story signals detected:', signals);

    // Update message text first
    message.mes = cleanText;
    updateMessageDisplay(messageId, message.mes);

    // Process signals
    let sceneAdvanced = false;
    const currentSceneIndex = getCurrentSceneIndex();

    for (const signal of signals) {
        if (signal.type === 'BEAT') {
            const beatIndex = parseInt(signal.value);
            // markBeatCompleted handles both authoritative state (scenario.beatState)
            // and legacy sync (blueprintState.beatProgress)
            await BlueprintModule.markBeatCompleted(currentSceneIndex, beatIndex);
        }
        else if (signal.type === 'SKIP') {
            const beatIndex = parseInt(signal.value);
            // markBeatSkipped handles authoritative state (scenario.beatState)
            await BlueprintModule.markBeatSkipped(currentSceneIndex, beatIndex);
        }
        else if (signal.type === 'NEXT_SCENE' && !sceneAdvanced) {
            sceneAdvanced = true; // Only advance once per message
            const { blueprint } = blueprintState;
            const newSceneIndex = BlueprintModule.advanceSceneIndex(currentSceneIndex, 1, blueprint.scene_plan.length);
            setCurrentSceneIndex(newSceneIndex);
            await BlueprintModule.saveBlueprintState(blueprintState);

            // Reset beats for new scene using unified state manager
            resetBeatState();

            console.log(`[Story Mode] Signal advanced scene to ${newSceneIndex}`);
            refreshUI();
        }
        else if (signal.type === 'STORY_COMPLETE') {
            const chatState = getChatStoryState();
            chatState.currentStep = chatState.arcLength; // Force completion
            await saveChatStoryState(chatState);
            await handleArcCompletion(chatState, settings);
        }
    }

    return true;
}

/**
 * Hook: After AI/character message is received
 *
 * Note: MESSAGE_RECEIVED only fires for AI messages in SillyTavern.
 * User messages fire USER_MESSAGE_RENDERED instead.
 * This handler only processes AI messages for arc completion and beat tracking.
 *
 * @param {number} messageId - Message ID in the chat array
 */
async function onMessageReceived(messageId) {
    const settings = extension_settings[MODULE_NAME];

    // Early exit checks
    if (!settings.enabled) {
        console.debug('[Story Mode] Skipping (extension disabled)');
        return;
    }
    if (!settings.storyArcEnabled) {
        console.debug('[Story Mode] Skipping (story arc disabled)');
        return;
    }
    if (isLoadingChat) {
        console.debug('[Story Mode] Skipping action (chat is loading)');
        return;
    }

    console.log(`[Story Mode] AI message received: messageId=${messageId}`);

    // AI message - check for arc completion and beat markers
    await handleAIMessageChecks({ mesId: messageId });
}

/**
 * Hook: After user message is rendered
 *
 * USER_MESSAGE_RENDERED fires when a user submits a message.
 * This is where we increment the round counter.
 *
 * @param {number} messageId - Message ID in the chat array
 */
async function onUserMessageRendered(messageId) {
    const settings = extension_settings[MODULE_NAME];

    // Early exit checks
    if (!settings.enabled) {
        console.debug('[Story Mode] Skipping (extension disabled)');
        return;
    }
    if (!settings.storyArcEnabled) {
        console.debug('[Story Mode] Skipping (story arc disabled)');
        return;
    }
    if (isLoadingChat) {
        console.debug('[Story Mode] Skipping action (chat is loading)');
        return;
    }

    console.log(`[Story Mode] User message rendered: messageId=${messageId}`);

    // User submitted a message - this starts a new round
    await handleUserMessageStep({ mesId: messageId });
}

/**
 * Handle user message submission - increment round counter
 *
 * When a user submits a message, a new round begins. The round counter
 * is incremented unless the arc length has been reached, in which case
 * arc completion tasks are triggered instead.
 *
 * @param {Object} data - Message data from MESSAGE_RECEIVED event
 */
async function handleUserMessageStep(data) {
    const settings = extension_settings[MODULE_NAME];
    const chatState = getChatStoryState();

    // Don't increment during regeneration
    if (isRegenerating) {
        console.debug('[Story Mode] Skipping round increment (regeneration detected)');
        isRegenerating = false;
        return;
    }

    // Check if we should trigger arc completion
    if (chatState.currentStep >= chatState.arcLength) {
        console.log('[Story Mode] Arc length reached. Checking for completion tasks...');
        await handleArcCompletion(chatState, settings);
        return;
    }

    // Increment round
    const oldStep = chatState.currentStep;
    chatState.currentStep++;

    // Update prompt immediately to assure the prompt is ready before ST generation (fixes race condition)
    updateStoryPrompt();

    await saveChatStoryState(chatState);
    console.log(
        `[Story Mode] Round incremented: ${oldStep} → ${chatState.currentStep} (Arc: ${chatState.currentStep}/${chatState.arcLength})`
    );

    // Track message for scene summarization
    if (settings.blueprintSettings?.enabled && settings.blueprintSettings?.useScenePrompts) {
        const blueprintState = BlueprintModule.getBlueprintState();
        if (blueprintState?.blueprint && blueprintState.useBlueprint) {
            const messageId = data?.mesId ?? (chat?.length > 0 ? chat.length - 1 : 0);
            BlueprintModule.trackMessageForScene(messageId, blueprintState, chatState.currentStep, chatState.arcLength);
        }
    }

    refreshUI();
}

/**
 * Handle AI message - check for arc completion
 *
 * AI messages do not increment the round counter. However, after the arc
 * is complete, AI messages may trigger arc completion tasks (epilogue/summary).
 *
 * @param {Object} data - Message data from MESSAGE_RECEIVED event
 */
async function handleAIMessageChecks(data) {
    const settings = extension_settings[MODULE_NAME];
    const chatState = getChatStoryState();

    // Check for story signals in blueprint mode
    if (settings.blueprintSettings?.enabled && settings.blueprintSettings?.useScenePrompts) {
        const blueprintState = BlueprintModule.getBlueprintState();
        if (blueprintState?.blueprint && blueprintState.useBlueprint) {
            const messageId = data?.mesId ?? chat.length - 1;
            const message = chat[messageId];
            if (message?.mes && !message.is_user) {
                await processStorySignals(message, messageId, blueprintState);
            }
        }
    }

    // Only check for arc completion if we're at or past arc length (and not handled by signals)
    if (chatState.currentStep >= chatState.arcLength && !chatState.endNoticeShown) {
        await handleArcCompletion(chatState, settings);
    }
}

/**
 * Handle arc completion tasks (epilogue, summary, end notice)
 *
 * Generates epilogue and summary if enabled, then shows an end notice.
 * Each task is only performed once per arc to avoid duplication.
 *
 * @param {Object} chatState - Current chat story state
 * @param {Object} settings - Extension settings
 */
async function handleArcCompletion(chatState, settings) {
    console.log('[Story Mode] Arc completion check. Epilogue enabled:', settings.epilogueEnabled, 'Summary enabled:', settings.summaryEnabled);

    // Generate and push epilogue if enabled
    if (settings.epilogueEnabled && !chatState.epilogueShown) {
        const epilogue = await generateEpilogueForStory();
        if (epilogue) {
            await pushStoryMessage(epilogue);
            chatState.epilogueShown = true;
            await saveChatStoryState(chatState);
            console.log('[Story Mode] Epilogue generated and pushed');
            // Wait a moment for UI to settle before generating summary
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    // Generate and push summary if enabled and epilogue is done (or not enabled)
    if (settings.summaryEnabled && !chatState.summaryShown) {
        // If epilogue is enabled, wait for it to be shown first
        if (!settings.epilogueEnabled || chatState.epilogueShown) {
            const summary = await summarizeChatMainForStory();
            if (summary) {
                await pushStoryMessage(summary);
                chatState.summaryShown = true;
                await saveChatStoryState(chatState);
                console.log('[Story Mode] Summary generated and pushed');
                // Wait a moment for UI to settle before showing end notice
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    // Show end notice if conditions are met
    const conditionsMet =
        // A) Neither epilogue nor summary are enabled
        (!settings.epilogueEnabled && !settings.summaryEnabled)
        // B) Epilogue enabled and shown, not waiting on summary (or summary already shown)
        || (settings.epilogueEnabled && chatState.epilogueShown &&
            (!settings.summaryEnabled || chatState.summaryShown))
        // C) Summary enabled and shown, not waiting on epilogue (or epilogue already shown)
        || (settings.summaryEnabled && chatState.summaryShown &&
            (!settings.epilogueEnabled || chatState.epilogueShown));

    if (conditionsMet && !chatState.endNoticeShown) {
        const NOTICE_TEXT = '**<center>You have reached the end of this story arc. ' +
            'Feel free to continue, or if you would like to start a new arc, ' +
            'click Reset Arc in the Story Mode settings.</center>**';
        await pushStoryMessage(NOTICE_TEXT);
        chatState.endNoticeShown = true;
        await saveChatStoryState(chatState);
        console.log('[Story Mode] End notice shown');
    }
}

/**
 * Push a story message (epilogue or summary) into the chat
 *
 * @param {string} messageText - The message text to push
 */
async function pushStoryMessage(messageText) {
    console.log('[Story Mode] Message to push:', messageText);
    const message = {
        is_user: false,
        mes: messageText, // LLM has already generated the heading
        is_system: false,
        name: 'Story Mode',
        force_avatar: 'img/quill.png', // Use server-relative path (quill icon for story/narrative)
        send_date: Date.now(),
        extra: {
            type: system_message_types.NARRATOR,
        },
    };

    // Push message to chat array first
    chat.push(message);

    // Render the message in the UI without swipe arrows
    addOneMessage(message, { scroll: true, showSwipes: false });

    console.log('[Story Mode] Message pushed and rendered');
}

/**
 * Generate epilogue for the completed story arc
 * Uses the epilogueApi setting if configured, otherwise falls back to main API
 *
 * @returns {Promise<string>} The generated epilogue text
 */
async function generateEpilogueForStory() {
    const ctx = getContext();
    const { chat: contextChat } = ctx;
    const settings = extension_settings[MODULE_NAME];

    // Get the recent chat context for the epilogue
    const recentMessages = contextChat
        .filter(m => !m.is_system && m.mes)
        .slice(-20) // Last 20 messages for full arc context
        .map(m => m.mes)
        .join('\n\n');

    if (!recentMessages.trim()) {
        console.warn('[Story Mode] No messages to create epilogue from');
        return '';
    }

    const systemPrompt = `You are wrapping up a completed story arc. The story has reached its conclusion at the planned arc length. Write an epilogue that:
    - Wraps up loose threads
    - Brings the narrative to a satisfying close
    - Provides closure for character arcs
    - Sets the tone for what comes after
    IMPORTANT: Start your response with the heading "**Epilogue**" on its own line, followed by a blank line, then write the epilogue content.`;

    const userPrompt = `Based on the recent story context below, write an epilogue that wraps up this story arc:\n\n${recentMessages}`;

    // Check if a specific API profile is configured for epilogue generation
    const selectedProfileId = settings.epilogueApi;
    const profileName = selectedProfileId || 'Default API (generateRaw)';

    // DEBUG: Show confirmation popup before generating (COMMENTED OUT)
    /*
    const debugHtml = `
        <div style="max-height: 60vh; overflow-y: auto;">
            <h3>Epilogue Generation Debug</h3>
            <p><strong>API Profile:</strong> ${profileName}</p>
            <hr>
            <h4>System Prompt:</h4>
            <pre style="white-space: pre-wrap; background: var(--SmartThemeBlurTintColor); padding: 10px; border-radius: 5px; max-height: 150px; overflow-y: auto;">${systemPrompt}</pre>
            <hr>
            <h4>User Prompt (with ${recentMessages.split('\n\n').length} messages):</h4>
            <pre style="white-space: pre-wrap; background: var(--SmartThemeBlurTintColor); padding: 10px; border-radius: 5px; max-height: 200px; overflow-y: auto;">${userPrompt.substring(0, 2000)}${userPrompt.length > 2000 ? '...(truncated)' : ''}</pre>
        </div>
    `;

    const confirmResult = await callGenericPopup(debugHtml, POPUP_TYPE.CONFIRM, '', {
        okButton: 'Generate Epilogue',
        cancelButton: 'Cancel',
        wide: true,
        large: true,
    });

    if (confirmResult !== POPUP_RESULT.AFFIRMATIVE) {
        console.log('[Story Mode] Epilogue generation cancelled by user');
        return '';
    }
    */

    try {
        if (selectedProfileId) {
            // Use ConnectionManagerRequestService with the selected profile
            console.log('[Story Mode] Using epilogue API profile:', selectedProfileId);
            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ];

            const result = await ConnectionManagerRequestService.sendRequest(
                selectedProfileId,
                messages,
                0, // Use default response length
                {
                    stream: false,
                    extractData: true,
                }
            );

            return (result.text || result.content || '').trim();
        } else {
            // Fall back to main API using generateRaw
            const epilogue = await generateRaw({
                prompt: userPrompt,
                systemPrompt: systemPrompt,
            });
            return epilogue?.trim() || '';
        }
    } catch (error) {
        console.error('[Story Mode] Failed to generate epilogue:', error);
        return '';
    }
}

/**
 * Story summary prompt template
 */
const STORY_SUMMARY_PROMPT = `
You are a summarization assistant for a fictional story. Provide a comprehensive summary of the story arc using at most {{words}} words.
Include:
- **Character Development**: How each major character has changed and grown
- **Key Events**: The most important moments in chronological order
- **Important Elements**: Significant objects, locations, and relationships
- **Major Themes**: The underlying themes and messages explored
- **Resolution Status**: What was resolved and what remains open
Format this as a clear, well-organized narrative summary. Use markdown formatting and section headings to organize the summary.
IMPORTANT: Start your response with the heading "**Story Arc Summary**" on its own line, followed by a blank line, then write the summary content with your subsection headings.
`;

/**
 * Get story text to summarize based on settings
 *
 * @returns {string} The story text to summarize
 */
function getStoryTextToSummarize() {
    const ctx = SillyTavern.getContext();
    const { chat } = ctx;
    const settings = extension_settings[MODULE_NAME];

    // Filter non-system messages
    const filteredMessages = chat.filter(m => !m.is_system && m.mes);

    // Use either entire chat (if 0) or last N messages
    const messagesToSummarize = settings.summaryMessageCount === 0
        ? filteredMessages // Entire chat
        : filteredMessages.slice(-settings.summaryMessageCount); // Last N messages

    const parts = messagesToSummarize.map(m => m.mes);
    return parts.join('\n\n');
}

/**
 * Summarize the chat main for story
 * Uses the summaryApi setting if configured, otherwise falls back to main API
 *
 * @returns {Promise<string>} The generated summary text
 */
async function summarizeChatMainForStory() {
    const storyText = getStoryTextToSummarize();
    if (!storyText.trim()) {
        console.warn('[Story Mode] No text to summarize');
        return '';
    }

    const settings = extension_settings[MODULE_NAME];
    const words = settings.summaryWords ?? 500;
    const systemPrompt = STORY_SUMMARY_PROMPT.replace('{{words}}', String(words));

    try {
        // Check if a specific API profile is configured for summary generation
        const selectedProfileId = settings.summaryApi;

        if (selectedProfileId) {
            // Use ConnectionManagerRequestService with the selected profile
            console.log('[Story Mode] Using summary API profile:', selectedProfileId);
            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: storyText }
            ];

            const result = await ConnectionManagerRequestService.sendRequest(
                selectedProfileId,
                messages,
                settings.summaryMaxTokens ?? 0,
                {
                    stream: false,
                    extractData: true,
                }
            );

            return (result.text || result.content || '').trim();
        } else {
            // Fall back to main API using generateRaw
            const summary = await generateRaw({
                prompt: storyText,
                systemPrompt,
                responseLength: settings.summaryMaxTokens ?? 0,
            });

            return summary?.trim() || '';
        }
    } catch (error) {
        console.error('[Story Mode] Failed to generate summary:', error);
        return '';
    }
}
