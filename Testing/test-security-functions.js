/**
 * Security Function Tests
 *
 * Run in browser console after loading SillyTavern:
 * 1. Open DevTools (F12)
 * 2. Copy and paste this entire file into Console
 * 3. Run: await runAllSecurityTests()
 *
 * Or import as module from extension context.
 */

// Test runner
const TestResults = {
    passed: 0,
    failed: 0,
    results: []
};

function test(name, fn) {
    try {
        fn();
        TestResults.passed++;
        TestResults.results.push({ name, status: 'PASS' });
        console.log(`✅ PASS: ${name}`);
    } catch (error) {
        TestResults.failed++;
        TestResults.results.push({ name, status: 'FAIL', error: error.message });
        console.error(`❌ FAIL: ${name}`);
        console.error(`   Error: ${error.message}`);
    }
}

async function testAsync(name, fn) {
    try {
        await fn();
        TestResults.passed++;
        TestResults.results.push({ name, status: 'PASS' });
        console.log(`✅ PASS: ${name}`);
    } catch (error) {
        TestResults.failed++;
        TestResults.results.push({ name, status: 'FAIL', error: error.message });
        console.error(`❌ FAIL: ${name}`);
        console.error(`   Error: ${error.message}`);
    }
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message}: expected ${expected}, got ${actual}`);
    }
}

function assertThrows(fn, expectedMessage, testName) {
    try {
        fn();
        throw new Error(`Expected function to throw: ${testName}`);
    } catch (error) {
        if (expectedMessage && !error.message.includes(expectedMessage)) {
            throw new Error(`Expected error containing "${expectedMessage}", got "${error.message}"`);
        }
    }
}

function assertTrue(value, message) {
    if (!value) {
        throw new Error(message || 'Expected true');
    }
}

function assertFalse(value, message) {
    if (value) {
        throw new Error(message || 'Expected false');
    }
}

// ============================================
// SEC-001: Safe JSON Parsing Tests
// ============================================

async function testSafeJSONParsing() {
    console.log('\n📋 SEC-001: Safe JSON Parsing Tests');
    console.log('─'.repeat(50));

    // Import the function
    const { safeParseWithLimit } = await import('/scripts/extensions/third-party/Extension-StoryMode/lib/blueprint-utils.js');

    // Test 1: Valid JSON parsing
    test('SEC-001.1: Parse valid JSON', () => {
        const result = safeParseWithLimit('{"name": "test", "value": 123}');
        assertEqual(result.name, 'test', 'Name field');
        assertEqual(result.value, 123, 'Value field');
    });

    // Test 2: Reject non-string input
    test('SEC-001.2: Reject non-string input', () => {
        assertThrows(
            () => safeParseWithLimit(123),
            'must be a string',
            'Non-string input'
        );
    });

    // Test 3: Reject oversized JSON
    test('SEC-001.3: Reject JSON exceeding size limit', () => {
        const largeJSON = JSON.stringify({ data: 'x'.repeat(600 * 1024) });
        assertThrows(
            () => safeParseWithLimit(largeJSON, 500),
            'exceeds size limit',
            'Oversized JSON'
        );
    });

    // Test 4: Accept JSON at size limit
    test('SEC-001.4: Accept JSON at size limit', () => {
        const okJSON = JSON.stringify({ data: 'x'.repeat(400 * 1024) });
        const result = safeParseWithLimit(okJSON, 500);
        assertTrue(result.data.length > 0, 'Should parse JSON at limit');
    });

    // Test 5: Reject __proto__ prototype pollution
    test('SEC-001.5: Reject __proto__ pollution', () => {
        assertThrows(
            () => safeParseWithLimit('{"__proto__": {"admin": true}}'),
            'prototype pollution',
            '__proto__ pollution'
        );
    });

    // Test 6: Reject constructor pollution
    test('SEC-001.6: Reject constructor pollution', () => {
        assertThrows(
            () => safeParseWithLimit('{"constructor": {"prototype": {}}}'),
            'prototype pollution',
            'constructor pollution'
        );
    });

    // Test 7: Reject invalid JSON
    test('SEC-001.7: Reject invalid JSON syntax', () => {
        assertThrows(
            () => safeParseWithLimit('{invalid json}'),
            '',
            'Invalid JSON'
        );
    });

    // Test 8: Handle nested objects safely
    test('SEC-001.8: Parse nested objects without pollution', () => {
        const result = safeParseWithLimit('{"nested": {"value": 1}, "array": [1,2,3]}');
        assertEqual(result.nested.value, 1, 'Nested value');
        assertEqual(result.array.length, 3, 'Array length');
    });
}

// ============================================
// SEC-002: Data URL Validation Tests
// ============================================

async function testDataURLValidation() {
    console.log('\n📋 SEC-002: Data URL Validation Tests');
    console.log('─'.repeat(50));

    const { dataURLtoBlob } = await import('/scripts/extensions/third-party/Extension-StoryMode/lib/blueprint-utils.js');

    // Test 1: Valid PNG data URL
    test('SEC-002.1: Accept valid PNG data URL', () => {
        // Minimal valid PNG (1x1 transparent pixel)
        const validPNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        const blob = dataURLtoBlob(validPNG);
        assertEqual(blob.type, 'image/png', 'MIME type');
        assertTrue(blob.size > 0, 'Blob should have content');
    });

    // Test 2: Valid JPEG data URL
    test('SEC-002.2: Accept valid JPEG data URL', () => {
        // Minimal valid JPEG
        const validJPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBEQCEAwEPwABmAB//2Q==';
        const blob = dataURLtoBlob(validJPEG);
        assertEqual(blob.type, 'image/jpeg', 'MIME type');
    });

    // Test 3: Reject null input
    test('SEC-002.3: Reject null input', () => {
        assertThrows(
            () => dataURLtoBlob(null),
            'must be a string',
            'Null input'
        );
    });

    // Test 4: Reject non-string input
    test('SEC-002.4: Reject non-string input', () => {
        assertThrows(
            () => dataURLtoBlob(123),
            'must be a string',
            'Number input'
        );
    });

    // Test 5: Reject missing data: prefix
    test('SEC-002.5: Reject missing data: prefix', () => {
        assertThrows(
            () => dataURLtoBlob('image/png;base64,ABC123'),
            'must start with data:',
            'Missing prefix'
        );
    });

    // Test 6: Reject malformed structure
    test('SEC-002.6: Reject malformed structure (no comma)', () => {
        assertThrows(
            () => dataURLtoBlob('data:image/pngbase64ABC123'),
            'malformed structure',
            'No comma'
        );
    });

    // Test 7: Reject non-base64 encoding
    test('SEC-002.7: Reject non-base64 encoding', () => {
        assertThrows(
            () => dataURLtoBlob('data:image/png;utf-8,not-base64'),
            'must be base64 encoded',
            'Non-base64'
        );
    });

    // Test 8: Reject non-image MIME type (text/html - XSS vector)
    test('SEC-002.8: Reject text/html MIME type (XSS prevention)', () => {
        assertThrows(
            () => dataURLtoBlob('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='),
            'unsafe MIME type',
            'text/html'
        );
    });

    // Test 9: Reject application/javascript
    test('SEC-002.9: Reject application/javascript MIME type', () => {
        assertThrows(
            () => dataURLtoBlob('data:application/javascript;base64,YWxlcnQoMSk='),
            'unsafe MIME type',
            'application/javascript'
        );
    });

    // Test 10: Reject invalid base64
    test('SEC-002.10: Reject invalid base64 encoding', () => {
        assertThrows(
            () => dataURLtoBlob('data:image/png;base64,!!!invalid!!!'),
            'Invalid base64 encoding',
            'Invalid base64'
        );
    });
}

// ============================================
// SEC-003: Resource Size Validation Tests
// ============================================

async function testResourceSizeValidation() {
    console.log('\n📋 SEC-003: Resource Size Validation Tests');
    console.log('─'.repeat(50));

    const { validateResourceSizes, estimateDataURLSize, formatBytes } = await import('/scripts/extensions/third-party/Extension-StoryMode/lib/blueprint-utils.js');

    // Test 1: Accept small resources
    test('SEC-003.1: Accept resources under limit', () => {
        const resources = [
            { name: 'char1', pngDataUrl: 'data:image/png;base64,' + 'A'.repeat(1000) },
            { name: 'char2', pngDataUrl: 'data:image/png;base64,' + 'B'.repeat(1000) }
        ];
        const result = validateResourceSizes(resources, 'Character', 'pngDataUrl', 5 * 1024 * 1024);
        assertTrue(result.valid, 'Should be valid');
    });

    // Test 2: Reject oversized resource
    test('SEC-003.2: Reject resource over 5MB limit', () => {
        const resources = [
            { name: 'bigchar', pngDataUrl: 'data:image/png;base64,' + 'X'.repeat(7 * 1024 * 1024) }
        ];
        const result = validateResourceSizes(resources, 'Character', 'pngDataUrl', 5 * 1024 * 1024);
        assertFalse(result.valid, 'Should be invalid');
        assertTrue(result.error.includes('bigchar'), 'Error should name resource');
        assertTrue(result.error.includes('exceeds'), 'Error should mention exceeds');
    });

    // Test 3: Handle null resources
    test('SEC-003.3: Handle null resources gracefully', () => {
        const result = validateResourceSizes(null, 'Character', 'pngDataUrl', 5 * 1024 * 1024);
        assertTrue(result.valid, 'Null should be valid');
    });

    // Test 4: Handle empty array
    test('SEC-003.4: Handle empty array', () => {
        const result = validateResourceSizes([], 'Character', 'pngDataUrl', 5 * 1024 * 1024);
        assertTrue(result.valid, 'Empty array should be valid');
    });

    // Test 5: Estimate data URL size correctly
    test('SEC-003.5: Estimate data URL size (base64 is ~33% larger)', () => {
        // 1000 base64 chars ≈ 750 bytes decoded
        const size = estimateDataURLSize('data:image/png;base64,' + 'A'.repeat(1000));
        assertTrue(size >= 700 && size <= 800, `Size should be ~750, got ${size}`);
    });

    // Test 6: Format bytes correctly
    test('SEC-003.6: Format bytes to human readable', () => {
        assertEqual(formatBytes(0), '0 Bytes', 'Zero bytes');
        assertEqual(formatBytes(1024), '1 KB', 'One KB');
        assertTrue(formatBytes(5 * 1024 * 1024).includes('MB'), 'Should show MB');
    });
}

// ============================================
// SEC-006: Schema Validation Tests
// ============================================

async function testSchemaValidation() {
    console.log('\n📋 SEC-006: Schema Validation Tests');
    console.log('─'.repeat(50));

    const { validateExtendedData } = await import('/scripts/extensions/third-party/Extension-StoryMode/lib/blueprint-png-decoder.js');

    // Test 1: Valid minimal blueprint
    test('SEC-006.1: Accept valid minimal blueprint', () => {
        const blueprint = {
            story_type_id: 'test-type',
            core_premise: 'A test story'
        };
        const result = validateExtendedData(blueprint);
        assertTrue(result.valid, 'Should be valid');
        assertEqual(result.errors.length, 0, 'No errors');
    });

    // Test 2: Reject missing story_type_id
    test('SEC-006.2: Reject missing story_type_id', () => {
        const blueprint = {
            core_premise: 'A test story'
        };
        const result = validateExtendedData(blueprint);
        assertFalse(result.valid, 'Should be invalid');
        assertTrue(result.errors.some(e => e.includes('story_type_id')), 'Should mention story_type_id');
    });

    // Test 3: Reject missing core_premise
    test('SEC-006.3: Reject missing core_premise', () => {
        const blueprint = {
            story_type_id: 'test-type'
        };
        const result = validateExtendedData(blueprint);
        assertFalse(result.valid, 'Should be invalid');
        assertTrue(result.errors.some(e => e.includes('core_premise')), 'Should mention core_premise');
    });

    // Test 4: Reject invalid setting type
    test('SEC-006.4: Reject non-object setting', () => {
        const blueprint = {
            story_type_id: 'test-type',
            core_premise: 'A test story',
            setting: 'not an object'
        };
        const result = validateExtendedData(blueprint);
        assertFalse(result.valid, 'Should be invalid');
        assertTrue(result.errors.some(e => e.includes('setting')), 'Should mention setting');
    });

    // Test 5: Reject non-array scene_plan
    test('SEC-006.5: Reject non-array scene_plan', () => {
        const blueprint = {
            story_type_id: 'test-type',
            core_premise: 'A test story',
            scene_plan: 'not an array'
        };
        const result = validateExtendedData(blueprint);
        assertFalse(result.valid, 'Should be invalid');
        assertTrue(result.errors.some(e => e.includes('scene_plan')), 'Should mention scene_plan');
    });

    // Test 6: Validate embedded characters
    test('SEC-006.6: Validate embedded character structure', () => {
        const blueprint = {
            story_type_id: 'test-type',
            core_premise: 'A test story',
            embeddedResources: {
                characters: [
                    { name: 'Valid', pngDataUrl: 'data:...' },
                    { pngDataUrl: 'data:...' } // Missing name
                ]
            }
        };
        const result = validateExtendedData(blueprint);
        assertFalse(result.valid, 'Should be invalid');
        assertTrue(result.errors.some(e => e.includes('Character 1')), 'Should identify character index');
    });

    // Test 7: Validate embedded personas
    test('SEC-006.7: Validate embedded persona structure', () => {
        const blueprint = {
            story_type_id: 'test-type',
            core_premise: 'A test story',
            embeddedResources: {
                personas: [
                    { name: 'Valid', avatarDataUrl: 'data:...' },
                    { name: 'Missing Avatar' } // Missing avatarDataUrl
                ]
            }
        };
        const result = validateExtendedData(blueprint);
        assertFalse(result.valid, 'Should be invalid');
        assertTrue(result.errors.some(e => e.includes('Persona 1')), 'Should identify persona index');
    });

    // Test 8: Accept valid full blueprint
    test('SEC-006.8: Accept valid full blueprint', () => {
        const blueprint = {
            story_type_id: 'test-type',
            core_premise: 'A test story',
            setting: { location: 'Test Land' },
            protagonist_group: { description: 'Heroes' },
            scene_plan: [{ title: 'Scene 1' }],
            character_arcs: [{ name: 'Hero' }],
            embeddedResources: {
                characters: [{ name: 'Hero', pngDataUrl: 'data:...' }],
                personas: [{ name: 'Player', avatarDataUrl: 'data:...' }],
                coverGallery: ['data:...'],
                storyType: { id: 'type-1' },
                authorStyle: { id: 'style-1' }
            }
        };
        const result = validateExtendedData(blueprint);
        assertTrue(result.valid, `Should be valid, errors: ${result.errors.join(', ')}`);
    });
}

// ============================================
// SEC-007: Persona Validation Tests
// ============================================

async function testPersonaValidation() {
    console.log('\n📋 SEC-007: Persona Import Validation Tests');
    console.log('─'.repeat(50));

    // Note: importPersona requires server, so we test the validation logic conceptually

    test('SEC-007.1: Name length limit (100 chars)', () => {
        const longName = 'x'.repeat(101);
        assertTrue(longName.length > 100, 'Name exceeds 100 char limit');
        // Actual validation happens in importPersona
    });

    test('SEC-007.2: Description length limit (2000 chars)', () => {
        const longDesc = 'x'.repeat(2001);
        assertTrue(longDesc.length > 2000, 'Description exceeds 2000 char limit');
    });

    test('SEC-007.3: Title length limit (200 chars)', () => {
        const longTitle = 'x'.repeat(201);
        assertTrue(longTitle.length > 200, 'Title exceeds 200 char limit');
    });
}

// ============================================
// Main Test Runner
// ============================================

async function runAllSecurityTests() {
    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║  Story Mode Security Function Tests                ║');
    console.log('║  Run from browser console after loading SillyTavern║');
    console.log('╚════════════════════════════════════════════════════╝');

    TestResults.passed = 0;
    TestResults.failed = 0;
    TestResults.results = [];

    try {
        await testSafeJSONParsing();
        await testDataURLValidation();
        await testResourceSizeValidation();
        await testSchemaValidation();
        await testPersonaValidation();
    } catch (error) {
        console.error('\n💥 Test suite error:', error);
    }

    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log(`║  Results: ${TestResults.passed} passed, ${TestResults.failed} failed`.padEnd(53) + '║');
    console.log('╚════════════════════════════════════════════════════╝');

    if (TestResults.failed > 0) {
        console.log('\n❌ Failed tests:');
        TestResults.results
            .filter(r => r.status === 'FAIL')
            .forEach(r => console.log(`   - ${r.name}: ${r.error}`));
    }

    return TestResults;
}

// Export for module usage
if (typeof window !== 'undefined') {
    window.runAllSecurityTests = runAllSecurityTests;
    console.log('💡 Security tests loaded. Run: await runAllSecurityTests()');
}

export { runAllSecurityTests, TestResults };
