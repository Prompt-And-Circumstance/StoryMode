/**
 * Character Adapter Module
 * Provides read-only access to SillyTavern character data
 */

import { getApiUrl, isValidApiUrl } from '../settings-system.js';
import { getConnectionStatus } from './connection-bridge.js';

// ============================================================================
// CHARACTER DATA RETRIEVAL
// ============================================================================

/**
 * Get all characters from the backend
 * @returns {Promise<Array<Object>>} Array of character objects
 */
export async function getCharacters() {
    const apiUrl = getApiUrl();
    const connectionStatus = getConnectionStatus();

    if (!isValidApiUrl(apiUrl) || connectionStatus !== 'connected') {
        return [];
    }

    try {
        const response = await fetch(`${apiUrl}/api/characters/all`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
            console.error('[Character Adapter] Failed to fetch characters');
            return [];
        }

        const data = await response.json();
        return data.characters || [];
    } catch (error) {
        console.error('[Character Adapter] Error fetching characters:', error);
        return [];
    }
}

/**
 * Get a specific character by ID
 * @param {string} characterId - Character ID (chid)
 * @returns {Promise<Object|null>} Character object or null
 */
export async function getCharacter(characterId) {
    const apiUrl = getApiUrl();
    const connectionStatus = getConnectionStatus();

    if (!isValidApiUrl(apiUrl) || connectionStatus !== 'connected') {
        return null;
    }

    try {
        const response = await fetch(`${apiUrl}/api/characters/get?id=${encodeURIComponent(characterId)}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
            console.error(`[Character Adapter] Failed to fetch character: ${characterId}`);
            return null;
        }

        const data = await response.json();
        return data.character || null;
    } catch (error) {
        console.error(`[Character Adapter] Error fetching character: ${characterId}`, error);
        return null;
    }
}

/**
 * Get character avatar URL
 * @param {Object} character - Character object
 * @returns {Promise<string>} Avatar URL
 */
export async function getAvatarUrl(character) {
    const apiUrl = getApiUrl();
    const connectionStatus = getConnectionStatus();

    if (!isValidApiUrl(apiUrl) || connectionStatus !== 'connected') {
        return '';
    }

    if (!character || !character.avatar) {
        return '';
    }

    // Strip extension for gallery folder lookup
    const avatarFolder = character.avatar.replace(/\.[^.]+$/, '');
    return `${apiUrl}/api/images/download?filename=${encodeURIComponent(avatarFolder)}`;
}

/**
 * Get character display name
 * @param {Object} character - Character object
 * @returns {string} Display name
 */
export function getCharacterDisplayName(character) {
    if (!character) return 'Unknown';

    return character.name ||
           character.description?.substring(0, 50) ||
           'Unnamed Character';
}

/**
 * Get character description
 * @param {Object} character - Character object
 * @returns {string} Character description
 */
export function getCharacterDescription(character) {
    if (!character) return '';

    return character.description ||
           character.personality ||
           '';
}

/**
 * Search characters by name or description
 * @param {string} query - Search query
 * @returns {Promise<Array<Object>>} Matching characters
 */
export async function searchCharacters(query) {
    const characters = await getCharacters();
    const lowerQuery = query.toLowerCase();

    return characters.filter(char => {
        const name = (char.name || '').toLowerCase();
        const desc = (char.description || '').toLowerCase();
        return name.includes(lowerQuery) || desc.includes(lowerQuery);
    });
}

// ============================================================================
// GROUP CHAT DATA
// ============================================================================

/**
 * Get all group chats from the backend
 * @returns {Promise<Array<Object>>} Array of group chat objects
 */
export async function getGroupChats() {
    const apiUrl = getApiUrl();
    const connectionStatus = getConnectionStatus();

    if (!isValidApiUrl(apiUrl) || connectionStatus !== 'connected') {
        return [];
    }

    try {
        const response = await fetch(`${apiUrl}/api/groups/all`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
            console.error('[Character Adapter] Failed to fetch group chats');
            return [];
        }

        const data = await response.json();
        return data.groups || [];
    } catch (error) {
        console.error('[Character Adapter] Error fetching group chats:', error);
        return [];
    }
}

/**
 * Get a specific group chat by ID
 * @param {string} groupId - Group chat ID
 * @returns {Promise<Object|null>} Group chat object or null
 */
export async function getGroupChat(groupId) {
    const groupChats = await getGroupChats();
    return groupChats.find(g => g.id === groupId) || null;
}

/**
 * Get members of a group chat
 * @param {string} groupId - Group chat ID
 * @returns {Promise<Array<string>>} Array of character IDs
 */
export async function getGroupMembers(groupId) {
    const group = await getGroupChat(groupId);
    return group?.members || [];
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format a character for display in a dropdown
 * @param {Object} character - Character object
 * @returns {Object} Formatted option object
 */
export function formatCharacterOption(character) {
    return {
        value: character.chid,
        label: character.name || 'Unnamed',
        description: character.description?.substring(0, 100) || '',
    };
}

/**
 * Get a list of character options for a dropdown
 * @returns {Promise<Array<Object>>} Array of dropdown options
 */
export async function getCharacterOptions() {
    const characters = await getCharacters();
    return characters.map(formatCharacterOption);
}

/**
 * Check if character data is available
 * @returns {Promise<boolean>} True if characters can be fetched
 */
export async function hasCharacterData() {
    const characters = await getCharacters();
    return characters.length > 0;
}

// ============================================================================
// EXPORT FOR DEBUGGING
// ============================================================================

if (typeof window !== 'undefined') {
    window.StoryModeCharacter = {
        getCharacters,
        getCharacter,
        getAvatarUrl,
        getCharacterDisplayName,
        getCharacterDescription,
        searchCharacters,
        getGroupChats,
        getGroupChat,
        getGroupMembers,
        formatCharacterOption,
        getCharacterOptions,
        hasCharacterData,
    };
}
