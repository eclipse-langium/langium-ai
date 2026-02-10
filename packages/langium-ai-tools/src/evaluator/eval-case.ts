/******************************************************************************
 * Copyright 2026 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import * as yaml from "js-yaml";
import { type Message } from "./message.js";

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
 * @param index Used for tracking which case we're decoding in error messages
 * @returns Decoded case
 * @throws Error if the case data is invalid
 */
function decodeEvalCase(caseData: unknown, index: number): EvalCase {
  if (typeof caseData !== "object" || caseData === null) {
    throw new Error(`eval_cases[${index}]: must be an object`);
  }

  const caseDataObj = caseData as Record<string, unknown>;

  // validate required fields
  if (typeof caseDataObj.name !== "string") {
    throw new Error(`eval_cases[${index}]: "name" must be a string`);
  }

  if (typeof caseDataObj.prompt !== "string") {
    throw new Error(`eval_cases[${index}]: "prompt" must be a string`);
  }

  if (typeof caseDataObj.expected_response !== "string") {
    throw new Error(
      `eval_cases[${index}]: "expected_response" must be a string`,
    );
  }

  // ensure optional fields are of correct type
  if (
    caseDataObj.history !== undefined &&
    !Array.isArray(caseDataObj.history)
  ) {
    throw new Error(`eval_cases[${index}]: "history" must be an array`);
  }

  if (
    caseDataObj.only_check_codeblocks !== undefined &&
    typeof caseDataObj.only_check_codeblocks !== "boolean"
  ) {
    throw new Error(
      `eval_cases[${index}]: "only_check_codeblocks" must be a boolean`,
    );
  }

  if (caseDataObj.tags !== undefined && !Array.isArray(caseDataObj.tags)) {
    throw new Error(`eval_cases[${index}]: "tags" must be an array`);
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
      throw new Error(`eval_cases[${index}]: "history" must be an array`);
    }
    evalCase.history = caseDataObj.history;
  }

  if (caseDataObj.tags !== undefined) {
    if (!Array.isArray(caseDataObj.tags)) {
      throw new Error(`eval_cases[${index}]: "tags" must be an array`);
    }
    evalCase.tags = caseDataObj.tags;
  }

  if (caseDataObj.only_check_codeblocks !== undefined) {
    if (typeof caseDataObj.only_check_codeblocks !== "boolean") {
      throw new Error(
        `eval_cases[${index}]: "only_check_codeblocks" must be a boolean`,
      );
    }
    evalCase.only_check_codeblocks = caseDataObj.only_check_codeblocks;
  }

  return evalCase;
}

/**
 * Load evaluation cases from a YAML file
 *
 * @param yamlStr YAML string containing evaluation cases
 * @returns Array of evaluation cases
 * @throws Error if file cannot be read or parsed
 */
export function loadFromYaml(yamlStr: string): EvalCase[] {
  try {
    const data = yaml.load(yamlStr) as { eval_cases?: unknown[] };

    // double check that our data is valid
    if (!data || !data.eval_cases || !Array.isArray(data.eval_cases)) {
      throw new Error(
        'YAML file must contain an "eval_cases" array at the top level',
      );
    }

    // decode cases
    const cases: EvalCase[] = data.eval_cases.map(decodeEvalCase);

    return cases;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load eval cases: ${error.message}`);
    }
    throw error;
  }
}
