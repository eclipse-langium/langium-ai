---
name: langium
description: Build, fix, and improve Langium 4.x languages. Recipes, best practices, and troubleshooting for `.langium` grammars, scoping and cross-references, validation, LSP features (formatting, semantic tokens, code actions, hover, completion), code generators, `langium/test` tests, `langium-config.json`, and multi-language projects. Use when working in any project that depends on `langium` or `langium-cli`, or when a Langium language misbehaves (parse errors, unresolved references, missing diagnostics or editor features).
user-invocable: false
---

# Langium

Recipes, best practices, and fixes for building languages with [Langium](https://langium.org). This file routes you to the right reference. Read only the references your task needs.

## Version

Written for **Langium 4.x**, verified against **4.4.0**.

Check the version first: `node_modules/langium/package.json` (or the `langium` dependency in `package.json`). If the project uses Langium 3.x or earlier, this skill does not apply. Say so, and recommend upgrading to 4.x before using these recipes. Differences between 4.x minor versions are listed in `references/troubleshooting.md`.

## Orienting in a project

A typical project (scaffolded with `yo langium`) contains:

| What | Where to look |
| --- | --- |
| Grammar | `src/**/*.langium` (path set in `langium-config.json`) |
| Generator config | `langium-config.json` if it exists, otherwise the `"langium"` key in `package.json`. If both exist, the CLI ignores the `package.json` key (unless `--file` points elsewhere) |
| Generated code | `src/**/generated/` (`ast.ts`, `grammar.ts`, `module.ts`). Never edit by hand |
| DI module | `src/**/<language>-module.ts` with `create<Language>Services` |
| Validators | `src/**/<language>-validator.ts` |
| Language server entry | `src/**/main.ts` calling `startLanguageServer` |
| CLI entry and generator | `src/cli/main.ts`, `src/cli/generator.ts` |
| Tests | `test/**/*.test.ts` (vitest) |

Regenerate after every grammar or config change: `npm run langium:generate` (runs `langium generate`), or `npm run langium:watch` while editing.

## Task router

| If you need to... | Read |
| --- | --- |
| Diagnose any misbehavior (parse errors, unresolved references, silent validators, missing editor features, slowness) | `references/troubleshooting.md` |
| Write or change grammar rules, expressions (`infix`), cross-references, types, terminals | `references/grammar.md` |
| Fix keyword/terminal conflicts, keywords as identifiers, indentation-sensitive or case-insensitive lexing, value conversion | `references/grammar.md` |
| Scaffold a project, configure `langium-config.json`, run the CLI, wire DI modules, override a service, bundle | `references/project-setup.md` |
| Pick the right import (`langium`, `langium/lsp`, `langium/node`, ...) or file system | `references/project-setup.md` |
| Add qualified names, imports between files, member access (`a.b.c`), a builtin library, custom scoping | `references/scoping.md` |
| Fix "Could not resolve reference" | `references/scoping.md` (after `references/troubleshooting.md`) |
| Add validation checks, uniqueness checks, document hooks, slow or custom categories, diagnostic codes | `references/validation.md` |
| Add a formatter, semantic tokens, code actions, hover, completion tweaks, inlay hints, signature help, code lens | `references/lsp-features.md` |
| Generate code or text from the AST, write a CLI generator, add tracing | `references/code-generation.md` |
| Write tests for parsing, linking, validation, or LSP features | `references/testing.md` |
| Put several languages in one project, reference across languages | `references/multi-language.md` |
| Understand build phases, `DocumentState`, DI cycles, generated `ast.ts`, AST utilities | `references/how-langium-works.md` |

## Mental model

```
.langium grammar ──langium generate──▶ generated/ast.ts, grammar.ts, module.ts
                                              │
create<Language>Services: inject(default modules, generated modules, your module)
                                              │
DocumentBuilder runs each document through:
  Changed → Parsed → IndexedContent → ComputedScopes → Linked → IndexedReferences → Validated
                                              │
LSP requests (hover, completion, ...) wait for the state they need, then call providers
```

Every behavior is a service. To change behavior, extend the `Default*` class and register it in your module. Details: `references/how-langium-works.md`.

## Golden rules

- Regenerate after every grammar edit. Never edit files in `generated/`.
- Change behavior by overriding services in your DI module, never by patching Langium or generated code.
- Extend the `Default*` implementation and override one method instead of reimplementing an interface.
- Never resolve references (`ref`) inside `collectExportedSymbols` or `collectLocalSymbols`. Scopes aren't ready yet, so the result is `undefined` or bound to the wrong target.
- In an `infix` rule the **first** operator group binds **tightest**. Right associativity is written `right assoc '^'`.
- Optional LSP providers (formatter, semantic tokens, code actions, ...) do nothing until registered in the `lsp` section of your module.
- Language servers use `createDefaultModule` / `createDefaultSharedModule` from `langium/lsp`. Headless tools may use the `Core` variants from `langium`.
- `slow` and custom validation categories never run on document updates (updates run only `built-in` and `fast`). Trigger them explicitly.
- Add a `langium/test` test for every scoping or validation change.
- Check parser and lexer errors before trusting an AST. After errors the AST is partial.

## Entry points

| Import from | Use for |
| --- | --- |
| `langium` | Core types and services, `inject`, `Module`, `AstUtils`, `CstUtils`, `URI`, `EmptyFileSystem`, `createDefaultCoreModule` |
| `langium/lsp` | `createDefaultModule`, `createDefaultSharedModule`, `startLanguageServer`, LSP provider base classes (`AbstractFormatter`, `AbstractSemanticTokenProvider`, `DefaultCompletionProvider`, ...) |
| `langium/node` | `NodeFileSystem` for Node.js language servers and CLIs |
| `langium/test` | `parseHelper`, `validationHelper`, `expectError`, `expectCompletion`, ... |
| `langium/generate` | `expandToNode`, `joinToNode`, `toString`, tracing |
| `langium/grammar` | Services for the Langium grammar language itself (rarely needed) |

Use `NodeFileSystem` for language servers and CLIs that read files from disk. Use `EmptyFileSystem` in the browser and in all tests, including vitest tests, which run in Node.js but work on in-memory documents.

## Reading the source and examples

Langium publishes its TypeScript sources, so read `node_modules/langium/src/<area>/` to see the `Default*` implementation before overriding it (`references/`, `validation/`, `lsp/`, `workspace/`, `parser/`, `generate/`, `test/`).

Canonical examples at [eclipse-langium/langium/examples](https://github.com/eclipse-langium/langium/tree/main/examples):

| Example | Shows |
| --- | --- |
| `domainmodel` | Qualified names, custom scoping, formatter, rename, builtin library |
| `arithmetics` | `infix` expressions, code actions, case-insensitive keywords, interpreter |
| `requirements` | Two languages in one project with cross-language references |
| `statemachine` | Minimal language with a code generator |

## Related skills

- `lai`: the langium-ai CLI for descriptors, system prompts, and evaluations of LLM output in Langium projects.
