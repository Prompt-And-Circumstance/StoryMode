/**
 * UI Components Module for Story Mode Extension
 *
 * Contains all pure HTML rendering functions for the UI.
 * These functions return HTML strings and have no side effects.
 *
 * Now uses ui-component-system.js for common component patterns.
 */

import { extension_prompt_types, extension_prompt_roles } from '/script.js';
import { extension_settings, getContext } from '/scripts/extensions.js';

// Import from state manager
import {
    MODULE_NAME,
    getStoryTypes,
    getAuthorStyles,
    getChatStoryState,
    getCurrentSceneIndex,
} from './state-manager.js';

// Import from arc engine
import { getPhaseInfo } from './arc-engine.js';

// Import blueprint module
import * as BlueprintModule from './blueprint-module.js';

// Import blueprint utilities
import { getBlueprintCoverUrl, isValidImageUrl } from './blueprint-utils.js';

// Import UI component system
import {
    escapeHtml,
    getCheckedAttr,
    getCheckedAttrDefaultTrue,
    renderComponent,
    buildSelectFromData,
    buildSubtabStructure,
} from './ui-component-system.js';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// NOTE: escapeHtml, getCheckedAttr, getCheckedAttrDefaultTrue are now imported
// from ui-component-system.js to avoid duplication

/**
 * Create a help icon HTML with tooltip
 * @param {string} helpText - The help text for the tooltip
 * @param {string} [iconClass='fa-circle-info'] - Font Awesome icon class
 * @returns {string} HTML string for the help icon
 */
export function createHelpIcon(helpText, iconClass = 'fa-solid fa-circle-info') {
    const escapedText = escapeHtml(helpText);
    return `<i class="${iconClass} sm-help-icon" title="${escapedText}"></i>`;
}

/**
 * Create a help icon HTML with tooltip from an array of lines
 * @param {string[]} lines - Array of help text lines (will be bullet-pointed)
 * @param {string} [iconClass='fa-circle-info'] - Font Awesome icon class
 * @returns {string} HTML string for the help icon
 */
export function createHelpIconFromLines(lines, iconClass = 'fa-solid fa-circle-info') {
    const text = lines.map(line => `• ${line}`).join('\n');
    return createHelpIcon(text, iconClass);
}

/**
 * Create a toggle switch component (wrapper for backward compatibility)
 * Now delegates to ui-component-system.js
 * @param {Object} options - Toggle options
 * @param {string} options.id - Element ID
 * @param {string} options.label - Toggle label text
 * @param {string} options.description - Toggle description text
 * @param {string} [options.helpText] - Optional help tooltip text
 * @param {boolean} [options.checked=true] - Whether the toggle is checked
 * @returns {string} HTML string for the toggle component
 */
export function createToggle({ id, label, description, helpText, checked = true }) {
    return renderComponent('toggle', { id, label, description, helpText, checked });
}

// ============================================================================
// INTERNAL FUNCTIONS
// ============================================================================

/**
 * Render beat progress HTML for a scene
 * @param {Object} scene - Scene object with beats array
 * @param {Object} BlueprintModule - Blueprint module for getting completed beats
 * @param {Function} escapeHtml - HTML escaping function
 * @returns {string} HTML string for beat progress section
 */
function renderBeatProgress(scene, BlueprintModule, escapeHtml) {
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

// ============================================================================
// DEBUG PANEL
// ============================================================================




// ============================================================================
// MAIN PANEL
// ============================================================================

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
                statusText += ` | <span class="storymode-blueprint-indicator"><i class="fa-solid fa-scroll"></i> Blueprint: Scene ${currentScene.index + 1}/${blueprintState.blueprint.scene_plan.length}</span>`;
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
                            <button id="open_story_mode_settings" class="menu_button" title="Configure story arcs, author styles, and blueprints">
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
    const beatProgressHtml = renderBeatProgress(currentScene, BlueprintModule, escapeHtml);

    return `
    <div class="storymode-blueprint-preview inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
            <span>Current Blueprint</span>
            <div class="inline-drawer-icon fa-solid interactable up fa-circle-chevron-up" tabindex="0" role="button"></div>
        </div>
        <div class="inline-drawer-content" style="display: none;">
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

// ============================================================================
// SETTINGS DIALOG SUBTABS
// ============================================================================

/**
 * Build the Story Arc subtab content.
 * @returns {string} HTML string for story arc subtab
 */
export function buildStoryArcSubtab() {
    const settings = extension_settings[MODULE_NAME];
    const chatState = getChatStoryState();
    const storyTypes = getStoryTypes();

    // Build story type options
    const sortedTypes = [...storyTypes].sort((a, b) => a.name.localeCompare(b.name));
    const storyTypeOptions = sortedTypes.map(type =>
        `<option value="${type.id}" ${type.id === chatState.selectedStoryType ? 'selected' : ''}>${escapeHtml(type.name)} (${escapeHtml(type.category.join(', '))})</option>`
    ).join('');

    // Calculate current step display
    let stepDisplay = 'Not Started';
    if (chatState.currentStep > 0) {
        const phaseInfo = getPhaseInfo(chatState.currentStep, chatState.arcLength);
        stepDisplay = `${chatState.currentStep}/${chatState.arcLength} - The ${phaseInfo.phase}`;
    }

    // Get current story type description
    const currentStoryType = storyTypes.find(t => t.id === chatState.selectedStoryType);
    let storyTypeDescription = 'Select a story type to see its description';
    if (currentStoryType && currentStoryType.storyPrompt) {
        storyTypeDescription = currentStoryType.storyPrompt;
    }

    return `
<!-- Enable Story Arc -->
<div class="storymode-toggle">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Enable Story Arc</span>
<span class="storymode-toggle-description">Injects narrative structure prompts to guide the AI through a three-act story</span>
</div>
<label class="storymode-switch">
<input type="checkbox" id="story_arc_enabled" ${settings.storyArcEnabled ? 'checked' : ''}>
<span class="storymode-switch-slider"></span>
</label>
</div>
<div id="story_arc_controls" style="${settings.storyArcEnabled ? '' : 'display:none;'}">
<!-- Arc Length & Current Step (combined row) -->
<div class="storymode-form-group">
<label class="storymode-form-label">Arc Length ${createHelpIcon('Number of user messages in one complete story arc. Short: 10-20, Medium: 30-60, Long: 80-120')}</label>
<div style="display: flex; align-items: center; gap: 16px;">
<div class="storymode-slider-container" style="flex: 1;">
<input type="range" id="arc_length_slider" class="storymode-slider" min="5" max="150" value="${chatState.arcLength}">
<input type="number" id="arc_length_value" class="storymode-slider-value" min="5" max="150" value="${chatState.arcLength}" style="width: 80px; text-align: center;">
</div>
<div id="current_step_display" class="storymode-badge" style="flex-shrink: 0;" title="Shows current position in the story (round number / total rounds)">${stepDisplay}</div>
<button id="reset_arc_btn" class="menu_button storymode-btn storymode-btn-secondary" style="flex-shrink: 0;" title="Return to the beginning of the story arc">
<i class="fa-solid fa-rotate-left"></i> Reset Arc
</button>
</div>
</div>
<!-- Story Type -->
<div class="storymode-form-group">
<label class="storymode-form-label">Story Type ${createHelpIcon('Select the type of story structure. Each provides different guidance for the AI narrator.')}</label>
<div class="storymode-select-group">
<select id="story_type_select" class="storymode-select">
<option value="">None</option>
${storyTypeOptions}
</select>
<button id="edit_story_types_btn" class="menu_button" title="Edit Story Types">
<i class="fa-solid fa-pencil"></i>
</button>
</div>
<p id="story_type_description" class="storymode-form-hint" style="margin-top: 8px;">${escapeHtml(storyTypeDescription)}</p>
</div>
</div>
`;
}

/**
 * Build the Author Style subtab content.
 * @returns {string} HTML string for author style subtab
 */
export function buildAuthorStyleSubtab() {
    const settings = extension_settings[MODULE_NAME];
    const chatState = getChatStoryState();
    const authorStyles = getAuthorStyles();

    // Build author style options
    const sortedStyles = [...authorStyles].sort((a, b) => a.name.localeCompare(b.name));
    const authorStyleOptions = sortedStyles.map(style =>
        `<option value="${style.id}" ${style.id === chatState.selectedAuthorStyle ? 'selected' : ''}>${escapeHtml(style.name)} (${escapeHtml(style.category.join(', '))})</option>`
    ).join('');

    // Get current author style description
    const currentAuthorStyle = authorStyles.find(s => s.id === chatState.selectedAuthorStyle);
    let authorStyleDescription = 'Select an author style to see its guidance';
    if (currentAuthorStyle && currentAuthorStyle.authorPrompt) {
        authorStyleDescription = currentAuthorStyle.authorPrompt;
    }

    return `
<!-- Enable Author Style and NSFW Toggle (two-column layout) -->
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
<div class="storymode-toggle">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Enable Author Style</span>
<span class="storymode-toggle-description">Emulates a specific author's writing style, voice, and tone</span>
</div>
<label class="storymode-switch">
<input type="checkbox" id="author_style_enabled" ${settings.authorStyleEnabled ? 'checked' : ''}>
<span class="storymode-switch-slider"></span>
</label>
</div>
<div class="storymode-toggle">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Include NSFW Guidance</span>
<span class="storymode-toggle-description">Include heat level in prompts</span>
${createHelpIcon('Adds instructions for handling mature content based on the author\'s typical approach')}
</div>
<label class="storymode-switch">
<input type="checkbox" id="nsfw_enabled" ${settings.nsfwEnabled ? 'checked' : ''}>
<span class="storymode-switch-slider"></span>
</label>
</div>
</div>
<div id="author_style_controls" style="${settings.authorStyleEnabled ? '' : 'display:none;'}">
<!-- Author Style -->
<div class="storymode-form-group">
<label class="storymode-form-label">Author Style ${createHelpIcon('Select an author whose writing style you want the AI to emulate')}</label>
<div class="storymode-select-group">
<select id="author_style_select" class="storymode-select">
<option value="">None</option>
${authorStyleOptions}
</select>
<button id="edit_author_styles_btn" class="menu_button" title="Edit Author Styles">
<i class="fa-solid fa-pencil"></i>
</button>
</div>
<p id="author_style_description" class="storymode-form-hint" style="margin-top: 8px;">${escapeHtml(authorStyleDescription)}</p>
</div>
</div>
`;
}

/**
 * Build the Blueprint Settings subtab content.
 * @returns {string} HTML string for blueprint settings subtab
 */
export function buildBlueprintSettingsSubtab() {
    const settings = extension_settings[MODULE_NAME];
    const sceneTransitionNotify = settings.blueprintSettings?.sceneTransitionNotify || 'none';
    const summaryStyle = settings.blueprintSettings?.summaryStyle || 'narrative';
    const beatTrackingEnabled = settings.blueprintSettings?.beatTrackingEnabled !== false; // Default true
    return `
<div class="storymode-toggle">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Enable Blueprints</span>
<span class="storymode-toggle-description">Generate AI-planned story structure with scenes, character arcs, and plot points</span>
</div>
<label class="storymode-switch">
<input type="checkbox" id="blueprint_enabled" ${settings.blueprintSettings?.enabled ? 'checked' : ''}>
<span class="storymode-switch-slider"></span>
</label>
</div>
<div class="storymode-toggle">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Scene Guidance in Prompts</span>
<span class="storymode-toggle-description">Include scene info in AI context</span>
${createHelpIcon('Injects current scene info into each AI response to keep the story on track')}
</div>
<label class="storymode-switch">
<input type="checkbox" id="blueprint_use_scene_prompts" ${settings.blueprintSettings?.useScenePrompts ? 'checked' : ''}>
<span class="storymode-switch-slider"></span>
</label>
</div>
<div class="storymode-toggle">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Beat Progress Tracking</span>
<span class="storymode-toggle-description">Show beat checklists and track completion</span>
${createHelpIconFromLines([
        'Tracks beat completion status within scenes',
        'Shows beat progress in UI and prompts',
        'LLM uses @@BEAT:N@@ markers to mark beats complete'
    ])}
</div>
<label class="storymode-switch">
<input type="checkbox" id="blueprint_beat_tracking" ${beatTrackingEnabled ? 'checked' : ''}>
<span class="storymode-switch-slider"></span>
</label>
</div>

<!-- Debug Mode -->
<div class="storymode-toggle">
    <div class="storymode-toggle-info">
        <span class="storymode-toggle-label">Debug Mode</span>
        <span class="storymode-toggle-description">Adds step/phase info to AI responses for troubleshooting</span>
    </div>
    <label class="storymode-switch">
        <input type="checkbox" id="debug_mode_enabled" ${settings.debugMode ? 'checked' : ''}>
        <span class="storymode-switch-slider"></span>
    </label>
</div>

<!-- Story Controller Panel Mode -->
<div class="storymode-form-group">
    <label class="storymode-form-label">Story Controller Panel ${createHelpIcon('Analyze story pacing and inspect prompt injections')}</label>
    <select id="controller_mode_select" class="storymode-select">
        <option value="disabled" ${!settings.debugPanelEnabled ? 'selected' : ''}>Disabled</option>
        <option value="floating" ${settings.debugPanelEnabled && !settings.debugPanelDocked ? 'selected' : ''}>Floating Overlay</option>
        <option value="docked" ${settings.debugPanelEnabled && settings.debugPanelDocked ? 'selected' : ''}>Docked Panel (Right Nav)</option>
    </select>
    <p class="storymode-form-hint">Choose how the controller panel appears in the UI</p>
</div>

<div class="storymode-form-group">
<label class="storymode-form-label">Scene Transition Notification</label>
<select id="blueprint_scene_transition_notify" class="storymode-select">
<option value="none" ${sceneTransitionNotify === 'none' ? 'selected' : ''}>None (No Notification)</option>
<option value="toastr" ${sceneTransitionNotify === 'toastr' ? 'selected' : ''}>Small Toast (Bottom-Right)</option>
<option value="popup" ${sceneTransitionNotify === 'popup' ? 'selected' : ''}>Popup Dialog (Center)</option>
</select>
<p class="storymode-form-hint">How to notify when AI advances to the next scene using @@NEXT_SCENE@@ marker</p>
</div>

<div class="inline-drawer" id="scene_summarization_drawer">
<div class="inline-drawer-toggle inline-drawer-header">
<h4 class="storymode-section-title" style="margin: 0;">
<i class="fa-solid fa-compress-alt"></i> Scene Summarization
</h4>
<div class="inline-drawer-icon fa-solid interactable down fa-circle-chevron-down" tabindex="0" role="button"></div>
</div>
<div class="inline-drawer-content" style="display: none;">

<div class="storymode-toggle">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Enable Scene Summarization</span>
<span class="storymode-toggle-description">Automatically summarize completed scenes</span>
${createHelpIcon('Summarizes scenes that are N scenes behind current, reducing context while preserving narrative continuity')}
</div>
<label class="storymode-switch">
<input type="checkbox" id="blueprint_summarization_enabled" ${settings.blueprintSettings?.summarizationEnabled ? 'checked' : ''}>
<span class="storymode-switch-slider"></span>
</label>
</div>

<div class="storymode-form-group">
<label class="storymode-form-label">Summarize After ${createHelpIcon('Summarize scenes that are at least N scenes behind the current scene')}</label>
<div style="display: flex; align-items: center; gap: 10px;">
<input type="number" id="blueprint_summarize_after_scenes" class="storymode-input" min="1" max="10" value="${settings.blueprintSettings?.summarizeAfterScenes || 2}" style="width: 80px;">
<span class="storymode-form-hint">scenes behind current</span>
</div>
</div>

<div class="storymode-form-group">
<label class="storymode-form-label">Max Summary Length ${createHelpIcon('Maximum tokens for each scene summary')}</label>
<div style="display: flex; align-items: center; gap: 10px;">
<input type="number" id="blueprint_summary_max_tokens" class="storymode-input" min="100" max="2000" step="50" value="${settings.blueprintSettings?.summaryMaxTokens || 500}" style="width: 100px;">
<span class="storymode-form-hint">tokens max</span>
</div>
</div>

<div class="storymode-toggle">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Include Summaries in Prompts</span>
<span class="storymode-toggle-description">Inject scene summaries into blueprint guidance</span>
${createHelpIcon('Adds scene summaries to the AI prompt for context')}
</div>
<label class="storymode-switch">
<input type="checkbox" id="blueprint_include_summaries" ${getCheckedAttrDefaultTrue(settings.blueprintSettings?.includeSummariesInPrompt)}>
<span class="storymode-switch-slider"></span>
</label>
</div>

<div class="storymode-form-group">
<label class="storymode-form-label">Summary Style</label>
<select id="blueprint_summary_style" class="storymode-select">
<option value="narrative" ${summaryStyle === 'narrative' ? 'selected' : ''}>Narrative paragraphs</option>
<option value="bullet" ${summaryStyle === 'bullet' ? 'selected' : ''}>Bullet points</option>
<option value="both" ${summaryStyle === 'both' ? 'selected' : ''}>Both narrative and bullets</option>
</select>
<p class="storymode-form-hint">How should scene summaries be formatted?</p>
</div>

<div class="storymode-form-group">
<label class="storymode-form-label">Scene Summary Prompt Template</label>
<div style="display: flex; gap: 10px; align-items: center;">
<button id="edit_scene_summary_prompt" class="menu_button storymode-btn storymode-btn-secondary" title="Edit the prompt template used for scene summarization">
<i class="fa-solid fa-pencil"></i> Edit Prompt Template
</button>
<span class="storymode-form-hint">Customize the prompt used for generating scene summaries</span>
</div>
</div>

</div>
</div>

<div class="inline-drawer" id="cover_generation_drawer">
<div class="inline-drawer-toggle inline-drawer-header">
<h4 class="storymode-section-title" style="margin: 0;">
<i class="fa-solid fa-image"></i> Cover Image Generation
</h4>
<div class="inline-drawer-icon fa-solid interactable down fa-circle-chevron-down" tabindex="0" role="button"></div>
</div>
<div class="inline-drawer-content" style="display: none;">

<div class="storymode-toggle">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Enable Cover Generation</span>
<span class="storymode-toggle-description">Allow generation of cover images using Stable Diffusion</span>
${createHelpIcon('Generate cover images for blueprints using the /sd slash command')}
</div>
<label class="storymode-switch">
<input type="checkbox" id="cover_gen_enabled" ${getCheckedAttrDefaultTrue(settings.blueprintSettings?.coverGeneration?.enabled)}>
<span class="storymode-switch-slider"></span>
</label>
</div>

<div class="storymode-toggle">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Auto-generate on Blueprint Creation</span>
<span class="storymode-toggle-description">Automatically generate a cover when creating a new blueprint</span>
${createHelpIcon('When enabled, automatically generates a cover image after blueprint creation')}
</div>
<label class="storymode-switch">
<input type="checkbox" id="cover_auto_generate" ${settings.blueprintSettings?.coverGeneration?.autoGenerate ? 'checked' : ''}>
<span class="storymode-switch-slider"></span>
</label>
</div>

<div class="storymode-toggle">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Add to Gallery</span>
<span class="storymode-toggle-description">Keep all generated covers in a navigable gallery</span>
${createHelpIcon('Stores all generated covers so you can browse and select your favorite')}
</div>
<label class="storymode-switch">
<input type="checkbox" id="cover_add_to_gallery" ${getCheckedAttrDefaultTrue(settings.blueprintSettings?.coverGeneration?.addToGallery)}>
<span class="storymode-switch-slider"></span>
</label>
</div>

<div class="storymode-form-group">
<label class="storymode-form-label">Maximum Gallery Size ${createHelpIcon('Oldest covers are removed when limit is exceeded')}</label>
<div style="display: flex; align-items: center; gap: 10px;">
<input type="number" id="cover_max_gallery" class="storymode-input" min="1" max="50" value="${settings.blueprintSettings?.coverGeneration?.maxGallerySize || 10}" style="width: 80px;">
<span class="storymode-form-hint">covers</span>
</div>
</div>

<div class="storymode-toggle">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Auto-select Latest Cover</span>
<span class="storymode-toggle-description">Automatically show the newest generated cover</span>
${createHelpIcon('When enabled, newly generated covers become the active cover')}
</div>
<label class="storymode-switch">
<input type="checkbox" id="cover_auto_select_latest" ${getCheckedAttrDefaultTrue(settings.blueprintSettings?.coverGeneration?.autoSelectLatest)}>
<span class="storymode-switch-slider"></span>
</label>
</div>

<div class="storymode-form-group">
<label class="storymode-form-label">Default Quality</label>
<select id="cover_default_quality" class="storymode-select">
<option value="draft" ${settings.blueprintSettings?.coverGeneration?.defaultQuality === 'draft' ? 'selected' : ''}>Draft (Fast)</option>
<option value="standard" ${settings.blueprintSettings?.coverGeneration?.defaultQuality === 'standard' || !settings.blueprintSettings?.coverGeneration?.defaultQuality ? 'selected' : ''}>Standard</option>
<option value="high" ${settings.blueprintSettings?.coverGeneration?.defaultQuality === 'high' ? 'selected' : ''}>High Quality</option>
</select>
</div>

<div class="storymode-form-group">
<label class="storymode-form-label">Default Aspect Ratio</label>
<select id="cover_default_aspect" class="storymode-select">
<option value="2:3" ${settings.blueprintSettings?.coverGeneration?.defaultAspectRatio === '2:3' || !settings.blueprintSettings?.coverGeneration?.defaultAspectRatio ? 'selected' : ''}>2:3 (Portrait)</option>
<option value="3:4" ${settings.blueprintSettings?.coverGeneration?.defaultAspectRatio === '3:4' ? 'selected' : ''}>3:4 (Portrait)</option>
<option value="1:1" ${settings.blueprintSettings?.coverGeneration?.defaultAspectRatio === '1:1' ? 'selected' : ''}>1:1 (Square)</option>
<option value="16:9" ${settings.blueprintSettings?.coverGeneration?.defaultAspectRatio === '16:9' ? 'selected' : ''}>16:9 (Wide)</option>
</select>
</div>

<div class="storymode-form-group">
<label class="storymode-form-label">Default Style</label>
<select id="cover_default_style" class="storymode-select">
<option value="auto" ${settings.blueprintSettings?.coverGeneration?.defaultStyle === 'auto' || !settings.blueprintSettings?.coverGeneration?.defaultStyle ? 'selected' : ''}>Auto-detect from Genre</option>
<option value="cinematic" ${settings.blueprintSettings?.coverGeneration?.defaultStyle === 'cinematic' ? 'selected' : ''}>Cinematic</option>
<option value="illustration" ${settings.blueprintSettings?.coverGeneration?.defaultStyle === 'illustration' ? 'selected' : ''}>Digital Illustration</option>
<option value="painting" ${settings.blueprintSettings?.coverGeneration?.defaultStyle === 'painting' ? 'selected' : ''}>Oil Painting</option>
<option value="anime" ${settings.blueprintSettings?.coverGeneration?.defaultStyle === 'anime' ? 'selected' : ''}>Anime/Manga</option>
<option value="watercolor" ${settings.blueprintSettings?.coverGeneration?.defaultStyle === 'watercolor' ? 'selected' : ''}>Watercolor</option>
</select>
</div>

<div class="storymode-toggle">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Show Prompt Before Generating</span>
<span class="storymode-toggle-description">Display confirmation dialog with prompt before generation</span>
${createHelpIcon('Shows the prompt that will be used before generating the image')}
</div>
<label class="storymode-switch">
<input type="checkbox" id="cover_show_prompt" ${getCheckedAttrDefaultTrue(settings.blueprintSettings?.coverGeneration?.showPromptOnGenerate)}>
<span class="storymode-switch-slider"></span>
</label>
</div>

<div class="storymode-toggle">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Confirm Before Removing Covers</span>
<span class="storymode-toggle-description">Show confirmation when deleting cover images</span>
${createHelpIcon('Prevents accidental deletion of cover images')}
</div>
<label class="storymode-switch">
<input type="checkbox" id="cover_confirm_delete" ${getCheckedAttrDefaultTrue(settings.blueprintSettings?.coverGeneration?.confirmDeleteCover)}>
<span class="storymode-switch-slider"></span>
</label>
</div>

<div class="storymode-toggle">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Enable Keyboard Navigation</span>
<span class="storymode-toggle-description">Use arrow keys to navigate cover gallery</span>
${createHelpIcon('When enabled, use left/right arrow keys to browse covers when no input is focused')}
</div>
<label class="storymode-switch">
<input type="checkbox" id="cover_keyboard_nav" ${getCheckedAttrDefaultTrue(settings.blueprintSettings?.coverGeneration?.keyboardNavigation)}>
<span class="storymode-switch-slider"></span>
</label>
</div>

<div class="storymode-toggle">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Show Gallery Counter</span>
<span class="storymode-toggle-description">Display "1/5" counter on cover images</span>
${createHelpIcon('Shows the current position in the cover gallery')}
</div>
<label class="storymode-switch">
<input type="checkbox" id="cover_show_counter" ${getCheckedAttrDefaultTrue(settings.blueprintSettings?.coverGeneration?.showGalleryCounter)}>
<span class="storymode-switch-slider"></span>
</label>
</div>

</div>
</div>

<!-- Scene Image Generation -->
<div class="inline-drawer" id="scene_image_generation_drawer">
<div class="inline-drawer-toggle inline-drawer-header">
<h4 class="storymode-section-title" style="margin: 0;">
<i class="fa-solid fa-wand-magic-sparkles"></i> Scene Image Generation
</h4>
<div class="inline-drawer-icon fa-solid interactable down fa-circle-chevron-down" tabindex="0" role="button"></div>
</div>
<div class="inline-drawer-content" style="display: none;">

<div class="storymode-toggle">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Enable Scene Image Generation</span>
<span class="storymode-toggle-description">Generate images for individual scenes using Stable Diffusion</span>
${createHelpIcon('Automatically generate scene images from blueprint context using SD')}
</div>
<label class="storymode-switch">
<input type="checkbox" id="scene_image_gen_enabled" ${settings.imageGeneration?.enabled ? 'checked' : ''}>
<span class="storymode-switch-slider"></span>
</label>
</div>

<div class="storymode-form-group">
<p class="storymode-form-hint" style="margin: 0;">
<i class="fa-solid fa-info-circle"></i>
Scene images use the same SD extension as cover images. Configure it in Extensions → Image Generation.
</p>
</div>

<div class="storymode-toggle">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Auto-generate on Scene Transition</span>
<span class="storymode-toggle-description">Automatically generate images when entering new scenes</span>
${createHelpIcon('When enabled, automatically generates an image for each new scene using @@NEXT_SCENE@@')}
</div>
<label class="storymode-switch">
<input type="checkbox" id="scene_image_gen_auto" ${settings.imageGeneration?.autoGenerate ? 'checked' : ''}>
<span class="storymode-switch-slider"></span>
</label>
</div>

<div class="storymode-toggle">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Add to Character Gallery</span>
<span class="storymode-toggle-description">Add generated images to character galleries by default</span>
${createHelpIcon('Automatically add scene images to character galleries when available')}
</div>
<label class="storymode-switch">
<input type="checkbox" id="scene_image_gen_gallery" ${settings.imageGeneration?.addToGallery ? 'checked' : ''}>
<span class="storymode-switch-slider"></span>
</label>
</div>

<div class="storymode-form-group">
<label class="storymode-form-label">Image Style</label>
<select id="scene_image_gen_style" class="storymode-select">
<option value="auto" ${settings.imageGeneration?.imageStyle === 'auto' || !settings.imageGeneration?.imageStyle ? 'selected' : ''}>Auto (from blueprint tone)</option>
<option value="custom" ${settings.imageGeneration?.imageStyle === 'custom' ? 'selected' : ''}>Custom Style</option>
</select>
<p class="storymode-form-hint">Auto style adapts to blueprint tone and narrative voice</p>
</div>

<div class="storymode-form-group" id="scene_image_custom_prompt_group" style="display: ${settings.imageGeneration?.imageStyle === 'custom' ? 'block' : 'none'};">
<label class="storymode-form-label">Custom Style Prompt</label>
<textarea id="scene_image_custom_prompt" class="storymode-textarea" rows="3" placeholder="e.g., oil painting, dramatic lighting, cinematic composition">${settings.imageGeneration?.customStylePrompt || ''}</textarea>
<p class="storymode-form-hint">Additional style modifiers to apply to all generated images</p>
</div>

</div>
</div>

`;
}

/**
 * Build the Post-Arc Options subtab content.
 * @returns {string} HTML string for post-arc options subtab
 */
export function buildPostArcOptionsSubtab() {
    const settings = extension_settings[MODULE_NAME];
    return `
<div class="storymode-toggle">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Auto-Epilogue</span>
<span class="storymode-toggle-description">Automatically generate an epilogue when arc completes</span>
${createHelpIcon('When the story arc ends, automatically generate a concluding narrative')}
</div>
<label class="storymode-switch">
<input type="checkbox" id="epilogue_enabled" ${settings.epilogueEnabled ? 'checked' : ''}>
<span class="storymode-switch-slider"></span>
</label>
</div>
<div class="storymode-toggle">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Generate Summary</span>
<span class="storymode-toggle-description">Automatically summarize the chat when arc completes</span>
${createHelpIcon('When the story arc ends, create a summary of the entire story')}
</div>
<label class="storymode-switch">
<input type="checkbox" id="summary_enabled" ${settings.summaryEnabled ? 'checked' : ''}>
<span class="storymode-switch-slider"></span>
</label>
</div>
<div class="storymode-form-group">
<label class="storymode-form-label">Messages to Summarize ${createHelpIcon('How many recent messages to include (0 = entire chat)')}</label>
<div class="storymode-slider-container">
<input type="range" id="summary_message_count_slider" class="storymode-slider" min="0" max="300" step="5" value="${settings.summaryMessageCount}">
<span id="summary_message_count_value" class="storymode-slider-value">${settings.summaryMessageCount === 0 ? 'All' : settings.summaryMessageCount}</span>
</div>
<p class="storymode-form-hint">0 = entire chat</p>
</div>
`;
}

/**
 * Build the API Options subtab content.
 * @returns {string} HTML string for API options subtab
 */
export function buildAPIOptionsSubtab() {
    const settings = extension_settings[MODULE_NAME];
    return `
<!-- Blueprint Generation APIs -->
<div class="storymode-card">
<h4 class="storymode-card-title">Blueprint Generation</h4>
<div class="storymode-form-group">
<label class="storymode-form-label">Blueprint Generation Profile ${createHelpIcon('Which API connection to use for generating story blueprints')}</label>
<select id="blueprint_generation_api" class="storymode-select">
<option value="">Default API</option>
</select>
</div>
<div class="storymode-form-group">
<label class="storymode-form-label">Opening Message Profile ${createHelpIcon('Which API connection to use for generating opening messages for blueprints')}</label>
<select id="opening_message_api" class="storymode-select">
<option value="">Default API</option>
</select>
</div>
</div>
<!-- Post-Arc Generation APIs -->
<div class="storymode-card">
<h4 class="storymode-card-title">Post-Arc Generation</h4>
<div class="storymode-form-group">
<label class="storymode-form-label">Epilogue Profile ${createHelpIcon('Which API connection to use for generating the story epilogue')}</label>
<select id="epilogue_api" class="storymode-select">
<option value="">Default API</option>
</select>
</div>
<div class="storymode-form-group">
<label class="storymode-form-label">Summary Profile ${createHelpIcon('Which API connection to use for generating chat summaries (also used for scene summarization if enabled)')}</label>
<select id="summary_api" class="storymode-select">
<option value="">Default API</option>
</select>
</div>
</div>
<!-- Advanced Settings -->
<div class="inline-drawer" id="advanced_api_drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
        <h4 class="storymode-section-title" style="margin: 0;">
            <i class="fa-solid fa-gear"></i> Advanced API Settings
        </h4>
        <div class="inline-drawer-icon fa-solid interactable down fa-circle-chevron-down" tabindex="0" role="button"></div>
    </div>
    <div class="inline-drawer-content" style="display: none;">
        <!-- Injection Settings -->
        <div class="storymode-card">
            <h4 class="storymode-card-title">Injection Settings</h4>
            <div class="storymode-form-group">
                <label class="storymode-form-label">Position ${createHelpIconFromLines([
        'In Prompt: In the system prompt',
        'In Chat: Embedded in chat history',
        'Before Prompt: Before anything else'
    ])}</label>
                <select id="injection_position" class="storymode-select">
                    <option value="${extension_prompt_types.IN_PROMPT}">In Prompt</option>
                    <option value="${extension_prompt_types.IN_CHAT}">In Chat (at depth)</option>
                    <option value="${extension_prompt_types.BEFORE_PROMPT}">Before Prompt</option>
                </select>
            </div>
            <div class="storymode-form-group">
                <label class="storymode-form-label">Depth (for In Chat) ${createHelpIcon('For \'In Chat\' mode: how many messages from the end to place the injection')}</label>
                <input type="number" id="injection_depth" class="storymode-select" min="0" max="100" value="4">
            </div>
            <div class="storymode-form-group">
                <label class="storymode-form-label">Role ${createHelpIconFromLines([
        'System: As system instructions',
        'Assistant: As if from the AI',
        'User: As if from the player'
    ])}</label>
                <select id="injection_role" class="storymode-select">
                    <option value="${extension_prompt_roles.SYSTEM}">System</option>
                    <option value="${extension_prompt_roles.ASSISTANT}">Assistant</option>
                    <option value="${extension_prompt_roles.USER}">User</option>
                </select>
            </div>
            </div>
        </div>
    </div>
</div>
<!-- Prompt Preview -->
<div class="storymode-form-group">
    <label class="storymode-form-label">Prompt Preview</label>
    <div id="prompt_preview" class="storymode-preview" title="Shows the exact text that will be injected into the AI's context"></div>
</div>
`;
}

/**
 * Helper: Build a tabbed container with subtabs (reusable for Genre & Style and Settings)
 * @param {Array<{id: string, icon: string, label: string, title: string, builder: Function}>} subtabs
 * @returns {string} HTML string for subtabbed content
 */
function buildSubtabbedContent(subtabs) {
    const buttons = subtabs.map((tab, idx) => `
        <button class="storymode-settings-subtab ${idx === 0 ? 'active' : ''}"
                data-subtab="${tab.id}"
                title="${tab.title}">
            <i class="fa-solid fa-${tab.icon}"></i> ${tab.label}
        </button>
    `).join('');

    const panes = subtabs.map((tab, idx) => `
        <div id="settings_subtab_${tab.id}"
             class="storymode-settings-subtab-pane ${idx === 0 ? 'active' : ''}">
            ${tab.builder()}
        </div>
    `).join('');

    return `
        <div class="storymode-settings-subtabs">
            ${buttons}
        </div>
        ${panes}
    `;
}

/**
 * Build the Genre & Style tab content (Story Arc + Author Style controls)
 * @returns {string} HTML string for genre & style tab
 */
export function buildGenreStyleTabContent() {
    return buildSubtabbedContent([
        {
            id: 'story_arc', icon: 'book', label: 'Story Arc',
            title: 'Configure story arc settings', builder: buildStoryArcSubtab
        },
        {
            id: 'author_style', icon: 'pen-fancy', label: 'Author Style',
            title: 'Configure author style emulation', builder: buildAuthorStyleSubtab
        }
    ]);
}

/**
 * Build the Settings tab content with subtabs.
 * @returns {string} HTML string for settings tab
 */
export function buildSettingsTabContent() {
    return buildSubtabbedContent([
        {
            id: 'blueprint_settings', icon: 'scroll', label: 'Blueprint Settings',
            title: 'Configure blueprint generation settings', builder: buildBlueprintSettingsSubtab
        },
        {
            id: 'post_arc', icon: 'flag-checkered', label: 'Post-Arc Options',
            title: 'Configure auto-epilogue and summary options', builder: buildPostArcOptionsSubtab
        },
        {
            id: 'api_options', icon: 'plug', label: 'API Options',
            title: 'Configure API profiles and injection settings', builder: buildAPIOptionsSubtab
        }
    ]);
}

// ============================================================================
// BLUEPRINT TAB CONTENT
// ============================================================================

/**
 * Build the Generate Blueprint subtab content.
 * @returns {string} HTML string for generate blueprint subtab
 */
export function buildGenerateBlueprintSubtab() {
    const getScenarioFromContext = BlueprintModule.getScenarioFromContext || (() => '');
    const buildCharacterSelectionList = BlueprintModule.buildCharacterSelectionList || (() => '<p>No characters available</p>');
    const buildPersonaSelectionList = BlueprintModule.buildPersonaSelectionList || (() => '<p>No personas available</p>');
    const getEffectiveMasterPrompt = BlueprintModule.getEffectiveMasterPrompt || (() => '');

    const scenarioText = getScenarioFromContext();
    const charactersHtml = buildCharacterSelectionList();
    const personasHtml = buildPersonaSelectionList();
    const masterPrompt = getEffectiveMasterPrompt();

    // Get wizard mode setting from extension settings
    const wizardEnabled = extension_settings[MODULE_NAME]?.blueprintSettings?.wizardMode?.enabled !== false;

    // Get current settings for blueprint dropdowns
    const chatState = getChatStoryState();
    const selectedStoryTypeId = chatState.selectedStoryType || extension_settings[MODULE_NAME].selectedStoryType || '';
    const selectedAuthorStyleId = chatState.selectedAuthorStyle || extension_settings[MODULE_NAME].selectedAuthorStyle || '';

    // Build story type dropdown
    const storyTypes = getStoryTypes();
    const storyTypeOptions = storyTypes.map(type =>
        `<option value="${escapeHtml(type.id)}" ${type.id === selectedStoryTypeId ? 'selected' : ''}>${escapeHtml(type.name)}</option>`
    ).join('');

    // Build author style dropdown (include "None" option)
    const authorStyles = getAuthorStyles();
    const authorStyleOptions = ['<option value="">None</option>']
        .concat(authorStyles.map(style =>
            `<option value="${escapeHtml(style.id)}" ${style.id === selectedAuthorStyleId ? 'selected' : ''}>${escapeHtml(style.name)}</option>`
        ))
        .join('');

    // Debug: Log dropdown data
    console.log('[Story Mode UI] Blueprint dropdowns:', {
        storyTypeCount: storyTypes.length,
        authorStyleCount: authorStyles.length,
        selectedStoryTypeId,
        selectedAuthorStyleId,
        hasStoryTypeOptions: storyTypeOptions.length > 0,
        hasAuthorStyleOptions: authorStyleOptions.length > 0
    });

    return `
        <p style="color: var(--SmartThemeBodyColor); margin-bottom: 20px;">
            Generate a structured story blueprint using an LLM.The blueprint will guide the AI through your narrative arc.
        </p>

        <!--Story Type and Author Style (two-column)-->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 20px;">
            <!-- Story Type -->
            <div class="storymode-form-group">
                <label class="storymode-form-label">Story Type ${createHelpIcon('Select the narrative structure for this blueprint')}</label>
                <select id="blueprint_story_type" class="storymode-select">
                    ${storyTypeOptions}
                </select>
                <p class="storymode-form-hint">The blueprint will use this story type's structure</p>
            </div>

            <!-- Author Style -->
            <div class="storymode-form-group">
                <label class="storymode-form-label">Author Style ${createHelpIcon('Optional: Select an author style for this blueprint')}</label>
                <select id="blueprint_author_style" class="storymode-select">
                    ${authorStyleOptions}
                </select>
                <p class="storymode-form-hint">The blueprint will emulate this author's writing style</p>
            </div>
        </div>

        <!--Two-column layout for Scenario through Story Length-->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 20px;">
            <!-- Left column: Scenario, Story Length -->
            <div>
                <div class="storymode-form-group">
                    <label class="storymode-form-label">Scenario ${createHelpIcon('Describe your story\'s starting situation. Leave empty to use chat context.')}</label>
                    <textarea id="blueprint_scenario" class="storymode-textarea" rows="6" placeholder="Describe the starting situation for your story...">${scenarioText}</textarea>
                    <p class="storymode-form-hint">The initial premise and setting for your story</p>
                </div>
<!-- Metaphor Level -->
<div class="storymode-form-group">
<label class="storymode-form-label">Genre Realism / Flexibility ${createHelpIconFromLines([
        'Literal: Magic/tech is real',
        'Grounded: Subtle, ambiguous',
        'Mixed: Both literal and metaphorical',
        'Symbolic: Social/emotional metaphors'
    ])}</label>
<select id="blueprint_metaphor_level" class="storymode-select">
<option value="literal">Literal - genre elements are real and concrete</option>
<option value="grounded">Grounded - subtle, ambiguous genre elements</option>
<option value="mixed" selected>Mixed - both literal and metaphorical</option>
<option value="symbolic">Symbolic - social/emotional "monsters"</option>
</select>
<p class="storymode-form-hint">How literally should genre elements be interpreted?</p>
</div>
<!-- Story Length -->
<div class="storymode-form-group">
<label class="storymode-form-label">Story Length</label>
<select id="blueprint_story_length" class="storymode-select" title="Approximate number of rounds for this story">
<option value="10">Short (~10 rounds)</option>
<option value="30" selected>Medium (~30 rounds)</option>
<option value="60">Long (~60 rounds)</option>
<option value="90">Very long (~90 rounds)</option>
<option value="150">Epic (~150 rounds)</option>
</select>
<p class="storymode-form-hint">Total arc length in rounds (user messages)</p>
</div>
<!-- Custom Story Length -->
<div class="storymode-form-group">
<label class="storymode-form-label">Custom Rounds (Optional)</label>
<input type="number" id="blueprint_custom_rounds" class="storymode-input" min="1" max="500" placeholder="Override default length" title="Override the selected story length with a specific number">
<p class="storymode-form-hint">Enter a custom number of rounds to override the selected length</p>
</div>
</div>
<!-- Right column: Characters, Personas -->
<div>
<!-- Characters -->
<div class="storymode-form-group">
<label class="storymode-form-label">Characters to Include ${createHelpIcon('Select which chat characters to include in the blueprint')}</label>
<div id="blueprint_characters_list" class="storymode-character-list" style="max-height: 140px;">
${charactersHtml}
</div>
</div>
<!-- Personas -->
<div class="storymode-form-group">
<label class="storymode-form-label">Personas (Player Characters) ${createHelpIcon('Select which player character identities to include')}</label>
<div id="blueprint_personas_list" class="storymode-character-list" style="max-height: 140px;">
${personasHtml}
</div>
</div>
</div>
</div>

<!--Advanced: Edit Blueprint Generation Prompt (Inline)-->
<div class="inline-drawer" id="blueprint_prompt_drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
        <h4 class="storymode-section-title" style="margin: 0;">
            <i class="fa-solid fa-code"></i> Advanced: Edit Blueprint Generation Prompt
        </h4>
        <div class="inline-drawer-icon fa-solid interactable down fa-circle-chevron-down" tabindex="0" role="button"></div>
    </div>
    <div class="inline-drawer-content" style="display: none;">
        <div class="storymode-form-group" id="blueprint_prompt_group">
            <label class="storymode-form-label">Master Prompt Template</label>
            <div id="blueprompt_prompt_wrapper" style="position: relative;">
                <textarea id="blueprint_master_prompt_edit" class="storymode-textarea monospace" rows="5">${masterPrompt}</textarea>
                <button class="editor_maximize" data-for="blueprint_master_prompt_edit" data-tab="true" title="Expand the editor">
                    <i class="fa-solid fa-expand"></i>
                </button>
            </div>
            <button id="blueprint_reset_prompt" class="menu_button storymode-btn storymode-btn-secondary" style="margin-top: 10px;" title="Reset the master prompt template to its default value">
                <i class="fa-solid fa-rotate-left"></i> Reset to Default
            </button>
        </div>
    </div>
</div>

<!--Generation Mode Settings (Legacy Toggle)-->
        ${buildWizardSettingsToggle(wizardEnabled)}

    `;
}

/**
 * Build the Blueprint tab content.
 * @returns {string} HTML string for blueprint tab
 */
export function buildBlueprintTabContent() {
    const settings = extension_settings[MODULE_NAME];
    const blueprintState = BlueprintModule.getBlueprintState();
    const blueprint = blueprintState.blueprint;
    const chatState = getChatStoryState();

    const hasBlueprint = !!blueprint;
    const generateActive = !hasBlueprint;
    const overviewActive = hasBlueprint;

    const currentScene = hasBlueprint ? BlueprintModule.getCurrentScene(
        blueprint,
        chatState.currentStep,
        chatState.arcLength,
        blueprintState.sceneMode || 'auto',
        getCurrentSceneIndex()
    ) : null;

    const canStartStory = hasBlueprint && blueprint.scene_plan && blueprint.scene_plan.length > 0;

    return `
        <div class="storymode-blueprint-subtabs">
<button class="storymode-blueprint-subtab ${overviewActive ? 'active' : ''}" data-subtab="overview" title="View blueprint overview and actions">
<i class="fa-solid fa-info-circle"></i> Overview
</button>
<button class="storymode-blueprint-subtab" data-subtab="characters" title="View character arcs and development">
<i class="fa-solid fa-users"></i> Characters
</button>
<button class="storymode-blueprint-subtab" data-subtab="scenes" title="View all planned scenes">
<i class="fa-solid fa-film"></i> Scenes
</button>
<button class="storymode-blueprint-subtab" data-subtab="json" title="View and edit raw blueprint JSON">
<i class="fa-solid fa-code"></i> Raw JSON
</button>
<span class="storymode-subtab-spacer"></span>
${canStartStory ? `
<button id="start_story_from_blueprint_btn" class="storymode-btn-start" title="Sync settings and start the story from this blueprint">
<i class="fa-solid fa-play"></i> Start Story
</button>
` : ''
        }
</div>
        <div id="blueprint_subtab_content">
            ${generateActive ? buildGenerateBlueprintSubtab() : (hasBlueprint ? renderBlueprintOverviewSubtab(blueprint, currentScene) : '')}
        </div>
    `;
}

/**
 * Render the overview subtab for blueprint
 */
export function renderBlueprintOverviewSubtab(blueprint, currentScene) {
    const context = getContext();
    const characters = context.characters || [];
    const title = BlueprintModule.getBlueprintTitle(blueprint, characters);
    const authorStyles = getAuthorStyles();
    const chatState = getChatStoryState();

    // Get author style from blueprint - prefer embedded name, fall back to lookup by ID
    // This ensures blueprint is self-contained and independent from settings changes
    let authorStyle = 'None';
    if (blueprint.author_style_name) {
        // Use embedded author style name from blueprint
        authorStyle = blueprint.author_style_name;
    } else if (blueprint.author_style) {
        // Fall back to looking up by ID
        const style = authorStyles.find(s => s.id === blueprint.author_style);
        authorStyle = style?.name || blueprint.author_style;
    }

    const coverUrl = getBlueprintCoverUrl(blueprint);
    const safeCoverUrl = isValidImageUrl(coverUrl) ? coverUrl : null;

    return `
        <!-- Title and Action Buttons -->
<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
<h3 style="margin: 0; color: var(--sm-accent); font-size: 1.3em;">${escapeHtml(title)}</h3>
<div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-start;">
<button id="blueprint_export_btn" class="menu_button storymode-btn storymode-btn-secondary" title="Download the blueprint as a JSON file">
<i class="fa-solid fa-download"></i> Export
</button>
<button id="blueprint_edit_btn" class="menu_button storymode-btn storymode-btn-secondary" title="Edit the blueprint details and scenes">
<i class="fa-solid fa-pen-to-square"></i> Edit
</button>
<button id="blueprint_clear_btn" class="menu_button storymode-btn storymode-btn-danger" title="Remove the current blueprint from this chat">
<i class="fa-solid fa-trash"></i> Clear
</button>
</div>
</div>
<!--Cover and Info Layout-->
<div class="storymode-blueprint-overview-layout">
${safeCoverUrl ? `
<!-- Cover Image -->
<div class="storymode-blueprint-overview-cover" style="background-image: url('${escapeHtml(encodeURI(safeCoverUrl))}')">
</div>
` : ''}
<!-- 2-Column Info Grid -->
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
<span>${blueprint.arc_structure?.total_messages_target || blueprint.total_messages_target || 'N/A'} rounds</span>
</div>
<div class="storymode-info-card">
<label>Generated By</label>
<span>${escapeHtml(blueprint.llmDescriptor || 'Unknown')}</span>
</div>
${blueprint.core_premise ? `
<div class="storymode-premise">
${escapeHtml(blueprint.core_premise)}
</div>
` : ''}
</div>
</div>
<!--Setting-->
        ${blueprint.setting ? `
<div class="storymode-card">
<h4 class="storymode-card-title"><i class="fa-solid fa-map-location-dot"></i> Setting</h4>
<div class="storymode-info-row">
<span class="storymode-info-label">Location</span>
<span class="storymode-info-value">${escapeHtml(blueprint.setting.location || 'N/A')}</span>
</div>
<div class="storymode-info-row">
<span class="storymode-info-label">Time Period</span>
<span class="storymode-info-value">${escapeHtml(blueprint.setting.time_period || 'N/A')}</span>
</div>
<div class="storymode-info-row">
<span class="storymode-info-label">Atmosphere</span>
<span class="storymode-info-value">${escapeHtml(blueprint.setting.atmosphere || 'N/A')}</span>
</div>
</div>
` : ''
        }
<!-- Opening Message Section -->
        ${blueprint.opening_message ? `
<div class="storymode-card">
<h4 class="storymode-card-title"><i class="fa-solid fa-book-open"></i> Opening Message</h4>
<div style="background: var(--black30a); padding: 12px; border-radius: 8px; max-height: 200px; overflow-y: auto; white-space: pre-wrap; word-wrap: break-word; font-size: 0.9em; line-height: 1.5;">${escapeHtml(blueprint.opening_message)}</div>
</div>
` : ''}
<!-- Scene / Round Navigation Slider -->
        ${blueprint.scene_plan && blueprint.scene_plan.length > 0 ? renderSceneSlider(blueprint, chatState, currentScene) : ''}
<!-- Current Scene -->
        ${currentScene ? `
<div class="storymode-card">
<h4 class="storymode-card-title"><i class="fa-solid fa-clapperboard"></i> Current Scene</h4>
<div class="storymode-scene-card current">
<div class="storymode-scene-title">${escapeHtml(currentScene.title || 'Untitled')}</div>
<div class="storymode-scene-meta">
Scene ${currentScene.index + 1}/${blueprint.scene_plan?.length || 0} • ${escapeHtml(currentScene.phase || 'Unknown')}
</div>
${currentScene.purpose ? `<p style="margin-top: 8px; font-size: 0.9em; color: var(--SmartThemeBodyColor);">${escapeHtml(currentScene.purpose)}</p>` : ''}
</div>
</div>
` : ''
        }
    `;
}

/**
 * Render the scene/round navigation slider
 * @param {Object} blueprint - The story blueprint
 * @param {Object} chatState - Current chat story state
 * @param {Object} currentScene - Current scene info
 * @returns {string} HTML string for the slider
 */
function renderSceneSlider(blueprint, chatState, currentScene) {
    const sceneCount = blueprint.scene_plan.length;
    const arcLength = chatState.arcLength || 30;
    const currentStep = chatState.currentStep || 0;
    const currentSceneIndex = currentScene?.index ?? 0;

    // Calculate scene boundaries - distribute rounds evenly across scenes
    const roundsPerScene = Math.floor(arcLength / sceneCount);
    const sceneBoundaries = [];
    let roundAccumulator = 0;

    for (let i = 0; i < sceneCount; i++) {
        // Last scene gets remaining rounds
        const endRound = (i === sceneCount - 1)
            ? arcLength - 1
            : Math.min(roundAccumulator + roundsPerScene - 1, arcLength - 1);

        sceneBoundaries.push({
            sceneIndex: i,
            startRound: roundAccumulator,
            endRound: endRound,
            title: blueprint.scene_plan[i].title || `Scene ${i + 1} `,
        });
        roundAccumulator = endRound + 1;
    }

    // Calculate progress percentage
    const progressPercent = arcLength > 0 ? (currentStep / arcLength) * 100 : 0;

    // Build scene markers and round ticks HTML
    let sliderContent = '';

    sceneBoundaries.forEach((scene, idx) => {
        const isCompleted = scene.sceneIndex < currentSceneIndex;
        const isCurrent = scene.sceneIndex === currentSceneIndex;

        // Truncate long titles
        const truncatedTitle = scene.title.length > 18
            ? scene.title.substring(0, 18) + '…'
            : scene.title;

        // Scene marker
        sliderContent += `
            <div class="storymode-scene-marker ${isCompleted ? 'completed' : ''} ${isCurrent ? 'active' : ''}"
        data-scene="${scene.sceneIndex}"
        data-round="${scene.startRound}"
        title="${escapeHtml(scene.title)}">
                    <div class="marker-circle">
                        ${isCompleted ? '✓' : scene.sceneIndex + 1}
                    </div>
                    <div class="marker-label">
                        <span class="marker-number">Scene ${scene.sceneIndex + 1}</span>
                        <span class="marker-title">${escapeHtml(truncatedTitle)}</span>
                    </div>
                </div>
        `;

        // Round ticks between scenes (except after last scene)
        if (idx < sceneCount - 1) {
            const tickCount = scene.endRound - scene.startRound + 1;
            let ticksHtml = '';
            for (let r = scene.startRound; r <= scene.endRound; r++) {
                const isRoundCurrent = r === currentStep;
                ticksHtml += `<div class="tick ${isRoundCurrent ? 'active' : ''}" data-round="${r}" title="Round ${r + 1}"></div>`;
            }
            sliderContent += `<div class="storymode-round-ticks">${ticksHtml}</div>`;
        }
    });

    return `
        <div class="storymode-card">
    <h4 class="storymode-card-title"><i class="fa-solid fa-timeline"></i> Story Progress</h4>
    <div class="storymode-scene-slider-container">
        <div class="storymode-scene-track">
            <div class="storymode-progress-fill" style="width: ${progressPercent}%"></div>
            ${sliderContent}
        </div>
    </div>
    <div class="storymode-slider-info">
        <span>Round ${currentStep + 1} of ${arcLength}</span>
        <span class="storymode-mode-indicator" title="Scene mode determines how the current scene is calculated">
            Mode: ${currentScene?.sceneMode === 'manual' ? 'Manual' : 'Auto'}
        </span>
    </div>
</div>
        `;
}

/**
 * Render the scenes subtab for blueprint
 */
export function renderBlueprintScenesSubtab(blueprint) {
    if (!blueprint.scene_plan?.length) {
        return '<p class="storymode-form-hint">No scenes defined.</p>';
    }

    return blueprint.scene_plan.map((scene, index) => {
        // Create a temporary scene object with index for the helper function
        const sceneWithIndex = { ...scene, index };
        const beatsHtml = renderBeatProgress(sceneWithIndex, BlueprintModule, escapeHtml);

        return `
        <div class="storymode-scene-card">
<div class="storymode-scene-title">Scene ${index + 1}: ${escapeHtml(scene.title || 'Untitled')}</div>
<div class="storymode-scene-meta">${escapeHtml(scene.phase || 'Unknown Phase')}</div>
${scene.purpose ? `<p style="margin-top: 8px; font-size: 0.85em; color: var(--SmartThemeEmColor);">${escapeHtml(scene.purpose)}</p>` : ''}
${beatsHtml}
</div>
        `;
    }).join('');
}

/**
 * Render the characters subtab for blueprint
 */
export function renderBlueprintCharactersSubtab(blueprint) {
    const hasMainCharacters = blueprint.protagonist_group?.main_characters &&
        blueprint.protagonist_group.main_characters.length > 0;
    const hasProtagonistGroupFields = blueprint.protagonist_group &&
        (blueprint.protagonist_group.description ||
            blueprint.protagonist_group.shared_goal ||
            blueprint.protagonist_group.group_dynamic);

    // Filter character_arcs to only show entries with meaningful data (not just default "Unknown")
    const meaningfulCharacterArcs = (blueprint.character_arcs || []).filter(arc =>
        arc.character_name && arc.character_name !== 'Unknown' && arc.character_name !== 'Starting state'
    );
    const hasCharacterArcs = meaningfulCharacterArcs.length > 0;

    // Show message if no character data at all
    if (!hasCharacterArcs && !hasMainCharacters && !hasProtagonistGroupFields) {
        return '<p class="storymode-form-hint">No character information defined in this blueprint.</p>';
    }

    let html = '';

    // Show protagonist group type as a label if available
    if (blueprint.protagonist_group?.type) {
        html += `
        <div style="margin-bottom: 16px;">
<span class="storymode-form-hint">Group Type:</span>
<span style="margin-left: 8px; font-weight: 500; color: var(--SmartThemeBodyColor);">${escapeHtml(blueprint.protagonist_group.type)}</span>
</div>`;
    }

    // Show protagonist group fields (old format)
    if (hasProtagonistGroupFields) {
        html += `
        <div class="storymode-card">
            <h4 class="storymode-card-title"><i class="fa-solid fa-users"></i> Protagonist Group</h4>
${blueprint.protagonist_group.description ? `
<div class="storymode-info-row">
<span class="storymode-info-label">Description</span>
<span class="storymode-info-value">${escapeHtml(blueprint.protagonist_group.description)}</span>
</div>
` : ''
            }
${blueprint.protagonist_group.shared_goal ? `
<div class="storymode-info-row">
<span class="storymode-info-label">Shared Goal</span>
<span class="storymode-info-value">${escapeHtml(blueprint.protagonist_group.shared_goal)}</span>
</div>
` : ''
            }
${blueprint.protagonist_group.group_dynamic ? `
<div class="storymode-info-row">
<span class="storymode-info-label">Group Dynamic</span>
<span class="storymode-info-value">${escapeHtml(blueprint.protagonist_group.group_dynamic)}</span>
</div>
` : ''
            }
</div>`;
    }

    // Show main characters from protagonist_group.main_characters (new format)
    if (hasMainCharacters) {
        html += blueprint.protagonist_group.main_characters.map(char => `
        <div class="storymode-card">
            <h4 class="storymode-card-title"><i class="fa-solid fa-user"></i> ${escapeHtml(char.name || 'Unknown')}</h4>
${char.role_in_story ? `
<div class="storymode-info-row">
<span class="storymode-info-label">Role</span>
<span class="storymode-info-value">${escapeHtml(char.role_in_story)}</span>
</div>
` : ''
            }
${char.key_skills_or_powers ? `
<div class="storymode-info-row">
<span class="storymode-info-label">Skills/Powers</span>
<span class="storymode-info-value">${escapeHtml(char.key_skills_or_powers)}</span>
</div>
` : ''
            }
${char.core_wound_or_need ? `
<div class="storymode-info-row">
<span class="storymode-info-label">Core Wound/Need</span>
<span class="storymode-info-value">${escapeHtml(char.core_wound_or_need)}</span>
</div>
` : ''
            }
${char.primary_goal ? `
<div class="storymode-info-row">
<span class="storymode-info-label">Primary Goal</span>
<span class="storymode-info-value">${escapeHtml(char.primary_goal)}</span>
</div>
` : ''
            }
${char.relationships && char.relationships.length > 0 ? `
<div class="storymode-info-row">
<span class="storymode-info-label">Relationships</span>
<span class="storymode-info-value">${escapeHtml(char.relationships.join('; '))}</span>
</div>
` : ''
            }
</div>`).join('');
    }

    // Show individual character arcs if available (only meaningful entries)
    if (hasCharacterArcs) {
        html += meaningfulCharacterArcs.map(arc => `
        <div class="storymode-card">
            <h4 class="storymode-card-title"><i class="fa-solid fa-user"></i> ${escapeHtml(arc.character_name)}</h4>
${arc.initial_state ? `
<div class="storymode-info-row">
<span class="storymode-info-label">Initial State</span>
<span class="storymode-info-value">${escapeHtml(arc.initial_state)}</span>
</div>
` : ''
            }
${arc.final_state ? `
<div class="storymode-info-row">
<span class="storymode-info-label">Final State</span>
<span class="storymode-info-value">${escapeHtml(arc.final_state)}</span>
</div>
` : ''
            }
${arc.emotional_trajectory ? `
<div class="storymode-info-row">
<span class="storymode-info-label">Emotional Trajectory</span>
<span class="storymode-info-value">${escapeHtml(arc.emotional_trajectory)}</span>
</div>
` : ''
            }
</div>`).join('');
    }

    return html;
}

/**
 * Render the JSON subtab for blueprint
 */
export function renderBlueprintJsonSubtab(blueprint) {
    return `
        <textarea class="storymode-textarea monospace" style="min-height: 400px;" readonly>${JSON.stringify(blueprint, null, 2)}</textarea>
            `;
}

// ============================================================================
// OTHER TAB CONTENT
// ============================================================================

/**
 * Build the Generate/Load tab content.
 * @returns {string} HTML string for generate/load tab
 */
export function buildGenerateLoadTabContent() {
    const settings = extension_settings[MODULE_NAME];
    const chatState = getChatStoryState();

    if (!settings.blueprintSettings?.enabled) {
        return `
            <div class="storymode-summary-empty">
<i class="fa-solid fa-toggle-off"></i>
<p>Blueprint generation is disabled.</p>
<div class="storymode-toggle" style="max-width: 400px; margin: 20px auto;">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Enable Blueprints</span>
</div>
<label class="storymode-switch">
<input type="checkbox" id="blueprint_enabled_tab">
<span class="storymode-switch-slider"></span>
</label>
</div>
</div>
        `;
    }

    if (!chatState.selectedStoryType) {
        return `
        <div class="storymode-summary-empty">
<i class="fa-solid fa-book-open"></i>
<p>Select a story type first.</p>
<p class="storymode-form-hint">Go to the Settings tab and select a Story Type to enable blueprint generation.</p>
</div>
        `;
    }

    return `
        <div class="storymode-card">
<h4 class="storymode-card-title">Blueprint Settings</h4>
<div class="storymode-toggle">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Enable Blueprints</span>
<span class="storymode-toggle-description">Use LLM-generated story structure</span>
</div>
<label class="storymode-switch">
<input type="checkbox" id="blueprint_enabled" ${settings.blueprintSettings?.enabled ? 'checked' : ''}>
<span class="storymode-switch-slider"></span>
</label>
</div>
</div>
        <div class="storymode-info-box">
            <p><strong>Note:</strong> Blueprint generation and import have been moved to the <strong>Blueprint</strong> tab.</p>
            <p class="storymode-form-hint">Click the "Blueprint" tab above to access blueprint generation, or to load a blueprint from JSON.</p>
        </div>
    `;
}

/**
 * Build the sidebar HTML content for the unified modal.
 * @returns {string} HTML string for the sidebar
 */
export function buildSidebarContent() {
    const chatState = getChatStoryState();
    const storyTypes = getStoryTypes();
    const authorStyles = getAuthorStyles();
    const context = getContext();
    const characters = [];

    if (context.groupId) {
        const group = context.groups?.find(g => g.id === context.groupId);
        if (group?.members) {
            group.members.forEach((charId, index) => {
                const char = context.characters?.find(c => c.avatar === charId);
                if (char) {
                    characters.push({ name: char.name, isMain: index === 0 });
                }
            });
        }
    } else if (context.characterId !== undefined) {
        const char = context.characters?.[context.characterId];
        if (char) {
            characters.push({ name: char.name, isMain: true });
        }
    }

    const personas = [];
    if (context.personas) {
        Object.entries(context.personas).forEach(([key, value]) => {
            personas.push({
                id: key,
                name: typeof value === 'string' ? key : (value.name || key)
            });
        });
    }
    if (context.name1 && !personas.find(p => p.name === context.name1)) {
        personas.unshift({ id: 'current', name: context.name1 });
    }

    return `
        <div class="storymode-sidebar-section">
<h4>Characters</h4>
<div class="storymode-entity-list">
${characters.length > 0 ? characters.map(char => `
<div class="storymode-entity-item ${char.isMain ? 'main-char' : ''}">
<i class="fa-solid fa-user"></i>
<span>${escapeHtml(char.name)}</span>
${char.isMain ? '<span class="storymode-entity-badge">Main</span>' : ''}
</div>
`).join('') : '<div class="storymode-entity-item"><i class="fa-solid fa-user-slash"></i> No characters</div>'}
</div>
</div>
        <div class="storymode-sidebar-section">
            <h4>Personas</h4>
            <div class="storymode-entity-list">
                ${personas.length > 0 ? personas.map(persona => `
<div class="storymode-entity-item">
<i class="fa-solid fa-mask"></i>
<span>${escapeHtml(persona.name)}</span>
</div>
`).join('') : '<div class="storymode-entity-item"><i class="fa-solid fa-mask"></i> No personas</div>'}
            </div>
        </div>
    `;
}

// ============================================================================
// LIBRARY TAB
// ============================================================================

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
                <div class="storymode-library-generate-header">
                    <button id="library_back_to_grid_btn" class="menu_button" title="Back to Library">
                        <i class="fa-solid fa-arrow-left"></i> Back to Library
                    </button>
                    <h3 class="storymode-section-title" style="margin: 0;">
                        <i class="fa-solid fa-wand-magic-sparkles"></i> Generate New Blueprint
                    </h3>
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
                        <input type="text" id="library_search_input" placeholder="Search blueprints..." class="text_pole">
                    </div>
                    <div class="storymode-library-actions">
                        <div class="storymode-generate-actions" style="margin-top: 0;">
                            <button id="library_generate_blueprint_btn" class="menu_button storymode-btn storymode-btn-primary" title="Generate a new blueprint">
                                <i class="fa-solid fa-wand-magic-sparkles"></i> Generate Blueprint
                            </button>
                        </div>
                        <button id="library_import_btn" class="menu_button" title="Import blueprint from file">
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
                                <h3>No Blueprints Yet</h3>
                                <p>Generate your first blueprint to start building your library.</p>
                                <div class="storymode-generate-actions" style="margin-top: 16px;">
                                    <button id="library_empty_generate_btn" class="menu_button storymode-btn storymode-btn-primary" title="Generate a new blueprint">
                                        <i class="fa-solid fa-wand-magic-sparkles"></i> Generate Blueprint
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

    console.log('[Story Mode] Switched to library generate view');
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

    console.log('[Story Mode] Switched to library grid view');
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
            <i class="fa-${isFavorite ? 'solid' : 'regular'} fa-star"></i>
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
        <button class="menu_button storymode-btn-start" data-action="play" title="Start story from this blueprint">
            <i class="fa-solid fa-play"></i>
        </button>
        <button class="menu_button storymode-btn-icon" data-action="edit" title="Edit blueprint">
            <i class="fa-solid fa-pen"></i>
        </button>
        <button class="menu_button storymode-btn-icon" data-action="export" title="Export as PNG">
            <i class="fa-solid fa-download"></i>
        </button>
        <button class="menu_button storymode-btn-icon storymode-btn-danger" data-action="delete" title="Delete blueprint">
            <i class="fa-solid fa-trash"></i>
        </button>
    </div>
</div>
        `;
}

// ============================================================================
// WIZARD UI COMPONENTS (Phased Generation)
// ============================================================================

/**
 * Build wizard progress indicator HTML
 * @param {number} currentPhase - Current phase number (1-5)
 * @returns {string} HTML string for progress indicator
 */
export function buildWizardProgressHTML(currentPhase = 0) {
    const phases = [
        { number: 1, name: 'Foundation', icon: 'fa-layer-group' },
        { number: 2, name: 'Characters', icon: 'fa-users' },
        { number: 3, name: 'Scenes', icon: 'fa-film' },
        { number: 4, name: 'Resolutions', icon: 'fa-flag-checkered' },
    ];

    const progressItems = phases.map(phase => {
        const isCompleted = currentPhase > phase.number;
        const isCurrent = currentPhase === phase.number;
        const isPending = currentPhase < phase.number;

        const statusClass = isCompleted ? 'completed' : isCurrent ? 'current' : 'pending';
        const iconClass = isCompleted ? 'fa-check' : isCurrent ? 'fa-spinner fa-spin' : phase.icon;

        return `
        <div class="storymode-wizard-progress-item ${statusClass}">
                <div class="storymode-wizard-progress-icon">
                    <i class="fa-solid ${iconClass}"></i>
                </div>
                <div class="storymode-wizard-progress-label">
                    <div class="storymode-wizard-progress-phase">Phase ${phase.number}</div>
                    <div class="storymode-wizard-progress-name">${phase.name}</div>
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="storymode-wizard-progress">
            ${progressItems}
        </div>
        `;
}

/**
 * Build wizard preview panel HTML
 * Shows only the current phase's content (not cumulative)
 * No headers, no labels - just the status text content
 * @param {Object} partialBlueprint - Partial blueprint from completed phases
 * @param {number} currentPhase - Current phase number
 * @returns {string} HTML string for preview panel
 */
/**
 * Build wizard preview panel HTML
 * Shows only the current phase's content (not cumulative)
 * No headers, no labels - just the status text content
 */
export function buildWizardPreview(partialBlueprint = {}, currentPhase = 0) {
    let statusContent = '';

    // Define phases and their handlers
    const phases = [
        { id: 1, render: buildFoundationPreview, loading: 'Crafting story foundation...' },
        { id: 2, render: buildCharactersPreview, loading: 'Developing character arcs...' },
        { id: 3, render: buildScenesPreview, loading: 'Planning scenes...' },
        { id: 4, render: buildResolutionsPreview, loading: 'Generating story ending...' },
        { id: 5, render: buildCoverImagePreview, loading: null } // Cover image only after completion
    ];

    // Cumulative rendering loop
    for (const phase of phases) {
        if (currentPhase >= phase.id) {
            const html = phase.render(partialBlueprint);
            if (html) {
                statusContent += html;
            } else if (currentPhase === phase.id && phase.loading) {
                // Only show loading if we are currently IN this phase and have no data
                statusContent += `<div class="storymode-wizard-status">${phase.loading}</div>`;
            }
        }
    }

    // Show generating animation during all phases (0-4)
    const isGenerating = currentPhase >= 0 && currentPhase <= 4;
    const generatingMessage = isGenerating ? `
        <div class="storymode-wizard-generating">
            <span class="storymode-generating-text">>>>> GENERATING</span>
        </div> ` : '';

    return `
        <div class="storymode-wizard-preview">
            ${statusContent}
            ${generatingMessage}
        </div> `;
}

/**
 * Build resolution selection UI HTML
 * @deprecated Use buildPrimaryEndingDisplay instead - LLM now selects primary ending automatically
 * @param {Array} resolutions - Array of possible resolutions
 * @param {string} selectedId - ID of currently selected resolution
 * @returns {string} HTML string for resolution selection
 */
export function buildResolutionSelectionUI(resolutions = [], selectedId = null) {
    // Deprecated: LLM now chooses primary ending, no user selection needed
    // Return empty string to avoid breaking existing code
    return '';
}

/**
 * Build primary ending display UI HTML
 * Displays the primary ending that was selected by the LLM as the most story-appropriate
 * @param {Object} primaryEnding - Primary ending object (normalized by blueprint-module.js)
 * @param {Array} alternateEndings - Optional array of alternate endings
 * @returns {string} HTML string for primary ending display
 */
export function buildPrimaryEndingDisplay(primaryEnding = null, alternateEndings = []) {
    if (!primaryEnding) {
        return '<p>No ending generated</p>';
    }

    // Build character outcomes HTML (normalization layer guarantees object format)
    let characterOutcomesHtml = '';
    if (primaryEnding.character_outcomes && primaryEnding.character_outcomes.length > 0) {
        const outcomes = primaryEnding.character_outcomes
            .filter(outcome => outcome && outcome.character_name && outcome.outcome)
            .map(outcome => `
        <li> <strong>${escapeHtml(outcome.character_name)}:</strong> ${escapeHtml(outcome.outcome)}</li>
            `).join('');

        if (outcomes) {
            characterOutcomesHtml = `
            <div class="storymode-ending-outcomes">
                    <strong>Character Outcomes:</strong>
                    <ul>
                        ${outcomes}
                    </ul>
                </div>
        `;
        }
    }

    // Build alternate endings collapsible section if available
    let alternateEndingsHtml = '';
    if (alternateEndings && alternateEndings.length > 0) {
        const alternateItems = alternateEndings.map((ending, index) => `
        <div class="alternate-ending-item">
                <h6>${escapeHtml(ending.title || `Alternate ${index + 1}`)}</h6>
                <p>${escapeHtml(ending.description || '')}</p>
            </div>
        `).join('');

        alternateEndingsHtml = `
        <details class="storymode-alternate-endings">
                <summary><i class="fa-solid fa-list-ul"></i> View Alternate Endings (${alternateEndings.length})</summary>
                <div class="storymode-alternate-endings-list">
                    ${alternateItems}
                </div>
            </details>
        `;
    }

    return `
        <div class="storymode-primary-ending">
            <h3><i class="fa-solid fa-flag-checkered"></i> Story Ending</h3>
            <h5 class="storymode-ending-title">${escapeHtml(primaryEnding.title)}</h5>
            <p class="storymode-ending-description">${escapeHtml(primaryEnding.description)}</p>
            ${characterOutcomesHtml}
            ${alternateEndingsHtml}
        </div>
        `;
}

/**
 * Build wizard settings toggle UI
 * @param {boolean} wizardEnabled - Whether wizard mode is enabled (default true)
 * @returns {string} HTML string for settings toggle
 */
export function buildWizardSettingsToggle(wizardEnabled = true) {
    // Logic inversion: "Legacy Mode" checked means wizardEnabled is FALSE
    const legacyModeEnabled = !wizardEnabled;

    return `
        <div class="storymode-wizard-settings">
            <div class="storymode-setting-row">
                <label class="storymode-toggle-label">
                    <input type="checkbox" id="storymode_wizard_disabled" ${legacyModeEnabled ? 'checked' : ''}>
                    <span class="storymode-toggle-slider"></span>
                    <span class="storymode-toggle-text">
                        <strong>Legacy Single-Process Mode</strong>
                    </span>
                </label>
            </div>
            <p class="storymode-setting-description">
                Generate the entire blueprint in a single step. Faster, but less precise and without the interactive preview or phased feedback.
            </p>
        </div>
        `;
}
/**
 * Build HTML for Phase 1: Foundation
 */
function buildFoundationPreview(bp) {
    if (!bp.core_premise) return null;
    return `
        <div class="storymode-wizard-preview-section">
            <h4><i class="fa-solid fa-layer-group"></i> Premise</h4>
            <p>${escapeHtml(bp.core_premise)}</p>
        </div>
        ${bp.setting ? `
        <div class="storymode-wizard-preview-section">
            <h4><i class="fa-solid fa-map-location-dot"></i> Setting</h4>
            <p>${escapeHtml(bp.setting.location || 'Unknown location')} • ${escapeHtml(bp.setting.time_period || 'Unknown time')}</p>
        </div>` : ''
        }
    `;
}

/**
 * Build HTML for Phase 2: Characters
 */
function buildCharactersPreview(bp) {
    if (!bp.character_arcs?.length) return null;
    const chars = bp.character_arcs.map(c =>
        `<li> <strong>${escapeHtml(c.character_name)}</strong>: ${escapeHtml(c.initial_state || 'Unknown')}</li> `
    ).join('');
    return `
        <div class="storymode-wizard-preview-section">
            <h4><i class="fa-solid fa-users"></i> Character Arcs</h4>
            <ul>${chars}</ul>
        </div>
        `;
}

/**
 * Build HTML for Phase 3: Scenes
 */
function buildScenesPreview(bp) {
    if (!bp.scene_plan?.length) return null;
    const scenes = bp.scene_plan.slice(0, 3).map(s =>
        `<li> ${escapeHtml(s.title || 'Untitled')} (${escapeHtml(s.phase || 'Unknown')})</li> `
    ).join('');
    const moreCount = Math.max(0, bp.scene_plan.length - 3);

    return `
        <div class="storymode-wizard-preview-section">
            <h4><i class="fa-solid fa-film"></i> Scene Plan</h4>
            <p>${bp.scene_plan.length} scenes generated.</p>
            <ul>
                ${scenes}
                ${moreCount > 0 ? `<li><em>...and ${moreCount} more</em></li>` : ''}
            </ul>
        </div>
        `;
}

/**
 * Build HTML for Phase 4: Resolutions
 * NOTE: Detailed ending display is shown in a separate container (#storymode-resolution-selection-container)
 * This just shows a minimal indicator in the preview
 */
function buildResolutionsPreview(bp) {
    if (!bp.primary_ending?.title) return null;
    // Just show a minimal indicator - detailed display is in the dedicated container
    return `
        <div class="storymode-wizard-preview-section">
            <h4><i class="fa-solid fa-flag-checkered"></i> Story Ending</h4>
            <p><em>Ending generated: ${escapeHtml(bp.primary_ending.title)}</em></p>
        </div>
        `;
}

/**
 * Build HTML for cover image preview (if available)
 * Displays cover in portrait aspect ratio (3:4) like storymode-cover-preview
 */
function buildCoverImagePreview(bp) {
    const imageUrl = bp.coverImageUrl || bp.cover_image_url;
    if (!imageUrl) return null;
    return `
        <div class="storymode-wizard-preview-section" style="display: flex; flex-direction: column; align-items: center; gap: 0.75rem; padding: 0; margin-bottom: 1rem;">
            <h4 style="margin: 0.75rem 0.75rem 0 0.75rem; width: 100%;"><i class="fa-solid fa-image"></i> Cover Art</h4>
            <div style="position: relative; flex: 0 0 auto; width: 250px; aspect-ratio: 3/4; background: var(--black30a); border-radius: 8px; overflow: hidden; margin: 0 0.75rem 0.75rem 0.75rem;">
                <img src="${escapeHtml(imageUrl)}" alt="Blueprint Cover" style="width: 100%; height: 100%; object-fit: cover; object-position: center;">
            </div>
        </div>
        `;
}

