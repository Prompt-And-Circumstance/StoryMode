/**
 * Miscellaneous Components for Story Mode Extension
 * Additional tab content and utility components
 */

import { extension_settings } from '/scripts/extensions.js';
import { MODULE_NAME, getChatStoryState } from '../../core/state-manager.js';

/**
 * Build the Generate/Load tab content.
 * Now redirects to the "Current Scenario" tab for blueprint operations.
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
<span class="storymode-toggle-label">Enable Scenario Blueprints</span>
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
<h4 class="storymode-card-title">Scenario Blueprint Settings</h4>
<div class="storymode-toggle">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Enable Scenario Blueprints</span>
<span class="storymode-toggle-description">Use LLM-generated story structure</span>
</div>
<label class="storymode-switch">
<input type="checkbox" id="blueprint_enabled" ${settings.blueprintSettings?.enabled ? 'checked' : ''}>
<span class="storymode-switch-slider"></span>
</label>
</div>
</div>
        <div class="storymode-info-box">
            <p><strong>Note:</strong> Scenario blueprint generation and import have been moved to the <strong>Current Scenario</strong> tab.</p>
            <p class="storymode-form-hint">Click the "Current Scenario" tab above to access scenario blueprint generation, or to load one from JSON.</p>
        </div>
    `;
}
