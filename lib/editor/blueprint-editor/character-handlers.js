/**
 * Character tab event handlers
 * @module editor/blueprint-editor/character-handlers
 */

import { callGenericPopup, POPUP_TYPE } from '/scripts/popup.js';
import {
    loadCharactersTabContent,
    addCharacterArcFromPicker,
    deleteCharacterArc,
    editCharacterArc,
    addNewCharacterArc,
    setActiveCharSubTab
} from './characters-tab.js';

export function setupCharacterTabHandlers(EVENT_NAMESPACE) {
    // Sub-tab switching
    $(document).on('click' + EVENT_NAMESPACE, '.storymode-char-subtab', async function (e) {
        e.preventDefault();
        const tab = $(this).data('char-subtab');
        if (!tab) return;

        setActiveCharSubTab(tab);
        await loadCharactersTabContent();
    });

    // Refresh character links button
    $(document).on('click' + EVENT_NAMESPACE, '#refresh_character_links', async function (e) {
        e.preventDefault();
        const btn = $(this);
        if (btn.prop('disabled')) return;

        btn.prop('disabled', true);
        try {
            await loadCharactersTabContent();
            toastr.success('Character links refreshed');
        } catch (error) {
            console.error('[Story Mode] Failed to refresh character links:', error);
            toastr.error('Failed to refresh character links');
        } finally {
            btn.prop('disabled', false);
        }
    });

    // Character picker - add character to arcs
    $(document).on('click' + EVENT_NAMESPACE, '.storymode-character-pick:not(.storymode-persona-pick)', async function (e) {
        e.preventDefault();
        const characterName = $(this).data('char-name');
        if (!characterName) return;

        if ($(this).hasClass('selected')) {
            toastr.info(`${characterName} is already in the character arcs.`);
            return;
        }

        const added = addCharacterArcFromPicker(characterName);
        if (added) {
            toastr.success(`${characterName} added to character arcs`);
            await loadCharactersTabContent();
        }
    });

    // Persona picker - add persona to arcs
    $(document).on('click' + EVENT_NAMESPACE, '.storymode-persona-pick', async function (e) {
        e.preventDefault();
        const personaName = $(this).data('persona-name');
        if (!personaName) return;

        if ($(this).hasClass('selected')) {
            toastr.info(`${personaName} is already in the character arcs.`);
            return;
        }

        const added = addCharacterArcFromPicker(personaName);
        if (added) {
            toastr.success(`${personaName} added to character arcs`);
            await loadCharactersTabContent();
        }
    });

    // Delete character arc
    $(document).on('click' + EVENT_NAMESPACE, '[data-action="delete-arc"]', async function (e) {
        e.preventDefault();
        const arcIndex = parseInt($(this).data('arc-index'));
        const arcCard = $(this).closest('.storymode-character-arc-card');
        const characterName = arcCard.find('.arc-character-name').text();

        const confirmed = await callGenericPopup(
            `Delete the character arc for "${characterName}"?`,
            POPUP_TYPE.CONFIRM,
            null,
            { okButton: 'Delete', cancelButton: 'Cancel' }
        );

        if (confirmed) {
            deleteCharacterArc(arcIndex);
            toastr.success('Character arc deleted');
            await loadCharactersTabContent();
        }
    });

    // Edit character arc
    $(document).on('click' + EVENT_NAMESPACE, '[data-action="edit-arc"]', async function (e) {
        e.preventDefault();
        await editCharacterArc(parseInt($(this).data('arc-index')));
    });

    // Add new character arc
    $(document).on('click' + EVENT_NAMESPACE, '#add_character_arc_btn', async function (e) {
        e.preventDefault();
        await addNewCharacterArc();
    });
}
