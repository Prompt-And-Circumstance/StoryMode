import { getChatStoryState } from '../core/state-manager.js';
import { escapeHtml } from './component-system.js';
import { createThemedPopout } from './controller-panel-structure.js';

/**
 * Build epilogue/summary section HTML
 */
function buildTextSection(icon, title, data) {
    const timestamp = data.timestamp ? new Date(data.timestamp).toLocaleString() : 'Unknown';
    return `
        <div class="storymode-arc-history-section">
            <div class="storymode-arc-history-header">
                <h4><i class="fa-solid fa-${icon}"></i> ${title}</h4>
                <span class="storymode-arc-history-timestamp">${escapeHtml(timestamp)}</span>
            </div>
            <div class="storymode-arc-history-content">
                ${escapeHtml(data.text)}
            </div>
        </div>
    `;
}

/**
 * Build themes list HTML
 */
function buildThemesHtml(themes) {
    if (!themes?.length) return '';
    return `
        <div class="storymode-next-adventure-subsection">
            <h5><i class="fa-solid fa-lightbulb"></i> Themes for Continuation</h5>
            <ul class="storymode-theme-list">
                ${themes.map(theme => `
                    <li>
                        <strong>${escapeHtml(theme.title)}</strong> – ${escapeHtml(theme.description)}
                    </li>
                `).join('')}
            </ul>
        </div>
    `;
}

/**
 * Build scenario card HTML
 */
function buildScenarioCard(scenario, idx) {
    const hooksHtml = scenario.hooks?.length ? `
        <div class="storymode-scenario-hooks">
            <strong>Hooks:</strong>
            <ul>
                ${scenario.hooks.map(hook => `<li>${escapeHtml(hook)}</li>`).join('')}
            </ul>
        </div>
    ` : '';

    return `
        <div class="storymode-next-adventure-option">
            <div class="storymode-scenario-header">
                <span class="storymode-scenario-number">${idx + 1}</span>
                <h6>${escapeHtml(scenario.title)}</h6>
                ${scenario.tone ? `<span class="storymode-tone-badge">${escapeHtml(scenario.tone)}</span>` : ''}
            </div>
            <p class="storymode-scenario-premise">${escapeHtml(scenario.premise)}</p>
            ${hooksHtml}
        </div>
    `;
}

/**
 * Build scenarios section HTML
 */
function buildScenariosHtml(scenarios) {
    if (!scenarios?.length) return '';
    return `
        <div class="storymode-next-adventure-subsection">
            <h5><i class="fa-solid fa-masks-theater"></i> Scenario Options</h5>
            <div class="storymode-scenario-cards">
                ${scenarios.map((scenario, idx) => buildScenarioCard(scenario, idx)).join('')}
            </div>
        </div>
    `;
}

/**
 * Build next adventure section HTML
 */
function buildNextAdventureSection(data) {
    const timestamp = data.timestamp ? new Date(data.timestamp).toLocaleString() : 'Unknown';
    const themesHtml = buildThemesHtml(data.themes);
    const scenariosHtml = buildScenariosHtml(data.scenarios);

    return `
        <div class="storymode-arc-history-section">
            <div class="storymode-arc-history-header">
                <h4><i class="fa-solid fa-route"></i> What's Next</h4>
                <span class="storymode-arc-history-timestamp">${escapeHtml(timestamp)}</span>
            </div>
            <div class="storymode-arc-history-content">
                ${themesHtml}
                ${scenariosHtml}
            </div>
        </div>
    `;
}

/**
 * Show the Arc History popup with saved epilogue, summary, and next adventure content
 */
function showArcHistoryPopup() {
    const chatState = getChatStoryState();

    if (!chatState.savedEpilogue && !chatState.savedSummary && !chatState.savedNextAdventure) {
        if (window.toastr) toastr.info('No arc completion content available yet.');
        return;
    }

    let sectionsHtml = '';
    if (chatState.savedEpilogue) sectionsHtml += buildTextSection('scroll', 'Epilogue', chatState.savedEpilogue);
    if (chatState.savedSummary) sectionsHtml += buildTextSection('file-lines', 'Summary', chatState.savedSummary);
    if (chatState.savedNextAdventure) sectionsHtml += buildNextAdventureSection(chatState.savedNextAdventure);

    const contentHtml = `
        <div class="storymode-arc-history-popout-header">
            <i class="fa-solid fa-history"></i>
            <span>Arc History</span>
            <button class="storymode-arc-history-popout-close"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="storymode-arc-history-popout-body">
            ${sectionsHtml}
        </div>
    `;

    createThemedPopout(
        'storymode-arc-history-popout',
        contentHtml,
        '.storymode-arc-history-popout-header',
        '.storymode-arc-history-popout-close',
        'arcHistoryPopout'
    );
}

export {
    showArcHistoryPopup,
    buildTextSection,
    buildThemesHtml,
    buildScenarioCard,
    buildScenariosHtml,
    buildNextAdventureSection,
};
