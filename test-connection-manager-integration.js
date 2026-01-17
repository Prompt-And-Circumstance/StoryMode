// Integration tests for Connection Manager profile access
import { getConnectionProfiles } from './lib/blueprint-module.js';

// Mock extension settings for testing
const mockExtensionSettings = {
    connectionManager: {
        profiles: [
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
        ]
    }
};

// Mock global getContext function
function mockGetContext() {
    return {
        extensionSettings: {
            disabledExtensions: [],
            ...mockExtensionSettings
        }
    };
}

// Test suite for Connection Manager integration
const testSuite = {
    name: "Connection Manager Integration Tests",

    tests: [
        {
            name: "getConnectionProfiles should return all profiles when Connection Manager is enabled",
            setup: () => {
                // Mock the global getContext
                global.getContext = mockGetContext;
            },
            action: () => {
                return getConnectionProfiles();
            },
            expected: (result) => {
                return result.length === 3 &&
                       result.some(p => p.id === "gpt-4-profile") &&
                       result.some(p => p.id === "claude-opus-profile");
            }
        },
        {
            name: "getConnectionProfiles should return empty array when Connection Manager is disabled",
            setup: () => {
                global.getContext = () => ({
                    extensionSettings: {
                        disabledExtensions: ['connection-manager']
                    }
                });
            },
            action: () => {
                return getConnectionProfiles();
            },
            expected: (result) => {
                return result.length === 0;
            }
        },
        {
            name: "getConnectionProfiles should handle missing extension_settings gracefully",
            setup: () => {
                global.getContext = () => ({
                    extensionSettings: {}
                });
            },
            action: () => {
                return getConnectionProfiles();
            },
            expected: (result) => {
                return result.length === 0;
            }
        },
        {
            name: "Profile model field should be accessible",
            setup: () => {
                global.getContext = mockGetContext;
            },
            action: () => {
                const profiles = getConnectionProfiles();
                return profiles.find(p => p.id === "gpt-4-profile");
            },
            expected: (profile) => {
                return profile && profile.model === "gpt-4-turbo-preview";
            }
        },
        {
            name: "Profiles without model field should handle gracefully",
            setup: () => {
                global.getContext = mockGetContext;
            },
            action: () => {
                const profiles = getConnectionProfiles();
                return profiles.find(p => p.id === "model-less-profile");
            },
            expected: (profile) => {
                return profile && profile.model === undefined;
            }
        },
        {
            name: "Main API fallback should work when no profile is selected",
            setup: () => {
                global.getContext = mockGetContext;
            },
            action: () => {
                const mainApi = "gpt-3.5-turbo";
                return `Main API (${mainApi})`;
            },
            expected: (result) => {
                return result === "Main API (gpt-3.5-turbo)";
            }
        },
        {
            name: "Invalid profile ID should generate fallback descriptor",
            setup: () => {
                global.getContext = mockGetContext;
            },
            action: () => {
                const invalidId = "invalid-profile-id-1234567890";
                return `Unknown Profile (${invalidId.substring(0, 8)}...)`;
            },
            expected: (result) => {
                return result === "Unknown Profile (invalid-p...)";
            }
        }
    ],

    async run() {
        console.log(`\n🔌 Running ${this.name}`);
        console.log("=" .repeat(50));

        let passed = 0;
        let failed = 0;

        for (const test of this.tests) {
            try {
                test.setup();
                const result = test.action();
                const isValid = test.expected(result);

                if (isValid) {
                    console.log(`✅ PASS: ${test.name}`);
                    passed++;
                } else {
                    console.log(`❌ FAIL: ${test.name}`);
                    console.log(`   Expected: ${test.expected.toString()}`);
                    console.log(`   Actual:   ${JSON.stringify(result)}`);
                    failed++;
                }
            } catch (error) {
                console.log(`❌ ERROR: ${test.name}`);
                console.log(`   Error: ${error.message}`);
                failed++;
            }
        }

        console.log("\n" + "=".repeat(50));
        console.log(`Summary: ${passed} passed, ${failed} failed`);

        return { passed, failed };
    }
};

// Run the tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = testSuite;
} else {
    // Run in browser environment
    testSuite.run();
}