/**
 * Blueprint Injection Module
 *
 * Builds prompt injection content for blueprint-driven stories.
 * Handles both Story Mode (round-based) and Scenario Mode (signal-based) pacing.
 */

import { extension_settings } from '/scripts/extensions.js';

import { MODULE_NAME } from '../core/index.js';
import { getPacingMode, getCurrentSceneIndex } from '../core/state-manager.js';
import { getScenePacingInfo } from './scene-pacing.js';
import {
    buildScenarioModeInjection,
    buildMissingCharactersXml,
    getCompletedBeats,
} from '../scenario/index.js';

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Build injection for Scenario Mode (StoryVerse architecture)
 * Uses Abstract Acts, Placeholders, and Signal-based tracking.
 * Uses consolidated XML format with visual beat progress markers and positive exit triggers.
 * Designed to be the single source of pacing information when blueprint is active.
 *
 * @param {Object} blueprintState - The current blueprint state.
 * @param {number} currentStep - Current round number.
 * @param {number} arcLength - Total arc length.
 * @returns {string|null} The consolidated pacing injection, or null if not applicable.
 */
export function buildBlueprintInjection(blueprintState, currentStep, arcLength) {
    const pacingMode = getPacingMode();

    if (!blueprintState.useBlueprint || !blueprintState.blueprint) {
        return null;
    }

    // Switch logic based on Pacing Mode
    if (pacingMode === 'scenario') {
        const settings = extension_settings[MODULE_NAME];
        const scenarioInjection = buildScenarioModeInjection(blueprintState);

        // Build scene summaries if enabled (same logic as Story Mode)
        let summariesXml = '';
        if (settings.blueprintSettings?.includeSummariesInPrompt && blueprintState.sceneSummaries) {
            const sceneIndex = getCurrentSceneIndex();
            const summaryEntries = Object.entries(blueprintState.sceneSummaries)
                .filter(([idx]) => parseInt(idx) < sceneIndex)
                .sort(([a], [b]) => parseInt(a) - parseInt(b))
                .map(([idx, { sceneTitle, summary }]) =>
                    `  <scene index="${parseInt(idx) + 1}" title="${sceneTitle}">${summary}</scene>`
                );

            if (summaryEntries.length > 0) {
                summariesXml = `<previous_scenes>\n${summaryEntries.join('\n')}\n</previous_scenes>\n\n`;
            }
        }

        return summariesXml + scenarioInjection;
    }

    // Default: Story Mode (Round-based pacing logic)
    const blueprint = blueprintState.blueprint;

    // Get scene pacing info (this calculates position within scene)
    const pacingInfo = getScenePacingInfo(
        blueprint,
        currentStep,
        arcLength,
        blueprintState.sceneMode,
        getCurrentSceneIndex()
    );
    if (!pacingInfo) {
        return null;
    }

    const {
        scene,
        sceneIndex,
        totalScenes,
        sceneStartRound,
        sceneEndRound,
        expectedSceneRounds,
        roundInScene,
        roundsRemaining,
        percentThroughScene,
    } = pacingInfo;

    const settings = extension_settings[MODULE_NAME];

    // --- Build visual beat progress and exit trigger ---
    let beatProgress = '';
    let currentBeatTitle = '';
    let exitTrigger = '';

    const hasBeats = scene.beats?.length > 0 && settings.blueprintSettings?.beatTrackingEnabled !== false;

    if (hasBeats) {
        const completedBeats = getCompletedBeats(sceneIndex);
        const currentBeatIndex = Math.min(completedBeats.length, scene.beats.length - 1);

        // Find current beat title
        currentBeatTitle = scene.beats[currentBeatIndex]?.title || '';

        // Build compact visual beat markers
        beatProgress = scene.beats.map((beat, idx) => {
            if (completedBeats.includes(idx)) return `[✓ ${beat.title}]`;
            if (idx === currentBeatIndex) return `[→ ${beat.title}]`;
            return `[□ ${beat.title}]`;
        }).join(' ');

        // Exit trigger with final beat
        const finalBeatTitle = scene.beats[scene.beats.length - 1].title.toLowerCase();
        exitTrigger = scene.purpose
            ? `Scene ends when: ${scene.purpose.toLowerCase().replace(/\.$/, '')}, and ${finalBeatTitle} is complete.`
            : 'Scene ends when: all beats are complete and the scene feels resolved.';
    } else {
        // No beats - simpler exit trigger
        exitTrigger = scene.purpose
            ? `Scene ends when: ${scene.purpose.toLowerCase().replace(/\.$/, '')}.`
            : 'Scene ends when: the situation is resolved.';
    }

    // --- Build scene summaries if enabled ---
    let summariesXml = '';
    if (settings.blueprintSettings?.includeSummariesInPrompt && blueprintState.sceneSummaries) {
        const summaryEntries = Object.entries(blueprintState.sceneSummaries)
            .filter(([sceneIdx]) => parseInt(sceneIdx) < sceneIndex)
            .sort(([a], [b]) => parseInt(a) - parseInt(b))
            .map(([sceneIdx, { sceneTitle, summary }]) =>
                `    <scene index="${parseInt(sceneIdx) + 1}" title="${sceneTitle}">${summary}</scene>`
            );

        if (summaryEntries.length > 0) {
            summariesXml = `\n  <previous_scenes>\n${summaryEntries.join('\n')}\n  </previous_scenes>`;
        }
    }

    // --- Build character focus ---
    let characterFocusXml = '';
    if (scene.character_focus && scene.character_focus.length > 0) {
        const focusItems = scene.character_focus
            .map(cf => `    <character name="${cf.name}">${cf.emotional_beat_target}</character>`)
            .join('\n');
        characterFocusXml = `\n  <character_focus>\n${focusItems}\n  </character_focus>`;
    }

    // --- Build missing characters injection ---
    const missingCharactersXml = buildMissingCharactersXml(blueprint, scene);

    // --- Build tone/style compact ---
    const toneStyle = blueprint.tone_and_style;
    const toneXml = toneStyle
        ? `\n  <tone primary="${toneStyle.primary_tone || 'unspecified'}" voice="${toneStyle.narrative_voice || 'unspecified'}" elements="${(toneStyle.key_stylistic_elements || []).join(', ')}"/>`
        : '';

    // --- Build next scene preview (if not on final scene) ---
    let nextSceneXml = '';
    if (sceneIndex < totalScenes - 1) {
        const nextScene = blueprint.scene_plan[sceneIndex + 1];
        if (nextScene) {
            nextSceneXml = `\n<next_scene title="${nextScene.title}" phase="${nextScene.phase}">
  Upcoming: ${nextScene.purpose || nextScene.situation || 'Continue the story'}
</next_scene>`;
        }
    }

    // --- Build scene completion checklist ---
    let sceneChecklist = '';
    if (hasBeats) {
        const keyEvents = scene.key_events_if_unchallenged?.slice(0, 2).join('; ') || 'scene objectives';
        sceneChecklist = `
SCENE CHECKLIST - Before signaling transition:
□ Exit trigger met: "${exitTrigger}"
□ Key events addressed: ${keyEvents}
□ Current beat complete: ${currentBeatTitle || 'current focus'}`;
    } else {
        sceneChecklist = `
SCENE CHECKLIST - Before signaling transition:
□ Scene purpose fulfilled: ${scene.purpose || 'situation resolved'}`;
    }

    // --- Construct consolidated injection ---
    const injection = `<story_state>
  <scene index="${sceneIndex + 1}" of="${totalScenes}" title="${scene.title}" phase="${scene.phase}">
    <position round="${roundInScene}/${expectedSceneRounds}" remaining="${roundsRemaining}" percent="${percentThroughScene}%"/>
    <beats>${beatProgress}</beats>
    <current_focus>${currentBeatTitle || scene.situation}</current_focus>
    <exit_trigger>${exitTrigger}</exit_trigger>
  </scene>${summariesXml}${characterFocusXml}${missingCharactersXml ? '\n' + missingCharactersXml : ''}${toneXml}
</story_state>

<scene_context>
  <premise>${blueprint.core_premise}</premise>
  <situation>${scene.situation}</situation>
  <purpose>${scene.purpose}</purpose>
</scene_context>${nextSceneXml}

<instructions>
PACING MARKERS - Include these in your response when appropriate:

BEAT COMPLETION: When you complete a beat from the list above, output its marker on a new line.
Use the beat's index number (0-based):
  - First beat (index 0) → @@BEAT:0@@
  - Second beat (index 1) → @@BEAT:1@@
  - Third beat (index 2) → @@BEAT:2@@
  - And so on for each beat you complete

A beat is "addressed" when:
- establishment: The setting/mood/situation has been described
- hook: A compelling element has been introduced
- reaction: Characters have responded to events
- escalation: Tension or stakes have increased
- emotional: A character moment or feeling has been explored
- pivot/transition: The narrative direction has shifted

Example: After describing characters entering (beat 0 "First Steps Inside"):

  The tatami mats creaked softly as they stepped inside...

  @@BEAT:0@@

  Julie paused at the threshold...
${sceneChecklist}

${sceneIndex === totalScenes - 1 ? `STORY COMPLETION: This is the FINAL SCENE. End your response with @@STORY_COMPLETE@@ on its own line when:
1. The exit_trigger condition above has been satisfied
2. Most or all beats show [✓] complete
3. The narrative has reached a satisfying conclusion

Do NOT use @@NEXT_SCENE@@ - use @@STORY_COMPLETE@@ to signal the story is complete.` : `SCENE TRANSITION: End your response with @@NEXT_SCENE@@ on its own line when:
1. The exit_trigger condition above has been satisfied
2. Most or all beats show [✓] complete
3. The narrative has reached a natural pause`}

These markers are parsed by the system - include them exactly as shown.
</instructions>`;

    return injection.trim();
}
