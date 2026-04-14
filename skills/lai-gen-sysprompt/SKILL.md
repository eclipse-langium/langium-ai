---
name: lai-gen-sysprompt
description: Generate or refine a system prompt for a Langium DSL project. Bootstraps a new system prompt via `lai gen sysprompt` if none exists, then guides targeted refinement based on evaluation results and language changes.
user-invocable: true
---

# Generate or Refine a System Prompt

This skill covers the full lifecycle of a system prompt for a Langium DSL — from initial generation to iterative refinement. If no system prompt exists yet, it bootstraps one using `lai gen sysprompt`. If one already exists, it guides you through diagnosing issues from evaluation results and making targeted improvements.

You may also use the `lai` and `langium` skills for deeper understanding of the CLI workflow and Langium project structure.

## When to Use

- **No system prompt yet** — you have a descriptor and need to generate the first system prompt
- **Evaluation results show low pass rates** or recurring failure categories
- **The system prompt is missing key language details** — grammar rules, validation constraints, scoping rules
- **LLM-generated code consistently has specific error patterns**
- **The descriptor or language has changed** since the prompt was last generated
- **The prompt is too verbose, unfocused, or missing edge cases**

## Prerequisites

The target Langium project must have:

1. **`lai init` completed** — a `lai.config.jsonc` exists
2. **A language descriptor** (`language.descriptor.yml`) — generate one first using the `lai-gen-descriptor` skill if needed
3. **Node.js and npm** available

## Step 1: Generate the System Prompt (if not present)

If no system prompt exists, generate one from the descriptor:

```bash
# generate a system prompt
lai gen sysprompt

# regenerate from scratch, ignoring any existing prompt
lai gen sysprompt --fresh
```

This produces a markdown file (e.g., `language.sysprompt.md`) that instructs an LLM how to generate valid code in your DSL. It is driven entirely by the descriptor content.

If a system prompt already exists and you want to refine it, skip to Step 2.

## Step 2: Identify What Needs Fixing

Read the current system prompt and any recent evaluation results to understand the gaps:

```bash
# check latest evaluation results
lai show latest --verbose

# compare against a previous good run if available
lai compare <good-run-id> latest
```

Common issues to look for:
- **Missing grammar context** — the prompt doesn't include key grammar rules the LLM needs
- **Incorrect or outdated examples** — examples no longer match the current language
- **Vague instructions** — the prompt tells the LLM what to generate but not how to avoid common mistakes
- **Missing validation rules** — the LLM doesn't know about semantic constraints enforced by the validator
- **Overly long or unfocused** — too much irrelevant detail dilutes the important parts

## Step 3: Refine the Prompt Content

When editing the system prompt markdown file directly, follow these principles:

- **Be specific about error patterns.** If evaluations show the LLM consistently produces invalid cross-references, add a section explaining the scoping rules explicitly.
- **Add negative examples.** Show what *not* to generate alongside valid examples. Frame these as "Common mistakes to avoid."
- **Tighten grammar explanations.** Instead of dumping the full grammar, highlight the rules that matter most for generation — entry rules, commonly used alternatives, and tricky syntax.
- **Include validation constraints.** If the validator rejects certain patterns, document them as explicit constraints: "Every entity must have at least one property" or "Type references must resolve to a declared type."
- **Order sections by importance.** Put the most critical generation rules first — LLMs attend more to earlier context.

### Target Structure

A well-refined system prompt should have this structure:

```markdown
# <Language Name> Language System Prompt

## Introduction
Brief description of the language and its purpose.

## Grammar Overview
Key grammar rules relevant to code generation, not necessarily the full grammar.
Highlight entry rules, common patterns, and syntactic constraints.

## Validation Rules
Semantic constraints enforced by the validator that the LLM must respect.
These are the rules that cause evaluation failures when violated.

## Scoping and References
How cross-references resolve, what names are in scope where.
Only include if the language has custom scoping.

## Examples
Valid example programs with brief annotations explaining what they demonstrate.

## Common Mistakes
Patterns the LLM should avoid, derived from evaluation failures.

## Generation Guidelines
Specific instructions for how to produce output: formatting, naming conventions,
required elements, optional elements.
```

Not all sections are needed for every language — include only what's relevant.

## Step 4: LLM-Assisted Refinement (Optional)

If you want to use an LLM to help refine the system prompt rather than editing manually, use a prompt like this. Substitute the variables with actual content from your project:

```
You are refining a system prompt for the <LANGUAGE_NAME> language.

Template purpose: <TEMPLATE_DESCRIPTION>

Expected sections:
<For each section in the template, list:>
- **<Section Name>** (conditional on: <include_if value, if any>): <number of content lines> content line(s)

Detail level guidance:
- basic: Keep explanations minimal and focused on essentials only.
- moderate: Provide a balanced level of detail — enough for clarity without being verbose.
- comprehensive: Include thorough explanations, edge cases, and detailed context.

Summarization: <"Condense and summarize where possible" OR "Preserve the full detail of the original content">

Current prompt:
<THE EXISTING SYSTEM PROMPT CONTENT>

<If evaluation results are available, include:>
Recent evaluation failures:
<List of failing test cases with their error messages>

Task:
- Improve clarity and readability
- Ensure technical accuracy
- Add helpful context for code generation
- Address the evaluation failures listed above
- Maintain all key information
- Keep the markdown structure and section ordering
- Match the detail level guidance above

Return the refined prompt in markdown format. Do not add extra commentary, just return the improved prompt.
```

## Step 5: Apply and Verify

After refining the system prompt:

```bash
# re-run evaluations against the updated prompt
lai evaluate

# compare against the previous run
lai compare <previous-run-id> latest

# tag the run if it improved
lai tag latest after-refinement
```

## Iterative Refinement Tips

- **Fix one category of failure at a time.** Don't try to address all issues in a single edit — make a targeted change, evaluate, and repeat.
- **Track what changed.** Use `lai tag` to mark runs before and after each refinement so you can compare.
- **Don't over-specify.** Adding too many constraints can make the LLM produce rigid, unnatural output. Find the balance between correctness and flexibility.
- **Update the descriptor first if the language changed.** If grammar rules or validation logic changed, update the descriptor and regenerate before refining — otherwise your refinements may conflict with a future regeneration.

## Common Refinement Patterns

| Symptom | Likely Prompt Fix |
|---|---|
| LLM produces syntactically invalid code | Add or improve the Grammar Overview section with key rules |
| Validation errors in generated code | Add explicit Validation Rules section listing constraints |
| Wrong cross-references or unresolved names | Add Scoping and References section explaining name resolution |
| LLM ignores language conventions | Add Generation Guidelines with formatting and naming rules |
| Repetitive or unnatural output | Reduce over-specification; add more diverse examples |
| LLM misunderstands the language's purpose | Improve the Introduction section with domain context |
