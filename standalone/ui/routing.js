/**
 * Tab Navigation Module
 * Handles tab switching and content loading for the standalone editor
 */

import { renderDetailsTab, extractDetailsValues, validateDetailsTab } from '../editors/details-editor.js';
import { renderScenesTab } from '../editors/scenes-editor.js';
import { renderCharactersTab } from '../editors/characters-editor.js';
import { renderCoverTab } from '../editors/cover-editor.js';
import { getCurrentBlueprint } from '../handlers/blueprint-actions.js';

// ============================================================================
// STATE
// ============================================================================

let activeTab = 'details';
const tabContentCache = new Map();

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

    switch (tabId) {
        case 'details':
            loadDetailsTab(blueprint);
            break;
        case 'scenes':
            loadScenesTab(blueprint);
            break;
        case 'characters':
            loadCharactersTab(blueprint);
            break;
        case 'cover':
            loadCoverTab(blueprint);
            break;
    }
}

/**
 * Load the Details tab content
 * @param {Object} blueprint - Blueprint object
 */
function loadDetailsTab(blueprint) {
    const $tabPanel = $('#detailsTab .tab-content');
    $tabPanel.empty();

    // TODO: Fetch story types and author styles from backend
    const storyTypes = [];
    const authorStyles = [];

    const $content = renderDetailsTab(blueprint, {
        storyTypes,
        authorStyles,
        readonly: false,
    });

    $tabPanel.append($content);

    // Cache the content for quick switching
    tabContentCache.set('details', {
        type: 'details',
        content: $content,
    });

    // Emit tab loaded event
    $(document).trigger('tab:loaded', { tabId: 'details' });
}

/**
 * Load the Scenes tab content
 * @param {Object} blueprint - Blueprint object
 */
function loadScenesTab(blueprint) {
    const $tabPanel = $('#scenesTab .tab-content');
    $tabPanel.empty();

    const $content = renderScenesTab(blueprint, { readonly: false });
    $tabPanel.append($content);

    // Cache the content type (scenes tab is dynamic, so we don't cache the full content)
    tabContentCache.set('scenes', { type: 'scenes' });

    $(document).trigger('tab:loaded', { tabId: 'scenes' });
}

/**
 * Load the Character Arcs tab content
 * @param {Object} blueprint - Blueprint object
 */
function loadCharactersTab(blueprint) {
    const $tabPanel = $('#charactersTab .tab-content');
    $tabPanel.empty();

    const $content = renderCharactersTab(blueprint, { readonly: false });
    $tabPanel.append($content);

    tabContentCache.set('characters', { type: 'characters' });

    $(document).trigger('tab:loaded', { tabId: 'characters' });
}

/**
 * Load the Cover tab content
 * @param {Object} blueprint - Blueprint object
 */
function loadCoverTab(blueprint) {
    const $tabPanel = $('#coverTab .tab-content');
    $tabPanel.empty();

    const $content = renderCoverTab(blueprint, { readonly: false });
    $tabPanel.append($content);

    tabContentCache.set('cover', { type: 'cover' });

    $(document).trigger('tab:loaded', { tabId: 'cover' });
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
