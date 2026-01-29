# Architecture

Deep documentation of Story Mode's system design. For quick reference, see [CLAUDE.md](./CLAUDE.md). For file/module index, see [CODEINDEX.md](./CODEINDEX.md).

## Dual Pacing Mode System

The extension supports two distinct pacing modes. See `Planning/v2/ARCHITECTURE-dual-pacing-modes.md` for full details.

### Mode A: Story Mode (Round-Based)
- **When**: No blueprint OR `chatState.pacingMode === 'story'`
- **Progression**: User message → `currentStep++` → phase calculation
- **Scene Position**: Calculated from round: `floor((currentStep / arcLength) * sceneCount)`
- **Exit**: `currentStep >= arcLength` triggers arc completion

### Mode B: Scenario Mode (Signal-Based)
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

**Pacing Mode Exports** (from `lib/core/state-manager.js`):
```javascript
import { getPacingMode, PACING_MODES } from '../core/state-manager.js';

// Check current mode (returns 'story' or 'scenario')
const mode = getPacingMode();

// Use constants for type-safe comparisons
if (mode === PACING_MODES.STORY) { /* round-based UI */ }
if (mode === PACING_MODES.SCENARIO) { /* signal-based UI */ }
```

**UI Mode Awareness:**
- Arc controls (Go Forward/Back, Reset Arc) → only in Story Mode
- Scene/beat displays → primarily Scenario Mode (optional in Story Mode with blueprint)
- Status text → "Round X/Y" (Story) vs "Scene X/Y" (Scenario)

## Core Concepts

**Rounds:** Increment on USER message submission (not AI response). Enables group chat where multiple AI characters respond per round. Only used in Story Mode.

**Three-Act Structure:** Fixed 33% phase boundaries (Story Mode only):
- Setup (0-33%): World-building, character introduction
- Confrontation (34-66%): Escalating challenges
- Resolution (67-100%): Climax and conclusion

**Abstract Acts (Scenario Mode):** Based on **StoryVerse** (Wang et al., 2024). Scenes defined by goals, not round counts. Beats are flexible milestones with visual markers: `[✓ done] [→ current] [□ pending] [x skipped]`

## State Storage

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

## Data Flow

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

## Round-Based Progression (Story Mode)

**Critical:** Rounds increment on USER message, not AI response (supports group chat).

**Edge Cases:**
- `isLoadingChat` - prevents increment during chat load
- `isRegenerating` - prevents increment during regeneration/swipe
- `currentStep >= arcLength` - triggers arc completion

**Implementation:** `handleUserMessageStep()` in `lib/core/event-handlers.js`

## Signal-Based Progression (Scenario Mode)

**Critical:** Scenes advance via LLM signals, not round count.

**Signal Processing:**
1. `onMessageReceived()` triggers for AI messages
2. `processStorySignals()` calls `parseStorySignals()` to extract signals
3. Signals update `chatState.scenario.beatState` and `currentSceneIndex`
4. Signals are stripped from displayed message text
5. UI refreshes to show new state

**Beat State Values:** `'complete'` | `'pending'` | `'skipped'`

**Implementation:** `processStorySignals()` in `lib/core/event-handlers.js`

## Arc Completion

**Story Mode:** When `currentStep >= arcLength`
**Scenario Mode:** When `@@STORY_COMPLETE@@` signal received

`handleArcCompletion()` generates epilogue/summary/end notice (each once, protected by flags).

## Blueprint Storage (File-Backed)

Blueprints are stored as PNG files with embedded metadata, using SillyTavern's `/api/files/*` endpoints for browser-agnostic persistence.

**File Locations:**
```
data/default-user/user/files/
├── storymode-manifest.json        # Library index (lightweight)
└── storymode-bp-{uuid}.png        # Blueprint PNGs (cover + metadata)
```

**Key Modules:**
- `lib/blueprint/file-api.js` - Wraps SillyTavern file endpoints
- `lib/blueprint/manifest.js` - In-memory manifest with debounced save
- `lib/blueprint/file-storage.js` - Save/load/delete operations
- `lib/blueprint/library-adapter.js` - `FileBackedLibrary` class (drop-in for IndexedDB)

**Manifest Schema:**
```javascript
{
  version: 1,
  lastModified: "ISO timestamp",
  blueprints: [{
    blueprint_id, title, story_type_name, scene_count,
    favorite, access_count, last_accessed_at,
    created_at, modified_at, filename
  }]
}
```

**Design Decisions:**
1. **No subdirectories** - SillyTavern file API only supports root `user/files/`
2. **No thumbnails** - Use full PNG with CSS `object-fit: cover` (avoids quality loss)
3. **No re-encoding on import** - Store original PNG bytes directly
4. **Debounced manifest saves** - Flush immediately on critical operations (save, delete)
5. **Cache-busting URLs** - `modified_at` timestamp in query string prevents stale covers

**Cover Image Priority** (`getBlueprintCoverUrl()`):
1. `blueprint.coverFileUrl` - File-backed storage URL
2. `blueprint.coverImageUrl` - Data URL from SD generation
3. `blueprint.libraryData.coverThumbnail` - Legacy thumbnail
4. `blueprint.metadata.coverGallery[index].url` - Gallery image

## Characters & Personas

Characters and personas flow through blueprint generation, library linking, export/import, and multiple UI surfaces. See **[CHARACTERS-AND-PERSONAS.md](./CHARACTERS-AND-PERSONAS.md)** for the full reference covering:
- Blueprint fields (`character_arcs`, `scene_plan.character_focus`, `embeddedResources`)
- Status detection (linked / embedded / missing)
- Export embedding and import flows
- Editor characters tab structure
- Known issue: `selectedPersonas` vs `personaData` field mismatch

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

**Start Story from Blueprint:** Syncs settings, enables Scenario Mode (`pacingMode = 'scenario'`), sets `sceneMode = 'manual'`, prompts to use stored opening message. See `lib/blueprint/module.js:startStoryFromBlueprint()`.

**Pure State Modification Pattern:** Settings and scenario state changes use pure functions that modify objects in memory without saving to disk. The caller is responsible for a single `saveMetadata()` call after all changes are accumulated. This prevents redundant network writes.
```javascript
// Pure functions (no side effects, no saves):
calculateBlueprintSettingsChanges(currentState, blueprint) // → { proposedChanges, changes, detailChanges }
applyBlueprintSettingsToState(state, proposedChanges)      // mutates state in place
applyScenarioModeToState(chatState, blueprintState, bp)    // mutates both in place

// syncBlueprintSettings() delegates to these internally (dialog + apply + save)
// startStoryFromBlueprint() uses them directly for single-save optimization
```

**⚠️ When adding new state fields to the startup flow:** Add them to the appropriate pure function, not as a separate save call. Both `syncBlueprintSettings` and `startStoryFromBlueprint` will pick up the change automatically.

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

## Future Features

### Scene-by-Scene Summarization (UI exists, not implemented)
**Status:** Settings UI exists in `lib/ui/components.js` with toggles for:
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
