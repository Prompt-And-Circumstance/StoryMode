/**
 * Blueprint Export Module
 *
 * Orchestrates export process:
 * 1. Gather embedded resources
 * 2. Generate PNG with metadata
 * 3. Trigger download
 */

import { encodeExtendedBlueprintPNG } from './blueprint-png-encoder.js';
import {
    extractCharactersForExport,
    extractPersonasForExport,
    getBlueprintCharacterNames
} from './blueprint-character-linker.js';
import { getStoryTypes, getAuthorStyles } from './state-manager.js';
import { sanitizeFilename, downloadBlob, estimateDataURLSize, formatBytes, getBlueprintCoverUrl } from './blueprint-utils.js';

const DEFAULT_EXPORT_OPTIONS = {
    includeCharacters: true,
    includePersonas: true,
    includeCoverGallery: true,
    includeStoryType: true,
    includeAuthorStyle: true,
    filename: null,
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Estimate blueprint export size
 * @param {Object} blueprint
 * @param {Object} options
 * @returns {Promise<number>} Estimated size in bytes
 */
async function estimateExportSize(blueprint, options) {
    let estimatedSize = 0;

    // Estimate blueprint JSON size (~50KB base)
    estimatedSize += 50 * 1024;

    // Estimate embedded resources
    if (options.includeCharacters && blueprint.character_arcs) {
        const characterNames = getBlueprintCharacterNames(blueprint);
        // Assume ~500KB per character card
        estimatedSize += characterNames.length * 500 * 1024;
    }

    if (options.includePersonas && blueprint.selectedPersonas) {
        // Assume ~100KB per persona avatar
        estimatedSize += blueprint.selectedPersonas.length * 100 * 1024;
    }

    if (options.includeCoverGallery && blueprint.metadata?.coverGallery) {
        // Assume ~200KB per cover image
        estimatedSize += blueprint.metadata.coverGallery.length * 200 * 1024;
    }

    return estimatedSize;
}

/**
 * Export blueprint as PNG
 * @param {Object} blueprint
 * @param {Object} options
 * @returns {Promise<{success: boolean, filename?: string, error?: string}>}
 */
export async function exportBlueprintAsPNG(blueprint, options = {}) {
    const opts = { ...DEFAULT_EXPORT_OPTIONS, ...options };


    try {
        // Estimate export size (SEC-008)
        const estimatedSize = await estimateExportSize(blueprint, opts);

        if (estimatedSize > MAX_FILE_SIZE) {
            const warning = `Estimated export size is ${formatBytes(estimatedSize)}. ` +
                `This may create a large file. Continue?`;

            if (!confirm(warning)) {
                return { success: false, error: 'Export cancelled by user' };
            }
        }

        // Gather embedded resources
        const enrichedBlueprint = await gatherEmbeddedResources(blueprint, opts);

        // Get primary cover
        const coverCanvas = await getPrimaryCoverCanvas(enrichedBlueprint);

        // Encode PNG
        const pngBlob = await encodeExtendedBlueprintPNG(enrichedBlueprint, coverCanvas);

        // Warn if actual size exceeds limit
        if (pngBlob.size > MAX_FILE_SIZE) {
            console.warn(`[Story Mode] Exported file size (${formatBytes(pngBlob.size)}) exceeds recommended limit (${formatBytes(MAX_FILE_SIZE)})`);
        }

        // Generate filename
        const filename = opts.filename || generateExportFilename(blueprint);

        // Download
        downloadBlob(pngBlob, filename);

        console.log(`[Story Mode] Exported blueprint: ${filename} (${formatBytes(pngBlob.size)})`);
        return { success: true, filename: filename };

    } catch (error) {
        console.error('[Story Mode] Export failed:', error);
        return { success: false, error: error.message };
    } finally {
    }
}

/**
 * Gather embedded resources
 * @param {Object} blueprint
 * @param {Object} options
 * @returns {Promise<Object>} Blueprint with embeddedResources
 */
async function gatherEmbeddedResources(blueprint, options) {
    const enriched = { ...blueprint };
    enriched.embeddedResources = {};

    // Characters
    if (options.includeCharacters) {
        const characterNames = getBlueprintCharacterNames(blueprint);
        enriched.embeddedResources.characters = await extractCharactersForExport(characterNames);
    }

    // Personas (if blueprint has persona selections)
    if (options.includePersonas && blueprint.selectedPersonas) {
        enriched.embeddedResources.personas = await extractPersonasForExport(blueprint.selectedPersonas);
    }

    // Cover gallery
    if (options.includeCoverGallery && blueprint.metadata?.coverGallery) {
        enriched.embeddedResources.coverGallery = blueprint.metadata.coverGallery;
    }

    // Story type
    if (options.includeStoryType) {
        const storyTypes = getStoryTypes();
        const storyType = storyTypes.find(st => st.id === blueprint.story_type_id);
        if (storyType) {
            enriched.embeddedResources.storyType = storyType;
        }
    }

    // Author style
    if (options.includeAuthorStyle && blueprint.authorStyleId) {
        const authorStyles = getAuthorStyles();
        const authorStyle = authorStyles.find(as => as.id === blueprint.authorStyleId);
        if (authorStyle) {
            enriched.embeddedResources.authorStyle = authorStyle;
        }
    }

    return enriched;
}

/**
 * Get primary cover canvas
 * @param {Object} blueprint
 * @returns {Promise<HTMLCanvasElement>}
 */
async function getPrimaryCoverCanvas(blueprint) {
    // Get cover URL using utility (handles gallery, legacy formats, etc.)
    const coverUrl = getBlueprintCoverUrl(blueprint);

    if (coverUrl) {
        try {
            return await loadImageToCanvas(coverUrl);
        } catch (error) {
            console.warn('[Story Mode] Failed to load cover image, using default:', error.message);
        }
    }

    // Fallback: generate default cover
    return await generateDefaultCover(blueprint);
}

/**
 * Generate export filename
 * @param {Object} blueprint
 * @returns {string}
 */
function generateExportFilename(blueprint) {
    const baseName = blueprint.story_type_name || 'blueprint';
    const sanitized = sanitizeFilename(baseName);
    const timestamp = Date.now();
    return `story-blueprint-${sanitized}-${timestamp}.png`;
}

/**
 * Load image to canvas
 * @param {string} url
 * @returns {Promise<HTMLCanvasElement>}
 */
async function loadImageToCanvas(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            resolve(canvas);
        };
        img.onerror = reject;
        img.src = url;
    });
}

/**
 * Generate default cover (placeholder)
 * @param {Object} blueprint
 * @returns {Promise<HTMLCanvasElement>}
 */
async function generateDefaultCover(blueprint) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 768;
    const ctx = canvas.getContext('2d');

    // Draw gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, 768);
    gradient.addColorStop(0, '#2C3E50');
    gradient.addColorStop(1, '#34495E');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 768);

    // Draw title
    ctx.fillStyle = '#ECF0F1';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(blueprint.story_type_name || 'Story Blueprint', 256, 384);

    return canvas;
}

/**
 * Generate export blob (for auto-export, no download)
 * @param {Object} blueprint
 * @returns {Promise<Blob>}
 */
export async function generateExportBlob(blueprint) {
    const enriched = await gatherEmbeddedResources(blueprint, DEFAULT_EXPORT_OPTIONS);
    const coverCanvas = await getPrimaryCoverCanvas(enriched);
    return await encodeExtendedBlueprintPNG(enriched, coverCanvas);
}
