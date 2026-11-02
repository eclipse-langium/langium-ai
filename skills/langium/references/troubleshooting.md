# Troubleshooting Langium Languages

## When to read this

Read this when a Langium language misbehaves: `langium generate` fails, input doesn't parse, references don't resolve, diagnostics or editor features are missing, or the server is slow. Find the symptom, apply the fix, and follow the link for the full recipe. Quoted messages are the exact texts Langium 4.4 and Chevrotain produce.

## Contents

1. [Grammar and generation](#1-grammar-and-generation)
2. [Parsing at runtime](#2-parsing-at-runtime)
3. [Cross-references](#3-cross-references)
4. [Services and dependency injection](#4-services-and-dependency-injection)
5. [Validation](#5-validation)
6. [Editor and LSP features](#6-editor-and-lsp-features)
7. [Performance](#7-performance)
8. [Dependencies and versions](#8-dependencies-and-versions)
9. [4.x version notes](#9-4x-version-notes)

First checks for almost any symptom: run `npm run langium:generate` (or `npx langium generate`), rebuild the TypeScript, and restart the language server or extension host. Many "nothing changed" reports are a stale build.

## 1. Grammar and generation

### `langium generate` fails with `Parser definition errors detected:`

Each entry is prefixed with `file:line` of the rule. Common entries:

- `Left Recursion found in grammar.` A rule can call itself without consuming a token (`Expr: Expr '+' Expr | ...`). **Fix:** write expressions as an `infix` rule or with tree-rewriting actions (`{BinaryExpression.left=current}`). See [grammar.md](grammar.md).
- `Ambiguous alternatives: <0 ,1> due to common lookahead prefix ...` Only appears when `chevrotainParserConfig.maxLookahead` is set in `langium-config.json` (this switches the parser from LL(\*) to LL(k)). **Fix:** refactor the grammar (see the next entry), raise `maxLookahead`, or remove it to use the default LL(\*) strategy.
- `Ambiguous empty alternative` / `The repetition <...> can never consume any tokens.` An alternative or a `*` loop body can match nothing. **Fix:** make the element mandatory and put the cardinality outside.

### Wrong alternative parsed, or console shows `Ambiguous Alternatives Detected`

With the default LL(\*) strategy, **`langium generate` does not report real ambiguities.** At parse time (in `development` mode) the console logs:

```text
Ambiguous Alternatives Detected: <0, 1> in <OR> inside <Person> Rule,
<ID> may appears as a prefix path in all these alternatives.
```

The parser then silently commits to one of the alternatives, so the others never match for that input. In `production` mode the message is suppressed and the bug is silent.

**Fix,** in order of preference:

1. Add a distinguishing keyword to each alternative (`'student' name=ID` vs `'teacher' name=ID`).
2. Left-factor: merge alternatives with a common prefix into one rule with optional suffixes, and tell the cases apart in validation.
3. Merge structurally identical rules into one rule with a discriminating property (`kind=('student'|'teacher')`).

Syntactic predicates (`=>`, `->`) are **not** a fix: since 4.0 the grammar validator rejects them with `Predicates are currently not supported.` See [grammar.md](grammar.md).

### Grammar validation errors

`langium generate` also stops on errors from the grammar validator. Ones that surprise people:

| Message | Fix |
| --- | --- |
| `Terminal name clashes with existing keyword.` | rename the terminal or the keyword |
| `This terminal could match an empty string.` | make the regex require at least one character |
| `This parser rule does not create an object. Add a primitive return type or an action to the start of the rule to force object instantiation.` | add `returns string` (data type rule) or an action `{infer X}` |
| `Rule call 'X' requires assignment when parsed multiple times.` | assign it (`items+=X`) |
| `The "name" property is not recommended for cross-references.` (warning) | rename the property; `name` is reserved for declarations by `NameProvider` |
| `Optional elements in Unordered groups are currently not supported` | restructure the `&` group |

### Two grammars define a type with the same name

In one project, types with the same name from different grammars are silently merged into one interface in `ast.ts`. Rename one of them. See [multi-language.md](multi-language.md).

### A keyword can no longer be used as a name

**Symptom:** after adding a keyword such as `type`, input like `property type: string` fails with ``Expecting token of type 'ID' but found `type`.``

**Cause:** the lexer runs before the parser and keywords always win over terminals, so `type` is never an `ID` anywhere.

**Fix:** allow the keyword explicitly through a data type rule, and use it for the name and for cross-references:

```langium
Property: name=FeatureName ':' type=TypeRef;
Ref: target=[Property:FeatureName];
FeatureName returns string: ID | 'type';
```

Optionally emit semantic tokens so the name isn't colored as a keyword. See [grammar.md](grammar.md) and [the keywords-as-identifiers recipe](https://langium.org/docs/recipes/keywords-as-identifiers/).

### One terminal shadows another

**Symptom:** tokens get the wrong type (for example `1.5` gives ``Expecting token of type 'DECIMAL' but found `1`.``, or every lowercase word becomes `NAME` instead of `ID`), or the lexer reports `unexpected character: ->.<- at offset: 3, skipped 1 characters.`

**Cause:** keywords come first (longest first); terminals are tried **in the order they are defined, and the first match wins** (not the longest).

**Fix:** define the more specific terminal first, merge overlapping terminals into one and distinguish in parser rules, or replace a terminal with a data type rule (`Decimal returns number: INT '.' INT;`). Avoid two terminals that match the same text. See [grammar.md](grammar.md).

### Generated code is stale, or edits in `generated/` disappeared

**Symptoms:** TypeScript errors such as `Module './generated/ast.js' has no exported member 'isFoo'`; a new keyword or rule is not recognized at runtime; hand edits to `ast.ts` vanished.

**Cause:** `generated/` is fully rewritten by `langium generate`, and the runtime parser is built from the serialized grammar in `grammar.ts`, not from the `.langium` file.

**Fix:** regenerate after every grammar change (`langium generate --watch` during development). Never edit `generated/`; put custom code in your own files and extend the generated types. Keep `langium` and `langium-cli` on the same version. See [project-setup.md](project-setup.md).

## 2. Parsing at runtime

### Code crashes on documents with syntax errors (partial AST)

**Symptoms:** editor shows `An error occurred during validation: Cannot read properties of undefined ...`, or `An error occurred while resolving reference to 'x': ...`; a generator or provider throws while the user is typing.

**Cause:** error recovery still builds an AST, but properties typed as mandatory can be `undefined` (only arrays and `?=` booleans get defaults).

**Fix:** guard with optional chaining or `services.shared.AstReflection.isComplete(node)` (4.3+), and skip generation for documents with `parseResult.lexerErrors` or `parseResult.parserErrors`. See [how-langium-works.md](how-langium-works.md).

## 3. Cross-references

### `Could not resolve reference to X named 'y'.` within one file

Check in this order:

1. **Name mismatch.** The target's name is what `NameProvider.getName` returns (default: the `name` property). If the reference text is qualified (`a.b.C`) but targets are registered as `C`, it fails. Use a qualified name provider and a cross-reference rule that accepts dots (`[Entity:QualifiedName]`).
2. **Wrong target type.** Scopes filter by the reference's declared type and its subtypes. `[Element]` does not find nodes created as an unrelated type by another rule or action. Check `reflection.getReferenceType(...)` and the generated `ast.ts`.
3. **Not in a visible container.** Local symbols are visible within their container and its descendants. A sibling inside another block is not visible; adjust `ScopeComputation` or `ScopeProvider`.
4. **Case.** Default scopes match case-sensitively, even when `caseInsensitive` is set for keywords. Pass `{ caseInsensitive: true }` as `ScopeOptions` in a custom scope provider.
5. **Custom `ScopeProvider` dropped the outer scope.** Chain your scope to `super.getScope(context)` or the global scope. For multi-references (`[+Type]`) use `StreamScope` or `MultiMapScope`; `MapScope` keeps only one element per name.
6. **Custom `ScopeComputation` lost symbols.** Reimplementing `collectLocalSymbols` from scratch drops the default named nodes. Override the `addLocalSymbol` / `addExportedSymbol` hooks and call `super`.

See [scoping.md](scoping.md).

### `Could not resolve reference ...` across files

1. **Not exported.** By default only the root node and its **direct** children are exported. Anything nested (inside a package, namespace, or class) is invisible to other files. Override `ScopeComputation.collectExportedSymbols` (usually exporting qualified names). See [scoping.md](scoping.md).
2. **Document not loaded.** The workspace manager skips dot folders, `node_modules`, `out`, and files whose extension is not in `fileExtensions` / `fileNames`. In a CLI, nothing scans the workspace: only documents you create exist. Either call `services.shared.workspace.WorkspaceManager.initializeWorkspace([{ name, uri }])` for the project root first (the domainmodel CLI's `setRootFolder` does this), or load all related files with `LangiumDocuments.getOrCreateDocument(uri)` and build them in **one** `DocumentBuilder.build(docs, ...)` call. See [code-generation.md](code-generation.md). In tests, parse every file with the same services (see [testing.md](testing.md)).
3. **Builtin library missing in tests or a CLI.** `loadAdditionalDocuments` only runs inside `WorkspaceManager.initializeWorkspace`; call that (or load the library documents yourself) before building. See [scoping.md](scoping.md).
4. **Other language.** In multi-language projects the target language must be registered in the same `ServiceRegistry`, and the shared module must use the combined reflection. See [multi-language.md](multi-language.md).

### A reference keeps pointing to an old target after editing another file

Documents are relinked only if they have linking errors or hold a resolved reference into a changed file. Dependencies through imports or shadowing are not tracked. Validation checks that read other documents go stale for the same reason. **Fix:** override `DefaultDocumentBuilder.shouldRelink` or `DefaultIndexManager.isAffected`. See [how-langium-works.md](how-langium-works.md) and [multi-language.md](multi-language.md).

### `Cyclic reference resolution detected: /elements@0/ref/target (symbol 'x')`

Usually shown as a linking error `An error occurred while resolving reference to 'x': Cyclic reference resolution detected: ...`.

**Cause:** while computing the scope for a reference, your code (scope provider, type inference, name provider) accessed `.ref` of the same reference, directly or through a chain.

**Fix:** never read `context.reference.ref` inside `getScope`. For member access chains (`a.b.c`), resolve only the receiver (`previous.ref`), never the current element. Break inference loops with a guard set or a `DocumentCache`. See [scoping.md](scoping.md).

### Console warning `Attempted reference resolution before document reached ComputedScopes state (...)`

**Cause:** `.ref` was accessed in `collectExportedSymbols`, `collectLocalSymbols`, a `NameProvider`, or a `Parsed` listener. This does not throw: the access returns `undefined` (and is retried later) or binds to a wrong global target, so exports or names come out wrong.

**Fix:** compute exports and names from syntax only (`$refText`, properties), never from resolved references.

## 4. Services and dependency injection

### `Cycle detected. Please make "X" lazy. Visit https://langium.org/docs/reference/configuration-services/#resolving-cyclic-dependencies`

**Cause:** two service constructors read each other. **Fix:** in one constructor store `this.x = () => services.group.X` and call `this.x()` when needed. See [how-langium-works.md](how-langium-works.md).

### `Construction failure. Please make sure that your dependencies are constructable. Cause: ...`

A service factory threw on an earlier access. Fix the error in `Cause`.

### An override, custom service, or listener has no effect

1. **Not wired.** The module is missing from `inject(...)`, or comes before the default module (later modules win).
2. **Wrong layer.** Shared services (`workspace.WorkspaceManager`, `workspace.DocumentBuilder`, `workspace.IndexManager`, `lsp.ExecuteCommandHandler`) belong in the shared module; language services (`references.*`, `validation.*`, `lsp.Formatter`, ...) in the language module.
3. **Wrong method name.** Use `override` on overridden methods so typos fail to compile.
4. **Never instantiated.** Services are lazy; outside the language server, a service that only registers listeners never runs. Access it or call `eagerLoad`.
5. **Stale bundle.** The extension still runs the old server bundle; rebuild it.

See [project-setup.md](project-setup.md).

### A CLI or test hangs in configuration code

`ConfigurationProvider.getConfiguration` waits until the provider is initialized, which only the language server does, so custom code calling it outside the server never returns. Outside the server, call `shared.workspace.ConfigurationProvider.initialized({})` in `create<Lang>Services` when there is no connection (as the domainmodel example does).

## 5. Validation

### A validator never runs

| Cause | Fix |
| --- | --- |
| `registerValidationChecks(services)` is not called in `create<Lang>Services` | call it after `inject` |
| check key misspelled or not a type in `ast.ts` (registers nothing) | type the record as `ValidationChecks<MyLangAstType>` |
| registered under `'slow'` or a custom category | updates run only `built-in` and `fast`; trigger the category explicitly ([validation.md](validation.md#recipe-expensive-checks-with-slow-and-custom-categories)) |
| a CLI, test, or `parseHelper` built the document without validation | build with `{ validation: true }`; otherwise `document.diagnostics` is `undefined` ([testing.md](testing.md)) |
| `stopAfterParsingErrors` / `stopAfterLinkingErrors` set and earlier errors exist | fix the earlier errors or drop the option |
| the file is not open and nothing was edited yet | the initial build doesn't validate; see [how-langium-works.md](how-langium-works.md) |

### `An error occurred during validation: ...`

A check threw. Most often the AST is partial (section 2) or the check uses `this` but was registered without `thisObj`: call `registry.register(checks, validator)`.

### `The 'built-in' category is reserved for lexer, parser, and linker errors.`

`register(..., 'built-in')` is not allowed. Use `'fast'` (default), `'slow'`, or a custom name.

### Tests fail with `A document with the URI '...' is already present`

A test reused a `documentUri` without clearing. Clear documents between tests. See [testing.md](testing.md).

## 6. Editor and LSP features

### An editor feature is missing

1. **Provider not registered.** The language module only provides Completion, DocumentSymbol, Hover, FoldingRange, References, Definition, DocumentHighlight, and Rename by default. Formatter, SemanticTokenProvider, CodeActionProvider, InlayHintProvider, SignatureHelp, CodeLensProvider, DocumentLinkProvider, TypeProvider, ImplementationProvider, DeclarationProvider, CallHierarchyProvider, and TypeHierarchyProvider must be added under `lsp` in your language module (`ExecuteCommandHandler` and `TextDocumentContentProvider` in the shared module). The capability is advertised only if a provider exists at `initialize`.
2. **No LSP services at all.** Services built with `createDefaultCoreModule` / `createDefaultSharedCoreModule` have no `lsp` group. Use `createDefaultModule` / `createDefaultSharedModule` from `langium/lsp`.
3. **Provider present but capability off.** Capabilities are computed once at `initialize` from all registered languages. Signature help is only advertised when `signatureHelpOptions.triggerCharacters` is non-empty.
4. **Hover is empty.** The default `MultilineCommentHoverProvider` shows only JSDoc-style `/** ... */` comments directly before the declaration.
5. **Client side.** The VS Code extension's `contributes.languages` and the client's `documentSelector` must match the language id and file extension. Check the server's Output channel for startup errors.

See [lsp-features.md](lsp-features.md).

### Formatting does nothing

1. The formatter is not registered as `lsp: { Formatter: () => new MyFormatter() }`.
2. The document has lexer or parser errors: `AbstractFormatter` returns no edits for the whole document then, and range formatting stops at the first line with an error.
3. `format(node)` doesn't handle the node type, or uses property or keyword names that don't exist on it. Use the generated type guards and property constants.
4. In VS Code another extension is the default formatter for the file type.

In tests, `expectFormatting` throws if no formatter is registered. See [lsp-features.md](lsp-features.md).

### Semantic tokens do nothing

1. Not registered as `lsp: { SemanticTokenProvider: (services) => new MyTokenProvider(services) }`.
2. `highlightElement` doesn't reach the node type, or `property` / `keyword` names don't match.
3. The client has semantic highlighting disabled (`editor.semanticHighlighting.enabled`), or the theme doesn't style the token type.

TextMate coloring stays as is wherever you emit no semantic token. See [lsp-features.md](lsp-features.md).

### Request fails with `Document state of ... is ..., requiring ..., but workspace state is already ...`

The document was excluded from a build phase (for example `eagerLinking: false` or a custom `shouldLink` / `shouldValidate`), but an LSP request waits for that phase. Keep the phase enabled, or relax the requirement via `startLanguageServer(shared, { DefinitionProvider: DocumentState.ComputedScopes })`. See [lsp-features.md](lsp-features.md).

## 7. Performance

| Symptom | Fix |
| --- | --- |
| slow linking or completion | `getScope` runs per reference. Cache per document with `DocumentCache` or per workspace with `WorkspaceCache`; use `IndexManager.allElements(type)` (already cached) instead of walking documents. See [scoping.md](scoping.md) |
| slow validation | move expensive checks to `'slow'`; skip subtrees by overriding `DefaultDocumentValidator.validateSingleNodeOptions` (4.1+) |
| slow startup | generate with `langium generate --mode production` (or `"mode": "production"` in `langium-config.json`) to skip Chevrotain's grammar self-validation at runtime; restrict the scanned folders with `WorkspaceManager.getRootFolder` / `shouldIncludeEntry` |
| slow parsing of large files | profile first; for Node servers, `WorkerThreadAsyncParser` from `langium/node` parses off the main thread. Setting `maxLookahead` (LL(k)) can be faster than LL(\*) but turns ambiguities into generation errors |
| unknown hotspot | register `profilers: { LangiumProfiler: () => new DefaultLangiumProfiler() }` in the shared module (4.1+); it prints timings for parsing, linking, and validation per node type |

See [the caches recipe](https://langium.org/docs/recipes/performance/caches/).

## 8. Dependencies and versions

### Type errors or odd LSP behavior after upgrading to 4.3 or later

**Symptoms:** `Type 'Connection' is not assignable to type 'Connection'`, `Types have separate declarations of a private property`, or protocol mismatches in the editor.

**Cause:** your project pins an older `vscode-languageserver` (9.x) while Langium 4.3+ depends on 10.x, so two copies are installed.

**Fix:** match the ranges in `node_modules/langium/package.json` in your own `package.json` files (`npm ls vscode-languageserver` shows duplicates). For reference:

| Langium | `vscode-languageserver` | `vscode-languageserver-protocol` | `vscode-languageserver-types` | extension `vscode-languageclient` |
| --- | --- | --- | --- | --- |
| 4.0 to 4.2 | `~9.0.1` | `~3.17.5` (4.2) | `~3.17.5` (4.2) | `~9.0.1` |
| 4.3 | `~10.0.0` | `~3.18.0` | `~3.18.0` | `~10.0.0` |
| 4.4 | `~10.1.0` | `~3.18.2` | `~3.18.0` | `~10.1.0` |

The `generator-langium` templates pin matching `vscode-languageserver` and `vscode-languageclient` versions for each release; compare your `package.json` files with them.

### Generated code doesn't compile after upgrading

`langium-cli` and `langium` differ in version. Upgrade both together and regenerate.

## 9. 4.x version notes

Only changes within 4.x that affect user code. Check the installed version in `node_modules/langium/package.json`.

**4.1**

- Profiler service: `DefaultLangiumProfiler`, registered as `profilers.LangiumProfiler` in the shared module.
- `startLanguageServer(shared, serviceRequirements)` accepts per-feature document state requirements.
- `DefaultDocumentValidator.validateSingleNodeOptions(node, options)` lets you skip validating nodes or subtrees.
- `CrossReferencesOfAstNodeType` includes multi-references.
- 4.1.3 fixed the return type of `infix` rules: regenerate.

**4.2**

- `DefaultWorkspaceManager.loadWorkspaceDocuments(uris, collector)` is overridable for custom initial loading.
- `LangiumDocuments#invalidateDocument` is deprecated: use `DocumentBuilder.resetToState(document, DocumentState.Changed)`.
- `ValidationCategory.all` is deprecated: use `ValidationCategory.defaults`.
- Chevrotain 11.1 (4.2.2: Chevrotain 12).

**4.3**

- LSP 3.18. Requires `vscode-languageserver ~10.0.0`, `vscode-languageserver-protocol ~3.18.0`, `vscode-languageserver-types ~3.18.0` (section 8).
- `AstReflection.isComplete(node)`. Generated reflection now carries `optional` property metadata: regenerate so `isComplete` works.

**4.4**

- `vscode-languageserver ~10.1.0`, `vscode-languageserver-protocol ~3.18.2`.
- `TextDocumentContentProvider` shared LSP service (`DefaultTextDocumentContentProvider` from `langium/lsp`) implements `workspace/textDocumentContent`, for example to show builtin library documents.
- The default completion provider supports both insert and replace modes; custom completion code that builds text edits should be checked.
- `CstNode#root` is derived instead of stored, and `CompositeCstNode#content` is readonly. Code that modified the CST must use the `CstNodeBuilder`.
- LSP requests read the workspace with `ReadPriority.Immediate` after waiting for their required state; custom handlers using `WorkspaceLock.read` may pass a `ReadPriority`.
- `assertCondition`, `assertUnreachable`, and `ErrorWithLocation` accept lazily computed messages (`() => string`).
- Chevrotain 13.

Source: [Langium CHANGELOG](https://github.com/eclipse-langium/langium/blob/main/packages/langium/CHANGELOG.md).

## Source and examples

- Messages: `node_modules/langium/src/dependency-injection.ts` (DI), `node_modules/langium/src/references/linker.ts` (linking), `node_modules/langium/src/validation/validation-registry.ts` and `document-validator.ts` (validation), `node_modules/langium/src/grammar/validation/validator.ts` (grammar), `node_modules/langium/src/parser/langium-parser.ts` (parser messages, lookahead strategy), `node_modules/langium-cli/src/parser-validation.ts` (generation)
- Rebuild logic: `node_modules/langium/src/workspace/document-builder.ts`; workspace scanning: `node_modules/langium/src/workspace/workspace-manager.ts`
- Default LSP providers: `node_modules/langium/src/lsp/default-lsp-module.ts`; capabilities: `node_modules/langium/src/lsp/language-server.ts`
- Examples: [domainmodel](https://github.com/eclipse-langium/langium/tree/main/examples/domainmodel) (scoping, formatter, builtin library), [arithmetics](https://github.com/eclipse-langium/langium/tree/main/examples/arithmetics) (infix, code actions)
- Docs: [Grammar language](https://langium.org/docs/reference/grammar-language/), [Configuration via services](https://langium.org/docs/reference/configuration-services/), [Document lifecycle](https://langium.org/docs/reference/document-lifecycle/)
