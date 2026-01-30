/**
 * Blueprint Storage Module - PNG-Based File Format
 *
 * Stores story blueprints as PNG files containing:
 * - Visual cover image (generated thumbnail)
 * - Embedded metadata (full blueprint JSON in PNG text chunks)
 * - Cover generation prompt
 * - Thumbnail-friendly display
 * - Drag-and-drop import support
 *
 * @module blueprint-storage
 * @version 1.0.0
 */

// ============================================================================
// IMPORTS
// ============================================================================

import {
    generateUUID,
    escapeHtml,
    truncateText,
    sanitizeFilename,
    fileToDataURL,
    loadImage,
    downloadBlob,
    toBytes,
    safeParseJSON,
    blobToDataURL,
} from './utils.js';

import {
    PNG_SIGNATURE,
    ChunkType,
    writeUInt32BE,
    readUInt32BE,
    calculateCRC32,
    compressData,
    decompressData,
    encodeChunk,
    encodeTextChunk,
    encodeITxtChunk,
    encodeIHDRChunk,
    decodeChunk,
    decodeTextChunk,
    decodeITxtChunk,
    verifyPNGSignature,
    extractMetadataFromPNG,
    insertMetadataChunks,
    replaceMetadataChunks,
} from '../png/chunk-handler.js';

import { getContext } from '/scripts/extensions.js';
import { saveMetadata } from '/script.js';
import { getCurrentSceneIndex } from '../core/state-manager.js';
import { MODULE_NAME } from '../core/index.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Default cover dimensions (2:3 aspect ratio, matches character cards) */
const DEFAULT_COVER_WIDTH = 600;
const DEFAULT_COVER_HEIGHT = 900;

/** Current schema version */
const SCHEMA_VERSION = '1.0.0';

// SEC-006: PNG decode protection limits
/** Maximum PNG file size for decode (50MB) */
const MAX_PNG_DECODE_SIZE = 50 * 1024 * 1024;
/** Maximum time for PNG decode operation (30 seconds) */
const MAX_DECODE_TIMEOUT_MS = 30000;

/** Metadata chunk keywords */
const MetadataKeyword = {
    BLUEPRINT: 'Blueprint',
    TITLE: 'Title',
    STORY_TYPE: 'StoryType',
    AUTHOR: 'Author',
    VERSION: 'Version',
    COVER_PROMPT: 'CoverPrompt',
    COVER_MODEL: 'CoverModel',
    COVER_GALLERY: 'CoverGallery',
    CREATED: 'Created',
    UUID: 'UUID',
    COVER_SEED: 'CoverSeed',
};

// ============================================================================
// COVER PROMPT GENERATION
// ============================================================================

/**
 * Genre-to-style mappings for cover generation
 */
const GENRE_STYLES = {
    'horror': {
        art: 'gothic horror digital art, dark fantasy style',
        colors: 'deep blues, purples, with stark contrast highlights',
        elements: ['gothic architecture', 'shadows', 'fog', 'moonlight', 'ominous atmosphere'],
    },
    'fantasy': {
        art: 'epic fantasy illustration, concept art style',
        colors: 'rich magical colors, golden light, deep shadows',
        elements: ['magical glow', 'floating particles', 'ancient ruins', 'mystical light'],
    },
    'mystery': {
        art: 'film noir style, dramatic chiaroscuro',
        colors: 'high contrast black and white with key color accents',
        elements: ['detective elements', 'clues scattered', 'shadows', 'dramatic lighting'],
    },
    'sci-fi': {
        art: 'cyberpunk or sci-fi concept art',
        colors: 'neon blues, purples, with deep black shadows',
        elements: ['futuristic elements', 'neon lights', 'technology', 'stars'],
    },
    'science fiction': {
        art: 'cyberpunk or sci-fi concept art',
        colors: 'neon blues, purples, with deep black shadows',
        elements: ['futuristic elements', 'neon lights', 'technology', 'stars'],
    },
    'romance': {
        art: 'romantic digital painting, soft brush style',
        colors: 'warm pinks, golds, with soft pastel tones',
        elements: ['soft lighting', 'warm colors', 'intimate atmosphere', 'flowers'],
    },
    'adventure': {
        art: 'epic cinematic concept art',
        colors: 'vibrant natural colors, dramatic sky lighting',
        elements: ['epic landscape', 'dramatic sky', 'journey', 'distant destination'],
    },
    'western': {
        art: 'classic western illustration style',
        colors: 'warm earth tones, deep oranges, dramatic sunset',
        elements: ['western landscape', 'dust', 'horses', 'frontier'],
    },
    'historical': {
        art: 'period-accurate historical painting style',
        colors: 'rich historical tones, period-appropriate palette',
        elements: ['period architecture', 'historical costumes', 'antique objects'],
    },
    'thriller': {
        art: 'tense dramatic style, high contrast',
        colors: 'high contrast, deep shadows with sharp highlights',
        elements: ['tense atmosphere', 'shadows', 'high contrast', 'dramatic angles'],
    },
    'comedy': {
        art: 'vibrant animated style, warm colors',
        colors: 'bright, cheerful colors with warm highlights',
        elements: ['bright colors', 'lively atmosphere', 'dynamic composition'],
    },
};

const MOOD_OVERRIDES = {
    'dark': { art: 'dark fantasy art, grim style', colors: 'deep blues, purples, with contrast highlights' },
    'light': { art: 'bright, optimistic illustration style', colors: 'warm golds, oranges, with soft shadows' },
    'ominous': { colors: 'deep blues, purples, with contrast highlights' },
    'eerie': { colors: 'deep blues, purples, with contrast highlights' },
    'warm': { colors: 'warm golds, oranges, with soft shadows' },
    'hopeful': { colors: 'warm golds, oranges, with soft shadows' },
    'uplifting': { colors: 'warm golds, oranges, with soft shadows' },
    'mysterious': { colors: 'deep purples, teals, with dramatic lighting' },
    'suspenseful': { colors: 'deep purples, teals, with dramatic lighting' },
    'cold': { colors: 'cold blues, grays, with minimal warmth' },
    'bleak': { colors: 'cold blues, grays, with minimal warmth' },
};

/**
 * Determine art style based on genre and tone
 * @param {string} genre - Story genre
 * @param {Object} toneAndStyle - Tone and style object
 * @returns {string} Art style description
 */
function determineArtStyle(genre, toneAndStyle) {
    const genreLower = (genre || '').toLowerCase();
    const tone = (toneAndStyle?.primary_tone || '').toLowerCase();

    // Check mood overrides first
    for (const [mood, style] of Object.entries(MOOD_OVERRIDES)) {
        if (tone.includes(mood) && style.art) {
            return style.art;
        }
    }

    return GENRE_STYLES[genreLower]?.art || 'professional digital art, concept art style';
}

/**
 * Determine color palette based on genre and mood
 * @param {string} genre - Story genre
 * @param {string} atmosphere - Story atmosphere
 * @returns {string} Color palette description
 */
function determineColorPalette(genre, atmosphere) {
    const mood = (atmosphere || '').toLowerCase();
    const genreLower = (genre || '').toLowerCase();

    // Check mood overrides first
    for (const [moodKey, style] of Object.entries(MOOD_OVERRIDES)) {
        if (mood.includes(moodKey) && style.colors) {
            return style.colors;
        }
    }

    return GENRE_STYLES[genreLower]?.colors || 'cinematic color grading with dramatic contrast';
}

/**
 * Generate a cover image prompt based on blueprint content
 * @param {Object} blueprint - Blueprint object
 * @returns {Object} Cover prompt specification
 */
export function generateCoverPrompt(blueprint) {
    const {
        story_type_name,
        core_premise,
        setting,
        tone_and_style,
        scene_plan,
        blueprint_id,
    } = blueprint;

    const genre = (story_type_name || '').toLowerCase();
    const location = setting?.location || 'mysterious location';
    const timePeriod = setting?.time_period || 'unspecified time';
    const atmosphere = setting?.atmosphere || tone_and_style?.primary_tone || 'mysterious';

    const elements = GENRE_STYLES[genre]?.elements || ['dramatic scene', 'atmospheric lighting'];
    const artStyle = determineArtStyle(story_type_name, tone_and_style);
    const colorPalette = determineColorPalette(story_type_name, atmosphere);

    const positiveParts = [
        `A ${atmosphere} scene from a ${genre || 'story'} story`,
        `set in ${location}`,
        ...elements,
        timePeriod !== 'unspecified time' ? `${timePeriod} period` : null,
        'cinematic lighting',
        '8k detailed',
        'dramatic composition',
        'professional digital art',
    ].filter(Boolean);

    const firstScene = scene_plan?.[0];
    const sceneContext = firstScene
        ? `Scene: ${firstScene.title} - ${firstScene.situation.substring(0, 100)}`
        : '';

    return {
        positive: positiveParts.join(', '),
        negative: 'text, watermark, signature, blurry, low quality, distorted, ugly, bad anatomy, extra limbs, cropped, worst quality, low resolution',
        style: artStyle,
        composition: 'centered subject, dramatic angle, rule of thirds',
        lighting: `cinematic ${atmosphere} lighting`,
        colors: colorPalette,
        mood: atmosphere,
        elements: [...elements, location, sceneContext].filter(Boolean),
        technical: {
            aspect_ratio: '2:3',
            resolution: '600x900',
            style_strength: 0.7,
            quality: 'high',
        },
        metadata: {
            generated_from: 'blueprint',
            blueprint_id: blueprint_id || generateUUID(),
            story_type: story_type_name,
            timestamp: new Date().toISOString(),
        },
    };
}

// ============================================================================
// COVER IMAGE GENERATION
// ============================================================================

/**
 * Get gradient colors for a genre
 * @param {string} genre - Story genre
 * @returns {Array.<string>} Array of gradient color stops
 */
/**
 * Create a default cover image using the standardized blue SVG placeholder
 * @param {Object} blueprint - Blueprint object
 * @returns {Promise<HTMLCanvasElement>} Canvas element with cover
 */
async function createDefaultCover(blueprint) {
    // Use the standardized blue SVG placeholder design
    const { generatePlaceholderCover } = await import('./blank-blueprint.js');

    const title = blueprint.userMetadata?.title ||
                 blueprint.blueprint_title ||
                 blueprint.core_premise?.substring(0, 30) ||
                 'Blueprint';

    const placeholderSvg = generatePlaceholderCover(title, 'Add a cover image');

    // Convert SVG data URL to canvas
    const img = await loadImage(placeholderSvg);
    return imageToCanvas(img);
}

/**
 * Convert an image element to canvas
 * @param {HTMLImageElement} img - Image element
 * @returns {HTMLCanvasElement} Canvas element
 */
function imageToCanvas(img) {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || DEFAULT_COVER_WIDTH;
    canvas.height = img.naturalHeight || DEFAULT_COVER_HEIGHT;
    canvas.getContext('2d').drawImage(img, 0, 0);
    return canvas;
}

/**
 * Convert cover image to canvas
 * @param {HTMLImageElement|HTMLCanvasElement|string} coverImage - Cover image
 * @param {Object} blueprint - Blueprint for default cover fallback
 * @returns {Promise<HTMLCanvasElement>} Canvas element
 */
async function coverToCanvas(coverImage, blueprint) {
    if (coverImage instanceof HTMLCanvasElement) {
        return coverImage;
    }

    if (coverImage instanceof HTMLImageElement) {
        return imageToCanvas(coverImage);
    }

    if (typeof coverImage === 'string' && coverImage.startsWith('data:')) {
        const img = await loadImage(coverImage);
        return imageToCanvas(img);
    }

    // Check cover gallery first (contains persistent URLs - data:, /user/images/, or http)
    const gallery = blueprint?.metadata?.coverGallery;
    const galleryIndex = blueprint?.metadata?.coverGalleryIndex;
    if (Array.isArray(gallery) && gallery.length > 0) {
        const selectedIndex = typeof galleryIndex === 'number' ? galleryIndex : 0;
        const galleryItem = gallery[selectedIndex];
        // Accept data: URLs, server paths (/user/images/), and http(s) URLs
        if (galleryItem?.url && (
            galleryItem.url.startsWith('data:') ||
            galleryItem.url.startsWith('/') ||
            galleryItem.url.startsWith('http')
        )) {
            try {
                const img = await loadImage(galleryItem.url);
                return imageToCanvas(img);
            } catch (e) {
                console.warn('[BlueprintStorage] Failed to load cover from gallery:', e.message);
            }
        }
    }

    // Fallback: Check blueprint for existing cover URL (from SD generation or loaded file)
    const blueprintCover = blueprint?.coverImageUrl || blueprint?.metadata?.coverImageUrl;
    if (typeof blueprintCover === 'string') {
        // Handle data: URLs, blob: URLs, server paths, and http URLs
        if (blueprintCover.startsWith('data:') ||
            blueprintCover.startsWith('blob:') ||
            blueprintCover.startsWith('/') ||
            blueprintCover.startsWith('http')) {
            try {
                const img = await loadImage(blueprintCover);
                return imageToCanvas(img);
            } catch (e) {
                console.warn('[BlueprintStorage] Failed to load cover from URL:', e.message);
            }
        }
    }

    return await createDefaultCover(blueprint);
}

/**
 * Generate a cover image using an AI image generation service
 * This is a stub function that should be implemented based on the
 * available image generation service (e.g., Stable Diffusion extension)
 *
 * @param {Object} blueprint - Blueprint object
 * @param {Object} options - Generation options
 * @returns {Promise<HTMLImageElement>} Generated cover image
 */
export async function generateCoverImage(blueprint, options = {}) {
    console.warn('[BlueprintStorage] Cover image generation not yet implemented');

    const canvas = await createDefaultCover(blueprint);
    return loadImage(canvas.toDataURL('image/png'));
}

// ============================================================================
// COVER IMAGE UTILITIES
// ============================================================================

/**
 * Strip metadata chunks from PNG by round-tripping through canvas.
 * Prevents recursive size growth when blueprints are re-exported.
 * @param {Uint8Array} pngBytes - Raw PNG bytes
 * @returns {Promise<string>} Clean data URL
 */
async function createCleanCoverDataUrl(pngBytes) {
    const CHUNK_SIZE = 8192;
    let binaryStr = '';
    for (let i = 0; i < pngBytes.length; i += CHUNK_SIZE) {
        const chunk = pngBytes.subarray(i, Math.min(i + CHUNK_SIZE, pngBytes.length));
        binaryStr += String.fromCharCode.apply(null, chunk);
    }

    const dataUrl = `data:image/png;base64,${btoa(binaryStr)}`;

    try {
        const img = await loadImage(dataUrl);
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);
        return canvas.toDataURL('image/png');
    } catch (err) {
        console.warn('[BlueprintStorage] Metadata strip failed:', err.message);
        return dataUrl;
    }
}

// ============================================================================
// BLUEPRINT METADATA MANAGEMENT
// ============================================================================

/**
 * Ensure blueprint has required metadata fields
 * @param {Object} blueprint - Blueprint object
 */
async function ensureBlueprintMetadata(blueprint) {
    if (!blueprint.blueprint_id) {
        blueprint.blueprint_id = generateUUID();
    }

    blueprint.metadata = blueprint.metadata || {};
    if (!blueprint.metadata.createdAt) {
        blueprint.metadata.createdAt = new Date().toISOString();
    }
    if (!blueprint.metadata.version) {
        blueprint.metadata.version = SCHEMA_VERSION;
    }
    if (!blueprint.metadata.coverPrompt) {
        blueprint.metadata.coverPrompt = generateCoverPrompt(blueprint);
    }

    // Ensure cover gallery exists with at least a placeholder
    if (!blueprint.metadata.coverGallery || blueprint.metadata.coverGallery.length === 0) {
        // Check if blueprint has an existing cover URL (legacy format migration)
        const existingCover = blueprint.coverImageUrl || blueprint.metadata.coverImageUrl;

        if (existingCover) {
            // Migrate existing cover to gallery format
            blueprint.metadata.coverGallery = [{
                id: blueprint.blueprint_id + '-migrated',
                url: existingCover,
                prompt: blueprint.metadata.coverPrompt?.positive || 'Existing cover',
                timestamp: blueprint.metadata.createdAt || new Date().toISOString(),
                model: 'Migrated'
            }];
            blueprint.metadata.coverGalleryIndex = 0;
            blueprint.metadata.coverImageUrl = existingCover;
            blueprint.coverImageUrl = existingCover;
        } else {
            // No existing cover - create placeholder
            const { generatePlaceholderCover } = await import('./blank-blueprint.js');
            const title = blueprint.userMetadata?.title ||
                         blueprint.blueprint_title ||
                         blueprint.core_premise?.substring(0, 30) ||
                         'Blueprint';

            const placeholderSvg = generatePlaceholderCover(title, 'Add a cover image');

            blueprint.metadata.coverGallery = [{
                id: blueprint.blueprint_id + '-placeholder',
                url: placeholderSvg,
                prompt: 'Placeholder cover',
                timestamp: new Date().toISOString(),
                model: 'SVG Placeholder'
            }];
            blueprint.metadata.coverGalleryIndex = 0;
            blueprint.metadata.coverImageUrl = placeholderSvg;
            blueprint.coverImageUrl = placeholderSvg;
        }
    }
}

/**
 * Ensure blueprint has metadata object
 * @param {Object} blueprint - Blueprint object
 * @returns {Object} Metadata object
 */
function ensureMetadataObject(blueprint) {
    blueprint.metadata = blueprint.metadata || {};
    return blueprint.metadata;
}

/**
 * Process gallery images to ensure they are safe for storage (convert blobs to data URLs)
 * @param {Array} gallery - Gallery array
 * @returns {Promise<Array>} Processed gallery array
 */
async function processGalleryForStorage(gallery) {
    if (!Array.isArray(gallery)) return [];

    const processed = [];
    for (const item of gallery) {
        if (item.url && item.url.startsWith('blob:')) {
            try {
                // Convert blob URL to data URL
                const response = await fetch(item.url);
                const blob = await response.blob();
                const dataUrl = await blobToDataURL(blob);
                processed.push({ ...item, url: dataUrl });
            } catch (e) {
                console.warn('[BlueprintStorage] Failed to convert blob URL for storage, removing item:', e);
                // If conversion fails, we skip this item (it's likely an expired blob)
            }
        } else {
            processed.push(item);
        }
    }
    return processed;
}

// ============================================================================
// BLUEPRINT PNG ENCODING
// ============================================================================

/**
 * Build all metadata chunks for a blueprint
 * @param {Object} blueprint - Blueprint object
 * @returns {Promise<Uint8Array[]>} Array of metadata chunks
 */
async function buildMetadataChunks(blueprint) {
    const storageBlueprint = { ...blueprint };

    // Strip coverImageUrl to prevent recursive size growth
    delete storageBlueprint.coverImageUrl;

    // Shallow copy metadata to avoid modifying original
    if (storageBlueprint.metadata) {
        storageBlueprint.metadata = { ...storageBlueprint.metadata };
    }

    // Shallow copy creator_notes to avoid modifying original
    if (storageBlueprint.creator_notes) {
        storageBlueprint.creator_notes = { ...storageBlueprint.creator_notes };
    }

    // Process gallery to convert blob URLs to data URLs
    if (storageBlueprint.metadata?.coverGallery?.length > 0) {
        storageBlueprint.metadata.coverGallery = await processGalleryForStorage(storageBlueprint.metadata.coverGallery);
    }

    const title = storageBlueprint.userMetadata?.title || storageBlueprint.core_premise?.substring(0, 50) || 'Story Blueprint';
    // NOTE: Do NOT include encodeIHDRChunk here - the canvas-generated PNG already has
    // a valid IHDR chunk. Adding another would create a duplicate, corrupting the PNG.
    const chunks = [
        await encodeITxtChunk(MetadataKeyword.BLUEPRINT, JSON.stringify(storageBlueprint), true),
        await encodeITxtChunk(MetadataKeyword.TITLE, title, false),
        await encodeITxtChunk(MetadataKeyword.VERSION, SCHEMA_VERSION, false),
        await encodeITxtChunk(MetadataKeyword.COVER_PROMPT, JSON.stringify(storageBlueprint.metadata.coverPrompt), true),
        encodeTextChunk(MetadataKeyword.CREATED, storageBlueprint.metadata.createdAt),
        encodeTextChunk(MetadataKeyword.UUID, storageBlueprint.blueprint_id),
    ];

    // Optional metadata
    if (storageBlueprint.story_type_id) {
        chunks.push(await encodeITxtChunk(
            MetadataKeyword.STORY_TYPE,
            JSON.stringify({ id: storageBlueprint.story_type_id, name: storageBlueprint.story_type_name }),
            false
        ));
    }

    if (storageBlueprint.author_style) {
        chunks.push(await encodeITxtChunk(
            MetadataKeyword.AUTHOR,
            JSON.stringify({ id: storageBlueprint.author_style, name: storageBlueprint.author_style }),
            false
        ));
    }

    if (storageBlueprint.metadata.coverModel) {
        chunks.push(await encodeITxtChunk(
            MetadataKeyword.COVER_MODEL,
            JSON.stringify(storageBlueprint.metadata.coverModel),
            false
        ));
    }

    if (storageBlueprint.metadata.coverSeed) {
        chunks.push(encodeTextChunk(MetadataKeyword.COVER_SEED, storageBlueprint.metadata.coverSeed.toString()));
    }

    // Add cover gallery chunk (compressed due to size)
    // Include index in wrapper object to preserve selected cover
    if (storageBlueprint.metadata?.coverGallery?.length > 0) {
        const galleryData = {
            items: storageBlueprint.metadata.coverGallery,
            selectedIndex: storageBlueprint.metadata.coverGalleryIndex ?? 0
        };
        chunks.push(await encodeITxtChunk(
            MetadataKeyword.COVER_GALLERY,
            JSON.stringify(galleryData),
            true  // compressed - critical for large image data
        ));
    }

    return chunks;
}

/**
 * Create a PNG blob with custom metadata chunks
 * @param {HTMLCanvasElement} canvas - Canvas with image
 * @param {Uint8Array[]} metadataChunks - Metadata chunks to insert
 * @returns {Promise<Blob>} PNG blob
 */
async function createPNGWithMetadata(canvas, metadataChunks) {
    // Get original PNG from canvas
    const originalBlob = await new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/png');
    });

    const originalBytes = new Uint8Array(await originalBlob.arrayBuffer());

    // Insert metadata chunks after IHDR
    const newBytes = insertMetadataChunks(originalBytes, metadataChunks);

    return new Blob([newBytes], { type: 'image/png' });
}

/**
 * Encode a blueprint as a PNG file with embedded metadata
 * @param {Object} blueprint - Blueprint object
 * @param {HTMLImageElement|HTMLCanvasElement|string} coverImage - Cover image (element, canvas, or data URL)
 * @returns {Promise<Blob>} PNG file blob
 */
export async function encodeBlueprintAsPNG(blueprint, coverImage = null) {
    await ensureBlueprintMetadata(blueprint);

    const canvas = await coverToCanvas(coverImage, blueprint);
    const chunks = await buildMetadataChunks(blueprint);

    return createPNGWithMetadata(canvas, chunks);
}

// ============================================================================
// BLUEPRINT PNG DECODING
// ============================================================================

/**
 * Parse cover gallery from PNG metadata
 * @param {Object} metadata - Extracted PNG metadata chunks
 * @param {Object} meta - Blueprint metadata object to populate
 */
function parseCoverGallery(metadata, meta) {
    if (!metadata[MetadataKeyword.COVER_GALLERY]) {
        meta.coverGallery = [];
        meta.coverGalleryIndex = null;
        return;
    }

    try {
        const galleryJson = metadata[MetadataKeyword.COVER_GALLERY].text;
        const parsed = JSON.parse(galleryJson);

        // Handle new format (wrapper object with items and selectedIndex)
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.items)) {
            meta.coverGallery = parsed.items;
            meta.coverGalleryIndex = parsed.selectedIndex ?? (parsed.items.length > 0 ? 0 : null);
        }
        // Handle legacy format (direct array)
        else if (Array.isArray(parsed)) {
            meta.coverGallery = parsed;
            meta.coverGalleryIndex = parsed.length > 0 ? 0 : null;
        }
        // Invalid format
        else {
            console.warn('[BlueprintStorage] Unexpected cover gallery format:', typeof parsed);
            meta.coverGallery = [];
            meta.coverGalleryIndex = null;
        }
    } catch (err) {
        console.warn('[BlueprintStorage] Failed to parse cover gallery:', err);
        meta.coverGallery = [];
        meta.coverGalleryIndex = null;
    }
}

/**
 * Decode a blueprint from a PNG file
 * Includes size limit and timeout protection (SEC-006)
 * @param {Blob|File|Uint8Array|ArrayBuffer} pngData - PNG data
 * @returns {Promise<Object>} Decoded blueprint object
 * @throws {Error} If file too large, decode times out, or invalid format
 */
export async function decodeBlueprintFromPNG(pngData) {
    const bytes = await toBytes(pngData);

    // SEC-006: Check file size before decode
    if (bytes.length > MAX_PNG_DECODE_SIZE) {
        const sizeMB = (bytes.length / 1024 / 1024).toFixed(1);
        const limitMB = (MAX_PNG_DECODE_SIZE / 1024 / 1024).toFixed(0);
        throw new Error(`[BlueprintStorage] PNG file too large: ${sizeMB}MB (max ${limitMB}MB)`);
    }

    // SEC-006: Wrap decode in timeout
    const decodePromise = decodeInternal(bytes);
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('[BlueprintStorage] PNG decode timeout - file may be corrupted')), MAX_DECODE_TIMEOUT_MS)
    );

    return Promise.race([decodePromise, timeoutPromise]);
}

/**
 * Internal decode logic (called with timeout wrapper)
 * @param {Uint8Array} bytes - PNG bytes
 * @returns {Promise<Object>} Decoded blueprint
 */
async function decodeInternal(bytes) {
    verifyPNGSignature(bytes);

    const metadata = await extractMetadataFromPNG(bytes);

    if (!metadata[MetadataKeyword.BLUEPRINT]) {
        throw new Error('[BlueprintStorage] PNG file does not contain blueprint data');
    }

    const blueprint = safeParseJSON(metadata[MetadataKeyword.BLUEPRINT].text);

    if (!blueprint) {
        throw new Error('[BlueprintStorage] Failed to parse blueprint JSON');
    }

    // Extract metadata
    blueprint.userMetadata = blueprint.userMetadata || {};
    blueprint.userMetadata.title = metadata[MetadataKeyword.TITLE]?.text || blueprint.userMetadata.title;
    blueprint.blueprint_id = metadata[MetadataKeyword.UUID]?.text || blueprint.blueprint_id;

    const meta = ensureMetadataObject(blueprint);
    meta.createdAt = metadata[MetadataKeyword.CREATED]?.text || meta.createdAt;
    meta.coverPrompt = safeParseJSON(metadata[MetadataKeyword.COVER_PROMPT]?.text, meta.coverPrompt);
    meta.coverModel = safeParseJSON(metadata[MetadataKeyword.COVER_MODEL]?.text, meta.coverModel);
    meta.coverSeed = metadata[MetadataKeyword.COVER_SEED]?.text ? parseInt(metadata[MetadataKeyword.COVER_SEED].text, 10) : meta.coverSeed;

    parseCoverGallery(metadata, meta);

    blueprint.coverImageUrl = await createCleanCoverDataUrl(bytes);

    return blueprint;
}

/**
 * Check if a file is a blueprint PNG
 * @param {File} file - File to check
 * @returns {Promise<boolean>} True if file is a blueprint PNG
 */
export async function isBlueprintPNG(file) {
    try {
        if (!file.type.includes('png') && !file.name.endsWith('.png')) {
            return false;
        }

        const bytes = new Uint8Array(await file.arrayBuffer());

        try {
            verifyPNGSignature(bytes);
        } catch {
            return false;
        }

        const metadata = await extractMetadataFromPNG(bytes);
        return !!metadata[MetadataKeyword.BLUEPRINT];
    } catch (error) {
        console.warn('[BlueprintStorage] Error checking blueprint PNG:', error);
        return false;
    }
}

// ============================================================================
// BLUEPRINT STATE MANAGEMENT
// ============================================================================

/**
 * Get the blueprint state for the current chat
 * @returns {Object} Blueprint state with defaults
 */
export function getBlueprintState() {
    const { chatMetadata } = getContext();

    if (!chatMetadata[MODULE_NAME]) {
        chatMetadata[MODULE_NAME] = {};
    }

    // Ensure blueprint-specific fields exist
    if (!chatMetadata[MODULE_NAME].blueprintState) {
        console.debug('[Story Mode] getBlueprintState: Creating default blueprintState (none existed)');
        chatMetadata[MODULE_NAME].blueprintState = {
            blueprint: undefined,
            currentSceneIndex: 0,
            sceneMode: 'auto',
            useBlueprint: false,
            sceneSummaries: {},
            sceneMessageMap: {},
            pendingSummaries: [],
            beatProgress: {
                completedBeats: [],
                currentBeatFocus: null,
                lastUpdated: null,
            },
            // Source tracking - where the active run copy came from
            sourceBlueprintId: null,
            sourceType: 'none', // 'library' | 'wizard' | 'import' | 'none'
        };
    } else {
        // Log existing state info for debugging persistence issues
        const summaryCount = Object.keys(chatMetadata[MODULE_NAME].blueprintState.sceneSummaries || {}).length;
        console.debug('[Story Mode] getBlueprintState: Loaded existing state with', summaryCount, 'scene summaries');
    }

    // Initialize beatProgress if missing (backward compatibility)
    chatMetadata[MODULE_NAME].blueprintState.beatProgress ||= {
        completedBeats: [],
        currentBeatFocus: null,
        lastUpdated: null,
    };

    // Initialize sceneSummaries if missing (backward compatibility)
    chatMetadata[MODULE_NAME].blueprintState.sceneSummaries ||= {};

    // Initialize source tracking if missing (backward compatibility)
    chatMetadata[MODULE_NAME].blueprintState.sourceBlueprintId ??= null;
    chatMetadata[MODULE_NAME].blueprintState.sourceType ??= 'none';

    // Migration: Log if blueprintState.currentSceneIndex differs from scenario (will sync on save)
    const blueprintSceneIndex = chatMetadata[MODULE_NAME].blueprintState.currentSceneIndex;
    const scenarioSceneIndex = chatMetadata[MODULE_NAME]?.scenario?.currentSceneIndex;
    if (blueprintSceneIndex !== undefined && blueprintSceneIndex !== scenarioSceneIndex) {
    }

    return chatMetadata[MODULE_NAME].blueprintState;
}

/**
 * Save the blueprint state for the current chat
 * @param {Object} blueprintState - The blueprint state to save
 */
export async function saveBlueprintState(blueprintState) {
    const { chatMetadata } = getContext();

    if (!chatMetadata[MODULE_NAME]) {
        chatMetadata[MODULE_NAME] = {};
    }

    // Sync blueprintState.currentSceneIndex from scenario state (backward compatibility)
    if (blueprintState) {
        blueprintState.currentSceneIndex = getCurrentSceneIndex();
    }

    // Sanitize blob URLs in the blueprint before saving
    // Blob URLs don't survive page reloads and cause WebKitBlobResource errors
    if (blueprintState?.blueprint) {
        sanitizeBlobUrls(blueprintState.blueprint);
    }

    // Debug: Log what we're saving
    const summaryCount = Object.keys(blueprintState?.sceneSummaries || {}).length;
    console.debug('[Story Mode] saveBlueprintState: Saving state with', summaryCount, 'scene summaries');

    chatMetadata[MODULE_NAME].blueprintState = blueprintState;

    // Persist to the server/chat file
    await saveMetadata();
}

/**
 * Remove transient blob URLs from blueprint to prevent WebKitBlobResource errors on reload.
 * Blob URLs are temporary and must be converted to data URLs or file URLs before storage.
 * @param {Object} blueprint - Blueprint object to sanitize (mutates in place)
 */
function sanitizeBlobUrls(blueprint) {
    if (!blueprint) return;

    // Remove blob URL from coverImageUrl (should use coverFileUrl for library blueprints)
    if (blueprint.coverImageUrl?.startsWith('blob:')) {
        console.debug('[Story Mode] Removing transient blob URL from blueprint.coverImageUrl');
        delete blueprint.coverImageUrl;
    }

    // Also check metadata.coverImageUrl
    if (blueprint.metadata?.coverImageUrl?.startsWith('blob:')) {
        console.debug('[Story Mode] Removing transient blob URL from blueprint.metadata.coverImageUrl');
        delete blueprint.metadata.coverImageUrl;
    }

    // Check cover gallery for blob URLs
    if (blueprint.metadata?.coverGallery?.length > 0) {
        blueprint.metadata.coverGallery = blueprint.metadata.coverGallery.filter(item => {
            if (item?.url?.startsWith('blob:')) {
                console.debug('[Story Mode] Removing blob URL from cover gallery');
                return false;
            }
            return true;
        });
    }
}

/**
 * Create a deep copy of a blueprint for use as an active run.
 * This preserves the library blueprint by storing a clone in chat metadata.
 *
 * @param {Object} blueprint - The source blueprint to copy
 * @param {string} sourceType - 'library' | 'wizard' | 'import'
 * @returns {Object} A fresh blueprintState object with the run copy
 */
export function createRunCopy(blueprint, sourceType = 'library') {
    // Defensive: validate blueprint exists
    if (!blueprint || typeof blueprint !== 'object') {
        console.error('[Story Mode Blueprint] createRunCopy called with invalid blueprint:', blueprint);
        throw new Error('Cannot create run copy: invalid blueprint');
    }

    // Deep clone to ensure we don't accidentally modify the source
    const runCopy = JSON.parse(JSON.stringify(blueprint));

    // Store sourceBlueprintId on the run copy for cover URL fallback resolution
    // This allows getBlueprintCoverUrl() to compute the file URL for existing saved chats
    runCopy.sourceBlueprintId = blueprint.blueprint_id || null;

    return {
        blueprint: runCopy,
        currentSceneIndex: 0,
        sceneMode: 'auto',
        useBlueprint: true,
        sceneSummaries: {},
        sceneMessageMap: {},
        pendingSummaries: [],
        beatProgress: {
            completedBeats: [],
            currentBeatFocus: null,
            lastUpdated: null,
        },
        // Track source for reference (not for syncing)
        sourceBlueprintId: blueprint.blueprint_id || null,
        sourceType,
    };
}


// ============================================================================
// PUBLIC API SUMMARY
// ============================================================================

/**
 * Blueprint Storage Module Public API
 *
 * PNG Encoding:
 * - encodeBlueprintAsPNG(blueprint, coverImage) -> Blob
 *
 * PNG Decoding:
 * - decodeBlueprintFromPNG(pngData) -> Object
 * - isBlueprintPNG(file) -> boolean
 *
 * Cover Generation:
 * - generateCoverPrompt(blueprint) -> Object
 * - generateCoverImage(blueprint, options) -> HTMLImageElement
 *
 * State Management:
 * - getBlueprintState() -> Object
 * - saveBlueprintState(blueprintState) -> Promise
 * - createRunCopy(blueprint, sourceType) -> Object
 */
