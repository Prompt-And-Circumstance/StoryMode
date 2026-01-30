# Code Index

File structure, module dependencies, and integration points. For quick reference, see [CLAUDE.md](./CLAUDE.md). For system design, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Directory Structure

```
Extension-StoryMode/
├── index.js                 # Entry point, UI setup, event wiring
├── style.css                # Import hub (60 lines of @import statements)
├── manifest.json            # Extension manifest
├── package.json             # Package configuration
├── test-imports.js          # Import testing utilities
├── CLAUDE.md                # Quick reference for Claude Code
├── ARCHITECTURE.md          # System design documentation
├── CHANGELOG.md             # Version history
├── CODEINDEX.md             # This file
├── README.md                # Project overview
├── standalone/              # Standalone fullscreen blueprint editor (no build step)
│   ├── index.html           # Static entry point, CDN deps (jQuery, toastr, Font Awesome)
│   ├── app.js               # Main orchestrator, event wiring, init sequence
│   ├── settings-system.js   # localStorage settings, theme management
│   ├── adapters/            # SillyTavern dependency bridges
│   │   ├── connection-bridge.js  # Backend API detection and calls
│   │   ├── popup-adapter.js      # Modal system (replaces ST Popup class)
│   │   ├── notification-adapter.js # Toast notifications (wraps toastr)
│   │   ├── storage-adapter.js    # localStorage vs ST FileAPI
│   │   ├── character-adapter.js  # Read-only character access
│   │   ├── profile-adapter.js    # API profile stub
│   │   └── utils-adapter.js      # Utility shims
│   ├── editors/             # Tab-specific editors (Details, Scenes, Characters, Cover)
│   │   ├── details-editor.js          # Details tab form (reuses shared renderers)
│   │   ├── details-field-renderers.js # Individual field rendering
│   │   ├── details-section-renderers.js # Section-level rendering
│   │   ├── scenes-editor.js           # Scene CRUD with in-place refresh
│   │   ├── characters-editor.js       # Character arc CRUD
│   │   ├── cover-editor.js            # Cover image tab
│   │   ├── cover-upload-modal.js      # Cover upload dialog
│   │   ├── cover-generate-modal.js    # AI cover generation dialog
│   │   └── character-search-modal.js  # Character search dialog
│   ├── form/                # Reusable form components
│   │   ├── array-editor.js  # Dynamic array field editor
│   │   ├── collapsible.js   # Collapsible sections
│   │   ├── dropdown.js      # Dropdown component
│   │   ├── nested-form.js   # Nested object forms
│   │   └── validation.js    # Form validation
│   ├── handlers/
│   │   └── blueprint-actions.js # Blueprint CRUD, import/export operations
│   ├── ui/                  # UI modules
│   │   ├── connection.js    # Connection status banner
│   │   ├── routing.js       # Tab navigation with cache invalidation
│   │   └── modals.js        # Settings modal (API + Theme tabs)
│   ├── wizards/
│   │   └── blueprint-wizard.js # AI blueprint generation wizard
│   └── themes/              # Self-contained CSS theme system
│       ├── base.css         # CSS variables and resets
│       ├── dark.css         # Dark theme variables
│       ├── light.css        # Light theme variables
│       ├── rpg-companion.css # RPG Companion theme variables
│       ├── app.css          # App-level layout
│       ├── components.css   # Reusable component styles
│       ├── form.css         # Form styling
│       ├── layout.css       # Layout utilities
│       └── wizard.css       # Wizard-specific styles
├── data/
│   ├── story_types.json     # 40+ story type definitions
│   ├── author_styles.json   # 40+ author style definitions
│   └── blueprint-master-prompt.txt # Master blueprint prompt
├── prompts/                 # LLM prompt templates (loaded at runtime)
│   ├── blueprint-generation/
│   │   └── metaphor-instructions.txt
│   ├── phased-generation/
│   │   ├── foundation-prompt.txt
│   │   ├── characters-prompt.txt
│   │   ├── characters-prompt-generate.txt
│   │   ├── characters-prompt-with-data.txt
│   │   ├── scenes-prompt.txt
│   │   ├── resolutions-prompt.txt
│   │   └── validation-prompt.txt
│   ├── scene-management/
│   │   ├── opening-message.txt
│   │   ├── scene-summary.txt
│   │   └── summary-requirements.txt
│   ├── style-generation/
│   │   ├── author-style-prompt.txt
│   │   └── story-type-prompt.txt
│   └── utilities/
│       ├── Author_Style_Generator.md
│       └── Genre_Mashup_Generator.md
└── lib/
    ├── core/                # Core state and logic
    │   ├── index.js         # Re-exports public API
    │   ├── constants.js     # MODULE_NAME, PHASE_CONFIG, presets
    │   ├── state-manager.js # Settings, chat state, data storage
    │   ├── arc-engine.js    # Phase calculation, prompt injection
    │   └── event-handlers.js# Message events, signal parsing
    ├── blueprint/           # Blueprint system
    │   ├── index.js         # Re-exports public API
    │   ├── module.js        # Core ops, re-export hub for extracted modules
    │   ├── injection.js     # Blueprint prompt injection (extracted from module.js)
    │   ├── scene-pacing.js  # Scene pacing calculations (extracted from module.js)
    │   ├── summarization.js # Scene summarization (extracted from module.js)
    │   ├── prompts.js       # Master prompt template loading (extracted from module.js)
    │   ├── settings-sync.js # Settings sync and round calculation (extracted from module.js)
    │   ├── startup.js       # Blueprint startup, missing style handling (extracted from module.js)
    │   ├── types.js         # JSDoc type definitions (Blueprint, Scene, etc.)
    │   ├── schema.js        # Blueprint field definitions
    │   ├── validation.js    # Blueprint validation
    │   ├── normalization.js # Data normalization
    │   ├── storage.js       # PNG encode/decode, persistence
    │   ├── integration.js   # Library API facade
    │   ├── file-api.js      # SillyTavern /api/files/* wrapper
    │   ├── manifest.js      # Manifest manager (in-memory + debounced save)
    │   ├── file-storage.js  # File-backed save/load/delete
    │   ├── library-adapter.js # FileBackedLibrary class
    │   ├── migration.js     # IndexedDB → file storage migration
    │   ├── import.js        # Import from PNG/JSON
    │   ├── import-ui.js     # Import dialogs and UI components
    │   ├── missing-style-handler.js # Handle missing story types/author styles
    │   ├── resource-utils.js # Three-tier style resolution for exports
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
    │   ├── style-generator.js # AI-assisted story type/author style generation
    │   ├── validation.js    # Phase output validation
    │   └── metrics.js       # Token/timing metrics tracking
    ├── ui/                  # UI rendering
    │   ├── index.js         # Re-exports public API
    │   ├── components.js    # Re-export layer (imports from components/)
    │   ├── component-system.js # Shared UI utilities
    │   ├── controller-panel.js # Controller orchestrator (delegates to submodules)
    │   ├── controller-panel-content.js    # Panel content rendering
    │   ├── controller-panel-structure.js  # Panel HTML structure, docked sidebar
    │   ├── controller-panel-events.js     # Panel event binding
    │   ├── controller-panel-sections.js   # Individual section builders
    │   ├── controller-panel-popups.js     # Panel popup dialogs
    │   ├── controller-panel-arc-history.js # Arc history section
    │   ├── controller-panel-summary.js    # Scene summary viewer/editor
    │   ├── controller-panel-drag.js       # Reusable drag handler
    │   ├── wand-menu.js     # Quick controls dropdown
    │   └── components/      # Split component modules
    │       ├── index.js     # Re-exports all components
    │       ├── helpers.js   # createHelpIcon, createToggle
    │       ├── main-panel.js # renderMainPanel, renderBlueprintPreview
    │       ├── blueprint-shared.js # Shared blueprint rendering (info cards, scene cards)
    │       ├── settings-tabs.js # Settings dialog subtabs
    │       ├── blueprint-settings.js # Blueprint settings subtab
    │       ├── blueprint-tabs.js # Blueprint generation/display tabs
    │       ├── wizard.js    # Wizard progress/preview components
    │       ├── library.js   # Library tab, blueprint cards
    │       ├── sidebar.js   # Settings sidebar
    │       ├── misc.js      # Additional tab content
    │       ├── character-picker.js # Character picker component
    │       ├── scenario-characters.js # Character/persona status detection
    │       ├── scenario-characters-popup.js # Draggable scenario characters popup
    │       ├── resource-import.js # Import embedded resources to ST library
    │       └── phase-override-panel.js # Per-phase API profile overrides
    ├── editor/              # Editors
    │   ├── index.js         # Re-exports public API
    │   ├── blueprint-editor.js # Split-panel blueprint editor (orchestrator)
    │   ├── type-editors.js  # Re-export shim (delegates to extracted modules)
    │   ├── type-editor-utils.js # Shared utilities for type editors
    │   ├── author-style-editor.js # Author style list/management UI
    │   ├── author-style-form.js   # Author style edit form
    │   ├── story-type-editor.js   # Story type list/management UI
    │   ├── story-type-form.js     # Story type edit form
    │   ├── import-export.js       # JSON import/export for types/styles
    │   ├── style-generation.js    # AI-powered style generation popup
    │   ├── json-tree-viewer.js # Collapsible JSON tree renderer
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
    │   ├── settings-handlers.js   # Settings dialog coordinator (delegates to submodules)
    │   ├── settings-pacing.js     # Pacing mode switching events
    │   ├── settings-blueprint.js  # Blueprint settings tab events
    │   ├── settings-blueprint-prompts.js # Summarization/generation settings
    │   ├── settings-library.js    # Library tab events
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
    │   ├── handler-audit.js # Event handler audit (auditHandlers())
    │   └── test-data-loader.js # Blueprint test data loader (disabled)
    ├── utils/               # Shared utilities
    │   └── import-helpers.js # Import sanitization and deduplication
    └── css/                 # Stylesheets (33 files, granular per feature)
        ├── blueprint-base.css        # Core blueprint card/layout styles
        ├── blueprint-editor.css      # Blueprint editor panel
        ├── blueprint-import-ui.css   # Import dialog styles
        ├── blueprint-integration.css # Blueprint integration overlays
        ├── blueprint-library.css     # Library grid and cards
        ├── blueprint-preview.css     # Blueprint preview panel
        ├── blueprint-scenes.css      # Scene list styles
        ├── blueprint-storage.css     # Storage indicator styles
        ├── cards-sections.css        # Card and section layouts
        ├── character-picker.css      # Character picker component
        ├── core-panel.css            # Controller panel core styles
        ├── debug-panel.css           # Debug overlay styles
        ├── edit-form.css             # Form editing styles
        ├── editor-panels.css         # Editor split-panel layout
        ├── form-controls.css         # Shared form control styles
        ├── form-editing.css          # Form editing interactions
        ├── legacy-support.css        # Backward-compat overrides
        ├── modal-content.css         # Modal body content
        ├── modal-info.css            # Modal info cards
        ├── modal-layout.css          # Modal chrome/layout
        ├── navigation-gallery.css    # Gallery navigation controls
        ├── overview-mode.css         # Overview mode display
        ├── pacing-controls.css       # Pacing mode controls
        ├── scenario-characters.css   # Scenario characters popup
        ├── scene-image-gallery.css   # Scene image gallery
        ├── scene-image-preview.css   # Scene image preview popup
        ├── sidebar-chrome.css        # Sidebar decorative elements
        ├── sidebar-core.css          # Sidebar layout
        ├── sidebar-popout-history.css# History popout panel
        ├── sidebar-popout-scene.css  # Scene popout panel
        ├── sidebar-popout-tools.css  # Tools popout panel
        ├── wand-states.css           # Wand menu state styles
        └── wizard.css                # Wizard progress/preview
```

## Key Files by Size

| File | Lines | Purpose |
|------|-------|---------|
| `lib/scene/image-preview.js` | ~1,169 | Scene image preview popup with navigation |
| `lib/core/event-handlers.js` | ~1,137 | Message events, signal parsing |
| `index.js` | ~1,048 | Entry point, UI setup, settings dialog |
| `lib/blueprint/storage.js` | ~1,003 | PNG encode/decode, persistence |
| `lib/generation/templates.js` | ~988 | LLM prompt templates |
| `lib/dialog/wizard.js` | ~925 | Blueprint generation wizard |
| `lib/core/state-manager.js` | ~874 | Settings, chat state, data storage |
| `lib/blueprint/utils.js` | ~768 | Utility functions |
| `lib/ui/components/settings-tabs.js` | ~737 | Settings dialog subtabs |
| `lib/blueprint/schema.js` | ~691 | Blueprint field definitions |
| `lib/editor/blueprint-editor/editor-action-handlers.js` | ~668 | Play, export, revert, view JSON handlers |
| `lib/ui/wand-menu.js` | ~629 | Quick controls dropdown |
| `lib/blueprint/integration.js` | ~622 | Library API facade |
| `lib/png/chunk-handler.js` | ~621 | PNG chunk manipulation |
| `lib/generation/orchestration.js` | ~573 | Phased generation coordinator |
| `lib/blueprint/library-adapter.js` | ~573 | FileBackedLibrary class |
| `lib/editor/blueprint-editor/characters-tab.js` | ~564 | Character linking tab |

### Extracted Blueprint Modules (lib/blueprint/)

| File | Lines | Purpose |
|------|-------|---------|
| `summarization.js` | ~457 | Scene summarization, auto-summary triggers |
| `module.js` | ~398 | Core ops coordinator, re-export hub (was ~1,207) |
| `startup.js` | ~367 | Blueprint startup, missing style handling |
| `import.js` | ~345 | Import from PNG/JSON |
| `import-ui.js` | ~284 | Import dialogs and UI components |
| `injection.js` | ~243 | Blueprint prompt injection XML builder |
| `settings-sync.js` | ~235 | Settings sync and round calculation |
| `scene-pacing.js` | ~188 | Scene pacing calculations, scene boundary logic |
| `resource-utils.js` | ~105 | Three-tier style resolution (library → inline → embedded) |
| `types.js` | ~89 | JSDoc type definitions (no executable code) |
| `prompts.js` | ~88 | Master prompt template loading |

`module.js` was reduced from ~1,207 to ~398 lines by extracting `prompts.js`, `settings-sync.js`, `startup.js`, and `types.js` (joining earlier extractions of `injection.js`, `scene-pacing.js`, `summarization.js`). It remains the re-export hub for backward compatibility.

### Extracted Controller Panel Modules (lib/ui/)

| File | Lines | Purpose |
|------|-------|---------|
| `controller-panel-popups.js` | ~349 | Blueprint library, settings, prompt inspector, debug popups |
| `controller-panel-events.js` | ~324 | Docked/floating panel event binding |
| `controller-panel-structure.js` | ~320 | Panel HTML, docked sidebar, position management |
| `controller-panel-content.js` | ~317 | Round/scene info, full panel content assembly |
| `controller-panel-sections.js` | ~227 | Style, mode toggle, summary, OOC section builders |
| `controller-panel.js` | ~195 | Orchestrator (was ~2,058), delegates to submodules |
| `controller-panel-arc-history.js` | ~158 | Epilogue/summary, next adventure themes |
| `controller-panel-summary.js` | ~145 | Scene summary viewer/editor popup |
| `controller-panel-drag.js` | ~78 | Reusable drag handler utility |

`controller-panel.js` was reduced from ~2,058 to ~195 lines by extracting 8 focused submodules.

### Extracted Dialog Modules (lib/dialog/)

| File | Lines | Purpose |
|------|-------|---------|
| `settings-handlers.js` | ~376 | Coordinator (was ~1,521), delegates to submodules |
| `settings-blueprint.js` | ~372 | Blueprint settings tab event handlers |
| `settings-library.js` | ~322 | Library tab events, card actions, search |
| `settings-blueprint-prompts.js` | ~228 | Summarization, cover/scene generation settings |
| `settings-pacing.js` | ~149 | Pacing mode switching, navigation buttons |

`settings-handlers.js` was reduced from ~1,521 to ~376 lines by extracting 4 settings submodules.

### Extracted Editor Modules (lib/editor/)

| File | Lines | Purpose |
|------|-------|---------|
| `story-type-editor.js` | ~343 | Story type list/management modal |
| `author-style-editor.js` | ~332 | Author style list/management modal |
| `import-export.js` | ~328 | JSON import/export with merge/replace choice |
| `story-type-form.js` | ~262 | Story type edit form, memorable elements |
| `style-generation.js` | ~258 | AI-powered type/style generation popup |
| `author-style-form.js` | ~126 | Author style edit form with validation loop |
| `type-editors.js` | ~49 | Re-export shim (was ~1,623) |
| `type-editor-utils.js` | ~26 | Shared utilities (getSillyTavernGlobals, exportSingleStyle) |

`type-editors.js` was reduced from ~1,623 to ~49 lines (re-export shim). All CRUD logic extracted into 6 focused modules.

### Split Component Modules (lib/ui/components/)

| File | Lines | Purpose |
|------|-------|---------|
| `settings-tabs.js` | ~737 | Settings dialog subtabs |
| `blueprint-tabs.js` | ~435 | Blueprint generation and display tabs |
| `blueprint-settings.js` | ~417 | Blueprint settings subtab |
| `scenario-characters-popup.js` | ~302 | Draggable scenario characters popup |
| `character-picker.js` | ~300 | Character picker component |
| `wizard.js` | ~290 | Wizard progress/preview components |
| `main-panel.js` | ~282 | Main panel and blueprint preview |
| `phase-override-panel.js` | ~240 | Per-phase API profile and token limit overrides |
| `library.js` | ~213 | Library tab, blueprint cards |
| `blueprint-shared.js` | ~193 | Shared rendering (info cards, scene cards) |
| `scenario-characters.js` | ~159 | Character/persona status detection (was ~377) |
| `index.js` | ~120 | Re-exports all components |
| `resource-import.js` | ~82 | Import embedded characters/personas to ST library |
| `sidebar.js` | ~75 | Settings sidebar |
| `misc.js` | ~65 | Additional tab content |
| `helpers.js` | ~43 | Utility functions |

`scenario-characters.js` was split: status detection logic stays in the original, popup UI extracted to `scenario-characters-popup.js`. `resource-import.js` handles importing embedded resources to the SillyTavern library.

Note: `lib/ui/components.js` is a thin re-export layer (~16 lines) for backward compatibility.

### Blueprint Editor Modules (lib/editor/blueprint-editor/)

| File | Lines | Purpose |
|------|-------|---------|
| `editor-action-handlers.js` | ~668 | Play, export, revert, view JSON handlers |
| `characters-tab.js` | ~564 | Character linking tab |
| `details-tab.js` | ~488 | Blueprint details form fields |
| `event-handlers.js` | ~477 | Document-level event delegation |
| `blueprint-editor.js` | ~366 | Main orchestrator, wires up submodules |
| `wizard-panel.js` | ~331 | AI wizard side panel for section generation |
| `cover-action-handlers.js` | ~290 | Cover generation, upload, prompt management |
| `scene-crud.js` | ~277 | Scene add/edit/delete/reorder |
| `cover-tab.js` | ~228 | Cover tab with gallery and prompt editor |
| `scene-beats-editor.js` | ~216 | Beat rendering and editing within scenes |
| `cover-gallery.js` | ~174 | Gallery navigation and image management |
| `cover-generation.js` | ~141 | SD cover image generation |
| `panels.js` | ~130 | Left panel (info) and right panel (tabs) renderers |
| `character-handlers.js` | ~113 | Character tab event handlers |
| `cover-handlers.js` | ~78 | Cover field and gallery event handlers |
| `state.js` | ~74 | Getter/setter state management |
| `scenes-tab.js` | ~67 | Scene list display |

The blueprint editor uses **dependency injection** for refresh functions to avoid circular imports between modules.

### Re-export Pattern for Extracted Modules

When functions are extracted from a large module, the original module re-exports them for backward compatibility:

```javascript
// In module.js - MUST use import-then-export pattern
import { getScenePacingInfo, getCurrentScene } from './scene-pacing.js';
export { getScenePacingInfo, getCurrentScene };

// NOT direct re-export (breaks if functions are used locally)
// export { getScenePacingInfo } from './scene-pacing.js'; // No local binding
```

Direct re-exports (`export { x } from './foo.js'`) don't create local bindings, so if the function is referenced elsewhere in the file (e.g., in a default export object), use the import-then-export pattern.

### Generation Modules (lib/generation/)

| File | Lines | Purpose |
|------|-------|---------|
| `templates.js` | ~988 | LLM prompt templates |
| `orchestration.js` | ~573 | Phased generation coordinator |
| `prompts.js` | ~525 | Prompt builders for each phase |
| `section-generator.js` | ~128 | Section-at-a-time generation for wizard panel |
| `style-generator.js` | ~99 | AI-assisted story type/author style generation |
| `metrics.js` | ~62 | Token counting, timing, performance tracking |
| `validation.js` | ~55 | Phase result and output validation |

### Debug Modules (lib/debug/)

| File | Lines | Purpose |
|------|-------|---------|
| `mocks.js` | ~368 | Mock LLM responses for testing |
| `handler-audit.js` | ~241 | Event handler audit utility |
| `test-data-loader.js` | ~147 | Blueprint test data loader (disabled) |

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
├── types.js (no deps - JSDoc only)
├── placeholders.js (no internal deps)
├── resource-utils.js (no internal deps - pure functions)
├── storage.js (imports utils, validation, png/*)
├── file-api.js (no internal deps, wraps fetch)
├── manifest.js (imports file-api)
├── file-storage.js (imports file-api, manifest, storage)
├── library-adapter.js (imports file-storage, manifest)
├── blank-blueprint.js (imports utils, normalization)
├── missing-style-handler.js (imports state-manager)
├── import.js (imports storage, validation, utils)
├── import-ui.js (imports utils, popup.js)
├── export.js (imports storage, utils, resource-utils)
├── prompts.js (no internal deps - loads from data/)
├── settings-sync.js (imports state-manager, storage)
├── startup.js (imports state-manager, storage, missing-style-handler)
├── injection.js (imports state-manager, storage) [extracted from module.js]
├── scene-pacing.js (imports state-manager, storage) [extracted from module.js]
├── summarization.js (imports state-manager, storage, generation/*) [extracted from module.js]
├── module.js (re-export hub: imports + re-exports injection, scene-pacing, summarization,
│              prompts, settings-sync, startup; imports core/*, generation/*)
└── integration.js (imports library-adapter, storage, module, migration)

lib/ui/
├── component-system.js (no internal deps)
├── components.js (re-exports from components/index.js)
├── controller-panel.js (orchestrator: imports all controller-panel-* submodules)
├── controller-panel-content.js (imports state-manager, blueprint/module, sections, arc-history)
├── controller-panel-structure.js (imports state-manager, component-system, drag)
├── controller-panel-events.js (imports state-manager, content, popups, sections)
├── controller-panel-sections.js (imports state-manager, blueprint/module)
├── controller-panel-popups.js (imports state-manager, blueprint/module, ui/components)
├── controller-panel-arc-history.js (imports state-manager, blueprint/module)
├── controller-panel-summary.js (imports state-manager, blueprint/module)
├── controller-panel-drag.js (no internal deps - reusable utility)
├── wand-menu.js (imports state-manager, event-handlers)
└── components/
    ├── index.js (re-exports all)
    ├── helpers.js (imports component-system)
    ├── main-panel.js (imports state-manager, blueprint/module, blueprint-shared)
    ├── blueprint-shared.js (imports missing-style-handler, blueprint/module, component-system)
    ├── settings-tabs.js (imports state-manager, arc-engine, helpers)
    ├── blueprint-settings.js (imports state-manager, helpers)
    ├── blueprint-tabs.js (imports state-manager, blueprint/module, helpers, wizard, phase-override-panel, blueprint-shared)
    ├── wizard.js (imports component-system)
    ├── library.js (imports blueprint/utils, blueprint-tabs)
    ├── sidebar.js (imports component-system)
    ├── misc.js (imports state-manager)
    ├── character-picker.js (imports component-system, blueprint/characters/*)
    ├── scenario-characters.js (imports blueprint/storage, characters/linker, blueprint/utils)
    ├── scenario-characters-popup.js (imports scenario-characters, resource-import, component-system)
    ├── resource-import.js (imports blueprint/characters/*, SillyTavern APIs)
    └── phase-override-panel.js (imports core/constants, helpers)

lib/editor/
├── type-editors.js (re-export shim → delegates to extracted modules below)
├── type-editor-utils.js (no internal deps - lazy SillyTavern globals)
├── author-style-editor.js (imports state-manager, type-editor-utils, author-style-form, import-export, style-generation)
├── author-style-form.js (imports state-manager, type-editor-utils)
├── story-type-editor.js (imports state-manager, type-editor-utils, story-type-form, import-export, style-generation)
├── story-type-form.js (imports state-manager, type-editor-utils)
├── import-export.js (imports state-manager, type-editor-utils)
├── style-generation.js (imports generation/style-generator, type-editor-utils)
├── blueprint-editor.js (orchestrator - wires up all submodules)
├── json-tree-viewer.js (no internal deps - self-contained)
└── blueprint-editor/
    ├── state.js (no deps - pure getter/setter state)
    ├── panels.js (imports state, details-tab, scenes-tab, cover-tab, characters-tab, wizard-panel)
    ├── event-handlers.js (imports state, cover-action-handlers, editor-action-handlers, scene-crud, scene-beats-editor, cover-gallery, character-handlers, cover-handlers, wizard-panel)
    ├── editor-action-handlers.js (imports state, blueprint/module, resource-utils, json-tree-viewer)
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
├── style-generator.js (imports orchestration, templates, blueprint/utils, core/state-manager)
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
├── settings-handlers.js (coordinator: imports settings-pacing, settings-blueprint, settings-library)
├── settings-pacing.js (imports state-manager, ui/components)
├── settings-blueprint.js (imports state-manager, settings-blueprint-prompts, ui/components)
├── settings-blueprint-prompts.js (imports state-manager, blueprint/module)
└── settings-library.js (imports state-manager, blueprint/integration, ui/components)

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
SillyTavern loads ES6 modules **without bundling**. Use `@import url()` in `style.css`, not `import './file.css'` in JS. The 33 CSS files in `lib/css/` are imported via `style.css` (which is now ~60 lines of `@import` statements).

### Prompt Templates
Runtime prompt templates live in `prompts/` (not `data/`). Loaded via `loadTemplate()` in `lib/generation/templates.js` using `import.meta.url` relative paths.

## Design Patterns

### Facade Pattern
Each `lib/*/index.js` re-exports the public API for that module group. Import from the index for cleaner imports:
```javascript
// Preferred
import { validateBlueprint, normalizeBlueprint } from './lib/blueprint/index.js';

// Also OK - direct import
import { validateBlueprint } from './lib/blueprint/validation.js';
```

### Coordinator Pattern (Post-Refactoring)
Large modules now act as coordinators that delegate to extracted submodules:
```javascript
// controller-panel.js delegates to:
import { renderPanelContent } from './controller-panel-content.js';
import { bindPanelEvents } from './controller-panel-events.js';
import { renderPanelHtml } from './controller-panel-structure.js';

// settings-handlers.js delegates to:
import { setupPacingEvents } from './settings-pacing.js';
import { setupBlueprintEvents } from './settings-blueprint.js';
import { setupLibraryEvents } from './settings-library.js';
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
// CORRECT - import from source
import { generateUUID } from './lib/blueprint/utils.js';

// ALSO OK - import from facade index
import { generateUUID } from './lib/blueprint/index.js';

// WRONG - storage.js doesn't re-export utils
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
| Blueprint master prompt | `lib/blueprint/prompts.js` | `data/blueprint-master-prompt.txt` |
| Blueprint settings sync | `lib/blueprint/settings-sync.js` | `state-manager.js` |
| Blueprint startup | `lib/blueprint/startup.js` | `missing-style-handler.js`, `storage.js` |
| Blueprint type defs | `lib/blueprint/types.js` | - |
| Style resolution (export) | `lib/blueprint/resource-utils.js` | `export.js`, `editor-action-handlers.js` |
| Placeholder resolution | `lib/blueprint/placeholders.js` | - |
| Scene beat editor | `lib/editor/blueprint-editor/scene-beats-editor.js` | `schema.js`, `utils.js` |
| Blueprint editor | `lib/editor/blueprint-editor.js` | `blueprint-editor/*.js` (17 submodules) |
| JSON tree viewer | `lib/editor/json-tree-viewer.js` | `editor-action-handlers.js` |
| Story type CRUD | `lib/editor/story-type-editor.js` | `story-type-form.js`, `import-export.js` |
| Author style CRUD | `lib/editor/author-style-editor.js` | `author-style-form.js`, `import-export.js` |
| Style AI generation | `lib/editor/style-generation.js` | `generation/style-generator.js` |
| Type/style import/export | `lib/editor/import-export.js` | `type-editor-utils.js` |
| Settings dialog | `lib/dialog/settings-handlers.js` | `settings-pacing.js`, `settings-blueprint.js`, `settings-library.js` |
| Settings: pacing | `lib/dialog/settings-pacing.js` | `state-manager.js` |
| Settings: blueprint | `lib/dialog/settings-blueprint.js` | `settings-blueprint-prompts.js` |
| Settings: library | `lib/dialog/settings-library.js` | `blueprint/integration.js` |
| Settings tabs | `lib/ui/components/settings-tabs.js` | `blueprint-settings.js` |
| Main panel | `lib/ui/components/main-panel.js` | `helpers.js`, `blueprint-shared.js` |
| Blueprint tabs | `lib/ui/components/blueprint-tabs.js` | `wizard.js`, `blueprint-shared.js` |
| Shared blueprint rendering | `lib/ui/components/blueprint-shared.js` | `missing-style-handler.js`, `component-system.js` |
| Library tab | `lib/ui/components/library.js` | `blueprint-tabs.js` |
| Controller panel | `lib/ui/controller-panel.js` | `controller-panel-*.js` (8 submodules) |
| Controller: content | `lib/ui/controller-panel-content.js` | `sections.js`, `arc-history.js` |
| Controller: structure | `lib/ui/controller-panel-structure.js` | `drag.js` |
| Controller: popups | `lib/ui/controller-panel-popups.js` | `ui/components` |
| Controller: summary | `lib/ui/controller-panel-summary.js` | `blueprint/module` |
| Scenario Mode | `lib/scenario/injection.js` | `beats.js`, `character-injection.js`, `blueprint/module.js` |
| Scenario characters | `lib/ui/components/scenario-characters.js` | `scenario-characters-popup.js`, `resource-import.js` |
| Resource import | `lib/ui/components/resource-import.js` | `blueprint/characters/*` |
| Blueprint injection | `lib/blueprint/injection.js` | `storage.js`, `state-manager.js` |
| Scene pacing | `lib/blueprint/scene-pacing.js` | `storage.js`, `state-manager.js` |
| Scene summarization | `lib/blueprint/summarization.js` | `storage.js`, `generation/*` |
| Character injection | `lib/scenario/character-injection.js` | `blueprint/characters/*` |
| Scene images | `lib/scene/image-generator.js` | `image-prompt.js`, `image-storage.js` |
| Scene image preview | `lib/scene/image-preview.js` | `image-storage.js`, `image-generator.js` |
| Per-phase API profiles | `lib/ui/components/phase-override-panel.js` | `core/constants.js` |
| Blank blueprint factory | `lib/blueprint/blank-blueprint.js` | - |
| Wizard panel (AI assist) | `lib/editor/blueprint-editor/wizard-panel.js` | `section-generator.js` |
| Section generation | `lib/generation/section-generator.js` | `validation.js`, `metrics.js` |
| Style generation (AI) | `lib/generation/style-generator.js` | `orchestration.js`, `templates.js` |
| Debug mocks | `lib/debug/mocks.js` | - |
| Handler audit | `lib/debug/handler-audit.js` | - |
| Standalone editor | `standalone/index.html` | `standalone/app.js`, `standalone/adapters/*` |
| Standalone routing | `standalone/ui/routing.js` | `standalone/editors/*` |
| Standalone settings | `standalone/settings-system.js` | `standalone/ui/modals.js` |
| Standalone connection | `standalone/adapters/connection-bridge.js` | `standalone/ui/connection.js` |
| Fullscreen editor launch | `lib/dialog/settings-pacing.js` | `index.js`, `lib/ui/components/main-panel.js` |
