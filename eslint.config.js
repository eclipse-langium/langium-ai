import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    eslint.configs.recommended,
    {
        // global ignores
        ignores: [
            '**/dist/**',
            '**/node_modules/**',
            '**/src/gen/**',
            '**/*.js',
            '**/*.mjs',
            '**/*.cjs',
        ],
    },
    {
        // type-checked linting for source files
        files: ['**/src/**/*.ts'],
        extends: [...tseslint.configs.recommendedTypeChecked],
        languageOptions: {
            parserOptions: {
                project: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
    {
        // basic linting for test files and config files (no type-checking)
        files: ['**/tests/**/*.ts', '**/vitest.config.ts'],
        extends: [...tseslint.configs.recommended],
    },
    {
        // custom rules for all TypeScript files
        files: ['**/*.ts'],
        rules: {
            'curly': ['error', 'all'],
            'prefer-const': 'error',
            'no-var': 'error',
            'eqeqeq': ['error', 'always'],
            // typescript-specific rules
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': ['error', {
                'argsIgnorePattern': '^_',
                'varsIgnorePattern': '^_',
            }],
            // allow empty interfaces for extensibility
            '@typescript-eslint/no-empty-interface': 'off',
        },
    },
    {
        // additional rules for source files with type information
        files: ['**/src/**/*.ts'],
        rules: {
            // allow any for specific cases
            '@typescript-eslint/no-unsafe-assignment': 'warn',
            '@typescript-eslint/no-unsafe-member-access': 'warn',
            '@typescript-eslint/no-unsafe-call': 'warn',
            '@typescript-eslint/no-unsafe-return': 'warn',
        },
    }
);
