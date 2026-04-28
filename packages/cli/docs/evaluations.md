# Evaluations

The `lai evaluate` command runs TypeScript-based evaluation files against your generated system prompt. This helps ensure your DSL assistant produces consistent, high-quality outputs.

## Evaluation File Format

Evaluation cases are written as `.eval.ts` files using the vitest-style testing API from `langium-ai-tools/evals`. Files are placed in the evaluations directory (default: `evals/`).

### Basic Structure

```typescript
import { describe, evaluation, beforeEach } from 'langium-ai-tools/evals';
import type { EvalContext } from 'langium-ai-tools/testing';

describe('Basic Code Generation', () => {

    evaluation('should generate valid syntax', async (ctx: EvalContext) => {
        // ctx.systemPrompt contains the generated system prompt
        // ctx.project.name contains the project name

        // your test logic here (e.g. call an LLM, validate output)
        const passed = true;

        return {
            passed,
            // optional: include any extra data fields
            error: passed ? undefined : 'Something went wrong',
        };
    });
});
```

### Context Object

Each evaluation receives an `EvalContext` with:
- **`systemPrompt`** — the contents of the generated system prompt file
- **`project.name`** — the project name from `lai.config.jsonc`

### LLM Integration

Evaluation files are responsible for calling the LLM directly. The scaffolded `utils.ts` file provides a `generateResponse()` stub that you implement with your preferred provider (OpenAI, Anthropic, Ollama, etc.). See the generated comments in `utils.ts` for examples.

### Using LangiumEvaluator

You can validate LLM-generated DSL output using the `LangiumEvaluator` from `langium-ai-tools/evaluator`:

```typescript
import { LangiumEvaluator } from 'langium-ai-tools/evaluator';
import { EmptyFileSystem } from 'langium';
import { createMyLanguageServices } from '../src/language/my-language-module';

const services = createMyLanguageServices(EmptyFileSystem).MyLanguage;
const evaluator = new LangiumEvaluator(services);

evaluation('validates generated code', async (ctx: EvalContext) => {
    const response = await generateResponse('Write a simple program', {
        systemPrompt: ctx.systemPrompt,
    });

    const result = await evaluator.evaluate(response);
    const passed = !result.data.failures && !result.data.errors && !result.data.diagnostics.length;

    return { passed, ...result.data };
});
```

## Running Evaluations

```bash
# run all .eval.ts files in the evaluations directory
lai evaluate

# verbose output with results printed as they complete
lai evaluate --verbose

# use a specific system prompt file
lai evaluate --sysprompt path/to/custom.sysprompt.md

# save results to a custom path
lai evaluate --output results.json
```

### Options

| Option | Description |
|--------|-------------|
| `--verbose` | Show detailed output as each evaluation completes |
| `--sysprompt <path>` | Path to system prompt file (overrides config) |
| `--output <path>` | Custom output path for results JSON |

### Output

The command displays:
1. Per-file progress with pass/fail/skip counts
2. Per-case results (`✓` pass, `✗` fail, `○` skipped)
3. Summary: total, passed, failed, skipped, average duration, total time, success rate
4. Details for failed cases with error messages

Exit code is non-zero if any evaluations fail.

### Result Storage

Results are automatically saved to `.langium-ai/eval-YYYY-MM-DD-HH-mm-ss.json` with:
- `runId` — auto-incremented run number
- `timestamp` — ISO date string
- `tags` — empty by default (add with `lai tag`)
- `syspromptPath` — absolute path to the system prompt used
- `totalTime` — wall-clock duration in milliseconds
- `results` — array of case results with metadata (suite name, case name, duration) and data (passed, skipped, error, plus any custom fields)

## Managing Results

```bash
# view run history
lai history
lai history --limit 5 --oneline

# show details of a specific run
lai show latest
lai show 3 --verbose

# compare two runs
lai compare 3 4

# tag a run
lai tag latest baseline v1

# export results
lai export latest --format csv
lai export 3 --format json --output results.json

# aggregate statistics
lai stats
lai stats --tag baseline

# clean up old runs
lai clean --keep 10
lai clean --before 5 --yes
```

## Example Workflow

```bash
# 1. initialize project
lai init

# 2. generate descriptor from project structure
lai gen descriptor

# 3. generate system prompt from descriptor
lai gen sysprompt

# 4. implement your LLM provider in evals/utils.ts

# 5. run evaluations
lai evaluate --verbose

# 6. review results and refine
lai show latest --verbose

# 7. iterate on descriptor/sysprompt and re-evaluate
lai gen sysprompt --fresh
lai evaluate
lai compare 1 2
```

## Next Steps

- See [evaluation-api.md](./evaluation-api.md) for the full evaluation API reference (describe, evaluation, hooks, parametrized tests)
- Check out `packages/examples/example-dsl-evaluator` for a complete working example
