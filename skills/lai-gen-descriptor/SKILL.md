---
name: lai-gen-descriptor
description: Generate or refine a language descriptor for a Langium DSL project. Bootstraps a new descriptor via `lai gen descriptor` if none exists, then guides refinement of paths, services, examples, documentation, and structure.
user-invocable: true
---

# Generate or Refine a Language Descriptor

This skill covers the full lifecycle of a `language.descriptor.yml` — from initial generation to iterative refinement. If no descriptor exists yet, it bootstraps one using `lai gen descriptor`. If one already exists, it guides you through reviewing and improving it so that downstream artifacts (system prompts, evaluations, MCP servers) are as accurate as possible.

You may also use the `lai` and `langium` skills for deeper understanding of the CLI workflow and Langium project structure.

## When to Use

- **No descriptor yet** — you have a Langium project initialized with `lai init` and need to generate the first descriptor
- **Descriptor exists but is incomplete** — auto-detection missed custom services, examples, or documentation
- **Paths are wrong** — the generated descriptor references files that don't exist or are in the wrong location
- **Language has evolved** — grammar, validation rules, or project structure changed since the descriptor was generated
- **Evaluation failures** — poor eval results trace back to incomplete or inaccurate descriptor content
- **Adding examples or docs** — new example programs or documentation have been added to the project

## Prerequisites

The target Langium project must have:

1. **`lai init` completed** — a `lai.config.jsonc` exists at the project root
2. **A working Langium grammar** (`.langium` file) and generated TypeScript artifacts
3. **Node.js and npm** available

## Step 1: Generate the Descriptor (if not present)

If no `language.descriptor.yml` exists, generate one:

```bash
# generate from project analysis (uses LLM to synthesize)
lai gen descriptor

# regenerate from scratch, ignoring any existing descriptor
lai gen descriptor --fresh
```

This produces a YAML file that maps your Langium project. It is a starting point — the auto-detector does its best but will likely need corrections.

If a descriptor already exists and you want to refine it, skip to Step 2.

## Step 2: Review and Refine the Descriptor

The descriptor is the single source of truth that drives all prompt generation. Inaccuracies here propagate to every downstream artifact. Review each section carefully.

### Descriptor Structure Reference

```yaml
# required fields
name: my-dsl                          # language name
version: 1.0.0                        # descriptor version
description: A DSL for ...            # human-readable purpose
langium_config: ./langium-config.json # path to langium config
case_sensitive: true                  # whether the language is case-sensitive
grammar: ./src/grammar/my-dsl.langium # path to grammar file

# optional fields
builtins: ./src/builtins/my-dsl-builtins.langium  # built-in types/functions always in scope
services:                             # custom Langium service files
  module: ./src/my-dsl-module.ts
  validator: ./src/validation/my-dsl-validator.ts
  scope_provider: ./src/scoping/my-dsl-scope-provider.ts
  scope_computation: ./src/scoping/my-dsl-scope-computation.ts
  linker: ./src/linking/my-dsl-linker.ts
  token_builder: ./src/my-dsl-token-builder.ts
  name_provider: ./src/references/my-dsl-name-provider.ts
  type_provider: ./src/typing/my-dsl-type-provider.ts
  value_converter: ./src/my-dsl-value-converter.ts

tests: ./test/                        # test directory
examples: [...]                       # example programs
documentation: [...]                  # documentation references
imports: [...]                        # descriptor fragments to merge
```

### 2a. Fix File Paths

The auto-detector looks for common patterns (`*-validator.ts`, `**/scoping/**`, etc.) but may miss non-standard naming or directory structures. Verify every path in the descriptor actually exists:

- `grammar` — must point to the `.langium` file
- `langium_config` — must point to `langium-config.json`
- `services.*` — each should point to the actual TypeScript file implementing that service
- `examples[].file` — each should point to a valid DSL source file
- `documentation[].src` — URLs or file paths that exist

Remove service entries that point to nonexistent files. Only include services that your project actually customizes — not every project has a custom scope provider or linker.

### 2b. Improve the Description

The auto-generated description is generic (e.g., "A domain-specific language built with Langium with custom validation, scoping"). Replace it with a meaningful description of what the language does:

```yaml
# before
description: A domain-specific language built with Langium with custom validation

# after
description: >
  A domain-specific language for defining entity-relationship models
  with inheritance, computed properties, and cross-entity references.
  Used to generate database schemas and REST API endpoints.
```

A good description helps the LLM understand the language's domain and purpose, which improves code generation quality.

### 2c. Add or Fix Examples

The auto-detector picks up to 3 files from an `examples/` directory with generic names. Improve these:

```yaml
examples:
  - name: Basic Entity Model
    description: Defines a simple entity with primitive properties.
    file: ./examples/basic-entity.mydsl
    tags: [beginner, entities]
  - name: Cross-References
    description: Demonstrates referencing types defined in other entities.
    file: ./examples/cross-references.mydsl
    tags: [intermediate, references]
  - name: Inheritance
    description: Shows entity inheritance and property overriding.
    file: ./examples/inheritance.mydsl
    tags: [advanced, inheritance]
```

Guidelines for examples:
- **Name each example descriptively** — not "Example 1"
- **Write a description** that explains what language feature the example demonstrates
- **Tag examples** by difficulty and feature area
- **Cover key features** — include at least one example for each major language construct
- **Keep examples valid** — every example file should parse and validate without errors

### 2d. Add Missing Services

If the detector missed custom services, add them manually. Check your project's DI module (typically `*-module.ts`) to see which services are overridden:

```typescript
// in your module file, look for service overrides like:
validator: (services) => new MyDslValidator(services),
ScopeProvider: (services) => new MyDslScopeProvider(services),
```

Each overridden service should have a corresponding entry in the descriptor's `services` section pointing to the file that contains the implementation.

### 2e. Add Documentation References

Link external documentation that helps the LLM understand the language:

```yaml
documentation:
  - src: ./README.md
    description: Project overview and getting started guide
    priority: high
  - src: ./docs/language-guide.md
    description: Complete language reference with all constructs
    priority: high
  - src: https://langium.org/docs/grammar-language/
    description: Langium grammar language reference
    priority: medium
```

High-priority documentation is weighted more heavily during system prompt generation.

### 2f. Use Descriptor Imports for Large Languages

For complex languages, split the descriptor into fragments:

```yaml
imports:
  - ./descriptors/builtins.yml      # built-in types and functions
  - ./descriptors/stdlib.yml        # standard library definitions
  - ./descriptors/advanced.yml      # advanced feature documentation
```

Each imported file is a partial descriptor whose content is merged into the main descriptor.

### 2g. Set `case_sensitive` Correctly

The auto-generator defaults to `true`. If your language is case-insensitive (keywords like `ENTITY` and `entity` are equivalent), set this to `false`. Check your grammar for case-insensitive terminal rules or keyword definitions.

## Step 3: Validate the Descriptor

After making changes, validate the descriptor schema and verify all referenced files exist:

```bash
lai validate
```

This checks required fields, path existence, and schema conformance.

## Validation Rules

The descriptor is validated against a schema when saved. Required fields:

- `name` — non-empty string
- `version` — non-empty string
- `description` — non-empty string
- `grammar` — non-empty path
- `langium_config` — non-empty path
- `case_sensitive` — boolean
- `prompts` — at least one template, must include one named `"default"`

Each prompt template requires:
- `name` — non-empty string
- `description` — non-empty string
- `sections` — at least one section, each with a non-empty `section` name and a non-empty `content` array

Each example requires `name`, `file`, and `tags` (array). Each documentation entry requires `src` and `priority` (`"high"`, `"medium"`, or `"low"`).

## Step 4: Regenerate Downstream Artifacts

After updating the descriptor, regenerate and re-evaluate:

```bash
# regenerate the system prompt from the updated descriptor
lai gen sysprompt --fresh

# run evaluations against the new prompt
lai evaluate

# compare against the previous run to see if refinements helped
lai compare <previous-run-id> latest

# tag the run for tracking
lai tag latest after-descriptor-refinement
```

If you changed file paths or added services, verify the system prompt includes the new content by inspecting the generated markdown file before running evaluations.

## Common Refinement Patterns

| Symptom | Likely Descriptor Fix |
|---|---|
| Low success rate on code generation | Add more examples to the descriptor |
| Validation failures in evals | Add the validator service path so the LLM knows your semantic rules |
| LLM doesn't understand scoping | Add the scope_provider service path |
| Generic or vague generated prompts | Improve the `description` field and add high-priority documentation |
| Missing language features in prompts | Add examples that demonstrate those features |
| Inconsistent LLM outputs | Add more diverse examples with clear tags |
