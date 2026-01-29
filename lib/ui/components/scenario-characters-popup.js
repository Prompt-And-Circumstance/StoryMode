/**
 * Scenario Characters Popup UI
 * Displays scenario characters and personas in a draggable popup
 */

import { escapeHtml } from '../component-system.js';
import { getBlueprintState } from '../../blueprint/storage.js';
import { getCharacters } from '/script.js';
import { normalizeCharacterName } from '../../blueprint/utils.js';
import { updateControllerPanel } from '../controller-panel.js';
import { getCurrentTheme, applyRpgCompanionThemeToPopout } from '../controller-panel-structure.js';
import {
    getBlueprintCharactersWithStatus,
    getBlueprintPersonasWithStatus,
} from './scenario-characters.js';
import {
    addEmbeddedCharacterToLibrary,
    addEmbeddedPersonaToLibrary,
} from './resource-import.js';

// ============================================================================
// UI RENDERING
// ============================================================================

/**
 * Render a single resource card (character or persona) for the popup
 * @param {Object} info - Resource info from getBlueprintCharactersWithStatus or getBlueprintPersonasWithStatus
 * @param {'character'|'persona'} type - Resource type
 * @returns {string} HTML string
 */
function renderScenarioResourceCard(info, type = 'character') {
    const { name, status, embeddedData, canImport } = info;
    const isPersona = type === 'persona';

    let avatarUrl = null;
    if (isPersona) {
        if (info.linkedPersona?.id) {
            avatarUrl = `/User Avatars/${encodeURIComponent(info.linkedPersona.id)}`;
        } else if (embeddedData?.avatarDataUrl) {
            avatarUrl = embeddedData.avatarDataUrl;
        }
    } else {
        if (info.linkedCharacter?.avatar) {
            avatarUrl = `/characters/${encodeURIComponent(info.linkedCharacter.avatar)}`;
        } else if (embeddedData?.pngDataUrl) {
            avatarUrl = embeddedData.pngDataUrl;
        }
    }

    const badges = {
        embedded: '<span class="storymode-char-badge embedded"><i class="fa-solid fa-box"></i> Embedded</span>',
        linked: '<span class="storymode-char-badge linked"><i class="fa-solid fa-link"></i> In Library</span>',
        missing: '<span class="storymode-char-badge missing"><i class="fa-solid fa-triangle-exclamation"></i> Not in library</span>',
    };

    const fallbackIcon = isPersona ? 'fa-user-pen' : 'fa-user';

    let actionHtml = '';
    if (status === 'embedded') {
        const dataAttr = isPersona ? 'data-persona-name' : 'data-char-name';
        const btnClass = isPersona ? 'storymode-add-persona-to-library-btn' : 'storymode-add-to-library-btn';
        const label = isPersona ? 'persona' : 'character';
        if (canImport) {
            actionHtml = `
                <button class="${btnClass} menu_button"
                        ${dataAttr}="${escapeHtml(name)}"
                        title="Add this ${label} to your SillyTavern library">
                    <i class="fa-solid fa-plus"></i> Add to Library
                </button>`;
        } else {
            const noDataLabel = isPersona ? 'No avatar data' : 'No card data';
            actionHtml = `
                <span class="storymode-import-unavailable"
                      title="${escapeHtml(label)} data not included in blueprint">
                    <i class="fa-solid fa-ban"></i> ${noDataLabel}
                </span>`;
        }
    } else if (status === 'missing') {
        const label = isPersona ? 'persona' : 'character';
        actionHtml = `
            <span class="storymode-import-unavailable"
                  title="No ${label} data is embedded in this blueprint">
                <i class="fa-solid fa-ghost"></i> Not embedded
            </span>`;
    }

    return `
        <div class="storymode-scenario-char-card" data-status="${status}">
            <div class="storymode-scenario-char-avatar"
                 ${avatarUrl ? `style="background-image: url('${escapeHtml(avatarUrl)}');"` : ''}>
                ${!avatarUrl ? `<i class="fa-solid ${fallbackIcon}"></i>` : ''}
            </div>
            <div class="storymode-scenario-char-info">
                <div class="storymode-scenario-char-name">${escapeHtml(name)}</div>
                ${badges[status]}
            </div>
            <div class="storymode-scenario-char-actions">
                ${actionHtml}
            </div>
        </div>
    `;
}

// ============================================================================
// POPUP DISPLAY
// ============================================================================

/**
 * Show the scenario characters popup
 * Displays both characters and personas with status and import actions
 */
export function showScenarioCharactersPopup() {
    const blueprintState = getBlueprintState();

    if (!blueprintState?.blueprint) {
        if (window.toastr) toastr.info('No active scenario.');
        return;
    }

    $('.storymode-characters-popout').remove();

    const characters = getBlueprintCharactersWithStatus(blueprintState.blueprint);
    const personas = getBlueprintPersonasWithStatus(blueprintState.blueprint);

    let bodyContent = '';

    if (characters.length === 0 && personas.length === 0) {
        bodyContent = `
            <div class="storymode-characters-empty">
                <i class="fa-solid fa-users-slash"></i>
                <p>No characters or personas defined in this scenario.</p>
            </div>`;
    } else {
        if (characters.length > 0) {
            const charCards = characters.map(c => renderScenarioResourceCard(c, 'character')).join('');
            bodyContent += `
                <div class="storymode-resource-section-header">
                    <i class="fa-solid fa-users"></i> Characters
                </div>
                ${charCards}`;
        }

        if (personas.length > 0) {
            const personaCards = personas.map(p => renderScenarioResourceCard(p, 'persona')).join('');
            bodyContent += `
                <div class="storymode-resource-section-header">
                    <i class="fa-solid fa-user-pen"></i> Personas
                </div>
                ${personaCards}`;
        }
    }

    const contentHtml = `
        <div class="storymode-characters-popout-header">
            <i class="fa-solid fa-users"></i>
            <span>Scenario Characters</span>
            <button class="storymode-characters-popout-close"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="storymode-characters-popout-body">
            ${bodyContent}
        </div>
    `;

    const currentTheme = getCurrentTheme();
    const popout = $(`<div class="storymode-characters-popout" data-theme="${currentTheme}">${contentHtml}</div>`);
    $('body').append(popout);

    // Apply RPG Companion theme variables if needed
    if (currentTheme === 'rpg-companion') {
        applyRpgCompanionThemeToPopout(popout);
    }

    popout.on('click', '.storymode-add-to-library-btn', async function() {
        const charName = $(this).data('char-name');
        await handleAddToLibraryClick(charName, $(this));
    });

    popout.on('click', '.storymode-add-persona-to-library-btn', async function() {
        const personaName = $(this).data('persona-name');
        await handleAddPersonaToLibraryClick(personaName, $(this));
    });

    const cleanupPopout = () => {
        $(document).off('keydown.charactersPopout');
        if (popout.data('cleanupDrag')) popout.data('cleanupDrag')();
        popout.remove();
    };

    popout.find('.storymode-characters-popout-close').on('click', cleanupPopout);
    $(document).on('keydown.charactersPopout', (e) => {
        if (e.key === 'Escape') cleanupPopout();
    });

    makePopoutDraggable(popout);
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Generic handler for adding embedded resources to library
 */
async function handleAddResourceToLibrary(resourceName, btn, config) {
    const blueprintState = getBlueprintState();
    const resources = config.getEmbeddedResources(blueprintState?.blueprint) || [];
    const embedded = resources.find(r =>
        normalizeCharacterName(r.name) === normalizeCharacterName(resourceName)
    );

    if (!embedded) {
        if (window.toastr) {
            toastr.error(`${config.resourceType} "${resourceName}" not found in embedded data.`);
        }
        return;
    }

    const originalHtml = btn.html();
    btn.prop('disabled', true).html('<i class="fa-solid fa-circle-notch fa-spin"></i> Adding...');

    try {
        const result = await config.addToLibrary(embedded);

        if (result.success) {
            if (window.toastr) {
                toastr.success(`${resourceName} added to your ${config.resourceType} library!`);
            }
            await config.onSuccess();
            showScenarioCharactersPopup();
            updateControllerPanel();
        } else {
            if (!config.ignoredErrors.has(result.error) && window.toastr) {
                toastr.error(`Failed to add ${resourceName}: ${result.error}`);
            }
            btn.prop('disabled', false).html(originalHtml);
        }
    } catch (error) {
        console.error(`[Story Mode] Error adding ${config.resourceType} to library:`, error);
        if (window.toastr) toastr.error(`Error: ${error.message}`);
        btn.prop('disabled', false).html(originalHtml);
    }
}

async function handleAddToLibraryClick(charName, btn) {
    await handleAddResourceToLibrary(charName, btn, {
        getEmbeddedResources: (bp) => bp?.embeddedResources?.characters,
        addToLibrary: addEmbeddedCharacterToLibrary,
        onSuccess: getCharacters,
        resourceType: 'character',
        ignoredErrors: new Set(['Import cancelled by user']),
    });
}

async function handleAddPersonaToLibraryClick(personaName, btn) {
    await handleAddResourceToLibrary(personaName, btn, {
        getEmbeddedResources: (bp) => bp?.embeddedResources?.personas,
        addToLibrary: addEmbeddedPersonaToLibrary,
        onSuccess: async () => {},
        resourceType: 'persona',
        ignoredErrors: new Set(['Persona already exists']),
    });
}

// ============================================================================
// DRAGGABLE BEHAVIOR
// ============================================================================

function makePopoutDraggable(popout) {
    const header = popout.find('.storymode-characters-popout-header');
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    header.css('cursor', 'grab');

    header.on('mousedown', function(e) {
        if (e.button !== 0) return;
        if ($(e.target).closest('button').length) return;

        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;

        const rect = popout[0].getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;

        header.css('cursor', 'grabbing');
        e.preventDefault();
    });

    $(document).on('mousemove.charactersPopout', function(e) {
        if (!isDragging) return;

        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        popout.css({
            left: startLeft + deltaX + 'px',
            top: startTop + deltaY + 'px',
            transform: 'none',
            right: 'auto',
            bottom: 'auto'
        });
    });

    $(document).on('mouseup.charactersPopout', function() {
        if (!isDragging) return;
        isDragging = false;
        header.css('cursor', 'grab');
    });

    popout.data('cleanupDrag', () => {
        $(document).off('mousemove.charactersPopout');
        $(document).off('mouseup.charactersPopout');
    });
}
