/**
 * Blueprint Storage Module
 *
 * Primary entry point for blueprint storage and state management.
 * Delegates PNG encoding/decoding to the pure 'codec.js' module.
 * Handles SillyTavern integration (state persistence, context).
 *
 * @module blueprint-storage
 * @version 1.0.0
 */

import {
    generateUUID,
} from './utils.js';

import { getContext } from '/scripts/extensions.js';
import { saveMetadata } from '/script.js';
import { getCurrentSceneIndex } from '../core/state-manager.js';
import { MODULE_NAME } from '../core/index.js';

// Re-export all PNG codec functions
export * from './codec.js';

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
        // console.debug('[Story Mode] Scene index mismatch on load (will sync on save):', { blueprint: blueprintSceneIndex, scenario: scenarioSceneIndex });
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
