// ============================================================================
// Langium AI — Evaluation File
// ============================================================================
//
// Welcome! This file defines *evaluations* — automated checks that measure how
// well an LLM generates code in your Langium DSL.
//
// Think of evaluations like unit tests, but instead of asserting exact values
// you assign a **score between 0 and 1** to each case. A score of 1 means the
// LLM produced perfect output; 0 means it completely failed.
//
// HOW IT WORKS
// ────────────
// 1. You write a prompt describing what you want the LLM to generate.
// 2. You send that prompt to your LLM via `generateResponse()` (see utils.ts).
// 3. You validate the LLM's response with the `LangiumEvaluator`, which runs
//    your language's real parser and validator on the output.
// 4. You return a `score` (and any extra data you want to track).
//
// Run evaluations with:   lai evaluate
// View past results with: lai history
//
// The API is modeled after vitest — you'll recognize `describe`, `beforeEach`,
// and friends. The key difference is `evaluation()` instead of `it()`/`test()`.
//
// ============================================================================

import { describe, evaluation, beforeEach } from 'langium-ai-tools/evals';
import { LangiumEvaluator } from 'langium-ai-tools/evaluator';
import type { EvalContext } from 'langium-ai-tools/evals';
import { generateResponse, extractCodeBlock, calculateSimilarity } from './utils';
import { EmptyFileSystem } from 'langium';
import { {{ CREATE_LANGUAGE_SERVICES }} } from '{{ SERVICES_MODULE_PATH }}';

// ── Language setup ──────────────────────────────────────────────────────────
// Create your Langium services using EmptyFileSystem (no real files needed —
// the evaluator works entirely in memory). Then wrap them in a LangiumEvaluator,
// which knows how to parse a string and collect diagnostics.
const services = {{ CREATE_LANGUAGE_SERVICES }}(EmptyFileSystem).{{ LANGUAGE_SERVICES }};
const evaluator = new LangiumEvaluator(services);

// ============================================================================
// Suite 1 — Basic Code Generation
// ============================================================================
// Each `describe()` block groups related evaluations into a *suite*.
// Suites appear as headings in the CLI output and in evaluation reports.
describe('Basic Code Generation', () => {

    // `beforeEach` runs before every evaluation in this suite. Use it to reset
    // workspace state so evaluations don't leak into each other.
    beforeEach(async () => {
        await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
    });

    // ── Evaluation: minimal valid program ───────────────────────────────────
    // The simplest possible check: ask the LLM for *any* valid program and
    // verify it parses without errors.
    evaluation('should generate a simple program', async (ctx: EvalContext) => {
        // Step 1 — Write a prompt. Be specific about what you want.
        // The more detail you provide, the better the LLM will perform.
        const prompt = 'Generate a minimal valid program in this language';

        // Step 2 — Call your LLM. `ctx.systemPrompt` is automatically loaded
        // from your project's generated system prompt (lai gen sysprompt).
        // It contains your grammar, examples, and docs so the LLM understands
        // your DSL. You can also pass `temperature` and `maxTokens`.
        const response = await generateResponse(prompt, {
            systemPrompt: ctx.systemPrompt,
            temperature: 0.7
        });

        // Step 3 — Extract code from the response. LLMs often wrap code in
        // markdown fences (```). `extractCodeBlock` pulls out just the code.
        // If there's no code fence, we fall back to the raw response.
        const code = extractCodeBlock(response) || response;

        // Step 4 — Validate with LangiumEvaluator. This runs your language's
        // parser and validator on the code string. The result contains:
        //   - result.data.failures  — number of parse failures (couldn't parse at all)
        //   - result.data.errors    — number of validation errors (severity 1)
        //   - result.data.warnings  — number of warnings (severity 2)
        //   - result.data.infos     — informational diagnostics (severity 3)
        //   - result.data.hints     — hint-level diagnostics (severity 4)
        //   - result.data.diagnostics — raw Diagnostic[] array for inspection
        const result = await evaluator.evaluate(code);

        // Step 5 — Compute a score. Scores must be between 0 and 1.
        // Here we use a simple binary: 1 if the code is completely clean, 0 otherwise.
        // You could also compute a partial score, e.g. penalizing warnings less
        // than errors, or scaling by the number of diagnostics.
        const isValid = !result.data.failures && !result.data.errors && !result.data.diagnostics.length;
        const score = isValid ? 1 : 0;

        // Step 6 — Return the score plus any extra data. Everything you return
        // here is recorded in the evaluation report and visible via `lai history`.
        // Spreading `result.data` includes the full diagnostic breakdown.
        return {
            score,
            ...result.data
        };
    });

    // ── Evaluation: similarity to expected output ───────────────────────────
    // Sometimes you have a specific expected output in mind. This evaluation
    // combines syntax validity with string similarity to grade the response.
    evaluation('should match expected output similarity', async (ctx: EvalContext) => {
        // TODO: replace these with a real prompt and expected output for your DSL
        const prompt = 'Create a hello world program';
        const expected = 'print("Hello, World!")';

        const response = await generateResponse(prompt, {
            systemPrompt: ctx.systemPrompt
        });

        const code = extractCodeBlock(response) || response;
        const result = await evaluator.evaluate(code);

        // `calculateSimilarity` returns a 0–1 score based on Levenshtein
        // distance. It's a rough text-level comparison — useful as a baseline,
        // but you may want to add AST-level or semantic checks for real evals.
        const similarity = calculateSimilarity(response, expected);
        const validSyntax = !result.data.failures && !result.data.errors && !result.data.diagnostics.length;

        // combine syntax validity and similarity into a single score.
        // valid syntax gets the full similarity score; invalid syntax is halved
        // as a penalty. Adjust this formula to match your priorities.
        const score = validSyntax ? similarity : similarity * 0.5;

        return {
            score,
            similarity,
            ...result.data
        };
    });

});

// ============================================================================
// Suite 2 — Code Explanation (non-generation evaluation)
// ============================================================================
// Evaluations aren't limited to code generation. You can also test whether
// the LLM *understands* your DSL — for example, by asking it to explain code.
describe('Code Explanation', () => {

    // ── Evaluation: keyword-based explanation check ──────────────────────────
    // A lightweight approach: check whether the LLM's explanation mentions
    // key concepts from the code. This won't catch subtle misunderstandings,
    // but it's a fast sanity check.
    evaluation('should explain code correctly', async (ctx: EvalContext) => {
        // TODO: replace the code snippet below with a real example from your DSL
        const prompt = `Explain what this code does:
\`\`\`
entity Person {
  name: string
  age: number
}
\`\`\``;

        const response = await generateResponse(prompt, {
            systemPrompt: ctx.systemPrompt
        });

        // check if the response mentions expected keywords and score by
        // the fraction of keywords found. Add more terms for finer granularity.
        const keywords = ['person', 'entity'];
        let matches = 0;
        const lowerResponse = response.toLowerCase();
        for (const keyword of keywords) {
            if (lowerResponse.includes(keyword)) {
                matches++;
            }
        }
        const score = matches / keywords.length;

        return {
            score
        };
    });

});

// ============================================================================
// TIPS & NEXT STEPS
// ============================================================================
//
// Modifiers — skip or focus individual evaluations/suites:
//   evaluation.skip('name', ...)   — temporarily skip this case
//   evaluation.only('name', ...)   — run *only* this case (great for debugging)
//   describe.skip('name', ...)     — skip an entire suite
//   describe.only('name', ...)     — run only this suite
//
// Parametrized evaluations — run the same logic across multiple inputs:
//   evaluation.each([
//     { input: 'create a Person entity', expected: 'entity Person' },
//     { input: 'create an Address entity', expected: 'entity Address' },
//   ])('generate $input', (data) => async (ctx) => {
//     const response = await generateResponse(data.input, { systemPrompt: ctx.systemPrompt });
//     // ... validate and return { score }
//   });
//
// Lifecycle hooks — available inside describe():
//   beforeEach(() => { ... })  — runs before each evaluation
//   afterEach(() => { ... })   — runs after each evaluation
//   beforeAll(() => { ... })   — runs once before the first evaluation in the suite
//   afterAll(() => { ... })    — runs once after the last evaluation in the suite
//
// Scoring strategies:
//   - Binary (0 or 1) — simplest, good for "does it parse?" checks
//   - Continuous (0–1) — e.g. 1 - (errors / totalNodes), or similarity ratios
//   - Weighted — combine multiple signals: syntax + semantics + style
//
// Custom data — return anything alongside `score` for tracking:
//   return { score, responseLength: code.length, model: 'gpt-4', latencyMs: 320 };
//
// ============================================================================
