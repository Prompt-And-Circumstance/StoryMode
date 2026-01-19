/**
 * @file Scenario Mode prompt injection (StoryVerse architecture)
 * @module scenario/injection
 *
 * Builds Abstract Acts prompts with placeholders, beats, and signal instructions.
 */

import { getBeatState, getCurrentSceneIndex } from '../core/state-manager.js';
import { resolvePlaceholders, checkPrerequisites } from '../blueprint/index.js';

/**
 * Build injection for Scenario Mode (StoryVerse architecture)
 * Uses Abstract Acts, Placeholders, and Signal-based tracking.
 * @param {Object} blueprintState - The current blueprint state
 * @returns {string|null} The prompt injection XML
 */
export function buildScenarioModeInjection(blueprintState) {
    const beatState = getBeatState();
    const blueprint = blueprintState.blueprint;
    const sceneIndex = getCurrentSceneIndex();
    const scene = blueprint.scene_plan[sceneIndex];
    const totalScenes = blueprint.scene_plan.length;
    const isFinalScene = sceneIndex >= totalScenes - 1;

    if (!scene) return null;

    // Resolve Placeholders
    const title = resolvePlaceholders(scene.title, blueprint);
    const situation = resolvePlaceholders(scene.situation, blueprint);
    const purpose = resolvePlaceholders(scene.purpose, blueprint);

    // Build character focus list with emotional targets and turning points
    let characterFocusXml = '';
    if (scene.character_focus && scene.character_focus.length > 0) {
        const charLines = scene.character_focus.map(c => {
            // Handle both legacy string format and new object format
            if (typeof c === 'string') {
                const name = resolvePlaceholders(c, blueprint);
                return `    <character name="${name}"/>`;
            }
            // New object format with emotional_beat_target and turning_point
            const name = resolvePlaceholders(c.name || c.character_name || 'Unknown', blueprint);
            const emotionalAttr = c.emotional_beat_target
                ? ` emotional_target="${resolvePlaceholders(c.emotional_beat_target, blueprint)}"`
                : '';
            const turningPointAttr = c.turning_point
                ? ` turning_point="${resolvePlaceholders(c.turning_point, blueprint)}"`
                : '';
            return `    <character name="${name}"${emotionalAttr}${turningPointAttr}/>`;
        });
        characterFocusXml = `\n  <characters>\n${charLines.join('\n')}\n  </characters>`;
    }

    // Build Beat list with state
    let beatsXml = '';
    let activeBeat = null;
    let activeBeatIndex = -1;

    if (scene.beats && scene.beats.length > 0) {
        const beatStrings = scene.beats.map((beat, idx) => {
            const state = beatState[idx]?.status || 'pending';
            const resolvedTitle = resolvePlaceholders(beat.title, blueprint);

            // Determine visual marker
            if (state === 'complete') return `[✓ ${resolvedTitle}]`;
            if (state === 'skipped') return `[x ${resolvedTitle}]`;

            // Find first pending beat to mark as current
            if (!activeBeat && checkPrerequisites(beat, beatState)) {
                activeBeat = beat;
                activeBeatIndex = idx;
                return `[→ ${resolvedTitle}]`; // Suggested Next
            }

            return `[□ ${resolvedTitle}]`;
        });
        beatsXml = `\n  <beats>${beatStrings.join(' ')}</beats>`;
    }

    // Derive exit trigger from purpose
    const exitTrigger = deriveExitTrigger(purpose, isFinalScene);

    // Build the abstract act XML
    const actXml = `<abstract_act scene="${sceneIndex + 1}" of="${totalScenes}" phase="${scene.phase || 'unknown'}">
  <title>${title}</title>
  <goal>${purpose}</goal>
  <situation>${situation}</situation>${characterFocusXml}${beatsXml}
  <exit_trigger>${exitTrigger}</exit_trigger>
</abstract_act>`;

    // Build signals block with clear guidance
    const signalsXml = buildSignalsBlock(activeBeatIndex, isFinalScene);

    return `${actXml}\n\n${signalsXml}`;
}

/**
 * Derive an exit trigger from the scene's purpose.
 * Transforms goal-oriented purpose into completion condition.
 * @param {string} purpose - The scene's purpose/goal
 * @param {boolean} isFinalScene - Whether this is the last scene
 * @returns {string} Exit trigger description
 */
export function deriveExitTrigger(purpose, isFinalScene) {
    if (!purpose) {
        return isFinalScene
            ? 'Scene ends when the story reaches its natural conclusion'
            : 'Scene ends when the goal is achieved or circumstances force a change';
    }

    // Transform common goal patterns into exit conditions
    const lowerPurpose = purpose.toLowerCase();

    // Pattern: "Establish X" → "X is established"
    if (lowerPurpose.startsWith('establish')) {
        const what = purpose.slice(9).trim();
        return `Scene ends when ${what} is established`;
    }

    // Pattern: "Reveal X" → "X is revealed"
    if (lowerPurpose.startsWith('reveal')) {
        const what = purpose.slice(6).trim();
        return `Scene ends when ${what} is revealed`;
    }

    // Pattern: "Character discovers X" → "discovery is made"
    if (lowerPurpose.includes('discover')) {
        return 'Scene ends when the discovery is made or abandoned';
    }

    // Pattern: "Confront X" → "confrontation resolves"
    if (lowerPurpose.includes('confront')) {
        return 'Scene ends when the confrontation resolves or escalates beyond this scene';
    }

    // Default: reframe purpose as completion
    if (isFinalScene) {
        return `Story concludes when: ${purpose}`;
    }
    return `Scene ends when: ${purpose} — or player action redirects the narrative`;
}

/**
 * Build the signals instruction block for LLM.
 * @param {number} activeBeatIndex - Index of the current active beat (-1 if none)
 * @param {boolean} isFinalScene - Whether this is the last scene
 * @returns {string} Signals XML block
 */
export function buildSignalsBlock(activeBeatIndex, isFinalScene) {
    const beatSignal = activeBeatIndex >= 0
        ? `When you address beat ${activeBeatIndex} in your narrative, emit: @@BEAT:${activeBeatIndex}@@`
        : 'No pending beats — focus on the scene goal';

    const sceneEndSignal = isFinalScene
        ? `When the story reaches its conclusion, emit: @@STORY_COMPLETE@@`
        : `When the exit trigger is met, emit: @@NEXT_SCENE@@`;

    return `<signals>
${beatSignal}
If player bypasses a beat entirely, emit: @@SKIP:N@@ (where N is beat index)
${sceneEndSignal}

Note: Signals are stripped from displayed text. Emit at response END, after narrative.
</signals>`;
}
