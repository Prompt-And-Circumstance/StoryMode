/**
 * Blueprint PNG Encoder - Extended Format
 *
 * Encodes blueprint PNGs with embedded:
 * - Full blueprint JSON
 * - Character card data (PNG as data URL)
 * - Persona data (avatar as data URL)
 * - Cover gallery (all covers)
 * - Story type and author style definitions
 */

import {
    PNG_SIGNATURE, encodeITxtChunk, encodeTextChunk,
    insertMetadataChunks
} from './chunk-handler.js';
import { generateUUID } from '../blueprint/utils.js';

// Extended schema version
const EXTENDED_SCHEMA_VERSION = '2.0.0';

// Metadata chunk keywords
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
 * Encode blueprint with embedded resources as PNG
 * @param {Object} blueprint - Blueprint with embeddedResources
 * @param {HTMLCanvasElement|string} coverImage - Primary cover
 * @returns {Promise<Blob>} PNG blob
 */
export async function encodeExtendedBlueprintPNG(blueprint, coverImage) {
    // Get base PNG from cover image
    const basePNG = await getBasePNG(coverImage);

    // Build metadata chunks (collect promises for async chunks)
    const chunks = [];
    const asyncChunkPromises = [];

    // Version chunk (sync)
    chunks.push(encodeTextChunk(ExtendedKeyword.VERSION, EXTENDED_SCHEMA_VERSION));

    // Blueprint data chunk (async - compressed)
    const { coverImageUrl, ...blueprintForExport } = blueprint;
    const blueprintJSON = JSON.stringify(blueprintForExport);
    asyncChunkPromises.push(encodeITxtChunk(ExtendedKeyword.BLUEPRINT, blueprintJSON));

    // Embedded resources (if present)
    if (blueprint.embeddedResources) {
        const res = blueprint.embeddedResources;

        if (res.characters && res.characters.length > 0) {
            asyncChunkPromises.push(encodeITxtChunk(ExtendedKeyword.CHARACTERS, JSON.stringify(res.characters)));
        }

        if (res.personas && res.personas.length > 0) {
            asyncChunkPromises.push(encodeITxtChunk(ExtendedKeyword.PERSONAS, JSON.stringify(res.personas)));
        }

        if (res.storyType) {
            asyncChunkPromises.push(encodeITxtChunk(ExtendedKeyword.STORY_TYPE, JSON.stringify(res.storyType)));
        }

        if (res.authorStyle) {
            asyncChunkPromises.push(encodeITxtChunk(ExtendedKeyword.AUTHOR_STYLE, JSON.stringify(res.authorStyle)));
        }

        if (res.coverGallery && res.coverGallery.length > 0) {
            asyncChunkPromises.push(encodeITxtChunk(ExtendedKeyword.COVER_GALLERY, JSON.stringify(res.coverGallery)));
        }
    }

    // Manifest chunk (sync)
    const manifest = buildResourceManifest(blueprint);
    chunks.push(encodeTextChunk(ExtendedKeyword.MANIFEST, JSON.stringify(manifest)));

    // Await all async chunks and combine with sync chunks
    const asyncChunks = await Promise.all(asyncChunkPromises);
    const allChunks = [...chunks, ...asyncChunks];

    // Insert chunks into PNG
    const finalPNG = insertMetadataChunks(basePNG, allChunks);

    return new Blob([finalPNG], { type: 'image/png' });
}

/**
 * Build resource manifest
 * @param {Object} blueprint
 * @returns {Object} Manifest
 */
function buildResourceManifest(blueprint) {
    const res = blueprint.embeddedResources || {};
    return {
        version: EXTENDED_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        resources: {
            characters: res.characters?.length || 0,
            personas: res.personas?.length || 0,
            covers: res.coverGallery?.length || 0,
            storyType: !!res.storyType,
            authorStyle: !!res.authorStyle
        }
    };
}

/**
 * Get base PNG from cover image
 * @param {HTMLCanvasElement|string} coverImage
 * @returns {Promise<Uint8Array>}
 */
async function getBasePNG(coverImage) {
    if (coverImage instanceof HTMLCanvasElement) {
        const blob = await new Promise(resolve => coverImage.toBlob(resolve, 'image/png'));
        return new Uint8Array(await blob.arrayBuffer());
    } else if (typeof coverImage === 'string') {
        // Data URL
        const response = await fetch(coverImage);
        return new Uint8Array(await response.arrayBuffer());
    } else {
        throw new Error('Invalid cover image type');
    }
}
