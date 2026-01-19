/**
 * @file Generation module public API
 * @module generation
 */

// Re-export from prompts.js
export {
    initPromptBuilders,
    buildBlueprintRequest,
    buildMasterPrompt,
    buildPhasePrompt,
    getExpectedSceneCount,
} from './prompts.js';

// Re-export from orchestration.js
export {
    initOrchestration,
    generateBlueprintPhased,
    generateWithPreset,
    generateOpeningMessage,
} from './orchestration.js';
