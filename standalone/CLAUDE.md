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
├── adapters/                     # ST dependency bridges (Phase 1)
│   ├── popup-adapter.js          # Modal system (replaces ST Popup)
│   ├── connection-bridge.js      # ST backend detection
│   ├── notification-adapter.js   # Toast messages (wraps toastr)
│   ├── storage-adapter.js        # localStorage/FileStorage switch
│   ├── profile-adapter.js        # Connection Manager profiles
│   └── character-adapter.js      # Read-only character access
│
├── form/                         # Form component library (Phase 1)
│   ├── dropdown.js               # Enum dropdowns
│   ├── nested-form.js            # Nested objects
│   ├── array-editor.js           # Arrays (alternate_endings, scenes)
│   ├── collapsible.js            # Collapsible sections
│   └── validation.js             # Field validation
│
├── editors/                      # Tab-specific editors (Phase 1)
│   ├── details-editor.js         # Details tab orchestration
│   ├── scenes-editor.js          # Scene CRUD + modals
│   ├── characters-editor.js      # Character arc CRUD
│   └── cover-editor.js           # Cover gallery + actions
│
└── themes/                       # Self-contained theming
    ├── theme-registry.js         # Theme definitions (in settings-system.js)
    ├── base.css                  # CSS variables + fallbacks
    ├── dark.css                  # Dark theme
    ├── light.css                 # Light theme + fixes
    ├── rpg-companion.css         # RPG theme
    └── components.css            # Form/editor styles
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
- Blueprint generation wizard → Hide button, show "requires connection"
- Cover image generation → Disable in standalone mode
- Character linking → Show warning, require manual entry

Features that work offline:
- All blueprint editing
- PNG import/export
- localStorage persistence
- Theme switching

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

## Known Limitations

1. **No blueprint generation wizard in Phase 1** - Requires LLM API integration
2. **No character linking in standalone mode** - Manual entry required
3. **PNG import/export needs implementation** - Uses ST's chunk encoding
4. **Settings not synced with extension** - Separate localStorage namespace

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

### Phase 0 (Current)
- [ ] Page loads without errors
- [ ] Theme toggle works (dark/light/rpg)
- [ ] Settings persist to localStorage
- [ ] Connection status displays correctly

### Phase 1 (TODO)
- [ ] All 47+ Details fields editable
- [ ] Scene CRUD functional
- [ ] Character arc CRUD functional
- [ ] Cover gallery works
- [ ] PNG import/export works
- [ ] No files exceed 400 lines
- [ ] Zero console errors
