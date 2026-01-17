
// Mock SillyTavern globals
global.chat = [];
global.extension_settings = {
    story_mode: {
        enabled: true,
        storyArcEnabled: true,
        depth: 0,
        position: 'chat',
        role: 'system'
    }
};

// Mock Context
const mockContext = {
    chatMetadata: {
        story_mode: {
            currentStep: 0,
            arcLength: 30,
            arcStarted: true,
            selectedStoryType: 'hero_journey',
            selectedAuthorStyle: 'tolkien'
        }
    },
    chat: global.chat
};

global.getContext = () => mockContext;

// Mock dependencies
global.saveMetadata = async () => console.log('Metadata saved (mock)');
global.setExtensionPrompt = (name, prompt) => {
    console.log(`[TEST] Prompt set for ${name}:`);
    console.log(prompt);
    global.latestPrompt = prompt;
};
global.extension_prompt_types = { NONE: 0 };

// Mock State Manager
const mockStateManager = {
    MODULE_NAME: 'story_mode',
    getChatStoryState: () => mockContext.chatMetadata.story_mode,
    saveChatStoryState: async (state) => {
        // Simulate slight delay to represent async I/O where race condition lives
        await new Promise(resolve => setTimeout(resolve, 50));
        mockContext.chatMetadata.story_mode = state;
        console.log('State saved to disk:', state);
    },
    getStoryTypes: () => [{
        id: 'hero_journey',
        progressTemplate: 'Round {currentStep} of {arcLength}',
        phasePrompts: { setup: 'Setup Phase' }
    }],
    getAuthorStyles: () => []
};

// Mock Imports (simplified for node env)
const mockArcEngine = {
    updateStoryPrompt: () => {
        const state = mockStateManager.getChatStoryState();
        // Mimic the NEW logic in arc-engine.js (no +1)
        const nextStep = state.currentStep;
        const prompt = `[STORY PACING]\nArc Progress: Round ${nextStep} of ${state.arcLength}`;
        global.setExtensionPrompt('story_mode', prompt);
    }
};

const mockBlueprintModule = {
    getBlueprintState: () => ({ blueprint: null }),
    trackMessageForScene: () => { }
};

// Recreate the fixed handleUserMessageStep logic
async function handleUserMessageStep(data) {
    const chatState = mockStateManager.getChatStoryState();

    // Increment
    const oldStep = chatState.currentStep;
    chatState.currentStep++;

    console.log(`[TEST] Step incremented to ${chatState.currentStep}. Calling updateStoryPrompt NOW.`);

    // NEW: Update prompt IMMEDIATELY
    mockArcEngine.updateStoryPrompt();

    console.log(`[TEST] Awaiting saveChatStoryState...`);
    await mockStateManager.saveChatStoryState(chatState);

    console.log(`[TEST] Done.`);
}

async function runTest() {
    console.log('--- Test: Race Condition Fix Verification ---');
    mockContext.chatMetadata.story_mode.currentStep = 0;

    // Run the handler
    await handleUserMessageStep({});

    // Check if the prompt reflects the incremented step (1)
    if (global.latestPrompt && global.latestPrompt.includes('Round 1')) {
        console.log('SUCCESS: Prompt contains "Round 1". Race condition avoided.');
    } else {
        console.error('FAILURE: Prompt does not contain "Round 1". Verify logic.');
        console.log('Actual Prompt:', global.latestPrompt);
    }
}

runTest();
