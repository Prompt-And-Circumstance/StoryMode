/**
 * Blueprint Debug Mode Test
 *
 * This file demonstrates how to use the blueprint debug mode to test the
 * entire generation pipeline without making actual LLM API calls.
 *
 * Usage:
 * 1. Open your browser console in SillyTavern
 * 2. Run: testBlueprintDebugMode()
 * 3. Open the Story Mode settings
 * 4. Click "Generate Blueprint"
 * 5. Watch the wizard generate instantly using mock data
 *
 * To disable debug mode:
 * - Run: disableBlueprintDebugMode() in console
 * - Or manually set: window.BLUEPRINT_DEBUG_MODE = false
 */

// Import the debug mode utilities (must be called from browser console)
// These are exposed via the blueprint-debug-mocks.js module

/**
 * Enable blueprint debug mode
 * Call this from the browser console to start using mock LLM responses
 */
async function testBlueprintDebugMode() {
    try {
        // Dynamic import to load the debug utilities
        const debugUtils = await import('./lib/blueprint-debug-mocks.js');

        // Enable debug mode
        debugUtils.setBlueprintDebugMode(true);

        console.log('%c========================================', 'color: #00ff00; font-weight: bold; font-size: 14px');
        console.log('%cBLUEPRINT DEBUG MODE ENABLED', 'color: #00ff00; font-weight: bold; font-size: 16px');
        console.log('%c========================================', 'color: #00ff00; font-weight: bold; font-size: 14px');
        console.log('%cℹ️  When you generate a blueprint, mock responses will be used for all 4 phases.', 'color: #00ff00; font-size: 12px');
        console.log('%c✓ Phase 1: Foundation (core_premise, setting, etc.)', 'color: #00ff00');
        console.log('%c✓ Phase 2: Elaboration (character_arcs, tone_and_style)', 'color: #00ff00');
        console.log('%c✓ Phase 3: Structure (arc_structure, scene_plan, boundaries)', 'color: #00ff00');
        console.log('%c✓ Phase 4: Resolutions (endings, blueprint_title, cover_prompt)', 'color: #00ff00');
        console.log('%c\nTo disable: run disableBlueprintDebugMode()', 'color: #ffff00');
        console.log('%c========================================', 'color: #00ff00; font-weight: bold; font-size: 14px');

        return true;
    } catch (error) {
        console.error('[Blueprint Debug] Failed to enable debug mode:', error);
        return false;
    }
}

/**
 * Disable blueprint debug mode
 * Call this from the browser console to switch back to real LLM calls
 */
function disableBlueprintDebugMode() {
    window.BLUEPRINT_DEBUG_MODE = false;
    console.log('%c✗ Blueprint debug mode DISABLED', 'color: #ff6600; font-weight: bold');
    console.log('Real LLM API calls will be used for blueprint generation.');
}

/**
 * Check current debug mode status
 */
function checkBlueprintDebugMode() {
    const enabled = window.BLUEPRINT_DEBUG_MODE === true;
    const status = enabled ? '✓ ENABLED' : '✗ DISABLED';
    const color = enabled ? '#00ff00' : '#ff0000';
    console.log(`%cBlueprint Debug Mode: ${status}`, `color: ${color}; font-weight: bold`);
    return enabled;
}

/**
 * Show what mock data is available for testing
 */
async function showBlueprintMockData() {
    try {
        const debugUtils = await import('./lib/blueprint-debug-mocks.js');

        console.log('%cAvailable Mock Data:', 'color: #00ffff; font-weight: bold; font-size: 14px');
        console.log('%c\nPHASE 1 - Foundation:', 'color: #00ffff; font-weight: bold; margin-top: 10px');
        console.log(debugUtils.PHASE_1_MOCK);

        console.log('%c\nPHASE 2 - Elaboration:', 'color: #00ffff; font-weight: bold; margin-top: 10px');
        console.log(debugUtils.PHASE_2_MOCK);

        console.log('%c\nPHASE 3 - Structure:', 'color: #00ffff; font-weight: bold; margin-top: 10px');
        console.log(debugUtils.PHASE_3_MOCK);

        console.log('%c\nPHASE 4 - Resolutions:', 'color: #00ffff; font-weight: bold; margin-top: 10px');
        console.log(debugUtils.PHASE_4_MOCK);
    } catch (error) {
        console.error('[Blueprint Debug] Failed to load mock data:', error);
    }
}

/**
 * Test a specific phase's mock response
 * @param {number} phase - Phase number (1-4)
 */
async function testBlueprintPhase(phase) {
    if (![1, 2, 3, 4].includes(phase)) {
        console.error(`Invalid phase: ${phase}. Must be 1-4`);
        return;
    }

    try {
        const debugUtils = await import('./lib/blueprint-debug-mocks.js');
        const response = debugUtils.getMockPhaseResponse(phase);

        console.log(`%cPhase ${phase} Mock Response:`, 'color: #00ffff; font-weight: bold');
        console.log(response);
        return response;
    } catch (error) {
        console.error(`[Blueprint Debug] Failed to get Phase ${phase} mock:`, error);
    }
}

/**
 * Export functions to window so they're available in console
 */
if (typeof window !== 'undefined') {
    window.testBlueprintDebugMode = testBlueprintDebugMode;
    window.disableBlueprintDebugMode = disableBlueprintDebugMode;
    window.checkBlueprintDebugMode = checkBlueprintDebugMode;
    window.showBlueprintMockData = showBlueprintMockData;
    window.testBlueprintPhase = testBlueprintPhase;
}

console.log('%c[Blueprint Debug] Test utilities loaded!', 'color: #00ffff; font-weight: bold');
console.log('%cAvailable commands:', 'color: #00ffff');
console.log('%c• testBlueprintDebugMode()     - Enable mock LLM responses', 'color: #00ffff');
console.log('%c• disableBlueprintDebugMode()  - Disable and use real LLM', 'color: #00ffff');
console.log('%c• checkBlueprintDebugMode()    - Check current status', 'color: #00ffff');
console.log('%c• showBlueprintMockData()      - View all mock data', 'color: #00ffff');
console.log('%c• testBlueprintPhase(1-4)      - Test specific phase', 'color: #00ffff');

export { testBlueprintDebugMode, disableBlueprintDebugMode, checkBlueprintDebugMode, showBlueprintMockData, testBlueprintPhase };
