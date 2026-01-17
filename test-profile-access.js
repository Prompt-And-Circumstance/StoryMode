// Test profile access logic similar to generateBlueprint()
// Standalone test without module dependencies

// Mock profile data
const mockProfiles = [
    {
        id: "gpt-4-profile",
        name: "GPT-4 Turbo",
        model: "gpt-4-turbo-preview",
        base_url: "https://api.openai.com/v1",
        api_key: "sk-test"
    },
    {
        id: "claude-opus-profile",
        name: "Claude Opus 4",
        model: "claude-opus-4-1",
        base_url: "https://api.anthropic.com/v1",
        api_key: "sk-claude-test"
    },
    {
        id: "model-less-profile",
        name: "Profile without model",
        // Missing model field
        base_url: "https://api.example.com/v1",
        api_key: "sk-test"
    }
];

// Mock getConnectionProfiles function
function mockGetConnectionProfiles() {
    return mockProfiles;
}

// Test the LLM descriptor capture logic
function testLlmDescriptorCapture(selectedProfileId, mainApi = "gpt-3.5-turbo") {
    let llmDescriptor;

    if (selectedProfileId) {
        const profiles = mockGetConnectionProfiles();
        const usedProfile = profiles.find(p => p.id === selectedProfileId);
        if (usedProfile && usedProfile.model) {
            llmDescriptor = usedProfile.model; // e.g., "gpt-4-turbo-preview", "claude-opus-4-1"
        } else {
            // Profile selected but not found (deleted/invalid)
            llmDescriptor = `Unknown Profile (${selectedProfileId.substring(0, 8)}...)`;
        }
    } else {
        // No profile selected - using main API
        llmDescriptor = `Main API (${mainApi || 'Unknown'})`;
    }

    return llmDescriptor;
}

// Test suite for profile access
const testSuite = {
    name: "Profile Access and LLM Descriptor Tests",

    tests: [
        {
            name: "Valid profile with model should capture model name",
            action: () => testLlmDescriptorCapture("gpt-4-profile"),
            expected: "gpt-4-turbo-preview"
        },
        {
            name: "Another valid profile should capture correct model",
            action: () => testLlmDescriptorCapture("claude-opus-profile"),
            expected: "claude-opus-4-1"
        },
        {
            name: "Profile without model should generate fallback",
            action: () => testLlmDescriptorCapture("model-less-profile"),
            expected: "Unknown Profile (model-le...)"
        },
        {
            name: "Invalid profile ID should generate fallback",
            action: () => testLlmDescriptorCapture("invalid-profile-id-1234567890"),
            expected: "Unknown Profile (invalid-...)"
        },
        {
            name: "No profile selected should use Main API fallback",
            action: () => testLlmDescriptorCapture(null),
            expected: "Main API (gpt-3.5-turbo)"
        },
        {
            name: "No profile selected with undefined mainApi should use default",
            action: () => testLlmDescriptorCapture(null, undefined),
            expected: "Main API (gpt-3.5-turbo)"
        },
        {
            name: "No profile selected with null mainApi should show Unknown",
            action: () => testLlmDescriptorCapture(null, null),
            expected: "Main API (Unknown)"
        },
        {
            name: "Empty string profile ID is treated as no profile",
            action: () => testLlmDescriptorCapture(""),
            expected: "Main API (gpt-3.5-turbo)"
        }
    ],

    run() {
        console.log(`\n🔌 Running ${this.name}`);
        console.log("=".repeat(60));

        let passed = 0;
        let failed = 0;

        for (const test of this.tests) {
            try {
                const result = test.action();
                const expected = test.expected;

                if (result === expected) {
                    console.log(`✅ PASS: ${test.name}`);
                    console.log(`   Result: ${result}`);
                    passed++;
                } else {
                    console.log(`❌ FAIL: ${test.name}`);
                    console.log(`   Expected: "${expected}"`);
                    console.log(`   Actual:   "${result}"`);
                    failed++;
                }
            } catch (error) {
                console.log(`❌ ERROR: ${test.name}`);
                console.log(`   Error: ${error.message}`);
                failed++;
            }
            console.log();
        }

        console.log("=".repeat(60));
        console.log(`Summary: ${passed} passed, ${failed} failed`);
        console.log(`Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

        return { passed, failed };
    }
};

// Run the tests
testSuite.run();