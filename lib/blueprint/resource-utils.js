/**
 * Blueprint Resource Utilities
 *
 * Shared helpers for resolving and constructing story type / author style
 * objects from blueprints.  Used by both PNG export (export.js) and JSON
 * export (editor-action-handlers.js) so the three-tier fallback logic
 * lives in one place.
 *
 * Resolution order (three-tier fallback):
 *   1. Library lookup by ID
 *   2. Reconstruct from inline fields stored on the blueprint
 *   3. Preserve previously-embedded data on the blueprint
 */

// ---------------------------------------------------------------------------
// Builders – construct a style object from inline blueprint fields
// ---------------------------------------------------------------------------

/**
 * Build a story type object from inline fields on a blueprint.
 * @param {Object} blueprint
 * @returns {Object} Story type object
 */
export function buildStoryTypeFromInlineFields(blueprint) {
    return {
        id: blueprint.story_type_id,
        name: blueprint.story_type_name,
        category: blueprint.story_type_category || ['Custom'],
        storyPrompt: blueprint.story_type_prompt,
        progressTemplate: blueprint.story_type_progress_template || '',
        phasePrompts: blueprint.story_type_phase_prompts || {},
        memorableElement: blueprint.story_type_memorable_element || null,
    };
}

/**
 * Build an author style object from inline fields on a blueprint.
 * @param {Object} blueprint
 * @param {string} [id] - Override ID (defaults to blueprint.author_style)
 * @returns {Object} Author style object
 */
export function buildAuthorStyleFromInlineFields(blueprint, id) {
    return {
        id: id || blueprint.author_style,
        name: blueprint.author_style_name,
        category: ['Imported'],
        authorPrompt: blueprint.author_style_prompt,
        nsfwPrompt: blueprint.author_style_nsfw_prompt || '',
        keywords: [],
    };
}

// ---------------------------------------------------------------------------
// Resolvers – three-tier fallback: library → inline → previous embedded
// ---------------------------------------------------------------------------

/**
 * Resolve a story type for embedding in an export.
 *
 * @param {Object} blueprint
 * @param {Array}  storyTypes - Current library contents (from getStoryTypes())
 * @returns {Object|null} Resolved story type or null
 */
export function resolveStoryType(blueprint, storyTypes) {
    if (!blueprint.story_type_id) return null;

    // Tier 1 – library lookup
    const fromLibrary = storyTypes.find(st => st.id === blueprint.story_type_id);
    if (fromLibrary) return fromLibrary;

    // Tier 2 – reconstruct from inline fields
    if (blueprint.story_type_name && blueprint.story_type_prompt) {
        return buildStoryTypeFromInlineFields(blueprint);
    }

    // Tier 3 – preserve previous embedded data
    return blueprint.embeddedResources?.storyType || null;
}

/**
 * Resolve an author style for embedding in an export.
 *
 * Only handles blueprints that have an author_style ID reference.
 * For blueprints with no ID but inline data, callers should use
 * buildAuthorStyleFromInlineFields() directly.
 *
 * @param {Object} blueprint
 * @param {Array}  authorStyles - Current library contents (from getAuthorStyles())
 * @returns {Object|null} Resolved author style or null
 */
export function resolveAuthorStyle(blueprint, authorStyles) {
    if (!blueprint.author_style) return null;

    // Tier 1 – library lookup
    const fromLibrary = authorStyles.find(as => as.id === blueprint.author_style);
    if (fromLibrary) return fromLibrary;

    // Tier 2 – reconstruct from inline fields
    if (blueprint.author_style_name && blueprint.author_style_prompt) {
        return buildAuthorStyleFromInlineFields(blueprint);
    }

    // Tier 3 – preserve previous embedded data
    return blueprint.embeddedResources?.authorStyle || null;
}
