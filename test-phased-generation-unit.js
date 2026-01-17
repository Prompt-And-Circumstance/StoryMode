// Standalone unit tests for phased blueprint generation functionality
// Tests phase-specific functions and configuration without full module dependencies

// Mock the necessary constants and functions for testing
const PHASE_CONFIG = {
    1: {
        name: 'Foundation',
        progress: 20,
        description: 'Building story foundation...',
        fields: ['core_premise', 'setting', 'antagonistic_forces', 'arc_structure', 'tone_and_style'],
        maxTokens: 4096,
    },
    2: {
        name: 'Characters',
        progress: 40,
        description: 'Developing character arcs...',
        fields: ['protagonist_group', 'character_arcs'],
        maxTokens: 8192,
    },
    3: {
        name: 'Scenes',
        progress: 70,
        description: 'Planning story scenes...',
        fields: ['scene_plan'],
        maxTokens: 16384,
    },
    4: {
        name: 'Resolutions',
        progress: 90,
        description: 'Crafting story endings...',
        fields: ['primary_ending', 'alternate_endings', 'blueprint_title', 'cover_prompt'],
        maxTokens: 8192,
    },
    5: {
        name: 'Validation',
        progress: 100,
        description: 'Finalizing blueprint...',
        fields: ['validation_results'],
        maxTokens: 4096,
    },
};

// Mock functions for testing
function mockBuildFoundationPrompt(request, storyType, authorStyle) {
    return `Foundation prompt for ${storyType.name}`;
}

function mockBuildCharactersPrompt(request, storyType, authorStyle, partialBlueprint) {
    return `Characters prompt for ${storyType.name}`;
}

function mockBuildScenesPrompt(request, storyType, authorStyle, partialBlueprint) {
    return `Scenes prompt for ${storyType.name}`;
}

function mockBuildResolutionsPrompt(request, storyType, authorStyle, partialBlueprint) {
    return `Resolutions prompt for ${storyType.name}`;
}

function mockBuildValidationPrompt(request, storyType, authorStyle, partialBlueprint) {
    return `Validation prompt for ${storyType.name}`;
}

// Phase prompt dispatcher (mimicking the actual implementation)
function buildPhasePrompt(phase, request, storyType, authorStyle, partialBlueprint = {}) {
    switch (phase) {
        case 1:
            return mockBuildFoundationPrompt(request, storyType, authorStyle);
        case 2:
            return mockBuildCharactersPrompt(request, storyType, authorStyle, partialBlueprint);
        case 3:
            return mockBuildScenesPrompt(request, storyType, authorStyle, partialBlueprint);
        case 4:
            return mockBuildResolutionsPrompt(request, storyType, authorStyle, partialBlueprint);
        case 5:
            return mockBuildValidationPrompt(request, storyType, authorStyle, partialBlueprint);
        default:
            throw new Error(`Invalid phase: ${phase}`);
    }
}

// Test data
const testStoryType = {
    name: "Fantasy Adventure",
    description: "A classic tale of heroes and magic",
    story_type_id: "fantasy"
};

const testAuthorStyle = {
    name: "J.R.R. Tolkien",
    author_style_id: "tolkien"
};

const testRequest = {
    genre_interpretation: {
        metaphor_level: "literal"
    },
    total_messages_target: 100
};

// Test suite for phased generation
const testSuite = {
    name: "Phased Generation Unit Tests",

    tests: [
        {
            name: "PHASE_CONFIG should have 5 phases",
            test: () => {
                const phases = Object.keys(PHASE_CONFIG);
                if (phases.length !== 5) {
                    throw new Error(`Expected 5 phases, got ${phases.length}`);
                }
                if (!phases.includes('1') || !phases.includes('5')) {
                    throw new Error('Phases should include 1-5');
                }
                return true;
            }
        },
        {
            name: "Phase 1 should have correct configuration",
            test: () => {
                const phase1 = PHASE_CONFIG[1];
                if (phase1.name !== 'Foundation') {
                    throw new Error('Phase 1 name should be Foundation');
                }
                if (phase1.progress !== 20) {
                    throw new Error('Phase 1 progress should be 20');
                }
                if (!phase1.fields.includes('core_premise')) {
                    throw new Error('Phase 1 should include core_premise');
                }
                return true;
            }
        },
        {
            name: "Phase 5 should have correct configuration",
            test: () => {
                const phase5 = PHASE_CONFIG[5];
                if (phase5.name !== 'Validation') {
                    throw new Error('Phase 5 name should be Validation');
                }
                if (phase5.progress !== 100) {
                    throw new Error('Phase 5 progress should be 100');
                }
                if (!phase5.fields.includes('validation_results')) {
                    throw new Error('Phase 5 should include validation_results');
                }
                return true;
            }
        },
        {
            name: "buildPhasePrompt should handle valid phases 1-5",
            test: () => {
                for (let phase = 1; phase <= 5; phase++) {
                    const prompt = buildPhasePrompt(phase, testRequest, testStoryType, testAuthorStyle);
                    if (typeof prompt !== 'string' || prompt.length === 0) {
                        throw new Error(`Phase ${phase} should return a non-empty string`);
                    }
                }
                return true;
            }
        },
        {
            name: "buildPhasePrompt should throw error for invalid phase",
            test: () => {
                try {
                    buildPhasePrompt(6, testRequest, testStoryType, testAuthorStyle);
                    throw new Error('Should have thrown error for invalid phase');
                } catch (error) {
                    if (!error.message.includes('Invalid phase')) {
                        throw new Error(`Expected 'Invalid phase' error, got: ${error.message}`);
                    }
                }
                return true;
            }
        },
        {
            name: "buildPhasePrompt should work with partialBlueprint",
            test: () => {
                const partialBlueprint = {
                    core_premise: "Test premise",
                    setting: { location: "Test location" }
                };
                const prompt = buildPhasePrompt(2, testRequest, testStoryType, testAuthorStyle, partialBlueprint);
                if (typeof prompt !== 'string' || prompt.length === 0) {
                    throw new Error('Phase 2 should work with partialBlueprint');
                }
                return true;
            }
        },
        {
            name: "buildPhasePrompt should work without authorStyle",
            test: () => {
                const prompt = buildPhasePrompt(1, testRequest, testStoryType, null);
                if (typeof prompt !== 'string' || prompt.length === 0) {
                    throw new Error('Phase 1 should work without authorStyle');
                }
                return true;
            }
        },
        {
            name: "Phase progress should be increasing",
            test: () => {
                const progresses = Object.values(PHASE_CONFIG).map(p => p.progress);
                for (let i = 1; i < progresses.length; i++) {
                    if (progresses[i] <= progresses[i - 1]) {
                        throw new Error(`Progress should be increasing: ${progresses[i - 1]} -> ${progresses[i]}`);
                    }
                }
                return true;
            }
        },
        {
            name: "Phase fields should be unique per phase",
            test: () => {
                const allFields = new Set();
                for (const phase of Object.values(PHASE_CONFIG)) {
                    for (const field of phase.fields) {
                        if (allFields.has(field)) {
                            throw new Error(`Field ${field} appears in multiple phases`);
                        }
                        allFields.add(field);
                    }
                }
                return true;
            }
        },
        {
            name: "Phase descriptions should be descriptive",
            test: () => {
                for (const phase of Object.values(PHASE_CONFIG)) {
                    if (phase.description.length < 10) {
                        throw new Error(`Phase description should be descriptive: ${phase.description}`);
                    }
                    if (!phase.description.includes('...')) {
                        throw new Error(`Phase description should end with ellipsis: ${phase.description}`);
                    }
                }
                return true;
            }
        },
        {
            name: "Phase 2 should have 8192 maxTokens for reasoning models",
            test: () => {
                const phase2 = PHASE_CONFIG[2];
                if (!phase2.maxTokens) {
                    throw new Error('Phase 2 should have maxTokens configured');
                }
                if (phase2.maxTokens !== 8192) {
                    throw new Error(`Phase 2 maxTokens should be 8192 for reasoning model support, got ${phase2.maxTokens}`);
                }
                return true;
            }
        },
        {
            name: "All phases should have maxTokens configured",
            test: () => {
                for (const [phaseNum, config] of Object.entries(PHASE_CONFIG)) {
                    if (!config.maxTokens || typeof config.maxTokens !== 'number') {
                        throw new Error(`Phase ${phaseNum} should have maxTokens as a number`);
                    }
                    if (config.maxTokens < 1024) {
                        throw new Error(`Phase ${phaseNum} maxTokens (${config.maxTokens}) seems too low`);
                    }
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
testSuite.run();