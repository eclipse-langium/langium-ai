import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { detectLangiumProject, getProjectName, getLanguageName, _testing } from '../../src/core/langium-detector.js';

const { buildImportMap, extractServiceOverrides, extractBalancedBraces, findModuleObjectStart } = _testing;

describe('Langium Project Detection', () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lai-detect-test-'));
    });

    afterEach(async () => {
        await fs.remove(tempDir);
    });

    describe('detectLangiumProject', () => {
        it('should detect basic langium project', async () => {
            // setup minimal project
            await fs.writeJSON(path.join(tempDir, 'package.json'), { name: 'test-dsl' });
            await fs.writeJSON(path.join(tempDir, 'langium-config.json'), {});
            await fs.writeFile(path.join(tempDir, 'grammar.langium'), 'grammar Test');

            const structure = await detectLangiumProject(tempDir);

            expect(structure.root).toBe(tempDir);
            expect(structure.packageJson).toBe(path.join(tempDir, 'package.json'));
            expect(structure.langiumConfig).toBe(path.join(tempDir, 'langium-config.json'));
            expect(structure.grammar).toBe(path.join(tempDir, 'grammar.langium'));
        });

        it('should detect custom services from module file', async () => {
            await fs.writeJSON(path.join(tempDir, 'package.json'), { name: 'test-dsl' });
            await fs.writeFile(path.join(tempDir, 'test.langium'), 'grammar Test');

            const srcDir = path.join(tempDir, 'src');
            await fs.ensureDir(srcDir);

            // create a module file with service overrides
            await fs.writeFile(
                path.join(srcDir, 'test-module.ts'),
                `import { TestScopeProvider } from './test-scope-provider.js';
import { TestValidator } from './validation/test-validator.js';

export const TestModule: Module<TestServices, PartialLangiumServices> = {
    references: {
        ScopeProvider: (services) => new TestScopeProvider(services)
    },
    validation: {
        DocumentValidator: () => new TestValidator()
    }
};`,
            );

            // create the referenced files so paths resolve
            await fs.writeFile(path.join(srcDir, 'test-scope-provider.ts'), 'export class TestScopeProvider {}');
            const validationDir = path.join(srcDir, 'validation');
            await fs.ensureDir(validationDir);
            await fs.writeFile(path.join(validationDir, 'test-validator.ts'), 'export class TestValidator {}');

            const structure = await detectLangiumProject(tempDir);

            expect(structure.services.module).toBe(path.join(srcDir, 'test-module.ts'));
            expect(structure.services.scope_provider).toBe(path.join(srcDir, 'test-scope-provider.ts'));
            expect(structure.services.validator).toBe(path.join(validationDir, 'test-validator.ts'));
        });

        it('should detect LSP service overrides from module file', async () => {
            await fs.writeJSON(path.join(tempDir, 'package.json'), { name: 'test-dsl' });
            await fs.writeFile(path.join(tempDir, 'test.langium'), 'grammar Test');

            const srcDir = path.join(tempDir, 'src');
            await fs.ensureDir(srcDir);

            await fs.writeFile(
                path.join(srcDir, 'test-module.ts'),
                `import { TestCodeActionProvider } from './lsp/test-code-actions.js';
import { TestFormatter } from './lsp/test-formatter.js';
import { TestHoverProvider } from './hover.js';

export const TestModule: Module<TestServices, PartialLangiumServices> = {
    lsp: {
        CodeActionProvider: () => new TestCodeActionProvider(),
        Formatter: () => new TestFormatter(),
        HoverProvider: (services) => new TestHoverProvider(services)
    }
};`,
            );

            const structure = await detectLangiumProject(tempDir);

            expect(structure.services.code_action_provider).toBe(path.join(srcDir, 'lsp', 'test-code-actions.ts'));
            expect(structure.services.formatter).toBe(path.join(srcDir, 'lsp', 'test-formatter.ts'));
            expect(structure.services.hover_provider).toBe(path.join(srcDir, 'hover.ts'));
        });

        it('should detect test and example directories', async () => {
            await fs.writeJSON(path.join(tempDir, 'package.json'), { name: 'test-dsl' });
            await fs.writeFile(path.join(tempDir, 'test.langium'), 'grammar Test');

            const testsDir = path.join(tempDir, 'tests');
            const examplesDir = path.join(tempDir, 'examples');
            await fs.ensureDir(testsDir);
            await fs.ensureDir(examplesDir);

            const structure = await detectLangiumProject(tempDir);

            expect(structure.tests).toEqual([testsDir]);
            expect(structure.examples).toBe(examplesDir);
        });

        it('should detect nested test directories', async () => {
            await fs.writeJSON(path.join(tempDir, 'package.json'), { name: 'test-dsl' });
            await fs.writeFile(path.join(tempDir, 'test.langium'), 'grammar Test');

            // create test dirs at different nesting levels
            const rootTests = path.join(tempDir, 'tests');
            const nestedTest = path.join(tempDir, 'packages', 'language', 'test');
            await fs.ensureDir(rootTests);
            await fs.ensureDir(nestedTest);

            const structure = await detectLangiumProject(tempDir);

            // shallowest first
            expect(structure.tests).toEqual([rootTests, nestedTest]);
        });

        it('should detect only nested test directories when none at root', async () => {
            await fs.writeJSON(path.join(tempDir, 'package.json'), { name: 'test-dsl' });
            await fs.writeFile(path.join(tempDir, 'test.langium'), 'grammar Test');

            const nestedTest = path.join(tempDir, 'packages', 'language', 'test');
            await fs.ensureDir(nestedTest);

            const structure = await detectLangiumProject(tempDir);

            expect(structure.tests).toEqual([nestedTest]);
        });

        it('should filter out node_modules from grammar detection', async () => {
            await fs.writeJSON(path.join(tempDir, 'package.json'), { name: 'test-dsl' });
            await fs.writeFile(path.join(tempDir, 'real.langium'), 'grammar Real');

            // create fake grammar in node_modules
            const nodeModulesDir = path.join(tempDir, 'node_modules', 'some-package');
            await fs.ensureDir(nodeModulesDir);
            await fs.writeFile(path.join(nodeModulesDir, 'fake.langium'), 'grammar Fake');

            const structure = await detectLangiumProject(tempDir);

            expect(structure.grammar).toBe(path.join(tempDir, 'real.langium'));
        });

        it('should throw error for monorepo with multiple grammars', async () => {
            await fs.writeJSON(path.join(tempDir, 'package.json'), { name: 'monorepo' });

            // create multiple grammar files
            const project1 = path.join(tempDir, 'project1');
            const project2 = path.join(tempDir, 'project2');
            await fs.ensureDir(project1);
            await fs.ensureDir(project2);
            await fs.writeFile(path.join(project1, 'grammar1.langium'), 'grammar One');
            await fs.writeFile(path.join(project2, 'grammar2.langium'), 'grammar Two');

            await expect(detectLangiumProject(tempDir)).rejects.toThrow('Multiple Langium projects detected');
        });

        it('should throw error for monorepo with multiple configs', async () => {
            await fs.writeJSON(path.join(tempDir, 'package.json'), { name: 'monorepo' });

            // create multiple config files
            const project1 = path.join(tempDir, 'project1');
            const project2 = path.join(tempDir, 'project2');
            await fs.ensureDir(project1);
            await fs.ensureDir(project2);
            await fs.writeJSON(path.join(project1, 'langium-config.json'), {});
            await fs.writeJSON(path.join(project2, 'langium-config.json'), {});

            await expect(detectLangiumProject(tempDir)).rejects.toThrow('Multiple Langium projects detected');
        });

        it('should detect custom AddedServices validators from module file', async () => {
            await fs.writeJSON(path.join(tempDir, 'package.json'), { name: 'test-dsl' });
            await fs.writeFile(path.join(tempDir, 'test.langium'), 'grammar Abc');

            const srcDir = path.join(tempDir, 'src');
            await fs.ensureDir(srcDir);

            // create a module file with a custom AddedServices validator (language-specific name)
            await fs.writeFile(
                path.join(srcDir, 'abc-module.ts'),
                `import { AbcValidator } from './validation/abc-validator.js';

export const AbcModule: Module<AbcServices, PartialLangiumServices & AbcAddedServices> = {
    validation: {
        AbcValidator: (services) => new AbcValidator(services)
    }
};`,
            );

            // create the referenced validator file
            const validationDir = path.join(srcDir, 'validation');
            await fs.ensureDir(validationDir);
            await fs.writeFile(path.join(validationDir, 'abc-validator.ts'), 'export class AbcValidator {}');

            const structure = await detectLangiumProject(tempDir);

            expect(structure.services.module).toBe(path.join(srcDir, 'abc-module.ts'));
            expect(structure.services.validator).toBe(path.join(validationDir, 'abc-validator.ts'));
        });

        it('should handle missing module file gracefully', async () => {
            await fs.writeJSON(path.join(tempDir, 'package.json'), { name: 'test-dsl' });
            await fs.writeFile(path.join(tempDir, 'test.langium'), 'grammar Test');

            const structure = await detectLangiumProject(tempDir);

            // should not detect any services without a module file
            expect(structure.services.module).toBeUndefined();
            expect(structure.services.validator).toBeUndefined();
            expect(structure.services.scope_provider).toBeUndefined();
        });

        it('should filter out generated/ module files', async () => {
            await fs.writeJSON(path.join(tempDir, 'package.json'), { name: 'test-dsl' });
            await fs.writeFile(path.join(tempDir, 'test.langium'), 'grammar Test');

            // create a generated module file (should be ignored)
            const generatedDir = path.join(tempDir, 'src', 'generated');
            await fs.ensureDir(generatedDir);
            await fs.writeFile(path.join(generatedDir, 'test-module.ts'), 'export const generated = {}');

            const structure = await detectLangiumProject(tempDir);

            expect(structure.services.module).toBeUndefined();
        });
    });

    describe('buildImportMap', () => {
        it('should parse simple imports', () => {
            const content = `import { Foo } from './foo.js';
import { Bar } from './services/bar.js';`;
            const map = buildImportMap(content, '/project/src');

            expect(map.get('Foo')).toBe('/project/src/foo.ts');
            expect(map.get('Bar')).toBe('/project/src/services/bar.ts');
        });

        it('should handle aliased imports', () => {
            const content = `import { OriginalName as AliasedName } from './original.js';`;
            const map = buildImportMap(content, '/project/src');

            expect(map.get('AliasedName')).toBe('/project/src/original.ts');
            expect(map.has('OriginalName')).toBe(false);
        });

        it('should handle multiple imports from same file', () => {
            const content = `import { Foo, Bar, Baz } from './services.js';`;
            const map = buildImportMap(content, '/project/src');

            expect(map.get('Foo')).toBe('/project/src/services.ts');
            expect(map.get('Bar')).toBe('/project/src/services.ts');
            expect(map.get('Baz')).toBe('/project/src/services.ts');
        });

        it('should skip non-relative imports', () => {
            const content = `import { Module } from 'langium';
import { LangiumServices } from 'langium/lsp';
import { MyThing } from './local.js';`;
            const map = buildImportMap(content, '/project/src');

            expect(map.has('Module')).toBe(false);
            expect(map.has('LangiumServices')).toBe(false);
            expect(map.get('MyThing')).toBe('/project/src/local.ts');
        });

        it('should include type-only imports in map (harmless, filtered by usage)', () => {
            const content = `import type { SomeType } from './types.js';
import { RealImport } from './real.js';`;
            const map = buildImportMap(content, '/project/src');

            // type-only imports are included in the map but won't match any `new ClassName()`
            // in the module object since types can't be instantiated
            expect(map.get('SomeType')).toBe('/project/src/types.ts');
            expect(map.get('RealImport')).toBe('/project/src/real.ts');
        });

        it('should handle .ts import paths', () => {
            const content = `import { Foo } from './foo.ts';`;
            const map = buildImportMap(content, '/project/src');

            expect(map.get('Foo')).toBe('/project/src/foo.ts');
        });

        it('should handle import paths without extensions', () => {
            const content = `import { Foo } from './foo';`;
            const map = buildImportMap(content, '/project/src');

            expect(map.get('Foo')).toBe('/project/src/foo.ts');
        });
    });

    describe('extractServiceOverrides', () => {
        it('should extract service overrides from a standard module', () => {
            const content = `export const TestModule: Module<TestServices, PartialLangiumServices> = {
    references: {
        ScopeProvider: (services) => new TestScopeProvider(services)
    },
    validation: {
        DocumentValidator: () => new TestValidator()
    }
};`;
            const overrides = extractServiceOverrides(content);

            expect(overrides).toEqual([
                { category: 'references', serviceName: 'ScopeProvider', className: 'TestScopeProvider' },
                { category: 'validation', serviceName: 'DocumentValidator', className: 'TestValidator' },
            ]);
        });

        it('should extract LSP service overrides', () => {
            const content = `export const TestModule: Module<TestServices, PartialLangiumServices> = {
    lsp: {
        CodeActionProvider: () => new TestCodeActionProvider(),
        Formatter: (services) => new TestFormatter(services),
        HoverProvider: (services) => new TestHoverProvider(services)
    }
};`;
            const overrides = extractServiceOverrides(content);

            expect(overrides).toEqual([
                { category: 'lsp', serviceName: 'CodeActionProvider', className: 'TestCodeActionProvider' },
                { category: 'lsp', serviceName: 'Formatter', className: 'TestFormatter' },
                { category: 'lsp', serviceName: 'HoverProvider', className: 'TestHoverProvider' },
            ]);
        });

        it('should handle multiple categories', () => {
            const content = `export const ArithmeticsModule: Module<ArithmeticsServices, PartialLangiumServices & ArithmeticsAddedServices> = {
    references: {
        ScopeProvider: (services) => new ArithmeticsScopeProvider(services)
    },
    validation: {
        ArithmeticsValidator: () => new ArithmeticsValidator()
    },
    lsp: {
        CodeActionProvider: () => new ArithmeticsCodeActionProvider()
    }
};`;
            const overrides = extractServiceOverrides(content);

            expect(overrides).toHaveLength(3);
            expect(overrides[0]).toEqual({
                category: 'references',
                serviceName: 'ScopeProvider',
                className: 'ArithmeticsScopeProvider',
            });
            expect(overrides[1]).toEqual({
                category: 'validation',
                serviceName: 'ArithmeticsValidator',
                className: 'ArithmeticsValidator',
            });
            expect(overrides[2]).toEqual({
                category: 'lsp',
                serviceName: 'CodeActionProvider',
                className: 'ArithmeticsCodeActionProvider',
            });
        });

        it('should return empty array when no module export found', () => {
            const content = `const notAModule = { foo: 'bar' };`;
            const overrides = extractServiceOverrides(content);
            expect(overrides).toEqual([]);
        });

        it('should handle module with no service overrides', () => {
            const content = `export const TestModule: Module<TestServices, PartialLangiumServices> = {
};`;
            const overrides = extractServiceOverrides(content);
            expect(overrides).toEqual([]);
        });
    });

    describe('extractBalancedBraces', () => {
        it('should extract content between balanced braces', () => {
            const content = '{ foo: "bar" }';
            expect(extractBalancedBraces(content, 0)).toBe(' foo: "bar" ');
        });

        it('should handle nested braces', () => {
            const content = '{ outer: { inner: 1 } }';
            expect(extractBalancedBraces(content, 0)).toBe(' outer: { inner: 1 } ');
        });

        it('should return null for non-brace start', () => {
            expect(extractBalancedBraces('foo', 0)).toBeNull();
        });

        it('should return null for unbalanced braces', () => {
            expect(extractBalancedBraces('{ foo', 0)).toBeNull();
        });
    });

    describe('findModuleObjectStart', () => {
        it('should find module with type annotation', () => {
            const content = 'export const TestModule: Module<TestServices, PartialLangiumServices> = {';
            expect(findModuleObjectStart(content)).toBe(content.length - 1);
        });

        it('should find module without type annotation', () => {
            const content = 'export const TestModule = {';
            expect(findModuleObjectStart(content)).toBe(content.length - 1);
        });

        it('should return -1 when no module found', () => {
            const content = 'const notExported = {};';
            expect(findModuleObjectStart(content)).toBe(-1);
        });
    });

    describe('getProjectName', () => {
        it('should extract name from package.json', async () => {
            // create actual package.json file for this test
            await fs.writeJSON(path.join(tempDir, 'package.json'), {
                name: 'my-awesome-dsl',
            });

            const structure = {
                root: tempDir,
                packageJson: path.join(tempDir, 'package.json'),
                grammar: path.join(tempDir, 'my-dsl.langium'),
                services: {},
                tests: [],
            };

            const name = getProjectName(structure);
            expect(name).toBe('my-awesome-dsl');
        });

        it('should fallback to grammar filename', () => {
            const structure = {
                root: tempDir,
                grammar: path.join(tempDir, 'my-dsl.langium'),
                services: {},
                tests: [],
            };

            const name = getProjectName(structure);
            expect(name).toBe('my-dsl');
        });

        it('should return default name as last resort', () => {
            const structure = {
                root: tempDir,
                services: {},
                tests: [],
            };

            const name = getProjectName(structure);
            expect(name).toBe('my-dsl');
        });

        it('should handle package.json errors gracefully', () => {
            const structure = {
                root: tempDir,
                packageJson: path.join(tempDir, 'nonexistent.json'),
                grammar: path.join(tempDir, 'fallback.langium'),
                services: {},
                tests: [],
            };

            const name = getProjectName(structure);
            expect(name).toBe('fallback');
        });
    });

    describe('getLanguageName', () => {
        it('should extract PascalCase name from kebab-case grammar file', () => {
            const structure = {
                root: tempDir,
                grammar: path.join(tempDir, 'domain-model.langium'),
                services: {},
                tests: [],
            };

            const name = getLanguageName(structure);
            expect(name).toBe('DomainModel');
        });

        it('should extract PascalCase name from snake_case grammar file', () => {
            const structure = {
                root: tempDir,
                grammar: path.join(tempDir, 'hello_world.langium'),
                services: {},
                tests: [],
            };

            const name = getLanguageName(structure);
            expect(name).toBe('HelloWorld');
        });

        it('should handle single word grammar file', () => {
            const structure = {
                root: tempDir,
                grammar: path.join(tempDir, 'statemachine.langium'),
                services: {},
                tests: [],
            };

            const name = getLanguageName(structure);
            expect(name).toBe('Statemachine');
        });

        it('should extract name from module file when no grammar', () => {
            const structure = {
                root: tempDir,
                services: {
                    module: path.join(tempDir, 'src', 'hello-world-module.ts'),
                },
                tests: [],
            };

            const name = getLanguageName(structure);
            expect(name).toBe('HelloWorld');
        });

        it('should prefer grammar file over module file', () => {
            const structure = {
                root: tempDir,
                grammar: path.join(tempDir, 'domain-model.langium'),
                services: {
                    module: path.join(tempDir, 'src', 'hello-world-module.ts'),
                },
                tests: [],
            };

            const name = getLanguageName(structure);
            expect(name).toBe('DomainModel');
        });

        it('should handle multi-word with hyphens', () => {
            const structure = {
                root: tempDir,
                grammar: path.join(tempDir, 'my-awesome-language.langium'),
                services: {},
                tests: [],
            };

            const name = getLanguageName(structure);
            expect(name).toBe('MyAwesomeLanguage');
        });

        it('should fallback to project name and convert to PascalCase', async () => {
            await fs.writeJSON(path.join(tempDir, 'package.json'), {
                name: 'test-dsl-project',
            });

            const structure = {
                root: tempDir,
                packageJson: path.join(tempDir, 'package.json'),
                services: {},
                tests: [],
            };

            const name = getLanguageName(structure);
            expect(name).toBe('TestDslProject');
        });
    });
});
