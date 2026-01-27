/**
 * @file Scenario Mode prompt injection (StoryVerse architecture)
 * @module scenario/injection
 *
 * Builds Abstract Acts prompts with placeholders, beats, and signal instructions.
 * Follows StoryVerse principles: guided player agency, emergent outcomes.
 */

import { getBeatState, getCurrentSceneIndex } from '../core/state-manager.js';
import { resolvePlaceholders, checkPrerequisites } from '../blueprint/index.js';
import { buildMissingCharactersXml } from './character-injection.js';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Escape special characters in XML attribute values.
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
export function escapeXmlAttr(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// ============================================================================
// MAIN INJECTION BUILDER
// ============================================================================

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

    // Resolve Placeholders with defensive string checks
    const title = typeof scene.title === 'string' ? resolvePlaceholders(scene.title, blueprint) : 'Untitled Scene';
    const situation = typeof scene.situation === 'string' ? resolvePlaceholders(scene.situation, blueprint) : '';
    const purpose = typeof scene.purpose === 'string' ? resolvePlaceholders(scene.purpose, blueprint) : '';

    // Build all injection components
    const characterFocusXml = buildCharacterFocusXml(scene, blueprint);
    const { beatsXml, activeBeatIndex } = buildBeatsXml(scene, beatState, blueprint);
    const sceneOpportunitiesXml = buildSceneOpportunitiesXml(scene, blueprint);
    const storyContextXml = buildStoryContextXml(blueprint, sceneIndex);

    // Build missing characters injection
    const missingCharactersXml = buildMissingCharactersXml(blueprint, scene);

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
    const signalsXml = buildSignalsBlock(activeBeatIndex, isFinalScene, sceneIndex, totalScenes);

    // Combine all sections - add missing characters after story context
    return `${storyContextXml}${missingCharactersXml ? '\n\n' + missingCharactersXml : ''}

${actXml}${sceneOpportunitiesXml}

${signalsXml}`;
}

// ============================================================================
// CHARACTER FOCUS WITH ARC DATA
// ============================================================================

/**
 * Build character focus XML with emotional targets, turning points, and arc data.
 * @param {Object} scene - Current scene object
 * @param {Object} blueprint - Full blueprint
 * @returns {string} Character focus XML or empty string
 */
function buildCharacterFocusXml(scene, blueprint) {
    if (!scene.character_focus || !Array.isArray(scene.character_focus) || scene.character_focus.length === 0) {
        return '';
    }

    const charLines = scene.character_focus
        .filter(c => c != null) // Filter out null/undefined
        .map(c => {
            // Handle legacy string format
            if (typeof c === 'string') {
                const name = resolvePlaceholders(c, blueprint);
                return `    <character name="${escapeXmlAttr(name)}"/>`;
            }

            // Handle non-object types gracefully
            if (typeof c !== 'object') {
                return null;
            }

            // New object format with emotional_beat_target and turning_point
            const rawName = c.name || c.character_name || 'Unknown';
            const name = typeof rawName === 'string' ? resolvePlaceholders(rawName, blueprint) : 'Unknown';

            let emotionalAttr = '';
            if (c.emotional_beat_target && typeof c.emotional_beat_target === 'string') {
                emotionalAttr = ` emotional_target="${escapeXmlAttr(resolvePlaceholders(c.emotional_beat_target, blueprint))}"`;
            }

            let turningPointAttr = '';
            if (c.turning_point && typeof c.turning_point === 'string') {
                turningPointAttr = ` turning_point="${escapeXmlAttr(resolvePlaceholders(c.turning_point, blueprint))}"`;
            }

            // Find character arc data if available
            const arcXml = buildCharacterArcXml(name, blueprint);

            if (arcXml) {
                return `    <character name="${escapeXmlAttr(name)}"${emotionalAttr}${turningPointAttr}>\n${arcXml}\n    </character>`;
            }
            return `    <character name="${escapeXmlAttr(name)}"${emotionalAttr}${turningPointAttr}/>`;
        })
        .filter(line => line != null); // Filter out any nulls from non-object types

    if (charLines.length === 0) return '';

    return `\n  <characters>\n${charLines.join('\n')}\n  </characters>`;
}

/**
 * Build character arc XML for a specific character (initial state + trajectory only).
 * Deliberately excludes final_state to preserve emergent outcomes.
 * @param {string} characterName - Name to match
 * @param {Object} blueprint - Full blueprint
 * @returns {string|null} Arc XML or null if not found
 */
function buildCharacterArcXml(characterName, blueprint) {
    if (!blueprint.character_arcs || !Array.isArray(blueprint.character_arcs)) {
        return null;
    }

    const arc = blueprint.character_arcs.find(a =>
        a.character_name?.toLowerCase() === characterName.toLowerCase()
    );

    if (!arc) return null;

    const parts = [];
    if (arc.initial_state && typeof arc.initial_state === 'string') {
        parts.push(`      <arc_start>${arc.initial_state}</arc_start>`);
    }
    if (arc.emotional_trajectory && typeof arc.emotional_trajectory === 'string') {
        parts.push(`      <trajectory>${arc.emotional_trajectory}</trajectory>`);
    }

    return parts.length > 0 ? parts.join('\n') : null;
}

// ============================================================================
// BEATS WITH TYPE AND DESCRIPTION
// ============================================================================

/**
 * Build beats XML with full details for all beats in the scene.
 * Shows status, title, description, and type for each beat.
 * @param {Object} scene - Current scene
 * @param {Object} beatState - Current beat completion state
 * @param {Object} blueprint - Full blueprint for placeholder resolution
 * @returns {Object} { beatsXml, activeBeatXml, activeBeatIndex }
 */
function buildBeatsXml(scene, beatState, blueprint) {
    if (!scene.beats || scene.beats.length === 0) {
        return { beatsXml: '', activeBeatXml: '', activeBeatIndex: -1 };
    }

    let activeBeatIndex = -1;

    const beatElements = scene.beats
        .filter(beat => beat != null)
        .map((beat, idx) => {
            const state = beatState[idx]?.status || 'pending';
            const rawTitle = beat.title && typeof beat.title === 'string' ? beat.title : `Beat ${idx + 1}`;
            const resolvedTitle = resolvePlaceholders(rawTitle, blueprint);

            // Determine status and if this is the active beat
            let status = state;
            let isCurrent = false;
            if (state !== 'complete' && state !== 'skipped' && activeBeatIndex === -1) {
                if (checkPrerequisites(beat, beatState)) {
                    activeBeatIndex = idx;
                    isCurrent = true;
                    status = 'current';
                }
            }

            // Build beat attributes
            const typeAttr = beat.type && typeof beat.type === 'string' ? ` type="${beat.type}"` : '';
            const currentAttr = isCurrent ? ' current="true"' : '';

            // Build beat inner content
            const innerParts = [`      <title>${resolvedTitle}</title>`];
            if (beat.description && typeof beat.description === 'string') {
                const resolvedDesc = resolvePlaceholders(beat.description, blueprint);
                innerParts.push(`      <description>${resolvedDesc}</description>`);
            }

            return `    <beat index="${idx}" status="${status}"${typeAttr}${currentAttr}>\n${innerParts.join('\n')}\n    </beat>`;
        });

    const beatsXml = `\n  <beats>\n${beatElements.join('\n')}\n  </beats>`;

    // No separate activeBeatXml needed since all info is in beats now
    return { beatsXml, activeBeatXml: '', activeBeatIndex };
}

// ============================================================================
// SCENE OPPORTUNITIES (CHOICE POINTS + HOOKS)
// ============================================================================

/**
 * Build scene opportunities XML with choice points and future hooks.
 * These enhance player agency by signaling decision moments and foreshadowing.
 * @param {Object} scene - Current scene
 * @param {Object} blueprint - Full blueprint for placeholder resolution
 * @returns {string} Scene opportunities XML or empty string
 */
function buildSceneOpportunitiesXml(scene, blueprint) {
    const parts = [];

    // Choice points - moments to offer meaningful player decisions
    // Can be either strings or objects with {id, description, example_player_intents, consequences}
    if (scene.choice_points && Array.isArray(scene.choice_points) && scene.choice_points.length > 0) {
        const validChoices = scene.choice_points
            .map(cp => {
                // Handle string format
                if (typeof cp === 'string' && cp.trim()) {
                    return `    <point>${resolvePlaceholders(cp, blueprint)}</point>`;
                }
                // Handle object format - extract description
                if (cp && typeof cp === 'object' && cp.description && typeof cp.description === 'string') {
                    const desc = resolvePlaceholders(cp.description, blueprint);
                    // Include example intents if available
                    if (cp.example_player_intents && Array.isArray(cp.example_player_intents)) {
                        const intents = cp.example_player_intents
                            .filter(i => typeof i === 'string')
                            .map(i => resolvePlaceholders(i, blueprint));
                        if (intents.length > 0) {
                            return `    <point>\n      <decision>${desc}</decision>\n      <options>${intents.join(' | ')}</options>\n    </point>`;
                        }
                    }
                    return `    <point>${desc}</point>`;
                }
                return null;
            })
            .filter(cp => cp != null);
        if (validChoices.length > 0) {
            parts.push(`  <choice_points>\n${validChoices.join('\n')}\n  </choice_points>`);
        }
    }

    // Hooks for future - seeds to plant for later payoff
    if (scene.hooks_for_future && Array.isArray(scene.hooks_for_future) && scene.hooks_for_future.length > 0) {
        const validHooks = scene.hooks_for_future
            .filter(h => typeof h === 'string' && h.trim())
            .map(h => `    <hook>${resolvePlaceholders(h, blueprint)}</hook>`);
        if (validHooks.length > 0) {
            parts.push(`  <plant_hooks>\n${validHooks.join('\n')}\n  </plant_hooks>`);
        }
    }

    if (parts.length === 0) return '';

    return `\n\n<scene_opportunities>\n${parts.join('\n')}\n</scene_opportunities>`;
}

// ============================================================================
// STORY CONTEXT (SETTING, OPPOSITION, BOUNDARIES, REALISM)
// ============================================================================

/**
 * Build story context XML with setting, antagonistic forces, content boundaries,
 * and genre realism notes. Injected to maintain world consistency.
 * @param {Object} blueprint - Full blueprint
 * @param {number} sceneIndex - Current scene index (for phase-aware context)
 * @returns {string} Story context XML or empty string
 */
function buildStoryContextXml(blueprint, sceneIndex) {
    const parts = [];

    // Setting - location, time period, atmosphere
    if (blueprint.setting && typeof blueprint.setting === 'object') {
        const s = blueprint.setting;
        const attrs = [];
        if (s.location && typeof s.location === 'string') attrs.push(`location="${escapeXmlAttr(s.location)}"`);
        if (s.time_period && typeof s.time_period === 'string') attrs.push(`period="${escapeXmlAttr(s.time_period)}"`);
        if (s.atmosphere && typeof s.atmosphere === 'string') attrs.push(`atmosphere="${escapeXmlAttr(s.atmosphere)}"`);

        if (attrs.length > 0) {
            parts.push(`  <setting ${attrs.join(' ')}/>`);
        }
    }

    // Antagonistic forces - what opposes the protagonists
    if (blueprint.antagonistic_forces && typeof blueprint.antagonistic_forces === 'object') {
        const af = blueprint.antagonistic_forces;
        const natureAttr = af.nature && typeof af.nature === 'string' ? ` nature="${escapeXmlAttr(af.nature)}"` : '';
        const motivationAttr = af.motivation && typeof af.motivation === 'string' ? ` motivation="${escapeXmlAttr(af.motivation)}"` : '';

        if (af.description && typeof af.description === 'string') {
            parts.push(`  <opposition${natureAttr}${motivationAttr}>${af.description}</opposition>`);
        }
    }

    // Content boundaries - respect user preferences
    if (blueprint.content_boundaries && typeof blueprint.content_boundaries === 'object') {
        const cb = blueprint.content_boundaries;
        const attrs = [];
        if (cb.violence_level && typeof cb.violence_level === 'string') attrs.push(`violence="${cb.violence_level}"`);
        if (cb.romance_level && typeof cb.romance_level === 'string') attrs.push(`romance="${cb.romance_level}"`);

        if (attrs.length > 0) {
            parts.push(`  <content ${attrs.join(' ')}/>`);
        }
    }

    // Genre realism - how literally to interpret genre elements
    if (blueprint.genre_realism_notes && typeof blueprint.genre_realism_notes === 'object') {
        const gr = blueprint.genre_realism_notes;
        if (gr.metaphor_level_used && typeof gr.metaphor_level_used === 'string') {
            if (gr.implementation_notes && typeof gr.implementation_notes === 'string') {
                parts.push(`  <realism level="${gr.metaphor_level_used}">${gr.implementation_notes}</realism>`);
            } else {
                parts.push(`  <realism level="${gr.metaphor_level_used}"/>`);
            }
        }
    }

    if (parts.length === 0) return '';

    return `<story_context>\n${parts.join('\n')}\n</story_context>\n\n`;
}

// ============================================================================
// EXIT TRIGGER DERIVATION
// ============================================================================

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

// ============================================================================
// SIGNALS BLOCK
// ============================================================================

/**
 * Build the signals instruction block for LLM.
 * @param {number} activeBeatIndex - Index of the current active beat (-1 if none)
 * @param {boolean} isFinalScene - Whether this is the last scene
 * @param {number} sceneIndex - Current scene index (0-based)
 * @param {number} totalScenes - Total number of scenes
 * @returns {string} Signals XML block
 */
export function buildSignalsBlock(activeBeatIndex, isFinalScene, sceneIndex = 0, totalScenes = 1) {
    const beatSignal = activeBeatIndex >= 0
        ? `Current beat (marked →): Beat ${activeBeatIndex}. After addressing this beat, emit: @@BEAT:${activeBeatIndex}@@`
        : 'All beats complete — focus on achieving the scene goal';

    const sceneEndSignal = isFinalScene
        ? `When the story reaches its natural conclusion, emit: @@STORY_COMPLETE@@`
        : `When the exit trigger is satisfied, emit: @@NEXT_SCENE@@`;

    // Only include story completion reminder in final two scenes
    const isNearEnd = sceneIndex >= totalScenes - 2;
    const storyCompleteReminder = isNearEnd
        ? `
STORY COMPLETION: If the narrative reaches a natural ending point — whether through character farewell, narrative closure, or the player wrapping up the story — you MUST emit @@STORY_COMPLETE@@ even if beats remain. The signal triggers epilogue generation.`
        : '';

    return `<signals>
${beatSignal}
If a beat becomes impossible or irrelevant due to player actions, emit: @@SKIP:N@@ (N = beat index)
${sceneEndSignal}${storyCompleteReminder}

IMPORTANT: Place signals at the END of your response, after all narrative content. Start with Beat 0 when entering a new scene.
</signals>`;
}
