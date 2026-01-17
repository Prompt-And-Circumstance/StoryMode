// Standalone validation test for llmDescriptor field
// Tests the validation logic directly without importing modules

function validateAndNormalizeLlmDescriptor(blueprint) {
    const result = { ...blueprint };

    // Preserve llmDescriptor if present (with validation)
    if (Object.prototype.hasOwnProperty.call(blueprint, 'llmDescriptor')) {
        const desc = blueprint.llmDescriptor;
        // Validate: must be a string, non-empty, and within reasonable length
        if (typeof desc === 'string' && desc.trim().length > 0 && desc.length < 200) {
            result.llmDescriptor = desc.trim();
        } else {
            console.warn('[BlueprintModule] Invalid llmDescriptor in blueprint, discarding');
            result.llmDescriptor = undefined;
        }
    } else {
        result.llmDescriptor = undefined;
    }

    return result;
}

// Test suite for llmDescriptor validation
const testSuite = {
    name: "LLM Descriptor Validation Tests",

    tests: [
        {
            name: "Valid llmDescriptor should be preserved",
            input: { llmDescriptor: "gpt-4-turbo-preview" },
            expected: { llmDescriptor: "gpt-4-turbo-preview" }
        },
        {
            name: "Valid llmDescriptor with whitespace should be trimmed",
            input: { llmDescriptor: "  claude-opus-4-1  " },
            expected: { llmDescriptor: "claude-opus-4-1" }
        },
        {
            name: "Empty llmDescriptor should be discarded",
            input: { llmDescriptor: "" },
            expected: { llmDescriptor: undefined }
        },
        {
            name: "Whitespace-only llmDescriptor should be discarded",
            input: { llmDescriptor: "   " },
            expected: { llmDescriptor: undefined }
        },
        {
            name: "Long llmDescriptor (>200 chars) should be discarded",
            input: { llmDescriptor: "a".repeat(201) },
            expected: { llmDescriptor: undefined }
        },
        {
            name: "Non-string llmDescriptor should be discarded",
            input: { llmDescriptor: 12345 },
            expected: { llmDescriptor: undefined }
        },
        {
            name: "Null llmDescriptor should be converted to undefined",
            input: { llmDescriptor: null },
            expected: { llmDescriptor: undefined }
        },
        {
            name: "Missing llmDescriptor should default to undefined",
            input: {}, // No llmDescriptor property
            expected: { llmDescriptor: undefined }
        },
        {
            name: "Complex object with valid llmDescriptor should preserve other fields",
            input: {
                llmDescriptor: "gpt-4-turbo-preview",
                story_type_id: "mystery",
                scene_plan: []
            },
            expected: {
                llmDescriptor: "gpt-4-turbo-preview",
                story_type_id: "mystery",
                scene_plan: []
            }
        },
        {
            name: "Complex object with invalid llmDescriptor should preserve other fields",
            input: {
                llmDescriptor: "",
                story_type_id: "mystery",
                scene_plan: []
            },
            expected: {
                llmDescriptor: undefined,
                story_type_id: "mystery",
                scene_plan: []
            }
        },
        {
            name: "199 character llmDescriptor should be preserved",
            input: { llmDescriptor: "a".repeat(199) },
            expected: { llmDescriptor: "a".repeat(199) }
        },
        {
            name: "201 character llmDescriptor should be discarded",
            input: { llmDescriptor: "a".repeat(201) },
            expected: { llmDescriptor: undefined }
        }
    ],

    run() {
        console.log(`\n🧪 Running ${this.name}`);
        console.log("=".repeat(60));

        let passed = 0;
        let failed = 0;

        for (const test of this.tests) {
            try {
                const result = validateAndNormalizeLlmDescriptor(test.input);
                const actual = result.llmDescriptor;
                const expected = test.expected.llmDescriptor;

                // Compare the entire result object for complex tests
                const isMatch = JSON.stringify(result) === JSON.stringify(test.expected);

                if (isMatch) {
                    console.log(`✅ PASS: ${test.name}`);
                    passed++;
                } else {
                    console.log(`❌ FAIL: ${test.name}`);
                    console.log(`   Expected: ${JSON.stringify(test.expected, null, 2)}`);
                    console.log(`   Actual:   ${JSON.stringify(result, null, 2)}`);
                    failed++;
                }
            } catch (error) {
                console.log(`❌ ERROR: ${test.name}`);
                console.log(`   Error: ${error.message}`);
                failed++;
            }
        }

        console.log("\n" + "=".repeat(60));
        console.log(`Summary: ${passed} passed, ${failed} failed`);
        console.log(`Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

        return { passed, failed };
    }
};

// Run the tests
testSuite.run();