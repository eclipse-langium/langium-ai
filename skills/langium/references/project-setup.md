# Project setup, configuration, and service wiring

## When to read this

Read this when you create a Langium project, change `langium-config.json`, run the Langium CLI, choose an import entry point, wire or override services in the module file, run the language in Node, a browser, or a CLI, or bundle it.

## Contents

1. [Scaffold a project](#scaffold-a-project)
2. [Configure `langium generate`](#configure-langium-generate)
3. [Entry points](#entry-points)
4. [Wire services for a language server](#wire-services-for-a-language-server)
5. [Override and add services](#override-and-add-services)
6. [Headless services for CLIs and libraries](#headless-services-for-clis-and-libraries)
7. [Start a language server in Node or the browser](#start-a-language-server-in-node-or-the-browser)
8. [Bundle with esbuild](#bundle-with-esbuild)
9. [Best practices](#best-practices)
10. [Pitfalls](#pitfalls)
11. [Source and examples](#source-and-examples)

## Scaffold a project

```sh
npm i -g yo generator-langium
yo langium
```

The generator asks for the extension name, language name, file extensions, entry rule name, and whether to include a VS Code extension, an example language, a CLI, and tests. It installs, runs `langium:generate`, and builds. Result (language id `my-lang`):

```
package.json                 # npm workspaces; scripts: build, watch, langium:generate, langium:watch, test
tsconfig.build.json
packages/
  language/
    langium-config.json
    src/
      my-lang.langium        # grammar
      my-lang-module.ts      # DI wiring: createMyLangServices()
      my-lang-validator.ts   # custom checks
      index.ts               # re-exports module, validator, generated files
      generated/             # ast.ts, grammar.ts, module.ts (never edit)
    syntaxes/                # generated TextMate grammar
    test/                    # vitest: parsing, linking, validating
  cli/src/                   # main.ts, generator.ts, util.ts
  extension/src/
    extension/main.ts        # VS Code language client
    language/main.ts         # Node language server entry
```

Requirements for 4.4: Node `^22.22.2 || ^24.15.0 || >=26`, TypeScript 5.8 or later, ESM (`"type": "module"`, `"module": "NodeNext"`). Keep `langium` and `langium-cli` on the same minor version.

## Configure `langium generate`

`langium generate` reads `langium-config.json` in the current directory, or the `"langium"` object in `package.json` if no config file exists. It writes `ast.ts`, `grammar.ts`, and `module.ts` to `out`, plus any syntax files you enable.

```json
{
    "projectName": "MyLang",
    "languages": [{
        "id": "my-lang",
        "grammar": "src/my-lang.langium",
        "fileExtensions": [".mylang"],
        "textMate": { "out": "syntaxes/my-lang.tmLanguage.json" },
        "monarch": { "out": "syntaxes/my-lang.monarch.ts" }
    }],
    "out": "src/generated"
}
```

Options you are likely to change:

| Option | Level | Effect |
| --- | --- | --- |
| `projectName` | top | Prefix of `<Project>AstReflection`, `<Project>GeneratedSharedModule`, `<Project>AstType`. Must be an identifier |
| `out` | top | Output folder for generated TypeScript |
| `importExtension` | top | Extension in generated imports, default `.js`. Use `""` only if your bundler or `moduleResolution` requires it |
| `mode` | top | `production` minifies `grammar.ts` and disables Chevrotain grammar checks at runtime (faster startup, no ambiguity logs) |
| `validation.types` | top | `"strict"` forbids inferred types (see [grammar.md](grammar.md)) |
| `chevrotainParserConfig` | top or language | `recoveryEnabled`, `nodeLocationTracking`, `maxLookahead` (setting it switches from LL(*) to LL(k)), `skipValidations` |
| `fileExtensions`, `fileNames` | language | Which files belong to the language (`fileExtensions` with leading dot, required by the schema); `fileNames` matches exact names such as `Dockerfile` |
| `caseInsensitive` | language | Case-insensitive keywords |
| `textMate`, `monarch`, `prism` | language | Generate a highlighting grammar for VS Code, Monaco, or Prism |
| `railroad` | language | Syntax diagrams (`mode: "html" \| "svg"`, `css`) |
| `bnf` | language | BNF export (`dialect: "GBNF" \| "EBNF"`), useful for constrained LLM decoding |

Each language contributes `<Grammar>GeneratedModule` and `<Grammar>LanguageMetaData` (named after the `grammar` declaration), and `ParserConfig` when a parser config is set. Several languages in one config share one `<Project>GeneratedSharedModule`; see [multi-language.md](multi-language.md).

CLI commands (binary `langium` from `langium-cli`):

```sh
langium generate                  # one-shot; exit code 2 on grammar errors
langium generate --watch          # -w: regenerate when a grammar changes
langium generate --mode production   # -m: overrides "mode" for this run
langium generate --file path/to/langium-config.json   # -f: config file or package.json
langium extract-types src/my-lang.langium -o src/types.langium   # inferred types as declarations; -f overwrites
```

Run generation before `tsc` in your build script (`"build": "langium generate && tsc -b"`), or commit the generated files.

## Entry points

Import from the narrowest entry point. Wrong imports are a frequent cause of "is not exported" errors.

| Import from | Contains | Use in |
| --- | --- | --- |
| `langium` | Core: `inject`, `Module`, `createDefaultCoreModule`, `createDefaultSharedCoreModule`, `EmptyFileSystem`, `URI`, `AstUtils`, `CstUtils`, `GrammarAST`, parser, references, validation, workspace, `Default*` core services | Everywhere |
| `langium/lsp` | `createDefaultModule`, `createDefaultSharedModule`, `startLanguageServer`, `LangiumServices`, `PartialLangiumServices`, all LSP providers (`AbstractFormatter`, `AbstractSemanticTokenProvider`, `DefaultCompletionProvider`, ...) | Language server and module file |
| `langium/node` | `NodeFileSystem`, `WorkerThreadAsyncParser` | Node only, never in browser bundles |
| `langium/test` | `parseHelper`, `validationHelper`, `expect*` helpers | Tests ([testing.md](testing.md)) |
| `langium/generate` | `expandToNode`, `joinToNode`, `toString`, tracing | Code generators ([code-generation.md](code-generation.md)) |
| `langium/grammar` | Grammar language services, `createServicesForGrammar` | Tools that process `.langium` files, quick experiments |

Use `NodeFileSystem` for language servers and CLIs that read files from disk. Use `EmptyFileSystem` in browsers and in all tests, including vitest tests, which run in Node.js but work on in-memory documents.

## Wire services for a language server

This is the scaffolded module, extended with a custom service, a language-level override, and a shared override. Language services exist once per language; shared services (workspace, index, document builder, LSP server) exist once per server.

```ts
import { inject, type Module } from 'langium';
import {
    createDefaultModule, createDefaultSharedModule, type DefaultSharedModuleContext,
    type LangiumServices, type LangiumSharedServices, type PartialLangiumServices, type PartialLangiumSharedServices
} from 'langium/lsp';
import { MyLangGeneratedModule, MyLangGeneratedSharedModule } from './generated/module.js';
import { MyLangScopeProvider } from './my-lang-scope-provider.js';
import { MyLangValidator, registerValidationChecks } from './my-lang-validator.js';
import { MyLangWorkspaceManager } from './my-lang-workspace-manager.js';

// services that Langium does not know about
export type MyLangAddedServices = {
    validation: {
        MyLangValidator: MyLangValidator
    }
};

export type MyLangServices = LangiumServices & MyLangAddedServices;

// language-specific overrides and additions
export const MyLangModule: Module<MyLangServices, PartialLangiumServices & MyLangAddedServices> = {
    references: {
        ScopeProvider: (services) => new MyLangScopeProvider(services)
    },
    validation: {
        MyLangValidator: () => new MyLangValidator()
    }
};

// overrides of shared services
export const MyLangSharedModule: Module<LangiumSharedServices, PartialLangiumSharedServices> = {
    workspace: {
        WorkspaceManager: (services) => new MyLangWorkspaceManager(services)
    }
};

export function createMyLangServices(context: DefaultSharedModuleContext): {
    shared: LangiumSharedServices,
    MyLang: MyLangServices
} {
    const shared = inject(
        createDefaultSharedModule(context),
        MyLangGeneratedSharedModule,
        MyLangSharedModule
    );
    const MyLang = inject(
        createDefaultModule({ shared }),
        MyLangGeneratedModule,
        MyLangModule
    );
    shared.ServiceRegistry.register(MyLang);
    registerValidationChecks(MyLang);
    if (!context.connection) {
        // not running in a language server: no client will send configuration
        shared.workspace.ConfigurationProvider.initialized({});
    }
    return { shared, MyLang };
}
```

`inject` merges modules left to right, so later modules win. Keep the order default, generated, yours.

## Override and add services

1. Find the default in `node_modules/langium/src/` (core) or `node_modules/langium/src/lsp/` and extend it. Override only the method you need and call `super` for the rest.
2. Register it under the **same path** as the default: `references.ScopeProvider`, `references.ScopeComputation`, `references.NameProvider`, `parser.ValueConverter`, `parser.TokenBuilder`, `lsp.Formatter`, `lsp.SemanticTokenProvider`, `lsp.CodeActionProvider`, `workspace.WorkspaceManager` (shared), and so on. The path is visible in `LangiumCoreServices` (`services.ts`) and `LangiumLSPServices` (`lsp/lsp-services.ts`).
3. Put language services in the language module and shared services in the shared module. With the module typed as shown, a shared service in the language module is a compile error ("'WorkspaceManager' does not exist in type"); in an untyped module it is silently ignored.
4. For new services, add them to `MyLangAddedServices` so the module type requires a factory and other services can read `services.validation.MyLangValidator`.

The module is type-checked against `PartialLangiumServices`, so a typo in a path or a wrong class is a compile error. Optional LSP services (formatter, semantic tokens, code actions) do nothing until registered; see [lsp-features.md](lsp-features.md).

### Fixing "Cycle detected. Please make "X" lazy."

Factories run lazily on first access. A cycle appears when two constructors read each other's service: store a getter (`this.x = () => services.group.X`) instead of the instance and call it where needed. Details and a snippet are in [how-langium-works.md](how-langium-works.md#4-dependency-injection-essentials). "Construction failure. Please make sure that your dependencies are constructable" means a factory threw earlier; fix the original error printed in the cause.

## Headless services for CLIs and libraries

The scaffolded `createMyLangServices(NodeFileSystem)` works without a connection and is the simplest choice for a CLI. Use the core modules when the code must not depend on LSP packages (libraries, workers, batch tools). Core services include parsing, linking, scoping, validation, and the workspace, but no `lsp.*` services.

```ts
import {
    createDefaultCoreModule, createDefaultSharedCoreModule, EmptyFileSystem, inject,
    type LangiumCoreServices, type LangiumSharedCoreServices, type Module, type PartialLangiumCoreServices
} from 'langium';
import { MyLangGeneratedModule, MyLangGeneratedSharedModule } from './generated/module.js';
import { MyLangScopeProvider } from './my-lang-scope-provider.js';

export const MyLangCoreModule: Module<LangiumCoreServices, PartialLangiumCoreServices> = {
    references: {
        ScopeProvider: (services) => new MyLangScopeProvider(services)
    }
};

export function createMyLangCoreServices(context = EmptyFileSystem): {
    shared: LangiumSharedCoreServices,
    MyLang: LangiumCoreServices
} {
    const shared = inject(createDefaultSharedCoreModule(context), MyLangGeneratedSharedModule);
    const MyLang = inject(createDefaultCoreModule({ shared }), MyLangGeneratedModule, MyLangCoreModule);
    shared.ServiceRegistry.register(MyLang);
    shared.workspace.ConfigurationProvider.initialized({});
    return { shared, MyLang };
}
```

Pass `NodeFileSystem` from `langium/node` as `context` to read from disk. Share the language module between both factories by typing it with `LangiumCoreServices` if it contains only core overrides.

Load, build, and validate documents:

```ts
import { URI, type LangiumDocument } from 'langium';
import { NodeFileSystem } from 'langium/node';
import * as path from 'node:path';
import type { Model } from './generated/ast.js';
import { createMyLangServices } from './my-lang-module.js';

export async function loadModel(fileName: string, workspaceRoot?: string): Promise<Model> {
    const shared = createMyLangServices(NodeFileSystem).shared;
    if (workspaceRoot) {
        // load all files of the workspace so cross-file references resolve
        await shared.workspace.WorkspaceManager.initializeWorkspace([
            { name: path.basename(workspaceRoot), uri: URI.file(path.resolve(workspaceRoot)).toString() }
        ]);
    }
    const document = await shared.workspace.LangiumDocuments.getOrCreateDocument(
        URI.file(path.resolve(fileName))) as LangiumDocument<Model>;
    // validation is off unless requested
    await shared.workspace.DocumentBuilder.build([document], { validation: true });
    const errors = (document.diagnostics ?? []).filter(d => d.severity === 1);
    if (errors.length > 0) {
        throw new Error(errors.map(e => `line ${e.range.start.line + 1}: ${e.message}`).join('\n'));
    }
    return document.parseResult.value;
}
```

For in-memory text use `shared.workspace.LangiumDocumentFactory.fromString(text, URI.parse('memory:/input.mylang'))`, then `LangiumDocuments.addDocument(document)` before building.

## Start a language server in Node or the browser

Node (VS Code extension, other desktop editors):

```ts
import { startLanguageServer } from 'langium/lsp';
import { NodeFileSystem } from 'langium/node';
import { createConnection, ProposedFeatures } from 'vscode-languageserver/node';
import { createMyLangServices } from './my-lang-module.js';

const connection = createConnection(ProposedFeatures.all);
const { shared } = createMyLangServices({ connection, ...NodeFileSystem });
startLanguageServer(shared);
```

Browser (web worker, for Monaco or a playground). No `langium/node`, no file system; the client sends documents.

```ts
import { EmptyFileSystem } from 'langium';
import { startLanguageServer } from 'langium/lsp';
import { BrowserMessageReader, BrowserMessageWriter, createConnection } from 'vscode-languageserver/browser';
import { createMyLangServices } from './my-lang-module.js';

declare const self: DedicatedWorkerGlobalScope;

const connection = createConnection(new BrowserMessageReader(self), new BrowserMessageWriter(self));
const { shared } = createMyLangServices({ connection, ...EmptyFileSystem });
startLanguageServer(shared);
```

Keep `vscode-languageserver` (and `vscode-languageclient` in the extension) on the version Langium depends on: `~10.1.0` for Langium 4.4, `~10.0.0` for 4.3, `~9.0.1` for 4.0 to 4.2.

## Bundle with esbuild

Langium is ESM only. VS Code still loads extensions as CommonJS, so bundle both the client and the server to `.cjs` (simplified from the scaffolded `packages/extension/esbuild.mjs`):

```js
//@ts-check
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const minify = process.argv.includes('--minify');

const ctx = await esbuild.context({
    entryPoints: ['src/extension/main.ts', 'src/language/main.ts'],
    outdir: 'out',
    bundle: true,
    target: 'ES2017',
    format: 'cjs',
    outExtension: { '.js': '.cjs' },
    loader: { '.ts': 'ts' },
    external: ['vscode'],       // provided by VS Code at runtime
    platform: 'node',
    sourcemap: !minify,
    minify
});

if (watch) {
    await ctx.watch();
} else {
    await ctx.rebuild();
    ctx.dispose();
}
```

Point the client at the bundled server (`context.asAbsolutePath('out/language/main.cjs')`). For a browser worker: `esbuild src/main-browser.ts --bundle --format=iife --outfile=public/my-lang-server-worker.js`. Generate with `--mode production` for shipped builds.

## Best practices

- One `create<Lang>Services` function per project, used by the language server, CLI, and tests alike, so all of them see the same overrides and validators.
- Extend `Default*` classes and register them in a module; never patch services after `inject` or monkey-patch prototypes.
- Keep `generated/` out of manual edits and out of lint/format runs; regenerate in `build`.
- Import `langium/node` only from Node entry points so the module file stays browser-safe.
- Prefer LL(*) (no `maxLookahead`) unless you need LL(k) error checks; use `mode: production` for releases.
- Pin `langium`, `langium-cli`, and `vscode-languageserver` together and upgrade them together.

## Pitfalls

| Symptom | Cause and fix |
| --- | --- |
| Override has no effect | Not registered, registered under the wrong path, or put in the language module although it is shared (or vice versa). Check the path in `services.ts`/`lsp-services.ts` and the module passed to `inject` |
| Custom validator never runs | `registerValidationChecks(services)` is not called in `create<Lang>Services`, or the CLI builds without `{ validation: true }` ([validation.md](validation.md)) |
| `Cycle detected. Please make "X" lazy.` | Two constructors depend on each other. Store `() => services.x.Y` and call it later |
| "Could not resolve reference" only in the CLI | Only the single document was loaded. Call `WorkspaceManager.initializeWorkspace` or load all files before `build` |
| `ERR_PACKAGE_PATH_NOT_EXPORTED` / `No "exports" main defined` for `langium` | Code compiled to CommonJS `require`s Langium. Use ESM (`"type": "module"`, `NodeNext`) or bundle with esbuild |
| `'X' is not exported from 'langium'` | It lives in another entry point, typically `langium/lsp` (`createDefaultModule`, `startLanguageServer`, providers) or `langium/node` (`NodeFileSystem`) |
| Browser bundle fails on `fs`, `path`, or `worker_threads` | `langium/node` or Node APIs reached the browser entry. Use `EmptyFileSystem` from `langium` |
| Type errors such as "Connection is not assignable" after an upgrade | Two copies of `vscode-languageserver`. Match the version Langium requires and dedupe |
| `langium generate` says it cannot find the config | Run it in the folder with `langium-config.json`, or pass `-f` |
| Generated types do not match the grammar | Generation was not rerun or failed. Run `npm run langium:generate` and read its output ([troubleshooting.md](troubleshooting.md)) |
| `getConfiguration` never resolves outside a language server | `ConfigurationProvider.initialized({})` was not called when there is no connection |

## Source and examples

- Module factories: `node_modules/langium/src/default-module.ts`, `node_modules/langium/src/lsp/default-lsp-module.ts`
- Service types: `node_modules/langium/src/services.ts`, `node_modules/langium/src/lsp/lsp-services.ts`
- DI: `node_modules/langium/src/dependency-injection.ts`
- File systems: `node_modules/langium/src/workspace/file-system-provider.ts`, `node_modules/langium/src/node/node-file-system-provider.ts`
- CLI config: `node_modules/langium-cli/langium-config-schema.json`, `node_modules/langium-cli/src/package-types.ts`
- Examples on GitHub (`eclipse-langium/langium`): `examples/domainmodel/src/language-server/domain-model-module.ts` (language and shared overrides), `examples/*/src/language-server/main.ts` and `main-browser.ts`, `examples/domainmodel/src/cli/cli-util.ts`, `packages/generator-langium/templates/`
- Docs: https://langium.org/docs/reference/configuration-services/, https://langium.org/docs/recipes/code-bundling/, https://langium.org/docs/learn/workflow/
