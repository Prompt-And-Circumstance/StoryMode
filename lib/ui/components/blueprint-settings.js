/**
 * Blueprint Settings Component for Story Mode Extension
 * Contains the large buildBlueprintSettingsSubtab function
 */

import { extension_settings } from '/scripts/extensions.js';
import { MODULE_NAME } from '../../core/state-manager.js';
import { createHelpIcon, createHelpIconFromLines } from './helpers.js';
import { getCheckedAttrDefaultTrue } from '../component-system.js';

/**
 * Build the Blueprint Settings subtab content.
 * @returns {string} HTML string for blueprint settings subtab
 */
export function buildBlueprintSettingsSubtab() {
    const settings = extension_settings[MODULE_NAME];
    const sceneTransitionNotify = settings.blueprintSettings?.sceneTransitionNotify || 'none';
    const summaryStyle = settings.blueprintSettings?.summaryStyle || 'narrative';
    const beatTrackingEnabled = settings.blueprintSettings?.beatTrackingEnabled !== false;
    return `
<div class="storymode-toggle">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Enable Scenario Blueprints</span>
<span class="storymode-toggle-description">Generate AI-planned story structure with scenes, character arcs, and plot points</span>
</div>
<label class="storymode-switch">
<input type="checkbox" id="blueprint_enabled" ${settings.blueprintSettings?.enabled ? 'checked' : ''}>
<span class="storymode-switch-slider"></span>
</label>
</div>
<div class="storymode-toggle">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Scene Guidance in Prompts</span>
<span class="storymode-toggle-description">Include scene info in AI context</span>
${createHelpIcon('Injects current scene info into each AI response to keep the story on track')}
</div>
<label class="storymode-switch">
<input type="checkbox" id="blueprint_use_scene_prompts" ${settings.blueprintSettings?.useScenePrompts ? 'checked' : ''}>
<span class="storymode-switch-slider"></span>
</label>
</div>
<div class="storymode-toggle">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Beat Progress Tracking</span>
<span class="storymode-toggle-description">Show beat checklists and track completion</span>
${createHelpIconFromLines([
        'Tracks beat completion status within scenes',
        'Shows beat progress in UI and prompts',
        'LLM uses @@BEAT:N@@ markers to mark beats complete'
    ])}
</div>
<label class="storymode-switch">
<input type="checkbox" id="blueprint_beat_tracking" ${beatTrackingEnabled ? 'checked' : ''}>
<span class="storymode-switch-slider"></span>
</label>
</div>

<!-- Debug Mode -->
<div class="storymode-toggle">
    <div class="storymode-toggle-info">
        <span class="storymode-toggle-label">Debug Mode</span>
        <span class="storymode-toggle-description">Adds step/phase info to AI responses for troubleshooting</span>
    </div>
    <label class="storymode-switch">
        <input type="checkbox" id="debug_mode_enabled" ${settings.debugMode ? 'checked' : ''}>
        <span class="storymode-switch-slider"></span>
    </label>
</div>

<!-- Story Controller Panel Mode -->
<div class="storymode-form-group">
    <label class="storymode-form-label">Story Controller Panel ${createHelpIcon('Analyze story pacing and inspect prompt injections')}</label>
    <select id="controller_mode_select" class="storymode-select">
        <option value="disabled" ${!settings.debugPanelEnabled ? 'selected' : ''}>Disabled</option>
        <option value="floating" ${settings.debugPanelEnabled && !settings.debugPanelDocked ? 'selected' : ''}>Floating Overlay</option>
        <option value="docked" ${settings.debugPanelEnabled && settings.debugPanelDocked ? 'selected' : ''}>Docked Panel (Right Nav)</option>
    </select>
    <p class="storymode-form-hint">Choose how the controller panel appears in the UI</p>
</div>

<div class="storymode-form-group">
<label class="storymode-form-label">Scene Transition Notification</label>
<select id="blueprint_scene_transition_notify" class="storymode-select">
<option value="none" ${sceneTransitionNotify === 'none' ? 'selected' : ''}>None (No Notification)</option>
<option value="toastr" ${sceneTransitionNotify === 'toastr' ? 'selected' : ''}>Small Toast (Bottom-Right)</option>
<option value="popup" ${sceneTransitionNotify === 'popup' ? 'selected' : ''}>Popup Dialog (Center)</option>
</select>
<p class="storymode-form-hint">How to notify when AI advances to the next scene using @@NEXT_SCENE@@ marker</p>
</div>

<div class="inline-drawer" id="scene_summarization_drawer">
<div class="inline-drawer-toggle inline-drawer-header">
<h4 class="storymode-section-title" style="margin: 0;">
<i class="fa-solid fa-compress-alt"></i> Scene Summarization
</h4>
<div class="inline-drawer-icon fa-solid interactable down fa-circle-chevron-down" tabindex="0" role="button"></div>
</div>
<div class="inline-drawer-content" style="display: none;">

<div class="storymode-toggle">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Enable Scene Summarization</span>
<span class="storymode-toggle-description">Add condensed scene context to prompts</span>
${createHelpIcon('Generates compressed summaries of past scenes and injects them into AI prompts as additional context. This is separate from SillyTavern\'s built-in chat summarization and does not hide or replace messages.')}
</div>
<label class="storymode-switch">
<input type="checkbox" id="blueprint_summarization_enabled" ${settings.blueprintSettings?.summarizationEnabled ? 'checked' : ''}>
<span class="storymode-switch-slider"></span>
</label>
</div>

<div class="storymode-form-group">
<label class="storymode-form-label">Summarize After ${createHelpIcon('Summarize scenes that are at least N scenes behind the current scene')}</label>
<div style="display: flex; align-items: center; gap: 10px;">
<input type="number" id="blueprint_summarize_after_scenes" class="storymode-input" min="1" max="10" value="${settings.blueprintSettings?.summarizeAfterScenes || 2}" style="width: 80px;">
<span class="storymode-form-hint">scenes behind current</span>
</div>
</div>

<div class="storymode-form-group">
<label class="storymode-form-label">Max Summary Length ${createHelpIcon('Maximum tokens for each scene summary')}</label>
<div style="display: flex; align-items: center; gap: 10px;">
<input type="number" id="blueprint_summary_max_tokens" class="storymode-input" min="100" max="2000" step="50" value="${settings.blueprintSettings?.summaryMaxTokens || 500}" style="width: 100px;">
<span class="storymode-form-hint">tokens max</span>
</div>
</div>

<div class="storymode-toggle">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Include Summaries in Prompts</span>
<span class="storymode-toggle-description">Inject scene summaries into scenario guidance</span>
${createHelpIcon('Adds scene summaries to the AI prompt for context')}
</div>
<label class="storymode-switch">
<input type="checkbox" id="blueprint_include_summaries" ${getCheckedAttrDefaultTrue(settings.blueprintSettings?.includeSummariesInPrompt)}>
<span class="storymode-switch-slider"></span>
</label>
</div>

<div class="storymode-form-group">
<label class="storymode-form-label">Summary Style</label>
<select id="blueprint_summary_style" class="storymode-select">
<option value="narrative" ${summaryStyle === 'narrative' ? 'selected' : ''}>Narrative paragraphs</option>
<option value="bullet" ${summaryStyle === 'bullet' ? 'selected' : ''}>Bullet points</option>
<option value="both" ${summaryStyle === 'both' ? 'selected' : ''}>Both narrative and bullets</option>
</select>
<p class="storymode-form-hint">How should scene summaries be formatted?</p>
</div>

<div class="storymode-form-group">
<label class="storymode-form-label">Scene Summary Prompt Template</label>
<div style="display: flex; gap: 10px; align-items: center;">
<button id="edit_scene_summary_prompt" class="menu_button storymode-btn storymode-btn-secondary" title="Edit the prompt template used for scene summarization">
<i class="fa-solid fa-pencil"></i> Edit Prompt Template
</button>
<span class="storymode-form-hint">Customize the prompt used for generating scene summaries</span>
</div>
</div>

<div class="storymode-form-group" style="margin-top: 12px; padding: 10px; background: var(--black30a); border-radius: 6px; border: 1px solid var(--SmartThemeBorderColor);">
<div style="display: flex; align-items: start; gap: 8px;">
<i class="fa-solid fa-info-circle" style="color: var(--sm-accent); margin-top: 2px;"></i>
<div style="flex: 1;">
<span style="font-size: 0.85em; color: var(--SmartThemeBodyColor); line-height: 1.4;">
<strong>API Configuration:</strong> Scene summaries are generated using the <strong>Summary Profile</strong> configured in the <strong>API Settings</strong> tab. If no profile is selected, the default API will be used.
</span>
</div>
</div>
</div>

</div>
</div>

<div class="inline-drawer" id="cover_generation_drawer">
<div class="inline-drawer-toggle inline-drawer-header">
<h4 class="storymode-section-title" style="margin: 0;">
<i class="fa-solid fa-image"></i> Cover Image Generation
</h4>
<div class="inline-drawer-icon fa-solid interactable down fa-circle-chevron-down" tabindex="0" role="button"></div>
</div>
<div class="inline-drawer-content" style="display: none;">

<div class="storymode-toggle">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Enable Cover Generation</span>
<span class="storymode-toggle-description">Allow generation of cover images using Stable Diffusion</span>
${createHelpIcon('Generate cover images for scenario blueprints using the /sd slash command')}
</div>
<label class="storymode-switch">
<input type="checkbox" id="cover_gen_enabled" ${getCheckedAttrDefaultTrue(settings.blueprintSettings?.coverGeneration?.enabled)}>
<span class="storymode-switch-slider"></span>
</label>
</div>

<div class="storymode-toggle">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Auto-generate on Scenario Blueprint Creation</span>
<span class="storymode-toggle-description">Automatically generate a cover when creating a new scenario blueprint</span>
${createHelpIcon('When enabled, automatically generates a cover image after scenario blueprint creation')}
</div>
<label class="storymode-switch">
<input type="checkbox" id="cover_auto_generate" ${settings.blueprintSettings?.coverGeneration?.autoGenerate ? 'checked' : ''}>
<span class="storymode-switch-slider"></span>
</label>
</div>

<div class="storymode-toggle">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Add to Gallery</span>
<span class="storymode-toggle-description">Keep all generated covers in a navigable gallery</span>
${createHelpIcon('Stores all generated covers so you can browse and select your favorite')}
</div>
<label class="storymode-switch">
<input type="checkbox" id="cover_add_to_gallery" ${getCheckedAttrDefaultTrue(settings.blueprintSettings?.coverGeneration?.addToGallery)}>
<span class="storymode-switch-slider"></span>
</label>
</div>

<div class="storymode-form-group">
<label class="storymode-form-label">Maximum Gallery Size ${createHelpIcon('Oldest covers are removed when limit is exceeded')}</label>
<div style="display: flex; align-items: center; gap: 10px;">
<input type="number" id="cover_max_gallery" class="storymode-input" min="1" max="50" value="${settings.blueprintSettings?.coverGeneration?.maxGallerySize || 10}" style="width: 80px;">
<span class="storymode-form-hint">covers</span>
</div>
</div>

<div class="storymode-toggle">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Auto-select Latest Cover</span>
<span class="storymode-toggle-description">Automatically show the newest generated cover</span>
${createHelpIcon('When enabled, newly generated covers become the active cover')}
</div>
<label class="storymode-switch">
<input type="checkbox" id="cover_auto_select_latest" ${getCheckedAttrDefaultTrue(settings.blueprintSettings?.coverGeneration?.autoSelectLatest)}>
<span class="storymode-switch-slider"></span>
</label>
</div>

<div class="storymode-form-group">
<label class="storymode-form-label">Default Quality</label>
<select id="cover_default_quality" class="storymode-select">
<option value="draft" ${settings.blueprintSettings?.coverGeneration?.defaultQuality === 'draft' ? 'selected' : ''}>Draft (Fast)</option>
<option value="standard" ${settings.blueprintSettings?.coverGeneration?.defaultQuality === 'standard' || !settings.blueprintSettings?.coverGeneration?.defaultQuality ? 'selected' : ''}>Standard</option>
<option value="high" ${settings.blueprintSettings?.coverGeneration?.defaultQuality === 'high' ? 'selected' : ''}>High Quality</option>
</select>
</div>

<div class="storymode-form-group">
<label class="storymode-form-label">Default Aspect Ratio</label>
<select id="cover_default_aspect" class="storymode-select">
<option value="2:3" ${settings.blueprintSettings?.coverGeneration?.defaultAspectRatio === '2:3' || !settings.blueprintSettings?.coverGeneration?.defaultAspectRatio ? 'selected' : ''}>2:3 (Portrait)</option>
<option value="3:4" ${settings.blueprintSettings?.coverGeneration?.defaultAspectRatio === '3:4' ? 'selected' : ''}>3:4 (Portrait)</option>
<option value="1:1" ${settings.blueprintSettings?.coverGeneration?.defaultAspectRatio === '1:1' ? 'selected' : ''}>1:1 (Square)</option>
<option value="16:9" ${settings.blueprintSettings?.coverGeneration?.defaultAspectRatio === '16:9' ? 'selected' : ''}>16:9 (Wide)</option>
</select>
</div>

<div class="storymode-form-group">
<label class="storymode-form-label">Default Style</label>
<select id="cover_default_style" class="storymode-select">
<option value="auto" ${settings.blueprintSettings?.coverGeneration?.defaultStyle === 'auto' || !settings.blueprintSettings?.coverGeneration?.defaultStyle ? 'selected' : ''}>Auto-detect from Genre</option>
<option value="cinematic" ${settings.blueprintSettings?.coverGeneration?.defaultStyle === 'cinematic' ? 'selected' : ''}>Cinematic</option>
<option value="illustration" ${settings.blueprintSettings?.coverGeneration?.defaultStyle === 'illustration' ? 'selected' : ''}>Digital Illustration</option>
<option value="painting" ${settings.blueprintSettings?.coverGeneration?.defaultStyle === 'painting' ? 'selected' : ''}>Oil Painting</option>
<option value="anime" ${settings.blueprintSettings?.coverGeneration?.defaultStyle === 'anime' ? 'selected' : ''}>Anime/Manga</option>
<option value="watercolor" ${settings.blueprintSettings?.coverGeneration?.defaultStyle === 'watercolor' ? 'selected' : ''}>Watercolor</option>
</select>
</div>

<div class="storymode-toggle">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Show Prompt Before Generating</span>
<span class="storymode-toggle-description">Display confirmation dialog with prompt before generation</span>
${createHelpIcon('Shows the prompt that will be used before generating the image')}
</div>
<label class="storymode-switch">
<input type="checkbox" id="cover_show_prompt" ${getCheckedAttrDefaultTrue(settings.blueprintSettings?.coverGeneration?.showPromptOnGenerate)}>
<span class="storymode-switch-slider"></span>
</label>
</div>

<div class="storymode-toggle">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Confirm Before Removing Covers</span>
<span class="storymode-toggle-description">Show confirmation when deleting cover images</span>
${createHelpIcon('Prevents accidental deletion of cover images')}
</div>
<label class="storymode-switch">
<input type="checkbox" id="cover_confirm_delete" ${getCheckedAttrDefaultTrue(settings.blueprintSettings?.coverGeneration?.confirmDeleteCover)}>
<span class="storymode-switch-slider"></span>
</label>
</div>

<div class="storymode-toggle">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Enable Keyboard Navigation</span>
<span class="storymode-toggle-description">Use arrow keys to navigate cover gallery</span>
${createHelpIcon('When enabled, use left/right arrow keys to browse covers when no input is focused')}
</div>
<label class="storymode-switch">
<input type="checkbox" id="cover_keyboard_nav" ${getCheckedAttrDefaultTrue(settings.blueprintSettings?.coverGeneration?.keyboardNavigation)}>
<span class="storymode-switch-slider"></span>
</label>
</div>

<div class="storymode-toggle">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Show Gallery Counter</span>
<span class="storymode-toggle-description">Display "1/5" counter on cover images</span>
${createHelpIcon('Shows the current position in the cover gallery')}
</div>
<label class="storymode-switch">
<input type="checkbox" id="cover_show_counter" ${getCheckedAttrDefaultTrue(settings.blueprintSettings?.coverGeneration?.showGalleryCounter)}>
<span class="storymode-switch-slider"></span>
</label>
</div>

</div>
</div>

<!-- Scene Image Generation -->
<div class="inline-drawer" id="scene_image_generation_drawer">
<div class="inline-drawer-toggle inline-drawer-header">
<h4 class="storymode-section-title" style="margin: 0;">
<i class="fa-solid fa-wand-magic-sparkles"></i> Scene Image Generation
</h4>
<div class="inline-drawer-icon fa-solid interactable down fa-circle-chevron-down" tabindex="0" role="button"></div>
</div>
<div class="inline-drawer-content" style="display: none;">

<div class="storymode-toggle">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Enable Scene Image Generation</span>
<span class="storymode-toggle-description">Generate images for individual scenes using Stable Diffusion</span>
${createHelpIcon('Automatically generate scene images from blueprint context using SD')}
</div>
<label class="storymode-switch">
<input type="checkbox" id="scene_image_gen_enabled" ${settings.imageGeneration?.enabled ? 'checked' : ''}>
<span class="storymode-switch-slider"></span>
</label>
</div>

<div class="storymode-form-group">
<p class="storymode-form-hint" style="margin: 0;">
<i class="fa-solid fa-info-circle"></i>
Scene images use the same SD extension as cover images. Configure it in Extensions → Image Generation.
</p>
</div>

<div class="storymode-toggle">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Auto-generate on Scene Transition</span>
<span class="storymode-toggle-description">Automatically generate images when entering new scenes</span>
${createHelpIcon('When enabled, automatically generates an image for each new scene using @@NEXT_SCENE@@')}
</div>
<label class="storymode-switch">
<input type="checkbox" id="scene_image_gen_auto" ${settings.imageGeneration?.autoGenerate ? 'checked' : ''}>
<span class="storymode-switch-slider"></span>
</label>
</div>

<div class="storymode-toggle">
<div class="storymode-toggle-info">
<span class="storymode-toggle-label">Add to Character Gallery</span>
<span class="storymode-toggle-description">Add generated images to character galleries by default</span>
${createHelpIcon('Automatically add scene images to character galleries when available')}
</div>
<label class="storymode-switch">
<input type="checkbox" id="scene_image_gen_gallery" ${settings.imageGeneration?.addToGallery ? 'checked' : ''}>
<span class="storymode-switch-slider"></span>
</label>
</div>

<div class="storymode-form-group">
<label class="storymode-form-label">Image Style</label>
<select id="scene_image_gen_style" class="storymode-select">
<option value="auto" ${settings.imageGeneration?.imageStyle === 'auto' || !settings.imageGeneration?.imageStyle ? 'selected' : ''}>Auto (from blueprint tone)</option>
<option value="custom" ${settings.imageGeneration?.imageStyle === 'custom' ? 'selected' : ''}>Custom Style</option>
</select>
<p class="storymode-form-hint">Auto style adapts to blueprint tone and narrative voice</p>
</div>

<div class="storymode-form-group" id="scene_image_custom_prompt_group" style="display: ${settings.imageGeneration?.imageStyle === 'custom' ? 'block' : 'none'};">
<label class="storymode-form-label">Custom Style Prompt</label>
<textarea id="scene_image_custom_prompt" class="storymode-textarea" rows="3" placeholder="e.g., oil painting, dramatic lighting, cinematic composition">${settings.imageGeneration?.customStylePrompt || ''}</textarea>
<p class="storymode-form-hint">Additional style modifiers to apply to all generated images</p>
</div>

</div>
</div>

`;
}
