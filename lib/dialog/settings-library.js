import { eventSource } from '/script.js';
import { LIBRARY_EVENTS } from '../blueprint/file-storage.js';
import { POPUP_RESULT, callGenericPopup, POPUP_TYPE } from '/scripts/popup.js';
import { extension_settings } from '/scripts/extensions.js';
import { MODULE_NAME } from '../core/state-manager.js';
import { createBlueprint, decodeBlueprintFromPNG, isBlueprintPNG, getLibrary } from '../blueprint/integration.js';
import {
    debounce, refreshLibraryView, loadBlueprintsForFolder,
    searchLibraryBlueprints, loadBlueprintFromLibrary, playBlueprintFromLibrary,
    editBlueprintFromLibrary, toggleBlueprintFavorite, deleteBlueprintFromLibrary,
    exportBlueprintFromLibrary, returnToLibraryIfNeeded, applyFavoritesFilter,
} from './library-view.js';
import { showLibraryGenerateView, showLibraryGridView } from '../ui/components.js';

export function setupLibraryEvents(content, context) {
    const { libraryCallbacks } = context;

    bindLibraryUpdateEvents(content, libraryCallbacks);
    bindLibraryNavigation(content, libraryCallbacks);
    setupAddNewBlueprintHandler(content, libraryCallbacks);
    setupBlueprintCardActions(content, libraryCallbacks);
    bindLibraryViewControls(content, libraryCallbacks);
    setupLibraryImportHandler(content, libraryCallbacks);
}

function bindLibraryUpdateEvents(content, libraryCallbacks) {
    const handleLibraryUpdate = async (data) => {
        if (content.find('.storymode-tab[data-tab="library"]').hasClass('active')) {
            await refreshLibraryView(content, libraryCallbacks);
        }
    };
    eventSource.on(LIBRARY_EVENTS.BLUEPRINT_ADDED, handleLibraryUpdate);
    eventSource.on(LIBRARY_EVENTS.BLUEPRINT_DELETED, handleLibraryUpdate);
    eventSource.on(LIBRARY_EVENTS.BLUEPRINT_UPDATED, handleLibraryUpdate);
}

function bindLibraryNavigation(content, libraryCallbacks) {
    content.on('click', '.storymode-tab[data-tab="library"]', async function () {
        await refreshLibraryView(content, libraryCallbacks);
    });

    content.on('click', '.storymode-folder-item', async function () {
        const folderId = $(this).data('folder');
        content.find('.storymode-folder-item').removeClass('active');
        $(this).addClass('active');
        await loadBlueprintsForFolder(content, folderId, libraryCallbacks);
    });

    content.on('input', '#library_search_input', debounce(async function () {
        const query = $(this).val().trim();
        if (query.length >= 2) {
            await searchLibraryBlueprints(content, query);
        } else if (query.length === 0) {
            const activeFolder = content.find('.storymode-folder-item.active').data('folder') || 'all';
            await loadBlueprintsForFolder(content, activeFolder, libraryCallbacks);
        }
    }, 300));

    content.on('click', '#library_generate_blueprint_btn, #library_empty_generate_btn', function (e) {
        e.preventDefault();
        e.stopPropagation();
        console.log('[Story Mode] Generate Scenario button clicked');
        content.data('generateFromLibrary', true);
        showLibraryGenerateView(content);
    });

    content.on('click', '#library_back_to_grid_btn', function () {
        content.removeData('generateFromLibrary');
        showLibraryGridView(content);
    });
}

function setupAddNewBlueprintHandler(content, libraryCallbacks) {
    content.on('click', '#library_add_new_btn, #library_empty_add_new_btn', async function (e) {
        e.preventDefault();
        e.stopPropagation();
        console.log('[Story Mode] Add New button clicked');
        const btn = $(this);
        if (btn.prop('disabled')) return;
        btn.prop('disabled', true);

        try {
            await createAndEditBlankBlueprint(content, libraryCallbacks);
        } catch (error) {
            console.error('[Story Mode] Add new blueprint error:', error);
            toastr.error('Failed to create blueprint: ' + error.message);
        } finally {
            btn.prop('disabled', false);
        }
    });
}

async function createAndEditBlankBlueprint(content, libraryCallbacks) {
    const { createBlankBlueprint, generatePlaceholderCover } = await import('../blueprint/blank-blueprint.js');
    const { openBlueprintEditor } = await import('../editor/blueprint-editor.js');
    const { createBlueprint } = await import('../blueprint/integration.js');

    let blueprint = createBlankBlueprint();

    const placeholderCover = generatePlaceholderCover(blueprint.blueprint_title);
    blueprint.metadata = blueprint.metadata || {};
    blueprint.metadata.coverGallery = [{
        id: blueprint.blueprint_id + '-placeholder',
        url: placeholderCover,
        prompt: 'Placeholder cover',
        timestamp: new Date().toISOString(),
        model: 'SVG Placeholder'
    }];
    blueprint.metadata.coverGalleryIndex = 0;

    const edited = await openBlueprintEditor(blueprint);

    if (edited) {
        delete edited._isNew;
        await createBlueprint(edited, { saveToLibrary: true });
        toastr.success('Blueprint saved to library');
        const activeFolder = content.find('.storymode-folder-item.active').data('folder') || 'all';
        await loadBlueprintsForFolder(content, activeFolder, libraryCallbacks);
    }
}

function setupBlueprintCardActions(content, libraryCallbacks) {
    content.on('click', '.storymode-blueprint-card [data-action]', async function (e) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const action = $(this).data('action');
        const card = $(this).closest('.storymode-blueprint-card');
        const blueprintId = card.data('blueprint-id');

        if (!blueprintId) {
            console.error('[Story Mode] No blueprint ID found on card', card[0]);
            toastr.error('Could not find blueprint ID');
            return;
        }

        switch (action) {
            case 'load':
                await loadBlueprintFromLibrary(content, blueprintId, libraryCallbacks);
                break;
            case 'play':
                await playBlueprintFromLibrary(content, blueprintId, libraryCallbacks);
                break;
            case 'edit':
                await editBlueprintFromLibrary(content, blueprintId, libraryCallbacks);
                break;
            case 'favorite':
                await toggleBlueprintFavorite(content, blueprintId, $(this), libraryCallbacks);
                break;
            case 'delete':
                await deleteBlueprintFromLibrary(content, blueprintId, libraryCallbacks);
                break;
            case 'export':
                await exportBlueprintFromLibrary(blueprintId);
                break;
        }
    });

    content.on('click', '.storymode-blueprint-card', async function (e) {
        const $target = $(e.target);
        if ($target.closest('[data-action], .storymode-card-favorite').length > 0) {
            return;
        }
        const blueprintId = $(this).data('blueprint-id');
        if (!blueprintId) return;
        await editBlueprintFromLibrary(content, blueprintId, libraryCallbacks);
    });
}

function bindLibraryViewControls(content, libraryCallbacks) {
    content.on('click', '#library_favorites_filter', function () {
        const btn = $(this);
        const icon = btn.find('i');
        const isActive = btn.data('active') === 'true';
        const newActive = !isActive;

        console.log('[Story Mode] Favorites filter clicked. New state:', newActive);

        // Update button state
        btn.data('active', newActive.toString());
        btn.attr('title', newActive ? 'Show all scenarios' : 'Show favorites only');

        // Toggle active class and directly color the icon with !important
        if (newActive) {
            btn.addClass('storymode-filter-active');
            icon[0].style.setProperty('color', '#ffd700', 'important');
            console.log('[Story Mode] Filter activated, icon color set to gold with !important');
        } else {
            btn.removeClass('storymode-filter-active');
            icon[0].style.setProperty('color', '', '');
            console.log('[Story Mode] Filter deactivated, icon color reset');
        }

        // Apply filter (handles card visibility and empty state)
        applyFavoritesFilter(content);
    });

    content.on('change', '#library_sort_select', async function () {
        const activeFolder = content.find('.storymode-folder-item.active').data('folder') || 'all';
        await loadBlueprintsForFolder(content, activeFolder, libraryCallbacks);
    });
}

function setupLibraryImportHandler(content, libraryCallbacks) {
    content.on('click', '#library_import_btn', function () {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.png';
        input.multiple = true;
        input.onchange = async (e) => {
            const files = Array.from(e.target.files);
            if (files.length === 0) return;
            const result = await processImportFiles(files);
            await refreshLibraryView(content, libraryCallbacks);
            showImportResultToast(result.imported, result.failed, result.skipped);
        };
        input.click();
    });
}

async function processImportFiles(files) {
    let imported = 0;
    let failed = 0;
    let skipped = 0;
    const library = await getLibrary();

    for (const file of files) {
        console.log('[SettingsHandlers] Processing file:', file.name);
        try {
            let blueprint = await readBlueprintFile(file);
            if (!blueprint) { failed++; continue; }

            if (!blueprint.userMetadata) blueprint.userMetadata = {};
            if (!blueprint.userMetadata.title) {
                blueprint.userMetadata.title = file.name.replace(/\.(json|png)$/i, '');
            }

            const duplicateResult = await handleDuplicateCheck(library, blueprint);
            if (duplicateResult === 'skip') { skipped++; continue; }

            console.log('[SettingsHandlers] Calling createBlueprint with ID:', blueprint.blueprint_id);
            await createBlueprint(blueprint, { saveToLibrary: true });
            console.log('[SettingsHandlers] createBlueprint completed successfully');
            imported++;
        } catch (error) {
            console.error(`[Story Mode] Failed to import ${file.name}:`, error);
            failed++;
        }
    }

    return { imported, failed, skipped };
}

async function readBlueprintFile(file) {
    if (file.name.toLowerCase().endsWith('.png')) {
        const isPNG = await isBlueprintPNG(file);
        if (!isPNG) {
            console.warn(`[Story Mode] ${file.name} is not a blueprint PNG`);
            return null;
        }
        return await decodeBlueprintFromPNG(file);
    } else {
        const text = await file.text();
        return JSON.parse(text);
    }
}

async function handleDuplicateCheck(library, blueprint) {
    const existing = await library.getBlueprint(blueprint.blueprint_id);
    if (!existing) return 'ok';

    const existingTitle = existing.userMetadata?.title || 'Untitled';
    const newTitle = blueprint.userMetadata?.title || 'Untitled';

    const dialogHtml = `
        <div style="padding: 10px;">
            <p style="margin-bottom: 15px;">A blueprint with this ID already exists:</p>
            <div style="background: var(--SmartThemeBlurTintColor); padding: 10px; border-radius: 5px; margin-bottom: 15px;">
                <strong>Existing:</strong> ${existingTitle}<br>
                <strong>Importing:</strong> ${newTitle}
            </div>
            <p>What would you like to do?</p>
        </div>
    `;

    const result = await callGenericPopup(dialogHtml, POPUP_TYPE.CONFIRM, 'Duplicate Blueprint', {
        okButton: 'Add as Copy',
        cancelButton: 'Replace Existing',
    });

    return interpretDuplicateResult(result, blueprint);
}

async function interpretDuplicateResult(result, blueprint) {
    console.log('[SettingsHandlers] Dialog result:', result, 'type:', typeof result);
    console.log('[SettingsHandlers] POPUP_RESULT values:', POPUP_RESULT);

    const isOk = result === true || result === POPUP_RESULT.AFFIRMATIVE || result === 1;
    const isCancel = result === false || result === POPUP_RESULT.NEGATIVE || result === 0;
    const isClosed = result === null || result === undefined || result === POPUP_RESULT.CANCELLED;

    console.log('[SettingsHandlers] isOk:', isOk, 'isCancel:', isCancel, 'isClosed:', isClosed);

    if (isClosed) {
        console.log('[SettingsHandlers] Dialog was closed/cancelled');
        return 'skip';
    }

    if (isOk) {
        const { generateUUID } = await import('../blueprint/utils.js');
        const oldId = blueprint.blueprint_id;
        blueprint.blueprint_id = generateUUID();
        blueprint.userMetadata.title = (blueprint.userMetadata.title || 'Blueprint') + ' (Copy)';
        console.log('[SettingsHandlers] Add as Copy: oldId=', oldId, 'newId=', blueprint.blueprint_id);
        console.log('[SettingsHandlers] New title:', blueprint.userMetadata.title);
    } else if (isCancel) {
        console.log('[SettingsHandlers] Replace: keeping ID', blueprint.blueprint_id);
    } else {
        console.log('[SettingsHandlers] Unknown result, skipping');
        return 'skip';
    }

    return 'ok';
}

function showImportResultToast(imported, failed, skipped) {
    if (imported > 0 && failed === 0 && skipped === 0) {
        toastr.success(`Imported ${imported} blueprint(s)`);
    } else if (imported > 0) {
        let msg = `Imported ${imported}`;
        if (failed > 0) msg += `, failed ${failed}`;
        if (skipped > 0) msg += `, skipped ${skipped}`;
        toastr.warning(msg);
    } else if (skipped > 0) {
        toastr.info(`Import skipped (${skipped} cancelled)`);
    } else {
        toastr.error('Failed to import any blueprints');
    }
}
