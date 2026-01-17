# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## Project Overview

Story Mode is a SillyTavern extension providing narrative structure through three-act story arc progression and author style emulation. Injects context-aware prompts to guide AI narration.

## Architecture

### Core Concepts

**Rounds:** Increment on USER message submission (not AI response). Enables group chat where multiple AI characters respond per round.

**Three-Act Structure:** Fixed 33% phase boundaries:
- Setup (0-33%): World-building, character introduction
- Confrontation (34-66%): Escalating challenges
- Resolution (67-100%): Climax and conclusion

### Key Files

| File | Lines | Purpose |
|------|-------|---------|
| `index.js` | ~1.4k | Main orchestrator, settings dialog, initialization |
| `lib/state-manager.js` | ~450 | Settings, chat state, data loading/storage |
| `lib/arc-engine.js` | ~200 | Phase calculation, prompt building |
| `lib/ui-components.js` | ~900 | HTML rendering, UI components |
| `lib/type-editors.js` | ~938 | Story type and author style CRUD |
| `lib/event-handlers.js` | ~414 | Message events, round progression |
| `lib/wand-menu.js` | ~250 | Quick controls dropdown |
| `lib/blueprint-module.js` | ~2.7k | Story Blueprints feature |
| `lib/blueprint-schema.js` | ~420 | Blueprint schema, validation (single source of truth) |
| `lib/blueprint-editor.js` | ~1.8k | Split-panel blueprint editor |
| `lib/loading-indicator.js` | ~300 | Standalone loading indicator |
| `data/story_types.json` | - | 40+ story type definitions |
| `data/author_styles.json` | - | 40+ author style definitions |

### Module Dependencies

```
state-manager.js (no internal deps)
    ↓
arc-engine.js (imports state-manager)
    ↓
ui-components.js (imports state-manager, arc-engine, blueprint-module)
    ↓
type-editors.js (imports state-manager, ui-components)
    ↓
event-handlers.js (imports state-manager, arc-engine, blueprint-module)
    ↓
wand-menu.js (imports state-manager, event-handlers)
    ↓
index.js (imports all, orchestrates)
```

**State Management:** `state-manager.js` owns data arrays. Use getters/setters: `getStoryTypes()`, `setStoryTypes()`, `getAuthorStyles()`, `setAuthorStyles()`.

**Legacy window exports:** For backward compatibility with blueprint-module.js:
- `window.updateStatusDisplay`, `window.updateStoryPrompt`, `window.refreshBlueprintPreview`
- `window.setupEventListeners`, `window.updateStoryTypeDropdown`, `window.updateAuthorStyleDropdown`

### Extension Integration

**Events:**
```javascript
eventSource.on(event_types.GENERATION_STARTED, ...)      // Clear flags, update prompt
eventSource.on(event_types.USER_MESSAGE_RENDERED, ...)   // Round increment (user message)
eventSource.on(event_types.MESSAGE_RECEIVED, ...)        // Arc completion checks (AI message)
eventSource.on(event_types.CHAT_CHANGED, ...)            // Reload state
eventSource.on(event_types.MESSAGE_REGENERATED, ...)     // Set regeneration flag
```

**CSS Loading:** SillyTavern loads ES6 modules **without bundling**. Use `@import url()` in `style.css`, not `import './file.css'` in JS.

### State Storage

1. **Global Settings** (`extension_settings.story_mode`): Config, defaults, persists across sessions
2. **Per-Chat State** (`chat_metadata.story_mode`): `currentStep`, `arcLength`, `selectedStoryType`, `selectedAuthorStyle`, boolean flags
3. **Content Storage** (localForage): Story types and author styles, with JSON fallback

### Data Flow

```
User sends message → onMessageReceived() → handleUserMessageStep() → saveChatStoryState()
→ updateStoryPrompt() → buildFullInjection() → setExtensionPrompt()
```

### Round-Based Progression

**Critical:** Rounds increment on USER message, not AI response (supports group chat).

**Edge Cases:**
- `isLoadingChat` - prevents increment during chat load
- `isRegenerating` - prevents increment during regeneration/swipe
- `currentStep >= arcLength` - triggers arc completion

**Implementation:** `handleUserMessageStep()` in `lib/event-handlers.js`

### Arc Completion

When `currentStep >= arcLength`: `handleArcCompletion()` generates epilogue/summary/end notice (each once, protected by flags).

## Story Blueprints

LLM-generated story structure with scenes, character arcs, antagonistic forces, and resolutions.

**Blueprint Schema:**
```javascript
{
    story_type_id, story_type_name, core_premise,
    setting: { location, time_period, atmosphere },
    protagonist_group: { description, shared_goal, group_dynamic },
    antagonistic_forces: { description, nature, motivation, manifestations[] },
    arc_structure: { opening_hook, escalation_pattern, climax_nature, resolution_style },
    character_arcs: [{ character_name, initial_state, key_turning_points[], final_state }],
    scene_plan: [{ index, title, phase, purpose, situation, key_events[], choice_points[] }],
    possible_resolutions: [{ title, description, character_outcomes[] }],
    tone_and_style: { primary_tone, narrative_voice, pacing },
    content_boundaries: { violence_level, romance_level }
}
```

**Scene Progression:**
- Auto: `sceneIndex = floor((currentStep / arcLength) * sceneCount)`
- Manual: User controls via blueprint spoiler panel

**Scene Transitions:** LLM ends response with `@@NEXT_SCENE@@` marker (auto-detected and removed).

**Start Story from Blueprint:** Syncs settings, enables features, optionally generates opening message. See `lib/blueprint-module.js:644-716`.

## Connection Manager Integration

**Loading Profiles:**
```javascript
const context = getContext();
if (context?.extensionSettings?.disabledExtensions?.includes('connection-manager')) return [];
const profiles = extension_settings?.connectionManager?.profiles || [];
```

**Making API Calls:**
```javascript
import { ConnectionManagerRequestService } from '/scripts/extensions/shared.js';

const result = await ConnectionManagerRequestService.sendRequest(
    profileId,
    messages,
    maxTokens,
    { stream: false, extractData: true }
);
return result.text || result.content || '';
```

**Storing Selection:**
```javascript
extension_settings[MODULE_NAME].blueprintSettings = {
    enabled, useScenePrompts, sceneTransitionNotify,
    generationApi: string,  // Profile ID
    openingMessageApi: string,
    masterPrompt: string | null
};
```

## Code Patterns

### ES6 Module Import Chains
Always import from the **source module**, not intermediate modules:
```javascript
// ✅ CORRECT - import from source
import { generateUUID } from './blueprint-utils.js';

// ❌ WRONG - blueprint-storage.js doesn't re-export it
import { generateUUID } from './blueprint-storage.js';
```

### Document-Level Event Delegation
For dynamic content (popups), attach to document:
```javascript
$(document).on('change', '[data-field]', function(e) {
    if (!$(this).closest('.my-editor-container').length) return;
    // Handle event
});
```

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
        console.error('[Module] Error:', error);
        toastr.error(`Failed: ${error.message}`);
    } finally {
        LoadingIndicator.hide();
        btn.prop('disabled', false);
        btn.html(originalText);
    }
});
```

### Accessing State Arrays
```javascript
import { getStoryTypes, setStoryTypes } from './lib/state-manager.js';

const storyTypes = getStoryTypes();
storyTypes.push(newType);
setStoryTypes(storyTypes);
```

### Prompt Template Variables
Replace `{currentStep}`, `{phase}`, `{percent}`, `{arcLength}` using `String.replace()`.

### SillyTavern Popup API
The `Popup` constructor accepts size options that control modal dimensions:
```javascript
const popup = new Popup(html, POPUP_TYPE.TEXT, 'Title', {
    okButton: false,           // Hide OK button
    cancelButton: false,       // Hide Cancel button
    wide: true,                // Wide horizontal width (~80% viewport)
    large: true,               // Tall vertical height (~80% viewport)
    allowVerticalScrolling: true,  // Enable scroll within modal
    // Neither wide nor large → Auto-sizes to fit content
});
```
- Use `large: true` for content-heavy modals (forms, long lists)
- Omit `large` for content-focused modals (status, compact UIs)
- Always use `wide: true` for blueprints/wizards (better readability)

### Library In-Place View Switching
The Library tab uses dual containers (`#library_grid_view` and `#library_generate_view`) for in-place content switching without tab navigation:
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
- Flag set when entering generate view from Library
- Flag cleared on: back button, tab switch, wizard completion/cancellation
- Helper returns boolean for conditional fallback logic

## Code Style

- JSDoc comments (`/**`)
- `async function functionName(paramName)` format
- Template literals for HTML
- jQuery for DOM manipulation
- Async/await throughout
- Console logs with `[Story Mode]` prefix

## Testing Checklist

1. Test 1:1 and group chat scenarios
2. Verify rounds only increment on user messages
3. Check arc completion triggers
4. Test wand menu controls
5. Verify persistence across chat changes
6. Check regeneration/swipe doesn't increment rounds
7. Verify modules load without errors

## Known Limitations

- Phase boundaries fixed at 33%
- No nested/branching arcs
- Story types manually selected
- Regeneration edge cases partially addressed

## Loading Indicator Module

Standalone, reusable component with authorship-themed messages.

```javascript
import * as LoadingIndicator from './lib/loading-indicator.js';

await LoadingIndicator.init();
LoadingIndicator.show('Generating blueprint...');
try {
    await doAsyncWork();
} finally {
    LoadingIndicator.hide();
}
```

**Cross-extension usage:** Copy `lib/loading-indicator.js` and `lib/loading-indicator.css`, import CSS via `@import url()`.
