/**
 * Arc Engine Module for Story Mode Extension
 *
 * Handles story arc phase calculations and prompt injection:
 * - Phase calculation (setup, confrontation, resolution)
 * - Story prompt building
 * - Author style injection
 * - Blueprint integration
 */

import {
    setExtensionPrompt,
    extension_prompt_types,
} from '/script.js';
import { extension_settings } from '/scripts/extensions.js';

// Import from state manager
import {
    MODULE_NAME,
    getStoryTypes,
    getAuthorStyles,
    getChatStoryState,
    getPacingMode,
    getEffectiveAuthorStyle,
} from './state-manager.js';

// Import blueprint module for blueprint injection
import * as BlueprintModule from '../blueprint/module.js';

// ============================================================================
// PHASE CALCULATION
// ============================================================================

/**
 * Calculate phase information based on current step and arc length.
 * Divides the story into three phases: setup (33%), confrontation (34%), resolution (33%).
 *
 * @param {number} currentStep - The current step number in the story arc.
 * @param {number} arcLength - The total length of the story arc.
 * @returns {Object} Phase information containing phase, positionInPhase, totalInPhase,
 *                   percentInPhase, phaseStart, and phaseEnd.
 */
export function getPhaseInfo(currentStep, arcLength) {
    // Validate inputs - default currentStep to 0, arcLength to 30
    if (currentStep === undefined || currentStep === null || currentStep < 0) {
        currentStep = 0;
    }
    if (!arcLength || arcLength <= 0) {
        arcLength = 30; // fallback to default
        console.warn('[Story Mode] Invalid arcLength, using default 30');
    }

    // Calculate phase boundaries
    const setupEnd = Math.floor(arcLength * 0.33);
    const confrontationEnd = Math.floor(arcLength * 0.66);

    let phase, phaseStart, phaseEnd, positionInPhase;

    if (currentStep <= setupEnd) {
        phase = 'setup';
        phaseStart = 1;
        phaseEnd = setupEnd;
        positionInPhase = currentStep;
    } else if (currentStep <= confrontationEnd) {
        phase = 'confrontation';
        phaseStart = setupEnd + 1;
        phaseEnd = confrontationEnd;
        positionInPhase = currentStep - setupEnd;
    } else {
        phase = 'resolution';
        phaseStart = confrontationEnd + 1;
        phaseEnd = arcLength;
        positionInPhase = currentStep - confrontationEnd;
    }

    const totalInPhase = phaseEnd - phaseStart + 1;
    const percentInPhase = Math.round((positionInPhase / totalInPhase) * 100);

    return {
        phase,
        positionInPhase,
        totalInPhase,
        percentInPhase,
        phaseStart,
        phaseEnd,
    };
}

// ============================================================================
// PROMPT BUILDING
// ============================================================================

/**
 * Build the story blueprint from a story type.
 * Returns the story prompt that guides the LLM on narrative structure.
 *
 * @param {Object} storyType - The story type object containing storyPrompt.
 * @returns {string} The story prompt text, or empty string if undefined.
 */
export function buildStoryBlueprint(storyType) {
    if (!storyType.storyPrompt) return '';

    const intro = `**Genre Framework:** Use the following genre description to shape your narrative voice, pacing, and storytelling choices. Let these elements guide tone, tropes, and dramatic structure throughout the story.`;

    return `${intro}\n\n${storyType.storyPrompt}`;
}

// Phase goals lookup - avoids repetitive if/else chain
const PHASE_GOALS = {
    setup: `<phase_goals>
    Establish world, relationships, and stakes.
    Plant seeds for future conflict.
    Build reader investment in characters.
    Create questions that hook the reader.
    Save escalation for later phases.
  </phase_goals>`,
    confrontation: `<phase_goals>
    Escalate stakes and complications.
    Test character resolve and relationships.
    Build toward the inevitable climax.
    Create turning points and reversals.
  </phase_goals>`,
    resolution: `<phase_goals>
    Deliver satisfying payoff to established threads.
    Resolve character arcs naturally.
    Provide closure to the narrative journey.
    Leave room for meaningful final moments.
  </phase_goals>`,
};

/**
 * Build debug instruction string if debug mode is enabled.
 * @param {Object} settings - Extension settings
 * @param {number} step - Current step
 * @param {number} arcLength - Total arc length
 * @param {string} phase - Current phase name
 * @returns {string} Debug instruction or empty string
 */
function buildDebugInstruction(settings, step, arcLength, phase) {
    if (!settings.debugMode) return '';
    return `\n[IMPORTANT: At the end of your response, include a debug note in this exact format: "(OOC: Step ${step}/${arcLength}, Phase: ${phase})"]`;
}

/**
 * Build the phase injection text with enhanced pacing constraints.
 * Replaces placeholders in the progress template with actual values.
 *
 * When a blueprint is active, returns minimal arc info (scene pacing is handled by blueprint).
 * In Scenario Mode with blueprint: returns minimal debug note only (blueprint handles ALL pacing).
 * In Story Mode (with or without blueprint): returns full pacing guidance in XML format.
 *
 * @param {Object} storyType - The story type object containing progressTemplate and phasePrompts.
 * @param {Object} phaseInfo - Phase information from getPhaseInfo.
 * @param {Object} chatState - Current chat story state containing arcLength.
 * @param {boolean} blueprintActive - If true AND in Scenario Mode, skip verbose pacing.
 * @returns {string} The formatted phase injection text with debug notes if debugMode is enabled.
 */
export function buildPhaseInjection(storyType, phaseInfo, chatState, blueprintActive = false) {
    const settings = extension_settings[MODULE_NAME];
    const { currentStep: nextStep, arcLength } = chatState;
    const debugNote = buildDebugInstruction(settings, nextStep, arcLength, phaseInfo.phase);

    // Scenario Mode (signal-based): No arc injection needed (blueprint provides complete pacing)
    const pacingMode = getPacingMode();
    if (blueprintActive && pacingMode === 'scenario') {
        return debugNote; // Return debug note only, no arc info
    }

    // Story Mode: Full pacing guidance (even if blueprint exists, it's not used for pacing)
    const roundsRemainingInPhase = phaseInfo.totalInPhase - phaseInfo.positionInPhase;
    const phaseGoals = PHASE_GOALS[phaseInfo.phase] || '';
    const arcPercent = Math.round((nextStep / arcLength) * 100);

    // Substitute variables in progress template
    const progressText = storyType.progressTemplate
        .replace(/{currentStep}/g, nextStep)
        .replace(/{arcLength}/g, arcLength)
        .replace(/{arcPercent}/g, arcPercent)
        .replace(/{phase}/g, phaseInfo.phase)
        .replace(/{positionInPhase}/g, phaseInfo.positionInPhase)
        .replace(/{totalInPhase}/g, phaseInfo.totalInPhase)
        .replace(/{phasePercent}/g, phaseInfo.percentInPhase)
        .replace(/{phaseStart}/g, phaseInfo.phaseStart)
        .replace(/{phaseEnd}/g, phaseInfo.phaseEnd);

    const phaseGuidance = storyType.phasePrompts?.[phaseInfo.phase] || '';

    const output = `<story_pacing>
  <arc position="${nextStep}/${arcLength}" percent="${arcPercent}%"/>
  <phase name="${phaseInfo.phase.toUpperCase()}" rounds="${phaseInfo.phaseStart}-${phaseInfo.phaseEnd}" position="${phaseInfo.positionInPhase}/${phaseInfo.totalInPhase}" remaining="${roundsRemainingInPhase}"/>
  ${phaseGoals}
</story_pacing>

${progressText}

${phaseGuidance}${debugNote ? '\n' + debugNote : ''}`;

    return output.trim();
}

/**
 * Build the full extension prompt injection string.
 * Combines story arc and author style content based on current settings.
 *
 * In Scenario Mode: includes blueprint injection with full scene pacing.
 * In Story Mode: includes story type + author style with full arc pacing (no blueprint).
 *
 * @param {boolean} isPreview - If true, ignore arc length limits and build full prompt for preview.
 * @returns {string} The complete injection text, or empty string if disabled.
 */
export function buildFullInjection(isPreview = false) {
    const settings = extension_settings[MODULE_NAME];
    const chatState = getChatStoryState();
    const storyTypes = getStoryTypes();
    const authorStyles = getAuthorStyles();
    const pacingMode = getPacingMode();

    if (!settings.enabled) {
        return '';
    }

    let parts = [];

    // Check if blueprint is active (Scenario Mode)
    let blueprintActive = false;
    let blueprintState = null;
    if (settings.blueprintSettings?.enabled && settings.blueprintSettings?.useScenePrompts) {
        blueprintState = BlueprintModule.getBlueprintState();
        blueprintActive = blueprintState?.useBlueprint && blueprintState?.blueprint;
    }

    // GENRE INJECTION - controlled by storyTypeEnabled toggle
    // Only inject in Story Mode when toggle is enabled
    if (pacingMode === 'story' && settings.storyTypeEnabled && chatState.selectedStoryType) {
        const storyType = storyTypes.find(t => t.id === chatState.selectedStoryType);

        if (storyType) {
            // Build the genre framework (story blueprint)
            let storyContent = buildStoryBlueprint(storyType);

            // ARC TRACKING - controlled by storyArcEnabled toggle
            // Only add phase injection when arc tracking is enabled
            if (settings.storyArcEnabled) {
                const shouldBuildPhase = chatState.currentStep < chatState.arcLength || isPreview;
                if (shouldBuildPhase) {
                    const nextStep = chatState.currentStep;
                    const phaseInfo = getPhaseInfo(nextStep, chatState.arcLength);
                    const phaseText = buildPhaseInjection(storyType, phaseInfo, chatState, false);
                    storyContent += `\n\n${phaseText}`;
                }
            }
            // If storyArcEnabled is false: Skip phase injection entirely

            parts.push(`<story>\n${storyContent}\n</story>`);
        }
    }

    // Author style injection - PRESERVE THE CASCADE LOGIC
    // Uses getEffectiveAuthorStyle() which handles: blueprint > character > group > chat > default
    const { styleId } = getEffectiveAuthorStyle();
    if (settings.authorStyleEnabled && styleId) {
        const authorStyle = authorStyles.find(s => s.id === styleId);

        if (authorStyle) {
            let styleContent = authorStyle.authorPrompt;

            if (settings.nsfwEnabled && authorStyle.nsfwPrompt) {
                styleContent += `\n\n${authorStyle.nsfwPrompt}`;
            }

            parts.push(`<style>\n${styleContent}\n</style>`);
        }
    }

    // Blueprint injection - only in Scenario Mode with active blueprint
    if (pacingMode === 'scenario' && blueprintActive) {
        const blueprintInjection = buildBlueprintInjection(blueprintState);
        if (blueprintInjection) {
            parts.push(blueprintInjection);
        }
    }

    // OOC (Out of Context) injection - persistent user instructions
    if (settings.oocText && settings.oocText.trim().length > 0) {
        parts.push(`<OOC>\n${settings.oocText.trim()}\n</OOC>`);
    }

    return parts.join('\n\n');
}

/**
 * Build blueprint injection for Scenario Mode
 * @param {Object} blueprintState - Blueprint state object
 * @returns {string} Blueprint injection or empty string
 */
function buildBlueprintInjection(blueprintState) {
    if (!blueprintState?.blueprint) return '';

    const blueprintContent = BlueprintModule.buildBlueprintInjection(
        blueprintState,
        0, // currentStep - not used in Scenario Mode
        0  // arcLength - not used in Scenario Mode
    );

    if (!blueprintContent) return '';

    return `<blueprint>\n${blueprintContent}\n</blueprint>`;
}

// ============================================================================
// PROMPT INJECTION
// ============================================================================

/**
 * Update the extension prompt injection in SillyTavern.
 * Clears the prompt if extension is disabled or no content to inject.
 */
export function updateStoryPrompt() {
    const settings = extension_settings[MODULE_NAME];

    if (!settings.enabled) {
        setExtensionPrompt(MODULE_NAME, '', extension_prompt_types.NONE, 0);
        console.debug('[Story Mode] Prompt cleared (disabled)');
        return;
    }

    const promptText = buildFullInjection(false);

    if (!promptText) {
        setExtensionPrompt(MODULE_NAME, '', extension_prompt_types.NONE, 0);
        console.debug('[Story Mode] Prompt cleared (no content)');
        return;
    }

    // Inject the prompt
    setExtensionPrompt(
        MODULE_NAME,
        promptText,
        settings.position,
        settings.depth,
        false,
        settings.role
    );

    console.debug('[Story Mode] Prompt injected:', promptText);
}
