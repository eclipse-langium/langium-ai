import { Evaluator, EvaluatorResult } from "./evaluator.js";
import fs from 'fs';
import * as path from 'path';

/**
 * Configuration for the evaluation matrix
 */
export interface EvalMatrixConfig {
    config: {
        /**
         * Name of the evaluation matrix
         */
        name: string;

        /**
         * Helpful description of the evaluation matrix
         */
        description: string;

        /**
         * Where to store run history
         */
        history_folder: string;

        /**
         * The number of runs to perform for each case
         * Note this will trigger evaluation for all registered evaluators for each run
         */
        num_runs: number;
    },

    /**
     * Runners to evaluate
     */
    runners: Runner[];

    /**
     * Evaluators to evaluate with
     */
    evaluators: NamedEvaluator[];

    /**
     * Cases to evaluate
     */
    cases: Case[];
}

/**
 * Evaluation matrix for running multiple runners on multiple cases with multiple evaluators
 */
export class EvalMatrix {
    private config: EvalMatrixConfig;

    constructor(config: EvalMatrixConfig) {
        this.config = config;
    }

    /**
     * Run the evaluation matrix, getting all results back
     */
    async run(): Promise<EvaluatorResult[]> {

        // get the current timestamp
        const start = new Date();

        const results: EvaluatorResult[] = [];

        // verify that all runners have unique names first
        const runnerNames = this.config.runners.map(r => r.name);
        const uniqueRunnerNames = new Set();
        for (const name of runnerNames) {
            if (uniqueRunnerNames.has(name)) {
                throw new Error(`Runner names must be unique, found duplicate: ${name}`);
            }
            uniqueRunnerNames.add(name);
        }

        console.log(`Running evaluation matrix: ${this.config.config.name}`);
        console.log(`Found ${this.config.runners.length * this.config.cases.length * this.config.evaluators.length} runner-evaluator-case combinations to handle`);

        // run all runners
        for (const runner of this.config.runners) {

            console.log(`* Runner: ${runner.name}`);

            // run all cases for this runner
            for (const testCase of this.config.cases) {
                console.log(`  * Case: ${testCase.name}`);

                const runCount = this.config.config.num_runs ?? 1;
                for (let iteration = 0; iteration < runCount; iteration++) {
                    const runnerStartTime = new Date();
                    const response = await runner.runner(testCase.prompt, testCase.history ?? []);
                    const runnerEndTime = new Date();

                    // run all evaluators on this response
                    for (const evaluator of this.config.evaluators) {
                        console.log(`    * Evaluator: ${evaluator.name} (run ${iteration + 1})`);
                        const result = await evaluator.eval.evaluate(response, testCase.expected_response);
                        if (!result.name) {
                            result.name = `${runner.name} - ${testCase.name} - ${evaluator.name}`;
                        }
                        // add runtime there too, so we have access to it
                        result.data!._runtime = (runnerEndTime.getTime() - runnerStartTime.getTime()) / 1000.0; // in seconds

                        result.metadata = {
                            runner: runner.name,
                            evaluator: evaluator.name,
                            testCase: { ...testCase },
                            actual_response: response,
                            duration: (runnerEndTime.getTime() - runnerStartTime.getTime()) / 1000.0, // in seconds
                            run_count: iteration + 1
                        };

                        results.push(result as EvaluatorResult);
                    }
                }
            }
        }

        // check if the folder exists first
        if (!fs.existsSync(this.config.config.history_folder)) {
            fs.mkdirSync(this.config.config.history_folder);
        }

        const dateStr = new Date().toISOString();
        const sanitizedDateStr = dateStr.replace(/:/g, '-').replace(/\./g, '-');
        let fileName = `${sanitizedDateStr}-${this.config.config.name.toLowerCase().replace(/\s+/g, '-')}.json`;
        // escape any slashes too
        fileName = fileName.replace(/\//g, '-');

        console.log(`Writing results to file: ${path.join(this.config.config.history_folder, fileName)}`);

        // run time in seconds
        const runTime = (new Date().getTime() - start.getTime()) / 1000;
        console.log(`Evaluation matrix completed in ${runTime} seconds (${runTime / 60} minutes)`);

        // prepare & write results to file
        const report = {
            config: this.config.config,
            date: dateStr,
            runTime: `${runTime}s`,
            results
        };
        fs.writeFileSync(path.join(this.config.config.history_folder, fileName), JSON.stringify(report, null, 2));

        // write the name of this last report into last.txt
        fs.writeFileSync(path.join(this.config.config.history_folder, 'last.txt'), fileName);

        return results;
    }
}

/**
 * General format for histories when prompting
 */
export interface Message {
    role: 'user' | 'system' | 'assistant';
    content: string;
}

/**
 * Runner interface for running a prompt against a mode, a service, or something else that provides a response
 */
export interface Runner {
    name: string;
    runner: (prompt: string, messages: Message[]) => Promise<string>;
}

/**
 * Generic evaluator interface w/ a name to identify it
 */
export interface NamedEvaluator {
    name: string;
    eval: Evaluator;
}

/**
 * Case interface for defining an evaluation case
 */
export interface Case {
    /**
     * Name of the case
     */
    name: string;

    /**
     * Options Message history, used for system, user & assistant messages
     */
    history?: Message[];

    /**
     * Core prompt to run with
     */
    prompt: string;

    /**
     * Context for the prompt, used for RAG applications
     */
    context: string[];

    /**
     * Expected response
     */
    expected_response: string;
}