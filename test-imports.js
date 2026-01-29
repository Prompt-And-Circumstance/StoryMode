// Test script to validate imports without SillyTavern globals
import fs from 'fs';
import path from 'path';

console.log('=== Testing Scenario Characters Feature ===\n');

// 1. Test that all files exist
console.log('1. Checking file existence:');
const files = [
    'lib/ui/components/scenario-characters.js',
    'lib/ui/component-system.js',
    'lib/blueprint/storage.js',
    'lib/blueprint/characters/linker.js',
    'lib/blueprint/utils.js',
    'lib/css/scenario-characters.css'
];

files.forEach(file => {
    if (fs.existsSync(file)) {
        console.log(`✅ ${file}`);
    } else {
        console.log(`❌ ${file} - MISSING`);
    }
});

// 2. Test imports in scenario-characters.js
console.log('\n2. Checking imports in scenario-characters.js:');
const content = fs.readFileSync('lib/ui/components/scenario-characters.js', 'utf8');
const imports = [
    'callGenericPopup',
    'POPUP_TYPE',
    'POPUP_RESULT',
    'escapeHtml',
    'getBlueprintState',
    'findCharacterByName',
    'importCharacterCard',
    'normalizeCharacterName'
];

imports.forEach(imp => {
    if (content.includes(imp)) {
        console.log(`✅ Found ${imp}`);
    } else {
        console.log(`❌ Missing ${imp}`);
    }
});

// 3. Test exports from scenario-characters.js
console.log('\n3. Checking exports from scenario-characters.js:');
const expectedExports = [
    'export function getBlueprintCharactersWithStatus',
    'export async function addEmbeddedCharacterToLibrary',
    'export function getCharacterSummaryCounts',
    'export function showScenarioCharactersPopup'
];

expectedExports.forEach(exp => {
    if (content.includes(exp)) {
        console.log(`✅ ${exp}`);
    } else {
        console.log(`❌ ${exp} - NOT FOUND`);
    }
});

// 4. Test imports in controller-panel.js
console.log('\n4. Checking imports in controller-panel.js:');
const controllerContent = fs.readFileSync('lib/ui/controller-panel.js', 'utf8');
if (controllerContent.includes('getCharacterSummaryCounts') && controllerContent.includes('showScenarioCharactersPopup')) {
    console.log('✅ Both character functions imported in controller-panel.js');
} else {
    console.log('❌ Character functions NOT properly imported in controller-panel.js');
}

// 5. Test event handlers in controller-panel.js
console.log('\n5. Checking event handlers in controller-panel.js:');
const eventHandlers = [
    'content.on(\'click\', \'#storymode-debug-characters-link\', () => showScenarioCharactersPopup())',
    'panel.on(\'click\', \'#storymode-debug-characters-link\', () => showScenarioCharactersPopup())'
];

let eventHandlerFound = false;
eventHandlers.forEach(handler => {
    if (controllerContent.includes(handler)) {
        console.log(`✅ Found event handler for #storymode-debug-characters-link`);
        eventHandlerFound = true;
    }
});
if (!eventHandlerFound) {
    console.log('❌ Event handlers NOT FOUND');
}

// 6. Check characterInfo section in renderPanelContent
console.log('\n6. Checking characterInfo section in renderPanelContent:');
if (controllerContent.includes('getCharacterSummaryCounts(blueprintState.blueprint)')) {
    console.log('✅ Character summary counts integration found');
} else {
    console.log('❌ Character summary counts integration NOT FOUND');
}

// 7. Test CSS import in style.css
console.log('\n7. Checking CSS import in style.css:');
const styleContent = fs.readFileSync('style.css', 'utf8');
if (styleContent.includes('@import url(\'./lib/css/scenario-characters.css\');')) {
    console.log('✅ CSS import found');
} else {
    console.log('❌ CSS import NOT FOUND');
}

// 8. Check re-exports in components index.js
console.log('\n8. Checking re-exports in components index.js:');
const indexContent = fs.readFileSync('lib/ui/components/index.js', 'utf8');
if (indexContent.includes('from \'./scenario-characters.js\'')) {
    console.log('✅ Re-exports found in index.js');
} else {
    console.log('❌ Re-exports NOT FOUND in index.js');
}

console.log('\n=== Test Complete ===');