/**
 * Blueprint Character Linker
 *
 * Fetches character cards and persona avatars, links blueprint
 * character_arcs to local characters, and handles imports.
 *
 * Discovery functions moved to blueprint-character-discovery.js
 */

import { getContext } from '/scripts/extensions.js';
import { power_user } from '/scripts/power-user.js';
import { getRequestHeaders } from '/script.js';
import { setUserAvatar } from '/scripts/personas.js';
import { saveSettingsDebounced } from '/script.js';
import { escapeHtml, blobToDataURL, dataURLtoFile, normalizeCharacterName } from '../utils.js';
import { verifyPNGSignature } from '../../png/chunk-handler.js';
import {
    getCurrentChatCharacters,
    findCharacterByName,
    getAllCharacters,
    getAllPersonas,
    findPersonaByName
} from './discovery.js';

// Re-export discovery functions for backward compatibility
export { getCurrentChatCharacters, findCharacterByName, getAllCharacters, getAllPersonas, findPersonaByName };

// ============================================================================
// CHARACTER CARD FETCHING
// ============================================================================

/**
 * Fetch character card PNG from server
 * @param {string} avatar - Avatar filename (e.g., "Character.png")
 * @returns {Promise<Blob>} Character card PNG as Blob
 */
export async function fetchCharacterCardPNG(avatar) {
    const response = await fetch(`/characters/${encodeURIComponent(avatar)}`, {
        headers: getRequestHeaders()
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch character card: ${response.statusText}`);
    }

    return await response.blob();
}

/**
 * Get character card data for export (full PNG + metadata preview)
 * @param {string|number} characterId - Character index or ID
 * @returns {Promise<Object>} {name, avatar, pngDataUrl, metadata}
 */
export async function getCharacterCardData(characterId) {
    const context = getContext();
    const charIndex = parseInt(characterId, 10);
    const char = context.characters[charIndex];

    if (!char) {
        throw new Error(`Character not found: ${characterId}`);
    }

    try {
        // Fetch full character card PNG
        const pngBlob = await fetchCharacterCardPNG(char.avatar);
        const pngDataUrl = await blobToDataURL(pngBlob);

        // For preview, extract basic metadata from context
        const metadata = {
            name: char.name,
            description: context.characterData?.description || '',
            avatar: char.avatar
        };

        return {
            name: char.name,
            avatar: char.avatar,
            pngDataUrl: pngDataUrl,
            metadata: metadata
        };
    } catch (error) {
        console.error(`[Story Mode] Failed to get character card data for ${char.name}:`, error);
        throw error;
    }
}

// ============================================================================
// PERSONA AVATAR FETCHING
// ============================================================================

/**
 * Fetch persona avatar from server
 * @param {string} avatarId - Avatar filename (e.g., "User1.png")
 * @returns {Promise<Blob>} Avatar image as Blob
 */
export async function fetchPersonaAvatar(avatarId) {
    const response = await fetch(`/User Avatars/${encodeURIComponent(avatarId)}`, {
        headers: getRequestHeaders()
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch persona avatar: ${response.statusText}`);
    }

    return await response.blob();
}

/**
 * Get persona data for export (avatar + metadata)
 * @param {string} avatarId - Persona avatar ID
 * @returns {Promise<Object>} {id, name, description, title, avatarDataUrl}
 */
export async function getPersonaData(avatarId) {
    const name = power_user.personas[avatarId];
    const desc = power_user.persona_descriptions[avatarId];

    if (!name) {
        throw new Error(`Persona not found: ${avatarId}`);
    }

    try {
        const avatarBlob = await fetchPersonaAvatar(avatarId);
        const avatarDataUrl = await blobToDataURL(avatarBlob);

        return {
            id: avatarId,
            name: name,
            description: desc?.description || '',
            title: desc?.title || '',
            avatarDataUrl: avatarDataUrl
        };
    } catch (error) {
        console.error(`[Story Mode] Failed to get persona data for ${name}:`, error);
        throw error;
    }
}

// ============================================================================
// CHARACTER/PERSONA IMPORT
// ============================================================================

/**
 * Import character card into SillyTavern
 * @param {string} pngDataUrl - Character card PNG as data URL
 * @param {string} characterName - Character name (for logging)
 * @returns {Promise<Object>} {success: boolean, error?: string}
 */
export async function importCharacterCard(pngDataUrl, characterName) {
    try {
        // Convert data URL to Blob
        const blob = dataURLtoBlob(pngDataUrl);

        // Verify PNG signature before uploading (SEC-004)
        const arrayBuffer = await blob.arrayBuffer();
        if (!verifyPNGSignature(arrayBuffer)) {
            throw new Error('Invalid PNG file signature');
        }

        // Create FormData for upload (matching SillyTavern's expected format)
        const formData = new FormData();
        formData.append('avatar', blob, `${characterName}.png`);
        formData.append('file_type', 'png');

        // Upload to server
        const response = await fetch('/api/characters/import', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server error: ${errorText}`);
        }

        console.log(`[Story Mode] Successfully imported character: ${characterName}`);
        return { success: true };
    } catch (error) {
        console.error(`[Story Mode] Failed to import character ${characterName}:`, error);
        return { success: false, error: error.message };
    }
}

/**
 * Import persona into SillyTavern
 * @param {Object} personaData - {name, description, title, avatarDataUrl}
 * @returns {Promise<Object>} {success: boolean, avatarId?: string, error?: string}
 */
export async function importPersona(personaData) {
    try {
        // Validate persona data (SEC-007)
        if (!personaData.name || typeof personaData.name !== 'string') {
            throw new Error('Invalid persona: missing or invalid name');
        }

        if (personaData.name.length > 100) {
            throw new Error('Invalid persona: name exceeds 100 characters');
        }

        if (personaData.description && typeof personaData.description !== 'string') {
            throw new Error('Invalid persona: description must be a string');
        }

        if (personaData.description && personaData.description.length > 2000) {
            throw new Error('Invalid persona: description exceeds 2000 characters');
        }

        if (personaData.title && typeof personaData.title !== 'string') {
            throw new Error('Invalid persona: title must be a string');
        }

        if (personaData.title && personaData.title.length > 200) {
            throw new Error('Invalid persona: title exceeds 200 characters');
        }

        if (!personaData.avatarDataUrl || typeof personaData.avatarDataUrl !== 'string') {
            throw new Error('Invalid persona: missing or invalid avatar data URL');
        }

        // Check for duplicate persona name
        const existingPersona = findPersonaByName(personaData.name);
        if (existingPersona) {
            throw new Error(`Persona "${personaData.name}" already exists`);
        }

        // Convert data URL to File
        const file = dataURLtoFile(personaData.avatarDataUrl, `${personaData.name}.png`);

        // Import avatar (this saves the file and updates power_user.user_avatar)
        await setUserAvatar(file, { toastPersonaNameChange: false });

        // Get the new avatar ID (may differ from filename if conflict occurred)
        const newAvatarId = `${personaData.name}.png`; // Simplified - may need adjustment

        // Set persona metadata
        power_user.personas[newAvatarId] = personaData.name;
        power_user.persona_descriptions[newAvatarId] = {
            description: personaData.description || '',
            title: personaData.title || ''
        };

        // Save settings
        await saveSettingsDebounced();

        console.log(`[Story Mode] Successfully imported persona: ${personaData.name}`);
        return { success: true, avatarId: newAvatarId };
    } catch (error) {
        console.error(`[Story Mode] Failed to import persona ${personaData.name}:`, error);
        return { success: false, error: error.message };
    }
}

// ============================================================================
// BLUEPRINT CHARACTER LINKING
// ============================================================================

/**
 * Link blueprint character_arcs to local characters
 * @param {Object} blueprint - Blueprint with character_arcs
 * @returns {Object} {linked: [], missing: []}
 */
export function linkBlueprintCharacters(blueprint) {
    const linked = [];
    const missing = [];

    if (!blueprint.character_arcs || blueprint.character_arcs.length === 0) {
        return { linked, missing };
    }

    const allCharacters = getAllCharacters();

    for (const arc of blueprint.character_arcs) {
        const charName = arc.character_name;
        const localChar = allCharacters.find(c =>
            normalizeCharacterName(c.name) === normalizeCharacterName(charName)
        );

        if (localChar) {
            linked.push({
                blueprintName: charName,
                localCharacter: localChar
            });
        } else {
            missing.push(charName);
        }
    }

    return { linked, missing };
}

/**
 * Get character names referenced in blueprint
 * @param {Object} blueprint - Blueprint object
 * @returns {Array<string>} Character names from character_arcs
 */
export function getBlueprintCharacterNames(blueprint) {
    if (!blueprint.character_arcs) {
        return [];
    }
    return blueprint.character_arcs.map(arc => arc.character_name);
}

/**
 * Extract character data for embedding in export
 * @param {Array<string>} characterNames - Character names to export
 * @returns {Promise<Array<Object>>} Character card data array
 */
export async function extractCharactersForExport(characterNames) {
    const characterData = [];

    for (const name of characterNames) {
        const char = findCharacterByName(name);
        if (char) {
            try {
                const charIndex = getAllCharacters().indexOf(char);
                const cardData = await getCharacterCardData(charIndex);
                characterData.push(cardData);
            } catch (error) {
                console.warn(`[Story Mode] Could not export character ${name}:`, error);
            }
        }
    }

    return characterData;
}

/**
 * Extract persona data for embedding in export
 * @param {Array<string>} personaNames - Persona names to export
 * @returns {Promise<Array<Object>>} Persona data array
 */
export async function extractPersonasForExport(personaNames) {
    const personaData = [];

    for (const name of personaNames) {
        const persona = findPersonaByName(name);
        if (persona) {
            try {
                const data = await getPersonaData(persona.id);
                personaData.push(data);
            } catch (error) {
                console.warn(`[Story Mode] Could not export persona ${name}:`, error);
            }
        }
    }

    return personaData;
}
