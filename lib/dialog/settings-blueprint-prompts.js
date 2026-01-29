import * as BlueprintModule from '../blueprint/module.js';
import { MODULE_NAME } from '../core/state-manager.js';
import { saveSettingsDebounced } from '/script.js';
import { extension_settings } from '/scripts/extensions.js';
import { POPUP_RESULT, callGenericPopup, POPUP_TYPE } from '/scripts/popup.js';
import { updateStoryPrompt } from '../core/arc-engine.js';

export function setupSummarizationSettings(content) {
    const summarizationSettings = [
        { selector: '#blueprint_summarization_enabled', key: 'summarizationEnabled', transform: v => $(v).is(':checked') },
        { selector: '#blueprint_summarize_after_scenes', key: 'summarizeAfterScenes', transform: v => parseInt($(v).val()) },
        { selector: '#blueprint_summary_max_tokens', key: 'summaryMaxTokens', transform: v => parseInt($(v).val()) },
        { selector: '#blueprint_include_summaries', key: 'includeSummariesInPrompt', transform: v => $(v).is(':checked'), updatePrompt: true },
        { selector: '#blueprint_summary_style', key: 'summaryStyle', transform: v => $(v).val() },
    ];

    summarizationSettings.forEach(({ selector, key, transform, updatePrompt }) => {
        content.find(selector).on('change', async function () {
            if (!extension_settings[MODULE_NAME].blueprintSettings) {
                extension_settings[MODULE_NAME].blueprintSettings = {};
            }
            const newValue = transform(this);
            extension_settings[MODULE_NAME].blueprintSettings[key] = newValue;
            saveSettingsDebounced();
            toastr.success('Settings saved');
            if (updatePrompt) {
                updateStoryPrompt();
            }

            // Trigger catch-up summarization when summarization is enabled
            if (key === 'summarizationEnabled' && newValue === true) {
                handleCatchUpSummarization();
            }
        });
    });
}

function handleCatchUpSummarization() {
    const blueprintState = BlueprintModule.getBlueprintState();
    if (blueprintState?.blueprint && blueprintState.useBlueprint) {
        const triggered = BlueprintModule.triggerCatchUpSummarization(
            blueprintState,
            extension_settings[MODULE_NAME]
        );
        if (triggered > 0) {
            toastr.info(`Started catch-up summarization for ${triggered} eligible scene(s)`, 'Story Mode');
        }
        if (window.updateControllerPanel) window.updateControllerPanel();
    }
}

export function setupEditSceneSummaryPrompt(content) {
    content.find('#edit_scene_summary_prompt').on('click', async function () {
        const currentPrompt = await BlueprintModule.getEffectiveSceneSummaryPrompt();
        const PromptTemplates = await import('../generation/templates.js');

        let narrativeReqs, bulletReqs, bothReqs;

        try {
            narrativeReqs = await PromptTemplates.getSummaryRequirements('narrative');
            bulletReqs = await PromptTemplates.getSummaryRequirements('bullet');
            bothReqs = await PromptTemplates.getSummaryRequirements('both');

            if (!narrativeReqs || !narrativeReqs.trim()) {
                narrativeReqs = 'Write a narrative paragraph (3-5 sentences) summarizing the key events of this scene.';
            }
            if (!bulletReqs || !bulletReqs.trim()) {
                bulletReqs = 'Create a bullet-point list with:\n- One bullet per significant event\n- Each bullet is a complete sentence';
            }
            if (!bothReqs || !bothReqs.trim()) {
                bothReqs = 'Provide:\n1. Overview (2-3 sentences)\n2. Key Events (bullet points)';
            }
        } catch (error) {
            console.error('[Story Mode] Error loading summary requirements:', error);
            toastr.error('Failed to load summary requirements templates');
            return;
        }

        const popupHtml = buildSceneSummaryPopupHtml(currentPrompt, narrativeReqs, bulletReqs, bothReqs);
        bindSceneSummaryTabSwitching();

        const result = await callGenericPopup(popupHtml, POPUP_TYPE.TEXT, '', {
            okButton: 'Save All',
            cancelButton: 'Cancel',
            wide: true,
            large: true,
            allowVerticalScrolling: false
        });

        if (result === POPUP_RESULT.AFFIRMATIVE) {
            saveSceneSummaryTemplates();
        }

        $(document).off('click.sceneSummaryTabs');
    });
}

function buildSceneSummaryPopupHtml(currentPrompt, narrativeReqs, bulletReqs, bothReqs) {
    const esc = (s) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const tabBtnStyle = 'padding: 8px 16px; border: none; border-radius: 6px 6px 0 0; cursor: pointer;';
    const activeTabStyle = `${tabBtnStyle} background: var(--sm-accent); color: white; font-weight: 600;`;
    const inactiveTabStyle = `${tabBtnStyle} background: var(--black30a); color: var(--SmartThemeBodyColor);`;
    const hintBoxStyle = 'margin-bottom: 12px; padding: 12px; background: var(--black30a); border-radius: 6px; border-left: 3px solid var(--sm-accent); font-size: 0.9em;';
    const ta = 'width: 100%; min-height: 320px; font-family: monospace; font-size: 0.9em;';

    const mainTab = buildMainTemplateTab(esc(currentPrompt), hintBoxStyle, ta);
    const styleTabHtml = (tab, id, label, content) =>
        `<div class="storymode-prompt-tab-content" data-tab="${tab}" style="display: none;">` +
        `<div style="${hintBoxStyle} color: var(--SmartThemeQuoteColor);">Instructions for <strong style="color: var(--SmartThemeBodyColor);">${label}</strong> summaries. Injected as {{REQUIREMENTS}} when Summary Style = "${label}".</div>` +
        `<textarea id="${id}" class="text_pole textarea_compact" style="${ta}">${content}</textarea></div>`;

    return `<div class="storymode-prompt-editor">
        <p style="margin-bottom: 12px; color: var(--SmartThemeBodyColor); line-height: 1.5;">Customize the prompt template and style-specific requirements for scene summarization.</p>
        <div class="storymode-prompt-tabs" style="display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 2px solid var(--SmartThemeBorderColor);">
            <button class="storymode-prompt-tab active" data-tab="main" style="${activeTabStyle}">Main Template</button>
            <button class="storymode-prompt-tab" data-tab="narrative" style="${inactiveTabStyle}">Narrative Style</button>
            <button class="storymode-prompt-tab" data-tab="bullet" style="${inactiveTabStyle}">Bullet Style</button>
            <button class="storymode-prompt-tab" data-tab="both" style="${inactiveTabStyle}">Both Style</button>
        </div>
        ${mainTab}
        ${styleTabHtml('narrative', 'scene_summary_narrative_input', 'narrative paragraph', esc(narrativeReqs))}
        ${styleTabHtml('bullet', 'scene_summary_bullet_input', 'bullet-point', esc(bulletReqs))}
        ${styleTabHtml('both', 'scene_summary_both_input', 'combined narrative + bullets', esc(bothReqs))}
    </div>`;
}

function buildMainTemplateTab(escapedPrompt, hintBoxStyle, textareaStyle) {
    return `<div class="storymode-prompt-tab-content" data-tab="main">
        <div style="${hintBoxStyle}">
            <div style="margin-bottom: 6px; font-weight: 600; color: var(--SmartThemeBodyColor);">Available Placeholders:</div>
            <div style="color: var(--SmartThemeQuoteColor); line-height: 1.6;">
                <code style="color: var(--sm-accent);">{{CONTEXT}}</code> = Story premise, scene title, phase, purpose<br>
                <code style="color: var(--sm-accent);">{{MESSAGES}}</code> = All dialogue and actions from this scene<br>
                <code style="color: var(--sm-accent);">{{REQUIREMENTS}}</code> = Style-specific instructions (see other tabs)
            </div>
        </div>
        <textarea id="scene_summary_main_input" class="text_pole textarea_compact" style="${textareaStyle}">${escapedPrompt}</textarea>
    </div>`;
}

function bindSceneSummaryTabSwitching() {
    $(document).off('click.sceneSummaryTabs').on('click.sceneSummaryTabs', '.storymode-prompt-tab', function() {
        const tabName = $(this).data('tab');
        $('.storymode-prompt-tab').css({
            'background': 'var(--black30a)',
            'color': 'var(--SmartThemeBodyColor)'
        }).removeClass('active');
        $(this).css({
            'background': 'var(--sm-accent)',
            'color': 'white'
        }).addClass('active');
        $('.storymode-prompt-tab-content').hide();
        $(`.storymode-prompt-tab-content[data-tab="${tabName}"]`).show();
    });
}

function saveSceneSummaryTemplates() {
    const mainTemplate = $('#scene_summary_main_input').val();
    const narrativeTemplate = $('#scene_summary_narrative_input').val();
    const bulletTemplate = $('#scene_summary_bullet_input').val();
    const bothTemplate = $('#scene_summary_both_input').val();

    if (mainTemplate && mainTemplate.trim()) {
        if (!extension_settings[MODULE_NAME].blueprintSettings) {
            extension_settings[MODULE_NAME].blueprintSettings = {};
        }
        extension_settings[MODULE_NAME].blueprintSettings.sceneSummaryPrompt = mainTemplate;
        extension_settings[MODULE_NAME].blueprintSettings.summaryRequirements_narrative = narrativeTemplate;
        extension_settings[MODULE_NAME].blueprintSettings.summaryRequirements_bullet = bulletTemplate;
        extension_settings[MODULE_NAME].blueprintSettings.summaryRequirements_both = bothTemplate;
        saveSettingsDebounced();
        toastr.success('Scene summary templates updated');
    }
}

export function setupCoverGenerationSettings(content) {
    const coverGenerationSettings = [
        { selector: '#cover_gen_enabled', key: 'enabled', transform: v => $(v).is(':checked') },
        { selector: '#cover_auto_generate', key: 'autoGenerate', transform: v => $(v).is(':checked') },
        { selector: '#cover_add_to_gallery', key: 'addToGallery', transform: v => $(v).is(':checked') },
        { selector: '#cover_max_gallery', key: 'maxGallerySize', transform: v => parseInt($(v).val()) || 10 },
        { selector: '#cover_auto_select_latest', key: 'autoSelectLatest', transform: v => $(v).is(':checked') },
        { selector: '#cover_default_quality', key: 'defaultQuality', transform: v => $(v).val() },
        { selector: '#cover_default_aspect', key: 'defaultAspectRatio', transform: v => $(v).val() },
        { selector: '#cover_default_style', key: 'defaultStyle', transform: v => $(v).val() },
        { selector: '#cover_show_prompt', key: 'showPromptOnGenerate', transform: v => $(v).is(':checked') },
        { selector: '#cover_confirm_delete', key: 'confirmDeleteCover', transform: v => $(v).is(':checked') },
        { selector: '#cover_keyboard_nav', key: 'keyboardNavigation', transform: v => $(v).is(':checked') },
        { selector: '#cover_show_counter', key: 'showGalleryCounter', transform: v => $(v).is(':checked') },
    ];

    coverGenerationSettings.forEach(({ selector, key, transform }) => {
        content.find(selector).on('change', function () {
            const settings = extension_settings[MODULE_NAME];
            settings.blueprintSettings = settings.blueprintSettings || {};
            settings.blueprintSettings.coverGeneration = settings.blueprintSettings.coverGeneration || {};
            settings.blueprintSettings.coverGeneration[key] = transform(this);
            saveSettingsDebounced();
            toastr.success('Settings saved');
        });
    });
}

export function setupSceneImageSettings(content) {
    const sceneImageSettings = [
        { selector: '#scene_image_gen_enabled', key: 'enabled', transform: v => $(v).is(':checked') },
        { selector: '#scene_image_gen_auto', key: 'autoGenerate', transform: v => $(v).is(':checked') },
        { selector: '#scene_image_gen_gallery', key: 'addToGallery', transform: v => $(v).is(':checked') },
        { selector: '#scene_image_gen_style', key: 'imageStyle', transform: v => $(v).val() },
        { selector: '#scene_image_custom_prompt', key: 'customStylePrompt', transform: v => $(v).val() },
    ];

    sceneImageSettings.forEach(({ selector, key, transform }) => {
        content.find(selector).on('change', function () {
            const settings = extension_settings[MODULE_NAME];
            settings.imageGeneration = settings.imageGeneration || {};
            settings.imageGeneration[key] = transform(this);
            saveSettingsDebounced();
            toastr.success('Settings saved');
        });
    });

    // Show/hide custom prompt group based on image style selection
    content.find('#scene_image_gen_style').on('change', function () {
        const isCustom = $(this).val() === 'custom';
        $('#scene_image_custom_prompt_group').toggle(isCustom);
    });
}
