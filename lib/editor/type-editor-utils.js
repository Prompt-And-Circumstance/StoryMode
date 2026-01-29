import { extension_settings } from '/scripts/extensions.js';
import { download } from '/scripts/utils.js';

// Access SillyTavern globals lazily at runtime to avoid race conditions during module load
const getSillyTavernGlobals = () => ({
    extension_settings,
    toastr: window.toastr,
});

/**
 * Export a single style as a JSON file
 * @param {Object} style - The style object to export
 * @param {string} type - 'author' or 'story'
 */
function exportSingleStyle(style, type) {
    const suffix = type === 'author' ? 'author_style' : 'story_type';
    const filename = `${style.id}.${suffix}.json`;
    const json = JSON.stringify([style], null, 2);

    download(json, filename, 'application/json');

    const { toastr } = getSillyTavernGlobals();
    toastr.success(`Exported "${style.name}" to ${filename}`);
}

export { getSillyTavernGlobals, exportSingleStyle };
