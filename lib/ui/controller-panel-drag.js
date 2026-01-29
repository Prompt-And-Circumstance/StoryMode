/**
 * Generic drag and drop handler
 * @param {jQuery} element - The element to move
 * @param {jQuery} handle - The handle element to drag by
 * @param {string} namespace - Event namespace suffix
 * @param {Function} [onDragEnd] - Optional callback when drag ends (with rect)
 * @param {string} [excludeSelector] - Optional selector to exclude from drag start
 */
function makeDraggable(element, handle, namespace, onDragEnd, excludeSelector) {
    const state = { isDragging: false, dragStartX: 0, dragStartY: 0, elementStartX: 0, elementStartY: 0 };

    handle.css('cursor', 'grab');

    handle.on('mousedown', function (e) {
        if (e.button !== 0) return;
        if (excludeSelector && $(e.target).closest(excludeSelector).length) return;
        if ($(e.target).closest('button').length && $(e.target).closest('button')[0] !== handle[0]) return;

        state.isDragging = true;
        state.dragStartX = e.clientX;
        state.dragStartY = e.clientY;

        const rect = element[0].getBoundingClientRect();
        state.elementStartX = rect.left;
        state.elementStartY = rect.top;

        element.addClass('dragging');
        handle.css('cursor', 'grabbing');
        e.preventDefault();
    });

    $(document).on(`mousemove.${namespace}`, function (e) {
        if (!state.isDragging) return;
        applyDragPosition(element, state, e.clientX, e.clientY);
    });

    $(document).on(`mouseup.${namespace}`, function () {
        if (!state.isDragging) return;

        state.isDragging = false;
        element.removeClass('dragging');
        handle.css('cursor', 'grab');

        if (onDragEnd) {
            onDragEnd(element[0].getBoundingClientRect());
        }
    });

    element.data('cleanupDrag', () => {
        $(document).off(`mousemove.${namespace}`);
        $(document).off(`mouseup.${namespace}`);
    });
}

function applyDragPosition(element, state, clientX, clientY) {
    const deltaX = clientX - state.dragStartX;
    const deltaY = clientY - state.dragStartY;

    let newLeft = state.elementStartX + deltaX;
    let newTop = state.elementStartY + deltaY;

    const elWidth = element.outerWidth();
    const elHeight = element.outerHeight();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    newLeft = Math.max(0, Math.min(newLeft, viewportWidth - elWidth));
    newTop = Math.max(0, Math.min(newTop, viewportHeight - elHeight));

    element.css({
        left: newLeft + 'px',
        top: newTop + 'px',
        right: 'auto',
        bottom: 'auto'
    });
}

export { makeDraggable };
