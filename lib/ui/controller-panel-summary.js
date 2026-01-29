import { extension_settings } from '/scripts/extensions.js';

import {
    MODULE_NAME,
    getCurrentSceneIndex,
} from '../core/state-manager.js';

import * as BlueprintModule from '../blueprint/module.js';
import { getBlueprintState, saveBlueprintState } from '../blueprint/storage.js';

import { escapeHtml } from './component-system.js';
import { makeDraggable } from './controller-panel-drag.js';

/**
 * Show the summary viewer/editor popup
 */
function showSummaryPopup() {
    const blueprintState = getBlueprintState();

    if (!blueprintState?.blueprint) {
        if (window.toastr) toastr.info('No active scenario.');
        return;
    }

    // Remove existing popup
    $('.storymode-summary-popout').remove();

    const summaries = blueprintState.sceneSummaries || {};
    const scenes = blueprintState.blueprint.scene_plan || [];
    const currentSceneIdx = getCurrentSceneIndex();
    const summarizingIndex = BlueprintModule.getSummarizingSceneIndex();

    const summaryCardsHtml = buildSummaryCardsHtml(scenes, currentSceneIdx, summaries, summarizingIndex);

    const contentHtml = `
        <div class="storymode-summary-popout-header">
            <i class="fa-solid fa-file-lines"></i>
            <span>Scene Summaries</span>
            <button class="storymode-summary-popout-close"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="storymode-summary-popout-body">
            ${summaryCardsHtml}
        </div>
    `;

    const popout = $(`<div class="storymode-summary-popout">${contentHtml}</div>`);
    $('body').append(popout);

    bindSummaryPopupEvents(popout, blueprintState);

    const cleanupPopout = () => {
        $(document).off('keydown.summaryPopout');
        if (popout.data('cleanupDrag')) popout.data('cleanupDrag')();
        popout.remove();
    };

    popout.find('.storymode-summary-popout-close').on('click', cleanupPopout);
    $(document).on('keydown.summaryPopout', (e) => {
        if (e.key === 'Escape') cleanupPopout();
    });

    makeDraggable(popout, popout.find('.storymode-summary-popout-header'), 'summaryPopoutDrag', null, '.storymode-summary-popout-close');
}

function buildSummaryCardsHtml(scenes, currentSceneIdx, summaries, summarizingIndex) {
    if (currentSceneIdx === 0) {
        return '<p class="storymode-summary-empty">No completed scenes yet. Summaries are generated after scene transitions.</p>';
    }

    return scenes.slice(0, currentSceneIdx).map((scene, idx) => {
        const summary = summaries[idx];
        const hasSummary = !!summary;
        const isGenerating = summarizingIndex === idx;

        return `
            <div class="storymode-summary-card" data-scene-index="${idx}">
                <div class="storymode-summary-card-header">
                    <span class="storymode-summary-scene-title">
                        <i class="fa-solid ${hasSummary ? 'fa-check-circle' : (isGenerating ? 'fa-circle-notch fa-spin' : 'fa-clock')}"></i>
                        Scene ${idx + 1}: ${escapeHtml(scene.title)}
                    </span>
                    <span class="storymode-summary-timestamp">
                        ${hasSummary ? new Date(summary.timestamp).toLocaleString() : (isGenerating ? 'Generating...' : 'Not summarised')}
                    </span>
                </div>
                <div class="storymode-summary-card-body">
                    ${hasSummary
                        ? `<textarea class="storymode-summary-textarea" data-scene-index="${idx}">${escapeHtml(summary.summary)}</textarea>`
                        : `<p class="storymode-summary-placeholder">${isGenerating ? 'Summary generation in progress...' : 'Summary not yet generated'}</p>`
                    }
                </div>
                <div class="storymode-summary-card-actions">
                    ${hasSummary
                        ? `<button class="storymode-small-btn storymode-save-summary-btn" data-scene-index="${idx}" disabled>
                               <i class="fa-solid fa-save"></i> Save
                           </button>`
                        : `<button class="storymode-small-btn storymode-generate-summary-btn" data-scene-index="${idx}" ${isGenerating ? 'disabled' : ''}>
                               <i class="fa-solid ${isGenerating ? 'fa-circle-notch fa-spin' : 'fa-wand-magic-sparkles'}"></i> ${isGenerating ? 'Generating...' : 'Generate'}
                           </button>`
                    }
                </div>
            </div>
        `;
    }).join('');
}

function bindSummaryPopupEvents(popout, blueprintState) {
    popout.on('input', '.storymode-summary-textarea', function() {
        const idx = $(this).data('scene-index');
        popout.find(`.storymode-save-summary-btn[data-scene-index="${idx}"]`).prop('disabled', false);
    });

    popout.on('click', '.storymode-save-summary-btn', async function() {
        const idx = $(this).data('scene-index');
        const newText = popout.find(`.storymode-summary-textarea[data-scene-index="${idx}"]`).val();

        blueprintState.sceneSummaries[idx].summary = newText.trim();
        blueprintState.sceneSummaries[idx].timestamp = new Date().toISOString();
        blueprintState.sceneSummaries[idx].edited = true;

        await saveBlueprintState(blueprintState);
        $(this).prop('disabled', true);
        if (window.toastr) toastr.success(`Scene ${idx + 1} summary saved`);
    });

    popout.on('click', '.storymode-generate-summary-btn', async function() {
        const idx = $(this).data('scene-index');
        const btn = $(this);
        const originalHtml = btn.html();

        btn.prop('disabled', true).html('<i class="fa-solid fa-circle-notch fa-spin"></i> Generating...');

        try {
            const settings = extension_settings[MODULE_NAME];
            await BlueprintModule.manuallyGenerateSummary(idx, blueprintState, settings);
            showSummaryPopup();
        } catch (error) {
            console.error('[Story Mode] Manual summary generation failed:', error);
            if (window.toastr) toastr.error(`Failed to generate summary: ${error.message}`);
            btn.prop('disabled', false).html(originalHtml);
        }
    });
}

export { showSummaryPopup };
