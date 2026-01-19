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
} from './blueprint-utils.js';

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
} from './png/chunk-handler.js';

import { getContext } from '/scripts/extensions.js';
import { saveMetadata, eventSource, event_types } from '/script.js';
import { getCurrentSceneIndex } from './core/state-manager.js';
import { MODULE_NAME } from './core/index.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Default cover dimensions (2:3 aspect ratio, matches character cards) */
const DEFAULT_COVER_WIDTH = 600;
const DEFAULT_COVER_HEIGHT = 900;

/** Current schema version */
const SCHEMA_VERSION = '1.0.0';

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
function getGenreGradient(genre) {
    const genreLower = (genre || '').toLowerCase();

    const gradients = {
        'horror': ['#1a1a2e', '#16213e', '#0f3460'],
        'mystery': ['#1a1a2e', '#16213e', '#0f3460'],
        'fantasy': ['#2d1b69', '#11998e', '#38ef7d'],
        'sci-fi': ['#0c0c0c', '#1a1a2e', '#00d4ff'],
        'science fiction': ['#0c0c0c', '#1a1a2e', '#00d4ff'],
        'romance': ['#ff9a9e', '#fecfef', '#fecfef'],
    };

    return gradients[genreLower] || ['#667eea', '#764ba2'];
}

/**
 * Draw word-wrapped text and return the ending Y position
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {string} text - Text to draw
 * @param {number} x - X position
 * @param {number} y - Starting Y position
 * @param {number} maxWidth - Maximum width per line
 * @param {number} lineHeight - Line height
 * @returns {number} Ending Y position
 */
function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';

    for (let i = 0; i < words.length; i++) {
        const testLine = line + words[i] + ' ';
        const metrics = ctx.measureText(testLine);

        if (metrics.width > maxWidth && i > 0) {
            ctx.fillText(line.trim(), x, y);
            line = words[i] + ' ';
            y += lineHeight;
        } else {
            line = testLine;
        }
    }

    ctx.fillText(line.trim(), x, y);
    return y;
}

/**
 * Create a default cover image (gradient with title)
 * @param {Object} blueprint - Blueprint object
 * @returns {HTMLCanvasElement} Canvas element with cover
 */
function createDefaultCover(blueprint) {
    const canvas = document.createElement('canvas');
    canvas.width = DEFAULT_COVER_WIDTH;
    canvas.height = DEFAULT_COVER_HEIGHT;
    const ctx = canvas.getContext('2d');

    // Create gradient background
    const colors = getGenreGradient(blueprint.story_type_name);
    const gradient = ctx.createLinearGradient(0, 0, 0, DEFAULT_COVER_HEIGHT);
    colors.forEach((color, i) => gradient.addColorStop(i / (colors.length - 1), color));

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, DEFAULT_COVER_WIDTH, DEFAULT_COVER_HEIGHT);

    // Add title text with word wrap
    const title = blueprint.userMetadata?.title || blueprint.core_premise?.substring(0, 50) || 'Story Blueprint';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let y = DEFAULT_COVER_HEIGHT / 2 - 50;
    const lineHeight = 45;
    const maxWidth = DEFAULT_COVER_WIDTH - 80;

    y = drawWrappedText(ctx, title, DEFAULT_COVER_WIDTH / 2, y, maxWidth, lineHeight);

    // Add story type
    ctx.font = '24px Arial, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillText(blueprint.story_type_name || 'Story', DEFAULT_COVER_WIDTH / 2, y + lineHeight + 20);

    return canvas;
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

    return createDefaultCover(blueprint);
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

    const canvas = createDefaultCover(blueprint);
    return loadImage(canvas.toDataURL('image/png'));
}

// ============================================================================
// BLUEPRINT METADATA MANAGEMENT
// ============================================================================

/**
 * Ensure blueprint has required metadata fields
 * @param {Object} blueprint - Blueprint object
 */
function ensureBlueprintMetadata(blueprint) {
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

// ============================================================================
// BLUEPRINT PNG ENCODING
// ============================================================================

/**
 * Build all metadata chunks for a blueprint
 * @param {Object} blueprint - Blueprint object
 * @returns {Promise<Uint8Array[]>} Array of metadata chunks
 */
async function buildMetadataChunks(blueprint) {
    const title = blueprint.userMetadata?.title || blueprint.core_premise?.substring(0, 50) || 'Story Blueprint';
    const chunks = [
        encodeIHDRChunk(DEFAULT_COVER_WIDTH, DEFAULT_COVER_HEIGHT),
        await encodeITxtChunk(MetadataKeyword.BLUEPRINT, JSON.stringify(blueprint), true),
        await encodeITxtChunk(MetadataKeyword.TITLE, title, false),
        await encodeITxtChunk(MetadataKeyword.VERSION, SCHEMA_VERSION, false),
        await encodeITxtChunk(MetadataKeyword.COVER_PROMPT, JSON.stringify(blueprint.metadata.coverPrompt), true),
        encodeTextChunk(MetadataKeyword.CREATED, blueprint.metadata.createdAt),
        encodeTextChunk(MetadataKeyword.UUID, blueprint.blueprint_id),
    ];

    // Optional metadata
    if (blueprint.story_type_id) {
        chunks.push(await encodeITxtChunk(
            MetadataKeyword.STORY_TYPE,
            JSON.stringify({ id: blueprint.story_type_id, name: blueprint.story_type_name }),
            false
        ));
    }

    if (blueprint.author_style) {
        chunks.push(await encodeITxtChunk(
            MetadataKeyword.AUTHOR,
            JSON.stringify({ id: blueprint.author_style, name: blueprint.author_style }),
            false
        ));
    }

    if (blueprint.metadata.coverModel) {
        chunks.push(await encodeITxtChunk(
            MetadataKeyword.COVER_MODEL,
            JSON.stringify(blueprint.metadata.coverModel),
            false
        ));
    }

    if (blueprint.metadata.coverSeed) {
        chunks.push(encodeTextChunk(MetadataKeyword.COVER_SEED, blueprint.metadata.coverSeed.toString()));
    }

    // Add cover gallery chunk (compressed due to size)
    if (blueprint.metadata?.coverGallery?.length > 0) {
        console.log(`[BlueprintStorage] Encoding gallery with ${blueprint.metadata.coverGallery.length} covers`);
        chunks.push(await encodeITxtChunk(
            MetadataKeyword.COVER_GALLERY,
            JSON.stringify(blueprint.metadata.coverGallery),
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
    ensureBlueprintMetadata(blueprint);

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
        meta.coverGallery = JSON.parse(galleryJson);
        meta.coverGalleryIndex = meta.coverGallery.length > 0 ? 0 : null;
        console.log(`[BlueprintStorage] Decoded gallery with ${meta.coverGallery.length} covers`);
    } catch (err) {
        console.warn('[BlueprintStorage] Failed to parse cover gallery:', err);
        meta.coverGallery = [];
        meta.coverGalleryIndex = null;
    }
}

/**
 * Decode a blueprint from a PNG file
 * @param {Blob|File|Uint8Array|ArrayBuffer} pngData - PNG data
 * @returns {Promise<Object>} Decoded blueprint object
 */
export async function decodeBlueprintFromPNG(pngData) {
    const bytes = await toBytes(pngData);

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

    // Extract gallery from chunks
    parseCoverGallery(metadata, meta);

    // Create data URL for cover image
    blueprint.coverImageUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));

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
// FILE I/O
// ============================================================================

/**
 * Save a blueprint as a PNG file
 * @param {Object} blueprint - Blueprint object
 * @param {HTMLImageElement|HTMLCanvasElement|string} coverImage - Cover image
 * @param {string} filename - Output filename (default: auto-generated)
 * @returns {Promise<string>} Download URL
 */
export async function saveBlueprintAsPNG(blueprint, coverImage = null, filename = null) {
    const blob = await encodeBlueprintAsPNG(blueprint, coverImage);

    const defaultFilename = blueprint.userMetadata?.title
        ? `${sanitizeFilename(blueprint.userMetadata.title)}.png`
        : `blueprint-${blueprint.blueprint_id?.substring(0, 8)}.png`;

    downloadBlob(blob, filename || defaultFilename);
    return URL.createObjectURL(blob);
}

/**
 * Load a blueprint from a PNG file
 * @param {File} file - PNG file
 * @returns {Promise<Object>} Decoded blueprint
 */
export async function loadBlueprintFromPNG(file) {
    return decodeBlueprintFromPNG(file);
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
    }

    // Initialize beatProgress if missing (backward compatibility)
    chatMetadata[MODULE_NAME].blueprintState.beatProgress ||= {
        completedBeats: [],
        currentBeatFocus: null,
        lastUpdated: null,
    };

    // Initialize source tracking if missing (backward compatibility)
    chatMetadata[MODULE_NAME].blueprintState.sourceBlueprintId ??= null;
    chatMetadata[MODULE_NAME].blueprintState.sourceType ??= 'none';

    // Migration: Log if blueprintState.currentSceneIndex differs from scenario (will sync on save)
    const blueprintSceneIndex = chatMetadata[MODULE_NAME].blueprintState.currentSceneIndex;
    const scenarioSceneIndex = chatMetadata[MODULE_NAME]?.scenario?.currentSceneIndex;
    if (blueprintSceneIndex !== undefined && blueprintSceneIndex !== scenarioSceneIndex) {
        console.log('[Story Mode Blueprint] Scene index mismatch detected - blueprintState has', blueprintSceneIndex, 'but scenario has', scenarioSceneIndex, '- will sync on next save');
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

    chatMetadata[MODULE_NAME].blueprintState = blueprintState;

    console.log('[Story Mode Blueprint] Saving blueprint state:', blueprintState);

    // Persist to the server/chat file
    await saveMetadata();

    // Notify that metadata was updated
    eventSource.emit(event_types.CHAT_METADATA_UPDATED);
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

    console.log(`[Story Mode Blueprint] Creating run copy from ${sourceType} source:`, blueprint.blueprint_id);

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
 * - saveBlueprintAsPNG(blueprint, coverImage, filename) -> string
 *
 * PNG Decoding:
 * - decodeBlueprintFromPNG(pngData) -> Object
 * - loadBlueprintFromPNG(file) -> Object
 * - isBlueprintPNG(file) -> boolean
 *
 * Cover Generation:
 * - generateCoverPrompt(blueprint) -> Object
 * - generateCoverImage(blueprint, options) -> HTMLImageElement
 */
