// Unit tests for LLM descriptor field validation in normalizeBlueprint()
import { normalizeBlueprint } from './lib/blueprint-module.js';

// Test suite for normalizeBlueprint llmDescriptor validation
const testSuite = {
    name: "LLM Descriptor Unit Tests",

    tests: [
        {
            name: "Valid llmDescriptor should be preserved",
            input: {
                llmDescriptor: "gpt-4-turbo-preview",
                otherField: "test"
            },
            expected: {
                llmDescriptor: "gpt-4-turbo-preview",
                otherField: "test"
            }
        },
        {
            name: "Valid llmDescriptor with whitespace should be trimmed",
            input: {
                llmDescriptor: "  claude-opus-4-1  ",
                otherField: "test"
            },
            expected: {
                llmDescriptor: "claude-opus-4-1",
                otherField: "test"
            }
        },
        {
            name: "Empty llmDescriptor should be discarded",
            input: {
                llmDescriptor: "",
                otherField: "test"
            },
            expected: {
                llmDescriptor: undefined,
                otherField: "test"
            }
        },
        {
            name: "Whitespace-only llmDescriptor should be discarded",
            input: {
                llmDescriptor: "   ",
                otherField: "test"
            },
            expected: {
                llmDescriptor: undefined,
                otherField: "test"
            }
        },
        {
            name: "Long llmDescriptor (>200 chars) should be discarded",
            input: {
                llmDescriptor: "a".repeat(201),
                otherField: "test"
            },
            expected: {
                llmDescriptor: undefined,
                otherField: "test"
            }
        },
        {
            name: "Non-string llmDescriptor should be discarded",
            input: {
                llmDescriptor: 12345,
                otherField: "test"
            },
            expected: {
                llmDescriptor: undefined,
                otherField: "test"
            }
        },
        {
            name: "Null llmDescriptor should be converted to undefined",
            input: {
                llmDescriptor: null,
                otherField: "test"
            },
            expected: {
                llmDescriptor: undefined,
                otherField: "test"
            }
        },
        {
            name: "Undefined llmDescriptor should not affect other fields",
            input: {
                otherField: "test"
                // llmDescriptor is undefined (not present)
            },
            expected: {
                llmDescriptor: undefined,
                otherField: "test"
            }
        },
        {
            name: "Missing llmDescriptor (backward compatibility) should default to undefined",
            input: {
                otherField: "test"
            },
            expected: {
                llmDescriptor: undefined,
                otherField: "test"
            }
        }
    ],

    async run() {
        console.log(`\n🧪 Running ${this.name}`);
        console.log("=" .repeat(50));

        let passed = 0;
        let failed = 0;

        for (const test of this.tests) {
            try {
                const result = normalizeBlueprint(test.input);
                const actual = result.llmDescriptor;
                const expected = test.expected.llmDescriptor;

                if (actual === expected) {
                    console.log(`✅ PASS: ${test.name}`);
                    passed++;
                } else {
                    console.log(`❌ FAIL: ${test.name}`);
                    console.log(`   Expected: ${expected}`);
                    console.log(`   Actual:   ${actual}`);
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