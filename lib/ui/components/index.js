/**
 * UI Components Index for Story Mode Extension
 *
 * This module re-exports all component functions from their individual modules.
 * Import from this index to maintain backward compatibility with code that
 * previously imported from the monolithic components.js file.
 *
 * Module structure:
 * - helpers.js: Utility functions (createHelpIcon, createToggle)
 * - main-panel.js: Main sidebar panel and blueprint preview
 * - settings-tabs.js: Settings dialog subtabs
 * - blueprint-settings.js: Blueprint settings subtab
 * - blueprint-tabs.js: Blueprint generation and display tabs
 * - wizard.js: Phased generation wizard components
 * - library.js: Blueprint library tab
 * - sidebar.js: Settings dialog sidebar
 * - misc.js: Additional tab content
 */

// Helpers
export {
    createHelpIcon,
    createHelpIconFromLines,
    createToggle,
} from './helpers.js';

// Main panel components
export {
    renderBeatProgress,
    renderMainPanel,
    renderBlueprintPreview,
} from './main-panel.js';

// Settings dialog subtabs
export {
    buildStoryArcSubtab,
    buildAuthorStyleSubtab,
    buildPostArcOptionsSubtab,
    buildAPIOptionsSubtab,
    buildGenreStyleTabContent,
    buildSettingsTabContent,
    buildBlueprintSettingsSubtab,
} from './settings-tabs.js';

// Blueprint tabs
export {
    buildGenerateBlueprintSubtab,
    buildBlueprintTabContent,
    renderBlueprintOverviewSubtab,
    renderBlueprintScenesSubtab,
    renderBlueprintCharactersSubtab,
    renderBlueprintJsonSubtab,
} from './blueprint-tabs.js';

// Wizard components
export {
    buildWizardProgressHTML,
    buildWizardPreview,
    buildResolutionSelectionUI,
    buildPrimaryEndingDisplay,
    buildWizardSettingsToggle,
} from './wizard.js';

// Library components
export {
    buildLibraryTabContent,
    showLibraryGenerateView,
    showLibraryGridView,
    renderBlueprintCard,
} from './library.js';

// Sidebar
export {
    buildSidebarContent,
} from './sidebar.js';

// Misc components
export {
    buildGenerateLoadTabContent,
} from './misc.js';

// Re-export component system utilities for convenience
export {
    escapeHtml,
    getCheckedAttr,
    getCheckedAttrDefaultTrue,
    renderComponent,
    buildSelectFromData,
    buildSubtabStructure,
} from '../component-system.js';
