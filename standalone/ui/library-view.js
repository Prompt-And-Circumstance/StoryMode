/**
 * Library View for Standalone Editor
 * Displays blueprint library grid with search, filtering, and selection
 */

import { showError, showSuccess, showInfo } from '../adapters/notification-adapter.js';
import {
    getAllBlueprints,
    getBlueprintById,
    setFavorite as setFavoriteInStorage,
} from '../adapters/library-storage-adapter.js';

// ============================================================================
// STATE
// ============================================================================

let libraryData = [];
let filteredData = [];
let currentFilter = 'all';
let searchQuery = '';

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

/**
 * Render a single blueprint card
 * @param {Object} blueprint - Blueprint manifest entry
 * @returns {string} HTML for blueprint card
 */
function renderBlueprintCard(blueprint) {
    const title = blueprint.title || blueprint.blueprint_title || 'Untitled Blueprint';
    const storyType = blueprint.story_type_name || 'Unknown';
    const createdAt = blueprint.created_at ? new Date(blueprint.created_at).toLocaleDateString() : 'Unknown';
    const isFavorite = blueprint.favorite || false;
    const coverUrl = getCoverUrl(blueprint);
    const hasCover = blueprint.coverImageUrl || blueprint.metadata?.coverImageUrl || blueprint.metadata?.coverGallery?.length > 0;

    return `
        <div class="blueprint-card" data-blueprint-id="${blueprint.blueprint_id}">
            <div class="blueprint-card-cover ${!hasCover ? 'no-cover' : ''}" style="${hasCover ? `background-image: url('${coverUrl}');` : ''}">
                ${!hasCover ? `<div class="blueprint-card-placeholder"><i class="fa-solid fa-scroll"></i><span>No Cover</span></div>` : ''}
                ${isFavorite ? '<div class="blueprint-card-favorite"><i class="fa-solid fa-star"></i></div>' : ''}
            </div>
            <div class="blueprint-card-content">
                <h3 class="blueprint-card-title" title="${escapeHtml(title)}">${escapeHtml(title)}</h3>
                <div class="blueprint-card-meta">
                    <span class="blueprint-card-type">
                        <i class="fa-solid fa-masks-theater"></i> ${escapeHtml(storyType)}
                    </span>
                    <span class="blueprint-card-date">
                        <i class="fa-solid fa-calendar"></i> ${createdAt}
                    </span>
                </div>
            </div>
            <div class="blueprint-card-actions">
                <button class="btn btn-sm blueprint-card-load" title="Load blueprint">
                    <i class="fa-solid fa-folder-open"></i> Load
                </button>
                <button class="btn btn-sm blueprint-card-favorite-toggle" title="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}">
                    <i class="fa-${isFavorite ? 'solid' : 'regular'} fa-star"></i>
                </button>
            </div>
        </div>
    `;
}

/**
 * Get cover URL for a blueprint
 * @param {Object} blueprint - Blueprint manifest entry
 * @returns {string} Cover URL or placeholder
 */
function getCoverUrl(blueprint) {
    // Use relative URLs — the editor is served from SillyTavern (same-origin)
    if (blueprint.coverImageUrl) {
        return blueprint.coverImageUrl;
    }
    if (blueprint.metadata?.coverImageUrl) {
        return blueprint.metadata.coverImageUrl;
    }
    if (blueprint.metadata?.coverGallery?.length > 0) {
        const index = blueprint.metadata.coverGalleryIndex || 0;
        return blueprint.metadata.coverGallery[index]?.url;
    }

    // Placeholder
    return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="300" height="400"%3E%3Crect fill="%23333" width="300" height="400"/%3E%3Ctext x="50%25" y="50%25" fill="%23999" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="20"%3ENo Cover%3C/text%3E%3C/svg%3E';
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

    if (filteredData.length === 0) {
        grid.hide();
        empty.show();
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
    $(document).on('input', '#librarySearch', function() {
        searchQuery = $(this).val();
        applyFiltersAndSearch();
    });

    // Filter selection
    $(document).on('click', '.filter-item', function() {
        $('.filter-item').removeClass('active');
        $(this).addClass('active');
        currentFilter = $(this).data('filter');
        applyFiltersAndSearch();
    });

    // Refresh library
    $(document).on('click', '#libraryRefresh', async function() {
        await refreshLibrary();
    });

    // Load blueprint
    $(document).on('click', '.blueprint-card-load', async function(e) {
        e.stopPropagation();
        const card = $(this).closest('.blueprint-card');
        const blueprintId = card.data('blueprint-id');
        await handleLoadBlueprint(blueprintId);
    });

    // Card click (same as load button)
    $(document).on('click', '.blueprint-card', async function(e) {
        if ($(e.target).closest('.blueprint-card-actions').length) return;
        const blueprintId = $(this).data('blueprint-id');
        await handleLoadBlueprint(blueprintId);
    });

    // Toggle favorite
    $(document).on('click', '.blueprint-card-favorite-toggle', async function(e) {
        e.stopPropagation();
        const card = $(this).closest('.blueprint-card');
        const blueprintId = card.data('blueprint-id');
        await handleToggleFavorite(blueprintId);
    });

    // New blueprint (from library header)
    $(document).on('click', '#libraryNewBlueprint, #emptyNewBlueprint', function() {
        $(document).trigger('library:new-blueprint');
    });

    // Import (from library header)
    $(document).on('click', '#libraryImport, #emptyImport', function() {
        $(document).trigger('library:import');
    });
}

/**
 * Handle loading a blueprint
 * @param {string} blueprintId - Blueprint ID
 */
async function handleLoadBlueprint(blueprintId) {
    try {
        const blueprint = await loadBlueprintById(blueprintId);
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
    // Render library view
    $('#mainContent').html(renderLibraryView());

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
        console.log('[Library] Sample blueprint:', libraryData[0]);
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
        $(document).on('click', '#libraryRetry', async function() {
            await refreshLibrary();
        });

        // Add configure connection handler
        $(document).on('click', '#libraryConfigureConnection', function() {
            $(document).trigger('open-settings');
        });
    }
}

/**
 * Hide library view
 */
export function hideLibrary() {
    $('.library-view').remove();
}
