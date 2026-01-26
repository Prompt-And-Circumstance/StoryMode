/**
 * Unified Character/Persona Picker Component
 *
 * Provides consistent vertical list pickers with avatars for:
 * - Chat characters (current conversation)
 * - Personas (player characters)
 * - Library characters (all SillyTavern characters)
 *
 * All pickers share the same visual style and interaction pattern.
 */

import { escapeHtml } from '../component-system.js';
import {
    getCurrentChatCharacters,
    getAllCharacters,
    getAllPersonas
} from '../../blueprint/characters/linker.js';

// ============================================================================
// PICKER ITEM BUILDER
// ============================================================================

/**
 * Build a single picker item row
 * @param {Object} options - Item configuration
 * @param {string} options.inputName - Checkbox input name attribute
 * @param {string} options.value - Checkbox value
 * @param {Object} [options.dataAttrs={}] - Data attributes (name, etc.)
 * @param {string|null} options.avatarUrl - Avatar image URL or null
 * @param {string} options.fallbackIcon - FontAwesome icon class for missing avatar
 * @param {string} options.primaryText - Main display text (character name)
 * @param {string|null} [options.secondaryText] - Secondary text (role, title)
 * @param {string|null} [options.subtitle] - Subtitle text (description preview)
 * @param {boolean} [options.checked=false] - Initial checked state
 * @returns {string} HTML string
 */
function buildPickerItem({
    inputName,
    value,
    dataAttrs = {},
    avatarUrl,
    fallbackIcon,
    primaryText,
    secondaryText = null,
    subtitle = null,
    checked = false
}) {
    // SEC-001: Escape avatar URL in style attribute to prevent CSS injection
    const avatarStyle = avatarUrl
        ? `background-image: url('${escapeHtml(avatarUrl)}');`
        : '';
    const fallbackHtml = !avatarUrl
        ? `<i class="fa-solid ${fallbackIcon}"></i>`
        : '';

    // Build data attributes string
    // Note: data-name on wrapper for search filtering, on input for form collection
    const dataAttrStr = Object.entries(dataAttrs)
        .map(([k, v]) => `data-${k}="${escapeHtml(v)}"`)
        .join(' ');

    const secondaryHtml = secondaryText
        ? `<span class="storymode-picker-secondary">${escapeHtml(secondaryText)}</span>`
        : '';

    const subtitleHtml = subtitle
        ? `<div class="storymode-picker-subtitle">${escapeHtml(subtitle)}</div>`
        : '';

    return `
        <label class="storymode-picker-item ${checked ? 'checked' : ''}"
               data-name="${escapeHtml(dataAttrs.name || '')}">
            <input type="checkbox"
                   name="${inputName}"
                   value="${escapeHtml(value)}"
                   ${dataAttrStr}
                   ${checked ? 'checked' : ''} />
            <div class="storymode-picker-avatar" style="${avatarStyle}">
                ${fallbackHtml}
            </div>
            <div class="storymode-picker-info">
                <div class="storymode-picker-primary">
                    <span class="storymode-picker-name">${escapeHtml(primaryText)}</span>
                    ${secondaryHtml}
                </div>
                ${subtitleHtml}
            </div>
            <div class="storymode-picker-check">
                <i class="fa-solid fa-check"></i>
            </div>
        </label>
    `;
}

// ============================================================================
// CHAT CHARACTER PICKER
// ============================================================================

/**
 * Build chat character picker list
 * Shows characters from the current conversation, checked by default
 * @param {Array} characters - From getCurrentChatCharacters()
 * @returns {string} HTML string
 */
export function buildChatCharacterPicker(characters) {
    if (!characters || characters.length === 0) {
        return `
            <div class="storymode-picker-empty">
                <i class="fa-solid fa-info-circle"></i>
                No characters in current chat
            </div>
        `;
    }

    const items = characters.map(char => {
        const avatarUrl = char.avatar
            ? `/characters/${encodeURIComponent(char.avatar)}`
            : null;

        return buildPickerItem({
            inputName: 'blueprint_character',
            value: char.id,
            dataAttrs: { name: char.name },
            avatarUrl,
            fallbackIcon: 'fa-user',
            primaryText: char.name,
            secondaryText: char.role ? `(${char.role})` : null,
            checked: true // Chat characters checked by default
        });
    }).join('');

    return `<div class="storymode-picker-list">${items}</div>`;
}

// ============================================================================
// PERSONA PICKER
// ============================================================================

/**
 * Build persona picker list
 * Shows user personas with description preview
 * @param {Array} personas - From getAllPersonas()
 * @returns {string} HTML string
 */
export function buildPersonaPicker(personas) {
    if (!personas || personas.length === 0) {
        return `
            <div class="storymode-picker-empty">
                <i class="fa-solid fa-info-circle"></i>
                No personas defined. Create personas in Persona Management.
            </div>
        `;
    }

    const items = personas.map(persona => {
        const avatarUrl = persona.id
            ? `/User Avatars/${encodeURIComponent(persona.id)}`
            : null;

        const displayName = persona.title
            ? `${persona.name} (${persona.title})`
            : persona.name;

        const subtitle = persona.description
            ? (persona.description.length > 80
                ? persona.description.substring(0, 80) + '...'
                : persona.description)
            : null;

        return buildPickerItem({
            inputName: 'blueprint_persona',
            value: persona.id,
            dataAttrs: { name: persona.name },
            avatarUrl,
            fallbackIcon: 'fa-masks-theater',
            primaryText: displayName,
            subtitle,
            checked: false
        });
    }).join('');

    return `<div class="storymode-picker-list">${items}</div>`;
}

// ============================================================================
// LIBRARY CHARACTER PICKER
// ============================================================================

/**
 * Build library character picker with search
 * Shows all SillyTavern characters except those already in chat
 * @param {Array} allCharacters - All ST characters from getAllCharacters()
 * @param {Set} excludeIds - Character IDs to exclude (already in chat)
 * @returns {string} HTML string
 */
export function buildLibraryCharacterPicker(allCharacters, excludeIds = new Set()) {
    // Filter out characters already in chat
    const libraryChars = allCharacters
        .map((char, idx) => ({ ...char, _index: idx }))
        .filter(char => !excludeIds.has(char._index.toString()));

    if (libraryChars.length === 0) {
        return `
            <div class="storymode-picker-empty">
                <i class="fa-solid fa-info-circle"></i>
                ${allCharacters.length === 0
                    ? 'No characters in your library'
                    : 'All characters are already in the current chat'}
            </div>
        `;
    }

    const items = libraryChars.map(char => {
        const avatarUrl = char.avatar
            ? `/characters/${encodeURIComponent(char.avatar)}`
            : null;

        return buildPickerItem({
            inputName: 'blueprint_library_character',
            value: char._index.toString(),
            dataAttrs: { name: char.name },
            avatarUrl,
            fallbackIcon: 'fa-user',
            primaryText: char.name,
            checked: false
        });
    }).join('');

    return `
        <div class="storymode-picker-search">
            <i class="fa-solid fa-search"></i>
            <input type="text"
                   id="blueprint_library_search"
                   placeholder="Search characters..."
                   class="text_pole" />
        </div>
        <div class="storymode-picker-list" id="blueprint_library_list">
            ${items}
        </div>
    `;
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Initialize picker checkbox interactions
 * Toggles .checked class on parent when checkbox state changes
 * Uses namespaced event for clean management
 * Call once at module initialization, not on every render
 */
export function initPickerInteractions() {
    $(document).off('change.pickerCheck').on('change.pickerCheck',
        '.storymode-picker-item input[type="checkbox"]',
        function () {
            $(this).closest('.storymode-picker-item')
                .toggleClass('checked', this.checked);
        }
    );
}

/**
 * Initialize library character search filtering
 * Filters picker items by character name as user types
 * Uses namespaced event for clean management
 * Call once at module initialization, not on every render
 */
export function initLibrarySearch() {
    $(document).off('input.libraryPickerSearch')
        .on('input.libraryPickerSearch', '#blueprint_library_search', function () {
            const searchTerm = $(this).val().toLowerCase().trim();
            const list = $('#blueprint_library_list');

            list.find('.storymode-picker-item').each(function () {
                const name = $(this).data('name')?.toLowerCase() || '';
                $(this).toggle(!searchTerm || name.includes(searchTerm));
            });

            // Show/hide no results message
            const visibleCount = list.find('.storymode-picker-item:visible').length;
            list.find('.storymode-picker-no-results').remove();

            if (visibleCount === 0 && searchTerm) {
                // SEC-002: Use DOM construction to avoid XSS risk from search term
                const noResults = $('<div class="storymode-picker-no-results"></div>');
                noResults.append('<i class="fa-solid fa-search"></i> No characters match "');
                noResults.append($('<span>').text(searchTerm)); // .text() auto-escapes
                noResults.append('"');
                list.append(noResults);
            }
        });
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

// Re-export discovery functions for components that import from here
export { getCurrentChatCharacters, getAllCharacters, getAllPersonas };
