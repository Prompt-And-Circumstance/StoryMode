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
