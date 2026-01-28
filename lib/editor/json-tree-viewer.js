/**
 * JSON Tree Viewer - Lightweight collapsible tree renderer for blueprint JSON
 *
 * Renders JSON objects/arrays as an interactive tree with:
 * - Collapsible/expandable nodes
 * - Syntax highlighting
 * - Efficient rendering (only visible nodes)
 * - Copy path support
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const TYPE_COLORS = {
    string: 'var(--SmartThemeBodyColor)',
    number: '#b5cea8',
    boolean: '#569cd6',
    null: '#569cd6',
    key: 'var(--SmartThemeEmColor)',
};

const MAX_STRING_LENGTH = 100;
const INITIAL_DEPTH = 2; // Auto-expand first 2 levels

// ============================================================================
// STATE
// ============================================================================

let expandedPaths = new Set();
let rootData = null;

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Escape HTML in strings
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Get type of value
 * @param {*} value - Value to check
 * @returns {string} Type name
 */
function getType(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
}

/**
 * Truncate long strings
 * @param {string} str - String to truncate
 * @returns {string} Truncated string
 */
function truncateString(str) {
    if (str.length <= MAX_STRING_LENGTH) return str;
    return str.substring(0, MAX_STRING_LENGTH) + '...';
}

/**
 * Format primitive value with syntax highlighting
 * @param {*} value - Primitive value
 * @returns {string} HTML string
 */
function formatPrimitive(value) {
    const type = getType(value);
    const color = TYPE_COLORS[type] || TYPE_COLORS.string;

    if (type === 'string') {
        const escaped = escapeHtml(truncateString(value));
        return `<span style="color: ${color};">"${escaped}"</span>`;
    }
    if (type === 'null') {
        return `<span style="color: ${color};">null</span>`;
    }
    return `<span style="color: ${color};">${String(value)}</span>`;
}

/**
 * Get preview summary for collapsed nodes
 * @param {Object|Array} value - Object or array
 * @returns {string} Preview text
 */
function getPreview(value) {
    if (Array.isArray(value)) {
        return `Array(${value.length})`;
    }
    const keys = Object.keys(value);
    if (keys.length === 0) return '{}';
    if (keys.length <= 3) {
        return `{ ${keys.join(', ')} }`;
    }
    return `{ ${keys.slice(0, 3).join(', ')}, ... } (${keys.length} keys)`;
}

/**
 * Toggle node expansion
 * @param {string} path - Dot-notation path
 */
function toggleExpanded(path) {
    if (expandedPaths.has(path)) {
        expandedPaths.delete(path);
    } else {
        expandedPaths.add(path);
    }
}

/**
 * Check if path is expanded
 * @param {string} path - Dot-notation path
 * @returns {boolean} True if expanded
 */
function isExpanded(path) {
    return expandedPaths.has(path);
}

// ============================================================================
// RENDERING
// ============================================================================

/**
 * Render a tree node (recursive)
 * @param {string} key - Property key
 * @param {*} value - Property value
 * @param {string} path - Dot-notation path
 * @param {number} depth - Current depth
 * @returns {string} HTML string
 */
function renderNode(key, value, path, depth) {
    const type = getType(value);
    const indent = depth * 20;

    // Primitive values - render inline
    if (type !== 'object' && type !== 'array') {
        return `
            <div class="json-tree-node json-tree-leaf" style="padding-left: ${indent}px;">
                <span class="json-tree-key" style="color: ${TYPE_COLORS.key};">${escapeHtml(key)}</span>:
                ${formatPrimitive(value)}
            </div>
        `;
    }

    // Object/Array - render as collapsible node
    const expanded = isExpanded(path);
    const icon = expanded ? 'fa-chevron-down' : 'fa-chevron-right';
    const preview = expanded ? '' : `<span class="json-tree-preview" style="color: var(--SmartThemeQuoteColor); margin-left: 8px; font-size: 0.9em;">${getPreview(value)}</span>`;

    let html = `
        <div class="json-tree-node json-tree-parent" style="padding-left: ${indent}px;">
            <i class="fa-solid ${icon} json-tree-toggle" data-path="${escapeHtml(path)}" style="cursor: pointer; margin-right: 6px; width: 12px;"></i>
            <span class="json-tree-key" style="color: ${TYPE_COLORS.key};">${escapeHtml(key)}</span>:
            ${preview}
        </div>
    `;

    // Render children if expanded
    if (expanded) {
        if (Array.isArray(value)) {
            value.forEach((item, index) => {
                const childPath = `${path}[${index}]`;
                html += renderNode(`[${index}]`, item, childPath, depth + 1);
            });
        } else {
            Object.entries(value).forEach(([childKey, childValue]) => {
                const childPath = path ? `${path}.${childKey}` : childKey;
                html += renderNode(childKey, childValue, childPath, depth + 1);
            });
        }
    }

    return html;
}

/**
 * Render the entire tree
 * @param {Object} data - Root data object
 * @param {HTMLElement} container - Container element
 */
function renderTree(data, container) {
    rootData = data;

    // Auto-expand root and first level if not previously interacted
    if (expandedPaths.size === 0) {
        autoExpandDepth(data, '', 0, INITIAL_DEPTH);
    }

    const html = renderNode('root', data, '', 0);
    container.innerHTML = html;

    // Attach click handlers for toggle icons
    container.querySelectorAll('.json-tree-toggle').forEach(toggle => {
        toggle.addEventListener('click', function(e) {
            e.stopPropagation();
            const path = this.getAttribute('data-path');
            toggleExpanded(path);
            renderTree(rootData, container); // Re-render
        });
    });
}

/**
 * Auto-expand nodes up to a certain depth
 * @param {*} value - Current value
 * @param {string} path - Current path
 * @param {number} currentDepth - Current depth
 * @param {number} maxDepth - Maximum depth to expand
 */
function autoExpandDepth(value, path, currentDepth, maxDepth) {
    if (currentDepth >= maxDepth) return;

    const type = getType(value);
    if (type !== 'object' && type !== 'array') return;

    expandedPaths.add(path);

    if (Array.isArray(value)) {
        value.forEach((item, index) => {
            const childPath = `${path}[${index}]`;
            autoExpandDepth(item, childPath, currentDepth + 1, maxDepth);
        });
    } else {
        Object.entries(value).forEach(([key, childValue]) => {
            const childPath = path ? `${path}.${key}` : key;
            autoExpandDepth(childValue, childPath, currentDepth + 1, maxDepth);
        });
    }
}

// ============================================================================
// TREE CONTROLS
// ============================================================================

/**
 * Expand all nodes
 */
function expandAll() {
    expandedPaths.clear();
    collectAllPaths(rootData, '', expandedPaths);
}

/**
 * Collapse all nodes
 */
function collapseAll() {
    expandedPaths.clear();
}

/**
 * Collect all paths in a tree (for expand all)
 * @param {*} value - Current value
 * @param {string} path - Current path
 * @param {Set<string>} paths - Set to populate
 */
function collectAllPaths(value, path, paths) {
    const type = getType(value);
    if (type !== 'object' && type !== 'array') return;

    paths.add(path);

    if (Array.isArray(value)) {
        value.forEach((item, index) => {
            collectAllPaths(item, `${path}[${index}]`, paths);
        });
    } else {
        Object.entries(value).forEach(([key, childValue]) => {
            const childPath = path ? `${path}.${key}` : key;
            collectAllPaths(childValue, childPath, paths);
        });
    }
}

/**
 * Reset tree state (for new data)
 */
function resetTreeState() {
    expandedPaths.clear();
    rootData = null;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Initialize tree viewer
 * @param {Object} data - JSON data to display
 * @param {HTMLElement} container - Container element
 */
export function initTreeViewer(data, container) {
    resetTreeState();
    renderTree(data, container);
}

/**
 * Re-render tree (after expand/collapse all)
 * @param {HTMLElement} container - Container element
 */
export function refreshTree(container) {
    if (!rootData) return;
    renderTree(rootData, container);
}

/**
 * Expand all tree nodes
 * @param {HTMLElement} container - Container element
 */
export function expandAllNodes(container) {
    if (!rootData) return;
    expandAll();
    renderTree(rootData, container);
}

/**
 * Collapse all tree nodes
 * @param {HTMLElement} container - Container element
 */
export function collapseAllNodes(container) {
    if (!rootData) return;
    collapseAll();
    renderTree(rootData, container);
}

/**
 * Get the raw JSON string (for copy/export)
 * @returns {string} JSON string
 */
export function getJsonString() {
    if (!rootData) return '';
    return JSON.stringify(rootData, null, 2);
}
