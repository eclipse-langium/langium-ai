/**
 * Test runner for evaluation files
 */

import { pathToFileURL } from 'url';
import { register } from 'node:module';
import type { EvalContext, EvaluationCaseResult } from './index.js';

// track if tsx loader is registered
let tsxLoaderRegistered = false;

/**
 * Progress callback for evaluation execution
 */
export interface EvalProgressCallback {
    (current: number, total: number): void;
}

/**
 * Result callback for evaluation execution (called as each test completes)
 */
export interface EvalResultCallback {
    (result: EvaluationCaseResult, current: number, total: number): void;
}

/**
 * Run a single evaluation file
 */
export async function runEvalFile(
    filePath: string,
    context: EvalContext,
    onProgress?: EvalProgressCallback,
    onResult?: EvalResultCallback,
): Promise<EvaluationCaseResult[]> {
    // register tsx loader for TypeScript support (only once)
    if (!tsxLoaderRegistered && filePath.endsWith('.ts')) {
        try {
            // use tsx's ESM loader (Node 20.6+ compatible)
            register('tsx/esm', import.meta.url);
            tsxLoaderRegistered = true;
        } catch (_error) {
            // tsx may not be available, continue anyway (silence warning since it's working)
        }
    }

    const { getCollectedSuites, clearSuites } = await import('./index.js');

    // clear any previous state
    clearSuites();

    // dynamically import eval file (triggers describe/test calls)
    // add cache-busting query parameter to force fresh import (prevents module caching issues)
    await import(pathToFileURL(filePath).href + '?run=' + Date.now());

    // collect suites
    const suites = getCollectedSuites();

    // check if any suite or evaluation has .only()
    const hasOnly = suites.some((s) => s.only || s.evaluations.some((e) => e.only));

    // count total evaluations for progress tracking
    const totalEvaluations = suites.reduce((sum, suite) => sum + suite.evaluations.length, 0);
    let completedEvaluations = 0;

    // execute all tests (including creating results for skipped ones)
    const results: EvaluationCaseResult[] = [];

    for (const suite of suites) {
        // determine if this entire suite is skipped
        const suiteSkipped = suite.skip || (hasOnly && !suite.only && !suite.evaluations.some((e) => e.only));

        // run beforeAll hook once before all evaluations in the suite
        if (!suiteSkipped && suite.beforeAllHook) {
            try {
                await suite.beforeAllHook();
            } catch (error) {
                console.error('beforeAll hook failed:', error);
                // continue anyway, tests will fail if setup is incomplete
            }
        }

        for (const evalDef of suite.evaluations) {
            // determine if this evaluation is skipped
            const evalSkipped = suiteSkipped || evalDef.skip || (hasOnly && !evalDef.only && !suite.only);

            if (evalSkipped) {
                // add skipped result without executing the test
                const skippedResult: EvaluationCaseResult = {
                    name: `${suite.name} - ${evalDef.name}`,
                    metadata: {
                        evalFile: filePath,
                        suiteName: suite.name,
                        caseName: evalDef.name,
                        duration: 0,
                    },
                    data: {
                        score: 0,
                        skipped: true,
                    },
                };
                results.push(skippedResult);
                completedEvaluations++;
                if (onProgress) {
                    onProgress(completedEvaluations, totalEvaluations);
                }
                if (onResult) {
                    onResult(skippedResult, completedEvaluations, totalEvaluations);
                }
                continue;
            }

            // execute non-skipped test
            const start = Date.now();
            try {
                // run beforeEach hook if it exists
                if (suite.beforeEachHook) {
                    await suite.beforeEachHook();
                }

                // get core evaluation data
                const evaluationData = await evalDef.fn(context);

                // run afterEach hook if it exists
                if (suite.afterEachHook) {
                    await suite.afterEachHook();
                }

                // construct a result around it
                const evaluatorCaseResult: EvaluationCaseResult = {
                    name: `${suite.name} - ${evalDef.name}`,
                    metadata: {
                        evalFile: filePath,
                        suiteName: suite.name,
                        caseName: evalDef.name,
                        duration: Date.now() - start,
                    },
                    data: evaluationData,
                };

                results.push(evaluatorCaseResult);
                completedEvaluations++;
                if (onProgress) {
                    onProgress(completedEvaluations, totalEvaluations);
                }
                if (onResult) {
                    onResult(evaluatorCaseResult, completedEvaluations, totalEvaluations);
                }
            } catch (error) {
                // run afterEach hook even on error
                if (suite.afterEachHook) {
                    try {
                        await suite.afterEachHook();
                    } catch (afterEachError) {
                        // log afterEach errors but don't fail the test twice
                        console.error('afterEach hook failed:', afterEachError);
                    }
                }

                // treat errors as failures
                const failureResult: EvaluationCaseResult = {
                    name: `${suite.name} - ${evalDef.name}`,
                    metadata: {
                        evalFile: filePath,
                        suiteName: suite.name,
                        caseName: evalDef.name,
                        duration: Date.now() - start,
                    },
                    data: {
                        score: 0,
                        error: error instanceof Error ? error.message : String(error),
                    },
                };
                results.push(failureResult);
                completedEvaluations++;
                if (onProgress) {
                    onProgress(completedEvaluations, totalEvaluations);
                }
                if (onResult) {
                    onResult(failureResult, completedEvaluations, totalEvaluations);
                }
            }
        }

        // run afterAll hook once after all evaluations in the suite
        if (!suiteSkipped && suite.afterAllHook) {
            try {
                await suite.afterAllHook();
            } catch (error) {
                console.error('afterAll hook failed:', error);
            }
        }
    }

    return results;
}
