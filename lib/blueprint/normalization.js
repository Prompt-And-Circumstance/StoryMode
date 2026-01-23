/**
 * @file Blueprint normalization
 * @module blueprint/normalization
 *
 * Fills missing blueprint fields with sensible defaults.
 * Handles backward compatibility with legacy blueprint formats.
 */

import { validateOpeningMessage } from './utils.js';

// Import ID functions from parent module (circular import safe since these are pure functions)
// These will be passed in via parameters to avoid circular dependency
let _generateBlueprintId = null;
let _isValidBlueprintId = null;

/**
 * Initialize normalization module with ID functions
 * Call this once during module initialization
 * @param {Function} generateFn - generateBlueprintId function
 * @param {Function} validateFn - isValidBlueprintId function
 */
export function initNormalization(generateFn, validateFn) {
    _generateBlueprintId = generateFn;
    _isValidBlueprintId = validateFn;
}

/**
 * Normalize character outcomes to consistent object format
 * Handles both string format ("CharacterName: outcome") and object format ({character_name, outcome})
 * @param {Array<string|Object>} outcomes - Array of outcome strings or outcome objects
 * @returns {Array<{character_name: string, outcome: string}>} Normalized outcome objects
 */
export function normalizeCharacterOutcomes(outcomes = []) {
    if (!Array.isArray(outcomes)) return [];

    return outcomes
        .filter(item => item != null) // Remove null/undefined items
        .map(item => {
            // Handle string format: "CharacterName: outcome" or just "outcome"
            if (typeof item === 'string') {
                const match = item.match(/^([^:]+):\s*(.+)$/);
                return match
                    ? { character_name: match[1].trim(), outcome: match[2].trim() }
                    : { character_name: 'Character', outcome: item };
            }
            // Handle object format: {character_name, outcome} or {character_name, description}
            if (typeof item === 'object') {
                return {
                    character_name: item.character_name || 'Character',
                    outcome: item.outcome || item.description || ''
                };
            }
            // Fallback for unexpected types
            return { character_name: 'Character', outcome: String(item) };
        })
        .filter(outcome => outcome.outcome.length > 0); // Remove empty outcomes
}

/**
 * Normalize character_focus to consistent object format
 * Handles both legacy string format (["Elena", "Mara"]) and new object format
 * ([{name, emotional_beat_target, turning_point}])
 * @param {Array<string|Object>} characterFocus - Array of character names or focus objects
 * @returns {Array<{name: string, emotional_beat_target: string|null, turning_point: string|null}>}
 */
function normalizeCharacterFocus(characterFocus = []) {
    if (!Array.isArray(characterFocus)) return [];

    return characterFocus
        .filter(item => item != null)
        .map(item => {
            // Handle legacy string format: "Elena" or "Elena Chen"
            if (typeof item === 'string') {
                return {
                    name: item,
                    emotional_beat_target: null,
                    turning_point: null
                };
            }
            // Handle new object format
            if (typeof item === 'object') {
                return {
                    name: item.name || item.character_name || 'Unknown',
                    emotional_beat_target: item.emotional_beat_target || null,
                    turning_point: item.turning_point || null
                };
            }
            // Fallback
            return { name: String(item), emotional_beat_target: null, turning_point: null };
        })
        .filter(focus => focus.name && focus.name !== 'Unknown');
}

/**
 * Normalize a blueprint by filling in missing fields with defaults
 * @param {Object} blueprint - Blueprint object to normalize
 * @returns {Object} Normalized blueprint with all required fields
 */
export function normalizeBlueprint(blueprint) {
    const normalized = { ...blueprint };

    // Generate or validate unique ID (preserve existing IDs for exports/imports)
    if (!normalized.blueprint_id || !_isValidBlueprintId(normalized.blueprint_id)) {
        const oldId = normalized.blueprint_id;
        normalized.blueprint_id = _generateBlueprintId();
        if (!oldId) {
        } else {
            console.warn('[Story Mode Blueprint] Invalid blueprint_id format, regenerating:', oldId, '->', normalized.blueprint_id);
        }
    }

    // Essential fields with defaults
    normalized.story_type_id = normalized.story_type_id || normalized.story_type_name?.toLowerCase().replace(/\s+/g, '_') || 'custom';
    normalized.story_type_name = normalized.story_type_name || 'Custom Story';
    normalized.core_premise = normalized.core_premise || 'A custom story';

    // Preserve author style if present (explicitly set to undefined if not in blueprint)
    // This ensures the field exists so syncBlueprintSettings can properly handle it
    if (Object.prototype.hasOwnProperty.call(blueprint, 'author_style')) {
        normalized.author_style = blueprint.author_style;
    } else {
        // Mark as explicitly not set for imported blueprints without the field
        normalized.author_style = undefined;
    }

    // Preserve author style name and prompt if present in the blueprint
    if (blueprint.author_style_name) {
        normalized.author_style_name = blueprint.author_style_name;
    }
    if (blueprint.author_style_prompt) {
        normalized.author_style_prompt = blueprint.author_style_prompt;
    }

    // Preserve opening message if present (with validation)
    if (Object.prototype.hasOwnProperty.call(blueprint, 'opening_message')) {
        const validation = validateOpeningMessage(blueprint.opening_message);
        if (validation.valid) {
            normalized.opening_message = validation.sanitized;
            if (validation.truncated) {
                console.warn('[BlueprintModule] Opening message truncated during normalization');
            }
        } else {
            console.warn('[BlueprintModule] Invalid opening_message in blueprint, discarding:', validation.error);
            normalized.opening_message = undefined;
        }
    } else {
        normalized.opening_message = undefined;
    }

    // Preserve llmDescriptor if present (with validation)
    if (Object.prototype.hasOwnProperty.call(blueprint, 'llmDescriptor')) {
        const desc = blueprint.llmDescriptor;
        // Validate: must be a string, non-empty, and within reasonable length
        if (typeof desc === 'string' && desc.trim().length > 0 && desc.length < 200) {
            normalized.llmDescriptor = desc.trim();
        } else {
            console.warn('[BlueprintModule] Invalid llmDescriptor in blueprint, discarding');
            normalized.llmDescriptor = undefined;
        }
    } else {
        normalized.llmDescriptor = undefined;
    }

    // Preserve blueprint_title if present (with validation)
    if (Object.prototype.hasOwnProperty.call(blueprint, 'blueprint_title')) {
        const title = blueprint.blueprint_title;
        // Validate: must be a string, non-empty, and within reasonable length
        if (typeof title === 'string' && title.trim().length > 0 && title.length < 200) {
            normalized.blueprint_title = title.trim();
        } else {
            console.warn('[BlueprintModule] Invalid blueprint_title in blueprint, discarding');
            normalized.blueprint_title = undefined;
        }
    } else {
        normalized.blueprint_title = undefined;
    }

    // Preserve cover_prompt if present (with validation)
    if (Object.prototype.hasOwnProperty.call(blueprint, 'cover_prompt')) {
        const prompt = blueprint.cover_prompt;
        // Validate: must be a string, non-empty, and within reasonable length
        if (typeof prompt === 'string' && prompt.trim().length > 0 && prompt.length < 5000) {
            normalized.cover_prompt = prompt.trim();
        } else {
            console.warn('[BlueprintModule] Invalid cover_prompt in blueprint, discarding');
            normalized.cover_prompt = undefined;
        }
    } else {
        normalized.cover_prompt = undefined;
    }

    // Preserve cover_image if present (with validation)
    if (Object.prototype.hasOwnProperty.call(blueprint, 'cover_image')) {
        const image = blueprint.cover_image;
        // Validate: must be a string and non-empty (can be base64 or URL)
        if (typeof image === 'string' && image.trim().length > 0) {
            normalized.cover_image = image.trim();
        } else {
            console.warn('[BlueprintModule] Invalid cover_image in blueprint, discarding');
            normalized.cover_image = undefined;
        }
    } else {
        normalized.cover_image = undefined;
    }

    // Creator notes - initialize structure and preserve/validate fields
    normalized.creator_notes = normalized.creator_notes || {};
    if (blueprint.creator_notes) {
        // Validate created_by
        if (typeof blueprint.creator_notes.created_by === 'string' && blueprint.creator_notes.created_by.trim().length > 0) {
            normalized.creator_notes.created_by = blueprint.creator_notes.created_by.trim().substring(0, 100);
        } else {
            normalized.creator_notes.created_by = '';
        }
        // Validate scenario_version
        if (typeof blueprint.creator_notes.scenario_version === 'string' && blueprint.creator_notes.scenario_version.trim().length > 0) {
            normalized.creator_notes.scenario_version = blueprint.creator_notes.scenario_version.trim().substring(0, 50);
        } else {
            normalized.creator_notes.scenario_version = '';
        }
        // Validate notes
        if (typeof blueprint.creator_notes.notes === 'string' && blueprint.creator_notes.notes.trim().length > 0) {
            normalized.creator_notes.notes = blueprint.creator_notes.notes.trim().substring(0, 5000);
        } else {
            normalized.creator_notes.notes = '';
        }
    } else {
        normalized.creator_notes.created_by = '';
        normalized.creator_notes.scenario_version = '';
        normalized.creator_notes.notes = '';
    }

    // Setting with defaults
    normalized.setting = normalized.setting || {
        location: 'Unknown',
        time_period: 'Unknown',
        atmosphere: 'Unknown',
    };
    normalized.setting.location = normalized.setting.location || 'Unknown';
    normalized.setting.time_period = normalized.setting.time_period || 'Unknown';
    normalized.setting.atmosphere = normalized.setting.atmosphere || 'Unknown';

    // Protagonist group with defaults
    normalized.protagonist_group = normalized.protagonist_group || {
        description: 'The protagonists',
        shared_goal: 'To complete their journey',
        group_dynamic: 'Working together',
    };
    normalized.protagonist_group.description = normalized.protagonist_group.description || 'The protagonists';
    normalized.protagonist_group.shared_goal = normalized.protagonist_group.shared_goal || 'To complete their journey';
    normalized.protagonist_group.group_dynamic = normalized.protagonist_group.group_dynamic || 'Working together';

    // Antagonistic forces with defaults
    normalized.antagonistic_forces = normalized.antagonistic_forces || {
        description: 'Opposing forces',
        nature: 'Unknown',
        motivation: 'Opposition to the protagonists',
        manifestations: [],
    };
    normalized.antagonistic_forces.description = normalized.antagonistic_forces.description || 'Opposing forces';
    normalized.antagonistic_forces.nature = normalized.antagonistic_forces.nature || 'Unknown';
    normalized.antagonistic_forces.motivation = normalized.antagonistic_forces.motivation || 'Opposition to the protagonists';
    normalized.antagonistic_forces.manifestations = normalized.antagonistic_forces.manifestations || [];

    // Arc structure with defaults
    normalized.arc_structure = normalized.arc_structure || {
        opening_hook: 'The story begins',
        escalation_pattern: 'Challenges increase',
        climax_nature: 'Confrontation',
        resolution_style: 'The story concludes',
        total_messages_target: 30,
    };
    normalized.arc_structure.opening_hook = normalized.arc_structure.opening_hook || 'The story begins';
    normalized.arc_structure.escalation_pattern = normalized.arc_structure.escalation_pattern || 'Challenges increase';
    normalized.arc_structure.climax_nature = normalized.arc_structure.climax_nature || 'Confrontation';
    normalized.arc_structure.resolution_style = normalized.arc_structure.resolution_style || 'The story concludes';
    normalized.arc_structure.total_messages_target = normalized.arc_structure.total_messages_target || 30;

    // Character arcs - ensure array
    normalized.character_arcs = normalized.character_arcs || [];
    normalized.character_arcs = normalized.character_arcs.map(arc => ({
        character_name: arc.character_name || 'Unknown',
        initial_state: arc.initial_state || 'Starting state',
        key_turning_points: arc.key_turning_points || [],
        final_state: arc.final_state || 'Ending state',
        emotional_trajectory: arc.emotional_trajectory || 'Character journey',
    }));

    // Scene plan - normalize each scene
    normalized.scene_plan = (normalized.scene_plan || []).map((scene, index) => {
        const normalizedScene = {
            index: scene.index ?? index,
            title: scene.title || `Scene ${index + 1}`,
            phase: scene.phase || 'setup',
            purpose: scene.purpose || 'Advance the story',
            situation: scene.situation || 'A scene unfolds',
            key_events_if_unchanged: scene.key_events_if_unchanged || scene.key_events_if_unchallenged || [],
            choice_points: scene.choice_points || [],
            character_focus: normalizeCharacterFocus(scene.character_focus),
            hooks_for_future: scene.hooks_for_future || [],
        };

        // Normalize beats array if present
        if (scene.beats && Array.isArray(scene.beats)) {
            normalizedScene.beats = scene.beats.map((beat, beatIndex) => ({
                index: beat.index ?? beatIndex,
                title: beat.title || `Beat ${beatIndex + 1}`,
                description: beat.description || '',
                type: beat.type || 'reaction', // Default to reaction type
                required: beat.required ?? true, // Default to required
                emotional_beat_target: beat.emotional_beat_target || null, // Optional emotional focus
                pacing_constraints: beat.pacing_constraints || null, // Optional pacing guidance
            }));
        } else {
            // Provide empty beats array for compatibility
            normalizedScene.beats = [];
        }

        // Add expected_rounds if present, otherwise it will be calculated dynamically
        if (scene.expected_rounds && typeof scene.expected_rounds === 'number') {
            normalizedScene.expected_rounds = scene.expected_rounds;
        }

        return normalizedScene;
    });

    // Possible resolutions - ensure array (deprecated, kept for backward compatibility)
    normalized.possible_resolutions = normalized.possible_resolutions || [];
    normalized.possible_resolutions = normalized.possible_resolutions.map(resolution => ({
        title: resolution.title || 'Resolution',
        description: resolution.description || 'The story concludes',
        character_outcomes: resolution.character_outcomes || [],
        thematic_resolution: resolution.thematic_resolution || 'Themes are resolved',
    }));

    // Primary ending and alternate endings (new structure)
    // Backward compatibility: convert old possible_resolutions to new structure if primary_ending not present
    if (!normalized.primary_ending && normalized.possible_resolutions && normalized.possible_resolutions.length > 0) {
        // First resolution becomes primary
        normalized.primary_ending = normalized.possible_resolutions[0];
        // Next 2 become alternates
        normalized.alternate_endings = normalized.possible_resolutions.slice(1, 3);
    }

    // Ensure primary_ending exists
    if (!normalized.primary_ending) {
        normalized.primary_ending = {
            title: 'Story Conclusion',
            description: 'The story reaches its conclusion',
            character_outcomes: [],
            thematic_resolution: 'The themes of the story are resolved'
        };
    }

    // Normalize primary_ending character_outcomes using helper
    if (normalized.primary_ending.character_outcomes) {
        normalized.primary_ending.character_outcomes = normalizeCharacterOutcomes(normalized.primary_ending.character_outcomes);
    } else {
        normalized.primary_ending.character_outcomes = [];
    }

    // Ensure alternate_endings exists and has exactly 2 items (fill with defaults if needed)
    normalized.alternate_endings = normalized.alternate_endings || [];
    while (normalized.alternate_endings.length < 2) {
        normalized.alternate_endings.push({
            title: `Alternate Ending ${normalized.alternate_endings.length + 1}`,
            description: 'An alternate conclusion to the story',
            character_outcomes: [],
            thematic_resolution: 'A different thematic resolution'
        });
    }

    // Normalize alternate endings using helper
    normalized.alternate_endings = normalized.alternate_endings.map((ending, index) => ({
        title: ending.title || `Alternate Ending ${index + 1}`,
        description: ending.description || 'An alternate conclusion to the story',
        character_outcomes: normalizeCharacterOutcomes(ending.character_outcomes),
        thematic_resolution: ending.thematic_resolution || 'A different thematic resolution'
    }));

    // Convert primary_ending to final scene in scene_plan
    // This makes the primary ending a concrete scene that players will reach
    if (normalized.primary_ending && normalized.scene_plan) {
        // Build character_focus from character_outcomes
        const characterFocus = [];
        if (normalized.primary_ending.character_outcomes && Array.isArray(normalized.primary_ending.character_outcomes)) {
            normalized.primary_ending.character_outcomes.forEach(outcome => {
                // Null safety guard: skip null/undefined outcomes
                if (!outcome || !outcome.character_name) return;

                characterFocus.push({
                    name: outcome.character_name,
                    emotional_beat_target: outcome.outcome || 'Character reaches their conclusion'
                });
            });
        }

        const finalScene = {
            index: normalized.scene_plan.length,
            title: normalized.primary_ending.title || 'Epilogue',
            phase: 'resolution',
            purpose: 'Story conclusion and character resolution',
            situation: normalized.primary_ending.description || 'The story reaches its conclusion',
            key_events_if_unchanged: [],
            choice_points: [],  // No choices in final scene
            character_focus: characterFocus,
            hooks_for_future: [],
            beats: [
                {
                    index: 0,
                    title: 'Resolution',
                    description: normalized.primary_ending.description || 'The story concludes',
                    type: 'resolution',
                    required: true,
                    emotional_beat_target: normalized.primary_ending.thematic_resolution || 'Themes are resolved'
                }
            ],
            is_ending_scene: true  // Marker for UI display
        };

        // Check if last scene is already marked as ending scene (replace it)
        const lastScene = normalized.scene_plan[normalized.scene_plan.length - 1];
        if (lastScene?.is_ending_scene) {
            normalized.scene_plan[normalized.scene_plan.length - 1] = finalScene;
        } else {
            normalized.scene_plan.push(finalScene);
        }
    }

    // Tone and style with defaults
    normalized.tone_and_style = normalized.tone_and_style || {
        primary_tone: 'Neutral',
        narrative_voice: 'Third-person',
        pacing: 'Steady',
        key_stylistic_elements: [],
    };
    normalized.tone_and_style.primary_tone = normalized.tone_and_style.primary_tone || 'Neutral';
    normalized.tone_and_style.narrative_voice = normalized.tone_and_style.narrative_voice || 'Third-person';
    normalized.tone_and_style.pacing = normalized.tone_and_style.pacing || 'Steady';
    normalized.tone_and_style.key_stylistic_elements = normalized.tone_and_style.key_stylistic_elements || [];

    // Content boundaries with defaults
    normalized.content_boundaries = normalized.content_boundaries || {
        violence_level: 'None specified',
        romance_level: 'None specified',
        other_content_notes: '',
    };
    normalized.content_boundaries.violence_level = normalized.content_boundaries.violence_level || 'None specified';
    normalized.content_boundaries.romance_level = normalized.content_boundaries.romance_level || 'None specified';
    normalized.content_boundaries.other_content_notes = normalized.content_boundaries.other_content_notes || '';

    // Genre realism notes with defaults
    normalized.genre_realism_notes = normalized.genre_realism_notes || {
        metaphor_level_used: 'mixed',
        implementation_notes: 'Genre elements blend with story themes.',
    };
    normalized.genre_realism_notes.metaphor_level_used = normalized.genre_realism_notes.metaphor_level_used || 'mixed';
    normalized.genre_realism_notes.implementation_notes = normalized.genre_realism_notes.implementation_notes || 'Genre elements blend with story themes.';

    return normalized;
}
