/**
 * @file Core constants for Story Mode extension
 * @module core/constants
 */

export const MODULE_NAME = 'story_mode';

/**
 * Metaphor levels for genre interpretation (literal to symbolic)
 */
export const METAPHOR_LEVELS = {
    LITERAL: 'literal',       // Genre elements are MANDATORY and CONCRETE
    GROUNDED: 'grounded',     // Genre elements exist but are subtle/ambiguous
    MIXED: 'mixed',           // Literal AND metaphorical genre elements
    SYMBOLIC: 'symbolic',     // Social/emotional "monsters" in genre structure
};

/**
 * Story length presets mapping to message targets
 */
export const LENGTH_PRESETS = {
    SHORT: { label: 'Short (~10 messages)', target: 10, sceneCount: '5-7' },
    MEDIUM: { label: 'Medium (~30 messages)', target: 30, sceneCount: '8-12' },
    LONG: { label: 'Long (~60 messages)', target: 60, sceneCount: '12-20' },
};

/**
 * Phase configuration for phased blueprint generation
 * Defines the 5 phases of blueprint generation with their progress milestones
 */
/**
 * Configuration for staged scene generation (Phase 3 batching)
 * Scenes are generated in batches to reduce per-call token requirements
 */
export const STAGED_SCENE_CONFIG = {
    planMaxTokens: 4096,
    batchMaxTokens: 16384,
    batchSize: 3,
    autoFallbackThreshold: 5, // <= this many scenes → use monolithic
    maxRetries: 2,
};

export const PHASE_CONFIG = {
    1: {
        name: 'Foundation',
        progress: 20,
        description: 'Building story foundation...',
        fields: ['core_premise', 'setting', 'antagonistic_forces', 'arc_structure', 'tone_and_style'],
        maxTokens: 8192,
    },
    2: {
        name: 'Characters',
        progress: 40,
        description: 'Developing character arcs...',
        fields: ['protagonist_group', 'character_arcs'],
        maxTokens: 16384,
    },
    3: {
        name: 'Scenes',
        progress: 70,
        description: 'Planning story scenes...',
        fields: ['scene_plan'],
        maxTokens: 32768,
    },
    4: {
        name: 'Resolutions',
        progress: 100,
        description: 'Crafting endings, opening & cover...',
        fields: ['primary_ending', 'alternate_endings', 'blueprint_title', 'cover_prompt', 'opening_message'],
        maxTokens: 32768,
    },
};
