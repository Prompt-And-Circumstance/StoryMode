/**
 * Library Tab Components for Story Mode Extension
 * Blueprint library grid, cards, and view switching
 */

import { escapeHtml } from '../component-system.js';
import { getBlueprintCoverUrl, isValidImageUrl } from '../../blueprint/utils.js';
import { buildGenerateBlueprintSubtab } from './blueprint-tabs.js';

/**
 * Build the Library tab content
 * Shows saved blueprints with search, folders, and grid/list view
 * Supports in-place view switching between grid and generate form
 * @returns {string} HTML string
 */
export function buildLibraryTabContent() {
    return `
        <div class="storymode-library-container">
            <!-- Generate View (hidden by default) -->
            <div id="library_generate_view" class="storymode-library-generate-view" style="display: none;">
                <div class="storymode-library-generate-header" style="display: flex; justify-content: space-between; align-items: center;">
                    <h3 class="storymode-section-title" style="margin: 0;">
                        <i class="fa-solid fa-wand-magic-sparkles"></i> Generate New Scenario Blueprint
                    </h3>
                    <button id="library_back_to_grid_btn" class="menu_button" title="Back to Library">
                        Back to Library <i class="fa-solid fa-arrow-right"></i>
                    </button>
                </div>
                <div id="library_generate_form_container">
                    <!-- Form content populated dynamically by showLibraryGenerateView() -->
                </div>
            </div>

            <!-- Grid View (shown by default) -->
            <div id="library_grid_view">
                <!-- Library Header -->
                <div class="storymode-library-header">
                    <div class="storymode-library-search">
                        <i class="fa-solid fa-search"></i>
                        <input type="text" id="library_search_input" placeholder="Search..." class="text_pole">
                    </div>
                    <div class="storymode-library-actions">
                        <div class="storymode-generate-actions" style="margin-top: 0;">
                            <button id="library_add_new_btn" class="menu_button" title="Create a new blank blueprint">
                                <i class="fa-solid fa-plus"></i> Add New
                            </button>
                            <button id="library_generate_blueprint_btn" class="menu_button storymode-btn storymode-btn-primary" title="Generate a new scenario blueprint">
                                <i class="fa-solid fa-wand-magic-sparkles"></i> Generate Scenario
                            </button>
                        </div>
                        <button id="library_import_btn" class="menu_button" title="Import scenario blueprint from file">
                            <i class="fa-solid fa-file-import"></i> Import
                        </button>
                        <button id="library_view_toggle" class="menu_button" data-view="grid" title="Switch to list view">
                            <i class="fa-solid fa-list"></i>
                        </button>
                    </div>
                </div>

                <!-- Library Content -->
                <div class="storymode-library-content">
                    <!-- Folder Sidebar -->
                    <div class="storymode-library-sidebar">
                        <div class="storymode-folder-list" id="library_folder_list">
                            <div class="storymode-folder-item active" data-folder="all">
                                <i class="fa-solid fa-folder"></i>
                                <span>All Blueprints</span>
                                <span class="storymode-folder-count" id="folder_count_all">0</span>
                            </div>
                            <div class="storymode-folder-item" data-folder="favorites">
                                <i class="fa-solid fa-star"></i>
                                <span>Favorites</span>
                                <span class="storymode-folder-count" id="folder_count_favorites">0</span>
                            </div>
                            <div class="storymode-folder-item" data-folder="recent">
                                <i class="fa-solid fa-clock"></i>
                                <span>Recently Played</span>
                                <span class="storymode-folder-count" id="folder_count_recent">0</span>
                            </div>
                            <hr class="storymode-folder-divider">
                            <div class="storymode-folder-add" id="library_add_folder_btn">
                                <i class="fa-solid fa-folder-plus"></i>
                                <span>New Folder</span>
                            </div>
                        </div>
                    </div>

                    <!-- Blueprint Grid/List -->
                    <div class="storymode-library-main">
                        <div class="storymode-library-grid" id="library_blueprint_grid">
                            <!-- Blueprints will be loaded here dynamically -->
                            <div class="storymode-library-empty" id="library_empty_state">
                                <i class="fa-solid fa-folder-open"></i>
                                <h3>No Scenario Blueprints Yet</h3>
                                <p>Generate your first scenario blueprint or create one from scratch.</p>
                                <div class="storymode-generate-actions" style="margin-top: 16px;">
                                    <button id="library_empty_add_new_btn" class="menu_button" title="Create a new blank blueprint">
                                        <i class="fa-solid fa-plus"></i> Add New
                                    </button>
                                    <button id="library_empty_generate_btn" class="menu_button storymode-btn storymode-btn-primary" title="Generate a new scenario blueprint">
                                        <i class="fa-solid fa-wand-magic-sparkles"></i> Generate Scenario
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Library Footer -->
                <div class="storymode-library-footer">
                    <div class="storymode-library-stats">
                        <span id="library_total_count">0 blueprints</span>
                        <span class="storymode-stat-divider">•</span>
                        <span id="library_storage_used">0 KB used</span>
                    </div>
                    <div class="storymode-library-sort">
                        <label>Sort by:</label>
                        <select id="library_sort_select" class="text_pole">
                            <option value="created-desc">Newest First</option>
                            <option value="created-asc">Oldest First</option>
                            <option value="title-asc">Title A-Z</option>
                            <option value="title-desc">Title Z-A</option>
                            <option value="played-desc">Most Played</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Show the generate form view in the library tab
 * Hides the grid view and populates the form container with fresh content
 * @param {jQuery} content - The settings dialog content element
 */
export function showLibraryGenerateView(content) {
    // Build fresh form content
    const formHtml = buildGenerateBlueprintSubtab();
    content.find('#library_generate_form_container').html(formHtml);

    // Switch views
    content.find('#library_grid_view').hide();
    content.find('#library_generate_view').show();

    // Hide settings close button when showing generate view
    content.find('#storymode_settings_close_btn').hide();
}

/**
 * Show the grid view in the library tab
 * Hides the generate form view
 * @param {jQuery} content - The settings dialog content element
 */
export function showLibraryGridView(content) {
    // Switch views
    content.find('#library_generate_view').hide();
    content.find('#library_grid_view').show();

    // Show settings close button when returning to grid view
    content.find('#storymode_settings_close_btn').show();
}

/**
 * Render a single blueprint card for the library grid
 * @param {Object} blueprint - Blueprint object
 * @param {Object} stats - Play statistics for this blueprint
 * @returns {string} HTML string
 */
export function renderBlueprintCard(blueprint, stats = {}) {
    const title = blueprint.title || blueprint.userMetadata?.title || blueprint.core_premise?.substring(0, 40) || 'Untitled Blueprint';
    const storyType = blueprint.story_type_name || 'Unknown';
    const sceneCount = blueprint.scene_plan?.length || 0;
    const isFavorite = blueprint.userMetadata?.favorite || false;
    const timesPlayed = stats.timesPlayed || 0;
    const coverUrl = getBlueprintCoverUrl(blueprint);
    const safeCoverUrl = isValidImageUrl(coverUrl) ? coverUrl : null;

    return `
        <div class="storymode-blueprint-card" data-blueprint-id="${escapeHtml(blueprint.blueprint_id)}">
    <div class="storymode-card-cover" style="${safeCoverUrl ? `background-image: url('${escapeHtml(encodeURI(safeCoverUrl))}')` : ''}">
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
        <button class="menu_button storymode-btn-start" data-action="play" title="Start story from this scenario blueprint">
            <i class="fa-solid fa-play"></i>
        </button>
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
