# Auto-Generated Cover Fix - Revised Plan

## Problem Analysis

**Issue**: Auto-generated covers aren't saving on blueprint generation (only work when manual save is clicked)

**Root Cause**: The `autoGenerate` setting exists in `coverGeneration` settings but is never used after blueprint generation.

## Key Discovery: Existing Infrastructure

The codebase already has most of the needed infrastructure:

1. **`createBlueprint()` function** in `blueprint-integration.js` - Already handles cover generation via `generateCoverIfNeeded()`
2. **`generateCoverIfNeeded()` helper** - Has error handling and calls `generateCoverImage()`
3. **`generateCoverImage()` function** - Stub in `blueprint-storage.js` that needs implementation
4. **Cover gallery management** - `addCoverToGallery()` already exists
5. **Settings infrastructure** - `autoGenerate` flag already implemented and saved

## Current Plan Issues (Original Plan Problems)

1. **❌ Duplicates existing logic** - Re-implemented cover generation manually
2. **❌ Ignored `createBlueprint()`** - Existing function that does exactly what we need
3. **❌ Manual SD extension handling** - Should use existing patterns in blueprint-editor.js
4. **❌ Logic in wrong place** - Cluttered index.js instead of using appropriate modules

## Corrected Implementation Plan

### 1. Implement `generateCoverImage()` Function

**Location**: `lib/blueprint-storage.js` (replace stub at lines 1029-1034)

**Implementation**: Follow the same pattern as `handleGenerateCover()` in `blueprint-editor.js`:

```javascript
export async function generateCoverImage(blueprint, options = {}) {
    if (!blueprint) {
        throw new Error('Blueprint is required for cover generation');
    }
    
    // Check if SD extension is available
    if (!extension_settings.sd || !extension_settings.sd.source) {
        throw new Error('SD extension not configured');
    }
    
    // Generate cover prompt if not exists
    const prompt = blueprint.metadata?.coverPrompt || generateCoverPrompt(blueprint);
    
    // Use same generation logic as manual button
    const fullPrompt = buildSDPrompt(prompt);
    
    const result = await SlashCommandParser.commands['sd'].callback(
        { quiet: 'true' },
        fullPrompt
    );
    
    if (typeof result === 'string' && result.trim().length > 0) {
        return result.trim(); // Return URL string
    } else {
        throw new Error('No image returned from image provider');
    }
}
```

**Note**: This returns a string URL, not an HTMLImageElement as the docstring suggests. Need to update the docstring.

### 2. Fix `createBlueprint()` to Handle URLs Correctly

**Location**: `lib/blueprint-integration.js` (lines 145-149)

**Issue**: Current code sets `blueprint.coverImage` but rest of codebase expects `blueprint.coverImageUrl` and `blueprint.metadata.coverImageUrl`.

**Fix**:

```javascript
// Generate cover if requested
const coverImageUrl = await generateCoverIfNeeded(blueprint, generateCover);
if (coverImageUrl) {
    // Set both legacy and metadata URLs for compatibility
    blueprint.coverImageUrl = coverImageUrl;
    blueprint.metadata = blueprint.metadata || {};
    blueprint.metadata.coverImageUrl = coverImageUrl;
    
    // Add to gallery if enabled in settings
    const coverGenSettings = extension_settings[MODULE_NAME]?.blueprintSettings?.coverGeneration;
    if (coverGenSettings?.addToGallery) {
        await addCoverToGallery(blueprint, coverImageUrl, blueprint.metadata?.coverPrompt);
    }
}
```

### 3. Update `generateCoverIfNeeded()` Return Type

**Location**: `lib/blueprint-integration.js` (lines 104-113)

**Current**: Returns image element or null
**Needed**: Returns URL string or null

**Fix**:

```javascript
async function generateCoverIfNeeded(blueprint, shouldGenerate) {
    if (!shouldGenerate) return null;

    try {
        const imageUrl = await generateCoverImage(blueprint);
        return imageUrl; // Return URL string
    } catch (error) {
        console.warn('[BlueprintIntegration] Cover generation failed:', error);
        return null;
    }
}
```

### 4. Add Auto-Generation to Blueprint Generation Flow

**Location**: `index.js` (after line 837, after blueprint is saved to state)

**Implementation**: Use the existing `createBlueprint()` function:

```javascript
// Check if auto-generate cover is enabled
const coverGenSettings = extension_settings[MODULE_NAME]?.blueprintSettings?.coverGeneration;
if (coverGenSettings?.autoGenerate && result.blueprint) {
    try {
        console.log('[Story Mode] Auto-generating cover for new blueprint...');
        
        // Use existing createBlueprint function with auto-generation flag
        const updatedBlueprint = await createBlueprint(result.blueprint, { 
            generateCover: true,
            saveToLibrary: false // We don't want to save to library automatically
        });
        
        // Update blueprint state with any changes (like cover URL)
        blueprintState.blueprint = updatedBlueprint;
        await BlueprintModule.saveBlueprintState(blueprintState);
        
        console.log('[Story Mode] Auto-generated cover saved');
        toastr.success('Cover auto-generated for new blueprint');
    } catch (error) {
        console.warn('[Story Mode] Auto cover generation failed:', error);
        // Don't fail the whole blueprint generation for cover issues
        toastr.warning('Blueprint created, but auto cover generation failed');
    }
}
```

### 5. Add Missing Imports

**Location**: `index.js` (add with other blueprint-integration imports)

**Add**: `createBlueprint` is already imported, but need to ensure `SlashCommandParser` and `buildSDPrompt` are available in blueprint-storage.js.

**Location**: `lib/blueprint-storage.js` (add imports at top)

**Add**:
```javascript
import { buildSDPrompt } from './blueprint-editor.js';
import { SlashCommandParser, extension_settings } from '/script.js';
import { generateCoverPrompt } from './blueprint-storage.js'; // Self-reference for existing function
import { addCoverToGallery } from './blueprint-editor.js';
import { MODULE_NAME } from './blueprint-module.js';
```

### 6. Update Blueprint Cover Handling Functions

**Location**: `lib/blueprint-storage.js` (update docstring and return type)

**Change**:
```javascript
/**
 * Generate a cover image using an AI image generation service
 *
 * @param {Object} blueprint - Blueprint object
 * @param {Object} options - Generation options
 * @returns {Promise<string>} Generated cover image URL
 */
export async function generateCoverImage(blueprint, options = {}) {
    // Implementation...
}
```

## Benefits of This Approach

1. **✅ Maximum code reuse** - Uses existing `createBlueprint()` infrastructure
2. **✅ Proper separation of concerns** - Logic stays in appropriate modules
3. **✅ Consistent patterns** - Follows existing cover generation patterns
4. **✅ Error handling** - Inherits existing error handling and user feedback
5. **✅ Settings integration** - Automatically respects `addToGallery` setting
6. **✅ Future-proof** - Works with both legacy (`coverImageUrl`) and gallery systems

## Files to Modify

| File | Changes |
|------|---------|
| `lib/blueprint-storage.js` | Implement `generateCoverImage()` (replace stub) |
| `lib/blueprint-integration.js` | Fix `createBlueprint()` to handle URLs and gallery |
| `index.js` | Add auto-generation call after blueprint save |
| `lib/blueprint-storage.js` | Add missing imports |

## Testing Strategy

1. **Auto-generation disabled** → No cover generated (baseline)
2. **Auto-generation enabled + SD configured** → Cover generated and saved to both `coverImageUrl` and gallery
3. **Auto-generation enabled + SD not configured** → Graceful error, blueprint still created
4. **Auto-generation enabled + addToGallery false** → Cover only set as primary URL
5. **Manual generation** → Still works as before
6. **Blueprint export/import** → Covers properly preserved

## Edge Cases Handled

1. **SD extension not initialized** → Clear error message, don't fail blueprint
2. **No cover prompt** → Auto-generate using `generateCoverPrompt()`
3. **SD generation fails** → Graceful warning, blueprint still created
4. **Gallery full** → Respect `maxGallerySize` setting via `addCoverToGallery()`
5. **Invalid image URL** → SD extension handles validation

## Implementation Order

1. Implement `generateCoverImage()` in blueprint-storage.js
2. Fix `createBlueprint()` to handle URLs correctly  
3. Add auto-generation call in index.js
4. Test with different settings combinations
5. Verify error handling works correctly

This approach leverages the existing infrastructure and minimizes code duplication while providing a robust solution that integrates seamlessly with the current blueprint system.