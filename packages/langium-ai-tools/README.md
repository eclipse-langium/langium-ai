# Langium AI Tools

## Overview

This project provides core tools that make it easier to build AI applications for Langium DSLs. These core tools help to solve the following problems around building AI applications by making it easier to:

- Determine which models work well for your DSL
- Evaluate which changes to your tooling actually improve your generation results
- How to process DSL documents in a way that makes sense for your DSL & target application

To solve these problems this package provides:

- Splitting Support: Using your DSL's parser to make it easier to pre-process documents before ingest (such as into a vector DB)
- Training & Evaluation Support: Assess the output of your model + RAG + whatever else you have in your stack with regards to a structured input/output evaluation phase.
- Constraint Support: Synthesize BNF-style grammars from your Langium grammar, which can be used to control the token output from an LLM to conform to your DSL's expected structure (this feature has been added directly into the **langium-cli** itself, as it has wider general applications).

What's also important is what is not provided:
- *We don't choose your model for you.* We believe this is your choice, and we don't want to presume we know best or lock you in. All we assume is that you have a model (or stack) that we can use. For tooling that leverages models directly, we'll be providing a separate package under Langium AI that will be separate from the core here.
- *We don't choose your stack for you.* There are many excellent choices for hosting providers, databases, caches, and other supporting services (local & remote). There's so many, and they change so often, that we decided it was best to not assume what works here, and rather support preparing information for whatever stack you choose.

LLMs (and transformers in general), are evolving quite rapidly. With this approach, these tools help you build your own specific approach, whilst letting you keep up with the latest and greatest in model developments.

## Installation

Langium AI tools tracks tightly with Langium releases. If you're using Langium 3.X or 4.X in your project, you'll want to install the corresponding version of Langium AI Tools that matches it.

```bash
# if you're using Langium 4.1.X
npm i --save langium-ai-tools@^4.1.0

# or 3.5.X
npm i --save langium-ai-tools@^3.5.0
```

We don't actively support Langium 2.X or earlier.

## Usage

### Splitting

Langium AI Tools presents various splitting utilities that are simple but flexible. This includes:
- retrieving all nodes of a specific type from a document
- splitting a document into chunks by node type (with or without comments)
- generating program maps

For example, if you have a DSL that looks like this:

```
// A dsl that allows writing functions...
function foo() { ... }
function bar() { ... }
```

Assuming your Langium parser rule for these functions is called `Func`, you could write a splitter like so to chunk by functions:

```ts
const chunks: string[] = splitByNode(
    dslProgramString,
    [
        (node) => node.$type === 'Func'
    ],
    myLanguageServices.grammar,
    // default options, comment rule names can be set to [] to avoid including comments in chunks
    // { commentRuleNames: ['ML_COMMENT', 'SL_COMMENT'] }
);
```

And you would get back something like this:
```
[
    'function foo() { ... }',
    'function bar() { ... }'
]
```

In case you want just the AST node, and don't want it transformed to text, you can use the `splitByNodeToAst` function instead, giving you back the raw AST nodes to do with as you want.

If you want a program map (like in the case of generating a mapping of your repo), you can utilize the `ProgramMapper` class.

```ts
import { ProgramMapper } from 'langium-ai-tools/splitter';

const myProg = `
function foo() { ... }
function bar() { ... }
`;

const services = createMyDSLServices(EmptyFileSystem).mydsl; // will differ based on the name of your DSL
const mapper = new ProgramMapper(services, {
    mappingRules: [
        {
            predicate: (node) => node.$type === 'Func',
            map: (node) => `func ${node.name}`
        },
        ...
    ]
});
const programMap: string[] = mapper.map(myProg);
```

Which would give you an output like so:

```
[
    'func foo',
    'func bar'
]
```

In both cases, you can provide predicates for the nodes that are of interest to you. The splitter chunking is a bit more opinionated, but the program mapper allows fine-grained generation when needed.

For examples you can check out the [example-dsl-evaluator](../examples/example-dsl-evaluator/README.md) project, which also contains splitting & mapping examples.

### Evaluation

Regardless of how you've sourced your model, you'll need a metric for determining the quality of your output.

For Langium DSLs, we provide an series of *evaluator* utilities to help in assessing the correctness of DSL output.

It's important to point out that evaluations are *not* tests, instead this is more similar to [OpenAI's evals framework](https://github.com/openai/evals). The idea is that we're grading or scoring outputs with regards to an expected output from a known input. This is a simple but effective approach to determining if your model is generally doing what you expect it to in a structured way, and *not* doing something else as well.

Take the following evaluator for example. Let's assume you have [Ollama](https://ollama.com/) running locally, and the [ollama-js](https://github.com/ollama/ollama-js) package installed. From a given base model you can define evaluatiosn like so.

```ts
import { Evaluator, EvaluatorScore } from 'langium-ai-tools/evaluator';
import ollama from 'ollama';

// get your language's services
const services = createMyDSLServices(EmptyFileSystem).MyDSL;

// define an evaluator using your language's services
// this effectively uses your existing parser & validations to 'grade' the response
const evaluator = new LangiumEvaluator(services);

// make some prompt
const response = await ollama.chat({
    'llama3.2',
    [{
        role: 'user',
        content: 'Write me a hello world program written in MyDSL.'
    }]
});

const es: EvaluatorScore = evaluator.evaluate(response.message.content);

// print out your score!
console.log(es);
```

You can also define custom evaluators that are more tuned to the needs of your DSL. This could be handling diagnostics in a very specific fashion, extracting code out of the response itself to check, using an evaluation model to grade the response, or using a combination of techniques to get a more accurate score for your model's output.

In general we stick to focusing on what Langium can do to help with evaluation, but leave the opportunity open for you to extend, supplement, or modify evaluation logic as you see fit.

### Evaluation Matrix

The Evaluation Matrix provides a framework for testing multiple model configurations against a set of test cases using Langium AI evaluators. This is particularly helpful when comparing across models, prompt strategies, RAG setups, or other variations in your AI stack.

In practice an evaluation matrix can be helpful when deciding between which models or services to use up front, but this can also be done externally by levering the evaluator directly yourself.

#### Overview

The evaluation matrix orchestrates three key components:
- **Runners**: Functions that execute prompts against models, services, or other response generators
- **Cases**: Test scenarios with expected outputs, which can be defined in code or loaded from YAML files
- **Evaluators**: Metrics that score actual responses against expected responses

The matrix fires off each runner against each test case, evaluates the results with all configured evaluators, and produces reports with aggregated metrics.

#### Runners

A runner is an interface that takes a prompt and message history, returning a response string. This serves as an abstraction so you can test your own setup as it stands

Runners can wrap:
- Direct model calls (Ollama, OpenAI, Anthropic, etc.)
- RAG pipelines with vector database lookups
- Multi-step agent workflows
- Really any system that produces some text output

```ts
import { type Runner, type Message } from 'langium-ai-tools/evaluator';

const myRunner: Runner = {
    name: 'my-model',
    runner: async (prompt: string, messages: Message[]) => {
        // call your model/service here
        const response = await myModel.generate(prompt, messages);
        return response;
    }
};
```

#### Cases

Test cases define the input and expected output for evaluation:

```ts
import { type EvalCase } from 'langium-ai-tools/evaluator';

const testCase: EvalCase = {
    name: 'hello-world-grammar',
    prompt: 'Generate a Langium grammar for a simple hello world DSL',
    expected_response: `grammar HelloWorld
    entry Greeting: 'hello' name=ID;
    terminal ID: /[_a-zA-Z][\\w_]*/;`,
    // optional fields
    history: [{
        role: 'system',
        content: 'You are an expert in Langium grammars.'
    }],
    tags: ['grammar', 'beginner'],
    only_check_codeblocks: false
};
```

Cases can also be loaded from YAML files for easier management:

```yaml
# eval-cases.yaml
eval_cases:
  - name: "hello-world-grammar"
    prompt: "Generate a Langium grammar for a simple hello world DSL"
    expected_response: |
      grammar HelloWorld
      entry Greeting: 'hello' name=ID;
      terminal ID: /[_a-zA-Z][\w_]*/;
    tags:
      - "grammar"
      - "beginner"
```

And can be loaded like so:

```ts
import { loadFromYaml } from 'langium-ai-tools/evaluator';
import { readFileSync } from 'fs';

const yamlContent = readFileSync('eval-cases.yaml', 'utf-8');
const cases = loadFromYaml(yamlContent);
```

##### Evaluators

Evaluators score responses against expected outputs. You can use built-in evaluators or create custom ones:

```ts
import { LangiumEvaluator, mergeEvaluators } from 'langium-ai-tools/evaluator';
import { createMyDSLServices } from './my-dsl';

const services = createMyDSLServices(EmptyFileSystem).MyDSL;

// use the built-in Langium evaluator
const langiumEval = new LangiumEvaluator(services);

// or create a custom evaluator
class CustomEvaluator extends Evaluator {
    async evaluate(response: string, expected: string): Promise<Partial<EvaluatorResult>> {
        return {
            data: {
                custom_metric: calculateMetric(response, expected)
            }
        };
    }
}

// merge multiple evaluators
const combinedEval = mergeEvaluators(
    langiumEval,
    new CustomEvaluator()
);
```

#### Setting Up an Evaluation Matrix

Create and run an evaluation matrix by combining your runners, cases, and evaluators:

```ts
import { EvalMatrix } from 'langium-ai-tools/evaluator';

const matrix = new EvalMatrix({
    config: {
        name: 'Model Comparison',
        description: 'Comparing different models for DSL generation',
        history_folder: '.eval-history',
        num_runs: 3  // number of times to run each combination
    },
    runners: [
        myModelRunner,
        myModelWithRAGRunner,
        competitorModelRunner
    ],
    evaluators: [
        {
            name: 'Langium Parser + Validation',
            eval: new LangiumEvaluator(services)
        },
        {
            name: 'Edit Distance',
            eval: new EditDistanceEvaluator()
        }
    ],
    cases: testCases
});

// run the matrix and get results
const results = await matrix.run();
```

#### Configuration Options

The `EvalMatrixConfig` provides several options:

- **name**: Descriptive name for this evaluation run
- **description**: Longer description of what's being evaluated
- **history_folder**: Directory where results will be saved as timestamped JSON files
- **num_runs**: Number of times to run each runner-case-evaluator combination (for averaging)

#### Working with Results

The matrix produces detailed results that include:

```ts
type EvaluatorResult = {
    // combined runner-case-evaluator name
    name: string;
    metadata: {
        runner: string;
        evaluator: string;
        testCase: EvalCase;
        actual_response: string;
        // runtime in seconds
        duration: number;
        run_count: number;
    };
    data: {
        // runtime in seconds
        runtime: number;
        // evaluator-specific metrics (errors, warnings, edit_distance, etc.)
        ...
    };
};
```

Results are automatically saved to the history folder with timestamps. You can then process these results using utility functions:

```ts
import {
    averageAcrossCases,
    averageAcrossRunners,
    loadLastResults
} from 'langium-ai-tools/evaluator';

// average results across multiple runs of the same case
const avgResults = averageAcrossCases(results);

// average across all cases for each runner
const runnerAvgs = averageAcrossRunners(results);

// load results from previous runs
const lastResults = loadLastResults('.eval-history');
const last3Runs = loadLastResults('.eval-history', 3);

// display results
console.table(avgResults.map(r => ({
    name: r.name,
    ...r.data
})));
```

#### Complete Example

And here's a full example combining all the parts listed above:

```ts
import {
    EvalMatrix,
    LangiumEvaluator,
    averageAcrossCases,
    type Runner,
    type EvalCase
} from 'langium-ai-tools/evaluator';
import { createMyDSLServices } from './my-dsl';
import { EmptyFileSystem } from 'langium';
import ollama from 'ollama';

// setup services
const services = createMyDSLServices(EmptyFileSystem).MyDSL;

// define runners
const baseRunner: Runner = {
    name: 'llama3.2-base',
    runner: async (prompt: string, messages: Message[]) => {
        const response = await ollama.chat({
            model: 'llama3.2',
            messages: [...messages, { role: 'user', content: prompt }]
        });
        return response.message.content;
    }
};

// define test cases
const cases: EvalCase[] = [
    {
        name: 'simple-grammar',
        prompt: 'Create a grammar for arithmetic expressions',
        expected_response: `grammar Arithmetic
        entry Expression: Addition;
        Addition: Multiplication ({infer BinaryExpression.left=current} operator=('+' | '-') right=Multiplication)*;
        Multiplication: Primary ({infer BinaryExpression.left=current} operator=('*' | '/') right=Primary)*;
        Primary: '(' Expression ')' | value=NUMBER;
        terminal NUMBER returns number: /[0-9]+/;`
    },
    // more cases...
];

// create and run matrix
const matrix = new EvalMatrix({
    config: {
        name: 'DSL Generation Test',
        description: 'Testing model performance on grammar generation',
        history_folder: '.eval-results',
        num_runs: 5
    },
    runners: [baseRunner],
    evaluators: [{
        name: 'Langium Evaluator',
        eval: new LangiumEvaluator(services)
    }],
    cases
});

const results = await matrix.run();

// process and display results
const averaged = averageAcrossCases(results);
console.log('\nAveraged Results:');
console.table(averaged.map(r => ({
    name: r.name,
    errors: r.data.errors,
    warnings: r.data.warnings,
    runtime: r.data.runtime
})));
```

For more complete examples, see the [example-dsl-evaluator](../examples/example-dsl-evaluator) project.

## Contributing

If you want to help feel free to open an issue or a PR. As a general note we're open to accept changes that focus on improving how we can support AI application development for Langium DSLs. But we don't want to provide explicit bindings to actual services/providers at this time, such as LLamaIndex, Ollama, LangChain, or others. Similarly this package doesn't provide direct bindings for AI providers such as OpenAI and Anthropic here. Instead these changes will go into a separate package under Langium AI that is intended for this purpose.
