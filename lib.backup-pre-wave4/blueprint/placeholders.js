/**
 * @file Placeholder resolution for blueprint text
 * @module blueprint/placeholders
 *
 * Resolves tokens like [Protagonist], [Antagonist], [Guide], [Character:N]
 * in blueprint text using character data from the blueprint.
 */

/**
 * Resolve placeholder tokens in text using blueprint data.
 * Supports: [Protagonist], [Antagonist], [Guide], [Mentor], [Character:N]
 * @param {string} text - Text containing placeholders
 * @param {Object} blueprint - The blueprint object
 * @returns {string} Resolved text
 */
export function resolvePlaceholders(text, blueprint) {
    if (!text) return '';
    if (!blueprint) return text;

    // Build character lookup from character_arcs
    const characters = blueprint.character_arcs || [];
    const characterNames = characters.map(c => c.character_name).filter(Boolean);

    // Cache for resolved placeholders (avoid repeated lookups)
    const cache = {};

    return text.replace(/\[([^\]]+)\]/g, (match, placeholder) => {
        // Check cache first
        if (cache[placeholder] !== undefined) {
            return cache[placeholder];
        }

        let resolved = resolveOnePlaceholder(placeholder, blueprint, characterNames);
        cache[placeholder] = resolved;
        return resolved;
    });
}

/**
 * Resolve a single placeholder token.
 * @param {string} placeholder - The placeholder without brackets (e.g., "Protagonist")
 * @param {Object} blueprint - The blueprint object
 * @param {string[]} characterNames - Array of character names from character_arcs
 * @returns {string} Resolved name or original bracketed placeholder
 */
function resolveOnePlaceholder(placeholder, blueprint, characterNames) {
    const lower = placeholder.toLowerCase();

    // [Protagonist] → first character
    if (lower === 'protagonist') {
        if (characterNames.length > 0) {
            return characterNames[0];
        }
        // Fallback: try to extract from protagonist_group.description
        const desc = blueprint.protagonist_group?.description || '';
        const extracted = extractFirstName(desc);
        return extracted || '[Protagonist]';
    }

    // [Antagonist] → from antagonistic_forces
    if (lower === 'antagonist') {
        const antag = blueprint.antagonistic_forces;
        if (antag?.description) {
            const extracted = extractFirstName(antag.description);
            if (extracted) return extracted;
        }
        // If nature is 'environmental' or no name found, use generic
        if (antag?.nature === 'environmental') {
            return 'the environment';
        }
        return 'the antagonist';
    }

    // [Guide] / [Mentor] → look for guide-like character
    if (lower === 'guide' || lower === 'mentor') {
        // Heuristic: look for character with "guide", "mentor", "teacher" in their arc
        for (const char of (blueprint.character_arcs || [])) {
            const arcText = `${char.initial_state} ${char.emotional_trajectory}`.toLowerCase();
            if (arcText.includes('guide') || arcText.includes('mentor') || arcText.includes('teach')) {
                return char.character_name;
            }
        }
        // Fallback: second character if exists, else keep placeholder
        if (characterNames.length > 1) {
            return characterNames[1];
        }
        return '[Guide]';
    }

    // [Character:N] → Nth character (0-indexed)
    const charIndexMatch = lower.match(/^character:(\d+)$/);
    if (charIndexMatch) {
        const idx = parseInt(charIndexMatch[1], 10);
        if (idx >= 0 && idx < characterNames.length) {
            return characterNames[idx];
        }
        return `[Character:${idx}]`;
    }

    // Check if placeholder matches a known character name exactly
    for (const name of characterNames) {
        if (name.toLowerCase() === lower) {
            return name; // Return properly cased name
        }
    }

    // Unknown placeholder - return as-is with brackets
    return `[${placeholder}]`;
}

/**
 * Extract the first proper name from a description string.
 * Uses simple heuristics: capitalized words that aren't common words.
 * @param {string} text - Description text
 * @returns {string|null} Extracted name or null
 */
function extractFirstName(text) {
    if (!text) return null;

    // Common words to skip (articles, prepositions, etc.)
    const skipWords = new Set([
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
        'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
        'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
        'their', 'they', 'them', 'his', 'her', 'its', 'our', 'your',
        'this', 'that', 'these', 'those', 'who', 'whom', 'whose', 'which',
        'what', 'where', 'when', 'why', 'how', 'all', 'each', 'every',
        'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
        'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very'
    ]);

    // Match capitalized words (potential names)
    const words = text.match(/\b[A-Z][a-z]+\b/g);
    if (!words) return null;

    for (const word of words) {
        if (!skipWords.has(word.toLowerCase())) {
            return word;
        }
    }

    return null;
}

/**
 * Check if prerequisites for a beat are met (StoryVerse v1 stub)
 * @param {Object} beat - The beat object
 * @param {Object} scenarioState - Current scenario state
 * @returns {boolean} True if prerequisites met
 */
export function checkPrerequisites(beat, scenarioState) {
    // v1: Assume linear progression if no explicit prerequisites
    return true;
}
