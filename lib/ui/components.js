/**
 * UI Components Module for Story Mode Extension
 *
 * This file now serves as a re-export layer for backward compatibility.
 * All component functions have been split into focused modules under ./components/
 *
 * For new code, prefer importing directly from the specific module:
 * - import { createHelpIcon } from './components/helpers.js';
 * - import { renderMainPanel } from './components/main-panel.js';
 *
 * Or import everything from the index:
 * - import { ... } from './components/index.js';
 */

// Re-export everything from the component modules index
export * from './components/index.js';
