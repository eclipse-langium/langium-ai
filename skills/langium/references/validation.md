# Validation

**When to read this:** you are adding semantic checks to a Langium 4.x language, placing diagnostics on the right text, preparing diagnostics for code actions, running expensive checks, or debugging a validator that reports nothing.

The snippets use the grammar from the `yo langium` hello world template (`Model`, `Person`, `Greeting`) and a language named `MyDsl`. Replace the names with your own.

## Contents

1. [Recipe: add a validator](#recipe-add-a-validator)
2. [Recipe: put the diagnostic on the right text](#recipe-put-the-diagnostic-on-the-right-text)
3. [Recipe: uniqueness check](#recipe-uniqueness-check)
4. [Recipe: whole document checks with before and after hooks](#recipe-whole-document-checks-with-before-and-after-hooks)
5. [Recipe: diagnostic codes and data for code actions](#recipe-diagnostic-codes-and-data-for-code-actions)
6. [Recipe: expensive checks with slow and custom categories](#recipe-expensive-checks-with-slow-and-custom-categories)
7. [Recipe: skip validation for some nodes](#recipe-skip-validation-for-some-nodes)
8. [Best practices](#best-practices)
9. [Pitfalls](#pitfalls)
10. [Source and examples](#source-and-examples)

## Recipe: add a validator

Use this for every custom check. It matches what `yo langium` generates: a validator class, a `registerValidationChecks` function, a service entry in the module, and a call in `create<Lang>Services`.

```ts
// src/language/my-dsl-validator.ts
import type { ValidationAcceptor, ValidationChecks } from 'langium';
import type { Greeting, MyDslAstType, Person } from './generated/ast.js';
import type { MyDslServices } from './my-dsl-module.js';

export function registerValidationChecks(services: MyDslServices): void {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.MyDslValidator;
    // keys are AST type names ($type), values are one check or an array of checks
    const checks: ValidationChecks<MyDslAstType> = {
        Person: validator.checkPersonStartsWithCapital,
        Greeting: [validator.checkGreetingTarget]
    };
    // pass the validator as `this`, otherwise methods that use `this` break
    registry.register(checks, validator);
}

export class MyDslValidator {

    checkPersonStartsWithCapital(person: Person, accept: ValidationAcceptor): void {
        if (person.name) {
            const firstChar = person.name.substring(0, 1);
            if (firstChar.toUpperCase() !== firstChar) {
                accept('warning', 'Person name should start with a capital.', { node: person, property: 'name' });
            }
        }
    }

    checkGreetingTarget(greeting: Greeting, accept: ValidationAcceptor): void {
        // unresolved references are already reported as linking errors, so skip them
        const person = greeting.person.ref;
        if (person && person.name === 'Nobody') {
            accept('error', 'Nobody cannot be greeted.', { node: greeting, property: 'person' });
        }
    }
}
```

```ts
// src/language/my-dsl-module.ts (relevant parts)
import { type Module, inject } from 'langium';
import { createDefaultModule, createDefaultSharedModule, type DefaultSharedModuleContext,
    type LangiumServices, type LangiumSharedServices, type PartialLangiumServices } from 'langium/lsp';
import { MyDslGeneratedModule, MyDslGeneratedSharedModule } from './generated/module.js';
import { MyDslValidator, registerValidationChecks } from './my-dsl-validator.js';

export type MyDslAddedServices = {
    validation: {
        MyDslValidator: MyDslValidator
    }
};

export type MyDslServices = LangiumServices & MyDslAddedServices;

export const MyDslModule: Module<MyDslServices, PartialLangiumServices & MyDslAddedServices> = {
    validation: {
        MyDslValidator: () => new MyDslValidator()
    }
};

export function createMyDslServices(context: DefaultSharedModuleContext): {
    shared: LangiumSharedServices,
    MyDsl: MyDslServices
} {
    const shared = inject(createDefaultSharedModule(context), MyDslGeneratedSharedModule);
    const MyDsl = inject(createDefaultModule({ shared }), MyDslGeneratedModule, MyDslModule);
    shared.ServiceRegistry.register(MyDsl);
    // without this call no custom check ever runs
    registerValidationChecks(MyDsl);
    if (!context.connection) {
        shared.workspace.ConfigurationProvider.initialized({});
    }
    return { shared, MyDsl };
}
```

How checks are dispatched:

- A check registered for a type also runs for all its subtypes and union members. `Expression: check` covers `BinaryExpression`, `NumberLiteral`, and so on.
- The key `AstNode` runs a check on every node. Use it sparingly.
- A check has the signature `(node, accept, cancelToken) => MaybePromise<void>`. Async checks are allowed.
- If a check throws, Langium catches it, logs it, and reports an error diagnostic `An error occurred during validation: ...` on the node. Treat that message as a bug in your check.

## Recipe: put the diagnostic on the right text

`accept(severity, message, info)` takes a `DiagnosticInfo`. Severity is `'error' | 'warning' | 'info' | 'hint'`. The range is chosen in this order:

| Field | Range | Use for |
| --- | --- | --- |
| `range` | exactly this `Range` | text you located yourself |
| `property` (+ `index`) | the text of that assignment; `index` picks one element of a list property | names, references, one element of `items+=` |
| `keyword` (+ `index`) | that keyword token; `index` picks the nth occurrence | `'abstract'`, `'extends'`, operators |
| none | the whole node | rarely what you want for large nodes |

```ts
// second argument of a call
accept('error', 'Expected a number.', { node: call, property: 'args', index: 1 });
// the 'extends' keyword of an entity
accept('warning', 'Inheritance is deprecated here.', { node: entity, keyword: 'extends' });
```

Other `DiagnosticInfo` fields:

| Field | Purpose |
| --- | --- |
| `code` | code shown in the editor's problems view (`string` or `number`) |
| `codeDescription` | `{ href: 'https://...' }` link to documentation for the code |
| `data` | preserved until a code action request; see the code actions recipe |
| `tags` | `DiagnosticTag.Unnecessary` (faded text) or `DiagnosticTag.Deprecated` (strikethrough), from `vscode-languageserver-types` |
| `relatedInformation` | links to other locations, for example the first declaration of a duplicate |

`keyword` only matches keywords that belong directly to `node`, not keywords inside child nodes. If the property or keyword is not found (for example, the name failed to parse), the diagnostic silently falls back to the whole node.

## Recipe: uniqueness check

Check duplicates in the container that owns the list, and mark every duplicate. This is the pattern from `examples/arithmetics`.

```ts
import { MultiMap, type ValidationAcceptor } from 'langium';
import type { Model, Person } from './generated/ast.js';

export class MyDslValidator {

    checkUniquePersonNames(model: Model, accept: ValidationAcceptor): void {
        const byName = new MultiMap<string, Person>();
        for (const person of model.persons) {
            if (person.name) {
                byName.add(person.name, person);
            }
        }
        for (const [name, persons] of byName.entriesGroupedByKey()) {
            if (persons.length > 1) {
                for (const person of persons) {
                    accept('error', `Duplicate person name: ${name}`, { node: person, property: 'name' });
                }
            }
        }
    }
}
// registration: Model: validator.checkUniquePersonNames
```

For names that must be unique across files, query the index instead of the AST: `services.shared.workspace.IndexManager.allElements(Person.$type)` returns the exported `AstNodeDescription`s of all documents (filter by `name` and `documentUri`). Two caveats: only exported symbols are in the index (see [scoping.md](scoping.md)), and editing file A does not revalidate file B unless B references A, so cross-file duplicate warnings in B can be stale. Consider putting such checks in the `slow` category.

## Recipe: whole document checks with before and after hooks

Use hooks when the information is spread across several node types and no single container sees all of it. `registerBeforeDocument` and `registerAfterDocument` take `(callback, thisObj?)`. There is no category parameter. The callback receives `(rootNode, accept, categories, cancelToken)`.

```ts
import type { AstNode, ValidationAcceptor, ValidationCategory } from 'langium';
import type { Greeting, Person } from './generated/ast.js';
import { isModel } from './generated/ast.js';
import type { MyDslServices } from './my-dsl-module.js';

export function registerValidationChecks(services: MyDslServices): void {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.MyDslValidator;
    registry.register({ Greeting: validator.collectGreeted }, validator);
    registry.registerBeforeDocument(validator.resetGreeted, validator);
    registry.registerAfterDocument(validator.reportUngreeted, validator);
}

export class MyDslValidator {

    // the validator is a singleton per language, so reset its state for every document
    protected readonly greeted = new Set<Person>();

    resetGreeted(): void {
        this.greeted.clear();
    }

    collectGreeted(greeting: Greeting): void {
        const person = greeting.person.ref;
        if (person) {
            this.greeted.add(person);
        }
    }

    reportUngreeted(root: AstNode, accept: ValidationAcceptor, categories: ValidationCategory[]): void {
        // an empty array means "all categories"; skip if the collecting 'fast' checks did not run
        const fastChecksRan = categories.length === 0 || categories.includes('fast');
        if (fastChecksRan && isModel(root)) {
            for (const person of root.persons) {
                if (!this.greeted.has(person)) {
                    accept('info', `${person.name} is never greeted.`, { node: person, property: 'name' });
                }
            }
        }
        this.greeted.clear();
    }
}
```

The `categories` check matters. When a build runs only `['slow']`, the `fast` collector does not run, and an after hook that ignores `categories` reports false positives. In this specific example a single `Model` check would be simpler; prefer that whenever one container sees everything.

## Recipe: diagnostic codes and data for code actions

A code action provider receives the diagnostics in `params.context.diagnostics` and needs to know which problem it is looking at. Put a machine readable code into `data` with `diagnosticData(code)`, and add extra fields the fix needs.

```ts
import { diagnosticData, type ValidationAcceptor } from 'langium';
import type { Person } from './generated/ast.js';

export namespace IssueCodes {
    export const PersonNameLowercase = 'person-name-lowercase';
}

export class MyDslValidator {

    checkPersonStartsWithCapital(person: Person, accept: ValidationAcceptor): void {
        const name = person.name;
        if (name && name[0] !== name[0].toUpperCase()) {
            accept('warning', 'Person name should start with a capital.', {
                node: person,
                property: 'name',
                // visible code plus a link for the problems view (optional)
                code: IssueCodes.PersonNameLowercase,
                codeDescription: { href: 'https://example.com/docs/rules#person-name-lowercase' },
                // read by the code action provider
                data: { ...diagnosticData(IssueCodes.PersonNameLowercase), suggestion: name[0].toUpperCase() + name.slice(1) }
            });
        }
    }
}
```

The provider switches on `(diagnostic.data as DiagnosticData)?.code`. Writing the `CodeActionProvider` and registering it under `lsp.CodeActionProvider` is covered in [lsp-features.md](lsp-features.md). Testing it with `testCodeAction` is covered in [testing.md](testing.md).

`code` and `data.code` are separate. `testCodeAction` and code action providers look at `data.code`. The `code` filter of `expectError` and `expectIssue` looks at the visible `code`. Built-in diagnostics already carry `data.code`: `DocumentValidator.LexingError`, `DocumentValidator.ParsingError`, and `DocumentValidator.LinkingError`. Linking errors also carry `containerType`, `property`, and `refText` (type `LinkingErrorData`), which is enough to build a "create missing element" quick fix.

## Recipe: expensive checks with slow and custom categories

`registry.register(checks, thisObj, category)` takes an optional category. The default is `'fast'`. `'built-in'` is reserved for lexer, parser, and linker errors and throws if used. `'slow'` and any custom string (for example `'consistency'`) are allowed.

**Nothing schedules `slow` or custom checks automatically.** Document updates in the language server use `DocumentBuilder.updateBuildOptions`, which defaults to `{ validation: { categories: ['built-in', 'fast'] } }`. You decide when the other categories run:

```ts
registry.register({ Model: validator.checkExpensiveConsistency }, validator, 'slow');
```

**Option A: in a CLI or batch tool.** `validation: true` runs every category the registry knows, including custom ones.

```ts
await services.shared.workspace.DocumentBuilder.build([document], { validation: true });
```

**Option B: always, as you type.** Simplest when the checks are only moderately expensive. Set it in `createMyDslServices` after `inject`:

```ts
shared.workspace.DocumentBuilder.updateBuildOptions = {
    validation: { categories: ['built-in', 'fast', 'slow'] }
};
```

**Option C: on save.** Extend the shared `DocumentUpdateHandler`. Defining `didSaveDocument` also makes the server advertise save notifications to the client.

```ts
// src/language/my-dsl-update-handler.ts
import { URI, type LangiumDocuments, type TextDocument } from 'langium';
import { DefaultDocumentUpdateHandler, type LangiumSharedServices } from 'langium/lsp';
import type { TextDocumentChangeEvent } from 'vscode-languageserver';

export class MyDslDocumentUpdateHandler extends DefaultDocumentUpdateHandler {

    protected readonly langiumDocuments: LangiumDocuments;

    constructor(services: LangiumSharedServices) {
        super(services);
        this.langiumDocuments = services.workspace.LangiumDocuments;
    }

    // the default handler does not implement this optional method, so no `override`
    didSaveDocument(event: TextDocumentChangeEvent<TextDocument>): void {
        const document = this.langiumDocuments.getDocument(URI.parse(event.document.uri));
        if (document) {
            // runs only the missing categories, keeps existing diagnostics, then republishes them
            void this.workspaceLock.write(token =>
                this.documentBuilder.build([document], { validation: { categories: ['slow'] } }, token)
            );
        }
    }
}
```

```ts
// src/language/my-dsl-module.ts
import type { Module } from 'langium';
import type { LangiumSharedServices, PartialLangiumSharedServices } from 'langium/lsp';
import { MyDslDocumentUpdateHandler } from './my-dsl-update-handler.js';

export const MyDslSharedModule: Module<LangiumSharedServices, PartialLangiumSharedServices> = {
    lsp: {
        DocumentUpdateHandler: (services) => new MyDslDocumentUpdateHandler(services)
    }
};
// in createMyDslServices:
// const shared = inject(createDefaultSharedModule(context), MyDslGeneratedSharedModule, MyDslSharedModule);
```

The next edit resets the document and drops the slow diagnostics until the next save. For an explicit "run checks" command, register an `ExecuteCommandHandler` (see [lsp-features.md](lsp-features.md)) that performs the same `build` call.

`ValidationCategory.all` is deprecated since 4.2 because it omits custom categories. Use `ValidationCategory.defaults` or list the categories you need.

## Recipe: skip validation for some nodes

Since 4.1 you can skip custom checks for parts of the AST, for example generated or library content. Override `validateSingleNodeOptions` in `DefaultDocumentValidator`. Lexer, parser, and linking errors are still reported.

```ts
// src/language/my-dsl-document-validator.ts
import { AstUtils, DefaultDocumentValidator, type AstNode, type ValidateSingleNodeOptions,
    type ValidationOptions } from 'langium';

export class MyDslDocumentValidator extends DefaultDocumentValidator {

    protected override validateSingleNodeOptions(node: AstNode, options: ValidationOptions): ValidateSingleNodeOptions {
        // skip the whole tree of documents loaded from the builtin library
        if (!node.$container && AstUtils.getDocument(node).uri.scheme === 'mydsl-builtin') {
            return { validateNode: false, validateChildren: false };
        }
        return super.validateSingleNodeOptions(node, options);
    }
}
```

Register it in `MyDslModule`:

```ts
validation: {
    DocumentValidator: (services) => new MyDslDocumentValidator(services),
    MyDslValidator: () => new MyDslValidator()
}
```

`validateNode: false, validateChildren: true` skips only the node itself. `validateChildren: false` prunes the subtree.

## Best practices

- **One validator class per language, registered once.** Keep checks small and named `check<What>`. Group the registration in `registerValidationChecks`.
- **Register on the most specific type** that has the data you need. Register on a container (`Model`, `Entity`) for checks that compare siblings.
- **Never report what the parser or linker already reports.** Guard with `if (node.name)` and `if (ref.ref)`; partial ASTs from error recovery have missing properties.
- **Always set `property` or `keyword`.** A diagnostic spanning a 200 line block is useless.
- **Use stable issue codes** in a `namespace IssueCodes` and reuse them in code actions and tests.
- **Keep `fast` checks cheap.** They run on every keystroke for every affected document. Move scans over the whole workspace to `slow` and pick a scheduling option deliberately.
- **Support cancellation in long async checks** with `await interruptAndCheck(cancelToken)` (from `langium`).
- **Do not resolve scopes by hand in checks.** Read `ref.ref`; linking has finished before validation starts. See [scoping.md](scoping.md) if references are wrong.
- **Write a test for every check**, both the failing and the passing input ([testing.md](testing.md)).

## Pitfalls

| Symptom | Cause and fix |
| --- | --- |
| Validator never reports anything | `registerValidationChecks(services)` is not called in `create<Lang>Services`, or the validator service is missing from the module. Add both (first recipe). |
| Validator runs in the editor but not in tests | `parseHelper` builds without validation. Use `validationHelper` or `parse(text, { validation: true })` ([testing.md](testing.md)). |
| TypeScript error on a key of `ValidationChecks` | Keys are AST type names from `<Lang>AstType`, not rule names. A rule `Foo returns Bar` produces `Bar`. Data type rules and primitive types cannot be keys. Regenerate after grammar edits. |
| `this` is undefined or wrong inside a check | `register(checks)` was called without `thisObj`. Pass the validator as the second argument. |
| Error diagnostic `An error occurred during validation: ...` | Your check threw, often by dereferencing a property missing from a partial AST. Add guards. |
| `slow` or custom checks never run in the editor | Updates only run `['built-in', 'fast']`. Use option A, B, or C of the categories recipe. |
| `register(..., 'built-in')` throws | `'built-in'` is reserved. Use `'fast'`, `'slow'`, or a custom name. |
| After hook reports false positives when only slow checks run | The hook ignored its `categories` argument. Check it as shown in the hooks recipe. |
| Diagnostic highlights the whole node | `property` or `keyword` does not exist on that node, the keyword belongs to a child node, or the property is unset. Fix the name or attach to the child node. |
| Code action never offered | Diagnostic lacks `data` with a `code`, or the provider compares `diagnostic.code` instead of `diagnostic.data.code`. |
| Cross-file uniqueness warnings stay after fixing the other file | Unrelated documents are not revalidated. Move the check to `slow` or accept staleness. |

## Source and examples

- `node_modules/langium/src/validation/validation-registry.ts`: `ValidationRegistry`, `ValidationChecks`, `DiagnosticInfo`, `diagnosticData`, `ValidationCategory`
- `node_modules/langium/src/validation/document-validator.ts`: `DefaultDocumentValidator`, `validateSingleNodeOptions`, range resolution, built-in diagnostic codes
- `node_modules/langium/src/workspace/document-builder.ts`: `BuildOptions.validation`, `updateBuildOptions`
- `node_modules/langium/src/lsp/document-update-handler.ts`: `DefaultDocumentUpdateHandler`
- Examples on GitHub (`eclipse-langium/langium`): `examples/arithmetics/src/language-server/arithmetics-validator.ts` (uniqueness, data for code actions), `examples/arithmetics/src/language-server/lsp/arithmetics-code-actions.ts`, `examples/domainmodel/src/language-server/domain-model-validator.ts`, `examples/requirements/src/language-server/requirements-lang-validator.ts` (multi-language)
- Generator template: `packages/generator-langium/templates/packages/language-example/src/language-id-validator.ts`
- Docs: https://langium.org/docs/learn/workflow/create_validations/ and https://langium.org/docs/recipes/validation/dependency-loops/
