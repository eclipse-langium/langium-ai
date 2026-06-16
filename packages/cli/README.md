# langium-ai (LAI)

`lai` is a CLI for bootstrapping and iteratively refining AI-powered tooling around [Langium](https://langium.org/) DSLs. If you're building a coding assistant, agent, or any other LLM-driven workflow for a Langium-based domain-specific language, LAI gives you the framework and feedback loop to make your job much easier.

There are many ways to get an LLM to generate valid code reliably in your DSL, but typically we see a need for a robust system prompt that accurately describes your language, evaluation tests to measure output quality, and a way to track improvements over time. Additionally supporting tooling, mcp, and more is often needed to build a really great application. Building all of that from scratch for each project is tedious — and without a consistent measurement approach, it's easy to make changes that feel right but don't actually improve results. LAI seeks to help in this process, so you can make changes and check your work without burdening yourself in the process.

## How It Works

LAI primarily contributes once you get into an evaluation loop, where you can incrementally expand & refine your AI tooling. From setup to evaluation, the workflow generally proceeds as follows:

1. **`lai init`** — detects your Langium project structure, configures your LLM provider, and scaffolds an `evals/` directory with starter files. You can also reinitialize parts of the setup individually with `lai init config` (config only) or `lai init evals` (evals only)
2. **`lai gen descriptor`** — generates a structured YAML descriptor that maps your grammar, services, and examples into a form suitable for prompt generation
3. **`lai gen sysprompt`** — synthesizes a system prompt from the descriptor
4. **`lai evaluate`** — runs your evaluation suite against the system prompt via your configured LLM, recording pass/fail and timing for each test case
5. **Analyze & refine** — review results with `lai show`, `lai compare`, and `lai stats`, then iterate on your descriptor and prompt

Each evaluation run is persisted locally, so you can track trends, compare prompt versions, and identify improvements or regressions over time. Once you've gotten to the analysis state, it's quite straight forward to build up a robust way to evaluate your application.

## Installation

```bash
npm install -g langium-ai
```

## Quick Start

```bash
# one-time setup from the root of your Langium project
# detects Langium structure, installs langium-ai-tools, and scaffolds evals
lai init

# reinitialize just the config file (re-detects project structure)
lai init config

# reinitialize just the evals/ directory and regenerate template files
lai init evals

# generate a YAML descriptor mapping your language's grammar, services, and examples
lai gen descriptor

# synthesize a system prompt by consuming the descriptor and your project state
lai gen sysprompt

# check overall lai configuration status
lai status

# run your evaluation suite
lai evaluate
```

From there you can periodically inspect your results by checking history of prior runs, and proceeding with subsequent evaluations.

```bash
lai history
```

For further info you can always run `lai help`.

## Evaluation

Evaluation can be setup in a number of ways to output to a file, get more info, or operate against a specific system prompt (in case you're running comparison tests).

```bash
# save results to JSON
lai evaluate --output results.json

# verbose output (shows per-test details)
lai evaluate --verbose

# use a custom system prompt instead of the configured one
lai evaluate --sysprompt ./prompts/experimental.txt

# use a custom evaluations directory instead of the configured one
lai evaluate --dir ./custom-evals

# combine options
lai evaluate --sysprompt ./test-prompt.md --output results.json --verbose
```

The `--sysprompt` flag makes it easy to test different prompts & prompt strategies:

```bash
lai evaluate --sysprompt ./prompts/v1.txt --output results-v1.json
lai evaluate --sysprompt ./prompts/v2.txt --output results-v2.json
```

### History

Shows past evaluation runs with results and statistics — useful for tracking trends over time as you update your evaluation suite, modify your prompt, or change your stack.

```bash
# show last 10 evaluation runs
lai history

# show more
lai history --limit 20
```

Each run displays run ID, timestamp, tags, total/passed/failed/skipped counts, success rate, average duration, and total time.

### Showing Prior Run Results

View complete results for a specific run.

```bash
lai show latest
lai show 5
lai show results-v1.json
lai show latest --verbose
```

### Run Comparison

Compare two runs side-by-side to see what changed. This includes success rate, duration, total time, and per-test status changes.

```bash
lai compare 3 5
lai compare 3 latest
lai compare latest results-v1.json
```

### Tagging

Tag runs for easier filtering and analysis. The same tag can appear on multiple runs, which lets you group related experiments.

```bash
lai tag latest baseline production
lai tag 5 experimental feature-x
```

### Generate Stats

View aggregate statistics across all runs, optionally filtered by tag.

```bash
lai stats
lai stats --tag baseline
```

### Export

Export run data for external analysis.

```bash
# CSV on stdout
lai export latest

# write to file
lai export latest --output results.csv

# JSON format
lai export latest --format json
lai export 5 --format json --output run-5.json
```

### Cleaning Up

From time to time it can make sense to purge old evaluation runs, and to keep your history clean. You can use `lai clean` to do this with a variety of parameters.

> **Warning**: Keep in mind this permanently deletes run files. A confirmation prompt is shown unless `--yes` is used.

```bash
lai clean --keep 10        # keep only the 10 most recent runs
lai clean --before 20      # delete all runs before ID 20
lai clean --keep 5 --yes   # skip confirmation prompt
```

## Writing Evaluations

Evaluations live in `evals/` and use a vitest-style API provided by `langium-ai-tools`. If you already ran `lai init` to start, you'll have a basic file setup to work with:

```typescript
// evals/basic.eval.ts
import { describe, evaluation, beforeEach } from 'langium-ai-tools/evals';
import { LangiumEvaluator } from 'langium-ai-tools/evaluator';
import type { EvalContext } from 'langium-ai-tools/evaluator';
import { EmptyFileSystem } from 'langium';
import { createLANGUAGEServices } from '../packages/language/src/LANGUAGE-module.js';
import { generateResponse, extractCodeBlock } from './utils.js';

const services = createLANGUAGEServices(EmptyFileSystem).LANGUAGE;
const evaluator = new LangiumEvaluator(services);

describe('My Language Tests', () => {
  beforeEach(async () => {
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
  });

  evaluation('should generate valid code', async (ctx: EvalContext) => {
    const response = await generateResponse('create a simple program', {
      systemPrompt: ctx.systemPrompt,
      temperature: 0.7
    });

    const code = extractCodeBlock(response) || response;
    const result = await evaluator.evaluate(code);
    const passed = !result.data.failures && !result.data.errors && !result.data.diagnostics.length;

    return { passed, ...result.data };
  });
});
```

### Connecting an LLM Provider

During `lai init`, a thin `evals/utils.ts` is scaffolded to show how to wire up a provider. When using LAI, you bring your own provider, as LAI evaluations are fully provider-agnostic.
This makes it much more manageable on our end to maintain the base framework, and also avoids locking in users to whatever SDKs we happen to package in. 

With that being said, here's some examples of how you can add in your own provider into **evals/utils.ts** (generated during `lai init`). Keep in mind these examples may not reflect _exactly_ how you should integrate these SDKs now, but slight adaptation should be a non-issue; so long as the general signature of `generateResponse` is adhered to.

**Anthropic Claude:**

```typescript
import Anthropic from '@anthropic-ai/sdk';

export async function generateResponse(prompt: string, options: { systemPrompt: string }) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    system: options.systemPrompt,
    messages: [{ role: 'user', content: prompt }]
  });
  return response.content[0].text;
}
```

**Ollama (local):**

```typescript
export async function generateResponse(prompt: string, options: { systemPrompt: string }) {
  const response = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    body: JSON.stringify({
      model: 'gpt-oss:20b',
      system: options.systemPrompt,
      prompt,
      stream: false
    })
  });
  const data = await response.json();
  return data.response;
}
```

This approach gives you consistent, measurable evaluations while leaving the choice of model and provider up to you and your team.

## Agent Skills

LAI also ships with [agent skills](https://agentskills.io/home) that equip coding agents (Claude Code, Codex, Gemini, Copilot, etc.) with the context they need to work with the toolkit and with Langium projects in general.

Pairing agent skills with LAI is a _particularly_ powerful combination, as it allows you to get started extremely quickly, and greatly improve upon the baseline descriptor & system prompts. Effectively, we've done our best to factor out the most common software engineering workflows performed when working with LAI, and turned these into skills that can be leveraged to speed up these tasks.

You can view & install them into your project with the [skills](https://www.npmjs.com/package/skills) package from npm, which we recommend at this time. There are other tools for managing skills that can work perfectly fine as well, including manually adding them directly into your project if desired.

For `skills`, you can add them like so:

```bash
npx skills add eclipse-langium/langium-ai
```

The `skills` package detects your agent and installs into the correct directory automatically. You can also find the full skills list in the [main repo README](https://github.com/eclipse-langium/langium-ai#3-agent-skills).

#### Reference Skills

There are non-invocable skills that are intended to supplement an agent with knowledge about LAI and Langium when needed. Use these whenever you intend to have an agent work with `lai` or a Langium project directly.

| Skill | Description |
|---|---|
| **lai** | Guide for using the LAI CLI — commands, configuration, evaluation workflow, and analysis |
| **langium** | Comprehensive reference for how Langium projects work — grammar, parsing, validation, scoping, DI, and LSP integration |

#### Actionable Skills (user-invocable)

These invocable skills describe common workflows that are capable of being partially automated through an agent. In particular the `lai-gen-descriptor` and `lai-gen-sysprompt` skills are pre-configured to either construct or improve upon your existing descriptor or system prompt. Although we generate these files through the cli, it's rare that we catch everything. Using an agent can help fill in the gaps quickly.

| Skill | Description |
|---|---|
| **lai-gen-descriptor** | Generate or refine a `language.descriptor.yml` — bootstraps a new descriptor if none exists, then guides refinement of paths, services, examples, and documentation |
| **lai-gen-sysprompt** | Generate or refine a system prompt — bootstraps from the descriptor if none exists, then guides targeted improvements based on evaluation results |
| **lai-gen-evals** | Expand the evaluation suite with comprehensive coverage — syntactic correctness, semantic validity, user intent matching, edge cases, and language understanding |
| **lai-gen-mcp** | Generate an MCP server that exposes your DSL's parser and validator as a tool for any MCP-compatible client (Claude Code, Cursor, VS Code, etc.) |
| **lai-gen-language-skill** | Produce a standalone skill document that teaches an agent how to understand and work with your specific DSL |

## Development

For those that are interested in developing on LAI, you can run the following. We pin our npm/node via a `.nvmrc` file that can be picked up using [direnv](https://direnv.net/). We may pop in a `mise.toml` or go with nix down the road to help with oxlint, biome, and knip, but for now these are all managed via npm.

```bash
npm install
npm run build
npm run dev       # watch mode
npm link && lai --help
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