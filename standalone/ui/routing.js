/**
 * Tab Navigation Module
 * Handles tab switching and content loading for the standalone editor
 */

import { renderDetailsTab, extractDetailsValues, validateDetailsTab } from '../editors/details-editor.js';
import { renderScenesTab } from '../editors/scenes-editor.js';
import { renderCharactersTab } from '../editors/characters-editor.js';
import { renderCoverTab } from '../editors/cover-editor.js';
import { renderLorebookTab } from '../editors/lorebook-editor.js';
import { getCurrentBlueprint } from '../handlers/blueprint-actions.js';
import { sanitizeFilename } from '../../lib/blueprint/utils.js';

// ============================================================================
// STATE
// ============================================================================

let activeTab = 'details';
const tabContentCache = new Map();

// ============================================================================
// TAB CONFIG
// ============================================================================

/**
 * Tab renderer configuration
 * Maps tab IDs to their render functions and options
 */
const TAB_RENDERERS = {
    details: {
        render: renderDetailsTab,
        options: () => ({
            storyTypes: [],
            authorStyles: [],
            readonly: false,
        }),
        cacheFullContent: true,
    },
    scenes: {
        render: renderScenesTab,
        options: () => ({ readonly: false }),
        cacheFullContent: false,
    },
    characters: {
        render: renderCharactersTab,
        options: () => ({ readonly: false }),
        cacheFullContent: false,
    },
    lorebook: {
        render: renderLorebookTab,
        options: () => ({ readonly: false }),
        cacheFullContent: false,
    },
    cover: {
        render: renderCoverTab,
        options: () => ({ readonly: false }),
        cacheFullContent: false,
    },
};

// ============================================================================
// TAB NAVIGATION
// ============================================================================

/**
 * Initialize tab navigation event handlers
 */
export function initTabNavigation() {
    $(document).on('click', '[data-tab]', handleTabClick);

    // Invalidate cache when blueprint changes so tabs re-render fresh data
    $(document).on('blueprint:updated.routing', () => {
        tabContentCache.clear();
    });
}

/**
 * Handle tab click
 * @param {Event} e - Click event
 */
function handleTabClick(e) {
    e.preventDefault();
    const tabId = $(e.currentTarget).data('tab');
    switchTab(tabId);
}

/**
 * Switch to a specific tab
 * @param {string} tabId - Tab identifier
 */
export function switchTab(tabId) {
    activeTab = tabId;

    // Update sidebar links
    $('.sidebar-link[data-tab]').removeClass('active');
    $(`.sidebar-link[data-tab="${tabId}"]`).addClass('active');

    // Update tab panels (scoped to main content to avoid clobbering settings modal tabs)
    $('#mainContent > .tab-panel').removeClass('active');
    $(`#${tabId}Tab`).addClass('active');

    // Emit custom event for other modules
    $(document).trigger('tab:changed', { tabId });
}

/**
 * Get the currently active tab
 * @returns {string} Active tab ID
 */
export function getActiveTab() {
    return activeTab;
}

/**
 * Generic tab loader using configuration
 * @param {string} tabId - Tab identifier
 * @param {Object} blueprint - Blueprint object
 */
function loadTabGeneric(tabId, blueprint) {
    const config = TAB_RENDERERS[tabId];
    if (!config) return;

    const $tabPanel = $(`#${tabId}Tab .tab-content`);
    $tabPanel.empty();

    const options = typeof config.options === 'function' ? config.options() : config.options;
    const $content = config.render(blueprint, options);
    $tabPanel.append($content);

    // Cache based on configuration
    if (config.cacheFullContent) {
        tabContentCache.set(tabId, { type: tabId, content: $content });
    } else {
        tabContentCache.set(tabId, { type: tabId });
    }

    // Emit tab loaded event
    $(document).trigger('tab:loaded', { tabId });
}

/**
 * Load content for a specific tab
 * @param {string} tabId - Tab identifier
 */
export function loadTabContent(tabId) {
    console.log(`[Routing] Loading content for tab: ${tabId}`);

    // Return cached content if available
    if (tabContentCache.has(tabId)) {
        const cached = tabContentCache.get(tabId);
        renderCachedContent(tabId, cached);
        return;
    }

    const blueprint = getCurrentBlueprint();
    if (!blueprint) {
        showEmptyTabState(tabId);
        return;
    }

    // Use generic loader if configured, otherwise fall back to specific handler
    if (TAB_RENDERERS[tabId]) {
        loadTabGeneric(tabId, blueprint);
    } else {
        // Special handling for lorebook tab (has custom event binding)
        if (tabId === 'lorebook') {
            loadLorebookTab(blueprint);
        }
    }
}

/**
 * Load the Details tab content
 * @param {Object} blueprint - Blueprint object
 * @deprecated Use loadTabGeneric instead
 */
function loadDetailsTab(blueprint) {
    loadTabGeneric('details', blueprint);
}

/**
 * Load the Scenes tab content
 * @param {Object} blueprint - Blueprint object
 * @deprecated Use loadTabGeneric instead
 */
function loadScenesTab(blueprint) {
    loadTabGeneric('scenes', blueprint);
}

/**
 * Load the Character Arcs tab content
 * @param {Object} blueprint - Blueprint object
 * @deprecated Use loadTabGeneric instead
 */
function loadCharactersTab(blueprint) {
    loadTabGeneric('characters', blueprint);
}

/**
 * Load the Cover tab content
 * @param {Object} blueprint - Blueprint object
 * @deprecated Use loadTabGeneric instead
 */
function loadCoverTab(blueprint) {
    loadTabGeneric('cover', blueprint);
}

/**
 * Load the Lorebook tab content
 * @param {Object} blueprint - Blueprint object
 */
function loadLorebookTab(blueprint) {
    const $tabPanel = $('#lorebookTab .tab-content');
    $tabPanel.empty();

    const $content = renderLorebookTab(blueprint, { readonly: false });
    $tabPanel.append($content);

    tabContentCache.set('lorebook', { type: 'lorebook' });

    // Bind events for lorebook actions
    $content.on('lorebook:export', () => {
        exportLorebookAsJSON(blueprint.embedded_lorebook);
    });

    $content.on('lorebook:removed', () => {
        if (blueprint.embedded_lorebook) {
            delete blueprint.embedded_lorebook;
            loadLorebookTab(blueprint); // Refresh
            // Trigger save...
        }
    });

    $(document).trigger('tab:loaded', { tabId: 'lorebook' });
}

/**
 * Export lorebook as JSON file
 * @param {Object} lorebook - Embedded lorebook object
 */
function exportLorebookAsJSON(lorebook) {
    if (!lorebook) return;

    const json = JSON.stringify(lorebook, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // Use sanitizeFilename for secure filename generation
    a.download = `${sanitizeFilename(lorebook.name)}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * Show a placeholder tab for unimplemented features
 * @param {string} tabId - Tab identifier
 * @param {string} title - Tab title
 * @param {string} subtitle - Subtitle text
 */
function showPlaceholderTab(tabId, title, subtitle) {
    const $tabPanel = $(`#${tabId}Tab .tab-content`);
    // Use safe DOM creation instead of template literal to prevent XSS
    const $content = $('<div>').addClass('empty-state large');
    $content.append($('<i>').addClass('fa-solid fa-hammer'));
    $content.append($('<h3>').text(title));
    $content.append($('<p>').text(subtitle));
    $tabPanel.empty().append($content);
}

/**
 * Show empty state for when no blueprint is loaded
 * @param {string} tabId - Tab identifier
 */
function showEmptyTabState(tabId) {
    const $tabPanel = $(`#${tabId}Tab .tab-content`);
    // Use safe DOM creation instead of template literal
    const $content = $('<div>').addClass('empty-state large');
    $content.append($('<i>').addClass('fa-solid fa-file-circle-question'));
    $content.append($('<h3>').text('No Blueprint Loaded'));
    $content.append($('<p>').text('Create a new blueprint or import an existing one to get started.'));
    const $btnGroup = $('<div>').addClass('button-group');
    $btnGroup.append($('<button>').addClass('btn btn-primary').attr('data-action', 'new-blueprint').text('New Blueprint'));
    $btnGroup.append($('<button>').addClass('btn btn-secondary').attr('data-action', 'import').text('Import'));
    $content.append($btnGroup);
    $tabPanel.empty().append($content);

    // Bind action buttons
    $tabPanel.find('[data-action="new-blueprint"]').on('click', () => {
        $(document).trigger('blueprint:new');
    });
    $tabPanel.find('[data-action="import"]').on('click', () => {
        $(document).trigger('blueprint:import');
    });
}

/**
 * Render cached content to a tab
 * @param {string} tabId - Tab identifier
 * @param {Object} cached - Cached content object
 */
function renderCachedContent(tabId, cached) {
    const $tabPanel = $(`#${tabId}Tab .tab-content`);

    if (cached.type === 'details' && cached.content) {
        $tabPanel.empty().append(cached.content.clone(true));
    }
}
