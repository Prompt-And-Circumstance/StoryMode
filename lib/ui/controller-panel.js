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
    getEffectiveAuthorStyle,
} from '../core/state-manager.js';

import * as BlueprintModule from '../blueprint/module.js';
import * as ImageStorage from '../scene/image-storage.js';
import * as ImageGenerator from '../scene/image-generator.js';
import * as ImagePreview from '../scene/image-preview.js';

import { buildFullInjection, updateStoryPrompt, getPhaseInfo } from '../core/arc-engine.js';
import { escapeHtml } from './component-system.js';
import { getStoryTypes, getAuthorStyles } from '../core/state-manager.js';

// ============================================================================
// GLOBAL EVENT HANDLERS (document-level delegation for dynamic content)
// ============================================================================

let globalHandlersInitialized = false;

function initGlobalHandlers() {
    if (globalHandlersInitialized) return;
    globalHandlersInitialized = true;

    // Window resize handler - auto-switch between docked and floating modes
    let resizeTimeout = null;
    $(window).on('resize.storyModeController', function() {
        // Debounce resize events
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            const settings = extension_settings[MODULE_NAME];
            if (!settings.debugPanelEnabled) return;

            const isNarrowScreen = window.innerWidth <= NARROW_SCREEN_THRESHOLD;
            const wantsDocked = settings.debugPanelDocked || false;

            // If user wants docked but screen is narrow, switch to floating
            // If user wants docked and screen is wide, ensure docked mode
            if (wantsDocked && isNarrowScreen) {
                // Force floating on narrow screens (will be handled by updateControllerPanel)
                updateControllerPanel();
            } else if (wantsDocked && !isNarrowScreen) {
                // Screen is now wide enough for docked mode
                const floatingExists = $('#storymode-debug-panel').length > 0;
                const dockedExists = $('#storymode-sidebar-panel').length > 0;
                if (floatingExists && !dockedExists) {
                    // Was in forced-floating mode, switch back to docked
                    updateControllerPanel();
                }
            }

            // Also re-check RPG Companion coexistence on resize
            setupRpgCompanionCoexistence();
        }, 150);
    });

    // Style description toggle - works for both floating and docked panels
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

        // Save state
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
// Threshold for auto-switching to floating mode on narrow screens
const NARROW_SCREEN_THRESHOLD = 1000;

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
        // Legacy cleanup
        $('#storymode-controller-drawer').remove();
        $('#storymode-drawer-toggle').remove();
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
        // Legacy cleanup
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
 * Update the docked sidebar panel mode.
 * Uses a fixed sidebar similar to RPG Companion for consistent UX.
 */
function updateDockedPanel(settings) {
    // Remove floating panel if exists
    $('#storymode-debug-panel').remove();
    // Remove legacy drawer if exists
    $('#storymode-controller-drawer').remove();
    $('#storymode-drawer-toggle').remove();

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
    const pacingMode = getPacingMode();

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

            // Scene image section - show scene image or fall back to cover
            const imgSettings = settings.imageGeneration || {};
            if (imgSettings.enabled) {
                const sceneImage = ImageStorage.getSceneImage(blueprint.blueprint_id, scene.index);
                const coverImage = ImageStorage.getCoverImage(blueprint.blueprint_id);
                const hasSceneImage = !!sceneImage?.imageData;
                const hasCoverImage = !!coverImage?.imageData;
                const isGenerating = ImageGenerator.isGenerationInProgress();

                // Use scene image if available, otherwise fall back to cover
                const displayImage = hasSceneImage ? sceneImage : (hasCoverImage ? coverImage : null);
                const hasImage = !!displayImage?.imageData;
                const showingCover = !hasSceneImage && hasCoverImage;

                // Different label based on what we're showing
                const imageLabel = showingCover ? 'Cover' : 'Scene Image';
                const altText = showingCover ? 'Cover' : `Scene ${scene.index + 1}`;

                imageInfo = `
                    <div id="storymode-debug-image-link" class="storymode-debug-section storymode-debug-interactable"
                         title="Click to view ${showingCover ? 'cover' : 'scene'} image"
                         data-showing-cover="${showingCover}">
                        <div class="storymode-debug-label">${imageLabel} <i class="fa-solid fa-${showingCover ? 'book-open' : 'image'}"></i></div>
                        ${hasImage
                        ? `<div class="storymode-debug-thumb"><img src="${displayImage.imageData}" alt="${altText}"></div>`
                        : `<div class="storymode-debug-value">Not generated</div>`
                    }
                        <button id="storymode-generate-image-btn" class="storymode-small-btn" ${isGenerating ? 'disabled' : ''}>
                            <i class="fa-solid ${isGenerating ? 'fa-circle-notch fa-spin' : 'fa-wand-magic-sparkles'}"></i>
                            ${hasSceneImage ? 'Regenerate' : 'Generate Scene'}
                        </button>
                    </div>
                `;
            }
        }
    } else if (pacingMode === 'scenario') {
        // No blueprint loaded - show helpful message only in Scenario mode
        noBlueprintNotice = `
            <div class="storymode-debug-section storymode-no-blueprint-notice">
                <div class="storymode-debug-label">
                    <i class="fa-solid fa-info-circle"></i> No Scenario Active
                </div>
                <div class="storymode-debug-value" style="opacity: 0.8; font-size: 0.9em;">
                    Scenario mode requires a blueprint. Create or load a scenario from the Blueprint Library to enable scene tracking, beats, and images.
                </div>
                <button id="storymode-open-library-notice" class="storymode-small-btn" style="margin-top: 8px;">
                    <i class="fa-solid fa-book-bookmark"></i> Open Library
                </button>
            </div>
        `;
    }

    // Get phase info (only for Story Mode)
    let roundInfo = '';

    // Story Type and Author Style info
    let styleInfo = '';
    const storyTypes = getStoryTypes();
    const authorStyles = getAuthorStyles();
    const currentStoryTypeId = chatState.selectedStoryType || 'custom';

    // Use effective author style with source information
    const { styleId: effectiveStyleId, source: styleSource, sourceName: styleSourceName } = getEffectiveAuthorStyle();

    const currentStoryType = storyTypes.find(st => st.id === currentStoryTypeId);
    const currentAuthorStyle = authorStyles.find(as => as.id === effectiveStyleId);

    // Helper to get badge HTML based on source
    function getSourceBadge(source, sourceName) {
        if (source === 'blueprint') {
            return `<span class="override-badge blueprint-badge" title="From blueprint: ${escapeHtml(sourceName)}">
                <i class="fa-solid fa-scroll"></i> ${escapeHtml(sourceName)}
            </span>`;
        } else if (source === 'character') {
            return `<span class="override-badge character-badge" title="From character: ${escapeHtml(sourceName)}">
                <i class="fa-solid fa-user"></i> ${escapeHtml(sourceName)}
            </span>`;
        } else if (source === 'group') {
            return `<span class="override-badge group-badge" title="From group: ${escapeHtml(sourceName)}">
                <i class="fa-solid fa-users"></i> ${escapeHtml(sourceName)}
            </span>`;
        }
        return ''; // 'chat' and 'default' don't show badges
    }

    // Track collapsed state (default to collapsed)
    const storyTypeCollapsed = settings.storyTypeDescCollapsed !== false;
    const authorStyleCollapsed = settings.authorStyleDescCollapsed !== false;

    // Determine what to show based on settings and pacing mode
    // In Scenario Mode, story type/author style come from blueprint
    // In Story Mode, respect the enabled toggles
    const showStoryType = pacingMode === 'scenario'
        ? (currentStoryType) // Scenario Mode: show if set by blueprint
        : (settings.storyTypeEnabled && currentStoryType); // Story Mode: respect toggle
    const showAuthorStyle = settings.authorStyleEnabled && currentAuthorStyle;

    if (showStoryType || showAuthorStyle) {
        // Use storyPrompt for story types and authorPrompt for author styles
        const storyTypeDesc = currentStoryType?.storyPrompt || '';
        const authorStyleDesc = currentAuthorStyle?.authorPrompt || '';

        styleInfo = `
            <div class="storymode-debug-section storymode-style-info">
                ${showStoryType ? `
                    <div class="storymode-style-item">
                        <div class="storymode-style-header" data-style-toggle="storyType">
                            <div class="storymode-debug-label">
                                <i class="fa-solid fa-theater-masks"></i> Story Type
                                ${storyTypeDesc ? `<i class="fa-solid fa-chevron-${storyTypeCollapsed ? 'down' : 'up'} storymode-style-chevron"></i>` : ''}
                            </div>
                            <div class="storymode-debug-value">${escapeHtml(currentStoryType.name)}</div>
                        </div>
                        ${storyTypeDesc ? `
                            <div class="storymode-style-desc ${storyTypeCollapsed ? 'collapsed' : ''}" data-style-desc="storyType">
                                ${escapeHtml(storyTypeDesc)}
                            </div>
                        ` : ''}
                    </div>
                ` : ''}
                ${showAuthorStyle ? `
                    <div class="storymode-style-item">
                        <div class="storymode-style-header" data-style-toggle="authorStyle">
                            <div class="storymode-debug-label">
                                <i class="fa-solid fa-pen-fancy"></i> Author Style
                                ${getSourceBadge(styleSource, styleSourceName)}
                                ${authorStyleDesc ? `<i class="fa-solid fa-chevron-${authorStyleCollapsed ? 'down' : 'up'} storymode-style-chevron"></i>` : ''}
                            </div>
                            <div class="storymode-debug-value">${escapeHtml(currentAuthorStyle.name)}</div>
                        </div>
                        ${authorStyleDesc ? `
                            <div class="storymode-style-desc ${authorStyleCollapsed ? 'collapsed' : ''}" data-style-desc="authorStyle">
                                ${escapeHtml(authorStyleDesc)}
                            </div>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
        `;
    }

    // Pacing mode toggle (always visible)
    const isScenario = pacingMode === 'scenario';
    const hasBlueprint = blueprintState?.blueprint && blueprintState.useBlueprint;

    const modeToggleHtml = `
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

    if (pacingMode !== 'scenario') {
        // Story Mode - only show round info when arc tracking is enabled
        if (settings.storyArcEnabled) {
            const arcPercent = chatState.arcLength > 0
                ? Math.round((chatState.currentStep / chatState.arcLength) * 100)
                : 0;

            // Get phase info for label
            const phaseInfo = getPhaseInfo(chatState.currentStep, chatState.arcLength);
            const phaseLabel = phaseInfo.phase.charAt(0).toUpperCase() + phaseInfo.phase.slice(1);

            roundInfo = `
            <div class="storymode-debug-section">
                <div class="storymode-debug-label">Round <span class="storymode-phase-badge">${phaseLabel}</span></div>
                <div class="storymode-debug-value storymode-debug-round">${chatState.currentStep}/${chatState.arcLength}</div>
                <div class="storymode-debug-bar">
                    <div class="storymode-debug-bar-fill" style="width: ${arcPercent}%"></div>
                </div>
            </div>`;
        } else {
            // Story Mode with arc tracking disabled
            roundInfo = `
            <div class="storymode-debug-section">
                <div class="storymode-debug-label">Arc Tracking</div>
                <div class="storymode-debug-meta">Disabled (Story Type only)</div>
            </div>`;
        }
    } else if (hasBlueprint) {
        // Scenario Mode with blueprint, show Scene info prominently
        const totalScenes = blueprintState.blueprint.scene_plan?.length || 0;
        const arcPercent = totalScenes > 0
            ? Math.round(((getCurrentSceneIndex() + 1) / totalScenes) * 100)
            : 0;

        // Get phase from current scene if available
        const currentScene = blueprintState.blueprint.scene_plan?.[getCurrentSceneIndex()];
        const phaseLabel = currentScene?.phase || 'Unknown';

        roundInfo = `
        <div class="storymode-debug-section">
            <div class="storymode-debug-label">Scene <span class="storymode-phase-badge">${escapeHtml(phaseLabel)}</span></div>
            <div class="storymode-debug-value storymode-debug-round">${getCurrentSceneIndex() + 1}/${totalScenes}</div>
             <div class="storymode-debug-bar">
                <div class="storymode-debug-bar-fill" style="width: ${arcPercent}%"></div>
            </div>
        </div>`;
    }

    // Scene summarization section (only when summarization is enabled AND blueprint is active)
    let summaryInfo = '';
    if (settings.blueprintSettings?.summarizationEnabled && hasBlueprint) {
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

    // Arc History section - collapsible panel if any arc completion content exists
    let arcHistoryInfo = '';
    if (chatState.savedEpilogue || chatState.savedSummary || chatState.savedNextAdventure) {
        const hasEpilogue = !!chatState.savedEpilogue;
        const hasSummary = !!chatState.savedSummary;
        const hasNextAdventure = !!chatState.savedNextAdventure;
        const arcHistoryCollapsed = settings.arcHistoryCollapsed !== false; // Default to collapsed

        const indicators = [];
        if (hasEpilogue) indicators.push('<i class="fa-solid fa-scroll" title="Epilogue"></i>');
        if (hasSummary) indicators.push('<i class="fa-solid fa-file-lines" title="Summary"></i>');
        if (hasNextAdventure) indicators.push('<i class="fa-solid fa-route" title="What\'s Next"></i>');

        const contentItems = [hasEpilogue && 'Epilogue', hasSummary && 'Summary', hasNextAdventure && 'What\'s Next'].filter(Boolean);

        arcHistoryInfo = `
            <div id="storymode-debug-arc-history-link" class="storymode-debug-section storymode-debug-interactable" title="Click to view arc completion content">
                <div class="storymode-debug-label">
                    <i class="fa-solid fa-history"></i> Arc History <i class="fa-solid fa-magnifying-glass"></i>
                </div>
                <div class="storymode-arc-history-indicators">${indicators.join(' ')}</div>
                <div class="storymode-debug-meta">${contentItems.join(', ')}</div>
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

    // In Scenario mode: scene info first, then style info after image
    // In Story mode: style info near top for quick reference
    if (pacingMode === 'scenario') {
        return `
            ${roundInfo}
            ${modeToggleHtml}
            ${noBlueprintNotice}
            ${sceneInfo}
            ${beatInfo}
            ${summaryInfo}
            ${imageInfo}
            ${styleInfo}
            ${arcHistoryInfo}
            ${oocPanelHtml}
        `;
    }

    // Story Mode layout (default)
    return `
        ${roundInfo}
        ${modeToggleHtml}
        ${styleInfo}
        ${noBlueprintNotice}
        ${sceneInfo}
        ${beatInfo}
        ${summaryInfo}
        ${imageInfo}
        ${arcHistoryInfo}
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
 * Check if RPG Companion extension is installed
 * @returns {boolean}
 */
function isRpgCompanionInstalled() {
    return $('#rpg-companion-panel').length > 0 ||
           $('[id^="rpg-"]').length > 0 ||
           typeof window.rpgCompanion !== 'undefined';
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
    const themeSelector = buildThemeSelector(theme);

    const panelHtml = `
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

    const panel = $(panelHtml);

    // Append to body (like RPG Companion does)
    $('body').append(panel);
    console.log('[Story Mode] Sidebar panel appended to body');

    // Detect RPG Companion and set body classes for CSS positioning
    setupRpgCompanionCoexistence();

    // If RPG Companion theme is selected, sync on load
    if (theme === 'rpg-companion') {
        // Delay slightly to ensure RPG Companion panel is rendered
        setTimeout(() => syncWithRpgCompanionTheme(panel), 100);
    }

    // Collapse toggle handler
    panel.find('#storymode-collapse-toggle').on('click', function() {
        const isCurrentlyCollapsed = panel.hasClass('storymode-collapsed');
        const pos = settings.sidebarPosition || 'right';

        if (isCurrentlyCollapsed) {
            panel.removeClass('storymode-collapsed');
            $(this).attr('title', 'Collapse panel');
            // Update chevron direction
            $(this).find('i').removeClass('fa-chevron-left fa-chevron-right')
                .addClass(pos === 'right' ? 'fa-chevron-right' : 'fa-chevron-left');
        } else {
            panel.addClass('storymode-collapsed');
            $(this).attr('title', 'Expand panel');
            // Update chevron direction
            $(this).find('i').removeClass('fa-chevron-left fa-chevron-right')
                .addClass(pos === 'right' ? 'fa-chevron-left' : 'fa-chevron-right');
        }

        // Save state
        extension_settings[MODULE_NAME].sidebarCollapsed = !isCurrentlyCollapsed;
        saveSettingsDebounced();
    });

    // Theme selector handler
    panel.find('.storymode-theme-btn').on('click', function() {
        const newTheme = $(this).data('theme');
        const currentTheme = panel.attr('data-theme');

        if (newTheme === currentTheme) return;

        // For RPG Companion theme, sync with their current theme
        if (newTheme === 'rpg-companion') {
            syncWithRpgCompanionTheme(panel);
        }

        // Update panel theme
        panel.attr('data-theme', newTheme);

        // Update active button state
        panel.find('.storymode-theme-btn').removeClass('active');
        $(this).addClass('active');

        // Save theme preference
        extension_settings[MODULE_NAME].sidebarTheme = newTheme;
        saveSettingsDebounced();

        console.log(`[Story Mode] Sidebar theme changed to: ${newTheme}`);
    });

    return panel;
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

    // Check if RPG Companion is installed AND visible
    if (rpgPanel.length === 0 || !isRpgCompanionVisible()) {
        // RPG Companion not installed or disabled - ensure default positioning
        storyPanel.css('right', '');
        $('body').removeClass('rpg-companion-active rpg-companion-collapsed');
        return;
    }

    console.log('[Story Mode] RPG Companion detected and visible, setting up coexistence');

    // Function to update Story Mode position based on RPG panel state
    const updatePosition = () => {
        const isCollapsed = rpgPanel.hasClass('rpg-collapsed');

        // Get actual RPG panel width for precise positioning
        const rpgWidth = rpgPanel.outerWidth() || (isCollapsed ? 77 : 321);
        const offset = rpgWidth + 'px';

        // Directly set inline styles to override CSS
        storyPanel.css({
            'right': offset
        });

        // Also set body classes for any other CSS that might use them
        $('body')
            .toggleClass('rpg-companion-active', !isCollapsed)
            .toggleClass('rpg-companion-collapsed', isCollapsed);

        console.log(`[Story Mode] RPG Companion ${isCollapsed ? 'collapsed' : 'open'}, width: ${rpgWidth}px, offset: ${offset}`);
    };

    // Initial update
    updatePosition();

    // Watch for RPG Companion collapse state changes using MutationObserver
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                updatePosition();
            }
        });
    });

    observer.observe(rpgPanel[0], { attributes: true, attributeFilter: ['class'] });

    // Store observer for cleanup if needed
    window._storyModeRpgObserver = observer;
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

/**
 * Bind events for the docked sidebar content
 */
function bindDockedContentEvents(panel) {
    // Shared events
    const content = panel.find('.storymode-sidebar-content');

    // Unbind previous handlers to prevent duplicates
    content.off('click');
    content.off('input');

    // Detail popup handlers (delegated)
    content.on('click', '#storymode-debug-scene-link', () => {
        console.log('[Story Mode] Scene link clicked (sidebar)');
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

    // Pacing mode toggle (sidebar)
    content.on('click', '#storymode-mode-story', async function () {
        if (getPacingMode() === 'story') return;
        await switchPacingMode('story');
    });

    content.on('click', '#storymode-mode-scenario', async function () {
        if (getPacingMode() === 'scenario') return;
        await switchPacingMode('scenario');
    });

    // Dock toggle (undock to floating mode)
    panel.find('#storymode-dock-toggle-sidebar').on('click', function () {
        toggleDockMode();
    });

    // Header action buttons (sidebar)
    panel.find('#storymode-prompt-inspector-sidebar').on('click', () => showPromptInspector());
    panel.find('#storymode-library-btn-sidebar').on('click', () => openBlueprintLibrary());
    panel.find('#storymode-settings-btn-sidebar').on('click', () => openStoryModeSettings());

    // Arc History link (sidebar) - click to show popup
    content.on('click', '#storymode-debug-arc-history-link', () => showArcHistoryPopup());

    // OOC panel toggle (sidebar)
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

    // OOC clear button (sidebar)
    content.on('click', '#storymode-ooc-clear-btn', function () {
        const textarea = content.find('#storymode-ooc-textarea');
        textarea.val('');
        extension_settings[MODULE_NAME].oocText = '';
        saveSettingsDebounced();
        updateStoryPrompt(); // Update prompt immediately
    });


    // Save OOC text on input (sidebar, debounced update)
    let oocUpdateTimeoutSidebar = null;
    content.on('input', '#storymode-ooc-textarea', function () {
        extension_settings[MODULE_NAME].oocText = $(this).val();
        saveSettingsDebounced();

        // Debounce prompt updates to avoid excessive updates while typing
        clearTimeout(oocUpdateTimeoutSidebar);
        oocUpdateTimeoutSidebar = setTimeout(() => {
            updateStoryPrompt();
        }, 500);
    });
}


// ============================================================================
// EVENT HANDLING
// ============================================================================

/**
 * Switch pacing mode
 * @param {string} newMode - 'story' or 'scenario'
 */
async function switchPacingMode(newMode) {
    setPacingMode(newMode);

    // Refresh UI
    updateControllerPanel();
    if (window.updateWandMenuStatus) window.updateWandMenuStatus();
    if (window.updateStoryPrompt) window.updateStoryPrompt();
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

    // Arc History link - click to show popup
    panel.on('click', '#storymode-debug-arc-history-link', () => showArcHistoryPopup());

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

    // Check if we're showing cover image (data attribute set in controller panel)
    const imageSection = $(e.target).closest('#storymode-debug-image-link');
    const showingCover = imageSection.data('showing-cover') === true || imageSection.data('showing-cover') === 'true';

    if (showingCover) {
        // Show cover preview
        ImagePreview.showImagePreviewPopup('cover');
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
 * Build epilogue/summary section HTML
 */
function buildTextSection(icon, title, data) {
    const timestamp = data.timestamp ? new Date(data.timestamp).toLocaleString() : 'Unknown';
    return `
        <div class="storymode-arc-history-section">
            <div class="storymode-arc-history-header">
                <h4><i class="fa-solid fa-${icon}"></i> ${title}</h4>
                <span class="storymode-arc-history-timestamp">${escapeHtml(timestamp)}</span>
            </div>
            <div class="storymode-arc-history-content">
                ${escapeHtml(data.text)}
            </div>
        </div>
    `;
}

/**
 * Build themes list HTML
 */
function buildThemesHtml(themes) {
    if (!themes?.length) return '';
    return `
        <div class="storymode-next-adventure-subsection">
            <h5><i class="fa-solid fa-lightbulb"></i> Themes for Continuation</h5>
            <ul class="storymode-theme-list">
                ${themes.map(theme => `
                    <li>
                        <strong>${escapeHtml(theme.title)}</strong> – ${escapeHtml(theme.description)}
                    </li>
                `).join('')}
            </ul>
        </div>
    `;
}

/**
 * Build scenario card HTML
 */
function buildScenarioCard(scenario, idx) {
    const hooksHtml = scenario.hooks?.length ? `
        <div class="storymode-scenario-hooks">
            <strong>Hooks:</strong>
            <ul>
                ${scenario.hooks.map(hook => `<li>${escapeHtml(hook)}</li>`).join('')}
            </ul>
        </div>
    ` : '';

    return `
        <div class="storymode-next-adventure-option">
            <div class="storymode-scenario-header">
                <span class="storymode-scenario-number">${idx + 1}</span>
                <h6>${escapeHtml(scenario.title)}</h6>
                ${scenario.tone ? `<span class="storymode-tone-badge">${escapeHtml(scenario.tone)}</span>` : ''}
            </div>
            <p class="storymode-scenario-premise">${escapeHtml(scenario.premise)}</p>
            ${hooksHtml}
        </div>
    `;
}

/**
 * Build scenarios section HTML
 */
function buildScenariosHtml(scenarios) {
    if (!scenarios?.length) return '';
    return `
        <div class="storymode-next-adventure-subsection">
            <h5><i class="fa-solid fa-masks-theater"></i> Scenario Options</h5>
            <div class="storymode-scenario-cards">
                ${scenarios.map((scenario, idx) => buildScenarioCard(scenario, idx)).join('')}
            </div>
        </div>
    `;
}

/**
 * Build next adventure section HTML
 */
function buildNextAdventureSection(data) {
    const timestamp = data.timestamp ? new Date(data.timestamp).toLocaleString() : 'Unknown';
    const themesHtml = buildThemesHtml(data.themes);
    const scenariosHtml = buildScenariosHtml(data.scenarios);

    return `
        <div class="storymode-arc-history-section">
            <div class="storymode-arc-history-header">
                <h4><i class="fa-solid fa-route"></i> What's Next</h4>
                <span class="storymode-arc-history-timestamp">${escapeHtml(timestamp)}</span>
            </div>
            <div class="storymode-arc-history-content">
                ${themesHtml}
                ${scenariosHtml}
            </div>
        </div>
    `;
}

/**
 * Show the Arc History popup with saved epilogue, summary, and next adventure content
 */
function showArcHistoryPopup() {
    const chatState = getChatStoryState();

    if (!chatState.savedEpilogue && !chatState.savedSummary && !chatState.savedNextAdventure) {
        if (window.toastr) toastr.info('No arc completion content available yet.');
        return;
    }

    $('.storymode-arc-history-popout').remove();

    let sectionsHtml = '';
    if (chatState.savedEpilogue) sectionsHtml += buildTextSection('scroll', 'Epilogue', chatState.savedEpilogue);
    if (chatState.savedSummary) sectionsHtml += buildTextSection('file-lines', 'Summary', chatState.savedSummary);
    if (chatState.savedNextAdventure) sectionsHtml += buildNextAdventureSection(chatState.savedNextAdventure);

    const contentHtml = `
        <div class="storymode-arc-history-popout-header">
            <i class="fa-solid fa-history"></i>
            <span>Arc History</span>
            <button class="storymode-arc-history-popout-close"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="storymode-arc-history-popout-body">
            ${sectionsHtml}
        </div>
    `;

    const popout = $(`<div class="storymode-arc-history-popout">${contentHtml}</div>`);
    $('body').append(popout);

    const cleanupPopout = () => {
        $(document).off('keydown.arcHistoryPopout');
        if (popout.data('cleanupDrag')) popout.data('cleanupDrag')();
        popout.remove();
    };

    popout.find('.storymode-arc-history-popout-close').on('click', cleanupPopout);
    $(document).on('keydown.arcHistoryPopout', (e) => {
        if (e.key === 'Escape') cleanupPopout();
    });

    makeDraggable(popout, popout.find('.storymode-arc-history-popout-header'), 'arcHistoryPopoutDrag', null, '.storymode-arc-history-popout-close');
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
