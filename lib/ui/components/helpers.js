/**
 * UI Helper Functions for Story Mode Extension
 * Utility functions for HTML rendering and DOM manipulation
 */

import { escapeHtml, renderComponent } from '../component-system.js';

/**
 * Create a help icon HTML with tooltip
 * @param {string} helpText - The help text for the tooltip
 * @param {string} [iconClass='fa-circle-info'] - Font Awesome icon class
 * @returns {string} HTML string for the help icon
 */
export function createHelpIcon(helpText, iconClass = 'fa-solid fa-circle-info') {
    const escapedText = escapeHtml(helpText);
    return `<i class="${iconClass} sm-help-icon" title="${escapedText}"></i>`;
}

/**
 * Create a help icon HTML with tooltip from an array of lines
 * @param {string[]} lines - Array of help text lines (will be bullet-pointed)
 * @param {string} [iconClass='fa-circle-info'] - Font Awesome icon class
 * @returns {string} HTML string for the help icon
 */
export function createHelpIconFromLines(lines, iconClass = 'fa-solid fa-circle-info') {
    const text = lines.map(line => `• ${line}`).join('\n');
    return createHelpIcon(text, iconClass);
}

/**
 * Create a toggle switch component (wrapper for backward compatibility)
 * Now delegates to ui-component-system.js
 * @param {Object} options - Toggle options
 * @param {string} options.id - Element ID
 * @param {string} options.label - Toggle label text
 * @param {string} options.description - Toggle description text
 * @param {string} [options.helpText] - Optional help tooltip text
 * @param {boolean} [options.checked=true] - Whether the toggle is checked
 * @returns {string} HTML string for the toggle component
 */
export function createToggle({ id, label, description, helpText, checked = true }) {
    return renderComponent('toggle', { id, label, description, helpText, checked });
}
