/**
 * @file Blueprint module public API
 * @module blueprint
 */

// Validation & Normalization (existing)
export { validateBlueprint, parseBlueprintResponse } from './validation.js';
export { normalizeBlueprint, normalizeCharacterOutcomes, initNormalization } from './normalization.js';
export { resolvePlaceholders, checkPrerequisites } from './placeholders.js';

// Schema
export { BLUEPRINT_FIELDS, DROPDOWN_OPTIONS } from './schema.js';

// Storage
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

// Integration
export { getLibrary } from './integration.js';

// Import/Export
export { importBlueprintFromFile } from './import.js';
export { exportBlueprintAsPNG } from './export.js';

// Characters
export { getCurrentChatCharacters, getAllPersonas } from './characters/linker.js';
