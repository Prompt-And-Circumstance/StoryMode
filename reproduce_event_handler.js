
// Mock SillyTavern global objects
global.chat = [];
global.extension_settings = {
    story_mode: {
        enabled: true,
        storyArcEnabled: true,
        blueprintSettings: { enabled: true, useScenePrompts: true }
    }
};

// Mock Context
const mockContext = {
    chatMetadata: {
        story_mode: {
            currentStep: 0,
            arcLength: 30,
            arcStarted: true
        }
    },
    chat: global.chat
};

global.getContext = () => mockContext;

// Mock other dependencies
global.saveMetadata = async () => console.log('Metadata saved');
global.eventSource = { emit: () => { } };
global.event_types = { CHAT_METADATA_UPDATED: 'CHAT_METADATA_UPDATED' };

// Mock imports
const mockStateManager = {
    MODULE_NAME: 'story_mode',
    getChatStoryState: () => mockContext.chatMetadata.story_mode,
    saveChatStoryState: async (state) => {
        mockContext.chatMetadata.story_mode = state;
        console.log('State saved:', state);
    }
};

const mockBlueprintModule = {
    getBlueprintState: () => ({ blueprint: {}, useBlueprint: true }),
    trackMessageForScene: () => { },
    saveBlueprintState: async () => { },
    markBeatCompleted: async () => false
};

const mockArcEngine = {
    updateStoryPrompt: () => console.log('Prompt updated')
};

// Import the function to test (we'll read the file and eval it, or require it if we can)
// Since we can't easily require ES modules in this env without type=module, 
// I will copy the logic of onMessageReceived directly here to test it against the mocks.

async function onMessageReceived(data) {
    const settings = global.extension_settings.story_mode;

    console.log(`[Story Mode] Message received: is_user=${data?.is_user}, mesId=${data?.mesId}`);

    let isUserMessage = data?.is_user;

    if (isUserMessage === undefined && global.chat && global.chat.length > 0) {
        if (typeof data === 'number' && global.chat[data]) {
            isUserMessage = global.chat[data].is_user;
        } else if (data?.mesId !== undefined && global.chat[data.mesId]) {
            isUserMessage = global.chat[data.mesId].is_user;
        } else {
            isUserMessage = global.chat[global.chat.length - 1].is_user;
        }
        console.log(`[Story Mode] Fallback check determined is_user=${isUserMessage}`);
    }

    if (isUserMessage) {
        await handleUserMessageStep(data);
    }
}

async function handleUserMessageStep(data) {
    const chatState = mockStateManager.getChatStoryState();
    chatState.currentStep++;
    await mockStateManager.saveChatStoryState(chatState);
    console.log(`[Story Mode] Round incremented to ${chatState.currentStep}`);
    mockArcEngine.updateStoryPrompt();
}

// Test Cases

async function runTests() {
    console.log('--- Test 1: Data has is_user = true ---');
    mockContext.chatMetadata.story_mode.currentStep = 0;
    await onMessageReceived({ is_user: true, mesId: 0 });

    console.log('--- Test 2: Data is number, chat has message ---');
    mockContext.chatMetadata.story_mode.currentStep = 0;
    global.chat = [{ is_user: true, mes: 'User message' }];
    await onMessageReceived(0); // number

    console.log('--- Test 3: Data is object with mesId, chat has message ---');
    mockContext.chatMetadata.story_mode.currentStep = 0;
    global.chat = [{ is_user: true, mes: 'User message' }];
    await onMessageReceived({ mesId: 0 });

    console.log('--- Test 4: Data empty, chat has message (fallback to last) ---');
    mockContext.chatMetadata.story_mode.currentStep = 0;
    global.chat = [{ is_user: true, mes: 'User message' }];
    await onMessageReceived({});

    console.log('--- Test 5: AI message (should NOT increment) ---');
    mockContext.chatMetadata.story_mode.currentStep = 0;
    global.chat = [{ is_user: false, mes: 'AI message' }];
    await onMessageReceived(0);
}

runTests();
