/**
 * Handler Audit Utility
 *
 * Detects event handlers that use direct binding (content.find().on())
 * on elements that don't exist when the settings dialog opens.
 *
 * Usage:
 *   1. Open the Story Mode settings dialog
 *   2. Run in browser console:
 *      import('/scripts/extensions/third-party/Extension-StoryMode/lib/debug/handler-audit.js')
 *        .then(m => m.auditHandlers())
 *
 *   Or use the debug command:
 *      window.StoryModeDebug.auditHandlers()
 */

/**
 * All selectors that use direct binding in settings-handlers.js
 * Format: { selector, line, event, description }
 */
const DIRECT_BINDING_HANDLERS = [
    { selector: '#story_type_select', line: 287, event: 'change', description: 'Story type dropdown' },
    { selector: '#arc_length_slider', line: 319, event: 'input', description: 'Arc length slider' },
    { selector: '#arc_length_value', line: 322, event: 'change', description: 'Arc length input' },
    { selector: '#author_style_enabled', line: 327, event: 'change', description: 'Author style toggle' },
    { selector: '#default_author_style_select', line: 337, event: 'change', description: 'Default author style dropdown' },
    { selector: '#author_style_select', line: 345, event: 'change', description: 'Author style dropdown' },
    { selector: '#character_author_style_select', line: 362, event: 'change', description: 'Character author style dropdown' },
    { selector: '#save_character_author_style_btn', line: 367, event: 'click', description: 'Save character author style button' },
    { selector: '#group_author_style_select', line: 418, event: 'change', description: 'Group author style dropdown' },
    { selector: '#save_group_author_style_btn', line: 423, event: 'click', description: 'Save group author style button' },
    { selector: '#nsfw_enabled', line: 454, event: 'change', description: 'NSFW toggle' },
    { selector: '#epilogue_enabled', line: 462, event: 'change', description: 'Epilogue toggle' },
    { selector: '#summary_enabled', line: 469, event: 'change', description: 'Summary toggle' },
    { selector: '#next_adventure_enabled', line: 476, event: 'change', description: 'What\'s Next toggle' },
    { selector: '#summary_message_count_slider', line: 483, event: 'input', description: 'Summary message count slider' },
    { selector: '#debug_mode_enabled', line: 492, event: 'change', description: 'Debug mode toggle' },
    { selector: '#controller_mode_select', line: 500, event: 'change', description: 'Controller mode dropdown' },
    { selector: '#injection_position', line: 519, event: 'change', description: 'Injection position dropdown' },
    { selector: '#injection_depth', line: 525, event: 'change', description: 'Injection depth dropdown' },
    { selector: '#injection_role', line: 531, event: 'change', description: 'Injection role dropdown' },
    { selector: '#sidebar_reset_arc_btn', line: 543, event: 'click', description: 'Sidebar reset arc button' },
    { selector: '#blueprint_enabled, #blueprint_enabled_tab', line: 561, event: 'change', description: 'Blueprint enabled toggles' },
    { selector: '#blueprint_use_scene_prompts', line: 575, event: 'change', description: 'Use scene prompts toggle' },
    { selector: '#blueprint_beat_tracking', line: 586, event: 'change', description: 'Beat tracking toggle' },
    { selector: '#blueprint_inject_missing_characters', line: 593, event: 'change', description: 'Inject missing characters toggle' },
    { selector: '#blueprint_scene_transition_notify', line: 597, event: 'change', description: 'Scene transition notify dropdown' },
    { selector: '#blueprint_summarization_enabled', line: 609, event: 'change', description: 'Summarization enabled toggle' },
    { selector: '#blueprint_summarize_after_scenes', line: 610, event: 'change', description: 'Summarize after scenes input' },
    { selector: '#blueprint_summary_max_tokens', line: 611, event: 'change', description: 'Summary max tokens input' },
    { selector: '#blueprint_include_summaries', line: 612, event: 'change', description: 'Include summaries toggle' },
    { selector: '#blueprint_summary_style', line: 613, event: 'change', description: 'Summary style dropdown' },
    { selector: '#edit_scene_summary_prompt', line: 648, event: 'click', description: 'Edit scene summary prompt button' },
    { selector: '#cover_gen_enabled', line: 797, event: 'change', description: 'Cover generation enabled toggle' },
    { selector: '#cover_auto_generate', line: 798, event: 'change', description: 'Cover auto-generate toggle' },
    { selector: '#cover_add_to_gallery', line: 799, event: 'change', description: 'Cover add to gallery toggle' },
    { selector: '#cover_max_gallery', line: 800, event: 'change', description: 'Cover max gallery input' },
    { selector: '#cover_auto_select_latest', line: 801, event: 'change', description: 'Cover auto-select latest toggle' },
    { selector: '#cover_default_quality', line: 802, event: 'change', description: 'Cover default quality dropdown' },
    { selector: '#cover_default_aspect', line: 803, event: 'change', description: 'Cover default aspect dropdown' },
    { selector: '#cover_default_style', line: 804, event: 'change', description: 'Cover default style dropdown' },
    { selector: '#cover_show_prompt', line: 805, event: 'change', description: 'Cover show prompt toggle' },
    { selector: '#cover_confirm_delete', line: 806, event: 'change', description: 'Cover confirm delete toggle' },
    { selector: '#cover_keyboard_nav', line: 807, event: 'change', description: 'Cover keyboard nav toggle' },
    { selector: '#cover_show_counter', line: 808, event: 'change', description: 'Cover show counter toggle' },
    { selector: '#scene_image_gen_enabled', line: 824, event: 'change', description: 'Scene image gen enabled toggle' },
    { selector: '#scene_image_gen_auto', line: 825, event: 'change', description: 'Scene image gen auto toggle' },
    { selector: '#scene_image_gen_gallery', line: 826, event: 'change', description: 'Scene image gen gallery toggle' },
    { selector: '#scene_image_gen_style', line: 827, event: 'change', description: 'Scene image gen style dropdown' },
    { selector: '#scene_image_custom_prompt', line: 828, event: 'change', description: 'Scene image custom prompt input' },
    { selector: '#blueprint_generation_api', line: 847, event: 'change', description: 'Blueprint generation API dropdown' },
    { selector: '#opening_message_api', line: 856, event: 'change', description: 'Opening message API dropdown' },
    { selector: '#epilogue_api', line: 865, event: 'change', description: 'Epilogue API dropdown' },
    { selector: '#summary_api', line: 873, event: 'change', description: 'Summary API dropdown' },
    { selector: '#next_adventure_api', line: 881, event: 'change', description: 'What\'s Next API dropdown' },
    { selector: '#reset_arc_btn', line: 890, event: 'click', description: 'Reset arc button' },
    { selector: '#import_blueprint_btn', line: 1021, event: 'click', description: 'Import blueprint button' },
];

/**
 * Check if an element exists in the current DOM
 * @param {string} selector - CSS selector (may contain multiple selectors separated by comma)
 * @returns {Object} { found: boolean, count: number }
 */
function checkSelector(selector) {
    // Handle comma-separated selectors
    const selectors = selector.split(',').map(s => s.trim());
    let totalCount = 0;

    for (const sel of selectors) {
        const elements = document.querySelectorAll(sel);
        totalCount += elements.length;
    }

    return { found: totalCount > 0, count: totalCount };
}

/**
 * Audit all direct-binding handlers and report which elements are missing
 * @param {Object} options
 * @param {boolean} options.showAll - Show all handlers, not just broken ones
 * @param {boolean} options.includeSubtabs - Also check elements in subtabs by clicking through them
 * @returns {Object} Audit results
 */
export async function auditHandlers(options = {}) {
    const { showAll = false, includeSubtabs = false } = options;

    // Check if settings dialog is open
    const settingsDialog = document.querySelector('.storymode-unified-modal');
    if (!settingsDialog) {
        console.error('[Handler Audit] Settings dialog not found. Please open Story Mode settings first.');
        console.log('Run: window.showStoryModeSettings()');
        return null;
    }

    console.log('%c[Handler Audit] Checking direct-binding handlers...', 'color: #4a9eff; font-weight: bold;');
    console.log(`Total handlers to check: ${DIRECT_BINDING_HANDLERS.length}`);

    const results = {
        found: [],
        missing: [],
        timestamp: new Date().toISOString(),
    };

    // Initial check (visible content only)
    for (const handler of DIRECT_BINDING_HANDLERS) {
        const check = checkSelector(handler.selector);
        const result = { ...handler, ...check };

        if (check.found) {
            results.found.push(result);
        } else {
            results.missing.push(result);
        }
    }

    // If requested, click through subtabs to check lazy-loaded content
    if (includeSubtabs) {
        console.log('%c[Handler Audit] Clicking through subtabs to check lazy-loaded content...', 'color: #ffa500;');

        const subtabs = settingsDialog.querySelectorAll('.storymode-settings-subtab, .storymode-tab');
        for (const tab of subtabs) {
            tab.click();
            await new Promise(r => setTimeout(r, 100)); // Wait for render
        }

        // Re-check missing handlers after visiting all tabs
        const stillMissing = [];
        for (const handler of results.missing) {
            const check = checkSelector(handler.selector);
            if (check.found) {
                results.found.push({ ...handler, ...check, foundAfterTabSwitch: true });
            } else {
                stillMissing.push(handler);
            }
        }
        results.missing = stillMissing;
    }

    // Report results
    console.log('\n%c═══════════════════════════════════════════════════════════', 'color: #888;');

    if (results.missing.length > 0) {
        console.log(`%c⚠️  BROKEN HANDLERS (${results.missing.length})`, 'color: #ff6b6b; font-weight: bold; font-size: 14px;');
        console.log('%cThese elements do not exist when handlers are registered:', 'color: #ff6b6b;');
        console.table(results.missing.map(h => ({
            Selector: h.selector,
            Event: h.event,
            Description: h.description,
            Line: h.line,
        })));

        console.log('\n%cSuggested fix for each:', 'color: #ffa500; font-weight: bold;');
        for (const h of results.missing) {
            console.log(`%cLine ${h.line}:`, 'color: #888;');
            console.log(`  %c- content.find('${h.selector}').on('${h.event}', ...)`, 'color: #ff6b6b; text-decoration: line-through;');
            console.log(`  %c+ content.on('${h.event}', '${h.selector}', ...)`, 'color: #4ade80;');
        }
    } else {
        console.log('%c✅ All handlers have matching elements!', 'color: #4ade80; font-weight: bold; font-size: 14px;');
    }

    if (showAll && results.found.length > 0) {
        console.log(`\n%c✓ Working handlers (${results.found.length})`, 'color: #4ade80;');
        console.table(results.found.map(h => ({
            Selector: h.selector,
            Event: h.event,
            Description: h.description,
            Count: h.count,
            LazyLoaded: h.foundAfterTabSwitch ? 'Yes' : 'No',
        })));
    }

    console.log('%c═══════════════════════════════════════════════════════════', 'color: #888;');
    console.log(`Summary: ${results.found.length} working, ${results.missing.length} broken`);

    return results;
}

/**
 * Generate fix code for all broken handlers
 * @returns {string} Code snippet to fix broken handlers
 */
export async function generateFixes() {
    const results = await auditHandlers({ includeSubtabs: true });
    if (!results || results.missing.length === 0) {
        console.log('No fixes needed!');
        return '';
    }

    let fixes = '// Fixes for broken handlers (change from direct binding to event delegation)\n\n';

    for (const h of results.missing) {
        fixes += `// Line ${h.line}: ${h.description}\n`;
        fixes += `// OLD: content.find('${h.selector}').on('${h.event}', handler);\n`;
        fixes += `// NEW: content.on('${h.event}', '${h.selector}', handler);\n\n`;
    }

    console.log(fixes);
    return fixes;
}

// Auto-register with StoryModeDebug if available
if (typeof window !== 'undefined') {
    window.StoryModeDebug = window.StoryModeDebug || {};
    window.StoryModeDebug.auditHandlers = auditHandlers;
    window.StoryModeDebug.generateHandlerFixes = generateFixes;

    console.log('[Handler Audit] Loaded. Use window.StoryModeDebug.auditHandlers() after opening settings dialog.');
}

export default { auditHandlers, generateFixes, DIRECT_BINDING_HANDLERS };
