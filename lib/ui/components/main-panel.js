/**
 * Main Panel Components for Story Mode Extension
 * Main panel rendering and blueprint preview
 */

import { extension_settings } from '/scripts/extensions.js';

import {
    MODULE_NAME,
    getChatStoryState,
    getAuthorStyles,
    getCurrentSceneIndex,
} from '../../core/state-manager.js';

import * as BlueprintModule from '../../blueprint/module.js';
import { getBlueprintCoverUrl } from '../../blueprint/utils.js';

import { escapeHtml } from '../component-system.js';

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

    // Build base status text
    let statusText = settings.enabled
        ? `Enabled | Arc: ${chatState.currentStep}/${chatState.arcLength}`
        : 'Disabled';

    // Get blueprint state once for reuse
    const blueprintState = BlueprintModule.getBlueprintState();

    // Add blueprint indicator if blueprint is active
    if (settings.enabled && settings.blueprintSettings?.enabled) {
        if (blueprintState.useBlueprint && blueprintState.blueprint) {
            const currentScene = BlueprintModule.getCurrentScene(
                blueprintState.blueprint,
                chatState.currentStep,
                chatState.arcLength,
                blueprintState.sceneMode,
                getCurrentSceneIndex()
            );
            if (currentScene) {
                statusText += ` | <span class="storymode-blueprint-indicator"><i class="fa-solid fa-scroll"></i> Scenario: Scene ${currentScene.index + 1}/${blueprintState.blueprint.scene_plan.length}</span>`;
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

    // Get author style name - prefer embedded name from blueprint
    let authorStyle = 'None';
    if (blueprint.author_style_name) {
        // Use embedded author style name from blueprint
        authorStyle = blueprint.author_style_name;
    } else if (blueprint.author_style) {
        const style = authorStyles.find(s => s.id === blueprint.author_style);
        authorStyle = style?.name || blueprint.author_style;
    } else if (chatState.selectedAuthorStyle) {
        const style = authorStyles.find(s => s.id === chatState.selectedAuthorStyle);
        authorStyle = style?.name || chatState.selectedAuthorStyle;
    }

    const currentScene = BlueprintModule.getCurrentScene(
        blueprint,
        currentStep,
        blueprintState.arcLength || chatState.arcLength || 30,
        blueprintState.sceneMode || 'auto',
        getCurrentSceneIndex()
    );

    // Get beat progress for current scene
    const beatProgressHtml = renderBeatProgress(currentScene);

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
                <div class="storymode-info-card">
                    <label>Story Type</label>
                    <span>${escapeHtml(blueprint.story_type_name || blueprint.story_type_id || 'Unknown')}</span>
                </div>
                <div class="storymode-info-card">
                    <label>Author Style</label>
                    <span>${escapeHtml(authorStyle)}</span>
                </div>
                <div class="storymode-info-card">
                    <label>Total Scenes</label>
                    <span>${blueprint.scene_plan?.length || 0}</span>
                </div>
                <div class="storymode-info-card">
                    <label>Target Length</label>
                    <span>${blueprint.arc_structure?.total_messages_target || chatState.arcLength || 'N/A'} rounds</span>
                </div>
                ${blueprint.core_premise ? `
                <div id="blueprint-premise-summary" class="storymode-premise">
                ${escapeHtml(blueprint.core_premise)}
                </div>
                ` : ''}
            </div>
            ${currentScene ? `
            <div id="blueprint-scene-summary" class="storymode-scene-card current">
                <div class="storymode-scene-title">${escapeHtml(currentScene.title || 'Untitled')}</div>
                <div class="storymode-scene-meta">
                Scene ${currentScene.index + 1}/${blueprint.scene_plan?.length || 0} • ${escapeHtml(currentScene.phase || 'Unknown')}
                </div>
                ${currentScene.purpose ? `<p style="margin-top: 8px; font-size: 0.9em; color: var(--SmartThemeBodyColor);">${escapeHtml(currentScene.purpose)}</p>` : ''}
                ${beatProgressHtml}
            </div>
            ` : ''}
        </div>
    </div>
    `;
}
