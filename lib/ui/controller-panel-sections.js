import { extension_settings } from '/scripts/extensions.js';

import {
    MODULE_NAME,
    PACING_MODES,
    getPacingMode,
    getCurrentSceneIndex,
    getEffectiveAuthorStyle,
} from '../core/state-manager.js';

import * as BlueprintModule from '../blueprint/module.js';

import { escapeHtml } from './component-system.js';
import { getStoryTypes, getAuthorStyles } from '../core/state-manager.js';
import { formatSceneList } from './controller-panel-content.js';

// Helper to get badge HTML based on source
function getSourceBadge(source, sourceName) {
    if (source === 'blueprint') {
        return `<span class="override-badge blueprint-badge" title="From blueprint: ${escapeHtml(sourceName)}">
            <i class="fa-solid fa-scroll"></i> ${escapeHtml(sourceName)}
        </span>`;
    } else if (source === 'character') {
        return `<span class="override-badge character-badge" title="From character: ${escapeHtml(sourceName)}">
            <i class="fa-solid fa-user"></i> ${escapeHtml(sourceName)}
        </span>`;
    } else if (source === 'group') {
        return `<span class="override-badge group-badge" title="From group: ${escapeHtml(sourceName)}">
            <i class="fa-solid fa-users"></i> ${escapeHtml(sourceName)}
        </span>`;
    }
    return ''; // 'chat' and 'default' don't show badges
}

function buildStyleSection(chatState, settings, pacingMode) {
    const storyTypes = getStoryTypes();
    const authorStyles = getAuthorStyles();
    const currentStoryTypeId = chatState.selectedStoryType || 'custom';
    const { styleId: effectiveStyleId, source: styleSource, sourceName: styleSourceName } = getEffectiveAuthorStyle();

    const currentStoryType = storyTypes.find(st => st.id === currentStoryTypeId);
    const currentAuthorStyle = authorStyles.find(as => as.id === effectiveStyleId);

    const showStoryType = currentStoryType &&
        (pacingMode === PACING_MODES.SCENARIO || settings.storyTypeEnabled);
    const showAuthorStyle = settings.authorStyleEnabled && currentAuthorStyle;

    if (!showStoryType && !showAuthorStyle) return '';

    const storyTypeHtml = showStoryType
        ? buildStoryTypeItem(currentStoryType, settings.storyTypeDescCollapsed !== false)
        : '';
    const authorStyleHtml = showAuthorStyle
        ? buildAuthorStyleItem(currentAuthorStyle, settings.authorStyleDescCollapsed !== false, styleSource, styleSourceName)
        : '';

    return `<div class="storymode-debug-section storymode-style-info">${storyTypeHtml}${authorStyleHtml}</div>`;
}

function buildStoryTypeItem(storyType, collapsed) {
    const desc = storyType?.storyPrompt || '';
    return `
        <div class="storymode-style-item">
            <div class="storymode-style-header" data-style-toggle="storyType">
                <div class="storymode-debug-label">
                    <i class="fa-solid fa-theater-masks"></i> Story Type
                    ${desc ? `<i class="fa-solid fa-chevron-${collapsed ? 'down' : 'up'} storymode-style-chevron"></i>` : ''}
                </div>
                <div class="storymode-debug-value">${escapeHtml(storyType.name)}</div>
            </div>
            ${desc ? `<div class="storymode-style-desc ${collapsed ? 'collapsed' : ''}" data-style-desc="storyType">${escapeHtml(desc)}</div>` : ''}
        </div>`;
}

function buildAuthorStyleItem(authorStyle, collapsed, source, sourceName) {
    const desc = authorStyle?.authorPrompt || '';
    return `
        <div class="storymode-style-item">
            <div class="storymode-style-header" data-style-toggle="authorStyle">
                <div class="storymode-debug-label">
                    <i class="fa-solid fa-pen-fancy"></i> Author Style
                    ${getSourceBadge(source, sourceName)}
                    ${desc ? `<i class="fa-solid fa-chevron-${collapsed ? 'down' : 'up'} storymode-style-chevron"></i>` : ''}
                </div>
                <div class="storymode-debug-value">${escapeHtml(authorStyle.name)}</div>
            </div>
            ${desc ? `<div class="storymode-style-desc ${collapsed ? 'collapsed' : ''}" data-style-desc="authorStyle">${escapeHtml(desc)}</div>` : ''}
        </div>`;
}

function buildModeToggle(pacingMode) {
    const isScenario = pacingMode === 'scenario';

    return `
        <div class="storymode-debug-section storymode-mode-toggle">
            <div class="storymode-debug-label">Pacing Mode</div>
            <div class="storymode-toggle-buttons">
                <button id="storymode-mode-story"
                        class="storymode-mode-btn ${!isScenario ? 'active' : ''}"
                        title="Round-based progression">
                    <i class="fa-solid fa-clock"></i> Story
                </button>
                <button id="storymode-mode-scenario"
                        class="storymode-mode-btn ${isScenario ? 'active' : ''}"
                        title="Signal-based progression">
                    <i class="fa-solid fa-signal"></i> Scenario
                </button>
            </div>
            <div class="storymode-debug-meta">
                ${isScenario ? 'Signals drive progression' : 'Rounds drive progression'}
            </div>
        </div>
    `;
}

function buildSummarySection(settings, blueprintState, hasBlueprint) {
    if (!settings.blueprintSettings?.summarizationEnabled || !hasBlueprint) return '';

    const summarizingIndex = BlueprintModule.getSummarizingSceneIndex();
    const summaries = blueprintState.sceneSummaries || {};
    const summarizedIndices = Object.keys(summaries).map(Number).sort((a, b) => a - b);
    const currentSceneIdx = getCurrentSceneIndex();
    const pendingCount = blueprintState.pendingSummaries?.length || 0;
    const summarizableCount = currentSceneIdx; // Scenes 0 to currentSceneIdx-1 are complete

    let statusText = '';
    let statusIcon = 'fa-file-lines';

    if (summarizingIndex !== null) {
        statusText = `Scene ${summarizingIndex + 1} summary being generated...`;
        statusIcon = 'fa-circle-notch fa-spin';
    } else if (summarizedIndices.length === 0) {
        if (currentSceneIdx === 0) {
            statusText = 'No completed scenes to summarise';
        } else {
            statusText = `${currentSceneIdx} scene(s) awaiting summarization`;
        }
    } else {
        const sceneList = formatSceneList(summarizedIndices);
        statusText = `${sceneList} summarised`;
        if (currentSceneIdx > summarizedIndices.length) {
            const awaitingCount = currentSceneIdx - summarizedIndices.length;
            statusText += `, ${awaitingCount} awaiting`;
        }
    }

    if (pendingCount > 0) {
        statusText += ` (${pendingCount} retry pending)`;
    }

    // Get next auto-summary info
    const nextSummaryInfo = BlueprintModule.getNextAutoSummaryInfo(blueprintState, settings);
    const nextSummaryText = nextSummaryInfo.message || '';

    return `
        <div id="storymode-debug-summary-link" class="storymode-debug-section storymode-debug-interactable" title="Click to view/edit scene summaries">
            <div class="storymode-debug-label">Summaries <i class="fa-solid fa-magnifying-glass"></i></div>
            <div class="storymode-debug-value"><i class="fa-solid ${statusIcon}"></i> ${escapeHtml(statusText)}</div>
            <div class="storymode-debug-meta">${summarizedIndices.length} of ${summarizableCount} past scenes</div>
            ${nextSummaryText ? `<div class="storymode-debug-hint"><i class="fa-solid fa-clock"></i> ${escapeHtml(nextSummaryText)}</div>` : ''}
        </div>
    `;
}

function buildArcHistorySection(chatState, settings) {
    if (!chatState.savedEpilogue && !chatState.savedSummary && !chatState.savedNextAdventure) return '';

    const hasEpilogue = !!chatState.savedEpilogue;
    const hasSummary = !!chatState.savedSummary;
    const hasNextAdventure = !!chatState.savedNextAdventure;

    const indicators = [];
    if (hasEpilogue) indicators.push('<i class="fa-solid fa-scroll" title="Epilogue"></i>');
    if (hasSummary) indicators.push('<i class="fa-solid fa-file-lines" title="Summary"></i>');
    if (hasNextAdventure) indicators.push('<i class="fa-solid fa-route" title="What\'s Next"></i>');

    const contentItems = [hasEpilogue && 'Epilogue', hasSummary && 'Summary', hasNextAdventure && 'What\'s Next'].filter(Boolean);

    return `
        <div id="storymode-debug-arc-history-link" class="storymode-debug-section storymode-debug-interactable" title="Click to view arc completion content">
            <div class="storymode-debug-label">
                <i class="fa-solid fa-history"></i> Arc History <i class="fa-solid fa-magnifying-glass"></i>
            </div>
            <div class="storymode-arc-history-indicators">${indicators.join(' ')}</div>
            <div class="storymode-debug-meta">${contentItems.join(', ')}</div>
        </div>
    `;
}

function buildOocPanel(settings) {
    const oocRolledUp = settings.oocPanelRolledUp !== false; // Default to rolled up
    const oocContent = settings.oocText || '';

    return `
        <div class="storymode-debug-section storymode-ooc-panel ${oocRolledUp ? 'sm-ooc-rolled-up' : ''}">
            <div class="storymode-ooc-header" id="storymode-ooc-header" title="Click to expand/collapse">
                <div class="storymode-debug-label">
                    <i class="fa-solid fa-comment-dots"></i> Out of Context Command
                </div>
                <button class="storymode-ooc-toggle" title="Toggle OOC panel">
                    <i class="fa-solid ${oocRolledUp ? 'fa-chevron-down' : 'fa-chevron-up'}"></i>
                </button>
            </div>
            <div class="storymode-ooc-content">
                <textarea id="storymode-ooc-textarea"
                          class="storymode-ooc-textarea"
                          placeholder="Enter an OOC instruction for the AI (e.g., 'move quickly to the next scene', 'focus on Julie's perspective')...">${escapeHtml(oocContent)}</textarea>
                <div class="storymode-ooc-hint">
                    <i class="fa-solid fa-info-circle"></i> This instruction will be added to all story prompts until cleared
                </div>
                <div class="storymode-ooc-actions">
                    <button id="storymode-ooc-clear-btn" class="storymode-ooc-clear-btn" title="Clear OOC text">
                        <i class="fa-solid fa-trash"></i> Clear
                    </button>
                </div>
            </div>
        </div>
    `;
}

export {
    buildStyleSection,
    buildModeToggle,
    buildSummarySection,
    buildArcHistorySection,
    buildOocPanel,
};
