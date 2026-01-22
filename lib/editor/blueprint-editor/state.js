/**
 * Blueprint Editor State Module
 * Shared state for the split blueprint editor modules
 */

// ============================================================================
// MODULE STATE
// ============================================================================

let currentBlueprint = null;
let originalBlueprint = null;
let activeTab = 'details';  // 'details' | 'scenes' | 'cover' | 'characters'
let hasUnsavedChanges = false;

// ============================================================================
// STATE ACCESSORS
// ============================================================================

export function getCurrentBlueprint() {
    return currentBlueprint;
}

export function setCurrentBlueprint(blueprint) {
    currentBlueprint = blueprint;
}

export function getOriginalBlueprint() {
    return originalBlueprint;
}

export function setOriginalBlueprint(blueprint) {
    originalBlueprint = blueprint;
}

export function getActiveTab() {
    return activeTab;
}

export function setActiveTab(tab) {
    activeTab = tab;
}

export function getHasUnsavedChanges() {
    return hasUnsavedChanges;
}

export function setHasUnsavedChanges(value) {
    hasUnsavedChanges = value;
}

// ============================================================================
// STATE UTILITIES
// ============================================================================

/**
 * Reset all state to initial values
 */
export function resetState() {
    currentBlueprint = null;
    originalBlueprint = null;
    activeTab = 'details';
    hasUnsavedChanges = false;
}

/**
 * Initialize state with a blueprint for editing
 * @param {Object} blueprint - Blueprint to edit
 */
export function initializeState(blueprint) {
    currentBlueprint = JSON.parse(JSON.stringify(blueprint));
    originalBlueprint = JSON.parse(JSON.stringify(blueprint));
    activeTab = 'details';
    hasUnsavedChanges = false;
}
