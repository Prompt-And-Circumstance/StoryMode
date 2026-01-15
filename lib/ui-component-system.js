/**
 * UI Component System Module
 *
 * Provides a declarative component registry for building HTML UI components.
 * Reduces code duplication and provides a consistent API for rendering.
 *
 * @module ui-component-system
 * @version 1.0.0
 */

// ============================================================================
// COMPONENT TEMPLATES
// ============================================================================

/**
 * Component template registry
 * Maps component types to their rendering functions
 */
const ComponentTemplates = {
    /**
     * Toggle switch component
     * @param {Object} props - Component properties
     * @param {string} props.id - Element ID
     * @param {string} props.label - Toggle label text
     * @param {string} props.description - Toggle description text
     * @param {string} [props.helpText] - Optional help tooltip text
     * @param {boolean} [props.checked=true] - Whether the toggle is checked
     * @returns {string} HTML string
     */
    toggle(props) {
        const { id, label, description, helpText, checked = true } = props;
        const checkedAttr = checked ? 'checked' : '';
        const helpIcon = helpText ? this.helpIcon({ text: helpText }) : '';

        return `
<div class="storymode-toggle">
    <div class="storymode-toggle-info">
        <span class="storymode-toggle-label">${this.escapeHtml(label)}</span>
        <span class="storymode-toggle-description">${this.escapeHtml(description)}</span>
        ${helpIcon}
    </div>
    <label class="storymode-switch">
        <input type="checkbox" id="${this.escapeHtml(id)}" ${checkedAttr}>
        <span class="storymode-switch-slider"></span>
    </label>
</div>`;
    },

    /**
     * Select dropdown component
     * @param {Object} props - Component properties
     * @param {string} props.id - Element ID
     * @param {string} props.label - Select label text
     * @param {string} [props.helpText] - Optional help tooltip text
     * @param {Array<{value: string, label: string}>} props.options - Dropdown options
     * @param {string} [props.value] - Currently selected value
     * @returns {string} HTML string
     */
    select(props) {
        const { id, label, helpText, options = [], value } = props;
        const helpIcon = helpText ? this.helpIcon({ text: helpText }) : '';

        const optionsHtml = options.map(opt => {
            const selected = opt.value === value ? 'selected' : '';
            return `<option value="${this.escapeHtml(opt.value)}" ${selected}>${this.escapeHtml(opt.label)}</option>`;
        }).join('');

        return `
<div class="storymode-form-group">
    <label class="storymode-form-label">
        ${this.escapeHtml(label)}
        ${helpIcon}
    </label>
    <select id="${this.escapeHtml(id)}" class="storymode-select">
        ${optionsHtml}
    </select>
</div>`;
    },

    /**
     * Text input component
     * @param {Object} props - Component properties
     * @param {string} props.id - Element ID
     * @param {string} props.label - Input label text
     * @param {string} [props.placeholder] - Placeholder text
     * @param {string} [props.value] - Input value
     * @param {string} [props.helpText] - Optional help tooltip text
     * @param {number} [props.rows=3] - Number of rows for textarea
     * @param {boolean} [props.textarea=false] - Whether to render as textarea
     * @returns {string} HTML string
     */
    textInput(props) {
        const {
            id,
            label,
            placeholder = '',
            value = '',
            helpText,
            rows = 3,
            textarea = false
        } = props;

        const helpIcon = helpText ? this.helpIcon({ text: helpText }) : '';
        const inputElement = textarea
            ? `<textarea id="${this.escapeHtml(id)}" class="storymode-textarea" rows="${rows}" placeholder="${this.escapeHtml(placeholder)}">${this.escapeHtml(value)}</textarea>`
            : `<input type="text" id="${this.escapeHtml(id)}" class="storymode-input" value="${this.escapeHtml(value)}" placeholder="${this.escapeHtml(placeholder)}">`;

        return `
<div class="storymode-form-group">
    <label class="storymode-form-label">
        ${this.escapeHtml(label)}
        ${helpIcon}
    </label>
    ${inputElement}
</div>`;
    },

    /**
     * Form section with header
     * @param {Object} props - Component properties
     * @param {string} props.title - Section title
     * @param {string} [props.icon] - Font Awesome icon class
     * @param {string} props.content - Section HTML content
     * @returns {string} HTML string
     */
    section(props) {
        const { title, icon, content } = props;
        const iconHtml = icon ? `<i class="${icon}"></i> ` : '';

        return `
<div class="storymode-section">
    <h3 class="storymode-section-title">${iconHtml}${this.escapeHtml(title)}</h3>
    ${content}
</div>`;
    },

    /**
     * Inline drawer (collapsible section)
     * @param {Object} props - Component properties
     * @param {string} props.id - Drawer ID
     * @param {string} props.title - Drawer title
     * @param {string} [props.icon] - Font Awesome icon class
     * @param {string} props.content - Drawer HTML content
     * @param {boolean} [props.open=false] - Whether drawer is open by default
     * @returns {string} HTML string
     */
    drawer(props) {
        const { id, title, icon, content, open = false } = props;
        const iconHtml = icon ? `<i class="${icon}"` : '<i class="fa-solid fa-chevron-down"';
        const openClass = open ? 'open' : '';

        return `
<div class="inline-drawer ${openClass}" id="${this.escapeHtml(id)}">
    <div class="inline-drawer-toggle inline-drawer-header">
        <h4 class="storymode-section-title" style="margin: 0;">
            ${iconHtml}</i> ${this.escapeHtml(title)}
        </h4>
        <div class="inline-drawer-icon fa-solid interactable down fa-circle-chevron-down" tabindex="0" role="button"></div>
    </div>
    <div class="inline-drawer-content" style="display: ${open ? 'block' : 'none'};">
        ${content}
    </div>
</div>`;
    },

    /**
     * Help icon component
     * @param {Object} props - Component properties
     * @param {string} props.text - Help text for tooltip
     * @param {string} [props.icon='fa-solid fa-circle-info'] - Font Awesome icon class
     * @returns {string} HTML string
     */
    helpIcon(props) {
        const { text, icon = 'fa-solid fa-circle-info' } = props;
        const escapedText = this.escapeHtml(text);
        return `<i class="${icon} sm-help-icon" title="${escapedText}"></i>`;
    },

    /**
     * Button component
     * @param {Object} props - Component properties
     * @param {string} props.id - Button ID
     * @param {string} props.text - Button text
     * @param {string} [props.icon] - Font Awesome icon class
     * @param {string} [props.type='button'] - Button type
     * @param {string} [props.class=''] - Additional CSS classes
     * @returns {string} HTML string
     */
    button(props) {
        const { id, text, icon, type = 'button', extraClass = '' } = props;
        const iconHtml = icon ? `<i class="${icon}"></i> ` : '';

        return `
<button id="${this.escapeHtml(id)}" type="${type}" class="storymode-button ${extraClass}">
    ${iconHtml}${this.escapeHtml(text)}
</button>`;
    },

    /**
     * Grid layout component
     * @param {Object} props - Component properties
     * @param {number} props.columns - Number of columns
     * @param {Array<string>} props.children - Child HTML strings
     * @param {string} [props.gap='20px'] - Grid gap size
     * @returns {string} HTML string
     */
    grid(props) {
        const { columns, children = [], gap = '20px' } = props;

        return `
<div style="display: grid; grid-template-columns: repeat(${columns}, 1fr); gap: ${gap};">
    ${children.join('\n    ')}
</div>`;
    },
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Escape HTML entities to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
export function escapeHtml(text) {
    if (typeof text !== 'string') return String(text || '');
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Get the 'checked' attribute for a checkbox input
 * @param {boolean|undefined} value - The checkbox value
 * @param {boolean} [defaultChecked=true] - The default state if value is undefined
 * @returns {string} 'checked' or empty string
 */
export function getCheckedAttr(value, defaultChecked = true) {
    if (value === undefined) return defaultChecked ? 'checked' : '';
    return value ? 'checked' : '';
}

/**
 * Get the 'checked' attribute for a checkbox with default-true behavior
 * @param {boolean|undefined} value - The checkbox value
 * @returns {string} 'checked' or empty string
 */
export function getCheckedAttrDefaultTrue(value) {
    return value === false ? '' : 'checked';
}

// ============================================================================
// COMPONENT RENDERER
// ============================================================================

/**
 * Render a single component by type
 * @param {string} type - Component type (toggle, select, textInput, etc.)
 * @param {Object} props - Component properties
 * @returns {string} HTML string
 */
export function renderComponent(type, props) {
    const template = ComponentTemplates[type];
    if (!template) {
        console.warn(`[UIComponentSystem] Unknown component type: ${type}`);
        return '';
    }

    // Bind escapeHtml to the template for internal use
    const boundTemplate = template.bind({ escapeHtml });

    return boundTemplate(props);
}

/**
 * Render multiple components from an array of definitions
 * @param {Array<{type: string, props: Object}>} components - Component definitions
 * @returns {string} Combined HTML string
 */
export function renderComponents(components) {
    return components.map(({ type, props }) => renderComponent(type, props)).join('\n');
}

/**
 * Render a component with conditional rendering
 * @param {string} type - Component type
 * @param {Object} props - Component properties
 * @param {boolean} [condition=true] - Whether to render the component
 * @returns {string} HTML string or empty string
 */
export function renderComponentIf(type, props, condition = true) {
    return condition ? renderComponent(type, props) : '';
}

// ============================================================================
// SPECIALIZED BUILDERS
// ============================================================================

/**
 * Build a settings subtab structure
 * @param {Object} options - Build options
 * @param {Array<{id: string, label: string, icon: string}>} options.subtabs - Subtab definitions
 * @param {string} options.activeSubtab - Currently active subtab ID
 * @param {Object} options.content - Map of subtab ID to content HTML
 * @returns {string} HTML string for subtab structure
 */
export function buildSubtabStructure({ subtabs, activeSubtab, content }) {
    const subtabButtons = subtabs.map(({ id, label, icon }) => {
        const isActive = id === activeSubtab ? 'active' : '';
        return `
<button class="storymode-settings-subtab ${isActive}" data-subtab="${id}" title="${label}">
    <i class="${icon}"></i> ${label}
</button>`;
    }).join('\n');

    const contentPanes = subtabs.map(({ id }) => {
        const isActive = id === activeSubtab ? 'active' : '';
        return `
<div id="settings_subtab_${id}" class="storymode-settings-subtab-pane ${isActive}">
    ${content[id] || ''}
</div>`;
    }).join('\n');

    return `
<!-- Settings Subtabs -->
<div class="storymode-settings-subtabs">
${subtabButtons}
</div>
<!-- Settings Subtab Content Panes -->
${contentPanes}`;
}

/**
 * Build a select dropdown from data
 * @param {Object} options - Build options
 * @param {string} options.id - Element ID
 * @param {string} options.label - Label text
 * @param {Array<{id: string, name: string}>} options.data - Data array
 * @param {string} [options.selectedId] - Currently selected ID
 * @param {string} [options.helpText] - Help tooltip text
 * @returns {string} HTML string
 */
export function buildSelectFromData({ id, label, data = [], selectedId, helpText }) {
    const options = data.map(item => ({
        value: item.id,
        label: item.name,
    }));

    return renderComponent('select', {
        id,
        label,
        options,
        value: selectedId,
        helpText,
    });
}

// ============================================================================
// PUBLIC API SUMMARY
// ============================================================================

/**
 * UI Component System Public API
 *
 * Rendering:
 * - renderComponent(type, props) -> string
 * - renderComponents(components) -> string
 * - renderComponentIf(type, props, condition) -> string
 *
 * Utilities:
 * - escapeHtml(text) -> string
 * - getCheckedAttr(value, defaultChecked) -> string
 * - getCheckedAttrDefaultTrue(value) -> string
 *
 * Specialized Builders:
 * - buildSubtabStructure(options) -> string
 * - buildSelectFromData(options) -> string
 *
 * Component Types:
 * - toggle: Toggle switch component
 * - select: Dropdown select component
 * - textInput: Text/textarea input component
 * - section: Form section with header
 * - drawer: Collapsible drawer component
 * - helpIcon: Help tooltip icon
 * - button: Button component
 * - grid: Grid layout component
 */
