/* eslint-disable no-useless-escape */
/******************************************************************************
 * Copyright 2024 - 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { EmptyFileSystem } from 'langium';
import { averageAcrossCases, EvalCase, EvalMatrix, EvaluatorResult, generateRadarChart, LangiumEvaluator, LangiumEvaluatorResultData, loadLastResults, mergeEvaluators, Message, normalizeData, Runner } from 'langium-ai-tools/evaluator';
import { createLangiumGrammarServices } from 'langium/grammar';
import ollama from 'ollama';
import { EmbeddingEvaluatorResultData, OllamaEmbeddingEvaluator } from './embedding-evaluator.js';
import * as readline from 'readline/promises';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

/**
 * Create services for the Langium grammar language.
 * 
 * In your case, you would do the same for your own language instead (using your module)
 */
const langiumServices = createLangiumGrammarServices(EmptyFileSystem);

/**
 * Runners
 */
const Runners = {

    /**
     * llama3.2 3b runner
     */
    llama3_2_3b: {
        name: 'llama3.2 3B',
        runner: async (content: string, messages: Message[] = []) => {
            const newMsgs: Message[] =  [...messages, { role: 'user', content }];
            return (await Runners.prompt('llama3.2:latest', newMsgs)).message.content;
        }
    } as Runner,

    /**
     * Codellama runner
     */
    codellama: {
        name: 'codellama',
        runner: async (content: string, messages: Message[] = []) => {
            const newMsgs: Message[] =  [...messages, { role: 'user', content }];
            return (await Runners.prompt('codellama:latest', newMsgs)).message.content;
        }
    } as Runner,

    /**
     * And a codegemma runner
     */
    codegemma: {
        name: 'codegemma',
        runner: async (content: string, messages: Message[] = []) => {
            const newMsgs: Message[] = [...messages, { role: 'user', content }];
            return (await Runners.prompt('codegemma:latest', newMsgs)).message.content;
        }
    } as Runner,

    /**
     * Helper to prompt models hosted in Ollama
     */
    prompt: async function (model: string, messages: Message[]) {
        const response = await ollama.chat({
            model, messages
        });
        return response;
    }
}

/**
 * A simple case for generating a HelloWorld grammar
 */
const caseHelloWorld: EvalCase = {
    name: "Hello World Grammar",
    history: [],
    prompt: "Generate a simple HelloWorld grammar in Langium.",
    expected_response: `Certainly. Here's an example of a possible HelloWorld grammar written in the Langium grammar language:

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

This grammar defines a simple HelloWorld language with two parser rules: Person and Greeting. The entry rule Model allows for an arbitrary sequence of Person and Greeting elements. A Person is defined by the keyword 'person' followed by an ID terminal, which represents the person's name. A Greeting consists of the word 'Hello' followed by a reference to a Person and an exclamation mark. The grammar also includes terminal rules for whitespace, identifiers, and comments.`
};

/**
 * An example evaluator for evaluating Langium grammars & checking for embedding similarity (using Ollama)
 */
const langiumAndEmbeddingEvaluator = mergeEvaluators(

    // built-in evaluator for Langium grammars (i.e. the Langium DSL itself)
    new LangiumEvaluator(langiumServices.grammar),

    // then run the Ollama embedding evaluator to compare expected vs. actual
    new OllamaEmbeddingEvaluator('nomic-embed-text')
);

export async function runLangDevDemo() {

    // check if all the necessary models are installed via ollama
    const models = ['llama3.2:latest', 'codellama:latest', 'codegemma:latest', 'nomic-embed-text:latest'];
    const listedModels = (await ollama.list()).models;
    console.log('Available models: ', listedModels.map(m => m.name));
    const missingModels = models.filter(model => !listedModels.some(m => m.name === model));
    if (missingModels.length > 0) {
        console.error(`The following models are missing: ${missingModels.join(', ')}.`);
        // prompt to install
        const answer = await rl.question(`Do you want to install these missing models for this demo? (y/n) `);
        if (answer.toLowerCase() === 'y') {
            for (const model of missingModels) {
                console.log(`Installing model ${model}...`);
                await ollama.pull({
                    model: model
                });
            }
        } else {
            console.error('Please install missing models and try again.');
            return;
        }
    }

    const eMat = new EvalMatrix({

        // basic configuration
        config: {
            name: 'LangDev Demo',
            description: 'Showing basic evaluation capabilities of Langium AI',
            history_folder: '.langium-ai',
            num_runs: 3
        },

        // just a few runners
        runners: [
            Runners.llama3_2_3b,
            Runners.codellama,
            Runners.codegemma,
        ],

        // using our merged evaluator
        evaluators: [
            {
                name: 'Langium + Embedding Evaluator (merged)',
                eval: langiumAndEmbeddingEvaluator
            }
        ],

        // single case
        cases: [
            caseHelloWorld
        ]
    });
    
    // run the matrix
    const results = await eMat.run();

    // print the full results (as saved)
    console.log('Evaluation report: ');
    printResults(results);

    // print the average results
    const processedResults = averageAcrossCases(results);
    console.log('Average Evaluation report: ');
    printResults(processedResults);
    
}

/**
 * Helper to print results to the console
 */
function printResults(results: EvaluatorResult[]) {
    console.table(results.map(r => {
        return {
            name: r.name,
            ...r.data
        }
    }), ['name', 'errors', 'warnings', 'infos', 'hints', 'unassigned', 'similarity']);
}

/**
 * Helper type to describe the merged evaluator results
 */
type MergedEvaluatorResultType = LangiumEvaluatorResultData & EmbeddingEvaluatorResultData;

/**
 * Takes the last results we obtained, and builds a quick radar chart from them
 */
export function generateChartFromLastResults() {
    const rawResults = loadLastResults('.langium-ai', 1);
    console.log('Last Evaluation report: ');

    // generate a radar chart for this run
    generateRadarChart(
        'Radar Chart (smaller is better)',
        normalizeData(rawResults),
        './radar-chart.html',
        (data: MergedEvaluatorResultType) => {
            return {
                'Failures': data.failures,
                'Errors':   data.errors,
                'Warnings': data.warnings,
                'Semantic Diff': 1.0 - data.similarity, // inverse similarity
                'Response Size': data.response_length ?? 0,
                'Time': data._runtime ?? 0
            }
        }
    );
}


