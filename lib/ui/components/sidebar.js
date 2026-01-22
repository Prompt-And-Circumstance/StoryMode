/**
 * Sidebar Components for Story Mode Extension
 * Settings dialog sidebar with character/persona lists
 */

import { getContext } from '/scripts/extensions.js';
import { escapeHtml } from '../component-system.js';

/**
 * Build the sidebar HTML content for the unified modal.
 * Shows characters from current chat and available personas.
 * @returns {string} HTML string for the sidebar
 */
export function buildSidebarContent() {
    const context = getContext();
    const characters = [];

    // Get characters from group or single chat
    if (context.groupId) {
        const group = context.groups?.find(g => g.id === context.groupId);
        if (group?.members) {
            group.members.forEach((charId, index) => {
                const char = context.characters?.find(c => c.avatar === charId);
                if (char) {
                    characters.push({ name: char.name, isMain: index === 0 });
                }
            });
        }
    } else if (context.characterId !== undefined) {
        const char = context.characters?.[context.characterId];
        if (char) {
            characters.push({ name: char.name, isMain: true });
        }
    }

    // Get available personas
    const personas = [];
    if (context.personas) {
        Object.entries(context.personas).forEach(([key, value]) => {
            personas.push({
                id: key,
                name: typeof value === 'string' ? key : (value.name || key)
            });
        });
    }
    if (context.name1 && !personas.find(p => p.name === context.name1)) {
        personas.unshift({ id: 'current', name: context.name1 });
    }

    return `
        <div class="storymode-sidebar-section">
<h4>Characters</h4>
<div class="storymode-entity-list">
${characters.length > 0 ? characters.map(char => `
<div class="storymode-entity-item ${char.isMain ? 'main-char' : ''}">
<i class="fa-solid fa-user"></i>
<span>${escapeHtml(char.name)}</span>
${char.isMain ? '<span class="storymode-entity-badge">Main</span>' : ''}
</div>
`).join('') : '<div class="storymode-entity-item"><i class="fa-solid fa-user-slash"></i> No characters</div>'}
</div>
</div>
        <div class="storymode-sidebar-section">
            <h4>Personas</h4>
            <div class="storymode-entity-list">
                ${personas.length > 0 ? personas.map(persona => `
<div class="storymode-entity-item">
<i class="fa-solid fa-mask"></i>
<span>${escapeHtml(persona.name)}</span>
</div>
`).join('') : '<div class="storymode-entity-item"><i class="fa-solid fa-mask"></i> No personas</div>'}
            </div>
        </div>
    `;
}
