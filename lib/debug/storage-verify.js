/**
 * Storage Migration Verification Debug Utility
 *
 * Checks each data key for presence in File API and browser storage.
 * Run from browser console: window.StoryModeDebug.verifyStorageMigration()
 *
 * @module debug/storage-verify
 */

const CHECKS = [
    { name: 'Story Types', file: 'storymode-story-types.json', lfKey: 'story_mode_story_types', source: 'localforage' },
    { name: 'Author Styles', file: 'storymode-author-styles.json', lfKey: 'story_mode_author_styles', source: 'localforage' },
    { name: 'Original Story Types', file: 'storymode-original-story-types.json', lfKey: 'story_mode_original_story_types', source: 'localforage' },
    { name: 'Original Author Styles', file: 'storymode-original-author-styles.json', lfKey: 'story_mode_original_author_styles', source: 'localforage' },
    { name: 'Play Stats', file: 'storymode-play-stats.json', lsKey: 'storymode-play-stats', source: 'localStorage' },
];

/**
 * Check File API for a given filename.
 * @returns {string} Status string (e.g. "✅ 12 item(s)" or "❌ Not found")
 */
async function checkFileAPI(filename, downloadJSON, FileNotFoundError) {
    try {
        const data = await downloadJSON(filename);
        const count = Array.isArray(data) ? data.length : Object.keys(data).length;
        return `✅ ${count} item(s)`;
    } catch (e) {
        return (e instanceof FileNotFoundError) ? '❌ Not found' : `⚠️ Error: ${e.message}`;
    }
}

/**
 * Check browser storage (localforage or localStorage) for a given key.
 * @returns {Promise<string>} Status string
 */
async function checkBrowserStorage(check) {
    if (check.source === 'localforage' && typeof localforage !== 'undefined') {
        try {
            const stored = await localforage.getItem(check.lfKey);
            const count = Array.isArray(stored) ? stored.length : 0;
            return count > 0 ? `📦 ${count} item(s)` : '(empty)';
        } catch {
            return '⚠️ Error';
        }
    }

    if (check.source === 'localStorage') {
        const raw = localStorage.getItem(check.lsKey);
        if (!raw) return '(empty)';
        try {
            const count = Object.keys(JSON.parse(raw)).length;
            return `📦 ${count} item(s)`;
        } catch {
            return '⚠️ Parse error';
        }
    }

    return '—';
}

/**
 * Verify File API storage migration status for all data keys.
 * Outputs a console.table showing File API vs browser storage state.
 */
export async function verifyStorageMigration() {
    const { downloadJSON, FileNotFoundError } = await import('../blueprint/file-api.js');

    const results = [];

    for (const check of CHECKS) {
        const fileAPI = await checkFileAPI(check.file, downloadJSON, FileNotFoundError);
        const browser = await checkBrowserStorage(check);

        let status;
        if (fileAPI.startsWith('✅')) {
            status = '✅ Migrated';
        } else if (browser !== '(empty)' && !browser.startsWith('⚠️')) {
            status = '⏳ Pending';
        } else {
            status = '— No data';
        }

        results.push({ name: check.name, fileAPI, browser, status });
    }

    console.table(results);
    return results;
}

// Register on window.StoryModeDebug
if (typeof window !== 'undefined') {
    window.StoryModeDebug = window.StoryModeDebug || {};
    window.StoryModeDebug.verifyStorageMigration = verifyStorageMigration;
}
