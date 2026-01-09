/**
 * Loading Indicator Module
 *
 * A standalone, reusable loading indicator for SillyTavern extensions.
 * Displays authorship-themed messages during async operations.
 *
 * Usage:
 *   import * as LoadingIndicator from './lib/loading-indicator.js';
 *
 *   await LoadingIndicator.init();
 *   LoadingIndicator.show();
 *   // ... async operation ...
 *   LoadingIndicator.hide();
 */

import { saveSettingsDebounced } from '/script.js';
import { extension_settings } from '/scripts/extensions.js';

// ============================================================================
// MODULE CONSTANTS
// ============================================================================

export const LOADING_INDICATOR_MODULE = 'loading_indicator';

export const DEFAULT_PHRASES = [
    "Gathering muses...",
    "Putting pen to paper...",
    "Consulting the literary canon...",
    "Channeling creative inspiration...",
    "Weaving narrative threads...",
    "Crafting prose...",
    "Summoning the muse...",
    "Polishing the manuscript...",
    "Composing eloquent verses...",
    "Orchestrating plot points...",
    "Refining character arcs...",
    "Distilling artistic vision...",
];

export const defaultIndicatorSettings = {
    enabled: true,
    position: 'bottom-left',
    customGifUrl: null,
    phrases: [...DEFAULT_PHRASES],
    animationStyle: 'spin',
};

// ============================================================================
// MODULE STATE
// ============================================================================

let container = null;
let isVisible = false;
let originalParent = null;
let cancelPreview = false;
let cycleTimeout = null;
let cycleInterval = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

export function init() {
    if (!extension_settings[LOADING_INDICATOR_MODULE]) {
        extension_settings[LOADING_INDICATOR_MODULE] = {...defaultIndicatorSettings};
        saveSettingsDebounced();
    }

    if (container) return;

    container = document.createElement('div');
    container.id = 'loading-indicator-container';
    container.className = 'loading-indicator-container';
    container.style.display = 'none';

    const icon = document.createElement('div');
    icon.className = 'loading-indicator-icon';
    icon.innerHTML = '<i class="fa-solid fa-pen-fancy"></i>';

    const text = document.createElement('div');
    text.className = 'loading-indicator-text';

    container.appendChild(icon);
    container.appendChild(text);

    container.addEventListener('click', () => {
        if (isVisible) {
            cancelPreview = true;
            hide();
        }
    });

    document.body.appendChild(container);
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function show(message = null) {
    const settings = extension_settings[LOADING_INDICATOR_MODULE];

    if (!settings.enabled || !container) return;

    ensureDialogContainer();

    const textEl = container.querySelector('.loading-indicator-text');

    // Set initial text (custom message or random phrase)
    textEl.textContent = message || getRandomPhrase();

    updatePosition(settings.position);
    updateAnimationStyle(settings.animationStyle);
    updateCustomGif(settings.customGifUrl);

    container.style.display = 'flex';
    isVisible = true;

    // Clear any existing timers
    if (cycleTimeout) {
        clearTimeout(cycleTimeout);
        cycleTimeout = null;
    }
    if (cycleInterval) {
        clearInterval(cycleInterval);
        cycleInterval = null;
    }

    // Always cycle through phrases, regardless of custom message
    // If a custom message was provided, show it for 2 seconds first, then start cycling
    const cycleStartDelay = message ? 2000 : 0;

    cycleTimeout = setTimeout(() => {
        if (!isVisible) return;

        // Do first cycle immediately after delay
        if (message) {
            textEl.textContent = getRandomPhrase();
        }

        // Start the cycling interval
        cycleInterval = setInterval(() => {
            if (isVisible) {
                textEl.textContent = getRandomPhrase();
            }
        }, 4000); // Change phrase every 4 seconds
    }, cycleStartDelay);
}

export function hide() {
    if (!container) return;

    // Clear the phrase cycling timers
    if (cycleTimeout) {
        clearTimeout(cycleTimeout);
        cycleTimeout = null;
    }
    if (cycleInterval) {
        clearInterval(cycleInterval);
        cycleInterval = null;
    }

    container.style.display = 'none';
    isVisible = false;

    if (originalParent && container.parentElement !== originalParent) {
        originalParent.appendChild(container);
    }
}

export function updateSettings(newSettings) {
    extension_settings[LOADING_INDICATOR_MODULE] = {
        ...extension_settings[LOADING_INDICATOR_MODULE],
        ...newSettings,
    };
    saveSettingsDebounced();
}

export function getSettings() {
    return extension_settings[LOADING_INDICATOR_MODULE] || {...defaultIndicatorSettings};
}

export function isShowing() {
    return isVisible;
}

// ============================================================================
// INTERNAL FUNCTIONS
// ============================================================================

function ensureDialogContainer() {
    const openDialog = document.querySelector('dialog[open]');
    if (openDialog && container.parentElement !== openDialog) {
        if (!originalParent) {
            originalParent = container.parentElement;
        }
        openDialog.appendChild(container);
    } else if (!openDialog && originalParent && container.parentElement !== originalParent) {
        originalParent.appendChild(container);
    }
}

function getRandomPhrase() {
    const settings = extension_settings[LOADING_INDICATOR_MODULE];
    const phrases = settings.phrases || DEFAULT_PHRASES;
    if (phrases.length === 0) return 'Loading...';
    return phrases[Math.floor(Math.random() * phrases.length)];
}

export async function startPreview() {
    const settings = extension_settings[LOADING_INDICATOR_MODULE];
    const phrases = settings?.phrases || [...DEFAULT_PHRASES];

    cancelPreview = false;

    if (phrases.length === 0) {
        show('Preview: No phrases configured!');
        setTimeout(() => hide(), 4000);
        return;
    }

    ensureDialogContainer();
    updatePosition(settings.position);
    updateAnimationStyle(settings.animationStyle);
    updateCustomGif(settings.customGifUrl);
    container.style.display = 'flex';

    const textEl = container.querySelector('.loading-indicator-text');

    for (const phrase of phrases) {
        if (cancelPreview) break;
        textEl.textContent = `Preview: ${phrase}`;
        await new Promise(r => setTimeout(r, 4000));
    }

    hide();
}

function updatePosition(position) {
    if (!container) return;
    container.classList.remove('bottom-left', 'bottom-right', 'top-left', 'top-right');
    container.classList.add(position);
}

function updateAnimationStyle(style) {
    if (!container) return;
    const icon = container.querySelector('.loading-indicator-icon');
    if (!icon) return;
    icon.classList.remove('spin', 'pulse', 'bounce');
    icon.classList.add(style);
}

function updateCustomGif(gifUrl) {
    if (!container) return;
    const icon = container.querySelector('.loading-indicator-icon');
    if (!icon) return;

    if (gifUrl?.trim()) {
        icon.classList.add('custom-gif');
        icon.style.backgroundImage = `url('${gifUrl}')`;
        icon.innerHTML = '';
    } else {
        icon.classList.remove('custom-gif');
        icon.style.backgroundImage = '';
        icon.innerHTML = '<i class="fa-solid fa-pen-fancy"></i>';
    }
}
