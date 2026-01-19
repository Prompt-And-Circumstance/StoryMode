/**
 * Blueprint Character Discovery Module
 *
 * Provides functions to discover available characters and personas
 * in the current SillyTavern context.
 */

import { getContext } from '/scripts/extensions.js';
import { power_user } from '/scripts/power-user.js';
import { normalizeCharacterName } from '../utils.js';

/**
 * Get characters from current chat context
 * Handles both single character and group chat scenarios
 * @returns {Array<Object>} Array of {id, name, role, avatar}
 */
export function getCurrentChatCharacters() {
    const context = getContext();
    const characterList = [];

    const allCharacters = context.characters || [];
    const characterId = context.characterId;
    const groupId = context.groupId;

    // Handle group chat
    if (groupId && context.groups) {
        const group = context.groups.find(g => g.id === groupId);
        if (group && group.members) {
            group.members.forEach(memberFilename => {
                const charIndex = allCharacters.findIndex(c =>
                    c.filename === memberFilename ||
                    c.avatar === memberFilename ||
                    (typeof c === 'string' && c === memberFilename)
                );
                if (charIndex !== -1) {
                    const char = allCharacters[charIndex];
                    if (!characterList.find(c => c.id === charIndex.toString())) {
                        characterList.push({
                            id: charIndex.toString(),
                            name: char.name || `Character ${charIndex}`,
                            role: 'group',
                            avatar: char.avatar
                        });
                    }
                }
            });
        }
    }
    // Handle single character chat
    else if (characterId !== null && characterId !== undefined) {
        const charIndex = parseInt(characterId, 10);
        const char = allCharacters[charIndex];
        if (char) {
            characterList.push({
                id: characterId.toString(),
                name: char.name || 'Current Character',
                role: 'main',
                avatar: char.avatar
            });
        }
    }

    return characterList;
}

/**
 * Find character by name (case-insensitive, normalized)
 * @param {string} name - Character name to find
 * @returns {Object|null} Character object or null
 */
export function findCharacterByName(name) {
    const context = getContext();
    const allCharacters = context.characters || [];
    const normalized = normalizeCharacterName(name);

    const char = allCharacters.find(c =>
        normalizeCharacterName(c.name) === normalized
    );

    return char || null;
}

/**
 * Get all characters from context
 * @returns {Array<Object>} All characters
 */
export function getAllCharacters() {
    const context = getContext();
    return context.characters || [];
}

/**
 * Get all available personas
 * @returns {Array<Object>} Array of {id, name, description, title}
 */
export function getAllPersonas() {
    if (!power_user?.personas || !power_user?.persona_descriptions) {
        return [];
    }

    const personaList = [];
    const personaIds = Object.keys(power_user.personas);

    for (const avatarId of personaIds) {
        const personaName = power_user.personas[avatarId];
        const personaDesc = power_user.persona_descriptions[avatarId];
        if (personaName && personaDesc) {
            personaList.push({
                id: avatarId,
                name: personaName,
                description: personaDesc.description || '',
                title: personaDesc.title || '',
            });
        }
    }

    return personaList;
}

/**
 * Find persona by name
 * @param {string} name - Persona name to find
 * @returns {Object|null} Persona object or null
 */
export function findPersonaByName(name) {
    const personas = getAllPersonas();
    return personas.find(p => p.name === name) || null;
}
