/**
 * Blueprint Merger Module - Character Conflict Resolution
 *
 * Handles character conflicts when loading blueprints, providing smart merging
 * and conflict resolution UI.
 *
 * @module blueprint-merger
 * @version 1.0.0
 */

// ============================================================================
// IMPORTS
// ============================================================================

import {
    generateUUID,
    escapeHtml,
    truncateText,
    isCharacterObject,
    normalizeCharacterName,
    validateBlueprint as validateBlueprintUtil,
} from './utils.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Character fields to compare for conflicts */
const CHARACTER_FIELDS = ['description', 'personality', 'scenario', 'firstMes', 'postHistory'];

// ============================================================================
// CHARACTER COMPARISON
// ============================================================================

/**
 * Compare two character fields
 * @param {string} field - Field name
 * @param {*} existing - Existing value
 * @param {*} blueprint - Blueprint value
 * @returns {boolean} True if values differ
 */
function fieldDiffers(field, existing, blueprint) {
    const existingValue = existing[field];
    const blueprintValue = blueprint[field];

    // Both undefined or null, or both same string
    if (!existingValue && !blueprintValue) return false;
    if (!existingValue || !blueprintValue) return true;

    return String(existingValue).trim() !== String(blueprintValue).trim();
}

/**
 * Compare two characters and return differences
 * @param {Object} existing - Existing character
 * @param {Object} blueprint - Blueprint character
 * @returns {Array<Object>|null} Array of differences or null if identical
 */
function compareCharacters(existing, blueprint) {
    const differences = [];

    for (const field of CHARACTER_FIELDS) {
        if (fieldDiffers(field, existing, blueprint)) {
            differences.push({
                field,
                existing: existing[field] || '',
                blueprint: blueprint[field] || '',
            });
        }
    }

    return differences.length > 0 ? differences : null;
}

// ============================================================================
// CHARACTER MERGER CLASS
// ============================================================================

/**
 * Character Merger
 * Detects and resolves character conflicts between blueprints and existing characters
 */
export class CharacterMerger {
    /**
     * Create a character merger
     */
    constructor() {
        this.context = null;
        this.eventSource = null;
    }

    /**
     * Initialize the merger
     */
    init() {
        this.context = window.context || { characters: [], chat: [], chatMetadata: {} };
        this.eventSource = window.eventSource || { on: () => {}, emit: () => {} };
    }

    /**
     * Get current characters from context
     * @returns {Array<Object>} Array of character objects
     */
    getCurrentCharacters() {
        if (!this.context) this.init();
        return this.context?.characters || this.context?.chatMetadata?.characters || [];
    }

    /**
     * Detect character conflicts between blueprint and current chat
     * @param {Object} blueprint - Blueprint object
     * @returns {Promise<Object>} Conflict detection result
     */
    async detectConflicts(blueprint) {
        const currentCharacters = this.getCurrentCharacters();
        const currentNames = new Set(currentCharacters.map(c => normalizeCharacterName(c.name)));

        const blueprintCharacters = blueprint.embeddedResources?.characters || [];
        const conflicts = [];
        const unique = [];
        const missing = [];

        for (const bpChar of blueprintCharacters) {
            if (!isCharacterObject(bpChar)) {
                console.warn('[CharacterMerger] Invalid character object:', bpChar);
                continue;
            }

            const bpName = normalizeCharacterName(bpChar.name);
            const existingChar = currentCharacters.find(c => normalizeCharacterName(c.name) === bpName);

            if (existingChar) {
                const differences = compareCharacters(existingChar, bpChar);
                if (differences) {
                    conflicts.push({ name: bpChar.name, existing: existingChar, blueprint: bpChar, differences });
                } else {
                    unique.push({ name: bpChar.name, status: 'identical' });
                }
            } else {
                missing.push(bpChar);
            }
        }

        return { conflicts, unique, missing };
    }

    /**
     * Parse conflict resolution from dialog result
     * @param {*} result - Dialog result
     * @param {Array} conflicts - Conflicts array
     * @returns {Object} Parsed resolution
     */
    parseConflictResolution(result, conflicts) {
        if (!result) return { strategy: 'cancel', resolutions: [] };

        const applyAll = document.querySelector('#conflict_apply_all')?.value || null;
        const resolutions = conflicts.map(conflict => {
            const resolution = applyAll ||
                document.querySelector(`input[name="conflict_${conflict.name}"]:checked`)?.value ||
                'keep';
            return { name: conflict.name, resolution, existing: conflict.existing, blueprint: conflict.blueprint };
        });

        return { strategy: applyAll || 'individual', resolutions };
    }

    /**
     * Show conflict resolution dialog
     * @param {Object} detection - Conflict detection result
     * @returns {Promise<Object|null>} Resolution or null if cancelled
     */
    async showConflictDialog(detection) {
        const { conflicts, unique, missing } = detection;

        if (conflicts.length === 0) return { strategy: 'none', resolutions: [] };

        const html = this.buildConflictDialogHTML(conflicts, unique, missing);

        try {
            if (window.callGenericPopup) {
                const result = await window.callGenericPopup(html, window.POPUP_TYPE.CONFIRM);
                return this.parseConflictResolution(result, conflicts);
            }

            // Fallback: simple confirm
            const confirmed = confirm(
                `${conflicts.length} character(s) in this blueprint differ from your existing characters.\n\n` +
                `Conflicts:\n${conflicts.map(c => `- ${c.name}`).join('\n')}\n\n` +
                `Click OK to keep your versions, or Cancel to use blueprint versions.`
            );

            if (!confirmed) {
                return {
                    strategy: 'replace',
                    resolutions: conflicts.map(c => ({ ...c, resolution: 'replace' })),
                };
            }

            return {
                strategy: 'keep',
                resolutions: conflicts.map(c => ({ ...c, resolution: 'keep' })),
            };
        } catch (error) {
            console.error('[CharacterMerger] Dialog error:', error);
            return null;
        }
    }

    /**
     * Build HTML for conflict dialog
     * @param {Array} conflicts - Conflicts
     * @param {Array} unique - Unique (identical) characters
     * @param {Array} missing - Missing (new) characters
     * @returns {string} Dialog HTML
     */
    buildConflictDialogHTML(conflicts, unique, missing) {
        const safeName = name => escapeHtml(name);

        return `
            <div class="blueprint-conflict-dialog">
                <h3>Character Conflicts Detected</h3>
                <p>The following characters in this blueprint differ from your existing characters:</p>
                ${conflicts.map(conflict => `
                    <div class="conflict-item">
                        <h4>${safeName(conflict.name)}</h4>
                        ${conflict.differences.map(diff => `
                            <div class="conflict-field">
                                <strong>${safeName(diff.field)}:</strong>
                                <div class="conflict-sides">
                                    <div class="conflict-side existing">
                                        <h5>Yours:</h5>
                                        <p>${safeName(truncateText(diff.existing, 200))}</p>
                                    </div>
                                    <div class="conflict-side blueprint">
                                        <h5>Blueprint:</h5>
                                        <p>${safeName(truncateText(diff.blueprint, 200))}</p>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                        <div class="conflict-actions">
                            <label>
                                <input type="radio" name="conflict_${safeName(conflict.name)}" value="keep" checked>
                                Keep Yours
                            </label>
                            <label>
                                <input type="radio" name="conflict_${safeName(conflict.name)}" value="replace">
                                Use Blueprint Version
                            </label>
                            <label>
                                <input type="radio" name="conflict_${safeName(conflict.name)}" value="rename">
                                Import as "${safeName(conflict.name)} (Blueprint)"
                            </label>
                        </div>
                    </div>
                `).join('')}
                ${unique.length > 0 ? `
                    <div class="conflict-unique">
                        <h4>Identical Characters (${unique.length})</h4>
                        <p>These characters match your existing versions and will be used as-is:</p>
                        <ul>
                            ${unique.map(u => `<li>${safeName(u.name)}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
                ${missing.length > 0 ? `
                    <div class="conflict-new">
                        <h4>New Characters (${missing.length})</h4>
                        <p>These new characters will be added:</p>
                        <ul>
                            ${missing.map(m => `<li>${safeName(m.name)}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
                <div class="conflict-resolution-footer">
                    <h4>Apply to all conflicts:</h4>
                    <select id="conflict_apply_all">
                        <option value="">Choose individually</option>
                        <option value="keep">Keep all existing</option>
                        <option value="replace">Replace all with blueprint</option>
                        <option value="rename">Import all with suffix</option>
                    </select>
                </div>
            </div>
        `;
    }

    /**
     * Apply the chosen resolution strategy
     * @param {Object} blueprint - Blueprint object
     * @param {Object} resolution - Resolution object
     * @returns {Promise<Object>} Result summary
     */
    async applyResolution(blueprint, resolution) {
        const { resolutions } = resolution;
        const charactersToAdd = [];
        const charactersToSkip = [];
        const charactersToReplace = [];

        for (const res of resolutions) {
            switch (res.resolution) {
                case 'keep':
                    charactersToSkip.push(res.name);
                    break;
                case 'replace':
                    charactersToAdd.push(res.blueprint);
                    charactersToReplace.push(res.name);
                    break;
                case 'rename':
                    charactersToAdd.push({ ...res.blueprint, name: `${res.blueprint.name} (Blueprint)` });
                    break;
            }
        }

        // Add non-conflicting characters
        const blueprintCharacters = blueprint.embeddedResources?.characters || [];
        const conflictingNames = new Set(resolutions.map(r => r.name));
        const nonConflicting = blueprintCharacters.filter(c => !conflictingNames.has(c.name));
        charactersToAdd.push(...nonConflicting);

        // Import characters
        for (const char of charactersToAdd) {
            await this.importCharacter(char);
        }

        return {
            added: charactersToAdd.length,
            skipped: charactersToSkip.length,
            replaced: charactersToReplace.length,
        };
    }

    /**
     * Import a character into the chat
     * @param {Object} character - Character object
     * @returns {Promise<void>}
     */
    async importCharacter(character) {
        try {
            if (this.eventSource) {
                this.eventSource.emit('storymode_blueprint_import_character', character);
            } else {
                console.log('[CharacterMerger] Importing character:', character.name);
            }
        } catch (error) {
            console.error('[CharacterMerger] Failed to import character:', character.name, error);
        }
    }

    /**
     * Resolve all conflicts for a blueprint
     * @param {Object} blueprint - Blueprint object
     * @returns {Promise<Object>} Resolution result
     */
    async resolveConflicts(blueprint) {
        const detection = await this.detectConflicts(blueprint);

        // If no conflicts, auto-import all characters
        if (detection.conflicts.length === 0) {
            const blueprintCharacters = blueprint.embeddedResources?.characters || [];
            for (const char of blueprintCharacters) {
                await this.importCharacter(char);
            }

            return {
                autoResolved: true,
                added: blueprintCharacters.length,
                skipped: 0,
                replaced: 0,
            };
        }

        // Show conflict dialog
        const resolution = await this.showConflictDialog(detection);

        // User cancelled
        if (!resolution || resolution.strategy === 'cancel') {
            return { cancelled: true, added: 0, skipped: 0, replaced: 0 };
        }

        // Apply resolution
        return await this.applyResolution(blueprint, resolution);
    }
}

// ============================================================================
// BLUEPRINT MERGER CLASS
// ============================================================================

/**
 * Blueprint Merger
 * Main interface for merging blueprints with current state
 */
export class BlueprintMerger {
    /**
     * Create a blueprint merger
     */
    constructor() {
        this.characterMerger = new CharacterMerger();
    }

    /**
     * Initialize the merger
     */
    init() {
        this.characterMerger.init();
    }

    /**
     * Import an embedded resource if it doesn't already exist
     * @param {Object} blueprint - Blueprint object
     * @param {string} resourceKey - Key in embeddedResources
     * @param {string} resourceId - ID field to check
     * @param {string} addFunctionName - Name of global add function
     * @returns {Promise<Object|null>} Imported resource or null
     */
    async importEmbeddedResource(blueprint, resourceKey, resourceId, addFunctionName) {
        const resource = blueprint.embeddedResources?.[resourceKey];
        if (!resource) {
            console.warn(`[BlueprintMerger] No embedded ${resourceKey} in blueprint`);
            return null;
        }

        try {
            const getterName = resourceKey === 'storyType' ? 'getStoryTypes' : 'getAuthorStyles';
            if (window[getterName]) {
                const existing = await window[getterName]();
                if (existing.some(item => item.id === resourceId)) {
                    console.log(`[BlueprintMerger] ${resourceKey} already exists:`, resourceId);
                    return resource;
                }
            }

            if (window[addFunctionName]) {
                await window[addFunctionName](resource);
                console.log(`[BlueprintMerger] Imported ${resourceKey}:`, resourceId);
            } else {
                console.warn(`[BlueprintMerger] No ${addFunctionName} function available`);
            }

            return resource;
        } catch (error) {
            console.error(`[BlueprintMerger] Failed to import ${resourceKey}:`, error);
            return null;
        }
    }

    /**
     * Import story type from blueprint
     * @param {Object} blueprint - Blueprint object
     * @returns {Promise<Object|null>} Story type or null
     */
    async importStoryType(blueprint) {
        return this.importEmbeddedResource(blueprint, 'storyType', blueprint.story_type_id, 'addStoryType');
    }

    /**
     * Import author style from blueprint
     * @param {Object} blueprint - Blueprint object
     * @returns {Promise<Object|null>} Author style or null
     */
    async importAuthorStyle(blueprint) {
        return this.importEmbeddedResource(blueprint, 'authorStyle', blueprint.author_style, 'addAuthorStyle');
    }

    /**
     * Sync settings from blueprint
     * @param {Object} blueprint - Blueprint object
     * @returns {Promise<Object>} Settings sync result
     */
    async syncSettings(blueprint) {
        const settings = {
            storyType: blueprint.story_type_id,
            authorStyle: blueprint.author_style || null,
            arcLength: blueprint.total_messages_target || 30,
            syncResult: null,
        };

        try {
            if (window.syncBlueprintSettings) {
                settings.syncResult = await window.syncBlueprintSettings(blueprint, false);
            }
            return settings;
        } catch (error) {
            console.error('[BlueprintMerger] Failed to sync settings:', error);
            return settings;
        }
    }

    /**
     * Merge a blueprint with the current chat
     * @param {Object} blueprint - Blueprint to merge
     * @param {Object} options - Merge options
     * @returns {Promise<Object>} Merge result
     */
    async mergeBlueprint(blueprint, options = {}) {
        const {
            resolveCharacterConflicts = true,
            importStoryType = true,
            importAuthorStyle = true,
            syncSettings = true,
        } = options;

        const result = {
            success: false,
            characters: null,
            storyType: null,
            authorStyle: null,
            settings: null,
            errors: [],
        };

        try {
            if (resolveCharacterConflicts) {
                result.characters = await this.characterMerger.resolveConflicts(blueprint);
            }

            if (importStoryType && blueprint.story_type_id) {
                result.storyType = await this.importStoryType(blueprint);
            }

            if (importAuthorStyle && blueprint.author_style) {
                result.authorStyle = await this.importAuthorStyle(blueprint);
            }

            if (syncSettings) {
                result.settings = await this.syncSettings(blueprint);
            }

            result.success = true;
        } catch (error) {
            console.error('[BlueprintMerger] Merge failed:', error);
            result.errors.push(error.message);
        }

        return result;
    }

    /**
     * Validate a blueprint before merging
     * @param {Object} blueprint - Blueprint to validate
     * @returns {Object} Validation result
     */
    validateBlueprint(blueprint) {
        return validateBlueprintUtil(blueprint);
    }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let globalMerger = null;

/**
 * Get the global merger instance
 * @returns {BlueprintMerger} Merger instance
 */
export function getMerger() {
    if (!globalMerger) {
        globalMerger = new BlueprintMerger();
        globalMerger.init();
    }
    return globalMerger;
}
