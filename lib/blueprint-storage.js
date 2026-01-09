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

// ============================================================================
// CONSTANTS
// ============================================================================

/** PNG signature bytes (8 bytes) */
const PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

/** Default cover dimensions (2:3 aspect ratio, matches character cards) */
const DEFAULT_COVER_WIDTH = 600;
const DEFAULT_COVER_HEIGHT = 900;

/** Current schema version */
const SCHEMA_VERSION = '1.0.0';

/** PNG chunk types */
const ChunkType = {
    IMAGE_HEADER: 'IHDR',
    TEXT: 'tEXt',
    INTERNATIONAL_TEXT: 'iTXt',
    IMAGE_DATA: 'IDAT',
    END: 'IEND',
};

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

/**
 * Calculate CRC32 checksum for PNG chunk
 * @param {Uint8Array} data - Data to checksum
 * @returns {number} CRC32 value
 */
function calculateCRC32(data) {
    let crc = 0xFFFFFFFF;

    for (let i = 0; i < data.length; i++) {
        crc ^= data[i];
        for (let j = 0; j < 8; j++) {
            crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
        }
    }

    return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Compress data using zlib
 * @param {string} data - Data to compress
 * @returns {Promise<Uint8Array>} Compressed data
 */
async function compressData(data) {
    const bytes = new TextEncoder().encode(data);

    if (typeof CompressionStream === 'undefined') {
        console.warn('[BlueprintStorage] CompressionStream not available, storing uncompressed');
        return bytes;
    }

    const stream = new CompressionStream('deflate');
    const writer = stream.writable.getWriter();
    await writer.write(bytes);
    await writer.close();

    return concatenateChunks(stream.readable.getReader());
}

/**
 * Decompress data using zlib
 * @param {Uint8Array} data - Compressed data
 * @returns {Promise<string>} Decompressed string
 */
async function decompressData(data) {
    if (typeof DecompressionStream === 'undefined') {
        return new TextDecoder().decode(data);
    }

    try {
        const stream = new DecompressionStream('deflate');
        const writer = stream.writable.getWriter();
        await writer.write(data);
        await writer.close();

        const decompressed = await concatenateChunks(stream.readable.getReader());
        return new TextDecoder().decode(decompressed);
    } catch (error) {
        console.warn('[BlueprintStorage] Decompression failed, using raw data:', error);
        return new TextDecoder().decode(data);
    }
}

/**
 * Concatenate chunks from a stream reader into a single Uint8Array
 * @param {ReadableStreamDefaultReader} reader - Stream reader
 * @returns {Promise<Uint8Array>} Concatenated data
 */
async function concatenateChunks(reader) {
    const chunks = [];
    let result;

    while (!(result = await reader.read()).done) {
        chunks.push(result.value);
    }

    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;

    for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
    }

    return combined;
}

/**
 * Write a 32-bit big-endian integer to bytes
 * @param {number} value - Value to write
 * @returns {Uint8Array} 4 bytes
 */
function writeUInt32BE(value) {
    return new Uint8Array([
        (value >>> 24) & 0xFF,
        (value >>> 16) & 0xFF,
        (value >>> 8) & 0xFF,
        value & 0xFF,
    ]);
}

/**
 * Read a 32-bit big-endian integer from bytes
 * @param {Uint8Array} bytes - Bytes to read
 * @param {number} offset - Offset to start reading
 * @returns {number} 32-bit integer value
 */
function readUInt32BE(bytes, offset) {
    return (
        (bytes[offset] << 24) |
        (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) |
        bytes[offset + 3]
    ) >>> 0;
}

// ============================================================================
// PNG CHUNK ENCODING
// ============================================================================

/**
 * Encode a PNG chunk
 * @param {string} type - Chunk type (4 bytes)
 * @param {Uint8Array} data - Chunk data
 * @returns {Uint8Array} Complete chunk (length + type + data + CRC)
 */
function encodeChunk(type, data) {
    const typeBytes = new TextEncoder().encode(type);
    const chunkData = new Uint8Array(typeBytes.length + data.length);
    chunkData.set(typeBytes, 0);
    chunkData.set(data, typeBytes.length);

    const length = writeUInt32BE(data.length);
    const crc = writeUInt32BE(calculateCRC32(chunkData));

    const chunk = new Uint8Array(12 + data.length);
    chunk.set(length, 0);
    chunk.set(typeBytes, 4);
    chunk.set(data, 8);
    chunk.set(crc, 8 + data.length);

    return chunk;
}

/**
 * Encode a tEXt chunk (Latin-1 text, uncompressed)
 * @param {string} keyword - Keyword (must be 1-79 bytes, Latin-1)
 * @param {string} text - Text content (Latin-1)
 * @returns {Uint8Array} Encoded chunk
 */
function encodeTextChunk(keyword, text) {
    const encoder = new TextEncoder();
    const keywordBytes = encoder.encode(keyword.substring(0, 79));
    const textBytes = encoder.encode(text);

    const data = new Uint8Array(keywordBytes.length + 1 + textBytes.length);
    data.set(keywordBytes, 0);
    data[keywordBytes.length] = 0; // Null separator
    data.set(textBytes, keywordBytes.length + 1);

    return encodeChunk(ChunkType.TEXT, data);
}

/**
 * Encode an iTXt chunk (UTF-8 text, optionally compressed)
 * @param {string} keyword - Keyword
 * @param {string} text - Text content (UTF-8)
 * @param {boolean} compressed - Whether to compress the text
 * @param {string} language - Language tag (default: empty)
 * @param {string} translatedKeyword - Translated keyword (default: empty)
 * @returns {Promise<Uint8Array>} Encoded chunk
 */
async function encodeITxtChunk(keyword, text, compressed = false, language = '', translatedKeyword = '') {
    const encoder = new TextEncoder();
    const keywordBytes = encoder.encode(keyword.substring(0, 79));
    const languageBytes = encoder.encode(language);
    const translatedKeywordBytes = encoder.encode(translatedKeyword);

    const textBytes = compressed ? await compressData(text) : encoder.encode(text);

    const data = new Uint8Array(
        keywordBytes.length + 1 + // keyword + null
        2 + // compression flag + method
        languageBytes.length + 1 + // language + null
        translatedKeywordBytes.length + 1 + // translated keyword + null
        textBytes.length
    );

    let offset = 0;
    data.set(keywordBytes, offset);
    offset += keywordBytes.length + 1;
    data[offset] = compressed ? 1 : 0;
    offset += 1;
    data[offset] = 0; // compression method (zlib)
    offset += 1;
    data.set(languageBytes, offset);
    offset += languageBytes.length + 1;
    data.set(translatedKeywordBytes, offset);
    offset += translatedKeywordBytes.length + 1;
    data.set(textBytes, offset);

    return encodeChunk(ChunkType.INTERNATIONAL_TEXT, data);
}

/**
 * Encode IHDR chunk (image header)
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {Uint8Array} Encoded IHDR chunk
 */
function encodeIHDRChunk(width, height) {
    const data = new Uint8Array(13);

    // Width (4 bytes)
    data.set(writeUInt32BE(width), 0);
    // Height (4 bytes)
    data.set(writeUInt32BE(height), 4);
    // Bit depth (1 byte)
    data[8] = 8; // 8 bits per channel
    // Color type (1 byte)
    data[9] = 6; // RGBA
    // Compression method (1 byte)
    data[10] = 0; // zlib
    // Filter method (1 byte)
    data[11] = 0; // adaptive filtering
    // Interlace method (1 byte)
    data[12] = 0; // no interlace

    return encodeChunk(ChunkType.IMAGE_HEADER, data);
}

// ============================================================================
// PNG CHUNK DECODING
// ============================================================================

/**
 * Decode a PNG chunk
 * @param {Uint8Array} bytes - Complete chunk bytes
 * @returns {Object} Decoded chunk { type, data, crc }
 */
function decodeChunk(bytes) {
    const length = readUInt32BE(bytes, 0);
    const type = new TextDecoder().decode(bytes.slice(4, 8));
    const data = bytes.slice(8, 8 + length);
    const crc = readUInt32BE(bytes, 8 + length);

    return { type, data, crc };
}

/**
 * Decode a tEXt chunk
 * @param {Uint8Array} data - Chunk data
 * @returns {Object} { keyword, text }
 */
function decodeTextChunk(data) {
    const nullIndex = data.indexOf(0);
    const keyword = new TextDecoder('latin1').decode(data.slice(0, nullIndex));
    const text = new TextDecoder('latin1').decode(data.slice(nullIndex + 1));

    return { keyword, text };
}

/**
 * Decode an iTXt chunk
 * @param {Uint8Array} data - Chunk data
 * @returns {Promise<Object>} { keyword, text, compressed, language, translatedKeyword }
 */
async function decodeITxtChunk(data) {
    let offset = 0;

    const keyword = decodeNullTerminated(data, offset);
    offset += keyword.length + 1;

    const compressed = data[offset] === 1;
    offset += 2; // compression flag + method

    const language = decodeNullTerminated(data, offset);
    offset += language.length + 1;

    const translatedKeyword = decodeNullTerminated(data, offset);
    offset += translatedKeyword.length + 1;

    const textBytes = data.slice(offset);
    const text = compressed ? await decompressData(textBytes) : new TextDecoder().decode(textBytes);

    return { keyword, text, compressed, language, translatedKeyword };
}

/**
 * Decode a null-terminated string
 * @param {Uint8Array} data - Data buffer
 * @param {number} offset - Starting offset
 * @returns {string} Decoded string
 */
function decodeNullTerminated(data, offset) {
    const nullIndex = data.indexOf(0, offset);
    return new TextDecoder().decode(data.slice(offset, nullIndex));
}

/**
 * Verify PNG signature
 * @param {Uint8Array} pngBytes - PNG file bytes
 * @throws {Error} If signature is invalid
 */
function verifyPNGSignature(pngBytes) {
    for (let i = 0; i < PNG_SIGNATURE.length; i++) {
        if (pngBytes[i] !== PNG_SIGNATURE[i]) {
            throw new Error('[BlueprintStorage] Invalid PNG signature');
        }
    }
}

/**
 * Extract all metadata chunks from PNG bytes
 * @param {Uint8Array} pngBytes - Complete PNG file bytes
 * @returns {Promise<Object>} Metadata by keyword
 */
async function extractMetadataFromPNG(pngBytes) {
    verifyPNGSignature(pngBytes);

    const metadata = {};
    let offset = 8; // Skip signature

    while (offset < pngBytes.length) {
        const chunkLength = readUInt32BE(pngBytes, offset);
        const chunkType = new TextDecoder().decode(pngBytes.slice(offset + 4, offset + 8));
        const chunkData = pngBytes.slice(offset + 8, offset + 8 + chunkLength);

        if (chunkType === ChunkType.TEXT) {
            const { keyword, text } = decodeTextChunk(chunkData);
            metadata[keyword] = { text, compressed: false };
        } else if (chunkType === ChunkType.INTERNATIONAL_TEXT) {
            const decoded = await decodeITxtChunk(chunkData);
            metadata[decoded.keyword] = {
                text: decoded.text,
                compressed: decoded.compressed,
                language: decoded.language,
            };
        } else if (chunkType === ChunkType.END) {
            break;
        }

        offset += 12 + chunkLength; // length + type + data + crc
    }

    return metadata;
}

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
// BLUEPRINT PNG ENCODING
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
    // This is a simplified implementation
    // In production, you'd want to use a proper PNG encoder library

    // For now, we'll use canvas.toBlob() and inject metadata
    // This is not ideal but works for the prototype

    const originalBlob = await new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/png');
    });

    const originalBytes = new Uint8Array(await originalBlob.arrayBuffer());

    // Find the end of IHDR and insert metadata chunks
    // Skip signature (8 bytes)
    let offset = 8;

    // Read IHDR length
    const ihdrLength = readUInt32BE(originalBytes, offset);
    offset += 12 + ihdrLength; // Skip IHDR chunk

    // Insert metadata chunks after IHDR
    const newBytes = new Uint8Array(
        8 + // signature
        (offset - 8) + // up to end of IHDR
        metadataChunks.reduce((acc, chunk) => acc + chunk.length, 0) + // metadata chunks
        (originalBytes.length - offset) // rest of original PNG
    );

    // Copy signature and IHDR
    newBytes.set(originalBytes.slice(0, offset), 0);

    // Insert metadata chunks
    let metadataOffset = offset;
    for (const chunk of metadataChunks) {
        newBytes.set(chunk, metadataOffset);
        metadataOffset += chunk.length;
    }

    // Copy rest of original PNG (IDAT, IEND, etc.)
    newBytes.set(originalBytes.slice(offset), metadataOffset);

    return new Blob([newBytes], { type: 'image/png' });
}

// ============================================================================
// BLUEPRINT PNG DECODING
// ============================================================================

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
// COVER IMAGE GENERATION (STUB)
// ============================================================================

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
