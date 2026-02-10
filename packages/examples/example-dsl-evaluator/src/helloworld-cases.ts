/* eslint-disable no-useless-escape */
/******************************************************************************
 * Copyright 2024 - 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { type EvalCase } from "langium-ai-tools";

export const cases: EvalCase[] = [
    {
        name: 'No Prompt',
        prompt: 'Generate a simple hello world grammar written in Langium',
        expected_response: `
Here's a simple Hello World written in Langium:

\`\`\`langium
grammar HelloWorld

entry Model:
    (persons+=Person | greetings+=Greeting)*;

Person:
    'person' name=ID;

Greeting:
    'Hello' person=[Person:ID] '!';

hidden terminal WS: /\s+/;
terminal ID: /[_a-zA-Z][\w_]*/;

hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
\`\`\`
`
    },
    {
        name: 'With Langium System Prompt',
        history: [{
            role: 'system',
            content: `You are an expert in Langium grammars.
    Your role is to provide accurate, detailed, and insightful explanations and advice on Langium grammar-related topics.
    You will answer questions, provide examples, and offer guidance on best practices, ensuring clarity and precision in all responses.   
`
        }],
        prompt: `Generate a simple hello world program in the Hello World language.`,
        expected_response: `
Here's a simple Hello World written in Langium:

\`\`\`langium
grammar HelloWorld

entry Model:
    (persons+=Person | greetings+=Greeting)*;

Person:
    'person' name=ID;

Greeting:
    'Hello' person=[Person:ID] '!';

hidden terminal WS: /\s+/;
terminal ID: /[_a-zA-Z][\w_]*/;

hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
\`\`\`
        `
    },
    {
        name: 'With Hello World Grammar & Prompt',
        history: [{
            role: 'system',
            content: `You are an expert in the Hello World language, which is written in Langium.
When prompted you will provide a simple hello world program.
For reference, here's the Langium grammar that defines the Hello World language:
\`\`\`langium
grammar HelloWorld

entry Model:
(persons+=Person | greetings+=Greeting)*;

Person:
'person' name=ID;

Greeting:
'Hello' person=[Person:ID] '!';

hidden terminal WS: /\s+/;
terminal ID: /[_a-zA-Z][\w_]*/;
terminal INT returns number: /[0-9]+/;
terminal STRING: /"(\\.|[^"\\])*"|'(\\.|[^'\\])*'/;

hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
\`\`\`

And here is a simple Hello World program written in that grammar:
\`\`\`hello-world
person Alice
person Bob

Hello Alice!
Hello Bob!
\`\`\``
        }],
        prompt: 'Generate a simple program for the Hello World language',
        expected_response: `
person John
person Carly

Hello Carly!
Hello John!`
    },
    {
        name: 'With Improved Hello World Prompt',
        history: [{
            role: 'system',
            content: `You are an expert in the Hello World language, which is written in Langium.
When prompted you will provide a simple hello world program.
For reference, here's the Langium grammar that defines the Hello World language:
\`\`\`langium
// name of the grammar
grammar HelloWorld

// entry point for the AST model
// composed of a list of persons and greetings, in any order
entry Model:
(persons+=Person | greetings+=Greeting)*;

// declare a person with a given name
Person:
'person' name=ID;

// greet a previously defined person (by name), ending with an exclamation mark
Greeting:
'Hello' person=[Person:ID] '!';

// whitespace is ignored in this language
hidden terminal WS: /\s+/;

// regex for ID terminals
terminal ID: /[_a-zA-Z][\w_]*/;

// regex for multi-line & single line comments
// however we do not support nested comments
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
\`\`\`

And here is a simple Hello World program written in that grammar:
\`\`\`hello-world
// declare two persons, Alice & Bob
person Alice
person Bob

// greet Alice & Bob
Hello Alice!
Hello Bob!

// if we wanted to greet John & Carly, we would write:
person John
person Carly

Hello John!
Hello Carly!
\`\`\`
`}],
        prompt: 'Generate a simple program for the Hello World language',
        expected_response: `
person John
person Carly

Hello Carly!
Hello John!`
    }
];