# Library Character Injection Enhancement

**Date:** 2026-01-27
**Status:** ✅ Implemented

## Problem

The original implementation only injected character information from **embedded resources** in the blueprint. If a character was referenced in the blueprint but existed in the user's SillyTavern character library (not embedded), their info would NOT be injected into prompts.

## Solution

Enhanced the character injection feature to check **both sources** with priority:

1. **Embedded characters** (highest priority) - from `blueprint.embeddedResources.characters`
2. **User's character library** (fallback) - from SillyTavern's loaded characters

## Changes Made

### 1. Modified `lib/scenario/character-injection.js`

#### Added Library Import
```javascript
import { characters } from '/script.js';
```

#### Added Character Lookup Function
```javascript
function findCharacterInLibrary(characterName)
```
- Searches SillyTavern's character array by name
- Tries exact name match first
- Falls back to avatar filename match (without extension)
- Returns character object or null

#### Enhanced `getMissingCharactersForInjection()`
**Before:**
- Only checked `embeddedResources.characters`
- Returned empty array if no embedded characters existed

**After:**
- For each missing character name:
  1. Try to find in embedded resources first
  2. If not found, look up in character library
  3. Normalize library character format to match embedded format
- Returns combined results from both sources

#### Updated Character Source Tracking
- Added `source` field to character objects: `'embedded'` or `'library'`
- Updated XML to include source attribute: `source="library"`
- Updated context note based on source

### 2. Updated `lib/ui/components/blueprint-settings.js`

Updated help text to reflect the new behavior:
```
Sources (in priority order):
1. Embedded character resources in blueprint
2. Characters from your SillyTavern library
```

## How It Works

### Priority System

1. **Embedded characters** are always used if available (they may have been customized for the specific blueprint)
2. **Library characters** are used as fallback (ensures characters referenced in blueprint always get injected if they exist anywhere)

### Character Matching

The lookup tries multiple matching strategies:
- Exact name match: `"Alice"` → `characters.find(c => c.name === "Alice")`
- Avatar match: `"Alice"` → `characters.find(c => c.avatar === "Alice.png")`

### Data Normalization

Library characters are converted to match the embedded format:
```javascript
{
    name: libraryChar.name,
    avatar: libraryChar.avatar,
    source: 'library',
    metadata: {
        name: libraryChar.name,
        description: libraryChar.description
    }
}
```

## Testing

### Run the Test Script

```javascript
const script = document.createElement('script');
script.src = '/scripts/extensions/third-party/Extension-StoryMode/Testing/test-library-character-injection.js';
script.type = 'module';
document.head.appendChild(script);
```

### Expected Results

✅ **Step 1:** Character library accessible
✅ **Step 2:** Characters found from library
✅ **Step 3:** XML generated with `source="library"`
✅ **Step 4:** Embedded characters take priority over library

### Manual Testing

1. **Create a blueprint** with character references (via wizard or manually)
2. **Don't embed characters** (or use a blueprint without embedded resources)
3. **Ensure those characters exist** in your SillyTavern character gallery
4. **Start a scenario** with that blueprint
5. **Open Story Controller** → Prompt Inspector
6. **Verify** the prompt contains `<blueprint_characters>` with `source="library"`

Example output:
```xml
<blueprint_characters note="Characters from blueprint not in current chat">
  <character name="Alice" source="library">
    <description>A brilliant detective with trust issues</description>
    <current_state>Skeptical</current_state>
    <trajectory>Trust to doubt</trajectory>
    <context>Referenced in blueprint, loaded from character library</context>
  </character>
</blueprint_characters>
```

## Edge Cases Handled

1. **Character in both sources** - Embedded takes priority
2. **Character in neither source** - Skipped (no injection)
3. **Empty character library** - Falls back to embedded only
4. **No embedded resources** - Uses library only
5. **Character name mismatch** - Tries both name and avatar matching

## Benefits

1. **No embedding required** - Users can reference characters without embedding them
2. **Flexibility** - Works with any blueprint format (old or new)
3. **Backwards compatible** - Embedded characters still work exactly as before
4. **Automatic fallback** - Best available data source is always used
5. **Consistent behavior** - Characters are always injected if they exist anywhere

## Files Modified

- `lib/scenario/character-injection.js` - Core logic enhancement
- `lib/ui/components/blueprint-settings.js` - Updated help text

## Files Added

- `Testing/test-library-character-injection.js` - Automated test suite
- `LIBRARY_CHARACTER_INJECTION_ENHANCEMENT.md` - This document

## Next Steps

1. ✅ Hard refresh to clear ES6 module cache: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+F5` (Windows)
2. ✅ Run the test script to verify functionality
3. ✅ Test with a real blueprint that has character references
4. ✅ Check the prompt preview shows library characters

## Notes

- This enhancement does NOT change the UI toggle behavior
- Scene-focused filtering still works the same way
- Max 5 characters limit still applies
- Description truncation (200 chars) still applies
