import { extension_settings } from '/scripts/extensions.js';

import {
    MODULE_NAME,
    getChatStoryState,
    getPacingMode,
    getCurrentSceneIndex,
    getBeatState,
    getCompletedBeatIndices,
} from '../core/state-manager.js';

import * as BlueprintModule from '../blueprint/module.js';
import { getBlueprintState } from '../blueprint/storage.js';
import * as ImageStorage from '../scene/image-storage.js';
import * as ImageGenerator from '../scene/image-generator.js';

import { getPhaseInfo } from '../core/arc-engine.js';
import { escapeHtml } from './component-system.js';
import {
    getResourceSummaryCounts,
} from './components/scenario-characters.js';
import {
    buildStyleSection,
    buildModeToggle,
    buildSummarySection,
    buildArcHistorySection,
    buildOocPanel,
} from './controller-panel-sections.js';

/**
 * Build round/scene info HTML based on pacing mode and settings
 * @param {string} pacingMode - 'story' or 'scenario'
 * @param {Object} settings - Extension settings
 * @param {Object} chatState - Chat story state
 * @param {Object} blueprintState - Blueprint state
 * @param {boolean} hasBlueprint - Whether a blueprint is active
 * @returns {string} HTML for the round/scene info section
 */
function buildRoundInfoHtml(pacingMode, settings, chatState, blueprintState, hasBlueprint) {
    // Story Mode
    if (pacingMode !== 'scenario') {
        if (!settings.storyArcEnabled) {
            return `
            <div class="storymode-debug-section">
                <div class="storymode-debug-label">Arc Tracking</div>
                <div class="storymode-debug-meta">Disabled (Story Type only)</div>
            </div>`;
        }

        const arcPercent = chatState.arcLength > 0
            ? Math.round((chatState.currentStep / chatState.arcLength) * 100)
            : 0;
        const phaseInfo = getPhaseInfo(chatState.currentStep, chatState.arcLength);
        const phaseLabel = phaseInfo.phase.charAt(0).toUpperCase() + phaseInfo.phase.slice(1);

        return `
        <div class="storymode-debug-section">
            <div class="storymode-debug-label">Round <span class="storymode-phase-badge">${phaseLabel}</span></div>
            <div class="storymode-debug-value storymode-debug-round">${chatState.currentStep}/${chatState.arcLength}</div>
            <div class="storymode-debug-bar">
                <div class="storymode-debug-bar-fill" style="width: ${arcPercent}%"></div>
            </div>
        </div>`;
    }

    // Scenario Mode with blueprint
    if (hasBlueprint) {
        const totalScenes = blueprintState.blueprint.scene_plan?.length || 0;
        const arcPercent = totalScenes > 0
            ? Math.round(((getCurrentSceneIndex() + 1) / totalScenes) * 100)
            : 0;
        const currentScene = blueprintState.blueprint.scene_plan?.[getCurrentSceneIndex()];
        const phaseLabel = currentScene?.phase || 'Unknown';

        return `
        <div class="storymode-debug-section">
            <div class="storymode-debug-label">Scene <span class="storymode-phase-badge">${escapeHtml(phaseLabel)}</span></div>
            <div class="storymode-debug-value storymode-debug-round">${getCurrentSceneIndex() + 1}/${totalScenes}</div>
            <div class="storymode-debug-bar">
                <div class="storymode-debug-bar-fill" style="width: ${arcPercent}%"></div>
            </div>
        </div>`;
    }

    // Scenario Mode without blueprint
    return '';
}

/**
 * Format a list of scene indices as human-readable text
 * @param {number[]} indices - Array of 0-based scene indices
 * @returns {string} Formatted text like "Scenes 1, 2 and 3"
 */
function formatSceneList(indices) {
    if (indices.length === 0) return '';
    if (indices.length === 1) return `Scene ${indices[0] + 1}`;
    if (indices.length === 2) return `Scenes ${indices[0] + 1} and ${indices[1] + 1}`;
    // Don't mutate input - use slice and index
    const last = indices[indices.length - 1];
    const rest = indices.slice(0, -1);
    return `Scenes ${rest.map(i => i + 1).join(', ')} and ${last + 1}`;
}

/**
 * Render the panel content (shared between floating and docked modes).
 * @returns {string} HTML string for the panel interior
 */
function renderPanelContent() {
    const settings = extension_settings[MODULE_NAME];
    const chatState = getChatStoryState();
    const blueprintState = getBlueprintState();

    if (!settings.debugPanelEnabled) {
        return '';
    }

    const pacingMode = getPacingMode();
    const hasBlueprint = blueprintState?.blueprint && blueprintState.useBlueprint;

    const sections = gatherSections(settings, chatState, blueprintState, pacingMode, hasBlueprint);
    return assemblePanelLayout(sections, pacingMode);
}

function gatherSections(settings, chatState, blueprintState, pacingMode, hasBlueprint) {
    let sceneInfo = '', beatInfo = '', imageInfo = '', characterInfo = '', noBlueprintNotice = '';

    if (hasBlueprint) {
        sceneInfo = buildSceneSection(blueprintState, chatState);
        beatInfo = buildBeatSection(blueprintState, chatState, pacingMode);
        characterInfo = buildCharacterSection(blueprintState);
        imageInfo = buildImageSection(blueprintState, chatState, settings);
    } else if (pacingMode === 'scenario') {
        noBlueprintNotice = buildNoBlueprintNotice();
    }

    return {
        roundInfo: buildRoundInfoHtml(pacingMode, settings, chatState, blueprintState, hasBlueprint),
        modeToggle: buildModeToggle(pacingMode),
        styleInfo: buildStyleSection(chatState, settings, pacingMode),
        noBlueprintNotice, sceneInfo, beatInfo, characterInfo, imageInfo,
        summaryInfo: buildSummarySection(settings, blueprintState, hasBlueprint),
        arcHistoryInfo: buildArcHistorySection(chatState, settings),
        oocPanel: buildOocPanel(settings),
    };
}

function assemblePanelLayout(s, pacingMode) {
    if (pacingMode === 'scenario') {
        return `${s.roundInfo}${s.modeToggle}${s.noBlueprintNotice}${s.sceneInfo}${s.beatInfo}${s.characterInfo}${s.summaryInfo}${s.imageInfo}${s.styleInfo}${s.arcHistoryInfo}${s.oocPanel}`;
    }
    return `${s.roundInfo}${s.modeToggle}${s.styleInfo}${s.noBlueprintNotice}${s.sceneInfo}${s.beatInfo}${s.characterInfo}${s.summaryInfo}${s.imageInfo}${s.arcHistoryInfo}${s.oocPanel}`;
}

function buildNoBlueprintNotice() {
    return `
        <div class="storymode-debug-section storymode-no-blueprint-notice">
            <div class="storymode-debug-label">
                <i class="fa-solid fa-info-circle"></i> No Scenario Active
            </div>
            <div class="storymode-debug-value" style="opacity: 0.8; font-size: 0.9em;">
                Scenario mode requires a blueprint. Create or load a scenario from the Blueprint Library to enable scene tracking, beats, and images.
            </div>
            <button id="storymode-open-library-notice" class="storymode-small-btn" style="margin-top: 8px;">
                <i class="fa-solid fa-book-bookmark"></i> Open Library
            </button>
        </div>
    `;
}

function buildSceneSection(blueprintState, chatState) {
    const blueprint = blueprintState.blueprint;
    const scene = BlueprintModule.getCurrentScene(
        blueprint,
        chatState.currentStep,
        chatState.arcLength,
        blueprintState.sceneMode || 'auto',
        getCurrentSceneIndex()
    );

    if (!scene) return '';

    return `
        <div id="storymode-debug-scene-link" class="storymode-debug-section storymode-debug-interactable" title="Click to view full scene details">
            <div class="storymode-debug-label">Scene <i class="fa-solid fa-magnifying-glass"></i></div>
            <div class="storymode-debug-value">${escapeHtml(scene.title)}</div>
            <div class="storymode-debug-meta">${scene.index + 1}/${blueprint.scene_plan?.length || 0} • ${scene.phase}</div>
        </div>
    `;
}

function buildBeatSection(blueprintState, chatState, pacingMode) {
    const blueprint = blueprintState.blueprint;
    const scene = BlueprintModule.getCurrentScene(
        blueprint,
        chatState.currentStep,
        chatState.arcLength,
        blueprintState.sceneMode || 'auto',
        getCurrentSceneIndex()
    );

    if (!scene || !scene.beats || scene.beats.length === 0) return '';

    const completedBeats = getCompletedBeatIndices();
    const currentBeatIndex = Math.min(completedBeats.length, scene.beats.length - 1);
    const beatState = getBeatState();

    const beatMarkers = scene.beats.map((beat, idx) => {
        if (pacingMode === 'scenario') {
            return buildScenarioBeatMarker(beat, idx, beatState, scene);
        } else {
            if (completedBeats.includes(idx)) return `<span class="beat-done">✓</span>`;
            if (idx === currentBeatIndex) return `<span class="beat-current">→</span>`;
            return `<span class="beat-pending">□</span>`;
        }
    }).join(' ');

    return `
        <div id="storymode-debug-beats-link" class="storymode-debug-section storymode-debug-interactable" title="Click to view full beat checklist">
            <div class="storymode-debug-label">Beats <i class="fa-solid fa-list-check"></i></div>
            <div class="storymode-debug-beats">${beatMarkers}</div>
            <div class="storymode-debug-meta">${completedBeats.length}/${scene.beats.length} complete</div>
        </div>
    `;
}

function buildScenarioBeatMarker(beat, idx, beatState, scene) {
    const state = beatState[idx]?.status || 'pending';
    if (state === 'complete') return `<span class="beat-done" title="${beat.title}">✓</span>`;
    if (state === 'skipped') return `<span class="beat-skipped" style="color:var(--sm-text-muted);" title="${beat.title} (Skipped)">x</span>`;

    const isNext = !['complete', 'skipped'].includes(state) &&
        scene.beats.slice(0, idx).every((_, beatIdx) => {
            const s = beatState[beatIdx]?.status;
            return s === 'complete' || s === 'skipped';
        });

    if (isNext) return `<span class="beat-current" title="${beat.title}">→</span>`;
    return `<span class="beat-pending" title="${beat.title}">□</span>`;
}

function buildCharacterSection(blueprintState) {
    if (!blueprintState?.blueprint || !blueprintState.useBlueprint) return '';

    const counts = getResourceSummaryCounts(blueprintState.blueprint);

    const buildResourceLine = (resourceCounts, label) => {
        if (resourceCounts.total === 0) return '';
        const parts = [];
        if (resourceCounts.embedded > 0) parts.push(`${resourceCounts.embedded} embedded`);
        if (resourceCounts.linked > 0) parts.push(`${resourceCounts.linked} in library`);
        if (resourceCounts.missing > 0) parts.push(`${resourceCounts.missing} not in library`);
        return `
            <div class="storymode-debug-value">${resourceCounts.total} ${label}${resourceCounts.total !== 1 ? 's' : ''}</div>
            <div class="storymode-debug-meta">${parts.join(' | ')}</div>`;
    };

    const charLine = buildResourceLine(counts.characters, 'character');
    const personaLine = buildResourceLine(counts.personas, 'persona');

    if (!charLine && !personaLine) return '';

    return `
        <div id="storymode-debug-characters-link" class="storymode-debug-section storymode-debug-interactable"
             title="Click to view and manage scenario characters and personas">
            <div class="storymode-debug-label">Characters <i class="fa-solid fa-magnifying-glass"></i></div>
            ${charLine}
            ${personaLine}
        </div>
    `;
}

function buildImageSection(blueprintState, chatState, settings) {
    const blueprint = blueprintState.blueprint;
    const scene = BlueprintModule.getCurrentScene(
        blueprint,
        chatState.currentStep,
        chatState.arcLength,
        blueprintState.sceneMode || 'auto',
        getCurrentSceneIndex()
    );

    if (!scene) return '';

    const imgSettings = settings.imageGeneration || {};
    if (!imgSettings.enabled) return '';

    const sceneImage = ImageStorage.getSceneImage(blueprint.blueprint_id, scene.index);
    const coverImage = ImageStorage.getCoverImage(blueprint.blueprint_id);
    const hasSceneImage = !!sceneImage?.imageData;
    const hasCoverImage = !!coverImage?.imageData;
    const isGenerating = ImageGenerator.isGenerationInProgress();

    const displayImage = hasSceneImage ? sceneImage : (hasCoverImage ? coverImage : null);
    const hasImage = !!displayImage?.imageData;
    const showingCover = !hasSceneImage && hasCoverImage;

    const imageLabel = showingCover ? 'Cover' : 'Scene Image';
    const altText = showingCover ? 'Cover' : `Scene ${scene.index + 1}`;

    return `
        <div id="storymode-debug-image-link" class="storymode-debug-section storymode-debug-interactable"
             title="Click to view ${showingCover ? 'cover' : 'scene'} image"
             data-showing-cover="${showingCover}">
            <div class="storymode-debug-label">${imageLabel} <i class="fa-solid fa-${showingCover ? 'book-open' : 'image'}"></i></div>
            ${hasImage
            ? `<div class="storymode-debug-thumb"><img src="${displayImage.imageData}" alt="${altText}"></div>`
            : `<div class="storymode-debug-value">Not generated</div>`
        }
            <button id="storymode-generate-image-btn" class="storymode-small-btn" ${isGenerating ? 'disabled' : ''}>
                <i class="fa-solid ${isGenerating ? 'fa-circle-notch fa-spin' : 'fa-wand-magic-sparkles'}"></i>
                ${hasSceneImage ? 'Regenerate' : 'Generate Scene'}
            </button>
        </div>
    `;
}

export { renderPanelContent, buildRoundInfoHtml, formatSceneList };
