/**
 * Data Migration v3 - localforage/localStorage to File API
 *
 * Migrates story types, author styles, original data, and play stats
 * from browser-local storage to server-backed File API storage.
 *
 * Migration chain:
 *   v1: extension_settings -> localforage  (state-manager.js)
 *   v2: IndexedDB -> File API              (migration.js, blueprints)
 *   v3: localforage/localStorage -> File API (this file)
 *
 * Uses no migration flag — checks actual state. The fallback chain in
 * file-backed-data.js naturally migrates data on first successful read.
 * This module provides an explicit user-facing dialog for bulk migration.
 *
 * @module data-migration-v3
 * @version 1.0.0
 */

import { Popup, POPUP_TYPE } from '/scripts/popup.js';
import { downloadJSON, uploadJSON, FileNotFoundError } from '../blueprint/file-api.js';
import { exportStoryTypes, exportAuthorStyles } from '../editor/import-export.js';
import { sanitizeObject } from '../utils/import-helpers.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const FILENAMES = {
    storyTypes: 'storymode-story-types.json',
    authorStyles: 'storymode-author-styles.json',
    originalStoryTypes: 'storymode-original-story-types.json',
    originalAuthorStyles: 'storymode-original-author-styles.json',
    playStats: 'storymode-play-stats.json',
};

const LOCALFORAGE_KEYS = {
    storyTypes: 'story_mode_story_types',
    authorStyles: 'story_mode_author_styles',
    originalStoryTypes: 'story_mode_original_story_types',
    originalAuthorStyles: 'story_mode_original_author_styles',
};

const PLAY_STATS_LOCALSTORAGE_KEY = 'storymode-play-stats';

// ============================================================================
// MIGRATION CHECK
// ============================================================================

/**
 * Check if migration is needed by testing for File API data.
 * Returns true only if localforage has data but File API doesn't.
 */
export async function checkDataUpgradeNeeded() {
    // If File API has story types, migration is done
    try {
        await downloadJSON(FILENAMES.storyTypes);
        return false;
    } catch (e) {
        if (!(e instanceof FileNotFoundError)) {
            console.warn('[Story Mode] Migration check: File API error, skipping', e.message);
            return false;
        }
    }

    // Check if localforage has data to migrate
    if (typeof localforage === 'undefined') return false;
    try {
        const stored = await localforage.getItem(LOCALFORAGE_KEYS.storyTypes);
        return !!(stored && Array.isArray(stored) && stored.length > 0);
    } catch {
        return false;
    }
}

// ============================================================================
// MIGRATION DIALOG
// ============================================================================

/** Show upgrade dialog if migration is needed. Safe to call unconditionally. */
export async function promptAndUpgrade() {
    const needed = await checkDataUpgradeNeeded();
    if (!needed) return true;
    return showUpgradeDialog();
}

/** Build and show the upgrade dialog. */
async function showUpgradeDialog() {
    const content = $(buildUpgradeDialogHtml());

    return new Promise((resolve) => {
        const popup = new Popup(content, POPUP_TYPE.TEXT, 'Storage Upgrade', {
            okButton: false,
            cancelButton: false,
            wide: true,
        });

        content.find('#v3_export_story_types').on('click', () => exportStoryTypes());
        content.find('#v3_export_author_styles').on('click', () => exportAuthorStyles());

        content.find('#v3_proceed_upgrade').on('click', async () => {
            const btn = content.find('#v3_proceed_upgrade');
            btn.prop('disabled', true).html('<i class="fa-solid fa-circle-notch fa-spin"></i> Upgrading...');

            content.find('.v3-export-section').hide();
            content.find('.v3-progress-section').show();

            const result = await executeMigration(content);
            showMigrationResult(content, result);

            setTimeout(() => {
                popup.complete(1);
                resolve(true);
            }, 2000);
        });

        content.find('#v3_skip_upgrade').on('click', () => {
            popup.complete(0);
            resolve(true);
        });

        popup.show().then((popupResult) => {
            if (popupResult === 0 || popupResult === null) resolve(true);
        });
    });
}

// ============================================================================
// DIALOG HTML
// ============================================================================

function buildUpgradeDialogHtml() {
    return `
<div class="v3-upgrade-dialog" style="padding: 15px; max-width: 500px; margin: 0 auto;">
    <div class="v3-description" style="margin-bottom: 15px;">
        <p style="margin-bottom: 10px;">
            This version of Story Mode stores custom story types and author styles
            on the server, making them accessible across all your devices and browsers.
        </p>
        <p style="margin-bottom: 10px;">
            <strong>We recommend exporting a backup before proceeding.</strong>
        </p>
    </div>

    <div class="v3-export-section" style="display: flex; gap: 10px; justify-content: center; margin-bottom: 20px; flex-wrap: wrap;">
        <button id="v3_export_story_types" class="menu_button">
            <i class="fa-solid fa-download"></i> Export Story Types
        </button>
        <button id="v3_export_author_styles" class="menu_button">
            <i class="fa-solid fa-download"></i> Export Author Styles
        </button>
    </div>

    <div class="v3-progress-section" style="display: none; margin-bottom: 15px;">
        <div id="v3_progress_status" style="text-align: center; margin-bottom: 10px;">
            Migrating data...
        </div>
        <div style="height: 20px; background: var(--SmartThemeQuoteColor, #333);
                    border-radius: 4px; overflow: hidden;">
            <div id="v3_progress_bar" style="height: 100%; width: 0%;
                 background: var(--SmartThemeBodyColor, #4a9);
                 transition: width 0.3s;"></div>
        </div>
    </div>

    <div style="display: flex; gap: 10px; justify-content: center;">
        <button id="v3_proceed_upgrade" class="menu_button">
            <i class="fa-solid fa-check"></i> Proceed with Upgrade
        </button>
        <button id="v3_skip_upgrade" class="menu_button">
            <i class="fa-solid fa-forward"></i> Skip for Now
        </button>
    </div>
</div>
`;
}

// ============================================================================
// MIGRATION EXECUTION
// ============================================================================

/** Execute migration from browser storage to File API. */
async function executeMigration(content) {
    const result = { migrated: 0, failed: 0, total: 0, errors: [] };

    const tasks = [
        { key: LOCALFORAGE_KEYS.storyTypes, filename: FILENAMES.storyTypes, label: 'Story Types', source: 'localforage' },
        { key: LOCALFORAGE_KEYS.authorStyles, filename: FILENAMES.authorStyles, label: 'Author Styles', source: 'localforage' },
        { key: LOCALFORAGE_KEYS.originalStoryTypes, filename: FILENAMES.originalStoryTypes, label: 'Original Story Types', source: 'localforage' },
        { key: LOCALFORAGE_KEYS.originalAuthorStyles, filename: FILENAMES.originalAuthorStyles, label: 'Original Author Styles', source: 'localforage' },
        { key: PLAY_STATS_LOCALSTORAGE_KEY, filename: FILENAMES.playStats, label: 'Play Stats', source: 'localStorage' },
    ];

    result.total = tasks.length;

    for (let i = 0; i < tasks.length; i++) {
        updateProgress(content, tasks[i].label, i, tasks.length);

        try {
            const data = await readFromBrowserStorage(tasks[i].key, tasks[i].source);
            if (data !== null) {
                await uploadJSON(tasks[i].filename, data);
                result.migrated++;
            }
        } catch (e) {
            console.error(`[Story Mode] Migration failed for ${tasks[i].label}:`, e);
            result.failed++;
            result.errors.push(`${tasks[i].label}: ${e.message}`);
        }
    }

    updateProgress(content, 'Complete', tasks.length, tasks.length);
    return result;
}

/** Read data from localforage or localStorage, returning null if empty. */
async function readFromBrowserStorage(key, source) {
    if (source === 'localforage') {
        if (typeof localforage === 'undefined') return null;
        const data = await localforage.getItem(key);
        return (Array.isArray(data) && data.length > 0) ? data : null;
    }

    const raw = localStorage.getItem(key);
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
            sanitizeObject(parsed);
            return parsed;
        }
        return null;
    } catch {
        return null;
    }
}

// ============================================================================
// PROGRESS UI
// ============================================================================

function updateProgress(content, label, current, total) {
    const pct = Math.round((current / total) * 100);
    content.find('#v3_progress_status').text(`Migrating: ${label}`);
    content.find('#v3_progress_bar').css('width', `${pct}%`);
}

function showMigrationResult(content, result) {
    const iconClass = result.failed === 0 ? 'fa-check' : 'fa-exclamation-triangle';
    const iconColor = result.failed === 0 ? 'var(--SmartThemeBodyColor, #4a9)' : 'orange';
    const msg = result.failed === 0
        ? `Upgraded ${result.migrated} item(s) successfully`
        : `Upgraded ${result.migrated}, failed ${result.failed}. Check console for details.`;

    const statusEl = content.find('#v3_progress_status');
    statusEl.empty()
        .append($('<i>').addClass(`fa-solid ${iconClass}`).css('color', iconColor))
        .append(' ')
        .append($('<span>').text(msg));
    content.find('#v3_progress_bar').css('width', '100%');
}
