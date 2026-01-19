/**
 * Blueprint PNG Decoder - Extended Format
 *
 * Decodes blueprint PNGs with embedded resources.
 */

import {
    extractMetadataFromPNG, verifyPNGSignature
} from './chunk-handler.js';
import { safeParseWithLimit, setNestedValue } from '../blueprint/utils.js';

const ExtendedKeyword = {
    BLUEPRINT: 'Blueprint',
    CHARACTERS: 'Characters',
    PERSONAS: 'Personas',
    COVER_GALLERY: 'CoverGallery',
    STORY_TYPE: 'StoryType',
    AUTHOR_STYLE: 'AuthorStyle',
    VERSION: 'Version',
    MANIFEST: 'Manifest',
};

/**
 * Parse optional metadata chunk into blueprint
 * @param {Object} metadata - Extracted PNG metadata
 * @param {string} keyword - Chunk keyword
 * @param {string} targetPath - Dot-notation path for result
 * @param {Object} blueprint - Blueprint to mutate
 */
function parseOptionalChunk(metadata, keyword, targetPath, blueprint) {
    if (metadata[keyword]) {
        setNestedValue(blueprint, targetPath, safeParseWithLimit(metadata[keyword], 500));
    }
}

/**
 * Decode extended blueprint PNG
 * @param {Blob|File|ArrayBuffer} pngData
 * @returns {Promise<Object>} Decoded blueprint
 */
export async function decodeExtendedBlueprintPNG(pngData) {
    // Convert to ArrayBuffer if needed
    let arrayBuffer;
    if (pngData instanceof Blob || pngData instanceof File) {
        arrayBuffer = await pngData.arrayBuffer();
    } else {
        arrayBuffer = pngData;
    }

    // Verify PNG signature
    if (!verifyPNGSignature(arrayBuffer)) {
        throw new Error('Invalid PNG file');
    }

    // Extract metadata
    const metadata = extractMetadataFromPNG(arrayBuffer);

    // Check if extended format
    if (!isExtendedFormat(metadata)) {
        throw new Error('PNG does not contain extended blueprint data');
    }

    // Decode blueprint using safe parser
    const blueprint = safeParseWithLimit(metadata[ExtendedKeyword.BLUEPRINT], 500);

    // Parse optional chunks using helper
    parseOptionalChunk(metadata, ExtendedKeyword.CHARACTERS, 'embeddedResources.characters', blueprint);
    parseOptionalChunk(metadata, ExtendedKeyword.PERSONAS, 'embeddedResources.personas', blueprint);
    parseOptionalChunk(metadata, ExtendedKeyword.COVER_GALLERY, 'embeddedResources.coverGallery', blueprint);
    parseOptionalChunk(metadata, ExtendedKeyword.STORY_TYPE, 'embeddedResources.storyType', blueprint);
    parseOptionalChunk(metadata, ExtendedKeyword.AUTHOR_STYLE, 'embeddedResources.authorStyle', blueprint);
    parseOptionalChunk(metadata, ExtendedKeyword.MANIFEST, 'exportMetadata', blueprint);

    return blueprint;
}

/**
 * Check if PNG uses extended format
 * @param {Object} metadata
 * @returns {boolean}
 */
export function isExtendedFormat(metadata) {
    return !!metadata[ExtendedKeyword.VERSION] && !!metadata[ExtendedKeyword.BLUEPRINT];
}

/**
 * Validate extended data integrity (SEC-006)
 * @param {Object} decoded
 * @returns {Object} {valid: boolean, errors: string[]}
 */
export function validateExtendedData(decoded) {
    const errors = [];

    // Validate required top-level fields
    if (!decoded.story_type_id || typeof decoded.story_type_id !== 'string') {
        errors.push('Missing or invalid story_type_id');
    }

    if (!decoded.core_premise || typeof decoded.core_premise !== 'string') {
        errors.push('Missing or invalid core_premise');
    }

    // Validate setting structure
    if (decoded.setting && typeof decoded.setting !== 'object') {
        errors.push('Invalid setting: must be an object');
    }

    // Validate protagonist_group structure
    if (decoded.protagonist_group && typeof decoded.protagonist_group !== 'object') {
        errors.push('Invalid protagonist_group: must be an object');
    }

    // Validate scene_plan is an array
    if (decoded.scene_plan && !Array.isArray(decoded.scene_plan)) {
        errors.push('Invalid scene_plan: must be an array');
    }

    // Validate character_arcs is an array
    if (decoded.character_arcs && !Array.isArray(decoded.character_arcs)) {
        errors.push('Invalid character_arcs: must be an array');
    }

    // Validate embedded resources
    if (decoded.embeddedResources) {
        const res = decoded.embeddedResources;

        // Validate characters
        if (res.characters) {
            if (!Array.isArray(res.characters)) {
                errors.push('Invalid embeddedResources.characters: must be an array');
            } else {
                res.characters.forEach((char, i) => {
                    if (!char.name || typeof char.name !== 'string') {
                        errors.push(`Character ${i}: missing or invalid name`);
                    }
                    if (!char.pngDataUrl || typeof char.pngDataUrl !== 'string') {
                        errors.push(`Character ${i}: missing or invalid pngDataUrl`);
                    }
                });
            }
        }

        // Validate personas
        if (res.personas) {
            if (!Array.isArray(res.personas)) {
                errors.push('Invalid embeddedResources.personas: must be an array');
            } else {
                res.personas.forEach((persona, i) => {
                    if (!persona.name || typeof persona.name !== 'string') {
                        errors.push(`Persona ${i}: missing or invalid name`);
                    }
                    if (!persona.avatarDataUrl || typeof persona.avatarDataUrl !== 'string') {
                        errors.push(`Persona ${i}: missing or invalid avatarDataUrl`);
                    }
                });
            }
        }

        // Validate cover gallery
        if (res.coverGallery) {
            if (!Array.isArray(res.coverGallery)) {
                errors.push('Invalid embeddedResources.coverGallery: must be an array');
            }
        }

        // Validate story type
        if (res.storyType && typeof res.storyType !== 'object') {
            errors.push('Invalid embeddedResources.storyType: must be an object');
        }

        // Validate author style
        if (res.authorStyle && typeof res.authorStyle !== 'object') {
            errors.push('Invalid embeddedResources.authorStyle: must be an object');
        }
    }

    return {
        valid: errors.length === 0,
        errors: errors
    };
}
