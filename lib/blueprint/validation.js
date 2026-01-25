/**
 * @file Blueprint validation
 * @module blueprint/validation
 *
 * Validates blueprint structure and required fields.
 */

import { normalizeBlueprint } from './normalization.js';
import { CORE_BEAT_TYPES, resolveBeatType } from './utils.js';

/**
 * Validate a blueprint object against required schema
 * Only checks truly essential fields. Missing optional fields are filled with defaults.
 * @param {Object} blueprint - The blueprint object to validate
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateBlueprint(blueprint) {
    const errors = [];

    // Only truly required fields - everything else can have defaults
    if (!blueprint.story_type_name && !blueprint.story_type_id) {
        errors.push('Blueprint must have either story_type_name or story_type_id');
    }

    if (!blueprint.core_premise) {
        errors.push('Blueprint must have a core_premise');
    }

    // Validate scene_plan is an array with at least one scene
    if (!Array.isArray(blueprint.scene_plan) || blueprint.scene_plan.length === 0) {
        errors.push('scene_plan must be a non-empty array');
    } else {
        // Validate each scene has minimal required fields
        blueprint.scene_plan.forEach((scene, index) => {
            if (!scene.title && !scene.situation) {
                errors.push(`scene_plan[${index}] must have at least a title or situation`);
            }

            // Validate beats array if present (optional for legacy blueprints)
            if (scene.beats) {
                if (!Array.isArray(scene.beats)) {
                    errors.push(`scene_plan[${index}].beats must be an array`);
                } else {
                    // Validate each beat structure
                    scene.beats.forEach((beat, beatIndex) => {
                        if (typeof beat.index !== 'number') {
                            errors.push(`scene_plan[${index}].beats[${beatIndex}].index must be a number`);
                        }
                        if (!beat.title && !beat.description) {
                            errors.push(`scene_plan[${index}].beats[${beatIndex}] must have at least a title or description`);
                        }
                        // Check if type is allowed (core type)
                        if (beat.type && !CORE_BEAT_TYPES.includes(beat.type)) {
                            // Migration strategy: convert to core type if possible
                            const resolvedType = resolveBeatType(beat.type);

                            // Log warning about migration
                            console.warn(`[BlueprintValidation] Auto-migrating beat type '${beat.type}' to '${resolvedType}'`);

                            // Preserve original type if not already set
                            if (!beat.original_type) {
                                beat.original_type = beat.type;
                            }

                            // Update to valid core type
                            beat.type = resolvedType;
                        }

                        // Final check (should always pass after migration unless something is very wrong)
                        if (beat.type && !CORE_BEAT_TYPES.includes(beat.type)) {
                            errors.push(`scene_plan[${index}].beats[${beatIndex}].type must be one of: ${CORE_BEAT_TYPES.join(', ')}`);
                        }
                    });
                }
            }

            // Validate expected_rounds if present
            if (scene.expected_rounds && typeof scene.expected_rounds !== 'number') {
                errors.push(`scene_plan[${index}].expected_rounds must be a number`);
            }
        });
    }

    // Validate character_arcs is an array (if present)
    if (blueprint.character_arcs && !Array.isArray(blueprint.character_arcs)) {
        errors.push('character_arcs must be an array');
    }

    // Validate primary_ending if present (optional for legacy blueprints)
    if (blueprint.primary_ending) {
        if (typeof blueprint.primary_ending !== 'object') {
            errors.push('primary_ending must be an object');
        } else {
            // Validate primary_ending has required fields when present
            if (!blueprint.primary_ending.title) {
                errors.push('primary_ending must have a title');
            }
            if (!blueprint.primary_ending.description) {
                errors.push('primary_ending must have a description');
            }
            // Validate character_outcomes is an array if present
            if (blueprint.primary_ending.character_outcomes && !Array.isArray(blueprint.primary_ending.character_outcomes)) {
                errors.push('primary_ending.character_outcomes must be an array');
            }
        }
    }

    // Validate alternate_endings is an array with exactly 2 items (if present)
    if (blueprint.alternate_endings) {
        if (!Array.isArray(blueprint.alternate_endings)) {
            errors.push('alternate_endings must be an array');
        } else if (blueprint.alternate_endings.length !== 2) {
            console.warn(`[BlueprintModule] Expected 2 alternate endings, got ${blueprint.alternate_endings.length}`);
        }
    }

    // Validate possible_resolutions is an array (if present) - deprecated field
    if (blueprint.possible_resolutions && !Array.isArray(blueprint.possible_resolutions)) {
        errors.push('possible_resolutions must be an array');
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

/**
 * Parse and validate blueprint JSON from LLM response
 * @param {string} rawResponse - Raw text response from LLM
 * @returns {Object} Parsed and validated blueprint, or null if invalid
 */
export function parseBlueprintResponse(rawResponse) {
    try {
        // Extract JSON from response (handle markdown code blocks)
        let jsonStr = rawResponse.trim();

        // Remove markdown code fences if present
        if (jsonStr.startsWith('```')) {
            const lines = jsonStr.split('\n');
            // Remove first line (```json or ```) and last line (```)
            if (lines[0].includes('json')) {
                lines.shift();
            }
            if (lines[lines.length - 1].trim() === '```') {
                lines.pop();
            }
            jsonStr = lines.join('\n').trim();
        }

        // Parse JSON
        const blueprint = JSON.parse(jsonStr);

        // Normalize blueprint to fill in missing fields with defaults
        const normalizedBlueprint = normalizeBlueprint(blueprint);

        // Validate schema
        const validation = validateBlueprint(normalizedBlueprint);
        if (!validation.valid) {
            console.error('[Story Mode Blueprint] Validation failed:', validation.errors);
            return {
                success: false,
                errors: validation.errors,
                rawResponse,
            };
        }

        return {
            success: true,
            blueprint: normalizedBlueprint,
        };
    } catch (error) {
        console.error('[Story Mode Blueprint] Parse error:', error);

        // Detect if the response might be truncated
        const jsonStr = rawResponse.trim();
        let isLikelyTruncated = false;

        // Check for common signs of truncation
        if (error instanceof SyntaxError) {
            // Count opening and closing braces to detect imbalance
            const openBraces = (jsonStr.match(/\{/g) || []).length;
            const closeBraces = (jsonStr.match(/\}/g) || []).length;
            const openBrackets = (jsonStr.match(/\[/g) || []).length;
            const closeBrackets = (jsonStr.match(/\]/g) || []).length;

            if (openBraces > closeBraces || openBrackets > closeBrackets) {
                isLikelyTruncated = true;
            }

            // Check if response ends mid-sentence or mid-string
            const lastChars = jsonStr.slice(-100);
            if (lastChars.includes('...') || lastChars.endsWith('"') || lastChars.endsWith(',')) {
                isLikelyTruncated = true;
            }
        }

        // Provide helpful error message
        let errorMessage = error.message;
        if (isLikelyTruncated) {
            errorMessage = 'The blueprint response was truncated (incomplete JSON). This usually means the LLM hit the token limit. Try again with a higher token limit in your blueprint settings, or use a simpler story type with fewer scenes.';
            console.warn('[Story Mode Blueprint] Detected likely truncated response:', {
                error: error.message,
                responseLength: jsonStr.length,
                endsWith: jsonStr.slice(-100)
            });
        }

        return {
            success: false,
            errors: [errorMessage],
            rawResponse,
            isLikelyTruncated,
        };
    }
}
