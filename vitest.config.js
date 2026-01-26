import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Run tests in Node environment (not browser)
        environment: 'node',

        // Test file patterns
        include: ['tests/**/*.test.js'],

        // Coverage configuration
        coverage: {
            provider: 'v8',
            include: ['lib/**/*.js'],
            exclude: [
                'lib/**/index.js',  // Entry points with browser dependencies
                'lib/ui/**',        // UI components need browser
                'lib/dialog/**',    // Dialog handlers need browser
                'lib/editor/blueprint-editor/**', // Editor UI
            ],
        },

        // Timeout for async tests
        testTimeout: 5000,
    },
});
