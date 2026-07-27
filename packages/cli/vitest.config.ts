import { defineConfig } from 'vitest/config';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
    define: {
        __CLI_VERSION__: JSON.stringify(pkg.version),
    },
    test: {
        environment: 'node',
        globals: true,
        include: ['tests/**/*.test.ts'],
        // run tests in main thread to allow process.chdir()
        pool: 'forks',
        maxWorkers: 1,
    },
});
