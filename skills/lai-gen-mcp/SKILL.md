---
name: lai-gen-mcp
description: Generate a Model Context Protocol (MCP) server that exposes a Langium DSL's parser and validator as an MCP tool, allowing any MCP-compatible client to validate DSL code and receive diagnostics.
user-invocable: true
---

# Generate MCP Server

This guide instructs an agent on how to generate a Model Context Protocol (MCP) server for an arbitrary Langium-based DSL. The generated server exposes a `validate` tool that accepts DSL source code and returns diagnostics (errors, warnings, hints, information) by running the input through the DSL's actual Langium parser and validator. Any MCP-compatible client (Claude Code, Cursor, VS Code, etc.) can then validate DSL code on the fly.

You may also use the `lai` and `langium` skills to achieve a better understanding of langium-ai and the Langium-based DSL in question.

## When to Use

- After a Langium project has been initialized with `lai init` and a descriptor exists
- When you want to give an MCP-compatible AI assistant the ability to validate code written in your DSL
- When building a feedback loop where an LLM generates DSL code and can self-check it via MCP

## Prerequisites

The target Langium project must have:

1. **A working Langium grammar** (`.langium` file) and generated TypeScript artifacts (`ast.ts`, `grammar.ts`, module file)
2. **A service creation function** — every Langium project has a `create<Name>Services` function in its module file (e.g., `createMyDslServices` in `src/my-dsl-module.ts`). This is the entry point for all language services.
3. **Node.js and npm** available in the project

## Inputs

Gather the following from the project before generating:

1. **Language descriptor** (`language.descriptor.yml`) or `lai.config.jsonc` — to find the grammar path, service paths, and language name
2. **The module file** — contains the `create<Name>Services(...)` function. Typically located at `src/<name>-module.ts` or `src/language/<name>-module.ts`. The descriptor's `services.module` field points to it if present; otherwise search for `createServices` or `create.*Services` in the `src/` directory.
3. **The language metadata** — the `LanguageMetaData` export (usually in `generated/ast.ts` or `generated/module.ts`) tells you the language's file extensions

## Determining the Output Location

Before generating any files, determine where the `mcp/` folder should be placed. The location depends on whether the project is a monorepo or a single-package project.

### Step 0: Detect Monorepo vs Single Package

Check for monorepo indicators in the project root:

1. **`package.json` workspaces field** — if the root `package.json` has a `workspaces` array (or `workspaces.packages`), the project is a monorepo
2. **`pnpm-workspace.yaml`** — presence of this file indicates a pnpm monorepo
3. **`lerna.json`** — presence of this file indicates a Lerna monorepo
4. **`nx.json`** — presence of this file indicates an Nx monorepo

If none of these are present, treat the project as a single-package project.

### Single-Package Project

The default output location is `mcp/` at the project root:

```
my-dsl-project/
  src/
  mcp/              <-- generated here
    mcp-server.ts
    tsconfig.json
  package.json
```

### Monorepo Project

In a monorepo, the `mcp/` folder should be placed inside the specific Langium package, **not** at the monorepo root. Use the `lai.config.jsonc` or `language.descriptor.yml` location to determine which package contains the DSL. For example:

```
my-monorepo/
  packages/
    my-dsl/
      src/
      mcp/          <-- generated here, alongside the DSL package
        mcp-server.ts
        tsconfig.json
      package.json
    other-package/
  package.json      <-- monorepo root, NOT here
```

If `lai.config.jsonc` is at the root of a monorepo but the Langium grammar and module live in a sub-package, prefer placing `mcp/` inside that sub-package so that imports resolve correctly relative to the DSL source.

### Confirm with the User

Before proceeding with file generation, **always ask the user** to confirm the proposed output location. Present the detected location and explain why it was chosen:

- For single-package projects: *"I'll generate the MCP server in `mcp/` at the project root. Does that location work for you?"*
- For monorepo projects: *"This appears to be a monorepo. I'll generate the MCP server in `packages/my-dsl/mcp/` alongside the DSL package. Does that location work for you, or would you prefer a different path?"*

Wait for the user's confirmation or alternative path before generating any files.

## Output

The agent should produce:

1. **`mcp/mcp-server.ts`** — the MCP server source file (inside the confirmed location)
2. **`mcp/tsconfig.json`** — a minimal tsconfig for the MCP server
3. **Updated `package.json`** — with required dependencies added (or instructions to install them). In a monorepo, update the **DSL package's** `package.json`, not the root.
4. **Configuration snippet** — an MCP client config block the user can paste into their tool of choice

## Step-by-Step Generation Process

### Step 1: Locate the Service Creation Function

Find the module file in the Langium project. It exports a function like:

```typescript
export function createMyDslServices(context: DefaultSharedCoreModule): {
    shared: LangiumSharedServices;
    MyDsl: MyDslServices;
}
```

Note:
- The **function name** (e.g., `createMyDslServices`)
- The **service accessor key** — the property name on the returned object that holds the language-specific services (e.g., `MyDsl`). This is the key you pass to `LangiumEvaluator`.
- Whether it uses `NodeFileSystem` or `EmptyFileSystem` — the MCP server should use `EmptyFileSystem` since it validates in-memory strings, not files on disk

### Step 2: Install Dependencies

The following npm packages are required. Add them to the project's `package.json`:

```bash
npm install @modelcontextprotocol/sdk langium-ai-tools zod
```

- `@modelcontextprotocol/sdk` (^1.25.1) — the MCP protocol SDK
- `langium-ai-tools` — provides `LangiumEvaluator` for parsing and validating DSL code (treats `langium` as a peer dependency, supports 4.x and up)
- `zod` (^3.25 || ^4.0) — schema validation for tool input, required by the MCP SDK

The project should already have `langium` as a dependency. If not, install it too:

```bash
npm install langium
```

In a monorepo, run these install commands from the DSL package directory (or use `npm install -w packages/my-dsl` from the root).

### Step 3: Generate `mcp/mcp-server.ts`

Create the MCP server file. Use the following template, replacing the placeholder values:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { LangiumEvaluator } from 'langium-ai-tools';
import { EmptyFileSystem } from 'langium';
import { z } from 'zod';

// REPLACE: import your DSL's service creation function
import { create__DSL_NAME__Services } from '../src/__module_path__';

// initialize the MCP server
const server = new McpServer({
    name: '__dsl-name__-mcp-server',
    version: '1.0.0',
});

// create language services and the evaluator
const services = create__DSL_NAME__Services(EmptyFileSystem).__ServiceKey__;
const evaluator = new LangiumEvaluator(services);

// register the validate tool
server.registerTool(
    '__dsl-name__-syntax-checker',
    {
        title: '__DSL Name__ Syntax Checker',
        description: 'Validates __DSL Name__ code and returns diagnostics (errors, warnings, hints).',
        inputSchema: { code: z.string() },
    },
    async ({ code }) => {
        const result = await validateCode(code);
        return {
            content: [
                {
                    type: 'text',
                    text: result ?? 'The provided code has no issues.',
                },
            ],
        };
    },
);

async function validateCode(code: string): Promise<string | undefined> {
    const evalResult = await evaluator.evaluate(code);
    if (evalResult.data) {
        const diagnostics = evalResult.data.diagnostics;
        if (diagnostics.length > 0) {
            return diagnostics
                .map(
                    (d) =>
                        `${severityText(d.severity)}: ${d.message} at line ${d.range.start.line + 1}, column ${d.range.start.character + 1}`,
                )
                .join('\n');
        }
    }
    return undefined;
}

function severityText(severity: number | undefined): string {
    switch (severity) {
        case 1:
            return 'Error';
        case 2:
            return 'Warning';
        case 3:
            return 'Information';
        case 4:
            return 'Hint';
        default:
            return 'Unknown';
    }
}

// start the server with stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
```

#### Placeholder Replacements

| Placeholder | Replace With | Example |
|---|---|---|
| `__DSL_NAME__` | PascalCase name from the service creation function | `MyDsl` |
| `__dsl-name__` | Kebab-case name for identifiers and tool names | `my-dsl` |
| `__DSL Name__` | Human-readable name for descriptions | `My DSL` |
| `__module_path__` | Relative path from `mcp/` to the module file (without `.ts`) | `language/my-dsl-module` |
| `__ServiceKey__` | The property key on the services object | `MyDsl` |

#### Workspace Initialization

Some Langium projects require workspace initialization before validation works correctly (e.g., for built-in libraries or preloaded documents). If the project has built-in files or a custom workspace manager, add initialization after creating services:

```typescript
const shared = create__DSL_NAME__Services(EmptyFileSystem).shared;
await shared.workspace.WorkspaceManager.initializeWorkspace([]);
```

Check if the project's tests or evaluations call `initializeWorkspace` — if they do, include it in the MCP server.

### Step 4: Generate `mcp/tsconfig.json`

Create a minimal tsconfig for the MCP server directory:

```json
{
    "compilerOptions": {
        "target": "ESNext",
        "module": "Node16",
        "moduleResolution": "Node16",
        "outDir": "./dist",
        "rootDir": ".",
        "strict": true,
        "esModuleInterop": true,
        "skipLibCheck": true,
        "declaration": true
    },
    "include": ["."],
    "exclude": ["node_modules", "dist"]
}
```

If the project already has a `tsconfig.base.json` at the root, extend it instead:

```json
{
    "extends": "../tsconfig.base.json",
    "compilerOptions": {
        "rootDir": ".",
        "outDir": "./dist"
    },
    "include": ["."],
    "exclude": ["node_modules", "dist"]
}
```

In a monorepo, adjust the `extends` path relative to the `mcp/` folder's actual location (e.g., `../../tsconfig.base.json` if the mcp folder is inside a sub-package).

### Step 5: Add a Start Script

Add a script to `package.json` so the server can be started easily:

```json
{
    "scripts": {
        "mcp:start": "npx tsx mcp/mcp-server.ts"
    }
}
```

Using `tsx` allows running TypeScript directly without a separate compilation step. If the project prefers compiled output, add a build step instead:

```json
{
    "scripts": {
        "mcp:build": "tsc -p mcp/tsconfig.json",
        "mcp:start": "node mcp/dist/mcp-server.js"
    }
}
```

### Step 6: Generate MCP Client Configuration

Provide the user with a configuration snippet they can add to their MCP client. The exact format depends on the client:

#### Claude Code (`claude_desktop_config.json` or `.mcp.json`)

```json
{
    "mcpServers": {
        "__DSL Name__ MCP": {
            "command": "npx",
            "args": ["tsx", "mcp/mcp-server.ts"],
            "cwd": "/absolute/path/to/project"
        }
    }
}
```

#### Cursor (`.cursor/mcp.json`)

```json
{
    "mcpServers": {
        "__DSL Name__ MCP": {
            "command": "npx",
            "args": ["tsx", "mcp/mcp-server.ts"],
            "cwd": "/absolute/path/to/project"
        }
    }
}
```

Replace `/absolute/path/to/project` with the actual project root (or DSL package root in a monorepo).

### Step 7: Verify the Server

After generation, verify the server works:

1. **Build check** — run `npx tsx mcp/mcp-server.ts` and confirm it starts without errors (it will block waiting for stdio input; Ctrl+C to exit)
2. **Smoke test** — if the project has example files, suggest the user test with an MCP client or write a quick client script:

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
    command: 'npx',
    args: ['tsx', 'mcp/mcp-server.ts'],
});

const client = new Client({ name: 'test-client', version: '1.0.0' });
await client.connect(transport);

const tools = await client.listTools();
console.log('Available tools:', tools.tools.map(t => t.name));

// test with valid code
const result = await client.callTool({
    name: '__dsl-name__-syntax-checker',
    arguments: { code: '<paste a valid example program here>' },
});
console.log('Result:', result.content);

process.exit(0);
```

## What the MCP Server Returns

The `validate` tool accepts a `code` string and returns one of:

- **No issues**: `"The provided code has no issues."` — the input parsed and validated successfully
- **Diagnostics**: A newline-separated list of diagnostic messages, each formatted as:
  ```
  Severity: Message at line N, column M
  ```
  Where severity is one of: `Error`, `Warning`, `Information`, `Hint`.

Diagnostics come from two sources:
1. **Parser errors** — syntax errors detected during parsing (missing tokens, unexpected input, etc.)
2. **Validation errors** — semantic errors detected by the language's validator (type mismatches, unresolved references, constraint violations, etc.)

This means the MCP tool respects all custom validation rules, scoping rules, and linking behavior defined in the Langium project — it is not just a syntax checker but a full language validator.

## Customization Options

After generating the base server, the user may want to extend it:

### Additional Tools

The MCP SDK supports registering multiple tools. Common additions:

- **Format tool** — if the DSL has a formatter, expose it as an MCP tool
- **Completion tool** — expose code completion suggestions
- **Hover tool** — return documentation for a symbol at a given position

### Multiple File Support

The base server validates a single code string. For languages that support imports or multi-file projects, the server can be extended to accept multiple files or a workspace context.

### Filtered Diagnostics

Some users may want to filter diagnostics by severity (e.g., only return errors, not warnings). This can be added as an optional input parameter:

```typescript
inputSchema: {
    code: z.string(),
    minSeverity: z.number().min(1).max(4).optional().describe('Minimum severity to report (1=Error, 2=Warning, 3=Info, 4=Hint). Defaults to 4 (all).')
}
```

## Relationship to Other LAI Artifacts

| Artifact | Purpose |
|---|---|
| **Descriptor** | Tells the agent where to find the module file, grammar, and services |
| **System prompt** | Teaches an LLM how to write valid DSL code |
| **MCP server** | Lets an LLM validate DSL code it has written, closing the feedback loop |
| **Evaluations** | Batch-test LLM output quality; the MCP server enables real-time single-input validation |

The MCP server complements the system prompt: the prompt teaches the LLM how to write correct code, and the MCP server lets it verify its output. Together they form a generation-validation loop.
