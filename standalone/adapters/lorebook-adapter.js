/**
 * Lorebook Adapter Module
 * Provides access to ST worldinfo/lorebooks with graceful degradation
 *
 * IMPORTANT: Uses relative URLs since standalone editor is served from
 * within SillyTavern (same-origin).
 */

import { getRequestHeaders, isConnected } from './connection-bridge.js';
import { showError, showWarning } from './notification-adapter.js';

/**
 * Fetch list of available lorebooks from ST
 * @returns {Promise<Array<{name: string, file_id: string}>>}
 */
export async function getLorebookList() {
    if (!isConnected()) {
        console.warn('[Lorebook Adapter] Not connected to SillyTavern');
        return [];
    }

    try {
        const response = await fetch('/api/worldinfo/list', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({}),
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('[Lorebook Adapter] Failed to fetch lorebook list:', error);
        showWarning('Could not load lorebooks from SillyTavern');
        return [];
    }
}

/**
 * Fetch a specific lorebook by name
 * @param {string} name - Lorebook name
 * @returns {Promise<Object|null>} Lorebook data or null
 */
export async function getLorebook(name) {
    if (!isConnected()) {
        return null;
    }

    try {
        const response = await fetch('/api/worldinfo/get', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ name }),
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`[Lorebook Adapter] Failed to fetch lorebook "${name}":`, error);
        return null;
    }
}

/**
 * Simplify a ST worldinfo entry for blueprint embedding
 * @param {Object} entry - Full ST WIEntry object
 * @param {string} worldName - Source lorebook name
 * @returns {Object} Simplified entry
 */
export function simplifyEntry(entry, worldName) {
    return {
        uid: entry.uid,
        key: Array.isArray(entry.key) ? entry.key : [],
        comment: entry.comment || '',
        content: entry.content || '',
        constant: entry.constant || false,
        order: entry.order || 100,
        disable: entry.disable || false,
        extensions: {
            source_world: worldName,
            selected_for_generation: true,
            generation_timestamp: new Date().toISOString(),
        },
    };
}

/**
 * Convert lorebook entries to a unified structure for wizard
 * @param {Array<{name: string, data: Object}>} lorebooks
 * @returns {Array<Object>} Flat list of entries with metadata
 */
export function flattenLorebookEntries(lorebooks) {
    const entries = [];

    for (const { name, data } of lorebooks) {
        if (!data || !data.entries) continue;

        for (const [uid, entry] of Object.entries(data.entries)) {
            entries.push({
                world: name,
                uid: parseInt(uid),
                entry: entry,
                // Computed fields for UI
                displayName: entry.comment || `Entry ${uid}`,
                keywords: Array.isArray(entry.key) ? entry.key.join(', ') : '',
                contentPreview: (entry.content || '').substring(0, 100),
                isDisabled: entry.disable || false,
            });
        }
    }

    return entries;
}

/**
 * Build embedded lorebook from selected entries
 * @param {Array<Object>} selectedEntries - Entries from flattenLorebookEntries
 * @returns {Object|null} Embedded lorebook object
 */
export function buildEmbeddedLorebook(selectedEntries) {
    if (!selectedEntries || selectedEntries.length === 0) return null;

    const sourceWorlds = [...new Set(selectedEntries.map(e => e.world))];

    return {
        name: sourceWorlds.length === 1
            ? sourceWorlds[0]
            : `Blueprint Lorebook (${sourceWorlds.length} sources)`,
        entries: selectedEntries.map(e => simplifyEntry(e.entry, e.world)),
        metadata: {
            source_worlds: sourceWorlds,
            selected_at_generation: true,
            generation_timestamp: new Date().toISOString(),
        },
    };
}

/**
 * Check if connected to ST and lorebooks are available
 * @returns {Promise<boolean>}
 */
export async function isLorebookAccessAvailable() {
    const lorebooks = await getLorebookList();
    return lorebooks.length > 0;
}
