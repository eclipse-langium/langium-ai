import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'path';
import os from 'os';
import { detectLangiumProject, getProjectName, getLanguageName, _testing } from '../../src/core/langium-detector.js';

const {
    buildImportMap,
    extractServiceOverrides,
    extractBalancedBraces,
    findModuleObjectStart,
    scanSourceFilesForOverrides,
    detectCustomServices,
} = _testing;

describe('Langium Project Detection', () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lai-detect-test-'));
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    describe('detectLangiumProject', () => {
        it('should detect basic langium project', async () => {
            // setup minimal project
            await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'test-dsl' }, null, 2));
            await fs.writeFile(path.join(tempDir, 'langium-config.json'), JSON.stringify({}, null, 2));
            await fs.writeFile(path.join(tempDir, 'grammar.langium'), 'grammar Test');

            const structure = await detectLangiumProject(tempDir);

            expect(structure.root).toBe(tempDir);
            expect(structure.packageJson).toBe(path.join(tempDir, 'package.json'));
            expect(structure.langiumConfig).toBe(path.join(tempDir, 'langium-config.json'));
            expect(structure.grammar).toBe(path.join(tempDir, 'grammar.langium'));
        });

        it('should detect services via class inheritance (extends DefaultScopeProvider)', async () => {
            await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'test-dsl' }, null, 2));
            await fs.writeFile(path.join(tempDir, 'test.langium'), 'grammar Test');

            const srcDir = path.join(tempDir, 'src');
            await fs.mkdir(srcDir, { recursive: true });

            // source file with class that extends a known Langium base class
            await fs.writeFile(
                path.join(srcDir, 'test-scope-provider.ts'),
                `import { DefaultScopeProvider } from 'langium';
export class TestScopeProvider extends DefaultScopeProvider {
    // custom scoping logic
}`,
            );

            const structure = await detectLangiumProject(tempDir);

            expect(structure.services.scope_provider).toBe(path.join(srcDir, 'test-scope-provider.ts'));
        });

        it('should detect services via class inheritance (extends AbstractFormatter)', async () => {
            await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'test-dsl' }, null, 2));
            await fs.writeFile(path.join(tempDir, 'test.langium'), 'grammar Test');

            const srcDir = path.join(tempDir, 'src');
            const lspDir = path.join(srcDir, 'lsp');
            await fs.mkdir(lspDir, { recursive: true });

            await fs.writeFile(
                path.join(lspDir, 'test-formatter.ts'),
                `import { AbstractFormatter } from 'langium/lsp';
export class TestFormatter extends AbstractFormatter {
    // custom formatting
}`,
            );

            const structure = await detectLangiumProject(tempDir);

            expect(structure.services.formatter).toBe(path.join(lspDir, 'test-formatter.ts'));
        });

        it('should detect services via interface implementation (implements CodeActionProvider)', async () => {
            await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'test-dsl' }, null, 2));
            await fs.writeFile(path.join(tempDir, 'test.langium'), 'grammar Test');

            const srcDir = path.join(tempDir, 'src');
            await fs.mkdir(srcDir, { recursive: true });

            // CodeActionProvider has no default class — detected via implements
            await fs.writeFile(
                path.join(srcDir, 'test-code-actions.ts'),
                `import { CodeActionProvider } from 'langium/lsp';
export class TestCodeActionProvider implements CodeActionProvider {
    // custom code actions
}`,
            );

            const structure = await detectLangiumProject(tempDir);

            expect(structure.services.code_action_provider).toBe(path.join(srcDir, 'test-code-actions.ts'));
        });

        it('should not detect interface implementation without langium import', async () => {
            await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'test-dsl' }, null, 2));
            await fs.writeFile(path.join(tempDir, 'test.langium'), 'grammar Test');

            const srcDir = path.join(tempDir, 'src');
            await fs.mkdir(srcDir, { recursive: true });

            // same interface name but not imported from langium — should not match
            await fs.writeFile(
                path.join(srcDir, 'unrelated.ts'),
                `import { CodeActionProvider } from './my-local-types.js';
export class MyProvider implements CodeActionProvider {}`,
            );

            const structure = await detectLangiumProject(tempDir);

            expect(structure.services.code_action_provider).toBeUndefined();
        });

        it('should detect multiple services from inheritance scan', async () => {
            await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'test-dsl' }, null, 2));
            await fs.writeFile(path.join(tempDir, 'test.langium'), 'grammar Test');

            const srcDir = path.join(tempDir, 'src');
            await fs.mkdir(srcDir, { recursive: true });

            await fs.writeFile(
                path.join(srcDir, 'scope-provider.ts'),
                `import { DefaultScopeProvider } from 'langium';
export class TestScopeProvider extends DefaultScopeProvider {}`,
            );
            await fs.writeFile(
                path.join(srcDir, 'hover-provider.ts'),
                `import { AstNodeHoverProvider } from 'langium/lsp';
export class TestHoverProvider extends AstNodeHoverProvider {}`,
            );
            await fs.writeFile(
                path.join(srcDir, 'validator.ts'),
                `import { DefaultDocumentValidator } from 'langium';
export class TestValidator extends DefaultDocumentValidator {}`,
            );

            const structure = await detectLangiumProject(tempDir);

            expect(structure.services.scope_provider).toBe(path.join(srcDir, 'scope-provider.ts'));
            expect(structure.services.hover_provider).toBe(path.join(srcDir, 'hover-provider.ts'));
            expect(structure.services.validator).toBe(path.join(srcDir, 'validator.ts'));
        });

        it('should prefer module-wired class when multiple extend the same base', async () => {
            await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'test-dsl' }, null, 2));
            await fs.writeFile(path.join(tempDir, 'test.langium'), 'grammar Test');

            const srcDir = path.join(tempDir, 'src');
            await fs.mkdir(srcDir, { recursive: true });

            // two classes extend DefaultScopeProvider
            await fs.writeFile(
                path.join(srcDir, 'base-scope.ts'),
                `import { DefaultScopeProvider } from 'langium';
export class BaseScopeProvider extends DefaultScopeProvider {}`,
            );
            await fs.writeFile(
                path.join(srcDir, 'real-scope.ts'),
                `import { DefaultScopeProvider } from 'langium';
export class RealScopeProvider extends DefaultScopeProvider {}`,
            );

            // module wires up RealScopeProvider
            await fs.writeFile(
                path.join(srcDir, 'test-module.ts'),
                `import { RealScopeProvider } from './real-scope.js';

export const TestModule: Module<TestServices, PartialLangiumServices> = {
    references: {
        ScopeProvider: (services) => new RealScopeProvider(services)
    }
};`,
            );

            const structure = await detectLangiumProject(tempDir);

            expect(structure.services.scope_provider).toBe(path.join(srcDir, 'real-scope.ts'));
        });

        it('should fall back to module-parse for services without inheritance (AddedServices)', async () => {
            await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'test-dsl' }, null, 2));
            await fs.writeFile(path.join(tempDir, 'test.langium'), 'grammar Abc');

            const srcDir = path.join(tempDir, 'src');
            await fs.mkdir(srcDir, { recursive: true });

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

            // validator doesn't extend any known base class
            const validationDir = path.join(srcDir, 'validation');
            await fs.mkdir(validationDir, { recursive: true });
            await fs.writeFile(path.join(validationDir, 'abc-validator.ts'), 'export class AbcValidator {}');

            const structure = await detectLangiumProject(tempDir);

            expect(structure.services.module).toBe(path.join(srcDir, 'abc-module.ts'));
            expect(structure.services.validator).toBe(path.join(validationDir, 'abc-validator.ts'));
        });

        it('should detect services from both inheritance and module fallback', async () => {
            await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'test-dsl' }, null, 2));
            await fs.writeFile(path.join(tempDir, 'test.langium'), 'grammar Test');

            const srcDir = path.join(tempDir, 'src');
            await fs.mkdir(srcDir, { recursive: true });

            // scope provider detected via inheritance
            await fs.writeFile(
                path.join(srcDir, 'test-scope-provider.ts'),
                `import { DefaultScopeProvider } from 'langium';
export class TestScopeProvider extends DefaultScopeProvider {}`,
            );

            // validator detected via module fallback (no extends, custom AddedServices name)
            const validationDir = path.join(srcDir, 'validation');
            await fs.mkdir(validationDir, { recursive: true });
            await fs.writeFile(path.join(validationDir, 'test-validator.ts'), 'export class TestValidator {}');

            await fs.writeFile(
                path.join(srcDir, 'test-module.ts'),
                `import { TestScopeProvider } from './test-scope-provider.js';
import { TestValidator } from './validation/test-validator.js';

export const TestModule: Module<TestServices, PartialLangiumServices> = {
    references: {
        ScopeProvider: (services) => new TestScopeProvider(services)
    },
    validation: {
        TestValidator: () => new TestValidator()
    }
};`,
            );

            const structure = await detectLangiumProject(tempDir);

            expect(structure.services.scope_provider).toBe(path.join(srcDir, 'test-scope-provider.ts'));
            expect(structure.services.validator).toBe(path.join(validationDir, 'test-validator.ts'));
        });

        it('should detect LSP service overrides from module file (fallback path)', async () => {
            await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'test-dsl' }, null, 2));
            await fs.writeFile(path.join(tempDir, 'test.langium'), 'grammar Test');

            const srcDir = path.join(tempDir, 'src');
            await fs.mkdir(srcDir, { recursive: true });

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

            // these files don't extend any known base — will be detected via module fallback
            const lspDir = path.join(srcDir, 'lsp');
            await fs.mkdir(lspDir, { recursive: true });
            await fs.writeFile(path.join(lspDir, 'test-code-actions.ts'), 'export class TestCodeActionProvider {}');
            await fs.writeFile(path.join(lspDir, 'test-formatter.ts'), 'export class TestFormatter {}');
            await fs.writeFile(path.join(srcDir, 'hover.ts'), 'export class TestHoverProvider {}');

            const structure = await detectLangiumProject(tempDir);

            expect(structure.services.code_action_provider).toBe(path.join(srcDir, 'lsp', 'test-code-actions.ts'));
            expect(structure.services.formatter).toBe(path.join(srcDir, 'lsp', 'test-formatter.ts'));
            expect(structure.services.hover_provider).toBe(path.join(srcDir, 'hover.ts'));
        });

        it('should detect test and example directories', async () => {
            await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'test-dsl' }, null, 2));
            await fs.writeFile(path.join(tempDir, 'test.langium'), 'grammar Test');

            const testsDir = path.join(tempDir, 'tests');
            const examplesDir = path.join(tempDir, 'examples');
            await fs.mkdir(testsDir, { recursive: true });
            await fs.mkdir(examplesDir, { recursive: true });

            const structure = await detectLangiumProject(tempDir);

            expect(structure.tests).toEqual([testsDir]);
            expect(structure.examples).toBe(examplesDir);
        });

        it('should detect nested test directories', async () => {
            await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'test-dsl' }, null, 2));
            await fs.writeFile(path.join(tempDir, 'test.langium'), 'grammar Test');

            // create test dirs at different nesting levels
            const rootTests = path.join(tempDir, 'tests');
            const nestedTest = path.join(tempDir, 'packages', 'language', 'test');
            await fs.mkdir(rootTests, { recursive: true });
            await fs.mkdir(nestedTest, { recursive: true });

            const structure = await detectLangiumProject(tempDir);

            // shallowest first
            expect(structure.tests).toEqual([rootTests, nestedTest]);
        });

        it('should detect only nested test directories when none at root', async () => {
            await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'test-dsl' }, null, 2));
            await fs.writeFile(path.join(tempDir, 'test.langium'), 'grammar Test');

            const nestedTest = path.join(tempDir, 'packages', 'language', 'test');
            await fs.mkdir(nestedTest, { recursive: true });

            const structure = await detectLangiumProject(tempDir);

            expect(structure.tests).toEqual([nestedTest]);
        });

        it('should filter out node_modules from grammar detection', async () => {
            await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'test-dsl' }, null, 2));
            await fs.writeFile(path.join(tempDir, 'real.langium'), 'grammar Real');

            // create fake grammar in node_modules
            const nodeModulesDir = path.join(tempDir, 'node_modules', 'some-package');
            await fs.mkdir(nodeModulesDir, { recursive: true });
            await fs.writeFile(path.join(nodeModulesDir, 'fake.langium'), 'grammar Fake');

            const structure = await detectLangiumProject(tempDir);

            expect(structure.grammar).toBe(path.join(tempDir, 'real.langium'));
        });

        it('should throw error for monorepo with multiple grammars', async () => {
            await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'monorepo' }, null, 2));

            // create multiple grammar files
            const project1 = path.join(tempDir, 'project1');
            const project2 = path.join(tempDir, 'project2');
            await fs.mkdir(project1, { recursive: true });
            await fs.mkdir(project2, { recursive: true });
            await fs.writeFile(path.join(project1, 'grammar1.langium'), 'grammar One');
            await fs.writeFile(path.join(project2, 'grammar2.langium'), 'grammar Two');

            await expect(detectLangiumProject(tempDir)).rejects.toThrow('Multiple Langium projects detected');
        });

        it('should throw error for monorepo with multiple configs', async () => {
            await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'monorepo' }, null, 2));

            // create multiple config files
            const project1 = path.join(tempDir, 'project1');
            const project2 = path.join(tempDir, 'project2');
            await fs.mkdir(project1, { recursive: true });
            await fs.mkdir(project2, { recursive: true });
            await fs.writeFile(path.join(project1, 'langium-config.json'), JSON.stringify({}, null, 2));
            await fs.writeFile(path.join(project2, 'langium-config.json'), JSON.stringify({}, null, 2));

            await expect(detectLangiumProject(tempDir)).rejects.toThrow('Multiple Langium projects detected');
        });

        it('should handle missing module file gracefully', async () => {
            await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'test-dsl' }, null, 2));
            await fs.writeFile(path.join(tempDir, 'test.langium'), 'grammar Test');

            const structure = await detectLangiumProject(tempDir);

            // should not detect any services without a module file
            expect(structure.services.module).toBeUndefined();
            expect(structure.services.validator).toBeUndefined();
            expect(structure.services.scope_provider).toBeUndefined();
        });

        it('should filter out generated/ module files', async () => {
            await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'test-dsl' }, null, 2));
            await fs.writeFile(path.join(tempDir, 'test.langium'), 'grammar Test');

            // create a generated module file (should be ignored)
            const generatedDir = path.join(tempDir, 'src', 'generated');
            await fs.mkdir(generatedDir, { recursive: true });
            await fs.writeFile(path.join(generatedDir, 'test-module.ts'), 'export const generated = {}');

            const structure = await detectLangiumProject(tempDir);

            expect(structure.services.module).toBeUndefined();
        });
    });

    describe('scanSourceFilesForOverrides', () => {
        it('should detect class extending DefaultScopeProvider', async () => {
            const srcDir = path.join(tempDir, 'src');
            await fs.mkdir(srcDir, { recursive: true });
            await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'test' }, null, 2));

            await fs.writeFile(
                path.join(srcDir, 'my-scope.ts'),
                `import { DefaultScopeProvider } from 'langium';
export class MyScopeProvider extends DefaultScopeProvider {}`,
            );

            const overrides = await scanSourceFilesForOverrides(tempDir);

            expect(overrides).toHaveLength(1);
            expect(overrides[0]).toEqual({
                className: 'MyScopeProvider',
                serviceKey: 'scope_provider',
                filePath: path.join(srcDir, 'my-scope.ts'),
            });
        });

        it('should detect class extending AbstractFormatter', async () => {
            const srcDir = path.join(tempDir, 'src');
            await fs.mkdir(srcDir, { recursive: true });

            await fs.writeFile(
                path.join(srcDir, 'my-formatter.ts'),
                `import { AbstractFormatter } from 'langium/lsp';
export class MyFormatter extends AbstractFormatter {}`,
            );

            const overrides = await scanSourceFilesForOverrides(tempDir);

            expect(overrides).toHaveLength(1);
            expect(overrides[0].serviceKey).toBe('formatter');
            expect(overrides[0].className).toBe('MyFormatter');
        });

        it('should detect class extending AstNodeHoverProvider', async () => {
            const srcDir = path.join(tempDir, 'src');
            await fs.mkdir(srcDir, { recursive: true });

            await fs.writeFile(
                path.join(srcDir, 'hover.ts'),
                `import { AstNodeHoverProvider } from 'langium/lsp';
export class MyHoverProvider extends AstNodeHoverProvider {}`,
            );

            const overrides = await scanSourceFilesForOverrides(tempDir);

            expect(overrides).toHaveLength(1);
            expect(overrides[0].serviceKey).toBe('hover_provider');
        });

        it('should detect class implementing CodeActionProvider with langium import', async () => {
            const srcDir = path.join(tempDir, 'src');
            await fs.mkdir(srcDir, { recursive: true });

            await fs.writeFile(
                path.join(srcDir, 'code-actions.ts'),
                `import { CodeActionProvider } from 'langium/lsp';
export class MyCodeActions implements CodeActionProvider {}`,
            );

            const overrides = await scanSourceFilesForOverrides(tempDir);

            expect(overrides).toHaveLength(1);
            expect(overrides[0].serviceKey).toBe('code_action_provider');
        });

        it('should not detect implements without langium import', async () => {
            const srcDir = path.join(tempDir, 'src');
            await fs.mkdir(srcDir, { recursive: true });

            await fs.writeFile(
                path.join(srcDir, 'unrelated.ts'),
                `import { CodeActionProvider } from './my-types.js';
export class MyProvider implements CodeActionProvider {}`,
            );

            const overrides = await scanSourceFilesForOverrides(tempDir);

            expect(overrides).toHaveLength(0);
        });

        it('should detect multiple overrides across files', async () => {
            const srcDir = path.join(tempDir, 'src');
            await fs.mkdir(srcDir, { recursive: true });

            await fs.writeFile(
                path.join(srcDir, 'scope.ts'),
                `import { DefaultScopeProvider } from 'langium';
export class MyScope extends DefaultScopeProvider {}`,
            );
            await fs.writeFile(
                path.join(srcDir, 'validator.ts'),
                `import { DefaultDocumentValidator } from 'langium';
export class MyValidator extends DefaultDocumentValidator {}`,
            );
            await fs.writeFile(
                path.join(srcDir, 'completion.ts'),
                `import { DefaultCompletionProvider } from 'langium/lsp';
export class MyCompletion extends DefaultCompletionProvider {}`,
            );

            const overrides = await scanSourceFilesForOverrides(tempDir);

            expect(overrides).toHaveLength(3);
            const keys = overrides.map((o) => o.serviceKey).sort();
            expect(keys).toEqual(['completion_provider', 'scope_provider', 'validator']);
        });

        it('should skip node_modules, generated, test, and spec files', async () => {
            // in node_modules
            const nmDir = path.join(tempDir, 'node_modules', 'langium', 'src');
            await fs.mkdir(nmDir, { recursive: true });
            await fs.writeFile(
                path.join(nmDir, 'scope.ts'),
                'export class DefaultScopeProvider extends DefaultScopeProvider {}',
            );

            // in generated
            const genDir = path.join(tempDir, 'src', 'generated');
            await fs.mkdir(genDir, { recursive: true });
            await fs.writeFile(path.join(genDir, 'scope.ts'), `export class GenScope extends DefaultScopeProvider {}`);

            // test file
            const srcDir = path.join(tempDir, 'src');
            await fs.mkdir(srcDir, { recursive: true });
            await fs.writeFile(
                path.join(srcDir, 'scope.test.ts'),
                `export class TestScope extends DefaultScopeProvider {}`,
            );

            // spec file
            await fs.writeFile(
                path.join(srcDir, 'scope.spec.ts'),
                `export class SpecScope extends DefaultScopeProvider {}`,
            );

            const overrides = await scanSourceFilesForOverrides(tempDir);

            expect(overrides).toHaveLength(0);
        });

        it('should ignore classes that extend non-Langium base classes', async () => {
            const srcDir = path.join(tempDir, 'src');
            await fs.mkdir(srcDir, { recursive: true });

            await fs.writeFile(path.join(srcDir, 'my-class.ts'), `export class MyClass extends SomeOtherBaseClass {}`);

            const overrides = await scanSourceFilesForOverrides(tempDir);

            expect(overrides).toHaveLength(0);
        });
    });

    describe('detectCustomServices (conflict resolution)', () => {
        it('should prefer module-imported class when two extend the same base', async () => {
            const srcDir = path.join(tempDir, 'src');
            await fs.mkdir(srcDir, { recursive: true });

            // two classes extend DefaultScopeProvider
            await fs.writeFile(
                path.join(srcDir, 'base-scope.ts'),
                `import { DefaultScopeProvider } from 'langium';
export class BaseScopeProvider extends DefaultScopeProvider {}`,
            );
            await fs.writeFile(
                path.join(srcDir, 'real-scope.ts'),
                `import { DefaultScopeProvider } from 'langium';
export class RealScopeProvider extends DefaultScopeProvider {}`,
            );

            // module imports only RealScopeProvider
            const modulePath = path.join(srcDir, 'test-module.ts');
            await fs.writeFile(
                modulePath,
                `import { RealScopeProvider } from './real-scope.js';

export const TestModule: Module<TestServices, PartialLangiumServices> = {
    references: {
        ScopeProvider: (services) => new RealScopeProvider(services)
    }
};`,
            );

            const services = { module: modulePath } as any;
            await detectCustomServices(tempDir, modulePath, services);

            expect(services.scope_provider).toBe(path.join(srcDir, 'real-scope.ts'));
        });

        it('should use first found when no module exists for conflict resolution', async () => {
            const srcDir = path.join(tempDir, 'src');
            await fs.mkdir(srcDir, { recursive: true });

            await fs.writeFile(
                path.join(srcDir, 'scope-a.ts'),
                `import { DefaultScopeProvider } from 'langium';
export class ScopeA extends DefaultScopeProvider {}`,
            );
            await fs.writeFile(
                path.join(srcDir, 'scope-b.ts'),
                `import { DefaultScopeProvider } from 'langium';
export class ScopeB extends DefaultScopeProvider {}`,
            );

            const services = {} as any;
            await detectCustomServices(tempDir, undefined, services);

            // should pick one (first found)
            expect(services.scope_provider).toBeDefined();
        });

        it('should fill in module-only services after inheritance scan', async () => {
            const srcDir = path.join(tempDir, 'src');
            await fs.mkdir(srcDir, { recursive: true });

            // scope provider detected by inheritance
            await fs.writeFile(
                path.join(srcDir, 'scope.ts'),
                `import { DefaultScopeProvider } from 'langium';
export class MyScope extends DefaultScopeProvider {}`,
            );

            // validator only detectable via module parse (AddedServices pattern)
            await fs.writeFile(path.join(srcDir, 'validator.ts'), 'export class MyValidator {}');

            const modulePath = path.join(srcDir, 'test-module.ts');
            await fs.writeFile(
                modulePath,
                `import { MyScope } from './scope.js';
import { MyValidator } from './validator.js';

export const TestModule: Module<TestServices, PartialLangiumServices & TestAddedServices> = {
    references: {
        ScopeProvider: (services) => new MyScope(services)
    },
    validation: {
        TestValidator: () => new MyValidator()
    }
};`,
            );

            const services = { module: modulePath } as any;
            await detectCustomServices(tempDir, modulePath, services);

            // inheritance scan finds scope_provider
            expect(services.scope_provider).toBe(path.join(srcDir, 'scope.ts'));
            // module fallback finds validator
            expect(services.validator).toBe(path.join(srcDir, 'validator.ts'));
        });

        it('should not overwrite inheritance result with module fallback', async () => {
            const srcDir = path.join(tempDir, 'src');
            await fs.mkdir(srcDir, { recursive: true });

            // scope provider detected by inheritance — this is the correct file
            await fs.writeFile(
                path.join(srcDir, 'real-scope.ts'),
                `import { DefaultScopeProvider } from 'langium';
export class RealScope extends DefaultScopeProvider {}`,
            );

            // module also wires ScopeProvider but points to a wrapper
            await fs.writeFile(path.join(srcDir, 'scope-wrapper.ts'), 'export class ScopeWrapper {}');

            const modulePath = path.join(srcDir, 'test-module.ts');
            await fs.writeFile(
                modulePath,
                `import { ScopeWrapper } from './scope-wrapper.js';

export const TestModule: Module<TestServices, PartialLangiumServices> = {
    references: {
        ScopeProvider: (services) => new ScopeWrapper(services)
    }
};`,
            );

            const services = { module: modulePath } as any;
            await detectCustomServices(tempDir, modulePath, services);

            // inheritance scan takes priority
            expect(services.scope_provider).toBe(path.join(srcDir, 'real-scope.ts'));
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
            await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({
                name: 'my-awesome-dsl',
            }, null, 2));

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
            await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({
                name: 'test-dsl-project',
            }, null, 2));

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
