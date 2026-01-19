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
} from './state-manager.js';

// Import blueprint module for blueprint injection
import * as BlueprintModule from './blueprint-module.js';

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
    // Validate inputs
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
    return storyType.storyPrompt || '';
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
 * When no blueprint, returns full pacing guidance in XML format.
 *
 * @param {Object} storyType - The story type object containing progressTemplate and phasePrompts.
 * @param {Object} phaseInfo - Phase information from getPhaseInfo.
 * @param {Object} chatState - Current chat story state containing arcLength.
 * @param {boolean} blueprintActive - If true, skip verbose pacing (blueprint handles it).
 * @returns {string} The formatted phase injection text with debug notes if debugMode is enabled.
 */
export function buildPhaseInjection(storyType, phaseInfo, chatState, blueprintActive = false) {
    const settings = extension_settings[MODULE_NAME];
    const { currentStep: nextStep, arcLength } = chatState;
    const debugNote = buildDebugInstruction(settings, nextStep, arcLength, phaseInfo.phase);

    // Blueprint active: minimal arc info only (phase is in blueprint's <scene> tag)
    if (blueprintActive) {
        return `<arc position="${nextStep}/${arcLength}"/>${debugNote}`;
    }

    // Non-blueprint: Full pacing guidance in XML format
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
 * When blueprint is active, arc-engine provides minimal arc info only;
 * the blueprint module provides consolidated scene pacing.
 *
 * @param {boolean} isPreview - If true, ignore arc length limits and build full prompt for preview.
 * @returns {string} The complete injection text, or empty string if disabled.
 */
export function buildFullInjection(isPreview = false) {
    const settings = extension_settings[MODULE_NAME];
    const chatState = getChatStoryState();
    const storyTypes = getStoryTypes();
    const authorStyles = getAuthorStyles();

    if (!settings.enabled) {
        return '';
    }

    let parts = [];

    // Check if blueprint is active (determines pacing mode)
    let blueprintActive = false;
    let blueprintState = null;
    if (settings.blueprintSettings?.enabled && settings.blueprintSettings?.useScenePrompts) {
        blueprintState = BlueprintModule.getBlueprintState();
        blueprintActive = blueprintState?.useBlueprint && blueprintState?.blueprint;
    }

    // Story arc injection - use chat state for story type and arc length
    if (settings.storyArcEnabled && chatState.selectedStoryType) {
        const storyType = storyTypes.find(t => t.id === chatState.selectedStoryType);

        if (storyType && (chatState.currentStep < chatState.arcLength || isPreview)) {
            const nextStep = chatState.currentStep;
            const phaseInfo = getPhaseInfo(nextStep, chatState.arcLength);

            // Build comprehensive story content
            let storyContent = buildStoryBlueprint(storyType);

            // Add phase guidance (minimal if blueprint active, full otherwise)
            const phaseText = buildPhaseInjection(storyType, phaseInfo, chatState, blueprintActive);
            storyContent += `\n\n${phaseText}`;

            parts.push(`<story>\n${storyContent}\n</story>`);
        }
    }

    // Author style injection - use chat state for author style
    if (settings.authorStyleEnabled && chatState.selectedAuthorStyle) {
        const authorStyle = authorStyles.find(s => s.id === chatState.selectedAuthorStyle);

        if (authorStyle) {
            let styleContent = authorStyle.authorPrompt;

            if (settings.nsfwEnabled && authorStyle.nsfwPrompt) {
                styleContent += `\n\n${authorStyle.nsfwPrompt}`;
            }

            parts.push(`<style>\n${styleContent}\n</style>`);
        }
    }

    // Blueprint injection - if blueprints are enabled and a blueprint exists
    if (blueprintActive && blueprintState) {
        const blueprintContent = BlueprintModule.buildBlueprintInjection(
            blueprintState,
            chatState.currentStep,
            chatState.arcLength
        );
        if (blueprintContent) {
            parts.push(`<blueprint>\n${blueprintContent}\n</blueprint>`);
        }
    }


    return parts.join('\n\n');
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
