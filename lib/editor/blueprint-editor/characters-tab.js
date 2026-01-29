/**
 * Characters Tab Module
 * Renders the Characters tab content for blueprint editor
 * Includes: Character arcs display, character picker, persona picker, linked characters
 */

import { getCurrentBlueprint, setHasUnsavedChanges } from './state.js';
import { escapeHtml, normalizeCharacterName, isDelinked } from '../../blueprint/utils.js';
import { getAllPersonas } from '../../blueprint/characters/linker.js';

// Module state for active sub-tab
let _activeCharSubTab = 'characters'; // 'characters' or 'arcs'

/**
 * Get active characters sub-tab
 */
export function getActiveCharSubTab() {
    return _activeCharSubTab;
}

/**
 * Set active characters sub-tab
 */
export function setActiveCharSubTab(tab) {
    _activeCharSubTab = tab;
}

/**
 * Toggle delink state for a character/persona
 * @param {string} characterName - Character or persona name to toggle
 */
export function toggleDelink(characterName) {
    const bp = getCurrentBlueprint();
    if (!bp.delinkedCharacters) bp.delinkedCharacters = [];
    const normalized = normalizeCharacterName(characterName);
    const index = bp.delinkedCharacters.findIndex(n => normalizeCharacterName(n) === normalized);
    if (index >= 0) {
        bp.delinkedCharacters.splice(index, 1); // Relink
    } else {
        bp.delinkedCharacters.push(normalized); // Delink — store normalized
    }
    setHasUnsavedChanges(true);
}

/**
 * Render the full Characters tab
 */
export function renderCharactersTab() {
    const bp = getCurrentBlueprint();
    if (!bp) {
        return '<div class="storymode-tab-placeholder">No blueprint loaded</div>';
    }

    // Trigger async content load
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

    const bp = getCurrentBlueprint();
    const { linkBlueprintCharacters } = await import('../../blueprint/characters/linker.js');
    const linkInfo = linkBlueprintCharacters(bp);
    const activeTab = getActiveCharSubTab();

    const html = `
        <!-- Sub-tab Navigation -->
        <div class="storymode-char-subtabs">
            <button class="storymode-char-subtab ${activeTab === 'characters' ? 'active' : ''}" data-char-subtab="characters">
                <i class="fa-solid fa-users"></i> Characters
            </button>
            <button class="storymode-char-subtab ${activeTab === 'arcs' ? 'active' : ''}" data-char-subtab="arcs">
                <i class="fa-solid fa-route"></i> Character Arcs
            </button>
        </div>

        <!-- Tab Content -->
        <div class="storymode-char-subtab-content">
            ${activeTab === 'characters' ? renderCharactersSubTab(bp, linkInfo) : renderArcsSubTab(bp)}
        </div>
    `;

    container.innerHTML = html;

    // Load character picker async if on characters tab
    if (activeTab === 'characters') {
        await loadCharacterPicker();
    }
}

/**
 * Render the Characters sub-tab content
 */
function renderCharactersSubTab(bp, linkInfo) {
    return `
        <!-- Character Picker -->
        <div class="storymode-form-section">
            <h3 class="storymode-section-title">
                <i class="fa-solid fa-user-plus"></i> Add Characters
            </h3>
            <p class="storymode-form-hint">
                Select characters from your library to reference in this blueprint.
            </p>
            <div id="character_picker_container">
                <div class="storymode-loading-spinner">
                    <i class="fa-solid fa-circle-notch fa-spin"></i> Loading characters...
                </div>
            </div>
        </div>

        <!-- Persona Picker -->
        <div class="storymode-form-section">
            <h3 class="storymode-section-title">
                <i class="fa-solid fa-masks-theater"></i> Add Personas
            </h3>
            <p class="storymode-form-hint">
                Select player personas to include as characters in this blueprint.
            </p>
            <div id="persona_picker_container">
                ${renderPersonaPicker(bp)}
            </div>
        </div>

        <!-- Linked Characters -->
        <div class="storymode-form-section">
            <div class="storymode-section-header">
                <h3 class="storymode-section-title">
                    <i class="fa-solid fa-link"></i> Linked Characters
                </h3>
                <button class="menu_button menu_button_icon" id="refresh_character_links" title="Refresh links">
                    <i class="fa-solid fa-sync"></i>
                </button>
            </div>
            ${renderLinkedCharacters(linkInfo, bp)}
        </div>
    `;
}

/**
 * Render the Character Arcs sub-tab content
 */
function renderArcsSubTab(bp) {
    return `
        <div class="storymode-form-section">
            <div class="storymode-section-header">
                <h3 class="storymode-section-title">
                    <i class="fa-solid fa-route"></i> Character Arcs
                </h3>
                <button class="menu_button menu_button_icon" id="add_character_arc_btn" title="Add character arc">
                    <i class="fa-solid fa-plus"></i>
                </button>
            </div>
            ${renderCharacterArcsEditor(bp.character_arcs)}
        </div>
    `;
}

/**
 * Render character arcs editor
 */
function renderCharacterArcsEditor(arcs) {
    if (!arcs || arcs.length === 0) {
        return `
            <div class="storymode-empty-state">
                <p>No character arcs defined yet.</p>
                <p class="storymode-form-hint">Use the AI Wizard to generate character arcs, or add them manually.</p>
            </div>
        `;
    }

    return `
        <div class="storymode-character-arcs-list">
            ${arcs.map((arc, idx) => renderCharacterArcCard(arc, idx)).join('')}
        </div>
    `;
}

/**
 * Render a single character arc card
 */
function renderCharacterArcCard(arc, index) {
    const turningPoints = arc.key_turning_points || [];

    return `
        <div class="storymode-character-arc-card" data-arc-index="${index}">
            <div class="arc-header">
                <h4 class="arc-character-name">${escapeHtml(arc.character_name || 'Unnamed Character')}</h4>
                <div class="arc-actions">
                    <button class="menu_button menu_button_icon" data-action="edit-arc" data-arc-index="${index}" title="Edit arc">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="menu_button menu_button_icon storymode-btn-danger" data-action="delete-arc" data-arc-index="${index}" title="Delete arc">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="arc-details">
                <div class="arc-field">
                    <label>Initial State:</label>
                    <span>${escapeHtml(arc.initial_state || 'Not defined')}</span>
                </div>
                ${turningPoints.length > 0 ? `
                    <div class="arc-field">
                        <label>Turning Points:</label>
                        <ul class="arc-turning-points">
                            ${turningPoints.map(tp => `<li>${escapeHtml(tp)}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
                <div class="arc-field">
                    <label>Final State:</label>
                    <span>${escapeHtml(arc.final_state || 'Not defined')}</span>
                </div>
                <div class="arc-field">
                    <label>Emotional Trajectory:</label>
                    <span>${escapeHtml(arc.emotional_trajectory || 'Not defined')}</span>
                </div>
            </div>
        </div>
    `;
}

/**
 * Load character picker with all ST characters
 */
async function loadCharacterPicker() {
    const container = document.getElementById('character_picker_container');
    if (!container) return;

    try {
        const { characters } = await import('/script.js');
        const bp = getCurrentBlueprint();

        if (!characters || characters.length === 0) {
            container.innerHTML = '<p class="storymode-form-hint">No characters available in your library.</p>';
            return;
        }

        // Get names already in character_arcs
        const existingNames = new Set(
            (bp.character_arcs || []).map(arc =>
                (arc.character_name || '').toLowerCase().trim()
            )
        );

        container.innerHTML = `
            <div class="storymode-character-picker-grid">
                ${characters.map(char => {
            const isSelected = existingNames.has((char.name || '').toLowerCase().trim());
            const avatarPath = char.avatar ? `/characters/${encodeURIComponent(char.avatar)}` : '';
            return `
                        <div class="storymode-character-pick ${isSelected ? 'selected' : ''}"
                             data-char-name="${escapeHtml(char.name)}"
                             title="${isSelected ? 'Already in arcs' : 'Click to add'}">
                            <div class="char-avatar" ${avatarPath ? `style="background-image: url('${avatarPath}');"` : ''}>
                                ${!avatarPath ? '<i class="fa-solid fa-user"></i>' : ''}
                            </div>
                            <span class="char-name">${escapeHtml(char.name)}</span>
                            ${isSelected ? '<i class="fa-solid fa-check selected-icon"></i>' : ''}
                        </div>
                    `;
        }).join('')}
            </div>
            <p class="storymode-form-hint" style="margin-top: 12px;">
                Click a character to add them to the arcs. Use the AI Wizard to generate their arc details.
            </p>
        `;
    } catch (error) {
        console.error('[Story Mode] Failed to load character picker:', error);
        container.innerHTML = '<p class="storymode-form-hint">Failed to load characters.</p>';
    }
}

/**
 * Render persona picker
 */
function renderPersonaPicker(bp) {
    const personas = getAllPersonas();

    if (!personas || personas.length === 0) {
        return '<p class="storymode-form-hint">No personas defined yet. Create personas in the Persona Management panel.</p>';
    }

    // Get persona names already in character_arcs
    const existingNames = new Set(
        (bp.character_arcs || []).map(arc =>
            (arc.character_name || '').toLowerCase().trim()
        )
    );

    return `
        <div class="storymode-character-picker-grid">
            ${personas.map(persona => {
        const isSelected = existingNames.has((persona.name || '').toLowerCase().trim());
        const avatarPath = persona.id ? `/User Avatars/${encodeURIComponent(persona.id)}` : '';
        const displayName = persona.title ? `${persona.name} (${persona.title})` : persona.name;

        return `
                    <div class="storymode-character-pick storymode-persona-pick ${isSelected ? 'selected' : ''}"
                         data-persona-name="${escapeHtml(persona.name)}"
                         data-persona-id="${escapeHtml(persona.id)}"
                         title="${isSelected ? 'Already in arcs' : 'Click to add'}">
                        <div class="char-avatar" ${avatarPath ? `style="background-image: url('${avatarPath}');"` : ''}>
                            ${!avatarPath ? '<i class="fa-solid fa-masks-theater"></i>' : ''}
                        </div>
                        <span class="char-name">${escapeHtml(displayName)}</span>
                        ${isSelected ? '<i class="fa-solid fa-check selected-icon"></i>' : ''}
                    </div>
                `;
    }).join('')}
        </div>
        <p class="storymode-form-hint" style="margin-top: 12px;">
            Click a persona to add them to the character arcs.
        </p>
    `;
}

/**
 * Render linked characters section
 * @param {Object} linkInfo - {linked, linkedPersonas, missing}
 * @param {Object} [blueprint] - Blueprint object (for embedded resource avatars)
 */
export function renderLinkedCharacters(linkInfo, blueprint) {
    const hasLinked = linkInfo.linked.length > 0;
    const hasPersonas = linkInfo.linkedPersonas?.length > 0;
    const hasMissing = linkInfo.missing.length > 0;

    if (!hasLinked && !hasPersonas && !hasMissing) {
        return `
            <div class="storymode-empty-state">
                <p>No linked characters yet.</p>
                <p class="storymode-form-hint">Characters referenced in arcs will be linked automatically.</p>
            </div>
        `;
    }

    // Build embedded character lookup for avatar display
    const embeddedMap = new Map();
    if (blueprint?.embeddedResources?.characters) {
        for (const char of blueprint.embeddedResources.characters) {
            embeddedMap.set(normalizeCharacterName(char.name), char);
        }
    }

    // Split linked characters into still linked vs delinked
    const stillLinked = linkInfo.linked.filter(link => !isDelinked(blueprint, link.blueprintName));
    const delinkedChars = linkInfo.linked.filter(link => isDelinked(blueprint, link.blueprintName));

    // Split linked personas into still linked vs delinked
    const stillLinkedPersonas = (linkInfo.linkedPersonas || []).filter(link => !isDelinked(blueprint, link.blueprintName));
    const delinkedPersonas = (linkInfo.linkedPersonas || []).filter(link => isDelinked(blueprint, link.blueprintName));

    // Split missing characters into still missing vs delinked
    const stillMissing = linkInfo.missing.filter(name => !isDelinked(blueprint, name));
    const delinkedMissing = linkInfo.missing.filter(name => isDelinked(blueprint, name));

    const hasDelinked = delinkedChars.length > 0 || delinkedPersonas.length > 0 || delinkedMissing.length > 0;
    const hasStillMissing = stillMissing.length > 0;

    return `
        ${stillLinked.length > 0 ? `
            <div class="characters-section">
                <h5><i class="fa-solid fa-check-circle" style="color: var(--SmartThemeEmColor);"></i> Characters (${stillLinked.length})</h5>
                <div class="characters-grid">
                    ${stillLinked.map(link => renderCharacterCard(link.localCharacter, link.blueprintName, false)).join('')}
                </div>
            </div>
        ` : ''}

        ${stillLinkedPersonas.length > 0 ? `
            <div class="characters-section">
                <h5><i class="fa-solid fa-masks-theater" style="color: var(--SmartThemeEmColor);"></i> Personas (${stillLinkedPersonas.length})</h5>
                <div class="characters-grid">
                    ${stillLinkedPersonas.map(link => renderPersonaCard(link.localPersona, link.blueprintName, false)).join('')}
                </div>
            </div>
        ` : ''}

        ${hasDelinked ? `
            <div class="characters-section delinked-section">
                <h5><i class="fa-solid fa-unlink" style="color: var(--SmartThemeQuoteColor);"></i>
                    No Longer Linked (${delinkedChars.length + delinkedPersonas.length + delinkedMissing.length})</h5>
                <p class="missing-hint">
                    <i class="fa-solid fa-info-circle"></i>
                    These characters will not be embedded on export. Click to relink.
                </p>
                <div class="characters-grid">
                    ${delinkedChars.map(link => renderCharacterCard(link.localCharacter, link.blueprintName, true)).join('')}
                    ${delinkedPersonas.map(link => renderPersonaCard(link.localPersona, link.blueprintName, true)).join('')}
                    ${delinkedMissing.map(name => {
        const embedded = embeddedMap.get(normalizeCharacterName(name));
        return renderMissingCharacterCard(name, embedded, blueprint);
    }).join('')}
                </div>
            </div>
        ` : ''}

        ${stillMissing.length > 0 ? (() => {
            // Split missing characters into embedded vs fully missing
            const embeddedMissing = stillMissing.filter(name => embeddedMap.has(normalizeCharacterName(name)));
            const trulyMissing = stillMissing.filter(name => !embeddedMap.has(normalizeCharacterName(name)));

            return `
                ${embeddedMissing.length > 0 ? `
                    <div class="characters-section">
                        <h5><i class="fa-solid fa-file-import" style="color: var(--SmartThemeEmColor);"></i> Embedded in Blueprint (${embeddedMissing.length})</h5>
                        <div class="characters-grid">
                            ${embeddedMissing.map(name => {
                const embedded = embeddedMap.get(normalizeCharacterName(name));
                return renderMissingCharacterCard(name, embedded, blueprint);
            }).join('')}
                        </div>
                        <p class="missing-hint">
                            <i class="fa-solid fa-info-circle"></i>
                            These characters are embedded in the blueprint file but not in your library.
                        </p>
                    </div>
                ` : ''}

                ${trulyMissing.length > 0 ? `
                    <div class="characters-section">
                        <h5><i class="fa-solid fa-triangle-exclamation" style="color: var(--SmartThemeWarningColor);"></i> Not in Library (${trulyMissing.length})</h5>
                        <div class="characters-grid">
                            ${trulyMissing.map(name => {
                return renderMissingCharacterCard(name, null, blueprint);
            }).join('')}
                        </div>
                        <p class="missing-hint">
                            <i class="fa-solid fa-info-circle"></i>
                            These characters are referenced in arcs but no data is available (not in library or blueprint).
                        </p>
                    </div>
                ` : ''}
            `;
        })() : ''}
    `;
}

/**
 * Render character card
 * @param {Object} character - Character object
 * @param {string} blueprintName - Name from blueprint (for delink tracking)
 * @param {boolean} isDelinked - Whether this character is delinked
 * @param {boolean} [isAvailable=true] - Whether character is available in library
 */
export function renderCharacterCard(character, blueprintName, isDelinked, isAvailable = true) {
    const avatarPath = character.avatar ? `/characters/${encodeURIComponent(character.avatar)}` : '';
    const delinkedClass = isDelinked ? ' delinked' : '';
    return `
        <div class="character-mini-card ${isAvailable ? 'available' : 'missing'}${delinkedClass}"
             data-delink-name="${escapeHtml(blueprintName)}">
            <div class="character-avatar" ${avatarPath ? `style="background-image: url('${avatarPath}');"` : 'data-fa="fa-user"'}></div>
            <div class="character-name">${escapeHtml(character.name)}</div>
            ${isAvailable ? '<i class="fa-solid fa-check-circle status-icon"></i>' : ''}
        </div>
    `;
}

/**
 * Render persona card with badge
 * @param {Object} persona - Persona object
 * @param {string} blueprintName - Name from blueprint (for delink tracking)
 * @param {boolean} isDelinked - Whether this persona is delinked
 */
export function renderPersonaCard(persona, blueprintName, isDelinked) {
    const avatarPath = persona.id ? `/User Avatars/${encodeURIComponent(persona.id)}` : '';
    const displayName = persona.title ? `${persona.name} (${persona.title})` : persona.name;
    const delinkedClass = isDelinked ? ' delinked' : '';
    return `
        <div class="character-mini-card available persona-card${delinkedClass}"
             data-delink-name="${escapeHtml(blueprintName)}">
            <div class="character-avatar" ${avatarPath ? `style="background-image: url('${avatarPath}');"` : ''}>
                ${!avatarPath ? '<i class="fa-solid fa-masks-theater"></i>' : ''}
                <span class="persona-badge" title="Persona">P</span>
            </div>
            <div class="character-name">${escapeHtml(displayName)}</div>
            <i class="fa-solid fa-masks-theater status-icon" style="color: var(--SmartThemeEmColor);"></i>
        </div>
    `;
}

/**
 * Render missing character card (with optional embedded avatar)
 * @param {string} name - Character name
 * @param {Object} [embeddedData] - Embedded character data from blueprint (has pngDataUrl)
 * @param {Object} [blueprint] - Blueprint object (for delink checking)
 */
export function renderMissingCharacterCard(name, embeddedData, blueprint) {
    const avatarUrl = embeddedData?.pngDataUrl;
    const isCharDelinked = blueprint ? isDelinked(blueprint, name) : false;
    const delinkedClass = isCharDelinked ? ' delinked' : '';
    return `
        <div class="character-mini-card missing${delinkedClass}"
             data-delink-name="${escapeHtml(name)}">
            <div class="character-avatar ${avatarUrl ? '' : 'placeholder'}"
                 ${avatarUrl ? `style="background-image: url('${avatarUrl}');"` : ''}>
                ${!avatarUrl ? '<i class="fa-solid fa-user"></i>' : ''}
            </div>
            <div class="character-name">${escapeHtml(name)}</div>
            <i class="fa-solid fa-triangle-exclamation status-icon"></i>
        </div>
    `;
}

/**
 * Add a skeleton arc for a character from the picker
 */
export function addCharacterArcFromPicker(characterName) {
    const bp = getCurrentBlueprint();
    if (!bp.character_arcs) {
        bp.character_arcs = [];
    }

    // Check if already exists
    const exists = bp.character_arcs.some(
        arc => (arc.character_name || '').toLowerCase().trim() === characterName.toLowerCase().trim()
    );

    if (exists) {
        toastr.info(`${characterName} is already in the character arcs.`);
        return false;
    }

    // Add skeleton arc
    bp.character_arcs.push({
        character_name: characterName,
        initial_state: '',
        key_turning_points: [],
        final_state: '',
        emotional_trajectory: ''
    });

    setHasUnsavedChanges(true);
    return true;
}

/**
 * Delete a character arc by index
 */
export function deleteCharacterArc(index) {
    const bp = getCurrentBlueprint();
    if (!bp.character_arcs || index < 0 || index >= bp.character_arcs.length) {
        return false;
    }

    bp.character_arcs.splice(index, 1);
    setHasUnsavedChanges(true);
    return true;
}

/**
 * Edit a character arc via popup
 */
export async function editCharacterArc(arcIndex) {
    const { callGenericPopup, POPUP_TYPE } = await import('/scripts/popup.js');
    const bp = getCurrentBlueprint();
    const arc = bp.character_arcs?.[arcIndex];

    if (!arc) return;

    const formHtml = `
        <div class="storymode-arc-edit-form">
            <div class="storymode-form-field">
                <label>Character Name</label>
                <input type="text" id="arc_edit_name" class="text_pole" value="${escapeHtml(arc.character_name || '')}">
            </div>
            <div class="storymode-form-field">
                <label>Initial State</label>
                <textarea id="arc_edit_initial" class="text_pole" rows="2">${escapeHtml(arc.initial_state || '')}</textarea>
            </div>
            <div class="storymode-form-field">
                <label>Key Turning Points (one per line)</label>
                <textarea id="arc_edit_turning" class="text_pole" rows="3">${escapeHtml((arc.key_turning_points || []).join('\n'))}</textarea>
            </div>
            <div class="storymode-form-field">
                <label>Final State</label>
                <textarea id="arc_edit_final" class="text_pole" rows="2">${escapeHtml(arc.final_state || '')}</textarea>
            </div>
            <div class="storymode-form-field">
                <label>Emotional Trajectory</label>
                <textarea id="arc_edit_trajectory" class="text_pole" rows="2">${escapeHtml(arc.emotional_trajectory || '')}</textarea>
            </div>
        </div>
    `;

    const result = await callGenericPopup(formHtml, POPUP_TYPE.CONFIRM, 'Edit Character Arc', {
        okButton: 'Save',
        cancelButton: 'Cancel',
        wide: true
    });

    if (result) {
        arc.character_name = $('#arc_edit_name').val() || arc.character_name;
        arc.initial_state = $('#arc_edit_initial').val();
        arc.key_turning_points = $('#arc_edit_turning').val()
            .split('\n')
            .map(s => s.trim())
            .filter(s => s.length > 0);
        arc.final_state = $('#arc_edit_final').val();
        arc.emotional_trajectory = $('#arc_edit_trajectory').val();

        setHasUnsavedChanges(true);
        await loadCharactersTabContent();
        toastr.success('Character arc updated');
    }
}

/**
 * Add new character arc via popup
 */
export async function addNewCharacterArc() {
    const { callGenericPopup, POPUP_TYPE } = await import('/scripts/popup.js');

    const formHtml = `
        <div class="storymode-arc-edit-form">
            <div class="storymode-form-field">
                <label>Character Name</label>
                <input type="text" id="arc_add_name" class="text_pole" placeholder="Enter character name">
            </div>
        </div>
    `;

    const result = await callGenericPopup(formHtml, POPUP_TYPE.CONFIRM, 'Add Character Arc', {
        okButton: 'Add',
        cancelButton: 'Cancel'
    });

    if (result) {
        const name = $('#arc_add_name').val()?.trim();
        if (!name) {
            toastr.warning('Please enter a character name');
            return;
        }

        const added = addCharacterArcFromPicker(name);
        if (added) {
            toastr.success(`${name} added to character arcs`);
            await loadCharactersTabContent();
        }
    }
}
