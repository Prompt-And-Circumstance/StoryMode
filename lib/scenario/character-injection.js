/**
 * @file Character Injection Module
 * @module scenario/character-injection
 *
 * Detects characters referenced in blueprints but not present in chat,
 * and builds injection XML for their info from embedded resources OR user's character library.
 */

import { extension_settings } from '/scripts/extensions.js';
import { characters } from '/script.js';
import { MODULE_NAME } from '../core/state-manager.js';
import { linkBlueprintCharacters, getCurrentChatCharacters } from '../blueprint/characters/linker.js';
import { resolvePlaceholders } from '../blueprint/index.js';
import { escapeXmlAttr } from './injection.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_INJECTED_CHARACTERS = 5;
const MAX_DESCRIPTION_LENGTH = 200;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Truncate text to specified length with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
function truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) return text || '';
    return text.slice(0, maxLength - 3).trim() + '...';
}

/**
 * Find a character in SillyTavern's character library by name
 * @param {string} characterName - Name to search for
 * @returns {Object|null} Character object or null if not found
 */
function findCharacterInLibrary(characterName) {
    if (!characterName || !characters || !Array.isArray(characters)) {
        return null;
    }

    const normalizedName = characterName.toLowerCase().trim();

    // Try exact name match first
    let match = characters.find(char =>
        char.name?.toLowerCase().trim() === normalizedName
    );

    // If no exact match, try avatar filename (without extension)
    if (!match) {
        match = characters.find(char => {
            if (!char.avatar) return false;
            const avatarName = char.avatar.replace(/\.[^.]+$/, '').toLowerCase().trim();
            return avatarName === normalizedName;
        });
    }

    return match || null;
}

// ============================================================================
// CORE DETECTION LOGIC
// ============================================================================

/**
 * Get characters from blueprint that are NOT in current chat
 * Checks both embedded resources and user's character library
 * @param {Object} blueprint - Blueprint object
 * @returns {Array<Object>} Array of missing character info objects
 */
export function getMissingCharactersForInjection(blueprint) {
    if (!blueprint) return [];

    // Check if feature is enabled
    const settings = extension_settings[MODULE_NAME];
    if (!settings.blueprintSettings?.injectMissingCharacters) {
        return [];
    }

    // Get all characters referenced in blueprint
    const linkResult = linkBlueprintCharacters(blueprint);

    // Get characters currently in chat
    const chatsInChat = getCurrentChatCharacters();
    const chatCharNames = new Set(
        chatsInChat.map(c => c.name?.toLowerCase()).filter(Boolean)
    );

    // Find characters that are referenced in blueprint but NOT in current chat
    const missingNames = [];

    // Check linked characters (those found in library)
    for (const { blueprintName, localCharacter } of linkResult.linked) {
        const charName = localCharacter.name?.toLowerCase();
        if (charName && !chatCharNames.has(charName)) {
            missingNames.push(blueprintName);
        }
    }

    // Also include characters not found in library at all
    // (they might be in embedded resources)
    missingNames.push(...linkResult.missing);

    if (missingNames.length === 0) {
        return [];
    }

    const missingCharacters = [];
    const embeddedCharacters = blueprint.embeddedResources?.characters || [];

    // For each missing character name, try to find their data
    for (const name of missingNames) {
        // 1. Try to find in embedded resources first (highest priority)
        let charData = embeddedCharacters.find(char =>
            char.name?.toLowerCase() === name.toLowerCase()
        );

        // 2. If not embedded, look up in user's character library
        if (!charData) {
            const libraryChar = findCharacterInLibrary(name);
            if (libraryChar) {
                // Normalize library character format to match embedded format
                charData = {
                    name: libraryChar.name || name,
                    avatar: libraryChar.avatar,
                    source: 'library',
                    metadata: {
                        name: libraryChar.name || name,
                        description: libraryChar.description || ''
                    }
                };
            }
        } else {
            // Mark as embedded source
            charData = { ...charData, source: 'embedded' };
        }

        // Add to results if we found data from either source
        if (charData) {
            missingCharacters.push(charData);
        }
    }

    // Limit to maximum allowed characters
    return missingCharacters.slice(0, MAX_INJECTED_CHARACTERS);
}

/**
 * Get characters relevant to a specific scene
 * @param {Object} blueprint - Blueprint object
 * @param {Object} scene - Current scene object
 * @returns {Array<Object>} Array of relevant missing character info
 */
export function getMissingCharactersForScene(blueprint, scene) {
    const allMissing = getMissingCharactersForInjection(blueprint);

    if (allMissing.length === 0) return [];

    // Get character names in focus for this scene
    const focusNames = new Set();
    if (scene.character_focus && Array.isArray(scene.character_focus)) {
        scene.character_focus.forEach(cf => {
            const name = cf.name || cf.character_name || cf;
            if (typeof name === 'string') {
                focusNames.add(name.toLowerCase());
            }
        });
    }

    // If scene has character_focus, filter to only those characters
    if (focusNames.size > 0) {
        const relevantMissing = allMissing.filter(char =>
            focusNames.has(char.name?.toLowerCase())
        );
        return relevantMissing.slice(0, MAX_INJECTED_CHARACTERS);
    }

    // No character_focus defined - return all missing (limited)
    return allMissing.slice(0, MAX_INJECTED_CHARACTERS);
}

// ============================================================================
// INJECTION BUILDING
// ============================================================================

/**
 * Extract character description from character data (embedded or library)
 * @param {Object} charData - Character object (from embedded resources or library)
 * @returns {string} Short description
 */
function extractCharacterDescription(charData) {
    // Try metadata.description first (embedded format)
    if (charData.metadata?.description) {
        return truncateText(charData.metadata.description, MAX_DESCRIPTION_LENGTH);
    }

    // Fallback to direct description field (library format)
    if (charData.description) {
        return truncateText(charData.description, MAX_DESCRIPTION_LENGTH);
    }

    return '';
}

/**
 * Get character arc info from blueprint
 * @param {Object} blueprint - Blueprint object
 * @param {string} characterName - Character name to find
 * @returns {Object|null} Character arc or null
 */
function getCharacterArc(blueprint, characterName) {
    if (!blueprint.character_arcs || !Array.isArray(blueprint.character_arcs)) {
        return null;
    }

    return blueprint.character_arcs.find(arc =>
        arc.character_name?.toLowerCase() === characterName?.toLowerCase()
    );
}

/**
 * Build XML injection for missing characters
 * @param {Object} blueprint - Blueprint object
 * @param {Object} scene - Current scene (optional, for scene-specific filtering)
 * @returns {string} XML injection string or empty string
 */
export function buildMissingCharactersXml(blueprint, scene = null) {
    // Get missing characters (scene-filtered if scene provided)
    const missingChars = scene
        ? getMissingCharactersForScene(blueprint, scene)
        : getMissingCharactersForInjection(blueprint).slice(0, MAX_INJECTED_CHARACTERS);

    if (missingChars.length === 0) {
        return '';
    }

    const characterElements = missingChars.map(char => {
        const name = escapeXmlAttr(char.name || 'Unknown');
        const description = escapeXmlAttr(extractCharacterDescription(char));
        const source = char.source || 'blueprint';

        // Get arc info for personality/trajectory
        const arc = getCharacterArc(blueprint, char.name);

        // Build inner elements
        const innerParts = [];

        if (description) {
            innerParts.push(`    <description>${description}</description>`);
        }

        if (arc) {
            if (arc.initial_state) {
                innerParts.push(`    <current_state>${escapeXmlAttr(arc.initial_state)}</current_state>`);
            }
            if (arc.emotional_trajectory) {
                innerParts.push(`    <trajectory>${escapeXmlAttr(arc.emotional_trajectory)}</trajectory>`);
            }
        }

        // Context note about this character's status and source
        const contextNote = source === 'library'
            ? 'Referenced in blueprint, loaded from character library'
            : 'Referenced in blueprint but not in current chat';
        innerParts.push(`    <context>${contextNote}</context>`);

        if (innerParts.length > 0) {
            return `  <character name="${name}" source="${source}">\n${innerParts.join('\n')}\n  </character>`;
        }
        return `  <character name="${name}" source="${source}"/>`;
    });

    return `<blueprint_characters note="Characters from blueprint not in current chat">\n${characterElements.join('\n')}\n</blueprint_characters>`;
}

/**
 * Check if character injection is enabled
 * @returns {boolean} True if enabled
 */
export function isCharacterInjectionEnabled() {
    const settings = extension_settings[MODULE_NAME];
    return settings.blueprintSettings?.injectMissingCharacters !== false;
}
