/**
 * Scene Image Prompt Generation Module
 *
 * Generates detailed image prompts from blueprint scene/beat context.
 * Extracts visual elements from scene data and applies style modifiers.
 */

import { extension_settings } from '/scripts/extensions.js';
import { MODULE_NAME } from '../state-manager.js';

// ============================================================================
// MODULE CONSTANTS
// ============================================================================

/** Style modifier templates based on blueprint tone */
const STYLE_TEMPLATES = {
    'dark': 'dark fantasy art, moody atmosphere, dramatic lighting, high contrast',
    'light': 'bright and cheerful, soft lighting, warm colors, inviting atmosphere',
    'mysterious': 'mysterious ambiance, fog and shadows, enigmatic mood, subtle details',
    'dramatic': 'dramatic composition, intense lighting, dynamic angles, emotional depth',
    'whimsical': 'whimsical style, playful elements, vibrant colors, fantastical touches',
    'epic': 'epic scale, grand vistas, heroic composition, cinematic quality',
    'intimate': 'intimate perspective, emotional closeness, soft focus, personal mood',
    'tense': 'tense atmosphere, sharp angles, dramatic shadows, sense of danger',
};

/** Quality tags appended to all prompts */
const QUALITY_TAGS = 'masterpiece, best quality, highly detailed, sharp focus';

// ============================================================================
// MAIN EXPORT
// ============================================================================

/**
 * Generate an image prompt for the current scene.
 * Combines visual elements, character descriptions, setting, and style.
 *
 * @param {Object} scene - The scene object from blueprint.scene_plan
 * @param {Object} blueprint - The full blueprint object
 * @param {Object} options - Optional settings overrides
 * @param {string} [options.styleOverride] - Custom style prompt to use instead of blueprint tone
 * @returns {string} Generated image prompt
 */
export function generateSceneImagePrompt(scene, blueprint, options = {}) {
    if (!scene || !blueprint) {
        console.warn('[Scene Image Prompt] Missing scene or blueprint data');
        return '';
    }

    const settings = extension_settings[MODULE_NAME]?.imageGeneration || {};

    // Build prompt sections
    const visualDesc = buildVisualDescription(scene, blueprint);
    const charDesc = buildCharacterDescriptions(scene);
    const settingDesc = buildSettingDescription(scene, blueprint);
    const actionDesc = buildActionDescription(scene);

    // Combine sections
    let prompt = [visualDesc, charDesc, settingDesc, actionDesc]
        .filter(Boolean)
        .join(', ');

    // Apply style modifiers
    const stylePrompt = options.styleOverride || settings.customStylePrompt || null;
    prompt = applyStyleModifiers(prompt, blueprint, stylePrompt);

    // Add quality tags
    prompt = `${prompt}, ${QUALITY_TAGS}`;

    return prompt;
}

// ============================================================================
// VISUAL DESCRIPTION BUILDERS
// ============================================================================

/**
 * Extract visual elements from scene situation and events.
 * @param {Object} scene - Scene object
 * @param {Object} blueprint - Full blueprint object
 * @returns {string} Visual description string
 */
function buildVisualDescription(scene, blueprint) {
    const parts = [];

    // Scene purpose gives context for the visual mood
    if (scene.purpose) {
        parts.push(visualizePurpose(scene.purpose));
    }

    // Key events provide action elements
    if (scene.key_events_if_unchanged?.length > 0) {
        const eventVisuals = scene.key_events_if_unchanged
            .slice(0, 3) // Limit to first 3 events
            .map(visualizeEvent)
            .filter(Boolean)
            .join(', ');
        if (eventVisuals) {
            parts.push(eventVisuals);
        }
    }

    return parts.join(', ');
}

/**
 * Build character appearance descriptions for the scene.
 * @param {Object} scene - Scene object
 * @returns {string} Character description string
 */
function buildCharacterDescriptions(scene) {
    if (!scene.character_focus?.length) {
        return '';
    }

    return scene.character_focus
        .map(cf => {
            const name = cf.name || 'character';
            const focus = cf.focus || cf.emotional_beat_target || '';
            if (!focus) return name;
            return `${name} ${extractVisualElements(focus)}`;
        })
        .join(', ');
}

/**
 * Build setting and atmosphere description.
 * @param {Object} scene - Scene object
 * @param {Object} blueprint - Full blueprint object
 * @returns {string} Setting description string
 */
function buildSettingDescription(scene, blueprint) {
    const parts = [];

    if (blueprint.setting?.location) {
        parts.push(`setting: ${blueprint.setting.location}`);
    }

    if (blueprint.setting?.time_period) {
        parts.push(`time period: ${blueprint.setting.time_period}`);
    }

    if (blueprint.setting?.atmosphere) {
        parts.push(`atmosphere: ${blueprint.setting.atmosphere}`);
    }

    return parts.join(', ');
}

/**
 * Build action description from scene situation.
 * @param {Object} scene - Scene object
 * @returns {string} Action description string
 */
function buildActionDescription(scene) {
    if (!scene.situation) {
        return '';
    }

    return extractVisualElements(scene.situation);
}

// ============================================================================
// STYLE MODIFIERS
// ============================================================================

/**
 * Apply style modifiers to the prompt based on blueprint tone.
 * @param {string} prompt - Base prompt string
 * @param {Object} blueprint - Full blueprint object
 * @param {string} [customStyle] - Optional custom style override
 * @returns {string} Prompt with style modifiers applied
 */
function applyStyleModifiers(prompt, blueprint, customStyle = null) {
    const settings = extension_settings[MODULE_NAME]?.imageGeneration || {};

    // Use custom style if provided
    if (customStyle?.trim()) {
        return `${prompt}, ${customStyle}`;
    }

    // Use custom style from settings if enabled
    if (settings.imageStyle === 'custom' && settings.customStylePrompt?.trim()) {
        return `${prompt}, ${settings.customStylePrompt}`;
    }

    // Auto-detect style from blueprint tone
    if (settings.imageStyle !== 'auto') {
        return prompt;
    }

    const tone = blueprint.tone_and_style?.primary_tone?.toLowerCase() || '';
    const voice = blueprint.tone_and_style?.narrative_voice?.toLowerCase() || '';

    // Match tone to style template
    let styleModifier = '';
    for (const [key, template] of Object.entries(STYLE_TEMPLATES)) {
        if (tone.includes(key) || voice.includes(key)) {
            styleModifier = template;
            break;
        }
    }

    // Default style if no match
    if (!styleModifier) {
        styleModifier = 'digital art, detailed illustration, professional quality';
    }

    // Add narrative voice as modifier
    const voiceModifier = mapNarrativeVoiceToStyle(voice);

    return `${prompt}, ${styleModifier}, ${voiceModifier}`;
}

/**
 * Map narrative voice terms to visual style modifiers.
 * @param {string} voice - Narrative voice from blueprint
 * @returns {string} Visual style modifier
 */
function mapNarrativeVoiceToStyle(voice) {
    const voiceMap = {
        'first person': ' POV shot, first person perspective',
        'third person': 'cinematic composition, wide shot',
        'omniscient': 'epic scale, grand vista',
        'cinematic': 'movie still, cinematic lighting, anamorphic lens',
        'intimate': 'close-up shot, shallow depth of field',
        'distant': 'wide angle, establishing shot',
    };

    for (const [key, modifier] of Object.entries(voiceMap)) {
        if (voice.includes(key)) {
            return modifier;
        }
    }

    return 'cinematic composition';
}

// ============================================================================
// TEXT PROCESSING HELPERS
// ============================================================================

/**
 * Extract visual elements from text description.
 * Filters for visual keywords and removes non-visual content.
 * @param {string} text - Source text
 * @returns {string} Visual elements only
 */
function extractVisualElements(text) {
    if (!text) return '';

    // Remove non-visual phrases
    const nonVisualPatterns = [
        /thinks? about/gi,
        /believes? that/gi,
        /feels? (emotionally|internally)/gi,
        /remembers?/gi,
        /wonders?/gi,
        /decides? to/gi,
        /plans? to/gi,
    ];

    let cleaned = text;
    for (const pattern of nonVisualPatterns) {
        cleaned = cleaned.replace(pattern, '');
    }

    // Extract visual keywords
    const visualPatterns = [
        /(\w+(?:ly|fully)?) (?:lit|illuminated|shadowed|colored)/gi,
        /wearing (\w+(?: \w+)*)/gi,
        /holding (\w+(?: \w+)*)/gi,
        /standing (?:on|in|near|by) (\w+(?: \w+)*)/gi,
        /(\w+(?: \w+)*) (?:background|foreground)/gi,
    ];

    const visualElements = [];
    for (const pattern of visualPatterns) {
        const matches = cleaned.match(pattern);
        if (matches) {
            visualElements.push(...matches);
        }
    }

    if (visualElements.length > 0) {
        return visualElements.join(', ');
    }

    // Fallback: return first sentence, truncated
    const firstSentence = text.split(/[.!?]/)[0];
    return firstSentence.length > 100 ? firstSentence.slice(0, 100) : firstSentence;
}

/**
 * Convert scene purpose to visual mood description.
 * @param {string} purpose - Scene purpose text
 * @returns {string} Visual mood description
 */
function visualizePurpose(purpose) {
    const moodMap = {
        'establish': 'establishing shot, wide view',
        'introduce': 'character introduction, focal point',
        'confront': 'tense confrontation, dramatic tension',
        'resolve': 'resolution, peaceful atmosphere',
        'climax': 'epic climax, intense action',
        'transition': 'transitional scene, connecting elements',
        'revel': 'revelation, dramatic reveal',
    };

    for (const [key, visual] of Object.entries(moodMap)) {
        if (purpose.toLowerCase().includes(key)) {
            return visual;
        }
    }

    return '';
}

/**
 * Convert event text to visual description.
 * @param {string} event - Event description
 * @returns {string} Visual description
 */
function visualizeEvent(event) {
    if (!event) return '';

    // Remove non-visual content
    const cleaned = event
        .replace(/thinks?|believes?|feels?|wants?/gi, '')
        .trim();

    return extractVisualElements(cleaned);
}
