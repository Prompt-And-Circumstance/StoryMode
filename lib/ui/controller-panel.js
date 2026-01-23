/**
 * Story Controller Panel Module for Story Mode Extension
 * 
 * Handles rendering and interaction for the floating Story Controller panel
 * (formerly known as Debug Panel).
 */

import { saveSettingsDebounced } from '/script.js';
import { extension_settings } from '/scripts/extensions.js';

import {
    MODULE_NAME,
    getChatStoryState,
    getPacingMode,
    setPacingMode,
    getScenarioState,
    getCurrentSceneIndex,
    getBeatState,
    getCompletedBeatIndices,
} from '../core/state-manager.js';

import * as BlueprintModule from '../blueprint/module.js';
import * as ImageStorage from '../scene/image-storage.js';
import * as ImageGenerator from '../scene/image-generator.js';
import * as ImagePreview from '../scene/image-preview.js';

import { buildFullInjection, updateStoryPrompt } from '../core/arc-engine.js';
import { escapeHtml } from './component-system.js';

// ============================================================================
// MAIN EXPORT
// ============================================================================

/**
 * Render or update the floating Story Controller panel based on current settings and state.
 * Handles creation, updates, drag logic, and event binding.
 * Supports both docked (drawer) and floating modes.
 */
export function updateControllerPanel() {
    const settings = extension_settings[MODULE_NAME];
    const isDocked = settings.debugPanelDocked || false;

    // Remove if disabled
    if (!settings.debugPanelEnabled) {
        $('#storymode-debug-panel').remove();
        $('#storymode-controller-drawer').remove();
        $('#storymode-drawer-toggle').remove();
        return;
    }

    if (isDocked) {
        updateDockedPanel(settings);
    } else {
        updateFloatingPanel(settings);
        // Remove drawer if switching from docked to floating
        $('#storymode-controller-drawer').remove();
        $('#storymode-drawer-toggle').remove();
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
 * Update the docked drawer panel mode.
 */
function updateDockedPanel(settings) {
    // Remove floating panel if exists
    $('#storymode-debug-panel').remove();

    // Cleanup any detached components from previous versions
    if ($('#storymode-controller-drawer').length === 0) {
        // Only removing toggle if the drawer itself is missing ensures we don't break strict nesting
        // But if we are in a 'broken' state, we might have a toggle but no drawer, or vice versa
        // Let's be safe: if we are creating fresh, ensure no stray toggles exist
        $('#storymode-drawer-toggle').remove();
    }

    // Get or create drawer
    let drawer = $('#storymode-controller-drawer');
    if (drawer.length === 0) {
        drawer = createDockedDrawer();
    }

    // Update content
    const contentHtml = renderPanelContent();
    drawer.find('.storymode-drawer-content-inner').html(contentHtml);

    // Bind content events
    bindDockedContentEvents(drawer);
}

// ============================================================================
// INTERNAL RENDERING
// ============================================================================

/**
 * Format a list of scene indices as human-readable text
 * @param {number[]} indices - Array of 0-based scene indices
 * @returns {string} Formatted text like "Scenes 1, 2 and 3"
 */
function formatSceneList(indices) {
    if (indices.length === 0) return '';
    if (indices.length === 1) return `Scene ${indices[0] + 1}`;
    if (indices.length === 2) return `Scenes ${indices[0] + 1} and ${indices[1] + 1}`;
    // Don't mutate input - use slice and index
    const last = indices[indices.length - 1];
    const rest = indices.slice(0, -1);
    return `Scenes ${rest.map(i => i + 1).join(', ')} and ${last + 1}`;
}

/**
 * Render the panel content (shared between floating and docked modes).
 * @returns {string} HTML string for the panel interior
 */
function renderPanelContent() {
    const settings = extension_settings[MODULE_NAME];
    const chatState = getChatStoryState();
    const blueprintState = BlueprintModule.getBlueprintState();
    const isDocked = settings.debugPanelDocked || false;

    if (!settings.debugPanelEnabled) {
        return '';
    }

    let sceneInfo = '';
    let beatInfo = '';
    let imageInfo = '';
    let noBlueprintNotice = '';

    if (blueprintState?.blueprint && blueprintState.useBlueprint) {
        const blueprint = blueprintState.blueprint;
        const scene = BlueprintModule.getCurrentScene(
            blueprint,
            chatState.currentStep,
            chatState.arcLength,
            blueprintState.sceneMode || 'auto',
            getCurrentSceneIndex()
        );

        if (scene) {
            sceneInfo = `
                <div id="storymode-debug-scene-link" class="storymode-debug-section storymode-debug-interactable" title="Click to view full scene details">
                    <div class="storymode-debug-label">Scene <i class="fa-solid fa-magnifying-glass"></i></div>
                    <div class="storymode-debug-value">${escapeHtml(scene.title)}</div>
                    <div class="storymode-debug-meta">${scene.index + 1}/${blueprint.scene_plan?.length || 0} • ${scene.phase}</div>
                </div>
            `;

            // Beat progress
            if (scene.beats && scene.beats.length > 0) {
                // Use unified state accessor for completed beats
                const completedBeats = getCompletedBeatIndices();
                const currentBeatIndex = Math.min(completedBeats.length, scene.beats.length - 1);
                const pacingMode = getPacingMode();
                const beatState = getBeatState();

                const beatMarkers = scene.beats.map((beat, idx) => {
                    if (pacingMode === 'scenario') {
                        // Scenario Mode: Use detailed beat state from state-manager
                        const state = beatState[idx]?.status || 'pending';
                        if (state === 'complete') return `<span class="beat-done" title="${beat.title}">✓</span>`;
                        if (state === 'skipped') return `<span class="beat-skipped" style="color:var(--sm-text-muted);" title="${beat.title} (Skipped)">x</span>`;

                        // Check if it's the suggested next beat (first pending after all complete/skipped)
                        const isNext = !['complete', 'skipped'].includes(state) &&
                            scene.beats.slice(0, idx).every((_, beatIdx) => {
                                const s = beatState[beatIdx]?.status;
                                return s === 'complete' || s === 'skipped';
                            });

                        if (isNext) return `<span class="beat-current" title="${beat.title}">→</span>`;
                        return `<span class="beat-pending" title="${beat.title}">□</span>`;

                    } else {
                        // Story Mode - use unified accessor
                        if (completedBeats.includes(idx)) return `<span class="beat-done">✓</span>`;
                        if (idx === currentBeatIndex) return `<span class="beat-current">→</span>`;
                        return `<span class="beat-pending">□</span>`;
                    }
                }).join(' ');

                beatInfo = `
                    <div id="storymode-debug-beats-link" class="storymode-debug-section storymode-debug-interactable" title="Click to view full beat checklist">
                        <div class="storymode-debug-label">Beats <i class="fa-solid fa-list-check"></i></div>
                        <div class="storymode-debug-beats">${beatMarkers}</div>
                        <div class="storymode-debug-meta">${completedBeats.length}/${scene.beats.length} complete</div>
                    </div>
                `;
            }

            // Scene image section
            const imgSettings = settings.imageGeneration || {};
            if (imgSettings.enabled) {
                const sceneImage = ImageStorage.getSceneImage(blueprint.blueprint_id, scene.index);
                const hasImage = !!sceneImage?.imageData;
                const isGenerating = ImageGenerator.isGenerationInProgress();

                imageInfo = `
                    <div id="storymode-debug-image-link" class="storymode-debug-section storymode-debug-interactable" title="Click to view scene image">
                        <div class="storymode-debug-label">Scene Image <i class="fa-solid fa-image"></i></div>
                        ${hasImage
                        ? `<div class="storymode-debug-thumb"><img src="${sceneImage.imageData}" alt="Scene ${scene.index + 1}"></div>`
                        : `<div class="storymode-debug-value">Not generated</div>`
                    }
                        <button id="storymode-generate-image-btn" class="storymode-small-btn" ${isGenerating ? 'disabled' : ''}>
                            <i class="fa-solid ${isGenerating ? 'fa-circle-notch fa-spin' : 'fa-wand-magic-sparkles'}"></i>
                            ${hasImage ? 'Regenerate' : 'Generate'}
                        </button>
                    </div>
                `;
            }
        }
    } else {
        // No blueprint loaded - show helpful message
        noBlueprintNotice = `
            <div class="storymode-debug-section storymode-no-blueprint-notice">
                <div class="storymode-debug-label">
                    <i class="fa-solid fa-info-circle"></i> No Scenario Active
                </div>
                <div class="storymode-debug-value" style="opacity: 0.8; font-size: 0.9em;">
                    No blueprint is loaded for this chat. Create or load a scenario from the Blueprint Library to enable scene tracking, beats, and images.
                </div>
                <button id="storymode-open-library-notice" class="storymode-small-btn" style="margin-top: 8px;">
                    <i class="fa-solid fa-book-bookmark"></i> Open Library
                </button>
            </div>
        `;
    }

    // Get phase info (only for Story Mode)
    let roundInfo = '';
    const pacingMode = getPacingMode();

    // Pacing mode toggle (only show when blueprint is active)
    let modeToggleHtml = '';
    if (blueprintState?.blueprint && blueprintState.useBlueprint) {
        const isScenario = pacingMode === 'scenario';

        modeToggleHtml = `
            <div class="storymode-debug-section storymode-mode-toggle">
                <div class="storymode-debug-label">Pacing Mode</div>
                <div class="storymode-toggle-buttons">
                    <button id="storymode-mode-story"
                            class="storymode-mode-btn ${!isScenario ? 'active' : ''}"
                            title="Round-based progression">
                        <i class="fa-solid fa-clock"></i> Story
                    </button>
                    <button id="storymode-mode-scenario"
                            class="storymode-mode-btn ${isScenario ? 'active' : ''}"
                            title="Signal-based progression">
                        <i class="fa-solid fa-signal"></i> Scenario
                    </button>
                </div>
                <div class="storymode-debug-meta">
                    ${isScenario ? 'Signals drive progression' : 'Rounds drive progression'}
                </div>
            </div>
        `;
    }

    if (pacingMode !== 'scenario') {
        const arcPercent = chatState.arcLength > 0
            ? Math.round((chatState.currentStep / chatState.arcLength) * 100)
            : 0;

        roundInfo = `
        <div class="storymode-debug-section">
            <div class="storymode-debug-label">Round</div>
            <div class="storymode-debug-value storymode-debug-round">${chatState.currentStep}/${chatState.arcLength}</div>
            <div class="storymode-debug-bar">
                <div class="storymode-debug-bar-fill" style="width: ${arcPercent}%"></div>
            </div>
        </div>`;
    } else {
        // In Scenario Mode, show Scene info prominently
        // The sceneInfo block handles the detail, but we might want a "Story Progress" bar based on Scenes?
        const arcPercent = blueprintState?.blueprint?.scene_plan?.length > 0
            ? Math.round(((getCurrentSceneIndex() + 1) / blueprintState.blueprint.scene_plan.length) * 100)
            : 0;

        roundInfo = `
        <div class="storymode-debug-section">
            <div class="storymode-debug-label">Scene</div>
            <div class="storymode-debug-value storymode-debug-round">${getCurrentSceneIndex() + 1}/${blueprintState.blueprint.scene_plan?.length || 0}</div>
             <div class="storymode-debug-bar">
                <div class="storymode-debug-bar-fill" style="width: ${arcPercent}%"></div>
            </div>
        </div>`;
    }

    // Scene summarization section (only when summarization is enabled AND blueprint is active)
    let summaryInfo = '';
    if (settings.blueprintSettings?.summarizationEnabled && blueprintState?.blueprint && blueprintState.useBlueprint) {
        const summarizingIndex = BlueprintModule.getSummarizingSceneIndex();
        const summaries = blueprintState.sceneSummaries || {};
        const summarizedIndices = Object.keys(summaries).map(Number).sort((a, b) => a - b);
        const currentSceneIdx = getCurrentSceneIndex();
        const pendingCount = blueprintState.pendingSummaries?.length || 0;
        const summarizableCount = currentSceneIdx; // Scenes 0 to currentSceneIdx-1 are complete

        let statusText = '';
        let statusIcon = 'fa-file-lines';

        if (summarizingIndex !== null) {
            statusText = `Scene ${summarizingIndex + 1} summary being generated...`;
            statusIcon = 'fa-circle-notch fa-spin';
        } else if (summarizedIndices.length === 0) {
            if (currentSceneIdx === 0) {
                statusText = 'No completed scenes to summarise';
            } else {
                statusText = `${currentSceneIdx} scene(s) awaiting summarization`;
            }
        } else {
            const sceneList = formatSceneList(summarizedIndices);
            statusText = `${sceneList} summarised`;
            if (currentSceneIdx > summarizedIndices.length) {
                const awaitingCount = currentSceneIdx - summarizedIndices.length;
                statusText += `, ${awaitingCount} awaiting`;
            }
        }

        if (pendingCount > 0) {
            statusText += ` (${pendingCount} retry pending)`;
        }

        // Get next auto-summary info
        const nextSummaryInfo = BlueprintModule.getNextAutoSummaryInfo(blueprintState, settings);
        const nextSummaryText = nextSummaryInfo.message || '';

        summaryInfo = `
            <div id="storymode-debug-summary-link" class="storymode-debug-section storymode-debug-interactable" title="Click to view/edit scene summaries">
                <div class="storymode-debug-label">Summaries <i class="fa-solid fa-magnifying-glass"></i></div>
                <div class="storymode-debug-value"><i class="fa-solid ${statusIcon}"></i> ${escapeHtml(statusText)}</div>
                <div class="storymode-debug-meta">${summarizedIndices.length} of ${summarizableCount} past scenes</div>
                ${nextSummaryText ? `<div class="storymode-debug-hint"><i class="fa-solid fa-clock"></i> ${escapeHtml(nextSummaryText)}</div>` : ''}
            </div>
        `;
    }

    // OOC (Out of Context) panel - check if it should be rolled up
    const oocRolledUp = settings.oocPanelRolledUp !== false; // Default to rolled up
    const oocContent = settings.oocText || '';

    const oocPanelHtml = `
        <div class="storymode-debug-section storymode-ooc-panel ${oocRolledUp ? 'sm-ooc-rolled-up' : ''}">
            <div class="storymode-ooc-header" id="storymode-ooc-header" title="Click to expand/collapse">
                <div class="storymode-debug-label">
                    <i class="fa-solid fa-comment-dots"></i> Out of Context Command
                </div>
                <button class="storymode-ooc-toggle" title="Toggle OOC panel">
                    <i class="fa-solid ${oocRolledUp ? 'fa-chevron-down' : 'fa-chevron-up'}"></i>
                </button>
            </div>
            <div class="storymode-ooc-content">
                <textarea id="storymode-ooc-textarea"
                          class="storymode-ooc-textarea"
                          placeholder="Enter an OOC instruction for the AI (e.g., 'move quickly to the next scene', 'focus on Julie's perspective')...">${escapeHtml(oocContent)}</textarea>
                <div class="storymode-ooc-hint">
                    <i class="fa-solid fa-info-circle"></i> This instruction will be added to all story prompts until cleared
                </div>
                <div class="storymode-ooc-actions">
                    <button id="storymode-ooc-clear-btn" class="storymode-ooc-clear-btn" title="Clear OOC text">
                        <i class="fa-solid fa-trash"></i> Clear
                    </button>
                </div>
            </div>
        </div>
    `;

    return `
        ${roundInfo}
        ${modeToggleHtml}
        ${noBlueprintNotice}
        ${sceneInfo}
        ${beatInfo}
        ${summaryInfo}
        ${imageInfo}
        ${oocPanelHtml}
    `;
}

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
 * Create the docked drawer element.
 * @returns {jQuery} The drawer element
 */
function createDockedDrawer() {
    const drawerHtml = `
        <div id="storymode-controller-drawer" class="drawer">
            <div id="storymode-drawer-toggle" class="drawer-toggle drawer-header" title="Story Controller">
                <div class="drawer-icon fa-solid fa-book-open fa-fw closedIcon"></div>
            </div>
            <div class="drawer-content closedDrawer fillRight">
                <div class="storymode-docked-header">
                    <h3>Story Controller</h3>
                    <div class="storymode-docked-header-actions">
                        <button id="storymode-prompt-inspector-drawer" class="storymode-docked-action-btn" title="View prompt injection">
                            <i class="fa-solid fa-code"></i>
                        </button>
                        <button id="storymode-library-btn-drawer" class="storymode-docked-action-btn" title="Open Blueprint Library">
                            <i class="fa-solid fa-book-bookmark"></i>
                        </button>
                        <button id="storymode-settings-btn-drawer" class="storymode-docked-action-btn" title="Open Story Mode Settings">
                            <i class="fa-solid fa-cog"></i>
                        </button>
                        <button id="storymode-dock-toggle-drawer" class="storymode-docked-action-btn" title="Undock panel">
                            <i class="fa-solid fa-window-restore"></i>
                        </button>
                    </div>
                </div>
                <div class="storymode-drawer-content-inner">
                    <!-- Content injected here -->
                </div>
            </div>
        </div>
    `;

    // Insert after extensions button (or before persona management) matches user request "full draw width"
    // Finding the right place in DOM: #rightNavHolder is the container. 
    // We want it to be a sibling of other .drawer elements in #top-settings-holder.
    const drawer = $(drawerHtml);
    $('#persona-management-button').before(drawer);

    // Bind toggle event (toggle is inside drawer)
    drawer.find('.drawer-toggle').on('click', function () {
        // Toggle this drawer
        // Use sibling selector as we are inside the structure now
        const content = $(this).siblings('.drawer-content');
        const icon = $(this).find('.drawer-icon');

        if (content.hasClass('closedDrawer')) {
            // Open: Close other drawers first
            $('.drawer-content').addClass('closedDrawer').removeClass('openDrawer');
            $('.drawer-icon').addClass('closedIcon');

            content.removeClass('closedDrawer').addClass('openDrawer');
            icon.removeClass('closedIcon');
        } else {
            // Close
            content.addClass('closedDrawer').removeClass('openDrawer');
            icon.addClass('closedIcon');
        }
    });

    return drawer;
}

/**
 * Bind events for the docked drawer content
 */
function bindDockedContentEvents(drawer) {
    // Shared events
    const content = drawer.find('.storymode-drawer-content-inner');

    // Unbind previous handlers to prevent duplicates
    content.off('click');
    content.off('input');

    // Detail popup handlers (delegated)
    content.on('click', '#storymode-debug-scene-link', () => {
        console.log('[Story Mode] Scene link clicked (docked)');
        showDebugDetailPopup('scene');
    });
    content.on('click', '#storymode-debug-beats-link', () => showDebugDetailPopup('beats'));
    content.on('click', '#storymode-debug-summary-link', () => showSummaryPopup());

    // Image handlers
    content.on('click', '#storymode-debug-image-link', (e) => {
        // Prevent if clicking button
        if ($(e.target).closest('button').length) return;
        handleImageSectionClick(e);
    });
    content.on('click', '#storymode-generate-image-btn', handleGenerateImage);

    // No blueprint notice - open library button
    content.on('click', '#storymode-open-library-notice', () => openBlueprintLibrary());

    // Pacing mode toggle (docked)
    content.on('click', '#storymode-mode-story', async function () {
        if (getPacingMode() === 'story') return;
        await switchPacingMode('story');
    });

    content.on('click', '#storymode-mode-scenario', async function () {
        if (getPacingMode() === 'scenario') return;
        await switchPacingMode('scenario');
    });

    // Dock toggle
    drawer.find('#storymode-dock-toggle-drawer').on('click', function () {
        toggleDockMode();
    });

    // Header action buttons (docked)
    drawer.find('#storymode-prompt-inspector-drawer').on('click', () => showPromptInspector());
    drawer.find('#storymode-library-btn-drawer').on('click', () => openBlueprintLibrary());
    drawer.find('#storymode-settings-btn-drawer').on('click', () => openStoryModeSettings());

    // OOC panel toggle (docked)
    content.on('click', '#storymode-ooc-header, .storymode-ooc-toggle', function (e) {
        e.stopPropagation();
        const oocPanel = content.find('.storymode-ooc-panel');
        const isRolledUp = oocPanel.hasClass('sm-ooc-rolled-up');

        if (isRolledUp) {
            oocPanel.removeClass('sm-ooc-rolled-up');
            extension_settings[MODULE_NAME].oocPanelRolledUp = false;
        } else {
            oocPanel.addClass('sm-ooc-rolled-up');
            extension_settings[MODULE_NAME].oocPanelRolledUp = true;
        }

        // Update icon
        const icon = content.find('.storymode-ooc-toggle i');
        icon.toggleClass('fa-chevron-down', !isRolledUp);
        icon.toggleClass('fa-chevron-up', isRolledUp);

        saveSettingsDebounced();
    });

    // OOC clear button (docked)
    content.on('click', '#storymode-ooc-clear-btn', function () {
        const textarea = content.find('#storymode-ooc-textarea');
        textarea.val('');
        extension_settings[MODULE_NAME].oocText = '';
        saveSettingsDebounced();
        updateStoryPrompt(); // Update prompt immediately
    });

    // Save OOC text on input (docked, debounced update)
    let oocUpdateTimeoutDocked = null;
    content.on('input', '#storymode-ooc-textarea', function () {
        extension_settings[MODULE_NAME].oocText = $(this).val();
        saveSettingsDebounced();

        // Debounce prompt updates to avoid excessive updates while typing
        clearTimeout(oocUpdateTimeoutDocked);
        oocUpdateTimeoutDocked = setTimeout(() => {
            updateStoryPrompt();
        }, 500);
    });
}


// ============================================================================
// EVENT HANDLING
// ============================================================================

/**
 * Switch pacing mode with confirmation
 * @param {string} newMode - 'story' or 'scenario'
 */
async function switchPacingMode(newMode) {
    const currentMode = getPacingMode();

    // Confirm mode switch
    const modeNames = { story: 'Story Mode (round-based)', scenario: 'Scenario Mode (signal-based)' };
    const confirmed = confirm(
        `Switch from ${modeNames[currentMode]} to ${modeNames[newMode]}?\n\n` +
        (newMode === 'scenario'
            ? 'Scenario Mode: LLM signals (@@BEAT:N@@, @@NEXT_SCENE@@) control progression.'
            : 'Story Mode: User messages increment rounds, scenes advance by time.')
    );

    if (!confirmed) return;

    setPacingMode(newMode);

    // Refresh UI
    updateControllerPanel();
    if (window.updateWandMenuStatus) window.updateWandMenuStatus();
    if (window.updateStoryPrompt) window.updateStoryPrompt();

    if (window.toastr) {
        toastr.info(`Switched to ${modeNames[newMode]}`);
    }
}

/**
 * Bind events to the panel elements
 * @param {jQuery} panel - The panel element
 * @param {Object} settings - Extension settings
 */
function bindPanelEvents(panel, settings) {
    // Double-click to roll up
    panel.find('.storymode-debug-header').on('dblclick', function () {
        const isRolledUp = panel.hasClass('sm-rolled-up');
        if (isRolledUp) {
            panel.removeClass('sm-rolled-up');
            extension_settings[MODULE_NAME].debugPanelRolledUp = false;
        } else {
            panel.addClass('sm-rolled-up');
            extension_settings[MODULE_NAME].debugPanelRolledUp = true;
        }
        saveSettingsDebounced();
    });

    // Detail popup handlers
    panel.on('click', '#storymode-debug-scene-link', () => {
        console.log('[Story Mode] Scene link clicked (floating)');
        showDebugDetailPopup('scene');
    });
    panel.on('click', '#storymode-debug-beats-link', () => showDebugDetailPopup('beats'));
    panel.on('click', '#storymode-debug-summary-link', () => showSummaryPopup());
    panel.on('click', '#storymode-prompt-inspector', () => showPromptInspector());
    panel.on('click', '#storymode-library-btn', () => openBlueprintLibrary());
    panel.on('click', '#storymode-settings-btn', () => openStoryModeSettings());
    panel.on('click', '#storymode-debug-image-link', handleImageSectionClick);
    panel.on('click', '#storymode-generate-image-btn', handleGenerateImage);

    // No blueprint notice - open library button
    panel.on('click', '#storymode-open-library-notice', () => openBlueprintLibrary());

    // Pacing mode toggle
    panel.on('click', '#storymode-mode-story', async function () {
        if (getPacingMode() === 'story') return;
        await switchPacingMode('story');
    });

    panel.on('click', '#storymode-mode-scenario', async function () {
        if (getPacingMode() === 'scenario') return;
        await switchPacingMode('scenario');
    });

    // OOC panel toggle
    panel.on('click', '#storymode-ooc-header, .storymode-ooc-toggle', function (e) {
        e.stopPropagation();
        const oocPanel = panel.find('.storymode-ooc-panel');
        const isRolledUp = oocPanel.hasClass('sm-ooc-rolled-up');

        if (isRolledUp) {
            oocPanel.removeClass('sm-ooc-rolled-up');
            extension_settings[MODULE_NAME].oocPanelRolledUp = false;
        } else {
            oocPanel.addClass('sm-ooc-rolled-up');
            extension_settings[MODULE_NAME].oocPanelRolledUp = true;
        }

        // Update icon
        const icon = panel.find('.storymode-ooc-toggle i');
        icon.toggleClass('fa-chevron-down', !isRolledUp);
        icon.toggleClass('fa-chevron-up', isRolledUp);

        saveSettingsDebounced();
    });

    // OOC clear button
    panel.on('click', '#storymode-ooc-clear-btn', function () {
        const textarea = panel.find('#storymode-ooc-textarea');
        textarea.val('');
        extension_settings[MODULE_NAME].oocText = '';
        saveSettingsDebounced();
        updateStoryPrompt(); // Update prompt immediately
    });

    // Save OOC text on input (debounced update)
    let oocUpdateTimeout = null;
    panel.on('input', '#storymode-ooc-textarea', function () {
        extension_settings[MODULE_NAME].oocText = $(this).val();
        saveSettingsDebounced();

        // Debounce prompt updates to avoid excessive updates while typing
        clearTimeout(oocUpdateTimeout);
        oocUpdateTimeout = setTimeout(() => {
            updateStoryPrompt();
        }, 500);
    });

    // Restore saved position
    if (settings.debugPanelPosition) {
        panel.css({
            top: settings.debugPanelPosition.top,
            bottom: 'auto',
            left: settings.debugPanelPosition.left,
            right: 'auto'
        });
    }

    // Close button
    panel.find('#storymode-debug-close').on('click', () => {
        extension_settings[MODULE_NAME].debugPanelEnabled = false;
        saveSettingsDebounced();
        panel.remove();
        // Sync settings dialog if open (requires global access or event)
        $('#debug_panel_enabled').prop('checked', false);
        // Update wand menu to reflect controller is hidden
        if (typeof window.updateWandMenuStatus === 'function') {
            window.updateWandMenuStatus();
        }
    });

    // Dock toggle
    panel.find('#storymode-dock-toggle').on('click', () => {
        toggleDockMode();
    });

    // Drag functionality
    makeDraggable(panel, panel.find('.storymode-debug-header'), 'debugPanelDrag', (rect) => {
        extension_settings[MODULE_NAME].debugPanelPosition = {
            left: rect.left + 'px',
            top: rect.top + 'px'
        };
        saveSettingsDebounced();
    }, '#storymode-debug-close');
}

/**
 * Toggle the panel between docked and floating modes.
 */
function toggleDockMode() {
    const settings = extension_settings[MODULE_NAME];
    settings.debugPanelDocked = !settings.debugPanelDocked;
    saveSettingsDebounced();
    updateControllerPanel();
}

/**
 * Handle click on image section (show preview if clicking outside button).
 * @param {jQuery.Event} e - Click event
 */
function handleImageSectionClick(e) {
    // Don't trigger if clicking the generate button
    if ($(e.target).closest('#storymode-generate-image-btn').length) {
        return;
    }

    const chatState = getChatStoryState();
    const blueprintState = BlueprintModule.getBlueprintState();

    if (!blueprintState?.blueprint) {
        if (window.toastr) toastr.info('No active scenario.');
        return;
    }

    const scene = BlueprintModule.getCurrentScene(
        blueprintState.blueprint,
        chatState.currentStep,
        chatState.arcLength,
        blueprintState.sceneMode || 'auto',
        getCurrentSceneIndex()
    );

    if (!scene) {
        if (window.toastr) toastr.info('Current scene not found.');
        return;
    }

    ImagePreview.showImagePreviewPopup(scene.index);
}

/**
 * Handle click on generate/regenerate button.
 * @param {jQuery.Event} e - Click event
 */
async function handleGenerateImage(e) {
    e.stopPropagation(); // Prevent triggering parent click handler
    const btn = $(e.currentTarget);
    if (btn.prop('disabled')) return;

    const chatState = getChatStoryState();
    const blueprintState = BlueprintModule.getBlueprintState();

    if (!blueprintState?.blueprint) {
        if (window.toastr) toastr.info('No active scenario.');
        return;
    }

    const scene = BlueprintModule.getCurrentScene(
        blueprintState.blueprint,
        chatState.currentStep,
        chatState.arcLength,
        blueprintState.sceneMode || 'auto',
        getCurrentSceneIndex()
    );

    if (!scene) {
        if (window.toastr) toastr.info('Current scene not found.');
        return;
    }

    const originalHtml = btn.html();
    btn.prop('disabled', true);
    btn.html('<i class="fa-solid fa-circle-notch fa-spin"></i> Generating...');


    try {
        const result = await ImageGenerator.generateSceneImage(scene, blueprintState.blueprint);

        if (result.success) {
            if (window.toastr) toastr.success('Scene image generated successfully');
            // Refresh the panel to show the thumbnail
            updateControllerPanel();
        } else {
            if (window.toastr) toastr.error(`Generation failed: ${result.error}`);
        }
    } catch (error) {
        console.error('[Controller Panel] Image generation error:', error);
        if (window.toastr) toastr.error(`Generation error: ${error.message}`);
    } finally {
        btn.prop('disabled', false);
        btn.html(originalHtml);
    }
}

/**
 * Generic drag and drop handler
 * @param {jQuery} element - The element to move
 * @param {jQuery} handle - The handle element to drag by
 * @param {string} namespace - Event namespace suffix
 * @param {Function} [onDragEnd] - Optional callback when drag ends (with rect)
 * @param {string} [excludeSelector] - Optional selector to exclude from drag start
 */
function makeDraggable(element, handle, namespace, onDragEnd, excludeSelector) {
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let elementStartX = 0;
    let elementStartY = 0;

    handle.css('cursor', 'grab');

    handle.on('mousedown', function (e) {
        // Only start drag on left click
        if (e.button !== 0) return;

        // Check exclusions (e.g. close buttons)
        if (excludeSelector && $(e.target).closest(excludeSelector).length) return;

        // Also exclude any native buttons unless they are the handle itself
        if ($(e.target).closest('button').length && $(e.target).closest('button')[0] !== handle[0]) return;

        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;

        const rect = element[0].getBoundingClientRect();
        elementStartX = rect.left;
        elementStartY = rect.top;

        element.addClass('dragging');
        handle.css('cursor', 'grabbing');
        e.preventDefault();
    });

    $(document).on(`mousemove.${namespace}`, function (e) {
        if (!isDragging) return;

        const deltaX = e.clientX - dragStartX;
        const deltaY = e.clientY - dragStartY;

        let newLeft = elementStartX + deltaX;
        let newTop = elementStartY + deltaY;

        // Constrain to viewport
        const elWidth = element.outerWidth();
        const elHeight = element.outerHeight();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        newLeft = Math.max(0, Math.min(newLeft, viewportWidth - elWidth));
        newTop = Math.max(0, Math.min(newTop, viewportHeight - elHeight));

        element.css({
            left: newLeft + 'px',
            top: newTop + 'px',
            right: 'auto',
            bottom: 'auto'
        });
    });

    $(document).on(`mouseup.${namespace}`, function () {
        if (!isDragging) return;

        isDragging = false;
        element.removeClass('dragging');
        handle.css('cursor', 'grab');

        if (onDragEnd) {
            onDragEnd(element[0].getBoundingClientRect());
        }
    });

    // Cleanup helper attached to the element for easier removal
    element.data('cleanupDrag', () => {
        $(document).off(`mousemove.${namespace}`);
        $(document).off(`mouseup.${namespace}`);
    });
}

// ============================================================================
// POPUPS & INSPECTORS
// ============================================================================

/**
 * Open the Blueprint Library dialog.
 */
function openBlueprintLibrary() {
    if (typeof window.showStoryModeSettings === 'function') {
        window.showStoryModeSettings('library');
    } else {
        console.error('[Controller Panel] showStoryModeSettings not available');
        if (window.toastr) toastr.error('Failed to open library');
    }
}

/**
 * Open the Story Mode Settings dialog.
 */
function openStoryModeSettings() {
    if (typeof window.showStoryModeSettings === 'function') {
        window.showStoryModeSettings('genre-style');
    } else {
        console.error('[Controller Panel] showStoryModeSettings not available');
        if (window.toastr) toastr.error('Failed to open settings');
    }
}

/**
 * Show the Prompt Inspector panel with current and next prompt
 */
function showPromptInspector() {
    // Remove any existing inspector
    $('.storymode-prompt-inspector').remove();

    const chatState = getChatStoryState();

    // Get current prompt
    const currentPrompt = buildFullInjection(false) || '(No prompt - Story Mode may be disabled or no scenario active)';

    // Get next prompt by simulating next step
    let nextPrompt = '';
    if (chatState.currentStep < chatState.arcLength) {
        const originalStep = chatState.currentStep;
        chatState.currentStep = originalStep + 1;
        nextPrompt = buildFullInjection(true) || '(No prompt for next step)';
        chatState.currentStep = originalStep; // Restore
    } else {
        nextPrompt = '(Story arc complete - no further prompts)';
    }

    // Simple XML syntax highlighting
    function highlightXml(text) {
        return escapeHtml(text)
            .replace(/&lt;(\/?)([a-zA-Z_][a-zA-Z0-9_]*)([^&]*?)&gt;/g,
                '<span class="xml-tag">&lt;$1$2$3&gt;</span>')
            .replace(/(\w+)=&quot;([^&]*)&quot;/g,
                '<span class="xml-attr">$1</span>=<span class="xml-value">"$2"</span>');
    }

    const contentHtml = `
        <div class="storymode-prompt-inspector-header">
            <i class="fa-solid fa-code"></i>
            <span>Prompt Inspector</span>
            <button class="storymode-prompt-inspector-close"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="storymode-prompt-tabs">
            <button class="storymode-prompt-tab active" data-tab="current">Current Prompt</button>
            <button class="storymode-prompt-tab" data-tab="next">Next Prompt</button>
        </div>
        <div class="storymode-prompt-content">
            <div class="storymode-prompt-panel" data-panel="current">
                <pre class="storymode-prompt-code">${highlightXml(currentPrompt)}</pre>
            </div>
            <div class="storymode-prompt-panel" data-panel="next" style="display: none;">
                <pre class="storymode-prompt-code">${highlightXml(nextPrompt)}</pre>
            </div>
        </div>
    `;

    const inspector = $(`<div class="storymode-prompt-inspector">${contentHtml}</div>`);
    $('body').append(inspector);

    // Tab switching
    inspector.on('click', '.storymode-prompt-tab', function () {
        const tab = $(this).data('tab');
        inspector.find('.storymode-prompt-tab').removeClass('active');
        $(this).addClass('active');
        inspector.find('.storymode-prompt-panel').hide();
        inspector.find(`.storymode-prompt-panel[data-panel="${tab}"]`).show();
    });

    const cleanupInspector = () => {
        $(document).off('keydown.promptInspector');
        $(document).off('click.promptInspector');
        if (inspector.data('cleanupDrag')) inspector.data('cleanupDrag')();
        inspector.remove();
    };

    inspector.find('.storymode-prompt-inspector-close').on('click', cleanupInspector);
    $(document).on('keydown.promptInspector', (e) => {
        if (e.key === 'Escape') cleanupInspector();
    });

    // Draggable
    makeDraggable(inspector, inspector.find('.storymode-prompt-inspector-header'), 'promptInspectorDrag', null, '.storymode-prompt-inspector-close');
}

/**
 * Show a detailed popout panel for scene or beats
 */
function showDebugDetailPopup(type) {
    const chatState = getChatStoryState();
    const blueprintState = BlueprintModule.getBlueprintState();

    if (!blueprintState?.blueprint) {
        if (window.toastr) toastr.info('No active scenario to show details for.');
        return;
    }

    const blueprint = blueprintState.blueprint;
    const scene = BlueprintModule.getCurrentScene(
        blueprint,
        chatState.currentStep,
        chatState.arcLength,
        blueprintState.sceneMode || 'auto',
        getCurrentSceneIndex()
    );

    if (!scene) {
        if (window.toastr) toastr.info('Current scene not found.');
        return;
    }

    // Remove any existing popout
    $('.storymode-scene-popout').remove();

    const completedBeats = BlueprintModule.getCompletedBeats(scene.index);
    const totalScenes = blueprint.scene_plan.length;
    const isFinalScene = scene.index >= totalScenes - 1;

    let contentHtml = '';

    if (type === 'scene') {
        const situationHtml = scene.situation
            ? `<div class="storymode-popout-section">
                <h4><i class="fa-solid fa-location-dot"></i> Situation</h4>
                <p>${escapeHtml(scene.situation)}</p>
            </div>` : '';

        const purposeHtml = scene.purpose
            ? `<div class="storymode-popout-section">
                <h4><i class="fa-solid fa-bullseye"></i> Purpose</h4>
                <p>${escapeHtml(scene.purpose)}</p>
            </div>` : '';

        const keyEventsHtml = (scene.key_events_if_unchallenged?.length > 0)
            ? `<div class="storymode-popout-section">
                <h4><i class="fa-solid fa-bolt"></i> Key Events</h4>
                <ul>${scene.key_events_if_unchallenged.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul>
            </div>` : '';

        const characterFocusHtml = (scene.character_focus?.length > 0)
            ? `<div class="storymode-popout-section">
                <h4><i class="fa-solid fa-users"></i> Character Focus</h4>
                <ul>${scene.character_focus.map(cf => `<li><strong>${escapeHtml(cf.name)}:</strong> ${escapeHtml(cf.emotional_beat_target || cf.focus || '')}</li>`).join('')}</ul>
            </div>` : '';

        const beatsComplete = scene.beats ? completedBeats.length >= scene.beats.length : true;
        const exitTrigger = scene.purpose || 'scene purpose fulfilled';

        const checklistItems = [];
        if (scene.beats?.length > 0) {
            checklistItems.push({
                label: `Beats completed: ${completedBeats.length}/${scene.beats.length}`,
                complete: beatsComplete
            });
        }
        checklistItems.push({
            label: `Exit trigger: ${exitTrigger}`,
            complete: false
        });

        const checklistHtml = `<div class="storymode-popout-section">
            <h4><i class="fa-solid fa-clipboard-check"></i> Scene Completion</h4>
            <div class="storymode-popout-checklist">
                ${checklistItems.map(item => `
                    <div class="storymode-popout-checklist-item ${item.complete ? 'complete' : 'pending'}">
                        <span class="storymode-popout-checklist-icon ${item.complete ? 'complete' : 'pending'}">
                            ${item.complete ? '<i class="fa-solid fa-circle-check"></i>' : '<i class="fa-regular fa-circle"></i>'}
                        </span>
                        <span class="storymode-popout-checklist-text">${escapeHtml(item.label)}</span>
                    </div>
                `).join('')}
            </div>
        </div>`;

        let nextSceneHtml = '';
        if (!isFinalScene) {
            const nextScene = blueprint.scene_plan[scene.index + 1];
            if (nextScene) {
                nextSceneHtml = `<div class="storymode-popout-section">
                    <h4><i class="fa-solid fa-forward"></i> Next Scene</h4>
                    <div class="storymode-next-scene-preview">
                        <h5><i class="fa-solid fa-arrow-right"></i> ${escapeHtml(nextScene.title)} <span style="opacity:0.6;">(${nextScene.phase})</span></h5>
                        <p>${escapeHtml(nextScene.purpose || nextScene.situation || 'Continue the story')}</p>
                    </div>
                </div>`;
            }
        } else {
            nextSceneHtml = `<div class="storymode-popout-section">
                <h4><i class="fa-solid fa-flag-checkered"></i> Final Scene</h4>
                <p style="color: var(--sm-accent);">This is the last scene. Use @@STORY_COMPLETE@@ when finished.</p>
            </div>`;
        }

        const metaHtml = `<div class="storymode-popout-section">
            <div class="storymode-popout-meta">
                <div class="storymode-popout-meta-item">
                    <span class="storymode-popout-meta-label">Phase</span>
                    <span class="storymode-popout-meta-value">${scene.phase || 'Unknown'}</span>
                </div>
                <div class="storymode-popout-meta-item">
                    <span class="storymode-popout-meta-label">Scene</span>
                    <span class="storymode-popout-meta-value">${scene.index + 1} of ${totalScenes}</span>
                </div>
                <div class="storymode-popout-meta-item">
                    <span class="storymode-popout-meta-label">Beats</span>
                    <span class="storymode-popout-meta-value">${completedBeats.length}/${scene.beats?.length || 0}</span>
                </div>
            </div>
        </div>`;

        contentHtml = `
            <div class="storymode-scene-popout-header">
                <i class="fa-solid fa-scroll"></i>
                <span>Scene ${scene.index + 1}: ${escapeHtml(scene.title)}</span>
                <button class="storymode-scene-popout-close"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="storymode-scene-popout-body">
                ${metaHtml}
                ${situationHtml}
                ${purposeHtml}
                ${keyEventsHtml}
                ${characterFocusHtml}
                ${checklistHtml}
                ${nextSceneHtml}
            </div>
        `;
    } else if (type === 'beats') {
        const beatsHtml = (scene.beats || []).map((beat, idx) => {
            const isDone = completedBeats.includes(idx);
            const isCurrent = idx === Math.min(completedBeats.length, scene.beats.length - 1) && !isDone;
            const statusClass = isDone ? 'complete' : (isCurrent ? 'pending' : '');
            const icon = isDone ? '<i class="fa-solid fa-circle-check"></i>' : (isCurrent ? '<i class="fa-solid fa-arrow-right"></i>' : '<i class="fa-regular fa-circle"></i>');

            return `
                <div class="storymode-popout-checklist-item ${statusClass}">
                    <span class="storymode-popout-checklist-icon ${statusClass}">${icon}</span>
                    <span class="storymode-popout-checklist-text">
                        <strong>Beat ${idx}:</strong> ${escapeHtml(typeof beat === 'object' ? (beat.title || beat.description || JSON.stringify(beat)) : beat)}
                    </span>
                </div>
            `;
        }).join('');

        contentHtml = `
            <div class="storymode-scene-popout-header">
                <i class="fa-solid fa-list-check"></i>
                <span>Beats: ${escapeHtml(scene.title)}</span>
                <button class="storymode-scene-popout-close"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="storymode-scene-popout-body">
                <div class="storymode-popout-section">
                    <div class="storymode-popout-checklist">
                        ${beatsHtml}
                    </div>
                </div>
                <p class="storymode-form-hint" style="margin-top: 10px; opacity: 0.7;">
                    <i class="fa-solid fa-info-circle"></i> LLM marks beats using <code>@@BEAT:0@@</code>, <code>@@BEAT:1@@</code>, etc.
                </p>
            </div>
        `;
    }

    const popout = $(`<div class="storymode-scene-popout">${contentHtml}</div>`);
    $('body').append(popout);

    const cleanupPopout = () => {
        $(document).off('keydown.scenePopout');
        $(document).off('click.scenePopout');
        if (popout.data('cleanupDrag')) popout.data('cleanupDrag')();
        popout.remove();
    };

    popout.find('.storymode-scene-popout-close').on('click', cleanupPopout);
    $(document).on('keydown.scenePopout', (e) => {
        if (e.key === 'Escape') cleanupPopout();
    });

    setTimeout(() => {
        $(document).on('click.scenePopout', (e) => {
            if (!$(e.target).closest('.storymode-scene-popout, .storymode-debug-panel').length) {
                cleanupPopout();
            }
        });
    }, 100);

    makeDraggable(popout, popout.find('.storymode-scene-popout-header'), 'popoutDrag', null, '.storymode-scene-popout-close');
}

/**
 * Show the summary viewer/editor popup
 */
function showSummaryPopup() {
    const blueprintState = BlueprintModule.getBlueprintState();

    if (!blueprintState?.blueprint) {
        if (window.toastr) toastr.info('No active scenario.');
        return;
    }

    // Remove existing popup
    $('.storymode-summary-popout').remove();

    const summaries = blueprintState.sceneSummaries || {};
    const scenes = blueprintState.blueprint.scene_plan || [];
    const currentSceneIdx = getCurrentSceneIndex();
    const summarizingIndex = BlueprintModule.getSummarizingSceneIndex();

    // Build summary cards for each completed scene (scenes before current)
    let summaryCardsHtml = '';

    if (currentSceneIdx === 0) {
        summaryCardsHtml = '<p class="storymode-summary-empty">No completed scenes yet. Summaries are generated after scene transitions.</p>';
    } else {
        summaryCardsHtml = scenes.slice(0, currentSceneIdx).map((scene, idx) => {
            const summary = summaries[idx];
            const hasSummary = !!summary;
            const isGenerating = summarizingIndex === idx;

            return `
                <div class="storymode-summary-card" data-scene-index="${idx}">
                    <div class="storymode-summary-card-header">
                        <span class="storymode-summary-scene-title">
                            <i class="fa-solid ${hasSummary ? 'fa-check-circle' : (isGenerating ? 'fa-circle-notch fa-spin' : 'fa-clock')}"></i>
                            Scene ${idx + 1}: ${escapeHtml(scene.title)}
                        </span>
                        <span class="storymode-summary-timestamp">
                            ${hasSummary ? new Date(summary.timestamp).toLocaleString() : (isGenerating ? 'Generating...' : 'Not summarised')}
                        </span>
                    </div>
                    <div class="storymode-summary-card-body">
                        ${hasSummary
                            ? `<textarea class="storymode-summary-textarea" data-scene-index="${idx}">${escapeHtml(summary.summary)}</textarea>`
                            : `<p class="storymode-summary-placeholder">${isGenerating ? 'Summary generation in progress...' : 'Summary not yet generated'}</p>`
                        }
                    </div>
                    <div class="storymode-summary-card-actions">
                        ${hasSummary
                            ? `<button class="storymode-small-btn storymode-save-summary-btn" data-scene-index="${idx}" disabled>
                                   <i class="fa-solid fa-save"></i> Save
                               </button>`
                            : `<button class="storymode-small-btn storymode-generate-summary-btn" data-scene-index="${idx}" ${isGenerating ? 'disabled' : ''}>
                                   <i class="fa-solid ${isGenerating ? 'fa-circle-notch fa-spin' : 'fa-wand-magic-sparkles'}"></i> ${isGenerating ? 'Generating...' : 'Generate'}
                               </button>`
                        }
                    </div>
                </div>
            `;
        }).join('');
    }

    const contentHtml = `
        <div class="storymode-summary-popout-header">
            <i class="fa-solid fa-file-lines"></i>
            <span>Scene Summaries</span>
            <button class="storymode-summary-popout-close"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="storymode-summary-popout-body">
            ${summaryCardsHtml}
        </div>
    `;

    const popout = $(`<div class="storymode-summary-popout">${contentHtml}</div>`);
    $('body').append(popout);

    // Enable save button when textarea changes
    popout.on('input', '.storymode-summary-textarea', function() {
        const idx = $(this).data('scene-index');
        popout.find(`.storymode-save-summary-btn[data-scene-index="${idx}"]`).prop('disabled', false);
    });

    // Save handler
    popout.on('click', '.storymode-save-summary-btn', async function() {
        const idx = $(this).data('scene-index');
        const newText = popout.find(`.storymode-summary-textarea[data-scene-index="${idx}"]`).val();

        blueprintState.sceneSummaries[idx].summary = newText.trim();
        blueprintState.sceneSummaries[idx].timestamp = new Date().toISOString();
        blueprintState.sceneSummaries[idx].edited = true;

        await BlueprintModule.saveBlueprintState(blueprintState);
        $(this).prop('disabled', true);
        if (window.toastr) toastr.success(`Scene ${idx + 1} summary saved`);
    });

    // Generate handler (manual trigger - uses new function that bypasses threshold)
    popout.on('click', '.storymode-generate-summary-btn', async function() {
        const idx = $(this).data('scene-index');
        const btn = $(this);
        const originalHtml = btn.html();

        btn.prop('disabled', true).html('<i class="fa-solid fa-circle-notch fa-spin"></i> Generating...');

        try {
            const settings = extension_settings[MODULE_NAME];
            await BlueprintModule.manuallyGenerateSummary(idx, blueprintState, settings);
            // Refresh popup content to show the new summary
            showSummaryPopup();
        } catch (error) {
            console.error('[Story Mode] Manual summary generation failed:', error);
            if (window.toastr) toastr.error(`Failed to generate summary: ${error.message}`);
            btn.prop('disabled', false).html(originalHtml);
        }
    });

    // Close handlers
    const cleanupPopout = () => {
        $(document).off('keydown.summaryPopout');
        if (popout.data('cleanupDrag')) popout.data('cleanupDrag')();
        popout.remove();
    };

    popout.find('.storymode-summary-popout-close').on('click', cleanupPopout);
    $(document).on('keydown.summaryPopout', (e) => {
        if (e.key === 'Escape') cleanupPopout();
    });

    makeDraggable(popout, popout.find('.storymode-summary-popout-header'), 'summaryPopoutDrag', null, '.storymode-summary-popout-close');
}
