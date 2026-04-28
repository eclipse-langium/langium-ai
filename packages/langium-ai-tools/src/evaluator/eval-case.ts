/******************************************************************************
 * Copyright 2026 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

/**
 * @deprecated YAML-based evaluation cases are deprecated.
 * Use TypeScript .eval.ts files with describe() and eval() instead.
 * See langium-ai-tools/evals for the new API.
 */

import * as yaml from 'js-yaml';
import { type Message } from './message.js';

/**
 * Evaluation case revolving around expected output for a given input (prompt + context)
 */
export interface EvalCase {
    /**
     * Name of the case
     */
    name: string;

    /**
     * Optional message history, used for system, user & assistant messages
     */
    history?: Message[];

    /**
     * Input to run with
     */
    prompt: string;

    /**
     * Tags associated with this case
     * Used to categorize or filter cases
     * Defaults to an empty array
     */
    tags?: string[];

    /**
     * Expected output response
     */
    expected_response: string;

    /**
     * Whether or not to only check code blocks in the response, and ignore the rest
     * Defaults to false
     */
    only_check_codeblocks?: boolean;
}

/**
 * Decodes a single eval case from a generic object
 *
 * @param caseData Potential object data to decode
 * @param context Context string for error messages (e.g., "eval_cases[0]" or "root")
 * @returns Decoded case
 * @throws Error if the case data is invalid
 */
function decodeEvalCase(caseData: unknown, context: string = 'case'): EvalCase {
    if (typeof caseData !== 'object' || caseData === null) {
        throw new Error(`${context}: must be an object`);
    }

    const caseDataObj = caseData as Record<string, unknown>;

    // validate required fields
    if (typeof caseDataObj.name !== 'string') {
        throw new Error(`${context}: "name" must be a string`);
    }

    if (typeof caseDataObj.prompt !== 'string') {
        throw new Error(`${context}: "prompt" must be a string`);
    }

    if (typeof caseDataObj.expected_response !== 'string') {
        throw new Error(`${context}: "expected_response" must be a string`);
    }

    // ensure optional fields are of correct type
    if (caseDataObj.history !== undefined && !Array.isArray(caseDataObj.history)) {
        throw new Error(`${context}: "history" must be an array`);
    }

    if (caseDataObj.only_check_codeblocks !== undefined && typeof caseDataObj.only_check_codeblocks !== 'boolean') {
        throw new Error(`${context}: "only_check_codeblocks" must be a boolean`);
    }

    if (caseDataObj.tags !== undefined && !Array.isArray(caseDataObj.tags)) {
        throw new Error(`${context}: "tags" must be an array`);
    }

    // build the case
    const evalCase: EvalCase = {
        name: caseDataObj.name,
        prompt: caseDataObj.prompt,
        expected_response: caseDataObj.expected_response,
        history: caseDataObj.history,
        tags: caseDataObj.tags,
        only_check_codeblocks: caseDataObj.only_check_codeblocks,
    };

    // add optional fields if present
    if (caseDataObj.history !== undefined) {
        if (!Array.isArray(caseDataObj.history)) {
            throw new Error(`${context}: "history" must be an array`);
        }
        evalCase.history = caseDataObj.history;
    }

    if (caseDataObj.tags !== undefined) {
        if (!Array.isArray(caseDataObj.tags)) {
            throw new Error(`${context}: "tags" must be an array`);
        }
        evalCase.tags = caseDataObj.tags;
    }

    if (caseDataObj.only_check_codeblocks !== undefined) {
        if (typeof caseDataObj.only_check_codeblocks !== 'boolean') {
            throw new Error(`${context}: "only_check_codeblocks" must be a boolean`);
        }
        evalCase.only_check_codeblocks = caseDataObj.only_check_codeblocks;
    }

    return evalCase;
}

/**
 * Checks if an object looks like a single eval case
 * (has name, prompt, and expected_response fields)
 *
 * @param data Object to check
 * @returns True if the object has the required fields for a single case
 */
function isSingleCase(data: unknown): boolean {
    return (
        typeof data === 'object' &&
        data !== null &&
        typeof (data as Record<string, unknown>).name === 'string' &&
        typeof (data as Record<string, unknown>).prompt === 'string' &&
        typeof (data as Record<string, unknown>).expected_response === 'string'
    );
}

/**
 * Load evaluation cases from a YAML string
 *
 * Supports two formats:
 * 1. Multiple cases: { eval_cases: [...] }
 * 2. Single case: { name, prompt, expected_response, ... }
 *
 * @param yamlStr YAML string containing evaluation cases
 * @returns Array of evaluation cases
 * @throws Error if file cannot be read or parsed
 */
export function loadFromYaml(yamlStr: string): EvalCase[] {
    try {
        const data = yaml.load(yamlStr);

        // handle null or empty data
        if (!data) {
            throw new Error('YAML file is empty or invalid');
        }

        // format 1: single case (direct object with name, prompt, expected_response)
        if (isSingleCase(data)) {
            const singleCase = decodeEvalCase(data, 'root');
            return [singleCase];
        }

        // format 2: multiple cases (eval_cases array)
        const dataObj = data as { eval_cases?: unknown[] };
        if (dataObj.eval_cases && Array.isArray(dataObj.eval_cases)) {
            const cases: EvalCase[] = dataObj.eval_cases.map((caseData: unknown, idx: number) =>
                decodeEvalCase(caseData, `eval_cases[${idx}]`),
            );
            return cases;
        }

        // invalid format - provide helpful debugging info
        const hasName = typeof (data as any)?.name === 'string';
        const hasPrompt = typeof (data as any)?.prompt === 'string';
        const hasExpectedResponse = typeof (data as any)?.expected_response === 'string';
        const hasEvalCases = 'eval_cases' in (data as any);

        const debugInfo = [
            `Found fields: name=${hasName}, prompt=${hasPrompt}, expected_response=${hasExpectedResponse}, eval_cases=${hasEvalCases}`,
            hasEvalCases && !Array.isArray((data as any).eval_cases)
                ? '  Note: eval_cases exists but is not an array'
                : '',
        ]
            .filter(Boolean)
            .join('\n');

        throw new Error(
            'YAML file must be either:\n' +
                '  1. A single case (with name, prompt, expected_response fields)\n' +
                '  2. Multiple cases (with an "eval_cases" array at the top level)\n\n' +
                debugInfo,
        );
    } catch (error) {
        if (error instanceof Error) {
            throw new Error(`Failed to load eval cases: ${error.message}`);
        }
        throw error;
    }
}
