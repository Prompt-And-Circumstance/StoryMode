/**
 * Blueprint Import UI Components
 *
 * Provides dialogs for:
 * - Missing resource import preview
 * - Conflict resolution
 * - Import result summary
 */

import { Popup, POPUP_TYPE, POPUP_RESULT } from '/scripts/popup.js';
import { escapeHtml, truncateText } from './utils.js';

/**
 * Create a dialog with standardized event handling pattern
 * @param {string} html - Dialog HTML content
 * @param {string} title - Dialog title
 * @param {Object} options - Popup options
 * @param {string} namespace - Event namespace for cleanup
 * @param {Object} handlers - Event handlers {selector: handler}
 * @param {Function} onCancel - Optional cancel handler returning default value
 * @returns {Promise} Resolves with handler result or onCancel value
 */
function createDialog(html, title, options, namespace, handlers, onCancel = () => null) {
    const popup = new Popup(html, POPUP_TYPE.TEXT, title, options);

    return new Promise((resolve) => {
        // Clean up any stale handlers
        $(document).off(`.${namespace}`);

        // Wire all handlers BEFORE show
        Object.entries(handlers).forEach(([selector, handler]) => {
            $(document).on(`click.${namespace}`, selector, () => {
                const result = handler();
                $(document).off(`.${namespace}`);
                popup.complete(POPUP_RESULT.OK);
                resolve(result);
            });
        });

        popup.show().then((popupResult) => {
            $(document).off(`.${namespace}`);
            if (popupResult === POPUP_RESULT.CANCELLED || popupResult === POPUP_RESULT.NEGATIVE) {
                resolve(onCancel());
            }
        });
    });
}

/**
 * Show import preview dialog (only shows missing resources)
 * @param {Object} importData - {characters: [], personas: []}
 * @param {Object} missingInfo - {characters: [], personas: []}
 * @returns {Promise<Object|null>} Selected items or null if cancelled
 */
export async function showImportPreviewDialog(importData, missingInfo) {
    // Filter to only show resources that are actually missing from the library
    const missingCharNames = new Set((missingInfo.characters || []).map(n => n.toLowerCase().trim()));
    const missingPersonaNames = new Set((missingInfo.personas || []).map(n => n.toLowerCase().trim()));
    const missingCharacters = (importData.characters || []).filter(c =>
        missingCharNames.has((c.name || '').toLowerCase().trim())
    );
    const missingPersonas = (importData.personas || []).filter(p =>
        missingPersonaNames.has((p.name || '').toLowerCase().trim())
    );

    const html = `
        <div class="blueprint-import-preview">
            <h3>Import from Scenario Blueprint</h3>
            <p>The following characters and personas from this blueprint are not in your library.</p>

            ${buildResourceSection('character', missingCharacters)}
            ${buildResourceSection('persona', missingPersonas)}

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

    const gatherSelections = () => {
        const selectedCharacters = [];
        const selectedPersonas = [];
        $('input[name="import_character"]:checked').each((_, cb) => selectedCharacters.push($(cb).val()));
        $('input[name="import_persona"]:checked').each((_, cb) => selectedPersonas.push($(cb).val()));
        return { characters: selectedCharacters, personas: selectedPersonas };
    };

    return createDialog(html, 'Import from Scenario Blueprint', {
        okButton: false,
        cancelButton: 'Cancel',
        wide: true,
        large: true
    }, 'importPreview', {
        '#import_all_btn': () => {
            $('input[name="import_character"], input[name="import_persona"]').prop('checked', true);
            return gatherSelections();
        },
        '#import_selected_btn': gatherSelections
    });
}

/**
 * Build resource section HTML (characters or personas)
 * All resources shown here are missing from the library.
 * @param {string} type - 'character' or 'persona'
 * @param {Array} resources - Pre-filtered to missing only
 * @returns {string}
 */
function buildResourceSection(type, resources) {
    if (!resources || resources.length === 0) return '';

    const isCharacter = type === 'character';
    const icon = isCharacter ? 'fa-users' : 'fa-user';
    const label = isCharacter ? 'Characters' : 'Personas';

    return `
        <div class="import-section">
            <h4><i class="fa-solid ${icon}"></i> ${label} (${resources.length})</h4>
            <div class="import-grid">
                ${resources.map(r => buildResourcePreviewCard(type, r)).join('')}
            </div>
        </div>
    `;
}

/**
 * Build resource preview card (character or persona)
 * All items shown are missing from the library and pre-checked for import.
 * @param {string} type - 'character' or 'persona'
 * @param {Object} resource
 * @returns {string}
 */
function buildResourcePreviewCard(type, resource) {
    const statusIcon = '<i class="fa-solid fa-triangle-exclamation" style="color: var(--SmartThemeWarningColor);"></i> Not in library';

    const isCharacter = type === 'character';
    // Use pngDataUrl (data URL) for characters — metadata.avatar is only a filename, not a renderable URL
    const avatarUrl = isCharacter
        ? resource.pngDataUrl
        : resource.avatarDataUrl;
    const description = isCharacter
        ? (resource.metadata?.description || '')
        : (resource.description || '');

    return `
        <div class="${type}-preview-card">
            <label class="checkbox_label">
                <input type="checkbox" name="import_${type}" value="${escapeHtml(resource.name)}" checked />
                <div class="card-content">
                    ${avatarUrl
                        ? `<div class="card-avatar" style="background-image: url('${avatarUrl}');"></div>`
                        : `<div class="card-avatar"><i class="fa-solid fa-user"></i></div>`
                    }
                    <div class="card-info">
                        <div class="card-name">${escapeHtml(resource.name)}</div>
                        <div class="card-status">${statusIcon}</div>
                        <div class="card-description">${truncateText(escapeHtml(description), 100)}</div>
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
                <button class="menu_button" id="apply_conflicts_btn">Apply Selections</button>
            </div>
        </div>
    `;

    const gatherDecisions = () => {
        const decisions = {};
        conflicts.forEach((conflict, i) => {
            const selected = $(`input[name="conflict_${i}"]:checked`);
            decisions[conflict.name] = selected.length ? selected.val() : 'keep';
        });
        return decisions;
    };

    const popup = new Popup(html, POPUP_TYPE.TEXT, 'Resolve Conflicts', {
        okButton: false,
        cancelButton: 'Cancel',
        wide: true,
        large: true
    });

    return new Promise((resolve) => {
        $(document).off('.conflictResolution');

        // Keep/Replace buttons modify radio selections but don't close dialog
        $(document).on('click.conflictResolution', '#keep_all_btn', (e) => {
            e.stopPropagation();
            $('input[value="keep"]').prop('checked', true);
        });

        $(document).on('click.conflictResolution', '#replace_all_btn', (e) => {
            e.stopPropagation();
            $('input[value="replace"]').prop('checked', true);
        });

        $(document).on('click.conflictResolution', '#apply_conflicts_btn', () => {
            const decisions = gatherDecisions();
            $(document).off('.conflictResolution');
            popup.complete(POPUP_RESULT.OK);
            resolve(decisions);
        });

        popup.show().then((popupResult) => {
            $(document).off('.conflictResolution');
            if (popupResult === POPUP_RESULT.CANCELLED || popupResult === POPUP_RESULT.NEGATIVE) {
                const defaultDecisions = {};
                conflicts.forEach(c => defaultDecisions[c.name] = 'keep');
                resolve(defaultDecisions);
            }
        });
    });
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
 * Show import result summary via toastr notifications.
 * @param {Object} result - {imported: [], skipped: [], failed: []}
 */
export async function showImportResultDialog(result) {
    const t = window.toastr;
    if (!t) return;

    if (result.imported.length > 0) {
        t.success(`Added to library: ${result.imported.join(', ')}`);
    }
    if (result.skipped.length > 0) {
        t.info(`Skipped: ${result.skipped.join(', ')}`);
    }
    for (const item of result.failed) {
        t.error(`Failed to import ${item.name}: ${item.error}`);
    }
}
