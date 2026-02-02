/**
 * Lorebook Editor Module
 * Displays and manages embedded lorebook in blueprint
 */

import { escapeHtml } from '../../lib/blueprint/utils.js';

// ============================================================================
// RENDER HELPERS
// ============================================================================

/**
 * Render empty state for lorebook tab
 * @returns {jQuery} Empty state element
 */
function renderEmptyState() {
    return $(`
        <div class="empty-state">
            <i class="fa-solid fa-globe fa-3x text-muted"></i>
            <p>No lorebook data attached to this blueprint.</p>
            <p class="text-muted">
                Lorebooks can be added during blueprint generation in the wizard.
            </p>
        </div>
    `);
}

/**
 * Render a metadata paragraph if value exists
 * @param {string} label - Field label
 * @param {*} value - Field value
 * @returns {string} HTML string or empty string
 */
function renderMetadataField(label, value) {
    if (!value) return '';
    return `<p><strong>${label}:</strong> ${escapeHtml(String(value))}</p>`;
}

/**
 * Render lorebook action buttons
 * @returns {string} HTML string
 */
function renderActionButtons() {
    return `
        <div class="lorebook-actions">
            <button class="btn btn-sm btn-secondary" id="lorebook-export">
                <i class="fa-solid fa-download"></i> Export as JSON
            </button>
            <button class="btn btn-sm btn-danger" id="lorebook-remove">
                <i class="fa-solid fa-trash"></i> Remove Lorebook
            </button>
        </div>
    `;
}

// ============================================================================
// MAIN RENDERER
// ============================================================================

/**
 * Render the Lorebook tab content
 * @param {Object} blueprint - Blueprint object
 * @param {Object} options - Options
 * @returns {jQuery} Lorebook tab content
 */
export function renderLorebookTab(blueprint, options = {}) {
    const { readonly = false } = options;
    const lorebook = blueprint.embedded_lorebook;
    const linkedLorebooks = blueprint.linked_lorebooks || [];

    const $content = $('<div>').addClass('lorebook-editor');

    if (!lorebook && linkedLorebooks.length === 0) {
        $content.append(renderEmptyState());
        return $content;
    }

    // Embedded lorebook section
    if (lorebook) {
        $content.append(renderEmbeddedLorebookSection(lorebook, readonly));
    }

    // Linked lorebooks section
    if (linkedLorebooks.length > 0) {
        $content.append(renderLinkedLorebooks(linkedLorebooks, readonly));
    }

    // Bind events (if not readonly)
    if (!readonly) {
        bindLorebookEvents($content);
    }

    return $content;
}

function renderEmbeddedLorebookSection(lorebook, readonly) {
    const entries = lorebook.entries || [];
    const activeEntries = entries.filter(e => !e.disable);

    const metadataHtml = [
        renderMetadataField('Name', lorebook.name),
        renderMetadataField('Source', lorebook.metadata?.source_worlds?.join(', ')),
        renderMetadataField(
            'Selected',
            lorebook.metadata?.generation_timestamp
                ? new Date(lorebook.metadata.generation_timestamp).toLocaleString()
                : null
        ),
    ].filter(Boolean).join('\n            ');

    return $(`
        <div class="lorebook-section">
            <h3>
                <i class="fa-solid fa-book"></i> Embedded Lorebook
                <span class="badge">${activeEntries.length}/${entries.length} active</span>
            </h3>

            <div class="lorebook-metadata">
                ${metadataHtml}
            </div>

            <div class="lorebook-entries">
                ${entries.map(entry => renderLorebookEntry(entry, readonly)).join('')}
            </div>

            ${!readonly ? renderActionButtons() : ''}
        </div>
    `);
}

function renderLorebookEntry(entry, readonly) {
    return `
        <div class="lorebook-entry ${entry.disable ? 'disabled' : ''}" data-uid="${entry.uid}">
            <div class="entry-header">
                <h4>
                    ${escapeHtml(entry.comment || `Entry ${entry.uid}`)}
                </h4>
                <span class="entry-keywords">${escapeHtml(entry.key.join(', '))}</span>
            </div>
            <div class="entry-content">
                <pre>${escapeHtml(entry.content)}</pre>
            </div>
        </div>
    `;
}

function renderLinkedLorebooks(linkedLorebooks, readonly) {
    return $(`
        <div class="lorebook-section">
            <h3>
                <i class="fa-solid fa-link"></i> Linked Lorebooks
            </h3>
            <div class="callout callout-info">
                This blueprint references external lorebooks. These are not embedded,
                so you must have access to the original ST lorebooks.
            </div>
            <ul class="linked-lorebook-list">
                ${linkedLorebooks.map(name => `
                    <li>
                        <i class="fa-solid fa-book"></i> ${escapeHtml(name)}
                    </li>
                `).join('')}
            </ul>
        </div>
    `);
}

function bindLorebookEvents($content) {
    // Export lorebook
    $content.on('click', '#lorebook-export', function() {
        $content.trigger('lorebook:export');
    });

    // Remove lorebook
    $content.on('click', '#lorebook-remove', function() {
        if (confirm('Remove embedded lorebook from this blueprint?')) {
            $content.trigger('lorebook:removed');
        }
    });
}

/**
 * Extract lorebook data from tab (read-only in v1)
 * @param {jQuery} $content - Lorebook tab content
 * @returns {Object} { embedded_lorebook, linked_lorebooks }
 */
export function extractLorebookValues($content) {
    // Lorebook data is read-only in editor for now
    // Just return what's already in the blueprint
    return {
        embedded_lorebook: null,  // Handled by parent editor
        linked_lorebooks: [],     // Handled by parent editor
    };
}
