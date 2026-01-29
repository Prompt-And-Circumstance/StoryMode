/**
 * Wizard Panel Module
 * Collapsible side panel for AI-assisted section generation
 *
 * @module editor/blueprint-editor/wizard-panel
 */

import { getCurrentBlueprint, setHasUnsavedChanges } from './state.js';
import { escapeHtml } from '../../blueprint/utils.js';
import { isBlankBlueprint } from '../../blueprint/blank-blueprint.js';
import { getStoryTypes, getAuthorStyles } from '../../core/state-manager.js';
import { EVENT_NAMESPACE } from './event-handlers.js';

// Module state
let _wizardPanelOpen = null; // null = auto (based on blueprint), true/false = manual override
let _refreshContent = null;
let _refreshLeftPanel = null;

/**
 * Set refresh functions from parent module
 */
export function setWizardRefreshFunctions(contentFn, leftPanelFn) {
    _refreshContent = contentFn;
    _refreshLeftPanel = leftPanelFn;
}

/**
 * Check if wizard panel should be open
 * @returns {boolean}
 */
export function isWizardPanelOpen() {
    if (_wizardPanelOpen !== null) {
        return _wizardPanelOpen;
    }
    // Default to closed - user can open manually
    return false;
}

/**
 * Toggle wizard panel open/closed
 */
export function toggleWizardPanel() {
    _wizardPanelOpen = !isWizardPanelOpen();
}

/**
 * Check if a section has content
 */
const SECTION_CHECKERS = {
    foundation: (bp) => bp.core_premise?.trim().length > 0,
    characters: (bp) => bp.character_arcs?.length > 0,
    scenes: (bp) => (bp.scene_plan || []).filter(s => !s.is_ending_scene).length > 0,
    resolution: (bp) => {
        const desc = bp.primary_ending?.description;
        return desc && desc.trim().length > 0 && desc !== 'The story reaches its conclusion';
    }
};

function hasSectionContent(sectionId, bp) {
    return SECTION_CHECKERS[sectionId]?.(bp) || false;
}

/**
 * Render dropdown options
 */
function renderOptions(items, current, placeholder = null) {
    let html = placeholder ? `<option value="">${placeholder}</option>` : '';
    html += items.map(item => `
        <option value="${escapeHtml(item.id)}" ${item.id === current ? 'selected' : ''}>
            ${escapeHtml(item.name)}
        </option>
    `).join('');
    return html;
}

function renderStoryTypeOptions() {
    const bp = getCurrentBlueprint();
    const sorted = [...getStoryTypes()].sort((a, b) => a.name.localeCompare(b.name));
    return renderOptions(sorted, bp.story_type_id || 'custom');
}

function renderAuthorStyleOptions() {
    const bp = getCurrentBlueprint();
    const sorted = [...getAuthorStyles()].sort((a, b) => a.name.localeCompare(b.name));
    return renderOptions(sorted, bp.author_style || '', 'None (Default Style)');
}

/**
 * Render a section button
 */
function renderSectionButton(sectionId, icon, label, bp) {
    const complete = hasSectionContent(sectionId, bp);
    return `
        <button class="storymode-wizard-section-btn" data-section="${sectionId}"
                ${complete ? 'data-complete="true"' : ''}>
            <i class="fa-solid fa-${icon} section-icon"></i>
            <span class="section-label">${label}</span>
        </button>
    `;
}

/**
 * Render the wizard panel HTML
 * @returns {string} HTML content
 */
export function renderWizardPanel() {
    const bp = getCurrentBlueprint();
    const isOpen = isWizardPanelOpen();
    const scenario = bp.user_scenario || '';

    return `
        <div class="storymode-wizard-panel ${isOpen ? 'open' : 'collapsed'}">
            <div class="storymode-wizard-toggle" title="Toggle AI Wizard">
                <i class="fa-solid fa-wand-magic-sparkles"></i>
            </div>

            <div class="storymode-wizard-content">
                <h3 class="storymode-wizard-header">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> AI Wizard
                </h3>

                <!-- Shared context inputs -->
                <div class="storymode-wizard-context">
                    <div class="storymode-wizard-field">
                        <label for="wizard_story_type">Story Type</label>
                        <select id="wizard_story_type" class="text_pole">
                            ${renderStoryTypeOptions()}
                        </select>
                    </div>

                    <div class="storymode-wizard-field">
                        <label for="wizard_author_style">Author Style</label>
                        <select id="wizard_author_style" class="text_pole">
                            ${renderAuthorStyleOptions()}
                        </select>
                    </div>

                    <div class="storymode-wizard-field">
                        <label for="wizard_scenario">Scenario</label>
                        <textarea id="wizard_scenario" class="text_pole" rows="3"
                            placeholder="Describe your story scenario...">${escapeHtml(scenario)}</textarea>
                    </div>
                </div>

                <!-- Section generators -->
                <div class="storymode-wizard-sections">
                    <h4 class="storymode-wizard-sections-title">Generate Sections</h4>

                    ${renderSectionButton('foundation', 'compass', 'Foundation', bp)}
                    ${renderSectionButton('characters', 'users', 'Characters', bp)}
                    ${renderSectionButton('scenes', 'film', 'Scenes', bp)}
                    ${renderSectionButton('resolution', 'flag-checkered', 'Endings', bp)}
                </div>

                <p class="storymode-wizard-hint">
                    Click a section to generate it with AI, or edit manually in the tabs.
                </p>
            </div>
        </div>
    `;
}

/**
 * Get wizard context (story type, author style, scenario)
 * @returns {Object} Context object
 */
export function getWizardContext() {
    return {
        storyTypeId: $('#wizard_story_type').val(),
        authorStyleId: $('#wizard_author_style').val(),
        scenario: $('#wizard_scenario').val()
    };
}

/**
 * Setup wizard panel event handlers
 * Called from the main event handlers setup
 */
export function setupWizardPanelHandlers() {
    // Toggle panel open/closed
    $(document).on('click' + EVENT_NAMESPACE, '.storymode-wizard-toggle', function(e) {
        e.preventDefault();
        toggleWizardPanel();
        $('.storymode-wizard-panel').toggleClass('collapsed', !isWizardPanelOpen());
        $('.storymode-wizard-panel').toggleClass('open', isWizardPanelOpen());
    });

    // Context field changes - sync to blueprint and main editor
    $(document).on('change' + EVENT_NAMESPACE, '#wizard_story_type', function() {
        const bp = getCurrentBlueprint();
        const storyTypes = getStoryTypes();
        const selectedId = $(this).val();
        const selectedType = storyTypes.find(st => st.id === selectedId);

        if (selectedType) {
            bp.story_type_id = selectedType.id;
            bp.story_type_name = selectedType.name;
            // Sync main editor dropdown
            $('#edit_story_type').val(selectedId);
            setHasUnsavedChanges(true);
            if (_refreshLeftPanel) _refreshLeftPanel();
        }
    });

    $(document).on('change' + EVENT_NAMESPACE, '#wizard_author_style', function() {
        const bp = getCurrentBlueprint();
        const authorStyles = getAuthorStyles();
        const selectedId = $(this).val();

        if (selectedId) {
            const selectedStyle = authorStyles.find(as => as.id === selectedId);
            if (selectedStyle) {
                bp.author_style = selectedStyle.id;
                bp.author_style_name = selectedStyle.name;
            }
        } else {
            bp.author_style = undefined;
            bp.author_style_name = undefined;
        }
        // Sync main editor dropdown
        $('#edit_author_style').val(selectedId);
        setHasUnsavedChanges(true);
        if (_refreshLeftPanel) _refreshLeftPanel();
    });

    $(document).on('change' + EVENT_NAMESPACE, '#wizard_scenario', function() {
        const bp = getCurrentBlueprint();
        bp.user_scenario = $(this).val();
        // Sync main editor textarea
        $('#edit_user_scenario').val(bp.user_scenario);
        setHasUnsavedChanges(true);
    });

    // Section generation buttons
    $(document).on('click' + EVENT_NAMESPACE, '.storymode-wizard-section-btn', async function(e) {
        e.preventDefault();
        const sectionId = $(this).data('section');
        const btn = $(this);

        // Don't re-generate if already running
        if (btn.hasClass('generating')) return;

        await handleSectionGeneration(sectionId, btn);
    });
}

const SECTION_NAMES = {
    foundation: 'Foundation',
    characters: 'Characters',
    scenes: 'Scenes',
    resolution: 'Endings'
};

/**
 * Validate section generation prerequisites
 */
async function validateSectionGeneration(sectionId) {
    const context = getWizardContext();
    if (!context.scenario?.trim()) {
        toastr.warning('Please enter a scenario description first.');
        $('#wizard_scenario').focus();
        return false;
    }

    const { checkSectionPrerequisites } = await import('../../generation/orchestration.js');
    const prereqCheck = checkSectionPrerequisites(sectionId, getCurrentBlueprint());

    if (!prereqCheck.canGenerate) {
        toastr.warning(prereqCheck.message);
        return false;
    }

    return true;
}

/**
 * Set button loading state
 */
function setButtonLoading(btn, loading) {
    if (loading) {
        btn.data('original-html', btn.html());
        btn.addClass('generating')
            .html('<i class="fa-solid fa-circle-notch fa-spin section-icon"></i><span class="section-label">Generating...</span>')
            .prop('disabled', true);
    } else {
        btn.removeClass('generating')
            .html(btn.data('original-html'))
            .prop('disabled', false)
            .removeData('original-html');
    }
}

/**
 * Handle section generation
 */
async function handleSectionGeneration(sectionId, btn) {
    if (!await validateSectionGeneration(sectionId)) return;

    const { generateSection } = await import('../../generation/orchestration.js');
    const sectionName = SECTION_NAMES[sectionId];

    setButtonLoading(btn, true);
    toastr.info(`Generating ${sectionName}...`, '', { timeOut: 0, extendedTimeOut: 0 });

    try {
        const result = await generateSection(sectionId, getCurrentBlueprint(), getWizardContext());
        Object.assign(getCurrentBlueprint(), result);
        setHasUnsavedChanges(true);

        toastr.clear();
        toastr.success(`${sectionName} generated successfully`);

        // Update UI
        btn.attr('data-complete', 'true');
        _refreshContent?.();
        _refreshLeftPanel?.();
        $('.storymode-wizard-panel').replaceWith(renderWizardPanel());

    } catch (error) {
        console.error('[Story Mode] Section generation failed:', error);
        toastr.clear();
        toastr.error(`Failed to generate ${sectionName}: ${error.message}`);
    } finally {
        setButtonLoading(btn, false);
    }
}

/**
 * Reset wizard panel state (call when editor closes)
 */
export function resetWizardPanelState() {
    _wizardPanelOpen = null;
}
