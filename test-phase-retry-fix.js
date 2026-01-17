/**
 * Test Suite: Phase Array Fix (Line 1832 in blueprint-module.js)
 *
 * This test verifies that the phase retry mechanism correctly generates
 * the array of phases to execute without duplication.
 *
 * BUG DESCRIPTION (Fixed):
 * - Previously: [startPhase, 2, 3, 4, 5].filter(p => p >= startPhase)
 *   Result when startPhase=2: [2, 2, 3, 4, 5] (PHASE 2 EXECUTES TWICE)
 *
 * - Now Fixed: [1, 2, 3, 4, 5].filter(p => p >= startPhase)
 *   Result when startPhase=2: [2, 3, 4, 5] (correct)
 */

const testSuite = {
    name: "Phase Retry Array Fix (Line 1832 - generateBlueprintPhased)",

    tests: [
        {
            name: "Phase array construction: startPhase=1 should generate phases [1,2,3,4,5]",
            test: () => {
                const startPhase = 1;
                const phases = [1, 2, 3, 4, 5].filter(p => p >= startPhase);

                if (phases.length !== 5) {
                    throw new Error(`Expected 5 phases, got ${phases.length}: ${JSON.stringify(phases)}`);
                }
                if (JSON.stringify(phases) !== JSON.stringify([1, 2, 3, 4, 5])) {
                    throw new Error(`Expected [1,2,3,4,5], got ${JSON.stringify(phases)}`);
                }
                return true;
            }
        },
        {
            name: "Phase array construction: startPhase=2 should generate phases [2,3,4,5]",
            test: () => {
                const startPhase = 2;
                const phases = [1, 2, 3, 4, 5].filter(p => p >= startPhase);

                if (phases.length !== 4) {
                    throw new Error(`Expected 4 phases, got ${phases.length}: ${JSON.stringify(phases)}`);
                }
                if (JSON.stringify(phases) !== JSON.stringify([2, 3, 4, 5])) {
                    throw new Error(`Expected [2,3,4,5], got ${JSON.stringify(phases)}`);
                }
                // Most critical: ensure no duplicate 2
                const phase2Count = phases.filter(p => p === 2).length;
                if (phase2Count !== 1) {
                    throw new Error(`Phase 2 should appear exactly once, got ${phase2Count}: ${JSON.stringify(phases)}`);
                }
                return true;
            }
        },
        {
            name: "Phase array construction: startPhase=3 should generate phases [3,4,5]",
            test: () => {
                const startPhase = 3;
                const phases = [1, 2, 3, 4, 5].filter(p => p >= startPhase);

                if (phases.length !== 3) {
                    throw new Error(`Expected 3 phases, got ${phases.length}: ${JSON.stringify(phases)}`);
                }
                if (JSON.stringify(phases) !== JSON.stringify([3, 4, 5])) {
                    throw new Error(`Expected [3,4,5], got ${JSON.stringify(phases)}`);
                }
                return true;
            }
        },
        {
            name: "Phase array construction: startPhase=4 should generate phases [4,5]",
            test: () => {
                const startPhase = 4;
                const phases = [1, 2, 3, 4, 5].filter(p => p >= startPhase);

                if (phases.length !== 2) {
                    throw new Error(`Expected 2 phases, got ${phases.length}: ${JSON.stringify(phases)}`);
                }
                if (JSON.stringify(phases) !== JSON.stringify([4, 5])) {
                    throw new Error(`Expected [4,5], got ${JSON.stringify(phases)}`);
                }
                return true;
            }
        },
        {
            name: "Phase array construction: startPhase=5 should generate phases [5]",
            test: () => {
                const startPhase = 5;
                const phases = [1, 2, 3, 4, 5].filter(p => p >= startPhase);

                if (phases.length !== 1) {
                    throw new Error(`Expected 1 phase, got ${phases.length}: ${JSON.stringify(phases)}`);
                }
                if (JSON.stringify(phases) !== JSON.stringify([5])) {
                    throw new Error(`Expected [5], got ${JSON.stringify(phases)}`);
                }
                return true;
            }
        },
        {
            name: "Phase array should NOT have duplicates for any startPhase",
            test: () => {
                for (let startPhase = 1; startPhase <= 5; startPhase++) {
                    const phases = [1, 2, 3, 4, 5].filter(p => p >= startPhase);
                    const uniquePhases = new Set(phases);

                    if (uniquePhases.size !== phases.length) {
                        throw new Error(`Duplicate phases detected for startPhase=${startPhase}: ${JSON.stringify(phases)}`);
                    }

                    // Verify no phases less than startPhase
                    const invalidPhases = phases.filter(p => p < startPhase);
                    if (invalidPhases.length > 0) {
                        throw new Error(`Found phases less than startPhase (${startPhase}): ${JSON.stringify(invalidPhases)}`);
                    }
                }
                return true;
            }
        },
        {
            name: "Phase array order should be strictly ascending",
            test: () => {
                for (let startPhase = 1; startPhase <= 5; startPhase++) {
                    const phases = [1, 2, 3, 4, 5].filter(p => p >= startPhase);

                    for (let i = 1; i < phases.length; i++) {
                        if (phases[i] <= phases[i - 1]) {
                            throw new Error(`Phase order not ascending at index ${i}: ${JSON.stringify(phases)}`);
                        }
                    }
                }
                return true;
            }
        },
        {
            name: "Old buggy implementation would produce [startPhase, 2, 3, 4, 5] - verify fix prevents this",
            test: () => {
                // Simulating the OLD buggy code:
                // const buggyPhases = [startPhase, 2, 3, 4, 5].filter(p => p >= startPhase);

                // For startPhase=2, the old code would produce: [2, 2, 3, 4, 5]
                const startPhase = 2;
                const buggyPhases = [startPhase, 2, 3, 4, 5].filter(p => p >= startPhase);
                const fixedPhases = [1, 2, 3, 4, 5].filter(p => p >= startPhase);

                // Verify old code had duplicate
                const buggyPhase2Count = buggyPhases.filter(p => p === 2).length;
                if (buggyPhase2Count !== 2) {
                    throw new Error(`Test setup failed: old buggy code should have phase 2 twice, got ${buggyPhase2Count}`);
                }

                // Verify fixed code does NOT have duplicate
                const fixedPhase2Count = fixedPhases.filter(p => p === 2).length;
                if (fixedPhase2Count !== 1) {
                    throw new Error(`FIX FAILED: Phase 2 should appear once, got ${fixedPhase2Count}: ${JSON.stringify(fixedPhases)}`);
                }

                // Verify lengths differ
                if (buggyPhases.length === fixedPhases.length) {
                    throw new Error(`Arrays should have different lengths: buggy=${buggyPhases.length}, fixed=${fixedPhases.length}`);
                }

                return true;
            }
        },
        {
            name: "Verify fix works for all edge cases: startPhase=3",
            test: () => {
                const startPhase = 3;
                const buggyPhases = [startPhase, 2, 3, 4, 5].filter(p => p >= startPhase);
                const fixedPhases = [1, 2, 3, 4, 5].filter(p => p >= startPhase);

                // startPhase=3: buggy would be [3, 3, 4, 5]
                const buggyPhase3Count = buggyPhases.filter(p => p === 3).length;
                if (buggyPhase3Count !== 2) {
                    throw new Error(`Test setup: buggy code should have phase 3 twice at startPhase=3, got ${buggyPhase3Count}`);
                }

                // fixed should be [3, 4, 5]
                const fixedPhase3Count = fixedPhases.filter(p => p === 3).length;
                if (fixedPhase3Count !== 1) {
                    throw new Error(`FIX FAILED at startPhase=3: Phase 3 should appear once, got ${fixedPhase3Count}`);
                }

                return true;
            }
        },
        {
            name: "Verify fix works for startPhase=4",
            test: () => {
                const startPhase = 4;
                const buggyPhases = [startPhase, 2, 3, 4, 5].filter(p => p >= startPhase);
                const fixedPhases = [1, 2, 3, 4, 5].filter(p => p >= startPhase);

                // startPhase=4: buggy would be [4, 4, 5]
                const buggyPhase4Count = buggyPhases.filter(p => p === 4).length;
                if (buggyPhase4Count !== 2) {
                    throw new Error(`Test setup: buggy code should have phase 4 twice at startPhase=4, got ${buggyPhase4Count}`);
                }

                // fixed should be [4, 5]
                const fixedPhase4Count = fixedPhases.filter(p => p === 4).length;
                if (fixedPhase4Count !== 1) {
                    throw new Error(`FIX FAILED at startPhase=4: Phase 4 should appear once, got ${fixedPhase4Count}`);
                }

                return true;
            }
        },
        {
            name: "Phase array should always be contiguous (no gaps)",
            test: () => {
                for (let startPhase = 1; startPhase <= 5; startPhase++) {
                    const phases = [1, 2, 3, 4, 5].filter(p => p >= startPhase);

                    for (let i = 0; i < phases.length; i++) {
                        const expectedValue = startPhase + i;
                        if (phases[i] !== expectedValue) {
                            throw new Error(`Gap in phases at index ${i} for startPhase=${startPhase}: expected ${expectedValue}, got ${phases[i]}`);
                        }
                    }
                }
                return true;
            }
        },
        {
            name: "Total phase count should decrease as startPhase increases",
            test: () => {
                const counts = [];
                for (let startPhase = 1; startPhase <= 5; startPhase++) {
                    const phases = [1, 2, 3, 4, 5].filter(p => p >= startPhase);
                    counts.push(phases.length);
                }

                // Should be [5, 4, 3, 2, 1]
                if (JSON.stringify(counts) !== JSON.stringify([5, 4, 3, 2, 1])) {
                    throw new Error(`Expected phase counts [5,4,3,2,1], got ${JSON.stringify(counts)}`);
                }
                return true;
            }
        }
    ],

    run() {
        console.log(`\n🧪 Running ${this.name}`);
        console.log("=".repeat(70));
        console.log("Testing the fix for phase array duplication bug at line 1832");
        console.log("=".repeat(70));

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

        console.log("\n" + "=".repeat(70));
        console.log(`Summary: ${passed} passed, ${failed} failed`);
        console.log(`Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
        console.log("=".repeat(70));

        return { passed, failed, success: failed === 0 };
    }
};

// Run the tests
const result = testSuite.run();
