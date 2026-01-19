/**
 * Blueprint Import UI Components
 *
 * Provides dialogs for:
 * - Missing resource import preview
 * - Conflict resolution
 * - Import result summary
 */

import { callGenericPopup } from '/scripts/popup.js';
import { escapeHtml, truncateText } from './utils.js';

/**
 * Show import preview dialog
 * @param {Object} importData - {characters: [], personas: []}
 * @param {Object} missingInfo - {characters: [], personas: []}
 * @returns {Promise<Object|null>} Selected items or null if cancelled
 */
export async function showImportPreviewDialog(importData, missingInfo) {
    const html = `
        <div class="blueprint-import-preview">
            <h3>Import Blueprint Resources</h3>
            <p>This blueprint includes embedded characters and personas.</p>

            ${buildCharacterSection(importData.characters, missingInfo.characters)}
            ${buildPersonaSection(importData.personas, missingInfo.personas)}

            <div class="import-actions">
                <button class="menu_button" id="import_all_btn">
                    <i class="fa-solid fa-download"></i> Import All
                </button>
                <button class="menu_button" id="import_selected_btn">
                    <i class="fa-solid fa-check"></i> Import Selected
                </button>
            </div>
        </div>
    `;

    const popup = new Popup(html, POPUP_TYPE.TEXT, 'Import Resources', {
        okButton: 'Cancel',
        wide: true,
        large: true
    });

    await popup.show();

    // Get selected items
    const selectedCharacters = [];
    const selectedPersonas = [];

    document.querySelectorAll('input[name="import_character"]:checked').forEach(cb => {
        selectedCharacters.push(cb.value);
    });

    document.querySelectorAll('input[name="import_persona"]:checked').forEach(cb => {
        selectedPersonas.push(cb.value);
    });

    return {
        characters: selectedCharacters,
        personas: selectedPersonas
    };
}

/**
 * Build character section HTML
 * @param {Array} characters
 * @param {Array} missing
 * @returns {string}
 */
function buildCharacterSection(characters, missing) {
    if (!characters || characters.length === 0) {
        return '';
    }

    return `
        <div class="import-section">
            <h4><i class="fa-solid fa-users"></i> Characters (${characters.length})</h4>
            <div class="import-grid">
                ${characters.map(char => buildCharacterPreviewCard(char, missing.includes(char.name))).join('')}
            </div>
        </div>
    `;
}

/**
 * Build character preview card
 * @param {Object} character
 * @param {boolean} isMissing
 * @returns {string}
 */
function buildCharacterPreviewCard(character, isMissing) {
    const statusIcon = isMissing
        ? '<i class="fa-solid fa-triangle-exclamation" style="color: var(--SmartThemeWarningColor);"></i> Missing'
        : '<i class="fa-solid fa-check-circle" style="color: var(--SmartThemeEmColor);"></i> Available';

    return `
        <div class="character-preview-card">
            <label class="checkbox_label">
                <input type="checkbox" name="import_character" value="${escapeHtml(character.name)}" ${isMissing ? 'checked' : ''} />
                <div class="card-content">
                    <div class="card-avatar" style="background-image: url('${character.metadata?.avatar || character.pngDataUrl}');"></div>
                    <div class="card-info">
                        <div class="card-name">${escapeHtml(character.name)}</div>
                        <div class="card-status">${statusIcon}</div>
                        <div class="card-description">${truncateText(escapeHtml(character.metadata?.description || ''), 100)}</div>
                    </div>
                </div>
            </label>
        </div>
    `;
}

/**
 * Build persona section HTML
 * @param {Array} personas
 * @param {Array} missing
 * @returns {string}
 */
function buildPersonaSection(personas, missing) {
    if (!personas || personas.length === 0) {
        return '';
    }

    return `
        <div class="import-section">
            <h4><i class="fa-solid fa-user"></i> Personas (${personas.length})</h4>
            <div class="import-grid">
                ${personas.map(persona => buildPersonaPreviewCard(persona, missing.includes(persona.name))).join('')}
            </div>
        </div>
    `;
}

/**
 * Build persona preview card
 * @param {Object} persona
 * @param {boolean} isMissing
 * @returns {string}
 */
function buildPersonaPreviewCard(persona, isMissing) {
    const statusIcon = isMissing
        ? '<i class="fa-solid fa-triangle-exclamation" style="color: var(--SmartThemeWarningColor);"></i> Missing'
        : '<i class="fa-solid fa-check-circle" style="color: var(--SmartThemeEmColor);"></i> Available';

    return `
        <div class="persona-preview-card">
            <label class="checkbox_label">
                <input type="checkbox" name="import_persona" value="${escapeHtml(persona.name)}" ${isMissing ? 'checked' : ''} />
                <div class="card-content">
                    <div class="card-avatar" style="background-image: url('${persona.avatarDataUrl}');"></div>
                    <div class="card-info">
                        <div class="card-name">${escapeHtml(persona.name)}</div>
                        <div class="card-status">${statusIcon}</div>
                        <div class="card-description">${truncateText(escapeHtml(persona.description || ''), 100)}</div>
                    </div>
                </div>
            </label>
        </div>
    `;
}

/**
 * Show conflict resolution dialog
 * @param {Array} conflicts - Array of {name, existing, imported}
 * @returns {Promise<Object>} Resolution decisions
 */
export async function showConflictResolutionDialog(conflicts) {
    const html = `
        <div class="blueprint-conflict-resolution">
            <h3>Character Conflicts Detected</h3>
            <p>The following characters already exist. Choose how to handle each:</p>

            ${conflicts.map((conflict, i) => buildConflictCard(conflict, i)).join('')}

            <div class="conflict-actions">
                <button class="menu_button" id="keep_all_btn">Keep All Existing</button>
                <button class="menu_button" id="replace_all_btn">Replace All</button>
            </div>
        </div>
    `;

    const popup = new Popup(html, POPUP_TYPE.TEXT, 'Resolve Conflicts', {
        okButton: 'Apply',
        wide: true,
        large: true
    });

    await popup.show();

    // Gather decisions
    const decisions = {};
    conflicts.forEach((conflict, i) => {
        const selected = document.querySelector(`input[name="conflict_${i}"]:checked`);
        decisions[conflict.name] = selected ? selected.value : 'keep';
    });

    return decisions;
}

/**
 * Build conflict card HTML
 * @param {Object} conflict
 * @param {number} index
 * @returns {string}
 */
function buildConflictCard(conflict, index) {
    return `
        <div class="conflict-card">
            <h4>${escapeHtml(conflict.name)}</h4>
            <div class="conflict-options">
                <label>
                    <input type="radio" name="conflict_${index}" value="keep" checked />
                    Keep existing
                </label>
                <label>
                    <input type="radio" name="conflict_${index}" value="replace" />
                    Replace with imported
                </label>
                <label>
                    <input type="radio" name="conflict_${index}" value="rename" />
                    Rename to "${escapeHtml(conflict.name)} (Imported)"
                </label>
            </div>
        </div>
    `;
}

/**
 * Show import result summary
 * @param {Object} result - {imported: [], skipped: [], failed: []}
 */
export async function showImportResultDialog(result) {
    const html = `
        <div class="blueprint-import-result">
            <h3>Import Complete</h3>

            ${result.imported.length > 0 ? `
                <div class="result-section success">
                    <h4><i class="fa-solid fa-check-circle"></i> Imported (${result.imported.length})</h4>
                    <ul>
                        ${result.imported.map(name => `<li>${escapeHtml(name)}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}

            ${result.skipped.length > 0 ? `
                <div class="result-section info">
                    <h4><i class="fa-solid fa-info-circle"></i> Skipped (${result.skipped.length})</h4>
                    <ul>
                        ${result.skipped.map(name => `<li>${escapeHtml(name)}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}

            ${result.failed.length > 0 ? `
                <div class="result-section error">
                    <h4><i class="fa-solid fa-exclamation-circle"></i> Failed (${result.failed.length})</h4>
                    <ul>
                        ${result.failed.map(item => `<li>${escapeHtml(item.name)}: ${escapeHtml(item.error)}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
        </div>
    `;

    await callGenericPopup(html, POPUP_TYPE.TEXT, 'Import Results', {
        okButton: 'Close'
    });
}
