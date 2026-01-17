# Code Review: Existing Character & Persona Discovery Code

**Date:** 2026-01-16
**Purpose:** Understand what can be reused from blueprint-module.js for the new export/import feature

---

## Summary

The existing character/persona code in `lib/blueprint-module.js` performs **dual duties**: data discovery AND UI rendering. We can extract the data discovery logic into new reusable functions, but the HTML generation must remain separate.

---

## Function Analysis

### 1. `buildCharacterSelectionList()` (Lines 3476-3553)

**Current Purpose:** Build HTML checkboxes for blueprint wizard character selection

**What it does:**
```javascript
function buildCharacterSelectionList() {
    const context = getContext();
    const characterList = [];

    // DATA DISCOVERY (lines 3490-3538) - REUSABLE
    const allCharacters = context.characters || [];

    if (groupId && context.groups) {
        // Find group members by matching filenames
        const group = context.groups.find(g => g.id === groupId);
        group.members.forEach(memberFilename => {
            const charIndex = allCharacters.findIndex(c =>
                c.filename === memberFilename ||
                c.avatar === memberFilename ||
                (typeof c === 'string' && c === memberFilename)
            );
            if (charIndex !== -1) {
                characterList.push({
                    id: charIndex.toString(),
                    name: char.name || `Character ${charIndex}`,
                    role: 'group',
                });
            }
        });
    } else if (characterId !== null) {
        // Single character chat
        const char = allCharacters[charIndex];
        characterList.push({
            id: characterId.toString(),
            name: char.name || 'Current Character',
            role: 'main',
        });
    }

    // UI BUILDING (lines 3544-3552) - NOT REUSABLE FOR EXPORT
    return characterList.map(char => `
        <label class="checkbox_label">
            <input type="checkbox" name="blueprint_character" value="${char.id}" />
            <span>${char.name}</span>
        </label>
    `).join('');
}
```

**What's Reusable:**
- ✅ Logic for finding group members (lines 3495-3521)
- ✅ Logic for finding single character (lines 3522-3536)
- ✅ Building `characterList` array with `{id, name, role}` structure
- ✅ Accessing `context.characters`, `context.groupId`, `context.characterId`

**What's NOT Reusable:**
- ❌ HTML generation (lines 3544-3552)
- ❌ Checkbox input elements
- ❌ Return type (string instead of array)

**Extraction Strategy:**
```javascript
// NEW function in blueprint-character-linker.js
export function getCurrentChatCharacters() {
    const context = getContext();
    const characterList = [];
    // ... copy lines 3490-3538 logic ...
    return characterList; // Return array, not HTML
}

// KEEP existing function in blueprint-module.js
function buildCharacterSelectionList() {
    const characterList = getCurrentChatCharacters();
    if (characterList.length === 0) {
        return '<div>No characters detected</div>';
    }
    return characterList.map(char => `...HTML...`).join('');
}
```

---

### 2. `buildPersonaSelectionList()` (Lines 3560-3604)

**Current Purpose:** Build HTML checkboxes for blueprint wizard persona selection

**What it does:**
```javascript
function buildPersonaSelectionList() {
    // DATA DISCOVERY (lines 3566-3580) - REUSABLE
    const personaList = [];
    const personaIds = Object.keys(power_user.personas);

    for (const avatarId of personaIds) {
        const personaName = power_user.personas[avatarId];
        const personaDesc = power_user.persona_descriptions[avatarId];
        if (personaName && personaDesc) {
            personaList.push({
                id: avatarId,
                name: personaName,
                description: personaDesc.description || '',
                title: personaDesc.title || '',
            });
        }
    }

    // UI BUILDING (lines 3586-3603) - NOT REUSABLE FOR EXPORT
    return personaList.map(persona => `
        <label class="checkbox_label">
            <input type="checkbox" value="${persona.id}" />
            <span>${displayName}</span>
            <div>${descriptionPreview}</div>
        </label>
    `).join('');
}
```

**What's Reusable:**
- ✅ Logic for iterating `power_user.personas` (lines 3569-3580)
- ✅ Building `personaList` array with `{id, name, description, title}` structure
- ✅ Accessing `power_user.persona_descriptions[avatarId]`

**What's NOT Reusable:**
- ❌ HTML generation (lines 3586-3603)
- ❌ Description preview truncation (UI concern)
- ❌ Return type (string instead of array)

**Extraction Strategy:**
```javascript
// NEW function in blueprint-character-linker.js
export function getAllPersonas() {
    if (!power_user?.personas || !power_user?.persona_descriptions) {
        return [];
    }

    const personaList = [];
    const personaIds = Object.keys(power_user.personas);

    for (const avatarId of personaIds) {
        const personaName = power_user.personas[avatarId];
        const personaDesc = power_user.persona_descriptions[avatarId];
        if (personaName && personaDesc) {
            personaList.push({
                id: avatarId,
                name: personaName,
                description: personaDesc.description || '',
                title: personaDesc.title || '',
            });
        }
    }

    return personaList; // Return array, not HTML
}

// KEEP existing function in blueprint-module.js
function buildPersonaSelectionList() {
    const personaList = getAllPersonas();
    if (personaList.length === 0) {
        return '<div>No personas available</div>';
    }
    return personaList.map(persona => `...HTML...`).join('');
}
```

---

### 3. `exportBlueprint()` (Lines 3614-3631)

**Current Purpose:** Export blueprint as JSON file

**Current Implementation:**
```javascript
export function exportBlueprint(blueprint) {
    const dataStr = JSON.stringify(blueprint, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `story-blueprint-${blueprint.story_type_name}-${Date.now()}.json`;
    a.click();
    // Cleanup...
}
```

**What's Reusable:**
- ✅ Filename pattern: `story-blueprint-${name}-${timestamp}.json`
- ✅ Blob creation pattern
- ✅ Download trigger pattern (create `<a>`, click, cleanup)

**What's NOT Reusable:**
- ❌ No character/persona embedding
- ❌ No PNG generation
- ❌ JSON-only format
- ❌ No cover image handling

**Analysis:**
This function is **completely separate** from the new PNG export feature. It should remain as-is for JSON-only exports (useful for debugging).

**Recommendation:**
- **KEEP** `exportBlueprint()` as-is for JSON export
- **CREATE** `exportBlueprintAsPNG()` in new `blueprint-export.js` module
- Both export functions can coexist (JSON for devs, PNG for users)

---

### 4. `importBlueprint()` (Lines 3638-3670)

**Current Purpose:** Import blueprint from JSON file

**Current Implementation:**
```javascript
export async function importBlueprint(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const blueprint = JSON.parse(e.target.result);
            const validation = validateBlueprint(blueprint);
            if (!validation.valid) {
                reject(new Error('Invalid blueprint'));
                return;
            }
            const normalized = normalizeBlueprint(blueprint);
            resolve(normalized);
        };
        reader.readAsText(file);
    });
}
```

**What's Reusable:**
- ✅ FileReader pattern for file loading
- ✅ Blueprint validation via `validateBlueprint()`
- ✅ Blueprint normalization via `normalizeBlueprint()`
- ✅ Error handling pattern

**What's NOT Reusable:**
- ❌ No PNG decoding
- ❌ No character/persona import
- ❌ No resource detection
- ❌ Text-only reading (needs ArrayBuffer for PNG)

**Analysis:**
The new PNG import needs to:
1. Read file as ArrayBuffer (not text)
2. Decode PNG metadata
3. Extract embedded resources
4. Validate blueprint (reuse existing validation)
5. Import characters/personas into SillyTavern

**Recommendation:**
- **KEEP** `importBlueprint()` for JSON import
- **CREATE** `importBlueprintFromPNG()` in new `blueprint-import.js` module
- Both can share validation/normalization logic

---

## Character Card Data Access

**Missing from Current Code:**
The existing code only accesses character **metadata** (name, id) from `context.characters`, but does NOT access:
- Character card full data (descriptions, personality, etc.)
- Character avatars as data URLs or files
- Character card JSON structure

**Where to Get This Data:**
SillyTavern stores character cards as PNG files in `/characters/` directory. Each PNG has embedded JSON metadata (similar to what we're building for blueprints!).

**Required New Functions:**
```javascript
// In blueprint-character-linker.js

/**
 * Get character card data for export
 * @param {string|number} characterId - Character index in context.characters
 * @returns {Promise<Object>} Character card data with avatar
 */
export async function getCharacterCardData(characterId) {
    const context = getContext();
    const char = context.characters[characterId];

    // Fetch character card JSON (SillyTavern API)
    // Extract avatar as data URL
    // Return { name, avatar, description, personality, ... }
}

/**
 * Get persona data with avatar for export
 * @param {string} avatarId - Persona avatar ID
 * @returns {Promise<Object>} Persona data with avatar as data URL
 */
export async function getPersonaData(avatarId) {
    // Fetch persona avatar file
    // Encode as data URL
    // Return { id, name, description, avatar }
}
```

**Investigation Needed:**
- How does SillyTavern fetch character card data? (Check `/scripts/` files)
- Are there existing APIs for getting character PNG files?
- How are persona avatars stored and accessed?

---

## Recommendations for Plan Update

### 1. Correct Line Number References

**In Plan (INCORRECT):**
> "Character list building lib/blueprint-module.js:3500-3560"

**Should Be:**
> "Character discovery logic: lib/blueprint-module.js:3490-3538 (data only, excluding HTML)
> Persona discovery logic: lib/blueprint-module.js:3566-3580 (data only, excluding HTML)"

### 2. Change "Refactor" to "Extract"

**In Plan (MISLEADING):**
> "Refactor into blueprint-character-linker.js"

**Should Be:**
> "Extract data discovery logic into blueprint-character-linker.js, keep HTML generation in blueprint-module.js"

### 3. Add Missing Functions to Plan

The plan should explicitly list these new functions needed in `blueprint-character-linker.js`:

```javascript
// EXTRACTION from existing code
export function getCurrentChatCharacters() { /* Extract lines 3490-3538 */ }
export function getAllPersonas() { /* Extract lines 3566-3580 */ }

// NEW functions for character card access
export async function getCharacterCardData(characterId) { /* New */ }
export async function getPersonaData(avatarId) { /* New */ }
export function findCharacterByName(name) { /* New */ }

// LINKING functions
export function linkBlueprintCharacters(blueprint) { /* New */ }
export function getBlueprintCharacterNames(blueprint) { /* New */ }
```

### 4. Keep Both Export/Import Functions

The plan should clarify that:
- **JSON export/import** (`exportBlueprint`, `importBlueprint`) stays in blueprint-module.js
- **PNG export/import** is the NEW feature in separate modules
- Both formats coexist (JSON for devs/debugging, PNG for users/sharing)

### 5. Investigate SillyTavern Character APIs

Before implementation, we need to answer:
1. How to fetch full character card data? (API endpoints? Direct file access?)
2. How to get character avatars as data URLs?
3. How to import character cards into SillyTavern programmatically?
4. How to import personas programmatically?

**Action:** Search SillyTavern documentation or core scripts for character import/export APIs.

---

## Code Reuse Summary

| Code Section | Lines | Reusable? | Strategy |
|--------------|-------|-----------|----------|
| Character discovery logic | 3490-3538 | ✅ YES | Extract into `getCurrentChatCharacters()` |
| Character HTML generation | 3544-3552 | ❌ NO | Keep in blueprint-module.js |
| Persona discovery logic | 3566-3580 | ✅ YES | Extract into `getAllPersonas()` |
| Persona HTML generation | 3586-3603 | ❌ NO | Keep in blueprint-module.js |
| JSON export | 3614-3631 | ⚠️ PARTIAL | Reuse download pattern, not content |
| JSON import | 3638-3670 | ⚠️ PARTIAL | Reuse validation, not file reading |
| Character card access | N/A | ❌ MISSING | Must create new functions |

---

## Next Steps

1. ✅ **DONE:** Review existing code
2. **TODO:** Search for SillyTavern character import/export APIs
3. **TODO:** Update plan with corrected line numbers and extraction strategy
4. **TODO:** Add investigation findings to plan
5. **TODO:** Proceed with implementation once APIs are understood

---

**Conclusion:** The plan reviewer was correct. The existing functions mix data discovery with UI rendering. We must **extract** the data logic, not **refactor** the entire functions. The plan needs revision to reflect this distinction.
