# CLAUDE.md

Quick reference for Claude Code when working with this repository.

## Project Overview

Story Mode is a SillyTavern extension providing narrative structure through three-act story arc progression and author style emulation. Injects context-aware prompts to guide AI narration.

## Documentation Index

| Document | Purpose | When to Read |
|----------|---------|--------------|
| **CLAUDE.md** (this file) | Quick reference, patterns, limitations | Always loaded |
| **[ARCHITECTURE.md](./ARCHITECTURE.md)** | System design, data flow, state management | Modifying core logic, understanding pacing modes |
| **[CHARACTERS-AND-PERSONAS.md](./CHARACTERS-AND-PERSONAS.md)** | Character/persona data flow, export/import, status detection | Modifying character linking, import, or editor |
| **[CODEINDEX.md](./CODEINDEX.md)** | File structure, module dependencies, imports | Finding files, understanding module relationships |
| **[Planning/README.md](./Planning/README.md)** | Active/completed plans, feature roadmap | Planning new features |

## Quick Architecture Summary

**Two Pacing Modes** (see [ARCHITECTURE.md](./ARCHITECTURE.md) for details):
- **Story Mode**: Round-based, `currentStep++` on user message, 33% phase boundaries
- **Scenario Mode**: Signal-based (`@@BEAT:N@@`, `@@NEXT_SCENE@@`), blueprint-driven

**Key Entry Points:**
- `index.js` - Main entry, UI setup, event wiring
- `lib/core/event-handlers.js` - Message events, signal parsing
- `lib/blueprint/module.js` - Blueprint operations, re-exports extracted modules

**Extracted Blueprint Modules** (from module.js for maintainability):
- `lib/blueprint/injection.js` - Blueprint prompt injection XML builder
- `lib/blueprint/scene-pacing.js` - Scene pacing calculations
- `lib/blueprint/summarization.js` - Scene summarization logic

**Blueprint Storage** (file-backed, browser-agnostic):
- `lib/blueprint/file-api.js` - SillyTavern `/api/files/*` wrapper
- `lib/blueprint/manifest.js` - Lightweight JSON index for library listing
- `lib/blueprint/file-storage.js` - Save/load blueprints as PNG files
- `lib/blueprint/library-adapter.js` - Drop-in replacement for IndexedDB library

## Code Patterns

### Document-Level Event Delegation
For dynamic content (popups), attach to document with **namespaced events** to prevent stacking:
```javascript
// Clean up before re-binding to prevent duplicate handlers
$(document).off('click.myNamespace');

// Use namespaced event
$(document).on('click.myNamespace', '[data-field]', function(e) {
    if (!$(this).closest('.my-editor-container').length) return;
    // Handle event
});
```

### Re-export Pattern for Extracted Modules
When functions are extracted to separate files, use **import-then-export** (not direct re-export):
```javascript
// ✅ CORRECT - creates local binding for use in default export
import { getScenePacingInfo, getCurrentScene } from './scene-pacing.js';
export { getScenePacingInfo, getCurrentScene };

// ❌ WRONG - no local binding, causes ReferenceError if used in default export
export { getScenePacingInfo } from './scene-pacing.js';
```
Direct re-exports don't create local variables. If the function is referenced elsewhere in the file (e.g., in a default export object), you'll get a ReferenceError.

### UI Button Loading State
```javascript
content.on('click', '#my_button', async function() {
    const btn = $(this);
    const originalText = btn.html();

    btn.prop('disabled', true);
    btn.html('<i class="fa-solid fa-circle-notch fa-spin"></i> Generating...');
    LoadingIndicator.show('Processing...');

    try {
        const result = await someAsyncOperation();
        if (result.success) {
            toastr.success('Completed');
        } else {
            toastr.error(`Failed: ${result.error}`);
        }
    } catch (error) {
        console.error('[Story Mode] Error:', error);
        toastr.error(`Failed: ${error.message}`);
    } finally {
        LoadingIndicator.hide();
        btn.prop('disabled', false);
        btn.html(originalText);
    }
});
```

### Prompt Template Variables
Replace `{currentStep}`, `{phase}`, `{percent}`, `{arcLength}` using `String.replace()`.

### SillyTavern Popup API
```javascript
const popup = new Popup(html, POPUP_TYPE.TEXT, 'Title', {
    okButton: false,           // Hide OK button
    cancelButton: false,       // Hide Cancel button
    wide: true,                // Wide horizontal width (~80% viewport)
    large: true,               // Tall vertical height (~80% viewport)
    allowVerticalScrolling: true,
});
```
- Use `large: true` for content-heavy modals (forms, long lists)
- Always use `wide: true` for blueprints/wizards

### Library In-Place View Switching
```javascript
// Show generate form (sets context flag for return navigation)
content.data('generateFromLibrary', true);
showLibraryGenerateView(content);

// Return to grid (helper clears flag and switches view)
function returnToLibraryIfNeeded() {
    const wasFromLibrary = content.data('generateFromLibrary');
    if (wasFromLibrary) {
        content.removeData('generateFromLibrary');
        showLibraryGridView(content);
        return true;
    }
    return false;
}
```

### Accessing SillyTavern Context and Globals

**CRITICAL: Use proper imports, NOT `window.getContext()`**

SillyTavern provides global state through ES6 imports, not through a context object. Using `window.getContext()` is unreliable and often returns undefined/incomplete data.

**✓ CORRECT - Use direct imports:**
```javascript
// Character data and current character
import { characters, this_chid } from '/script.js';

// Group chat data
import { groups, selected_group } from '/scripts/group-chats.js';

// Chat messages and message utilities
import { chat, addOneMessage, system_message_types } from '/script.js';

// Extension context (for settings and saveChat)
import { getContext } from '/scripts/extensions.js';

// File upload utilities
import { saveBase64AsFile, getFileExtension } from '/scripts/utils.js';
```

**✗ WRONG - Do NOT use:**
```javascript
const { getContext } = window;  // Unreliable, often undefined
const context = getContext?.();  // Properties may be missing/stale
```

**Common use cases:**

| Task | Use This |
|------|----------|
| Get current character | `characters[this_chid]` |
| Check if group chat | `selected_group !== null` |
| Get group members | `groups.find(g => g.id === selected_group)?.members` |
| Access chat messages | `chat` (array) or `window.chat` |
| Add message to UI | `addOneMessage(message, options)` |
| Save chat | `getContext().saveChat()` or `window.saveChat()` |
| Upload to gallery | `saveBase64AsFile(base64, folder, name, ext)` |

**Character gallery folders:**
- Character `avatar` property includes extension (e.g., `"Julie.png"`)
- Gallery folders do NOT include extension (use `"Julie"`)
- Strip extension: `avatar.replace(/\.[^.]+$/, '')`

## Debug Commands

Mock LLM calls for testing wizard flow without API costs:
```javascript
// Enable all mocks (blueprint generation + cover generation)
window.StoryModeDebug.enableAll()

// Disable all mocks
window.StoryModeDebug.disableAll()

// Individual toggles
window.StoryModeDebug.setBlueprintDebug(true/false)
window.StoryModeDebug.setCoverDebug(true/false)
```

Audit event handlers for broken bindings (run with settings dialog open):
```javascript
// Check for handlers using direct binding on non-existent elements
window.StoryModeDebug.auditHandlers()

// Include lazy-loaded subtab content in the check
window.StoryModeDebug.auditHandlers({ includeSubtabs: true })

// Show all handlers (not just broken ones)
window.StoryModeDebug.auditHandlers({ showAll: true })
```

## Code Style

- JSDoc comments (`/**`)
- `async function functionName(paramName)` format
- Template literals for HTML
- jQuery for DOM manipulation
- Async/await throughout
- Console logs with `[Story Mode]` prefix

## Testing Checklist

### Story Mode (Round-Based)
1. Test 1:1 and group chat scenarios
2. Verify rounds only increment on user messages
3. Check arc completion triggers at `currentStep >= arcLength`
4. Check regeneration/swipe doesn't increment rounds

### Scenario Mode (Signal-Based)
5. Start story from blueprint → verify `pacingMode === 'scenario'`
6. LLM emits `@@BEAT:0@@` → verify beat marked complete in UI
7. LLM emits `@@NEXT_SCENE@@` → verify scene advances
8. Verify signals stripped from displayed message
9. Controller panel shows Act X/Y (not Round)

### General
10. Test wand menu controls
11. Verify persistence across chat changes
12. Verify modules load without errors
13. Check both state locations stay in sync
14. Run `window.StoryModeDebug.auditHandlers()` → verify 0 broken handlers

### Blueprint Library (File-Backed)
14. Create blueprint via wizard → saves to library
15. Edit blueprint → title/changes persist after refresh
16. Favorite toggle → persists after refresh
17. Delete blueprint → removed from manifest and disk
18. Import PNG → preserves cover quality (no re-encoding)
19. Different browser → same library visible (file storage is cross-browser)

### Scene Summarization (Advanced)
20. Enable scene summarization in Blueprint Settings
21. Scene transition → verify summary generated and stored
22. Check summary appears in chat or lorebook (depending on config)
23. Verify summarization API profile is used when configured

### Cover/Scene Image Generation (Advanced)
24. Generate cover during wizard → verify image appears in preview
25. Generate cover from editor Cover tab → verify gallery updates
26. Navigate gallery → previous/next images work correctly
27. Delete cover from gallery → verify removal
28. Scene image generation (if SD configured) → verify image appears
29. Scene transition with auto-generate → verify preview popup appears automatically
30. Start story from library → verify cover appears in controller panel

### Epilogue & Summary Generation
29. Arc completes with auto-epilogue enabled → epilogue message appears
30. Arc completes with auto-summary enabled → summary generated
31. Manual "Generate Summary" from wand menu → summary appears
32. Manual "Generate Epilogue" from wand menu → epilogue appears

### Missing Style Handling
33. Load blueprint with missing story type (embedded) → warning shown, "Add" imports it
34. Load blueprint with missing author style (embedded) → warning shown, "Add" imports it
35. Load blueprint with missing story type (NOT embedded) → warning dialog shown, form opens with ID prefilled
36. Load blueprint with missing author style (NOT embedded) → warning dialog shown, form opens with ID prefilled
37. Both story type AND author style missing (not embedded) → forms shown in succession

## Known Limitations

### Architecture Issues (v1)
- **Dual scene index storage:** `chatState.scenario.currentSceneIndex` and `blueprintState.currentSceneIndex` can drift out of sync
- **Beat state duplication:** `scenario.beatState` (new) vs `beatProgress` (legacy) track differently
- **No UI for mode switching:** Users cannot toggle between Story/Scenario modes manually

### Stub Functions (v2 placeholders)
- `resolvePlaceholders()` - returns text unchanged (no placeholder resolution)
- `checkPrerequisites()` - always returns true (no prerequisite checking)

### GLM 4.7 Reasoning Parameter Error

**Symptom:** Blueprint generation fails with:
```
Bad Request {"error":{"message":"Invalid option: expected one of \"xhigh\"|\"high\"|\"medium\"|\"low\"|\"minimal\"|\"none\"","code":400}}
```

**Cause:** SillyTavern presets with `reasoning: { effort: 'auto' }` - GLM 4.7 needs explicit effort levels.

**Automatic Fix:** `generateWithPreset()` in `lib/generation/orchestration.js` retries with `includePreset: false` and `reasoning: { effort: 'high' }`.

**Manual Fix:** Edit connection profile preset, change reasoning effort from "auto" to "high".

### General
- Phase boundaries fixed at 33%
- No nested/branching arcs
- Story types manually selected
- Regeneration edge cases partially addressed
