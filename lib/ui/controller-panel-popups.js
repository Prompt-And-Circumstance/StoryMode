import {
    getChatStoryState,
    getCurrentSceneIndex,
} from '../core/state-manager.js';

import * as BlueprintModule from '../blueprint/module.js';
import { getBlueprintState } from '../blueprint/storage.js';

import { buildFullInjection } from '../core/arc-engine.js';
import { escapeHtml } from './component-system.js';
import { createThemedPopout } from './controller-panel-structure.js';

// Re-export showSummaryPopup from its own module so existing importers work
import { showSummaryPopup } from './controller-panel-summary.js';
export { showSummaryPopup };

/**
 * Open the Blueprint Library dialog.
 */
function openBlueprintLibrary() {
    if (typeof window.showStoryModeSettings === 'function') {
        window.showStoryModeSettings('library');
    } else {
        console.error('[Controller Panel] showStoryModeSettings not available');
        if (window.toastr) toastr.error('Failed to open library');
    }
}

/**
 * Open the Story Mode Settings dialog.
 */
function openStoryModeSettings() {
    if (typeof window.showStoryModeSettings === 'function') {
        window.showStoryModeSettings('genre-style');
    } else {
        console.error('[Controller Panel] showStoryModeSettings not available');
        if (window.toastr) toastr.error('Failed to open settings');
    }
}

/**
 * Show the Prompt Inspector panel with current and next prompt
 */
function showPromptInspector() {
    const { currentPrompt, nextPrompt } = getInspectorPrompts();
    const contentHtml = buildInspectorHtml(currentPrompt, nextPrompt);

    const inspector = createThemedPopout(
        'storymode-prompt-inspector',
        contentHtml,
        '.storymode-prompt-inspector-header',
        '.storymode-prompt-inspector-close',
        'promptInspector'
    );

    // Prompt inspector-specific tab handling
    inspector.on('click', '.storymode-prompt-tab', function () {
        const tab = $(this).data('tab');
        inspector.find('.storymode-prompt-tab').removeClass('active');
        $(this).addClass('active');
        inspector.find('.storymode-prompt-panel').hide();
        inspector.find(`.storymode-prompt-panel[data-panel="${tab}"]`).show();
    });
}

function getInspectorPrompts() {
    const chatState = getChatStoryState();
    const currentPrompt = buildFullInjection(false) || '(No prompt - Story Mode may be disabled or no scenario active)';

    let nextPrompt = '';
    if (chatState.currentStep < chatState.arcLength) {
        const originalStep = chatState.currentStep;
        chatState.currentStep = originalStep + 1;
        nextPrompt = buildFullInjection(true) || '(No prompt for next step)';
        chatState.currentStep = originalStep;
    } else {
        nextPrompt = '(Story arc complete - no further prompts)';
    }

    return { currentPrompt, nextPrompt };
}

function highlightXml(text) {
    return escapeHtml(text)
        .replace(/&lt;(\/?)([a-zA-Z_][a-zA-Z0-9_]*)([^&]*?)&gt;/g,
            '<span class="xml-tag">&lt;$1$2$3&gt;</span>')
        .replace(/(\w+)=&quot;([^&]*)&quot;/g,
            '<span class="xml-attr">$1</span>=<span class="xml-value">"$2"</span>');
}

function buildInspectorHtml(currentPrompt, nextPrompt) {
    return `
        <div class="storymode-prompt-inspector-header">
            <i class="fa-solid fa-code"></i>
            <span>Prompt Inspector</span>
            <button class="storymode-prompt-inspector-close"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="storymode-prompt-tabs">
            <button class="storymode-prompt-tab active" data-tab="current">Current Prompt</button>
            <button class="storymode-prompt-tab" data-tab="next">Next Prompt</button>
        </div>
        <div class="storymode-prompt-content">
            <div class="storymode-prompt-panel" data-panel="current">
                <pre class="storymode-prompt-code">${highlightXml(currentPrompt)}</pre>
            </div>
            <div class="storymode-prompt-panel" data-panel="next" style="display: none;">
                <pre class="storymode-prompt-code">${highlightXml(nextPrompt)}</pre>
            </div>
        </div>
    `;
}

/**
 * Show a detailed popout panel for scene or beats
 */
function showDebugDetailPopup(type) {
    const chatState = getChatStoryState();
    const blueprintState = getBlueprintState();

    if (!blueprintState?.blueprint) {
        if (window.toastr) toastr.info('No active scenario to show details for.');
        return;
    }

    const blueprint = blueprintState.blueprint;
    const scene = BlueprintModule.getCurrentScene(
        blueprint,
        chatState.currentStep,
        chatState.arcLength,
        blueprintState.sceneMode || 'auto',
        getCurrentSceneIndex()
    );

    if (!scene) {
        if (window.toastr) toastr.info('Current scene not found.');
        return;
    }

    const completedBeats = BlueprintModule.getCompletedBeats(scene.index);
    const totalScenes = blueprint.scene_plan.length;
    const isFinalScene = scene.index >= totalScenes - 1;

    let contentHtml = '';

    if (type === 'scene') {
        contentHtml = buildSceneDetailHtml(scene, completedBeats, totalScenes, isFinalScene, blueprint);
    } else if (type === 'beats') {
        contentHtml = buildBeatsDetailHtml(scene, completedBeats);
    }

    const popout = createThemedPopout(
        'storymode-scene-popout',
        contentHtml,
        '.storymode-scene-popout-header',
        '.storymode-scene-popout-close',
        'scenePopout'
    );

    // Scene popout-specific: click outside to close (after delay to prevent immediate close)
    setTimeout(() => {
        $(document).on('click.scenePopout', (e) => {
            if (!$(e.target).closest('.storymode-scene-popout, .storymode-debug-panel').length) {
                // Trigger the cleanup by simulating close button click
                popout.find('.storymode-scene-popout-close').trigger('click');
            }
        });
    }, 100);
}

function buildSceneDetailHtml(scene, completedBeats, totalScenes, isFinalScene, blueprint) {
    const situationHtml = scene.situation
        ? `<div class="storymode-popout-section">
            <h4><i class="fa-solid fa-location-dot"></i> Situation</h4>
            <p>${escapeHtml(scene.situation)}</p>
        </div>` : '';

    const purposeHtml = scene.purpose
        ? `<div class="storymode-popout-section">
            <h4><i class="fa-solid fa-bullseye"></i> Purpose</h4>
            <p>${escapeHtml(scene.purpose)}</p>
        </div>` : '';

    const keyEventsHtml = (scene.key_events_if_unchallenged?.length > 0)
        ? `<div class="storymode-popout-section">
            <h4><i class="fa-solid fa-bolt"></i> Key Events</h4>
            <ul>${scene.key_events_if_unchallenged.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul>
        </div>` : '';

    const characterFocusHtml = (scene.character_focus?.length > 0)
        ? `<div class="storymode-popout-section">
            <h4><i class="fa-solid fa-users"></i> Character Focus</h4>
            <ul>${scene.character_focus.map(cf => `<li><strong>${escapeHtml(cf.name)}:</strong> ${escapeHtml(cf.emotional_beat_target || cf.focus || '')}</li>`).join('')}</ul>
        </div>` : '';

    const checklistHtml = buildChecklistHtml(scene, completedBeats);
    const nextSceneHtml = buildNextSceneHtml(scene, isFinalScene, blueprint);
    const metaHtml = buildMetaHtml(scene, completedBeats, totalScenes);

    return `
        <div class="storymode-scene-popout-header">
            <i class="fa-solid fa-scroll"></i>
            <span>Scene ${scene.index + 1}: ${escapeHtml(scene.title)}</span>
            <button class="storymode-scene-popout-close"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="storymode-scene-popout-body">
            ${metaHtml}
            ${situationHtml}
            ${purposeHtml}
            ${keyEventsHtml}
            ${characterFocusHtml}
            ${checklistHtml}
            ${nextSceneHtml}
        </div>
    `;
}

function buildChecklistHtml(scene, completedBeats) {
    const beatsComplete = scene.beats ? completedBeats.length >= scene.beats.length : true;
    const exitTrigger = scene.purpose || 'scene purpose fulfilled';

    const checklistItems = [];
    if (scene.beats?.length > 0) {
        checklistItems.push({
            label: `Beats completed: ${completedBeats.length}/${scene.beats.length}`,
            complete: beatsComplete
        });
    }
    checklistItems.push({
        label: `Exit trigger: ${exitTrigger}`,
        complete: false
    });

    return `<div class="storymode-popout-section">
        <h4><i class="fa-solid fa-clipboard-check"></i> Scene Completion</h4>
        <div class="storymode-popout-checklist">
            ${checklistItems.map(item => `
                <div class="storymode-popout-checklist-item ${item.complete ? 'complete' : 'pending'}">
                    <span class="storymode-popout-checklist-icon ${item.complete ? 'complete' : 'pending'}">
                        ${item.complete ? '<i class="fa-solid fa-circle-check"></i>' : '<i class="fa-regular fa-circle"></i>'}
                    </span>
                    <span class="storymode-popout-checklist-text">${escapeHtml(item.label)}</span>
                </div>
            `).join('')}
        </div>
    </div>`;
}

function buildNextSceneHtml(scene, isFinalScene, blueprint) {
    if (!isFinalScene) {
        const nextScene = blueprint.scene_plan[scene.index + 1];
        if (nextScene) {
            return `<div class="storymode-popout-section">
                <h4><i class="fa-solid fa-forward"></i> Next Scene</h4>
                <div class="storymode-next-scene-preview">
                    <h5><i class="fa-solid fa-arrow-right"></i> ${escapeHtml(nextScene.title)} <span style="opacity:0.6;">(${nextScene.phase})</span></h5>
                    <p>${escapeHtml(nextScene.purpose || nextScene.situation || 'Continue the story')}</p>
                </div>
            </div>`;
        }
    } else {
        return `<div class="storymode-popout-section">
            <h4><i class="fa-solid fa-flag-checkered"></i> Final Scene</h4>
            <p style="color: var(--sm-accent);">This is the last scene. Use @@STORY_COMPLETE@@ when finished.</p>
        </div>`;
    }
    return '';
}

function buildMetaHtml(scene, completedBeats, totalScenes) {
    return `<div class="storymode-popout-section">
        <div class="storymode-popout-meta">
            <div class="storymode-popout-meta-item">
                <span class="storymode-popout-meta-label">Phase</span>
                <span class="storymode-popout-meta-value">${scene.phase || 'Unknown'}</span>
            </div>
            <div class="storymode-popout-meta-item">
                <span class="storymode-popout-meta-label">Scene</span>
                <span class="storymode-popout-meta-value">${scene.index + 1} of ${totalScenes}</span>
            </div>
            <div class="storymode-popout-meta-item">
                <span class="storymode-popout-meta-label">Beats</span>
                <span class="storymode-popout-meta-value">${completedBeats.length}/${scene.beats?.length || 0}</span>
            </div>
        </div>
    </div>`;
}

function buildBeatsDetailHtml(scene, completedBeats) {
    const beatsHtml = (scene.beats || []).map((beat, idx) => {
        const isDone = completedBeats.includes(idx);
        const isCurrent = idx === Math.min(completedBeats.length, scene.beats.length - 1) && !isDone;
        const statusClass = isDone ? 'complete' : (isCurrent ? 'pending' : '');
        const icon = isDone ? '<i class="fa-solid fa-circle-check"></i>' : (isCurrent ? '<i class="fa-solid fa-arrow-right"></i>' : '<i class="fa-regular fa-circle"></i>');

        return `
            <div class="storymode-popout-checklist-item ${statusClass}">
                <span class="storymode-popout-checklist-icon ${statusClass}">${icon}</span>
                <span class="storymode-popout-checklist-text">
                    <strong>Beat ${idx}:</strong> ${escapeHtml(typeof beat === 'object' ? (beat.title || beat.description || JSON.stringify(beat)) : beat)}
                </span>
            </div>
        `;
    }).join('');

    return `
        <div class="storymode-scene-popout-header">
            <i class="fa-solid fa-list-check"></i>
            <span>Beats: ${escapeHtml(scene.title)}</span>
            <button class="storymode-scene-popout-close"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="storymode-scene-popout-body">
            <div class="storymode-popout-section">
                <div class="storymode-popout-checklist">
                    ${beatsHtml}
                </div>
            </div>
            <p class="storymode-form-hint" style="margin-top: 10px; opacity: 0.7;">
                <i class="fa-solid fa-info-circle"></i> LLM marks beats using <code>@@BEAT:0@@</code>, <code>@@BEAT:1@@</code>, etc.
            </p>
        </div>
    `;
}

export {
    openBlueprintLibrary,
    openStoryModeSettings,
    showPromptInspector,
    showDebugDetailPopup,
};
