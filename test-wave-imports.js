#!/usr/bin/env node
/**
 * Wave Import Verification
 * Run after each extraction task to verify module structure
 *
 * Usage: node test-wave-imports.js
 */

import fs from 'fs';

const MODULES = {
    // Wave 1 modules
    'lib/core/constants.js': ['MODULE_NAME', 'METAPHOR_LEVELS', 'LENGTH_PRESETS', 'PHASE_CONFIG'],
    'lib/core/index.js': ['MODULE_NAME', 'METAPHOR_LEVELS', 'LENGTH_PRESETS', 'PHASE_CONFIG'],
    'lib/blueprint/placeholders.js': ['resolvePlaceholders', 'checkPrerequisites'],
    'lib/blueprint/index.js': ['resolvePlaceholders', 'checkPrerequisites'],
    'lib/scenario/beats.js': ['markBeatCompleted', 'markBeatSkipped', 'isBeatCompleted', 'getCompletedBeats', 'resetBeatProgress', 'resetBeatsForScene', 'setCurrentBeatFocus'],
    'lib/scenario/index.js': ['markBeatCompleted', 'markBeatSkipped'],

    // Wave 2 modules
    'lib/scenario/injection.js': ['buildScenarioModeInjection', 'deriveExitTrigger', 'buildSignalsBlock'],
    'lib/blueprint/validation.js': ['validateBlueprint'],
    'lib/blueprint/normalization.js': ['normalizeBlueprint', 'normalizeCharacterOutcomes', 'initNormalization'],

    // Wave 2.4 modules (generation)
    'lib/generation/prompts.js': ['initPromptBuilders', 'buildBlueprintRequest', 'buildMasterPrompt', 'buildPhasePrompt', 'getExpectedSceneCount'],
    'lib/generation/index.js': ['initPromptBuilders', 'buildBlueprintRequest', 'buildMasterPrompt', 'buildPhasePrompt', 'getExpectedSceneCount'],

    // Original module (should still have re-exports)
    'lib/blueprint-module.js': ['MODULE_NAME', 'validateBlueprint', 'normalizeBlueprint', 'resolvePlaceholders', 'buildBlueprintRequest', 'buildMasterPrompt', 'buildPhasePrompt', 'getExpectedSceneCount'],
};

console.log('🔍 Wave Import Verification');
console.log('='.repeat(50));
console.log('');

let passed = 0;
let failed = 0;
let skipped = 0;

for (const [modulePath, expectedExports] of Object.entries(MODULES)) {
    if (!fs.existsSync(modulePath)) {
        console.log(`⏭️  ${modulePath} — not yet created`);
        skipped++;
        continue;
    }

    const content = fs.readFileSync(modulePath, 'utf8');
    const missing = [];
    const found = [];

    for (const exportName of expectedExports) {
        // Check for various export patterns
        const exportPatterns = [
            new RegExp(`export\\s+function\\s+${exportName}\\s*\\(`),
            new RegExp(`export\\s+async\\s+function\\s+${exportName}\\s*\\(`),
            new RegExp(`export\\s+const\\s+${exportName}\\s*=`),
            new RegExp(`export\\s+\\{[^}]*\\b${exportName}\\b[^}]*\\}`),
            new RegExp(`export\\s+\\{\\s*${exportName}\\s*\\}`),
        ];

        const isFound = exportPatterns.some(pattern => pattern.test(content));

        if (isFound) {
            found.push(exportName);
        } else {
            missing.push(exportName);
        }
    }

    if (missing.length === 0) {
        console.log(`✅ ${modulePath}`);
        console.log(`   Exports: ${found.join(', ')}`);
        passed++;
    } else {
        console.log(`❌ ${modulePath}`);
        console.log(`   Found: ${found.length > 0 ? found.join(', ') : 'none'}`);
        console.log(`   Missing: ${missing.join(', ')}`);
        failed++;
    }
    console.log('');
}

console.log('='.repeat(50));
console.log(`📊 Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);

if (failed > 0) {
    console.log('\n⚠️  Some modules are missing expected exports.');
    console.log('   Check the extraction tasks were completed correctly.');
    process.exit(1);
} else if (passed > 0) {
    console.log('\n✨ All existing modules have correct exports!');
    process.exit(0);
} else {
    console.log('\n📋 No modules to verify yet. Create folders first.');
    process.exit(0);
}
