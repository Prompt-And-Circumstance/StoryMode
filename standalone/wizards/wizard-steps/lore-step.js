/**
 * Lore Step Module for Blueprint Wizard
 * Handles lorebook selection UI and state management
 */

import { escapeHtml } from '../../../lib/blueprint/utils.js';
import {
    getLorebookList,
    getLorebook,
    flattenLorebookEntries,
    buildEmbeddedLorebook
} from '../../adapters/lorebook-adapter.js';

// ============================================================================
// UI HELPERS
// ============================================================================

/**
 * Initialize wizard lore data fields if not present
 * @param {Object} wizardData - Wizard data object (modified in place)
 */
function initializeLoreData(wizardData) {
    wizardData.selected_lore_entries ??= [];
    wizardData.embed_lorebook ??= true;
    wizardData.linked_lorebooks ??= [];
}

/**
 * Toggle visibility of multiple elements
 * @param {jQuery} $container - Container element
 * @param {Object} toggles - Map of selector to visibility boolean
 */
function toggleVisibility($container, toggles) {
    Object.entries(toggles).forEach(([selector, visible]) => {
        $container.find(selector).toggle(visible);
    });
}

/**
 * Render entry preview content
 * @param {jQuery} $container - Container element
 * @param {Object} entryData - Entry data object
 */
function renderEntryPreview($container, entryData) {
    $container.find('.lore-preview-content').html(`
        <h5>${escapeHtml(entryData.displayName)}</h5>
        <p><strong>Keywords:</strong> ${escapeHtml(entryData.keywords)}</p>
        <p><strong>Content:</strong></p>
        <pre>${escapeHtml(entryData.entry.content)}</pre>
    `);
}

/**
 * Get entry key from world and uid
 * @param {string} world - Lorebook name
 * @param {number} uid - Entry UID
 * @returns {string} Entry key
 */
function getEntryKey(world, uid) {
    return `${world}:${uid}`;
}

// ============================================================================
// STEP RENDERING
// ============================================================================

/**
 * Render the lore selection step
 * @param {jQuery} $container - Container element
 * @param {Object} wizardData - Current wizard data object (passed by reference)
 * @returns {Promise<void>}
 */
export async function renderLoreStep($container, wizardData) {
    initializeLoreData(wizardData);

    $container.append(`
        <h3>World Lore (Optional)</h3>
        <p class="text-muted">
            Select worldinfo entries to inform the blueprint generation.
            These provide context about your world, characters, and established lore.
        </p>

        <!-- Connection status banner -->
        <div class="lore-connection-status alert alert-warning" style="display:none;">
            <i class="fa-solid fa-circle-exclamation"></i>
            Not connected to SillyTavern. Connect to access your lorebooks.
        </div>

        <!-- Lorebook selection -->
        <div class="form-group">
            <label>Available Lorebooks</label>
            <select class="form-control lore-world-select" multiple size="5">
                <!-- Populated dynamically -->
            </select>
            <small class="form-text text-muted">
                Select one or more lorebooks to browse entries
            </small>
        </div>

        <!-- Loading indicator -->
        <div class="lore-loading" style="display:none;">
            <i class="fa-solid fa-circle-notch fa-spin"></i> Loading lorebook entries...
        </div>

        <!-- Entry browser -->
        <div class="lore-entry-browser" style="display:none;">
            <div class="lore-entry-filters">
                <input type="text" class="form-control lore-search"
                       placeholder="Search entries by name or keywords...">
                <label class="checkbox-label">
                    <input type="checkbox" class="lore-show-disabled">
                    Show disabled entries
                </label>
            </div>

            <div class="lore-entry-list">
                <!-- Dynamic list of entries with checkboxes -->
            </div>

            <div class="lore-entry-preview">
                <h4>Entry Preview</h4>
                <div class="lore-preview-content">
                    <em>Click an entry to preview</em>
                </div>
            </div>
        </div>

        <!-- Selected entries summary -->
        <div class="form-group">
            <label>Selected Entries (<span class="lore-count">0</span>)</label>
            <div class="lore-selected-list">
                <!-- Chips showing selected entries -->
            </div>
        </div>

        <!-- Embedding options -->
        <div class="form-group">
            <label class="checkbox-label">
                <input type="checkbox" class="lore-embed" ${wizardData.embed_lorebook ? 'checked' : ''}>
                Embed selected entries into blueprint
            </label>
            <small class="form-text text-muted">
                Embedded lorebooks make blueprints portable and self-contained.
                Uncheck to link to your ST lorebooks instead (requires connection).
            </small>
        </div>

        <!-- User guidance callout -->
        <div class="callout callout-info">
            <strong>Note:</strong> Lore selected here informs the <em>generation</em> of
            the blueprint structure. For <em>runtime lore injection</em> during story play,
            use SillyTavern's World Info / Lorebooks feature.
        </div>
    `);

    // Load lorebooks and bind events
    await loadLorebooksIntoUI($container, wizardData);
    bindLoreStepEvents($container, wizardData);
}

/**
 * Load available lorebooks and populate dropdown
 * @param {jQuery} $container
 * @param {Object} wizardData
 */
async function loadLorebooksIntoUI($container, wizardData) {
    const lorebooks = await getLorebookList();

    if (lorebooks.length === 0) {
        $container.find('.lore-connection-status').show();
        return;
    }

    // Populate lorebook dropdown
    const $select = $container.find('.lore-world-select');
    $select.empty();
    lorebooks.forEach(lb => {
        $select.append(`<option value="${escapeHtml(lb.name)}">${escapeHtml(lb.name)}</option>`);
    });
}

/**
 * Bind event handlers for lore step UI
 * @param {jQuery} $container
 * @param {Object} wizardData - Wizard data object (modified in place)
 */
function bindLoreStepEvents($container, wizardData) {
    // Load entries when lorebooks are selected
    $container.on('change', '.lore-world-select', async function() {
        const selectedWorlds = $(this).val() || [];

        if (selectedWorlds.length === 0) {
            toggleVisibility($container, {
                '.lore-entry-browser': false,
            });
            return;
        }

        // Show loading, hide browser
        toggleVisibility($container, {
            '.lore-loading': true,
            '.lore-entry-browser': false,
        });

        // Load all selected lorebooks
        const lorebooks = await Promise.all(
            selectedWorlds.map(async name => ({
                name,
                data: await getLorebook(name),
            }))
        );

        // Hide loading, show browser
        toggleVisibility($container, {
            '.lore-loading': false,
            '.lore-entry-browser': true,
        });

        // Flatten and display entries
        const entries = flattenLorebookEntries(lorebooks);
        renderEntryBrowser($container, entries, wizardData);
    });

    // Entry selection
    $container.on('change', '.lore-entry-checkbox', function() {
        updateSelectedEntriesList($container, wizardData);
    });

    // Search filter
    $container.on('input', '.lore-search', function() {
        const query = $(this).val().toLowerCase();
        $container.find('.lore-entry-item').each(function() {
            const $item = $(this);
            const text = $item.text().toLowerCase();
            $item.toggle(text.includes(query));
        });
    });

    // Show disabled toggle
    $container.on('change', '.lore-show-disabled', function() {
        const showDisabled = $(this).is(':checked');
        $container.find('.lore-entry-item.disabled-entry').toggle(showDisabled);
    });

    // Preview on click
    $container.on('click', '.lore-entry-item', function() {
        const entryData = $(this).data('entry');
        if (!entryData) return;
        renderEntryPreview($container, entryData);
    });

    // Remove selected entry chip
    $container.on('click', '.lore-chip-remove', function() {
        const world = $(this).data('world');
        const uid = $(this).data('uid');
        const entryKey = getEntryKey(world, uid);

        // Uncheck the corresponding checkbox
        $container.find(`.lore-entry-checkbox[value="${entryKey}"]`).prop('checked', false);
        updateSelectedEntriesList($container, wizardData);
    });

    // Embed checkbox
    $container.on('change', '.lore-embed', function() {
        wizardData.embed_lorebook = $(this).is(':checked');
    });
}

/**
 * Render entry browser with checkboxes
 * @param {jQuery} $container
 * @param {Array} entries - Flattened entry list
 * @param {Object} wizardData
 */
function renderEntryBrowser($container, entries, wizardData) {
    const $list = $container.find('.lore-entry-list');
    $list.empty();

    // Restore previously selected entries
    const selectedKeys = new Set(
        wizardData.selected_lore_entries.map(e => getEntryKey(e.world, e.uid))
    );

    entries.forEach(entry => {
        const entryKey = getEntryKey(entry.world, entry.uid);
        const isSelected = selectedKeys.has(entryKey);

        const $item = $(`
            <div class="lore-entry-item ${entry.isDisabled ? 'disabled-entry' : ''}"
                 data-world="${escapeHtml(entry.world)}"
                 data-uid="${entry.uid}"
                 style="${entry.isDisabled ? 'display:none;' : ''}">
                <label>
                    <input type="checkbox" class="lore-entry-checkbox"
                           value="${entryKey}"
                           ${isSelected ? 'checked' : ''}>
                    <span class="lore-entry-name">${escapeHtml(entry.displayName)}</span>
                    <span class="lore-entry-keywords text-muted">${escapeHtml(entry.keywords)}</span>
                </label>
            </div>
        `);
        $item.data('entry', entry);
        $list.append($item);
    });
}

/**
 * Update selected entries list (chips) and wizard data
 * @param {jQuery} $container
 * @param {Object} wizardData - Modified in place
 */
function updateSelectedEntriesList($container, wizardData) {
    const selected = [];
    $container.find('.lore-entry-checkbox:checked').each(function() {
        const $item = $(this).closest('.lore-entry-item');
        const entryData = $item.data('entry');
        if (entryData) {
            selected.push(entryData);
        }
    });

    // Update wizard data
    wizardData.selected_lore_entries = selected;

    // Update count
    $container.find('.lore-count').text(selected.length);

    // Render chips
    const $chipList = $container.find('.lore-selected-list');
    $chipList.empty();
    selected.forEach(entry => {
        const entryKey = getEntryKey(entry.world, entry.uid);
        $chipList.append(`
            <span class="chip">
                [${escapeHtml(entry.world)}] ${escapeHtml(entry.displayName)}
                <i class="fa-solid fa-xmark lore-chip-remove"
                   data-world="${escapeHtml(entry.world)}"
                   data-uid="${entry.uid}"></i>
            </span>
        `);
    });
}

/**
 * Extract final lore data for generation request
 * @param {Object} wizardData
 * @returns {Object} { embedded_lorebook, linked_lorebooks }
 */
export function extractLoreData(wizardData) {
    const selectedEntries = wizardData.selected_lore_entries || [];
    const embedLorebook = wizardData.embed_lorebook !== false; // Default true

    let embedded_lorebook = null;
    let linked_lorebooks = [];

    if (selectedEntries.length > 0) {
        if (embedLorebook) {
            embedded_lorebook = buildEmbeddedLorebook(selectedEntries);
        } else {
            linked_lorebooks = [...new Set(selectedEntries.map(e => e.world))];
        }
    }

    return { embedded_lorebook, linked_lorebooks };
}
