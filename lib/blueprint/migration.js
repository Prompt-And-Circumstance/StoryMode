/**
 * Migration Module - IndexedDB to File Storage
 *
 * Handles one-time migration from IndexedDB-based storage to file-based storage.
 * Shows prompt to user before migrating.
 *
 * @module migration
 * @version 1.0.0
 */

import { saveBlueprintToFile } from './file-storage.js';
import { encodeBlueprintAsPNG } from './storage.js';
import { loadManifest, hasEntry, flushManifest } from './manifest.js';
import { callGenericPopup, POPUP_TYPE, POPUP_RESULT } from '/scripts/popup.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const MIGRATION_FLAG = 'storymode-migration-v2-complete';
const OLD_DB_NAME = 'StoryModeBlueprintDB';
const OLD_DB_VERSION = 1;
const OLD_STORES = {
    BLUEPRINTS: 'blueprints',
    SETTINGS: 'librarySettings',
    PLAY_STATS: 'playStats',
};

// ============================================================================
// MIGRATION CHECK
// ============================================================================

/**
 * Check if migration is needed
 * @returns {Promise<boolean>} True if migration needed
 */
export async function checkMigrationNeeded() {
    // Already migrated?
    if (localStorage.getItem(MIGRATION_FLAG)) {
        return false;
    }

    // Check if IndexedDB has data
    try {
        const hasData = await hasIndexedDBData();
        return hasData;
    } catch (error) {
        console.warn('[Migration] Could not check IndexedDB:', error);
        return false;
    }
}

/**
 * Check if IndexedDB has blueprint data
 * @returns {Promise<boolean>}
 */
async function hasIndexedDBData() {
    return new Promise((resolve) => {
        if (!window.indexedDB) {
            resolve(false);
            return;
        }

        const request = indexedDB.open(OLD_DB_NAME, OLD_DB_VERSION);

        request.onerror = () => resolve(false);

        request.onsuccess = () => {
            const db = request.result;

            if (!db.objectStoreNames.contains(OLD_STORES.BLUEPRINTS)) {
                db.close();
                resolve(false);
                return;
            }

            const tx = db.transaction([OLD_STORES.BLUEPRINTS], 'readonly');
            const store = tx.objectStore(OLD_STORES.BLUEPRINTS);
            const countRequest = store.count();

            countRequest.onsuccess = () => {
                db.close();
                resolve(countRequest.result > 0);
            };

            countRequest.onerror = () => {
                db.close();
                resolve(false);
            };
        };

        request.onupgradeneeded = (event) => {
            // DB doesn't exist or needs upgrade - close it
            event.target.transaction.abort();
            resolve(false);
        };
    });
}

// ============================================================================
// MIGRATION EXECUTION
// ============================================================================

/**
 * Perform migration from IndexedDB to file storage
 * @param {Function} progressCallback - Optional callback for progress updates
 * @returns {Promise<{success: boolean, migrated: number, failed: number, errors: string[]}>}
 */
export async function migrateFromIndexedDB(progressCallback = null) {
    const result = {
        success: false,
        migrated: 0,
        failed: 0,
        errors: [],
    };

    // Ensure manifest is loaded
    await loadManifest();

    // Get all blueprints from IndexedDB
    let blueprints;
    try {
        blueprints = await getAllFromIndexedDB();
    } catch (error) {
        result.errors.push(`Failed to read IndexedDB: ${error.message}`);
        return result;
    }

    if (blueprints.length === 0) {
        result.success = true;
        markMigrationComplete();
        return result;
    }

    const total = blueprints.length;
    progressCallback?.({ phase: 'start', total });

    // Migrate each blueprint
    for (let i = 0; i < blueprints.length; i++) {
        const blueprint = blueprints[i];

        try {
            // Skip if already migrated
            if (hasEntry(blueprint.blueprint_id)) {
                result.migrated++;
                continue;
            }

            // Save to file storage
            await saveBlueprintToFile(blueprint);
            result.migrated++;

            progressCallback?.({
                phase: 'progress',
                current: i + 1,
                total,
                title: blueprint.userMetadata?.title || blueprint.blueprint_id,
            });

        } catch (error) {
            console.error(`[Migration] Failed to migrate ${blueprint.blueprint_id}:`, error);
            result.failed++;
            result.errors.push(`${blueprint.userMetadata?.title || blueprint.blueprint_id}: ${error.message}`);
        }
    }

    // Flush manifest after all migrations
    await flushManifest();

    result.success = result.failed === 0;

    // Mark migration complete even if some failed
    // User can re-import failed ones manually
    markMigrationComplete();

    progressCallback?.({ phase: 'complete', result });

    return result;
}

/**
 * Get all blueprints from IndexedDB
 * @returns {Promise<Object[]>}
 */
async function getAllFromIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(OLD_DB_NAME, OLD_DB_VERSION);

        request.onerror = () => reject(request.error);

        request.onsuccess = () => {
            const db = request.result;

            if (!db.objectStoreNames.contains(OLD_STORES.BLUEPRINTS)) {
                db.close();
                resolve([]);
                return;
            }

            const tx = db.transaction([OLD_STORES.BLUEPRINTS], 'readonly');
            const store = tx.objectStore(OLD_STORES.BLUEPRINTS);
            const getAllRequest = store.getAll();

            getAllRequest.onsuccess = () => {
                db.close();
                resolve(getAllRequest.result || []);
            };

            getAllRequest.onerror = () => {
                db.close();
                reject(getAllRequest.error);
            };
        };
    });
}

/**
 * Mark migration as complete
 */
function markMigrationComplete() {
    localStorage.setItem(MIGRATION_FLAG, new Date().toISOString());
}

/**
 * Reset migration flag (for testing)
 */
export function resetMigrationFlag() {
    localStorage.removeItem(MIGRATION_FLAG);
}

// ============================================================================
// MIGRATION UI
// ============================================================================

/**
 * Show migration prompt and handle migration
 * @returns {Promise<boolean>} True if migration completed or skipped
 */
export async function promptAndMigrate() {
    // Check if migration needed
    if (!(await checkMigrationNeeded())) {
        return true;
    }

    // Count blueprints
    let count = 0;
    try {
        const blueprints = await getAllFromIndexedDB();
        count = blueprints.length;
    } catch {
        count = 0;
    }

    if (count === 0) {
        markMigrationComplete();
        return true;
    }

    // Show confirmation
    const message = `Story Mode has ${count} blueprint(s) in browser storage that need to be migrated to server storage.\n\n` +
        `This one-time migration will:\n` +
        `• Copy your blueprints to the server\n` +
        `• Make them accessible across browsers\n` +
        `• Preserve all your data\n\n` +
        `Migrate now, or skip (you can migrate later from Settings)?`;

    const proceed = await callGenericPopup(
        message,
        POPUP_TYPE.CONFIRM,
        '',
        { okButton: 'Migrate Now', cancelButton: 'Skip' }
    );

    if (proceed !== POPUP_RESULT.AFFIRMATIVE) {
        return true; // Allow app to continue
    }

    // Show progress
    const progressDiv = document.createElement('div');
    progressDiv.id = 'storymode-migration-progress';
    progressDiv.innerHTML = `
        <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                    background: var(--SmartThemeBlurTintColor, #000); padding: 20px; border-radius: 8px;
                    z-index: 10000; min-width: 300px; text-align: center;
                    border: 1px solid var(--SmartThemeBorderColor, #333);">
            <h3 style="margin: 0 0 15px 0;">Migrating Blueprints</h3>
            <div id="migration-status">Starting migration...</div>
            <div style="margin-top: 10px; height: 20px; background: var(--SmartThemeQuoteColor, #333);
                        border-radius: 4px; overflow: hidden;">
                <div id="migration-bar" style="height: 100%; width: 0%; background: var(--SmartThemeBodyColor, #4a9);
                     transition: width 0.3s;"></div>
            </div>
        </div>
    `;
    document.body.appendChild(progressDiv);

    try {
        const result = await migrateFromIndexedDB((progress) => {
            const status = document.getElementById('migration-status');
            const bar = document.getElementById('migration-bar');

            if (progress.phase === 'progress') {
                status.textContent = `Migrating: ${progress.title}`;
                bar.style.width = `${(progress.current / progress.total) * 100}%`;
            } else if (progress.phase === 'complete') {
                status.textContent = 'Migration complete!';
                bar.style.width = '100%';
            }
        });

        // Show result briefly
        const status = document.getElementById('migration-status');
        if (result.success) {
            status.textContent = `Migrated ${result.migrated} blueprint(s) successfully!`;
        } else {
            status.textContent = `Migrated ${result.migrated}, failed ${result.failed}. Check console for details.`;
        }

        await new Promise(resolve => setTimeout(resolve, 2000));

        return result.success;

    } finally {
        progressDiv.remove();
    }
}
