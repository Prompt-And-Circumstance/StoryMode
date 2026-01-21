/**
 * Blueprint Editor Module - Split-Panel Architecture
 *
 * Left Panel: Blueprint info display
 * Right Panel: Tabbed editor (Blueprint Details, Scenes)
 *
 * Architecture:
 * - Opens as a wide modal using callGenericPopup()
 * - Split-panel layout: fixed left panel (280px), flexible right panel
 * - Two tabs: Details (all blueprint fields), Scenes (scene CRUD)
 * - Immediate field updates with validation on save
 * - Revert functionality to discard changes
 * - Event delegation for robust dynamic element handling
 */

// ============================================================================
// IMPORTS
// ============================================================================

import { extension_settings, getContext } from '/scripts/extensions.js';
import { saveSettingsDebounced, saveMetadata } from '/script.js';
import { callGenericPopup, POPUP_TYPE } from '/scripts/popup.js';
import { SlashCommandParser } from '/scripts/slash-commands/SlashCommandParser.js';
import * as BlueprintModule from '../blueprint/module.js';
import { getStoryTypes, getAuthorStyles } from '../core/state-manager.js';
import {
    escapeHtml,
    setNestedValue,
    getNestedValue,
    buildSelectOptions,
    generateUUID,
} from '../blueprint/utils.js';
import { generateCoverPrompt } from '../blueprint/storage.js';
import { DROPDOWN_OPTIONS } from '../blueprint/schema.js';
import { isCoverDebugMode, getMockCoverResult } from '../debug/mocks.js';

// Load editor CSS
// CSS is loaded via @import in main style.css

// ============================================================================
// CONSTANTS
// ============================================================================

export const MODULE_NAME = 'story_mode';

// Default scene template for new scenes
const DEFAULT_SCENE = {
    phase: 'setup',
    purpose: 'Advancing the story',
    situation: 'A new scene unfolds',
    key_events_if_unchanged: [],
    choice_points: [],
    character_focus: [],
    hooks_for_future: []
};

// ============================================================================
// STATE
// ============================================================================

let currentBlueprint = null;
let originalBlueprint = null;
let activeTab = 'details';  // 'details' | 'scenes' | 'cover'
let hasUnsavedChanges = false;

// ============================================================================
// RENDER HELPERS
// ============================================================================

/**
 * Refresh the editor right panel content
 * Re-renders and re-attaches event listeners using delegation
 */
function refreshEditor() {
    const rightPanel = $('.storymode-editor-right-panel');
    if (rightPanel.length) {
        rightPanel.html(renderRightPanel());
    }
}

/**
 * Refresh only the left panel (blueprint info sidebar)
 */
function refreshLeftPanel() {
    const leftPanel = $('.storymode-editor-left-panel');
    if (leftPanel.length) {
        leftPanel.html(renderLeftPanel());
    }
}

/**
 * Refresh only the content area (preserves tabs)
 */
function refreshContent() {
    const content = $('.storymode-editor-content');
    if (content.length) {
        switch (activeTab) {
            case 'details':
                content.html(renderDetailsTab());
                break;
            case 'scenes':
                content.html(renderScenesTab());
                break;
            case 'cover':
                content.html(renderCoverTab());
                break;
            default:
                content.html(renderDetailsTab());
        }
    }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Ensures the cover gallery is initialized, migrating legacy single-cover blueprints
 * @param {Object} blueprint - The blueprint to initialize
 * @returns {Object} The blueprint with gallery initialized
 */
function ensureGalleryInitialized(blueprint) {
    if (!blueprint.metadata) {
        blueprint.metadata = {};
    }

    // Already has gallery - nothing to do
    if (Array.isArray(blueprint.metadata.coverGallery)) {
        return blueprint;
    }

    // Initialize empty gallery
    blueprint.metadata.coverGallery = [];
    blueprint.metadata.coverGalleryIndex = null;

    // Migrate existing single cover if present
    const existingCover = blueprint.coverImageUrl || blueprint.metadata.coverImageUrl;
    if (existingCover && isValidImageUrl(existingCover)) {
        console.log('[BlueprintEditor] Migrating legacy cover to gallery');

        blueprint.metadata.coverGallery.push({
            id: generateUUID(),
            url: existingCover,
            prompt: blueprint.metadata.coverPrompt || null,
            timestamp: blueprint.metadata.createdAt || new Date().toISOString(),
            seed: blueprint.metadata.coverSeed || null,
            model: blueprint.metadata.coverModel?.name || 'Imported (Legacy)'
        });

        blueprint.metadata.coverGalleryIndex = 0;
    } else if (existingCover) {
        console.warn('[BlueprintEditor] Skipping legacy cover migration: invalid URL', existingCover.substring(0, 50));
    }

    return blueprint;
}

/**
 * Open the blueprint editor (split-panel view)
 * @param {Object} blueprint - The blueprint to edit (cloned for safety)
 * @returns {Promise<Object>} Saved blueprint or null if cancelled
 */
export async function openBlueprintEditor(blueprint) {
    console.log('[BlueprintEditor] Opening editor with blueprint:', blueprint);
    console.log('[BlueprintEditor] Input coverImageUrl:', blueprint?.coverImageUrl);
    console.log('[BlueprintEditor] Input coverGallery length:', blueprint?.metadata?.coverGallery?.length || 0);

    // Clone blueprint using structuredClone (modern, faster than JSON method)
    try {
        currentBlueprint = structuredClone(blueprint);
        originalBlueprint = structuredClone(blueprint);
    } catch (e) {
        // Fallback for older browsers
        currentBlueprint = JSON.parse(JSON.stringify(blueprint));
        originalBlueprint = JSON.parse(JSON.stringify(blueprint));
    }

    // Initialize gallery (handles migration from legacy single-cover blueprints)
    currentBlueprint = ensureGalleryInitialized(currentBlueprint);

    activeTab = 'details';
    hasUnsavedChanges = false;

    // Build the split-panel HTML
    const html = buildEditorHtml();

    // Show modal using callGenericPopup (returns true if saved, false if cancelled)
    // Store promise first so we can set up event listeners before awaiting
    const resultPromise = callGenericPopup(html, POPUP_TYPE.CONFIRM, null, {
        wide: true,
        large: true,
        okButton: 'Save Changes',
        cancelButton: 'Cancel',
    });

    // Set up event listeners immediately on document level
    // This bypasses the need to find the specific popup container
    setupDocumentEventListeners();

    // Now await the user's response
    const result = await resultPromise;

    if (result) {
        // User clicked Save
        const saved = await saveBlueprint();
        return saved ? currentBlueprint : null;
    } else {
        // User clicked Cancel or X
        if (hasUnsavedChanges) {
            const confirmDiscard = await callGenericPopup(
                'You have unsaved changes. Are you sure you want to discard them?',
                POPUP_TYPE.CONFIRM,
                null,
                { okButton: 'Discard Changes', cancelButton: 'Keep Editing' }
            );
            if (!confirmDiscard) {
                // User wants to keep editing - reopen editor
                return await openBlueprintEditor(currentBlueprint);
            }
        }
        return null;
    }
}

/**
 * Build the editor HTML structure
 * @returns {string} Complete HTML for the editor
 */
function buildEditorHtml() {
    return `
    <div class="storymode-blueprint-editor-container">
        <div class="storymode-editor-title-bar">
            <div class="storymode-editor-title">
                <i class="fa-solid fa-pen-to-square"></i> Edit Blueprint
            </div>
            <div class="storymode-editor-title-actions">
                <button class="menu_button" id="blueprint_view_json_btn" title="View raw JSON">
                    <i class="fa-solid fa-code"></i> View JSON
                </button>
                <button class="menu_button" id="blueprint_export_btn" title="Export as PNG with embedded resources">
                    <i class="fa-solid fa-download"></i> Export
                </button>
            </div>
        </div>
        <div class="storymode-blueprint-editor">
            ${renderLeftPanel()}
            ${renderRightPanel()}
        </div>
        <div class="storymode-editor-footer">
            <div class="storymode-editor-footer-left">
                ${hasUnsavedChanges ? '<span class="storymode-unsaved-message"><i class="fa-solid fa-circle-exclamation"></i> You have unsaved changes</span>' : ''}
            </div>
            <div class="storymode-editor-footer-right">
                <button class="menu_button" id="blueprint_revert_btn" ${!hasUnsavedChanges ? 'disabled' : ''}>
                    <i class="fa-solid fa-rotate-left"></i> Revert
                </button>
            </div>
        </div>
    </div>
    `;
}

// ============================================================================
// PANEL RENDERERS
// ============================================================================

/**
 * Render Left Panel content
 * Shows blueprint metadata
 * @returns {string} HTML content
 */
function renderLeftPanel() {
    const bp = currentBlueprint;
    const id = bp.blueprint_id || 'N/A';
    const shortId = id.length > 12 ? `${id.substring(0, 8)}...` : id;
    const title = bp.blueprint_title || 'Untitled Blueprint';
    const createdDate = bp.created_at ? new Date(bp.created_at).toLocaleDateString() : new Date().toLocaleDateString();
    const modifiedDate = bp.modified_at ? new Date(bp.modified_at).toLocaleDateString() : 'Just now';

    return `
        <div class="storymode-editor-left-panel">
            <div class="storymode-blueprint-info">
                <h3 class="storymode-blueprint-title">${escapeHtml(title)}</h3>
                <p style="margin: 0 0 12px 0; font-size: 0.85em; opacity: 0.7;">Blueprint Info</p>
                <div class="storymode-info-field">
                    <label>ID:</label>
                    <span class="monospace">${escapeHtml(shortId)}</span>
                </div>
                <div class="storymode-info-field">
                    <label>Story Type:</label>
                    <span>${escapeHtml(bp.story_type_name || 'Unknown')}</span>
                </div>
                <div class="storymode-info-field">
                    <label>Author Style:</label>
                    <span>${escapeHtml(bp.author_style_name || 'None')}</span>
                </div>
                <div class="storymode-info-field">
                    <label>Story Length:</label>
                    <span>${bp.arc_structure?.total_messages_target || 30} rounds</span>
                </div>
                <div class="storymode-info-field">
                    <label>Scenes:</label>
                    <span>${bp.scene_plan?.length || 0} scenes</span>
                </div>
                <div class="storymode-info-field">
                    <label>Generated By:</label>
                    <span>${escapeHtml(bp.llmDescriptor || 'Unknown')}</span>
                </div>
                <hr>
                <div class="storymode-info-field">
                    <label>Created:</label>
                    <span>${escapeHtml(createdDate)}</span>
                </div>
                <div class="storymode-info-field">
                    <label>Last Modified:</label>
                    <span>${escapeHtml(modifiedDate)}</span>
                </div>
            </div>
            <div class="storymode-editor-play-btn-container">
                <button id="blueprint_editor_play_btn" class="storymode-btn-start storymode-editor-play-btn" title="Start story from this blueprint">
                    <i class="fa-solid fa-play"></i>
                </button>
            </div>
        </div>
    `;
}

/**
 * Render Right Panel content (tabbed editor)
 * @returns {string} HTML content
 */
function renderRightPanel() {
    return `
        <div class="storymode-editor-right-panel">
            <div class="storymode-editor-header">
                <div class="storymode-editor-tabs">
                    <button class="storymode-tab ${activeTab === 'details' ? 'active' : ''}" data-tab="details">
                        Blueprint Details
                    </button>
                    <button class="storymode-tab ${activeTab === 'scenes' ? 'active' : ''}" data-tab="scenes">
                        Scenes
                    </button>
                    <button class="storymode-tab ${activeTab === 'cover' ? 'active' : ''}" data-tab="cover">
                        <i class="fa-solid fa-image"></i> Cover
                    </button>
                    <button class="storymode-tab ${activeTab === 'characters' ? 'active' : ''}" data-tab="characters" title="View and link characters">
                        <i class="fa-solid fa-users"></i> Characters
                    </button>
                </div>
            </div>
            <div class="storymode-editor-content">
                ${renderTabContent()}
            </div>
        </div>
    `;
}

/**
 * Render the active tab content
 * @returns {string} HTML content
 */
function renderTabContent() {
    switch (activeTab) {
        case 'details':
            return renderDetailsTab();
        case 'scenes':
            return renderScenesTab();
        case 'cover':
            return renderCoverTab();
        case 'characters':
            return renderCharactersTab();
        default:
            return renderDetailsTab();
    }
}

// ============================================================================
// TAB RENDERERS (Right Panel)
// ============================================================================

/**
 * Render Tab 1: Blueprint Details
 * Based on the current "Generate Blueprint" form layout
 * @returns {string} HTML content
 */
function renderDetailsTab() {
    const bp = currentBlueprint;
    const storyTypes = getStoryTypes();
    const authorStyles = getAuthorStyles();

    // Build dropdowns using helper
    const storyTypeOptions = storyTypes.map(st =>
        `<option value="${st.id}" ${bp.story_type_id === st.id ? 'selected' : ''}>${escapeHtml(st.name)}</option>`
    ).join('');

    const authorStyleOptions = authorStyles.map(as =>
        `<option value="${as.id}" ${bp.author_style === as.id ? 'selected' : ''}>${escapeHtml(as.name)}</option>`
    ).join('');

    // Get current values for dropdowns
    const antagonistNature = getNestedValue(bp, 'antagonistic_forces.nature');
    const metaphorLevel = getNestedValue(bp, 'genre_realism_notes.metaphor_level_used');
    const violenceLevel = getNestedValue(bp, 'content_boundaries.violence_level');
    const romanceLevel = getNestedValue(bp, 'content_boundaries.romance_level');

    return `
        <!-- Blueprint Title -->
        <div class="storymode-form-section">
            <h3 class="storymode-section-title">
                <i class="fa-solid fa-heading"></i> Blueprint Title
            </h3>
            <div class="storymode-form-grid-full">
                <div>
                    <label for="edit_blueprint_title">Title</label>
                    <input type="text" id="edit_blueprint_title" class="text_pole" data-field="blueprint_title"
                        placeholder="Enter a descriptive title for this blueprint..." maxlength="200"
                        value="${escapeHtml(bp.blueprint_title || '')}" style="width: 100%;">
                </div>
            </div>
        </div>

        <!-- Story Type & Author Style -->
        <div class="storymode-form-section">
            <h3 class="storymode-section-title">Story Type & Author Style</h3>
            <div class="storymode-form-grid">
                <div>
                    <label for="edit_story_type">Story Type</label>
                    <select id="edit_story_type" class="text_pole" data-field="story_type_id" style="width: 100%;">
                        ${storyTypeOptions}
                    </select>
                </div>
                <div>
                    <label for="edit_author_style">Author Style</label>
                    <select id="edit_author_style" class="text_pole" data-field="author_style" style="width: 100%;">
                        <option value="" ${!bp.author_style ? 'selected' : ''}>None</option>
                        ${authorStyleOptions}
                    </select>
                </div>
            </div>
        </div>

        <!-- Core Premise -->
        <div class="storymode-form-section">
            <h3 class="storymode-section-title">Core Premise</h3>
            <div class="storymode-form-grid-full">
                <div>
                    <label for="edit_core_premise">What is this story about?</label>
                    <textarea id="edit_core_premise" class="storymode-textarea" data-field="core_premise" rows="4"
                        placeholder="Describe the central conflict, theme, or hook of the story...">${escapeHtml(bp.core_premise || '')}</textarea>
                </div>
            </div>
            <div class="storymode-form-grid-full">
                <div>
                    <label for="edit_user_scenario">User Scenario</label>
                    <textarea id="edit_user_scenario" class="storymode-textarea" data-field="user_scenario" rows="4"
                        placeholder="The original scenario input used to generate this blueprint...">${escapeHtml(bp.user_scenario || '')}</textarea>
                </div>
            </div>
        </div>

        <!-- Setting -->
        <div class="storymode-form-section">
            <h3 class="storymode-section-title">Setting</h3>
            <div class="storymode-form-grid">
                <div>
                    <label for="edit_setting_location">Location</label>
                    <input type="text" id="edit_setting_location" class="text_pole" data-field="setting.location"
                        value="${escapeHtml(getNestedValue(bp, 'setting.location'))}" style="width: 100%;">
                </div>
                <div>
                    <label for="edit_setting_time_period">Time Period</label>
                    <input type="text" id="edit_setting_time_period" class="text_pole" data-field="setting.time_period"
                        value="${escapeHtml(getNestedValue(bp, 'setting.time_period'))}" style="width: 100%;">
                </div>
            </div>
            <div class="storymode-form-grid-full">
                <div>
                    <label for="edit_setting_atmosphere">Atmosphere</label>
                    <textarea id="edit_setting_atmosphere" class="storymode-textarea" data-field="setting.atmosphere" rows="3"
                        placeholder="Describe the mood and feel...">${escapeHtml(getNestedValue(bp, 'setting.atmosphere'))}</textarea>
                </div>
            </div>
        </div>

        <!-- Protagonist Group -->
        <div class="storymode-form-section">
            <h3 class="storymode-section-title">Protagonist Group</h3>
            <div class="storymode-form-grid-full">
                <div>
                    <label for="edit_protagonist_description">Description</label>
                    <textarea id="edit_protagonist_description" class="storymode-textarea" data-field="protagonist_group.description" rows="3"
                        placeholder="Who are the main characters?">${escapeHtml(getNestedValue(bp, 'protagonist_group.description'))}</textarea>
                </div>
            </div>
            <div class="storymode-form-grid">
                <div>
                    <label for="edit_protagonist_goal">Shared Goal</label>
                    <input type="text" id="edit_protagonist_goal" class="text_pole" data-field="protagonist_group.shared_goal"
                        value="${escapeHtml(getNestedValue(bp, 'protagonist_group.shared_goal'))}" style="width: 100%;">
                </div>
                <div>
                    <label for="edit_protagonist_dynamic">Group Dynamic</label>
                    <input type="text" id="edit_protagonist_dynamic" class="text_pole" data-field="protagonist_group.group_dynamic"
                        value="${escapeHtml(getNestedValue(bp, 'protagonist_group.group_dynamic'))}" style="width: 100%;">
                </div>
            </div>
        </div>

        <!-- Antagonistic Forces -->
        <div class="storymode-form-section">
            <h3 class="storymode-section-title">Antagonistic Forces</h3>
            <div class="storymode-form-grid-full">
                <div>
                    <label for="edit_antagonist_description">Description</label>
                    <textarea id="edit_antagonist_description" class="storymode-textarea" data-field="antagonistic_forces.description" rows="3"
                        placeholder="What opposes the protagonists?">${escapeHtml(getNestedValue(bp, 'antagonistic_forces.description'))}</textarea>
                </div>
            </div>
            <div class="storymode-form-grid">
                <div>
                    <label for="edit_antagonist_nature">Nature</label>
                    <select id="edit_antagonist_nature" class="text_pole" data-field="antagonistic_forces.nature" style="width: 100%;">
                        ${buildSelectOptions(DROPDOWN_OPTIONS.antagonistNature, antagonistNature)}
                    </select>
                </div>
                <div>
                    <label for="edit_antagonist_motivation">Motivation</label>
                    <input type="text" id="edit_antagonist_motivation" class="text_pole" data-field="antagonistic_forces.motivation"
                        value="${escapeHtml(getNestedValue(bp, 'antagonistic_forces.motivation'))}" style="width: 100%;">
                </div>
            </div>
        </div>

        <!-- Arc Structure -->
        <div class="storymode-form-section">
            <h3 class="storymode-section-title">Story Arc Structure</h3>
            <div class="storymode-form-grid">
                <div>
                    <label for="edit_arc_length">Story Length (rounds)</label>
                    <input type="number" id="edit_arc_length" class="text_pole" data-field="arc_structure.total_messages_target"
                        value="${getNestedValue(bp, 'arc_structure.total_messages_target', 30)}" min="5" max="100" style="width: 100%;">
                </div>
                <div>
                    <label for="edit_metaphor_level">Metaphor Level</label>
                    <select id="edit_metaphor_level" class="text_pole" data-field="genre_realism_notes.metaphor_level_used" style="width: 100%;">
                        ${buildSelectOptions(DROPDOWN_OPTIONS.metaphorLevel, metaphorLevel)}
                    </select>
                </div>
            </div>
        </div>

        <!-- Tone & Style -->
        <div class="storymode-form-section">
            <h3 class="storymode-section-title">Tone & Style</h3>
            <div class="storymode-form-grid">
                <div>
                    <label for="edit_primary_tone">Primary Tone</label>
                    <input type="text" id="edit_primary_tone" class="text_pole" data-field="tone_and_style.primary_tone"
                        value="${escapeHtml(getNestedValue(bp, 'tone_and_style.primary_tone'))}" style="width: 100%;">
                </div>
                <div>
                    <label for="edit_narrative_voice">Narrative Voice</label>
                    <input type="text" id="edit_narrative_voice" class="text_pole" data-field="tone_and_style.narrative_voice"
                        value="${escapeHtml(getNestedValue(bp, 'tone_and_style.narrative_voice'))}" style="width: 100%;">
                </div>
            </div>
        </div>

        <!-- Content Boundaries -->
        <div class="storymode-form-section">
            <h3 class="storymode-section-title">Content Boundaries</h3>
            <div class="storymode-form-grid">
                <div>
                    <label for="edit_violence_level">Violence Level</label>
                    <select id="edit_violence_level" class="text_pole" data-field="content_boundaries.violence_level" style="width: 100%;">
                        ${buildSelectOptions(DROPDOWN_OPTIONS.violenceLevel, violenceLevel)}
                    </select>
                </div>
                <div>
                    <label for="edit_romance_level">Romance Level</label>
                    <select id="edit_romance_level" class="text_pole" data-field="content_boundaries.romance_level" style="width: 100%;">
                        ${buildSelectOptions(DROPDOWN_OPTIONS.romanceLevel, romanceLevel)}
                    </select>
                </div>
            </div>
        </div>

         <!-- Opening Message -->
        <div class="storymode-form-section">
            <details>
                <summary class="storymode-collapsible-header">
                    <i class="fa-solid fa-comment-dots"></i> Opening Message (Optional)
                </summary>
                <div style="margin-top: 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                        <label for="edit_opening_message" style="margin-bottom: 0;">Pre-generated Opening Message</label>
                        <button id="generate_opening_message_btn" class="menu_button" title="Generate opening message using AI">
                            <i class="fa-solid fa-wand-magic-sparkles"></i> Generate
                        </button>
                    </div>
                    <textarea id="edit_opening_message" class="storymode-textarea" data-field="opening_message" rows="10"
                        maxlength="50000" placeholder="If generated, this message will appear when starting a story from this blueprint..."
                        style="width: 100%;">${escapeHtml(bp.opening_message || '')}</textarea>
                    <small style="color: #999; font-size: 0.9em;">Optional pre-generated opening message. Up to 50,000 characters.</small>
                </div>
            </details>
        </div>
        
        <!-- Story Endings -->
        <div class="storymode-form-section">
            <details>
                <summary style="cursor: pointer; font-weight: bold; font-size: 1.1em; color: var(--SmartThemeEmColor); user-select: none;">
                    <i class="fa-solid fa-flag-checkered"></i> Generated Story Endings <span style="font-size: 0.8em; opacity: 0.7; font-weight: normal;">(Click to view - contains spoilers)</span>
                </summary>
                
                <div style="margin-top: 16px; padding: 0 10px;">
                    <div style="background: rgba(0,0,0,0.1); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                        <h4 class="storymode-section-title" style="margin-top: 0; color: var(--SmartThemeQuoteColor);"><i class="fa-solid fa-star"></i> Primary Ending</h4>
                        <p class="storymode-form-hint">The most story-appropriate conclusion selected by the AI.</p>
                        
                        <div class="storymode-form-grid-full">
                            <div>
                                <label>Title</label>
                                <input type="text" class="text_pole" data-field="primary_ending.title" 
                                    value="${escapeHtml(getNestedValue(bp, 'primary_ending.title'))}" style="width: 100%;">
                            </div>
                            <div style="margin-top: 8px;">
                                <label>Description</label>
                                <textarea class="storymode-textarea" data-field="primary_ending.description" rows="4"
                                    style="width: 100%; font-size: 0.9em;">${escapeHtml(getNestedValue(bp, 'primary_ending.description'))}</textarea>
                            </div>
                            <div style="margin-top: 8px;">
                                <label>Thematic Resolution</label>
                                <textarea class="storymode-textarea" data-field="primary_ending.thematic_resolution" rows="2"
                                    style="width: 100%; font-size: 0.9em;">${escapeHtml(getNestedValue(bp, 'primary_ending.thematic_resolution'))}</textarea>
                            </div>
                        </div>

                        <!-- Read-only character outcomes for reference -->
                        <div style="margin-top: 12px; padding: 10px; background: var(--SmartThemeDeepColor); border-radius: 4px; font-size: 0.9em;">
                            <strong style="display: block; margin-bottom: 6px; color: var(--SmartThemeEmColor);">Character Outcomes (Reference):</strong>
                            ${(getNestedValue(bp, 'primary_ending.character_outcomes') || []).map(o =>
        `<div style="margin-bottom: 4px;"><strong>${escapeHtml(o.character_name)}:</strong> ${escapeHtml(o.outcome)}</div>`
    ).join('') || '<em style="opacity: 0.6;">No outcomes generated</em>'}
                        </div>
                    </div>

                    <div style="margin-top: 24px;">
                        <h4 class="storymode-section-title"><i class="fa-solid fa-code-branch"></i> Alternate Endings</h4>
                        
                        ${(bp.alternate_endings || []).map((ending, idx) => `
                            <div style="margin-bottom: 20px; padding-left: 15px; border-left: 3px solid var(--SmartThemeBorderColor);">
                                <h5 style="margin: 0 0 10px 0; color: var(--SmartThemeEmColor);">Alternate Option ${idx + 1}</h5>
                                <div class="storymode-form-grid-full">
                                    <div>
                                        <label>Title</label>
                                        <input type="text" class="text_pole" data-field="alternate_endings.${idx}.title" 
                                            value="${escapeHtml(ending.title || '')}" style="width: 100%;">
                                    </div>
                                    <div style="margin-top: 8px;">
                                        <label>Description</label>
                                        <textarea class="storymode-textarea" data-field="alternate_endings.${idx}.description" rows="4"
                                            style="width: 100%; font-size: 0.9em;">${escapeHtml(ending.description || '')}</textarea>
                                    </div>
                                    <div style="margin-top: 8px;">
                                        <label>Thematic Resolution</label>
                                        <textarea class="storymode-textarea" data-field="alternate_endings.${idx}.thematic_resolution" rows="2"
                                            style="width: 100%; font-size: 0.9em;">${escapeHtml(ending.thematic_resolution || '')}</textarea>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                        
                        ${(!bp.alternate_endings || bp.alternate_endings.length === 0) ? '<p style="opacity: 0.6; font-style: italic;">No alternate endings generated.</p>' : ''}
                    </div>
                </div>
            </details>
        </div>

       
    `;
}

/**
 * Render Tab 2: Scenes
 * Simple scene list with add/edit/delete/reorder
 * @returns {string} HTML content
 */
function renderScenesTab() {
    const scenes = currentBlueprint.scene_plan || [];

    if (scenes.length === 0) {
        return `
            <div style="text-align: center; padding: 40px; color: var(--SmartThemeEmColor);">
                <i class="fa-solid fa-film" style="font-size: 3em; margin-bottom: 16px;"></i>
                <p>No scenes defined yet.</p>
                <button id="add_scene_btn" class="menu_button" style="margin-top: 16px;">
                    <i class="fa-solid fa-plus"></i> Add First Scene
                </button>
            </div>
        `;
    }

    return `
        <div style="margin-bottom: 16px;">
            <button id="add_scene_btn" class="menu_button">
                <i class="fa-solid fa-plus"></i> Add Scene
            </button>
        </div>
        <div class="storymode-scenes-list">
            ${scenes.map((scene, index) => `
                <div class="storymode-scene-card" draggable data-scene-index="${index}">
                    <div class="storymode-scene-header">
                        <div>
                            <i class="fa-solid fa-grip-vertical"></i>
                            <span class="storymode-scene-title">${escapeHtml(scene.title || `Scene ${index + 1}`)}</span>
                            <span style="color: var(--SmartThemeEmColor); font-size: 0.85em; margin-left: 8px;">
                                ${escapeHtml(scene.phase || 'setup')}
                            </span>
                        </div>
                        <div class="storymode-scene-actions">
                            <button class="menu_button scene-edit-btn" data-index="${index}" title="Edit scene">
                                <i class="fa-solid fa-pen"></i>
                            </button>
                            <button class="menu_button scene-delete-btn" data-index="${index}" title="Delete scene">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    <div class="storymode-scene-body">
                        <strong>Purpose:</strong> ${escapeHtml(scene.purpose || 'N/A')}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

/**
 * Get computed gallery state for rendering
 * @param {Object} blueprint - Blueprint object
 * @returns {Object} Gallery state { gallery, index, hasCarousel, currentUrl }
 */
function getGalleryState(blueprint) {
    const gallery = blueprint.metadata?.coverGallery || [];
    const index = blueprint.metadata?.coverGalleryIndex ?? 0;
    const hasCarousel = gallery.length > 1;
    const currentUrl = gallery[index]?.url || blueprint.coverImageUrl;

    return { gallery, index, hasCarousel, currentUrl };
}

/**
 * Build carousel item HTML
 * @param {Object} cover - Cover object
 * @param {number} index - Cover index
 * @param {number} currentIndex - Currently active index
 * @param {number} total - Total number of covers
 * @returns {string} HTML string
 */
function buildCarouselItem(cover, index, currentIndex, total) {
    const isActive = index === currentIndex;
    return `
        <div class="storymode-cover-carousel-item ${isActive ? 'active' : ''}"
             role="option"
             aria-selected="${isActive}"
             aria-label="Cover ${index + 1} of ${total}"
             tabindex="${isActive ? '0' : '-1'}"
             data-index="${index}">
            <img src="${escapeHtml(cover.url)}"
                 alt="Cover variant ${index + 1}"
                 aria-hidden="true">
            <div class="storymode-carousel-item-index" aria-hidden="true">${index + 1}</div>
        </div>
    `;
}

/**
 * Render Tab 3: Cover Image Prompt
 * Shows the auto-generated cover prompt with ability to edit
 * @returns {string} HTML content
 */
function renderCoverTab() {
    const bp = currentBlueprint;

    // Get or generate cover prompt
    bp.metadata = bp.metadata || {};
    if (!bp.metadata.coverPrompt) {
        bp.metadata.coverPrompt = generateCoverPrompt(bp);
    }

    const coverPrompt = bp.metadata.coverPrompt;
    const { gallery, index: currentCoverIndex, hasCarousel, currentUrl: displayCoverUrl } = getGalleryState(bp);

    // Check if SD slash command is available
    const hasSdCommand = SlashCommandParser && 'sd' in SlashCommandParser.commands;

    return `
        <!-- Cover Preview -->
        <div class="storymode-form-section">
            <h3 class="storymode-section-title">Cover Preview</h3>
            <div class="storymode-cover-preview-container">
                <div class="storymode-cover-preview" id="cover_preview_image">
                    ${displayCoverUrl ? `
                        ${hasCarousel ? `
                            <div class="storymode-cover-gallery">
                                <!-- Navigation Arrows -->
                                <button class="storymode-cover-nav storymode-cover-nav-prev"
                                        data-index="${currentCoverIndex - 1}"
                                        ${currentCoverIndex === 0 ? 'disabled' : ''}
                                        aria-label="Previous cover image">
                                    <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
                                </button>

                                <!-- Cover Image -->
                                <div class="storymode-cover-image-wrapper">
                                    <img src="${escapeHtml(displayCoverUrl)}" alt="Blueprint cover">
                                    <div class="storymode-cover-counter">
                                        ${currentCoverIndex + 1} / ${gallery.length}
                                    </div>
                                </div>

                                <button class="storymode-cover-nav storymode-cover-nav-next"
                                        data-index="${currentCoverIndex + 1}"
                                        ${currentCoverIndex === gallery.length - 1 ? 'disabled' : ''}
                                        aria-label="Next cover image">
                                    <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
                                </button>
                            </div>
                        ` : `
                            <img src="${escapeHtml(displayCoverUrl)}" alt="Blueprint cover">
                        `}
                    ` : `
                        <div class="storymode-cover-placeholder">
                            <i class="fa-solid fa-image"></i>
                            <span>No cover image</span>
                        </div>
                    `}
                </div>

                <!-- Right column: carousel and action buttons -->
                <div class="storymode-cover-carousel-column">
                    <!-- Thumbnail Carousel -->
                    ${hasCarousel ? `
                        <div class="storymode-cover-carousel"
                             role="region"
                             aria-label="Cover image gallery">
                            <div class="storymode-cover-carousel-track"
                                 id="cover_carousel_track"
                                 role="listbox"
                                 aria-label="Generated cover images">
                                ${gallery.map((cover, index) => buildCarouselItem(cover, index, currentCoverIndex, gallery.length)).join('')}
                            </div>
                        </div>
                        <!-- Screen reader announcement area -->
                        <div id="cover_gallery_status" class="sr-only" aria-live="assertive"></div>
                    ` : ''}

                    <div class="storymode-cover-actions">
                    <button id="generate_cover_btn" class="menu_button storymode-btn-primary">
                        <i class="fa-solid fa-wand-magic-sparkles"></i> Generate Cover
                    </button>
                    <button id="upload_cover_btn" class="menu_button">
                        <i class="fa-solid fa-upload"></i> Upload Image
                    </button>
                    <button id="debug_sd_cmd_btn" class="menu_button" title="Show SD command for testing">
                        <i class="fa-solid fa-bug"></i> Debug
                    </button>
                    ${displayCoverUrl ? `
                    <button id="clear_cover_btn" class="menu_button storymode-btn-danger">
                        <i class="fa-solid fa-trash"></i> Remove
                    </button>
                    ` : ''}
                    </div>

                    <!-- Compact Prompt Editor (prompts only) -->
                    <div class="storymode-cover-prompt-editor">
                        <h4 class="storymode-section-title" style="font-size: 0.9em; margin-bottom: 12px;">Image Prompt</h4>
                        <div style="display: flex; flex-direction: column; gap: 12px;">
                            <div>
                                <label style="font-size: 0.8em; color: var(--SmartThemeEmColor);">Positive</label>
                                <textarea id="cover_positive_prompt" class="storymode-textarea" data-cover-field="positive" rows="3"
                                    style="font-size: 0.85em; padding: 6px;"
                                    placeholder="Describe what should be in the image...">${escapeHtml(coverPrompt.positive || '')}</textarea>
                            </div>
                            <div>
                                <label style="font-size: 0.8em; color: var(--SmartThemeEmColor);">Negative</label>
                                <textarea id="cover_negative_prompt" class="storymode-textarea" data-cover-field="negative" rows="2"
                                    style="font-size: 0.85em; padding: 6px;"
                                    placeholder="Describe what should NOT be in the image...">${escapeHtml(coverPrompt.negative || '')}</textarea>
                            </div>
                            <div style="display: flex; gap: 6px;">
                                <button id="regenerate_prompt_btn" class="menu_button" style="flex: 1; padding: 6px 10px; font-size: 0.8em;">
                                    <i class="fa-solid fa-rotate"></i> Regenerate
                                </button>
                                <button id="copy_prompt_btn" class="menu_button" style="flex: 1; padding: 6px 10px; font-size: 0.8em;">
                                    <i class="fa-solid fa-copy"></i> Copy
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                ${!hasSdCommand ? `
                <p class="storymode-form-hint" style="margin-top: 8px;">
                    <i class="fa-solid fa-info-circle"></i>
                    Stable Diffusion slash command not available. You can still edit the prompt and use it externally.
                </p>
                ` : ''}
            </div>
        </div>

        <!-- Prompt Details (full-width section) -->
        <div class="storymode-form-section">
            <h3 class="storymode-section-title">Style & Technical Details</h3>
            <div class="storymode-cover-prompt-details">
                <div class="storymode-form-grid">
                    <div>
                        <label for="cover_style">Art Style</label>
                        <input type="text" id="cover_style" class="text_pole" data-cover-field="style"
                            value="${escapeHtml(coverPrompt.style || '')}" placeholder="e.g., digital painting, concept art">
                    </div>
                    <div>
                        <label for="cover_mood">Mood</label>
                        <input type="text" id="cover_mood" class="text_pole" data-cover-field="mood"
                            value="${escapeHtml(coverPrompt.mood || '')}" placeholder="e.g., mysterious, dramatic">
                    </div>
                </div>
                <div class="storymode-form-grid">
                    <div>
                        <label for="cover_aspect_ratio">Aspect Ratio</label>
                        <select id="cover_aspect_ratio" class="text_pole" data-cover-field="technical.aspect_ratio">
                            <option value="2:3" ${coverPrompt.technical?.aspect_ratio === '2:3' ? 'selected' : ''}>2:3 (Portrait)</option>
                            <option value="3:4" ${coverPrompt.technical?.aspect_ratio === '3:4' ? 'selected' : ''}>3:4 (Portrait)</option>
                            <option value="1:1" ${coverPrompt.technical?.aspect_ratio === '1:1' ? 'selected' : ''}>1:1 (Square)</option>
                            <option value="4:3" ${coverPrompt.technical?.aspect_ratio === '4:3' ? 'selected' : ''}>4:3 (Landscape)</option>
                            <option value="16:9" ${coverPrompt.technical?.aspect_ratio === '16:9' ? 'selected' : ''}>16:9 (Wide)</option>
                        </select>
                    </div>
                    <div>
                        <label for="cover_quality">Quality</label>
                        <select id="cover_quality" class="text_pole" data-cover-field="technical.quality">
                            <option value="draft" ${coverPrompt.technical?.quality === 'draft' ? 'selected' : ''}>Draft (Fast)</option>
                            <option value="standard" ${coverPrompt.technical?.quality === 'standard' ? 'selected' : ''}>Standard</option>
                            <option value="high" ${coverPrompt.technical?.quality === 'high' ? 'selected' : ''}>High Quality</option>
                        </select>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Render Characters tab
 * Shows characters referenced in blueprint and their availability status
 * @returns {string} HTML
 */
function renderCharactersTab() {
    if (!currentBlueprint) {
        return '<div class="storymode-tab-placeholder">No blueprint loaded</div>';
    }

    if (!currentBlueprint.character_arcs || currentBlueprint.character_arcs.length === 0) {
        return `
            <div class="storymode-tab-placeholder">
                <i class="fa-solid fa-users"></i>
                <p>No characters defined in this blueprint yet.</p>
                <p>Characters are defined in the character arcs section.</p>
            </div>
        `;
    }

    // Load content asynchronously via event handler
    setTimeout(() => loadCharactersTabContent(), 0);

    return `
        <div class="storymode-characters-tab" id="characters_tab_content">
            <div class="storymode-loading-spinner">
                <i class="fa-solid fa-circle-notch fa-spin"></i> Loading characters...
            </div>
        </div>
    `;
}

/**
 * Load characters tab content asynchronously
 */
async function loadCharactersTabContent() {
    const container = document.getElementById('characters_tab_content');
    if (!container) return;

    const { linkBlueprintCharacters } = await import('../blueprint/characters/linker.js');
    const linkInfo = linkBlueprintCharacters(currentBlueprint);

    if (linkInfo.linked.length === 0 && linkInfo.missing.length === 0) {
        container.innerHTML = `
            <div class="storymode-tab-placeholder">
                <i class="fa-solid fa-users"></i>
                <p>No characters defined in this blueprint yet.</p>
                <p>Characters are defined in the character arcs section.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="characters-header">
            <h4>Referenced Characters</h4>
            <button class="menu_button menu_button_icon" id="refresh_character_links" title="Refresh links">
                <i class="fa-solid fa-sync"></i>
            </button>
        </div>

        ${linkInfo.linked.length > 0 ? `
            <div class="characters-section">
                <h5><i class="fa-solid fa-check-circle" style="color: var(--SmartThemeEmColor);"></i> Available (${linkInfo.linked.length})</h5>
                <div class="characters-grid">
                    ${linkInfo.linked.map(link => renderCharacterCard(link.localCharacter, true)).join('')}
                </div>
            </div>
        ` : ''}

        ${linkInfo.missing.length > 0 ? `
            <div class="characters-section">
                <h5><i class="fa-solid fa-triangle-exclamation" style="color: var(--SmartThemeWarningColor);"></i> Missing (${linkInfo.missing.length})</h5>
                <div class="characters-grid">
                    ${linkInfo.missing.map(name => renderMissingCharacterCard(name)).join('')}
                </div>
                <p class="missing-hint">
                    <i class="fa-solid fa-info-circle"></i>
                    These characters will be available for import when you import this blueprint.
                </p>
            </div>
        ` : ''}
    `;
}

/**
 * Render character card
 * @param {Object} character
 * @param {boolean} isAvailable
 * @returns {string}
 */
function renderCharacterCard(character, isAvailable) {
    const avatarPath = character.avatar ? `/characters/${encodeURIComponent(character.avatar)}` : '';
    return `
        <div class="character-mini-card ${isAvailable ? 'available' : 'missing'}">
            <div class="character-avatar" ${avatarPath ? `style="background-image: url('${avatarPath}');"` : 'data-fa="fa-user"'}></div>
            <div class="character-name">${escapeHtml(character.name)}</div>
            ${isAvailable ? '<i class="fa-solid fa-check-circle status-icon"></i>' : ''}
        </div>
    `;
}

/**
 * Render missing character card
 * @param {string} name
 * @returns {string}
 */
function renderMissingCharacterCard(name) {
    return `
        <div class="character-mini-card missing">
            <div class="character-avatar placeholder">
                <i class="fa-solid fa-user"></i>
            </div>
            <div class="character-name">${escapeHtml(name)}</div>
            <i class="fa-solid fa-triangle-exclamation status-icon"></i>
        </div>
    `;
}

// ============================================================================
// EDITING HELPERS
// ============================================================================

/**
 * Save a single field to currentBlueprint (immediate, no persistence yet)
 * @param {string} fieldPath - Dot-notation path (e.g., 'setting.location')
 * @param {any} value - New value
 */
function updateField(fieldPath, value) {
    setNestedValue(currentBlueprint, fieldPath, value);
    hasUnsavedChanges = true;
    // Update unsaved indicator in UI
    updateUnsavedIndicator();
}

/**
 * Update the unsaved changes indicator in the UI
 */
function updateUnsavedIndicator() {
    const indicator = $('.storymode-unsaved-indicator');
    if (hasUnsavedChanges && indicator.length === 0) {
        // Add indicator to active tab
        $('.storymode-tab.active').append('<span class="storymode-unsaved-indicator"></span>');
    } else if (!hasUnsavedChanges) {
        indicator.remove();
    }
}

/**
 * Revert to original blueprint (discard all changes)
 */
function revertToOriginal() {
    try {
        currentBlueprint = structuredClone(originalBlueprint);
    } catch (e) {
        currentBlueprint = JSON.parse(JSON.stringify(originalBlueprint));
    }
    hasUnsavedChanges = false;
    refreshEditor();
}

/**
 * Save blueprint to blueprintState (persist changes)
 * @returns {Promise<boolean>} True if saved successfully, false otherwise
 */
async function saveBlueprint() {
    console.log('[BlueprintEditor] Saving blueprint:', currentBlueprint);
    console.log('[BlueprintEditor] story_type_name:', currentBlueprint.story_type_name);
    console.log('[BlueprintEditor] author_style_name:', currentBlueprint.author_style_name);
    console.log('[BlueprintEditor] coverImageUrl:', currentBlueprint.coverImageUrl);
    console.log('[BlueprintEditor] coverGallery length:', currentBlueprint.metadata?.coverGallery?.length || 0);

    // Validate blueprint using existing validation function
    console.log('[BlueprintEditor] About to validate blueprint...');
    const validation = BlueprintModule.validateBlueprint(currentBlueprint);
    console.log('[BlueprintEditor] Validation result:', validation);
    if (!validation.valid) {
        console.error('[BlueprintEditor] Validation failed:', validation.errors);
        const errorHtml = `
            <h3>Blueprint Validation Failed</h3>
            <p>The blueprint has errors that must be fixed before saving:</p>
            <ul>
                ${validation.errors.map(e => `<li>${escapeHtml(e)}</li>`).join('')}
            </ul>
        `;
        console.log('[BlueprintEditor] Showing validation error popup...');
        await callGenericPopup(errorHtml, POPUP_TYPE.TEXT, null, { wide: true });
        console.log('[BlueprintEditor] Popup dismissed, returning false from saveBlueprint()');
        return false;
    }
    console.log('[BlueprintEditor] Validation passed!');

    // Add modification timestamp
    currentBlueprint.modified_at = new Date().toISOString();

    // Save to blueprintState
    const blueprintState = BlueprintModule.getBlueprintState();
    blueprintState.blueprint = currentBlueprint;
    console.log('[BlueprintEditor] About to call saveBlueprintState with blueprintState:', blueprintState);
    await BlueprintModule.saveBlueprintState(blueprintState);

    console.log('[BlueprintEditor] Blueprint saved to state');
    console.log('[BlueprintEditor] Saved coverImageUrl:', blueprintState.blueprint?.coverImageUrl);
    console.log('[BlueprintEditor] Saved coverGallery length:', blueprintState.blueprint?.metadata?.coverGallery?.length || 0);

    // Update story prompt if available
    if (typeof window.updateStoryPrompt === 'function') {
        window.updateStoryPrompt();
    }

    hasUnsavedChanges = false;
    toastr.success('Blueprint saved successfully!');
    return true;
}

// ============================================================================
// COVER GENERATION HELPERS
// ============================================================================

/**
 * Validate that a URL is safe to use as an image source
 * Prevents XSS via javascript: or other malicious URL schemes
 *
 * @param {string} url - URL to validate
 * @returns {boolean} True if URL is safe for image src
 */
function isValidImageUrl(url) {
    if (typeof url !== 'string') return false;
    const trimmed = url.trim();
    return trimmed.startsWith('http://') ||
        trimmed.startsWith('https://') ||
        trimmed.startsWith('data:image/') ||
        trimmed.startsWith('/');  // Allow local file paths from SD extension
}

/**
 * Build Stable Diffusion prompt from cover prompt object
 * @param {Object} coverPrompt - Cover prompt specification
 * @returns {string} Full SD prompt
 */
function buildSDPrompt(coverPrompt) {
    const positiveParts = [
        coverPrompt.positive,
        coverPrompt.style,
        coverPrompt.mood,
        coverPrompt.lighting,
        coverPrompt.composition,
    ].filter(Boolean);

    const positive = positiveParts.join(', ');
    // SD slash command format: "positive --no negative"
    return coverPrompt.negative ? `${positive} --no ${coverPrompt.negative}` : positive;
}

/**
 * Set cover image URL on blueprint (both top-level and metadata)
 * @param {Object} blueprint - Blueprint object
 * @param {string} imageUrl - Image URL to set
 */
export function setCoverImageUrl(blueprint, imageUrl) {
    blueprint.metadata = blueprint.metadata || {};
    blueprint.metadata.coverImageUrl = imageUrl;
    blueprint.coverImageUrl = imageUrl;
}

/**
 * Generate cover image using SD extension
 * Core logic extracted for reuse by both editor and auto-generation flows
 *
 * @param {Object} blueprint - Blueprint object (must have metadata.coverPrompt or will auto-generate)
 * @returns {Promise<{success: boolean, imageUrl?: string, error?: string}>}
 */
export async function generateCoverFromSD(blueprint) {
    // Check for debug mode - return mock cover without calling SD
    if (isCoverDebugMode()) {
        console.log('[BlueprintEditor] Cover debug mode active - returning mock cover');
        await new Promise(r => setTimeout(r, 500)); // Simulate brief delay
        return getMockCoverResult();
    }

    // Validate SD extension
    if (!extension_settings.sd || !extension_settings.sd.source) {
        console.warn('[BlueprintEditor] SD settings not initialized, attempting to load...');

        if (typeof window.loadExtensionSettings === 'function') {
            await window.loadExtensionSettings('stable-diffusion');
        }

        if (!extension_settings.sd || !extension_settings.sd.source) {
            return {
                success: false,
                error: 'SD extension not configured. Configure it in Extensions → Image Generation.'
            };
        }
    }

    // Get or generate cover prompt
    let prompt = blueprint.metadata?.coverPrompt;
    if (!prompt) {
        // Try to generate one (should always succeed due to fallbacks)
        try {
            prompt = generateCoverPrompt(blueprint);
            // Store it for future use
            blueprint.metadata = blueprint.metadata || {};
            blueprint.metadata.coverPrompt = prompt;
        } catch (e) {
            return { success: false, error: 'Could not generate cover prompt from blueprint data' };
        }
    }

    try {
        console.log('[BlueprintEditor] Image Provider:', extension_settings.sd.source);

        const fullPrompt = buildSDPrompt(prompt);
        console.log('[BlueprintEditor] Generating cover with prompt:', fullPrompt);

        const result = await SlashCommandParser.commands['sd'].callback(
            { quiet: 'true' },
            fullPrompt
        );

        if (typeof result === 'string' && result.trim().length > 0) {
            const imageUrl = result.trim();

            // Security: Validate URL before returning
            if (!isValidImageUrl(imageUrl)) {
                console.error('[BlueprintEditor] Invalid image URL returned:', imageUrl.substring(0, 50));
                return { success: false, error: 'Invalid image URL returned from provider' };
            }

            console.log('[BlueprintEditor] Image generated successfully');
            return { success: true, imageUrl };
        } else {
            return { success: false, error: 'No image returned from image provider' };
        }
    } catch (err) {
        console.error('[BlueprintEditor] Failed to generate cover:', err);
        return { success: false, error: err.message };
    }
}
// ============================================================================
// COVER GALLERY UTILITIES
// ============================================================================

/**
 * Set cover image across all state locations
 * @param {number} index - Cover index in gallery
 * @param {string} url - Cover image URL
 * @param {Array} gallery - Gallery array for seed lookup
 */
function setCoverImage(index, url, gallery) {
    currentBlueprint.metadata.coverGalleryIndex = index;
    currentBlueprint.metadata.coverImageUrl = url;
    currentBlueprint.coverImageUrl = url;

    // Update seed reference from gallery
    const cover = gallery[index];
    if (cover?.seed) {
        const prompt = currentBlueprint.metadata.coverPrompt ||= {};
        prompt.technical ||= {};
        prompt.technical.custom_seed = cover.seed;
    }
}

/**
 * Enforce gallery size limit by removing oldest covers
 * @param {Array} gallery - Gallery array
 * @param {number} maxSize - Maximum gallery size
 */
function enforceGallerySizeLimit(gallery, maxSize) {
    while (gallery.length >= maxSize) {
        const removed = gallery.shift();
        console.log(`[BlueprintEditor] Removed old cover ${removed.id} to maintain limit`);
    }
}

/**
 * Check if keyboard navigation should be allowed
 * @returns {boolean} True if navigation is allowed
 */
function canNavigateGallery() {
    if (!$('.storymode-blueprint-editor-container').length) return false;
    if ($('input:focus, textarea:focus, select:focus').length) return false;
    const gallery = currentBlueprint.metadata?.coverGallery || [];
    if (gallery.length <= 1) return false;
    return extension_settings[MODULE_NAME]?.blueprintSettings?.coverGeneration?.keyboardNavigation !== false;
}

/**
 * Announce cover change for screen readers
 * @param {number} index - Current cover index
 * @param {number} total - Total number of covers
 */
function announceCoverChange(index, total) {
    const statusEl = document.getElementById('cover_gallery_status');
    if (statusEl) {
        statusEl.textContent = `Now showing cover ${index + 1} of ${total}`;
    }
}

/**
 * Navigate to a specific cover in the gallery
 * @param {number} newIndex - Target cover index
 * @returns {boolean} True if navigation succeeded
 */
function navigateCoverGallery(newIndex) {
    const gallery = currentBlueprint.metadata?.coverGallery || [];
    if (newIndex < 0 || newIndex >= gallery.length) return false;

    setCoverImage(newIndex, gallery[newIndex].url, gallery);
    hasUnsavedChanges = true;
    refreshContent();
    announceCoverChange(newIndex, gallery.length);
    return true;
}

/**
 * Add generated cover to blueprint's cover gallery
 * @param {Object} blueprint - Blueprint object
 * @param {string} imageUrl - Generated image URL
 * @param {Object} prompt - Prompt used for generation
 * @param {Object} metadata - Optional cover metadata (model, seed, etc.)
 */
export async function addCoverToGallery(blueprint, imageUrl, prompt, metadata = {}) {
    // Security: Validate URL before adding to gallery
    if (!isValidImageUrl(imageUrl)) {
        console.error('[BlueprintEditor] Refusing to add invalid image URL to gallery:', imageUrl.substring(0, 50));
        throw new Error('Invalid image URL. Must start with http://, https://, data:image/, or /');
    }

    blueprint.metadata = blueprint.metadata || {};
    blueprint.metadata.coverGallery = blueprint.metadata.coverGallery || [];

    const maxSize = extension_settings[MODULE_NAME]?.blueprintSettings?.coverGeneration?.maxGallerySize || 10;

    // Remove oldest covers if gallery is full
    enforceGallerySizeLimit(blueprint.metadata.coverGallery, maxSize);

    const coverEntry = {
        id: generateUUID(),
        url: imageUrl,
        prompt: prompt,
        generatedAt: new Date().toISOString(),
        ...metadata
    };

    blueprint.metadata.coverGallery.push(coverEntry);

    // Set index to newly added cover (last item)
    blueprint.metadata.coverGalleryIndex = blueprint.metadata.coverGallery.length - 1;

    // Sync coverImageUrl so encodeBlueprintAsPNG uses the new cover
    blueprint.metadata.coverImageUrl = imageUrl;
    blueprint.coverImageUrl = imageUrl;

    console.log('[BlueprintEditor] Added cover to gallery:', coverEntry.id, 'index:', blueprint.metadata.coverGalleryIndex);

    return coverEntry;
}

/**
 * Set cover image URL on blueprint (both top-level and metadata)
 * Exported for use in auto-generation flow
 * @param {Object} blueprint - Blueprint object
 * @param {string} imageUrl - Image URL to set
 */


// Legacy function - kept for backward compatibility
async function addLegacyCoverToGallery(blueprint, imageUrl, prompt, metadata = {}) {
    // Security: Validate URL before adding to gallery
    if (!isValidImageUrl(imageUrl)) {
        console.error('[BlueprintEditor] Refusing to add invalid image URL to gallery:', imageUrl.substring(0, 50));
        throw new Error('Invalid image URL. Must start with http://, https://, data:image/, or /');
    }

    blueprint.metadata = blueprint.metadata || {};
    blueprint.metadata.coverGallery = blueprint.metadata.coverGallery || [];

    const maxSize = extension_settings[MODULE_NAME]?.blueprintSettings?.coverGeneration?.maxGallerySize || 10;

    // Remove oldest covers if gallery is full
    enforceGallerySizeLimit(blueprint.metadata.coverGallery, maxSize);

    const coverEntry = {
        id: generateUUID(),
        url: imageUrl,
        prompt: prompt ? JSON.parse(JSON.stringify(prompt)) : null,  // Deep copy
        timestamp: new Date().toISOString(),
        seed: metadata.seed || Math.floor(Math.random() * 1000000),
        model: metadata.model || blueprint.metadata.coverModel?.name || 'SD',
        ...metadata
    };

    blueprint.metadata.coverGallery.push(coverEntry);
    blueprint.metadata.coverGalleryIndex = blueprint.metadata.coverGallery.length - 1;
    blueprint.metadata.coverSeed = coverEntry.seed;
}

// ============================================================================
// SCENE EDITING
// ============================================================================

/**
 * Add a new scene to the blueprint
 */
function addScene() {
    if (!currentBlueprint.scene_plan) {
        currentBlueprint.scene_plan = [];
    }

    const index = currentBlueprint.scene_plan.length;
    currentBlueprint.scene_plan.push({
        ...DEFAULT_SCENE,
        index,
        title: `Scene ${index + 1}`
    });

    hasUnsavedChanges = true;
    refreshContent();
    refreshLeftPanel(); // Update scene count in left panel
}

/**
 * Edit an existing scene (show modal)
 * @param {number} index - Scene index to edit
 */
async function editScene(index) {
    const scene = currentBlueprint.scene_plan[index];
    if (!scene) return;

    // Build edit form
    const formHtml = `
        <h3>Edit Scene ${index + 1}</h3>
        <div class="storymode-form-group" style="margin-bottom: 12px;">
            <label for="scene_edit_title">Title</label>
            <input type="text" id="scene_edit_title" class="text_pole" value="${escapeHtml(scene.title)}" style="width: 100%;">
        </div>
        <div class="storymode-form-group" style="margin-bottom: 12px;">
            <label for="scene_edit_phase">Phase</label>
            <select id="scene_edit_phase" class="text_pole" style="width: 100%;">
                ${buildSelectOptions(DROPDOWN_OPTIONS.scenePhase, scene.phase)}
            </select>
        </div>
        <div class="storymode-form-group" style="margin-bottom: 12px;">
            <label for="scene_edit_purpose">Purpose</label>
            <textarea id="scene_edit_purpose" class="storymode-textarea" rows="3" style="width: 100%;">${escapeHtml(scene.purpose || '')}</textarea>
        </div>
        <div class="storymode-form-group" style="margin-bottom: 12px;">
            <label for="scene_edit_situation">Situation</label>
            <textarea id="scene_edit_situation" class="storymode-textarea" rows="5" style="width: 100%;">${escapeHtml(scene.situation || '')}</textarea>
        </div>
    `;

    const result = await callGenericPopup(formHtml, POPUP_TYPE.CONFIRM, null, {
        wide: true,
        okButton: 'Save Scene',
        cancelButton: 'Cancel'
    });

    if (result) {
        // Save changes
        scene.title = $('#scene_edit_title').val();
        scene.phase = $('#scene_edit_phase').val();
        scene.purpose = $('#scene_edit_purpose').val();
        scene.situation = $('#scene_edit_situation').val();
        hasUnsavedChanges = true;
        refreshContent();
    }
}

/**
 * Delete a scene from the blueprint
 * @param {number} index - Scene index to delete
 */
async function deleteScene(index) {
    const scene = currentBlueprint.scene_plan[index];
    const sceneTitle = scene?.title || `Scene ${index + 1}`;

    const result = await callGenericPopup(
        `Are you sure you want to delete "${escapeHtml(sceneTitle)}"?`,
        POPUP_TYPE.CONFIRM,
        null,
        { okButton: 'Delete', cancelButton: 'Cancel' }
    );

    if (result) {
        currentBlueprint.scene_plan.splice(index, 1);
        // Reindex scenes
        currentBlueprint.scene_plan.forEach((s, i) => s.index = i);
        hasUnsavedChanges = true;
        refreshContent();
        refreshLeftPanel(); // Update scene count in left panel
    }
}

/**
 * Reorder scenes (after drag-and-drop)
 * @param {number} fromIndex - Original position
 * @param {number} toIndex - New position
 */
function reorderScene(fromIndex, toIndex) {
    const scenes = currentBlueprint.scene_plan;
    const [removed] = scenes.splice(fromIndex, 1);
    scenes.splice(toIndex, 0, removed);
    // Reindex scenes
    scenes.forEach((s, i) => s.index = i);
    hasUnsavedChanges = true;
    refreshContent();
    // Note: Scene count doesn't change on reorder, so no need to refresh left panel
}


// ============================================================================
// EVENT LISTENERS (Refactored with Namespace Pattern)
// ============================================================================

const EVENT_NAMESPACE = '.blueprintEditor';

// Selector constants for event handlers
const SELECTORS = {
    EDITOR_CONTAINER: '.storymode-blueprint-editor-container',
    PLAY_BUTTON: '#blueprint_editor_play_btn',
    POPUP_CANCEL: '.pop-button-cancel',
    SETTINGS_DIALOG: '#story_mode_settings_dialog',
    SETTINGS_OK: '.pop-button-ok'
};

/**
 * Setup document-level event listeners for the blueprint editor
 */
function setupDocumentEventListeners() {
    console.log('[BlueprintEditor] Setting up document-level event listeners');

    // Remove any existing listeners to prevent duplicates
    $(document).off(EVENT_NAMESPACE);

    // Attach all event handler groups
    setupFieldHandlers();
    setupTabHandlers();
    setupSceneHandlers();
    setupCoverFieldHandlers();
    setupCoverActionHandlers();
    setupCoverGalleryHandlers();
    setupCharacterTabHandlers();
    setupEditorActionHandlers();

    console.log('[BlueprintEditor] Document-level event listeners attached');
}

/**
 * Handle story type field changes
 */
function handleStoryTypeChange(value) {
    const storyTypes = getStoryTypes();
    const selectedType = storyTypes.find(st => st.id === value);
    if (selectedType) {
        currentBlueprint.story_type_name = selectedType.name;
        refreshLeftPanel();
    }
}

/**
 * Handle author style field changes
 */
function handleAuthorStyleChange(value) {
    const authorStyles = getAuthorStyles();
    const selectedStyle = authorStyles.find(as => as.id === value);

    if (selectedStyle) {
        currentBlueprint.author_style_name = selectedStyle.name;
    } else if (value === '') {
        currentBlueprint.author_style_name = 'None';
    }

    refreshLeftPanel();
}

/**
 * Field handlers for special blueprint fields
 */
const FIELD_HANDLERS = {
    'story_type_id': handleStoryTypeChange,
    'author_style': handleAuthorStyleChange,
    'arc_structure.total_messages_target': () => refreshLeftPanel(),
    'blueprint_title': () => refreshLeftPanel()
};

/**
 * Setup handlers for blueprint field changes
 */
function setupFieldHandlers() {
    $(document).on('change' + EVENT_NAMESPACE + ' input' + EVENT_NAMESPACE, '[data-field]', function () {
        const field = $(this).data('field');
        const value = $(this).val();
        updateField(field, value);

        const handler = FIELD_HANDLERS[field];
        if (handler) handler(value);
    });
}

/**
 * Setup tab switching handlers
 */
function setupTabHandlers() {
    $(document).on('click' + EVENT_NAMESPACE, '.storymode-tab', function () {
        const tab = $(this).data('tab');
        if (tab !== activeTab) {
            activeTab = tab;
            refreshEditor();
        }
    });
}

/**
 * Setup scene CRUD and drag-drop handlers
 */
function setupSceneHandlers() {
    $(document).on('click' + EVENT_NAMESPACE, '#add_scene_btn', (e) => {
        e.preventDefault();
        addScene();
    });

    $(document).on('click' + EVENT_NAMESPACE, '.scene-edit-btn', function (e) {
        e.preventDefault();
        editScene(parseInt($(this).data('index')));
    });

    $(document).on('click' + EVENT_NAMESPACE, '.scene-delete-btn', function (e) {
        e.preventDefault();
        deleteScene(parseInt($(this).data('index')));
    });

    setupSceneDragDrop();
}

/**
 * Setup drag-and-drop for scene reordering
 */
function setupSceneDragDrop() {
    let draggedScene = null;
    let draggedIndex = null;

    const clearDragState = () => {
        $('.storymode-scene-card').removeClass('dragging drag-over');
        draggedScene = null;
        draggedIndex = null;
    };

    $(document).on('dragstart' + EVENT_NAMESPACE, '.storymode-scene-card', function () {
        draggedScene = $(this);
        draggedIndex = parseInt($(this).data('scene-index'));
        $(this).addClass('dragging');
    });

    $(document).on('dragend' + EVENT_NAMESPACE, '.storymode-scene-card', clearDragState);

    $(document).on('dragover' + EVENT_NAMESPACE, '.storymode-scene-card', function (e) {
        e.preventDefault();
        if (draggedScene && !draggedScene.is($(this))) {
            $(this).addClass('drag-over');
        }
    });

    $(document).on('dragleave' + EVENT_NAMESPACE, '.storymode-scene-card', function () {
        $(this).removeClass('drag-over');
    });

    $(document).on('drop' + EVENT_NAMESPACE, '.storymode-scene-card', function (e) {
        e.preventDefault();
        $(this).removeClass('drag-over');

        if (draggedScene && !draggedScene.is($(this))) {
            const targetIndex = parseInt($(this).data('scene-index'));
            if (targetIndex !== draggedIndex) {
                reorderScene(draggedIndex, targetIndex);
            }
        }

        clearDragState();
    });
}

/**
 * Parse cover field value with special handling
 */
function parseCoverFieldValue(field, value) {
    if (field === 'colors') {
        return value.split(',').map(c => c.trim()).filter(c => c);
    }
    return value;
}

/**
 * Ensure cover prompt is initialized
 */
function ensureCoverPromptInitialized() {
    currentBlueprint.metadata = currentBlueprint.metadata || {};
    if (!currentBlueprint.metadata.coverPrompt) {
        currentBlueprint.metadata.coverPrompt = generateCoverPrompt(currentBlueprint);
    }
}

/**
 * Setup cover prompt field change handlers
 */
function setupCoverFieldHandlers() {
    $(document).on('change' + EVENT_NAMESPACE + ' input' + EVENT_NAMESPACE, '[data-cover-field]', function () {
        const field = $(this).data('cover-field');
        let value = parseCoverFieldValue(field, $(this).val());

        ensureCoverPromptInitialized();

        if (field.includes('.')) {
            setNestedValue(currentBlueprint.metadata.coverPrompt, field, value);
        } else {
            currentBlueprint.metadata.coverPrompt[field] = value;
        }

        hasUnsavedChanges = true;
        updateUnsavedIndicator();
    });
}

/**
 * Setup cover action button handlers (generate, upload, clear, etc.)
 */
function setupCoverActionHandlers() {
    // Generate cover
    $(document).on('click' + EVENT_NAMESPACE, '#generate_cover_btn', handleGenerateCover);

    // Upload cover
    $(document).on('click' + EVENT_NAMESPACE, '#upload_cover_btn', handleUploadCover);

    // Clear cover
    $(document).on('click' + EVENT_NAMESPACE, '#clear_cover_btn', handleClearCover);

    // Regenerate prompt
    $(document).on('click' + EVENT_NAMESPACE, '#regenerate_prompt_btn', handleRegeneratePrompt);

    // Copy prompt
    $(document).on('click' + EVENT_NAMESPACE, '#copy_prompt_btn', handleCopyPrompt);

    // Generate opening message
    $(document).on('click' + EVENT_NAMESPACE, '#generate_opening_message_btn', handleGenerateOpeningMessage);

    // Debug SD command
    $(document).on('click' + EVENT_NAMESPACE, '#debug_sd_cmd_btn', handleDebugSDCommand);
}

/**
 * Setup character tab handlers (CQ-002)
 */
function setupCharacterTabHandlers() {
    // Refresh character links button
    $(document).on('click' + EVENT_NAMESPACE, '#refresh_character_links', async function (e) {
        e.preventDefault();
        const btn = $(this);

        if (btn.prop('disabled')) return;

        btn.prop('disabled', true);

        try {
            // Re-render characters tab
            const newContent = renderCharactersTab();
            $('.storymode-characters-tab').html($(newContent).find('.storymode-characters-tab').html());

            toastr.success('Character links refreshed');
        } catch (error) {
            console.error('[Story Mode] Failed to refresh character links:', error);
            toastr.error('Failed to refresh character links');
        } finally {
            btn.prop('disabled', false);
        }
    });
}

/**
 * Handle cover image generation via SD
 * Uses extracted core logic + auto-saves after generation
 */
async function handleGenerateCover(e) {
    e.preventDefault();

    const btn = $(this);
    const originalText = btn.html();
    btn.prop('disabled', true).html('<i class="fa-solid fa-circle-notch fa-spin"></i> Generating...');

    try {
        const result = await generateCoverFromSD(currentBlueprint);

        if (!result.success) {
            throw new Error(result.error);
        }

        // Add to gallery and set as primary cover
        await addCoverToGallery(currentBlueprint, result.imageUrl, currentBlueprint.metadata?.coverPrompt);
        setCoverImageUrl(currentBlueprint, result.imageUrl);

        // Auto-save and refresh
        const saved = await saveBlueprint();
        if (!saved) {
            throw new Error('Blueprint validation failed - cover was not saved');
        }
        refreshContent();
        toastr.success('Cover image generated and saved!');
    } catch (err) {
        console.error('[BlueprintEditor] Failed to generate cover:', err);
        toastr.error('Failed to generate cover: ' + err.message);
    } finally {
        // Restore button state (handle both cases for button reference)
        const targetBtn = $('#generate_cover_btn').length ? $('#generate_cover_btn') : btn;
        targetBtn.prop('disabled', false).html(originalText);
    }
}

/**
 * Handle generating opening message
 */
async function handleGenerateOpeningMessage(e) {
    e.preventDefault();

    const btn = $(this);
    const originalText = btn.html();
    btn.prop('disabled', true).html('<i class="fa-solid fa-circle-notch fa-spin"></i> Generating...');

    try {
        const result = await BlueprintModule.generateOpeningMessage(currentBlueprint);

        if (!result) {
            throw new Error('No content generated');
        }

        // Update blueprint
        currentBlueprint.opening_message = result;
        hasUnsavedChanges = true;
        updateUnsavedIndicator();

        // Update UI
        $('#edit_opening_message').val(result);

        toastr.success('Opening message generated!');
    } catch (err) {
        console.error('[BlueprintEditor] Failed to generate opening message:', err);
        toastr.error('Failed to generate: ' + err.message);
    } finally {
        btn.prop('disabled', false).html(originalText);
    }
}


/**
 * Handle cover image upload
 */
function handleUploadCover(e) {
    e.preventDefault();

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            toastr.warning('Please select an image file');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            toastr.warning('Large image detected. Consider using a smaller file for better performance.');
        }

        try {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const dataUrl = e.target.result;

                await addCoverToGallery(currentBlueprint, dataUrl, null, {
                    model: 'Uploaded',
                    prompt: null
                });

                currentBlueprint.metadata.coverImageUrl = dataUrl;
                currentBlueprint.coverImageUrl = dataUrl;

                hasUnsavedChanges = true;
                refreshContent();
                toastr.success('Image uploaded and added to gallery!');
            };
            reader.readAsDataURL(file);
        } catch (err) {
            console.error('[BlueprintEditor] Failed to upload:', err);
            toastr.error('Failed to upload image');
        }
    };
    input.click();
}

/**
 * Handle cover image removal
 */
async function handleClearCover(e) {
    e.preventDefault();

    const gallery = currentBlueprint.metadata?.coverGallery || [];
    const currentIndex = currentBlueprint.metadata?.coverGalleryIndex || 0;

    if (!gallery.length || currentIndex === null || currentIndex < 0) {
        toastr.warning('No cover to remove');
        return;
    }

    const confirmMsg = `Remove cover ${currentIndex + 1} of ${gallery.length}?`;
    if (!confirm(confirmMsg)) return;

    gallery.splice(currentIndex, 1);

    if (gallery.length === 0) {
        currentBlueprint.metadata.coverGalleryIndex = null;
        currentBlueprint.metadata.coverImageUrl = null;
        currentBlueprint.coverImageUrl = null;
        toastr.info('All covers removed');
    } else {
        const newIndex = Math.min(currentIndex, gallery.length - 1);
        setCoverImage(newIndex, gallery[newIndex].url, gallery);
        toastr.info(`Cover removed. Now showing ${newIndex + 1} of ${gallery.length}`);
    }

    hasUnsavedChanges = true;
    refreshContent();
}

/**
 * Handle prompt regeneration
 */
function handleRegeneratePrompt(e) {
    e.preventDefault();

    if (!confirm('Regenerate the cover prompt? This will overwrite your current edits.')) {
        return;
    }

    currentBlueprint.metadata.coverPrompt = generateCoverPrompt(currentBlueprint);
    hasUnsavedChanges = true;
    refreshContent();
    toastr.success('Cover prompt regenerated');
}

/**
 * Handle copy prompt to clipboard
 */
async function handleCopyPrompt(e) {
    e.preventDefault();

    const prompt = currentBlueprint.metadata?.coverPrompt;
    if (!prompt) {
        toastr.warning('No cover prompt to copy');
        return;
    }

    const formatted = `Positive: ${prompt.positive || ''}\n\nNegative: ${prompt.negative || ''}\n\nStyle: ${prompt.style || ''}\nMood: ${prompt.mood || ''}\nLighting: ${prompt.lighting || ''}\nColors: ${Array.isArray(prompt.colors) ? prompt.colors.join(', ') : prompt.colors || ''}`;

    try {
        await navigator.clipboard.writeText(formatted);
        toastr.success('Prompt copied to clipboard');
    } catch (err) {
        console.error('[BlueprintEditor] Failed to copy:', err);
        toastr.error('Failed to copy to clipboard');
    }
}

/**
 * Handle debug SD command display
 */
async function handleDebugSDCommand(e) {
    e.preventDefault();

    const prompt = currentBlueprint.metadata?.coverPrompt;
    if (!prompt) {
        toastr.warning('No cover prompt defined');
        return;
    }

    const fullPrompt = buildSDPrompt(prompt);
    const imageSize = prompt.technical?.image_size || '1024x1536';
    const [width, height] = imageSize.split('x').map(Number);

    const debugHtml = `
        <h3>Stable Diffusion Command Debug</h3>
        <p>This is the exact command that will be sent to Stable Diffusion when you click "Generate Cover".</p>
        
        <div style="margin: 16px 0;">
            <label style="display: block; margin-bottom: 4px; font-weight: bold;">Full SD Prompt:</label>
            <textarea readonly style="width: 100%; height: 100px; font-family: monospace; font-size: 12px;">${escapeHtml(fullPrompt)}</textarea>
        </div>
        
        <div style="margin: 16px 0;">
            <label style="display: block; margin-bottom: 4px; font-weight: bold;">Slash Command (copy this):</label>
            <input type="text" id="sd_debug_slash_cmd" readonly value="/sd ${escapeHtml(fullPrompt)}" style="width: 100%; font-family: monospace; font-size: 12px;">
        </div>
        
        <div style="margin: 16px 0;">
            <strong>Breakdown:</strong>
            <ul style="margin: 8px 0; padding-left: 20px;">
                <li><strong>Positive:</strong> ${escapeHtml(prompt.positive || '(none)')}</li>
                <li><strong>Negative:</strong> ${escapeHtml(prompt.negative || '(none)')}</li>
                <li><strong>Style:</strong> ${escapeHtml(prompt.style || '(none)')}</li>
                <li><strong>Mood:</strong> ${escapeHtml(prompt.mood || '(none)')}</li>
                <li><strong>Lighting:</strong> ${escapeHtml(prompt.lighting || '(none)')}</li>
                <li><strong>Composition:</strong> ${escapeHtml(prompt.composition || '(none)')}</li>
                <li><strong>Image Size:</strong> ${width} x ${height}</li>
            </ul>
        </div>
        
        <p style="color: var(--SmartThemeEmColor); font-size: 0.9em;">
            Click "Copy" to copy the slash command to clipboard, then paste it in the chat to test manually.
        </p>
    `;

    const result = await callGenericPopup(debugHtml, POPUP_TYPE.CONFIRM, '', {
        customCancelButtonHtml: 'Close',
        okButton: 'Copy'
    });

    if (result) {
        const slashCmd = $('#sd_debug_slash_cmd').val();
        await navigator.clipboard.writeText(slashCmd);
        toastr.success('Copied to clipboard!');
    }
}

/**
 * Setup cover gallery navigation handlers
 */
function setupCoverGalleryHandlers() {
    $(document).on('click' + EVENT_NAMESPACE, '.storymode-cover-nav-prev, .storymode-cover-nav-next', function (e) {
        e.preventDefault();
        const newIndex = parseInt($(this).data('index'));
        navigateCoverGallery(newIndex);
    });

    $(document).on('click' + EVENT_NAMESPACE, '.storymode-cover-carousel-item', function (e) {
        e.preventDefault();
        const index = parseInt($(this).data('index'));
        if (!isNaN(index)) {
            navigateCoverGallery(index);
        }
    });

    $(document).on('keydown' + EVENT_NAMESPACE, function (e) {
        if (!canNavigateGallery()) return;

        const currentIndex = currentBlueprint.metadata?.coverGalleryIndex || 0;
        const gallery = currentBlueprint.metadata?.coverGallery;

        if (e.key === 'ArrowLeft' && currentIndex > 0) {
            e.preventDefault();
            navigateCoverGallery(currentIndex - 1);
        } else if (e.key === 'ArrowRight' && currentIndex < gallery.length - 1) {
            e.preventDefault();
            navigateCoverGallery(currentIndex + 1);
        }
    });
}

/**
 * Close the blueprint editor modal
 */
function closeEditorModal() {
    $(SELECTORS.EDITOR_CONTAINER).closest('.popup').find(SELECTORS.POPUP_CANCEL).click();
}

/**
 * Close the settings dialog
 */
function closeSettingsDialog() {
    $(SELECTORS.SETTINGS_DIALOG).find(SELECTORS.SETTINGS_OK).trigger('click');
}

/**
 * Show warnings popup for story startup
 * @param {Array<string>} warnings - List of warnings to display
 */
async function showWarningsPopup(warnings) {
    const warningHtml = `
        <h3>Story Started with Warnings</h3>
        <ul style="text-align: left;">
            ${warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}
        </ul>
    `;
    await callGenericPopup(warningHtml, POPUP_TYPE.TEXT, null, { wide: true });
}

/**
 * Show error popup for failed story startup
 * @param {string} error - Error message to display
 */
async function showErrorPopup(error) {
    const errorHtml = `<h3>Failed to Start Story</h3><p>${escapeHtml(error)}</p>`;
    await callGenericPopup(errorHtml, POPUP_TYPE.TEXT, null, { wide: true });
}

/**
 * Save current blueprint state before starting story
 */
async function saveBlueprintBeforePlay() {
    const blueprintState = BlueprintModule.getBlueprintState();
    blueprintState.blueprint = currentBlueprint;
    await BlueprintModule.saveBlueprintState(blueprintState);
}

/**
 * Handle play button click - start story from current blueprint
 */
async function handlePlayButtonClick(e) {
    e.preventDefault();

    await saveBlueprintBeforePlay();
    closeEditorModal();

    const result = await BlueprintModule.startStoryFromBlueprint(currentBlueprint, { sourceType: 'editor' });

    if (result.success) {
        if (result.warnings?.length > 0) {
            await showWarningsPopup(result.warnings);
        }
        closeSettingsDialog();
    } else {
        await showErrorPopup(result.error);
    }
}

/**
 * Setup editor action handlers (play button, etc.)
 */
function setupEditorActionHandlers() {
    $(document).on('click' + EVENT_NAMESPACE, SELECTORS.PLAY_BUTTON, handlePlayButtonClick);

    // Export button handler
    $(document).on('click' + EVENT_NAMESPACE, '#blueprint_export_btn', async function (e) {
        e.preventDefault();
        await handleExportBlueprint();
    });
}

/**
 * Handle blueprint export
 */
async function handleExportBlueprint() {
    if (!currentBlueprint) {
        toastr.warning('No blueprint to export');
        return;
    }

    const { exportBlueprintAsPNG } = await import('./blueprint/export.js');

    const result = await exportBlueprintAsPNG(currentBlueprint);

    if (result.success) {
        toastr.success(`Blueprint exported: ${result.filename}`);
    } else {
        toastr.error(`Export failed: ${result.error}`);
    }
}

