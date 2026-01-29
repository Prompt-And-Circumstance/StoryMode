# Characters & Personas Architecture

Detailed reference for how characters and personas flow through blueprint generation, storage, export/import, and UI display. For quick reference see [CLAUDE.md](./CLAUDE.md). For system design see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Data Flow Overview

```
Wizard (personaData)
  → LLM Prompt (persona_data section)
  → Generated Blueprint (character_arcs, scene_plan.character_focus)
  → Editor (characters-tab.js — picker, linked cards, arc editor)
  → Export (embeddedResources.characters / .personas as PNG data URLs)
  → Import (import-ui.js dialog → linker.js upload → SillyTavern library)
```

## Blueprint Fields Referencing Characters & Personas

| Field | Type | Source | Purpose |
|-------|------|--------|---------|
| `character_arcs[]` | `{character_name, initial_state, key_turning_points, final_state, emotional_trajectory}` | LLM-generated | Primary character data; linker uses `character_name` to match library |
| `scene_plan[].character_focus[]` | `{name, emotional_beat_target, turning_point}` | LLM-generated | Per-scene character narrative instructions; injected into prompts |
| `selectedPersonas` | `string[]` or `{id, name}[]` | Export code reads this | Persona references for export; **⚠️ never populated by wizard** |
| `personaData` | `{id, name}[]` | Wizard form collection | Wizard stores personas here; export reads `selectedPersonas` instead |
| `embeddedResources.characters[]` | `{name, avatar, pngDataUrl, metadata}` | Export / PNG import | Full character card PNG as data URL |
| `embeddedResources.personas[]` | `{id, name, description, title, avatarDataUrl}` | Export / PNG import | Persona avatar + metadata |

### Known Issue: `selectedPersonas` vs `personaData`

The wizard (`lib/dialog/wizard.js:159`) stores persona selections as `personaData: [{id, name}]`. Export code (`lib/blueprint/export.js:132`) reads `blueprint.selectedPersonas`. No code bridges these fields. Status detection (`scenario-characters.js`) checks both `selectedPersonas` and `personaData` as a workaround.

## Character Linking

**File:** `lib/blueprint/characters/linker.js` — `linkBlueprintCharacters(blueprint)`

```javascript
// Returns:
{
  linked: [{blueprintName, localCharacter}],      // Found in character library
  linkedPersonas: [{blueprintName, localPersona}], // Found in persona list
  missing: [name1, name2]                          // Not found anywhere
}
```

**Matching algorithm** (per `character_arcs` entry):
1. Search `getAllCharacters()` by normalized name → **linked**
2. Search `getAllPersonas()` by normalized name → **linkedPersona**
3. Neither → **missing**

**Character vs Persona distinction** is determined at link time, not stored in the blueprint. The same `character_arcs` array holds both; the linker classifies by library lookup.

## Status Detection (Scenario Characters Module)

**File:** `lib/ui/components/scenario-characters.js`

### `getBlueprintCharactersWithStatus(blueprint)`

Collects names from `character_arcs` and `scene_plan.character_focus`, **excluding known persona names** (from `embeddedResources.personas`, `selectedPersonas`, `personaData`).

For each name, checks:
1. `findCharacterByName()` → status: `'linked'`, avatar from library
2. Match in `embeddedResources.characters` → status: `'embedded'`, avatar from `pngDataUrl`
3. Neither → status: `'missing'`, no avatar

### `getBlueprintPersonasWithStatus(blueprint)`

Collects names from `selectedPersonas` OR `personaData` (handles both string and `{id, name}` formats), plus `embeddedResources.personas` names.

For each name, checks:
1. `findPersonaByName()` → status: `'linked'`, avatar from `/User Avatars/{id}`
2. Match in `embeddedResources.personas` → status: `'embedded'`, avatar from `avatarDataUrl`
3. Neither → status: `'missing'`, no avatar

### `getResourceSummaryCounts(blueprint)`

Returns `{characters: {total, embedded, linked, missing}, personas: {total, embedded, linked, missing}}` for controller panel display.

## Blueprint Editor (Characters Tab)

**File:** `lib/editor/blueprint-editor/characters-tab.js`

### Sub-tabs
- **Characters** — Picker grid + linked characters display
- **Character Arcs** — Arc cards with edit/delete

### Character Picker
- Shows all SillyTavern characters from `getAllCharacters()`
- Shows all personas from `getAllPersonas()`
- Click to add → creates skeleton `character_arcs` entry via `addCharacterArcFromPicker(name)`

### Linked Characters Display (`renderLinkedCharacters`)

Three sections rendered from `linkBlueprintCharacters()` output:

| Section | Card Function | Data Source |
|---------|--------------|-------------|
| Characters (in library) | `renderCharacterCard(localCharacter, true)` | `linkInfo.linked` |
| Personas | `renderPersonaCard(localPersona)` | `linkInfo.linkedPersonas` |
| Not in Library | `renderMissingCharacterCard(name, embeddedData)` | `linkInfo.missing` + `embeddedResources` lookup |

### State Management

```javascript
getCurrentBlueprint()        // In-memory blueprint object
setHasUnsavedChanges(true)   // Marks editor as dirty
// Save: user clicks "Set as Current Scenario" → saveBlueprintToState()
```

### Add/Remove Character Arc

```javascript
addCharacterArcFromPicker(name)  // Push skeleton arc, setHasUnsavedChanges(true)
deleteCharacterArc(index)        // Splice from character_arcs, setHasUnsavedChanges(true)
```

**Event handlers:** `lib/editor/blueprint-editor/character-handlers.js` — document-level delegation with `EVENT_NAMESPACE` to prevent stacking.

## Export Flow

**File:** `lib/blueprint/export.js`

### Character Export
```
getBlueprintCharacterNames(blueprint)
  → extractCharactersForExport(names)
    → For each: findCharacterByName() → fetchCharacterCardPNG(avatar) → blobToDataURL()
    → Result: [{name, avatar, pngDataUrl, metadata}]
  → Stored as blueprint.embeddedResources.characters
```

### Persona Export
```
blueprint.selectedPersonas  ← ⚠️ may be undefined (see known issue above)
  → extractPersonasForExport(personaNames)
    → For each: findPersonaByName() → getPersonaData(id) → fetch avatar → dataURL
    → Result: [{id, name, description, title, avatarDataUrl}]
  → Stored as blueprint.embeddedResources.personas
```

### PNG Encoding
Embedded resources are stored as PNG tEXt chunks alongside blueprint JSON. The full character card PNG (including world info in the `chara` tEXt chunk) is preserved as a base64 data URL.

## Import Flow

### Path 1: Blueprint Load (`lib/blueprint/module.js`)

When loading a blueprint with embedded characters not in the library:

```
promptForMissingCharacters(blueprint)
  → detectMissingResources(blueprint)
  → showImportPreviewDialog() — only shows missing resources
  → User selects which to import
  → importCharacterCard(pngDataUrl, name) — uploads PNG via /api/characters/import
  → importPersona(personaData) — sets avatar + metadata via setUserAvatar()
  → getCharacters() — refreshes SillyTavern's in-memory list
  → updateControllerPanel() — refreshes controller counts
```

### Path 2: Scenario Characters Popup (`lib/ui/components/scenario-characters-popup.js`)

"Add to Library" button per embedded resource:

```
handleAddToLibraryClick(name, btn)
  → Find embedded data in blueprint.embeddedResources.characters
  → addEmbeddedCharacterToLibrary(embedded) — wraps importCharacterCard
  → getCharacters() — refresh library
  → showScenarioCharactersPopup() — re-render popup
  → updateControllerPanel() — refresh counts
```

### Path 3: PNG File Import (`lib/blueprint/import.js`)

```
promptForImport(blueprint)
  → showImportPreviewDialog()
  → importMissingResources(embeddedResources, selections)
  → getCharacters() — refresh library
  → showImportResultDialog(result) — toastr notifications
```

### Import Technical Details

- **Character upload:** FormData with PNG file → `POST /api/characters/import`
  - Must use `getRequestHeaders({ omitContentType: true })` for multipart boundary
  - PNG signature verified with `Uint8Array` (not raw `ArrayBuffer`)
- **Persona upload:** `setUserAvatar(file)` + set `power_user.personas[avatarId]` + `power_user.persona_descriptions[avatarId]`

## Controller Panel Display

**File:** `lib/ui/controller-panel.js`

Uses `getResourceSummaryCounts(blueprint)` to show:
```
Characters  ← clickable, opens Scenario Characters popup
  3 characters (1 embedded | 2 in library)
  1 persona (1 embedded)
```

Click handler opens `showScenarioCharactersPopup()` which renders full cards with avatars and import buttons.

## Key Files Reference

| File | Purpose |
|------|---------|
| `lib/ui/components/scenario-characters.js` | Status detection: `getBlueprintCharactersWithStatus`, `getBlueprintPersonasWithStatus`, `getResourceSummaryCounts` |
| `lib/ui/components/scenario-characters-popup.js` | Draggable popup UI: card rendering, import buttons, event handlers |
| `lib/ui/components/resource-import.js` | `addEmbeddedCharacterToLibrary`, `addEmbeddedPersonaToLibrary` |
| `lib/editor/blueprint-editor/characters-tab.js` | Editor characters tab: picker, linked display, arc CRUD |
| `lib/editor/blueprint-editor/character-handlers.js` | Event delegation for characters tab interactions |
| `lib/blueprint/characters/linker.js` | Library matching, PNG fetch, character/persona import, export extraction |
| `lib/blueprint/characters/discovery.js` | `getAllCharacters`, `getAllPersonas`, `findCharacterByName`, `findPersonaByName` |
| `lib/blueprint/export.js` | Embed characters/personas into blueprint for sharing |
| `lib/blueprint/import.js` | Import embedded resources from loaded blueprints |
| `lib/blueprint/import-ui.js` | Import preview dialog, result notifications |
| `lib/blueprint/module.js` | `promptForMissingCharacters` — auto-import on blueprint load |
| `lib/ui/controller-panel.js` | Story controller character counts + popup trigger |
