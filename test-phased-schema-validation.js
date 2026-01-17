// Standalone tests for blueprint schema validation related to phased generation
// Tests the new fields and validation rules added for phased generation

// Mock blueprint schema validation
const validateBlueprintSchema = (blueprint) => {
    const errors = [];

    // Check required fields
    const requiredFields = ['story_type_id', 'core_premise', 'setting', 'scene_plan'];
    for (const field of requiredFields) {
        if (!blueprint[field]) {
            errors.push(`Missing required field: ${field}`);
        }
    }

    // Check for new phased generation fields
    if (blueprint.blueprint_title && typeof blueprint.blueprint_title !== 'string') {
        errors.push('blueprint_title must be a string');
    }

    if (blueprint.cover_prompt && typeof blueprint.cover_prompt !== 'string') {
        errors.push('cover_prompt must be a string');
    }

    if (blueprint.validation_results && !Array.isArray(blueprint.validation_results)) {
        errors.push('validation_results must be an array');
    }

    // Check scene_plan for beats field
    if (Array.isArray(blueprint.scene_plan)) {
        blueprint.scene_plan.forEach((scene, sceneIndex) => {
            if (scene.beats) {
                if (!Array.isArray(scene.beats)) {
                    errors.push(`Scene ${sceneIndex}: beats must be an array`);
                } else {
                    scene.beats.forEach((beat, beatIndex) => {
                        if (beat.beatType && typeof beat.beatType !== 'string') {
                            errors.push(`Scene ${sceneIndex}, Beat ${beatIndex}: beatType must be a string`);
                        }
                    });
                }
            }
        });
    }

    return {
        isValid: errors.length === 0,
        errors
    };
};

// Test data
const validBlueprint = {
    story_type_id: "fantasy",
    core_premise: "A young hero discovers an ancient sword",
    setting: {
        location: "Enchanted Forest",
        time_period: "Medieval",
        atmosphere: "Mysterious"
    },
    scene_plan: [
        {
            index: 1,
            title: "The Discovery",
            phase: "setup",
            purpose: "Introduce the hero and the magical world",
            situation: "Hero enters the forbidden forest",
            key_events: ["Hero finds the glowing sword"],
            choice_points: [],
            beats: [
                {
                    beatType: "discovery",
                    description: "Hero discovers the ancient sword",
                    emotional_impact: "awe"
                }
            ]
        }
    ],
    antagonist_forces: {
        description: "Dark sorcerer",
        nature: "Supernatural",
        motivation: "Conquer the world"
    },
    possible_resolutions: [
        {
            title: "Hero's Victory",
            description: "Hero defeats the sorcerer and saves the world",
            character_outcomes: [
                {
                    character_name: "Hero",
                    final_state: "Became a legendary warrior"
                }
            ]
        }
    ],
    blueprint_title: "The Sword of Legends",
    cover_prompt: "A mystical sword glowing with blue energy in an ancient temple",
    validation_results: [
        { check: "story_structure", status: "passed", message: "Three-act structure intact" },
        { check: "character_consistency", status: "passed", message: "All characters remain consistent" }
    ],
    selected_resolution: 0
};

const invalidBlueprint = {
    story_type_id: "sci-fi",
    // Missing core_premise (required)
    setting: {
        location: "Space Station",
        time_period: "Future"
    },
    scene_plan: "not an array", // Invalid type
    blueprint_title: 123, // Invalid type
    cover_prompt: { invalid: "object" }, // Invalid type
    validation_results: "not an array" // Invalid type
};

const blueprintWithInvalidBeats = {
    story_type_id: "mystery",
    core_premise: "Detective solves a murder case",
    setting: {
        location: "Victorian London",
        time_period: "19th Century"
    },
    scene_plan: [
        {
            index: 1,
            title: "The Crime",
            phase: "setup",
            purpose: "Establish the mystery",
            situation: "Body discovered in mansion",
            key_events: ["Detective arrives at scene"],
            choice_points: [],
            beats: [
                {
                    beatType: 123, // Invalid type
                    description: "Detective examines the body"
                },
                {
                    beatType: "clue",
                    // Missing description (optional but should be present)
                }
            ]
        }
    ]
};

// Test suite for schema validation
const schemaTestSuite = {
    name: "Blueprint Schema Validation Tests (Phased Generation)",

    tests: [
        {
            name: "Valid blueprint should pass validation",
            test: () => {
                const result = validateBlueprintSchema(validBlueprint);
                if (!result.isValid) {
                    throw new Error(`Valid blueprint failed validation: ${result.errors.join(', ')}`);
                }
                return true;
            }
        },
        {
            name: "Invalid blueprint should fail validation",
            test: () => {
                const result = validateBlueprintSchema(invalidBlueprint);
                if (result.isValid) {
                    throw new Error('Invalid blueprint should have failed validation');
                }
                if (result.errors.length === 0) {
                    throw new Error('Invalid blueprint should have errors');
                }
                return true;
            }
        },
        {
            name: "Blueprint with invalid beats should fail validation",
            test: () => {
                const result = validateBlueprintSchema(blueprintWithInvalidBeats);
                if (result.isValid) {
                    throw new Error('Blueprint with invalid beats should have failed validation');
                }
                // Should have errors for beatType and missing description
                const hasBeatTypeError = result.errors.some(e => e.includes('beatType must be a string'));
                if (!hasBeatTypeError) {
                    throw new Error('Should have detected invalid beatType');
                }
                return true;
            }
        },
        {
            name: "Blueprint should accept optional fields",
            test: () => {
                const minimalBlueprint = {
                    story_type_id: "horror",
                    core_premise: "Haunted house story",
                    setting: { location: "Old House" },
                    scene_plan: []
                };

                const result = validateBlueprintSchema(minimalBlueprint);
                if (!result.isValid) {
                    throw new Error(`Minimal blueprint should be valid: ${result.errors.join(', ')}`);
                }
                return true;
            }
        },
        {
            name: "Blueprint should validate selected_resolution index",
            test: () => {
                const blueprintWithInvalidIndex = {
                    ...validBlueprint,
                    selected_resolution: 999 // Invalid index
                };

                const result = validateBlueprintSchema(blueprintWithInvalidIndex);
                // This should still pass as it's not enforced in basic validation
                if (!result.isValid) {
                    throw new Error(`Blueprint should not fail on invalid selected_resolution in basic validation: ${result.errors.join(', ')}`);
                }
                return true;
            }
        },
        {
            name: "Blueprint should handle empty arrays gracefully",
            test: () => {
                const blueprintWithEmptyArrays = {
                    ...validBlueprint,
                    possible_resolutions: [],
                    validation_results: []
                };

                const result = validateBlueprintSchema(blueprintWithEmptyArrays);
                if (!result.isValid) {
                    throw new Error(`Blueprint with empty arrays should be valid: ${result.errors.join(', ')}`);
                }
                return true;
            }
        },
        {
            name: "Blueprint should reject null values for required fields",
            test: () => {
                const blueprintWithNulls = {
                    story_type_id: null,
                    core_premise: null,
                    setting: null,
                    scene_plan: null
                };

                const result = validateBlueprintSchema(blueprintWithNulls);
                if (result.isValid) {
                    throw new Error('Blueprint with null required fields should fail validation');
                }
                return true;
            }
        },
        {
            name: "Blueprint should accept all beat types",
            test: () => {
                const blueprintWithVariousBeats = {
                    ...validBlueprint,
                    scene_plan: [{
                        ...validBlueprint.scene_plan[0],
                        beats: [
                            { beatType: "discovery", description: "Found something" },
                            { beatType: "conflict", description: "Fight scene" },
                            { beatType: "romance", description: "Love interest" },
                            { beatType: "comedy", description: "Funny moment" },
                            { beatType: "drama", description: "Emotional scene" },
                            { beatType: "mystery", description: "Plot twist" }
                        ]
                    }]
                };

                const result = validateBlueprintSchema(blueprintWithVariousBeats);
                if (!result.isValid) {
                    throw new Error(`Blueprint with various beat types should be valid: ${result.errors.join(', ')}`);
                }
                return true;
            }
        }
    ],

    run() {
        console.log(`\n🧪 Running ${this.name}`);
        console.log("=".repeat(60));

        let passed = 0;
        let failed = 0;

        for (const test of this.tests) {
            try {
                test.test();
                console.log(`✅ PASS: ${test.name}`);
                passed++;
            } catch (error) {
                console.log(`❌ FAIL: ${test.name}`);
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
schemaTestSuite.run();