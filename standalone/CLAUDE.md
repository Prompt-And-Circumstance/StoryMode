# Story Mode Standalone Editor - Development Guide

Quick reference for developing the standalone blueprint editor.

## Overview

The standalone editor is a browser-based blueprint editor that operates independently of SillyTavern, with optional connectivity for advanced features. It uses an adapter pattern to bridge SillyTavern dependencies while reusing core business logic.

## Architecture

### Directory Structure

```
standalone/
├── index.html                    # Entry point, CDN dependencies
├── app.js                        # Main orchestrator, event wiring
├── settings-system.js            # Settings + theme management
│
├── adapters/                     # ST dependency bridges
│   ├── popup-adapter.js          # Modal system (replaces ST Popup)
│   ├── connection-bridge.js      # ST backend detection
│   ├── notification-adapter.js   # Toast messages (wraps toastr)
│   ├── storage-adapter.js        # localStorage/FileStorage switch
│   ├── profile-adapter.js        # Connection Manager profiles
│   ├── character-adapter.js      # Read-only character access
│   ├── library-storage-adapter.js # Blueprint library file API wrapper
│   └── utils-adapter.js          # Utility function adapters
│
├── ui/                           # UI components
│   ├── routing.js                # Tab navigation
│   ├── connection.js             # Connection status UI
│   ├── modals.js                 # Settings modal management
│   └── library-view.js           # Blueprint library grid UI
│
├── form/                         # Form component library
│   ├── dropdown.js               # Enum dropdowns
│   ├── nested-form.js            # Nested objects
│   ├── array-editor.js           # Arrays (alternate_endings, scenes)
│   ├── collapsible.js            # Collapsible sections
│   └── validation.js             # Field validation
│
├── editors/                      # Tab-specific editors
│   ├── details-editor.js         # Details tab orchestration
│   ├── scenes-editor.js          # Scene CRUD + modals
│   ├── characters-editor.js      # Character arc CRUD
│   └── cover-editor.js           # Cover gallery + actions
│
├── handlers/                     # Action handlers
│   └── blueprint-actions.js      # Blueprint CRUD operations
│
├── wizards/                      # Multi-step workflows
│   └── blueprint-wizard.js       # Blueprint generation wizard
│
└── themes/                       # Self-contained theming
    ├── base.css                  # CSS variables + fallbacks
    ├── dark.css                  # Dark theme
    ├── light.css                 # Light theme + fixes
    ├── rpg-companion.css         # RPG theme
    ├── app.css                   # App layout styles
    ├── components.css            # Form/editor styles
    ├── form.css                  # Form-specific styles
    ├── layout.css                # Layout utilities
    ├── wizard.css                # Wizard styles
    └── library.css               # Library grid styles
```

### Adapter Pattern

The standalone editor uses adapters to bridge SillyTavern dependencies:

| ST Dependency | Adapter | Behavior in Standalone |
|--------------|---------|------------------------|
| `Popup` class | `popup-adapter.js` | Creates DOM-based modals, `okButton: false` for custom actions |
| `extension_settings` | `settings-system.js` | Uses localStorage, separate namespace |
| `saveBase64AsFile` | `storage-adapter.js` | Direct `localStorage`, or ST API if connected |
| `characters` array | `character-adapter.js` | Returns empty array unless connected |
| `toastr` | `notification-adapter.js` | Wraps toastr.js directly |
| Connection profiles | `profile-adapter.js` | Loads from ST API, caches locally |
| Library operations | `library-storage-adapter.js` | File API wrapper for blueprint manifest and PNG storage |

### Module Reuse Strategy

**Reuse directly from `lib/` (ST-free modules):**
- `lib/blueprint/schema.js` - Field definitions, validation, dropdown options
- `lib/blueprint/utils.js` - Utility functions (escapeHtml, getNestedValue, etc.)
- `lib/blueprint/validation.js` - Blueprint validation
- `lib/blueprint/file-storage.js` - Two-phase commit pattern

**Adapt from `lib/editor/blueprint-editor/`:**
- `state.js` - Can be imported directly (no ST dependencies)
- `details-tab.js` - Pass storyTypes/authorStyles as parameters
- `scenes-tab.js` - Adapt modal creation to use popup-adapter
- `cover-tab.js` - Adapt gallery handling

## Import Patterns

### Reusing from lib/

```javascript
// ✅ CORRECT - Import from parent lib/ directory
import { BLUEPRINT_FIELDS, DROPDOWN_OPTIONS } from '../../lib/blueprint/schema.js';
import { escapeHtml, getNestedValue } from '../../lib/blueprint/utils.js';
import { validateBlueprint } from '../../lib/blueprint/validation.js';
```

### Avoiding Duplication

```javascript
// ❌ WRONG - Don't duplicate code
export const DROPDOWN_OPTIONS = { /* duplicate */ };

// ✅ CORRECT - Reuse from lib/
export { DROPDOWN_OPTIONS } from '../../lib/blueprint/schema.js';
```

## Theme System

### Applying Themes

```javascript
import { applyTheme, getCurrentTheme } from './settings-system.js';

// Apply theme (sets CSS variables on document)
applyTheme('dark');

// Get current theme
const theme = getCurrentTheme();
```

### Theme Definition Pattern

Each theme includes:
- Complete CSS variable fallbacks (no dependency on ST variables)
- `disableBackdropFilter` for light theme (separate context fix)
- `disableTextShadow` for light theme (readability fix)

```javascript
const THEMES = {
    light: {
        name: 'Light',
        cssClass: 'theme-light',
        variables: { /* complete fallbacks */ },
        disableBackdropFilter: true,   // Critical for separate context
        disableTextShadow: true,       // Critical for readability
    }
};
```

## Backend Availability

### Checking Connection

```javascript
import { getApiUrl, isValidApiUrl } from './settings-system.js';

const apiUrl = getApiUrl();
const isConfigured = isValidApiUrl(apiUrl);

// Attempt connection
try {
    const response = await fetch(`${apiUrl}/api/storymode/status`);
    if (response.ok) {
        // Connected - backend features available
    }
} catch {
    // Offline mode - degrade gracefully
}
```

### Graceful Degradation

Features that require connection:
- **Library view** → Requires ST file API for blueprint storage
- Blueprint generation wizard → Requires LLM API
- Cover image generation → Requires SD API
- Character linking → Requires character data access

Features that work offline (future):
- Blueprint editing (in-memory)
- Theme switching
- Settings management

## File Size Limits

Per project guidelines, no file should exceed 400 lines. Split large files:

```javascript
// ❌ WRONG - 600+ lines
export function renderDetailsTab() { /* huge function */ }

// ✅ CORRECT - Split into focused modules
// editors/details-editor.js (orchestration)
// form/nested-form.js (nested object handling)
// form/validation.js (field validation)
```

## Differences from Main Extension

| Feature | Main Extension | Standalone |
|---------|---------------|------------|
| Settings storage | `extension_settings` | localStorage |
| Theme source | ST theme system | Self-contained |
| Modals | `Popup` class | popup-adapter |
| File storage | ST `/api/files/` | localStorage or ST API |
| Character data | Live from `characters` | Via character-adapter |
| LLM calls | Direct to ST API | Via connection bridge |

## Features Implemented

### Library View (v1.0)
- **Grid layout** with blueprint cards showing covers, titles, and metadata
- **Search** functionality for filtering blueprints by title or story type
- **Filters**: All Blueprints, Favorites, Recently Used
- **Favorite toggle** with persistence to manifest
- **Blueprint selection** loads blueprint into editor
- **Connection-aware**: Shows error state when ST is unreachable

### Storage Architecture
- **Manifest-based**: `storymode-manifest.json` tracks all blueprints
- **File API integration**: Uses ST's `/api/files/` endpoints
- **PNG storage**: Blueprints stored as PNG files (codec placeholder)
- **Automatic refresh**: Library reloads on blueprint operations

## Known Limitations

1. **PNG codec not implemented** - Currently stores JSON, needs PNG encoding/decoding
2. **No offline mode** - Library view requires ST connection
3. **Settings not synced with extension** - Separate localStorage namespace
4. **Blueprint generation wizard incomplete** - Requires LLM API integration
5. **No character linking in standalone mode** - Manual entry required

## Development Workflow

1. **Test in browser directly** - Open `standalone/index.html` as file
2. **Use mock data** - Test with `window.StoryModeApp.handleNewBlueprint()`
3. **Verify theme switching** - All themes should work without ST CSS
4. **Check console for errors** - No dependencies on `window.getContext()` or similar

## Debug Commands

```javascript
// Settings system
window.StoryModeSettings.getSettings()
window.StoryModeSettings.applyTheme('light')
window.StoryModeSettings.resetSettings()

// App state
window.StoryModeApp.currentBlueprint()
window.StoryModeApp.isConnected()
window.StoryModeApp.switchTab('scenes')
```

## Testing Checklist

### Library View (v1.0) ✓
- [x] Library grid displays on app launch
- [x] Search filters blueprints by title/type
- [x] Filter tabs (All/Favorites/Recent) work
- [x] Favorite toggle persists to manifest
- [x] Blueprint cards show covers and metadata
- [x] Clicking card loads blueprint into editor
- [x] Connection error shows helpful message
- [x] Theme preview changes live in settings
- [x] Theme reverts if settings cancelled

### Settings & Theme System ✓
- [x] Page loads without errors
- [x] Theme toggle works (dark/light/rpg)
- [x] Theme preview applies immediately
- [x] Theme reverts on cancel
- [x] Settings persist to localStorage
- [x] Connection status displays correctly

### Blueprint Editor (TODO)
- [ ] All 47+ Details fields editable
- [ ] Scene CRUD functional
- [ ] Character arc CRUD functional
- [ ] Cover gallery works
- [ ] PNG import/export works
- [ ] No files exceed 400 lines
- [ ] Zero console errors
