/**
 * Characters Tab Module
 * Renders the Characters tab content for blueprint editor
 */

import { getCurrentBlueprint } from './state.js';
import { escapeHtml } from '../../blueprint/utils.js';

export function renderCharactersTab() {
    if (!getCurrentBlueprint()) {
        return '<div class="storymode-tab-placeholder">No blueprint loaded</div>';
    }

    if (!getCurrentBlueprint().character_arcs || getCurrentBlueprint().character_arcs.length === 0) {
        return `
            <div class="storymode-tab-placeholder">
                <i class="fa-solid fa-users"></i>
                <p>No characters defined in this blueprint yet.</p>
                <p>Characters are defined in the character arcs section.</p>
            </div>
        `;
    }

    // Load content asynchronously via event handler
    setTimeout(() => loadCharactersTabContent(), 0);

    return `
        <div class="storymode-characters-tab" id="characters_tab_content">
            <div class="storymode-loading-spinner">
                <i class="fa-solid fa-circle-notch fa-spin"></i> Loading characters...
            </div>
        </div>
    `;
}

/**
 * Load characters tab content asynchronously
 */
export async function loadCharactersTabContent() {
    const container = document.getElementById('characters_tab_content');
    if (!container) return;

    const { linkBlueprintCharacters } = await import('../blueprint/characters/linker.js');
    const linkInfo = linkBlueprintCharacters(getCurrentBlueprint());

    if (linkInfo.linked.length === 0 && linkInfo.missing.length === 0) {
        container.innerHTML = `
            <div class="storymode-tab-placeholder">
                <i class="fa-solid fa-users"></i>
                <p>No characters defined in this blueprint yet.</p>
                <p>Characters are defined in the character arcs section.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="characters-header">
            <h4>Referenced Characters</h4>
            <button class="menu_button menu_button_icon" id="refresh_character_links" title="Refresh links">
                <i class="fa-solid fa-sync"></i>
            </button>
        </div>

        ${linkInfo.linked.length > 0 ? `
            <div class="characters-section">
                <h5><i class="fa-solid fa-check-circle" style="color: var(--SmartThemeEmColor);"></i> Available (${linkInfo.linked.length})</h5>
                <div class="characters-grid">
                    ${linkInfo.linked.map(link => renderCharacterCard(link.localCharacter, true)).join('')}
                </div>
            </div>
        ` : ''}

        ${linkInfo.missing.length > 0 ? `
            <div class="characters-section">
                <h5><i class="fa-solid fa-triangle-exclamation" style="color: var(--SmartThemeWarningColor);"></i> Missing (${linkInfo.missing.length})</h5>
                <div class="characters-grid">
                    ${linkInfo.missing.map(name => renderMissingCharacterCard(name)).join('')}
                </div>
                <p class="missing-hint">
                    <i class="fa-solid fa-info-circle"></i>
                    These characters will be available for import when you import this blueprint.
                </p>
            </div>
        ` : ''}
    `;
}

/**
 * Render character card
 * @param {Object} character
 * @param {boolean} isAvailable
 * @returns {string}
 */
export function renderCharacterCard(character, isAvailable) {
    const avatarPath = character.avatar ? `/characters/${encodeURIComponent(character.avatar)}` : '';
    return `
        <div class="character-mini-card ${isAvailable ? 'available' : 'missing'}">
            <div class="character-avatar" ${avatarPath ? `style="background-image: url('${avatarPath}');"` : 'data-fa="fa-user"'}></div>
            <div class="character-name">${escapeHtml(character.name)}</div>
            ${isAvailable ? '<i class="fa-solid fa-check-circle status-icon"></i>' : ''}
        </div>
    `;
}

/**
 * Render missing character card
 * @param {string} name
 * @returns {string}
 */
export function renderMissingCharacterCard(name) {
    return `
        <div class="character-mini-card missing">
            <div class="character-avatar placeholder">
                <i class="fa-solid fa-user"></i>
            </div>
            <div class="character-name">${escapeHtml(name)}</div>
            <i class="fa-solid fa-triangle-exclamation status-icon"></i>
        </div>
    `;
}

