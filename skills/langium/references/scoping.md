# Scoping and linking

**When to read this:** a cross-reference doesn't resolve or resolves to the wrong element, or you need to add qualified names, imports, member access (`a.b.c`), a builtin library, case-insensitive names, or multi-references.

## Contents

1. [What you get by default](#what-you-get-by-default)
2. [Choosing the extension point](#choosing-the-extension-point)
3. Recipes: [name property](#recipe-use-a-property-other-than-name), [qualified names](#recipe-qualified-names), [import and export](#recipe-file-based-import-and-export), [member access](#recipe-member-access-abc), [builtin library](#recipe-builtin-library), [case-insensitive](#recipe-case-insensitive-references), [caching](#recipe-cache-expensive-scopes), [multi-references](#recipe-multi-references), [find declarations](#recipe-find-the-declarations-at-a-position)
4. [Best practices](#best-practices), [Pitfalls](#pitfalls), [Source and examples](#source-and-examples)

## What you get by default

- **Names.** `DefaultNameProvider` treats any node with a string `name` property as named. Unnamed nodes can't be referenced.
- **Exports** (`ScopeComputation.collectExportedSymbols`, `IndexedContent` phase). The root node and its **direct children** that have a name go into the global index. They are visible from every document in the workspace. Nested nodes are not exported.
- **Local symbols** (`ScopeComputation.collectLocalSymbols`, `ComputedScopes` phase). Every named node is registered under its container and stored in `document.localSymbols`.
- **Lookup** (`ScopeProvider.getScope`). Starting at the node that holds the reference, walk up the `$container` chain. At each level take the local symbols filtered to the reference's target type. Inner levels shadow outer ones. The global index (also type filtered) is the outermost scope. So a reference sees its siblings, its ancestors' siblings, and all exports, but not things nested inside siblings.
- **Linking.** A single reference `[Type:ID]` takes the first match of `scope.getElement($refText)`. A multi-reference `[+Type:ID]` takes all matches of `scope.getElements($refText)`. The reference text is whatever the terminal or data type rule after `:` parsed (`ID` if omitted).

## Choosing the extension point

| You need | Override | Service key |
| --- | --- | --- |
| The name lives in another property, or is computed | `DefaultNameProvider` | `references.NameProvider` |
| Change what other files can see (export nested nodes, export under a qualified name, export only `export`-marked nodes) | `DefaultScopeComputation.collectExportedSymbols` / `addExportedSymbol` | `references.ScopeComputation` |
| Add extra names inside a document (relative qualified names, aliases) | `DefaultScopeComputation.addLocalSymbol` | `references.ScopeComputation` |
| Visibility depends on the reference's context or on other references (imports, member access, types) | `DefaultScopeProvider.getScope` / `getGlobalScope` | `references.ScopeProvider` |
| Symbols that exist without a user file (standard library) | `DefaultWorkspaceManager.loadAdditionalDocuments` | `workspace.WorkspaceManager` (shared) |

Recommendation: precompute in `ScopeComputation` whenever the answer depends only on the document's own AST. It runs once per document change, while `getScope` runs once per reference. Use `ScopeProvider` only for context-dependent visibility. Never resolve cross-references in `ScopeComputation` or `NameProvider`.

All recipes assume the usual module file (`src/language/<name>-module.ts`) created by `yo langium`, with a language module typed `Module<XServices, PartialLangiumServices & XAddedServices>` and a shared module injected into `createDefaultSharedModule(...)`. See [project-setup.md](project-setup.md) for module wiring.

## Recipe: use a property other than `name`

Simplest fix: rename the grammar property to `name`. If you can't, override both methods. `getNameNode` drives rename, go-to-definition highlighting, and find references.

```ts
import type { AstNode, CstNode } from 'langium';
import { DefaultNameProvider, GrammarUtils } from 'langium';
import { isPerson } from './generated/ast.js';

export class MyNameProvider extends DefaultNameProvider {
    override getName(node: AstNode): string | undefined {
        return isPerson(node) ? node.id : super.getName(node);
    }
    override getNameNode(node: AstNode): CstNode | undefined {
        return isPerson(node) ? GrammarUtils.findNodeForProperty(node.$cstNode, 'id') : super.getNameNode(node);
    }
}

// in the language module
references: {
    NameProvider: () => new MyNameProvider()
}
```

## Recipe: qualified names

Export every class under its fully qualified name, and make nested classes reachable by relative name inside enclosing packages. The reference must parse dots, so use a data type rule:

```langium
Package: 'package' name=QualifiedName '{' (classes+=Class | packages+=Package)* '}';
Class: 'class' name=ID ('extends' superClass=[Class:QualifiedName])? '{' fields+=Field* '}';
QualifiedName returns string: ID ('.' ID)*;
```

```ts
import type { AstNode, AstNodeDescription, LangiumDocument, MultiMap } from 'langium';
import { AstUtils, Cancellation, DefaultScopeComputation } from 'langium';
import { isClass, isPackage } from './generated/ast.js';

// build `outer.inner.Name` from the enclosing packages
export function qualifiedName(node: AstNode, name: string): string {
    let parent = node.$container;
    while (isPackage(parent)) {
        name = `${parent.name}.${name}`;
        parent = parent.$container;
    }
    return name;
}

export class MyScopeComputation extends DefaultScopeComputation {

    // visit the whole AST instead of only the root's direct children
    override async collectExportedSymbols(document: LangiumDocument, cancelToken = Cancellation.CancellationToken.None): Promise<AstNodeDescription[]> {
        return this.collectExportedSymbolsForNode(document.parseResult.value, document, AstUtils.streamAllContents, cancelToken);
    }

    // export classes only, under their fully qualified name
    protected override addExportedSymbol(node: AstNode, exports: AstNodeDescription[], document: LangiumDocument): void {
        if (isClass(node)) {
            exports.push(this.descriptions.createDescription(node, qualifiedName(node, node.name), document));
        }
    }

    // keep the default local symbols and add relative qualified names to enclosing containers
    protected override addLocalSymbol(node: AstNode, document: LangiumDocument, symbols: MultiMap<AstNode, AstNodeDescription>): void {
        super.addLocalSymbol(node, document, symbols);
        if (isClass(node)) {
            let name = node.name;
            let pkg = node.$container;
            while (isPackage(pkg)) {
                name = `${pkg.name}.${name}`;
                symbols.add(pkg.$container, this.descriptions.createDescription(node, name, document));
                pkg = pkg.$container;
            }
        }
    }
}

// in the language module
references: {
    ScopeComputation: (services) => new MyScopeComputation(services)
}
```

Result: `Point` inside its package, `inner.Deep` from the enclosing package, `geo.shapes.Point` from anywhere. Overriding the `addExportedSymbol` / `addLocalSymbol` hooks keeps the default behavior for every other node type. The domainmodel example does the same with a separate `QualifiedNameProvider` service.

## Recipe: file-based import and export

Only `export`-marked classes enter the index, and a document sees only exports of the files it imports.

```langium
entry Model: imports+=Import* (classes+=Class | variables+=Variable)*;
Import: 'import' path=STRING;
Class: published?='export'? 'class' name=ID '{' fields+=Field* '}';
```

```ts
import type { AstNodeDescription, LangiumDocument, ReferenceInfo, Scope } from 'langium';
import { AstUtils, DefaultScopeComputation, DefaultScopeProvider, UriUtils } from 'langium';
import type { Model } from './generated/ast.js';

export class MyScopeComputation extends DefaultScopeComputation {
    override async collectExportedSymbols(document: LangiumDocument): Promise<AstNodeDescription[]> {
        const model = document.parseResult.value as Model;
        const exports: AstNodeDescription[] = [];
        for (const cls of model.classes) {
            if (cls.published) {
                exports.push(this.descriptions.createDescription(cls, cls.name, document));
            }
        }
        return exports;
    }
}

export class MyScopeProvider extends DefaultScopeProvider {
    // the global scope only contains exports of the imported files
    protected override getGlobalScope(referenceType: string, context: ReferenceInfo): Scope {
        const document = AstUtils.getDocument(context.container);
        const model = document.parseResult.value as Model;
        const uris = new Set<string>();
        for (const imp of model.imports) {
            uris.add(UriUtils.resolvePath(UriUtils.dirname(document.uri), imp.path).toString());
        }
        return this.createScope(this.indexManager.allElements(referenceType, uris));
    }
}

// in the language module
references: {
    ScopeComputation: (services) => new MyScopeComputation(services),
    ScopeProvider: (services) => new MyScopeProvider(services)
}
```

Overriding `getGlobalScope` keeps local scoping intact. `UriUtils` works in the browser too, unlike `node:path`. Validate that each import path exists (see [validation.md](validation.md)). For per-symbol imports (`import { A as B } from "..."`), make the import element itself named and referenceable; the website recipe below shows that variant.

## Recipe: member access (`a.b.c`)

The members visible after a dot depend on the type of the receiver. Write the chain so that `receiver` is typed as the full expression union:

```langium
Expression: MemberAccess;
MemberAccess infers Expression:
    PrimaryExpression ({infer MemberAccess.receiver=current} '.' member=[Field:ID])*;
PrimaryExpression infers Expression:
    {infer VariableRef} variable=[Variable:ID];
Variable: 'var' name=ID ':' type=[Class:ID];
Class: 'class' name=ID ('extends' superClass=[Class:ID])? '{' fields+=Field* '}';
Field: name=ID ':' type=[Class:ID];
```

```ts
import type { ReferenceInfo, Scope } from 'langium';
import { DefaultScopeProvider, EMPTY_SCOPE } from 'langium';
import type { Class, Expression, Field } from './generated/ast.js';
import { isMemberAccess, isVariableRef, MemberAccess } from './generated/ast.js';

export class MyScopeProvider extends DefaultScopeProvider {

    override getScope(context: ReferenceInfo): Scope {
        if (isMemberAccess(context.container) && context.property === MemberAccess.member) {
            const cls = this.classOf(context.container.receiver);
            return cls ? this.createScopeForNodes(this.allFields(cls)) : EMPTY_SCOPE;
        }
        return super.getScope(context);
    }

    // resolving the receiver's references here is fine: they are different references
    protected classOf(expression: Expression): Class | undefined {
        if (isVariableRef(expression)) {
            return expression.variable.ref?.type.ref;
        }
        return expression.member.ref?.type.ref;
    }

    // own fields first, then inherited ones; guard against cyclic `extends`
    protected allFields(cls: Class): Field[] {
        const fields: Field[] = [];
        const visited = new Set<Class>();
        let current: Class | undefined = cls;
        while (current && !visited.has(current)) {
            visited.add(current);
            fields.push(...current.fields);
            current = current.superClass?.ref;
        }
        return fields;
    }
}

// in the language module
references: {
    ScopeProvider: (services) => new MyScopeProvider(services)
}
```

In a real language `classOf` is your type inference. Cache it (next recipes) because every member access recomputes the whole chain. Return `EMPTY_SCOPE` when the receiver type is unknown so you get one linking error, not a cascade of wrong links.

## Recipe: builtin library

Load in-memory documents at workspace startup so their exports are always in the global index. Based on `examples/domainmodel/src/language-server/domain-model-workspace-manager.ts`.

```ts
import type { LangiumDocument, LangiumDocumentFactory, WorkspaceFolder } from 'langium';
import { DefaultWorkspaceManager, URI } from 'langium';
import type { LangiumSharedServices } from 'langium/lsp';

export const builtinScheme = 'mydsl-builtin';

export class MyWorkspaceManager extends DefaultWorkspaceManager {

    protected readonly documentFactory: LangiumDocumentFactory;

    constructor(services: LangiumSharedServices) {
        super(services);
        this.documentFactory = services.workspace.LangiumDocumentFactory;
    }

    protected override async loadAdditionalDocuments(folders: WorkspaceFolder[], collector: (document: LangiumDocument) => void): Promise<void> {
        await super.loadAdditionalDocuments(folders, collector);
        // the path must end in one of the language's file extensions
        collector(this.documentFactory.fromString('class Object {}', URI.parse(`${builtinScheme}:///builtin.mydsl`)));
    }
}
```

Register it in the **shared** module and make sure that module is passed to `inject(createDefaultSharedModule(context), XGeneratedSharedModule, XSharedModule)`:

```ts
import type { Module } from 'langium';
import type { LangiumSharedServices, PartialLangiumSharedServices } from 'langium/lsp';
import { DefaultTextDocumentContentProvider } from 'langium/lsp';

export const MySharedModule: Module<LangiumSharedServices, PartialLangiumSharedServices> = {
    workspace: {
        WorkspaceManager: (services) => new MyWorkspaceManager(services)
    },
    lsp: {
        // 4.4+: lets the editor open builtin documents on go-to-definition
        TextDocumentContentProvider: (services) => new DefaultTextDocumentContentProvider(services, builtinScheme)
    }
};
```

On Langium 4.3 or older there is no `TextDocumentContentProvider`. Register a read-only `vscode.FileSystemProvider` for the scheme in the extension instead (see the website recipe). Add `{ scheme: builtinScheme, language: '<id>' }` to the client's `documentSelector` if you want hover and navigation inside the builtin file.

`loadAdditionalDocuments` runs only in `WorkspaceManager.initializeWorkspace`. The language server calls it on startup, but tests and CLIs must call it themselves: `await services.shared.workspace.WorkspaceManager.initializeWorkspace([])`.

## Recipe: case-insensitive references

`caseInsensitive: true` in `langium-config.json` only affects keywords. For names, pass `ScopeOptions.caseInsensitive` (adapted from `examples/arithmetics/src/language-server/arithmetics-scope-provider.ts`, which uses `MapScope` for the global scope):

```ts
import type { AstNodeDescription, Scope, ScopeOptions } from 'langium';
import { DefaultScopeProvider, MultiMapScope, stream, StreamScope } from 'langium';

export class MyScopeProvider extends DefaultScopeProvider {

    // local scopes built by the default getScope
    protected override createScope(elements: Iterable<AstNodeDescription>, outerScope?: Scope, options?: ScopeOptions): Scope {
        return new StreamScope(stream(elements), outerScope, { ...options, caseInsensitive: true });
    }

    // global scope, cached per type like the default
    protected override getGlobalScope(referenceType: string): Scope {
        return this.globalScopeCache.get(referenceType,
            () => new MultiMapScope(this.indexManager.allElements(referenceType), undefined, { caseInsensitive: true }));
    }
}
```

`createScopeForNodes` doesn't go through `createScope`, so pass the option there yourself. Prefer `MultiMapScope` over `MapScope` for the global scope: `MapScope` keeps only one element per name.

## Recipe: cache expensive scopes

`DefaultScopeProvider` already caches the global scope per type in a `WorkspaceCache`. Cache your own derived scopes the same way:

```ts
import type { LangiumCoreServices, LangiumDocument, ReferenceInfo, Scope } from 'langium';
import { AstUtils, DefaultScopeProvider, MultiMapScope, UriUtils, WorkspaceCache } from 'langium';
import type { Model } from './generated/ast.js';

export class MyScopeProvider extends DefaultScopeProvider {

    // cleared whenever any document in the workspace changes
    protected readonly importScopeCache: WorkspaceCache<string, Scope>;

    constructor(services: LangiumCoreServices) {
        super(services);
        this.importScopeCache = new WorkspaceCache(services.shared);
    }

    protected override getGlobalScope(referenceType: string, context: ReferenceInfo): Scope {
        const document = AstUtils.getDocument(context.container);
        return this.importScopeCache.get(`${document.uri.toString()}|${referenceType}`,
            () => new MultiMapScope(this.indexManager.allElements(referenceType, this.importedUris(document))));
    }

    // same URI computation as in the import recipe
    protected importedUris(document: LangiumDocument): Set<string> {
        const uris = new Set<string>();
        for (const imp of (document.parseResult.value as Model).imports) {
            uris.add(UriUtils.resolvePath(UriUtils.dirname(document.uri), imp.path).toString());
        }
        return uris;
    }
}
```

Pick the cache by what the value depends on:

- `WorkspaceCache` (cleared on any change): anything built from the index, other documents, or resolved references. This is the safe default.
- `DocumentCache` (cleared when that document changes): only values derived from one document's own AST, keyed by its URI.

Both constructors take an optional `DocumentState` to clear in a later build phase instead of on update.

## Recipe: multi-references

`[+Type:ID]` links to **all** elements with that name (interface merging, partial classes). The property type becomes `MultiReference<Type>`:

```langium
Entity: 'entity' name=ID ('extends' superType=[+Entity:QualifiedName])? '{' features+=Feature* '}';
```

```ts
// all targets; `items` is empty and `error` is set if nothing matched
const supers = entity.superType?.items.map(item => item.ref) ?? [];
```

- The linker collects matches from every scope level (local, outer, global) and removes duplicates. To stop at the innermost level that has a match, create scopes with `concatOuterScope: false` (override `createScope` as in the case-insensitive recipe). `MapScope` honors this flag correctly only from 4.4.
- Use `MultiMapScope` or `StreamScope` for custom scopes. `MapScope` keeps one element per name.
- Use `isReference` / `isMultiReference` from `langium` when code handles both kinds.

## Recipe: find the declarations at a position

Get the leaf with `CstUtils.findDeclarationNodeAtOffset(root.$cstNode, offset, services.parser.GrammarConfig.nameRegexp)`, then call `services.references.References.findDeclarations(leaf)`. It returns an array: one entry per target, several for multi-references, and the node itself when the cursor is on its name. `findDeclarationNodes` returns the name CST nodes instead, which is what go to definition uses.

## Best practices

- Start with the defaults and change one service at a time. Write a `langium/test` test per scoping rule (see [testing.md](testing.md)); parse the referenced document before the referencing one.
- Extend `DefaultScopeComputation` / `DefaultScopeProvider` and override the narrowest hook (`addExportedSymbol`, `addLocalSymbol`, `getGlobalScope`, `createScope`) instead of reimplementing `getScope`.
- In `getScope`, match on `context.container` with generated guards and on `context.property` with the generated constants (`MemberAccess.member`), then fall back to `super.getScope(context)`.
- Keep custom scopes type correct: use `this.indexManager.allElements(referenceType, ...)` or filter with `this.reflection.isSubtype(desc.type, this.reflection.getReferenceType(context))`.
- Report duplicate names with a validator ([validation.md](validation.md)). A single reference silently picks the first match.
- Prefer exporting qualified names over member scoping when names are static. Index lookups are cheap; member scoping runs per reference and needs caching.

## Pitfalls

| Symptom | Cause and fix |
| --- | --- |
| "Could not resolve reference" for an element in another file | The target is nested, and only the root's direct children are exported. Export it in `collectExportedSymbols` (qualified names recipe) |
| Reference to `a.b.C` fails, but `C` works | The reference uses `[Type:ID]`, which can't contain dots. Use `[Type:QualifiedName]` with a `returns string` data type rule. The exported name must equal the reference text exactly |
| After overriding `collectLocalSymbols`, unrelated references break | The override registered only some node types. Override `addLocalSymbol` and call `super`, or reproduce the default for all named nodes |
| References resolve to `undefined` or to the wrong target, or multi-references report bogus linking errors | Code in `collectExportedSymbols`, `collectLocalSymbols`, or `NameProvider` reads `.ref` / `.items`. Scopes aren't ready yet; single references are retried later, but a multi-reference caches the error and a single reference can bind to a global element before local symbols exist. Compute from AST and `$refText` only |
| `Cyclic reference resolution detected: <path>/<property>` | Resolving a reference triggered resolution of the same reference, usually a `getScope` or type inference that reads the reference being linked (for example `context.reference.ref`, or a type chain that loops back). Only resolve other references, and add a visited set for recursive structures |
| A custom scope links to a node of the wrong type | The scope wasn't filtered by the reference type. The linker doesn't check types. Filter as shown in best practices |
| Names still case-sensitive although `caseInsensitive: true` | That option only affects keywords. Use the case-insensitive recipe |
| A CLI reports unresolved references to other files that the editor resolves | The CLI loaded only the one file. Call `await services.shared.workspace.WorkspaceManager.initializeWorkspace([{ name, uri: URI.file(root).toString() }])` before building it, as `setRootFolder` does in `examples/domainmodel/src/cli/cli-util.ts` |
| Builtin symbols missing in tests or the CLI | `initializeWorkspace` was never called, so `loadAdditionalDocuments` didn't run |
| `The service registry contains no services for the extension ''` | A builtin or generated document URI doesn't end in a registered file extension |
| Files in the workspace are never indexed | Their extension isn't in `fileExtensions` / `fileNames` of `langium-config.json`, or they are under `node_modules`, `out`, or a dot folder (`WorkspaceManager.shouldIncludeEntry`). Override `shouldIncludeEntry` or `getRootFolder` to change this |
| Cross-file test fails although the editor works | `parseHelper` builds only the new document. Parse dependencies first, or build all documents together with `DocumentBuilder.build(docs)` |
| Completion is slow, or typing lags | `getScope` walks the AST or the whole index per call. Precompute in `ScopeComputation` or cache (cache recipe) |

For a broader symptom list see [troubleshooting.md](troubleshooting.md).

## Source and examples

- `node_modules/langium/src/references/scope-computation.ts` (`DefaultScopeComputation`, hooks `addExportedSymbol`, `addLocalSymbol`, `collectExportedSymbolsForNode`)
- `node_modules/langium/src/references/scope-provider.ts` (`DefaultScopeProvider`, `createScope`, `createScopeForNodes`, `getGlobalScope`)
- `node_modules/langium/src/references/scope.ts` (`StreamScope`, `MapScope`, `MultiMapScope`, `ScopeOptions`, `EMPTY_SCOPE`)
- `node_modules/langium/src/references/name-provider.ts`, `references/linker.ts`, `references/references.ts`
- `node_modules/langium/src/workspace/workspace-manager.ts`, `workspace/index-manager.ts`, `utils/caching.ts`
- [examples/domainmodel](https://github.com/eclipse-langium/langium/tree/main/examples/domainmodel/src/language-server): `domain-model-scope.ts`, `domain-model-naming.ts`, `domain-model-workspace-manager.ts`, `domain-model-module.ts` (qualified names, multi-reference `superType`, builtin library)
- [examples/arithmetics](https://github.com/eclipse-langium/langium/tree/main/examples/arithmetics/src/language-server): `arithmetics-scope-provider.ts` (case-insensitive)
- Website recipes (4.1, use the 4.x names above): [scoping overview](https://langium.org/docs/recipes/scoping/), [qualified names](https://langium.org/docs/recipes/scoping/qualified-name/), [class members](https://langium.org/docs/recipes/scoping/class-member/), [file-based](https://langium.org/docs/recipes/scoping/file-based/), [builtin library](https://langium.org/docs/recipes/builtin-library/)
