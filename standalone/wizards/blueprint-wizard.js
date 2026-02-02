/**
 * Blueprint Generation Wizard Module
 * Multi-step wizard for AI-powered blueprint generation
 */

import { Popup } from '../adapters/popup-adapter.js';
import { getStoryTypes, getAuthorStyles, generateBlueprint } from '../adapters/connection-bridge.js';
import { getConnectionStatus } from '../adapters/connection-bridge.js';
import { showSuccess, showError, showWarning, showInfo } from '../adapters/notification-adapter.js';
import { setCurrentBlueprint } from '../handlers/blueprint-actions.js';
import { renderLoreStep, extractLoreData } from './wizard-steps/lore-step.js';
import {
    renderConceptStep,
    renderStoryStep,
    renderCharactersStep,
    renderReviewStep
} from './wizard-steps/wizard-steps.js';

// ============================================================================
// WIZARD CONFIG
// ============================================================================

const WIZARD_STEPS = [
    { id: 'concept', title: 'Core Concept', icon: 'fa-lightbulb' },
    { id: 'story', title: 'Story Details', icon: 'fa-book' },
    { id: 'characters', title: 'Characters', icon: 'fa-users' },
    { id: 'lore', title: 'World Lore', icon: 'fa-globe' },
    { id: 'review', title: 'Review & Generate', icon: 'fa-wand-magic-sparkles' },
];

// ============================================================================
// WIZARD STATE
// ============================================================================

const DEFAULT_WIZARD_DATA = {
    story_type_id: '',
    author_style: '',
    core_premise: '',
    genre: '',
    tone: '',
    setting_location: '',
    setting_time: '',
    protagonist_description: '',
    antagonist_description: '',
    additional_notes: '',
    // Lore fields
    selected_lore_entries: [],
    embed_lorebook: true,
    linked_lorebooks: [],
};

const WIZARD_FIELDS = Object.keys(DEFAULT_WIZARD_DATA);

let wizardData = { ...DEFAULT_WIZARD_DATA };
let currentStep = 0;

// ============================================================================
// WIZARD UI
// ============================================================================

/**
 * Show the blueprint generation wizard
 * @returns {Promise<Object|null>} Generated blueprint or null if cancelled
 */
export async function showBlueprintWizard() {
    // Check if connected to backend
    if (getConnectionStatus() !== 'connected') {
        showWarning('Please connect to SillyTavern to generate blueprints');
        // Offer to open settings
        const confirmed = confirm('Would you like to configure your connection?');
        if (confirmed) {
            $(document).trigger('open-settings');
        }
        return null;
    }

    // Reset state
    currentStep = 0;
    wizardData = { ...DEFAULT_WIZARD_DATA };

    // Load story types and author styles
    const [storyTypes, authorStyles] = await Promise.all([
        getStoryTypes(),
        getAuthorStyles(),
    ]);

    if (storyTypes.length === 0) {
        showError('No story types available. Please ensure Story Mode extension is installed.');
        return null;
    }

    // Create wizard UI
    const $wizard = buildWizardUI(storyTypes, authorStyles);

    // Create popup
    const popup = new Popup($wizard, 'TEXT', 'Generate Blueprint', {
        wide: true,
        large: true,
        okButton: false,  // We handle navigation manually
        cancelButton: true,
    });

    // Return promise that resolves with blueprint or null
    return new Promise((resolve) => {
        popup.show().then((result) => {
            if (result === false) {
                resolve(null);  // Cancelled
            }
        });

        // Store resolve function for completion
        $wizard.data('resolve', resolve);
    });
}

/**
 * Build the wizard UI
 * @param {Array} storyTypes - Available story types
 * @param {Array} authorStyles - Available author styles
 * @returns {jQuery} Wizard UI element
 */
function buildWizardUI(storyTypes, authorStyles) {
    const $wizard = $('<div>').addClass('blueprint-wizard');

    // Progress steps
    const $steps = $('<div>').addClass('wizard-steps');
    WIZARD_STEPS.forEach((step, index) => {
        const $step = $('<div>').addClass('wizard-step')
            .attr('data-step', index)
            .toggleClass('active', index === 0);
        $step.append($('<i>').addClass(`fa-solid ${step.icon}`));
        $step.append($('<span>').text(step.title));
        $steps.append($step);
    });
    $wizard.append($steps);

    // Content area
    const $content = $('<div>').addClass('wizard-content').attr('id', 'wizardContent');
    $wizard.append($content);

    // Navigation buttons
    const $nav = $('<div>').addClass('wizard-nav');
    const $backBtn = $('<button>').addClass('btn btn-secondary').attr('id', 'wizardBack').prop('disabled', true);
    $backBtn.html('<i class="fa-solid fa-arrow-left"></i> Back');
    const $nextBtn = $('<button>').addClass('btn btn-primary').attr('id', 'wizardNext');
    $nextBtn.text('Next');
    $nav.append($backBtn, $nextBtn);
    $wizard.append($nav);

    // Store data
    $wizard.data('storyTypes', storyTypes);
    $wizard.data('authorStyles', authorStyles);

    // Bind events
    bindWizardEvents($wizard);

    // Show first step
    showStep($wizard, 0);

    return $wizard;
}

/**
 * Bind wizard events
 * @param {jQuery} $wizard - Wizard element
 */
function bindWizardEvents($wizard) {
    $wizard.on('click.wizard', '#wizardBack', () => {
        if (currentStep > 0) {
            showStep($wizard, currentStep - 1);
        }
    });

    $wizard.on('click.wizard', '#wizardNext', async () => {
        if (await validateCurrentStep($wizard)) {
            if (currentStep < WIZARD_STEPS.length - 1) {
                showStep($wizard, currentStep + 1);
            } else {
                // Last step - generate
                await generateBlueprintFromWizard($wizard);
            }
        }
    });
}

/**
 * Show a specific wizard step
 * @param {jQuery} $wizard - Wizard element
 * @param {number} stepIndex - Step index
 */
function showStep($wizard, stepIndex) {
    currentStep = stepIndex;
    const $content = $wizard.find('#wizardContent');

    // Update step indicators
    $wizard.find('.wizard-step').each((i, el) => {
        const $el = $(el);
        $el.toggleClass('active', i === stepIndex);
        $el.toggleClass('completed', i < stepIndex);
    });

    // Update navigation buttons
    $wizard.find('#wizardBack').prop('disabled', stepIndex === 0);
    const $nextBtn = $wizard.find('#wizardNext');

    if (stepIndex === WIZARD_STEPS.length - 1) {
        $nextBtn.html('<i class="fa-solid fa-wand-magic-sparkles"></i> Generate Blueprint');
    } else {
        $nextBtn.text('Next');
    }

    // Render step content
    $content.empty();

    const stepId = WIZARD_STEPS[stepIndex].id;
    const storyTypes = $wizard.data('storyTypes');
    const authorStyles = $wizard.data('authorStyles');

    switch (stepId) {
        case 'concept':
            renderConceptStep($content, storyTypes, wizardData);
            break;
        case 'story':
            renderStoryStep($content, authorStyles, wizardData);
            break;
        case 'characters':
            renderCharactersStep($content, wizardData);
            break;
        case 'lore':
            // Async render - returns promise
            renderLoreStep($content, wizardData).catch(err => {
                console.error('[Wizard] Failed to render lore step:', err);
                $content.append(`
                    <div class="alert alert-danger">
                        Failed to load lore step: ${err.message}
                    </div>
                `);
            });
            break;
        case 'review':
            renderReviewStep($content, storyTypes, wizardData);
            break;
    }
}

// ============================================================================
// STEP VALIDATION
// ============================================================================

/**
 * Validate the current step
 * @param {jQuery} $wizard - Wizard element
 * @returns {Promise<boolean>} True if valid
 */
async function validateCurrentStep($wizard) {
    const stepId = WIZARD_STEPS[currentStep].id;

    // Collect data before validation
    collectWizardData($wizard);

    switch (stepId) {
        case 'concept':
            if (!wizardData.story_type_id) {
                showWarning('Please select a story type');
                return false;
            }
            if (!wizardData.core_premise?.trim()) {
                showWarning('Please enter a core premise');
                return false;
            }
            if (wizardData.core_premise.length < 20) {
                showWarning('Core premise should be at least 20 characters');
                return false;
            }
            break;

        case 'story':
            // All fields optional
            break;

        case 'characters':
            // All fields optional
            break;

        case 'review':
            // Nothing to validate
            break;
    }

    return true;
}

/**
 * Collect form data into wizardData
 * @param {jQuery} $wizard - Wizard element
 */
function collectWizardData($wizard) {
    const $content = $wizard.find('#wizardContent');

    WIZARD_FIELDS.forEach(field => {
        wizardData[field] = $content.find(`[name="${field}"]`).val() || '';
    });
}

// ============================================================================
// GENERATION
// ============================================================================

/**
 * Build generation request from wizard data
 * @returns {Object} Generation request
 */
function buildGenerationRequest() {
    // Extract lore data
    const { embedded_lorebook, linked_lorebooks } = extractLoreData(wizardData);

    return {
        story_type_id: wizardData.story_type_id,
        author_style: wizardData.author_style,
        core_premise: wizardData.core_premise,
        genre: wizardData.genre,
        tone: wizardData.tone,
        setting: {
            location: wizardData.setting_location,
            time_period: wizardData.setting_time,
        },
        protagonist_description: wizardData.protagonist_description,
        antagonist_description: wizardData.antagonist_description,
        additional_notes: wizardData.additional_notes,
        // Lore data
        embedded_lorebook,
        linked_lorebooks,
    };
}

/**
 * Show generation progress UI
 * @param {jQuery} $content - Content element
 */
function showGenerationProgress($content) {
    $content.html(`
        <div class="generation-progress">
            <h3>Generating your blueprint...</h3>
            <div class="progress-bar-container">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: 0%"></div>
                </div>
                <span class="progress-text">Initializing...</span>
            </div>
            <div class="phase-status"></div>
        </div>
    `);
}

/**
 * Show generation error UI
 * @param {jQuery} $content - Content element
 * @param {jQuery} $wizard - Wizard element
 * @param {Error} error - Error object
 */
function showGenerationError($content, $wizard, error) {
    console.error('[Wizard] Generation failed:', error);
    $content.html(`
        <div class="generation-error">
            <i class="fa-solid fa-circle-exclamation"></i>
            <h3>Generation Failed</h3>
            <p>${error.message}</p>
            <button class="btn btn-secondary" id="wizardRetry">Try Again</button>
            <button class="btn btn-secondary" id="wizardBackToReview">Back to Review</button>
        </div>
    `);

    // Re-enable navigation
    $wizard.find('.wizard-nav').find('button').prop('disabled', false);

    // Bind retry button
    $content.find('#wizardRetry').on('click', () => {
        generateBlueprintFromWizard($wizard);
    });

    $content.find('#wizardBackToReview').on('click', () => {
        showStep($wizard, WIZARD_STEPS.length - 1);
    });
}

/**
 * Generate blueprint from wizard data
 * @param {jQuery} $wizard - Wizard element
 */
async function generateBlueprintFromWizard($wizard) {
    const $content = $wizard.find('#wizardContent');
    const $nav = $wizard.find('.wizard-nav');

    // Disable navigation and show progress
    $nav.find('button').prop('disabled', true);
    showGenerationProgress($content);

    try {
        const request = buildGenerationRequest();
        const blueprint = await generateBlueprint(request);

        // Close popup and update state
        $wizard.closest('.modal-container').hide();
        setCurrentBlueprint(blueprint);
        $(document).trigger('blueprint:loaded', { blueprint });
        showSuccess('Blueprint generated successfully!');

        // Resolve promise
        const resolve = $wizard.data('resolve');
        if (resolve) resolve(blueprint);

    } catch (error) {
        showGenerationError($content, $wizard, error);
    }
}

// ============================================================================
// EXPORT FOR DEBUGGING
// ============================================================================

if (typeof window !== 'undefined' && window.location?.hostname === 'localhost') {
    window.StoryModeBlueprintWizard = {
        showBlueprintWizard,
        WIZARD_STEPS,
    };
}
