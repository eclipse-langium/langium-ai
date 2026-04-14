---
name: lai-gen-language-skill
description: Skill for generating a skill for understanding a specific Langium-based DSL. Used in cooperation with the lai & langium skills for understanding.
user-invocable: true
---


# Generate Language Skill

This guide instructs an agent on how to generate a comprehensive, standalone skill document (a markdown file) for working with a specific Langium-based DSL. The output skill should give any agent or developer a deep understanding of the target language — its syntax, semantics, use cases, patterns, and pitfalls — without requiring access to the original project sources at runtime.

You may also use the `lai` and `langium` skills to achieve a better understanding of langium-ai and the Langium-based DSL in question that we wish to generate a skill for.

## When to Use

- After a descriptor and system prompt have been generated and refined (`lai gen descriptor`, `lai gen sysprompt`)
- When you want to produce a reusable knowledge artifact (e.g., a SKILL.md or CLAUDE.md section) that teaches an agent how to work with your DSL
- When onboarding new developers or agents to an existing DSL project
- When creating documentation that goes beyond a system prompt — covering not just "how to generate code" but "how to think in this language"

## Inputs

Gather these from the project before generating the skill:

1. **Language descriptor** (`language.descriptor.yml`) — the structured YAML descriptor produced by `lai gen descriptor`
2. **Grammar file** (`.langium`) — the full grammar definition
3. **Example files** — all example programs referenced in the descriptor
4. **Validator source** — the custom validator implementation (if any)
5. **Scope provider source** — the custom scoping implementation (if any)
6. **Other custom services** — linker, name provider, type provider, etc.
7. **Test files** — existing tests that demonstrate expected behavior and edge cases
8. **Documentation** — any referenced docs (README, language guides, etc.)
9. **Existing system prompt** — the generated system prompt, which already contains a curated view of the language

## Output Location

The generated skill must be placed in the project's existing skills directory, following the standard skill folder convention:

1. **Detect the skills directory.** Check for these paths in order and use the first that exists:
   - `.claude/skills/` (Claude Code projects)
   - `.agents/skills/` (generic agent projects)
   - If neither exists, create `.claude/skills/` by default.

2. **Create a named folder.** Inside the skills directory, create a folder named after the language (lowercase), e.g., `.claude/skills/latria/`.

3. **Write `SKILL.md`.** The skill document must be named `SKILL.md` inside that folder.

4. **Include YAML frontmatter.** The file must begin with frontmatter so agent frameworks can discover and register the skill:

```yaml
---
name: <language-name>
description: <one-line description of what the skill covers>
user-invocable: false
---
```

The `name` should match the folder name (lowercase). The `description` should summarize the skill's scope concisely. Set `user-invocable: false` for language knowledge skills (they are reference material, not callable actions).

**Example output path:** `.claude/skills/latria/SKILL.md`

## Output Format

The generated skill should be a single markdown file (after the frontmatter) with the following structure. Not all sections are required — include only those that apply to the target language.

```markdown
# <Language Name> Language Skill

A comprehensive guide to understanding and working with the <Language Name> DSL.

---

## Overview
What the language is for, its domain, and its primary use cases.
Who uses it, what problems it solves, and where it fits in a larger toolchain.

## Core Concepts
The fundamental abstractions and mental model of the language.
Define the key terms and how they relate to each other.
This section should let a reader build an accurate mental model before seeing any syntax.

## Syntax Reference
### Entry Rule and Program Structure
What a valid program looks like at the top level.

### Key Grammar Rules
The most important grammar constructs, explained with examples.
Not a dump of the full grammar — a curated walkthrough of the rules that matter most.

### Literals, Types, and Primitives
Built-in types, literal syntax, and type system basics (if applicable).

### Keywords and Reserved Words
List of keywords with brief descriptions of what they do.

## Semantics
### Validation Rules
What the validator enforces — the semantic constraints beyond syntax.
List each rule with a brief explanation and an example of code that violates it.

### Scoping and Name Resolution
How cross-references resolve. What names are visible where.
Include examples of valid and invalid reference patterns.

### Linking Behavior
How the linker connects references to declarations.
Any custom linking behavior specific to this language.

### Type System
Type checking rules, type compatibility, inference (if applicable).

## Examples
### Minimal Valid Program
The smallest program that parses and validates without errors.

### Common Patterns
Idiomatic patterns that appear frequently in real usage.
Each pattern should have a name, a code example, and a brief explanation.

### Advanced Patterns
More complex constructs that combine multiple language features.

## Dos and Don'ts
### Do
- Concrete, actionable guidelines for writing correct and idiomatic code.
- Each item should explain *why*, not just *what*.

### Don't
- Common mistakes and anti-patterns with explanations.
- Each item should include an example of the mistake and how to fix it.

## Common Errors and Fixes
A table or list of frequent errors (parser errors, validation errors),
what causes them, and how to resolve them.

## Edge Cases
Surprising or non-obvious behaviors. Boundary conditions.
Things that look like they should work but don't (or vice versa).

## Interoperability
How the language interacts with external systems, file formats,
or other languages in the toolchain (if applicable).

## Glossary
Key terms specific to this language, briefly defined.
```

## Generation Process

Follow these steps to produce the language skill:

### Step 1: Read the Descriptor and Grammar

Load the `language.descriptor.yml` and the grammar file it references. The descriptor gives you the project structure; the grammar gives you the authoritative syntax definition.

- Parse the grammar to identify the entry rule, all parser rules, terminal rules, keywords, and cross-references
- Note which rules are the most structurally important (entry rule, rules referenced by many others)
- Identify the type hierarchy from grammar rule return types and interfaces

### Step 2: Read Custom Services

Load each custom service file referenced in the descriptor's `services` section:

- **Validator**: Extract every validation check — the check name, what AST node type it applies to, the condition it enforces, and the error message it produces. These become the "Validation Rules" section.
- **Scope provider**: Extract scoping rules — what names are visible in what contexts, how scope is computed for cross-references. These become the "Scoping and Name Resolution" section.
- **Linker, name provider, type provider**: Extract any custom behavior that deviates from Langium defaults.

### Step 3: Read Examples and Tests

- Load all example files from the descriptor's `examples` array
- Load test files from the `tests` directory
- Categorize examples by complexity (minimal, common patterns, advanced)
- Extract test assertions to understand expected behaviors and edge cases
- Look for negative test cases (tests that assert errors) — these reveal the "Don'ts" and "Common Errors"

### Step 4: Read Documentation

- Load any documentation files referenced in the descriptor
- Extract domain-specific terminology for the glossary
- Identify use cases and workflow descriptions for the "Overview" section

### Step 5: Read the Existing System Prompt

If a system prompt has already been generated, read it. It contains a curated, LLM-refined view of the language that can serve as a foundation — but the skill should go deeper and broader.

### Step 6: Synthesize the Skill Document

Assemble the skill using all gathered information. Follow these principles:

- **Lead with concepts, not syntax.** The "Core Concepts" section should be understandable without reading any code. A reader should know *what* the language models before learning *how* to write it.
- **Curate the grammar, don't dump it.** Instead of pasting the full grammar, walk through the most important rules with examples. Use the grammar as a reference to ensure accuracy, but present it in a teachable form.
- **Ground every rule in an example.** Every validation rule, scoping rule, or semantic constraint should have at least one code example showing correct usage and one showing a violation.
- **Derive Dos/Don'ts from real evidence.** Use test failures, validation rules, and evaluation results — not speculation. Every "Don't" should correspond to a real constraint in the validator or grammar.
- **Be precise about error messages.** When listing common errors, include the actual error message text from the validator so readers can match errors they encounter to the fix.
- **Cover edge cases explicitly.** Dedicate a section to non-obvious behavior. These are the cases that trip up both humans and LLMs.
- **Keep it self-contained.** The skill document should not require the reader to have the grammar file, validator source, or any other project file open. All necessary information should be in the document itself.

### Step 7: Validate the Skill

Before finalizing, verify:

- Every grammar rule mentioned in the skill exists in the actual grammar
- Every validation rule mentioned matches a real check in the validator source
- Every example program in the skill parses and validates correctly (run through `LangiumEvaluator` if possible)
- The "Don't" examples actually fail validation or parsing as claimed
- No key language features are omitted — cross-check the grammar's parser rules against the skill's coverage

## Tips for Quality

- **Size appropriately.** A skill for a simple DSL with 10 grammar rules might be 200-400 lines. A complex language with custom scoping, typing, and 50+ rules might be 800-1500 lines. Don't pad, but don't under-document.
- **Use consistent example style.** Pick a naming convention for examples (e.g., `Person`, `Order`, `Item`) and use it throughout so examples feel connected.
- **Annotate examples.** Use inline comments in code examples to highlight the relevant part: `entity Person { // <-- entry point`.
- **Version the skill.** Include the descriptor version and a generation date so readers know how current the skill is.
- **Test with a fresh agent.** The best validation is giving the skill to an agent that has never seen the project and asking it to generate valid DSL code. If it can, the skill is good.

## Relationship to Other LAI Artifacts

| Artifact | Purpose | Scope |
|---|---|---|
| **Descriptor** | Machine-readable project structure | Paths and metadata |
| **System prompt** | LLM generation instructions | Focused on producing valid code |
| **Language skill** | Comprehensive language knowledge | Full understanding for agents and developers |

The descriptor drives generation. The system prompt is optimized for a single task (code generation). The language skill is a broader teaching document that covers understanding, not just generation.
