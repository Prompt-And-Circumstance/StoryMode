/**
 * Main Panel Components for Story Mode Extension
 * Main panel rendering and blueprint preview
 */

import { extension_settings } from '/scripts/extensions.js';

import {
    MODULE_NAME,
    getChatStoryState,
    getStoryTypes,
    getAuthorStyles,
    getCurrentSceneIndex,
    getPacingMode,
} from '../../core/state-manager.js';

import * as BlueprintModule from '../../blueprint/module.js';
import { getBlueprintState } from '../../blueprint/storage.js';
import { getBlueprintCoverUrl } from '../../blueprint/utils.js';

import { escapeHtml } from '../component-system.js';
import {
    resolveAuthorStyleDisplayName,
    analyzeMissingStyles,
    renderInfoCards,
    renderCurrentSceneCard,
} from './blueprint-shared.js';

/**
 * Render scene summaries panel
 * @param {Object} blueprintState - Blueprint state with sceneSummaries
 * @param {number} currentSceneIndex - Current scene index
 * @returns {string} HTML string for scene summaries panel
 */
export function renderSceneSummaries(blueprintState, currentSceneIndex) {
    const summaries = blueprintState?.sceneSummaries;
    if (!summaries || Object.keys(summaries).length === 0) {
        return '';
    }

    const settings = extension_settings[MODULE_NAME];
    if (!settings.blueprintSettings?.summarizationEnabled || !settings.blueprintSettings?.includeSummariesInPrompt) {
        return '';
    }

    // Get summaries for past scenes only (before current scene)
    const pastSummaries = Object.entries(summaries)
        .filter(([sceneIdx]) => parseInt(sceneIdx) < currentSceneIndex)
        .sort(([a], [b]) => parseInt(a) - parseInt(b))
        .slice(-3); // Show last 3 summaries

    if (pastSummaries.length === 0) {
        return '';
    }

    const summaryItems = pastSummaries.map(([sceneIdx, data]) => {
        const truncated = data.summary.length > 120
            ? data.summary.substring(0, 120) + '...'
            : data.summary;

        return `
            <div class="storymode-summary-item" title="${escapeHtml(data.summary)}">
                <div class="storymode-summary-header">
                    <span class="storymode-summary-scene">Scene ${parseInt(sceneIdx) + 1}</span>
                    <span class="storymode-summary-title">${escapeHtml(data.sceneTitle)}</span>
                </div>
                <div class="storymode-summary-text">${escapeHtml(truncated)}</div>
            </div>
        `;
    }).join('');

    return `
        <div class="storymode-summaries-panel">
            <div class="storymode-summaries-header">
                <i class="fa-solid fa-book-open"></i>
                <span>Scene Summaries</span>
                <span class="storymode-summaries-count">${pastSummaries.length} summarized</span>
            </div>
            <div class="storymode-summaries-list">
                ${summaryItems}
            </div>
            <div class="storymode-summaries-note">
                <i class="fa-solid fa-info-circle"></i>
                Injected into AI prompts as additional context
            </div>
        </div>
    `;
}

/**
 * Render beat progress HTML for a scene
 * @param {Object} scene - Scene object with beats array
 * @returns {string} HTML string for beat progress section
 */
export function renderBeatProgress(scene) {
    if (!scene?.beats?.length) return '';

    const completedBeats = BlueprintModule.getCompletedBeats(scene.index);
    const totalBeats = scene.beats.length;
    const completedCount = completedBeats.length;
    const currentBeatIndex = Math.min(completedBeats.length, totalBeats - 1);

    // Status lookup function using early returns
    const getBeatStatus = (idx) => {
        if (completedBeats.includes(idx)) return { icon: '✓', class: 'storymode-beat-completed' };
        if (idx === currentBeatIndex) return { icon: '→', class: 'storymode-beat-current' };
        return { icon: '□', class: 'storymode-beat-pending' };
    };

    const beatItems = scene.beats.map((beat, idx) => {
        const { icon, class: beatClass } = getBeatStatus(idx);
        return `<div class="storymode-beat-item ${beatClass}">
            <span class="storymode-beat-status">${icon}</span>
            <span class="storymode-beat-title">${escapeHtml(beat.title || `Beat ${idx + 1}`)}</span>
            ${beat.type ? `<span class="storymode-beat-type">${escapeHtml(beat.type)}</span>` : ''}
        </div>`;
    }).join('');

    return `
        <div class="storymode-beats-section">
            <div class="storymode-beats-header">
                <span class="storymode-beats-title">Scene Beats</span>
                <span class="storymode-beats-count">${completedCount}/${totalBeats} addressed</span>
            </div>
            <div class="storymode-beats-list">
                ${beatItems}
            </div>
        </div>
    `;
}

/**
 * Render the compact main panel HTML for the UI sidebar.
 * @returns {string} HTML string for the main story mode panel.
 */
export function renderMainPanel() {
    const settings = extension_settings[MODULE_NAME];
    const chatState = getChatStoryState();
    const pacingMode = getPacingMode();

    // Build base status text
    let statusText = '';
    if (!settings.enabled) {
        statusText = 'Disabled';
    } else if (pacingMode === 'scenario') {
        statusText = 'Enabled | Scenario Mode';
        const blueprintState = getBlueprintState();
        if (blueprintState?.blueprint) {
            const title = blueprintState.blueprint.title || blueprintState.blueprint.blueprint_title || 'Untitled';
            statusText += ` | ${escapeHtml(title)}`;
        }
    } else {
        // Story Mode - show active features
        const features = [];
        if (settings.storyTypeEnabled) features.push('Genre');
        if (settings.storyArcEnabled) features.push(`Arc ${chatState.currentStep}/${chatState.arcLength}`);
        if (features.length > 0) {
            statusText = `Enabled | ${features.join(' | ')}`;
        } else {
            statusText = 'Enabled | Story Mode';
        }
    }

    // Get blueprint state once for reuse
    const blueprintState = getBlueprintState();

    // Add blueprint indicator if blueprint is active (for scenario mode)
    if (settings.enabled && settings.blueprintSettings?.enabled && pacingMode === 'scenario') {
        if (blueprintState.useBlueprint && blueprintState.blueprint) {
            const currentScene = BlueprintModule.getCurrentScene(
                blueprintState.blueprint,
                chatState.currentStep,
                chatState.arcLength,
                blueprintState.sceneMode,
                getCurrentSceneIndex()
            );
            if (currentScene) {
                statusText += ` | <span class="storymode-blueprint-indicator"><i class="fa-solid fa-scroll"></i> Scene ${currentScene.index + 1}/${blueprintState.blueprint.scene_plan.length}</span>`;
            }
        }
    }

    // Check if blueprint section should be visible
    const showBlueprintSection = settings.blueprintSettings?.enabled && blueprintState.blueprint;

    const html = `
        <div id="story_mode_panel" class="storymode-panel">
            <div class=inline-drawer>
                <div class="inline-drawer-toggle inline-drawer-header">
                <b data-i18n="Story Mode">Story Mode</b>
                    <div class="inline-drawer-icon fa-solid interactable down fa-circle-chevron-down" tabindex="0" role="button"></div>
                </div>
                <div id="story_mode_base_settings" class="inline-drawer-content" style="display: none;">
                    <div class="storymode-settings-panel">
                        <label class="checkbox_label" title="Turn Story Mode on or off for this chat">
                        <input type="checkbox" id="story_mode_enabled" ${settings.enabled ? 'checked' : ''} />
                        <span>Enable Story Mode</span>
                        </label>
                        <div id="story_mode_settings_btn">
                            <button id="open_story_mode_settings" class="menu_button" title="Configure story arcs, author styles, and scenario blueprints">
                            <i class="fa-solid fa-gear"></i> Story Mode Settings
                            </button>
                        </div>
                    </div>
                    <div class="storymode-status" title="Shows current story type, author style, and arc progress">
                        ${statusText}
                    </div>
                </div>
                <div style="margin-top: 20px;">
                    ${showBlueprintSection ? renderBlueprintPreview(blueprintState) : ''}
                </div>
            </div>
        </div>
    `;
    return html;
}

/**
 * Render the blueprint preview section in the main panel
 * @param {Object} blueprintState - Blueprint state object
 * @returns {string} HTML content
 */
export function renderBlueprintPreview(blueprintState) {
    const blueprint = blueprintState.blueprint;
    const chatState = getChatStoryState();
    const currentStep = chatState.currentStep || 0;
    const authorStyles = getAuthorStyles();

    // Shared style analysis
    const styleAnalysis = analyzeMissingStyles(blueprint);
    const authorStyleName = resolveAuthorStyleDisplayName(blueprint, authorStyles, chatState);

    const currentScene = BlueprintModule.getCurrentScene(
        blueprint,
        currentStep,
        blueprintState.arcLength || chatState.arcLength || 30,
        blueprintState.sceneMode || 'auto',
        getCurrentSceneIndex()
    );

    // Get beat progress for current scene
    const beatProgressHtml = renderBeatProgress(currentScene);

    // Get scene summaries panel
    const currentSceneIndex = getCurrentSceneIndex();
    const sceneSummariesHtml = renderSceneSummaries(blueprintState, currentSceneIndex);

    // Get cover image URL
    const coverUrl = getBlueprintCoverUrl(blueprint);

    return `
    <div class="storymode-blueprint-preview inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
            <span>Current Scenario</span>
            <div class="inline-drawer-icon fa-solid interactable up fa-circle-chevron-up" tabindex="0" role="button"></div>
        </div>
        <div class="inline-drawer-content" style="display: none;">
            ${coverUrl ? `
            <div style="display: flex; justify-content: center; margin-bottom: 16px;">
                <div style="width: 200px; aspect-ratio: 3/4; background: var(--black30a); border-radius: 8px; overflow: hidden; border: 1px solid var(--SmartThemeBorderColor);">
                    <img src="${escapeHtml(coverUrl)}" alt="Blueprint Cover" style="width: 100%; height: 100%; object-fit: cover; object-position: center;">
                </div>
            </div>
            ` : ''}
            <div class="storymode-blueprint-info-grid">
                ${renderInfoCards(blueprint, styleAnalysis, authorStyleName)}
                ${blueprint.core_premise ? `
                <div id="blueprint-premise-summary" class="storymode-premise">
                ${escapeHtml(blueprint.core_premise)}
                </div>
                ` : ''}
            </div>
            ${currentScene ? `
            <div id="blueprint-scene-summary">
                ${renderCurrentSceneCard(currentScene, blueprint, { extraContent: beatProgressHtml })}
            </div>
            ` : ''}
            ${sceneSummariesHtml}
        </div>
    </div>
    `;
}
