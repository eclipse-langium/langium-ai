# langium-ai

CLI for bootstrapping AI-powered tooling in Langium projects.

## Installation

```bash
npm install -g langium-ai
```

## Quick Start

```bash
# navigate to your Langium project
cd my-langium-project

# initialize LAI
# will prompt for user input to configure various aspects of your install
lai init

# generate a language descriptor
# effectively a mapping of your Langium project
# suitable for prompt generation
lai gen descriptor

# generate a system prompt using your current language descriptor
lai gen sysprompt

# run evaluations, which should have been setup on install
lai evaluate

# check project status for config, descriptoor, prompt & evals presence
lai status

# view evaluation history
# useful to see how your evaluations are going over time as you refine your assistant/agent
lai history

# show detailed results of latest run
lai show latest

# tag a run for future reference
# for example, tag the latest run with 'baseline'
lai tag latest baseline

# view aggregate statistics
lai stats
```

## Evaluations

Create TypeScript-based evaluation files to test your language model prompts:

```bash
# run all evaluations
lai evaluate

# save results to JSON
lai evaluate --output results.json

# verbose output
lai evaluate --verbose

# use a custom system prompt
lai evaluate --sysprompt ./prompts/custom-prompt.txt

# combine options
lai evaluate --sysprompt ./test-prompt.md --output results.json --verbose
```

### Custom System Prompts

By default evaluations use the system prompt from your config (generated with `lai gen sysprompt`). You can use `--sysprompt` to test with a specific one:

```bash
# try with an experimental prompt
lai evaluate --sysprompt ./prompts/experimental.txt

# compare different prompt versions
lai evaluate --sysprompt ./prompts/v1.txt --output results-v1.json
lai evaluate --sysprompt ./prompts/v2.txt --output results-v2.json
```

This makes it relatively easy to evaluate prompt variations before commiting changes, compare with different prompt strategies, and to measure raw performance across iterations of the same prompt.
For comparison the cli exposes a `compare` command that is described in more detail below.

### Viewing Evaluation History

You can view past evaluation runs with their results and statistics. This helps to track trends in your evaluations over time as you update your evaluation suite, modify your prompt, or change up your stack in any other way.

```bash
# show last 10 evaluation runs
lai history

# show a given aount of evaluation runs
lai history --limit 20
```

Each run displays:
- **Run ID**: Unique numeric identifier for the run
- **Timestamp**: When the evaluation was executed
- **Tags**: Any labels for organizing runs
- **Total/Passed/Failed/Skipped**: Count of evaluation cases
- **Success Rate**: Percentage of passed tests
- **Average Duration**: Mean execution time per evaluation case
- **Total Time**: Complete run duration

### Managing Evaluation Runs

LAI also includes helpful commands for managing and analyzing your evaluation history:

#### Show Detailed Results

View complete results for a specific run:

```bash
# show latest run
lai show latest

# show specific run by ID
lai show 5

# show run detail from a specific file
lai show results-v1.json

# show with verbose test details
lai show latest --verbose
```

#### Compare Runs

Compare two runs side-by-side to see what changed:

```bash
# compare two runs
lai compare 3 5

# compare against latest
lai compare 3 latest

# compare against a specific file w/ run results
lai compare latest results-v1.json
```

A comparison will show the differences between the success rates, duration, total time, and test status changes in both results.

#### Tag Runs

¥ou can further organizex runs with tags for easier filtering and analysis:

```bash
# add tags to latest run
lai tag latest baseline production

# add tags to specific run
lai tag 5 experimental feature-x
```

This can be used to checkmark specific runs, group runs together (as the same tag can be present on multiple runs), and to filter statistics from runs by their associated tag.

#### View Statistics

See aggregate statistics across all runs:

```bash
# show overall statistics
lai stats

# filter by a single tag
lai stats --tag baseline
```

#### Export Results

For external data processing, LAI run data can be exported for external analysis:

```bash
# export as raw CSV data on STDOUT
lai export latest

# export run #15
lai export 15

# same thing, but write it to results.csv instead
lai export latest --output results.csv

# export as JSON instead
# identical to the at-rest results form, so effectively a copy
lai export latest --format json

# save exported json to a file instead
lai export 5 --format json --output run-5.json
```

#### Clean Up Old Runs

If desired, old evaluation logs can be cleaned up as well:

```bash
# keep only the 10 most recent runs
# clears old runs out
lai clean --keep 10

# delete runs before a specific ID
lai clean --before 20

# skip confirmation prompt
lai clean --keep 5 --yes
```

**Warning**: This permanently deletes run files. A confirmation prompt is shown unless `--yes` is used.

### Evaluation Files

Evaluations use a vitest-style API with `describe()` and `eval()`:

```typescript
// evals/basic.eval.ts
import { describe, evaluation, beforeEach } from 'langium-ai-tools/evals';
import { LangiumEvaluator } from 'langium-ai-tools/evaluator';
import type { EvalContext } from 'langium-ai-tools/evaluator';
import { EmptyFileSystem } from 'langium';
// where LANGUAGE would be your language by name
import { createLANGUAGEServices } from '../packages/language/src/LANGUAGE-module.js';

// generated utilities
import { generateResponse, extractCodeBlock } from './utils.js';

// initialize language services for validation
const services = createLANGUAGEServices(EmptyFileSystem).LANGUAGE;
const evaluator = new LangiumEvaluator(services);

describe('My Language Tests', () => {

  beforeEach(async () => {
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
  }); 

  evaluation('should generate valid code', async (ctx: EvalContext) => {
    const code = await generateResponse('create a simple program', {
      systemPrompt: ctx.systemPrompt,
      temperature: 0.7
    });

    // extract code if in markdown
    const code = extractCodeBlock(response) || response;
    const result = await evaluator.evaluate(code);
    const passed = !result.data.failures && !result.data.errors && !result.data.diagnostics.length;

    return {
      passed,
      ...result.data
    };
  });
});
```

### Implementing utils.ts

During init LAI also sets up a `utils.ts` file in the `evals` folder.
This contains a bit of helper code to demonstrate how you can hook up an LLM provider, but it's rather thin.
The idea here is that you can bring your own provider/stack, and be able to hook it up into this workflow to leverage the evaluations that you've already put together.

For example, you can connect an LLM provider in `evals/utils.ts` like so:

```typescript
import Anthropic from '@anthropic-ai/sdk';

export async function generateResponse(prompt, options) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    system: options.systemPrompt,
    messages: [{ role: 'user', content: prompt }]
  });
  return response.content[0].text;
}
```

You could also hookup Ollama for local checking too on smaller models:

```ts
export async function generateResponse(
  prompt: string,
  options: GenerateOptions = {}
): Promise<string> {
  const response = await fetch('http://localhost:11434/api/generate', {
   method: 'POST',
   body: JSON.stringify({
     model: 'gpt-oss:20b',
     system: options.systemPrompt,
     prompt: prompt,
     stream: false
   })
 });
 const data = await response.json();
 return data.response;
}
```

This approach is pretty versatile, and allows us to drive evaluations in a consistently measurable way, while also leaving the freedom to choose what you're actually evaluating system-wise.

## Skills

Langium AI ships with two [agent skills](https://agentskills.io/home) that enhance your AI-assisted development workflow. Agent skills are compatible with most coding agents today, including Claude Code, Codex, Gemini, Copilot, and others.

- **LAI** — guides agents through the LAI CLI workflow (descriptors, system prompts, evaluations)
- **Langium** — teaches agents how Langium-based projects work (grammar, parsing, validation, scoping, LSP)

To install both skills into your project, use [skills](https://www.npmjs.com/package/skills):

```bash
npx skills add eclipse-langium/langium-ai
```

The `skills` package will detect your agent and install into the correct directory automatically.

## Integration with AI Providers

LAI evaluations are provider-agnostic. You must implement `generateResponse()` in `evals/utils.ts` with your preferred AI provider. The scaffolded file includes examples for:

- **Anthropic Claude** — via `@anthropic-ai/sdk`
- **OpenAI** — via `openai`
- **Ollama** — via local HTTP API

See the generated `evals/utils.ts` comments for setup examples.

## Development

```bash
# install dependencies
npm install

# build the CLI
npm run build

# watch mode for development
npm run dev

# test locally
npm link
lai --help
```

## License

MIT
