/**
 * PNG Chunk Handler Module
 *
 * Low-level PNG binary manipulation for embedding/extracting metadata.
 * Separated from blueprint-storage.js for better modularity and reusability.
 *
 * @module png-chunk-handler
 * @version 1.0.0
 *
 * Features:
 * - PNG chunk encoding/decoding (tEXt, iTXt, IHDR)
 * - CRC32 calculation
 * - Zlib compression/decompression for compressed text chunks
 * - PNG signature verification
 * - Metadata extraction from PNG files
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/** PNG signature bytes (8 bytes) */
export const PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

/** PNG chunk types */
export const ChunkType = {
    IMAGE_HEADER: 'IHDR',
    TEXT: 'tEXt',
    INTERNATIONAL_TEXT: 'iTXt',
    IMAGE_DATA: 'IDAT',
    END: 'IEND',
};

// ============================================================================
// BINARY UTILITIES
// ============================================================================

/**
 * Write a 32-bit big-endian integer to bytes
 * @param {number} value - Value to write (0 to 2^32-1)
 * @returns {Uint8Array} 4 bytes in big-endian order
 */
export function writeUInt32BE(value) {
    return new Uint8Array([
        (value >>> 24) & 0xFF,
        (value >>> 16) & 0xFF,
        (value >>> 8) & 0xFF,
        value & 0xFF,
    ]);
}

/**
 * Read a 32-bit big-endian integer from bytes
 * @param {Uint8Array} bytes - Bytes to read from
 * @param {number} offset - Offset to start reading
 * @returns {number} 32-bit unsigned integer value
 */
export function readUInt32BE(bytes, offset) {
    return (
        (bytes[offset] << 24) |
        (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) |
        bytes[offset + 3]
    ) >>> 0;
}

// ============================================================================
// CRC32 CALCULATION
// ============================================================================

/**
 * Calculate CRC32 checksum for PNG chunk data
 * Uses the standard PNG CRC32 algorithm with polynomial 0xEDB88320
 *
 * @param {Uint8Array} data - Data to checksum (type + data bytes)
 * @returns {number} CRC32 value (unsigned 32-bit integer)
 */
export function calculateCRC32(data) {
    let crc = 0xFFFFFFFF;

    for (let i = 0; i < data.length; i++) {
        crc ^= data[i];
        for (let j = 0; j < 8; j++) {
            crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
        }
    }

    return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ============================================================================
// COMPRESSION/DECOMPRESSION
// ============================================================================

/**
 * Compress data using zlib (deflate)
 * Uses the CompressionStream API when available, falls back to uncompressed
 *
 * @param {string} data - Data to compress
 * @returns {Promise<Uint8Array>} Compressed data (or original if compression unavailable)
 */
export async function compressData(data) {
    const bytes = new TextEncoder().encode(data);

    if (typeof CompressionStream === 'undefined') {
        console.warn('[PNGChunkHandler] CompressionStream not available, storing uncompressed');
        return bytes;
    }

    const stream = new CompressionStream('deflate');

    // Must read and write concurrently to avoid backpressure deadlock
    const reader = stream.readable.getReader();
    const writer = stream.writable.getWriter();

    // Start reading in parallel (don't await yet)
    const readPromise = concatenateChunks(reader);

    // Write data and close
    writer.write(bytes);
    writer.close();

    // Now await the read result
    return readPromise;
}

/**
 * Decompress data using zlib (inflate)
 * Uses the DecompressionStream API when available, falls back to raw decoding
 *
 * @param {Uint8Array} data - Compressed data
 * @returns {Promise<string>} Decompressed string
 */
export async function decompressData(data) {
    if (typeof DecompressionStream === 'undefined') {
        return new TextDecoder().decode(data);
    }

    try {
        const stream = new DecompressionStream('deflate');

        // Must read and write concurrently to avoid backpressure deadlock
        const reader = stream.readable.getReader();
        const writer = stream.writable.getWriter();

        // Start reading in parallel (don't await yet)
        const readPromise = concatenateChunks(reader);

        // Write data and close
        writer.write(data);
        writer.close();

        // Now await the read result
        const decompressed = await readPromise;
        return new TextDecoder().decode(decompressed);
    } catch (error) {
        console.warn('[PNGChunkHandler] Decompression failed, using raw data:', error);
        return new TextDecoder().decode(data);
    }
}

/**
 * Concatenate chunks from a stream reader into a single Uint8Array
 *
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

// ============================================================================
// PNG CHUNK ENCODING
// ============================================================================

/**
 * Encode a PNG chunk with length, type, data, and CRC
 *
 * Chunk structure:
 * - Length (4 bytes): Data length
 * - Type (4 bytes): Chunk type (ASCII)
 * - Data (N bytes): Chunk data
 * - CRC (4 bytes): CRC32 of type + data
 *
 * @param {string} type - Chunk type (4 characters, e.g., 'tEXt', 'IHDR')
 * @param {Uint8Array} data - Chunk data
 * @returns {Uint8Array} Complete chunk (length + type + data + CRC)
 */
export function encodeChunk(type, data) {
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
 *
 * tEXt chunk format:
 * - Keyword: 1-79 Latin-1 characters, null-terminated
 * - Text: Remaining Latin-1 text
 *
 * @param {string} keyword - Keyword (1-79 bytes, Latin-1 compatible)
 * @param {string} text - Text content (Latin-1 compatible)
 * @returns {Uint8Array} Encoded tEXt chunk
 */
export function encodeTextChunk(keyword, text) {
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
 *
 * iTXt chunk format:
 * - Keyword: 1-79 UTF-8 characters, null-terminated
 * - Compression flag: 0 (uncompressed) or 1 (compressed)
 * - Compression method: 0 (zlib)
 * - Language tag: Null-terminated language code
 * - Translated keyword: Null-terminated translated keyword
 * - Text: UTF-8 text content
 *
 * @param {string} keyword - Keyword (1-79 bytes)
 * @param {string} text - Text content (UTF-8)
 * @param {boolean} [compressed=false] - Whether to compress the text
 * @param {string} [language=''] - Language tag (e.g., 'en', 'es')
 * @param {string} [translatedKeyword=''] - Translated keyword
 * @returns {Promise<Uint8Array>} Encoded iTXt chunk
 */
export async function encodeITxtChunk(keyword, text, compressed = false, language = '', translatedKeyword = '') {
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
 *
 * IHDR chunk contains:
 * - Width (4 bytes): Image width
 * - Height (4 bytes): Image height
 * - Bit depth (1 byte): Bits per sample (usually 8)
 * - Color type (1 byte): 0=grayscale, 2=RGB, 3=palette, 4=grayscale+alpha, 6=RGBA
 * - Compression method (1 byte): 0 (zlib)
 * - Filter method (1 byte): 0 (adaptive filtering)
 * - Interlace method (1 byte): 0=none, 1=Adam7
 *
 * @param {number} width - Image width in pixels
 * @param {number} height - Image height in pixels
 * @param {number} [bitDepth=8] - Bits per sample (usually 8)
 * @param {number} [colorType=6] - Color type (6 = RGBA)
 * @returns {Uint8Array} Encoded IHDR chunk
 */
export function encodeIHDRChunk(width, height, bitDepth = 8, colorType = 6) {
    const data = new Uint8Array(13);

    // Width (4 bytes)
    data.set(writeUInt32BE(width), 0);
    // Height (4 bytes)
    data.set(writeUInt32BE(height), 4);
    // Bit depth (1 byte)
    data[8] = bitDepth;
    // Color type (1 byte): 6 = RGBA
    data[9] = colorType;
    // Compression method (1 byte): 0 = zlib
    data[10] = 0;
    // Filter method (1 byte): 0 = adaptive filtering
    data[11] = 0;
    // Interlace method (1 byte): 0 = no interlace
    data[12] = 0;

    return encodeChunk(ChunkType.IMAGE_HEADER, data);
}

// ============================================================================
// PNG CHUNK DECODING
// ============================================================================

/**
 * Decode a PNG chunk into its components
 *
 * @param {Uint8Array} bytes - Complete chunk bytes (length + type + data + CRC)
 * @returns {Object} Decoded chunk { type: string, data: Uint8Array, crc: number, length: number }
 */
export function decodeChunk(bytes) {
    const length = readUInt32BE(bytes, 0);
    const type = new TextDecoder().decode(bytes.slice(4, 8));
    const data = bytes.slice(8, 8 + length);
    const crc = readUInt32BE(bytes, 8 + length);

    return { type, data, crc, length };
}

/**
 * Decode a tEXt chunk (Latin-1 text, uncompressed)
 *
 * @param {Uint8Array} data - Chunk data (excluding length, type, CRC)
 * @returns {Object} { keyword: string, text: string }
 */
export function decodeTextChunk(data) {
    const nullIndex = data.indexOf(0);
    const keyword = new TextDecoder('latin1').decode(data.slice(0, nullIndex));
    const text = new TextDecoder('latin1').decode(data.slice(nullIndex + 1));

    return { keyword, text };
}

/**
 * Decode an iTXt chunk (UTF-8 text, optionally compressed)
 *
 * @param {Uint8Array} data - Chunk data (excluding length, type, CRC)
 * @returns {Promise<Object>} { keyword, text, compressed, language, translatedKeyword }
 */
export async function decodeITxtChunk(data) {
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
 * Decode a null-terminated string from bytes
 *
 * @param {Uint8Array} data - Data buffer
 * @param {number} offset - Starting offset
 * @returns {string} Decoded string
 */
function decodeNullTerminated(data, offset) {
    const nullIndex = data.indexOf(0, offset);
    return new TextDecoder().decode(data.slice(offset, nullIndex));
}

// ============================================================================
// PNG FILE OPERATIONS
// ============================================================================

/**
 * Verify PNG signature
 *
 * PNG files start with the following 8-byte signature:
 * 89 50 4E 47 0D 0A 1A 0A
 * (hex values of: \x89PNG\r\n\x1a\n)
 *
 * @param {Uint8Array} pngBytes - PNG file bytes
 * @throws {Error} If signature is invalid
 */
export function verifyPNGSignature(pngBytes) {
    for (let i = 0; i < PNG_SIGNATURE.length; i++) {
        if (pngBytes[i] !== PNG_SIGNATURE[i]) {
            throw new Error('[PNGChunkHandler] Invalid PNG signature');
        }
    }
}

/**
 * Extract all metadata chunks from PNG bytes
 *
 * Iterates through PNG chunks and extracts tEXt and iTXt chunks.
 * Stops when reaching IEND chunk.
 *
 * @param {Uint8Array} pngBytes - Complete PNG file bytes
 * @returns {Promise<Object>} Metadata by keyword
 *   Each entry: { text: string, compressed?: boolean, language?: string }
 */
export async function extractMetadataFromPNG(pngBytes) {
    verifyPNGSignature(pngBytes);

    const metadata = {};
    let offset = 8; // Skip PNG signature

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

        offset += 12 + chunkLength; // length (4) + type (4) + data (N) + crc (4)
    }

    return metadata;
}

/**
 * Insert metadata chunks into a PNG after the IHDR chunk
 *
 * @param {Uint8Array} originalPngBytes - Original PNG file bytes
 * @param {Uint8Array[]} metadataChunks - Metadata chunks to insert
 * @returns {Uint8Array} New PNG bytes with metadata inserted
 */
export function insertMetadataChunks(originalPngBytes, metadataChunks) {
    // Skip signature (8 bytes)
    let offset = 8;

    // Read IHDR length
    const ihdrLength = readUInt32BE(originalPngBytes, offset);
    offset += 12 + ihdrLength; // Skip IHDR chunk

    // Calculate new PNG size
    const newBytes = new Uint8Array(
        8 + // signature
        (offset - 8) + // up to end of IHDR
        metadataChunks.reduce((acc, chunk) => acc + chunk.length, 0) + // metadata chunks
        (originalPngBytes.length - offset) // rest of original PNG
    );

    // Copy signature and IHDR
    newBytes.set(originalPngBytes.slice(0, offset), 0);

    // Insert metadata chunks
    let metadataOffset = offset;
    for (const chunk of metadataChunks) {
        newBytes.set(chunk, metadataOffset);
        metadataOffset += chunk.length;
    }

    // Copy rest of original PNG (IDAT, IEND, etc.)
    newBytes.set(originalPngBytes.slice(offset), metadataOffset);

    return newBytes;
}

// ============================================================================
// PUBLIC API SUMMARY
// ============================================================================

/**
 * PNG Chunk Handler Module Public API
 *
 * Binary Utilities:
 * - writeUInt32BE(value) -> Uint8Array
 * - readUInt32BE(bytes, offset) -> number
 *
 * CRC32:
 * - calculateCRC32(data) -> number
 *
 * Compression:
 * - compressData(data) -> Promise<Uint8Array>
 * - decompressData(data) -> Promise<string>
 *
 * Chunk Encoding:
 * - encodeChunk(type, data) -> Uint8Array
 * - encodeTextChunk(keyword, text) -> Uint8Array
 * - encodeITxtChunk(keyword, text, compressed, language, translatedKeyword) -> Promise<Uint8Array>
 * - encodeIHDRChunk(width, height, bitDepth, colorType) -> Uint8Array
 *
 * Chunk Decoding:
 * - decodeChunk(bytes) -> { type, data, crc, length }
 * - decodeTextChunk(data) -> { keyword, text }
 * - decodeITxtChunk(data) -> Promise<{ keyword, text, compressed, language, translatedKeyword }>
 *
 * PNG File Operations:
 * - verifyPNGSignature(pngBytes) -> void (throws on error)
 * - extractMetadataFromPNG(pngBytes) -> Promise<Object>
 * - insertMetadataChunks(originalPngBytes, metadataChunks) -> Uint8Array
 *
 * Constants:
 * - PNG_SIGNATURE: number[]
 * - ChunkType: { IMAGE_HEADER, TEXT, INTERNATIONAL_TEXT, IMAGE_DATA, END }
 */
