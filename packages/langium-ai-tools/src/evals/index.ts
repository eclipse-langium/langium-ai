/**
 * Testing API for langium-ai evaluations
 *
 * Provides a vitest-style API for defining evaluation test cases.
 */

import type { EvaluatorResult } from '../evaluator/evaluator.js';

/**
 * Standard data that can be expected from a case
 */
export type EvaluationData = {
    /**
     * Normalized score between 0 and 1 (0 = complete failure, 1 = full pass)
     */
    score: number;

    /**
     * Whether this case was skipped (via .skip() or .only() filtering)
     */
    skipped?: boolean;

    /**
     * When score is 0, expect an error here
     */
    error?: Error | string;
};

/**
 * Evaluation case result from running the lai cli
 *
 * A modified version of the baseline evaluator result, to accomodate for additional
 * requisite properties (certain metadat for cases + suites & a 'pass' result)
 */
export type EvaluationCaseResult = EvaluatorResult<EvaluationData> & {
    metadata: {
        /**
         * Containing evaluation file for the associated case
         */
        evalFile: string;

        /**
         * Name of the suite that we ran under
         */
        suiteName: string;

        /**
         * Evaluation case name
         */
        caseName: string;

        /**
         * Duration of evaluation case from start to finish
         */
        duration: number;
    };
};

export interface EvalContext {
    systemPrompt: string;
    project: { name: string };
}

/**
 * Evalutor function definition, takes some context & produce evaluation data
 */
export type EvaluatorFunction = (ctx: EvalContext) => Promise<EvaluationData>;

// test collection state
interface EvalDefinition {
    name: string;
    fn: EvaluatorFunction;
    skip?: boolean;
    only?: boolean;
}

interface EvalSuite {
    name: string;
    evaluations: EvalDefinition[];
    beforeAllHook?: () => void | Promise<void>;
    afterAllHook?: () => void | Promise<void>;
    beforeEachHook?: () => void | Promise<void>;
    afterEachHook?: () => void | Promise<void>;
    skip?: boolean;
    only?: boolean;
}

const suites: EvalSuite[] = [];
let currentSuite: EvalSuite | null = null;

/**
 * Define a test suite
 */
export function describe(name: string, fn: () => void): void {
    const parentSuite = currentSuite;
    currentSuite = { name, evaluations: [] };
    fn();
    suites.push(currentSuite);
    currentSuite = parentSuite;
}

/**
 * Define a test suite that will be skipped
 */
describe.skip = function (name: string, fn: () => void): void {
    const parentSuite = currentSuite;
    currentSuite = { name, evaluations: [], skip: true };
    fn();
    suites.push(currentSuite);
    currentSuite = parentSuite;
};

/**
 * Define a test suite that will run exclusively (skips all other tests)
 */
describe.only = function (name: string, fn: () => void): void {
    const parentSuite = currentSuite;
    currentSuite = { name, evaluations: [], only: true };
    fn();
    suites.push(currentSuite);
    currentSuite = parentSuite;
};

/**
 * Define an evaluation case
 */
export function evaluation(name: string, fn: EvaluatorFunction): void {
    if (!currentSuite) {
        throw new Error('evaluation() must be called inside describe()');
    }
    currentSuite.evaluations.push({ name, fn });
}

/**
 * Define an evaluation case that will be skipped
 */
evaluation.skip = function (name: string, fn: EvaluatorFunction): void {
    if (!currentSuite) {
        throw new Error('evaluation.skip() must be called inside describe()');
    }
    currentSuite.evaluations.push({ name, fn, skip: true });
};

/**
 * Define an evaluation case that will run exclusively (skips all other tests)
 */
evaluation.only = function (name: string, fn: EvaluatorFunction): void {
    if (!currentSuite) {
        throw new Error('evaluation.only() must be called inside describe()');
    }
    currentSuite.evaluations.push({ name, fn, only: true });
};

/**
 * Define parametrized evaluation cases
 *
 * @example
 * evaluation.each([
 *   { input: 'test1', expected: 'result1' },
 *   { input: 'test2', expected: 'result2' }
 * ])('testing $input', (data) => async (ctx) => {
 *   // test implementation using data.input and data.expected
 * });
 */
evaluation.each = function <T>(cases: T[]): (name: string, fn: (data: T) => EvaluatorFunction) => void {
    return (name: string, fn: (data: T) => EvaluatorFunction): void => {
        if (!currentSuite) {
            throw new Error('evaluation.each() must be called inside describe()');
        }

        // create an evaluation for each case
        for (let i = 0; i < cases.length; i++) {
            const testCase = cases[i];
            // replace placeholders in name with case values
            let caseName = name;

            // support $property syntax (e.g., "$input" -> testCase.input)
            if (typeof testCase === 'object' && testCase !== null) {
                caseName = name.replace(/\$(\w+)/g, (match, key) => {
                    const value = (testCase as Record<string, unknown>)[key];
                    return value !== undefined ? String(value) : match;
                });
            }

            // support %i, %s, %o, etc. for positional replacement
            caseName = caseName
                .replace(/%s/g, String(testCase))
                .replace(/%i/g, String(testCase))
                .replace(/%o/g, JSON.stringify(testCase))
                .replace(/%j/g, JSON.stringify(testCase));

            // if no placeholders matched, append case index
            if (caseName === name) {
                caseName = `${name} [${i}]`;
            }

            currentSuite.evaluations.push({
                name: caseName,
                fn: fn(testCase),
            });
        }
    };
};

/**
 * Define a hook that runs before each evaluation in the suite
 */
export function beforeEach(fn: () => void | Promise<void>): void {
    if (!currentSuite) {
        throw new Error('beforeEach() must be called inside describe()');
    }
    currentSuite.beforeEachHook = fn;
}

/**
 * Define a hook that runs after each evaluation in the suite
 */
export function afterEach(fn: () => void | Promise<void>): void {
    if (!currentSuite) {
        throw new Error('afterEach() must be called inside describe()');
    }
    currentSuite.afterEachHook = fn;
}

/**
 * Define a hook that runs once before all evaluations in the suite
 */
export function beforeAll(fn: () => void | Promise<void>): void {
    if (!currentSuite) {
        throw new Error('beforeAll() must be called inside describe()');
    }
    currentSuite.beforeAllHook = fn;
}

/**
 * Define a hook that runs once after all evaluations in the suite
 */
export function afterAll(fn: () => void | Promise<void>): void {
    if (!currentSuite) {
        throw new Error('afterAll() must be called inside describe()');
    }
    currentSuite.afterAllHook = fn;
}

/**
 * Export collected suites for runner
 */
export function getCollectedSuites(): EvalSuite[] {
    const collected = [...suites];
    suites.length = 0;
    return collected;
}

/**
 * Clear all collected suites
 */
export function clearSuites(): void {
    suites.length = 0;
    currentSuite = null;
}

// re-export runner types and functions
export { runEvalFile, type EvalProgressCallback } from './runner.js';
