# Test Fixture Fixes Required

**File:** `/Users/markwilliamson/SillyT/Dev/SillyTavern/public/scripts/extensions/third-party/Extension-StoryMode/Testing/tests/pacing-mode-separation.test.js`

**Status:** 21 failures, all due to incomplete test mock setup

---

## Issue 1: Missing `characterMetadata` in Mock

### Location
Line 29-38 in pacing-mode-separation.test.js

### Current Code
```javascript
vi.mock('/scripts/extensions.js', () => ({
    extension_settings: global.extension_settings,
    getContext: () => ({
        groupId: null,
        characterId: 0,
        characters: [],
        groups: [],
        saveChat: vi.fn()
    })
}));
```

### Problem
`lib/core/state-manager.js:212` calls:
```javascript
const chatMetadata = getContext().characterMetadata;
if (!chatMetadata[MODULE_NAME]) {  // TypeError: Cannot read properties of undefined
```

### Fix
Add `characterMetadata` to mock:
```javascript
vi.mock('/scripts/extensions.js', () => ({
    extension_settings: global.extension_settings,
    getContext: () => ({
        groupId: null,
        characterId: 0,
        characterMetadata: {  // ADD THIS
            story_mode: {
                pacingMode: 'story',
                storyTypeEnabled: true,
                storyArcEnabled: false,
                currentStep: 0,
                arcLength: 30
            }
        },
        characters: [],
        groups: [],
        saveChat: vi.fn()
    })
}));
```

### Affected Tests (5 failures)
- "should return story mode as default"
- "should return scenario mode when set"
- "should return story mode when pacingMode is invalid"
- "should set pacing mode to story"
- "should set pacing mode to scenario"

---

## Issue 2: Missing `SlashCommandParser` Mock

### Location
Imported indirectly via `lib/scene/image-generator.js`

### Problem
Event handler tests try to import modules that transitively import:
```javascript
import { SlashCommandParser } from '/scripts/slash-commands/SlashCommandParser.js';
```

This causes:
```
Error: Failed to load url /scripts/slash-commands/SlashCommandParser.js
```

### Fix
Add mock at top of test file (after other vi.mock() calls):
```javascript
vi.mock('/scripts/slash-commands/SlashCommandParser.js', () => ({
    SlashCommandParser: {
        parse: vi.fn(() => ([])),
        getChatHandler: vi.fn(),
        registerSlashCommand: vi.fn()
    }
}));
```

### Affected Tests (7 failures)
- "should not increment rounds in scenario mode"
- "should not increment rounds when storyArcEnabled is false"
- "should increment rounds when both features are enabled"
- "should process scenario signals in scenario mode"
- "should not check arc completion in scenario mode"
- "should check arc completion in story mode with arc enabled"
- "should not check arc completion when arc is disabled"

---

## Issue 3: Incorrect Spy Targets

### Location
Lines 231, 252, 269, 291, 309 in pacing-mode-separation.test.js

### Problem
Tests try to spy on functions that don't exist in the imported module:

```javascript
// Line 231 - WRONG
vi.spyOn(arcEngine, 'getChatStoryState').mockReturnValue(mockChatState);
// Error: getChatStoryState does not exist

// getChatStoryState is in state-manager.js, not arc-engine.js
```

### Fix
Import state-manager separately and spy on it:

```javascript
describe('Pacing Mode Separation - Arc Engine', () => {
    let arcEngine;
    let stateManager;  // ADD THIS

    beforeEach(async () => {
        vi.clearAllMocks();

        const arcModule = await import('../../lib/core/arc-engine.js');
        const stateModule = await import('../../lib/core/state-manager.js');  // ADD THIS

        arcEngine = arcModule;
        stateManager = stateModule;  // ADD THIS

        // ... rest of setup
    });

    describe('buildFullInjection - Story Type Only', () => {
        it('should inject genre prompts when storyTypeEnabled is true and storyArcEnabled is false', () => {
            extension_settings.StoryMode.storyArcEnabled = false;

            const mockChatState = {
                selectedStoryType: 'fantasy',
                currentStep: 5,
                arcLength: 30
            };

            // FIX: Spy on stateManager, not arcEngine
            vi.spyOn(stateManager, 'getChatStoryState').mockReturnValue(mockChatState);
            vi.spyOn(arcEngine, 'getStoryTypes').mockReturnValue([
                { id: 'fantasy', name: 'Fantasy', storyPrompt: ' fantasy framework' }
            ]);

            const injection = arcEngine.buildFullInjection();

            expect(injection).toContain('<story>');
            expect(injection).toContain('fantasy framework');
            expect(injection).not.toContain('Phase:');
        });
    });
});
```

**All occurrences:**
- Line 231: `vi.spyOn(arcEngine, 'getChatStoryState')` → `vi.spyOn(stateManager, 'getChatStoryState')`
- Line 252: `vi.spyOn(arcEngine, 'getChatStoryState')` → `vi.spyOn(stateManager, 'getChatStoryState')`
- Line 269: `vi.spyOn(arcEngine, 'getChatStoryState')` → `vi.spyOn(stateManager, 'getChatStoryState')`
- Line 291: `vi.spyOn(arcEngine, 'getChatStoryState')` → `vi.spyOn(stateManager, 'getChatStoryState')`
- Line 309: `vi.spyOn(arcEngine, 'getPacingMode')` → `vi.spyOn(stateManager, 'getPacingMode')`

### Affected Tests (5 failures)
- "should inject genre prompts when storyTypeEnabled is true and storyArcEnabled is false"
- "should not inject genre prompts when storyTypeEnabled is false"
- "should not inject phase text when storyArcEnabled is false"
- "should increment rounds but not inject genre when storyTypeEnabled is false and storyArcEnabled is true"
- "should not inject story content in scenario mode with blueprint"

---

## Issue 4: Settings Migration Tests Need Initialization

### Location
Lines 126-152 in pacing-mode-separation.test.js

### Problem
Tests expect `loadSettings()` to initialize `storyTypeEnabled`, but the mock doesn't trigger the actual code:

```javascript
it('should default storyTypeEnabled to true for new users', () => {
    extension_settings.StoryMode = {};
    stateManager.loadSettings();

    expect(extension_settings.StoryMode.storyTypeEnabled).toBe(true);  // undefined
});
```

### Root Cause
`loadSettings()` implementation in `state-manager.js:160-190` needs to be checked:

```javascript
export function loadSettings() {
    const settings = extension_settings[MODULE_NAME];

    // This migration logic should set storyTypeEnabled if missing
    if (settings && settings.storyArcEnabled && !settings.storyTypeEnabled) {
        settings.storyTypeEnabled = true;
    }

    // Default storyTypeEnabled to true if missing
    if (!settings?.storyTypeEnabled) {
        extension_settings[MODULE_NAME].storyTypeEnabled = true;
    }
}
```

### Fix (Two options)

**Option A: Update Test to Initialize Properly**
```javascript
beforeEach(async () => {
    vi.clearAllMocks();

    const module = await import('../../lib/core/state-manager.js');
    stateManager = module;

    // Initialize extension_settings.StoryMode BEFORE importing
    extension_settings.StoryMode = {
        storyTypeEnabled: false,  // Will be migrated/overridden
        storyArcEnabled: false
    };
});
```

**Option B: Verify `loadSettings()` Actually Updates Settings**
Check if the implementation at `lib/core/state-manager.js:160` correctly initializes `storyTypeEnabled`.

If it doesn't, add to `loadSettings()`:
```javascript
export function loadSettings() {
    const settings = extension_settings[MODULE_NAME] ||= {};

    // Migrate storyArcEnabled to storyTypeEnabled for backward compat
    if (settings.storyArcEnabled !== undefined && settings.storyTypeEnabled === undefined) {
        settings.storyTypeEnabled = true;
    }

    // Default storyTypeEnabled if still missing
    if (settings.storyTypeEnabled === undefined) {
        settings.storyTypeEnabled = true;
    }
}
```

### Affected Tests (3 failures)
- "should default storyTypeEnabled to true for new users"
- "should migrate storyTypeEnabled from storyArcEnabled for existing users"
- "should maintain backward compatibility"

---

## Summary of Changes

| Issue | Location | Type | Tests Affected | Fix Complexity |
|-------|----------|------|----------------|----|
| Missing `characterMetadata` | Mock setup | Mock | 5 failures | Low - Add object property |
| Missing `SlashCommandParser` | Mock setup | Mock | 7 failures | Low - Add mock function |
| Wrong spy targets | Test code | Spy | 5 failures | Medium - Import stateManager separately |
| Settings initialization | Test or production code | Logic | 3 failures | Medium - Check/update loadSettings() |

---

## Test File Locations

**File to Fix:**
```
/Users/markwilliamson/SillyT/Dev/SillyTavern/public/scripts/extensions/third-party/Extension-StoryMode/Testing/tests/pacing-mode-separation.test.js
```

**Related Files (No changes needed):**
```
/Users/markwilliamson/SillyT/Dev/SillyTavern/public/scripts/extensions/third-party/Extension-StoryMode/lib/core/state-manager.js
/Users/markwilliamson/SillyT/Dev/SillyTavern/public/scripts/extensions/third-party/Extension-StoryMode/lib/core/arc-engine.js
/Users/markwilliamson/SillyT/Dev/SillyTavern/public/scripts/extensions/third-party/Extension-StoryMode/lib/scene/image-generator.js
```

---

## Verification Steps

After applying fixes, run:

```bash
# Run just the pacing-mode-separation tests
npx vitest run Testing/tests/pacing-mode-separation.test.js --reporter=verbose

# Verify all tests pass
npm test

# Check test count
npm test 2>&1 | grep "Test Files"
# Expected output: "Test Files  6 passed (6)"
#                  "Tests  198 passed (198)"
```

---

## Notes

- **syncBlueprintSettings** IS exported from module.js (line 947) - the spy failure is due to module import failure from SlashCommandParser issue
- Once the SlashCommandParser mock is added, the blueprint module should import successfully
- All fixes are in the test file, not production code
- No changes needed to any lib/ files
