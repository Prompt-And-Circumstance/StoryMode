/**
 * Details Tab Module
 * Renders the Blueprint Details tab content
 */

import { getCurrentBlueprint } from './state.js';
import { getStoryTypes, getAuthorStyles } from '../../core/state-manager.js';
import { escapeHtml, getNestedValue, buildSelectOptions } from '../../blueprint/utils.js';
import { DROPDOWN_OPTIONS } from '../../blueprint/schema.js';

export function renderDetailsTab() {
    const bp = getCurrentBlueprint();
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

        <!-- Creator Notes -->
        <div class="storymode-form-section">
            <h3 class="storymode-section-title">
                <i class="fa-solid fa-user-pen"></i> Creator Notes
            </h3>
            <div class="storymode-form-grid">
                <div>
                    <label for="edit_created_by">Created By</label>
                    <input type="text" id="edit_created_by" class="text_pole" data-field="creator_notes.created_by"
                        placeholder="Your name or handle..." maxlength="100"
                        value="${escapeHtml(getNestedValue(bp, 'creator_notes.created_by'))}" style="width: 100%;">
                </div>
                <div>
                    <label for="edit_scenario_version">Scenario Version</label>
                    <input type="text" id="edit_scenario_version" class="text_pole" data-field="creator_notes.scenario_version"
                        placeholder="e.g., 1.0, v2.1, beta..." maxlength="50"
                        value="${escapeHtml(getNestedValue(bp, 'creator_notes.scenario_version'))}" style="width: 100%;">
                </div>
            </div>
            <div class="storymode-form-grid-full" style="margin-top: 10px;">
                <div>
                    <label for="edit_creator_notes">Creator's Notes</label>
                    <textarea id="edit_creator_notes" class="storymode-textarea" data-field="creator_notes.notes" rows="4"
                        placeholder="Add notes, instructions, or commentary for users of this blueprint..."
                        maxlength="5000">${escapeHtml(getNestedValue(bp, 'creator_notes.notes'))}</textarea>
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
        </div>

        <!-- User Scenario -->
        <div class="storymode-form-section">
            <h3 class="storymode-section-title">User Scenario</h3>
            <div class="storymode-form-grid-full">
                <div>
                    <label for="edit_user_scenario">Original Scenario Input</label>
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
