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
    │   ├── module.js        # Core blueprint operations (large)
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
    │   ├── export.js        # Export to PNG
    │   ├── merger.js        # Blueprint merging
    │   ├── utils.js         # Utility functions
    │   └── characters/      # Character linking
    │       ├── linker.js    # Link blueprints to ST characters
    │       └── discovery.js # Character discovery
    ├── generation/          # LLM generation
    │   ├── index.js         # Re-exports public API
    │   ├── orchestration.js # Phased generation coordinator
    │   ├── prompts.js       # Prompt builders for each phase
    │   └── templates.js     # Prompt templates
    ├── ui/                  # UI rendering
    │   ├── index.js         # Re-exports public API
    │   ├── components.js    # HTML rendering functions (large)
    │   ├── component-system.js # Shared UI utilities
    │   ├── controller-panel.js # Floating/docked controller
    │   └── wand-menu.js     # Quick controls dropdown
    ├── editor/              # Editors
    │   ├── index.js         # Re-exports public API
    │   ├── blueprint-editor.js # Split-panel blueprint editor (large)
    │   └── type-editors.js  # Story type/author style CRUD
    ├── dialog/              # Dialog modules
    │   ├── wizard.js        # Blueprint generation wizard
    │   ├── settings-handlers.js # Settings dialog event handlers
    │   └── library-view.js  # Library tab operations
    ├── scenario/            # Scenario Mode runtime
    │   ├── index.js         # Re-exports public API
    │   ├── injection.js     # Scenario prompt injection
    │   └── beats.js         # Beat state management
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
    │   └── mocks.js
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
| `index.js` | 1,264 | Entry point, UI setup, settings dialog |
| `lib/blueprint/module.js` | 2,165 | Core blueprint operations, Scenario Mode |
| `lib/editor/blueprint-editor.js` | 2,197 | Split-panel blueprint editor |
| `lib/ui/components.js` | 2,243 | HTML rendering functions |
| `lib/editor/type-editors.js` | 1,052 | Story type/author style CRUD |
| `lib/ui/controller-panel.js` | 1,007 | Floating/docked Story Controller |
| `lib/generation/templates.js` | 973 | LLM prompt templates |
| `lib/dialog/settings-handlers.js` | 929 | Settings dialog event handlers |
| `lib/blueprint/library.js` | 926 | Blueprint library management |
| `lib/dialog/wizard.js` | 841 | Blueprint generation wizard |
| `lib/core/state-manager.js` | 673 | Settings, chat state, data storage |
| `lib/core/event-handlers.js` | 656 | Message events, signal parsing |
| `lib/generation/orchestration.js` | 650 | Phased generation coordinator |

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
├── utils.js (imports state-manager)
├── storage.js (imports utils, validation, png/*)
├── file-api.js (no internal deps, wraps fetch)
├── manifest.js (imports file-api)
├── file-storage.js (imports file-api, manifest, storage)
├── library-adapter.js (imports file-storage, manifest)
├── module.js (imports most core + generation modules)
└── integration.js (imports library-adapter, storage, module, migration)

lib/ui/
├── component-system.js (no internal deps)
├── components.js (imports state-manager, arc-engine, blueprint/module)
├── controller-panel.js (imports state-manager, blueprint/module)
└── wand-menu.js (imports state-manager, event-handlers)

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
| Blueprint editor | `lib/editor/blueprint-editor.js` | `type-editors.js` |
| Settings dialog | `lib/dialog/settings-handlers.js` | `lib/ui/components.js` |
| Controller panel | `lib/ui/controller-panel.js` | `wand-menu.js` |
| Scenario Mode | `lib/scenario/injection.js` | `beats.js`, `blueprint/module.js` |
| Scene images | `lib/scene/image-generator.js` | `image-prompt.js`, `image-storage.js` |
| Debug mocks | `lib/debug/mocks.js` | - |
