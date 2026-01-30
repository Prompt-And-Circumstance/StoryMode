/**
 * Blueprint Generation Wizard Module
 * Handles the phased blueprint generation wizard UI and workflow
 */
import { eventSource, saveChatConditional } from '/script.js';
import { extension_settings, getContext } from '/scripts/extensions.js';
import { callGenericPopup, Popup, POPUP_TYPE, POPUP_RESULT } from '/scripts/popup.js';

import * as BlueprintModule from '../blueprint/module.js';
import { createRunCopy, saveBlueprintState } from '../blueprint/storage.js';
import { generateCoverFromSD, addCoverToGallery, setCoverImageUrl } from '../editor/blueprint-editor.js';
import { saveCurrentBlueprintToLibrary } from '../blueprint/integration.js';
import { buildWizardProgressHTML, buildWizardPreview, buildPrimaryEndingDisplay } from '../ui/components.js';
import { escapeHtml } from '../ui/component-system.js';
import { pushStoryMessage } from '../core/event-handlers.js';
import { MODULE_NAME, getStoryTypes, getAuthorStyles } from '../core/state-manager.js';
import { PHASE_CONFIG } from '../core/constants.js';

/**
 * Gather form data for blueprint generation
 * @param {jQuery} content - The settings dialog content element
 * @returns {Object} Config object for generation
 */
export function getWizardFormData(content) {
    // Collect chat characters
    const selectedCharacterIds = [];
    content.find('input[name="blueprint_character"]:checked').each(function () {
        const charId = $(this).val();
        if (charId) selectedCharacterIds.push(charId);
    });

    // Collect personas
    const selectedPersonas = [];
    content.find('input[name="blueprint_persona"]:checked').each(function () {
        const personaId = $(this).val();
        const personaName = $(this).data('name');
        if (personaId) {
            selectedPersonas.push({
                id: personaId,
                name: personaName || personaId
            });
        }
    });

    // Collect library characters (from full character library)
    const selectedLibraryCharacterIds = [];
    content.find('input[name="blueprint_library_character"]:checked').each(function () {
        const charId = $(this).val();
        if (charId) selectedLibraryCharacterIds.push(charId);
    });

    const scenario = content.find('#blueprint_scenario').val() || '';
    const metaphorLevel = content.find('#blueprint_metaphor_level').val() || 'mixed';
    const storyLength = content.find('#blueprint_story_length').val() || 'medium';
    const customRounds = content.find('#blueprint_custom_rounds').val();
    const customMasterPrompt = content.find('#blueprint_master_prompt').val() || null;
    const storyTypeId = content.find('#blueprint_story_type').val() || '';
    const authorStyleId = content.find('#blueprint_author_style').val() || '';

    // Validate custom scene count
    let finalStoryLength = parseInt(storyLength);
    if (customRounds && customRounds.trim() !== '') {
        const parsedCustom = parseInt(customRounds);
        if (isNaN(parsedCustom) || parsedCustom <= 0) {
            toastr.error('Custom scene count must be a number greater than 0');
            return null;
        }
        finalStoryLength = parsedCustom;
    }

    // Build character data from context
    const context = getContext();
    const characterData = [];

    // Helper to add char if valid and not already added (checks by name)
    const addCharIfValid = (char) => {
        if (char && !characterData.some(cd => cd.name === char.name)) {
            characterData.push({
                name: char.name,
                description: char.description,
                personality: char.personality,
                scenario: char.scenario,
                greeting: char.greeting
            });
        }
    };

    // Add chat characters
    if (context.groupId) {
        const group = context.groups?.find(g => g.id === context.groupId);
        if (group && group.members) {
            group.members.forEach(memberFilename => {
                const charIndex = (context.characters || []).findIndex(c =>
                    c.filename === memberFilename ||
                    c.avatar === memberFilename ||
                    (typeof c === 'string' && c === memberFilename)
                );
                if (charIndex !== -1 && selectedCharacterIds.includes(charIndex.toString())) {
                    addCharIfValid(context.characters[charIndex]);
                }
            });
        }
    } else {
        if (selectedCharacterIds.includes(context.characterId?.toString())) {
            addCharIfValid(context.characters?.[parseInt(context.characterId, 10)]);
        }
    }

    // Add library characters by ID
    for (const charId of selectedLibraryCharacterIds) {
        const charIndex = parseInt(charId, 10);
        const char = context.characters?.[charIndex];
        addCharIfValid(char);
    }

    // Token validation constants
    const MIN_TOKENS = 1024;
    const MAX_TOKENS = 65536;
    const OPENING_MESSAGE_DEFAULT_TOKENS = 8192;

    /**
     * Validate and clamp token count to acceptable range
     * @param {string|number} value - Token value from form
     * @param {number} defaultValue - Default value to use if invalid
     * @returns {number} Validated token count
     */
    const validateTokens = (value, defaultValue) => {
        const parsed = parseInt(value, 10);
        if (isNaN(parsed) || parsed < MIN_TOKENS) return defaultValue;
        return Math.min(parsed, MAX_TOKENS);
    };

    // Capture phase overrides (per-session, not persisted)
    const phaseOverrides = {
        1: {
            profileId: content.find('#phase_1_profile').val() || null,
            maxTokens: validateTokens(
                content.find('#phase_1_tokens').val(),
                PHASE_CONFIG[1].maxTokens
            )
        },
        2: {
            profileId: content.find('#phase_2_profile').val() || null,
            maxTokens: validateTokens(
                content.find('#phase_2_tokens').val(),
                PHASE_CONFIG[2].maxTokens
            )
        },
        3: {
            profileId: content.find('#phase_3_profile').val() || null,
            maxTokens: validateTokens(
                content.find('#phase_3_tokens').val(),
                PHASE_CONFIG[3].maxTokens
            )
        },
        4: {
            profileId: content.find('#phase_4_profile').val() || null,
            maxTokens: validateTokens(
                content.find('#phase_4_tokens').val(),
                PHASE_CONFIG[4].maxTokens
            )
        }
    };

    return {
        storyTypeId,
        authorStyleId: authorStyleId || undefined,
        characterData,
        personaData: selectedPersonas,
        scenario,
        messageTarget: finalStoryLength,
        metaphorLevel: metaphorLevel,
        customMasterPrompt: customMasterPrompt,
        phaseOverrides: phaseOverrides
    };
}

/**
 * Create the HTML structure for the wizard modal
 * @returns {string} HTML string
 */
export function createWizardModalHtml() {
    return `
        <div class="storymode-wizard-modal">
            <div class="storymode-wizard-header" style="text-align: center; margin-bottom: 20px;">
                <h2 style="margin: 0 0 10px 0;"><i class="fa-solid fa-wand-magic-sparkles"></i> Blueprint Generation Wizard</h2>
            </div>
            <div id="storymode-wizard-progress-container"></div>
            <div id="storymode-wizard-preview-container"></div>
            <div id="storymode-wizard-status-log" style="display: none; margin: 15px 0; padding: 12px; background: var(--black10a); border-radius: 8px; border-left: 3px solid var(--SmartThemeBlurTintColor); max-height: 200px; overflow-y: auto; font-size: 0.9rem; font-family: monospace; color: var(--grey160); line-height: 1.6; text-align: left;">
                <div id="storymode-wizard-status-log-content"></div>
            </div>
            <div id="storymode-resolution-selection-container" style="display: none;"></div>
            <div id="storymode-wizard-cover-container" style="display: none; text-align: center; margin: 20px auto; padding: 20px; background: var(--black10a); border-radius: 8px; max-width: 167px;"></div>
            <div id="storymode-wizard-actions" style="text-align: center; margin-top: 20px;">
                <button id="storymode-wizard-cancel-btn" class="menu_button storymode-btn storymode-btn-secondary" style="margin-right: 10px;">
                    <i class="fa-solid fa-times"></i> Cancel
                </button>
                <button id="storymode-wizard-retry-btn" class="menu_button storymode-btn storymode-btn-warning" style="display: none; margin-right: 10px;">
                    <i class="fa-solid fa-rotate-right"></i> Retry Phase
                </button>
                <button id="storymode-wizard-finish-btn" class="menu_button storymode-btn storymode-btn-primary" style="display: none;">
                    <i class="fa-solid fa-check"></i> Save Blueprint
                </button>
            </div>
            <div id="storymode-wizard-error-details" style="display: none; margin-top: 20px; padding: 15px; background: var(--black10a); border-radius: 8px; border-left: 4px solid var(--corruption-red);">
                <h4 style="margin: 0 0 10px 0; color: var(--corruption-red);"><i class="fa-solid fa-exclamation-triangle"></i> Error Details</h4>
                <p id="storymode-wizard-error-message" style="margin: 0;"></p>
                <p id="storymode-wizard-error-phase" style="margin: 5px 0 0 0; font-size: 0.9rem; color: var(--gray70);"></p>
                <button id="storymode-wizard-show-response-btn" class="menu_button storymode-btn storymode-btn-secondary" style="display: none; margin-top: 10px; font-size: 0.8rem;">
                    <i class="fa-solid fa-code"></i> Show Full Response
                </button>
            </div>
        </div>
    `;
}

/**
 * Validate blueprint for required fields
 * @param {Object} blueprint - The generated blueprint
 * @returns {Array<string>} List of validation error messages
 */
export function validateBlueprint(blueprint) {
    const errors = [];
    if (!blueprint.core_premise) errors.push('Missing core premise');
    if (!blueprint.setting) errors.push('Missing setting information');
    if (!blueprint.antagonistic_forces) errors.push('Missing antagonistic forces');
    if (!blueprint.arc_structure) errors.push('Missing arc structure');
    if (!blueprint.scene_plan || blueprint.scene_plan.length === 0) errors.push('No scenes generated');
    return errors;
}

/**
 * Update wizard progress indicator
 * @param {number} currentPhase - Current phase number (1-5)
 */
export function updateWizardProgress(currentPhase) {
    // Update in wizard modal if active - use stored popup reference
    const wizardPopup = window.storyModeWizardPopup;
    if (wizardPopup && wizardPopup.content) {
        const progressContainer = wizardPopup.content.querySelector('#storymode-wizard-progress-container');
        if (progressContainer) {
            progressContainer.innerHTML = buildWizardProgressHTML(currentPhase);
        }
    }
}

/**
 * Update wizard preview panel
 * @param {Object} partialBlueprint - Partial blueprint from completed phases
 * @param {number} currentPhase - Current phase number
 */
export function updateWizardPreview(partialBlueprint, currentPhase) {
    // Update in wizard modal if active - use stored popup reference
    const wizardPopup = window.storyModeWizardPopup;
    if (wizardPopup && wizardPopup.content) {
        const previewContainer = wizardPopup.content.querySelector('#storymode-wizard-preview-container');
        if (previewContainer) {
            previewContainer.innerHTML = buildWizardPreview(partialBlueprint, currentPhase);
        }
    }
}

/**
 * Add a status message to the wizard status log
 * @param {string} message - The status message to add
 * @param {string} type - Message type: 'info', 'success', 'warning', 'error'
 */
export function addWizardStatusLog(message, type = 'info') {
    const wizardPopup = window.storyModeWizardPopup;
    if (!wizardPopup || !wizardPopup.content) return;

    const logContainer = wizardPopup.content.querySelector('#storymode-wizard-status-log');
    const logContent = wizardPopup.content.querySelector('#storymode-wizard-status-log-content');

    if (!logContainer || !logContent) return;

    // Show the log container if it's hidden
    if (logContainer.style.display === 'none') {
        logContainer.style.display = 'block';
    }

    // Icon and color based on type
    const icons = {
        info: { icon: 'fa-circle-notch fa-spin', color: '#3b82f6' }, // Blue
        success: { icon: 'fa-check-circle', color: '#10b981' }, // Green
        warning: { icon: 'fa-exclamation-triangle', color: '#f59e0b' }, // Orange
        error: { icon: 'fa-times-circle', color: '#ef4444' } // Red
    };

    const style = icons[type] || icons.info;
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const logEntry = document.createElement('div');
    logEntry.style.cssText = `
        padding: 4px 0;
        color: ${style.color};
        line-height: 1.4;
    `;
    logEntry.innerHTML = `
        <span style="color: var(--grey70); font-size: 0.85em;">[${timestamp}]</span>
        <i class="fa-solid ${style.icon}" style="margin: 0 6px; width: 14px; color: ${style.color};"></i>
        <span style="color: var(--grey160);">${escapeHtml(message)}</span>
    `;

    logContent.appendChild(logEntry);

    // Auto-scroll to bottom
    logContainer.scrollTop = logContainer.scrollHeight;
}

/**
 * Get phase message for display
 * @param {number} phase - Phase number (1-5)
 * @returns {string} Phase message
 */
export function getPhaseMessage(phase) {
    return BlueprintModule.PHASE_CONFIG[phase]?.description || 'Processing...';
}

/**
 * Handle auto-cover generation for the wizard
 * @param {Object} blueprint - The generated blueprint
 * @param {HTMLElement} statusElement - Status element to update
 * @param {HTMLElement} previewContainer - Preview container to update
 * @returns {Promise<void>}
 */
export async function handleWizardAutoCover(blueprint, statusElement, previewContainer) {
    // Auto-generate cover image if enabled
    const coverGenSettings = extension_settings[MODULE_NAME]?.blueprintSettings?.coverGeneration;
    if (!coverGenSettings?.autoGenerate) return;

    if (statusElement) {
        statusElement.innerHTML = '<span style="color: #3b82f6;"><i class="fa-solid fa-paintbrush fa-spin"></i> Generating cover image...</span>';
    }

    // Sync LLM-generated cover prompt if available
    if (blueprint.cover_prompt && (!blueprint.metadata || !blueprint.metadata.coverPrompt)) {
        blueprint.metadata = blueprint.metadata || {};
        // Create a basic prompt object structure compatible with SD
        blueprint.metadata.coverPrompt = {
            positive: blueprint.cover_prompt,
            negative: 'text, watermark, signature, blurry, low quality, distorted, ugly, bad anatomy, extra limbs, cropped, worst quality, low resolution',
            style: 'digital art',
            technical: { aspect_ratio: '2:3' }
        };
    }

    try {
        const coverResult = await generateCoverFromSD(blueprint);
        if (coverResult.success && coverResult.imageUrl) {
            await addCoverToGallery(blueprint, coverResult.imageUrl, blueprint.metadata.coverPrompt);
            setCoverImageUrl(blueprint, coverResult.imageUrl);

            // Update wizard preview if it exists
            if (previewContainer) {
                // Re-render preview to show new cover
                previewContainer.innerHTML = buildWizardPreview(blueprint, 5);
            }

            if (statusElement) {
                statusElement.innerHTML = '<span style="color: #10b981;">✓ Blueprint and cover generated successfully!</span>';
            }
        } else {
            toastr.warning('Blueprint generated, but cover generation failed: ' + (coverResult.error || 'Unknown error'));
            if (statusElement) {
                statusElement.innerHTML = '<span style="color: #f59e0b;">⚠ Blueprint generated, but cover generation failed.</span>';
            }
        }
    } catch (coverError) {
        console.error('[Story Mode] Cover generation error in wizard:', coverError);
        toastr.warning('Blueprint generated, but cover generation encountered an error.');
    }
}

/**
 * Launch the wizard modal for phased blueprint generation
 * This creates a dedicated modal window for the wizard UI instead of embedding it in the settings dialog
 * @param {jQuery} content - The settings dialog content element
 * @param {Object} callbacks - Callback functions for library operations
 * @param {Function} callbacks.returnToLibraryIfNeeded - Return to library view if appropriate
 * @param {Function} callbacks.loadBlueprintsForFolder - Load blueprints for a folder
 */
export async function launchWizardModal(content, callbacks = {}) {
    const { returnToLibraryIfNeeded, loadBlueprintsForFolder } = callbacks;

    // Get story types and author styles from state manager
    const storyTypes = getStoryTypes();
    const authorStyles = getAuthorStyles();

    // Show cancel button, hide generate button
    content.find('#blueprint_generate_btn').hide();
    content.find('#blueprint_cancel_generation_btn').show();

    // Gather form data and create wizard modal
    const config = getWizardFormData(content);

    // Validation failed - restore UI and abort
    if (!config) {
        content.find('#blueprint_generate_btn').show();
        content.find('#blueprint_cancel_generation_btn').hide();
        return;
    }

    // Confirm custom scene count if provided
    const customRoundsValue = content.find('#blueprint_custom_rounds').val();
    if (customRoundsValue && customRoundsValue.trim() !== '') {
        const sceneCount = parseInt(customRoundsValue);
        const confirmMessage = `Generate a Scenario with ${sceneCount} scene${sceneCount !== 1 ? 's' : ''}?`;
        const result = await callGenericPopup(
            confirmMessage,
            POPUP_TYPE.CONFIRM,
            '',
            { okButton: 'Generate', cancelButton: 'Cancel' }
        );

        if (result !== POPUP_RESULT.AFFIRMATIVE) {
            // User cancelled - restore UI
            content.find('#blueprint_generate_btn').show();
            content.find('#blueprint_cancel_generation_btn').hide();
            return;
        }
    }

    const wizardHtml = createWizardModalHtml();

    // Create wizard modal
    const wizardPopup = new Popup(wizardHtml, POPUP_TYPE.TEXT, 'Blueprint Wizard', {
        okButton: false,
        cancelButton: false,
        wide: true,
        allowVerticalScrolling: true,
    });

    // Show the popup (fire and forget - don't await, we'll close it manually later)
    wizardPopup.show();

    // Store the popup reference for later use
    window.storyModeWizardPopup = wizardPopup;

    // Get reference to the popup content element
    const popupElement = wizardPopup.content;

    // Initialize with Phase 1 as current (generation starts immediately)
    const progressContainer = popupElement.querySelector('#storymode-wizard-progress-container');
    const previewContainer = popupElement.querySelector('#storymode-wizard-preview-container');

    if (progressContainer) {
        progressContainer.innerHTML = buildWizardProgressHTML(1); // Start with Phase 1 as current
    }
    if (previewContainer) {
        previewContainer.innerHTML = buildWizardPreview({}, 0);
    }

    // Store for tracking generation state
    wizardPopup.isCancelled = false;
    let failedAtPhase = null;
    let partialBlueprintForRetry = null;
    let requestForRetry = null;
    let lastRawResponse = null;
    let phaseTokensUsed = {}; // Track token limits used per phase
    const MAX_PHASE_TOKENS = 65536; // Maximum safe token limit

    // Phase name lookup (shared across functions)
    const phaseNames = ['', 'Foundation', 'Characters', 'Scenes', 'Resolutions'];

    // Helper: Show error state in wizard
    const showWizardError = (errorResult) => {
        const phase = errorResult.phase || failedAtPhase;
        const message = errorResult.error || errorResult.message || 'Unknown error';
        const errorDetailsContainer = popupElement.querySelector('#storymode-wizard-error-details');
        const errorMsg = popupElement.querySelector('#storymode-wizard-error-message');
        const errorPhaseText = popupElement.querySelector('#storymode-wizard-error-phase');
        const retryBtn = popupElement.querySelector('#storymode-wizard-retry-btn');
        const showResponseBtn = popupElement.querySelector('#storymode-wizard-show-response-btn');

        // Store token usage from error result
        if (errorResult.phaseTokensUsed) {
            phaseTokensUsed[phase] = errorResult.phaseTokensUsed;
        }

        if (errorDetailsContainer) {
            errorDetailsContainer.style.display = 'block';
            if (errorMsg) errorMsg.textContent = message;
            if (errorPhaseText) {
                const stagedInfo = errorResult.stagedMeta;
                if (stagedInfo) {
                    const completedCount = stagedInfo.completedScenes?.length || 0;
                    errorPhaseText.textContent = `Staged generation failed at batch ${stagedInfo.failedBatch + 1} (${completedCount}/${stagedInfo.totalScenes} scenes complete). Partial blueprint auto-saved.`;
                } else {
                    errorPhaseText.textContent = `Error occurred during ${phaseNames[phase]}. Check the console for details.`;
                }
            }
            if (showResponseBtn && (errorResult.rawResponse || lastRawResponse)) {
                showResponseBtn.style.display = 'inline-block';
                if (errorResult.rawResponse) lastRawResponse = errorResult.rawResponse;
            }
        }
        if (retryBtn) {
            retryBtn.style.display = 'inline-block';
        }
    };

    // Clean up function to restore button states and remove event listeners
    function cleanupWizard() {
        // Remove event listener for phase updates
        if (wizardPopup._cleanup) {
            wizardPopup._cleanup();
        }
        // Hide cancel button, show generate button
        content.find('#blueprint_cancel_generation_btn').hide();
        content.find('#blueprint_generate_btn').show();
        // Clear the global reference
        window.storyModeWizardPopup = null;
    }

    // Set up cancel button handler immediately
    const cancelBtn = popupElement.querySelector('#storymode-wizard-cancel-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', async function () {
            // If generation is complete (finishBtn is visible), this works as "Discard & Close"
            const finishBtn = popupElement.querySelector('#storymode-wizard-finish-btn');
            const isComplete = finishBtn && window.getComputedStyle(finishBtn).display !== 'none';

            if (isComplete) {
                const result = await callGenericPopup(
                    'Are you sure you want to discard this blueprint and close?',
                    POPUP_TYPE.CONFIRM,
                    '',
                    { okButton: 'Discard', cancelButton: 'Keep' }
                );
                if (result === POPUP_RESULT.AFFIRMATIVE) {
                    cleanupWizard();
                    if (returnToLibraryIfNeeded) returnToLibraryIfNeeded(content);
                    wizardPopup.complete(POPUP_RESULT.CANCELLED);
                }
            } else if (!wizardPopup.isCancelled) {
                const result = await callGenericPopup(
                    'Are you sure you want to cancel blueprint generation?',
                    POPUP_TYPE.CONFIRM,
                    '',
                    { okButton: 'Cancel Generation', cancelButton: 'Continue' }
                );
                if (result === POPUP_RESULT.AFFIRMATIVE) {
                    wizardPopup.isCancelled = true;
                    cleanupWizard();
                    if (returnToLibraryIfNeeded) returnToLibraryIfNeeded(content);
                    wizardPopup.complete(POPUP_RESULT.CANCELLED);
                }
            }
        });
    }

    // Track staged retry metadata
    let stagedMetaForRetry = null;

    // Set up retry button handler
    const retryBtn = popupElement.querySelector('#storymode-wizard-retry-btn');
    if (retryBtn) {
        retryBtn.addEventListener('click', async function () {
            if (!failedAtPhase || !requestForRetry) {
                console.error('[Story Mode] Cannot retry: missing phase or request data');
                return;
            }

            // Hide error UI
            popupElement.querySelector('#storymode-wizard-error-details').style.display = 'none';
            retryBtn.style.display = 'none';

            // Preserve existing phase overrides and update token count for retry
            const existingOverrides = requestForRetry.phaseOverrides || {};

            // Determine base token count: use override if user set one, otherwise use default
            const phaseConfig = PHASE_CONFIG[failedAtPhase];
            const originalOverride = existingOverrides[failedAtPhase];
            const baseTokens = originalOverride?.maxTokens || phaseConfig?.maxTokens || 8192;

            // Double the token count for retry (capped at maximum)
            const newTokens = Math.min(baseTokens * 2, MAX_PHASE_TOKENS);

            // Update override while preserving profileId
            const updatedOverrides = {
                ...existingOverrides,
                [failedAtPhase]: {
                    profileId: originalOverride?.profileId !== undefined ? originalOverride.profileId : null,
                    maxTokens: newTokens
                }
            };

            // Show notification
            const phaseName = phaseConfig?.name || `Phase ${failedAtPhase}`;
            if (newTokens >= MAX_PHASE_TOKENS) {
                toastr.warning(`${phaseName} token limit at maximum (${MAX_PHASE_TOKENS})`);
            } else {
                toastr.info(`Retrying ${phaseName} with ${newTokens} tokens (doubled from ${baseTokens})`);
            }

            // Reset error state
            const retryPhase = failedAtPhase;
            failedAtPhase = null;

            try {
                let retryResult;

                // Distinguish staged vs standard Phase 3 retry
                if (retryPhase === 3 && stagedMetaForRetry) {
                    retryResult = await BlueprintModule.generateBlueprint(
                        requestForRetry,
                        storyTypes,
                        authorStyles,
                        {
                            phased: true,
                            startPhase: 3,
                            partialBlueprint: partialBlueprintForRetry,
                            phaseOverrides: updatedOverrides,
                            stagedRetry: { stagedMeta: stagedMetaForRetry },
                        }
                    );
                } else {
                    retryResult = await BlueprintModule.generateBlueprint(
                        requestForRetry,
                        storyTypes,
                        authorStyles,
                        {
                            phased: true,
                            startPhase: retryPhase,
                            partialBlueprint: partialBlueprintForRetry,
                            phaseOverrides: updatedOverrides,
                        }
                    );
                }

                if (wizardPopup.isCancelled || !retryResult.success) {
                    if (!retryResult.success) {
                        failedAtPhase = retryPhase;
                        stagedMetaForRetry = retryResult.stagedMeta || null;
                        showWizardError(retryResult);
                    }
                    return;
                }

                // Success - update UI
                stagedMetaForRetry = null;
                const blueprint = retryResult.blueprint;
                popupElement.querySelector('#storymode-wizard-progress-container').innerHTML = buildWizardProgressHTML(5);
                popupElement.querySelector('#storymode-wizard-preview-container').innerHTML = buildWizardPreview(blueprint, 5);
                popupElement.querySelector('#storymode-wizard-cancel-btn').style.display = 'none';
                popupElement.querySelector('#storymode-wizard-finish-btn').style.display = 'inline-block';
                popupElement.blueprintResult = retryResult;
            } catch (retryError) {
                console.error('[Story Mode] Retry error:', retryError);
                failedAtPhase = retryPhase;
                showWizardError({ error: retryError.message, phase: retryPhase });
            }
        });
    }

    // Set up show response button handler
    const showResponseBtn = popupElement.querySelector('#storymode-wizard-show-response-btn');
    if (showResponseBtn) {
        showResponseBtn.addEventListener('click', function () {
            if (lastRawResponse) {
                const responseHtml = `<textarea style="width: 100%; min-height: 400px; font-family: monospace; font-size: 0.85rem; padding: 10px; color: var(--black);" readonly>${escapeHtml(lastRawResponse)}</textarea>`;
                new Popup(responseHtml, POPUP_TYPE.TEXT, 'LLM Raw Response', {
                    okButton: true,
                    cancelButton: false,
                    wide: true,
                }).show();
            }
        });
    }

    // Listen for phase updates to show ending preview and sub-progress
    const handlePhaseUpdate = (data) => {
        const { phase, blueprint, subProgress } = data;

        // Update progress indicator with sub-progress during Phase 3
        if (phase === 3 && subProgress) {
            const progressCont = popupElement.querySelector('#storymode-wizard-progress-container');
            if (progressCont) {
                progressCont.innerHTML = buildWizardProgressHTML(3, subProgress);
            }
            // Incrementally update preview during staged batches
            if (subProgress.subPhase === 'batch' && blueprint?.scene_plan) {
                const previewCont = popupElement.querySelector('#storymode-wizard-preview-container');
                if (previewCont) {
                    previewCont.innerHTML = buildWizardPreview(blueprint, 3);
                }
            }
        }

        // Show ending preview when Phase 4 data arrives
        if (phase === 4 && blueprint?.primary_ending) {
            const resolutionContainer = popupElement.querySelector('#storymode-resolution-selection-container');
            if (resolutionContainer) {
                resolutionContainer.style.display = 'block';
                resolutionContainer.innerHTML = buildPrimaryEndingDisplay(
                    blueprint.primary_ending,
                    blueprint.alternate_endings || []
                );
            }
        }
    };

    // Listen for detailed status updates from generation process
    const handleGenerationStatus = (data) => {
        const { type, message, phase, phaseName, details } = data;

        // Map status type to log type
        const logType = type === 'error' ? 'error' :
                       type === 'success' ? 'success' :
                       type === 'warning' ? 'warning' : 'info';

        // Add to status log
        addWizardStatusLog(message, logType);
    };

    // Attach listeners using SillyTavern's eventSource
    eventSource.on('STORY_MODE_PHASE_UPDATE', handlePhaseUpdate);
    eventSource.on('STORY_MODE_GENERATION_STATUS', handleGenerationStatus);

    // Store cleanup function to remove listeners later
    const cleanup = () => {
        try {
            if (typeof eventSource.off === 'function') {
                eventSource.off('STORY_MODE_PHASE_UPDATE', handlePhaseUpdate);
                eventSource.off('STORY_MODE_GENERATION_STATUS', handleGenerationStatus);
            } else if (typeof eventSource.removeListener === 'function') {
                eventSource.removeListener('STORY_MODE_PHASE_UPDATE', handlePhaseUpdate);
                eventSource.removeListener('STORY_MODE_GENERATION_STATUS', handleGenerationStatus);
            } else if (typeof eventSource.removeEventListener === 'function') {
                eventSource.removeEventListener('STORY_MODE_PHASE_UPDATE', handlePhaseUpdate);
                eventSource.removeEventListener('STORY_MODE_GENERATION_STATUS', handleGenerationStatus);
            }
        } catch (e) {
            console.warn('[Story Mode] Failed to remove phase update listener:', e);
        }
    };
    wizardPopup._cleanup = cleanup;

    // Register cleanup to run when modal closes
    wizardPopup.dlg.addEventListener('close', function () {
        cleanupWizard();
    }, { once: true });

    try {
        // Call buildBlueprintRequest to get the proper request structure
        const request = BlueprintModule.buildBlueprintRequest(config);

        // Call BlueprintModule.generateBlueprint() with phased mode and phase overrides
        const result = await BlueprintModule.generateBlueprint(request, storyTypes, authorStyles, {
            phased: true,
            phaseOverrides: config.phaseOverrides
        });

        // Check if user cancelled
        if (wizardPopup.isCancelled) {
            return;
        }

        if (result.success) {
            const blueprint = result.blueprint;
            const validationErrors = validateBlueprint(blueprint);

            // Update to show completion or validation errors
            const progressCont = popupElement.querySelector('#storymode-wizard-progress-container');
            const previewCont = popupElement.querySelector('#storymode-wizard-preview-container');
            const actionsContainer = popupElement.querySelector('#storymode-wizard-actions');
            const resolutionContainer = popupElement.querySelector('#storymode-resolution-selection-container');
            const errorDetailsContainer = popupElement.querySelector('#storymode-wizard-error-details');
            const finishBtn = popupElement.querySelector('#storymode-wizard-finish-btn');
            const cancelBtnEl = popupElement.querySelector('#storymode-wizard-cancel-btn');

            if (validationErrors.length > 0) {
                // Show validation warnings but continue with cover generation
                if (progressCont) progressCont.innerHTML = buildWizardProgressHTML(5);
            } else {
                if (progressCont) progressCont.innerHTML = buildWizardProgressHTML(5);
            }

            // Always offer cover generation if we have a cover_prompt (regardless of validation warnings)
            {

                // Success - show completion
                if (progressCont) progressCont.innerHTML = buildWizardProgressHTML(5);
                if (previewCont) previewCont.innerHTML = buildWizardPreview(blueprint, 5);

                // Ask user about cover generation instead of auto-generating
                const coverGenSettings = extension_settings[MODULE_NAME]?.blueprintSettings?.coverGeneration;
                if (coverGenSettings?.autoGenerate && blueprint.cover_prompt) {
                    const coverHtml = `
                        <div style="text-align: center; padding: 10px;">
                            <h3 style="margin-bottom: 15px;">Generate Cover Image?</h3>
                            <p>Would you like to generate a cover image for this blueprint using Stable Diffusion?</p>
                            <p style="font-size: 0.85em; color: #888; margin-top: 10px;">You can always generate or change the cover later from the library.</p>
                        </div>
                    `;
                    const coverConfirm = await callGenericPopup(coverHtml, POPUP_TYPE.CONFIRM, '', {
                        okButton: 'Generate',
                        cancelButton: 'Skip',
                    });

                    if (coverConfirm === POPUP_RESULT.AFFIRMATIVE) {
                        // User wants to generate cover
                        const coverContainer = popupElement.querySelector('#storymode-wizard-cover-container');
                        if (coverContainer) {
                            coverContainer.style.display = 'block';
                            coverContainer.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; gap: 10px;"><i class="fa-solid fa-paintbrush fa-spin" style="color: #3b82f6; font-size: 1.5em;"></i><span style="color: #3b82f6; font-weight: 500;">Generating cover image...</span></div>';
                        }

                        try {
                            // Sync cover prompt if available
                            if (blueprint.cover_prompt && (!blueprint.metadata || !blueprint.metadata.coverPrompt)) {
                                blueprint.metadata = blueprint.metadata || {};
                                blueprint.metadata.coverPrompt = {
                                    positive: blueprint.cover_prompt,
                                    negative: 'text, watermark, signature, blurry, low quality, distorted, ugly, bad anatomy, extra limbs, cropped, worst quality, low resolution',
                                    style: 'digital art',
                                    technical: { aspect_ratio: '2:3' }
                                };
                            }

                            const coverResult = await generateCoverFromSD(blueprint);
                            if (coverResult.success && coverResult.imageUrl) {
                                await addCoverToGallery(blueprint, coverResult.imageUrl, blueprint.metadata.coverPrompt);
                                setCoverImageUrl(blueprint, coverResult.imageUrl);

                                // Hide the loading animation container
                                if (coverContainer) {
                                    coverContainer.style.display = 'none';
                                }

                                // Update the preview to show the cover image (smaller preview only)
                                if (previewCont) {
                                    previewCont.innerHTML = buildWizardPreview(blueprint, 5);
                                }

                                toastr.success('Cover image generated!');
                            } else {
                                if (coverContainer) {
                                    coverContainer.style.display = 'none';
                                }
                                toastr.warning('Cover generation failed: ' + (coverResult.error || 'Unknown error'));
                            }
                        } catch (coverError) {
                            console.error('[Story Mode] Cover generation error:', coverError);
                            if (coverContainer) {
                                coverContainer.style.display = 'none';
                            }
                            toastr.warning('Blueprint generated, but cover generation encountered an error.');
                        }
                    } else {
                        // User skipped cover generation
                    }
                } else {
                    // No cover generation needed
                }

                // Show finish button, hide cancel
                if (actionsContainer) {
                    actionsContainer.style.display = 'block';
                } else {
                    console.error('[Story Mode] Actions container not found!');
                }

                if (cancelBtnEl) {
                    cancelBtnEl.style.display = 'inline-block';
                    cancelBtnEl.innerHTML = '<i class="fa-solid fa-xmark"></i> Discard & Close';
                    cancelBtnEl.title = "Close without saving";
                }
                if (finishBtn) {
                    finishBtn.style.display = 'inline-block';
                    finishBtn.innerHTML = '<i class="fa-solid fa-check"></i> Save & Close';
                }

                // Store the result for the finish button handler
                popupElement.blueprintResult = result;
            }
        } else {
            // Handle generation error
            // Parse error to extract phase information
            let errorPhase = result.phase || null;
            if (!errorPhase && result.error?.includes('Phase ')) {
                const phaseMatch = result.error.match(/Phase (\d)/);
                if (phaseMatch) errorPhase = parseInt(phaseMatch[1]);
            }

            // Store retry state
            failedAtPhase = errorPhase;
            partialBlueprintForRetry = result.partialBlueprint || null;
            requestForRetry = result.request || null;
            stagedMetaForRetry = result.stagedMeta || null;

            // Auto-save partial blueprint on staged failure
            if (result.stagedMeta && partialBlueprintForRetry?.scene_plan?.length) {
                const completedCount = partialBlueprintForRetry.scene_plan.filter(s => s.beats?.length > 0).length;
                const totalCount = partialBlueprintForRetry.scene_plan.length;
                try {
                    await saveCurrentBlueprintToLibrary({
                        title: (partialBlueprintForRetry.blueprint_title || partialBlueprintForRetry.core_premise?.substring(0, 40) || 'Blueprint') +
                            ` (Partial - ${completedCount}/${totalCount} scenes)`,
                        blueprint: partialBlueprintForRetry,
                    });
                    toastr.info(`Partial blueprint auto-saved to library (${completedCount}/${totalCount} scenes complete)`);
                } catch (e) {
                    console.warn('[Story Mode] Failed to auto-save partial:', e);
                }
            }

            // Show error using helper
            showWizardError(result);
            popupElement.querySelector('#storymode-wizard-actions').style.display = 'block';
            popupElement.querySelector('#storymode-wizard-cancel-btn').style.display = 'none';
            popupElement.querySelector('#storymode-wizard-finish-btn').style.display = 'inline-block';
            popupElement.querySelector('#storymode-wizard-finish-btn').textContent = 'Close';
        }
    } catch (error) {
        console.error('[Story Mode] Wizard mode generation error:', error);

        if (wizardPopup.isCancelled) return;

        // Parse error to extract phase information
        let errorPhase = null;
        const errorMessage = error.message || 'Unknown error';
        if (errorMessage.includes('Phase ')) {
            const phaseMatch = errorMessage.match(/Phase (\d)/);
            if (phaseMatch) errorPhase = parseInt(phaseMatch[1]);
        }

        // Store retry state (catch block has no partialBlueprint/request)
        failedAtPhase = errorPhase;
        partialBlueprintForRetry = null;
        requestForRetry = null;

        // Show error using helper
        showWizardError({ error: errorMessage, phase: errorPhase });
        popupElement.querySelector('#storymode-wizard-actions').style.display = 'block';
        popupElement.querySelector('#storymode-wizard-cancel-btn').style.display = 'none';
        popupElement.querySelector('#storymode-wizard-finish-btn').style.display = 'inline-block';
        popupElement.querySelector('#storymode-wizard-finish-btn').textContent = 'Close';
        // No retry button in catch block (missing context)
        popupElement.querySelector('#storymode-wizard-retry-btn').style.display = 'none';
    }

    // Set up finish button handler
    const finishBtn = popupElement.querySelector('#storymode-wizard-finish-btn');
    if (finishBtn) {
        finishBtn.addEventListener('click', async function () {
            const result = popupElement.blueprintResult;
            if (result && result.blueprint) {
                // If there are validation errors, warn user
                if (result.validationErrors && result.validationErrors.length > 0) {
                    const proceed = await callGenericPopup(
                        `The blueprint has some issues:\n\n${result.validationErrors.join('\n')}\n\nDo you still want to save it?`,
                        POPUP_TYPE.CONFIRM,
                        '',
                        { okButton: 'Save Anyway', cancelButton: 'Cancel' }
                    );
                    if (proceed !== POPUP_RESULT.AFFIRMATIVE) {
                        return;
                    }
                }

                // Sync blueprint settings to chat state with confirmation dialog
                const syncResult = await BlueprintModule.syncBlueprintSettings(result.blueprint, true);

                if (!syncResult.confirmed) {
                    toastr.warning('Blueprint generated but not saved. Settings sync was cancelled.');

                    // Return to library if from library context, otherwise go to overview
                    if (returnToLibraryIfNeeded) {
                        if (!returnToLibraryIfNeeded(content)) {
                            content.find('.storymode-blueprint-subtab[data-subtab="overview"]').click();
                        }
                    } else {
                        content.find('.storymode-blueprint-subtab[data-subtab="overview"]').click();
                    }

                    wizardPopup.complete(POPUP_RESULT.CANCELLED);
                    return;
                }

                // Save to library first (doesn't affect current chat state)
                try {
                    await saveCurrentBlueprintToLibrary({
                        title: result.blueprint.blueprint_title || result.blueprint.core_premise?.substring(0, 50),
                        generateCover: false, // Cover already generated if enabled
                        blueprint: result.blueprint // Pass explicit blueprint to avoid race condition
                    });
                } catch (libError) {
                    console.error('[Story Mode] Failed to auto-save to library:', libError);
                    toastr.warning('Blueprint generated but could not be saved to library');
                }

                // Ask user if they want to start the story now
                const startNowHtml = `
                    <h3>Blueprint Generated Successfully!</h3>
                    <p>Your blueprint has been saved to the library.</p>
                    <p><strong>Would you like to start the story now?</strong></p>
                `;

                const startNow = await callGenericPopup(startNowHtml, POPUP_TYPE.CONFIRM, '', {
                    okButton: 'Start Story Now',
                    cancelButton: 'View in Library',
                });

                if (startNow === POPUP_RESULT.AFFIRMATIVE) {
                    // Create run copy and start story
                    const runState = createRunCopy(result.blueprint, 'wizard');
                    await saveBlueprintState(runState);

                    // Handle opening message if present
                    if (result.blueprint.opening_message) {
                        const useSaved = await callGenericPopup(
                            `This blueprint has an opening message:\n\n"${result.blueprint.opening_message.substring(0, 150)}${result.blueprint.opening_message.length > 150 ? '...' : ''}"\n\nWould you like to use it to start the story?`,
                            POPUP_TYPE.CONFIRM
                        );
                        if (useSaved === POPUP_RESULT.AFFIRMATIVE) {
                            await pushStoryMessage(result.blueprint.opening_message);
                            await saveChatConditional();
                        }
                    }

                    toastr.success('Story started from blueprint!', 'Story Mode');
                } else {
                    // Just return to library view
                    if (returnToLibraryIfNeeded) returnToLibraryIfNeeded(content);
                    // Refresh the library grid to show the new blueprint
                    if (loadBlueprintsForFolder) {
                        const activeFolder = content.find('.storymode-folder-item.active').data('folder') || 'all';
                        await loadBlueprintsForFolder(content, activeFolder);
                    }
                    toastr.success('Blueprint saved to library!');
                }
            }

            // Close the wizard modal
            cleanupWizard();
            wizardPopup.complete(POPUP_RESULT.AFFIRMATIVE);
        });
    }
}
