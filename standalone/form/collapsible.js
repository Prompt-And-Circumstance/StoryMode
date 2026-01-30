/**
 * Collapsible Section Component
 * Expandable/collapsible sections for organizing complex forms
 */

// ============================================================================
// COLLAPSIBLE RENDERING
// ============================================================================

/**
 * Render a collapsible section
 * @param {Object} config - Section configuration
 * @returns {jQuery} jQuery element containing the collapsible section
 */
export function renderCollapsible(config) {
    const {
        id,
        title,
        content = '',
        expanded = true,
        icon = null,
        badge = null,
        headerClass = '',
    } = config;

    const sectionId = id || `collapsible-${Date.now()}`;

    const $container = $('<div>').addClass('collapsible-section');
    if (expanded) $container.addClass('expanded');

    // Build header
    const $header = $('<div>').addClass('collapsible-header').attr('data-section', sectionId);
    if (headerClass) $header.addClass(headerClass);

    // Toggle icon
    const $toggle = $('<i>').addClass('toggle-icon fa-solid fa-chevron-down');
    $header.append($toggle);

    // Optional section icon
    if (icon) {
        $header.append($('<i>').addClass('section-icon').addClass(icon));
    }

    // Title
    $header.append($('<span>').addClass('section-title').text(title));

    // Optional badge
    if (badge) {
        const $badge = $('<span>').addClass('badge').addClass(badge.class || 'badge-secondary').text(badge.text);
        $header.append($badge);
    }

    $container.append($header);

    // Build content
    const $content = $('<div>').addClass('collapsible-content').attr('data-section', sectionId);
    if (typeof content === 'string') {
        $content.html(content);
    } else if (content instanceof jQuery) {
        $content.append(content);
    }
    $container.append($content);

    // Bind toggle event
    $header.on('click.collapsible', function(e) {
        e.preventDefault();
        toggleSection(sectionId);
    });

    return $container;
}

/**
 * Toggle a collapsible section
 * @param {string} sectionId - Section ID
 */
export function toggleSection(sectionId) {
    const $section = $(`.collapsible-header[data-section="${sectionId}"]`).closest('.collapsible-section');
    $section.toggleClass('expanded');

    const $icon = $section.find('.toggle-icon');
    if ($section.hasClass('expanded')) {
        $icon.removeClass('fa-chevron-right').addClass('fa-chevron-down');
    } else {
        $icon.removeClass('fa-chevron-down').addClass('fa-chevron-right');
    }

    // Trigger event for other components
    $(document).trigger('collapsible:toggled', { sectionId, expanded: $section.hasClass('expanded') });
}

/**
 * Expand a collapsible section
 * @param {string} sectionId - Section ID
 */
export function expandSection(sectionId) {
    const $section = $(`.collapsible-header[data-section="${sectionId}"]`).closest('.collapsible-section');
    if (!$section.hasClass('expanded')) {
        toggleSection(sectionId);
    }
}

/**
 * Collapse a collapsible section
 * @param {string} sectionId - Section ID
 */
export function collapseSection(sectionId) {
    const $section = $(`.collapsible-header[data-section="${sectionId}"]`).closest('.collapsible-section');
    if ($section.hasClass('expanded')) {
        toggleSection(sectionId);
    }
}

/**
 * Expand all collapsible sections
 * @param {jQuery} $container - Container element (optional)
 */
export function expandAll($container = null) {
    const $sections = $container
        ? $container.find('.collapsible-section:not(.expanded)')
        : $('.collapsible-section:not(.expanded)');

    $sections.each(function() {
        const sectionId = $(this).find('.collapsible-header').data('section');
        expandSection(sectionId);
    });
}

/**
 * Collapse all collapsible sections
 * @param {jQuery} $container - Container element (optional)
 */
export function collapseAll($container = null) {
    const $sections = $container
        ? $container.find('.collapsible-section.expanded')
        : $('.collapsible-section.expanded');

    $sections.each(function() {
        const sectionId = $(this).find('.collapsible-header').data('section');
        collapseSection(sectionId);
    });
}

// ============================================================================
// COLLAPSIBLE GROUPS
// ============================================================================

/**
 * Create an accordion-style collapsible group (only one open at a time)
 * @param {Array<Object>} sections - Array of section configs
 * @returns {jQuery} jQuery element containing the accordion
 */
export function renderAccordion(sections) {
    const $container = $('<div>').addClass('accordion-group');

    sections.forEach((config, index) => {
        // Only first section is expanded by default
        config.expanded = index === 0;
        const $section = renderCollapsible(config);
        $container.append($section);

        // Close other sections when this one opens
        $section.find('.collapsible-header').on('click.collapsible', function() {
            const sectionId = $(this).data('section');
            if ($section.hasClass('expanded')) {
                // This section is being opened, close others
                $container.find('.collapsible-section').each(function() {
                    const otherId = $(this).find('.collapsible-header').data('section');
                    if (otherId !== sectionId && $(this).hasClass('expanded')) {
                        collapseSection(otherId);
                    }
                });
            }
        });
    });

    return $container;
}

// ============================================================================
// STATE QUERIES
// ============================================================================

/**
 * Check if a section is expanded
 * @param {string} sectionId - Section ID
 * @returns {boolean} True if expanded
 */
export function isExpanded(sectionId) {
    const $section = $(`.collapsible-header[data-section="${sectionId}"]`).closest('.collapsible-section');
    return $section.hasClass('expanded');
}

/**
 * Get all expanded section IDs
 * @returns {Array<string>} Array of expanded section IDs
 */
export function getExpandedSections() {
    const ids = [];
    $('.collapsible-section.expanded').each(function() {
        const id = $(this).find('.collapsible-header').data('section');
        if (id) ids.push(id);
    });
    return ids;
}

/**
 * Save expanded state to localStorage
 * @param {string} key - Storage key
 */
export function saveCollapsedState(key) {
    const expanded = getExpandedSections();
    localStorage.setItem(key, JSON.stringify(expanded));
}

/**
 * Restore expanded state from localStorage
 * @param {string} key - Storage key
 */
export function restoreCollapsedState(key) {
    const saved = localStorage.getItem(key);
    if (saved) {
        try {
            const expanded = JSON.parse(saved);
            // First collapse all, then expand saved ones
            collapseAll();
            expanded.forEach(id => expandSection(id));
        } catch (e) {
            console.warn('[Collapsible] Failed to restore state:', e);
        }
    }
}

// ============================================================================
// EXPORT FOR DEBUGGING
// ============================================================================

if (typeof window !== 'undefined') {
    window.StoryModeCollapsible = {
        renderCollapsible,
        toggleSection,
        expandSection,
        collapseSection,
        expandAll,
        collapseAll,
        renderAccordion,
        isExpanded,
        getExpandedSections,
        saveCollapsedState,
        restoreCollapsedState,
    };
}
