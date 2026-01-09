/**
 * DEBUG: Test Data Loader for Blueprint Module
 *
 * This file contains a debugging utility for loading test blueprint data
 * without calling the LLM API. Useful for testing the save/load functionality.
 *
 * HOW TO RE-ENABLE THIS FEATURE:
 *
 * 1. Add the button to ui-components.js in buildGenerateBlueprintSubtab():
 *    Find the "Action Buttons" section and add this button after blueprint_generate_btn:
 *
 *    <button id="blueprint_test_data_btn" class="menu_button storymode-btn storymode-btn-secondary"
 *            title="Use test data to verify save functionality (for debugging)">
 *        <i class="fa-solid fa-flask"></i> Use Test Data
 *    </button>
 *
 * 2. Add POPUP_RESULT to the imports in index.js:
 *    import { callGenericPopup, Popup, POPUP_TYPE, POPUP_RESULT } from '/scripts/popup.js';
 *
 * 3. Add the handler below to index.js, after the blueprint_generate_btn handler
 *    and before the blueprint_import_btn handler.
 *
 * USAGE:
 * - Click "Use Test Data" button in Blueprint > Generate Blueprint tab
 * - Paste either:
 *   a) Raw blueprint JSON object
 *   b) Full API response object (with choices[0].message.content)
 *   c) Console.log output (handles "Chat Completion response:" prefix and JS notation)
 * - The handler will parse, normalize, validate, and save the blueprint
 * - Select an author style in the dropdown before loading to inject it into the blueprint
 */

// ============================================================================
// BUTTON HTML (for ui-components.js buildGenerateBlueprintSubtab)
// ============================================================================
/*
<button id="blueprint_test_data_btn" class="menu_button storymode-btn storymode-btn-secondary" title="Use test data to verify save functionality (for debugging)">
<i class="fa-solid fa-flask"></i> Use Test Data
</button>
*/

// ============================================================================
// HANDLER CODE (for index.js - place after blueprint_generate_btn handler)
// ============================================================================
/*
// Test Data button handler - for development/debugging (Generate Blueprint subtab)
content.on('click', '#blueprint_test_data_btn', async function() {
try {
// Prompt user for JSON input - create DOM element to preserve reference
const wrapper = document.createElement('div');
wrapper.innerHTML = `
<h3>Paste Test Blueprint Data</h3>
<p style="margin-bottom: 10px; color: var(--SmartThemeBodyColor);">
Paste either a raw blueprint JSON or an API response object (with choices[0].message.content).
</p>
<textarea id="test_blueprint_json" class="text_pole" style="width: 100%; height: 300px; font-family: monospace; font-size: 0.85em;" placeholder='{"story_type_id": "...", "core_premise": "...", ...}'></textarea>
`;
const textArea = wrapper.querySelector('#test_blueprint_json');
const confirmed = await callGenericPopup(wrapper, POPUP_TYPE.CONFIRM, '', {
wide: true,
okButton: 'Load Test Data',
cancelButton: 'Cancel',
});
if (confirmed !== POPUP_RESULT.AFFIRMATIVE) {
return;
}
// Get value from our reference to the textarea element
let rawInput = textArea?.value?.trim();
if (!rawInput) {
toastr.warning('No data provided');
return;
}
// Strip any prefix text before the first { (e.g., "Chat Completion response:")
const firstBrace = rawInput.indexOf('{');
if (firstBrace > 0) {
console.log('[Story Mode] Stripping prefix text before JSON object');
rawInput = rawInput.substring(firstBrace);
}
let blueprintJson;
try {
let parsed;
try {
// First try standard JSON parse
parsed = JSON.parse(rawInput);
} catch (jsonError) {
// If that fails, try to evaluate as JavaScript object literal
// This handles console.log output with single quotes and unquoted keys
console.log('[Story Mode] JSON parse failed, trying eval for JS object notation');
// Use Function constructor instead of eval for slightly better safety
parsed = (new Function('return ' + rawInput))();
}
// Check if this is an API response format (has choices array)
if (parsed.choices && Array.isArray(parsed.choices) && parsed.choices[0]?.message?.content) {
console.log('[Story Mode] Detected API response format, extracting content');
const contentStr = parsed.choices[0].message.content;
// The content might be a string that needs parsing
blueprintJson = typeof contentStr === 'string' ? JSON.parse(contentStr) : contentStr;
} else {
// Assume it's already a blueprint object
blueprintJson = parsed;
}
} catch (parseError) {
toastr.error(`Parse error: ${parseError.message}`, 'Invalid Data');
return;
}
// Normalize and validate the blueprint
const normalizedBlueprint = BlueprintModule.normalizeBlueprint(blueprintJson);
const validation = BlueprintModule.validateBlueprint(normalizedBlueprint);
if (!validation.valid) {
toastr.error(`Validation errors: ${validation.errors.join(', ')}`, 'Invalid Blueprint');
return;
}
// Assign a new ID if needed
if (!normalizedBlueprint.blueprint_id) {
normalizedBlueprint.blueprint_id = BlueprintModule.generateBlueprintId();
}
// Inject author style from form dropdown if blueprint doesn't have one
// This mirrors what the normal generation flow does
const selectedAuthorStyleId = content.find('#blueprint_author_style').val();
if (!normalizedBlueprint.author_style && selectedAuthorStyleId) {
normalizedBlueprint.author_style = selectedAuthorStyleId;
// Also inject author style name and prompt
const authorStyleObj = authorStyles.find(s => s.id === selectedAuthorStyleId);
if (authorStyleObj) {
normalizedBlueprint.author_style_name = authorStyleObj.name;
normalizedBlueprint.author_style_prompt = authorStyleObj.authorPrompt;
}
console.log('[Story Mode] Injected author_style from form:', selectedAuthorStyleId);
}
console.log('[Story Mode] Test data loaded:', normalizedBlueprint);
// Save blueprint to state (same flow as generate)
const blueprintState = BlueprintModule.getBlueprintState();
blueprintState.blueprint = normalizedBlueprint;
blueprintState.useBlueprint = true;
blueprintState.currentSceneIndex = 0;
blueprintState.sceneMode = 'auto';
await BlueprintModule.saveBlueprintState(blueprintState);
// Sync blueprint settings to chat state
await BlueprintModule.syncBlueprintSettings(normalizedBlueprint, true);
toastr.success(`Test blueprint loaded with ${normalizedBlueprint.scene_plan?.length || 0} scenes!`, 'Test Data Loaded');
// Switch to Overview tab
content.find('.storymode-blueprint-subtab[data-subtab="overview"]').click();
// Refresh sidebar
refreshSidebar(content);
updateStatusDisplay();
} catch (error) {
console.error('[Story Mode] Test data error:', error);
toastr.error(`Error: ${error.message}`, 'Test Data Failed');
}
});
*/
