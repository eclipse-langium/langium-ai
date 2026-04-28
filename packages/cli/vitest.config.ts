import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        globals: true,
        include: ['tests/**/*.test.ts'],
        // run tests in main thread to allow process.chdir()
        pool: 'forks',
        maxWorkers: 1,
    },
});
