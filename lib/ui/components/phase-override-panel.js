/**
 * Phase Override Panel Component
 * Provides per-phase API profile and token limit overrides for blueprint generation
 */

import { PHASE_CONFIG } from '../../core/constants.js';
import { escapeHtml } from '../component-system.js';
import { createHelpIcon } from './helpers.js';

/**
 * Phase metadata for display and configuration
 */
const PHASE_METADATA = {
    1: {
        icon: '🏛️',
        description: 'Core premise, setting, antagonist, arc structure, tone'
    },
    2: {
        icon: '👥',
        description: 'Protagonist group and character arcs'
    },
    3: {
        icon: '🎬',
        description: 'Complete scene plan with beats'
    },
    4: {
        icon: '🎭',
        description: 'Endings, title, cover prompt, opening message'
    }
};

/**
 * Build profile dropdown options HTML
 * @param {Array<Object>} profiles - Connection Manager profiles
 * @param {string|null} selectedProfileId - Currently selected profile ID
 * @returns {string} HTML option elements
 */
function buildProfileOptions(profiles, selectedProfileId) {
    const options = [];

    // Default API option (uses generateRaw, bypasses presets)
    options.push(`<option value="">Main API (no preset)</option>`);

    // Connection Manager profiles
    for (const profile of profiles) {
        const displayName = profile.model
            ? `${escapeHtml(profile.name)} (${escapeHtml(profile.model)})`
            : escapeHtml(profile.name);
        const selected = profile.id === selectedProfileId ? 'selected' : '';
        options.push(`<option value="${escapeHtml(profile.id)}" ${selected}>${displayName}</option>`);
    }

    return options.join('\n');
}

/**
 * Build a single phase row in the override table
 * @param {number|string} phaseKey - Phase number (1-4) or 'openingMessage'
 * @param {Object} profiles - Available Connection Manager profiles
 * @param {string|null} defaultProfileId - Default profile ID from settings
 * @returns {string} HTML table row
 */
function buildPhaseRow(phaseKey, profiles, defaultProfileId) {
    const phaseConfig = PHASE_CONFIG[phaseKey];
    const metadata = PHASE_METADATA[phaseKey];

    const phaseName = phaseConfig.name;
    const phaseIcon = metadata.icon;
    const phaseDesc = metadata.description;
    const defaultTokens = phaseConfig.maxTokens;

    return `
        <tr class="phase-override-row" data-phase="${escapeHtml(String(phaseKey))}">
            <td class="phase-name-cell" style="text-align: right; padding-right: 16px;">
                <div style="display: inline-block; text-align: left;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span class="phase-icon" title="${escapeHtml(phaseDesc)}">${phaseIcon}</span>
                        <strong>${escapeHtml(`${phaseKey}. ${phaseName}`)}</strong>
                    </div>
                    <div><small style="color: var(--SmartThemeQuoteColor);">${escapeHtml(phaseDesc)}</small></div>
                </div>
            </td>
            <td class="phase-profile-cell">
                <select
                    id="phase_${phaseKey}_profile"
                    class="storymode-select phase-profile-select text_pole"
                    data-phase="${escapeHtml(String(phaseKey))}"
                >
                    ${buildProfileOptions(profiles, defaultProfileId)}
                </select>
            </td>
            <td class="phase-tokens-cell">
                <input
                    type="number"
                    id="phase_${phaseKey}_tokens"
                    class="phase-tokens-input text_pole"
                    data-phase="${escapeHtml(String(phaseKey))}"
                    value="${defaultTokens}"
                    min="1024"
                    max="65536"
                    step="1024"
                    placeholder="${defaultTokens}"
                    style="width: 100px;"
                />
            </td>
            <td class="phase-status-cell">
                <span class="phase-status-indicator" data-phase="${escapeHtml(String(phaseKey))}">
                    <i class="fa-solid fa-check" style="color: var(--SmartThemeEmColor);"></i>
                    <span class="status-text">Default</span>
                </span>
            </td>
        </tr>
    `;
}

/**
 * Build HTML for the phase override panel
 * @param {Array<Object>} profiles - Available Connection Manager profiles
 * @param {string|null} defaultProfileId - Default profile ID from blueprint settings
 * @returns {string} HTML string for the collapsible panel
 */
export function buildPhaseOverridePanel(profiles = [], defaultProfileId = null) {
    const defaultProfile = profiles.find(p => p.id === defaultProfileId);
    const defaultProfileName = defaultProfile?.name || 'Main API';

    return `
        <div class="inline-drawer" id="phase_override_drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <h4 class="storymode-section-title" style="margin: 0; font-size: 0.9em;"><i class="fa-solid fa-sliders"></i> Generation Settings</h4>
                <div class="inline-drawer-icon fa-solid interactable down fa-circle-chevron-down" tabindex="0" role="button"></div>
            </div>

            <div class="inline-drawer-content" style="display: none;">
                <div style="padding: 12px 16px; background: var(--black30a); border-radius: 8px 8px 0 0; margin-bottom: 8px;">
                    <div style="color: var(--SmartThemeBodyColor); font-size: 0.9em; line-height: 1.5;">
                        <div>Override API profile and token limits for each phase.</div>
                        <div style="margin-top: 4px;">Default profile: <strong>${escapeHtml(defaultProfileName)}</strong></div>
                        <div style="margin-top: 8px; color: var(--SmartThemeQuoteColor); font-style: italic;">
                            If you are having trouble generating a blueprint, try changing the API to Main API.
                        </div>
                    </div>
                </div>
                <table class="storymode-table phase-override-table" style="width: 100%; border-collapse: collapse; margin-top: 0;">
                    <thead>
                        <tr style="background: var(--black50a);">
                            <th style="padding: 10px; text-align: right; width: 25%;">Phase</th>
                            <th style="padding: 10px; text-align: left; width: 40%;">API Profile</th>
                            <th style="padding: 10px; text-align: left; width: 20%;">Max Tokens</th>
                            <th style="padding: 10px; text-align: left; width: 15%;">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${buildPhaseRow(1, profiles, defaultProfileId)}
                        ${buildPhaseRow(2, profiles, defaultProfileId)}
                        ${buildPhaseRow(3, profiles, defaultProfileId)}
                        ${buildPhaseRow(4, profiles, defaultProfileId)}
                    </tbody>
                </table>

                <div class="phase-override-footer" style="
                    padding: 12px 16px;
                    background: var(--black30a);
                    border-top: 1px solid var(--SmartThemeBorderColor);
                    display: flex;
                    justify-content: flex-end;
                    border-radius: 0 0 8px 8px;
                ">
                    <button
                        id="phase_override_reset"
                        class="menu_button"
                        style="padding: 6px 16px;"
                    >
                        <i class="fa-solid fa-rotate-left"></i> Reset to Defaults
                    </button>
                </div>
            </div>
        </div>
    `;
}

/**
 * Update status indicators based on current form values
 * @param {jQuery} content - Form container element
 * @param {string|null} defaultProfileId - Default profile ID
 */
export function updatePhaseStatusIndicators(content, defaultProfileId) {
    const phases = [1, 2, 3, 4];

    for (const phase of phases) {
        const phaseConfig = PHASE_CONFIG[phase];
        const defaultTokens = phaseConfig.maxTokens;

        const profileSelect = content.find(`#phase_${phase}_profile`);
        const tokensInput = content.find(`#phase_${phase}_tokens`);
        const statusIndicator = content.find(`.phase-status-indicator[data-phase="${phase}"]`);

        if (!profileSelect.length || !statusIndicator.length) continue;

        const currentProfile = profileSelect.val() || '';
        const currentTokens = parseInt(tokensInput.val(), 10) || defaultTokens;

        // Check if overridden
        const isProfileOverridden = currentProfile !== (defaultProfileId || '');
        const isTokensOverridden = currentTokens !== defaultTokens;
        const isOverridden = isProfileOverridden || isTokensOverridden;

        if (isOverridden) {
            statusIndicator.html(`
                <i class="fa-solid fa-circle" style="color: orange; font-size: 0.7em;"></i>
                <span class="status-text">Overridden</span>
            `);
        } else {
            statusIndicator.html(`
                <i class="fa-solid fa-check" style="color: var(--SmartThemeEmColor);"></i>
                <span class="status-text">Default</span>
            `);
        }
    }
}

/**
 * Reset all phase overrides to defaults
 * @param {jQuery} content - Form container element
 * @param {string|null} defaultProfileId - Default profile ID
 */
export function resetPhaseOverrides(content, defaultProfileId) {
    const phases = [1, 2, 3, 4];

    // Reset all phases
    for (const phase of phases) {
        const phaseConfig = PHASE_CONFIG[phase];
        content.find(`#phase_${phase}_profile`).val(defaultProfileId || '');
        content.find(`#phase_${phase}_tokens`).val(phaseConfig.maxTokens);
    }

    // Update status indicators
    updatePhaseStatusIndicators(content, defaultProfileId);

    toastr.info('Phase overrides reset to defaults');
}
