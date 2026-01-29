/**
 * Story Controller Panel Module for Story Mode Extension
 *
 * Handles rendering and interaction for the floating Story Controller panel
 * (formerly known as Debug Panel).
 */

import { saveSettingsDebounced } from '/script.js';
import { extension_settings } from '/scripts/extensions.js';
import { MODULE_NAME } from '../core/state-manager.js';

import { renderPanelContent } from './controller-panel-content.js';
import {
    renderPanelHtml,
    createDockedSidebar,
    setupRpgCompanionCoexistence,
    applyPanelPosition,
} from './controller-panel-structure.js';
import { bindDockedContentEvents, bindPanelEvents } from './controller-panel-events.js';

// ============================================================================
// GLOBAL EVENT HANDLERS (document-level delegation for dynamic content)
// ============================================================================

let globalHandlersInitialized = false;

// Threshold for auto-switching to floating mode on narrow screens
const NARROW_SCREEN_THRESHOLD = 1000;

function initGlobalHandlers() {
    if (globalHandlersInitialized) return;
    globalHandlersInitialized = true;

    initResizeHandler();
    initStyleToggleHandler();
}

function initResizeHandler() {
    let resizeTimeout = null;
    $(window).on('resize.storyModeController', function() {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            const settings = extension_settings[MODULE_NAME];
            if (!settings.debugPanelEnabled) return;

            const isNarrowScreen = window.innerWidth <= NARROW_SCREEN_THRESHOLD;
            const wantsDocked = settings.debugPanelDocked || false;

            if (wantsDocked && isNarrowScreen) {
                updateControllerPanel();
            } else if (wantsDocked && !isNarrowScreen) {
                const floatingExists = $('#storymode-debug-panel').length > 0;
                const dockedExists = $('#storymode-sidebar-panel').length > 0;
                if (floatingExists && !dockedExists) {
                    updateControllerPanel();
                }
            }

            setupRpgCompanionCoexistence();
        }, 150);
    });
}

function initStyleToggleHandler() {
    $(document).on('click', '[data-style-toggle]', function (e) {
        e.stopPropagation();
        e.preventDefault();

        const styleType = $(this).data('style-toggle');
        const container = $(this).closest('.storymode-style-item');
        const descEl = container.find(`[data-style-desc="${styleType}"]`);
        const chevron = $(this).find('.storymode-style-chevron');

        if (!descEl.length) return;

        const isCollapsed = descEl.hasClass('collapsed');

        descEl.toggleClass('collapsed', !isCollapsed);
        chevron.toggleClass('fa-chevron-down', !isCollapsed);
        chevron.toggleClass('fa-chevron-up', isCollapsed);

        if (styleType === 'storyType') {
            extension_settings[MODULE_NAME].storyTypeDescCollapsed = !isCollapsed;
        } else if (styleType === 'authorStyle') {
            extension_settings[MODULE_NAME].authorStyleDescCollapsed = !isCollapsed;
        }
        saveSettingsDebounced();
    });
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

/**
 * Render or update the floating Story Controller panel based on current settings and state.
 * Handles creation, updates, drag logic, and event binding.
 * Supports both docked (drawer) and floating modes.
 */
export function updateControllerPanel() {
    // Initialize global handlers once
    initGlobalHandlers();
    const settings = extension_settings[MODULE_NAME];
    let isDocked = settings.debugPanelDocked || false;

    // Auto-switch to floating mode on narrow screens
    const isNarrowScreen = window.innerWidth <= NARROW_SCREEN_THRESHOLD;
    if (isDocked && isNarrowScreen) {
        isDocked = false; // Force floating mode on narrow screens
    }

    // Remove if disabled
    if (!settings.debugPanelEnabled) {
        $('#storymode-debug-panel').remove();
        $('#storymode-sidebar-panel').remove();
        // Cleanup MutationObserver to prevent memory leaks
        if (window._storyModeRpgObserver) {
            window._storyModeRpgObserver.disconnect();
            delete window._storyModeRpgObserver;
        }
        return;
    }

    if (isDocked) {
        updateDockedPanel(settings);
        // Remove floating panel if switching to docked
        $('#storymode-debug-panel').remove();
    } else {
        updateFloatingPanel(settings);
        // Remove sidebar if switching from docked to floating
        $('#storymode-sidebar-panel').remove();
    }
}

/**
 * Update the floating panel mode.
 */
function updateFloatingPanel(settings) {
    const panelHtml = renderPanelHtml(false);
    let panel = $('#storymode-debug-panel');

    if (panelHtml) {
        if (panel.length > 0) {
            // Update existing panel content
            const newContent = $(panelHtml).find('.storymode-debug-content').html();
            panel.find('.storymode-debug-content').html(newContent);

            // Re-apply rolled up state if needed
            if (settings.debugPanelRolledUp) {
                panel.addClass('sm-rolled-up');
            } else {
                panel.removeClass('sm-rolled-up');
            }
        } else {
            // Create new panel
            panel = $(panelHtml);
            $('body').append(panel);

            // Apply initial rolled up state
            if (settings.debugPanelRolledUp) {
                panel.addClass('sm-rolled-up');
            }

            // Bind events for the new panel
            bindPanelEvents(panel, settings);
        }
    } else {
        panel.remove();
    }
}

/**
 * Update the docked sidebar panel mode.
 * Uses a fixed sidebar similar to RPG Companion for consistent UX.
 */
function updateDockedPanel(settings) {
    // Remove floating panel if exists
    $('#storymode-debug-panel').remove();

    // Get or create sidebar panel
    let panel = $('#storymode-sidebar-panel');
    if (panel.length === 0) {
        panel = createDockedSidebar(settings);
    }

    // Update content
    const contentHtml = renderPanelContent();
    panel.find('.storymode-sidebar-content').html(contentHtml);

    // Bind content events
    bindDockedContentEvents(panel);

    // Apply position setting
    applyPanelPosition(panel, settings);
}
