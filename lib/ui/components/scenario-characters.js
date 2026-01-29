/**
 * Scenario Characters Module
 * Displays blueprint characters with embedded/linked status and library import
 */

import {
    findCharacterByName,
    findPersonaByName,
    getAllPersonas,
} from '../../blueprint/characters/linker.js';
import { normalizeCharacterName, isDelinked } from '../../blueprint/utils.js';

// ============================================================================
// SHARED STATUS DETECTION LOGIC
// ============================================================================

/**
 * Generic resource status detector for characters and personas
 * @param {Object} blueprint - Blueprint object
 * @param {Object} config - Configuration for resource type
 * @param {Function} config.collectNames - Function to collect all resource names
 * @param {Function} config.getEmbeddedResources - Function to get embedded resource list
 * @param {Function} config.findInLibrary - Function to check if resource exists in library
 * @param {Function} config.canImport - Function to determine if embedded resource can be imported
 * @param {string} config.linkedKey - Property name for linked resource (e.g., 'linkedCharacter')
 * @returns {Array<{name, status, embeddedData, linked*, canImport}>}
 */
function getResourcesWithStatus(blueprint, config) {
    if (!blueprint) return [];

    const results = new Map();
    const allNames = config.collectNames(blueprint);
    if (allNames.length === 0) return [];

    // Build embedded resource lookup map
    const embeddedMap = new Map();
    const embeddedResources = config.getEmbeddedResources(blueprint);
    if (embeddedResources) {
        embeddedResources.forEach(resource => {
            embeddedMap.set(normalizeCharacterName(resource.name), resource);
        });
    }

    // Determine status for each resource
    for (const name of allNames) {
        const normalized = normalizeCharacterName(name);
        const embedded = embeddedMap.get(normalized);
        const inLibrary = config.findInLibrary(name);

        const statusObj = { name, embeddedData: embedded || null };

        if (inLibrary) {
            statusObj.status = 'linked';
            statusObj[config.linkedKey] = inLibrary;
            statusObj.canImport = false;
        } else if (embedded) {
            statusObj.status = 'embedded';
            statusObj[config.linkedKey] = null;
            statusObj.canImport = config.canImport(embedded);
        } else {
            statusObj.status = 'missing';
            statusObj[config.linkedKey] = null;
            statusObj.canImport = false;
        }

        results.set(normalized, statusObj);
    }

    return Array.from(results.values());
}

// ============================================================================
// CHARACTER STATUS DETECTION
// ============================================================================

/**
 * Collect known persona names from blueprint AND the user's local persona library.
 * This ensures personas referenced in character_arcs are correctly categorized
 * even when not explicitly listed in selectedPersonas/personaData.
 * @param {Object} blueprint
 * @returns {Set<string>} Normalized persona names
 */
function getKnownPersonaNames(blueprint) {
    const names = new Set();
    // From blueprint persona selections
    for (const p of (blueprint.selectedPersonas || blueprint.personaData || [])) {
        const n = typeof p === 'string' ? p : p?.name;
        if (n) names.add(normalizeCharacterName(n));
    }
    // From embedded persona data
    for (const p of (blueprint.embeddedResources?.personas || [])) {
        if (p.name) names.add(normalizeCharacterName(p.name));
    }
    // From user's local persona library (catches personas added directly to arcs)
    for (const p of getAllPersonas()) {
        if (p.name) names.add(normalizeCharacterName(p.name));
    }
    return names;
}

/**
 * Get all characters from blueprint with their status
 * Combines embedded resources, character arcs, and scene focus.
 * Excludes names that are known personas.
 * @param {Object} blueprint - Blueprint object
 * @returns {Array<{name, status, embeddedData, linkedCharacter, canImport}>}
 */
export function getBlueprintCharactersWithStatus(blueprint) {
    const personaNames = getKnownPersonaNames(blueprint);
    return getResourcesWithStatus(blueprint, {
        collectNames: (bp) => {
            const arcNames = (bp.character_arcs || [])
                .map(arc => arc.character_name)
                .filter(Boolean);
            const focusNames = (bp.scene_plan || [])
                .flatMap(scene => (scene.character_focus || []).map(cf => cf.name))
                .filter(Boolean);
            return [...new Set([...arcNames, ...focusNames])]
                .filter(n => !personaNames.has(normalizeCharacterName(n)))
                .filter(n => !isDelinked(bp, n));
        },
        getEmbeddedResources: (bp) => bp.embeddedResources?.characters,
        findInLibrary: findCharacterByName,
        canImport: (embedded) => !!embedded.pngDataUrl,
        linkedKey: 'linkedCharacter',
    });
}

// ============================================================================
// PERSONA STATUS DETECTION
// ============================================================================

/**
 * Get all personas from blueprint with their status
 * Sources names from selectedPersonas, personaData, and embeddedResources.personas
 * @param {Object} blueprint - Blueprint object
 * @returns {Array<{name, status, embeddedData, linkedPersona, canImport}>}
 */
export function getBlueprintPersonasWithStatus(blueprint) {
    const localPersonaNames = new Set(
        getAllPersonas().map(p => normalizeCharacterName(p.name))
    );
    return getResourcesWithStatus(blueprint, {
        collectNames: (bp) => {
            // selectedPersonas may be strings or {id, name} objects (wizard stores as personaData)
            const fromSelected = (bp.selectedPersonas || bp.personaData || [])
                .map(p => typeof p === 'string' ? p : p?.name)
                .filter(Boolean);
            const fromEmbedded = (bp.embeddedResources?.personas || [])
                .map(p => p.name)
                .filter(Boolean);
            // Also collect arc names that match local personas (handles personas
            // added directly to character_arcs without being in selectedPersonas)
            const fromArcs = (bp.character_arcs || [])
                .map(arc => arc.character_name)
                .filter(n => n && localPersonaNames.has(normalizeCharacterName(n)));
            return [...new Set([...fromSelected, ...fromEmbedded, ...fromArcs])]
                .filter(n => !isDelinked(bp, n));
        },
        getEmbeddedResources: (bp) => bp.embeddedResources?.personas,
        findInLibrary: findPersonaByName,
        canImport: (embedded) => !!embedded.avatarDataUrl,
        linkedKey: 'linkedPersona',
    });
}

// ============================================================================
// UI DISPLAY (re-exported from scenario-characters-popup.js)
// ============================================================================

/**
 * Get summary counts for controller panel display (characters and personas)
 * @param {Object} blueprint - Blueprint object
 * @returns {{characters: {total, embedded, linked, missing}, personas: {total, embedded, linked, missing}}}
 */
export function getResourceSummaryCounts(blueprint) {
    const characters = getBlueprintCharactersWithStatus(blueprint);
    const personas = getBlueprintPersonasWithStatus(blueprint);

    const countByStatus = (items) => ({
        total: items.length,
        embedded: items.filter(c => c.status === 'embedded').length,
        linked: items.filter(c => c.status === 'linked').length,
        missing: items.filter(c => c.status === 'missing').length,
    });

    return {
        characters: countByStatus(characters),
        personas: countByStatus(personas),
    };
}

/**
 * @deprecated Use getResourceSummaryCounts instead
 */
export function getCharacterSummaryCounts(blueprint) {
    return getResourceSummaryCounts(blueprint).characters;
}

// Re-export showScenarioCharactersPopup from scenario-characters-popup.js
export { showScenarioCharactersPopup } from './scenario-characters-popup.js';
