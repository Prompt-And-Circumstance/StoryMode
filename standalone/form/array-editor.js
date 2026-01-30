/**
 * Array Editor Component
 * Handles array fields like alternate_endings, with add/remove/reorder
 */

import { markRequired, markOptional } from './validation.js';

// ============================================================================
// ARRAY EDITOR RENDERING
// ============================================================================

/**
 * Render an array editor field
 * @param {Object} config - Field configuration
 * @returns {jQuery} jQuery element containing the array editor
 */
export function renderArrayEditor(config) {
    const {
        fieldPath,
        label,
        value = [],
        required = false,
        disabled = false,
        itemType = 'string',
        placeholder = 'No items yet',
        itemPlaceholder = 'Enter value...',
        maxItems = null,
        minItems = null,
    } = config;

    const fieldId = fieldPath.replace(/\./g, '-');
    const $container = $('<div>').addClass('array-editor').data('field-path', fieldPath);

    // Header with label and count
    const $header = $('<div>').addClass('array-editor-header');
    const $label = $('<label>').text(label);

    if (required) markRequired($label);
    else markOptional($label);

    $header.append($label);
    $header.append($('<span>').addClass('item-count').text(`(${value.length} items)`));
    $container.append($header);

    // Items container
    const $items = $('<div>').addClass('array-items').data('field-path', fieldPath);
    $container.append($items);

    // Render existing items
    value.forEach((item, index) => {
        const $item = renderArrayItem(item, index, itemType, itemPlaceholder, disabled);
        $items.append($item);
    });

    // Empty state
    const $empty = $('<div>').addClass('empty-state').text(placeholder);
    if (value.length === 0) $empty.show();
    else $empty.hide();
    $container.append($empty);

    // Add button
    if (!disabled) {
        const $addBtn = $('<button>')
            .addClass('btn btn-sm btn-secondary array-add-btn')
            .html('<i class="fa-solid fa-plus"></i> Add Item')
            .data('field-path', fieldPath)
            .data('item-type', itemType)
            .data('item-placeholder', itemPlaceholder)
            .data('max-items', maxItems)
            .prop('disabled', maxItems !== null && value.length >= maxItems);

        $container.append($addBtn);

        // Bind add button event
        $addBtn.on('click.array-editor', function(e) {
            e.preventDefault();
            const $btn = $(this);
            const currentCount = $items.children('.array-item').length;
            const max = $btn.data('max-items');

            if (max !== null && currentCount >= max) {
                $btn.prop('disabled', true);
                return;
            }

            addArrayItem($items, $btn.data('item-type'), $btn.data('item-placeholder'));
            updateItemCount($container);
            $empty.hide();
        });
    }

    return $container;
}

/**
 * Render a single array item
 * @param {*} value - Item value
 * @param {number} index - Item index
 * @param {string} itemType - Type of item (string, number, object)
 * @param {string} placeholder - Input placeholder
 * @param {boolean} disabled - Whether item is disabled
 * @returns {jQuery} Item element
 */
function renderArrayItem(value, index, itemType, placeholder, disabled) {
    const $item = $('<div>').addClass('array-item');

    // Drag handle
    const $handle = $('<span>').addClass('drag-handle').html('<i class="fa-solid fa-grip-vertical"></i>');
    $item.append($handle);

    // Input based on item type
    let $input;
    if (itemType === 'string') {
        $input = $('<input>')
            .attr('type', 'text')
            .addClass('form-control array-item-input')
            .attr('placeholder', placeholder)
            .val(value || '')
            .prop('disabled', disabled);
    } else if (itemType === 'number') {
        $input = $('<input>')
            .attr('type', 'number')
            .addClass('form-control array-item-input')
            .attr('placeholder', placeholder)
            .val(value || '')
            .prop('disabled', disabled);
    } else if (itemType === 'textarea') {
        $input = $('<textarea>')
            .addClass('form-control array-item-input')
            .attr('placeholder', placeholder)
            .attr('rows', 2)
            .val(value || '')
            .prop('disabled', disabled);
    }

    $item.append($input);

    // Remove button
    const $remove = $('<button>')
        .addClass('btn btn-sm btn-danger array-item-remove')
        .html('<i class="fa-solid fa-trash"></i>')
        .attr('aria-label', 'Remove item')
        .prop('disabled', disabled);

    $item.append($remove);

    return $item;
}

/**
 * Add a new item to the array editor
 * @param {jQuery} $itemsContainer - Items container
 * @param {string} itemType - Type of item
 * @param {string} placeholder - Input placeholder
 * @returns {jQuery} New item element
 */
function addArrayItem($itemsContainer, itemType, placeholder) {
    const $item = renderArrayItem('', $itemsContainer.children().length, itemType, placeholder, false);
    $itemsContainer.append($item);
    $item.find('.array-item-input').focus();
    return $item;
}

/**
 * Update the item count display
 * @param {jQuery} $container - Array editor container
 */
function updateItemCount($container) {
    const count = $container.find('.array-items').children('.array-item').length;
    $container.find('.item-count').text(`(${count} items)`);

    // Check max items
    const $addBtn = $container.find('.array-add-btn');
    const max = $addBtn.data('max-items');
    if (max !== null && count >= max) {
        $addBtn.prop('disabled', true);
    } else {
        $addBtn.prop('disabled', false);
    }

    // Check min items for remove buttons
    const min = $addBtn.data('min-items');
    if (min !== null && count <= min) {
        $container.find('.array-item-remove').prop('disabled', true);
    } else {
        $container.find('.array-item-remove').prop('disabled', false);
    }

    // Update empty state
    const $empty = $container.find('.empty-state');
    if (count === 0) $empty.show();
    else $empty.hide();
}

// ============================================================================
// VALUE EXTRACTION
// ============================================================================

/**
 * Extract values from an array editor
 * @param {jQuery} $container - Array editor container
 * @param {string} itemType - Type of items to extract
 * @returns {Array} Array of values
 */
export function extractArrayValues($container, itemType = 'string') {
    const values = [];
    const $items = $container.find('.array-items .array-item');

    $items.each(function() {
        const $input = $(this).find('.array-item-input');
        let value = $input.val();

        if (itemType === 'number') {
            value = Number(value) || 0;
        }

        values.push(value);
    });

    return values;
}

// ============================================================================
// DRAG AND DROP REORDERING
// ============================================================================

/**
 * Initialize drag and drop for an array editor
 * @param {jQuery} $container - Array editor container
 */
export function initArrayDragDrop($container) {
    const $items = $container.find('.array-items');

    $items.on('mousedown.array-editor', '.array-item .drag-handle', function(e) {
        e.preventDefault();
        const $handle = $(this);
        const $item = $handle.closest('.array-item');
        const startY = e.pageY;
        const startX = e.pageX;
        const $items = $item.parent();
        const itemHeight = $item.outerHeight();
        const itemsTop = $items.offset().top;

        $item.addClass('dragging');
        $items.addClass('dragging-active');

        function onMouseMove(e) {
            const currentY = e.pageY;
            const currentX = e.pageX;
            const deltaY = currentY - startY;
            const deltaX = currentX - startX;

            // Only allow vertical drag
            if (Math.abs(deltaY) > Math.abs(deltaX)) {
                const offset = Math.max(-itemHeight / 2, Math.min(itemHeight / 2, deltaY));
                $item.css('transform', `translateY(${offset}px)`);

                // Find which item to swap with
                const itemCenter = $item.offset().top + itemHeight / 2;
                $items.find('.array-item').each(function() {
                    if (this === $item[0]) return;
                    const $target = $(this);
                    const targetCenter = $target.offset().top + $target.outerHeight() / 2;

                    if (deltaY < 0 && itemCenter < targetCenter - 10) {
                        $item.insertBefore($target);
                    } else if (deltaY > 0 && itemCenter > targetCenter + 10) {
                        $item.insertAfter($target);
                    }
                });
            }
        }

        function onMouseUp() {
            $(document).off('mousemove', onMouseMove);
            $(document).off('mouseup', onMouseUp);
            $item.removeClass('dragging').css('transform', '');
            $items.removeClass('dragging-active');

            // Update indices
            $items.find('.array-item').each(function(index) {
                $(this).attr('data-index', index);
            });
        }

        $(document).on('mousemove', onMouseMove);
        $(document).on('mouseup', onMouseUp);
    });

    // Handle remove button clicks
    $items.on('click.array-editor', '.array-item-remove', function(e) {
        e.preventDefault();
        const $item = $(this).closest('.array-item');
        $item.fadeOut(150, function() {
            $(this).remove();
            updateItemCount($container);
        });
    });
}

// ============================================================================
// EXPORT FOR DEBUGGING
// ============================================================================

if (typeof window !== 'undefined') {
    window.StoryModeArrayEditor = {
        renderArrayEditor,
        extractArrayValues,
        initArrayDragDrop,
        addArrayItem,
        updateItemCount,
    };
}
