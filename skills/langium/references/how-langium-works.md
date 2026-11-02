# How Langium Works (for Debugging and Choosing Extension Points)

## When to read this

Read this when you need to know *when* something runs, *which* service to override, or *why* data is missing at a certain point (unresolved references, empty `localSymbols`, missing diagnostics, DI errors). For task recipes, go to the topic references instead. For symptom lookups, start with [troubleshooting.md](troubleshooting.md).

## Contents

1. [Document lifecycle](#1-document-lifecycle)
2. [Hooking into the lifecycle](#2-hooking-into-the-lifecycle)
3. [What triggers rebuilds and relinking](#3-what-triggers-rebuilds-and-relinking)
4. [Dependency injection essentials](#4-dependency-injection-essentials)
5. [Generated code you work with](#5-generated-code-you-work-with)
6. [AST, CST, and reference shapes](#6-ast-cst-and-reference-shapes)
7. [Error recovery and partial ASTs](#7-error-recovery-and-partial-asts)
8. [Utilities: use these instead of hand-rolled tree walks](#8-utilities-use-these-instead-of-hand-rolled-tree-walks)
9. [Pitfalls](#9-pitfalls)
10. [Source and examples](#10-source-and-examples)

## 1. Document lifecycle

Every `LangiumDocument` moves through the `DocumentState` values below. The `DocumentBuilder` (shared service) runs each phase **for all documents in the batch** before starting the next phase. That lockstep is why exported symbols of every document are available when any document is linked.

| State (value) | Reached after | What you can rely on from here on | Override to change it |
| --- | --- | --- | --- |
| `Changed` (0) | text changed or document reset | nothing; the AST is stale | n/a |
| `Parsed` (1) | lexing and parsing (`LangiumDocumentFactory.update`, `parser.AsyncParser`) | AST and CST exist, `parseResult.lexerErrors` / `parserErrors` are set. References **cannot** be resolved. Last safe point to mutate the AST | grammar, `parser.TokenBuilder`, `parser.Lexer`, `parser.ValueConverter` |
| `IndexedContent` (2) | `IndexManager.updateContent` calls `ScopeComputation.collectExportedSymbols` | this document's exported symbols are in the global index and visible to other documents | `references.ScopeComputation`, `references.NameProvider`, `workspace.AstNodeDescriptionProvider` |
| `ComputedScopes` (3) | `ScopeComputation.collectLocalSymbols` | `document.localSymbols` is set; accessing `.ref` now resolves lazily | `references.ScopeComputation` |
| `Linked` (4) | `Linker.link` (only if `eagerLinking` is not `false`) | every reference has `.ref` / `.items` or `.error`; `document.references` is filled | `references.ScopeProvider`, `references.Linker` |
| `IndexedReferences` (5) | `IndexManager.updateReferences` (skipped together with linking) | reference index updated; find references, rename, and change tracking work | `workspace.ReferenceDescriptionProvider` |
| `Validated` (6) | `DocumentValidator.validateDocument` (only if `validation` is requested) | `document.diagnostics` is set; the language server publishes it | `validation.ValidationRegistry` checks, `validation.DocumentValidator` |

Build options (`BuildOptions` passed to `DocumentBuilder.build`) control the optional phases:

- `eagerLinking: false` skips **both** linking and reference indexing. References still resolve lazily on access, but you get no linking diagnostics and the document is ignored for change tracking.
- `validation`: `true` runs all categories (including `slow` and custom ones). An object `{ categories: [...] }` runs only those. `false` or unset skips validation entirely.

Defaults that matter:

- **The initial workspace build does not validate.** `DefaultWorkspaceManager.initialBuildOptions` is `{}`. Documents stop at `IndexedReferences`. The first later `update()` (any file opened or changed in the editor) validates every document that has not reached `Validated`.
- **Updates validate only `built-in` and `fast`.** `DefaultDocumentBuilder.updateBuildOptions` is `{ validation: { categories: ['built-in', 'fast'] } }`. Nothing schedules `slow` checks; see [validation.md](validation.md).
- **Parsing is skipped when the text is unchanged.** `update` only reparses if the new text differs from the CST's full text.

To validate the whole workspace at startup, set the option once while creating services:

```ts
// in create<Lang>Services(), after inject(...)
shared.workspace.WorkspaceManager.initialBuildOptions = { validation: true };
```

In a CLI or script nothing runs the workspace manager. Build explicitly with `DocumentBuilder.build([document], { validation: true })`; see the headless recipe in [project-setup.md](project-setup.md#headless-services-for-clis-and-libraries).

## 2. Hooking into the lifecycle

All hooks live on `shared.workspace.DocumentBuilder` and return a `Disposable`.

| API | Fires | Use for |
| --- | --- | --- |
| `onUpdate((changed, deleted) => ...)` | when an update starts, before any rebuild | clearing your own caches (keep it fast) |
| `onDocumentPhase(state, (document, cancelToken) => ...)` | each time one document reaches `state` | per-document post-processing; fires even if the batch is later canceled |
| `onBuildPhase(state, (documents, cancelToken) => ...)` | once per batch when all its documents reached `state` | workspace-wide work, such as cross-file analysis after `Validated` |
| `waitUntil(state, cancelToken?)` | resolves when the builder reached `state` for the current build | waiting for the workspace |
| `waitUntil(state, uri?, cancelToken?)` | resolves with the URI when that document reached `state` | waiting for one document (custom LSP requests, tests) |

```ts
import { DocumentState } from 'langium';

// in create<Lang>Services(), after inject(...)
shared.workspace.DocumentBuilder.onBuildPhase(DocumentState.Validated, async (documents, cancelToken) => {
    for (const document of documents) {
        // workspace-wide post-processing, e.g. export a model
    }
});
```

Register listeners in `create<Lang>Services` or in the constructor of a service that is guaranteed to be instantiated (see laziness in section 4). For caches, prefer `DocumentCache` / `WorkspaceCache` from `langium` over hand-written `onUpdate` listeners; they already clear themselves at the right time.

LSP requests also wait for a state before running (for example completion and go to definition wait for `Linked` on the document, find references and rename wait for the whole workspace at `IndexedReferences`). The full table and how to change it via `startLanguageServer(shared, serviceRequirements)` is in [lsp-features.md](lsp-features.md). Execute command and `workspace/textDocumentContent` handlers do **not** wait; call `await DocumentBuilder.waitUntil(DocumentState.Validated, uri, cancelToken)` yourself before reading a document there.

## 3. What triggers rebuilds and relinking

`DocumentBuilder.update(changed, deleted)` runs on every editor change and file-watcher event (inside `WorkspaceLock.write`, so a new edit cancels the running build):

1. Deleted documents are removed from the index.
2. Changed documents are reset to `Changed` (full rebuild).
3. Every other document is reset to `ComputedScopes` (relink and revalidate, no reparse) if `shouldRelink` returns true: it **has any linking error**, or `IndexManager.isAffected` finds a non-local reference into a changed or deleted document.
4. All documents below `Validated` (or with an incomplete previous build) are rebuilt, open editor documents first.

Consequence for custom scoping: if your resolution depends on something that is not a resolved cross-reference (for example an `import "file"` string, or a closer declaration being added in another file while the reference already resolves elsewhere), the dependent document is **not** relinked. Fix it by overriding `DefaultDocumentBuilder.shouldRelink` or `DefaultIndexManager.isAffected` to also consider your dependency. See [scoping.md](scoping.md).

To force a document to rebuild from your own code, use `DocumentBuilder.resetToState(document, DocumentState.Changed)` (since 4.2; `LangiumDocuments#invalidateDocument` is deprecated) or call `update([uri], [])`.

## 4. Dependency injection essentials

A `Module<I, T>` is a nested object whose leaves are factories `(services: I) => T[K]`. `inject(m1, m2, ...)` (up to 9 modules) deep-merges the modules from left to right, so **later modules override earlier ones**, and returns a proxy container. The canonical wiring (default, generated, then your modules, shared and language containers) is in [project-setup.md](project-setup.md#wire-services-for-a-language-server). Use `createDefaultModule` / `createDefaultSharedModule` from `langium/lsp` for anything with an editor, and the `Core` variants from `langium` only for headless use without LSP services.

What you need to know to debug it:

- **Services are lazy.** A factory runs on first property access and the instance is cached. The language server calls `eagerLoad` on all services at `initialize`, but CLIs and tests do not. A service that only registers listeners in its constructor never runs there unless something accesses it. Access it in `create<Lang>Services` or call `eagerLoad(services)` from `langium`.
- **Overrides must sit in the right layer.** Shared services (`workspace.WorkspaceManager`, `workspace.DocumentBuilder`, `workspace.IndexManager`, `lsp.ExecuteCommandHandler`, ...) go into the module passed to the *shared* `inject`. Putting them into the language module adds an unused property and the override silently does nothing.
- **`Module.merge(m1, m2)`** combines two modules into a new one (deep copy of `m1` with `m2` on top). Use it to build reusable module bundles; `createDefaultModule` itself is `Module.merge(createDefaultCoreModule(...), createDefaultLSPModule(...))`.
- **Cycle errors.** If service A's constructor reads service B and B's constructor reads A, the second access throws:

  ```text
  Cycle detected. Please make "ScopeProvider" lazy. Visit https://langium.org/docs/reference/configuration-services/#resolving-cyclic-dependencies
  ```

  Fix: on one side, store a getter instead of the instance and call it where you need it. Langium does the same internally (`DefaultDocumentBuilder` holds `() => services.workspace.WorkspaceManager`).

  ```ts
  export class MyLangScopeProvider extends DefaultScopeProvider {
      // MyLangTypeInference is a custom service that itself depends on the ScopeProvider
      protected readonly typeInference: () => MyLangTypeInference;

      constructor(services: MyLangServices) {
          super(services);
          // resolved on first use, not during construction
          this.typeInference = () => services.typing.TypeInference;
      }
  }
  ```

- **`Construction failure. Please make sure that your dependencies are constructable. Cause: ...`** means a factory threw on an earlier access. The `Cause` is the real error; fix that constructor.

## 5. Generated code you work with

`langium generate` writes `src/language/generated/` (path set by `out` in `langium-config.json`). Never edit these files; regenerate after every grammar change. For each rule or declared type, `ast.ts` contains:

```ts
export interface Entity extends langium.AstNode {
    readonly $container: Domainmodel | PackageDeclaration;   // typed container
    readonly $type: 'Entity';
    features: Array<Feature>;
    name: string;
    superType?: langium.MultiReference<Entity>;
}
export const Entity = { $type: 'Entity', features: 'features', name: 'name', superType: 'superType' } as const;
export function isEntity(item: unknown): item is Entity { ... }
```

Use them like this:

- **Type guards** (`isEntity(node)`) for narrowing. They use the reflection, so they match subtypes too. Prefer them over `node.$type === 'Entity'`, which misses subtypes.
- **`Entity.$type`** instead of string literals when comparing types or calling `reflection.isInstance(node, Entity.$type)`.
- **Property constants** (`Entity.name`) for `DiagnosticInfo.property`, `findNodeForProperty`, and formatter selections, so renames in the grammar break the build instead of silently mismatching.
- **`<Lang>AstType`** maps type names to interfaces. Use it for `ValidationChecks<MyLangAstType>` so check keys are type checked.
- **`<Lang>TerminalNames`, `<Lang>KeywordNames`, `<Lang>TokenNames`** are string unions useful in custom token builders and semantic token providers.
- **`reflection`** is an exported singleton of `<Lang>AstReflection`. The same instance is also available as `services.shared.AstReflection` (in multi-language projects this is the combined reflection; see [multi-language.md](multi-language.md)).

`AstReflection` methods worth knowing:

| Method | Note |
| --- | --- |
| `isInstance(node, type)` / `isSubtype(sub, super)` | hierarchy checks, cached |
| `getAllSubTypes(type)` | includes **the type itself** and abstract/union types, not just concrete ones. Validation checks registered for a supertype run for all of these |
| `getAllTypes()` | every type name |
| `getTypeMetaData(type)` | properties with `defaultValue`, `optional`, `referenceType` |
| `isComplete(node)` (4.3+) | `false` if a non-optional property is `undefined` or `null`; use it to guard code against partial ASTs (section 7) |

`module.ts` provides `<Lang>LanguageMetaData` (language id, file extensions, `caseInsensitive`, `mode`), an optional `ParserConfig` (from `chevrotainParserConfig`), `<Lang>GeneratedSharedModule` (the `AstReflection`), and one `<Grammar>GeneratedModule` per language (`Grammar`, `LanguageMetaData`, `parser.ParserConfig`). `grammar.ts` holds the serialized grammar; you never need to read it.

## 6. AST, CST, and reference shapes

```ts
interface AstNode {
    readonly $type: string;
    readonly $container?: AstNode;          // undefined only on the root
    readonly $containerProperty?: string;
    readonly $containerIndex?: number;      // set when the container property is an array
    readonly $cstNode?: CstNode;            // undefined for nodes created in code
    readonly $document?: LangiumDocument;   // only on the root; use AstUtils.getDocument(node)
}

interface Reference<T extends AstNode = AstNode> {        // grammar: [Type] or [Type:Rule]
    readonly ref: T | undefined;                          // resolves lazily on first access
    readonly error?: LinkingError;
    readonly $refText: string;
    readonly $refNode?: CstNode;
    readonly $nodeDescription?: AstNodeDescription;
}

interface MultiReference<T extends AstNode = AstNode> {   // grammar: [+Type] or [+Type:Rule]
    readonly items: Array<{ ref: T, $nodeDescription?: AstNodeDescription }>;  // empty plus error if nothing found
    readonly error?: LinkingError;
    readonly $refText: string;
    readonly $refNode?: CstNode;
}
```

A `MultiReference` has no `ref`. Use `isReference` / `isMultiReference` or `AstUtils.getReferenceNodes(reference)`, which returns the targets of either kind as an array. Multi-references resolve through `Linker.getCandidates`, which returns every element of `scope.getElements(name)`.

`CstNode` exposes `text`, `range`, `offset`, `end`, `length`, `astNode`, `grammarSource`, `hidden`, `container`, and `root`. `CompositeCstNode#content` holds children, `LeafCstNode#tokenType` the token. Since 4.4, `root` is derived and `content` is readonly. Do not mutate the CST.

`AstNodeDescription` (what scopes contain) has required `name`, `type`, `documentUri`, `path`, and optional `node`, `nameSegment`, `selectionSegment`. Only local descriptions carry `node`; for others the linker loads the node from `documentUri` and `path` (format `/elements@2/features@0`).

## 7. Error recovery and partial ASTs

Chevrotain recovers from syntax errors by inserting or skipping tokens, so you usually get an AST even for broken input. It is **partial**: properties of the declared type can be missing at runtime. The parser fills only properties with a default (arrays become `[]`, `?=` booleans become `false`); a `name: string` can still be `undefined`.

Rules for code that reads the AST (validators, scope providers, generators, LSP providers):

- Never assume a non-optional property is present while the document has parser errors. Guard with optional chaining, or check `reflection.isComplete(node)` (4.3+).
- An exception in a validation check is caught and reported as an error diagnostic `An error occurred during validation: <message>`; an exception during linking becomes the linking error `An error occurred while resolving reference to '<name>': <message>`. Either message in the editor means your code crashed on a partial AST.
- Generators should refuse to run on documents with errors (check `parseResult.lexerErrors`, `parseResult.parserErrors`, and error diagnostics first). See [code-generation.md](code-generation.md).
- The default formatter returns no edits for a document with lexer or parser errors.

## 8. Utilities: use these instead of hand-rolled tree walks

All are exported from `langium`.

| Need | Use |
| --- | --- |
| all nodes below (and including) a root | `AstUtils.streamAst(root)`; `streamAllContents(root)` excludes the root; `streamContents(node)` gives direct children only |
| skip a subtree during a walk | `const it = AstUtils.streamAst(root).iterator();` then `it.prune()` |
| nearest ancestor of a type | `AstUtils.getContainerOfType(node, isEntity)` |
| the document or root of a node | `AstUtils.getDocument(node)` (throws `AST node has no document.` for detached nodes), `AstUtils.findRootNode(node)` |
| all references in a node | `AstUtils.streamReferences(node)` yields `ReferenceInfo` |
| targets of a `Reference` or `MultiReference` | `AstUtils.getReferenceNodes(reference)` |
| CST node of a property or keyword | `GrammarUtils.findNodeForProperty(node.$cstNode, Entity.name)`, `GrammarUtils.findNodeForKeyword(node.$cstNode, 'entity')` (plural variants return all) |
| leaf at a cursor offset | `CstUtils.findLeafNodeAtOffset(rootCst, offset)`, `CstUtils.findDeclarationNodeAtOffset(...)` |
| range helpers | `CstUtils.toDocumentSegment`, `CstUtils.inRange`, `CstUtils.getPreviousNode` / `getNextNode` |
| lazy collections | `Stream` (`stream(iterable)`): `filter`, `map`, `flatMap`, `find`, `head`, `distinct`, `toArray`, `toSet`, `toMap`; evaluated on demand |
| URI handling | `UriUtils.equals`, `relative`, `joinPath`, `resolvePath`, `dirname`, `basename`, `extname`, `contains`; `URI` is re-exported |
| AST to JSON and back | `services.serializer.JsonSerializer.serialize(node, { space: 2, refText: true })`, `.deserialize(json)` |
| caching across builds | `DocumentCache` (per document) and `WorkspaceCache` (cleared on any change), constructed with `services.shared` |

```ts
import { AstUtils, GrammarUtils } from 'langium';
import { Entity, isEntity, isPackageDeclaration } from './generated/ast.js';

// all entities in a document, wherever they are nested
const entities = AstUtils.streamAst(document.parseResult.value).filter(isEntity).toArray();

// the enclosing package of a node, if any
const pkg = AstUtils.getContainerOfType(node, isPackageDeclaration);

// the CST node of an entity's name, e.g. for a custom diagnostic range
const nameNode = GrammarUtils.findNodeForProperty(entity.$cstNode, Entity.name);
```

## 9. Pitfalls

| Symptom | Cause and fix |
| --- | --- |
| Console warning `Attempted reference resolution before document reached ComputedScopes state (...)` | Code accessed `.ref` during parsing or symbol collection. Never resolve references in `collectExportedSymbols` / `collectLocalSymbols` or in `Parsed` listeners |
| Diagnostics for unopened files appear only after the first edit | Initial build doesn't validate. Set `initialBuildOptions = { validation: true }` (section 1) |
| `document.diagnostics` is `undefined` in a CLI or test | `build` was called without `{ validation: true }` |
| A listener or service never fires outside the editor | DI laziness. Access the service or `eagerLoad` it |
| Override has no effect | Wrong DI layer (shared vs language), module order in `inject`, or a stale build. See [troubleshooting.md](troubleshooting.md) |
| Edits to `generated/` disappear | They are overwritten on every `langium generate`. Put code next to it, not in it |
| A dependent file keeps a stale reference target | Not relinked because the dependency is not a resolved reference. Override `shouldRelink` / `isAffected` (section 3) |

## 10. Source and examples

- Lifecycle: `node_modules/langium/src/workspace/documents.ts` (`DocumentState`, `DefaultLangiumDocumentFactory`), `node_modules/langium/src/workspace/document-builder.ts` (`DefaultDocumentBuilder`, `BuildOptions`), `node_modules/langium/src/workspace/workspace-manager.ts`, `node_modules/langium/src/workspace/index-manager.ts`
- DI: `node_modules/langium/src/dependency-injection.ts`, `node_modules/langium/src/default-module.ts`, `node_modules/langium/src/lsp/default-lsp-module.ts`, `node_modules/langium/src/services.ts`
- AST types and reflection: `node_modules/langium/src/syntax-tree.ts`; linking: `node_modules/langium/src/references/linker.ts`
- Utilities: `node_modules/langium/src/utils/ast-utils.ts`, `cst-utils.ts`, `grammar-utils.ts`, `stream.ts`, `uri-utils.ts`, `caching.ts`; `node_modules/langium/src/serializer/json-serializer.ts`
- Examples: [domainmodel module wiring](https://github.com/eclipse-langium/langium/tree/main/examples/domainmodel/src/language-server/domain-model-module.ts), [domainmodel generated code](https://github.com/eclipse-langium/langium/tree/main/examples/domainmodel/src/language-server/generated)
- Docs: [Document lifecycle](https://langium.org/docs/reference/document-lifecycle/), [Configuration via services](https://langium.org/docs/reference/configuration-services/), [Caches](https://langium.org/docs/recipes/performance/caches/)
