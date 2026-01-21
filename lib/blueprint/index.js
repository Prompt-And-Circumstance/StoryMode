/**
 * @file Blueprint module public API
 * @module blueprint
 * @version 2.0.0
 */

// Validation & Normalization (existing)
export { validateBlueprint, parseBlueprintResponse } from './validation.js';
export { normalizeBlueprint, normalizeCharacterOutcomes, initNormalization } from './normalization.js';
export { resolvePlaceholders, checkPrerequisites } from './placeholders.js';

// Schema
export { BLUEPRINT_FIELDS, DROPDOWN_OPTIONS } from './schema.js';

// Storage (PNG encode/decode, chat persistence)
export {
    getBlueprintState,
    saveBlueprintState,
    generateCoverPrompt,
    decodeBlueprintFromPNG,
} from './storage.js';

// Utils
export {
    generateUUID,
    robustParseJSON,
    escapeHtml,
    getBlueprintCoverUrl,
    validateOpeningMessage,
} from './utils.js';

// Integration (library facade)
export { getLibrary, flushPendingManifestSave } from './integration.js';

// Import/Export
export { importBlueprintFromPNG } from './import.js';
export { exportBlueprintAsPNG } from './export.js';

// Characters
export { getCurrentChatCharacters, getAllPersonas } from './characters/linker.js';

// Migration (for manual triggering from settings if needed)
export { checkMigrationNeeded, promptAndMigrate } from './migration.js';
