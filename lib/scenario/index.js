/**
 * @file Scenario module public API
 * @module scenario
 */

export {
    markBeatCompleted,
    markBeatSkipped,
    isBeatCompleted,
    getCompletedBeats,
    resetBeatProgress,
    resetBeatsForScene,
    setCurrentBeatFocus,
} from './beats.js';

export {
    buildScenarioModeInjection,
    deriveExitTrigger,
    buildSignalsBlock,
} from './injection.js';

export {
    buildMissingCharactersXml,
    getMissingCharactersForInjection,
    getMissingCharactersForScene,
    isCharacterInjectionEnabled,
} from './character-injection.js';
