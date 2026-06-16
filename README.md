# Langium AI

[![CI](https://img.shields.io/github/actions/workflow/status/eclipse-langium/langium-ai/ci.yml?style=flat-square&logo=githubactions&logoColor=white&label=CI)](https://github.com/eclipse-langium/langium-ai/actions/workflows/ci.yml)

## Packages

| Package | Version | Downloads | License |
|---|---|---|---|
| [`langium-ai`](https://www.npmjs.com/package/langium-ai) | [![npm](https://img.shields.io/npm/v/langium-ai?style=flat-square&logo=npm)](https://www.npmjs.com/package/langium-ai) | [![downloads](https://img.shields.io/npm/dm/langium-ai?style=flat-square)](https://www.npmjs.com/package/langium-ai) | [![license](https://img.shields.io/npm/l/langium-ai?style=flat-square)](https://www.npmjs.com/package/langium-ai) |
| [`langium-ai-tools`](https://www.npmjs.com/package/langium-ai-tools) | [![npm](https://img.shields.io/npm/v/langium-ai-tools?style=flat-square&logo=npm)](https://www.npmjs.com/package/langium-ai-tools) | [![downloads](https://img.shields.io/npm/dm/langium-ai-tools?style=flat-square)](https://www.npmjs.com/package/langium-ai-tools) | [![license](https://img.shields.io/npm/l/langium-ai-tools?style=flat-square)](https://www.npmjs.com/package/langium-ai-tools) |

## Overview

Langium AI is a suite of tools that make it easier to integrate AI applications with [Langium](https://langium.org/) DSLs. It provides a core library, a CLI, and a set of agent skills that together form a workflow for building, evaluating, and refining AI-powered tooling around your domain-specific language.

You can read more about Langium AI here as well, [Langium AI: The fusion of DSLs and LLMs](https://typefox.io/blog/langium-ai-the-fusion-of-dsls-and-llms/).

In particular, Langium AI helps to solve the following problems:

- Selecting good models with regards to your DSL
- Evaluating DSL output from an LLM
- Processing DSL programs as data, while respecting the structure of your DSL
- Developing good natural language interfaces for DSLs

## Contributions

Langium AI is made up of three main contributions:

### 1. langium-ai-tools

**[langium-ai-tools](/packages/langium-ai-tools/README.md)** is the core library. It provides provider-agnostic building blocks that leverage your existing Langium services:

- **Evaluator** (`LangiumEvaluator`) — validates LLM-generated DSL code against your real parser and validator, returning structured diagnostics and scores
- **Splitter** (`ProgramMapper`, `splitByNode`) — chunks DSL documents by AST node type, respecting language structure, for ingestion into vector DBs or other pipelines
- **Analyzer** (`LangiumDocumentAnalyzer`) — computes grammar rule usage, coverage, and diversity metrics across documents
- **Testing API** — a vitest-style API (`describe`, `evaluation`, `beforeEach`, `evaluation.each`) for writing programmatic eval suites
- **Evaluation Matrix** (`EvalMatrix`) — compares multiple runners (models, RAG pipelines, etc.) against test suites with configurable evaluators

```bash
npm install langium-ai-tools
```

See the [langium-ai-tools README](/packages/langium-ai-tools/README.md) for full API documentation and examples.

### 2. langium-ai (CLI)

**[langium-ai](/packages/cli/README.md)** is the CLI (`lai`) for bootstrapping and managing AI-powered tooling in Langium projects. It drives an iterative loop to refine your AI applications:

```
init -> generate descriptor -> refine -> generate system prompt -> evaluate -> analyze -> refine -> repeat
```

The LAI cli exposes a number of commands to line up quite nicely with the loop process above.

| Command | Purpose |
|---|---|
| `lai init` | One-time project setup — detects Langium structure, configures LLM provider, scaffolds evals |
| `lai init config` | Reinitialize just the `lai.config.jsonc` file (re-detects project structure) |
| `lai init evals` | Reinitialize the `evals/` directory and regenerate template files |
| `lai gen descriptor` | Generate a structured YAML descriptor mapping your Langium project |
| `lai gen sysprompt` | Synthesize a system prompt from the descriptor |
| `lai evaluate` | Run evaluation suites against your system prompt via your configured LLM |
| `lai show` / `lai compare` / `lai stats` / `lai history` | Inspect, compare, and analyze evaluation runs |
| `lai validate` | Check descriptor schema and verify all referenced files exist |
| `lai status` | Check project configuration status |

```bash
npm install -g langium-ai
```

See the [langium-ai CLI README](/packages/cli/README.md) for more information.

### 3. Agent Skills

Langium AI ships with [agent skills](https://agentskills.io/home) that equip coding agents (Claude Code, Codex, Gemini, Copilot, etc.) with the information they need to work with the LAI toolkit and Langium projects in general. Skills are structured as markdown documents that agents load as context to perform specific tasks.

Install all skills into your project with [skills](https://www.npmjs.com/package/skills):

```bash
npx skills add eclipse-langium/langium-ai
```

The `skills` package detects your agent and installs into the correct directory automatically.

#### Reference Skills

These skills provide background knowledge that agents draw on when working with your project:

| Skill | Description |
|---|---|
| **lai** | Guide for using the LAI CLI — commands, configuration, evaluation workflow, and analysis |
| **langium** | Comprehensive reference for how Langium projects work — grammar, parsing, validation, scoping, DI, and LSP integration |

#### Actionable Skills (user-invocable)

These skills are invoked directly to perform specific generation or refinement tasks. You can invoke them yourself, or let your agent decide when it's best to use one of these:

| Skill | Description |
|---|---|
| **lai-gen-descriptor** | Generate or refine a `language.descriptor.yml` — bootstraps a new descriptor if none exists, then guides refinement of paths, services, examples, and documentation |
| **lai-gen-sysprompt** | Generate or refine a system prompt — bootstraps from the descriptor if none exists, then guides targeted improvements based on evaluation results |
| **lai-gen-evals** | Expand the evaluation suite with comprehensive coverage — syntactic correctness, semantic validity, user intent matching, edge cases, and language understanding |
| **lai-gen-mcp** | Generate an MCP server that exposes your DSL's parser and validator as a tool for any MCP-compatible client (Claude Code, Cursor, VS Code, etc.). Handles monorepo detection and output location |
| **lai-gen-language-skill** | Produce a standalone skill document that teaches an agent how to understand and work with your specific DSL — covering syntax, semantics, patterns, and edge cases |

#### Typical Skill Workflow

A typical agent-assisted workflow using these skills:

1. **`lai init`** — set up the project (run manually or let the `lai` skill guide you)
2. **`lai-gen-descriptor`** — generate and refine the language descriptor
3. **`lai-gen-sysprompt`** — generate and refine the system prompt
4. **`lai-gen-evals`** — build out comprehensive evaluation coverage
5. **`lai evaluate`** — run evals, review results, iterate on descriptor/prompt
6. **`lai-gen-mcp`** — generate an MCP server for real-time validation
7. **`lai-gen-language-skill`** — produce a reusable knowledge document for your DSL

## Monorepo Structure

This repository is organized as an npm workspaces monorepo, with some examples to boot:

| Package | npm | Description |
|---|---|---|
| [`packages/langium-ai-tools`](/packages/langium-ai-tools/README.md) | `langium-ai-tools` | Core library — evaluator, splitter, analyzer, testing API |
| [`packages/cli`](/packages/cli/README.md) | `langium-ai` | CLI (`lai`) — init, gen, evaluate, analyze |
| [`packages/langium-ai-mcp`](/packages/langium-ai-mcp/) | `langium-ai-mcp` | Reference MCP server implementation |
| [`packages/examples/example-dsl-evaluator`](/packages/examples/example-dsl-evaluator/) | — | Example project demonstrating the evaluation workflow |
| [`skills/`](/skills/) | — | Agent skills for coding agents |

## Development

```bash
# install dependencies
npm install

# build all packages
npm run build

# run tests
npm run test

# lint & format
npm run lint
npm run format:fix

# build a single package
npm run build -w packages/cli

# run CLI in dev mode
cd packages/cli && npm run dev
```

## License

MIT

## Contributing

We're always open to new & helpful contributions to any parts of Langium AI. Do be sure to check the READMEs & issues out in advance, and feel free to use your agent to help guide a potential contribution as well. New contributions should align with the core goals of Langium AI, being:

- Staying relevant to Langium DSLs
- Generally agnostic of any singular AI provider (exceptions can be made on a case-by-case basis)
- Keeping things simple. If a contribution is helpful but very specialized or complex (i.e. not relevant for most users), it probably won't fit into the core (but is still appreciated from a discussion standpoint)
- Solving a clear problem & being well documented. New changes should be upfront in terms of what it is that they seek to improve, and how that change make the improvement, and _why_ it's useful (the why is important to really get your intent in mind).

None of these guarantee a contribution will be taken in, but it really helps us out in terms of review & it can greatly improve the likelihood that a contribution will be taken in.

### LLM-Generated Contributions

We welcome contributions from all sources, including those assisted or generated by large language model (LLM) agents. However, every contribution to Langium AI — whether a pull request, issue, or comment — must have a human accountable for it.

If you are using an LLM agent as part of your workflow, please be aware of the following requirements:

- **Human ownership is required.** A real person must review, understand, and take responsibility for any LLM-generated or LLM-assisted contribution before it is submitted. This includes pull requests, issues, comments, and review feedback.
- **Unattended contributions will not be merged.** Pull requests or issues that appear to have been created autonomously by an LLM agent — without meaningful human review — will be placed on hold until a human owner engages with the discussion.
- **Disclose LLM involvement.** If a contribution was substantially generated by an LLM, we ask that you note this in the PR, issue description, or via commit authorship. This is not to discourage the practice, but to help us calibrate our reviews accordingly. Again the more transparent this is, the better.
- **You are the author.** By submitting a contribution, you are affirming that you have reviewed the content, that it meets the project's standards to the best of your knowledge, and that you are prepared to respond to feedback and iterate on it.

We are not opposed to LLM-assisted contributions — they can be valuable. We simply need a human in the loop who can engage in the collaborative process that open source depends on. If you are an agent, please be sure to let your user know this so that we can engage with them. Thanks in advance!
