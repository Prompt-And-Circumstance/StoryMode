/**
 * Blueprint Tab Components for Story Mode Extension
 * Blueprint generation and display tab content
 */

import { saveChatConditional } from '/script.js';
import { extension_settings, getContext } from '/scripts/extensions.js';

import {
    MODULE_NAME,
    getChatStoryState,
    getStoryTypes,
    getAuthorStyles,
    getCurrentSceneIndex,
} from '../../core/state-manager.js';

import * as BlueprintModule from '../../blueprint/module.js';
import { getBlueprintCoverUrl, isValidImageUrl } from '../../blueprint/utils.js';
import { createHelpIcon, createHelpIconFromLines } from './helpers.js';
import { escapeHtml } from '../component-system.js';
import { renderBeatProgress } from './main-panel.js';
import { buildWizardSettingsToggle } from './wizard.js';
import { pushStoryMessage } from '../../core/event-handlers.js';

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

    const wizardEnabled = extension_settings[MODULE_NAME]?.blueprintSettings?.wizardMode?.enabled !== false;
    const chatState = getChatStoryState();
    const selectedStoryTypeId = chatState.selectedStoryType || extension_settings[MODULE_NAME].selectedStoryType || '';
    const selectedAuthorStyleId = chatState.selectedAuthorStyle || extension_settings[MODULE_NAME].selectedAuthorStyle || '';

    const storyTypes = getStoryTypes();
    const storyTypeOptions = storyTypes.map(type =>
        `<option value="${escapeHtml(type.id)}" ${type.id === selectedStoryTypeId ? 'selected' : ''}>${escapeHtml(type.name)}</option>`
    ).join('');

    const authorStyles = getAuthorStyles();
    const authorStyleOptions = ['<option value="">None</option>']
        .concat(authorStyles.map(style =>
            `<option value="${escapeHtml(style.id)}" ${style.id === selectedAuthorStyleId ? 'selected' : ''}>${escapeHtml(style.name)}</option>`
        ))
        .join('');

    return `
        <p style="color: var(--SmartThemeBodyColor); margin-bottom: 20px;">
            Generate a structured scenario blueprint using an LLM.The scenario blueprint will guide the AI through your narrative arc.
        </p>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 20px;">
            <div class="storymode-form-group">
                <label class="storymode-form-label">Story Type ${createHelpIcon('Select the narrative structure for this scenario blueprint')}</label>
                <select id="blueprint_story_type" class="storymode-select">${storyTypeOptions}</select>
                <p class="storymode-form-hint">The scenario blueprint will use this story type's structure</p>
            </div>
            <div class="storymode-form-group">
                <label class="storymode-form-label">Author Style ${createHelpIcon('Optional: Select an author style for this scenario blueprint')}</label>
                <select id="blueprint_author_style" class="storymode-select">${authorStyleOptions}</select>
                <p class="storymode-form-hint">The scenario blueprint will emulate this author's writing style</p>
            </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 20px;">
            <div>
                <div class="storymode-form-group">
                    <label class="storymode-form-label">Scenario ${createHelpIcon('Describe your story\'s starting situation. Leave empty to use chat context.')}</label>
                    <textarea id="blueprint_scenario" class="storymode-textarea" rows="6" placeholder="Describe the starting situation for your story...">${scenarioText}</textarea>
                    <p class="storymode-form-hint">The initial premise and setting for your story</p>
                </div>
                <div class="storymode-form-group">
                    <label class="storymode-form-label">Genre Realism / Flexibility ${createHelpIconFromLines(['Literal: Magic/tech is real', 'Grounded: Subtle, ambiguous', 'Mixed: Both literal and metaphorical', 'Symbolic: Social/emotional metaphors'])}</label>
                    <select id="blueprint_metaphor_level" class="storymode-select">
                        <option value="literal" selected>Literal - genre elements are real and concrete</option>
                        <option value="grounded">Grounded - subtle, ambiguous genre elements</option>
                        <option value="mixed">Mixed - both literal and metaphorical</option>
                        <option value="symbolic">Symbolic - social/emotional "monsters"</option>
                    </select>
                    <p class="storymode-form-hint">How literally should genre elements be interpreted?</p>
                </div>
                <div class="storymode-form-group">
                    <label class="storymode-form-label">Story Length</label>
                    <select id="blueprint_story_length" class="storymode-select">
                        <option value="5">Short (5 scenes)</option>
                        <option value="10" selected>Medium (10 scenes)</option>
                        <option value="15">Long (15 scenes)</option>
                        <option value="20">Very Long (20 scenes)</option>
                    </select>
                    <p class="storymode-form-hint">Total number of scenes to generate</p>
                </div>
                <div class="storymode-form-group">
                    <label class="storymode-form-label">Custom Scenes (Optional)</label>
                    <input type="number" id="blueprint_custom_rounds" class="storymode-input" min="1" max="500" placeholder="Override default length">
                    <p class="storymode-form-hint">Enter a custom number of scenes to override the selected length</p>
                </div>
            </div>
            <div>
                <div class="storymode-form-group">
                    <label class="storymode-form-label">Characters to Include ${createHelpIcon('Select which chat characters to include in the blueprint')}</label>
                    <div id="blueprint_characters_list" class="storymode-character-list" style="max-height: 140px;">${charactersHtml}</div>
                </div>
                <div class="storymode-form-group">
                    <label class="storymode-form-label">Personas (Player Characters) ${createHelpIcon('Select which player character identities to include')}</label>
                    <div id="blueprint_personas_list" class="storymode-character-list" style="max-height: 140px;">${personasHtml}</div>
                </div>
            </div>
        </div>
        <div class="inline-drawer" id="blueprint_prompt_drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <h4 class="storymode-section-title" style="margin: 0;"><i class="fa-solid fa-code"></i> Advanced Options</h4>
                <div class="inline-drawer-icon fa-solid interactable down fa-circle-chevron-down" tabindex="0" role="button"></div>
            </div>
            <div class="inline-drawer-content" style="display: none;">
                ${buildWizardSettingsToggle(wizardEnabled)}
                <div class="storymode-form-group" id="blueprint_prompt_group" style="margin-top: 20px;">
                    <label class="storymode-form-label">Master Prompt Template</label>
                    <div id="blueprompt_prompt_wrapper" style="position: relative;">
                        <textarea id="blueprint_master_prompt_edit" class="storymode-textarea monospace" rows="5">${masterPrompt}</textarea>
                        <button class="editor_maximize" data-for="blueprint_master_prompt_edit" data-tab="true" title="Expand the editor"><i class="fa-solid fa-expand"></i></button>
                    </div>
                    <button id="blueprint_reset_prompt" class="menu_button storymode-btn storymode-btn-secondary" style="margin-top: 10px;"><i class="fa-solid fa-rotate-left"></i> Reset to Default</button>
                </div>
            </div>
        </div>
        <div class="storymode-generate-actions" style="margin-top: 24px; display: flex; flex-direction: column; align-items: center; gap: 12px;">
            <button id="blueprint_generate_btn" class="menu_button storymode-btn storymode-btn-primary" style="width: 300px; height: 60px; font-size: 1.1em;"><i class="fa-solid fa-wand-magic-sparkles"></i> Generate Scenario Blueprint</button>
            <button id="blueprint_cancel_generation_btn" class="menu_button storymode-btn storymode-btn-secondary" style="display: none; width: 300px; height: 60px; font-size: 1.1em;"><i class="fa-solid fa-times"></i> Cancel Generation</button>
        </div>
    `;
}

/**
 * Build the Blueprint tab content.
 * @returns {string} HTML string for blueprint tab
 */
export function buildBlueprintTabContent() {
    const blueprintState = BlueprintModule.getBlueprintState();
    const blueprint = blueprintState.blueprint;
    const chatState = getChatStoryState();
    const hasBlueprint = !!blueprint;
    const generateActive = !hasBlueprint;
    const overviewActive = hasBlueprint;

    const currentScene = hasBlueprint ? BlueprintModule.getCurrentScene(
        blueprint, chatState.currentStep, chatState.arcLength,
        blueprintState.sceneMode || 'auto', getCurrentSceneIndex()
    ) : null;

    const canStartStory = hasBlueprint && blueprint.scene_plan && blueprint.scene_plan.length > 0;

    return `
        <div class="storymode-blueprint-subtabs">
            <button class="storymode-blueprint-subtab ${overviewActive ? 'active' : ''}" data-subtab="overview"><i class="fa-solid fa-info-circle"></i>&nbsp;Overview</button>
            <button class="storymode-blueprint-subtab" data-subtab="characters"><i class="fa-solid fa-users"></i>&nbsp;Characters</button>
            <button class="storymode-blueprint-subtab" data-subtab="scenes"><i class="fa-solid fa-film"></i>&nbsp;Scenes</button>
            <button class="storymode-blueprint-subtab" data-subtab="json"><i class="fa-solid fa-code"></i>&nbsp;Raw JSON</button>
            <span class="storymode-subtab-spacer"></span>
            ${canStartStory ? '<button id="start_story_from_blueprint_btn" class="storymode-btn-start"><i class="fa-solid fa-play"></i>&nbsp;Start Story</button>' : ''}
        </div>
        <div id="blueprint_subtab_content">
            ${generateActive ? buildGenerateBlueprintSubtab() : (hasBlueprint ? renderBlueprintOverviewSubtab(blueprint, currentScene) : '')}
        </div>
    `;
}

/**
 * Render the scene/round navigation slider
 */
function renderSceneSlider(blueprint, chatState, currentScene) {
    const sceneCount = blueprint.scene_plan.length;
    const arcLength = chatState.arcLength || 30;
    const currentStep = chatState.currentStep || 0;
    const currentSceneIndex = currentScene?.index ?? 0;
    const roundsPerScene = Math.floor(arcLength / sceneCount);
    const sceneBoundaries = [];
    let roundAccumulator = 0;

    for (let i = 0; i < sceneCount; i++) {
        const endRound = (i === sceneCount - 1) ? arcLength - 1 : Math.min(roundAccumulator + roundsPerScene - 1, arcLength - 1);
        sceneBoundaries.push({ sceneIndex: i, startRound: roundAccumulator, endRound, title: blueprint.scene_plan[i].title || `Scene ${i + 1}` });
        roundAccumulator = endRound + 1;
    }

    const progressPercent = arcLength > 0 ? (currentStep / arcLength) * 100 : 0;
    let sliderContent = '';

    sceneBoundaries.forEach((scene, idx) => {
        const isCompleted = scene.sceneIndex < currentSceneIndex;
        const isCurrent = scene.sceneIndex === currentSceneIndex;
        const truncatedTitle = scene.title.length > 18 ? scene.title.substring(0, 18) + '…' : scene.title;

        sliderContent += `
            <div class="storymode-scene-marker ${isCompleted ? 'completed' : ''} ${isCurrent ? 'active' : ''}" data-scene="${scene.sceneIndex}" data-round="${scene.startRound}" title="${escapeHtml(scene.title)}">
                <div class="marker-circle">${isCompleted ? '✓' : scene.sceneIndex + 1}</div>
                <div class="marker-label">
                    <span class="marker-number">Scene ${scene.sceneIndex + 1}</span>
                    <span class="marker-title">${escapeHtml(truncatedTitle)}</span>
                </div>
            </div>
        `;

        if (idx < sceneCount - 1) {
            let ticksHtml = '';
            for (let r = scene.startRound; r <= scene.endRound; r++) {
                ticksHtml += `<div class="tick ${r === currentStep ? 'active' : ''}" data-round="${r}" title="Round ${r + 1}"></div>`;
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
                <span class="storymode-mode-indicator">Mode: ${currentScene?.sceneMode === 'manual' ? 'Manual' : 'Auto'}</span>
            </div>
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

    let authorStyle = 'None';
    if (blueprint.author_style_name) {
        authorStyle = blueprint.author_style_name;
    } else if (blueprint.author_style) {
        const style = authorStyles.find(s => s.id === blueprint.author_style);
        authorStyle = style?.name || blueprint.author_style;
    }

    const coverUrl = getBlueprintCoverUrl(blueprint);
    const safeCoverUrl = isValidImageUrl(coverUrl) ? coverUrl : null;

    return `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h3 style="margin: 0; color: var(--sm-accent); font-size: 1.3em;">${escapeHtml(title)}</h3>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button id="blueprint_export_btn" class="menu_button storymode-btn storymode-btn-secondary"><i class="fa-solid fa-download"></i> Export</button>
                <button id="blueprint_edit_btn" class="menu_button storymode-btn storymode-btn-secondary"><i class="fa-solid fa-pen-to-square"></i> Edit</button>
                <button id="blueprint_clear_btn" class="menu_button storymode-btn storymode-btn-danger"><i class="fa-solid fa-trash"></i> Clear</button>
            </div>
        </div>
        <div class="storymode-blueprint-overview-layout">
            ${safeCoverUrl ? `<div class="storymode-blueprint-overview-cover" style="background-image: url('${escapeHtml(encodeURI(safeCoverUrl))}')"></div>` : ''}
            <div class="storymode-blueprint-info-grid">
                <div class="storymode-info-card"><label>Story Type</label><span>${escapeHtml(blueprint.story_type_name || blueprint.story_type_id || 'Unknown')}</span></div>
                <div class="storymode-info-card"><label>Author Style</label><span>${escapeHtml(authorStyle)}</span></div>
                <div class="storymode-info-card"><label>Total Scenes</label><span>${blueprint.scene_plan?.length || 0}</span></div>
                <div class="storymode-info-card"><label>Target Length</label><span>${blueprint.arc_structure?.total_messages_target || blueprint.total_messages_target || 'N/A'} rounds</span></div>
                <div class="storymode-info-card"><label>Generated By</label><span>${escapeHtml(blueprint.llmDescriptor || 'Unknown')}</span></div>
                ${blueprint.core_premise ? `<div class="storymode-premise">${escapeHtml(blueprint.core_premise)}</div>` : ''}
            </div>
        </div>
        ${blueprint.setting ? `
            <div class="storymode-card">
                <h4 class="storymode-card-title"><i class="fa-solid fa-map-location-dot"></i> Setting</h4>
                <div class="storymode-info-row"><span class="storymode-info-label">Location</span><span class="storymode-info-value">${escapeHtml(blueprint.setting.location || 'N/A')}</span></div>
                <div class="storymode-info-row"><span class="storymode-info-label">Time Period</span><span class="storymode-info-value">${escapeHtml(blueprint.setting.time_period || 'N/A')}</span></div>
                <div class="storymode-info-row"><span class="storymode-info-label">Atmosphere</span><span class="storymode-info-value">${escapeHtml(blueprint.setting.atmosphere || 'N/A')}</span></div>
            </div>
        ` : ''}
        ${blueprint.opening_message ? `
            <div class="storymode-card">
                <h4 class="storymode-card-title" style="display: flex; justify-content: space-between; align-items: center;">
                    <span><i class="fa-solid fa-book-open"></i> Opening Message</span>
                    <button id="inject_opening_message_btn" class="menu_button storymode-btn storymode-btn-primary" style="font-size: 0.75em; padding: 4px 16px; height: auto; line-height: 1.2;">
                        <i class="fa-solid fa-message-plus"></i> Insert to Chat
                    </button>
                </h4>
                <div style="padding: 12px; border-radius: 8px; max-height: 200px; overflow-y: auto; white-space: pre-wrap; word-wrap: break-word; font-size: 0.9em; line-height: 1.5; border: 1px solid var(--SmartThemeBorderColor); text-align: left;">${escapeHtml(blueprint.opening_message)}</div>
            </div>
        ` : ''}
        ${blueprint.scene_plan && blueprint.scene_plan.length > 0 ? renderSceneSlider(blueprint, chatState, currentScene) : ''}
        ${currentScene ? `
            <div class="storymode-card">
                <h4 class="storymode-card-title"><i class="fa-solid fa-clapperboard"></i> Current Scene</h4>
                <div class="storymode-scene-card current">
                    <div class="storymode-scene-title">${escapeHtml(currentScene.title || 'Untitled')}</div>
                    <div class="storymode-scene-meta">Scene ${currentScene.index + 1}/${blueprint.scene_plan?.length || 0} • ${escapeHtml(currentScene.phase || 'Unknown')}</div>
                    ${currentScene.purpose ? `<p style="margin-top: 8px; font-size: 0.9em; color: var(--SmartThemeBodyColor);">${escapeHtml(currentScene.purpose)}</p>` : ''}
                </div>
            </div>
        ` : ''}
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
        const sceneWithIndex = { ...scene, index };
        const beatsHtml = renderBeatProgress(sceneWithIndex);
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
    const hasMainCharacters = blueprint.protagonist_group?.main_characters?.length > 0;
    const hasProtagonistGroupFields = blueprint.protagonist_group && (blueprint.protagonist_group.description || blueprint.protagonist_group.shared_goal || blueprint.protagonist_group.group_dynamic);
    const meaningfulCharacterArcs = (blueprint.character_arcs || []).filter(arc => arc.character_name && arc.character_name !== 'Unknown' && arc.character_name !== 'Starting state');
    const hasCharacterArcs = meaningfulCharacterArcs.length > 0;

    if (!hasCharacterArcs && !hasMainCharacters && !hasProtagonistGroupFields) {
        return '<p class="storymode-form-hint">No character information defined in this blueprint.</p>';
    }

    let html = '';

    if (blueprint.protagonist_group?.type) {
        html += `<div style="margin-bottom: 16px;"><span class="storymode-form-hint">Group Type:</span><span style="margin-left: 8px; font-weight: 500;">${escapeHtml(blueprint.protagonist_group.type)}</span></div>`;
    }

    if (hasProtagonistGroupFields) {
        html += `<div class="storymode-card"><h4 class="storymode-card-title"><i class="fa-solid fa-users"></i> Protagonist Group</h4>`;
        if (blueprint.protagonist_group.description) html += `<div class="storymode-info-row"><span class="storymode-info-label">Description</span><span class="storymode-info-value">${escapeHtml(blueprint.protagonist_group.description)}</span></div>`;
        if (blueprint.protagonist_group.shared_goal) html += `<div class="storymode-info-row"><span class="storymode-info-label">Shared Goal</span><span class="storymode-info-value">${escapeHtml(blueprint.protagonist_group.shared_goal)}</span></div>`;
        if (blueprint.protagonist_group.group_dynamic) html += `<div class="storymode-info-row"><span class="storymode-info-label">Group Dynamic</span><span class="storymode-info-value">${escapeHtml(blueprint.protagonist_group.group_dynamic)}</span></div>`;
        html += `</div>`;
    }

    if (hasMainCharacters) {
        html += blueprint.protagonist_group.main_characters.map(char => `
            <div class="storymode-card">
                <h4 class="storymode-card-title"><i class="fa-solid fa-user"></i> ${escapeHtml(char.name || 'Unknown')}</h4>
                ${char.role_in_story ? `<div class="storymode-info-row"><span class="storymode-info-label">Role</span><span class="storymode-info-value">${escapeHtml(char.role_in_story)}</span></div>` : ''}
                ${char.key_skills_or_powers ? `<div class="storymode-info-row"><span class="storymode-info-label">Skills/Powers</span><span class="storymode-info-value">${escapeHtml(char.key_skills_or_powers)}</span></div>` : ''}
                ${char.core_wound_or_need ? `<div class="storymode-info-row"><span class="storymode-info-label">Core Wound/Need</span><span class="storymode-info-value">${escapeHtml(char.core_wound_or_need)}</span></div>` : ''}
                ${char.primary_goal ? `<div class="storymode-info-row"><span class="storymode-info-label">Primary Goal</span><span class="storymode-info-value">${escapeHtml(char.primary_goal)}</span></div>` : ''}
            </div>
        `).join('');
    }

    if (hasCharacterArcs) {
        html += meaningfulCharacterArcs.map(arc => `
            <div class="storymode-card">
                <h4 class="storymode-card-title"><i class="fa-solid fa-user"></i> ${escapeHtml(arc.character_name)}</h4>
                ${arc.initial_state ? `<div class="storymode-info-row"><span class="storymode-info-label">Initial State</span><span class="storymode-info-value">${escapeHtml(arc.initial_state)}</span></div>` : ''}
                ${arc.final_state ? `<div class="storymode-info-row"><span class="storymode-info-label">Final State</span><span class="storymode-info-value">${escapeHtml(arc.final_state)}</span></div>` : ''}
                ${arc.emotional_trajectory ? `<div class="storymode-info-row"><span class="storymode-info-label">Emotional Trajectory</span><span class="storymode-info-value">${escapeHtml(arc.emotional_trajectory)}</span></div>` : ''}
            </div>
        `).join('');
    }

    return html;
}

/**
 * Render the JSON subtab for blueprint
 */
export function renderBlueprintJsonSubtab(blueprint) {
    return `<textarea class="storymode-textarea monospace" style="min-height: 400px;" readonly>${JSON.stringify(blueprint, null, 2)}</textarea>`;
}

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
                    <div class="storymode-toggle-info"><span class="storymode-toggle-label">Enable Scenario Blueprints</span></div>
                    <label class="storymode-switch"><input type="checkbox" id="blueprint_enabled_tab"><span class="storymode-switch-slider"></span></label>
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
            <h4 class="storymode-card-title">Scenario Blueprint Settings</h4>
            <div class="storymode-toggle">
                <div class="storymode-toggle-info"><span class="storymode-toggle-label">Enable Scenario Blueprints</span><span class="storymode-toggle-description">Use LLM-generated story structure</span></div>
                <label class="storymode-switch"><input type="checkbox" id="blueprint_enabled" ${settings.blueprintSettings?.enabled ? 'checked' : ''}><span class="storymode-switch-slider"></span></label>
            </div>
        </div>
        <div class="storymode-info-box">
            <p><strong>Note:</strong> Scenario blueprint generation and import have been moved to the <strong>Current Scenario</strong> tab.</p>
            <p class="storymode-form-hint">Click the "Current Scenario" tab above to access scenario blueprint generation, or to load one from JSON.</p>
        </div>
    `;
}
