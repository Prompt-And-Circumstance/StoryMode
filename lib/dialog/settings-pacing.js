import * as BlueprintModule from '../blueprint/module.js';
import { resolveAndHandleMissingStyle } from '../blueprint/missing-style-handler.js';
import { MODULE_NAME, PACING_MODES, getPacingMode, setPacingMode } from '../core/state-manager.js';
import { updateStoryPrompt } from '../core/arc-engine.js';
import { updateControllerPanel } from '../ui/controller-panel.js';
import { buildBlueprintTabContent, buildStoryArcSubtab, buildOverviewTabContent } from '../ui/components.js';
import { saveSettingsDebounced } from '/script.js';
import { extension_settings } from '/scripts/extensions.js';
import { refreshSidebar } from './library-view.js';

export function setupPacingEvents(content, context) {
    const { libraryCallbacks, refreshBlueprintPreview } = context;

    // Build switchPacingMode closure (needs content, rebuildStoryArcTab, rebuildOverviewTab)
    const switchPacingMode = buildSwitchPacingMode(content);

    bindPacingModeButtons(content, switchPacingMode);
    bindNavigationButtons(content, libraryCallbacks);
    bindQuickActions(content, libraryCallbacks);
    bindAddStyleButton(content, refreshBlueprintPreview);
}

function buildSwitchPacingMode(content) {
    function rebuildStoryArcTab(contentEl) {
        const container = contentEl.find('#settings_subtab_story_arc');
        if (container.length) {
            container.html(buildStoryArcSubtab());
        } else {
            console.warn('[Story Mode] Could not find #settings_subtab_story_arc to rebuild');
        }
    }

    function rebuildOverviewTab(contentEl) {
        const container = contentEl.find('#tab_overview');
        if (container.length) {
            container.html(buildOverviewTabContent());
        }
    }

    return async function switchPacingMode(mode, activateBlueprint) {
        const blueprintState = BlueprintModule.getBlueprintState();
        if (!blueprintState) {
            console.error('[Story Mode] Failed to get blueprint state');
            if (toastr) toastr.error('Failed to switch mode: could not access blueprint state');
            return false;
        }

        try {
            blueprintState.useBlueprint = activateBlueprint;
            await BlueprintModule.saveBlueprintState(blueprintState);
            setPacingMode(mode);
            saveSettingsDebounced();
            updateStoryPrompt();
            rebuildStoryArcTab(content);
            rebuildOverviewTab(content);
            const modeLabel = mode === PACING_MODES.STORY ? 'Story' : 'Scenario';
            if (toastr) toastr.success(`Switched to ${modeLabel} Mode`);
            if (window.updateStatusDisplay) window.updateStatusDisplay();
            updateControllerPanel();
            return true;
        } catch (error) {
            console.error(`[Story Mode] Failed to switch to ${mode} mode:`, error);
            if (toastr) toastr.error('Failed to switch mode: ' + error.message);
            return false;
        }
    };
}

function bindPacingModeButtons(content, switchPacingMode) {
    content.on('click', '#storymode-pacing-story', async function() {
        if (getPacingMode() === PACING_MODES.STORY) return;
        await switchPacingMode(PACING_MODES.STORY, false);
    });

    content.on('click', '#storymode-pacing-scenario', async function() {
        if (getPacingMode() === PACING_MODES.SCENARIO) return;
        const blueprintState = BlueprintModule.getBlueprintState();
        if (!blueprintState?.blueprint) {
            if (toastr) toastr.info('Select a blueprint from the Library');
            window.showStoryModeSettings('library');
            return;
        }
        await switchPacingMode(PACING_MODES.SCENARIO, true);
    });

    content.on('click', '#stop_scenario_btn', async function() {
        await switchPacingMode(PACING_MODES.STORY, false);
    });
}

function bindNavigationButtons(content, libraryCallbacks) {
    content.on('click', '#view_blueprint_btn', function() {
        libraryCallbacks.switchToTab(content, 'blueprint');
    });

    content.on('click', '#go_to_library_btn', function() {
        libraryCallbacks.switchToTab(content, 'library');
    });
}

function bindQuickActions(content, libraryCallbacks) {
    content.on('click', '.storymode-quick-action', function() {
        const gotoTab = $(this).data('goto-tab');
        const gotoSubtab = $(this).data('goto-subtab');

        if (gotoTab) {
            libraryCallbacks.switchToTab(content, gotoTab);
            if (gotoSubtab) {
                setTimeout(() => {
                    const $subtabBtn = content.find(`.storymode-settings-subtab[data-subtab="${gotoSubtab}"]`);
                    if ($subtabBtn.length) {
                        $subtabBtn.click();
                    }
                }, 50);
            }
        }
    });

    // Fullscreen Editor button (in Quick Actions)
    content.on('click', '#open_fullscreen_editor_btn', openFullscreenEditor);
}

/**
 * Open the standalone fullscreen blueprint editor in a new tab
 */
function openFullscreenEditor() {
    const editorUrl = new URL('scripts/extensions/third-party/Extension-StoryMode/standalone/index.html', window.location.origin);
    window.open(editorUrl.href, '_blank');
}

function bindAddStyleButton(content, refreshBlueprintPreview) {
    content.on('click', '.storymode-add-style-btn', async function(e) {
        e.stopPropagation();
        const btn = $(this);
        const styleType = btn.data('style-type');

        const blueprint = BlueprintModule.getBlueprintState()?.blueprint;
        if (!blueprint) {
            toastr.error('No blueprint loaded');
            return;
        }

        const originalHtml = btn.html();
        btn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i>');

        try {
            const created = await resolveAndHandleMissingStyle(blueprint, styleType);
            if (created) {
                content.find('#tab_blueprint').html(buildBlueprintTabContent());
                refreshBlueprintPreview();
            } else {
                btn.prop('disabled', false).html(originalHtml);
            }
        } catch (error) {
            console.error('[Story Mode] Failed to add style:', error);
            toastr.error(`Failed to add style: ${error.message}`);
            btn.prop('disabled', false).html(originalHtml);
        }
    });
}
