/**
 * Wizard UI Components for Story Mode Extension
 * Phased blueprint generation wizard components
 */

import { escapeHtml } from '../component-system.js';

/**
 * Build wizard progress indicator HTML
 * @param {number} currentPhase - Current phase number (1-5)
 * @param {Object} [subProgress] - Optional sub-progress for Phase 3 staged generation
 * @param {string} [subProgress.subPhase] - 'plan' or 'batch'
 * @param {number} [subProgress.batch] - Current batch index
 * @param {number} [subProgress.total] - Total batches
 * @param {number} [subProgress.completedScenes] - Scenes completed so far
 * @param {number} [subProgress.totalScenes] - Total scenes
 * @returns {string} HTML string for progress indicator
 */
export function buildWizardProgressHTML(currentPhase = 0, subProgress = null) {
    const phases = [
        { number: 1, name: 'Foundation', icon: 'fa-layer-group' },
        { number: 2, name: 'Characters', icon: 'fa-users' },
        { number: 3, name: 'Scenes', icon: 'fa-film' },
        { number: 4, name: 'Resolutions', icon: 'fa-flag-checkered' },
    ];

    const progressItems = phases.map(phase => {
        const isCompleted = currentPhase > phase.number;
        const isCurrent = currentPhase === phase.number;

        const statusClass = isCompleted ? 'completed' : isCurrent ? 'current' : 'pending';
        const iconClass = isCompleted ? 'fa-check' : isCurrent ? 'fa-spinner fa-spin' : phase.icon;

        // Build sub-progress indicator for Phase 3
        let subProgressHtml = '';
        if (phase.number === 3 && isCurrent && subProgress) {
            subProgressHtml = buildPhase3SubProgress(subProgress);
        }

        return `
        <div class="storymode-wizard-progress-item ${statusClass}">
                <div class="storymode-wizard-progress-icon">
                    <i class="fa-solid ${iconClass}"></i>
                </div>
                <div class="storymode-wizard-progress-label">
                    <div class="storymode-wizard-progress-phase">Phase ${phase.number}</div>
                    <div class="storymode-wizard-progress-name">${phase.name}</div>
                    ${subProgressHtml}
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
 * Build sub-progress HTML for Phase 3 staged generation
 * @param {Object} subProgress - Sub-progress data
 * @returns {string} HTML string
 */
function buildPhase3SubProgress(subProgress) {
    if (subProgress.subPhase === 'plan') {
        return '<div class="storymode-wizard-sub-progress" style="font-size: 0.75em; color: var(--grey100); margin-top: 2px;">Generating outlines...</div>';
    }
    if (subProgress.subPhase === 'batch' && subProgress.total > 0) {
        const batchNum = (subProgress.batch ?? 0) + 1;
        const completed = subProgress.completedScenes || 0;
        const total = subProgress.totalScenes || 0;
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
        const barWidth = Math.max(5, pct);
        return `
            <div class="storymode-wizard-sub-progress" style="font-size: 0.75em; color: var(--grey100); margin-top: 2px;">
                Batch ${batchNum}/${subProgress.total} (${completed}/${total} scenes)
                <div style="background: var(--black30a); border-radius: 3px; height: 4px; width: 80px; margin-top: 2px; overflow: hidden;">
                    <div style="background: var(--sm-accent, #3b82f6); height: 100%; width: ${barWidth}%; transition: width 0.3s ease;"></div>
                </div>
            </div>`;
    }
    return '';
}

/**
 * Build wizard preview panel HTML
 * Shows cumulative content from completed phases
 * @param {Object} partialBlueprint - Partial blueprint from completed phases
 * @param {number} currentPhase - Current phase number
 * @returns {string} HTML string for preview panel
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

    return `
        <div class="storymode-wizard-preview">
            ${statusContent}
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

// ============================================================================
// INTERNAL PREVIEW BUILDERS (for wizard phases)
// ============================================================================

/**
 * Build HTML for Phase 1: Foundation
 * @param {Object} bp - Partial blueprint
 * @returns {string|null} HTML string or null if no data
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
 * @param {Object} bp - Partial blueprint
 * @returns {string|null} HTML string or null if no data
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
 * @param {Object} bp - Partial blueprint
 * @returns {string|null} HTML string or null if no data
 */
function buildScenesPreview(bp) {
    if (!bp.scene_plan?.length) return null;

    // Count completed (has beats) vs outline-only scenes
    const completedCount = bp.scene_plan.filter(s => s.beats?.length > 0).length;
    const totalCount = bp.scene_plan.length;
    const isStaged = completedCount < totalCount && completedCount > 0;

    const scenes = bp.scene_plan.slice(0, 5).map(s => {
        const isOutline = !s.beats || s.beats.length === 0;
        const suffix = isOutline && isStaged ? ' <em style="color: var(--grey70);">(outline)</em>' : '';
        const icon = isOutline && isStaged ? 'fa-circle-dot' : 'fa-check-circle';
        const color = isOutline && isStaged ? 'var(--grey70)' : 'var(--sm-accent, #10b981)';
        return `<li><i class="fa-solid ${icon}" style="color: ${color}; font-size: 0.8em; margin-right: 4px;"></i>${escapeHtml(s.title || 'Untitled')} (${escapeHtml(s.phase || 'Unknown')})${suffix}</li>`;
    }).join('');
    const moreCount = Math.max(0, totalCount - 5);

    const statusText = isStaged
        ? `${completedCount}/${totalCount} scenes detailed, ${totalCount - completedCount} outlines pending.`
        : `${totalCount} scenes generated.`;

    return `
        <div class="storymode-wizard-preview-section">
            <h4><i class="fa-solid fa-film"></i> Scene Plan</h4>
            <p>${statusText}</p>
            <ul>
                ${scenes}
                ${moreCount > 0 ? `<li><em>...and ${moreCount} more</em></li>` : ''}
            </ul>
        </div>
        `;
}

/**
 * Build HTML for Phase 4: Resolutions
 * NOTE: Detailed ending display is shown in a separate container
 * This just shows a minimal indicator in the preview
 * @param {Object} bp - Partial blueprint
 * @returns {string|null} HTML string or null if no data
 */
function buildResolutionsPreview(bp) {
    if (!bp.primary_ending?.title) return null;
    return `
        <div class="storymode-wizard-preview-section">
            <h4><i class="fa-solid fa-flag-checkered"></i> Story Ending</h4>
            <p><em>Ending generated: ${escapeHtml(bp.primary_ending.title)}</em></p>
        </div>
        `;
}

/**
 * Build HTML for cover image preview (if available)
 * Displays cover in portrait aspect ratio (3:4)
 * @param {Object} bp - Partial blueprint
 * @returns {string|null} HTML string or null if no cover
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
