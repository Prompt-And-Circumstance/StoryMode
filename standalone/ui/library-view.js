/**
 * Library View for Standalone Editor
 * Displays blueprint library grid with search, filtering, and selection
 */

import { showError, showSuccess, showInfo } from '../adapters/notification-adapter.js';
import {
    getAllBlueprints,
    getBlueprintById,
    deleteBlueprint,
    setFavorite as setFavoriteInStorage,
} from '../adapters/library-storage-adapter.js';

// ============================================================================
// STATE
// ============================================================================

let libraryData = [];
let filteredData = [];
let currentFilter = 'all';
let searchQuery = '';
let currentViewSize = 'medium'; // small, medium, large

// ============================================================================
// API INTEGRATION
// ============================================================================

/**
 * Fetch all blueprints from the library
 * @returns {Promise<Array>} Array of blueprint manifest entries
 */
async function fetchLibrary() {
    return await getAllBlueprints();
}

/**
 * Load a specific blueprint by ID
 * @param {string} blueprintId - Blueprint ID
 * @returns {Promise<Object>} Blueprint object
 */
async function loadBlueprintById(blueprintId) {
    return await getBlueprintById(blueprintId);
}

// ============================================================================
// RENDERING
// ============================================================================

/**
 * Render the library view HTML
 * @returns {string} HTML content
 */
export function renderLibraryView() {
    return `
        <div class="library-view">
            <div class="library-header">
                <div class="library-search">
                    <i class="fa-solid fa-search"></i>
                    <input type="text" id="librarySearch" placeholder="Search blueprints..." class="form-control">
                </div>
                <div class="library-view-controls" style="margin-left: 10px; margin-right: 10px;">
                    <button class="btn view-size-btn ${currentViewSize === 'small' ? 'active' : ''}" data-size="small" title="Small View">
                        <i class="fa-solid fa-th"></i>
                    </button>
                    <button class="btn view-size-btn ${currentViewSize === 'medium' ? 'active' : ''}" data-size="medium" title="Medium View">
                        <i class="fa-solid fa-th-large"></i>
                    </button>
                    <button class="btn view-size-btn ${currentViewSize === 'large' ? 'active' : ''}" data-size="large" title="Large View">
                        <i class="fa-solid fa-square"></i>
                    </button>
                </div>
                <div class="library-actions">
                    <button id="libraryRefresh" class="btn" title="Refresh library">
                        <i class="fa-solid fa-refresh"></i>
                    </button>
                    <button id="libraryNewBlueprint" class="btn btn-primary" title="Create new blueprint">
                        <i class="fa-solid fa-plus"></i> New
                    </button>
                    <button id="libraryImport" class="btn" title="Import blueprint">
                        <i class="fa-solid fa-file-import"></i> Import
                    </button>
                </div>
            </div>

            <div class="library-content">
                <aside class="library-sidebar">
                    <div class="library-filters">
                        <div class="filter-item active" data-filter="all">
                            <i class="fa-solid fa-folder"></i>
                            <span>All Blueprints</span>
                            <span class="filter-count" id="filterCountAll">0</span>
                        </div>
                        <div class="filter-item" data-filter="favorites">
                            <i class="fa-solid fa-star"></i>
                            <span>Favorites</span>
                            <span class="filter-count" id="filterCountFavorites">0</span>
                        </div>
                        <div class="filter-item" data-filter="recent">
                            <i class="fa-solid fa-clock"></i>
                            <span>Recently Used</span>
                            <span class="filter-count" id="filterCountRecent">0</span>
                        </div>
                    </div>
                </aside>

                <main class="library-main">
                    <div id="libraryGrid" class="library-grid">
                        <!-- Blueprint cards will be rendered here -->
                    </div>

                    <div id="libraryEmpty" class="library-empty" style="display: none;">
                        <i class="fa-solid fa-folder-open"></i>
                        <h2>No Blueprints Found</h2>
                        <p>Create a new blueprint or import one to get started.</p>
                        <div style="display: flex; gap: 1rem; justify-content: center; margin-top: 1rem;">
                            <button id="emptyNewBlueprint" class="btn btn-primary">
                                <i class="fa-solid fa-plus"></i> New Blueprint
                            </button>
                            <button id="emptyImport" class="btn">
                                <i class="fa-solid fa-file-import"></i> Import
                            </button>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    `;
}

// ============================================================================
// UTILITIES (imported from lib/blueprint/utils.js)
// ============================================================================

import {
    isValidUUID,
    blueprintFilename,
    isValidImageUrl,
    getBlueprintCoverUrl as getUtilsCoverUrl
} from '../../lib/blueprint/utils.js';

/**
 * Extract cover image URL from a blueprint object (standalone-specific wrapper)
 * Ensures root-relative paths for standalone editor
 * @param {Object} blueprint - Blueprint object
 * @returns {string|null} Cover URL or null if not found
 */
function getBlueprintCoverUrl(blueprint) {
    const url = getUtilsCoverUrl(blueprint);

    // Ensure root-relative path for standalone editor
    if (url && url.startsWith('user/files/')) {
        return '/' + url;
    }

    return url;
}

/**
 * Render a single blueprint card
 * @param {Object} blueprint - Blueprint manifest entry
 * @param {Object} stats - Play statistics for this blueprint
 * @returns {string} HTML for blueprint card
 */
function renderBlueprintCard(blueprint, stats = {}) {
    const title = blueprint.title || blueprint.userMetadata?.title || blueprint.core_premise?.substring(0, 40) || 'Untitled Blueprint';
    const storyType = blueprint.story_type_name || 'Unknown';
    const sceneCount = blueprint.scene_plan?.length || 0;
    const isFavorite = blueprint.favorite || blueprint.userMetadata?.favorite || false;
    const timesPlayed = stats.timesPlayed || 0;

    const coverUrl = getBlueprintCoverUrl(blueprint);
    const safeCoverUrl = isValidImageUrl(coverUrl) ? coverUrl : null;

    // Use the cover image as background, if available.
    // NOTE: We rely on the CSS class .storymode-card-cover for the default gradient.
    const backgroundStyle = safeCoverUrl
        ? `background-image: url('${escapeHtml(encodeURI(safeCoverUrl))}'); background-size: cover;`
        : '';

    return `
        <div class="storymode-blueprint-card" data-blueprint-id="${escapeHtml(blueprint.blueprint_id)}">
            <div class="storymode-card-cover" style="${backgroundStyle}">
                ${!safeCoverUrl ? `<i class="fa-solid fa-scroll"></i>` : ''}
                <button class="storymode-card-favorite ${isFavorite ? 'active' : ''}" data-action="favorite" title="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}">
                    <i class="fa-solid fa-star"></i>
                </button>
                <div class="storymode-card-overlay">
                    <h4 class="storymode-card-title">${escapeHtml(title)}</h4>
                </div>
            </div>
            <div class="storymode-card-body">
                <div class="storymode-card-meta">
                    <span><i class="fa-solid fa-theater-masks"></i> ${escapeHtml(storyType)}</span>
                    <span><i class="fa-solid fa-film"></i> ${sceneCount} scenes</span>
                </div>
                ${timesPlayed > 0 ? `<div class="storymode-card-plays"><i class="fa-solid fa-play"></i> Played ${timesPlayed}x</div>` : ''}
            </div>
            <div class="storymode-card-actions">
                <button class="menu_button storymode-btn-icon" data-action="edit" title="Edit scenario blueprint">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="menu_button storymode-btn-icon" data-action="export" title="Export as PNG">
                    <i class="fa-solid fa-download"></i>
                </button>
                <button class="menu_button storymode-btn-icon storymode-btn-danger" data-action="delete" title="Delete scenario blueprint">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        </div>
    `;
}

/**
 * Escape HTML to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ============================================================================
// FILTERING & SEARCH
// ============================================================================

/**
 * Apply current filters and search to library data
 */
function applyFiltersAndSearch() {
    let data = [...libraryData];

    // Apply filter
    if (currentFilter === 'favorites') {
        data = data.filter(b => b.favorite);
    } else if (currentFilter === 'recent') {
        data = data.sort((a, b) => {
            const dateA = new Date(b.lastAccessedAt || b.created_at || 0);
            const dateB = new Date(a.lastAccessedAt || a.created_at || 0);
            return dateB - dateA;
        }).slice(0, 20);
    }

    // Apply search
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        data = data.filter(b => {
            const title = (b.title || b.blueprint_title || '').toLowerCase();
            const storyType = (b.story_type_name || '').toLowerCase();
            return title.includes(query) || storyType.includes(query);
        });
    }

    filteredData = data;
    renderGrid();
}

/**
 * Render the blueprint grid
 */
function renderGrid() {
    const grid = $('#libraryGrid');
    const empty = $('#libraryEmpty');

    // Update grid size class
    grid.removeClass('size-small size-medium size-large').addClass(`size-${currentViewSize}`);

    if (filteredData.length === 0) {
        grid.hide();
        empty.show();

        const hasActiveFilter = searchQuery || currentFilter !== 'all';
        $('#libraryEmptyText').text(hasActiveFilter
            ? 'No blueprints match your search or filter.'
            : 'Your library is empty. Import or create a blueprint to get started.');
        $('#emptyNewBlueprint, #emptyImport').toggle(!hasActiveFilter);
        return;
    }

    empty.hide();
    grid.show();

    const cards = filteredData.map(bp => renderBlueprintCard(bp)).join('');
    grid.html(cards);

    // Update counts
    $('#filterCountAll').text(libraryData.length);
    $('#filterCountFavorites').text(libraryData.filter(b => b.favorite).length);
    $('#filterCountRecent').text(Math.min(20, libraryData.length));
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Initialize library view event handlers
 */
export function initLibraryHandlers() {
    // Search
    $(document).on('input', '#librarySearch', function () {
        searchQuery = $(this).val();
        applyFiltersAndSearch();
    });

    // View Size
    $(document).on('click', '.view-size-btn', function () {
        $('.view-size-btn').removeClass('active');
        $(this).addClass('active');
        currentViewSize = $(this).data('size');
        renderGrid();
    });

    // Filter selection
    $(document).on('click', '.filter-item', function () {
        $('.filter-item').removeClass('active');
        $(this).addClass('active');
        currentFilter = $(this).data('filter');
        applyFiltersAndSearch();
    });

    // Refresh library
    $(document).on('click', '#libraryRefresh', async function () {
        await refreshLibrary();
    });

    // Load blueprint
    $(document).on('click', '.blueprint-card-load', async function (e) {
        e.stopPropagation();
        const card = $(this).closest('.storymode-blueprint-card');
        const blueprintId = card.data('blueprint-id');
        await handleLoadBlueprint(blueprintId);
    });

    // Card click (same as load button)
    $(document).on('click', '.storymode-blueprint-card', async function (e) {
        if ($(e.target).closest('.storymode-card-actions').length) return;
        if ($(e.target).closest('.storymode-card-favorite').length) return;
        const blueprintId = $(this).data('blueprint-id');
        await handleLoadBlueprint(blueprintId);
    });

    // Toggle favorite
    $(document).on('click', '.storymode-card-favorite', async function (e) {
        e.stopPropagation();
        const card = $(this).closest('.storymode-blueprint-card');
        const blueprintId = card.data('blueprint-id');
        await handleToggleFavorite(blueprintId);
    });

    // New blueprint (from library header)
    $(document).on('click', '#libraryNewBlueprint, #emptyNewBlueprint', function () {
        $(document).trigger('library:new-blueprint');
    });

    // Import (from library header)
    $(document).on('click', '#libraryImport, #emptyImport', function () {
        $(document).trigger('library:import');
    });

    // Edit Blueprint
    $(document).on('click', '[data-action="edit"]', async function (e) {
        e.stopPropagation();
        const card = $(this).closest('.storymode-blueprint-card');
        const blueprintId = card.data('blueprint-id');
        await handleLoadBlueprint(blueprintId);
    });

    // Delete Blueprint
    $(document).on('click', '[data-action="delete"]', async function (e) {
        e.stopPropagation();
        if (!confirm('Are you sure you want to delete this blueprint?')) return;

        const card = $(this).closest('.storymode-blueprint-card');
        const blueprintId = card.data('blueprint-id');

        try {
            await deleteBlueprint(blueprintId);
            await refreshLibrary();
            showSuccess('Blueprint deleted');
        } catch (err) {
            showError('Failed to delete blueprint: ' + err.message);
        }
    });

    // Export Blueprint (Trigger generic event for now)
    $(document).on('click', '[data-action="export"]', async function (e) {
        e.stopPropagation();
        const card = $(this).closest('.storymode-blueprint-card');
        const blueprintId = card.data('blueprint-id');
        // We can implement export logic here or trigger an event
        // For now, let's look for an export function in adapters
        try {
            // Check if exportToPNG exists in adapter, otherwise just log
            // TODO: Implement export
            showInfo('Export feature coming soon');
        } catch (err) {
            console.error(err);
        }
    });

}

/**
 * Handle loading a blueprint
 * @param {string} blueprintId - Blueprint ID
 */
async function handleLoadBlueprint(blueprintId) {
    try {
        const blueprint = await loadBlueprintById(blueprintId);

        if (!blueprint) {
            throw new Error('Blueprint could not be loaded. It may be corrupt or in an unsupported format (binary PNG).');
        }

        $(document).trigger('library:blueprint-selected', { blueprint });
        showSuccess('Blueprint loaded');
    } catch (error) {
        showError(`Failed to load blueprint: ${error.message}`);
    }
}

/**
 * Handle toggling favorite status
 * @param {string} blueprintId - Blueprint ID
 */
async function handleToggleFavorite(blueprintId) {
    // Find blueprint in library data
    const blueprint = libraryData.find(b => b.blueprint_id === blueprintId);
    if (!blueprint) return;

    const newFavoriteStatus = !blueprint.favorite;

    try {
        await setFavoriteInStorage(blueprintId, newFavoriteStatus);

        // Update local data
        blueprint.favorite = newFavoriteStatus;
        applyFiltersAndSearch();

        showSuccess(newFavoriteStatus ? 'Added to favorites' : 'Removed from favorites');
    } catch (error) {
        showError(`Failed to update favorite: ${error.message}`);
    }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Initialize and display the library view
 * @returns {Promise<void>}
 */
export async function showLibrary() {
    // Ensure library container exists and is populated
    const $libraryView = $('#libraryView');

    // Only render if empty (first load)
    if ($libraryView.is(':empty')) {
        $libraryView.html(renderLibraryView());
    }

    // Toggle Views
    $('#editorView').hide();
    $libraryView.show();

    // Update active state in sidebar
    $('.sidebar-link').removeClass('active');
    $('#libraryLink').addClass('active');

    // Load library data
    await refreshLibrary();
}

/**
 * Refresh library data from backend
 * @returns {Promise<void>}
 */
export async function refreshLibrary() {
    try {
        showInfo('Loading library...');
        libraryData = await fetchLibrary();
        console.log('[Library] Loaded blueprints:', libraryData);
        applyFiltersAndSearch();
        showSuccess(`Loaded ${libraryData.length} blueprints`);
    } catch (error) {
        console.error('[Library] Error loading library:', error);
        showError(`Failed to load library: ${error.message}`);

        // Show empty state with connection error
        $('#libraryGrid').hide();
        $('#libraryEmpty').show().html(`
            <i class="fa-solid fa-triangle-exclamation"></i>
            <h2>Connection Error</h2>
            <p>${escapeHtml(error.message)}</p>
            <button id="libraryRetry" class="btn btn-primary">
                <i class="fa-solid fa-refresh"></i> Retry
            </button>
            <button id="libraryConfigureConnection" class="btn">
                <i class="fa-solid fa-gear"></i> Configure Connection
            </button>
        `);

        // Add retry handler
        $('#libraryRetry').off('click').on('click', async function () {
            await refreshLibrary();
        });

        // Add configure connection handler
        $('#libraryConfigureConnection').off('click').on('click', function () {
            $(document).trigger('open-settings');
        });
    }
}

/**
 * Hide library view
 */
export function hideLibrary() {
    $('#libraryView').hide();
    $('#editorView').show();
    $('#libraryLink').removeClass('active');
}
