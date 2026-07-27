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
# LAI CLI version that generated this descriptor (auto-injected — don't hand-edit)
version: 0.3.0

# path to the project's Langium config file
langium_config: ./langium-config.json

# one entry per registered Langium language (multi-language projects have several)
languages:
  - name: my-dsl                             # language name
    description: A DSL for ...               # single-line summary
    caseInsensitive: false                   # true = keywords are case-insensitive
    grammar: ./src/grammar/my-dsl.langium    # path to the .langium grammar file

# service detection metadata used for eval generation (auto-detected — rarely edited)
serviceDetails:
  createServicesFunc: createMyDslServices
  createServicesAttributes: [MyDsl]

# custom Langium service files, grouped like Langium's service interfaces (all optional)
services:
  module: ./src/my-dsl-module.ts             # core DI module

  # parser services
  token_builder: ./src/my-dsl-token-builder.ts
  value_converter: ./src/my-dsl-value-converter.ts

  # references services
  scope_provider: ./src/scoping/my-dsl-scope-provider.ts
  scope_computation: ./src/scoping/my-dsl-scope-computation.ts

  # validation services — validators is a LIST, one per language
  validators:
    - language: my-dsl
      path: ./src/validation/my-dsl-validator.ts

  # LSP services
  type_provider: ./src/typing/my-dsl-type-provider.ts

# optional fields
builtins:                                    # built-in files always in scope (string array)
  - ./src/builtins/my-dsl-builtins.langium
tests:                                        # test directories (string array)
  - ./test/
examples: [...]                               # example programs
documentation: [...]                          # documentation references
```

The `services` section mirrors Langium's own service groups. Only include what your project actually customizes:

- **core**: `module`
- **parser services**: `async_parser`, `grammar_config`, `langium_parser`, `parser_error_message_provider`, `lexer_error_message_provider`, `completion_parser`, `token_builder`, `lexer`, `value_converter`
- **documentation services**: `comment_provider`, `documentation_provider`
- **references services**: `linker`, `name_provider`, `references`, `scope_provider`, `scope_computation`
- **serializer services**: `hydrator`, `json_serializer`
- **validation services**: `validators` (a list of `{ language?, path }`), `validation_registry`
- **LSP services**: `completion_provider`, `document_highlight_provider`, `document_symbol_provider`, `hover_provider`, `folding_range_provider`, `definition_provider`, `type_provider`, `implementation_provider`, `references_provider`, `code_action_provider`, `semantic_token_provider`, `rename_provider`, `formatter`, `signature_help_provider`, `call_hierarchy_provider`, `type_hierarchy_provider`, `declaration_provider`, `inlay_hint_provider`, `code_lens_provider`, `document_link_provider`

### 2a. Fix File Paths

The auto-detector looks for common patterns (`*-validator.ts`, `**/scoping/**`, etc.) but may miss non-standard naming or directory structures. Verify every path in the descriptor actually exists:

- `languages[].grammar` — must point to the `.langium` file
- `langium_config` — must point to `langium-config.json`
- `services.*` — each should point to the actual TypeScript file implementing that service
- `services.validators[].path` — each should point to a real validator source file
- `examples[].file` — each should point to a valid DSL source file
- `documentation[].src` — URLs or file paths that exist

Remove service entries that point to nonexistent files. Only include services that your project actually customizes — not every project has a custom scope provider or linker.

### 2b. Improve the Description

The auto-generated per-language description is generic (e.g., "my-dsl: A domain-specific language built with Langium"). Replace it with a meaningful summary of what the language does. It lives inside each `languages[]` entry:

```yaml
# before
languages:
  - name: my-dsl
    description: "my-dsl: A domain-specific language built with Langium"
    caseInsensitive: false
    grammar: ./src/grammar/my-dsl.langium

# after
languages:
  - name: my-dsl
    description: A DSL for defining entity-relationship models with inheritance, computed properties, and cross-entity references; used to generate database schemas and REST API endpoints.
    caseInsensitive: false
    grammar: ./src/grammar/my-dsl.langium
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
validation: { MyDslValidator: (services) => new MyDslValidator(services) },
references: { ScopeProvider: (services) => new MyDslScopeProvider(services) },
```

Each overridden service should have a corresponding entry in the descriptor's `services` section pointing to the file that contains the implementation. Match the override to the right snake_case field and service group (parser, documentation, references, serializer, validation, LSP) — see the structure reference above.

Validators are handled specially: `services.validators` is a LIST, with one entry per language. Add an object with the validator's `path` and, for multi-language projects, the `language` it validates:

```yaml
services:
  validators:
    - language: my-dsl
      path: ./src/validation/my-dsl-validator.ts
    - language: my-other-dsl
      path: ./src/validation/my-other-dsl-validator.ts
```

The `language` field is optional — omit it if the validator can't be tied to a specific language.

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

### 2f. Set `caseInsensitive` Correctly

`caseInsensitive` lives inside each `languages[]` entry and is inverted from the old `case_sensitive` field: `caseInsensitive: true` means keywords are case-insensitive (e.g. `ENTITY` and `entity` are equivalent). It's picked up from your Langium config, so it usually just needs a sanity check against your grammar's keyword/terminal definitions.

```yaml
languages:
  - name: my-dsl
    description: A DSL for ...
    caseInsensitive: true      # keywords are case-insensitive
    grammar: ./src/grammar/my-dsl.langium
```

## Step 3: Validate the Descriptor

After making changes, validate the descriptor schema and verify all referenced files exist:

```bash
lai validate
```

This checks required fields, path existence, and schema conformance.

## Validation Rules

The descriptor is validated against a schema when saved. Required fields:

- `version` — non-empty string (the LAI CLI version; auto-injected)
- `langium_config` — non-empty path
- `languages` — array with at least one entry, and each entry requires:
  - `name` — non-empty string
  - `description` — non-empty string
  - `grammar` — non-empty path
  - `caseInsensitive` — defined (boolean)

Conditionally validated when present:

- `services.validators` — each entry requires a non-empty `path`
- `examples` — each entry requires `name`, `file`, and `tags` (array)
- `documentation` — each entry requires `src` and `priority` (`"high"`, `"medium"`, or `"low"`)

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
| Validation failures in evals | Add an entry to the `services.validators` list so the LLM knows your semantic rules |
| LLM doesn't understand scoping | Add the scope_provider service path |
| Generic or vague generated prompts | Improve the `description` field and add high-priority documentation |
| Missing language features in prompts | Add examples that demonstrate those features |
| Inconsistent LLM outputs | Add more diverse examples with clear tags |
