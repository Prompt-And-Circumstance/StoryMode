/**
 * @file Core module public API
 * @module core
 */

// Constants
export {
    MODULE_NAME,
    METAPHOR_LEVELS,
    LENGTH_PRESETS,
    PHASE_CONFIG,
} from './constants.js';

// State management
export {
    getSettings,
    getChatStoryState,
    saveChatStoryState,
    getStoryTypes,
    setStoryTypes,
    getAuthorStyles,
    setAuthorStyles,
    getCurrentSceneIndex,
    setCurrentSceneIndex,
    getBeatState,
    resetBeatState,
} from './state-manager.js';

// Arc engine
export {
    getPhaseInfo,
    buildFullInjection,
} from './arc-engine.js';

// Event handlers
export {
    handleUserMessageStep,
    handleAIMessageChecks,
} from './event-handlers.js';
