/**
 * Resource Import Module
 * Handles importing embedded characters and personas to SillyTavern library
 */

import { callGenericPopup, POPUP_TYPE, POPUP_RESULT } from '/scripts/popup.js';
import {
    findCharacterByName,
    findPersonaByName,
    importCharacterCard,
    importPersona,
} from '../../blueprint/characters/linker.js';

// ============================================================================
// CHARACTER IMPORT
// ============================================================================

/**
 * Import embedded character to user's SillyTavern library
 * @param {Object} embeddedChar - Character from embeddedResources.characters
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function addEmbeddedCharacterToLibrary(embeddedChar) {
    const characterName = embeddedChar.name;

    if (!embeddedChar.pngDataUrl) {
        return {
            success: false,
            error: 'No character card data available for import'
        };
    }

    const existing = findCharacterByName(characterName);
    if (existing) {
        const confirmed = await callGenericPopup(
            `A character named "${characterName}" already exists in your library. Replace it?`,
            POPUP_TYPE.CONFIRM
        );
        if (confirmed !== POPUP_RESULT.AFFIRMATIVE) {
            return { success: false, error: 'Import cancelled by user' };
        }
    }

    try {
        const result = await importCharacterCard(embeddedChar.pngDataUrl, characterName);
        return result;
    } catch (error) {
        console.error('[Story Mode] Character import error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Import embedded persona to user's SillyTavern library
 * @param {Object} embeddedPersona - Persona from embeddedResources.personas
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function addEmbeddedPersonaToLibrary(embeddedPersona) {
    if (!embeddedPersona.avatarDataUrl) {
        return {
            success: false,
            error: 'No persona avatar data available for import',
        };
    }

    const existing = findPersonaByName(embeddedPersona.name);
    if (existing) {
        await callGenericPopup(
            `A persona named "${embeddedPersona.name}" already exists in your library. Import cancelled.`,
            POPUP_TYPE.TEXT
        );
        return { success: false, error: 'Persona already exists' };
    }

    try {
        const result = await importPersona(embeddedPersona);
        return result;
    } catch (error) {
        console.error('[Story Mode] Persona import error:', error);
        return { success: false, error: error.message };
    }
}
