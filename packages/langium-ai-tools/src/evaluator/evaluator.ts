/**
 * Baseline Validator Class
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import * as path from 'path';

export type EvaluatorResultData = Record<string, unknown> & {
    _runtime?: number;
};

/**
 * Evaluator result type
 */
export type EvaluatorResult = {
    /**
     * Name of this evaluation
     */
    name: string;

    /**
     * Optional metadata, can be used to store additional information
     */
    metadata: Record<string, any>;

    /**
     * Data for this evaluation
     */
    data: EvaluatorResultData;

};

/**
 * Helper to process a set of results, averaging all runs of each runner-evaluator-case combination
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

    // average the results
    for (const [_key, groupedResults] of mappedResults) {
        const avgData = groupedResults[0].data;

        // sum all results except the first
        for (const result of groupedResults.slice(1)) {
            const resultData = result.data;
            for (const [key, value] of Object.entries(resultData)) {
                if (typeof value === 'number') {
                    avgData[key] = (avgData[key] as number ?? 0) + value;
                }
            }
        }

        // lastly, divide each entry by the number of 'groupedResults'
        for (const [key, value] of Object.entries(avgData)) {
            if (typeof value === 'number') {
                avgData[key] = value / groupedResults.length;
                // round to 2 decimal places
                avgData[key] = Math.round((avgData[key] as number) * 100) / 100;
            }
        }

        averagedResults.push({
            name: groupedResults[0].name,
            metadata: groupedResults[0].metadata,
            data: avgData
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

    const averagedResults: EvaluatorResult[] = [];

    // collect like-results
    for (const result of processedResults) {
        // add this result to the map (grouping by runner)
        const name = result.metadata.runner;
        const existingResult = mappedResults.get(name) ?? [];
        existingResult.push(result);
        mappedResults.set(name, existingResult);
    }

    // average the results
    for (const [_key, groupedResults] of mappedResults) {
        const avgData = groupedResults[0].data;

        // sum all results except the first
        for (const result of groupedResults.slice(1)) {
            const resultData = result.data;
            for (const [key, value] of Object.entries(resultData)) {
                if (typeof value === 'number') {
                    avgData[key] = (avgData[key] as number ?? 0) + value;
                }
            }
        }

        // lastly, divide each entry by the number of 'groupedResults'
        for (const [key, value] of Object.entries(avgData)) {
            if (typeof value === 'number') {
                avgData[key] = value / groupedResults.length;
                // round to 2 decimal places
                avgData[key] = Math.round((avgData[key] as number) * 100) / 100;
            }
        }

        averagedResults.push({
            name: groupedResults[0].metadata.runner,
            metadata: groupedResults[0].metadata,
            data: avgData
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
 * Attempts to load the most recent evaluator results from the given file
 */
export function loadLastResults(dir: string, take?: number): EvaluatorResult[] {
    if (!existsSync(dir)) {
        throw new Error(`Directory does not exist: ${dir}`);
    }

    let files = readdirSync(dir).filter(f => f.endsWith('.json'));

    if (!take) {
        const lastFile = path.join(dir, 'last.txt');

        if (!existsSync(lastFile)) {
            throw new Error(`Last file does not exist in directory: ${dir}. Try running an evaluation matrix first.`);
        }
        // read name from last file
        const lastFileName = readFileSync(lastFile).toString();

        files.push(lastFileName);

    } else {
        // read the most recent files
        files = files.sort().reverse().slice(0, take);
        
    }

    const results: EvaluatorResult[] = [];

    for (const file of files) {
        const report = loadReport(path.join(dir, file));
        results.push(...report.results);
    }

    // find the most recently created file in the path & read it
    // const lastFileName = readFileSync(lastFile).toString();
    // return loadReport(path.join(dir, lastFileName)).results;
    return results;
}

/**
 * Evaluator class for evaluating agent responses
 */
export abstract class Evaluator {
    /**
     * Validate some agent response
     */
    abstract evaluate(response: string, expected_response: string): Promise<Partial<EvaluatorResult>>;

}

export function mergeEvaluators(...evaluators: Evaluator[]): Evaluator {
    // merge evaluators in sequence
    return evaluators.reduce((acc, val) => mergeEvaluatorsInternal(acc, val));
}

/**
 * Merges two evaluators together in sequence, such that results of a are combined with b (b takes precedence in key overrides)
 * @param a First evaluator to merge
 * @param b Second evaluator to merge
 */
function mergeEvaluatorsInternal(a: Evaluator, b: Evaluator): Evaluator {
    return {
        async evaluate(response: string, expected_response: string): Promise<Partial<EvaluatorResult>> {
            const r1 = await a.evaluate(response, expected_response);
            const r2 = await b.evaluate(response, expected_response);
            return {
                metadata: {
                    ...r1.metadata,
                    ...r2.metadata
                },
                data: {
                    ...r1.data,
                    ...r2.data
                }
            };
        }
    };
}
