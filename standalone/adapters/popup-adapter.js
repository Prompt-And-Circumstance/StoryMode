/**
 * Popup Adapter Module
 * Modal system for standalone blueprint editor (replaces ST Popup class)
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const Z_INDEX_BASE = 1050;
let zIndexCounter = Z_INDEX_BASE;

const DEFAULT_OPTIONS = {
    okButton: true,
    cancelButton: true,
    yesButton: false,
    noButton: false,
    wide: false,
    large: false,
    allowVerticalScrolling: false,
    closable: true,
};

/**
 * Get next z-index for popups
 * @returns {number} Z-index value
 */
function getNextZIndex() {
    return zIndexCounter++;
}

// ============================================================================
// POPUP CLASS
// ============================================================================

/**
 * Popup class for modal dialogs
 * Replaces SillyTavern Popup functionality
 */
export class Popup {
    constructor(content, type = 'TEXT', title = '', options = {}) {
        this.options = { ...DEFAULT_OPTIONS, ...options };
        this.title = title;
        this.type = type;
        this.content = content;

        this.$element = null;
        this.result = null;
        this.zIndex = getNextZIndex();

        this._create();
    }

    /**
     * Create the popup DOM structure
     * @private
     */
    _create() {
        const $overlay = $('<div>').addClass('modal-overlay').css('z-index', this.zIndex);
        const $container = $('<div>').addClass('modal-container');

        // Apply size modifiers
        if (this.options.wide) $container.addClass('wide');
        if (this.options.large) $container.addClass('large');

        // Build header
        let $header = $('<div>').addClass('modal-header');
        if (this.title) {
            $header.append($('<h2>').text(this.title));
        }

        // Close button
        const $closeBtn = $('<button>').addClass('modal-close')
            .attr('aria-label', 'Close')
            .html('<i class="fa-solid fa-xmark"></i>');

        $header.append($closeBtn);
        $container.append($header);

        // Build body
        const $body = $('<div>').addClass('modal-body');
        if (this.options.allowVerticalScrolling) {
            $body.css('max-height', '70vh');
        }

        // Handle content
        if (typeof this.content === 'string') {
            $body.html(this.content);
        } else if (this.content instanceof jQuery) {
            $body.append(this.content);
        }

        $container.append($body);

        // Build footer
        if (this.options.okButton || this.options.cancelButton ||
            this.options.yesButton || this.options.noButton) {
            const $footer = $('<div>').addClass('modal-footer');

            if (this.options.okButton) {
                $footer.append($('<button>').addClass('btn btn-primary').text('OK'));
            }
            if (this.options.cancelButton) {
                $footer.append($('<button>').addClass('btn').text('Cancel'));
            }
            if (this.options.yesButton) {
                $footer.append($('<button>').addClass('btn btn-primary').text('Yes'));
            }
            if (this.options.noButton) {
                $footer.append($('<button>').addClass('btn').text('No'));
            }

            $container.append($footer);
        }

        this.$element = $overlay.append($container);
    }

    /**
     * Show the popup
     * @returns {Promise} Promise that resolves with user action result
     */
    show() {
        return new Promise((resolve) => {
            // Add to DOM
            $('body').append(this.$element);

            let resolved = false;
            const resolveOnce = (value) => {
                if (resolved) return;
                resolved = true;
                this.close();
                resolve(value);
            };

            // Bind close button
            this.$element.find('.modal-close').on('click.modal', () => {
                resolveOnce(null);
            });

            // Close on overlay click if closable
            if (this.options.closable) {
                this.$element.on('click.modal', (e) => {
                    if (e.target === this.$element[0] ||
                        e.target.classList.contains('modal-overlay')) {
                        resolveOnce(null);
                    }
                });
            }

            // Bind OK/Yes button → resolves true
            this.$element.find('.modal-footer .btn-primary').on('click.modal', () => {
                resolveOnce(true);
            });

            // Bind Cancel/No button → resolves null
            this.$element.find('.modal-footer .btn:not(.btn-primary)').on('click.modal', () => {
                resolveOnce(null);
            });

            // Show with animation
            setTimeout(() => {
                this.$element.css('opacity', '1');
            }, 10);
        });
    }

    /**
     * Close the popup
     * @returns {Popup} This popup instance for chaining
     */
    close() {
        this.$element.fadeOut(150, () => {
            this.$element.remove();
        });
        return this;
    }

    /**
     * Set popup title
     * @param {string} title - New title
     * @returns {Popup} This popup instance for chaining
     */
    setTitle(title) {
        this.title = title;
        this.$element.find('.modal-header h2').text(title);
        return this;
    }

    /**
     * Get popup content element
     * @returns {jQuery} Content element
     */
    getContent() {
        return this.$element.find('.modal-body');
    }

    /**
     * Set popup content
     * @param {string|jQuery} content - New content
     * @returns {Popup} This popup instance for chaining
     */
    setContent(content) {
        const $body = this.$element.find('.modal-body');
        if (typeof content === 'string') {
            $body.html(content);
        } else if (content instanceof jQuery) {
            $body.empty().append(content);
        }
        return this;
    }

    /**
     * Get popup footer element
     * @returns {jQuery} Footer element
     */
    getFooter() {
        return this.$element.find('.modal-footer');
    }

    /**
     * Remove OK button
     * @returns {Popup} This popup instance for chaining
     */
    hideOKButton() {
        this.$element.find('.btn-primary, .btn:last').remove();
        return this;
    }

    /**
     * Remove Cancel button
     * @returns {Popup} This popup instance for chaining
     */
    hideCancelButton() {
        this.$element.find('.btn:not(.btn-primary)').remove();
        return this;
    }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Show a simple alert popup
 * @param {string} message - Alert message
 * @param {string} title - Popup title
 * @returns {Promise} Promise that resolves when popup is closed
 */
export function alert(message, title = 'Notice') {
    const popup = new Popup(message, 'TEXT', title, {
        okButton: true,
        cancelButton: false,
    });
    return popup.show();
}

/**
 * Show a confirmation popup
 * @param {string} message - Confirmation message
 * @param {string} title - Popup title
 * @returns {Promise<boolean>} Promise that resolves to true if confirmed, false otherwise
 */
export function confirm(message, title = 'Confirm') {
    const popup = new Popup(message, 'TEXT', title, {
        okButton: true,
        cancelButton: true,
    });
    return popup.show();
}

/**
 * Show a wide popup for forms
 * @param {string|jQuery} content - Popup content
 * @param {string} title - Popup title
 * @param {Object} options - Additional options
 * @returns {Popup} Popup instance
 */
export function createWidePopup(content, title = '', options = {}) {
    return new Popup(content, 'TEXT', title, {
        wide: true,
        ...options,
    });
}

/**
 * Show a large popup for complex content
 * @param {string|jQuery} content - Popup content
 * @param {string} title - Popup title
 * @param {Object} options - Additional options
 * @returns {Popup} Popup instance
 */
export function createLargePopup(content, title = '', options = {}) {
    return new Popup(content, 'TEXT', title, {
        large: true,
        allowVerticalScrolling: true,
        ...options,
    });
}

// ============================================================================
// EXPORT FOR DEBUGGING
// ============================================================================

if (typeof window !== 'undefined') {
    window.StoryModePopup = {
        Popup,
        alert,
        confirm,
        createWidePopup,
        createLargePopup,
    };
}
