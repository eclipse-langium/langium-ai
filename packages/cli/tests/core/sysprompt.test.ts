import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'path';
import os from 'os';
import { generateSystemPrompt } from '../../src/core/sysprompt.js';
import type { ProjectDescriptor } from '../../src/types.js';

describe('System Prompt Generation', () => {
    let tempDir: string;
    let originalCwd: string;

    beforeEach(async () => {
        originalCwd = process.cwd();
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lai-sysprompt-test-'));
        process.chdir(tempDir);
    });

    afterEach(async () => {
        process.chdir(originalCwd);
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    const baseDescriptor = (): ProjectDescriptor => ({
        version: 'dev',
        langiumConfig: './langium-config.json',
        serviceDetails: {},
        services: {},
        languages: [
            {
                name: 'requirements-lang',
                description: 'requirements-lang: A DSL',
                caseInsensitive: false,
                grammar: 'src/requirements.langium',
            },
            {
                name: 'tests-lang',
                description: 'tests-lang: A DSL',
                caseInsensitive: false,
                grammar: 'src/tests.langium',
            },
        ],
    });

    it('should render a Validation Rules section per validator for multi-language projects', async () => {
        await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
        await fs.writeFile(path.join(tempDir, 'src', 'requirements.langium'), 'grammar Requirements');
        await fs.writeFile(path.join(tempDir, 'src', 'tests.langium'), 'grammar Tests');
        await fs.writeFile(
            path.join(tempDir, 'src', 'requirements-lang-validator.ts'),
            'export class RequirementsLangValidator { checkRequirementNameContainsANumber() {} }',
        );
        await fs.writeFile(
            path.join(tempDir, 'src', 'tests-lang-validator.ts'),
            'export class TestsLangValidator { checkTestNameContainsANumber() {} }',
        );

        const descriptor = baseDescriptor();
        descriptor.services.validators = [
            { language: 'requirements-lang', path: 'src/requirements-lang-validator.ts' },
            { language: 'tests-lang', path: 'src/tests-lang-validator.ts' },
        ];

        const prompt = await generateSystemPrompt(descriptor, { inlineValidator: true });

        // both validators should be surfaced, each labeled with its language
        expect(prompt).toContain('Validation Rules');
        expect(prompt).toContain('requirements-lang');
        expect(prompt).toContain('RequirementsLangValidator');
        expect(prompt).toContain('tests-lang');
        expect(prompt).toContain('TestsLangValidator');
    });

    it('should still render a single Validation Rules section for single-validator projects', async () => {
        await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
        await fs.writeFile(path.join(tempDir, 'src', 'requirements.langium'), 'grammar Requirements');
        await fs.writeFile(path.join(tempDir, 'src', 'tests.langium'), 'grammar Tests');
        await fs.writeFile(
            path.join(tempDir, 'src', 'single-validator.ts'),
            'export class SingleValidator { checkSomething() {} }',
        );

        const descriptor = baseDescriptor();
        descriptor.services.validators = [{ path: 'src/single-validator.ts' }];

        const prompt = await generateSystemPrompt(descriptor, { inlineValidator: true });

        expect(prompt).toContain('Validation Rules');
        expect(prompt).toContain('SingleValidator');
    });
});
