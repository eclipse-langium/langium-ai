# Evaluation API Reference

The Langium AI evaluation framework provides a vitest-style API for writing programmatic evaluation suites. This allows you to define evaluation cases in TypeScript/JavaScript with hooks, parametrized evaluations, and flexible evaluation filtering.

## Table of Contents

- [Basic Structure](#basic-structure)
- [Evaluation Suites](#evaluation-suites)
- [Evaluation Cases](#evaluation-cases)
- [Lifecycle Hooks](#lifecycle-hooks)
- [Parametrized Evals](#parametrized-evals)
- [Evaluation Filtering](#evaluation-filtering)
- [Complete Example](#complete-example)

## Basic Structure

Every eval file follows this pattern:

```typescript
import { describe, evaluation, beforeAll, afterAll, beforeEach, afterEach } from 'langium-ai-tools/evals';

describe('Eval Suite Name', () => {
  // setup hooks
  beforeAll(() => {
    // runs once before all evals in this suite
  });

  beforeEach(() => {
    // runs before each eval
  });

  // eval cases
  evaluation('eval case 1', async (ctx) => {
    // eval logic
    return { passed: true };
  });

  evaluation('eval case 2', async (ctx) => {
    // eval logic
    return { passed: false, error: 'Something went wrong' };
  });

  // cleanup hooks
  afterEach(() => {
    // runs after each eval
  });

  afterAll(() => {
    // runs once after all evals in this suite
  });
});
```

## eval Suites

### describe()

Define a eval suite that groups related evaluation cases together.

```typescript
describe('DSL Generation Evals', () => {
  evaluation('generate hello world', async (ctx) => {
    // eval logic
    return { passed: true };
  });
});
```

### describe.skip()

Skip an entire eval suite. All evaluations within will be marked as skipped.

```typescript
describe.skip('Work in Progress Suite', () => {
  evaluation('not ready yet', async (ctx) => {
    return { passed: true };
  });
});
```

### describe.only()

Run only this suite, skipping all other suites and evals that don't have `.only()`.

```typescript
describe.only('Focus on this suite', () => {
  evaluation('this will run', async (ctx) => {
    return { passed: true };
  });
});

describe('This will be skipped', () => {
  evaluation('this will not run', async (ctx) => {
    return { passed: true };
  });
});
```

## Evaluation Cases

### evaluation()

Define a single evaluation eval case. The function receives a context object and must return an evaluation result.

```typescript
evaluation('eval name', async (ctx) => {
  // ctx contains:
  // - systemPrompt: string - the generated system prompt
  // - project: { name: string } - project information

  const result = await yourEvalLogic(ctx);

  return {
    passed: true,  // or false
    error?: 'Optional error message if passed is false'
  };
});
```

### evaluation.skip()

Skip a specific evaluation case.

```typescript
evaluation.skip('temporarily disabled eval', async (ctx) => {
  return { passed: true };
});
```

### evaluation.only()

Run only this evaluation (and other `.only()` evals), skipping all others.

```typescript
evaluation.only('focus on this eval', async (ctx) => {
  return { passed: true };
});

evaluation('this will be skipped', async (ctx) => {
  return { passed: true };
});
```

## Lifecycle Hooks

Hooks allow you to run setup and cleanup code at specific points in the eval lifecycle. All hooks can be synchronous or asynchronous.

### beforeAll()

Runs **once** before all evaluation cases in the suite.

```typescript
describe('Database Evals', () => {
  let db;

  beforeAll(async () => {
    // expensive setup that only needs to happen once
    db = await initializeDatabase();
    await db.seed();
  });

  evaluation('query eval 1', async (ctx) => {
    const result = await db.query('SELECT * FROM users');
    return { passed: result.length > 0 };
  });

  evaluation('query eval 2', async (ctx) => {
    const result = await db.query('SELECT * FROM posts');
    return { passed: result.length > 0 };
  });
});
```

**Execution order:** `beforeAll` → eval 1 → eval 2

### afterAll()

Runs **once** after all evaluation cases in the suite.

```typescript
describe('File System Evals', () => {
  let tempDir;

  beforeAll(() => {
    tempDir = createTempDirectory();
  });

  afterAll(() => {
    // cleanup after all evals complete
    deleteTempDirectory(tempDir);
  });

  evaluation('create file', async (ctx) => {
    await writeFile(`${tempDir}/eval.txt`, 'content');
    return { passed: true };
  });
});
```

**Execution order:** eval 1 → eval 2 → `afterAll`

### beforeEach()

Runs **before each** evaluation case in the suite.

```typescript
describe('Stateful Evals', () => {
  let counter;

  beforeEach(() => {
    // reset state before each eval
    counter = 0;
  });

  evaluation('increment eval', async (ctx) => {
    counter++;
    return { passed: counter === 1 };
  });

  evaluation('another increment eval', async (ctx) => {
    counter++;
    return { passed: counter === 1 };  // passes because beforeEach reset counter
  });
});
```

**Execution order:** `beforeEach` → eval 1 → `beforeEach` → eval 2

### afterEach()

Runs **after each** evaluation case in the suite.

```typescript
describe('Cleanup Evals', () => {
  let connection;

  beforeEach(async () => {
    connection = await openConnection();
  });

  afterEach(async () => {
    // cleanup after each eval
    await connection.close();
  });

  evaluation('use connection 1', async (ctx) => {
    await connection.query('SELECT 1');
    return { passed: true };
  });

  evaluation('use connection 2', async (ctx) => {
    await connection.query('SELECT 2');
    return { passed: true };
  });
});
```

**Execution order:** `beforeEach` → eval 1 → `afterEach` → `beforeEach` → eval 2 → `afterEach`

### All Hooks Together

When all hooks are present, they execute in this order:

```typescript
describe('Complete Hook Example', () => {
  beforeAll(() => {
    console.log('1. beforeAll - runs once at the start');
  });

  beforeEach(() => {
    console.log('2. beforeEach - runs before each eval');
  });

  afterEach(() => {
    console.log('4. afterEach - runs after each eval');
  });

  afterAll(() => {
    console.log('5. afterAll - runs once at the end');
  });

  evaluation('eval 1', async (ctx) => {
    console.log('3a. eval 1');
    return { passed: true };
  });

  evaluation('eval 2', async (ctx) => {
    console.log('3b. eval 2');
    return { passed: true };
  });
});
```

**Console output:**
```
1. beforeAll - runs once at the start
2. beforeEach - runs before each eval
3a. eval 1
4. afterEach - runs after each eval
2. beforeEach - runs before each eval
3b. eval 2
4. afterEach - runs after each eval
5. afterAll - runs once at the end
```

## Parametrized Evals

Use `evaluation.each()` to run the same eval with different data sets. This is perfect for evaluating multiple inputs or edge cases without duplicating code.

### Basic Usage with Objects

```typescript
describe('Parametrized Evals', () => {
  evaluation.each([
    { input: 'hello', expected: 'HELLO' },
    { input: 'world', expected: 'WORLD' },
    { input: 'eval', expected: 'EVAL' }
  ])('uppercase $input', (data) => async (ctx) => {
    const result = data.input.toUpperCase();
    return {
      passed: result === data.expected,
      error: result !== data.expected ? `Expected ${data.expected}, got ${result}` : undefined
    };
  });
});
```

This creates three separate evals:
- `uppercase hello`
- `uppercase world`
- `uppercase eval`

### Template Syntax

Use `$propertyName` in the eval name to interpolate values from the data object:

```typescript
evaluation.each([
  { name: 'Alice', age: 30 },
  { name: 'Bob', age: 25 }
])('Person $name is $age years old', (data) => async (ctx) => {
  // eval logic using data.name and data.age
  return { passed: true };
});
```

Creates:
- `Person Alice is 30 years old`
- `Person Bob is 25 years old`

### Primitive Values

Use `%s`, `%i`, `%o`, or `%j` placeholders for primitive values:

```typescript
evaluation.each([1, 2, 3, 5, 8])(
  'fibonacci number %i',
  (num) => async (ctx) => {
    const isFibonacci = checkFibonacci(num);
    return { passed: isFibonacci };
  }
);
```

Creates:
- `fibonacci number 1`
- `fibonacci number 2`
- `fibonacci number 3`
- etc.

### Placeholder Reference

| Placeholder | Description | Example |
|------------|-------------|---------|
| `$propertyName` | Object property value | `$input` → `"eval1"` |
| `%s` | String representation | `%s` → `"value"` |
| `%i` | Integer/number | `%i` → `42` |
| `%o` | JSON.stringify | `%o` → `{"key":"value"}` |
| `%j` | JSON.stringify (alias) | `%j` → `{"key":"value"}` |

### Auto-indexing

If no placeholders are found in the name, eval cases are automatically numbered:

```typescript
evaluation.each(['a', 'b', 'c'])('eval case', (val) => async (ctx) => {
  return { passed: true };
});
```

Creates:
- `eval case [0]`
- `eval case [1]`
- `eval case [2]`

### Complex Example

```typescript
describe('Model Comparison', () => {
  const evalCases = [
    {
      model: 'gpt-4',
      prompt: 'Write a function',
      minTokens: 50,
      maxTokens: 200
    },
    {
      model: 'claude-3',
      prompt: 'Write a function',
      minTokens: 50,
      maxTokens: 200
    }
  ];

  evaluation.each(evalCases)(
    '$model generates code within token limits',
    (evalCase) => async (ctx) => {
      const response = await generateCode(evalCase.model, evalCase.prompt);
      const tokens = countTokens(response);

      return {
        passed: tokens >= evalCase.minTokens && tokens <= evalCase.maxTokens,
        error: tokens < evalCase.minTokens
          ? `Too few tokens: ${tokens}`
          : tokens > evalCase.maxTokens
          ? `Too many tokens: ${tokens}`
          : undefined
      };
    }
  );
});
```

## eval Filtering

### .only() Behavior

When any eval or suite has `.only()`, **only** those marked evals run:

```typescript
describe('Suite 1', () => {
  evaluation('eval 1', async (ctx) => ({ passed: true }));  // skipped
  evaluation.only('eval 2', async (ctx) => ({ passed: true }));  // runs
});

describe('Suite 2', () => {
  evaluation('eval 3', async (ctx) => ({ passed: true }));  // skipped
  evaluation('eval 4', async (ctx) => ({ passed: true }));  // skipped
});
```

Only `eval 2` will run.

### .skip() Behavior

Skipped evals are marked as skipped in the results but don't fail the eval run:

```typescript
describe('Suite', () => {
  evaluation('eval 1', async (ctx) => ({ passed: true }));  // runs
  evaluation.skip('eval 2', async (ctx) => ({ passed: true }));  // skipped
  evaluation('eval 3', async (ctx) => ({ passed: true }));  // runs
});
```

Evals 1 and 3 run normally. Eval 2 is marked as skipped.

### Combining Filters

```typescript
describe.only('Only this suite', () => {
  evaluation('runs', async (ctx) => ({ passed: true }));
  evaluation.skip('skipped even in .only suite', async (ctx) => ({ passed: true }));
  evaluation.only('definitely runs', async (ctx) => ({ passed: true }));
});

describe('Ignored suite', () => {
  evaluation('does not run', async (ctx) => ({ passed: true }));
});
```

## Complete Example

Here's a comprehensive example using all features:

```typescript
import {
  describe,
  evaluation,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach
} from 'langium-ai-tools/evaluation';
import ollama from 'ollama';

describe('DSL Code Generation Evals', () => {
  let model;
  let evalResults = [];

  // setup expensive resources once
  beforeAll(async () => {
    console.log('Loading model...');
    model = await ollama.pull('codellama');
  });

  // reset per-eval state
  beforeEach(() => {
    evalResults = [];
  });

  // cleanup per-eval resources
  afterEach(() => {
    console.log(`Eval recorded ${evalResults.length} results`);
  });

  // cleanup expensive resources once
  afterAll(async () => {
    console.log('Evals complete');
  });

  // simple eval
  evaluation('generates valid syntax', async (ctx) => {
    const response = await ollama.chat({
      model: 'codellama',
      messages: [
        { role: 'system', content: ctx.systemPrompt },
        { role: 'user', content: 'Write a person declaration' }
      ]
    });

    const code = response.message.content;
    const isValid = validateSyntax(code);

    return {
      passed: isValid,
      error: !isValid ? 'Invalid syntax generated' : undefined
    };
  });

  // parametrized eval
  evaluation.each([
    { input: 'person Alice', expected: 'Alice' },
    { input: 'person Bob', expected: 'Bob' },
    { input: 'person Charlie', expected: 'Charlie' }
  ])('extracts name $expected from "$input"', (data) => async (ctx) => {
    const parsed = parseDeclaration(data.input);

    return {
      passed: parsed.name === data.expected,
      error: parsed.name !== data.expected
        ? `Expected ${data.expected}, got ${parsed.name}`
        : undefined
    };
  });

  // focused eval (only this runs if uncommented)
  // evaluation.only('debug specific case', async (ctx) => {
  //   return { passed: true };
  // });

  // skipped eval
  evaluation.skip('not implemented yet', async (ctx) => {
    return { passed: false, error: 'TODO' };
  });
});
```

## Best Practices

### 1. Use beforeAll/afterAll for expensive operations

```typescript
// ✅ Good - setup once
beforeAll(async () => {
  db = await connectToDatabase();
});

// ❌ Bad - reconnects for every eval
beforeEach(async () => {
  db = await connectToDatabase();
});
```

### 2. Use beforeEach/afterEach for eval isolation

```typescript
// ✅ Good - each eval gets fresh state
beforeEach(() => {
  cache.clear();
});

// ❌ Bad - evals affect each other
evaluation('eval 1', async (ctx) => {
  cache.set('key', 'value');
  return { passed: true };
});

evaluation('eval 2', async (ctx) => {
  // cache still has data from eval 1!
  return { passed: cache.size === 0 };  // fails
});
```

### 3. Use descriptive eval names

```typescript
// ✅ Good
evaluation('generates valid person declaration with age field', async (ctx) => {
  // ...
});

// ❌ Bad
evaluation('eval 1', async (ctx) => {
  // ...
});
```

### 4. Return meaningful error messages

```typescript
// ✅ Good
return {
  passed: false,
  error: `Expected name "Alice" but got "${parsed.name}"`
};

// ❌ Bad
return {
  passed: false,
  error: 'Failed'
};
```

### 5. Use .each() for similar eval cases

```typescript
// ✅ Good - DRY
evaluation.each([
  { input: 'eval1', expected: 'result1' },
  { input: 'eval2', expected: 'result2' }
])('evaluating $input', (data) => async (ctx) => {
  // single implementation
});

// ❌ Bad - repetitive
evaluation('eval1', async (ctx) => {
  // duplicate code
});
evaluation('eval2', async (ctx) => {
  // duplicate code
});
```

## Running Your Evals

Evals are executed using the `lai evaluate` command. All `.eval.ts` files in the configured evaluations directory are discovered and run automatically.

```bash
# run all .eval.ts files
lai evaluate

# verbose output (results printed as they complete)
lai evaluate --verbose

# use a specific system prompt
lai evaluate --sysprompt path/to/prompt.md
```

## Next Steps

- See [evaluations.md](./evaluations.md) for evaluation workflow, result management, and CI integration
- Check out the [example-dsl-evaluator](../../examples/example-dsl-evaluator) for complete examples
