# LSP features

Read this when adding or fixing an editor feature: formatting, semantic highlighting, quick fixes, hover, completion, signature help, inlay hints, code lens, document links, commands, or virtual documents. Also read it when a feature is missing or returns nothing.

## Contents

1. [What you get by default](#what-you-get-by-default)
2. [Recipes](#recipes): formatter, semantic tokens, code actions, hover and documentation, completion, signature help, inlay hints, code lens and commands, document links, virtual documents
3. [When each request runs](#when-each-request-runs)
4. [Best practices](#best-practices)
5. [Pitfalls](#pitfalls)
6. [Source and examples](#source-and-examples)

The recipes assume a language `MyDsl` created by `yo langium`, with `my-dsl-module.ts` and this grammar fragment:

```langium
Model: (entities+=Entity | functions+=Function | calls+=Call | imports+=Import)*;
Entity: 'entity' name=ID ('extends' superType=[Entity:ID])? '{' features+=Feature* '}';
Feature: name=ID ':' type=ID;
Function: 'def' name=ID '(' (params+=Parameter (',' params+=Parameter)*)? ')';
Parameter: name=ID;
Call: func=[Function:ID] '(' (args+=Expression (',' args+=Expression)*)? ')';
Import: 'import' path=STRING;
// Expression is any expression rule of your language
```

## What you get by default

`createDefaultModule` (from `langium/lsp`) registers only these per-language providers:

| Service key (`lsp.*`) | Default class | Gives you |
| --- | --- | --- |
| `CompletionProvider` | `DefaultCompletionProvider` | keywords and cross-reference candidates |
| `DocumentSymbolProvider` | `DefaultDocumentSymbolProvider` | outline of named nodes |
| `HoverProvider` | `MultilineCommentHoverProvider` | `/** ... */` comments of the declaration |
| `FoldingRangeProvider` | `DefaultFoldingRangeProvider` | folding of multi-line nodes and comments |
| `ReferencesProvider` | `DefaultReferencesProvider` | find all references |
| `DefinitionProvider` | `DefaultDefinitionProvider` | go to definition |
| `DocumentHighlightProvider` | `DefaultDocumentHighlightProvider` | highlight occurrences |
| `RenameProvider` | `DefaultRenameProvider` | rename symbol |

`createDefaultSharedModule` adds `WorkspaceSymbolProvider`, `NodeKindProvider`, and `FuzzyMatcher`.

Everything else is **off until you register it**:

| Feature | Service key | Base to extend | Module |
| --- | --- | --- | --- |
| Formatting | `lsp.Formatter` | `AbstractFormatter` | language |
| Semantic highlighting | `lsp.SemanticTokenProvider` | `AbstractSemanticTokenProvider` | language |
| Quick fixes | `lsp.CodeActionProvider` | interface `CodeActionProvider` | language |
| Signature help | `lsp.SignatureHelp` | `AbstractSignatureHelpProvider` | language |
| Inlay hints | `lsp.InlayHintProvider` | `AbstractInlayHintProvider` | language |
| Code lens | `lsp.CodeLensProvider` | interface `CodeLensProvider` | language |
| Document links | `lsp.DocumentLinkProvider` | interface `DocumentLinkProvider` | language |
| Type definition, implementation, declaration | `lsp.TypeProvider`, `lsp.ImplementationProvider`, `lsp.DeclarationProvider` | `AbstractTypeDefinitionProvider`, `AbstractGoToImplementationProvider`, interface | language |
| Call and type hierarchy | `lsp.CallHierarchyProvider`, `lsp.TypeHierarchyProvider` | `AbstractCallHierarchyProvider`, `AbstractTypeHierarchyProvider` | language |
| Commands | `lsp.ExecuteCommandHandler` | `AbstractExecuteCommandHandler` | **shared** |
| Virtual documents (4.4+) | `lsp.TextDocumentContentProvider` | `DefaultTextDocumentContentProvider` | **shared** |
| File rename/create hooks | `lsp.FileOperationHandler` | interface `FileOperationHandler` | **shared** |

The server advertises a capability only if at least one registered language has the service. Registering the class is what turns the feature on.

## Recipes

### Register providers

Language providers go in your language module, shared ones in a shared module passed to the shared `inject`:

```ts
import { type Module, inject } from 'langium';
import { createDefaultModule, createDefaultSharedModule, type LangiumServices,
    type LangiumSharedServices, type PartialLangiumServices, type PartialLangiumSharedServices } from 'langium/lsp';
import { MyDslGeneratedModule, MyDslGeneratedSharedModule } from './generated/module.js';

export type MyDslServices = LangiumServices;
export const MyDslModule: Module<MyDslServices, PartialLangiumServices> = {
    lsp: {
        Formatter: () => new MyDslFormatter(),
        SemanticTokenProvider: (services) => new MyDslSemanticTokenProvider(services),
        CodeActionProvider: () => new MyDslCodeActionProvider(),
        CompletionProvider: (services) => new MyDslCompletionProvider(services),
        SignatureHelp: () => new MyDslSignatureHelpProvider(),
        InlayHintProvider: () => new MyDslInlayHintProvider(),
        CodeLensProvider: () => new MyDslCodeLensProvider(),
        DocumentLinkProvider: () => new MyDslDocumentLinkProvider()
    }
};
export const MyDslSharedModule: Module<LangiumSharedServices, PartialLangiumSharedServices> = {
    lsp: { ExecuteCommandHandler: (services) => new MyDslCommandHandler(services) }
};

// in createMyDslServices: the shared module goes into the shared inject
const shared = inject(createDefaultSharedModule(context), MyDslGeneratedSharedModule, MyDslSharedModule);
const MyDsl = inject(createDefaultModule({ shared }), MyDslGeneratedModule, MyDslModule);
shared.ServiceRegistry.register(MyDsl);
```

The snippets below omit this step and only show the class.

### Formatter

Use for document, range, and on-type formatting. Call `getNodeFormatter(node)` per node type, select regions with `keyword`, `keywords`, `property`, `properties`, `nodes`, or `interior`, then `prepend`, `append`, or `surround` a `Formatting` action. Based on `examples/domainmodel/src/language-server/domain-model-formatter.ts`.

```ts
import type { AstNode } from 'langium';
import { AbstractFormatter, Formatting } from 'langium/lsp';
import * as ast from './generated/ast.js';

export class MyDslFormatter extends AbstractFormatter {
    protected format(node: AstNode): void {
        if (ast.isEntity(node)) {
            const f = this.getNodeFormatter(node);
            const open = f.keyword('{');
            const close = f.keyword('}');
            f.keyword('entity').append(Formatting.oneSpace());
            open.prepend(Formatting.oneSpace());
            // indent every line between the braces, then put '}' on its own line
            f.interior(open, close).prepend(Formatting.indent());
            close.prepend(Formatting.newLine());
        } else if (ast.isFeature(node)) {
            const f = this.getNodeFormatter(node);
            f.keyword(':').prepend(Formatting.noSpace()).append(Formatting.oneSpace());
        } else if (ast.isModel(node)) {
            // top-level elements start at column 0, allow blank lines between them
            this.getNodeFormatter(node).nodes(...node.entities).prepend(Formatting.noIndent({ allowMore: true }));
        }
    }
}
```

Actions: `noSpace`, `oneSpace`, `spaces(n)`, `newLine`, `newLines(n)`, `indent`, `noIndent`, `fit(...)`. Options: `{ allowMore, allowLess, priority }`. For on-type formatting, override the getter `formatOnTypeOptions` to return `{ firstTriggerCharacter: '}' }`. Test with `expectFormatting` (see [testing.md](testing.md)).

### Semantic tokens

Use when TextMate highlighting can't tell identifiers apart (types vs. variables, references vs. declarations). Override `highlightElement`, which runs for every AST node. Return `'prune'` to skip a subtree.

```ts
import type { AstNode } from 'langium';
import { AbstractSemanticTokenProvider, type SemanticTokenAcceptor } from 'langium/lsp';
import { SemanticTokenTypes, SemanticTokenModifiers } from 'vscode-languageserver';
import * as ast from './generated/ast.js';

export class MyDslSemanticTokenProvider extends AbstractSemanticTokenProvider {
    protected highlightElement(node: AstNode, acceptor: SemanticTokenAcceptor): void | 'prune' {
        if (ast.isEntity(node)) {
            acceptor({ node, property: 'name', type: SemanticTokenTypes.class, modifier: SemanticTokenModifiers.declaration });
            if (node.superType) {
                acceptor({ node, property: 'superType', type: SemanticTokenTypes.class });
            }
        } else if (ast.isFeature(node)) {
            acceptor({ node, property: 'name', type: SemanticTokenTypes.property });
            acceptor({ node, property: 'type', type: SemanticTokenTypes.type });
        }
    }
}
```

The acceptor also takes `{ node, keyword, type }` or `{ cst, type }`. Register with `(services) => new ...(services)`: the constructor needs services. The legend comes from the `tokenTypes` and `tokenModifiers` getters; override them to add custom types. Delta requests are disabled by design.

### Code actions (quick fixes)

Tie each fix to a validation through `data.code`. The validator exports `namespace IssueCodes { export const EntityNameLowercase = 'entity-name-lowercase'; }` and reports with `data: diagnosticData(IssueCodes.EntityNameLowercase)` (or `{ code, ...extra }` to carry values for the fix), as shown in [validation.md](validation.md#recipe-diagnostic-codes-and-data-for-code-actions). Based on `examples/arithmetics/src/language-server/lsp/arithmetics-code-actions.ts`.

```ts
import type { DiagnosticData, LangiumDocument, MaybePromise } from 'langium';
import type { CodeActionProvider } from 'langium/lsp';
import { CodeActionKind, type CodeAction, type CodeActionParams, type Command, type Diagnostic } from 'vscode-languageserver';
import { IssueCodes } from './my-dsl-validator.js';

export class MyDslCodeActionProvider implements CodeActionProvider {
    getCodeActions(document: LangiumDocument, params: CodeActionParams): MaybePromise<Array<Command | CodeAction>> {
        const result: CodeAction[] = [];
        for (const diagnostic of params.context.diagnostics) {
            const code = (diagnostic.data as DiagnosticData | undefined)?.code;
            if (code === IssueCodes.EntityNameLowercase) {
                result.push(this.capitalize(diagnostic, document));
            }
        }
        return result;
    }

    private capitalize(diagnostic: Diagnostic, document: LangiumDocument): CodeAction {
        const name = document.textDocument.getText(diagnostic.range);
        const newText = name.charAt(0).toUpperCase() + name.slice(1);
        return {
            title: `Rename to '${newText}'`,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            isPreferred: true,
            // the key must be the document URI string
            edit: { changes: { [document.textDocument.uri]: [{ range: diagnostic.range, newText }] } }
        };
    }
}
```

Built-in diagnostics carry codes too: `DocumentValidator.LinkingError` with `LinkingErrorData` (`containerType`, `property`, `refText`) is the hook for "create missing element" fixes. Test with `testCodeAction` from `langium/test`.

### Hover and documentation

The default hover shows the JSDoc-style comment (`/** ... */`) directly before the declaration, for the declaration and for every reference to it. Comments on grammar keywords show when hovering keywords. Pick the extension point:

| Need | Override |
| --- | --- |
| Docs come from a different comment style or a property | `documentation.CommentProvider` (`DefaultCommentProvider.getComment`) |
| Comments aren't JSDoc, or you want custom markdown | `documentation.DocumentationProvider` (`JSDocDocumentationProvider`) |
| Hover should show more than docs (type, signature) | `lsp.HoverProvider` (extend `MultilineCommentHoverProvider`) |

`DocumentationProvider` also feeds completion item documentation, so prefer it over a custom hover when the content is just docs.

```ts
import type { AstNode } from 'langium';
import { MultilineCommentHoverProvider } from 'langium/lsp';
import * as ast from './generated/ast.js';

export class MyDslHoverProvider extends MultilineCommentHoverProvider {
    protected override async getAstNodeHoverContent(node: AstNode): Promise<string | undefined> {
        const docs = await super.getAstNodeHoverContent(node);
        if (ast.isFeature(node)) {
            const signature = '```mydsl\n' + `${node.name}: ${node.type}` + '\n```';
            return docs ? `${signature}\n\n${docs}` : signature;
        }
        return docs;
    }
}
// module: lsp: { HoverProvider: (services) => new MyDslHoverProvider(services) }
```

### Completion

The default proposes keywords and cross-reference candidates from the scope. It proposes nothing for terminals or data type rules. Extend `DefaultCompletionProvider`:

```ts
import { AstUtils, GrammarAST, type AstNodeDescription, type MaybePromise, type ReferenceInfo, type Stream } from 'langium';
import { DefaultCompletionProvider, type CompletionAcceptor, type CompletionContext, type CompletionProviderOptions, type NextFeature } from 'langium/lsp';
import { CompletionItemKind, InsertTextFormat } from 'vscode-languageserver';
import * as ast from './generated/ast.js';

export class MyDslCompletionProvider extends DefaultCompletionProvider {
    // characters that trigger completion besides identifier characters
    override readonly completionOptions: CompletionProviderOptions = { triggerCharacters: ['.'] };

    // values for a terminal-typed property
    protected override completionFor(context: CompletionContext, next: NextFeature, acceptor: CompletionAcceptor): MaybePromise<void> {
        const rule = AstUtils.getContainerOfType(next.feature, GrammarAST.isParserRule);
        const assignment = AstUtils.getContainerOfType(next.feature, GrammarAST.isAssignment);
        if (rule?.name === 'Feature' && assignment?.feature === 'type') {
            for (const type of ['string', 'int', 'boolean']) {
                acceptor(context, { label: type, kind: CompletionItemKind.TypeParameter, sortText: '0' });
            }
            return;
        }
        return super.completionFor(context, next, acceptor);
    }

    // a snippet next to the plain keyword
    protected override completionForKeyword(context: CompletionContext, keyword: GrammarAST.Keyword, acceptor: CompletionAcceptor): MaybePromise<void> {
        if (keyword.value === 'entity') {
            acceptor(context, {
                label: 'entity',
                kind: CompletionItemKind.Snippet,
                detail: 'Entity declaration',
                insertText: 'entity ${1:Name} {\n\t$0\n}',
                insertTextFormat: InsertTextFormat.Snippet,
                sortText: '0'
            });
        }
        return super.completionForKeyword(context, keyword, acceptor);
    }

    // filter cross-reference candidates: an entity cannot extend itself
    protected override getReferenceCandidates(refInfo: ReferenceInfo, context: CompletionContext): Stream<AstNodeDescription> {
        const candidates = super.getReferenceCandidates(refInfo, context);
        const container = refInfo.container;
        if (ast.isEntity(container) && refInfo.property === 'superType') {
            return candidates.filter(c => c.name !== container.name);
        }
        return candidates;
    }
}
```

Other hooks: `filterKeyword` (by default hides keywords without letters, such as `{`), `createReferenceCompletionItem` (label, detail), `NodeKindProvider` (item icons), `DocumentationProvider` (item docs). Since 4.4 the default builds insert/replace edits when the client supports them. Pass `insertText` rather than your own `textEdit` to keep that behavior. Test with `expectCompletion` ([testing.md](testing.md)).

### Signature help

Implement the interface directly when you need the cursor offset to pick the active parameter:

```ts
import { AstUtils, CstUtils, type LangiumDocument, type MaybePromise } from 'langium';
import type { SignatureHelpProvider } from 'langium/lsp';
import type { SignatureHelp, SignatureHelpOptions, SignatureHelpParams } from 'vscode-languageserver';
import * as ast from './generated/ast.js';

export class MyDslSignatureHelpProvider implements SignatureHelpProvider {
    get signatureHelpOptions(): SignatureHelpOptions {
        return { triggerCharacters: ['('], retriggerCharacters: [','] };
    }

    provideSignatureHelp(document: LangiumDocument, params: SignatureHelpParams): MaybePromise<SignatureHelp | undefined> {
        const root = document.parseResult.value.$cstNode;
        const offset = document.textDocument.offsetAt(params.position);
        const leaf = root && CstUtils.findLeafNodeBeforeOffset(root, offset);
        const call = AstUtils.getContainerOfType(leaf?.astNode, ast.isCall);
        const fn = call?.func.ref;
        if (!call || !fn) {
            return undefined;
        }
        // the active parameter is the number of arguments that end before the cursor
        const active = call.args.filter(arg => arg.$cstNode && arg.$cstNode.end < offset).length;
        const label = `${fn.name}(${fn.params.map(p => p.name).join(', ')})`;
        return {
            signatures: [{ label, parameters: fn.params.map(p => ({ label: p.name })) }],
            activeSignature: 0,
            activeParameter: Math.min(active, Math.max(fn.params.length - 1, 0))
        };
    }
}
```

For simple cases, extend `AbstractSignatureHelpProvider` and implement `getSignatureFromElement(element, cancelToken)`, which receives the AST node under the cursor.

### Inlay hints

Extend `AbstractInlayHintProvider` (from `langium/lsp`) and implement `computeInlayHint(node, acceptor)`. It runs for every AST node in the requested range; `acceptor` takes an LSP `InlayHint`. Register as `InlayHintProvider: () => new MyDslInlayHintProvider()`.

```ts
// inside computeInlayHint: show parameter names before call arguments, `f(x: 1)`
if (ast.isCall(node) && node.func.ref) {
    const params = node.func.ref.params;
    for (let i = 0; i < node.args.length && i < params.length; i++) {
        const start = node.args[i].$cstNode?.range.start;
        if (start) {
            acceptor({ position: start, label: `${params[i].name}:`, kind: InlayHintKind.Parameter, paddingRight: true });
        }
    }
}
```

### Code lens and commands

A code lens runs a command. Implement `CodeLensProvider.provideCodeLens(document, params)` (from `langium/lsp`) in the **language** module, returning `{ range, command: { title, command, arguments } }` items, for example one per entity at `entity.$cstNode.range`. Server-side commands come from an `ExecuteCommandHandler` in the **shared** module; `vscode-languageclient` registers the advertised command names in VS Code for you.

```ts
import { URI } from 'langium';
import { AbstractExecuteCommandHandler, type ExecuteCommandAcceptor, type LangiumSharedServices } from 'langium/lsp';

export class MyDslCommandHandler extends AbstractExecuteCommandHandler {
    constructor(private readonly shared: LangiumSharedServices) {
        super();
    }

    registerCommands(acceptor: ExecuteCommandAcceptor): void {
        // runs inside super(): only touch `this.shared` inside the callbacks
        acceptor('mydsl.generate', async ([uri, name]) => {
            const document = this.shared.workspace.LangiumDocuments.getDocument(URI.parse(uri));
            return document ? `generated ${name}` : undefined;
        });
    }
}
```

Command callbacks don't wait for a document state; see [When each request runs](#when-each-request-runs). See [code-generation.md](code-generation.md) for the generator itself.

### Document links

Implement `DocumentLinkProvider.getDocumentLinks(document, params)` (from `langium/lsp`) and return `{ range, target }` items. For the `Import` rule above: stream the AST with `AstUtils.streamAst(root).filter(ast.isImport)`, take the range from `GrammarUtils.findNodeForProperty(imp.$cstNode, 'path')`, and resolve the target with `UriUtils.resolvePath(UriUtils.dirname(document.uri), imp.path).toString()`. Register as `DocumentLinkProvider: () => new MyDslDocumentLinkProvider()`.

### Virtual documents (4.4+)

Builtin library documents with a custom URI scheme can't be opened by the editor. Register `lsp: { TextDocumentContentProvider: (services) => new DefaultTextDocumentContentProvider(services, 'mydsl-builtin') }` in the **shared** module so go to definition opens them (LSP 3.18 `workspace/textDocumentContent`), as `examples/domainmodel/src/language-server/domain-model-module.ts` does. The full builtin library recipe is in [scoping.md](scoping.md#recipe-builtin-library).

## When each request runs

Each request handler waits for `WorkspaceManager.ready`, then for a document or workspace state, before calling your provider. Use this table when a provider sees stale or unlinked data.

| Required state | Waits for | Requests |
| --- | --- | --- |
| `Parsed` | this document | document symbols, folding ranges, formatting (all three), document links |
| `Linked` | this document | completion, definition, type definition, declaration, hover, semantic tokens |
| `IndexedReferences` | this document | inlay hints, signature help, code lens |
| `Validated` | this document | code actions |
| `IndexedContent` | whole workspace | workspace symbols |
| `IndexedReferences` | whole workspace | references, rename, implementation, document highlight, call hierarchy, type hierarchy |

Commands and `textDocumentContent` don't wait for a state. Override per request with `startLanguageServer(shared, serviceRequirements)`, keyed by service name, using `DocumentState.X` (from `langium`) for the document or `WorkspaceState.X` (from `langium/lsp`) for the workspace. For example, code lenses that show cross-file reference counts need `startLanguageServer(shared, { CodeLensProvider: WorkspaceState.IndexedReferences })`.

## Best practices

- Extend the `Abstract*` or `Default*` class and override one method. Reimplement the interface only when the base hides data you need (as in the signature help recipe).
- Drive quick fixes from `data.code`, not from message text. Keep codes in one exported namespace shared by the validator and the code action provider.
- Put shared docs in `DocumentationProvider` so hover and completion stay consistent.
- Restrict what can be referenced in the scope provider ([scoping.md](scoping.md)). Filtering in `getReferenceCandidates` only hides proposals; linking still accepts them.
- Providers run on broken documents. Guard every `ref`, `$cstNode`, and optional property. `services.shared.AstReflection.isComplete(node)` (4.3+) tells you if a node is missing mandatory properties.
- Pass the cancel token to long loops (`await interruptAndCheck(cancelToken)`) in providers that walk the whole AST.
- Write a `langium/test` test per provider: `expectFormatting`, `expectCompletion`, `expectHover`, `testCodeAction`, `highlightHelper` with `expectSemanticToken` ([testing.md](testing.md)).

## Pitfalls

| Symptom | Fix |
| --- | --- |
| Feature does nothing, no errors | The provider class isn't registered. Add it under `lsp` in the language module (shared module for `ExecuteCommandHandler`, `TextDocumentContentProvider`, `FileOperationHandler`) and check that module is passed to `inject` |
| Editor never sends the request | The capability isn't advertised. It is computed once in `initialize` from registered services: register the language with `ServiceRegistry` before the server starts, and for signature help return non-empty `triggerCharacters` |
| Formatter returns no edits | `AbstractFormatter` skips documents with lexer or parser errors, and range formatting stops at the first error line. Fix the syntax first. Also check `keyword('...')` matches the grammar keyword exactly |
| On-type formatting never triggers | Override `formatOnTypeOptions` |
| Semantic token colors don't show | The theme has no style for the token type, or `editor.semanticHighlighting.enabled` is off. Custom token types need `semanticTokenTypes` and `semanticTokenScopes` contributions in the VS Code extension's `package.json` |
| Quick fix missing | The diagnostic has no `data.code`, or it is set on `code` only. The client only sends diagnostics overlapping the cursor range |
| Hover empty | The comment isn't `/** ... */`, isn't directly before the declaration, or the comment terminal isn't `hidden`. Override `CommentProvider` or `DocumentationProvider` for other styles |
| Custom completion item never shows | The typed prefix doesn't fuzzy-match the `label`, so `fillCompletionItem` drops it. Make the label match, or supply `textEdit` |
| Command fails with undefined fields | `registerCommands` runs inside the `AbstractExecuteCommandHandler` constructor. Read instance fields only inside command callbacks |
| `startLanguageServer` throws about `Connection` | Pass `{ connection, ...NodeFileSystem }` to `createMyDslServices` |
| Type errors such as "Connection is not assignable to Connection", or requests silently failing after upgrading Langium | Two copies of `vscode-languageserver`. Match the version table in [troubleshooting.md](troubleshooting.md#8-dependencies-and-versions) and check `npm ls vscode-languageserver` |

## Source and examples

- Default wiring: `node_modules/langium/src/lsp/default-lsp-module.ts`; service keys: `lsp/lsp-services.ts`
- Request states and capabilities: `node_modules/langium/src/lsp/language-server.ts`
- Providers: `node_modules/langium/src/lsp/<feature>` (for example `formatter.ts`, `semantic-token-provider.ts`, `completion/completion-provider.ts`, `execute-command-handler.ts`)
- Documentation: `node_modules/langium/src/documentation/` (`comment-provider.ts`, `documentation-provider.ts`, `jsdoc.ts`)
- Reference implementations for Langium's own grammar language: `node_modules/langium/src/grammar/lsp/` (semantic tokens, completion, code actions)
- Examples on GitHub ([eclipse-langium/langium](https://github.com/eclipse-langium/langium/tree/main/examples)): `examples/domainmodel/src/language-server/domain-model-formatter.ts`, `domain-model-module.ts` (formatter, rename, `TextDocumentContentProvider`); `examples/arithmetics/src/language-server/lsp/arithmetics-code-actions.ts` and `arithmetics-validator.ts` (code action from diagnostic data)
- Docs: [Formatting](https://langium.org/docs/recipes/formatting/), [Configuration via services](https://langium.org/docs/reference/configuration-services/)
