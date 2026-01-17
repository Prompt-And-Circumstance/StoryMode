#!/usr/bin/env node

// Test Import/Export Structure for Refactored Modules
// This checks if all imports are correctly mapped

import fs from 'fs';
import path from 'path';

console.log('\n🔍 Testing Import/Export Structure for Refactored Modules');
console.log('='.repeat(60));

// Test cases for each refactored module
const testCases = [
    {
        name: 'PNG Chunk Handler',
        module: 'lib/png-chunk-handler.js',
        imports: ['PNG_SIGNATURE', 'ChunkType'],
        functionImports: ['writeUInt32BE', 'readUInt32BE', 'calculateCRC32']
    },
    {
        name: 'Prompt Templates',
        module: 'lib/prompt-templates.js',
        imports: ['SummaryStyle', 'MetaphorLevel'],
        functionImports: ['loadTemplate', 'substituteVariables']
    },
    {
        name: 'UI Component System',
        module: 'lib/ui-component-system.js',
        imports: ['ComponentTemplates'],
        functionImports: ['renderComponent', 'escapeHtml']
    },
    {
        name: 'Blueprint Storage',
        module: 'lib/blueprint-storage.js',
        imports: ['generateUUID', 'escapeHtml', 'truncateText', 'sanitizeFilename', 'fileToDataURL', 'loadImage', 'downloadBlob', 'toBytes', 'safeParseJSON'],
        functionImports: ['generateCoverPrompt', 'encodeBlueprintAsPNG', 'decodeBlueprintFromPNG'],
        additionalImports: ['PNG_SIGNATURE', 'ChunkType', 'writeUInt32BE', 'readUInt32BE', 'calculateCRC32', 'compressData', 'decompressData', 'encodeChunk', 'decodeChunk']
    },
    {
        name: 'Blueprint Module',
        module: 'lib/blueprint-module.js',
        imports: ['MODULE_NAME', 'normalizeBlueprint', 'generateBlueprint'],
        functionImports: ['generateBlueprintId', 'isValidBlueprintId', 'generateBlueprint', 'getCurrentScene'],
        shouldImport: ['./prompt-templates.js']
    },
    {
        name: 'UI Components',
        module: 'lib/ui-components.js',
        imports: ['renderMainPanel', 'renderBlueprintPreview'],
        functionImports: ['buildSettingsTabContent', 'buildBlueprintTabContent'],
        shouldImport: ['./ui-component-system.js']
    }
];

// Check if template files exist
const templateFiles = [
    'prompts/blueprint-generation/metaphor-instructions.txt',
    'prompts/scene-management/opening-message.txt',
    'prompts/scene-management/scene-summary.txt',
    'prompts/scene-management/summary-requirements.txt'
];

console.log('\n📁 Checking Template Files:');
templateFiles.forEach(file => {
    if (fs.existsSync(file)) {
        console.log(`✅ ${file} exists`);
    } else {
        console.log(`❌ ${file} missing`);
    }
});

// Test each module
testCases.forEach(testCase => {
    console.log(`\n📦 Testing ${testCase.name}:`);

    try {
        const content = fs.readFileSync(testCase.module, 'utf8');

        // Check if file exists and is readable
        console.log(`✅ ${testCase.module} is readable`);

        // Check for required imports
        if (testCase.imports) {
            testCase.imports.forEach(imp => {
                const regex = new RegExp(`export const ${imp} =`);
                const found = regex.test(content);
                if (found) {
                    console.log(`  ✅ Export found: ${imp}`);
                } else {
                    console.log(`  ❌ Export missing: ${imp}`);
                }
            });
        }

        // Check for function exports
        if (testCase.functionImports) {
            testCase.functionImports.forEach(func => {
                const regex = new RegExp(`export function ${func}\\s*\\(`);
                const found = regex.test(content);
                if (found) {
                    console.log(`  ✅ Function export found: ${func}`);
                } else {
                    console.log(`  ❌ Function export missing: ${func}`);
                }
            });
        }

        // Check for specific imports
        if (testCase.shouldImport) {
            testCase.shouldImport.forEach(imp => {
                const regex = new RegExp(`import.*from ['"]${imp}['"]`);
                const found = regex.test(content);
                if (found) {
                    console.log(`  ✅ Import found: ${imp}`);
                } else {
                    console.log(`  ❌ Import missing: ${imp}`);
                }
            });
        }

        // Check for additional imports
        if (testCase.additionalImports) {
            testCase.additionalImports.forEach(imp => {
                const regex = new RegExp(`${imp}\\s*,`);
                const found = regex.test(content);
                if (found) {
                    console.log(`  ✅ Additional import used: ${imp}`);
                }
            });
        }

    } catch (error) {
        console.log(`❌ Error reading ${testCase.module}: ${error.message}`);
    }
});

// Check for circular import warnings
console.log('\n🔄 Checking for potential circular imports:');
const jsFiles = fs.readdirSync('lib').filter(f => f.endsWith('.js'));
const imports = {};

jsFiles.forEach(file => {
    const content = fs.readFileSync(path.join('lib', file), 'utf8');
    const importMatches = content.match(/import\s+.*?\s+from\s+['"]\..*?['"]/g);
    if (importMatches) {
        imports[file] = importMatches;
    }
});

// Check if any imports might create circular dependencies
const potentialCircular = [];
jsFiles.forEach(file1 => {
    if (imports[file1]) {
        imports[file1].forEach(imp => {
            const importedFile = imp.match(/from\s+['"]\.(.*?)['"]/)?.[1];
            if (importedFile && importedFile.endsWith('.js') && importedFile !== file1) {
                const content = fs.readFileSync(path.join('lib', importedFile), 'utf8');
                if (content.includes(`from ['"]\..*?${file1.replace('.js', '')}['"]`)) {
                    potentialCircular.push([file1, importedFile]);
                }
            }
        });
    }
});

if (potentialCircular.length > 0) {
    potentialCircular.forEach(([file1, file2]) => {
        console.log(`⚠️  Potential circular import: ${file1} ↔ ${file2}`);
    });
} else {
    console.log('✅ No circular imports detected');
}

console.log('\n' + '='.repeat(60));
console.log('🎯 Import/Export Structure Test Complete');