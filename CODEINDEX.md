# Code Index

File structure, module dependencies, and integration points. For quick reference, see [CLAUDE.md](./CLAUDE.md). For system design, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Directory Structure

```
Extension-StoryMode/
├── index.js                 # Entry point, UI setup, event wiring
├── style.css                # Main stylesheet (imports from lib/css/)
├── manifest.json            # Extension manifest
├── CLAUDE.md                # Quick reference for Claude Code
├── ARCHITECTURE.md          # System design documentation
├── CODEINDEX.md             # This file
├── data/
│   ├── story_types.json     # 40+ story type definitions
│   └── author_styles.json   # 40+ author style definitions
└── lib/
    ├── core/                # Core state and logic
    │   ├── index.js         # Re-exports public API
    │   ├── constants.js     # MODULE_NAME, PHASE_CONFIG, presets
    │   ├── state-manager.js # Settings, chat state, data storage
    │   ├── arc-engine.js    # Phase calculation, prompt injection
    │   └── event-handlers.js# Message events, signal parsing
    ├── blueprint/           # Blueprint system
    │   ├── index.js         # Re-exports public API
    │   ├── module.js        # Core blueprint operations, re-exports extracted modules
    │   ├── injection.js     # Blueprint prompt injection (extracted from module.js)
    │   ├── scene-pacing.js  # Scene pacing calculations (extracted from module.js)
    │   ├── summarization.js # Scene summarization (extracted from module.js)
    │   ├── schema.js        # Blueprint field definitions
    │   ├── validation.js    # Blueprint validation
    │   ├── normalization.js # Data normalization
    │   ├── storage.js       # PNG encode/decode, persistence
    │   ├── integration.js   # Library API facade
    │   ├── library.js       # Blueprint library management (legacy IndexedDB)
    │   ├── file-api.js      # SillyTavern /api/files/* wrapper
    │   ├── manifest.js      # Manifest manager (in-memory + debounced save)
    │   ├── file-storage.js  # File-backed save/load/delete
    │   ├── library-adapter.js # FileBackedLibrary class
    │   ├── migration.js     # IndexedDB → file storage migration
    │   ├── import.js        # Import from PNG/JSON
    │   ├── import-ui.js     # Import dialogs and UI components
    │   ├── missing-style-handler.js # Handle missing story types/author styles
    │   ├── export.js        # Export to PNG
    │   ├── merger.js        # Blueprint merging
    │   ├── utils.js         # Utility functions
    │   ├── placeholders.js  # Placeholder resolution ([Protagonist], etc.)
    │   ├── blank-blueprint.js # Blank blueprint factory, placeholder covers
    │   └── characters/      # Character linking
    │       ├── linker.js    # Link blueprints to ST characters
    │       └── discovery.js # Character discovery
    ├── generation/          # LLM generation
    │   ├── index.js         # Re-exports public API
    │   ├── orchestration.js # Phased generation coordinator
    │   ├── prompts.js       # Prompt builders for each phase
    │   ├── templates.js     # Prompt templates
    │   ├── section-generator.js # Section-at-a-time generation for wizard
    │   ├── validation.js    # Phase output validation
    │   └── metrics.js       # Token/timing metrics tracking
    ├── ui/                  # UI rendering
    │   ├── index.js         # Re-exports public API
    │   ├── components.js    # Re-export layer (imports from components/)
    │   ├── component-system.js # Shared UI utilities
    │   ├── controller-panel.js # Floating/docked controller
    │   ├── wand-menu.js     # Quick controls dropdown
    │   └── components/      # Split component modules
    │       ├── index.js     # Re-exports all components
    │       ├── helpers.js   # createHelpIcon, createToggle
    │       ├── main-panel.js # renderMainPanel, renderBlueprintPreview
    │       ├── settings-tabs.js # Settings dialog subtabs
    │       ├── blueprint-settings.js # Blueprint settings subtab
    │       ├── blueprint-tabs.js # Blueprint generation/display tabs
    │       ├── wizard.js    # Wizard progress/preview components
    │       ├── library.js   # Library tab, blueprint cards
    │       ├── sidebar.js   # Settings sidebar
    │       ├── misc.js      # Additional tab content
    │       ├── character-picker.js # Character picker component
    │       └── phase-override-panel.js # Per-phase API profile overrides
    ├── editor/              # Editors
    │   ├── index.js         # Re-exports public API
    │   ├── blueprint-editor.js # Split-panel blueprint editor (orchestrator)
    │   ├── type-editors.js  # Story type/author style CRUD
    │   └── blueprint-editor/ # Editor submodules
    │       ├── state.js         # Shared state (getter/setter pattern)
    │       ├── panels.js        # Left/right panel renderers
    │       ├── event-handlers.js # Document-level event delegation
    │       ├── editor-action-handlers.js # Play, export, revert, view JSON
    │       ├── cover-action-handlers.js # Cover generation, upload, prompt
    │       ├── cover-generation.js # SD cover generation
    │       ├── cover-gallery.js # Cover gallery navigation
    │       ├── cover-handlers.js # Cover field/gallery event handlers
    │       ├── character-handlers.js # Character tab event handlers
    │       ├── wizard-panel.js  # AI wizard side panel
    │       ├── scene-crud.js    # Scene add/edit/delete/reorder
    │       ├── scene-beats-editor.js # Beat editor within scenes
    │       ├── details-tab.js   # Blueprint details form
    │       ├── scenes-tab.js    # Scene list display
    │       ├── cover-tab.js     # Cover tab with gallery
    │       └── characters-tab.js # Character linking tab
    ├── dialog/              # Dialog modules
    │   ├── wizard.js        # Blueprint generation wizard
    │   ├── settings-handlers.js # Settings dialog event handlers
    │   └── library-view.js  # Library tab operations
    ├── scenario/            # Scenario Mode runtime
    │   ├── index.js         # Re-exports public API
    │   ├── injection.js     # Scenario prompt injection
    │   ├── beats.js         # Beat state management
    │   └── character-injection.js # Character detection and injection
    ├── scene/               # Scene image generation
    │   ├── index.js         # Re-exports public API
    │   ├── image-generator.js
    │   ├── image-prompt.js
    │   ├── image-preview.js
    │   └── image-storage.js
    ├── png/                 # PNG handling
    │   ├── index.js         # Re-exports public API
    │   ├── encoder.js       # PNG encoding
    │   ├── decoder.js       # PNG decoding
    │   └── chunk-handler.js # PNG chunk manipulation
    ├── debug/               # Debug utilities
    │   ├── index.js
    │   ├── mocks.js         # Mock LLM responses for testing
    │   └── test-data-loader.js # Blueprint test data loader (disabled)
    ├── utils/               # Shared utilities
    │   └── import-helpers.js # Import sanitization and deduplication
    └── css/                 # Stylesheets
        ├── base.css
        ├── settings-dialog.css
        ├── controller-panel.css
        ├── wizard.css
        ├── library.css
        └── blueprint-editor.css
```

## Key Files by Size

| File | Lines | Purpose |
|------|-------|---------|
| `index.js` | ~1,264 | Entry point, UI setup, settings dialog |
| `lib/editor/type-editors.js` | ~1,052 | Story type/author style CRUD |
| `lib/ui/controller-panel.js` | ~1,007 | Floating/docked Story Controller |
| `lib/blueprint/module.js` | ~990 | Core blueprint operations, re-exports extracted modules |
| `lib/generation/templates.js` | ~973 | LLM prompt templates |
| `lib/dialog/settings-handlers.js` | ~929 | Settings dialog event handlers |
| `lib/blueprint/library.js` | ~926 | Blueprint library management |
| `lib/dialog/wizard.js` | ~841 | Blueprint generation wizard |
| `lib/core/state-manager.js` | ~673 | Settings, chat state, data storage |
| `lib/core/event-handlers.js` | ~656 | Message events, signal parsing |
| `lib/generation/orchestration.js` | ~650 | Phased generation coordinator |

### Extracted Blueprint Modules (lib/blueprint/)

| File | Lines | Purpose |
|------|-------|---------|
| `summarization.js` | ~300 | Scene summarization, auto-summary triggers |
| `scene-pacing.js` | ~150 | Scene pacing calculations, scene boundary logic |
| `injection.js` | ~250 | Blueprint prompt injection XML builder |

These modules were extracted from `module.js` to improve maintainability. They are re-exported from `module.js` for backward compatibility.

### Split Component Modules (lib/ui/components/)

| File | Lines | Purpose |
|------|-------|---------|
| `blueprint-tabs.js` | ~431 | Blueprint generation and display tabs |
| `blueprint-settings.js` | ~382 | Blueprint settings subtab |
| `settings-tabs.js` | ~359 | Settings dialog subtabs |
| `character-picker.js` | ~300 | Character picker component |
| `wizard.js` | ~298 | Wizard progress/preview components |
| `phase-override-panel.js` | ~240 | Per-phase API profile and token limit overrides |
| `main-panel.js` | ~206 | Main panel and blueprint preview |
| `library.js` | ~205 | Library tab, blueprint cards |
| `index.js` | ~90 | Re-exports all components |
| `sidebar.js` | ~75 | Settings sidebar |
| `misc.js` | ~65 | Additional tab content |
| `helpers.js` | ~43 | Utility functions |

Note: `lib/ui/components.js` is now a thin re-export layer (~16 lines) for backward compatibility.

### Blueprint Editor Modules (lib/editor/blueprint-editor/)

| File | Lines | Purpose |
|------|-------|---------|
| `blueprint-editor.js` | ~351 | Main orchestrator, wires up submodules |
| `event-handlers.js` | ~381 | Document-level event delegation |
| `wizard-panel.js` | ~327 | AI wizard side panel for section generation |
| `details-tab.js` | ~318 | Blueprint details form fields |
| `cover-action-handlers.js` | ~290 | Cover generation, upload, prompt management |
| `editor-action-handlers.js` | ~237 | Play, export, revert, view JSON handlers |
| `cover-tab.js` | ~224 | Cover tab with gallery and prompt editor |
| `scene-beats-editor.js` | ~216 | Beat rendering and editing within scenes |
| `cover-gallery.js` | ~174 | Gallery navigation and image management |
| `scene-crud.js` | ~146 | Scene add/edit/delete/reorder |
| `panels.js` | ~131 | Left panel (info) and right panel (tabs) renderers |
| `characters-tab.js` | ~122 | Character linking tab |
| `cover-generation.js` | ~111 | SD cover image generation |
| `character-handlers.js` | ~85 | Character tab event handlers |
| `cover-handlers.js` | ~79 | Cover field and gallery event handlers |
| `state.js` | ~74 | Getter/setter state management |
| `scenes-tab.js` | ~63 | Scene list display |

The blueprint editor uses **dependency injection** for refresh functions to avoid circular imports between modules.

### Re-export Pattern for Extracted Modules

When functions are extracted from a large module, the original module re-exports them for backward compatibility:

```javascript
// In module.js - MUST use import-then-export pattern
import { getScenePacingInfo, getCurrentScene } from './scene-pacing.js';
export { getScenePacingInfo, getCurrentScene };

// NOT direct re-export (breaks if functions are used locally)
// export { getScenePacingInfo } from './scene-pacing.js'; // ❌ No local binding
```

Direct re-exports (`export { x } from './foo.js'`) don't create local bindings, so if the function is referenced elsewhere in the file (e.g., in a default export object), use the import-then-export pattern.

### Generation Modules (lib/generation/)

| File | Lines | Purpose |
|------|-------|---------|
| `templates.js` | ~973 | LLM prompt templates |
| `orchestration.js` | ~650 | Phased generation coordinator |
| `prompts.js` | ~200 | Prompt builders for each phase |
| `section-generator.js` | ~122 | Section-at-a-time generation for wizard panel |
| `metrics.js` | ~63 | Token counting, timing, performance tracking |
| `validation.js` | ~56 | Phase result and output validation |

## Module Dependencies

```
lib/core/
├── constants.js (no deps)
├── state-manager.js (imports constants)
├── arc-engine.js (imports state-manager)
└── event-handlers.js (imports state-manager, arc-engine, blueprint/module)

lib/blueprint/
├── schema.js (no internal deps)
├── validation.js (imports schema)
├── utils.js (imports file-api for blueprintFilename)
├── placeholders.js (no internal deps)
├── storage.js (imports utils, validation, png/*)
├── file-api.js (no internal deps, wraps fetch)
├── manifest.js (imports file-api)
├── file-storage.js (imports file-api, manifest, storage)
├── library-adapter.js (imports file-storage, manifest)
├── blank-blueprint.js (imports utils, normalization)
├── import.js (imports storage, validation, utils)
├── import-ui.js (imports utils, popup.js)
├── export.js (imports storage, utils)
├── injection.js (imports state-manager, storage) [extracted from module.js]
├── scene-pacing.js (imports state-manager, storage) [extracted from module.js]
├── summarization.js (imports state-manager, storage, generation/*) [extracted from module.js]
├── module.js (imports + re-exports injection, scene-pacing, summarization; imports core/*, generation/*)
└── integration.js (imports library-adapter, storage, module, migration)

lib/ui/
├── component-system.js (no internal deps)
├── components.js (re-exports from components/index.js)
├── controller-panel.js (imports state-manager, blueprint/module)
├── wand-menu.js (imports state-manager, event-handlers)
└── components/
    ├── index.js (re-exports all)
    ├── helpers.js (imports component-system)
    ├── main-panel.js (imports state-manager, blueprint/module)
    ├── settings-tabs.js (imports state-manager, arc-engine, helpers)
    ├── blueprint-settings.js (imports state-manager, helpers)
    ├── blueprint-tabs.js (imports state-manager, blueprint/module, helpers, wizard, phase-override-panel)
    ├── wizard.js (imports component-system)
    ├── library.js (imports blueprint/utils, blueprint-tabs)
    ├── sidebar.js (imports component-system)
    ├── misc.js (imports state-manager)
    ├── character-picker.js (imports component-system, blueprint/characters/*)
    └── phase-override-panel.js (imports core/constants, helpers)

lib/editor/
├── blueprint-editor.js (orchestrator - wires up all submodules)
└── blueprint-editor/
    ├── state.js (no deps - pure getter/setter state)
    ├── panels.js (imports state, details-tab, scenes-tab, cover-tab, characters-tab, wizard-panel)
    ├── event-handlers.js (imports state, cover-action-handlers, editor-action-handlers, scene-crud, scene-beats-editor, cover-gallery, character-handlers, cover-handlers, wizard-panel)
    ├── editor-action-handlers.js (imports state, blueprint/module)
    ├── cover-action-handlers.js (imports state, cover-generation, cover-gallery, blueprint/storage)
    ├── cover-generation.js (imports state, blueprint/module, blueprint/storage)
    ├── cover-gallery.js (imports state, blueprint/utils)
    ├── cover-handlers.js (imports state, blueprint/utils, blueprint/storage, cover-gallery)
    ├── character-handlers.js (imports characters-tab)
    ├── wizard-panel.js (imports state, blueprint/utils, blueprint/blank-blueprint, core/state-manager, event-handlers, generation/orchestration)
    ├── scene-crud.js (imports state, blueprint/utils, scene-beats-editor)
    ├── scene-beats-editor.js (imports blueprint/utils, blueprint/schema)
    ├── details-tab.js (imports state, core/state-manager)
    ├── scenes-tab.js (imports state)
    ├── cover-tab.js (imports state, cover-gallery)
    └── characters-tab.js (imports state, blueprint/characters/*)

lib/generation/
├── templates.js (no internal deps)
├── prompts.js (imports templates)
├── validation.js (no internal deps)
├── metrics.js (imports SillyTavern tokenizers)
├── section-generator.js (imports core/constants, prompts, validation, orchestration, debug/mocks)
└── orchestration.js (imports core/*, prompts, templates, validation, metrics, blueprint/utils)

lib/scenario/
├── injection.js (imports state-manager, character-injection)
├── beats.js (imports state-manager)
└── character-injection.js (imports blueprint/characters/*, scenario/injection)

lib/utils/
└── import-helpers.js (no deps - pure functions)

lib/dialog/
├── wizard.js (imports generation/orchestration, ui/components)
├── library-view.js (imports blueprint/integration, ui/components)
└── settings-handlers.js (imports most modules via context object)

index.js (orchestrates all, provides callbacks to dialog modules)
```

## Extension Integration

### SillyTavern Events
```javascript
eventSource.on(event_types.GENERATION_STARTED, ...)      // Clear flags, update prompt
eventSource.on(event_types.USER_MESSAGE_RENDERED, ...)   // Round increment (user message)
eventSource.on(event_types.MESSAGE_RECEIVED, ...)        // Arc completion checks (AI message)
eventSource.on(event_types.CHAT_CHANGED, ...)            // Reload state
eventSource.on(event_types.MESSAGE_REGENERATED, ...)     // Set regeneration flag
```

### CSS Loading
SillyTavern loads ES6 modules **without bundling**. Use `@import url()` in `style.css`, not `import './file.css'` in JS.

## Design Patterns

### Facade Pattern
Each `lib/*/index.js` re-exports the public API for that module group. Import from the index for cleaner imports:
```javascript
// ✅ Preferred
import { validateBlueprint, normalizeBlueprint } from './lib/blueprint/index.js';

// Also OK - direct import
import { validateBlueprint } from './lib/blueprint/validation.js';
```

### Context Object Pattern
Dialog modules (`settings-handlers.js`, `wizard.js`) receive callbacks from index.js via a context object to avoid circular dependencies:
```javascript
const settingsContext = {
    storyTypes,
    authorStyles,
    updateStatusDisplay,
    refreshBlueprintPreview,
    // ...
};
setupUnifiedDialogEventListeners(content, settingsContext);
```

### State Management
`lib/core/state-manager.js` owns data arrays. Use getters/setters:
```javascript
import { getStoryTypes, setStoryTypes } from './lib/core/state-manager.js';

const storyTypes = getStoryTypes();
storyTypes.push(newType);
setStoryTypes(storyTypes);
```

### Legacy Window Exports
For backward compatibility:
- `window.updateStatusDisplay`
- `window.updateStoryPrompt`
- `window.refreshBlueprintPreview`

## Import Path Reference

### ES6 Module Import Chains
Always import from the **source module**, not intermediate re-exports:
```javascript
// ✅ CORRECT - import from source
import { generateUUID } from './lib/blueprint/utils.js';

// ✅ ALSO OK - import from facade index
import { generateUUID } from './lib/blueprint/index.js';

// ❌ WRONG - storage.js doesn't re-export utils
import { generateUUID } from './lib/blueprint/storage.js';
```

### Relative Paths After Refactoring
Files moved to subdirectories need correct relative paths:
```javascript
// From lib/core/state-manager.js to data/
const url = new URL('../../data/story_types.json', import.meta.url);

// From lib/blueprint/module.js to data/
const url = new URL('../../data/author_styles.json', import.meta.url);
```

## Quick Lookup by Feature

| Feature | Primary File | Supporting Files |
|---------|-------------|------------------|
| Story arc progression | `lib/core/arc-engine.js` | `event-handlers.js`, `state-manager.js` |
| Signal parsing | `lib/core/event-handlers.js` | - |
| Blueprint generation | `lib/generation/orchestration.js` | `prompts.js`, `templates.js` |
| Blueprint PNG encode/decode | `lib/blueprint/storage.js` | `png/*.js` |
| Blueprint file storage | `lib/blueprint/file-storage.js` | `file-api.js`, `manifest.js` |
| Blueprint library | `lib/blueprint/library-adapter.js` | `integration.js`, `manifest.js` |
| Blueprint import UI | `lib/blueprint/import-ui.js` | `import.js`, `utils.js` |
| Placeholder resolution | `lib/blueprint/placeholders.js` | - |
| Scene beat editor | `lib/editor/blueprint-editor/scene-beats-editor.js` | `schema.js`, `utils.js` |
| Blueprint editor | `lib/editor/blueprint-editor.js` | `blueprint-editor/*.js` (16 submodules) |
| Settings dialog | `lib/dialog/settings-handlers.js` | `lib/ui/components/*.js` |
| Settings tabs | `lib/ui/components/settings-tabs.js` | `blueprint-settings.js` |
| Main panel | `lib/ui/components/main-panel.js` | `helpers.js` |
| Blueprint tabs | `lib/ui/components/blueprint-tabs.js` | `wizard.js` |
| Library tab | `lib/ui/components/library.js` | `blueprint-tabs.js` |
| Controller panel | `lib/ui/controller-panel.js` | `wand-menu.js` |
| Scenario Mode | `lib/scenario/injection.js` | `beats.js`, `character-injection.js`, `blueprint/module.js` |
| Blueprint injection | `lib/blueprint/injection.js` | `storage.js`, `state-manager.js` |
| Scene pacing | `lib/blueprint/scene-pacing.js` | `storage.js`, `state-manager.js` |
| Scene summarization | `lib/blueprint/summarization.js` | `storage.js`, `generation/*` |
| Character injection | `lib/scenario/character-injection.js` | `blueprint/characters/*` |
| Scene images | `lib/scene/image-generator.js` | `image-prompt.js`, `image-storage.js` |
| Per-phase API profiles | `lib/ui/components/phase-override-panel.js` | `core/constants.js` |
| Blank blueprint factory | `lib/blueprint/blank-blueprint.js` | - |
| Wizard panel (AI assist) | `lib/editor/blueprint-editor/wizard-panel.js` | `section-generator.js` |
| Section generation | `lib/generation/section-generator.js` | `validation.js`, `metrics.js` |
| Debug mocks | `lib/debug/mocks.js` | - |
