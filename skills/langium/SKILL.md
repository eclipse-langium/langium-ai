---
name: langium
description: A comprehensive skill to understanding how Langium-based projects work — from grammar definition through code generation, runtime parsing, linking, validation, and LSP integration
user-invocable: false
---

# Langium SKILL.md

A comprehensive guide to understanding how Langium-based projects work — from grammar definition through code generation, runtime parsing, linking, validation, and LSP integration. Reading this document should make an agent fully proficient at navigating, debugging, and extending any Langium DSL project.

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [The Grammar Language](#2-the-grammar-language)
3. [Code Generation (Build Time)](#3-code-generation-build-time)
4. [Dependency Injection System](#4-dependency-injection-system)
5. [Lexing](#5-lexing)
6. [Parsing: Tokens → CST → AST](#6-parsing-tokens--cst--ast)
7. [The Document Lifecycle (DocumentState Pipeline)](#7-the-document-lifecycle-documentstate-pipeline)
8. [Scope Computation](#8-scope-computation)
9. [Scope Provider and Name Resolution](#9-scope-provider-and-name-resolution)
10. [Linking and Cross-Reference Resolution](#10-linking-and-cross-reference-resolution)
11. [Validation](#11-validation)
12. [Workspace Management](#12-workspace-management)
13. [LSP Integration](#13-lsp-integration)
14. [Common Customization Patterns](#14-common-customization-patterns)
15. [End-to-End Runtime Flow](#15-end-to-end-runtime-flow)

---

## 1. High-Level Architecture

Langium is a language engineering framework that takes a `.langium` grammar file and produces a fully operational TypeScript-based DSL toolkit with LSP support. The architecture has two major phases:

**Build time** — `langium-cli` reads `.langium` grammars and generates:

- `ast.ts` — TypeScript interfaces for every AST node, type guards, and an `AstReflection` class
- `grammar.ts` — The grammar serialized as JSON, lazy-loaded at runtime
- `module.ts` — A DI module providing `Grammar`, `LanguageMetaData`, and `AstReflection` services

**Runtime** — A service-oriented architecture driven by dependency injection:

- All components (parser, lexer, linker, scope provider, validator, LSP handlers) are registered as services
- Two service layers: **shared services** (cross-language: workspace, index, document management) and **language-specific services** (parser, references, validation — one set per language)
- Users customize behavior by providing partial DI modules that override default service factories

**Key dependency**: Chevrotain (parser generator library) powers the lexer and parser at runtime.

---

## 2. The Grammar Language

A `.langium` file defines the DSL's syntax and implicitly its AST structure. Key constructs:

### Parser Rules

```langium
// entry rule — the root of the AST
entry Model:
    (elements+=Element)*;

// regular rule — creates an AST node of type 'Element'
Element:
    'element' name=ID '{' attributes+=Attribute* '}';
```

- **`entry`** marks the grammar's starting rule (one per grammar)
- **Assignments**: `=` (single value), `+=` (array append), `?=` (boolean flag)
- **`name=ID`** assigns the matched ID terminal to the `name` property

### Cross-References

```langium
Reference:
    'ref' target=[Element:ID] ';';
```

- `[Element:ID]` — references an `Element` node by matching the `ID` terminal
- At parse time, creates a lazy `Reference` object with `$refText` set to the matched text
- At link time, the `ScopeProvider` resolves the text to the actual target node

### Actions (Type Changing)

```langium
Expression:
    Primary ({BinaryExpression.left=current} operator=('+' | '-') right=Primary)*;
```

- `{BinaryExpression.left=current}` creates a new `BinaryExpression` node, assigning the previously parsed node to its `left` property
- Enables left-recursive expression patterns

### Infix Rules

```langium
infix Expression:
    Primary
    ('+' | '-')         // precedence 0 (lowest)
    ('*' | '/')         // precedence 1
    ('**' right-assoc); // precedence 2, right-associative
```

- Declarative operator precedence and associativity
- Operators listed top-to-bottom from lowest to highest precedence

### Terminal Rules

```langium
terminal ID: /[_a-zA-Z][\w_]*/;
terminal STRING: /"(\\.|[^"\\])*"|'(\\.|[^'\\])*'/;
hidden terminal WS: /\s+/;
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
```

- **`hidden`** terminals (whitespace, comments) are excluded from the main token stream
- Terminal order affects lexer priority; keywords always take precedence over terminals

### Fragment Rules

```langium
fragment NamedElement:
    name=ID;
```

- Fragments contribute properties to the calling rule's AST node without creating a new node type

### Type Declarations

```langium
interface Declaration {
    name: string
}

type Literal = StringLiteral | NumberLiteral;
```

- Explicit AST type declarations (alternative to grammar-inferred types)
- `returns` / `infers` keywords control which type a parser rule produces

### Imports

```langium
import './other-grammar'
```

- Multi-file grammars with shared rules and types

---

## 3. Code Generation (Build Time)

The `langium-cli` generates three files from each grammar. Understanding what's generated is critical to understanding the runtime.

### 3.1 `ast.ts` — AST Type Definitions

For each grammar rule/type, generates:

**TypeScript interface:**

```typescript
export interface Element extends langium.AstNode {
  readonly $type: "Element";
  name: string;
  attributes: Array<Attribute>;
}
```

**Const object (property name literals):**

```typescript
export const Element = {
  $type: "Element",
  name: "name",
  attributes: "attributes",
} as const;
```

**Type guard:**

```typescript
export function isElement(item: unknown): item is Element {
  return reflection.isInstance(item, Element.$type);
}
```

**Terminal regexes and keyword types:**

```typescript
export const MyLangTerminals = {
  ID: /[_a-zA-Z][\w_]*/,
  STRING: /"(\\.|[^"\\])*"|'(\\.|[^'\\])*'/,
};
export type MyLangKeywordNames = "element" | "ref" | "{" | "}" | ";";
```

**AstReflection class:**

```typescript
export class MyLangAstReflection extends langium.AbstractAstReflection {
  override readonly types = {
    Element: {
      name: Element.$type,
      properties: {
        name: { name: Element.name },
        attributes: { name: Element.attributes, defaultValue: [] },
      },
      superTypes: [],
    },
    Reference: {
      name: Reference.$type,
      properties: {
        target: { name: Reference.target, referenceType: Element.$type },
      },
      superTypes: [],
    },
  } as const satisfies langium.AstMetaData;
}
```

The `AstReflection` provides runtime type metadata:

- `getTypeMetaData(type)` — properties with default values and reference target types
- `isInstance(node, type)` / `isSubtype(sub, super)` — type hierarchy queries
- `getAllSubTypes(type)` — all concrete subtypes
- `getReferenceType(refInfo)` — target type of a cross-reference

### 3.2 `grammar.ts` — Serialized Grammar

The grammar AST is serialized to JSON and wrapped in a lazy-loading function:

```typescript
let loaded: Grammar | undefined;
export const MyLangGrammar = (): Grammar =>
  loaded ?? (loaded = loadGrammarFromJson(`{ "$type": "Grammar", ... }`));
```

Uses `$ref` pointers (e.g., `#/rules@0`) for internal cross-references. This serialized grammar is consumed at runtime by the parser builder to construct Chevrotain parser rules.

### 3.3 `module.ts` — DI Module

```typescript
export const MyLangLanguageMetaData = {
    languageId: 'my-lang',
    fileExtensions: ['.mylang'],
    caseInsensitive: false,
    mode: 'development'
} as const satisfies LanguageMetaData;

export const MyLangGeneratedSharedModule: Module<...> = {
    AstReflection: () => new MyLangAstReflection()
};

export const MyLangGeneratedModule: Module<LangiumCoreServices, ...> = {
    Grammar: () => MyLangGrammar(),
    LanguageMetaData: () => MyLangLanguageMetaData,
    parser: {
        ParserConfig: () => MyLangParserConfig  // optional
    }
};
```

These generated modules are composed with default modules via `inject()` to create the full service container.

### 3.4 Generation Pipeline

```
langium-config.json
    → validate config schema
    → parse all .langium files
    → embedGrammars() — merge imported grammars, relink
    → collectAst() — extract types, terminals, keywords
    → generateAst() — write ast.ts
    → serializeGrammar() — write grammar.ts
    → generateModule() — write module.ts
    → (optional) TextMate/Monarch/Prism syntax highlighting, railroad diagrams, BNF
```

---

## 4. Dependency Injection System

All Langium services are composed through a custom DI system defined in `dependency-injection.ts`.

### Module Type

```typescript
type Module<I, T = I> = {
  [K in keyof T]: Module<I, T[K]> | ((injector: I) => T[K]);
};
```

A recursive tree where leaves are factory functions `(injector) => service`. The `injector` parameter provides access to all other services, enabling cross-service dependencies.

### `inject(...modules)` — Container Creation

- Merges up to 9 modules via deep merge (later modules override earlier ones)
- Returns a **Proxy-based lazy injector** — services are instantiated on first property access and cached
- Cycle detection via a `__requested__` symbol sentinel; throws if detected (fix: use `() => T` provider pattern to defer resolution)

### Two Service Layers

**Shared services** (`LangiumSharedCoreServices`) — one instance for the entire workspace:

- `ServiceRegistry` — maps file extensions/language IDs to language-specific services
- `workspace.DocumentBuilder` — the central build pipeline
- `workspace.IndexManager` — global symbol and reference indices
- `workspace.LangiumDocuments` — document store
- `workspace.WorkspaceManager` — file discovery and workspace initialization
- `workspace.WorkspaceLock` — mutex for write operations
- `workspace.FileSystemProvider` — abstracted file system access

**Language-specific services** (`LangiumCoreServices`) — one instance per language:

- `Grammar` — the serialized grammar (generated)
- `LanguageMetaData` — language ID, file extensions (generated)
- `parser.*` — LangiumParser, CompletionParser, Lexer, TokenBuilder, ValueConverter
- `references.*` — Linker, ScopeProvider, ScopeComputation, NameProvider
- `validation.*` — DocumentValidator, ValidationRegistry
- `workspace.*` — AstNodeLocator, AstNodeDescriptionProvider
- `shared` — back-reference to the shared services

### Service Composition Pattern

```typescript
// in a typical Langium project's module.ts:
const shared = inject(
    createDefaultSharedCoreModule({ fileSystemProvider: ... }),
    MyLangGeneratedSharedModule,
    // optional: custom shared overrides
);

const myLang = inject(
    createDefaultCoreModule({ shared }),
    MyLangGeneratedModule,
    MyLangModule,  // user's custom overrides
);

shared.ServiceRegistry.register(myLang);
```

### `eagerLoad(services)`

Recursively accesses all service properties, forcing instantiation. Used at server startup to ensure all services (especially those registering event listeners in constructors) are initialized.

---

## 5. Lexing

The lexer converts input text into a stream of tokens. Implemented by `DefaultLexer` wrapping Chevrotain's lexer.

### Token Building (`DefaultTokenBuilder`)

1. Scans the grammar for all terminal rules and keyword strings
2. Creates Chevrotain `TokenType` objects:
   - **Keywords** sorted by descending length (longer keywords take priority)
   - **Terminals** in grammar order
   - Keywords set `LONGER_ALT` to avoid premature matching (e.g., keyword `"if"` shouldn't match inside identifier `"iffy"`)
3. Hidden terminals marked with `GROUP: 'hidden'` (comments) or skipped (whitespace)

### Value Conversion (`DefaultValueConverter`)

Transforms raw token text into typed values during parsing:

- `STRING` → unescaped string (handles `\n`, `\t`, `\\`, etc.)
- `INT` → `parseInt()`
- `ID` → strips `^` prefix (escaped identifiers, e.g., `^reserved` → `reserved`)
- Type annotations: `number` → `Number()`, `boolean` → `Boolean('true')`, `bigint` → `BigInt()`, `date` → `new Date()`

### Tokenization Result

```typescript
lexer.tokenize(text) → {
    tokens: IToken[],        // main token stream
    hidden: IToken[],        // comments and whitespace
    errors: ILexingError[]   // unrecognized characters
}
```

---

## 6. Parsing: Tokens → CST → AST

Langium uses Chevrotain's **embedded actions** parser — AST construction happens during parsing, not as a post-processing step.

### Parser Construction (Build Phase)

At service creation time, `createLangiumParser(services)` walks the serialized grammar AST and registers Chevrotain parser rules:

| Grammar Element     | Chevrotain Method                                 |
| ------------------- | ------------------------------------------------- |
| Keyword             | `parser.consume(tokenType)`                       |
| Terminal RuleCall   | `parser.consume(tokenType)`                       |
| Parser RuleCall     | `parser.subrule(rule)`                            |
| Alternatives (`\|`) | `parser.alternatives(choices)`                    |
| `?` cardinality     | `parser.optional(...)`                            |
| `*` cardinality     | `parser.many(...)`                                |
| `+` cardinality     | `parser.atLeastOne(...)`                          |
| Action `{Type}`     | `parser.action(type)`                             |
| CrossReference      | `parser.consume(...)` + `linker.buildReference()` |

### CST Construction (`CstNodeBuilder`)

Built in parallel with the AST during parsing:

```
RootCstNode (full document text)
├── CompositeCstNode (parser rule invocation)
│   ├── LeafCstNode (consumed token)
│   ├── CompositeCstNode (subrule call)
│   │   └── LeafCstNode (token)
│   └── LeafCstNode (hidden token — comment)
└── LeafCstNode (token)
```

- **CompositeCstNode** created for each parser rule call; range derived from first/last non-hidden children
- **LeafCstNode** created for each consumed token; stores offset, length, token type
- CST nodes linked bidirectionally to AST nodes via `$cstNode` / `.astNode`

### AST Construction

The parser maintains a **stack** of AST nodes being built:

1. **`consume(token, feature)`**: If the grammar element has an assignment (e.g., `name=ID`), converts the token via `ValueConverter` and assigns to the current AST node. For cross-references, creates a lazy `Reference` object via `linker.buildReference()`.

2. **`subrule(rule, feature)`**: Delegates to a sub-rule. If the grammar element has an assignment (e.g., `elements+=Element`), assigns the sub-rule's result to the current node.

3. **`action(type)`**: Constructs the current node, creates a new node of the specified type, and reassigns the current node to it. This is how `{BinaryExpression.left=current}` works.

4. **`construct()`**: Finalizes the current AST node when a rule completes. For infix rules, performs operator precedence climbing to build the correct tree structure.

### Key AST Node Properties

```typescript
interface AstNode {
  readonly $type: string; // e.g., 'Element'
  readonly $container?: AstNode; // parent node
  readonly $containerProperty?: string; // property name on parent
  readonly $containerIndex?: number; // array index if in array
  readonly $cstNode?: CstNode; // link to CST
  readonly $document?: LangiumDocument; // only on root node
}
```

### Cross-Reference Creation During Parsing

```typescript
interface Reference<T extends AstNode> {
  readonly ref: T | undefined; // lazy-resolved target
  readonly error?: LinkingError; // resolution error
  readonly $refNode?: CstNode; // CST of reference text
  readonly $refText: string; // raw text (e.g., 'MyElement')
  readonly $nodeDescription?: AstNodeDescription;
}
```

- Created during `consume()` when the grammar element is a `CrossReference`
- `.ref` triggers lazy resolution via `ScopeProvider` on first access
- `MultiReference` variant exists for references that resolve to multiple targets

### Parse Result

```typescript
interface ParseResult<T extends AstNode> {
  value: T; // root AST node
  parserErrors: IRecognitionException[];
  lexerErrors: ILexingError[];
}
```

### Completion Parser (`LangiumCompletionParser`)

A separate parser variant for code completion:

- Uses `'partial'` lexing mode (lenient, allows incomplete input)
- **Does not construct AST or CST** — only tracks grammar position
- Returns `CompletionParserResult`: tokens, element stack (grammar elements at cursor), token index
- Used by `CompletionProvider` to determine what grammar features could appear next

### Error Recovery

Chevrotain's built-in error recovery: inserts missing tokens, skips unexpected tokens. Inserted tokens are excluded from CST/AST construction. Subrule failures trigger partial node construction (`construct()` called in finally block).

---

## 7. The Document Lifecycle (DocumentState Pipeline)

The `DocumentBuilder` is the heart of Langium's runtime. It processes documents through 6 sequential phases, each advancing the `DocumentState`:

```
Changed (0) → Parsed (1) → IndexedContent (2) → ComputedScopes (3) → Linked (4) → IndexedReferences (5) → Validated (6)
```

### Phase 0: Parse (→ Parsed)

**Service**: `LangiumDocumentFactory.update()`
**Action**: Re-lexes and re-parses the document text into a fresh CST/AST.
**Output**: `document.parseResult` populated with AST, lexer errors, parser errors.
**Side effect**: Old AST discarded.

### Phase 1: Index Content (→ IndexedContent)

**Service**: `IndexManager.updateContent()` → `ScopeComputation.collectExportedSymbols()`
**Action**: Extracts globally-visible symbols from the AST and stores them in `symbolIndex`.
**Output**: Exported `AstNodeDescription` objects indexed by document URI.
**Side effect**: Symbols from this document become resolvable by other documents.
**Default behavior**: Exports root node (if named) and its direct named children.

### Phase 2: Compute Scopes (→ ComputedScopes)

**Service**: `ScopeComputation.collectLocalSymbols()`
**Action**: Walks the entire AST, collecting locally-visible symbols per AST node.
**Output**: `document.localSymbols` — a `MultiMap<AstNode, AstNodeDescription>` mapping each container node to the symbols visible within it.
**Side effect**: After this phase, references can be lazily resolved (accessing `.ref` will work).

### Phase 3: Link (→ Linked)

**Service**: `Linker.link()`
**Action**: Walks all cross-references in the AST, eagerly resolving each via `ScopeProvider.getScope()`.
**Output**: Each `Reference` has `.ref` set to the target node, or `.error` set to a `LinkingError`.
**Side effect**: `document.references` array populated.
**Condition**: Controlled by `eagerLinking` option (default: true). If false, linking is deferred to lazy access.

### Phase 4: Index References (→ IndexedReferences)

**Service**: `IndexManager.updateReferences()` → `ReferenceDescriptionProvider.createDescriptions()`
**Action**: Records all outgoing resolved cross-references as `ReferenceDescription` objects.
**Output**: `referenceIndex` populated (maps source document URI to array of reference descriptions).
**Side effect**: Enables `isAffected()` computation — determines which documents need relinking when another document changes.

**ReferenceDescription structure:**

```typescript
{
    sourceUri: URI,           // document containing the reference
    sourcePath: string,       // AstNode path to the referencing node
    targetUri: URI,           // document containing the target
    targetPath: string,       // AstNode path to the target node
    segment: DocumentSegment, // text range of the reference
    local?: boolean           // true if source and target in same document
}
```

### Phase 5: Validate (→ Validated)

**Service**: `DocumentValidator.validateDocument()`
**Action**: Runs all validation checks and produces diagnostics.
**Output**: `document.diagnostics` array populated.
**Side effect**: In LSP mode, diagnostics are sent to the client.
**Condition**: Controlled by `validation` option (boolean or `{ categories: string[] }`). Supports partial validation — only missing categories re-run.

### Phase Listeners

- `onBuildPhase(state, callback)` — fires when a batch of documents reaches a state
- `onDocumentPhase(state, callback)` — fires for each individual document reaching a state
- `waitUntil(document, state)` — returns a promise that resolves when the document reaches the state

### Cancellation

Every phase checks `CancellationToken` before processing each document via `interruptAndCheck()`. If cancelled, partially-processed documents retain their current state; the next `build()` call resumes from where it left off.

---

## 8. Scope Computation

Scope computation runs in two phases, determining what symbols are visible where.

### Phase 1: `collectExportedSymbols()` (during IndexedContent phase)

- Called early, before cross-references can be resolved
- Default: exports the root node (if named) and its direct children (if named)
- Results stored in global `symbolIndex` for cross-document resolution
- **Critical constraint**: Must not access cross-references during this phase

### Phase 2: `collectLocalSymbols()` (during ComputedScopes phase)

- Walks the entire AST via `streamAllContents()`
- For each named node, creates an `AstNodeDescription` and adds it to its `$container`'s symbol set
- Results stored in `document.localSymbols: MultiMap<AstNode, AstNodeDescription>`
- This enables local name resolution: siblings are visible to each other within their parent

### `NameProvider`

- Default: returns `node.name` if the node has a string `name` property
- Customizable for non-standard naming conventions (e.g., qualified names, computed names)

### `AstNodeDescription`

```typescript
interface AstNodeDescription {
  node: AstNode;
  name: string;
  get nameSegment(): DocumentSegment;
  selectionSegment: DocumentSegment;
  type: string; // $type of the node
  documentUri: URI;
  path: string; // stable path via AstNodeLocator (e.g., '/elements@2/attributes@0')
}
```

---

## 9. Scope Provider and Name Resolution

The `ScopeProvider` assembles a **scope chain** for a specific cross-reference context.

### `getScope(context: ReferenceInfo)` — Default Behavior

1. **Walk up the containment hierarchy**: Starting from the reference's container node, walk up via `$container`
2. **At each level**: Collect `localSymbols[currentNode]` entries filtered by the reference's target type (using `AstReflection.isSubtype()`)
3. **Append global scope**: `IndexManager.allElements(referenceType)` wrapped in a `MultiMapScope`
4. **Build chain**: Innermost local scope wraps the next, wrapping the next, all the way to the global scope

```
LocalScope(innermost siblings)
  → LocalScope(parent's siblings)
    → LocalScope(grandparent's siblings)
      → ...
        → GlobalScope(all exported symbols of matching type)
```

### Scope Implementations

| Scope Type      | Backing Store                          | Use Case                                 |
| --------------- | -------------------------------------- | ---------------------------------------- |
| `StreamScope`   | Lazy `Stream<AstNodeDescription>`      | Local symbol sets (default)              |
| `MapScope`      | `Map<string, AstNodeDescription>`      | Pre-computed for O(1) lookup             |
| `MultiMapScope` | `MultiMap<string, AstNodeDescription>` | Global scope (multiple entries per name) |
| `EMPTY_SCOPE`   | Singleton, no elements                 | Sentinel for scope chain termination     |

### Scope Interface

```typescript
interface Scope {
  getElement(name: string): AstNodeDescription | undefined; // first match
  getElements(name: string): Iterable<AstNodeDescription>; // all matches for name
  getAllElements(): Iterable<AstNodeDescription>; // all elements (for completion)
}
```

Each scope has an optional `outerScope` — if a name isn't found locally, the outer scope is consulted. This creates the chain.

---

## 10. Linking and Cross-Reference Resolution

### Lazy Reference Resolution

References created during parsing start with `_ref = undefined`. On first access to `.ref`:

1. Set `_ref = RefResolving` (cycle detection sentinel)
2. Call `ScopeProvider.getScope(referenceInfo)`
3. Call `scope.getElement($refText)` to find a matching `AstNodeDescription`
4. If found: load the actual `AstNode` via `AstNodeLocator.getAstNode()` and cache it
5. If not found: create a `LinkingError` and cache it
6. If `_ref === RefResolving` when accessed again during resolution: cyclic reference detected

### Eager Linking (Phase 3)

`Linker.link(document)`:

1. Walks all AST nodes via `streamAst()`
2. Extracts all references via `streamReferences()`
3. For each unresolved reference, calls `doLink()`:
   - Sets `_ref = RefResolving`
   - Calls `getCandidate()` → `ScopeProvider.getScope()` → `scope.getElement($refText)`
   - If `AstNodeDescription` returned: loads actual `AstNode` via `loadAstNode()` and stores
   - If `LinkingError` returned: stores error
4. Records reference in `document.references` array

### Node Loading

```
AstNodeDescription → LangiumDocuments.getDocument(uri) → AstNodeLocator.getAstNode(root, path) → AstNode
```

Path format: `/property/nested/members@2` (hierarchical with array indices separated by `@`)

### Unlinking

`Linker.unlink(document)`: Resets all `_ref` to `undefined`, clears `document.references`. Called by `resetToState()` when a document needs relinking.

---

## 11. Validation

### Validation Categories

- **`'built-in'`** — Reserved. Lexer errors, parser errors, linking errors. Always runs first.
- **`'fast'`** — Default category. Runs on every document change.
- **`'slow'`** — Long-running checks, scheduled separately.
- Custom categories — User-defined strings for domain-specific grouping.

### Registration

```typescript
registry.register(checks, thisObj?, category?)
```

Where `checks` is a record mapping AST type names to check functions:

```typescript
{
    Element: (node: Element, accept: ValidationAcceptor) => { ... },
    Reference: [(check1), (check2)]  // array of checks for same type
}
```

Checks are registered for the entire type hierarchy — registering for `Expression` also applies to all subtypes (`BinaryExpression`, `UnaryExpression`, etc.) via `AstReflection.getAllSubTypes()`.

### Before/After Document Hooks

```typescript
registry.registerBeforeDocument(callback, thisObj?, category?)
registry.registerAfterDocument(callback, thisObj?, category?)
```

- **Before**: Initialize stateful accumulators (e.g., uniqueness maps)
- **After**: Evaluate accumulated state (e.g., report duplicates)

### Validation Pipeline (`validateDocument()`)

```
1. Process lexer errors → diagnostics
   └─ (optional) stop if stopAfterLexingErrors
2. Process parser errors → diagnostics
   └─ (optional) stop if stopAfterParsingErrors
3. Process linking errors → diagnostics
   └─ (optional) stop if stopAfterLinkingErrors
4. Run custom AST validation:
   a. Fire beforeDocument hooks
   b. Walk all AST nodes via streamAst()
      → For each node, get checks by $type
      → Execute each check passing (node, accept, cancelToken)
   c. Fire afterDocument hooks
```

### ValidationAcceptor

```typescript
type ValidationAcceptor = (
  severity: "error" | "warning" | "info" | "hint",
  message: string,
  info: DiagnosticInfo,
) => void;
```

### DiagnosticInfo

```typescript
{
    node: AstNode;                  // required: node to attach diagnostic
    property?: string;              // property name for range calculation
    keyword?: string;               // keyword for range
    index?: number;                 // array index for multi-value properties
    range?: Range;                  // explicit range override
    code?: string | number;         // diagnostic code (for code actions)
    tags?: DiagnosticTag[];         // e.g., Unnecessary, Deprecated
    data?: unknown;                 // preserved for code actions
    relatedInformation?: DiagnosticRelatedInformation[];
}
```

Range resolution priority: explicit `range` > computed from `property`/`keyword` > node's CST range > document start.

---

## 12. Workspace Management

### Workspace Initialization

`WorkspaceManager.initializeWorkspace(folders)`:

1. **Load additional documents** — `loadAdditionalDocuments()` hook (default: no-op). Override to inject built-in libraries.
2. **Traverse folders** — Recursively walks workspace directories, collecting file URIs
3. **Filter** — `shouldIncludeEntry()`: skips hidden files (`.`-prefixed), `node_modules`, `out`; includes only files with registered language extensions
4. **Create documents** — `LangiumDocumentFactory.fromUri()` for each discovered file
5. **Build all** — `DocumentBuilder.build(allDocuments)` runs the full 6-phase pipeline

### Index Manager

Maintains two indices:

**`symbolIndex: Map<docUri, AstNodeDescription[]>`**

- Populated during Phase 1 (IndexedContent)
- Queried via `allElements(nodeType?)` for global scope resolution
- Cached by type via `ContextCache` for performance

**`referenceIndex: Map<docUri, ReferenceDescription[]>`**

- Populated during Phase 4 (IndexedReferences)
- Used by `isAffected(document, changedUris)` — returns true if document has non-local references to any changed URI

### Document Update Flow

When files change (`DocumentBuilder.update(changed, deleted)`):

1. **Delete** removed documents from all indices
2. **Reset** changed documents to `DocumentState.Changed`
3. **Find affected documents** — documents with:
   - Any unresolved references (linking errors — maybe now resolvable), OR
   - Non-local references pointing to changed documents (via `isAffected()`)
4. **Reset affected** to `DocumentState.ComputedScopes` (preserves parse + index, re-links + re-validates)
5. **Sort** dirty documents — open editor documents first (better UX)
6. **Build** all dirty documents through the full pipeline

### Workspace Lock

- **Write operations** (document updates): Mutually exclusive. New write cancels previous.
- **Read operations** (LSP queries): Parallel. Queued behind pending writes.

---

## 13. LSP Integration

### Architecture

Two LSP module layers mirror the core:

- **Shared LSP** (`createDefaultSharedLSPModule`): `LanguageServer`, `DocumentUpdateHandler`, `FuzzyMatcher`, `WorkspaceSymbolProvider`, `TextDocuments`
- **Per-language LSP** (`createDefaultLSPModule`): `CompletionProvider`, `DefinitionProvider`, `ReferencesProvider`, `HoverProvider`, `Formatter`, `SemanticTokenProvider`, `CodeActionProvider`, etc.

### Server Initialization

`startLanguageServer(services)`:

1. Registers all handler functions on the LSP connection
2. Wires `connection.onInitialize` → `LanguageServer.initialize()`
3. Wires `documents.listen(connection)` → text document events
4. Calls `connection.listen()` to start

`LanguageServer.initialize(params)`:

1. `eagerLoad()` — forces all service instantiation
2. Fires `onInitialize` event (workspace manager, config provider respond)
3. Builds `InitializeResult` with capabilities — each capability advertised only if the corresponding service exists

`LanguageServer.initialized()`:

1. Registers file watchers (if client supports dynamic registration)
2. Initializes workspace manager (triggers initial document discovery + build)

### Request Handler Pattern

All 20+ LSP features use the same wrapper:

```typescript
connection.onCompletion(
  createRequestHandler(
    (services, document, params, cancelToken) => {
      return services.lsp?.CompletionProvider?.getCompletion(
        document,
        params,
        cancelToken,
      );
    },
    sharedServices,
    requiredState, // e.g., DocumentState.Linked
  ),
);
```

The wrapper:

1. Extracts URI from params
2. **Waits** for the document to reach the required `DocumentState` via `waitUntilPhase()`
3. Resolves language-specific services via `ServiceRegistry.getServices(uri)`
4. Fetches the `LangiumDocument`
5. Invokes the service method
6. Catches errors → LSP `ResponseError`

### Required DocumentState per Feature

| Feature          | Required State                     | Scope     |
| ---------------- | ---------------------------------- | --------- |
| Completion       | `DocumentState.Linked`             | Document  |
| Go-to-Definition | `DocumentState.Linked`             | Document  |
| Hover            | `DocumentState.Linked`             | Document  |
| Semantic Tokens  | `DocumentState.Linked`             | Document  |
| Document Symbols | `DocumentState.Parsed`             | Document  |
| Formatting       | `DocumentState.Parsed`             | Document  |
| Find References  | `WorkspaceState.IndexedReferences` | Workspace |
| Rename           | `WorkspaceState.IndexedReferences` | Workspace |
| Implementation   | `WorkspaceState.IndexedReferences` | Workspace |
| Call Hierarchy   | `WorkspaceState.IndexedReferences` | Workspace |

**Document-scoped**: Waits only for the current document to reach the state.
**Workspace-scoped**: Waits for the entire workspace to reach the state (needed for cross-file queries).

### Document Change Flow

```
Editor types → textDocument/didChange
    → DocumentUpdateHandler.didChangeContent()
        → WorkspaceLock.write(...)
            → DocumentBuilder.update([changedUri], [])
                → Phase pipeline (6 phases)
                    → onDocumentPhase(Validated) fires
                        → Diagnostics sent to client
```

### Completion Provider

The completion system is grammar-aware:

1. **Parse up to cursor** using `CompletionParser` (lenient/partial mode)
2. **Compute next features** from grammar element stack — determines what keywords, cross-references, or rule calls could appear next
3. **Generate completion items**:
   - **Keywords**: Grammar keywords valid at cursor position
   - **Cross-references**: All elements from `ScopeProvider.getScope().getAllElements()` for the reference type
   - **Custom**: Override `completionFor()` for terminals, datatypes, or custom logic

---

## 14. Common Customization Patterns

### Overriding a Service

Create a partial module with replacement factory functions and pass it to `inject()` after the default module:

```typescript
const MyModule: Module<MyLangServices, PartialLangiumCoreServices> = {
  references: {
    ScopeProvider: (services) => new MyScopeProvider(services),
  },
};

const services = inject(
  createDefaultCoreModule({ shared }),
  MyLangGeneratedModule,
  MyModule, // overrides come last
);
```

### Most Common Override Points

| Service                                      | Why Override                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------- |
| `ScopeProvider`                              | Custom scoping rules (qualified names, imports, non-hierarchical scoping) |
| `ScopeComputation`                           | Custom exports (deeply nested visible symbols, conditional exports)       |
| `NameProvider`                               | Non-standard `name` property, computed names, qualified names             |
| `ValidationRegistry`                         | Register custom validation checks                                         |
| `CompletionProvider`                         | Custom completion logic (snippets, context-aware suggestions)             |
| `Formatter`                                  | Code formatting rules                                                     |
| `ValueConverter`                             | Custom token-to-value conversion                                          |
| `WorkspaceManager.loadAdditionalDocuments()` | Inject built-in library definitions                                       |

### Adding Custom Validation

```typescript
// in my-lang-validator.ts
export function registerValidationChecks(services: MyLangServices) {
  const registry = services.validation.ValidationRegistry;
  const checks: ValidationChecks<MyLangAstType> = {
    Element: validateElement,
    Reference: [checkReferenceScope, checkReferenceType],
  };
  registry.register(checks, undefined, "fast");
}

function validateElement(element: Element, accept: ValidationAcceptor): void {
  if (!element.name.startsWith(element.name[0].toUpperCase())) {
    accept("warning", "Element name should start with uppercase.", {
      node: element,
      property: "name",
    });
  }
}
```

### Cross-Language References

For multi-language projects, all languages share the same `IndexManager` and `ServiceRegistry` through the shared services layer. Cross-language references work through the global scope, which queries all exported symbols across all registered languages.

---

## 15. End-to-End Runtime Flow

Here's what happens when a user types in their editor, start to finish:

```
1. USER TYPES IN EDITOR
   ↓
2. textDocument/didChange sent to language server
   ↓
3. DocumentUpdateHandler.didChangeContent()
   → WorkspaceLock.write(token => documentBuilder.update([uri], [], token))
   ↓
4. DocumentBuilder.update()
   a. Reset changed document to DocumentState.Changed
   b. Find affected documents (those with linking errors OR references to changed doc)
   c. Reset affected documents to DocumentState.ComputedScopes
   d. Sort all dirty documents (open editors first)
   e. Call buildDocuments()
   ↓
5. BUILD PIPELINE (for each dirty document):

   Phase 0: PARSE (Changed → Parsed)
   └─ LangiumDocumentFactory.update() re-lexes + re-parses
   └─ Result: fresh CST/AST in document.parseResult

   Phase 1: INDEX CONTENT (Parsed → IndexedContent)
   └─ ScopeComputation.collectExportedSymbols()
   └─ Result: symbolIndex updated with exported descriptions

   Phase 2: COMPUTE SCOPES (IndexedContent → ComputedScopes)
   └─ ScopeComputation.collectLocalSymbols()
   └─ Result: document.localSymbols populated

   Phase 3: LINK (ComputedScopes → Linked)
   └─ Linker.link() resolves all cross-references
   └─ For each reference: ScopeProvider.getScope() → scope.getElement($refText)
   └─ Result: all Reference objects have .ref or .error set

   Phase 4: INDEX REFERENCES (Linked → IndexedReferences)
   └─ ReferenceDescriptionProvider.createDescriptions()
   └─ Result: referenceIndex updated for change tracking

   Phase 5: VALIDATE (IndexedReferences → Validated)
   └─ DocumentValidator.validateDocument()
   └─ Runs: lexer errors → parser errors → linking errors → custom checks
   └─ Result: document.diagnostics populated

   ↓
6. onDocumentPhase(Validated) fires
   → Diagnostics sent to client via connection.sendDiagnostics()
   ↓
7. LSP REQUESTS (triggered by user interaction):

   Completion request:
   → waitUntilPhase(doc, DocumentState.Linked)
   → CompletionParser parses up to cursor
   → Compute next grammar features at cursor position
   → For cross-references: ScopeProvider.getScope().getAllElements()
   → For keywords: valid keywords at grammar position
   → Return CompletionList

   Go-to-definition request:
   → waitUntilPhase(doc, DocumentState.Linked)
   → Find CstNode at cursor position
   → References.findDeclarationNodes() follows the reference
   → Return LocationLink to target's CST range

   Find-references request:
   → waitUntilPhase(workspace, WorkspaceState.IndexedReferences)
   → Find target declaration at cursor
   → IndexManager queries referenceIndex across all documents
   → Return Location[] for all referring sites
```

---

## Appendix: Key Source Files

| Area                | File                                              | What to Read                                               |
| ------------------- | ------------------------------------------------- | ---------------------------------------------------------- |
| DI System           | `src/dependency-injection.ts`                     | `Module` type, `inject()`, `eagerLoad()`                   |
| Service Types       | `src/services.ts`                                 | All service interfaces, `DeepPartial`                      |
| Default Services    | `src/default-module.ts`                           | `createDefaultCoreModule`, `createDefaultSharedCoreModule` |
| AST Types           | `src/syntax-tree.ts`                              | `AstNode`, `Reference`, `MultiReference`, `AstReflection`  |
| Lexer               | `src/parser/lexer.ts`                             | `DefaultLexer`                                             |
| Token Builder       | `src/parser/token-builder.ts`                     | `DefaultTokenBuilder`                                      |
| Parser              | `src/parser/langium-parser.ts`                    | `LangiumParser`, `LangiumCompletionParser`                 |
| Parser Builder      | `src/parser/langium-parser-builder.ts`            | `createLangiumParser`                                      |
| CST                 | `src/parser/cst-node-builder.ts`                  | `CstNodeBuilder`                                           |
| Document State      | `src/workspace/documents.ts`                      | `LangiumDocument`, `DocumentState`                         |
| Build Pipeline      | `src/workspace/document-builder.ts`               | `DefaultDocumentBuilder`                                   |
| Index Manager       | `src/workspace/index-manager.ts`                  | `DefaultIndexManager`                                      |
| Workspace           | `src/workspace/workspace-manager.ts`              | `DefaultWorkspaceManager`                                  |
| Scope Computation   | `src/references/scope-computation.ts`             | `DefaultScopeComputation`                                  |
| Scope Provider      | `src/references/scope-provider.ts`                | `DefaultScopeProvider`                                     |
| Scope Types         | `src/references/scope.ts`                         | `Scope`, `StreamScope`, `MapScope`, `MultiMapScope`        |
| Linker              | `src/references/linker.ts`                        | `DefaultLinker`                                            |
| Name Provider       | `src/references/name-provider.ts`                 | `DefaultNameProvider`                                      |
| Validation Registry | `src/validation/validation-registry.ts`           | `ValidationRegistry`                                       |
| Document Validator  | `src/validation/document-validator.ts`            | `DefaultDocumentValidator`                                 |
| LSP Server          | `src/lsp/language-server.ts`                      | `DefaultLanguageServer`, `startLanguageServer`             |
| LSP Module          | `src/lsp/default-lsp-module.ts`                   | `createDefaultSharedLSPModule`, `createDefaultLSPModule`   |
| LSP Services        | `src/lsp/lsp-services.ts`                         | Service type definitions                                   |
| Document Updates    | `src/lsp/document-update-handler.ts`              | `DefaultDocumentUpdateHandler`                             |
| Completion          | `src/lsp/completion/completion-provider.ts`       | `DefaultCompletionProvider`                                |
| CLI Generation      | `langium-cli/src/generate.ts`                     | Main generation orchestrator                               |
| AST Generator       | `langium-cli/src/generator/ast-generator.ts`      | AST type generation                                        |
| Grammar Serializer  | `langium-cli/src/generator/grammar-serializer.ts` | Grammar serialization                                      |
| Module Generator    | `langium-cli/src/generator/module-generator.ts`   | DI module generation                                       |

All paths are relative to `packages/langium/` unless prefixed with `langium-cli/`.
