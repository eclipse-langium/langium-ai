# System Prompt Generation

System prompts are generated from your language descriptor using `lai gen sysprompt`. The command reads the descriptor YAML file and assembles a markdown system prompt by pulling in referenced project files.

## How It Works

The generator loads your descriptor and builds a structured system prompt with the following sections:

### Introduction

Always included. Contains the language name and description from the descriptor.

### Grammar

Included if the descriptor's `grammar` path points to an existing `.langium` file. The full grammar content is embedded in a code block.

### Built-in Library

Included if the descriptor has a `builtins` path pointing to an existing file. The built-in type/function definitions are embedded so the LLM knows what's available by default.

### Validation Rules

Included if `services.validator` is set and the file exists. The validator source code is embedded so the LLM understands semantic constraints.

### Examples

Included if the descriptor has an `examples` array. Up to 3 examples are loaded, each showing the example name, description, tags, and file content.

### Documentation

Included if the descriptor has a `documentation` array. Up to 2 documentation entries are included as links or file references.

### Capabilities

Always included. A standard section describing what the LLM can do with the language (explain programs, write new ones, debug issues, etc.).

## Generating a System Prompt

```bash
# generate from descriptor (prompts before overwriting)
lai gen sysprompt

# regenerate from scratch, skipping the overwrite prompt
lai gen sysprompt --fresh
```

The output file path is configured in `lai.config.jsonc` under `sysprompt.path`.

## Output Format

The generated system prompt is a markdown file structured as:

```markdown
# MyLanguage Language System Prompt v1.0.0

### Introduction

You are an expert AI assistant for the MyLanguage domain-specific language.
...

### Grammar

The language grammar is defined as follows:
...

### Examples

Example MyLanguage programs:
...

### Capabilities

When working with MyLanguage:
- Explain the meaning and behavior of existing programs
- Write new programs that follow the grammar and validation rules
- Help users understand language features and best practices
- Debug and fix issues in DSL code
```

## Descriptor Fields That Feed the Prompt

| Descriptor Field | Prompt Section | Required |
|------------------|---------------|----------|
| `name` | Introduction, Capabilities | Yes |
| `description` | Introduction | Yes |
| `version` | Header | Yes |
| `grammar` | Grammar | Yes |
| `builtins` | Built-in Library | No |
| `services.validator` | Validation Rules | No |
| `examples` | Examples (first 3) | No |
| `documentation` | Documentation (first 2) | No |

## Best Practices

1. **Keep the descriptor accurate** — the system prompt is only as good as the descriptor it's built from. Run `lai validate` to check for issues.
2. **Add examples** — examples help the LLM understand idiomatic usage of your language. Include a mix of simple and complex programs.
3. **Include documentation** — if you have language guides or references, add them to the descriptor so they're surfaced in the prompt.
4. **Iterate** — generate, evaluate (`lai evaluate`), review failures, refine the descriptor, and regenerate.
