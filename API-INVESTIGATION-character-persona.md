# SillyTavern Character & Persona API Investigation

**Date:** 2026-01-16
**Purpose:** Document available APIs for character card and persona access/import

---

## Character Card Format

### Storage Format
- **Location:** `/characters/` directory (server-side)
- **Format:** PNG images with embedded JSON metadata
- **Metadata Keywords:**
  - `chara` (Character Card v2 format)
  - `ccv3` (Character Card v3 format, takes precedence)
- **Encoding:** Base64-encoded JSON in PNG tEXt chunks

### Character Card Parser (`/src/character-card-parser.js`)

```javascript
// Read character data from PNG buffer
export const read = (imageBuffer) => {
    // Extracts PNG chunks
    // Looks for 'ccv3' or 'chara' tEXt chunks
    // Returns base64-decoded JSON string
}

// Write character data to PNG buffer
export const write = (imageBuffer, jsonData) => {
    // Removes existing 'chara'/'ccv3' chunks
    // Adds new chunks with base64-encoded JSON
    // Returns modified PNG buffer
}
```

**Key Insight:** Character cards use the SAME PNG metadata approach we're using for blueprints! We can reuse similar logic.

---

## Client-Side Character Access

### From `getContext()` (already used in blueprint-module.js)

```javascript
const context = getContext();

// Available properties:
context.characters        // Array of character metadata objects
context.characterId       // Currently selected character (index or ID)
context.groupId          // Currently selected group ID
context.groups           // Array of group objects
context.characterData    // Current character's full data

// Character metadata structure (from context.characters):
{
    name: string,          // Character name
    filename: string,      // e.g., "Character.png"
    avatar: string,        // e.g., "Character.png"
    // ... other metadata
}
```

### Character Data Structure (typical)

```javascript
{
    name: "Character Name",
    description: "...",
    personality: "...",
    mes_example: "...",
    first_mes: "...",
    scenario: "...",
    avatar: "Character.png",
    // ... additional fields
}
```

---

## Persona Access

### From `power_user` (already used in blueprint-module.js)

```javascript
import { power_user } from '/scripts/power-user.js';

// Available properties:
power_user.personas              // Object: { avatarId: personaName, ... }
power_user.persona_descriptions  // Object: { avatarId: { description, title }, ... }
power_user.user_avatar           // Current persona avatar ID

// Example:
power_user.personas = {
    "User1.png": "Alice",
    "User2.png": "Bob"
}

power_user.persona_descriptions = {
    "User1.png": {
        description: "A helpful assistant",
        title: "Assistant"
    }
}
```

### Persona Functions (`/public/scripts/personas.js`)

```javascript
import { getUserAvatar, getUserAvatars, setUserAvatar, createPersona } from '/scripts/personas.js';

// Get single avatar
getUserAvatar(avatarImg)  // Returns avatar path

// Get all avatars
await getUserAvatars()    // Returns array of persona data

// Set user avatar (import persona)
await setUserAvatar(imgFile, options)

// Create new persona
await createPersona(avatarId)
```

---

## How to Import Character Cards Programmatically

### Challenge
SillyTavern doesn't expose a simple `importCharacter(data)` function in the client-side API. Character import is handled server-side via the `/api/characters/import` endpoint.

### Solution for Blueprint Import

**Option 1: Use Server API (Recommended)**
```javascript
// Send character card data to server for import
const formData = new FormData();
formData.append('avatar', pngBlob, 'character.png');

const response = await fetch('/api/characters/import', {
    method: 'POST',
    headers: getRequestHeaders(),
    body: formData
});
```

**Option 2: Reconstruct Character Card PNG**
```javascript
// Use character-card-parser approach in client
import { write } from './character-card-parser-client.js';  // Would need client version

// Reconstruct PNG with embedded metadata
const characterPNG = writeCharacterCard(avatarImage, characterJSON);

// Save to SillyTavern via API
await fetch('/api/characters/import', { ... });
```

**Option 3: Embed Full PNG in Blueprint**
```javascript
// In blueprint export:
embeddedResources.characters = [{
    name: "Character Name",
    pngDataUrl: "data:image/png;base64,...",  // Full character card PNG
    metadata: { /* parsed character data for preview */ }
}];

// In blueprint import:
// Extract pngDataUrl, convert to Blob, upload to server
```

---

## How to Import Personas Programmatically

### Persona Import is Simpler

Personas are client-side only (stored in `power_user`), so we can import them directly:

```javascript
import { setUserAvatar, createPersona } from '/scripts/personas.js';

// Import persona avatar
const avatarFile = dataURLtoFile(personaAvatarDataURL, 'persona.png');
await setUserAvatar(avatarFile, { toastPersonaNameChange: false });

// Then set persona description
const avatarId = getAvatarIdFromFilename('persona.png');
power_user.personas[avatarId] = personaName;
power_user.persona_descriptions[avatarId] = {
    description: personaDescription,
    title: personaTitle
};

// Save power_user settings
await saveSettingsDebounced();
```

---

## Recommendations for Blueprint Export/Import

### Character Embedding Strategy

**Export:**
1. For each character in blueprint's `character_arcs`:
   - Find character in `context.characters` by name matching
   - Fetch character card PNG file from `/characters/{avatar}`
   - Store entire PNG as data URL in `embeddedResources.characters`
   - Parse metadata for preview display

```javascript
{
    embeddedResources: {
        characters: [
            {
                name: "Alice",
                avatar: "Alice.png",
                pngDataUrl: "data:image/png;base64,...",  // Full card PNG
                metadata: {  // Parsed for preview
                    description: "...",
                    personality: "...",
                }
            }
        ]
    }
}
```

**Import:**
1. Check if character exists: `context.characters.find(c => c.name === character.name)`
2. If missing, show import preview dialog
3. If user confirms:
   - Convert `pngDataUrl` to Blob
   - Upload via `/api/characters/import` endpoint
   - Wait for server response
   - Refresh character list

### Persona Embedding Strategy

**Export:**
1. For each persona referenced in blueprint wizard:
   - Get persona data from `power_user.personas[avatarId]`
   - Fetch persona avatar from `/User Avatars/{avatarId}`
   - Store avatar as data URL
   - Include persona name, description, title

```javascript
{
    embeddedResources: {
        personas: [
            {
                id: "User1.png",
                name: "Alice",
                title: "Assistant",
                description: "A helpful assistant",
                avatarDataUrl: "data:image/png;base64,..."
            }
        ]
    }
}
```

**Import:**
1. Check if persona exists: `power_user.personas[avatarId]`
2. If missing, show import preview dialog
3. If user confirms:
   - Convert `avatarDataUrl` to File
   - Call `await setUserAvatar(file, { toastPersonaNameChange: false })`
   - Set `power_user.personas[newAvatarId] = name`
   - Set `power_user.persona_descriptions[newAvatarId] = { description, title }`
   - Call `await saveSettingsDebounced()`

---

## API Functions Needed in `blueprint-character-linker.js`

```javascript
// Character discovery (already understood)
export function getCurrentChatCharacters() { /* Extract from blueprint-module.js */ }
export function findCharacterByName(name) { /* Search context.characters */ }

// Character card access (NEW - needs implementation)
export async function fetchCharacterCardPNG(avatar) {
    // Fetch PNG from /characters/{avatar}
    // Return as Blob or data URL
}

export async function getCharacterCardData(characterIndex) {
    const context = getContext();
    const char = context.characters[characterIndex];

    // Fetch PNG
    const pngBlob = await fetchCharacterCardPNG(char.avatar);

    // Parse embedded JSON (client-side version of character-card-parser)
    const metadata = await parseCharacterCardPNG(pngBlob);

    return {
        name: char.name,
        avatar: char.avatar,
        pngDataUrl: await blobToDataURL(pngBlob),
        metadata: metadata
    };
}

// Character import (NEW - needs implementation)
export async function importCharacterCard(pngDataUrl) {
    // Convert data URL to Blob
    const blob = dataURLtoBlob(pngDataUrl);

    // Upload to server
    const formData = new FormData();
    formData.append('avatar', blob, 'character.png');

    const response = await fetch('/api/characters/import', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: formData
    });

    if (!response.ok) {
        throw new Error(`Import failed: ${response.statusText}`);
    }

    return await response.json();
}

// Persona discovery (already understood)
export function getAllPersonas() { /* Extract from blueprint-module.js */ }

// Persona avatar access (NEW - needs implementation)
export async function fetchPersonaAvatar(avatarId) {
    // Fetch from /User Avatars/{avatarId}
    // Return as Blob or data URL
}

export async function getPersonaData(avatarId) {
    const name = power_user.personas[avatarId];
    const desc = power_user.persona_descriptions[avatarId];

    // Fetch avatar
    const avatarBlob = await fetchPersonaAvatar(avatarId);

    return {
        id: avatarId,
        name: name,
        description: desc?.description || '',
        title: desc?.title || '',
        avatarDataUrl: await blobToDataURL(avatarBlob)
    };
}

// Persona import (NEW - needs implementation)
export async function importPersona(personaData) {
    // Convert data URL to File
    const file = dataURLtoFile(personaData.avatarDataUrl, `${personaData.name}.png`);

    // Import avatar
    await setUserAvatar(file, { toastPersonaNameChange: false });

    // Get the new avatar ID (may be different if name conflict)
    const newAvatarId = getAvatarIdFromFilename(`${personaData.name}.png`);

    // Set persona data
    power_user.personas[newAvatarId] = personaData.name;
    power_user.persona_descriptions[newAvatarId] = {
        description: personaData.description,
        title: personaData.title
    };

    // Save settings
    await saveSettingsDebounced();

    return newAvatarId;
}
```

---

## Utility Functions Needed

```javascript
// Blob/DataURL conversions
async function blobToDataURL(blob) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
    });
}

function dataURLtoBlob(dataURL) {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
}

function dataURLtoFile(dataURL, filename) {
    const blob = dataURLtoBlob(dataURL);
    return new File([blob], filename, { type: blob.type });
}

// Character card PNG parsing (client-side)
async function parseCharacterCardPNG(blob) {
    // Read PNG chunks (similar to server-side parser)
    // Extract 'ccv3' or 'chara' tEXt chunk
    // Base64 decode and parse JSON
    // Return character data
}

function getAvatarIdFromFilename(filename) {
    // Convert filename to avatar ID
    // Handle name conflicts
}
```

---

## Security Considerations

| Risk | Mitigation |
|------|------------|
| Malicious character PNG | Validate PNG signature before parsing |
| XSS via character name/description | Sanitize with `escapeHtml()` before display |
| Path traversal in avatar filename | Use `sanitizeFilename()` |
| Large PNG causing memory issues | Limit PNG size to 5MB before import |
| Duplicate character names | Show conflict resolution dialog |

---

## Testing Checklist

- [ ] Export blueprint with 2 characters from group chat
- [ ] Export blueprint with single character
- [ ] Export blueprint with 2 personas
- [ ] Import blueprint on fresh instance (no characters)
- [ ] Import blueprint with 1 existing character (conflict)
- [ ] Import blueprint with missing persona
- [ ] Verify imported character appears in character list
- [ ] Verify imported persona appears in persona list
- [ ] Verify character PNG metadata is preserved
- [ ] Verify persona avatar is correct size/format

---

## Next Steps

1. **Create client-side character card parser** (adapt from server-side version)
2. **Implement character fetch functions** (fetch PNG from server)
3. **Implement persona fetch functions** (fetch avatar from User Avatars)
4. **Test character/persona import via API** (verify server endpoints)
5. **Update plan with correct API usage**

---

## Conclusion

**Key Findings:**
- ✅ Character cards use PNG tEXt chunks (same as blueprints!)
- ✅ Character import requires server API call (`/api/characters/import`)
- ✅ Persona import is client-side only (easier)
- ✅ Full PNG embedding is the best approach (preserves all metadata)
- ⚠️ Need client-side PNG parser (adapt from server version)

**Plan Update Required:**
- Add client-side PNG parser utilities
- Add fetch functions for character/persona avatars
- Clarify that character import uses server API
- Add data URL conversion utilities to blueprint-utils.js
