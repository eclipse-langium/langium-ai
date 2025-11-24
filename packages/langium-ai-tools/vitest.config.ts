import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        globals: true,
        include: ['tests/**/*.test.ts'],
        typecheck: {
            tsconfig: 'tsconfig.tests.json'
        }
    },
    esbuild: {
        target: 'node20'
    }
});
