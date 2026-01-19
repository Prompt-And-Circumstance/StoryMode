/**
 * Blueprint Import Module
 *
 * Orchestrates import process:
 * 1. Decode PNG
 * 2. Detect missing resources
 * 3. Show import preview
 * 4. Import selected resources
 * 5. Handle conflicts
 */

import { decodeExtendedBlueprintPNG, isExtendedFormat, validateExtendedData } from './blueprint-png-decoder.js';
import { decodeBlueprintFromPNG } from './blueprint-storage.js';
import {
    linkBlueprintCharacters,
    findCharacterByName,
    findPersonaByName,
    importCharacterCard,
    importPersona
} from './blueprint-character-linker.js';
import {
    showImportPreviewDialog,
    showConflictResolutionDialog,
    showImportResultDialog
} from './blueprint-import-ui.js';
import { validateResourceSizes, formatBytes } from './blueprint-utils.js';

// Size limits
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_RESOURCE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Import blueprint from PNG file
 * @param {File} file - PNG file
 * @param {Object} options - {autoImportMissing: boolean}
 * @returns {Promise<Object>} {success, blueprint, importedResources}
 */
export async function importBlueprintFromPNG(file, options = {}) {

    try {
        // Validate file size first
        if (file.size > MAX_FILE_SIZE) {
            return {
                success: false,
                error: `File too large (${formatBytes(file.size)}). Maximum is ${formatBytes(MAX_FILE_SIZE)}.`
            };
        }

        // Decode PNG
        const arrayBuffer = await file.arrayBuffer();
        const blueprint = await decodeExtendedBlueprintPNG(arrayBuffer);

        // Validate
        const validation = validateExtendedData(blueprint);
        if (!validation.valid) {
            throw new Error(`Invalid blueprint: ${validation.errors.join(', ')}`);
        }

        // Validate embedded resource sizes
        if (blueprint.embeddedResources) {
            const charValidation = validateResourceSizes(
                blueprint.embeddedResources.characters,
                'Character',
                'pngDataUrl',
                MAX_RESOURCE_SIZE
            );
            if (!charValidation.valid) {
                return { success: false, error: charValidation.error };
            }

            const personaValidation = validateResourceSizes(
                blueprint.embeddedResources.personas,
                'Persona',
                'avatarDataUrl',
                MAX_RESOURCE_SIZE
            );
            if (!personaValidation.valid) {
                return { success: false, error: personaValidation.error };
            }
        }

        // Detect missing resources
        const missingInfo = detectMissingResources(blueprint);

        // If auto-import or user confirms, import resources
        let importedResources = { characters: [], personas: [] };

        if (options.autoImportMissing || await promptForImport(blueprint, missingInfo)) {
            importedResources = await importMissingResources(blueprint, missingInfo);
        }

        console.log('[Story Mode] Blueprint imported successfully');
        return {
            success: true,
            blueprint: blueprint,
            importedResources: importedResources
        };

    } catch (error) {
        console.error('[Story Mode] Import failed:', error);
        return {
            success: false,
            error: error.message
        };
    } finally {
    }
}

/**
 * Detect missing resources
 * @param {Object} blueprint
 * @returns {Object} {characters: [], personas: [], conflicts: []}
 */
export function detectMissingResources(blueprint) {
    const missing = {
        characters: [],
        personas: [],
        conflicts: []
    };

    if (!blueprint.embeddedResources) {
        return missing;
    }

    // Check characters
    if (blueprint.embeddedResources.characters) {
        blueprint.embeddedResources.characters.forEach(char => {
            const existing = findCharacterByName(char.name);
            if (existing) {
                missing.conflicts.push({
                    type: 'character',
                    name: char.name,
                    existing: existing,
                    imported: char
                });
            } else {
                missing.characters.push(char.name);
            }
        });
    }

    // Check personas
    if (blueprint.embeddedResources.personas) {
        blueprint.embeddedResources.personas.forEach(persona => {
            const existing = findPersonaByName(persona.name);
            if (existing) {
                missing.conflicts.push({
                    type: 'persona',
                    name: persona.name,
                    existing: existing,
                    imported: persona
                });
            } else {
                missing.personas.push(persona.name);
            }
        });
    }

    return missing;
}

/**
 * Prompt user for import confirmation
 * @param {Object} blueprint
 * @param {Object} missingInfo
 * @returns {Promise<boolean>}
 */
async function promptForImport(blueprint, missingInfo) {
    if (missingInfo.characters.length === 0 && missingInfo.personas.length === 0) {
        return false; // Nothing to import
    }

    const selection = await showImportPreviewDialog(
        blueprint.embeddedResources,
        missingInfo
    );

    return selection !== null;
}

/**
 * Import resources with error handling and rate limiting
 * @param {Array} resources - Resources to import
 * @param {Function} importFn - Import function (returns {success, error?})
 * @param {Set<string>} skipped - Names to skip
 * @param {string} resourceType - Type name for logging
 * @returns {Promise<Object>} {imported: [], failed: []}
 */
async function importResourceLoop(resources, importFn, skipped, resourceType) {
    const result = { imported: [], failed: [] };
    const total = resources.length;

    for (let i = 0; i < total; i++) {
        const resource = resources[i];

        if (skipped.has(resource.name)) {
            continue;
        }

        try {
            const importResult = await importFn(resource);
            if (importResult.success) {
                result.imported.push(resource.name);
            } else {
                result.failed.push({ name: resource.name, error: importResult.error });
            }
        } catch (error) {
            result.failed.push({ name: resource.name, error: error.message });
        }

        // Rate limiting: 500ms delay between imports (except last)
        if (i < total - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    return result;
}

/**
 * Import missing resources
 * @param {Object} blueprint
 * @param {Object} missingInfo
 * @returns {Promise<Object>} {characters: [], personas: []}
 */
async function importMissingResources(blueprint, missingInfo) {
    const result = {
        imported: [],
        skipped: [],
        failed: []
    };
    const skippedSet = new Set();

    // Handle conflicts first
    if (missingInfo.conflicts.length > 0) {
        const decisions = await showConflictResolutionDialog(missingInfo.conflicts);

        // Apply conflict resolutions
        for (const [name, decision] of Object.entries(decisions)) {
            if (decision === 'skip' || decision === 'keep') {
                result.skipped.push(name);
                skippedSet.add(name);
            }
            // Handle replace and rename in import loop below
        }
    }

    // Import characters using helper
    if (blueprint.embeddedResources.characters) {
        const charResult = await importResourceLoop(
            blueprint.embeddedResources.characters,
            (char) => importCharacterCard(char.pngDataUrl, char.name),
            skippedSet,
            'character'
        );
        result.imported.push(...charResult.imported);
        result.failed.push(...charResult.failed);
    }

    // Import personas using helper
    if (blueprint.embeddedResources.personas) {
        const personaResult = await importResourceLoop(
            blueprint.embeddedResources.personas,
            importPersona,
            skippedSet,
            'persona'
        );
        result.imported.push(...personaResult.imported);
        result.failed.push(...personaResult.failed);
    }

    // Show result summary
    await showImportResultDialog(result);

    return result;
}

/**
 * Import story type if missing
 * @param {Object} storyType
 * @returns {Promise<boolean>}
 */
export async function importStoryTypeIfMissing(storyType) {
    const { getStoryTypes, setStoryTypes } = await import('./state-manager.js');
    const existing = getStoryTypes();

    if (existing.find(st => st.id === storyType.id)) {
        return false; // Already exists
    }

    existing.push(storyType);
    setStoryTypes(existing);
    return true;
}

/**
 * Import author style if missing
 * @param {Object} authorStyle
 * @returns {Promise<boolean>}
 */
export async function importAuthorStyleIfMissing(authorStyle) {
    const { getAuthorStyles, setAuthorStyles } = await import('./state-manager.js');
    const existing = getAuthorStyles();

    if (existing.find(as => as.id === authorStyle.id)) {
        return false; // Already exists
    }

    existing.push(authorStyle);
    setAuthorStyles(existing);
    return true;
}
