# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## Project Overview

Story Mode is a SillyTavern extension providing narrative structure through three-act story arc progression and author style emulation. Injects context-aware prompts to guide AI narration.

## Architecture

### Dual Pacing Mode System

The extension supports two distinct pacing modes. See `Planning/v2/ARCHITECTURE-dual-pacing-modes.md` for full details.

#### Mode A: Story Mode (Round-Based)
- **When**: No blueprint OR `chatState.pacingMode === 'story'`
- **Progression**: User message → `currentStep++` → phase calculation
- **Scene Position**: Calculated from round: `floor((currentStep / arcLength) * sceneCount)`
- **Exit**: `currentStep >= arcLength` triggers arc completion

#### Mode B: Scenario Mode (Signal-Based)
- **When**: Blueprint active AND `chatState.pacingMode === 'scenario'`
- **Progression**: LLM emits signals → extension updates state
- **Scene Position**: Explicit via `scenario.currentSceneIndex`
- **Exit**: `@@STORY_COMPLETE@@` signal

**Signals** (parsed from LLM output, stripped before display):
```
@@BEAT:N@@        → Mark beat N as complete
@@SKIP:N@@        → Mark beat N as skipped
@@NEXT_SCENE@@    → Advance to next scene
@@STORY_COMPLETE@@→ Trigger arc completion
```

**Key Functions:**
- `parseStorySignals()` in event-handlers.js - extracts signals from LLM output
- `buildScenarioModeInjection()` in blueprint-module.js - builds Abstract Act prompt
- `startStoryFromBlueprint()` in blueprint-module.js - activates Scenario Mode

### Core Concepts

**Rounds:** Increment on USER message submission (not AI response). Enables group chat where multiple AI characters respond per round. Only used in Story Mode.

**Three-Act Structure:** Fixed 33% phase boundaries (Story Mode only):
- Setup (0-33%): World-building, character introduction
- Confrontation (34-66%): Escalating challenges
- Resolution (67-100%): Climax and conclusion

**Abstract Acts (Scenario Mode):** Based on **StoryVerse** (Wang et al., 2024). Scenes defined by goals, not round counts. Beats are flexible milestones with visual markers: `[✓ done] [→ current] [□ pending] [x skipped]`

### Key Files

| File | Lines | Purpose |
|------|-------|---------|
| `index.js` | ~1.4k | Main orchestrator, settings dialog, initialization |
| `lib/state-manager.js` | ~600 | Settings, chat state, pacing mode, scenario state |
| `lib/arc-engine.js` | ~300 | Phase calculation, prompt building (Story Mode) |
| `lib/event-handlers.js` | ~670 | Message events, signal parsing, progression |
| `lib/controller-panel.js` | ~900 | Floating/docked Story Controller panel |
| `lib/blueprint-module.js` | ~4k | Blueprints, Scenario Mode injection, Abstract Acts |
| `lib/blueprint-schema.js` | ~420 | Blueprint schema, validation (single source of truth) |
| `lib/blueprint-editor.js` | ~1.8k | Split-panel blueprint editor |
| `lib/wand-menu.js` | ~470 | Quick controls dropdown |
| `lib/ui-components.js` | ~900 | HTML rendering, UI components |
| `lib/type-editors.js` | ~938 | Story type and author style CRUD |
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
2. **Per-Chat State** (`chat_metadata.story_mode`):
   ```javascript
   {
     currentStep: 0,              // Round counter (Story Mode)
     arcLength: 30,               // Total rounds
     selectedStoryType: "...",
     selectedAuthorStyle: "...",
     pacingMode: "story" | "scenario",  // Which mode is active
     scenario: {                  // Scenario Mode state
       currentSceneIndex: 0,
       beatState: { 0: { status: "complete" }, 1: { status: "pending" } }
     }
   }
   ```
3. **Blueprint State** (`chat_metadata.blueprint_state`): Active blueprint, scene summaries
4. **Content Storage** (localForage): Story types and author styles, with JSON fallback

**⚠️ Known Issue:** Scene index is tracked in both `chatState.scenario.currentSceneIndex` AND `blueprintState.currentSceneIndex`. Keep in sync.

### Data Flow

**Story Mode (Round-Based):**
```
User message → onUserMessageRendered() → handleUserMessageStep()
  → currentStep++ → updateStoryPrompt() → buildFullInjection()
  → setExtensionPrompt()
```

**Scenario Mode (Signal-Based):**
```
LLM response → onMessageReceived() → handleAIMessageChecks()
  → processStorySignals() → parseStorySignals()
  → Update beatState/sceneIndex → saveChatStoryState()
  → Strip signals from display → refreshUI()
```

### Round-Based Progression (Story Mode)

**Critical:** Rounds increment on USER message, not AI response (supports group chat).

**Edge Cases:**
- `isLoadingChat` - prevents increment during chat load
- `isRegenerating` - prevents increment during regeneration/swipe
- `currentStep >= arcLength` - triggers arc completion

**Implementation:** `handleUserMessageStep()` in `lib/event-handlers.js`

### Signal-Based Progression (Scenario Mode)

**Critical:** Scenes advance via LLM signals, not round count.

**Signal Processing:**
1. `onMessageReceived()` triggers for AI messages
2. `processStorySignals()` calls `parseStorySignals()` to extract signals
3. Signals update `chatState.scenario.beatState` and `currentSceneIndex`
4. Signals are stripped from displayed message text
5. UI refreshes to show new state

**Beat State Values:** `'complete'` | `'pending'` | `'skipped'`

**Implementation:** `processStorySignals()` in `lib/event-handlers.js`

### Arc Completion

**Story Mode:** When `currentStep >= arcLength`
**Scenario Mode:** When `@@STORY_COMPLETE@@` signal received

`handleArcCompletion()` generates epilogue/summary/end notice (each once, protected by flags).

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
    scene_plan: [{
        index, title, phase, purpose, situation,
        key_events_if_unchallenged[],
        choice_points[],
        character_focus: [{ name, emotional_beat_target }],
        beats: [{ title, type, required }]  // Scenario Mode milestones
    }],
    possible_resolutions: [{ title, description, character_outcomes[] }],
    opening_message: string,  // Generated in Phase 4 (200-500 words, sets Scene 1)
    tone_and_style: { primary_tone, narrative_voice, pacing },
    content_boundaries: { violence_level, romance_level }
}
```

**Scene Progression (Mode-Dependent):**
- **Story Mode (Auto):** `sceneIndex = floor((currentStep / arcLength) * sceneCount)`
- **Story Mode (Manual):** User controls via controller panel
- **Scenario Mode:** Explicit via `@@NEXT_SCENE@@` signals

**Scene Transitions:**
- LLM ends response with `@@NEXT_SCENE@@` marker (auto-detected and removed)
- On final scene, use `@@STORY_COMPLETE@@` instead to trigger epilogue/summary
- Beat completion: LLM emits `@@BEAT:N@@` where N is beat index

**Opening Message:** Generated automatically during Phase 4 (Resolutions) of blueprint creation. The `opening_message` field contains a 200-500 word narrative that establishes Scene 1 for the player.

**Start Story from Blueprint:** Syncs settings, enables Scenario Mode (`pacingMode = 'scenario'`), sets `sceneMode = 'manual'`, prompts to use stored opening message. See `lib/blueprint-module.js:startStoryFromBlueprint()`.

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
    generationApi: string,  // Profile ID for blueprint generation
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
13. Check both state locations stay in sync (scenario.currentSceneIndex == blueprintState.currentSceneIndex)

## Known Limitations

### Architecture Issues (v1)
- **Dual scene index storage:** `chatState.scenario.currentSceneIndex` and `blueprintState.currentSceneIndex` can drift out of sync
- **Beat state duplication:** `scenario.beatState` (new) vs `beatProgress` (legacy) track differently
- **No UI for mode switching:** Users cannot toggle between Story/Scenario modes manually

### Stub Functions (v2 placeholders)
- `resolvePlaceholders()` - returns text unchanged (no placeholder resolution)
- `checkPrerequisites()` - always returns true (no prerequisite checking)

### GLM 4.7 Reasoning Parameter Error

**Symptom:** Blueprint generation fails with error:
```
Bad Request {"error":{"message":"Invalid option: expected one of \"xhigh\"|\"high\"|\"medium\"|\"low\"|\"minimal\"|\"none\"","code":400}}
```

**Cause:** Some SillyTavern presets include `reasoning: { effort: 'auto' }` which GLM 4.7 does not support. The API expects explicit effort levels, not "auto".

**Automatic Fix:** `generateWithPreset()` in `lib/blueprint-module.js` automatically detects this error (and "Bad Request" errors generally) and retries the request with:
- `includePreset: false` - prevents preset from overriding settings
- `reasoning: { effort: 'high' }` - explicit valid effort level

**Tradeoff:** The retry runs without preset settings (temperature, top_p, etc. are undefined), but blueprint generation prompts are specific enough that default values work well.

**Manual Fix (Optional):** Edit the connection profile preset in SillyTavern and change reasoning effort from "auto" to "high" (or another valid value). This makes requests succeed on the first try with full preset settings.

**Affected Function:** `generateWithPreset()` at line ~4013 in `lib/blueprint-module.js`

### General
- Phase boundaries fixed at 33%
- No nested/branching arcs
- Story types manually selected
- Regeneration edge cases partially addressed

## Future Features

### Scene-by-Scene Summarization (UI exists, not implemented)
**Status:** Settings UI exists in `ui-components.js` with toggles for:
- Enable Scene Summarization
- Summarize After N scenes
- Max Summary Length (tokens)
- Include Summaries in Prompts
- Summary Style (narrative/bullet/both)
- Scene Summary Prompt Template

**Not implemented:** Actual summarization logic, LLM calls, and injection into prompts.

### World Lore / Lorebook Integration
- **Blueprint-aware lore injection:** Pull relevant World Info entries based on current scene keywords, characters, or locations
- **Lore summaries in prompts:** Inject condensed lore context for the active scene without overwhelming token budget
- **Character-specific lore:** Auto-include character lorebook entries when they're in `character_focus` for the scene
- **Setting consistency:** Use lorebook entries supporting `setting.location` and `setting.time_period` from blueprint
- **Dynamic lore activation:** Trigger World Info entries based on scene transitions or beat completions

### Continuity Aides
Track and inject context about:
- **Objects:** Key items, their locations, who has them
- **Character locations:** Where each character currently is
- **Clothing/appearance:** What characters are wearing, visible state changes
- **Time of day:** Tracking in-story time progression
- **Environmental state:** Weather, damage, changes to locations

### Auto-Create Memories / Lorebook Entries
Automatically generate World Info entries from chat content:
- **Arc completion (no blueprint):** Extract key events, characters, locations from final summary
- **Scene transitions (with blueprint + summarization):** Create lorebook entries at end of each scene capturing:
  - New characters introduced
  - Significant plot events
  - Location changes
  - Object/item discoveries
  - Relationship changes
- **Entry format:** Match SillyTavern lorebook schema with appropriate keywords for retrieval

### Scene/Beat Image Generation
Add to Story Controller panel:
- **Auto-generate prompt:** Create image prompt from current scene/beat context (characters, setting, action)
- **Generate button:** Trigger SD generation asynchronously (non-blocking)
- **Preview in panel:** Display generated image in Story Controller
- **Gallery integration:** "Add to character gallery" option for generated images
- **Style matching:** Use blueprint's tone/setting to inform image style prompts

### Optional Overrides System
Build toggles and processes for blueprints to optionally override:
- **Story Type:** Blueprint can specify/override the story type
- **Author Style:** Blueprint can embed or reference a specific author style
- **Characters:** Blueprint can specify required characters to add to chat
- **Personas:** Blueprint can suggest a user persona
- User confirmation before applying, revert on story end

### Other Ideas
- Branching/nested story arcs
- Per-scene pacing targets
- AI-suggested scene transitions
- Character relationship tracking across scenes


