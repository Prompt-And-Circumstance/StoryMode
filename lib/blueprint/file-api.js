/**
 * File API Wrapper - SillyTavern File Endpoints
 *
 * Wraps SillyTavern's /api/files/* endpoints with error handling and helpers.
 * Files are stored at user/files/ root - no subdirectories allowed.
 *
 * @module file-api
 * @version 1.0.0
 */

import { getRequestHeaders } from '../../../../../../script.js';
import { blueprintFilename, isValidUUID, FILE_PREFIX } from './utils.js';

/**
 * Re-exported from utils.js for backward compatibility.
 */
export { isValidUUID, blueprintFilename };

// ============================================================================
// CONSTANTS
// ============================================================================

const MANIFEST_FILENAME = 'storymode-manifest.json';

// ============================================================================
// SECURITY VALIDATION (SEC-001, SEC-004)
// ============================================================================

/**
 * Validate filename contains no path traversal sequences
 * Blocks: .., /, \, null bytes, control characters
 * @param {string} filename - Filename to validate
 * @throws {FileAPIError} If filename contains unsafe characters
 */
function validateFilename(filename) {
    if (!filename || typeof filename !== 'string') {
        throw new FileAPIError('Invalid filename: must be a non-empty string');
    }
    // Block path traversal attempts
    if (filename.includes('..')) {
        throw new FileAPIError('Invalid filename: path traversal (..) not allowed');
    }
    if (filename.includes('/') || filename.includes('\\')) {
        throw new FileAPIError('Invalid filename: directory separators not allowed');
    }
    // Block null bytes and control characters (ASCII 0-31 and 127)
    if (/[\x00-\x1f\x7f]/.test(filename)) {
        throw new FileAPIError('Invalid filename: control characters not allowed');
    }
    // Must not be empty after trimming
    if (!filename.trim()) {
        throw new FileAPIError('Invalid filename: cannot be empty or whitespace');
    }
}

// ============================================================================
// ERROR CLASSES
// ============================================================================

export class FileAPIError extends Error {
    constructor(message, statusCode = null, originalError = null) {
        super(message);
        this.name = 'FileAPIError';
        this.statusCode = statusCode;
        this.originalError = originalError;
    }
}

export class FileNotFoundError extends FileAPIError {
    constructor(filename) {
        super(`File not found: ${filename}`, 404);
        this.name = 'FileNotFoundError';
        this.filename = filename;
    }
}

// ============================================================================
// CORE FILE OPERATIONS
// ============================================================================

/**
 * Upload a file to the server
 * @param {string} filename - File name (will be prefixed if not already)
 * @param {string} base64Data - Base64 encoded file content
 * @returns {Promise<string>} Server path (e.g., "user/files/storymode-xxx.png")
 * @throws {FileAPIError} On upload failure
 */
export async function uploadFile(filename, base64Data) {
    const safeName = ensurePrefix(filename);

    try {
        const response = await fetch('/api/files/upload', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                name: safeName,
                data: base64Data,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new FileAPIError(`Upload failed: ${errorText}`, response.status);
        }

        const data = await response.json();
        return data.path;
    } catch (error) {
        if (error instanceof FileAPIError) throw error;
        throw new FileAPIError(`Upload failed: ${error.message}`, null, error);
    }
}

/**
 * Download a file as text
 * @param {string} filename - File name or full path
 * @returns {Promise<string>} File content as text
 * @throws {FileNotFoundError} If file doesn't exist
 * @throws {FileAPIError} On download failure
 */
export async function downloadFile(filename) {
    const url = toFileUrl(filename);

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: getRequestHeaders(),
        });

        if (response.status === 404) {
            throw new FileNotFoundError(filename);
        }

        if (!response.ok) {
            const errorText = await response.text();
            throw new FileAPIError(`Download failed: ${errorText}`, response.status);
        }

        return await response.text();
    } catch (error) {
        if (error instanceof FileAPIError) throw error;
        throw new FileAPIError(`Download failed: ${error.message}`, null, error);
    }
}

/**
 * Download a file as Blob
 * @param {string} filename - File name or full path
 * @returns {Promise<Blob>} File content as Blob
 * @throws {FileNotFoundError} If file doesn't exist
 * @throws {FileAPIError} On download failure
 */
export async function downloadFileAsBlob(filename) {
    const url = toFileUrl(filename);

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: getRequestHeaders(),
        });

        if (response.status === 404) {
            throw new FileNotFoundError(filename);
        }

        if (!response.ok) {
            const errorText = await response.text();
            throw new FileAPIError(`Download failed: ${errorText}`, response.status);
        }

        return await response.blob();
    } catch (error) {
        if (error instanceof FileAPIError) throw error;
        throw new FileAPIError(`Download failed: ${error.message}`, null, error);
    }
}

/**
 * Delete a file from the server
 * @param {string} filename - File name or full path
 * @returns {Promise<boolean>} True if deleted successfully
 * @throws {FileAPIError} On delete failure
 */
export async function deleteFile(filename) {
    const path = toFilePath(filename);

    try {
        const response = await fetch('/api/files/delete', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ path }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new FileAPIError(`Delete failed: ${errorText}`, response.status);
        }

        return true;
    } catch (error) {
        if (error instanceof FileAPIError) throw error;
        throw new FileAPIError(`Delete failed: ${error.message}`, null, error);
    }
}

/**
 * Verify multiple files exist on the server
 * @param {string[]} filenames - Array of file names or paths
 * @returns {Promise<Object>} Map of filename to existence boolean
 * @throws {FileAPIError} On verification failure
 */
export async function verifyFiles(filenames) {
    const urls = filenames.map(toFileUrl);

    try {
        const response = await fetch('/api/files/verify', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ urls }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new FileAPIError(`Verify failed: ${errorText}`, response.status);
        }

        return await response.json();
    } catch (error) {
        if (error instanceof FileAPIError) throw error;
        throw new FileAPIError(`Verify failed: ${error.message}`, null, error);
    }
}

// ============================================================================
// JSON HELPERS
// ============================================================================

/**
 * Upload a JSON object as a file
 * @param {string} filename - File name
 * @param {Object} obj - Object to serialize
 * @returns {Promise<string>} Server path
 */
export async function uploadJSON(filename, obj) {
    const json = JSON.stringify(obj, null, 2);
    const base64 = btoa(unescape(encodeURIComponent(json)));
    return uploadFile(filename, base64);
}

/**
 * Download and parse a JSON file
 * @param {string} filename - File name
 * @returns {Promise<Object>} Parsed JSON object
 * @throws {FileNotFoundError} If file doesn't exist
 * @throws {FileAPIError} On download or parse failure
 */
export async function downloadJSON(filename) {
    const text = await downloadFile(filename);
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new FileAPIError(`JSON parse failed: ${error.message}`, null, error);
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Ensure filename has the storymode prefix
 * Validates filename for path traversal before processing
 * @param {string} filename - Original filename
 * @returns {string} Prefixed filename
 * @throws {FileAPIError} If filename contains unsafe characters
 */
function ensurePrefix(filename) {
    validateFilename(filename);
    if (filename.startsWith(FILE_PREFIX)) return filename;
    return FILE_PREFIX + filename;
}

/**
 * Convert filename to server file path
 * @param {string} filename - File name
 * @returns {string} Server path (e.g., "user/files/filename")
 */
function toFilePath(filename) {
    if (filename.startsWith('user/files/')) return filename;
    if (filename.startsWith('/user/files/')) return filename.substring(1);
    return `user/files/${ensurePrefix(filename)}`;
}

/**
 * Convert filename to URL for downloading
 * @param {string} filename - File name
 * @returns {string} URL path (e.g., "/user/files/filename")
 */
function toFileUrl(filename) {
    const path = toFilePath(filename);
    return path.startsWith('/') ? path : '/' + path;
}

/**
 * Get the manifest filename
 * @returns {string} Manifest filename
 */
export function getManifestFilename() {
    return MANIFEST_FILENAME;
}

/**
 * Convert File/Blob to base64
 * @param {File|Blob} file - File or Blob to convert
 * @returns {Promise<string>} Base64 string (without data URL prefix)
 */
export async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result;
            // Remove data URL prefix (e.g., "data:image/png;base64,")
            const base64 = dataUrl.split(',')[1];
            resolve(base64);
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

/**
 * Check if a file exists on the server
 * @param {string} filename - File name
 * @returns {Promise<boolean>} True if file exists
 */
export async function fileExists(filename) {
    try {
        const result = await verifyFiles([filename]);
        const url = toFileUrl(filename);
        return result[url] === true;
    } catch {
        return false;
    }
}
