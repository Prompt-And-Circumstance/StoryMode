/**
 * Characters Editor Module
 * Handles character arc CRUD operations and the Character Arcs tab
 */

import { getCharacters } from '../adapters/character-adapter.js';
import { Popup } from '../adapters/popup-adapter.js';
import { showCharacterSearch, getArcTypeLabel } from './character-search-modal.js';
import { getCurrentBlueprint } from '../handlers/blueprint-actions.js';
import { getConnectionStatus } from '../adapters/connection-bridge.js';

// ============================================================================
// CHARACTER ARCS TAB RENDERING
// ============================================================================

/**
 * Render the Character Arcs tab content
 * @param {Object} blueprint - Blueprint object
 * @param {Object} options - Options object
 * @returns {jQuery} Character Arcs tab content
 */
export function renderCharactersTab(blueprint, options = {}) {
    const { readonly = false } = options;
    const arcs = blueprint.character_arcs || [];

    const $content = $('<div>').addClass('characters-editor');

    // Header with action buttons
    const $header = $('<div>').addClass('tab-header');
    $header.append($('<h3>').text('Character Arcs'));

    const $actions = $('<div>').addClass('tab-actions');
    $actions.append($('<span>').addClass('arc-count').text(`${arcs.length} character arcs`));
    const $addBtn = $('<button>').addClass('btn btn-primary').attr('data-action', 'add-arc');
    if (readonly) $addBtn.attr('disabled', 'disabled');
    $addBtn.html('<i class="fa-solid fa-plus"></i> Add Character Arc');
    $actions.append($addBtn);
    $header.append($actions);
    $content.append($header);

    // Arc list
    const $list = $('<div>').addClass('arc-list');
    if (arcs.length === 0) {
        const $empty = $('<div>').addClass('empty-state');
        $empty.append($('<i>').addClass('fa-solid fa-user-tag'));
        $empty.append($('<p>').text('No character arcs defined. Add character arcs to track character development.'));
        $list.append($empty);
    } else {
        arcs.forEach((arc, index) => {
            $list.append(renderArcCard(arc, index, readonly));
        });
    }
    $content.append($list);

    // Bind events
    bindCharactersEvents($content, readonly);

    return $content;
}

/**
 * Render a character arc card
 * @param {Object} arc - Character arc object
 * @param {number} index - Arc index
 * @param {boolean} readonly - Whether card is readonly
 * @returns {jQuery} Arc card element
 */
function renderArcCard(arc, index, readonly) {
    const $card = $('<div>').addClass('arc-card').data('arc-index', index);

    // Header
    const $header = $('<div>').addClass('arc-card-header');

    // Character name or placeholder
    const name = arc.character_name || 'Unnamed Character';
    $header.append($('<h4>').addClass('character-name').text(name));

    // Arc type badge
    const typeLabel = getArcTypeLabel(arc.arc_type);
    $header.append($('<span>').addClass('badge badge-secondary').text(typeLabel));

    $card.append($header);

    // Body
    const $body = $('<div>').addClass('arc-card-body');

    // Arc progression summary
    if (arc.arc_progression && arc.arc_progression.length > 0) {
        const $progression = $('<div>').addClass('arc-progression');
        $progression.append($('<strong>').text('Progression: '));
        const stages = arc.arc_progression.join(' → ');
        $progression.append($('<span>').text(stages));
        $body.append($progression);
    }

    // Description
    if (arc.description) {
        $body.append($('<p>').addClass('arc-description').text(arc.description));
    }

    $card.append($body);

    // Actions (if not readonly)
    if (!readonly) {
        const $actions = $('<div>').addClass('arc-card-actions');
        $actions.append($('<button>').addClass('btn btn-sm btn-secondary').attr('data-action', 'edit-arc').html('<i class="fa-solid fa-pen"></i> Edit'));
        $actions.append($('<button>').addClass('btn btn-sm btn-danger').attr('data-action', 'delete-arc').html('<i class="fa-solid fa-trash"></i> Delete'));
        $card.append($actions);
    }

    return $card;
}

// ============================================================================
// EVENT BINDING
// ============================================================================

/**
 * Bind events for the Character Arcs tab
 * @param {jQuery} $content - Content element
 * @param {boolean} readonly - Whether tab is readonly
 */
function bindCharactersEvents($content, readonly) {
    if (readonly) return;

    // Add arc button
    $content.on('click.characters-editor', '[data-action="add-arc"]', function() {
        openArcEditModal(null);
    });

    // Edit arc button
    $content.on('click.characters-editor', '[data-action="edit-arc"]', function() {
        const $card = $(this).closest('.arc-card');
        const index = $card.data('arc-index');
        openArcEditModal(index);
    });

    // Delete arc button
    $content.on('click.characters-editor', '[data-action="delete-arc"]', function() {
        const $card = $(this).closest('.arc-card');
        const index = $card.data('arc-index');
        deleteArc(index);
    });
}

// ============================================================================
// CHARACTER ARC CRUD OPERATIONS
// ============================================================================

/**
 * Open the character arc edit modal
 * @param {number|null} index - Arc index (null for new arc)
 */
async function openArcEditModal(index) {
    const isNew = index === null;
    const title = isNew ? 'Add Character Arc' : 'Edit Character Arc';

    // Get current arc data
    let arcData = {};
    if (!isNew) {
        const blueprint = getCurrentBlueprint();
        arcData = blueprint.character_arcs?.[index] || {};
    }

    // Build modal content
    const $content = $('<div>').addClass('arc-edit-form');

    // Character Name
    const $nameGroup = $('<div>').addClass('form-group');
    $nameGroup.append($('<label>').text('Character Name').append(' <span class="required">*</span>'));
    $nameGroup.append($('<input>')
        .attr('type', 'text')
        .addClass('form-control')
        .attr('name', 'character_name')
        .val(arcData.character_name || '')
        .attr('placeholder', 'Character name...'));

    // Character search (if connected to backend)
    const isConnected = getConnectionStatus();
    if (isConnected) {
        const $searchBtn = $('<button>')
            .addClass('btn btn-sm btn-secondary')
            .attr('type', 'button')
            .html('<i class="fa-solid fa-search"></i> Search Characters')
            .css('marginTop', '8px');
        $nameGroup.append($searchBtn);

        // Bind search button
        $searchBtn.on('click', async function() {
            await showCharacterSearch($nameGroup.find('[name="character_name"]'));
        });
    }

    $content.append($nameGroup);

    // Arc Type
    const $typeGroup = $('<div>').addClass('form-group');
    $typeGroup.append($('<label>').text('Arc Type'));
    const $typeSelect = $('<select>').addClass('form-control').attr('name', 'arc_type');
    $typeSelect.append($('<option>').attr('value', '').text('Select type...'));
    $typeSelect.append($('<option>').attr('value', 'hero').text('Hero'));
    $typeSelect.append($('<option>').attr('value', 'anti-hero').text('Anti-Hero'));
    $typeSelect.append($('<option>').attr('value', 'mentor').text('Mentor'));
    $typeSelect.append($('<option>').attr('value', 'ally').text('Ally'));
    $typeSelect.append($('<option>').attr('value', 'antagonist').text('Antagonist'));
    $typeSelect.append($('<option>').attr('value', 'neutral').text('Neutral'));
    $typeSelect.val(arcData.arc_type || '');
    $typeGroup.append($typeSelect);
    $content.append($typeGroup);

    // Arc Progression (comma-separated)
    const $progressGroup = $('<div>').addClass('form-group');
    $progressGroup.append($('<label>').text('Arc Progression'));
    $progressGroup.append($('<input>')
        .attr('type', 'text')
        .addClass('form-control')
        .attr('name', 'arc_progression')
        .val((arcData.arc_progression || []).join(', '))
        .attr('placeholder', 'e.g., Reluctant hero → Accepts call → Faces trials → Transformed'));
    $progressGroup.append($('<small>').addClass('text-muted').text('Separate stages with commas'));
    $content.append($progressGroup);

    // Description
    const $descGroup = $('<div>').addClass('form-group');
    $descGroup.append($('<label>').text('Description'));
    $descGroup.append($('<textarea>')
        .addClass('form-control')
        .attr('name', 'description')
        .attr('rows', '4')
        .val(arcData.description || '')
        .attr('placeholder', 'Describe this character\'s journey...'));
    $content.append($descGroup);

    // Create modal
    const popup = new Popup($content, 'TEXT', title, {
        wide: true,
        okButton: true,
        cancelButton: true,
    });

    popup.show().then(result => {
        if (result) {
            saveArc(index, extractArcData($content));
        }
    });
}

/**
 * Extract arc data from form
 * @param {jQuery} $form - Form element
 * @returns {Object} Arc data
 */
function extractArcData($form) {
    const progression = $form.find('[name="arc_progression"]').val();
    return {
        character_name: $form.find('[name="character_name"]').val().trim(),
        arc_type: $form.find('[name="arc_type"]').val(),
        arc_progression: progression
            ? progression.split(',').map(s => s.trim()).filter(s => s)
            : [],
        description: $form.find('[name="description"]').val().trim(),
    };
}

/**
 * Save a character arc (add or update)
 * @param {number|null} index - Arc index (null for new arc)
 * @param {Object} arcData - Arc data to save
 */
function saveArc(index, arcData) {
    const blueprint = getCurrentBlueprint();
    if (!blueprint) return;

    if (!blueprint.character_arcs) blueprint.character_arcs = [];

    if (index === null) {
        // Add new arc
        blueprint.character_arcs.push(arcData);
    } else {
        // Update existing arc
        blueprint.character_arcs[index] = arcData;
    }

    // Refresh the tab
    $(document).trigger('blueprint:updated', { blueprint });
    $(document).trigger('arcs:changed', { arcs: blueprint.character_arcs });
    refreshCharactersView(blueprint);
}

/**
 * Delete a character arc
 * @param {number} index - Arc index to delete
 */
function deleteArc(index) {
    const blueprint = getCurrentBlueprint();
    if (!blueprint || !blueprint.character_arcs) return;

    const arc = blueprint.character_arcs[index];
    const name = arc?.character_name || 'Unnamed Character';

    const popup = new Popup(
        `Are you sure you want to delete "${name}"\'s arc?`,
        'TEXT',
        'Delete Character Arc',
        { okButton: true, cancelButton: true }
    );

    popup.show().then(result => {
        if (result) {
            blueprint.character_arcs.splice(index, 1);
            $(document).trigger('blueprint:updated', { blueprint });
            $(document).trigger('arcs:changed', { arcs: blueprint.character_arcs });
            refreshCharactersView(blueprint);
        }
    });
}

// ============================================================================
// VIEW REFRESH
// ============================================================================

/**
 * Refresh the characters view in-place (re-renders the arc list)
 * @param {Object} blueprint - Blueprint object
 */
function refreshCharactersView(blueprint) {
    const $tabPanel = $('#charactersTab .tab-content');
    if (!$tabPanel.length) return;

    $tabPanel.empty();
    const $content = renderCharactersTab(blueprint, { readonly: false });
    $tabPanel.append($content);
}

// ============================================================================
// EXPORT FOR DEBUGGING
// ============================================================================

if (typeof window !== 'undefined') {
    window.StoryModeCharactersEditor = {
        renderCharactersTab,
        saveArc,
        deleteArc,
    };
}
