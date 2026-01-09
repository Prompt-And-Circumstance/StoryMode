/**
 * Blueprint Schema Definitions
 *
 * This module serves as the single source of truth for blueprint field definitions,
 * validation rules, dropdown options, and default values.
 *
 * When adding new fields to the blueprint schema:
 * 1. Add the field definition to BLUEPRINT_FIELDS
 * 2. Add dropdown options to DROPDOWN_OPTIONS (if applicable)
 * 3. Update the Blueprint typedef in blueprint-module.js
 * 4. Update normalizeBlueprint() in blueprint-module.js to handle the new field
 *
 * @module blueprint-schema
 */

// ============================================================================
// DROPDOWN OPTIONS
// ============================================================================

/**
 * Predefined option sets for dropdown fields throughout the blueprint UI
 */
export const DROPDOWN_OPTIONS = {
    antagonistNature: [
        { value: 'external', label: 'External' },
        { value: 'internal', label: 'Internal' },
        { value: 'environmental', label: 'Environmental' },
        { value: 'mixed', label: 'Mixed' }
    ],
    metaphorLevel: [
        { value: 'literal', label: 'Literal' },
        { value: 'grounded', label: 'Grounded' },
        { value: 'mixed', label: 'Mixed' },
        { value: 'symbolic', label: 'Symbolic' }
    ],
    violenceLevel: [
        { value: 'none', label: 'None' },
        { value: 'mild', label: 'Mild' },
        { value: 'moderate', label: 'Moderate' },
        { value: 'intense', label: 'Intense' }
    ],
    romanceLevel: [
        { value: 'none', label: 'None' },
        { value: 'mild', label: 'Mild' },
        { value: 'moderate', label: 'Moderate' },
        { value: 'explicit', label: 'Explicit' }
    ],
    scenePhase: [
        { value: 'setup', label: 'Setup' },
        { value: 'confrontation', label: 'Confrontation' },
        { value: 'resolution', label: 'Resolution' }
    ]
};

// ============================================================================
// FIELD DEFINITIONS
// ============================================================================

/**
 * Blueprint field definitions with metadata for validation and UI generation
 *
 * Each field definition includes:
 * - type: Data type ('string', 'number', 'boolean', 'object', 'array')
 * - required: Whether the field must be present
 * - default: Default value (if not required)
 * - min/max: Length/value constraints
 * - nested: For object types, child field definitions
 * - items: For array types, item schema
 */
export const BLUEPRINT_FIELDS = {
    // Core Identification
    blueprint_id: {
        type: 'string',
        required: true,
        pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        description: 'Unique identifier (UUID v4)'
    },
    story_type_id: {
        type: 'string',
        required: true,
        min: 1,
        description: 'Story type identifier from library'
    },
    story_type_name: {
        type: 'string',
        required: true,
        min: 1,
        description: 'Human-readable story type name'
    },

    // Core Content
    core_premise: {
        type: 'string',
        required: true,
        min: 1,
        max: 5000,
        description: 'The central concept or hook of the story'
    },

    // Setting (nested object)
    setting: {
        type: 'object',
        required: true,
        nested: {
            location: { type: 'string', required: true, description: 'Where the story takes place' },
            time_period: { type: 'string', required: true, description: 'When the story takes place' },
            atmosphere: { type: 'string', required: true, description: 'Mood and feeling of the setting' }
        }
    },

    // Protagonist Group (nested object)
    protagonist_group: {
        type: 'object',
        required: true,
        nested: {
            description: { type: 'string', required: true, description: 'Description of the group' },
            shared_goal: { type: 'string', required: true, description: 'What the group wants to achieve' },
            group_dynamic: { type: 'string', required: true, description: 'How the group interacts' }
        }
    },

    // Antagonistic Forces (nested object)
    antagonistic_forces: {
        type: 'object',
        required: true,
        nested: {
            description: { type: 'string', required: true, description: 'What opposes the protagonists' },
            nature: {
                type: 'string',
                required: true,
                enum: ['external', 'internal', 'environmental', 'mixed'],
                description: 'Type of opposition'
            },
            motivation: { type: 'string', required: true, description: 'Why the opposition acts' },
            manifestations: {
                type: 'array',
                required: true,
                items: { type: 'string' },
                description: 'How the opposition appears'
            }
        }
    },

    // Arc Structure (nested object)
    arc_structure: {
        type: 'object',
        required: true,
        nested: {
            opening_hook: { type: 'string', required: true, description: 'How the story begins' },
            escalation_pattern: { type: 'string', required: true, description: 'How tension builds' },
            climax_nature: { type: 'string', required: true, description: 'What the climax entails' },
            resolution_style: { type: 'string', required: true, description: 'How the story concludes' },
            total_messages_target: { type: 'number', required: false, min: 1, description: 'Target round count' }
        }
    },

    // Character Arcs (array of objects)
    character_arcs: {
        type: 'array',
        required: true,
        items: {
            type: 'object',
            nested: {
                character_name: { type: 'string', required: true },
                initial_state: { type: 'string', required: true },
                key_turning_points: { type: 'array', required: true, items: { type: 'string' } },
                final_state: { type: 'string', required: true },
                emotional_trajectory: { type: 'string', required: true }
            }
        }
    },

    // Scene Plan (array of objects)
    scene_plan: {
        type: 'array',
        required: true,
        items: {
            type: 'object',
            nested: {
                index: { type: 'number', required: true, min: 0 },
                title: { type: 'string', required: true },
                phase: {
                    type: 'string',
                    required: true,
                    enum: ['setup', 'confrontation', 'resolution']
                },
                purpose: { type: 'string', required: true },
                situation: { type: 'string', required: true },
                key_events_if_unchanged: { type: 'array', required: true, items: { type: 'string' } },
                choice_points: { type: 'array', required: true, items: { type: 'string' } },
                character_focus: { type: 'array', required: true, items: { type: 'string' } },
                hooks_for_future: { type: 'array', required: true, items: { type: 'string' } }
            }
        }
    },

    // Possible Resolutions (array of objects)
    possible_resolutions: {
        type: 'array',
        required: true,
        items: {
            type: 'object',
            nested: {
                title: { type: 'string', required: true },
                description: { type: 'string', required: true },
                character_outcomes: { type: 'array', required: true, items: { type: 'string' } },
                thematic_resolution: { type: 'string', required: true }
            }
        }
    },

    // Tone and Style (nested object)
    tone_and_style: {
        type: 'object',
        required: true,
        nested: {
            primary_tone: { type: 'string', required: true, description: 'Overall mood' },
            narrative_voice: { type: 'string', required: true, description: 'Perspective and voice' },
            pacing: { type: 'string', required: true, description: 'Story rhythm' },
            key_stylistic_elements: {
                type: 'array',
                required: true,
                items: { type: 'string' },
                description: 'Writing techniques'
            }
        }
    },

    // Content Boundaries (nested object)
    content_boundaries: {
        type: 'object',
        required: true,
        nested: {
            violence_level: {
                type: 'string',
                required: true,
                enum: ['none', 'mild', 'moderate', 'intense'],
                description: 'Amount of violence'
            },
            romance_level: {
                type: 'string',
                required: true,
                enum: ['none', 'mild', 'moderate', 'explicit'],
                description: 'Amount of romance'
            },
            other_content_notes: {
                type: 'string',
                required: false,
                description: 'Other content notes'
            }
        }
    },

    // Genre Realism Notes (nested object)
    genre_realism_notes: {
        type: 'object',
        required: true,
        nested: {
            metaphor_level_used: {
                type: 'string',
                required: true,
                enum: ['literal', 'grounded', 'mixed', 'symbolic'],
                description: 'How literally to interpret genre elements'
            },
            implementation_notes: {
                type: 'string',
                required: true,
                description: 'How to interpret the genre'
            }
        }
    },

    // Optional Fields
    author_style: {
        type: 'string',
        required: false,
        description: 'Author style ID from library (optional)'
    },
    total_messages_target: {
        type: 'number',
        required: false,
        min: 1,
        description: 'Legacy field for arc length (optional)'
    },
    opening_message: {
        type: 'string',
        required: false,
        min: 1,
        max: 50000,
        description: 'Pre-generated opening message (optional)'
    },
    llmDescriptor: {
        type: 'string',
        required: false,
        description: 'Human-readable LLM model descriptor (captured at generation time)'
    }
};

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Get field definition by path (supports nested paths like "setting.location")
 * @param {string} path - Dot-separated field path
 * @returns {Object|null} Field definition or null if not found
 */
export function getFieldDefinition(path) {
    const parts = path.split('.');
    let current = BLUEPRINT_FIELDS[parts[0]];

    if (!current) return null;

    // Navigate nested fields
    for (let i = 1; i < parts.length; i++) {
        if (current.nested) {
            current = current.nested[parts[i]];
        } else if (current.items && current.items.nested) {
            current = current.items.nested[parts[i]];
        } else {
            return null;
        }

        if (!current) return null;
    }

    return current;
}

/**
 * Check if a field is required
 * @param {string} path - Dot-separated field path
 * @returns {boolean} True if required
 */
export function isFieldRequired(path) {
    const def = getFieldDefinition(path);
    return def ? def.required === true : false;
}

/**
 * Get dropdown options for a field (if applicable)
 * @param {string} path - Dot-separated field path
 * @returns {Array|null} Array of options or null
 */
export function getFieldOptions(path) {
    const def = getFieldDefinition(path);
    if (!def || !def.enum) return null;

    // Map from field path to DROPDOWN_OPTIONS key
    const optionsMap = {
        'antagonistic_forces.nature': 'antagonistNature',
        'genre_realism_notes.metaphor_level_used': 'metaphorLevel',
        'content_boundaries.violence_level': 'violenceLevel',
        'content_boundaries.romance_level': 'romanceLevel',
        'phase': 'scenePhase'  // For scene items
    };

    const optionsKey = optionsMap[path];
    return optionsKey ? DROPDOWN_OPTIONS[optionsKey] : null;
}

/**
 * Validate a field value against its definition
 * @param {string} path - Dot-separated field path
 * @param {*} value - Value to validate
 * @returns {Object} { valid: boolean, errors: Array<string> }
 */
export function validateField(path, value) {
    const def = getFieldDefinition(path);
    if (!def) {
        return { valid: false, errors: [`Unknown field: ${path}`] };
    }

    const errors = [];

    // Check required
    if (def.required && (value === null || value === undefined || value === '')) {
        errors.push(`${path} is required`);
        return { valid: false, errors };
    }

    // Skip further validation if optional and empty
    if (!def.required && (value === null || value === undefined || value === '')) {
        return { valid: true, errors: [] };
    }

    // Type checking
    if (def.type === 'string' && typeof value !== 'string') {
        errors.push(`${path} must be a string`);
    } else if (def.type === 'number' && typeof value !== 'number') {
        errors.push(`${path} must be a number`);
    } else if (def.type === 'boolean' && typeof value !== 'boolean') {
        errors.push(`${path} must be a boolean`);
    } else if (def.type === 'array' && !Array.isArray(value)) {
        errors.push(`${path} must be an array`);
    } else if (def.type === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
        errors.push(`${path} must be an object`);
    }

    // Length constraints for strings
    if (def.type === 'string' && typeof value === 'string') {
        if (def.min && value.length < def.min) {
            errors.push(`${path} must be at least ${def.min} characters`);
        }
        if (def.max && value.length > def.max) {
            errors.push(`${path} must be at most ${def.max} characters`);
        }
    }

    // Value constraints for numbers
    if (def.type === 'number' && typeof value === 'number') {
        if (def.min !== undefined && value < def.min) {
            errors.push(`${path} must be at least ${def.min}`);
        }
        if (def.max !== undefined && value > def.max) {
            errors.push(`${path} must be at most ${def.max}`);
        }
    }

    // Enum validation
    if (def.enum && !def.enum.includes(value)) {
        errors.push(`${path} must be one of: ${def.enum.join(', ')}`);
    }

    // Pattern validation
    if (def.pattern && typeof value === 'string' && !def.pattern.test(value)) {
        errors.push(`${path} has invalid format`);
    }

    return { valid: errors.length === 0, errors };
}
