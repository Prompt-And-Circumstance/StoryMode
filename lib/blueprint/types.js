/**
 * JSDoc type definitions for the Blueprint module.
 * These are pure documentation — no executable code.
 * Import this file for IDE type support: import './types.js';
 */

/**
 * @typedef {Object} Blueprint
 * @property {string} blueprint_id - Unique identifier (UUID v4, RFC 4122 format)
 * @property {string} story_type_id - Story type identifier
 * @property {string} story_type_name - Human-readable story type name
 * @property {string} core_premise - The central concept or hook of the story
 * @property {Object} setting - Story setting details
 * @property {string} setting.location - Where the story takes place
 * @property {string} setting.time_period - When the story takes place
 * @property {string} setting.atmosphere - Mood and feeling of the setting
 * @property {Object} protagonist_group - Main character group details
 * @property {string} protagonist_group.description - Description of the group
 * @property {string} protagonist_group.shared_goal - What the group wants to achieve
 * @property {string} protagonist_group.group_dynamic - How the group interacts
 * @property {Object} antagonistic_forces - Opposition details
 * @property {string} antagonistic_forces.description - What opposes the protagonists
 * @property {string} antagonistic_forces.nature - Type of opposition
 * @property {string} antagonistic_forces.motivation - Why the opposition acts
 * @property {Array<string>} antagonistic_forces.manifestations - How the opposition appears
 * @property {Object} arc_structure - Story arc structure
 * @property {string} arc_structure.opening_hook - How the story begins
 * @property {string} arc_structure.escalation_pattern - How tension builds
 * @property {string} arc_structure.climax_nature - What the climax entails
 * @property {string} arc_structure.resolution_style - How the story concludes
 * @property {number} [arc_structure.total_messages_target] - Target round count (optional)
 * @property {Array<CharacterArc>} character_arcs - Character development arcs
 * @property {Array<Scene>} scene_plan - Scenes that make up the story
 * @property {Array<Resolution>} possible_resolutions - Potential endings
 * @property {Object} tone_and_style - Narrative style guidance
 * @property {string} tone_and_style.primary_tone - Overall mood
 * @property {string} tone_and_style.narrative_voice - Perspective and voice
 * @property {string} tone_and_style.pacing - Story rhythm
 * @property {Array<string>} tone_and_style.key_stylistic_elements - Writing techniques
 * @property {Object} content_boundaries - Content restrictions
 * @property {string} content_boundaries.violence_level - Amount of violence
 * @property {string} content_boundaries.romance_level - Amount of romance
 * @property {string} [content_boundaries.other_content_notes] - Other content notes (optional)
 * @property {Object} genre_realism_notes - Genre interpretation settings
 * @property {string} genre_realism_notes.metaphor_level_used - Literal/grounded/mixed/symbolic
 * @property {string} genre_realism_notes.implementation_notes - How to interpret the genre
 * @property {string} [author_style] - Author style ID (optional, imported from settings)
 * @property {number} [total_messages_target] - Legacy field for arc length (optional)
 * @property {string} [opening_message] - Pre-generated opening message (optional)
 * @property {string} [llmDescriptor] - Human-readable LLM model descriptor (captured at generation time)
 */

/**
 * @typedef {Object} CharacterArc
 * @property {string} character_name - Name of the character
 * @property {string} initial_state - Character's starting point
 * @property {Array<string>} key_turning_points - Major character changes
 * @property {string} final_state - Character's ending point
 * @property {string} emotional_trajectory - Emotional journey description
 */

/**
 * @typedef {Object} Scene
 * @property {number} index - Scene number (0-based)
 * @property {string} title - Scene title
 * @property {string} phase - Setup/Confrontation/Resolution
 * @property {string} purpose - Why this scene exists
 * @property {string} situation - What's happening in the scene
 * @property {Array<string>} key_events_if_unchanged - Default plot points
 * @property {Array<string>} choice_points - Where player agency matters
 * @property {Array<string>} character_focus - Which characters are highlighted
 * @property {Array<string>} hooks_for_future - Setup for later scenes
 */

/**
 * @typedef {Object} Resolution
 * @property {string} title - Resolution name
 * @property {string} description - What happens in this ending
 * @property {Array<string>} character_outcomes - What happens to each character
 * @property {string} thematic_resolution - How themes are resolved
 */

/**
 * @typedef {Object} BlueprintState
 * @property {Blueprint} [blueprint] - The blueprint object (contains blueprint_id)
 * @property {number} currentSceneIndex - Current scene index (for manual mode)
 * @property {string} sceneMode - 'auto' or 'manual' scene progression
 * @property {boolean} useBlueprint - Whether blueprint guidance is active
 */
