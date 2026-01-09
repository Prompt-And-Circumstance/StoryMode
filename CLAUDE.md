# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Story Mode is a third-party SillyTavern extension that provides narrative structure to AI chats through story arc progression and author style emulation. It injects context-aware prompts to guide the AI through a three-act narrative structure.

## Architecture

### Core Concepts

**Rounds vs. Steps:** The extension uses "rounds" (also called "steps" in some UI code) that increment when the USER submits a message. A "round" is the period from one user message to the next. This enables group chat support where multiple AI characters can respond within a single round.

**Three-Act Structure:** Each story arc is divided into three phases at fixed 33% intervals:
- Setup (steps 0-33%): World-building and character introduction
- Confrontation (steps 34-66%): Escalating challenges and stakes
- Resolution (steps 67-100%): Climax and conclusion

### Key Files

**Main Entry Point:**
- `index.js` (~1,373 lines) - Main extension orchestrator, settings dialog, and initialization

**Modules (lib/):**
- `lib/state-manager.js` (~450 lines) - Settings, chat state, data loading/storage
- `lib/arc-engine.js` (~200 lines) - Phase calculation and prompt building
- `lib/ui-components.js` (~900 lines) - HTML rendering and UI component functions
- `lib/type-editors.js` (~938 lines) - Story type and author style CRUD operations
- `lib/event-handlers.js` (~414 lines) - Message events, round progression, arc completion
- `lib/wand-menu.js` (~250 lines) - Quick controls dropdown menu
- `lib/blueprint-module.js` (~2,670 lines) - Story Blueprints feature (LLM-generated story structure)
- `lib/blueprint-schema.js` (~420 lines) - Blueprint field definitions, validation rules, dropdown options (single source of truth)
- `lib/blueprint-editor.js` (~1,808 lines) - Split-panel blueprint editor with field editing and scene management
- `lib/loading-indicator.js` (~300 lines) - Standalone loading indicator with authorship-themed messages
- `lib/loading-indicator.css` (~175 lines) - Styles for the loading indicator

**Data Files:**
- `data/story_types.json` - 40+ predefined story type definitions
- `data/author_styles.json` - 40+ predefined author style definitions
- `data/blueprint-master-prompt.txt` - Master prompt template for blueprint generation
- `style.css` - UI styling with SillyTavern theme integration

### Modular Architecture

The codebase uses ES6 modules for separation of concerns. Each module has a single responsibility:

**Module Dependencies:**
```
state-manager.js (no internal dependencies)
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

**Cross-Module Communication:**
- Modules use ES6 imports/exports for function access
- Some functions exposed via `window.*` for backward compatibility with blueprint-module.js:
  - `window.updateStatusDisplay`
  - `window.updateStoryPrompt`
  - `window.refreshBlueprintPreview`
  - `window.setupEventListeners`
  - `window.updateStoryTypeDropdown`
  - `window.updateAuthorStyleDropdown`

**State Management Pattern:**
- `state-manager.js` owns the data arrays (storyTypes, authorStyles)
- Other modules use getter/setter functions: `getStoryTypes()`, `setStoryTypes()`, `getAuthorStyles()`, `setAuthorStyles()`
- This ensures centralized state updates and prevents stale references

### Extension Integration

**Entry Point:** `index.js` is loaded as an ES6 module by SillyTavern's extension system.

**Event System:** The extension hooks into SillyTavern's event source:
```javascript
eventSource.on(event_types.GENERATION_STARTED, ...)  // Clear flags, update prompt
eventSource.on(event_types.MESSAGE_RECEIVED, ...)    // Round increment (user) or arc completion check (AI)
eventSource.on(event_types.CHAT_CHANGED, ...)         // Reload state for new chat
eventSource.on(event_types.MESSAGE_REGENERATED, ...)  // Set regeneration flag
```

**Prompt Injection:** Uses `setExtensionPrompt()` API with configurable:
- Position: `extension_prompt_types.IN_PROMPT`, `IN_CHAT`, or `BEFORE_PROMPT`
- Depth: How many messages from end (for IN_CHAT)
- Role: `extension_prompt_roles.SYSTEM`, `USER`, or `ASSISTANT`

**CSS Loading:** SillyTavern loads extensions as native ES6 modules **without bundling**. This has important implications for CSS:

```javascript
// ❌ WRONG - Will cause "not a valid JavaScript MIME type" error
import './my-styles.css';

// ✅ CORRECT - Use @import in the main style.css file
// In style.css:
@import url('./lib/my-styles.css');
```

**Why:** Native browser ES6 modules only support JavaScript imports. CSS imports like `import './file.css'` require a bundler (Webpack, Vite, Rollup) to transform them into JavaScript. Since SillyTavern loads modules directly, you must load CSS through:
1. `@import url()` statements in the main `style.css` file (recommended)
2. Dynamically creating `<link>` elements in JavaScript
3. Inline styles in JavaScript template literals

### State Management

**Dual-Layer Storage:**

1. **Global Settings** (`extension_settings.story_mode`):
   - Configuration: enabled flags, arc length, injection settings
   - Defaults for new chats
   - Persists across sessions

2. **Per-Chat State** (`chat_metadata.story_mode`):
   - `currentStep` - Current round number
   - `arcLength` - Total rounds in this arc
   - `selectedStoryType` - ID of selected story type
   - `selectedAuthorStyle` - ID of selected author style
   - `arcStarted` - Boolean flag
   - `epilogueShown` - Boolean flag
   - `summaryShown` - Boolean flag
   - `endNoticeShown` - Boolean flag

3. **Content Storage** (localForage):
   - Story types and author styles stored in browser's localForage
   - Fallback to JSON files on first load
   - Migration system from old `extension_settings` storage

### Data Flow

```
User sends message
    ↓
onMessageReceived() [event-handlers.js] detects user message
    ↓
handleUserMessageStep() [event-handlers.js] increments round
    ↓
saveChatStoryState() [state-manager.js] updates chat_metadata
    ↓
updateStoryPrompt() [arc-engine.js] rebuilds injection
    ↓
buildFullInjection() [arc-engine.js] combines story + style + blueprint
    ↓
setExtensionPrompt() [SillyTavern API] injects into AI context
```

### Key Functions by Module

**state-manager.js:**
- `getChatStoryState()` - Returns per-chat state with defaults
- `saveChatStoryState(chatState)` - Persists to chat_metadata
- `loadSettings()` - Loads global settings from extension_settings
- `loadStoryTypes()`, `loadAuthorStyles()` - Load data from localForage
- `getStoryTypes()`, `setStoryTypes()` - Getter/setter for story types array
- `getAuthorStyles()`, `setAuthorStyles()` - Getter/setter for author styles array
- `getOriginalStoryType(id)`, `getOriginalAuthorStyle(id)` - Get original versions for revert

**arc-engine.js:**
- `getPhaseInfo(step, arcLength)` - Calculates current phase and percentages
- `buildFullInjection(isPreview)` - Combines story + style + blueprint content
- `updateStoryPrompt()` - Main function to rebuild and inject prompt

**ui-components.js:**
- `renderMainPanel()` - Renders main control panel HTML
- `renderBlueprintPreview()` - Renders blueprint spoiler panel
- `buildSettingsTabContent()`, `buildBlueprintTabContent()`, etc. - Tab content builders
- `escapeHtml()` - HTML escaping for security

**type-editors.js:**
- `showStoryTypesEditor()`, `showAuthorStylesEditor()` - Editor modals
- `addStoryType()`, `editStoryType()`, `deleteStoryType()` - Story type CRUD
- `addAuthorStyle()`, `editAuthorStyle()`, `deleteAuthorStyle()` - Author style CRUD
- `importStoryTypes()`, `exportStoryTypes()` - Import/export JSON
- `importAuthorStyles()`, `exportAuthorStyles()` - Import/export JSON

**event-handlers.js:**
- `onMessageReceived(data)` - Main event handler, branches on `data.is_user`
- `handleUserMessageStep(data)` - Increments round on user message
- `handleAIMessageChecks(data)` - Checks arc completion, detects scene transitions
- `handleArcCompletion(chatState, settings)` - Generates epilogue/summary/end notice
- `generateEpilogueForStory()`, `summarizeChatMainForStory()` - Content generation
- `setRegenerating(bool)`, `setLoadingChat(bool)` - State flag setters

**wand-menu.js:**
- `registerWandMenuEntry()` - Adds wand menu button and dropdown
- `updateWandMenuStatus()` - Updates dropdown status text
- `incrementStoryStep()`, `decrementStoryStep()`, `resetStoryArc()` - Quick controls
- `enableStoryMode()`, `disableStoryMode()` - Toggle controls

**index.js:**
- `addUI()` - Adds main panel to extensions sidebar
- `setupEventListeners()` - Main panel event listeners
- `updateStatusDisplay()` - Updates status display in main panel
- `showSettingsDialog()` - Opens comprehensive settings dialog
- `setupUnifiedDialogEventListeners()` - Settings dialog event handlers
- Initialization sequence and event source hook registration

### Round-Based Progression

**Critical Architecture Decision:** Rounds increment on USER message submission, not AI response. This was changed from the original design to support group chats.

**Why:** In group chats, multiple AI characters respond to a single user message. If rounds incremented on AI response, each character response would advance the story incorrectly.

**Implementation:** See `handleUserMessageStep()` in `lib/event-handlers.js`

**Edge Cases Handled:**
- `isLoadingChat` - Prevents increment during chat load (managed in event-handlers.js)
- `isRegenerating` - Prevents increment during regeneration/swipe (managed in event-handlers.js)
- `currentStep >= arcLength` - Triggers arc completion instead of increment

### Arc Completion

When `currentStep >= arcLength`:
1. `handleArcCompletion()` [event-handlers.js] is called
2. If enabled, generates epilogue via `generateEpilogueForStory()` [event-handlers.js]
3. If enabled, generates summary via `summarizeChatMainForStory()` [event-handlers.js]
4. Shows end notice message (protected by `endNoticeShown` flag in chat_metadata)
5. Each task only runs once per arc (protected by boolean flags)
6. Messages pushed via `pushStoryMessage()` [event-handlers.js]

### Story Type Structure

Each story type contains:
- `id` - Unique identifier
- `name` - Display name
- `category` - Genre category (Mystery, Horror, Fantasy, etc.)
- `description` - Thematic hook and narrative focus
- `setupPrompt`, `confrontationPrompt`, `resolutionPrompt` - Phase-specific guidance
- `progressTemplate` - Template with `{currentStep}`, `{phase}`, `{percent}` variables

### Author Style Structure

Each author style contains:
- `id` - Unique identifier
- `name` - Author name
- `category` - Style category (Classic, Modern, etc.)
- `guidance` - Writing style instructions
- `nsfwGuidance` - Optional mature content handling
- `heatLevel` - Spiciness level (1-5)

### Known Limitations

Per README v0.1:
- Impersonation and regeneration may advance arc incorrectly (partially addressed with regeneration flag)
- Story types must be manually selected
- No support for nested or branching arcs
- Phase boundaries are fixed at 33% intervals

### Code Style

- Use JSDoc comments for all functions (`/**` style)
- Function format: `async function functionName(paramName)` with description above
- Use template literals for multi-line HTML strings
- jQuery for DOM manipulation (integrated with SillyTavern)
- Async/await for all async operations
- Console debug logs with `[Story Mode]` prefix

### Important Patterns

**Regeneration Detection:**
```javascript
// In index.js initialization:
eventSource.on(event_types.MESSAGE_REGENERATED, (data) => {
    setRegenerating(true);  // Use setter from event-handlers.js
    updateStoryPrompt();
});
```
Then in `handleUserMessageStep()` [event-handlers.js]: check `if (isRegenerating)` and skip increment.

**LocalForage Loading:**
```javascript
// In state-manager.js:
await localForage.setItem(key, value);
const value = await localForage.getItem(key);
```
With fallback to JSON files if localForage is empty.

**Accessing State Arrays:**
```javascript
// Use getter/setter functions from state-manager.js:
import { getStoryTypes, setStoryTypes, getAuthorStyles, setAuthorStyles } from './lib/state-manager.js';

const storyTypes = getStoryTypes();  // Get current array
storyTypes.push(newType);            // Modify
setStoryTypes(storyTypes);           // Persist changes
```

**Prompt Template Variables:**
Replace `{currentStep}`, `{phase}`, `{percent}`, `{arcLength}` in prompt templates using `String.replace()` (see `buildFullInjection()` in arc-engine.js).

**UI Conditional Rendering:**
```javascript
const isEnabled = extension_settings[MODULE_NAME].enabled;
$('#element').toggle(isEnabled);
```

**ES6 Module Import Chains:**
When importing utilities across modules, be aware of the import chain:
- Always import from the **source module** where the function is exported
- Intermediate modules that import a function don't automatically re-export it
- Example: `generateUUID` is defined in `blueprint-utils.js` and used by `blueprint-storage.js`
  ```javascript
  // ❌ WRONG - blueprint-storage.js doesn't re-export generateUUID
  import { generateUUID } from './blueprint-storage.js';

  // ✅ CORRECT - import from the source module
  import { generateUUID } from './blueprint-utils.js';
  ```

**Document-Level Event Delegation for Dynamic Content:**
When working with dynamically created content (e.g., popups from `callGenericPopup`), use document-level event delegation to avoid timing issues:
```javascript
// ❌ WRONG - assumes container exists immediately
const container = $('.my-popup');
container.on('change', 'select', handler); // Won't work if container not in DOM yet

// ✅ CORRECT - attach to document, filter by context
$(document).on('change', '[data-field]', function(e) {
    // Only process events from our specific container
    if (!$(this).closest('.my-editor-container').length) return;
    // Handle the event
});
```

### Working with the Modular Codebase

**Adding New Features:**
1. Identify which module the feature belongs in based on responsibility
2. Import necessary functions from other modules
3. Use getter/setter functions for state arrays
4. Export new functions if they need to be accessed by other modules
5. Update `index.js` imports if the function needs to be called from there

**Common Tasks:**

*Adding a new story type field:*
1. Update schema in `type-editors.js` (edit forms)
2. Update display in `ui-components.js` (if shown in UI)
3. Update prompt building in `arc-engine.js` (if used in injection)

*Adding a new event handler:*
1. Add handler function to `event-handlers.js`
2. Export the function
3. Register event in `index.js` initialization

*Modifying state structure:*
1. Update `defaultSettings` in `state-manager.js`
2. Update getter/setter if needed
3. Update UI to reflect new state (in `ui-components.js` or `index.js`)

**Module Boundaries:**
- Don't import from higher-level modules (follow dependency graph)
- Use `window.*` exports sparingly (only for backward compatibility)
- Keep state mutations in appropriate modules (state changes in state-manager, UI updates in ui-components, etc.)

### Testing Notes

When testing changes:
1. Test in both 1:1 and group chat scenarios
2. Verify rounds only increment on user messages
3. Check arc completion triggers (epilogue/summary/end notice)
4. Test wand menu controls (forward/back/reset/enable/disable)
5. Verify persistence across chat changes
6. Check that regeneration/swipe doesn't increment rounds
7. Verify all modules load without errors (check browser console)

## Story Blueprints Feature

### Overview

The Story Blueprints feature provides LLM-generated story structure with scenes, character arcs, antagonistic forces, and possible resolutions. It acts as a flexible guide for the AI narrator while respecting player agency.

### Key Components

**Blueprint Module** (`lib/blueprint-module.js`):
- `generateBlueprint()` - Generates blueprint via LLM using master prompt
- `generateOpeningMessage()` - Generates opening message for Scene 1
- `getCurrentScene()` - Calculates current scene based on round progress
- `buildBlueprintInjection()` - Builds runtime prompt with scene guidance
- `showBlueprintConfigModal()` - Configuration and generation UI
- `renderBlueprintSpoilerPanel()` - Displays blueprint with tabs (Summary/Scenes/JSON)

**Blueprint Schema**:
```javascript
{
    story_type_id: string,
    story_type_name: string,
    core_premise: string,
    setting: { location, time_period, atmosphere },
    protagonist_group: { description, shared_goal, group_dynamic },
    antagonistic_forces: { description, nature, motivation, manifestations[] },
    arc_structure: { opening_hook, escalation_pattern, climax_nature, resolution_style },
    character_arcs: [{ character_name, initial_state, key_turning_points[], final_state, emotional_trajectory }],
    scene_plan: [{ index, title, phase, purpose, situation, key_events_if_unchanged[], choice_points[], character_focus[], hooks_for_future[] }],
    possible_resolutions: [{ title, description, character_outcomes[], thematic_resolution }],
    tone_and_style: { primary_tone, narrative_voice, pacing, key_stylistic_elements[] },
    content_boundaries: { violence_level, romance_level, other_content_notes },
    genre_realism_notes: { metaphor_level_used, implementation_notes }
}
```

### Scene Progression

**Auto Mode** (default):
- Scene calculated based on round progress: `sceneIndex = floor((currentStep / arcLength) * sceneCount)`
- Clamped to valid range [0, scene_plan.length - 1]
- Automatically advances as story progresses

**Manual Mode**:
- User can manually advance/retreat through scenes
- Scene index stored in blueprint state
- Accessible via blueprint spoiler panel

### Runtime Prompt Injection

When enabled, blueprint guidance is injected into each AI turn:
```
[STORY_BLUEPRINT GUIDANCE]
Core premise: {core_premise}

Current planned scene (Scene X/Y):
- Title: {scene.title}
- Phase: {scene.phase}
- Purpose: {scene.purpose}
- Situation: {scene.situation}

This scene's intended emotional focus:
{character_focus entries}

Remember: This is guidance. Follow the user's actions.
[/STORY_BLUEPRINT GUIDANCE]
```

**Scene Transitions**:
- LLM can end response with `@@NEXT_SCENE@@` to indicate scene completion
- Marker is automatically detected and removed (player never sees it)
- Scene advances in manual mode when marker is detected
- User can choose notification style: Small Toast (bottom-right) or Popup Dialog (center)
- Popup dialogs show additional scene details (title, phase, situation)

### Blueprint Generation Flow

1. User clicks "Generate Blueprint" button
2. Modal opens with configuration:
   - Story type (read-only, from current selection)
   - Author style (read-only, from current selection or "None")
   - Character checkboxes (from group chat or single character)
   - Scenario textarea (pre-filled from chat context)
   - Metaphor level dropdown: Literal | Grounded | Mixed | Symbolic
   - Story length: Short (~10) | Medium (~30) | Long (~60)
   - Advanced: Edit master prompt (collapsible)
3. User clicks "Generate Blueprint"
4. LLM generates blueprint JSON (8192 tokens, temperature 0.7)
5. Blueprint validated and saved to chat metadata
6. Settings synced (story type, author style, arc length)
7. User can view/edit/export blueprint

### Start Story from Blueprint

**Overview:**
The "Start Story from Blueprint" feature provides a streamlined workflow to:
1. Sync all blueprint settings to main Story Mode settings
2. Enable all required Story Mode features (story arc, blueprint prompts, author style)
3. Optionally generate an opening message for Scene 1
4. Close the settings dialog and return to the main chat

**Button Location:**
- Located in the blueprint subtab row (far right)
- Only visible when a blueprint is loaded with scenes
- Styled with distinctive green/teal gradient (`.storymode-btn-start` class)
- Layout: `[Generate] [Load] | [Overview] [Scenes] [Characters] [JSON] → [▶ Start Story]`

**Action Flow:**
```
User clicks "Start Story" button
    ↓
1. Validation: Check blueprint has required data (scenes, story type)
    ↓
2. Check if story is already in progress (currentStep > 0 or chat.length > 1)
    ├─ If yes: Show warning dialog
    └─ If no: Continue
    ↓
3. Validate story type and author style exist in library
    ├─ If missing: Add warning (non-blocking)
    └─ Invalid author style: Set to None with warning
    ↓
4. Sync blueprint settings (via syncBlueprintSettings)
    ├─ selectedStoryType ← blueprint.story_type_id
    ├─ selectedAuthorStyle ← blueprint.author_style
    ├─ arcLength ← blueprint.total_messages_target
    ├─ currentStep ← 0 (reset)
    └─ Reset arc completion flags
    ↓
5. Enable all Story Mode features
    ├─ extension_settings[MODULE_NAME].enabled = true
    ├─ extension_settings[MODULE_NAME].storyArcEnabled = true
    ├─ extension_settings[MODULE_NAME].blueprintSettings.enabled = true
    ├─ extension_settings[MODULE_NAME].blueprintSettings.useScenePrompts = true
    └─ extension_settings[MODULE_NAME].authorStyleEnabled = true (if blueprint has author style)
    ↓
6. Ask user: "Would you like to generate an opening message for Scene 1?"
    ├─ Yes: Generate opening message via generateOpeningMessage()
    │       ├─ On success: Add to chat, show success toast
    │       └─ On failure: Show error toast, but story still started
    └─ No: Skip generation
    ↓
7. Close settings dialog (trigger cancel button)
    ↓
8. Update main panel UI
    ├─ Refresh status display
    └─ Re-render main panel with new state
```

**Implementation Files:**

| File | Function | Purpose |
|------|----------|---------|
| `lib/ui-components.js:826-855` | `buildBlueprintTabContent()` | Renders the "Start Story" button in subtab row |
| `lib/blueprint-module.js:644-716` | `startStoryFromBlueprint()` | Core logic: validates, syncs, enables features |
| `index.js:925-989` | Click handler for `#start_story_from_blueprint_btn` | Orchestrates the full flow, handles opening generation |
| `style.css:1340-1367` | `.storymode-btn-start`, `.storymode-subtab-spacer` | Button styling and flex layout |

**Key Functions:**

```javascript
// In blueprint-module.js:
export async function startStoryFromBlueprint(blueprint) {
    // Validate blueprint has required data
    if (!blueprint.scene_plan?.length) {
        return { success: false, error: 'Blueprint has no scenes defined' };
    }
    if (!blueprint.story_type_id) {
        return { success: false, error: 'Blueprint has no story type' };
    }

    // Validate story type and author style exist
    const existingTypes = storyTypes.length ? storyTypes : await loadStoryTypes();
    if (!existingTypes.some(t => t.id === blueprint.story_type_id)) {
        warnings.push(`Story type "${blueprint.story_type_id}" not found in library`);
    }

    // Check if story is already in progress
    const { chatMetadata, chat } = getContext();
    const chatState = chatMetadata[MODULE_NAME] || {};
    const currentStep = chatState.currentStep || 0;
    const messageCount = chat?.length || 0;

    if (currentStep > 0 || messageCount > 1) {
        // Show warning dialog
        if (!await callGenericPopup(warnHtml, POPUP_TYPE.CONFIRM)) {
            return { success: false, error: 'User cancelled' };
        }
    }

    // Sync blueprint settings
    await syncBlueprintSettings(blueprint, false);

    // Enable all Story Mode features
    const settings = extension_settings[MODULE_NAME] || {};
    settings.enabled = true;
    settings.storyArcEnabled = true;
    settings.blueprintSettings.enabled = true;
    settings.blueprintSettings.useScenePrompts = true;

    if (blueprint.author_style) {
        settings.authorStyleEnabled = true;
    }

    saveSettingsDebounced();
    return { success: true, warnings };
}
```

**Edge Cases Handled:**

| Edge Case | Handling |
|-----------|----------|
| No scenes in blueprint | Blocks with error: "Blueprint has no scenes defined" |
| No story type in blueprint | Blocks with error: "Blueprint has no story type" |
| Story type ID not found in library | Warning added, allows continuation |
| Author style ID not found in library | Warning added, sets to None |
| Chat already has messages (currentStep > 0 or chat.length > 1) | Shows confirmation dialog: "Story Already in Progress" |
| Opening message generation fails | Shows error toast, but story is still started successfully |
| User cancels during warning dialog | Returns `{ success: false }`, no changes applied |

**Important Notes:**

- The button uses delegated event listener `$(document).on('click', '#start_story_from_blueprint_btn')` to ensure it works even when the dialog is dynamically re-rendered
- The function uses optional chaining (`blueprint.scene_plan?.length`) for concise null checking
- Early return pattern is used to reduce nesting and improve readability
- Warnings are non-blocking; they're displayed via toastr but don't prevent the story from starting
- The dialog is closed by triggering the cancel button: `$dialog.find('.popup-button-cancel').trigger('click')`
- Main panel is re-rendered via `renderMainPanel()` and `setupEventListeners()` to reflect the new state

### Blueprint Editor

**Overview:**
The Blueprint Editor is a split-panel modal that allows direct editing of blueprint fields. It provides real-time validation, immediate field updates, and scene management (add/edit/delete/reorder).

**Opening the Editor:**
- Click the **Edit** button in the Blueprint tab (settings dialog)
- Or click the **Edit** button in the blueprint preview sidebar

**Editor Layout:**

```
┌─────────────────────────────────────────────────────────┐
│  ┌──────────────┐  ┌─────────────────────────────────┐  │
│  │              │  │  [Blueprint Details] [Scenes]   │  │
│  │  BLUEPRINT   │  │                                  │  │
│  │  INFO        │  │  <editable fields appear here>    │  │
│  │  (sidebar)   │  │                                  │  │
│  │              │  │                                  │  │
│  │  • ID        │  │                                  │  │
│  │  • Story Type│  │                                  │  │
│  │  • Author    │  │                                  │  │
│  │  • Length    │  │                                  │  │
│  │  • Scenes    │  │                                  │  │
│  │              │  │                                  │  │
│  └──────────────┘  └─────────────────────────────────┘  │
│                                                     [Save] │
└─────────────────────────────────────────────────────────┘
```

**Editable Fields (Blueprint Details Tab):**

| Section | Fields | Notes |
|---------|--------|-------|
| **Story Type & Author Style** | `story_type_id` (dropdown), `author_style` (dropdown) | Changes update display names immediately |
| **Core Premise** | `core_premise` (textarea) | The central concept of the story |
| **Setting** | `setting.location`, `setting.time_period`, `setting.atmosphere` | Where and when the story takes place |
| **Protagonist Group** | `protagonist_group.description`, `shared_goal`, `group_dynamic` | Main character details |
| **Antagonistic Forces** | `antagonistic_forces.description`, `nature` (dropdown), `motivation` | Opposition details |
| **Story Arc Structure** | `arc_structure.total_messages_target`, `metaphor_level` (dropdown) | Pacing and tone |
| **Tone & Style** | `tone_and_style.primary_tone`, `narrative_voice` | Writing style |
| **Content Boundaries** | `violence_level` (dropdown), `romance_level` (dropdown) | Content ratings |

**Scenes Tab:**
- **Add Scene**: Creates a new scene with default values
- **Edit Scene**: Opens modal to edit scene title, phase, purpose, situation
- **Delete Scene**: Removes scene with confirmation
- **Drag & Drop**: Reorder scenes by dragging

**Important Notes:**
- All changes are tracked; an unsaved changes indicator appears when you modify anything
- The **Revert** button discards all changes and reloads the original blueprint
- Clicking **Save** validates the blueprint before persisting
- The left panel sidebar updates in real-time as you change dropdowns

### Connection Manager Integration

### Overview

Story Mode integrates with SillyTavern's Connection Manager extension to allow users to select specific connection profiles for blueprint generation and opening messages.

### Loading Connection Profiles

**Correct Pattern**:
```javascript
import { extension_settings, getContext } from '/scripts/extensions.js';

function getConnectionProfiles() {
    const context = getContext();

    // Check if Connection Manager extension is disabled
    if (context?.extensionSettings?.disabledExtensions?.includes('connection-manager')) {
        console.log('[Story Mode] Connection Manager is disabled');
        return [];
    }

    try {
        // Get profiles from extension settings
        const profiles = extension_settings?.connectionManager?.profiles || [];
        return profiles;
    } catch (error) {
        console.warn('[Story Mode] Error getting connection profiles:', error);
        return [];
    }
}
```

**Common Pitfalls**:
- ❌ Don't use `getContext().connectionProfiles` - this doesn't exist
- ❌ Don't use `openai_settings`, `openai_setting_names` directly - this is the old approach
- ❌ Don't call `/api/generate` directly with `profile_id` - this endpoint doesn't exist
- ✅ Use `extension_settings.connectionManager.profiles` - stores profile definitions
- ✅ Use `ConnectionManagerRequestService` for making API calls with profiles

### Making API Calls with Profiles

**Use ConnectionManagerRequestService**:
```javascript
import { ConnectionManagerRequestService } from '/scripts/extensions/shared.js';

async function generateWithPreset(options) {
    const selectedProfileId = extension_settings[MODULE_NAME].blueprintSettings?.generationApi;

    // If no profile selected, fall back to main API
    if (!selectedProfileId) {
        return await generateRaw(options);
    }

    // Build messages array for chat completion
    const messages = [];
    if (options.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: options.prompt });

    // Use ConnectionManagerRequestService
    const result = await ConnectionManagerRequestService.sendRequest(
        selectedProfileId,
        messages,
        options.responseLength || 0,
        {
            stream: false,
            extractData: true,
        }
    );

    return result.text || result.content || '';
}
```

**ConnectionManagerRequestService API**:
```javascript
ConnectionManagerRequestService.sendRequest(
    profileId,           // string: Profile ID from connectionManager.profiles
    prompt,              // string | Message[]: Prompt or messages array
    maxTokens,           // number: Max tokens to generate
    custom,              // object: Optional settings (stream, signal, extractData, etc.)
    overridePayload      // object: Optional payload overrides
)
```

**Returns**: Object with `text` or `content` property containing the generated text

### Profile Selection UI

**Populating Dropdowns**:
```javascript
// Get profiles
const profiles = getConnectionProfiles();

// Clear dropdown
profileSelect.empty();

// Add options using jQuery
profiles.forEach(profile => {
    const option = $('<option>').val(profile.id).text(profile.name);
    profileSelect.append(option);
});

// Set selected value AFTER all options added
if (selectedProfileId) {
    profileSelect.val(selectedProfileId);
} else if (profiles.length > 0) {
    // Auto-select first profile if none selected
    profileSelect.val(profiles[0].id);
}
```

**Important Notes**:
- Use `$('<option>').val(profile.id).text(profile.name)` instead of HTML string interpolation
- Call `.val()` AFTER all options are added to the DOM
- For modals, populate dropdown BEFORE `await popup.show()` since `await` waits for close
- For settings dialogs, populate with `setTimeout` after content is created

### Storing Profile Selection

**Settings Structure**:
```javascript
extension_settings[MODULE_NAME].blueprintSettings = {
    enabled: boolean,
    useScenePrompts: boolean,
    sceneTransitionNotify: string,  // 'toastr' | 'popup' - notification style for scene transitions
    generationApi: string,  // Profile ID (e.g., "b6789d69-1e6d-44a5-a8b9-79e752512fd7")
    openingMessageApi: string,  // Profile ID for opening message generation
    masterPrompt: string | null,
};
```

**Saving Selection**:
```javascript
// On dropdown change
$('#blueprint_generation_api').on('change', async () => {
    const selectedProfileId = $('#blueprint_generation_api').val() || null;
    if (!extension_settings[MODULE_NAME].blueprintSettings) {
        extension_settings[MODULE_NAME].blueprintSettings = {};
    }
    extension_settings[MODULE_NAME].blueprintSettings.generationApi = selectedProfileId;
    saveSettingsDebounced();
});
```

### Debugging Connection Manager Issues

**Check if profiles are loading**:
```javascript
const profiles = getConnectionProfiles();
console.log('[Story Mode] Found profiles:', profiles.length);
console.log('[Story Mode] Profile data:', profiles);
```

**Verify profile selection**:
```javascript
const selectedProfileId = extension_settings[MODULE_NAME].blueprintSettings?.generationApi;
console.log('[Story Mode] Selected profile ID:', selectedProfileId);
```

**Check if Connection Manager is enabled**:
```javascript
const context = getContext();
const isDisabled = context?.extensionSettings?.disabledExtensions?.includes('connection-manager');
console.log('[Story Mode] Connection Manager disabled:', isDisabled);
```

### Common Issues and Solutions

| Issue | Cause | Solution |
|-------|--------|----------|
| Dropdown shows 0 profiles | Wrong import path or accessing wrong property | Use `extension_settings.connectionManager.profiles` |
| Profile not selected in dropdown | Using `selected` attribute in HTML string | Use jQuery `.val()` after adding options |
| 404 error when generating | Calling `/api/generate` directly | Use `ConnectionManagerRequestService.sendRequest()` |
| Selection not persisting | Not saving to extension_settings | Save to `blueprintSettings.generationApi` |
| Modal dropdown not populating | Populating after `await popup.show()` | Populate before `await` since it waits for close |

### Blueprint Schema Architecture

**Overview:**
The blueprint schema is centralized in `lib/blueprint-schema.js`, which serves as the single source of truth for field definitions, validation rules, dropdown options, and default values. This architecture makes adding new fields predictable and discoverable.

**Key Files:**
- `lib/blueprint-schema.js` - Schema definitions, dropdown options, validation utilities
- `lib/blueprint-module.js` - Blueprint typedef, normalizeBlueprint(), generation functions
- `lib/blueprint-editor.js` - Split-panel editor UI (imports from blueprint-schema.js)
- `lib/ui-components.js` - Blueprint preview and display components

**Schema Components:**

```javascript
// lib/blueprint-schema.js exports:
export const DROPDOWN_OPTIONS = {
    antagonistNature: [...],
    metaphorLevel: [...],
    violenceLevel: [...],
    romanceLevel: [...],
    scenePhase: [...]
};

export const BLUEPRINT_FIELDS = {
    field_name: {
        type: 'string' | 'number' | 'boolean' | 'object' | 'array',
        required: true | false,
        default: null | undefined,
        min: number,           // For string length or number value
        max: number,
        enum: [...],           // For dropdown fields
        pattern: /regex/,      // For validation
        nested: {...}          // For object types
    }
};

// Validation utilities:
export function getFieldDefinition(path)
export function isFieldRequired(path)
export function getFieldOptions(path)
export function validateField(path, value)
```

### Adding New Blueprint Fields

When adding a new field to the blueprint schema, follow these steps:

**Step 1: Define in Blueprint Schema** (`lib/blueprint-schema.js`)
```javascript
// Add to BLUEPRINT_FIELDS object
export const BLUEPRINT_FIELDS = {
    // ... existing fields ...

    opening_message: {
        type: 'string',
        required: false,           // Optional field
        min: 1,
        max: 50000,
        description: 'Pre-generated opening message (optional)'
    }
};

// If the field uses a dropdown, add to DROPDOWN_OPTIONS
export const DROPDOWN_OPTIONS = {
    // ... existing options ...

    myNewDropdown: [
        { value: 'option1', label: 'Option 1' },
        { value: 'option2', label: 'Option 2' }
    ]
};
```

**Step 2: Update Blueprint Typedef** (`lib/blueprint-module.js`)
```javascript
/**
 * @typedef {Object} Blueprint
 * @property {string} blueprint_id - Unique identifier
 * // ... existing properties ...
 * @property {string} [opening_message] - Pre-generated opening message (optional)
 */
```

**Step 3: Update normalizeBlueprint()** (`lib/blueprint-module.js`)
```javascript
export function normalizeBlueprint(blueprint) {
    const normalized = { /* ... */ };

    // Add normalization for new field
    if (Object.prototype.hasOwnProperty.call(blueprint, 'opening_message')) {
        // Validate and sanitize
        const openingMsg = blueprint.opening_message;
        if (typeof openingMsg === 'string' && openingMsg.trim().length > 0 && openingMsg.length < 50000) {
            normalized.opening_message = openingMsg.trim();
        } else {
            console.warn('[BlueprintModule] Invalid opening_message in blueprint, discarding');
            normalized.opening_message = undefined;
        }
    } else {
        normalized.opening_message = undefined;  // Use undefined for optional fields
    }

    return normalized;
}
```

**Step 4: Add Getter/Setter Functions** (`lib/blueprint-module.js`)

For fields that need special handling, add dedicated functions:

```javascript
/**
 * Save opening message to the current blueprint
 * @param {string} openingText - The opening message text
 * @returns {Promise<Object>} Result object with success status
 */
export async function saveOpeningMessageToBlueprint(openingText) {
    const blueprintState = getBlueprintState();
    if (!blueprintState.blueprint) {
        return { success: false, error: 'No blueprint loaded' };
    }

    // Validate and sanitize
    if (typeof openingText !== 'string' || openingText.trim().length === 0) {
        console.warn('[BlueprintModule] Invalid opening message provided');
        return { success: false, error: 'Invalid opening message' };
    }

    if (openingText.length >= 50000) {
        console.warn('[BlueprintModule] Opening message too long, truncating');
        openingText = openingText.substring(0, 50000);
    }

    blueprintState.blueprint.opening_message = openingText.trim();
    await saveBlueprintState(blueprintState);
    console.log('[Story Mode Blueprint] Opening message saved to blueprint');
    return { success: true };
}

/**
 * Get stored opening message from current blueprint
 * @returns {string|null} The stored opening message, or null if none exists
 */
export function getStoredOpeningMessage() {
    const blueprintState = getBlueprintState();
    return blueprintState.blueprint?.opening_message || null;
}
```

**Step 5: Add UI Components** (`lib/ui-components.js`)

Add display sections for your new field:

```javascript
export function renderBlueprintSpoilerPanel(BlueprintModule, escapeHtml) {
    const bp = blueprintState.blueprint;

    // Add section to display the field (if it exists)
    ${bp.opening_message ? `
    <div class="storymode-card">
        <h4 class="storymode-card-title"><i class="fa-solid fa-book-open"></i> Stored Opening Message</h4>
        <div style="background: var(--black30a); padding: 12px; border-radius: 8px; max-height: 200px; overflow-y: auto;">
            ${escapeHtml(bp.opening_message)}
        </div>
    </div>
    ` : ''}
}
```

**Step 6: Add Editor Fields** (`lib/blueprint-editor.js`)

If the field should be editable in the blueprint editor:

```javascript
function buildDetailsTabContent(bp, storyTypes, authorStyles) {
    return `
        <div class="storymode-form-section">
            <h3 class="storymode-section-title">Opening Message</h3>
            <div class="storymode-form-group">
                <label for="edit_opening_message">Opening Message (Optional)</label>
                <textarea id="edit_opening_message" class="storymode-textarea"
                          data-field="opening_message" rows="6"
                          placeholder="Pre-generated opening message for Scene 1..."
                >${escapeHtml(bp.opening_message || '')}</textarea>
            </div>
        </div>
    `;
}
```

**Step 7: Add Event Handlers** (`index.js`)

Wire up UI interactions:

```javascript
// Event handler for generation button
$(document).on('click', '#generate_opening_btn', async function() {
    const btn = $(this);
    const originalText = btn.html();
    const saveToBlueprint = $('#save_opening_to_blueprint').is(':checked');

    // Set loading state
    btn.prop('disabled', true);
    btn.html('<i class="fa-solid fa-circle-notch fa-spin"></i> Generating...');
    LoadingIndicator.show('Generating opening message...');

    try {
        const result = await BlueprintModule.generateOpeningMessage({ saveToBlueprint });
        if (result.success) {
            const statusText = saveToBlueprint
                ? 'Opening message generated and saved to blueprint!'
                : 'Opening message generated! (not saved)';
            toastr.success(statusText, 'Blueprint');

            // Refresh UI to show the stored message
            if (saveToBlueprint) {
                // Update displays...
            }
        } else {
            toastr.error(`Failed: ${result.error}`, 'Blueprint');
        }
    } catch (error) {
        console.error('[Story Mode] Error generating opening message:', error);
        toastr.error(`Failed: ${error.message}`, 'Blueprint');
    } finally {
        // Always restore button state
        LoadingIndicator.hide();
        btn.prop('disabled', false);
        btn.html(originalText);
    }
});
```

**Important Patterns:**

1. **Optional vs Required Fields:**
   - Required fields: Use `null` or empty defaults, validate on save
   - Optional fields: Use `undefined` when missing, allows clean JSON export

2. **Field Access Pattern:**
   ```javascript
   // ✅ CORRECT - Use optional chaining
   const value = blueprint.opening_message || null;
   const nested = blueprint.metadata?.coverGallery || [];

   // ❌ WRONG - Don't assume presence
   const value = blueprint.opening_message;  // May be undefined
   ```

3. **Validation:**
   - Validate at normalization (import/load time)
   - Validate at save time (user input)
   - Use schema definitions from `blueprint-schema.js`

4. **Backward Compatibility:**
   - Optional fields must not break old blueprints
   - Use `hasOwnProperty` checks in normalization
   - Provide sensible defaults (usually `undefined`)

5. **Export/Import:**
   - Fields are automatically included in JSON export
   - PNG export stores blueprint in image metadata
   - Normalization ensures imported data is validated

**Example: The opening_message Field**

The `opening_message` field was added following this exact pattern:
- Defined in `BLUEPRINT_FIELDS` as optional string (lines 284-290 in blueprint-schema.js)
- Added to Blueprint typedef (line 174 in blueprint-module.js)
- Normalized with validation (lines 1520-1529 in blueprint-module.js)
- Getter/setter functions added (lines 2421-2448 in blueprint-module.js)
- UI display section added (lines 1311-1331 in ui-components.js)
- Event handlers added (lines 1679-1710 in index.js)
- Checkbox control for "Save to blueprint" (line 1684 in index.js)
- Integration with "Start Story" flow (lines 1779-1792 in index.js)

This demonstrates the complete workflow from schema definition to user-facing feature.

## Loading Indicator Module

### Overview

The Loading Indicator module is a standalone, reusable component that displays authorship-themed loading messages during async operations. It was designed to be easily extractable for use in other SillyTavern extensions.

### Usage

**Basic Usage:**
```javascript
import * as LoadingIndicator from './lib/loading-indicator.js';

// Initialize on extension load
await LoadingIndicator.init();

// Show the indicator
LoadingIndicator.show();

// ... async operation ...

// Hide the indicator
LoadingIndicator.hide();
```

**With Custom Message:**
```javascript
LoadingIndicator.show('Generating blueprint...');
// ... async operation ...
LoadingIndicator.hide();
```

### Features

- **Authorship-themed phrases**: 12 default phrases like "Gathering muses...", "Crafting prose...", etc.
- **Position configurable**: Bottom-left, bottom-right, top-left, or top-right
- **Animation styles**: Spin, pulse, or bounce (CSS-based)
- **Custom GIF support**: Optionally use a custom GIF URL instead of CSS animations
- **Enable/disable toggle**: Can be disabled via settings or API

### Settings Storage

Settings are stored independently in `extension_settings.loading_indicator`:
```javascript
{
    enabled: true,
    position: 'bottom-left',
    customGifUrl: null,
    phrases: [...],
    animationStyle: 'spin'
}
```

### Public API

```javascript
// Initialize the module (creates DOM container)
LoadingIndicator.init()

// Show the indicator with optional custom message
LoadingIndicator.show(message = null)

// Hide the indicator
LoadingIndicator.hide()

// Update settings and persist
LoadingIndicator.updateSettings(newSettings)

// Get current settings
LoadingIndicator.getSettings() => Object

// Check if currently visible
LoadingIndicator.isShowing() => boolean
```

### Default Phrases

1. "Gathering muses..."
2. "Putting pen to paper..."
3. "Consulting the literary canon..."
4. "Channeling creative inspiration..."
5. "Weaving narrative threads..."
6. "Crafting prose..."
7. "Summoning the muse..."
8. "Polishing the manuscript..."
9. "Composing eloquent verses..."
10. "Orchestrating plot points..."
11. "Refining character arcs..."
12. "Distilling artistic vision..."

### Integration Points

The loading indicator is integrated into the following operations:
- Blueprint generation (index.js)
- Opening message generation (index.js)
- Epilogue generation (event-handlers.js, wand-menu.js)
- Summary generation (event-handlers.js)

### Cross-Extension Usage

To use this module in another extension:

1. Copy `lib/loading-indicator.js` and `lib/loading-indicator.css` to your extension
2. Import and initialize:
```javascript
import * as LoadingIndicator from './lib/loading-indicator.js';
LoadingIndicator.init();
```

3. Import the CSS (add to your extension's style.css):
```css
@import url('./lib/loading-indicator.css');
```

4. Use in async operations:
```javascript
LoadingIndicator.show('Processing...');
try {
    await doAsyncWork();
} finally {
    LoadingIndicator.hide();
}
```

## UI Button Loading State Pattern

When implementing buttons that trigger async operations (API calls, LLM generation, etc.), follow this pattern to ensure proper UX:

### Required Behavior

1. **Disable button during operation** - Prevent duplicate clicks
2. **Show loading indicator** - Visual feedback that operation is in progress
3. **Update button text** - Show "Generating..." with spinning icon
4. **Always restore state** - Re-enable button and restore text after completion (success or failure)

### Standard Pattern

```javascript
content.on('click', '#my_action_button', async function() {
    const btn = $(this);
    const originalText = btn.html();

    // Set loading state
    btn.prop('disabled', true);
    btn.html('<i class="fa-solid fa-circle-notch fa-spin"></i> Generating...');
    LoadingIndicator.show('Processing...');

    try {
        const result = await someAsyncOperation();
        if (result.success) {
            // Handle success
            toastr.success('Operation completed');
        } else {
            // Handle error
            toastr.error(`Failed: ${result.error}`);
        }
    } catch (error) {
        console.error('[MyModule] Error:', error);
        toastr.error(`Failed: ${error.message}`);
    } finally {
        // Always restore button state
        LoadingIndicator.hide();
        btn.prop('disabled', false);
        btn.html(originalText);
    }
});
```

### Key Points

- **Save original text first** - Store `btn.html()` before modifying
- **Use FontAwesome spin icon** - `<i class="fa-solid fa-circle-notch fa-spin"></i>` for loading state
- **Always restore in `finally`** - Ensures button is re-enabled even on error
- **Include LoadingIndicator** - Shows global loading overlay with themed message
- **Show toastr feedback** - Success/error messages for user awareness

### Examples in Codebase

- **Generate Blueprint** (`index.js:586`) - Blueprint generation with loading state
- **Generate Opening Message** (`index.js:848`) - Opening message generation with loading state
- **Epilogue/Summary** (`event-handlers.js`) - Content generation with loading state

### Note

This pattern should be applied to **any** button click handler that triggers async operations with delays, including:
- LLM generation calls
- API requests
- File imports/exports
- Long-running computations

