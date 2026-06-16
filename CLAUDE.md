# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Langium AI is a TypeScript monorepo for integrating LLMs with Langium DSLs. It provides tools to evaluate LLM-generated DSL output, split/process DSL documents respecting language structure, and a CLI for bootstrapping AI-powered tooling in Langium projects.

## Commands

```bash
# Build & test (all workspaces)
npm run build
npm run test

# Lint & format
npm run lint              # oxlint
npm run format            # biome check
npm run format:fix        # biome auto-fix

# Single package (from root)
npm run build -w packages/cli
npm run test -w packages/cli
npm run test -w packages/langium-ai-tools

# CLI dev mode
cd packages/cli && npm run dev

# Detect unused code
npm run knip
```

## Monorepo Structure

Four npm workspaces under `packages/`:

- **`cli`** (`langium-ai` on npm) — Commander.js CLI with commands for init, gen, evaluate, status, history, etc. Binary: `lai`.
- **`langium-ai-tools`** — Provider-agnostic core library: evaluator (LangiumEvaluator, EvalMatrix), splitter (ProgramMapper, splitByNode), analyzer (DocumentAnalyzer), and a vitest-style testing API. Uses protobuf for type definitions (`interface.proto` → `src/gen/`).
- **`langium-ai-mcp`** — Model Context Protocol server exposing a `langium-syntax-checker` tool via LangiumEvaluator.
- **`examples/example-dsl-evaluator`** — Example project demonstrating the evaluation workflow.

## Architecture

**CLI command flow**: Each command is a separate module in `packages/cli/src/commands/`, registered in `index.ts`. Core logic lives in `src/core/` (langium detection, descriptor management, config, sysprompt generation, versioning). LLM providers are pluggable via `src/llm/` with a factory in `client.ts` routing to provider modules (Claude, OpenAI, Ollama).

**Key abstractions**:
- `LaiConfig` — project config persisted as YAML, tracks langium paths, LLM provider settings, descriptor/sysprompt paths
- `Descriptor` — YAML-based language descriptor with grammar, examples, and docs
- `LangiumEvaluator` — validates LLM output using actual Langium parser/validator services
- `EvalMatrix` — compares multiple runners (models) against test suites

**Core workflow**: `init` → `gen descriptor` → refine → `gen sysprompt` → `evaluate` → analyze → iterate

**Init subcommands**:
- `lai init` — full project setup (config + install tools + evals)
- `lai init config` — reinitialize just `lai.config.jsonc` (re-detects project structure)
- `lai init evals` — reinitialize just the `evals/` directory and template files (requires existing config)

## Code Style

- **Formatter**: Biome — 4-space indent, 120 char width, single quotes, always semicolons, trailing commas
- **Linter**: oxlint — `curly: error`, `no-explicit-any: warn`, unused vars error (prefix `_` to ignore)
- ESM modules (`"type": "module"`) with strict TypeScript
- Node.js 24.11.1 (see `.nvmrc`)

## Testing

Vitest is used across all packages. The CLI package uses forks pool to allow `process.chdir()` in tests. Run a single test file with:

```bash
npx vitest run path/to/test.ts -w packages/cli
```
