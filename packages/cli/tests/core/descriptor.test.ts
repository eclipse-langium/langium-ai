import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'path';
import os from 'os';
import YAML from 'yaml';
import { generateDescriptor, saveDescriptor } from '../../src/core/descriptor.js';
import type { LaiConfig, LangiumProjectStructure } from '../../src/types.js';

describe('Descriptor Generation', () => {
    let tempDir: string;
    let originalCwd: string;

    beforeEach(async () => {
        originalCwd = process.cwd();
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lai-descriptor-test-'));
    });

    afterEach(async () => {
        process.chdir(originalCwd);
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    const createMockConfig = (): LaiConfig => ({
        version: '1.0',
        langium: {
            configPath: './langium-config.json',
            grammarPath: './src/grammar.langium',
        },
        descriptor: {
            path: './language.descriptor.yml',
        },
        sysprompt: {
            path: './language.sysprompt.md',
        },
        evaluations: {
            directory: './evals',
        },
        project: {
            name: 'test-dsl',
        },
    });

    const createMockStructure = (): LangiumProjectStructure => ({
        root: tempDir,
        packageJson: path.join(tempDir, 'package.json'),
        langiumConfig: path.join(tempDir, 'langium-config.json'),
        grammar: path.join(tempDir, 'grammar.langium'),
        services: {},
        tests: [],
    });

    describe('generateDescriptor', () => {
        beforeEach(() => {
            // change to temp directory for relative path operations
            process.chdir(tempDir);
        });

        it('should generate basic descriptor', async () => {
            const config = createMockConfig();
            const structure = createMockStructure();

            const descriptor = await generateDescriptor(config, structure);

            expect(descriptor.name).toBe('test-dsl');
            expect(descriptor.version).toBe('0.0.0');
            expect(descriptor.case_sensitive).toBe(true);
            // check path ends with expected file (handles macOS temp dir paths)
            expect(descriptor.grammar).toMatch(/grammar\.langium$/);
        });

        it('should include custom services when present', async () => {
            const config = createMockConfig();
            const structure: LangiumProjectStructure = {
                ...createMockStructure(),
                services: {
                    validator: path.join(tempDir, 'validator.ts'),
                    scope_provider: path.join(tempDir, 'scope-provider.ts'),
                },
            };

            const descriptor = await generateDescriptor(config, structure);

            // check paths end with expected files (handles macOS temp dir paths)
            expect(descriptor.services?.validator).toMatch(/validator\.ts$/);
            expect(descriptor.services?.scope_provider).toMatch(/scope-provider\.ts$/);
        });

        it('should generate description based on features', async () => {
            const config = createMockConfig();
            const structure: LangiumProjectStructure = {
                ...createMockStructure(),
                services: {
                    validator: path.join(tempDir, 'validator.ts'),
                    type_provider: path.join(tempDir, 'type-provider.ts'),
                },
            };

            const descriptor = await generateDescriptor(config, structure);

            expect(descriptor.description).toContain('Langium');
            expect(descriptor.description).toContain('custom validation');
            expect(descriptor.description).toContain('type system');
        });

        it('should include examples when directory exists', async () => {
            const config = createMockConfig();
            const examplesDir = path.join(tempDir, 'examples');
            await fs.mkdir(examplesDir, { recursive: true });
            await fs.writeFile(path.join(examplesDir, 'example1.dsl'), 'content1');
            await fs.writeFile(path.join(examplesDir, 'example2.dsl'), 'content2');

            const structure: LangiumProjectStructure = {
                ...createMockStructure(),
                examples: examplesDir,
            };

            const descriptor = await generateDescriptor(config, structure);

            expect(descriptor.examples).toBeDefined();
            expect(descriptor.examples?.length).toBeGreaterThan(0);
            expect(descriptor.examples?.length).toBeLessThanOrEqual(3); // max 3 examples
            // check that example paths end with expected files
            expect(descriptor.examples?.[0].file).toMatch(/examples\/example\d\.dsl$/);
        });

        it('should include documentation when README exists', async () => {
            const config = createMockConfig();
            await fs.writeFile(path.join(tempDir, 'README.md'), '# Test DSL');

            const structure = createMockStructure();
            const descriptor = await generateDescriptor(config, structure);

            expect(descriptor.documentation).toBeDefined();
            expect(descriptor.documentation?.length).toBeGreaterThan(0);
            // check path ends with README.md (handles macOS temp dir paths)
            expect(descriptor.documentation?.[0].src).toMatch(/README\.md$/);
            expect(descriptor.documentation?.[0].priority).toBe('high');
        });

        it('should include tests path when tests directory exists', async () => {
            const config = createMockConfig();
            const testsDir = path.join(tempDir, 'tests');
            await fs.mkdir(testsDir, { recursive: true });

            const structure: LangiumProjectStructure = {
                ...createMockStructure(),
                tests: [testsDir],
            };

            const descriptor = await generateDescriptor(config, structure);

            expect(descriptor.tests).toBeDefined();
            expect(descriptor.tests).toHaveLength(1);
            expect(descriptor.tests![0]).toMatch(/tests$/);
        });
    });

    describe('saveDescriptor', () => {
        beforeEach(() => {
            process.chdir(tempDir);
        });

        it('should save descriptor as YAML', async () => {
            const descriptor = {
                name: 'test-dsl',
                version: '0.0.0',
                description: 'A test DSL',
                langium_config: './langium-config.json',
                case_sensitive: true,
                grammar: './grammar.langium',
                prompts: [
                    {
                        name: 'default',
                        description: 'Default prompt',
                        sections: [],
                    },
                ],
                services: {},
            };

            const descriptorPath = './test.descriptor.yml';
            await saveDescriptor(descriptorPath, descriptor);

            const saved = await fs.readFile(path.join(tempDir, descriptorPath), 'utf-8');
            const parsed = YAML.parse(saved);

            expect(parsed.name).toBe('test-dsl');
            expect(parsed.version).toBe('0.0.0');
        });

        it('should not wrap lines in YAML output', async () => {
            const descriptor = {
                name: 'test-dsl',
                version: '0.0.0',
                description:
                    'A very long description that would normally wrap in YAML but should not wrap because we disabled line wrapping in the YAML stringifier',
                langium_config: './langium-config.json',
                case_sensitive: true,
                grammar: './grammar.langium',
                prompts: [],
                services: {},
            };

            const descriptorPath = './test.descriptor.yml';
            await saveDescriptor(descriptorPath, descriptor);

            const content = await fs.readFile(path.join(tempDir, descriptorPath), 'utf-8');
            const lines = content.split('\n');

            // find the description line
            const descLine = lines.find((l) => l.startsWith('description:'));
            expect(descLine).toBeDefined();
            // should be on a single line
            expect(descLine).toContain('very long description');
        });
    });
});
