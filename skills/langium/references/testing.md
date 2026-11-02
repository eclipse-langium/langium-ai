# Testing

**When to read this:** you are writing or fixing tests for a Langium 4.x language: parsing, linking (including across files), validation, code actions, or LSP features such as completion, hover, go to definition, references, symbols, formatting, and semantic tokens.

All helpers come from `langium/test`. They work with any assertion library; the snippets use vitest, as `yo langium` does. The language is `MyDsl` with the hello world template grammar (`Model`, `Person`, `Greeting`).

## Contents

1. [Setup](#setup)
2. [Recipe: parsing tests](#recipe-parsing-tests)
3. [Recipe: linking tests in one document](#recipe-linking-tests-in-one-document)
4. [Recipe: cross-file references](#recipe-cross-file-references)
5. [Recipe: validation tests](#recipe-validation-tests)
6. [Recipe: code action tests](#recipe-code-action-tests)
7. [Recipe: LSP feature tests](#recipe-lsp-feature-tests)
8. [Helper reference](#helper-reference)
9. [Best practices](#best-practices)
10. [Pitfalls](#pitfalls)
11. [Source and examples](#source-and-examples)

## Setup

`yo langium` with tests enabled adds `vitest` as a dev dependency, a `"test": "vitest run"` script, and this `vitest.config.ts` in the language package:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        deps: {
            interopDefault: true
        },
        include: ['**/*.test.ts']
    }
});
```

Create the services once per test file with `EmptyFileSystem`, so tests never touch the disk. Use the same `create<Lang>Services` function as the language server; that way every registration in your module is exercised.

```ts
import { EmptyFileSystem } from 'langium';
import { createMyDslServices } from '../src/language/my-dsl-module.js';

const services = createMyDslServices(EmptyFileSystem);
// services.MyDsl: language services, services.shared: shared services
```

Run `npm run langium:generate` before testing after any grammar change; tests run against `src/language/generated/`.

## Recipe: parsing tests

`parseHelper<T>(services)` returns `(text, options?) => Promise<LangiumDocument<T>>`. It creates a document with a fresh URI (`file:///1.mydsl`, `file:///2.mydsl`, ...), adds it to the workspace, and builds it. It does **not** validate unless you pass `{ validation: true }`.

Always assert the absence of lexer and parser errors first. Error recovery produces a partial AST, so property assertions alone can pass on broken input.

```ts
import { afterEach, describe, expect, test } from 'vitest';
import { EmptyFileSystem, type LangiumDocument } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import type { Model } from '../src/language/generated/ast.js';
import { createMyDslServices } from '../src/language/my-dsl-module.js';

const services = createMyDslServices(EmptyFileSystem);
const parse = parseHelper<Model>(services.MyDsl);

afterEach(async () => {
    await clearDocuments(services.shared);
});

function expectNoParseErrors(document: LangiumDocument): void {
    // mapping to messages makes failures readable
    expect(document.parseResult.lexerErrors.map(e => e.message)).toEqual([]);
    expect(document.parseResult.parserErrors.map(e => e.message)).toEqual([]);
}

describe('Parsing', () => {

    test('persons and greetings', async () => {
        const document = await parse(`
            person Alice
            Hello Alice!
        `);
        expectNoParseErrors(document);
        const model = document.parseResult.value;
        expect(model.persons.map(p => p.name)).toEqual(['Alice']);
        expect(model.greetings[0].person.$refText).toBe('Alice');
    });

    test('missing name is a parser error', async () => {
        const document = await parse('person');
        expect(document.parseResult.parserErrors).not.toHaveLength(0);
    });
});
```

## Recipe: linking tests in one document

Check `ref` for the target and `error` for the reason when linking fails. Both are populated after `parse` because the build links eagerly.

```ts
test('greeting links to person', async () => {
    const document = await parse(`
        person Alice
        Hello Alice!
        Hello Bob!
    `);
    expectNoParseErrors(document);
    const [alice, bob] = document.parseResult.value.greetings;
    expect(alice.person.ref?.name).toBe('Alice');
    expect(bob.person.ref).toBeUndefined();
    expect(bob.person.error?.message).toMatch(/Could not resolve reference/);
});
```

## Recipe: cross-file references

Documents only see what other documents export into the index (see [scoping.md](scoping.md)). The simplest test parses the referenced document first:

```ts
test('greeting links to a person in another file', async () => {
    await parse('person Alice', { documentUri: 'file:///lib.mydsl' });
    const document = await parse('Hello Alice!', { documentUri: 'file:///main.mydsl' });
    expect(document.parseResult.value.greetings[0].person.ref?.name).toBe('Alice');
});
```

When order does not work (mutual references, or you want one consistent build), create all documents first and build them together:

```ts
import { URI } from 'langium';

test('mutual references across files', async () => {
    const factory = services.shared.workspace.LangiumDocumentFactory;
    const documents = services.shared.workspace.LangiumDocuments;
    const a = factory.fromString<Model>('person Alice\nHello Bob!', URI.parse('file:///a.mydsl'));
    const b = factory.fromString<Model>('person Bob\nHello Alice!', URI.parse('file:///b.mydsl'));
    documents.addDocument(a);
    documents.addDocument(b);
    await services.shared.workspace.DocumentBuilder.build([a, b], { validation: true });
    expect(a.parseResult.value.greetings[0].person.ref?.name).toBe('Bob');
    expect(b.diagnostics).toEqual([]);
});
```

If your language loads a builtin library through the `WorkspaceManager` ([scoping.md](scoping.md)), call `await services.shared.workspace.WorkspaceManager.initializeWorkspace([])` once in `beforeAll`, and pass explicit documents to `clearDocuments` so the library survives.

Use your language's file extension in `documentUri`. The service registry routes documents by extension, which matters in multi-language projects ([multi-language.md](multi-language.md)).

## Recipe: validation tests

`validationHelper<T>(services)` parses with validation enabled and returns `{ document, diagnostics, dispose }`. Assert with `expectError`, `expectWarning`, `expectIssue`, and `expectNoIssues`.

```ts
import { afterEach, describe, test } from 'vitest';
import { EmptyFileSystem } from 'langium';
import { clearDocuments, expectError, expectIssue, expectNoIssues, expectWarning, validationHelper } from 'langium/test';
import type { Model } from '../src/language/generated/ast.js';
import { createMyDslServices } from '../src/language/my-dsl-module.js';
import { IssueCodes } from '../src/language/my-dsl-validator.js';

const services = createMyDslServices(EmptyFileSystem);
const validate = validationHelper<Model>(services.MyDsl);

afterEach(async () => {
    await clearDocuments(services.shared);
});

describe('Validation', () => {

    test('lowercase person name', async () => {
        const result = await validate('person alice');
        const person = result.document.parseResult.value.persons[0];
        // node + property pins the diagnostic to the text of `name`
        expectWarning(result, 'Person name should start with a capital.', { node: person, property: 'name' });
        // match by data instead of message (partial deep match)
        expectIssue(result, { data: { code: IssueCodes.PersonNameLowercase } });
    });

    test('duplicate names', async () => {
        const result = await validate('person Alice\nperson Alice');
        expectError(result, /Duplicate person name/, {});
    });

    test('valid input', async () => {
        const result = await validate('person Alice\nHello Alice!', { failOnParsingErrors: true });
        expectNoIssues(result);
    });
});
```

Filter options for `expectError`, `expectWarning`, `expectIssue`, and `expectNoIssues`:

| Option | Matches |
| --- | --- |
| `node`, `property` (`'name'` or `{ name, index }`) | exact range of the node or of that property. `property` without `node` is ignored |
| `range` | exact `Range` |
| `offset`, `length` | exact range by character offset |
| `code` | the visible `diagnostic.code` |
| `data` | partial deep match on `diagnostic.data` (keys you list must match) |
| `message`, `severity` | `expectIssue` and `expectNoIssues` only; `expectError` and `expectWarning` set them |

A string message must match exactly; use a `RegExp` for substrings. `expectNoIssues(result, { severity: DiagnosticSeverity.Error })` ignores warnings. `failOnParsingErrors: true` makes `validationHelper` fail fast on syntax errors.

To test a `slow` or custom category, pass the categories explicitly: `validate(text, { validation: { categories: ['slow'] } })`. This runs only those checks, without lexer, parser, and linker diagnostics. See [validation.md](validation.md) for how categories are scheduled.

## Recipe: code action tests

`testCodeAction(services)` returns `(input, diagnosticCode, outputAfterFix, options?)`. It expects exactly one diagnostic whose `data.code` equals `diagnosticCode`, requests code actions for it, expects exactly one action, applies its edit, compares the text with `outputAfterFix`, and checks that the diagnostic is gone. Pass `undefined` as `outputAfterFix` to assert that no action is offered.

```ts
import { describe, expect, test } from 'vitest';
import { EmptyFileSystem } from 'langium';
import { testCodeAction } from 'langium/test';
import { createMyDslServices } from '../src/language/my-dsl-module.js';
import { IssueCodes } from '../src/language/my-dsl-validator.js';

const services = createMyDslServices(EmptyFileSystem);
const testAction = testCodeAction(services.MyDsl);

describe('Code actions', () => {
    test('capitalize person name', async () => {
        const result = await testAction('person alice', IssueCodes.PersonNameLowercase, 'person Alice');
        expect(result.action?.title).toBe('Capitalize name');
        await result.dispose();
    });
});
```

The validator must set `data: diagnosticData(code)` ([validation.md](validation.md)), and `lsp.CodeActionProvider` must be registered ([lsp-features.md](lsp-features.md)).

## Recipe: LSP feature tests

LSP helpers need services created with `createDefaultModule` from `langium/lsp`. The `text` uses markers: `<|>` marks a cursor position (selected by `index`, counting from 0) and `<|...|>` marks a range (selected by `rangeIndex`, sorted by start). Markers are removed before parsing.

```ts
import { afterEach, describe, expect, test } from 'vitest';
import { EmptyFileSystem } from 'langium';
import { clearDocuments, expectCompletion, expectFindReferences, expectFormatting, expectGoToDefinition,
    expectHover, expectSemanticToken, expectSymbols, highlightHelper } from 'langium/test';
import { SemanticTokenTypes } from 'vscode-languageserver';
import { createMyDslServices } from '../src/language/my-dsl-module.js';

const services = createMyDslServices(EmptyFileSystem);
const lang = services.MyDsl;

afterEach(async () => {
    await clearDocuments(services.shared);
});

describe('LSP features', () => {

    test('completion offers declared persons', async () => {
        await expectCompletion(lang)({
            text: 'person Alice\nperson Bob\nHello <|>',
            index: 0,
            // the full list, ordered by sortText; use `assert` for partial checks
            expectedItems: ['Alice', 'Bob']
        });
    });

    test('completion contains a keyword', async () => {
        await expectCompletion(lang)({
            text: '<|>',
            index: 0,
            assert: completions => {
                expect(completions.items.map(i => i.label)).toContain('person');
            }
        });
    });

    test('go to definition', async () => {
        await expectGoToDefinition(lang)({
            text: 'person <|Alice|>\nHello <|>Alice!',
            index: 0,
            rangeIndex: 0
        });
    });

    test('find references', async () => {
        // every <|> is queried, every range must be found
        await expectFindReferences(lang)({
            text: 'person <|>Alice\nHello <|Alice|>!\nHello <|Alice|>!',
            includeDeclaration: false
        });
    });

    test('hover shows the doc comment', async () => {
        await expectHover(lang)({
            text: '/** The first person */\nperson <|>Alice',
            index: 0,
            hover: /The first person/
        });
    });

    test('document symbols', async () => {
        await expectSymbols(lang)({
            text: 'person Alice\nperson Bob',
            expectedSymbols: ['Alice', 'Bob']
        });
    });

    test('formatting', async () => {
        // assumes a formatter that puts one space after 'person'
        await expectFormatting(lang)({
            before: 'person   Alice',
            after: 'person Alice'
        });
    });

    test('semantic tokens', async () => {
        // the expected type is whatever your SemanticTokenProvider assigns
        const tokens = await highlightHelper(lang)('person <|Alice|>');
        expectSemanticToken(tokens, { tokenType: SemanticTokenTypes.class, rangeIndex: 0 });
    });
});
```

`expectFormatting` throws at creation if no `lsp.Formatter` is registered; `highlightHelper` throws if no `lsp.SemanticTokenProvider` is registered. Both are optional providers you must add yourself ([lsp-features.md](lsp-features.md)). For completion internals beyond these checks, see [lsp-features.md](lsp-features.md).

## Helper reference

| Helper | Use for |
| --- | --- |
| `parseHelper`, `parseDocument` | parse and build one document; `parseDocument(services, text, options?)` is the one-shot form |
| `validationHelper` | parse with validation, returns `{ document, diagnostics, dispose }` |
| `expectError`, `expectWarning`, `expectIssue`, `expectNoIssues` | assert diagnostics |
| `testCodeAction` | one diagnostic, one quick fix, expected text after the fix |
| `expectCompletion` | completion items at `index` |
| `expectGoToDefinition` | definition target range in the same document |
| `expectFindReferences` | reference ranges in the same document |
| `expectHover` | hover markdown, exact string or `RegExp`; `undefined` asserts no hover |
| `expectSymbols`, `expectWorkspaceSymbols` | document symbols (names or full `DocumentSymbol`s), workspace symbols (pass shared services) |
| `expectFormatting` | text before and after formatting, optional `range` and `options` |
| `expectHighlight`, `expectFoldings` | document highlights, folding ranges |
| `highlightHelper`, `expectSemanticToken` | decoded semantic tokens |
| `clearDocuments` | remove documents from the workspace and index |

Parse options go through `parseOptions` on the LSP helpers (for example `{ parseOptions: { documentUri: 'file:///x.mydsl' } }`).

## Best practices

- **Test through `create<Lang>Services(EmptyFileSystem)`**, never through hand-built services. Missing registrations then fail in tests, not in the editor.
- **Check for parser errors before anything else** in parsing and linking tests.
- **Clean up after every test.** `await clearDocuments(services.shared)` in `afterEach`, or `disposeAfterCheck: true` on LSP helpers, or `await result.dispose()`. Leftover documents stay in the index and leak into scopes, completion lists, and reference counts of later tests.
- **Prefer `node` + `property` or `data` over message text** in validation assertions, so wording changes do not break tests. Match messages with a `RegExp` when you do.
- **Test both directions:** one input that triggers each check, one that does not.
- **Write a test for every scoping or validation change.** Cross-file scoping needs a two-document test; single-document tests do not exercise exports.
- **Keep one service instance per file.** Creating services is expensive; create them at module level or in `beforeAll`.

## Pitfalls

| Symptom | Cause and fix |
| --- | --- |
| `document.diagnostics` is `undefined` | `parseHelper` was called without `{ validation: true }`. Use `validationHelper`. |
| Validation test passes on invalid syntax | Error recovery produced a partial AST. Assert no parser errors, or use `failOnParsingErrors: true`. |
| `expectError(..., { property: 'name' })` passes for the wrong node | `property` is ignored without `node`. Pass both. |
| `expectError` fails although the message looks right | String messages must match exactly. Use a `RegExp` or check `diagnostics` directly. |
| Cross-file reference unresolved in a test | The target document was parsed after the referencing one, or the target is not exported. Parse the target first or build both together; check `ScopeComputation` ([scoping.md](scoping.md)). |
| Completion, references, or duplicate checks see extra elements | Documents from earlier tests are still in the workspace. Clear them in `afterEach`. |
| `A document with the URI '...' is already present` | The same `documentUri` was reused without clearing. Clear documents or use unique URIs. |
| Builtin library elements vanish after the first test | `clearDocuments(services.shared)` without a document list also removes library documents. Pass the test documents explicitly. |
| `testCodeAction` fails on `expected 1` | Zero or several diagnostics have that `data.code`, or the validator set only `code`. Use `diagnosticData(code)` in the validator. |
| `No formatter registered for language ...` | `lsp.Formatter` is not in the module. Register it ([lsp-features.md](lsp-features.md)). |
| LSP helper returns nothing for a provider | The optional provider (code actions, semantic tokens, formatting) is not registered, or core-only services were used. Use `createDefaultModule` from `langium/lsp`. |
| Tests fail after a grammar change, editor works | `generated/` is stale in the test run. Run `npm run langium:generate`. |

## Source and examples

- `node_modules/langium/src/test/langium-test.ts`: all helpers and their option types
- `node_modules/langium/src/workspace/document-builder.ts`: `BuildOptions` used by `parseHelper`
- Examples on GitHub (`eclipse-langium/langium`): `examples/arithmetics/test/arithmetics-validator.test.ts` (validation helpers), `examples/arithmetics/test/lsp/arithmetics-code-actions.test.ts` (`testCodeAction`), `examples/domainmodel/test/formatting.test.ts` (`expectFormatting`), `examples/domainmodel/test/cross-refs.test.ts` (two documents, reference index)
- Langium's own LSP tests show every marker pattern: `packages/langium/test/lsp/completion-provider.test.ts`, `goto-definition.test.ts`, `find-references.test.ts`, `hover.test.ts`, `document-symbol.test.ts`
- Generator templates: `packages/generator-langium/templates/packages/language-example/test/` (`parsing.test.ts`, `linking.test.ts`, `validating.test.ts`)
- Docs: https://langium.org/docs/learn/workflow/create_validations/ (simple validation test)
