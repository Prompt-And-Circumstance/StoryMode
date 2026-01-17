// Logic Verification Script for Story Mode Pacing
// Run with: node check-pacing-logic.js

import assert from 'assert';

// Mock state
let chatState = {
    currentStep: 0,
    arcLength: 30
};

// Mock dependencies
const chat = [];
let eventData = {};

// Mock functions from codebase
async function handleUserMessageStep(data) {
    const oldStep = chatState.currentStep;
    chatState.currentStep++;
    console.log(`[Mock] Round incremented: ${oldStep} -> ${chatState.currentStep}`);
}

async function onMessageReceived(data) {
    // Robust check for user message logic from lib/event-handlers.js
    let isUserMessage = data?.is_user;

    // Fallback logic
    if (isUserMessage === undefined && chat && chat.length > 0) {
        if (typeof data === 'number' && chat[data]) {
            isUserMessage = chat[data].is_user;
        } else if (data?.mesId !== undefined && chat[data.mesId]) {
            isUserMessage = chat[data.mesId].is_user;
        } else {
            isUserMessage = chat[chat.length - 1].is_user;
        }
        console.log(`[Mock] Fallback check determined is_user=${isUserMessage}`);
    }

    if (isUserMessage) {
        await handleUserMessageStep(data);
    } else {
        console.log('[Mock] AI message detected - no increment');
    }
}

// Logic for Scene Pacing (Updated with Manual Mode Logic)
function getScenePacingInfo(currentStep, arcLength, sceneMode = 'auto', manualSceneIndex = 0) {
    // Simplified logic for "Monster of the Week" (10 scenes)
    const totalScenes = 10;

    // Helper to calculate scene boundaries (needed for both modes)
    const calculateSceneBoundaries = () => {
        // Dynamic distribution (simplified for mock)
        const boundaries = [];
        for (let i = 0; i < totalScenes; i++) {
            const start = Math.floor((i / totalScenes) * arcLength);
            const end = Math.floor(((i + 1) / totalScenes) * arcLength);
            boundaries.push({ start, end, rounds: Math.max(1, end - start) });
        }
        return boundaries;
    };

    const boundaries = calculateSceneBoundaries();

    let sceneIndex, clampedSceneIndex, sceneStartRound, sceneEndRound, expectedSceneRounds;

    if (sceneMode === 'manual') {
        const foundSceneIndex = Math.max(0, Math.min(manualSceneIndex, totalScenes - 1));
        const boundary = boundaries[foundSceneIndex];

        sceneIndex = foundSceneIndex;
        clampedSceneIndex = foundSceneIndex;
        sceneStartRound = boundary.start;
        sceneEndRound = boundary.end;
        expectedSceneRounds = boundary.rounds;
    } else {
        // Auto logic
        let foundSceneIndex = 0;
        for (let i = 0; i < totalScenes; i++) {
            if (currentStep < boundaries[i].end) {
                foundSceneIndex = i;
                break;
            }
        }
        if (currentStep >= boundaries[totalScenes - 1].end) {
            foundSceneIndex = totalScenes - 1;
        }

        const boundary = boundaries[foundSceneIndex];
        sceneIndex = foundSceneIndex;
        clampedSceneIndex = foundSceneIndex;
        sceneStartRound = boundary.start;
        sceneEndRound = boundary.end;
        expectedSceneRounds = boundary.rounds;
    }

    const roundInScene = Math.max(0, currentStep - sceneStartRound);

    return {
        sceneIndex: clampedSceneIndex,
        sceneStartRound,
        sceneEndRound,
        roundInScene,
        expectedSceneRounds
    };
}

async function runTest() {
    console.log('--- TEST START: Pacing Progression & Manual Mode ---');

    console.log('\n1. Initial State: Round 0');
    // Scenario: User sends 1st message (Round 1)

    // Message 1 (User)
    chat.push({ is_user: true, mes: "Hello" });
    await onMessageReceived({ is_user: true });

    assert.strictEqual(chatState.currentStep, 1, 'Current step should be 1');

    let pacing = getScenePacingInfo(chatState.currentStep, chatState.arcLength);
    console.log(`Current Step: ${chatState.currentStep}`);
    console.log(`[Auto] Scene Info: Index ${pacing.sceneIndex}, Round in Scene: ${pacing.roundInScene}`);

    assert.strictEqual(pacing.roundInScene, 1, 'Scene round should be 1 for the first message');

    console.log('\n2. AI Responds (Round 1 continues)');
    // AI Message
    chat.push({ is_user: false, mes: "Hi there" });
    await onMessageReceived({ is_user: false });

    assert.strictEqual(chatState.currentStep, 1, 'Current step should STILL be 1');

    console.log('\n3. User Responds (Round 2)');
    // Message 2 (User)
    chat.push({ is_user: true, mes: "What's up?" });
    await onMessageReceived({ is_user: true });

    assert.strictEqual(chatState.currentStep, 2, 'Current step should be 2');

    pacing = getScenePacingInfo(chatState.currentStep, chatState.arcLength);
    console.log(`Current Step: ${chatState.currentStep}`);
    console.log(`[Auto] Scene Info: Index ${pacing.sceneIndex}, Round in Scene: ${pacing.roundInScene}`);

    assert.strictEqual(pacing.roundInScene, 2, 'Scene round should be 2');

    console.log('\n4. Fallback Logic Test');
    // Simulate event data missing is_user
    chat.push({ is_user: true, mes: "Hidden user message" });
    // Pass empty object, relying on chat history fallback
    await onMessageReceived({});

    assert.strictEqual(chatState.currentStep, 3, 'Current step should be 3 via fallback');

    console.log('\n5. MANUAL MODE TEST');
    // Scenario: User manually jumps to Scene 3 (Index 2)
    // Current Step is 3. Auto would put us in Scene 1 (index 0).
    // Manual Scene 3 starts around round 6 (for 30 rounds total, 10 scenes = 3 rounds/scene).
    // Scene 3 range: [6, 9)

    const manualSceneIndex = 2; // Scene 3
    const pacingManual = getScenePacingInfo(chatState.currentStep, chatState.arcLength, 'manual', manualSceneIndex);

    console.log(`Current Step: ${chatState.currentStep} (Global)`);
    console.log(`[Manual Request] Scene Index: ${manualSceneIndex}`);
    console.log(`[Manual Result] Scene Index: ${pacingManual.sceneIndex}`);
    console.log(`[Manual Result] Scene Start Round: ${pacingManual.sceneStartRound}`);
    console.log(`[Manual Result] Round In Scene: ${pacingManual.roundInScene} (CurrentStep - SceneStart)`);

    assert.strictEqual(pacingManual.sceneIndex, manualSceneIndex, 'Should force scene index 2');
    assert.strictEqual(pacingManual.sceneStartRound, 6, 'Scene 3 should start at round 6');
    // 3 - 6 = -3. Wait, Math.max(0, ...) handles this in my code?
    // Let's check my implementation: Math.max(0, currentStep - sceneStartRound)
    // If I jump AHEAD, I haven't started the scene yet effectively? 
    // Or does "Scene Round" mean "How deep am I into this scene context?".
    // If I force Scene 3 but I am only at global round 3, I am technically satisfying the "pre-requisites" or similar?
    // Actually, usually manual mode is used to jump BACK or stay in a scene.
    // If I jump FORWARD, 'roundInScene' being 0 makes sense (just started/haven't started).

    // CASE A: Jump Forward
    assert.strictEqual(pacingManual.roundInScene, 0, 'Should be 0 if current step is before scene start');

    // CASE B: Jump Backward / Stay
    // Let's say we are at step 20 (Scene 7 approx), and we force Scene 1 (Index 0).
    const stepAdvance = 20;
    const pacingManualBack = getScenePacingInfo(stepAdvance, chatState.arcLength, 'manual', 0);
    console.log(`\n[Manual Back] Step 20, Force Scene 1 (Start 0)`);
    console.log(`[Manual Back] Round In Scene: ${pacingManualBack.roundInScene}`);

    assert.strictEqual(pacingManualBack.sceneIndex, 0, 'Should force scene index 0');
    assert.strictEqual(pacingManualBack.roundInScene, 20, 'Should show we have been in Scene 1 for 20 rounds (overtime)');

    console.log('\n--- TEST PASS ---');
}

runTest();
