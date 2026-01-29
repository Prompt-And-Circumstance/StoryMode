import { saveSettingsDebounced } from '/script.js';
import { extension_settings } from '/scripts/extensions.js';
import { MODULE_NAME } from '../core/state-manager.js';
import { renderPanelContent } from './controller-panel-content.js';

/**
 * Render the floating panel HTML.
 * @param {boolean} isDocked - Whether the panel is docked (unused for floating render but kept for signature)
 * @returns {string} HTML string for the panel
 */
function renderPanelHtml(isDocked) {
    const content = renderPanelContent();
    const settings = extension_settings[MODULE_NAME];

    // Header actions
    const dockIcon = isDocked ? 'fa-window-restore' : 'fa-columns';
    const dockTitle = isDocked ? 'Undock panel' : 'Dock panel';

    return `
        <div id="storymode-debug-panel" class="storymode-debug-panel">
            <div class="storymode-debug-header">
                <i class="fa-solid fa-book-open"></i> Story Controller
                <div class="storymode-header-actions">
                    <button id="storymode-prompt-inspector" class="storymode-debug-prompt-btn" title="View prompt injection">
                        <i class="fa-solid fa-code"></i>
                    </button>
                    <button id="storymode-library-btn" class="storymode-debug-library-btn" title="Open Blueprint Library">
                        <i class="fa-solid fa-book-bookmark"></i>
                    </button>
                    <button id="storymode-settings-btn" class="storymode-debug-settings-btn" title="Open Story Mode Settings">
                        <i class="fa-solid fa-cog"></i>
                    </button>
                    <button id="storymode-dock-toggle" class="storymode-debug-dock-btn" title="${dockTitle}">
                        <i class="fa-solid ${dockIcon}"></i>
                    </button>
                    <button id="storymode-debug-close" class="storymode-debug-close" title="Close panel">
                        <i class="fa-solid fa-times"></i>
                    </button>
                </div>
            </div>
            <div class="storymode-debug-content">
                ${content}
            </div>
        </div>
    `;
}

/**
 * Build the theme selector HTML
 * @param {string} currentTheme - Current theme setting
 * @returns {string} HTML for theme buttons
 */
function buildThemeSelector(currentTheme) {
    return `
        <div class="storymode-theme-selector">
            <button class="storymode-theme-btn ${currentTheme === 'storymode' ? 'active' : ''}"
                    data-theme="storymode" title="Story Mode theme">
                <i class="fa-solid fa-book-open"></i>
            </button>
            <button class="storymode-theme-btn ${currentTheme === 'light' ? 'active' : ''}"
                    data-theme="light" title="Light theme">
                <i class="fa-solid fa-sun"></i>
            </button>
            <button class="storymode-theme-btn ${currentTheme === 'dark' ? 'active' : ''}"
                    data-theme="dark" title="Dark theme">
                <i class="fa-solid fa-moon"></i>
            </button>
            <button class="storymode-theme-btn ${currentTheme === 'rpg-companion' ? 'active' : ''}"
                    data-theme="rpg-companion" title="RPG Companion theme">
                <i class="fa-solid fa-dice-d20"></i>
            </button>
        </div>
    `;
}

/**
 * Create the docked sidebar panel (similar to RPG Companion's approach).
 * Uses a fixed sidebar appended to body instead of ST's drawer system.
 * @param {Object} settings - Extension settings
 * @returns {jQuery} The sidebar panel element
 */
function createDockedSidebar(settings) {
    const isCollapsed = settings.sidebarCollapsed || false;
    const position = settings.sidebarPosition || 'right';
    const theme = settings.sidebarTheme || 'storymode';

    const panelHtml = buildSidebarHtml(isCollapsed, position, theme);
    const panel = $(panelHtml);

    $('body').append(panel);
    console.log('[Story Mode] Sidebar panel appended to body');

    setupRpgCompanionCoexistence();

    if (theme === 'rpg-companion') {
        setTimeout(() => syncWithRpgCompanionTheme(panel), 100);
    }

    bindCollapseToggle(panel, settings);
    bindThemeSelector(panel);

    return panel;
}

function buildSidebarHtml(isCollapsed, position, theme) {
    const themeSelector = buildThemeSelector(theme);

    return `
        <div id="storymode-sidebar-panel" class="storymode-sidebar ${isCollapsed ? 'storymode-collapsed' : ''} storymode-position-${position}" data-theme="${theme}">
            <button id="storymode-collapse-toggle" class="storymode-collapse-toggle" title="${isCollapsed ? 'Expand panel' : 'Collapse panel'}">
                <i class="fa-solid fa-chevron-${position === 'right' ? (isCollapsed ? 'left' : 'right') : (isCollapsed ? 'right' : 'left')}"></i>
            </button>
            <div class="storymode-sidebar-container">
                <div class="storymode-sidebar-header">
                    <h3>Story Controller</h3>
                    <div class="storymode-sidebar-header-actions">
                        <button id="storymode-prompt-inspector-sidebar" class="storymode-sidebar-action-btn" title="View prompt injection">
                            <i class="fa-solid fa-code"></i>
                        </button>
                        <button id="storymode-library-btn-sidebar" class="storymode-sidebar-action-btn" title="Open Blueprint Library">
                            <i class="fa-solid fa-book-bookmark"></i>
                        </button>
                        <button id="storymode-settings-btn-sidebar" class="storymode-sidebar-action-btn" title="Open Story Mode Settings">
                            <i class="fa-solid fa-cog"></i>
                        </button>
                        <button id="storymode-dock-toggle-sidebar" class="storymode-sidebar-action-btn" title="Undock panel">
                            <i class="fa-solid fa-window-restore"></i>
                        </button>
                    </div>
                </div>
                <div class="storymode-sidebar-theme-row">
                    <span class="storymode-theme-label">Theme:</span>
                    ${themeSelector}
                </div>
                <div class="storymode-sidebar-content">
                    <!-- Content injected here -->
                </div>
            </div>
        </div>
    `;
}

function bindCollapseToggle(panel, settings) {
    panel.find('#storymode-collapse-toggle').on('click', function() {
        const isCurrentlyCollapsed = panel.hasClass('storymode-collapsed');
        const pos = settings.sidebarPosition || 'right';

        if (isCurrentlyCollapsed) {
            panel.removeClass('storymode-collapsed');
            $(this).attr('title', 'Collapse panel');
            $(this).find('i').removeClass('fa-chevron-left fa-chevron-right')
                .addClass(pos === 'right' ? 'fa-chevron-right' : 'fa-chevron-left');
        } else {
            panel.addClass('storymode-collapsed');
            $(this).attr('title', 'Expand panel');
            $(this).find('i').removeClass('fa-chevron-left fa-chevron-right')
                .addClass(pos === 'right' ? 'fa-chevron-left' : 'fa-chevron-right');
        }

        extension_settings[MODULE_NAME].sidebarCollapsed = !isCurrentlyCollapsed;
        saveSettingsDebounced();
    });
}

function bindThemeSelector(panel) {
    panel.find('.storymode-theme-btn').on('click', function() {
        const newTheme = $(this).data('theme');
        const currentTheme = panel.attr('data-theme');

        if (newTheme === currentTheme) return;

        if (newTheme === 'rpg-companion') {
            syncWithRpgCompanionTheme(panel);
        }

        panel.attr('data-theme', newTheme);
        panel.find('.storymode-theme-btn').removeClass('active');
        $(this).addClass('active');

        extension_settings[MODULE_NAME].sidebarTheme = newTheme;
        saveSettingsDebounced();

        console.log(`[Story Mode] Sidebar theme changed to: ${newTheme}`);
    });
}

/**
 * Sync with RPG Companion's current theme by copying their CSS variables
 * @param {jQuery} panel - The sidebar panel
 */
function syncWithRpgCompanionTheme(panel) {
    const rpgPanel = $('#rpg-companion-panel');
    if (rpgPanel.length === 0) return;

    // Get RPG Companion's computed CSS variables
    const rpgStyles = getComputedStyle(rpgPanel[0]);

    // Copy the RPG theme variables to our panel as inline styles
    const rpgVars = [
        '--rpg-bg',
        '--rpg-accent',
        '--rpg-text',
        '--rpg-highlight',
        '--rpg-border',
        '--rpg-shadow'
    ];

    rpgVars.forEach(varName => {
        const value = rpgStyles.getPropertyValue(varName).trim();
        if (value) {
            panel[0].style.setProperty(varName, value);
        }
    });

    console.log('[Story Mode] Synced with RPG Companion theme');
}

/**
 * Check if RPG Companion is installed AND visible (not disabled)
 * @returns {boolean}
 */
function isRpgCompanionVisible() {
    const rpgPanel = $('#rpg-companion-panel');
    if (rpgPanel.length === 0) return false;

    // Check if the panel is actually visible (not display:none or visibility:hidden)
    return rpgPanel.is(':visible') && rpgPanel.css('display') !== 'none';
}

/**
 * Set up coexistence with RPG Companion by directly adjusting panel position
 * Sets inline styles to ensure proper positioning regardless of CSS specificity
 */
function setupRpgCompanionCoexistence() {
    const rpgPanel = $('#rpg-companion-panel');
    const storyPanel = $('#storymode-sidebar-panel');

    if (rpgPanel.length === 0 || !isRpgCompanionVisible()) {
        storyPanel.css('right', '');
        $('body').removeClass('rpg-companion-active rpg-companion-collapsed');
        cleanupRpgObserver();
        return;
    }

    if (window._storyModeRpgObserver) {
        window._storyModeRpgObserver.disconnect();
    }

    console.log('[Story Mode] RPG Companion detected and visible, setting up coexistence');

    const updatePosition = () => updateRpgPosition(rpgPanel, storyPanel);
    updatePosition();

    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                updatePosition();
            }
        });
    });

    observer.observe(rpgPanel[0], { attributes: true, attributeFilter: ['class'] });
    window._storyModeRpgObserver = observer;
}

function cleanupRpgObserver() {
    if (window._storyModeRpgObserver) {
        window._storyModeRpgObserver.disconnect();
        delete window._storyModeRpgObserver;
    }
}

function updateRpgPosition(rpgPanel, storyPanel) {
    const isCollapsed = rpgPanel.hasClass('rpg-collapsed');
    const rpgWidth = rpgPanel.outerWidth() || (isCollapsed ? 77 : 321);
    const offset = rpgWidth + 'px';

    storyPanel.css({ 'right': offset });

    $('body')
        .toggleClass('rpg-companion-active', !isCollapsed)
        .toggleClass('rpg-companion-collapsed', isCollapsed);

    console.log(`[Story Mode] RPG Companion ${isCollapsed ? 'collapsed' : 'open'}, width: ${rpgWidth}px, offset: ${offset}`);
}

/**
 * Apply position setting to the sidebar panel
 * @param {jQuery} panel - The sidebar panel
 * @param {Object} settings - Extension settings
 */
function applyPanelPosition(panel, settings) {
    const position = settings.sidebarPosition || 'right';

    // Remove all position classes
    panel.removeClass('storymode-position-left storymode-position-right');
    // Add current position class
    panel.addClass(`storymode-position-${position}`);

    // Update collapse toggle chevron direction
    const isCollapsed = panel.hasClass('storymode-collapsed');
    const toggle = panel.find('#storymode-collapse-toggle i');
    toggle.removeClass('fa-chevron-left fa-chevron-right');

    if (position === 'right') {
        toggle.addClass(isCollapsed ? 'fa-chevron-left' : 'fa-chevron-right');
    } else {
        toggle.addClass(isCollapsed ? 'fa-chevron-right' : 'fa-chevron-left');
    }
}

export {
    renderPanelHtml,
    buildThemeSelector,
    createDockedSidebar,
    syncWithRpgCompanionTheme,
    isRpgCompanionVisible,
    setupRpgCompanionCoexistence,
    applyPanelPosition,
};
