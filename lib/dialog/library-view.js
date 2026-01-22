/**
 * Library View Module
 * Handles the Blueprint Library tab UI and operations
 */
import { doNewChat } from '/script.js';
import { callGenericPopup, POPUP_TYPE, POPUP_RESULT } from '/scripts/popup.js';

import * as BlueprintModule from '../blueprint/module.js';
import {
    getLibrary,
    searchBlueprints,
    setBlueprintFavorite,
    deleteLibraryBlueprint,
} from '../blueprint/integration.js';
import { exportBlueprintAsPNG } from '../blueprint/export.js';
import { openBlueprintEditor } from '../editor/blueprint-editor.js';
import { buildBlueprintTabContent, renderBlueprintCard } from '../ui/components.js';

/**
 * Simple debounce function for search input
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func.apply(this, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Refresh the entire library view
 * @param {jQuery} content - The settings dialog content element
 * @param {Object} callbacks - Callback functions from index.js
 * @param {Function} callbacks.loadBlueprintsForFolder - Function to load blueprints for a folder
 */
export async function refreshLibraryView(content, callbacks = {}) {
    const { loadBlueprintsForFolder: loadFolder } = callbacks;
    try {
        const library = await getLibrary();
        const allBlueprints = await library.getAllBlueprints();

        // Update folder counts
        content.find('#folder_count_all').text(allBlueprints.length);
        content.find('#folder_count_favorites').text(
            allBlueprints.filter(bp => bp.userMetadata?.favorite).length
        );

        // Load blueprints for active folder
        const activeFolder = content.find('.storymode-folder-item.active').data('folder') || 'all';
        if (loadFolder) {
            await loadFolder(content, activeFolder);
        } else {
            await loadBlueprintsForFolder(content, activeFolder, callbacks);
        }

        // Update stats
        content.find('#library_total_count').text(`${allBlueprints.length} scenario blueprint${allBlueprints.length !== 1 ? 's' : ''}`);
    } catch (error) {
        console.error('[Story Mode] Error refreshing library:', error);
        // Show user-friendly error in the library grid
        const grid = content.find('#library_blueprint_grid');
        const emptyState = content.find('#library_empty_state');
        grid.find('.storymode-blueprint-card').remove();
        emptyState.find('i').removeClass('fa-folder-open').addClass('fa-exclamation-triangle');
        emptyState.find('h3').text('Library Error');
        emptyState.find('p').html(
            `Failed to load library: ${error.message}<br><br>` +
            `<strong>Common fixes:</strong><br>` +
            `• Disable browser privacy shields/blocking (Brave Shields, etc.)<br>` +
            `• Exit private/incognito browsing mode<br>` +
            `• Enable cookies and site data for this domain<br>` +
            `• Try a different browser (Safari, Chrome, Firefox)`
        );
        emptyState.find('.storymode-generate-actions').hide();
        emptyState.show();
        toastr.error('Library database unavailable. Check browser settings.');
    }
}

/**
 * Load blueprints for a specific folder
 * @param {jQuery} content - The settings dialog content element
 * @param {string} folderId - Folder ID ('all', 'favorites', 'recent')
 * @param {Object} callbacks - Callback functions
 */
export async function loadBlueprintsForFolder(content, folderId, callbacks = {}) {
    try {
        const library = await getLibrary();
        let blueprints;

        if (folderId === 'favorites') {
            const all = await library.getAllBlueprints();
            blueprints = all.filter(bp => bp.userMetadata?.favorite);
        } else if (folderId === 'recent') {
            // Get recently played stats, then fetch actual blueprints
            const recentStats = await library.stats.getRecentlyPlayed(20);
            const blueprintIds = recentStats.map(stat => stat.blueprint_id);
            const all = await library.getAllBlueprints();
            blueprints = all.filter(bp => blueprintIds.includes(bp.blueprint_id))
                .sort((a, b) => {
                    // Preserve the recently-played order
                    return blueprintIds.indexOf(a.blueprint_id) - blueprintIds.indexOf(b.blueprint_id);
                });
        } else {
            blueprints = await library.getAllBlueprints();
        }

        // Apply sort
        const sortValue = content.find('#library_sort_select').val() || 'created-desc';
        const [sortBy, sortOrder] = sortValue.split('-');
        blueprints = sortLibraryBlueprints(blueprints, sortBy, sortOrder);

        renderBlueprintGrid(content, blueprints);
    } catch (error) {
        console.error('[Story Mode] Error loading blueprints:', error);
        toastr.error(`Failed to load blueprints: ${error.message}`);
        // Show empty state with error
        const grid = content.find('#library_blueprint_grid');
        const emptyState = content.find('#library_empty_state');
        grid.find('.storymode-blueprint-card').remove();
        emptyState.show();
    }
}

/**
 * Sort blueprints by specified field and order
 * @param {Array} blueprints - Array of blueprint objects
 * @param {string} sortBy - Field to sort by ('title', 'created', 'played')
 * @param {string} sortOrder - Sort order ('asc' or 'desc')
 * @returns {Array} Sorted blueprints
 */
export function sortLibraryBlueprints(blueprints, sortBy, sortOrder) {
    return [...blueprints].sort((a, b) => {
        let comparison = 0;
        switch (sortBy) {
            case 'title':
                const titleA = a.userMetadata?.title || a.core_premise || '';
                const titleB = b.userMetadata?.title || b.core_premise || '';
                comparison = titleA.localeCompare(titleB);
                break;
            case 'created':
                comparison = new Date(a.libraryData?.dateAdded || 0) - new Date(b.libraryData?.dateAdded || 0);
                break;
            case 'played':
                comparison = (a.libraryData?.accessCount || 0) - (b.libraryData?.accessCount || 0);
                break;
        }
        return sortOrder === 'desc' ? -comparison : comparison;
    });
}

/**
 * Search library blueprints
 * @param {jQuery} content - The settings dialog content element
 * @param {string} query - Search query
 */
export async function searchLibraryBlueprints(content, query) {
    try {
        const results = await searchBlueprints(query);
        renderBlueprintGrid(content, results);
    } catch (error) {
        console.error('[Story Mode] Error searching blueprints:', error);
    }
}

/**
 * Render blueprint grid
 * @param {jQuery} content - The settings dialog content element
 * @param {Array} blueprints - Array of blueprint objects
 */
export function renderBlueprintGrid(content, blueprints) {
    const grid = content.find('#library_blueprint_grid');
    const emptyState = content.find('#library_empty_state');

    if (blueprints.length === 0) {
        grid.find('.storymode-blueprint-card').remove();
        emptyState.show();
    } else {
        emptyState.hide();
        const cardsHtml = blueprints.map(bp => renderBlueprintCard(bp)).join('');
        grid.html(cardsHtml);
    }
}

/**
 * Load blueprint from library into current chat
 * @param {jQuery} content - The settings dialog content element
 * @param {string} blueprintId - Blueprint ID to load
 * @param {Object} callbacks - Callback functions from index.js
 * @param {Function} callbacks.refreshBlueprintPreview - Function to refresh blueprint preview
 * @param {Function} callbacks.updateStatusDisplay - Function to update status display
 */
export async function loadBlueprintFromLibrary(content, blueprintId, callbacks = {}) {
    const { refreshBlueprintPreview, updateStatusDisplay } = callbacks;
    try {
        const library = await getLibrary();
        const blueprint = await library.getBlueprint(blueprintId);

        if (!blueprint) {
            toastr.error('Scenario blueprint not found');
            return;
        }

        // Create a run copy (deep clone) so library blueprint stays pristine
        const runState = BlueprintModule.createRunCopy(blueprint, 'library');
        await BlueprintModule.saveBlueprintState(runState);

        // Update play stats
        await library.stats.recordPlayStart(blueprintId);

        // Refresh UI
        content.find('#tab_blueprint').html(buildBlueprintTabContent());
        if (refreshBlueprintPreview) refreshBlueprintPreview();
        if (updateStatusDisplay) updateStatusDisplay();

        toastr.success('Scenario loaded!');
    } catch (error) {
        console.error('[Story Mode] Error loading blueprint:', error);
        toastr.error('Failed to load scenario blueprint');
    }
}

/**
 * Play blueprint from library - load the blueprint into the current chat
 * @param {jQuery} content - The settings dialog content element
 * @param {string} blueprintId - Blueprint ID to play
 * @param {Object} callbacks - Callback functions from index.js
 * @param {Function} callbacks.refreshBlueprintPreview - Function to refresh blueprint preview
 * @param {Function} callbacks.updateStatusDisplay - Function to update status display
 */
export async function playBlueprintFromLibrary(content, blueprintId, callbacks = {}) {
    const { refreshBlueprintPreview, updateStatusDisplay, switchToTab } = callbacks;
    try {
        const library = await getLibrary();
        const blueprint = await library.getBlueprint(blueprintId);

        if (!blueprint) {
            toastr.error('Scenario blueprint not found');
            return;
        }

        // Sync blueprint settings to chat state (with confirmation if needed)
        const syncResult = await BlueprintModule.syncBlueprintSettings(blueprint, true);

        if (!syncResult.confirmed && syncResult.changes.length > 0) {
            // User declined to overwrite current blueprint settings
            // Offer to create a new chat instead
            const createNewChat = await callGenericPopup(
                `Would you like to create a new chat to load this blueprint? This will preserve your current conversation.`,
                POPUP_TYPE.CONFIRM
            );

            if (createNewChat !== POPUP_RESULT.AFFIRMATIVE) {
                // User declined new chat too - do nothing
                return;
            }

            // Create new chat
            await doNewChat();
            // Wait a moment for chat to be created
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Create a run copy (deep clone) so library blueprint stays pristine
        const runState = BlueprintModule.createRunCopy(blueprint, 'library');
        await BlueprintModule.saveBlueprintState(runState);

        // Update play stats
        await library.stats.recordPlayStart(blueprintId);

        // Sync blueprint settings again (now without confirmation since we're in a fresh chat)
        await BlueprintModule.syncBlueprintSettings(blueprint, false);

        // Refresh UI
        content.find('#tab_blueprint').html(buildBlueprintTabContent());
        if (refreshBlueprintPreview) refreshBlueprintPreview();
        if (updateStatusDisplay) updateStatusDisplay();

        // Switch to the Blueprint tab to show the loaded blueprint
        if (switchToTab) switchToTab(content, 'blueprint');

        toastr.success('Scenario loaded!');
    } catch (error) {
        console.error('[Story Mode] Error loading blueprint:', error);
        toastr.error('Failed to load scenario blueprint');
    }
}

/**
 * Edit blueprint from library
 * @param {jQuery} content - The settings dialog content element
 * @param {string} blueprintId - Blueprint ID to edit
 * @param {Object} callbacks - Callback functions
 * @param {Function} callbacks.refreshLibraryView - Function to refresh library view
 */
export async function editBlueprintFromLibrary(content, blueprintId, callbacks = {}) {
    const { refreshLibraryView: refreshView } = callbacks;
    try {
        const library = await getLibrary();
        const blueprint = await library.getBlueprint(blueprintId);

        if (!blueprint) {
            toastr.error('Scenario blueprint not found');
            return;
        }

        const edited = await openBlueprintEditor(blueprint);
        if (edited) {
            await library.saveBlueprint(edited);
            toastr.success('Scenario blueprint updated!');
            if (refreshView) {
                await refreshView(content, callbacks);
            } else {
                await refreshLibraryView(content, callbacks);
            }
        }
    } catch (error) {
        console.error('[Story Mode] Error editing blueprint:', error);
        toastr.error('Failed to edit scenario blueprint');
    }
}

/**
 * Toggle blueprint favorite status
 * @param {jQuery} content - The settings dialog content element
 * @param {string} blueprintId - Blueprint ID
 * @param {jQuery} button - The favorite button element
 * @param {Object} callbacks - Callback functions
 * @param {Function} callbacks.refreshLibraryView - Function to refresh library view
 */
export async function toggleBlueprintFavorite(content, blueprintId, button, callbacks = {}) {
    const { refreshLibraryView: refreshView } = callbacks;
    try {
        // Use button state to determine current favorite (manifest is source of truth)
        const currentFavorite = button.hasClass('active');
        await setBlueprintFavorite(blueprintId, !currentFavorite);

        // Update button appearance (icon styled via .active class in CSS)
        button.toggleClass('active');

        // Update folder counts
        if (refreshView) {
            await refreshView(content, callbacks);
        } else {
            await refreshLibraryView(content, callbacks);
        }
    } catch (error) {
        console.error('[Story Mode] Error toggling favorite:', error);
    }
}

/**
 * Delete blueprint from library
 * @param {jQuery} content - The settings dialog content element
 * @param {string} blueprintId - Blueprint ID to delete
 * @param {Object} callbacks - Callback functions
 * @param {Function} callbacks.refreshLibraryView - Function to refresh library view
 */
export async function deleteBlueprintFromLibrary(content, blueprintId, callbacks = {}) {
    const { refreshLibraryView: refreshView } = callbacks;
    if (!confirm('Delete this scenario blueprint from your library? This cannot be undone.')) {
        return;
    }

    try {
        await deleteLibraryBlueprint(blueprintId);
        toastr.success('Scenario blueprint deleted');
        if (refreshView) {
            await refreshView(content, callbacks);
        } else {
            await refreshLibraryView(content, callbacks);
        }
    } catch (error) {
        console.error('[Story Mode] Error deleting blueprint:', error);
        toastr.error('Failed to delete blueprint');
    }
}

/**
 * Export blueprint from library as PNG (extended format with embedded resources)
 * @param {string} blueprintId - Blueprint ID to export
 */
export async function exportBlueprintFromLibrary(blueprintId) {
    try {
        const library = await getLibrary();
        const blueprint = await library.getBlueprint(blueprintId);

        if (!blueprint) {
            toastr.error('Scenario blueprint not found');
            return;
        }

        // Use new extended PNG export (handles cover, characters, etc.)
        const result = await exportBlueprintAsPNG(blueprint);

        if (result.success) {
            toastr.success(`Scenario blueprint exported: ${result.filename}`);
        } else {
            toastr.error('Export failed: ' + result.error);
        }
    } catch (error) {
        console.error('[Story Mode] Error exporting blueprint:', error);
        toastr.error('Failed to export blueprint: ' + error.message);
    }
}

/**
 * Refresh the sidebar content (no-op - sidebar removed)
 * @param {jQuery} content - The settings dialog content element
 */
export function refreshSidebar(content) {
    // Sidebar removed - no-op
}

/**
 * Helper to return to the library tab if appropriate
 * @param {jQuery} content - The settings dialog content element
 * @param {Object} callbacks - Callback functions
 * @param {Function} callbacks.showLibraryGridView - Function to show library grid view
 * @returns {boolean} True if returned to library, false otherwise
 */
export function returnToLibraryIfNeeded(content, callbacks = {}) {
    const { showLibraryGridView } = callbacks;
    if (!content) return false;
    const wasFromLibrary = content.data('generateFromLibrary');
    if (wasFromLibrary) {
        content.removeData('generateFromLibrary');
        if (showLibraryGridView) {
            showLibraryGridView(content);
        }
        return true;
    }
    return false;
}
