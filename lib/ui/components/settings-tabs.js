/**
 * Settings Tab Components for Story Mode Extension
 * Settings dialog tab content (Story Arc, Author Style, Blueprint Settings, Post-Arc, API Options)
 */

import { extension_prompt_types, extension_prompt_roles, characters, this_chid } from '/script.js';
import { extension_settings } from '/scripts/extensions.js';
import { groups, selected_group } from '/scripts/group-chats.js';

import {
    MODULE_NAME,
    getChatStoryState,
    getStoryTypes,
    getAuthorStyles,
} from '../../core/state-manager.js';

import { getPhaseInfo } from '../../core/arc-engine.js';
import { createHelpIcon, createHelpIconFromLines } from './helpers.js';
import { escapeHtml, getCheckedAttrDefaultTrue } from '../component-system.js';
import { buildBlueprintSettingsSubtab } from './blueprint-settings.js';

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

    // Build author style options for both dropdowns
    const sortedStyles = [...authorStyles].sort((a, b) => a.name.localeCompare(b.name));

    // Default dropdown uses settings.defaultAuthorStyle
    const defaultAuthorStyleOptions = sortedStyles.map(style =>
        `<option value="${style.id}" ${style.id === settings.defaultAuthorStyle ? 'selected' : ''}>${escapeHtml(style.name)} (${escapeHtml(style.category.join(', '))})</option>`
    ).join('');

    // Current chat dropdown uses chatState.selectedAuthorStyle
    const authorStyleOptions = sortedStyles.map(style =>
        `<option value="${style.id}" ${style.id === chatState.selectedAuthorStyle ? 'selected' : ''}>${escapeHtml(style.name)} (${escapeHtml(style.category.join(', '))})</option>`
    ).join('');

    // Get current author style description (for per-chat)
    const currentAuthorStyle = authorStyles.find(s => s.id === chatState.selectedAuthorStyle);
    let authorStyleDescription = 'Select an author style to see its guidance';
    if (currentAuthorStyle && currentAuthorStyle.authorPrompt) {
        authorStyleDescription = currentAuthorStyle.authorPrompt;
    }

    // Character/Group author style sections
    let characterSection = '';
    let groupSection = '';

    // Character Author Style (only for 1:1 chats)
    if (selected_group === null && this_chid !== undefined && characters?.[this_chid]) {
        const char = characters[this_chid];
        const charAuthorStyle = char.data?.extensions?.story_mode?.authorStyle || '';

        const charAuthorStyleOptions = sortedStyles.map(style =>
            `<option value="${style.id}" ${style.id === charAuthorStyle ? 'selected' : ''}>${escapeHtml(style.name)} (${escapeHtml(style.category.join(', '))})</option>`
        ).join('');

        characterSection = `
<!-- Character Author Style Override -->
<div class="storymode-form-group">
    <label class="storymode-form-label">
        <i class="fa-solid fa-user"></i> Character Author Style
        <span class="source-name-badge">(for ${escapeHtml(char.name)})</span>
        ${createHelpIcon('Author style embedded in this character. Overrides chat and default author style settings when chatting with this character.')}
    </label>
    <div class="storymode-select-group">
        <select id="character_author_style_select" class="storymode-select">
            <option value="">None (use chat/default)</option>
            ${charAuthorStyleOptions}
        </select>
        <button id="save_character_author_style_btn" class="menu_button" title="Save to character">
            <i class="fa-solid fa-save"></i>
        </button>
    </div>
    <p class="storymode-form-hint">
        <i class="fa-solid fa-triangle-exclamation"></i>
        This author style overrides chat and default settings when chatting with ${escapeHtml(char.name)}
    </p>
</div>
`;
    }

    // Group Author Style (only for group chats)
    if (selected_group !== null && groups) {
        const group = groups.find(g => g.id === selected_group);
        const groupAuthorStyle = settings.groupAuthorStyles?.[selected_group] || '';

        const groupAuthorStyleOptions = sortedStyles.map(style =>
            `<option value="${style.id}" ${style.id === groupAuthorStyle ? 'selected' : ''}>${escapeHtml(style.name)} (${escapeHtml(style.category.join(', '))})</option>`
        ).join('');

        if (group) {
            groupSection = `
<!-- Group Author Style Override -->
<div class="storymode-form-group">
    <label class="storymode-form-label">
        <i class="fa-solid fa-users"></i> Group Author Style
        <span class="source-name-badge">(for ${escapeHtml(group.name)})</span>
        ${createHelpIcon('Author style for this group chat. Overrides chat and default author style settings for this group.')}
    </label>
    <div class="storymode-select-group">
        <select id="group_author_style_select" class="storymode-select">
            <option value="">None (use chat/default)</option>
            ${groupAuthorStyleOptions}
        </select>
        <button id="save_group_author_style_btn" class="menu_button" title="Save to group">
            <i class="fa-solid fa-save"></i>
        </button>
    </div>
    <p class="storymode-form-hint">
        <i class="fa-solid fa-triangle-exclamation"></i>
        This author style overrides chat and default settings for group chat: ${escapeHtml(group.name)}
    </p>
</div>
`;
        }
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
<!-- Current Chat Author Style -->
<div class="storymode-form-group">
<label class="storymode-form-label">Current Chat Author Style ${createHelpIcon('Author style for the current chat')}</label>
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
<!-- Default Author Style (for new chats) -->
<div class="storymode-form-group">
<label class="storymode-form-label">Default Author Style ${createHelpIcon('Author style that will be applied to all new chats')}</label>
<div class="storymode-select-group">
<select id="default_author_style_select" class="storymode-select">
<option value="">None</option>
${defaultAuthorStyleOptions}
</select>
</div>
<p class="storymode-form-hint">This author style will be used for all new chats</p>
</div>
${characterSection}
${groupSection}
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
<div class="storymode-toggle">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Generate What's Next Options</span>
<span class="storymode-toggle-description">Automatically generate 3 scenario options for continuing the story</span>
${createHelpIcon('When the story arc ends, generate themes and scenario options for what\'s next')}
</div>
<label class="storymode-switch">
<input type="checkbox" id="next_adventure_enabled" ${settings.nextAdventureEnabled ? 'checked' : ''}>
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
    return `
<!-- Blueprint Generation APIs -->
<div class="storymode-card">
<h4 class="storymode-card-title">Scenario Blueprint Generation</h4>
<div class="storymode-form-group">
<label class="storymode-form-label">Scenario Blueprint Generation Profile ${createHelpIcon('Which API connection to use for generating story blueprints')}</label>
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
<label class="storymode-form-label">Summary Profile ${createHelpIcon('API profile for: (1) End-of-arc chat summaries, (2) Scene summarization (Blueprint feature). If blank, uses the default API.')}</label>
<select id="summary_api" class="storymode-select">
<option value="">Default API</option>
</select>
</div>
<div class="storymode-form-group">
<label class="storymode-form-label">What's Next Profile ${createHelpIcon('Which API connection to use for generating What\'s Next scenario options')}</label>
<select id="next_adventure_api" class="storymode-select">
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
            id: 'blueprint_settings', icon: 'scroll', label: 'Scenario Blueprint Settings',
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

// Re-export buildBlueprintSettingsSubtab for convenience
export { buildBlueprintSettingsSubtab };
