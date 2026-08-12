/******************************************************************************
 * Copyright 2024 - 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

/**
 * Baseline Validator Class
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import * as path from 'path';

/**
 * Result from running an evaluator
 */
export type EvaluatorResultData = Record<string, unknown>;

export type EvaluatorResultMetadata = Record<string, unknown> & {
    /**
     * Time it took to run the evaluator case (duration)
     */
    duration: number;
};

/**
 * Evaluator result type
 */
export type EvaluatorResult<T = EvaluatorResultData> = {
    /**
     * Name of this evaluation
     */
    name: string;

    /**
     * Metadata for this evaluation, which at the minimum includes a duration for how long it took to run
     */
    metadata: EvaluatorResultMetadata;

    /**
     * Data for this evaluation
     */
    data: T;
};

/**
 * Helper to process a set of results, averaging all runs of each runner-evaluator-case combination
 * The averaged result will contain numeric results only that can be aggregated
 */
export function averageAcrossCases(results: EvaluatorResult[]): EvaluatorResult[] {
    const mappedResults: Map<string, EvaluatorResult[]> = new Map();

    const averagedResults: EvaluatorResult[] = [];

    // collect like-results
    for (const result of results) {
        // add this result to the map (grouping by runner & case)
        const name = result.name;
        const existingResult = mappedResults.get(name) ?? [];
        existingResult.push(result);
        mappedResults.set(name, existingResult);
    }

    // average the results without mutating the input
    for (const [_key, groupedResults] of mappedResults) {
        // sum numeric entries into a fresh accumulator; non-numeric entries
        // aren't relevant in an aggregation context and are never copied over
        const sums: Record<string, number> = {};
        for (const result of groupedResults) {
            for (const [key, value] of Object.entries(result.data)) {
                if (typeof value === 'number') {
                    sums[key] = (sums[key] ?? 0) + value;
                }
            }
        }

        // divide each entry by the number of 'groupedResults', rounded to 2 decimal places
        const avgData: EvaluatorResultData = {};
        for (const [key, sum] of Object.entries(sums)) {
            avgData[key] = Math.round((sum / groupedResults.length) * 100) / 100;
        }

        averagedResults.push({
            name: groupedResults[0].name,
            metadata: { ...groupedResults[0].metadata },
            data: avgData,
        });
    }
    return averagedResults;
}

/**
 * Averages all results across runners at the highest level, to get a single result for each runner
 */
export function averageAcrossRunners(results: EvaluatorResult[]): EvaluatorResult[] {
    // first average across runs
    const processedResults = averageAcrossCases(results);

    // now average across runners
    const mappedResults: Map<string, EvaluatorResult[]> = new Map();

    // averaged across all runs
    // but omits numeric values, which won't be aggregated
    const averagedResults: EvaluatorResult[] = [];

    // collect like-results
    for (const result of processedResults) {
        // add this result to the map (grouping by runner)
        const name: unknown = result.metadata.runner;
        // collect only if name is a string
        if (typeof name !== 'string') {
            continue;
        }
        const existingResult = mappedResults.get(name) ?? [];
        existingResult.push(result);
        mappedResults.set(name, existingResult);
    }

    // average the results
    for (const [_key, groupedResults] of mappedResults) {
        // don't process where the runner isn't a string
        if (groupedResults[0].metadata.runner === undefined || typeof groupedResults[0].metadata.runner !== 'string') {
            continue;
        }

        // sum numeric entries into a fresh accumulator, leaving the input untouched
        const sums: Record<string, number> = {};
        for (const result of groupedResults) {
            for (const [key, value] of Object.entries(result.data)) {
                if (typeof value === 'number') {
                    sums[key] = (sums[key] ?? 0) + value;
                }
            }
        }

        // divide each entry by the number of 'groupedResults', rounded to 2 decimal places
        const avgData: EvaluatorResultData = {};
        for (const [key, sum] of Object.entries(sums)) {
            avgData[key] = Math.round((sum / groupedResults.length) * 100) / 100;
        }

        averagedResults.push({
            name: groupedResults[0].metadata.runner,
            metadata: { ...groupedResults[0].metadata },
            data: avgData,
        });
    }

    return averagedResults;
}

/**
 * Report
 */
export interface Report {
    config: {
        name: string;
        description: string;
        history_folder: string;
        num_runs: number;
    };
    date: string;
    runTime: string;
    results: EvaluatorResult[];
}

/**
 * Loads a specific report, containing evaluator results from a file & returns it
 */
export function loadReport(file: string): Report {
    return JSON.parse(readFileSync(file, 'utf-8')) as Report;
}

/**
 * Attempts to load the most recent evaluator result(s) from the given directory.
 *
 * @param dir The directory to load results from
 * @param take The number of results to take, starting with the most recent ones.
 *  If this is _not_ set, then only the most recent result will be returned by itself.
 */
export function loadLastResults(dir: string, take?: number): EvaluatorResult[] {
    if (!existsSync(dir)) {
        throw new Error(`Directory does not exist: ${dir}`);
    }

    let files: string[];

    if (!take) {
        const lastFile = path.join(dir, 'last.txt');

        if (!existsSync(lastFile)) {
            throw new Error(`Last file does not exist in directory: ${dir}. Try running an evaluation matrix first.`);
        }
        // read name from last file
        const lastFileName = readFileSync(lastFile).toString().trim();
        files = [lastFileName];
    } else {
        // read the most recent files
        // TODO @montymxb, flatten this out a bit more later on
        files = readdirSync(dir)
            .filter((f) => f.endsWith('.json'))
            .sort()
            .reverse()
            .slice(0, take);
    }

    // build results from each report
    const results: EvaluatorResult[] = [];
    for (const file of files) {
        const report = loadReport(path.join(dir, file));
        results.push(...report.results);
    }

    return results;
}

/**
 * Evaluator class for evaluating agent responses
 */
export abstract class Evaluator {
    /**
     * Run an evaluation over some response, possibly compares with an expected one if provided
     * Produces a complete evaluator result (name, metadata & data).
     */
    abstract evaluate(response: string, expected_response?: string): Promise<EvaluatorResult>;
}

export function mergeEvaluators(...evaluators: Evaluator[]): Evaluator {
    // merge evaluators in sequence
    return evaluators.reduce((acc, val) => mergeEvaluatorsInternal(acc, val));
}

/**
 * Merges two evaluators together in sequence into a single evaluator result.
 * Data & metadata of `a` are combined with those of `b` (b takes precedence in key overrides).
 * The merge is a shallow merge, so nested object properties will not be copied.
 * The merged result keeps `a`'s name.
 * @param a First evaluator to merge
 * @param b Second evaluator to merge
 */
function mergeEvaluatorsInternal(a: Evaluator, b: Evaluator): Evaluator {
    return {
        async evaluate(response: string, expected_response: string): Promise<EvaluatorResult> {
            const r1 = await a.evaluate(response, expected_response);
            const r2 = await b.evaluate(response, expected_response);
            return {
                name: r1.name,
                metadata: {
                    ...r1.metadata,
                    ...r2.metadata,
                },
                data: {
                    ...r1.data,
                    ...r2.data,
                },
            };
        },
    };
}
