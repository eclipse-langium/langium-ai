# Multi-language projects

**When to read this:** you are adding a second language to a Langium project, splitting one language into several file types, or making one language reference elements of another.

## Contents

1. [One project or several?](#one-project-or-several)
2. [Recipe: configure several languages](#recipe-configure-several-languages)
3. [Recipe: share types and reference across languages](#recipe-share-types-and-reference-across-languages)
4. [Recipe: wire the services](#recipe-wire-the-services)
5. [Recipe: customize one language](#recipe-customize-one-language)
6. [Recipe: revalidate when another language's files change](#recipe-revalidate-when-another-languages-files-change)
7. [Recipe: VS Code extension](#recipe-vs-code-extension)
8. [Recipe: tests and CLI](#recipe-tests-and-cli)
9. [Best practices](#best-practices)
10. [Pitfalls](#pitfalls)
11. [Source and examples](#source-and-examples)

## One project or several?

- **Languages reference each other, or should run in one language server:** put them in **one** `langium-config.json`. This is the only setup in which cross-language references work, because the CLI generates one combined `AstReflection` and all languages share one index.
- **Languages are independent:** use separate Langium projects. Nothing is gained by combining them.

Typical splits: definitions vs usages (`.req` requirements and `.tst` tests in the requirements example), configuration vs implementation, or a library language plus a scripting language.

## Recipe: configure several languages

List each language in `languages`. Every language needs its own `id`, grammar file, and file extensions. From `examples/requirements/langium-config.json`:

```json
{
    "projectName": "RequirementsAndTests",
    "languages": [{
        "id": "requirements-lang",
        "grammar": "src/language-server/requirements.langium",
        "fileExtensions": [".req"],
        "textMate": { "out": "syntaxes/requirements.tmLanguage.json" }
    }, {
        "id": "tests-lang",
        "grammar": "src/language-server/tests.langium",
        "fileExtensions": [".tst"],
        "textMate": { "out": "syntaxes/tests.tmLanguage.json" }
    }],
    "out": "src/language-server/generated"
}
```

Run `npm run langium:generate`. The CLI writes one set of files for the whole project:

| File | Contents you use |
| --- | --- |
| `ast.ts` | All types of all languages, shared type guards (`isRequirement`, `isTestModel`), one namespace per grammar (`Requirements.AstType`, `Tests.AstType`), the combined `RequirementsAndTestsAstType`, and the combined `RequirementsAndTestsAstReflection` |
| `module.ts` | `<projectName>GeneratedSharedModule` (provides the combined reflection), plus per grammar `<GrammarName>GeneratedModule` and `<GrammarName>LanguageMetaData` |
| `grammar.ts` | `<GrammarName>Grammar()` per grammar |

Per-language names come from the `grammar` declaration (`grammar Requirements` gives `RequirementsGeneratedModule`). Grammar names must be unique. Options such as `caseInsensitive`, `fileNames`, `chevrotainParserConfig`, `textMate`, and `monarch` are set per language. See [project-setup.md](project-setup.md) for all options.

## Recipe: share types and reference across languages

A language references another language's types by importing its grammar. Put rules and terminals used by several languages into a grammar without a `grammar` header and without an `entry` rule.

```langium
// common.langium: shared rules and terminals, no header, no entry
Contact: 'contact' ':' user_name=STRING;
hidden terminal WS: /\s+/;
terminal ID: /[_a-zA-Z][\w_]*/;
terminal STRING: /"(\\.|[^"\\])*"|'(\\.|[^'\\])*'/;
```

```langium
// requirements.langium
grammar Requirements
import "./common"

entry RequirementModel:
    (contact=Contact)?
    (environments+=Environment)*
    (requirements+=Requirement)*;

Environment: 'environment' name=ID ':' description=STRING;
Requirement: 'req' name=ID text=STRING ('applicable' 'for' environments+=[Environment] (',' environments+=[Environment])*)?;
```

```langium
// tests.langium: references Requirement and Environment from the other language
grammar Tests
import "./requirements"

entry TestModel:
    (contact=Contact)?
    (tests+=Test)*;

Test:
    'tst' name=ID
    'tests' requirements+=[Requirement:ID] (',' requirements+=[Requirement:ID])*
    ('applicable' 'for' environments+=[Environment] (',' environments+=[Environment])*)?;
```

Only the rules reachable from a language's own `entry` rule are parsed by that language, so importing `requirements` doesn't make `.tst` files accept `req` statements.

Cross-language references then resolve through the shared global index: each document is indexed by **its own** language's `ScopeComputation`, so the exporting language decides what is visible, and the referencing language's `ScopeProvider` decides what is looked up. With default scoping, top-level `Requirement`s in `.req` files are visible in every `.tst` file. For custom export rules or imports, see [scoping.md](scoping.md).

## Recipe: wire the services

Create **one** shared container with the generated shared module, inject each language on top of it, and register every language. From `examples/requirements/src/language-server/requirements-and-tests-lang-module.ts`:

```ts
import { inject } from 'langium';
import { createDefaultModule, createDefaultSharedModule, type DefaultSharedModuleContext, type LangiumSharedServices } from 'langium/lsp';
import { RequirementsAndTestsGeneratedSharedModule, RequirementsGeneratedModule, TestsGeneratedModule } from './generated/module.js';
import { RequirementsLangModule, type RequirementsLangServices } from './requirements-lang-module.js';
import { registerRequirementsValidationChecks } from './requirements-lang-validator.js';
import { TestsLangModule, type TestsLangServices } from './tests-lang-module.js';
import { registerTestsValidationChecks } from './tests-lang-validator.js';

export function createRequirementsAndTestsLangServices(context: DefaultSharedModuleContext): {
    shared: LangiumSharedServices,
    requirements: RequirementsLangServices,
    tests: TestsLangServices
} {
    const shared = inject(
        createDefaultSharedModule(context),
        RequirementsAndTestsGeneratedSharedModule
    );
    const requirements = inject(
        createDefaultModule({ shared }),
        RequirementsGeneratedModule,
        RequirementsLangModule
    );
    const tests = inject(
        createDefaultModule({ shared }),
        TestsGeneratedModule,
        TestsLangModule
    );
    // every language must be registered, or its files are rejected
    shared.ServiceRegistry.register(requirements);
    shared.ServiceRegistry.register(tests);
    registerRequirementsValidationChecks(requirements);
    registerTestsValidationChecks(tests);
    if (!context.connection) {
        // not running in a language server: initialize the configuration provider now
        shared.workspace.ConfigurationProvider.initialized({});
    }
    return { shared, requirements, tests };
}
```

The language server entry point is unchanged: `startLanguageServer(shared)` serves all registered languages. The `ServiceRegistry` picks a language per document by the editor's language id, then by file name, then by extension.

## Recipe: customize one language

Give each language its own module, even if it is empty at first. Overrides in `RequirementsLangModule` (scope provider, formatter, validator) only affect `.req` files. Type validation checks with the combined AST type so cross-language types are available:

```ts
import type { ValidationAcceptor, ValidationChecks } from 'langium';
import type { RequirementsAndTestsAstType, Test } from './generated/ast.js';
import type { TestsLangServices } from './tests-lang-module.js';

export function registerTestsValidationChecks(services: TestsLangServices): void {
    const validator = services.validation.TestsLangValidator;
    const checks: ValidationChecks<RequirementsAndTestsAstType> = {
        Test: validator.checkTestNameContainsANumber
    };
    services.validation.ValidationRegistry.register(checks, validator);
}

export class TestsLangValidator {
    checkTestNameContainsANumber(test: Test, accept: ValidationAcceptor): void {
        if (test.name && !/\d/.test(test.name)) {
            accept('warning', `Test name ${test.name} should contain a number.`, { node: test, property: 'name' });
        }
    }
}
```

Services that apply to all languages (workspace manager, index manager, builtin documents) belong in a shared module passed to the shared `inject` call.

## Recipe: revalidate when another language's files change

A document is relinked and revalidated only when it has linking errors or references into a changed document. A check that looks the other way (for example "every requirement is covered by a test", where requirements don't reference tests) shows stale results after a test file changes. Mark those documents as affected in a custom `IndexManager`:

```ts
import { DefaultIndexManager, type LangiumDocument, type Module } from 'langium';
import type { LangiumSharedServices, PartialLangiumSharedServices } from 'langium/lsp';

export class MyIndexManager extends DefaultIndexManager {
    override isAffected(document: LangiumDocument, changedUris: Set<string>): boolean {
        // requirement files show coverage computed from test files
        if (document.uri.path.endsWith('.req')) {
            for (const uri of changedUris) {
                if (uri.endsWith('.tst')) {
                    return true;
                }
            }
        }
        return super.isAffected(document, changedUris);
    }
}

export const MySharedModule: Module<LangiumSharedServices, PartialLangiumSharedServices> = {
    workspace: {
        IndexManager: (services) => new MyIndexManager(services)
    }
};
// inject(createDefaultSharedModule(context), RequirementsAndTestsGeneratedSharedModule, MySharedModule)
```

In the check, find incoming references through the index instead of walking every AST: `services.references.References.findReferences(requirement, {})` returns a stream of `ReferenceDescription`s with `sourceUri`.

## Recipe: VS Code extension

In `package.json`, contribute one language and one TextMate grammar per entry, with ids identical to the `id`s in `langium-config.json`:

```json
"contributes": {
    "languages": [
        { "id": "requirements-lang", "extensions": [".req"], "configuration": "./language-configuration.json" },
        { "id": "tests-lang", "extensions": [".tst"], "configuration": "./language-configuration.json" }
    ],
    "grammars": [
        { "language": "requirements-lang", "scopeName": "source.requirements-lang", "path": "./syntaxes/requirements.tmLanguage.json" },
        { "language": "tests-lang", "scopeName": "source.tests-lang", "path": "./syntaxes/tests.tmLanguage.json" }
    ]
},
"activationEvents": ["onLanguage:requirements-lang", "onLanguage:tests-lang"]
```

In the extension's client options, select all languages so one server handles them:

```ts
const clientOptions: LanguageClientOptions = {
    documentSelector: [
        { scheme: 'file', language: 'requirements-lang' },
        { scheme: 'file', language: 'tests-lang' }
    ]
};
```

## Recipe: tests and CLI

- **Tests:** create the services once and use `parseHelper` with the services of the document's language. Its default URI uses that language's first file extension. Parse the referenced language's documents first, because `parseHelper` builds only the new document:

```ts
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import type { RequirementModel, TestModel } from '../src/language-server/generated/ast.js';
import { createRequirementsAndTestsLangServices } from '../src/language-server/requirements-and-tests-lang-module.js';

const services = createRequirementsAndTestsLangServices(EmptyFileSystem);
const parseReq = parseHelper<RequirementModel>(services.requirements);
const parseTst = parseHelper<TestModel>(services.tests);

await parseReq('req R1 "first"');
const tests = await parseTst('tst T1 tests R1', { validation: true });
// tests.parseResult.value.tests[0].requirements[0].ref?.name === 'R1'
```

- **CLI or batch processing:** load the folder with `WorkspaceManager.initializeWorkspace(folders)`, which picks up every registered extension, then build all documents with `{ validation: true }`. See `examples/requirements/src/cli/cli-util.ts`. Distinguish documents with the root type guards (`isTestModel(doc.parseResult.value)`).

More test helpers are in [testing.md](testing.md).

## Best practices

- Give entry rules and types language-specific names (`RequirementModel`, `TestModel`). Share a type only through a grammar import.
- Keep one module file per language plus one function that builds the shared container and registers all languages.
- Make the dependency direction explicit: the "using" language imports the "defining" language's grammar, never both ways.
- Prefer references over ad hoc lookups across languages. References are indexed, relinked on change, and support find references and rename for free.

## Pitfalls

| Symptom | Cause and fix |
| --- | --- |
| Two languages' types merged into one (`Model` suddenly has properties from both, extra optional properties appear) | Types with the same name in different grammars are merged into one interface in the combined `ast.ts`. Rename them, or share one definition through a grammar import |
| Grammar hint "This parser rule is not used for parsing, but referenced by cross-references" | A grammar redefines a rule only to reference it. Import the grammar that defines it instead |
| References to another language's elements never resolve | The languages live in separate Langium projects or separate shared containers. Use one `langium-config.json` and one shared container |
| `The service registry contains no services for the extension '.x'` | A language wasn't registered with `shared.ServiceRegistry.register(...)`, or its extension is missing from `fileExtensions` |
| `The file extension .x is used by multiple languages` warning, files parsed by the wrong language | Two languages declare the same extension. The last registered one wins. Use distinct extensions or `fileNames` |
| Editor uses the wrong language or none for a file | The VS Code language id differs from the `id` in `langium-config.json`, or the language is missing from `documentSelector` |
| Validation of one language never runs | Its `register...ValidationChecks` call is missing from the services function |
| A check that reads other documents shows stale results | Those documents don't reference the checked one. See the revalidation recipe |
| A cross-language test fails although the editor works | The referenced document was parsed after the referencing one. Parse dependencies first |

For a broader symptom list see [troubleshooting.md](troubleshooting.md).

## Source and examples

- [examples/requirements](https://github.com/eclipse-langium/langium/tree/main/examples/requirements): `langium-config.json`, `src/language-server/*.langium`, `requirements-and-tests-lang-module.ts`, `*-lang-validator.ts`, `src/cli/cli-util.ts`, `src/extension.ts`, `test/validator.test.ts`
- `node_modules/langium/src/service-registry.ts` (`DefaultServiceRegistry`: language lookup by language id, file name, extension)
- `node_modules/langium/src/workspace/index-manager.ts` (`isAffected`), `workspace/document-builder.ts` (`shouldRelink`)
- `node_modules/langium-cli/src/generator/module-generator.ts` (generated module names)
- Website recipe (4.1; `getOrCreateDocument` is async, `await` it): [Multiple dependent languages](https://langium.org/docs/recipes/multiple-languages/)
