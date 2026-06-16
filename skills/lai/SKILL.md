---
name: lai
description: Guide for using the langium-ai (LAI) CLI to generate language descriptors, synthesize system prompts, run evaluations, and iteratively refine AI-powered tooling in Langium projects. Use when working with lai commands, descriptors, or evaluation files.
user-invocable: false
---

# langium-ai CLI (LAI) - Usage Guide

A CLI for bootstrapping AI-powered tooling in Langium projects. It generates language descriptors from your project structure, synthesizes system prompts from those descriptors, and runs evaluations to measure prompt quality — forming a refinement loop where you iteratively improve your descriptor and prompts based on evaluation results.

## Workflow Overview

The core workflow is a loop:

```
init → generate descriptor → refine descriptor → generate sysprompt → evaluate → analyze results → refine → repeat
```

1. **Initialize** (`lai init`) — one-time project setup
2. **Generate descriptor** (`lai gen descriptor`) — map your Langium project into a structured YAML descriptor
3. **Validate descriptor** (`lai validate`) — check the descriptor schema and verify all referenced files exist
4. **Refine the descriptor** — manually correct and enrich the generated descriptor so it accurately represents your language
5. **Generate system prompt** (`lai gen sysprompt`) — produce a system prompt from the descriptor
6. **Evaluate** (`lai evaluate`) — run evaluation cases against the system prompt via your configured LLM
7. **Analyze results** — use `lai show`, `lai compare`, `lai stats`, `lai history` to understand what passed and failed
8. **Refine and repeat** — adjust the descriptor, or evaluation cases, then regenerate and re-evaluate

## Step 1: Initialize

```bash
lai init
```

Interactive setup that:
- Detects your Langium project structure (grammar files, langium-config.json, custom services)
- Prompts you to choose an LLM provider (claude, openai, ollama)
- Creates `lai.config.jsonc` with detected paths and provider config
- Sets up an `evals/` directory with a starter evaluation file

### Reinitializing Parts of the Setup

If you need to reinitialize just the config or just the evals without running the full init flow:

```bash
# reinitialize only the lai.config.jsonc file (re-detects project structure)
lai init config

# reinitialize only the evals/ directory and regenerate template files
# requires an existing lai.config.jsonc — run `lai init` first if you don't have one
lai init evals
```

`lai init config` re-detects your Langium project structure and regenerates `lai.config.jsonc`. This is useful if your project structure has changed (e.g., moved grammar files or added new services) and you want to update the config without touching evals.

`lai init evals` regenerates the `evals/` directory with fresh template files (`utils.ts` and `basic.eval.ts`). It prompts before overwriting `basic.eval.ts` if it already exists. This is useful if templates have been updated in a newer version of LAI or if you want a clean starting point for your evaluations.

The resulting `lai.config.jsonc` looks like:

```jsonc
{
  "version": "1.0",
  "langium": {
    "configPath": "./langium-config.json",
    "grammarPath": "./src/grammar/my-dsl.langium"
  },
  "descriptor": {
    "path": "language.descriptor.yml",
    "autoVersion": true  // saves previous versions as .1.yml, .2.yml, etc.
  },
  "sysprompt": {
    "path": "language.sysprompt.md",
    "autoVersion": true
  },
  "llm": {
    "provider": "claude",
    "model": "claude-sonnet-4-6"
    // provider-specific config follows
  },
  "evaluations": {
    "directory": "evals"
  },
  "project": {
    "name": "my-dsl"
  }
}
```

## Step 2: Generate a Descriptor

```bash
# generate from project analysis (uses LLM to synthesize)
lai gen descriptor

# regenerate from scratch, ignoring the existing descriptor
lai gen descriptor --fresh
```

Produces `language.descriptor.yml` — a structured YAML file that maps your Langium project. The descriptor is the single source of truth that drives all prompt generation.

### Descriptor Structure

```yaml
name: my-dsl
version: 0.1.0
description: A domain-specific language for ...

# langium project references
langium_config: ./langium-config.json
case_sensitive: true
grammar: ./src/grammar/my-dsl.langium
builtins: ./src/builtins/my-dsl-builtins.langium  # built-in types/functions always in scope

# custom langium services (optional, only include what exists)
services:
  validator: ./src/validation/my-dsl-validator.ts
  scope_provider: ./src/scoping/my-dsl-scope-provider.ts
  token_builder: ./src/my-dsl-token-builder.ts
  # also: module, scope_computation, linker, name_provider, type_provider, value_converter

# testing and examples
tests: ./test/
examples:
  - name: Basic Example
    description: A simple program demonstrating core syntax.
    file: ./examples/basic.mydsl
    tags: [beginner, syntax]
  - name: Advanced Example
    description: Demonstrates complex features.
    file: ./examples/advanced.mydsl
    tags: [advanced]

# external documentation
documentation:
  - src: https://my-dsl-docs.example.com/guide/
    description: Comprehensive language guide.
    priority: high

# import additional descriptor fragments
imports:
  - ./descriptors/builtins.yml
  - ./descriptors/advanced-features.yml
```

## Step 3: Refine the Descriptor

The generated descriptor is a starting point. You should review and correct it:

- **Verify paths** — ensure all file references (grammar, services, examples) are correct
- **Add missing examples** — more examples produce better prompts; tag them for organization
- **Add documentation links** — external docs with `priority: high` are weighted more heavily
- **Use imports** — split large descriptors into fragments via the `imports` array

## Step 4: Generate a System Prompt

```bash
# generate a sys prompt
lai gen sysprompt

# regenerate from scratch
lai gen sysprompt --fresh
```

Produces a markdown file (e.g., `language.sysprompt.md`). The system prompt is what should be fed to the LLM during evaluations (along with anything else that is relevant to understand your DSL).

## Generate an MCP Server (Optional)

For generating a Model Context Protocol (MCP) server that exposes your DSL's parser and validator as an MCP tool, use the separate `lai-gen-mcp` skill. It handles monorepo detection, output location confirmation, and produces the full server setup including dependencies and client configuration.

## Step 5: Evaluate

```bash
# run all .eval.ts files in the evals directory
lai evaluate

# verbose output showing full responses and errors
lai evaluate --verbose

# use a specific system prompt (overrides config)
lai evaluate --sysprompt ./prompts/experimental.md

# save results to a specific path
lai evaluate --output results.json
```

Results are automatically saved to `.langium-ai/eval-YYYY-MM-DD-HH-MM-SS.json`.

### Writing Evaluation Files

Evaluations are TypeScript `.eval.ts` files using the `langium-ai-tools/evals` API. There's also `langium-ai-tools/evaluators` that provides pre-defined evaluator classes for checking DSL programs & collecting diagnostics.

```typescript
import { describe, evaluation, beforeEach } from 'langium-ai-tools/evals';
import { LangiumEvaluator } from 'langium-ai-tools/evaluator';
import type { EvalContext } from 'langium-ai-tools/evals';
import { generateResponse, extractCodeBlock, calculateSimilarity } from './utils';
import { EmptyFileSystem } from 'langium';
import { createMyDslServices } from '../src/my-dsl-module';

// initialize language services for validation
const services = createMyDslServices(EmptyFileSystem).MyDsl;
const evaluator = new LangiumEvaluator(services);

describe('Code Generation', () => {

  beforeEach(async () => {
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
  });

  evaluation('generates valid syntax', async (ctx: EvalContext) => {
    // ctx.systemPrompt contains the generated system prompt
    const response = await generateResponse('Generate a minimal valid program', {
      systemPrompt: ctx.systemPrompt
    });

    const code = extractCodeBlock(response) || response;
    const result = await evaluator.evaluate(code);
    const passed = !result.data.failures && !result.data.errors && !result.data.diagnostics.length;

    return { passed, ...result.data };
  });

  evaluation('matches expected output', async (ctx: EvalContext) => {
    const expected = 'entity Person { name: string }';
    const response = await generateResponse('Create a Person entity with a name field', {
      systemPrompt: ctx.systemPrompt
    });

    const code = extractCodeBlock(response) || response;
    const result = await evaluator.evaluate(code);
    const similarity = calculateSimilarity(response, expected);
    const passed = similarity >= 0.75 && !result.data.diagnostics.length;

    return { passed, similarity, ...result.data };
  });
});
```

Key patterns:
- `ctx.systemPrompt` provides the generated system prompt to your LLM calls
- `LangiumEvaluator` validates generated code against your actual Langium language services (parsing, validation)
- Return `{ passed: boolean, error?: string, ...extraData }` from each evaluation
- Use `describe` to group related tests, `evaluation` for individual cases
- `evaluation.each([...])('name $var', (data) => async (ctx) => { ... })` for parametrized tests
- `describe.skip()` / `evaluation.skip()` to skip, `.only()` to focus

### Evaluation Result Shape

Each evaluation returns:
- `passed` (boolean) — did this case succeed
- `error` (string, optional) — failure description
- Any additional data fields (similarity scores, diagnostics, etc.) are stored and shown in verbose mode

## Step 6: Analyze Results

### View History

```bash
# show last 10 runs
lai history

# condensed single-line format
lai history --oneline

# show more runs
lai history --limit 25
```

History shows per-run: run ID, timestamp, pass/fail counts, success rate, total time, and tags.

### Inspect a Run

```bash
# show detailed results of the latest run
lai show latest

# show a specific run by ID
lai show 3

# verbose mode shows duration, errors, and all extra data fields per case
lai show latest --verbose
```

Shows per-case pass/fail status as `Suite > Case` with icons (pass, fail, skipped).

### Compare Runs

```bash
# compare two runs side-by-side
lai compare 3 5

# compare against latest
lai compare 3 latest
```

Shows deltas for success rate, avg duration, and total time. Lists test changes: `PASS→FAIL`, `FAIL→PASS`, `NEW`, `REMOVED`.

### Aggregate Statistics

```bash
# stats across all runs
lai stats

# stats filtered by tag
lai stats --tag baseline
```

Shows total runs, overall pass/fail counts, average success rate, best/worst runs, a trend chart for recent runs, and tag distribution.

### Tag Runs

```bash
# tag the latest run
lai tag latest baseline

# tag a specific run with multiple tags
lai tag 5 v2-prompt improved-grammar
```

Tags are useful for filtering with `lai stats --tag` and for marking milestones.

### Export Results

```bash
# export as CSV
lai export latest --format csv --output results.csv

# export as JSON
lai export 5 --format json

# stdout if no --output specified
lai export latest --format json
```

### Clean Up

```bash
# keep only the 5 most recent runs
lai clean --keep 5

# delete runs before a specific ID
lai clean --before 3

# skip confirmation
lai clean --keep 10 --yes
```

## Step 7: Refine and Repeat

Based on evaluation results, iterate on:

1. **Descriptor refinements** — add more examples, fix paths, add documentation links, adjust service references
2. **Evaluation case improvements** — add cases that cover failures, tighten expected outputs, add edge cases
3. **Regenerate and re-evaluate**:

```bash
# after descriptor changes, regenerate the system prompt
lai gen sysprompt --fresh

# re-run evaluations
lai evaluate

# compare against previous run
lai compare 3 latest

# tag good checkpoints
lai tag latest after-grammar-fix
```

### Typical Refinement Patterns

- **Low success rate on code generation** → add more examples to the descriptor
- **Validation failures** → add the `{{validator}}` section with `include_if: validator` so the LLM knows your semantic rules
- **Inconsistent outputs** → add multi-turn evaluation cases with `history` to test context-aware responses

## Generating or Refining a Descriptor

For generating a new descriptor or refining an existing one — including fixing paths, adding missing services, improving examples, and adding documentation — use the separate `lai-gen-descriptor` skill.

## Generating or Refining a System Prompt

For generating a new system prompt or refining an existing one — including diagnosing evaluation failures, structuring improvements, and LLM-assisted editing — use the separate `lai-gen-sysprompt` skill.

## Generating a Language Skill

For guidance on producing a comprehensive, standalone skill document that teaches an agent or developer how to understand and work with your DSL — covering syntax, semantics, patterns, dos/don'ts, edge cases, and more — use the `/lai-gen-language-skill` command to generate a skill for your language.

## Expanding the Evaluation Suite

For generating comprehensive evaluation files that cover syntactic correctness, semantic validity, user intent matching, edge cases, and language understanding — use the separate `lai-gen-evals` skill.

## Generating an MCP Server

For generating an MCP server for your DSL, use the separate `lai-gen-mcp` skill. It covers monorepo-aware output location selection, dependency setup, server generation, and client configuration.

## Quick Reference

```bash
lai init                              # one-time project setup
lai init config                       # reinitialize config only
lai init evals                        # reinitialize evals only
lai gen descriptor                    # generate descriptor from project
lai gen descriptor --fresh            # regenerate from scratch
lai validate                          # validate descriptor schema and file paths
lai gen sysprompt                     # generate system prompt
lai gen sysprompt --fresh             # regenerate from scratch
lai evaluate                          # run evaluations
lai evaluate --verbose                # with detailed output
lai evaluate --sysprompt PATH         # with custom system prompt
lai status                            # check project status
lai history                           # view run history
lai history --oneline                 # condensed history
lai show latest                       # inspect latest run
lai show ID --verbose                 # inspect specific run in detail
lai compare ID1 ID2                   # compare two runs
lai stats                             # aggregate statistics
lai stats --tag TAG                   # stats filtered by tag
lai tag ID TAGS...                    # tag a run
lai export ID --format csv|json       # export results
lai clean --keep N                    # clean old runs
```
