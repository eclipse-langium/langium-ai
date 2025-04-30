/******************************************************************************
 * Copyright 2024 - 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

/**
 * An example of creating an evaluator that is accessible via a REST API by other programs
 */

import { EmptyFileSystem } from "langium";
import { LangiumEvaluator } from "langium-ai-tools";
import { startServer } from "langium-ai-tools/server";
import { createLangiumGrammarServices } from "langium/grammar";

/**
 * An example of creating an evaluator that is accessible via a REST API by other programs
 * by POSTing to http://localhost:8080/evaluate w/ith the body:
 * { evaluator: 'myeval', program: '...', expectedResponse: '...' }
 * The expected response is optional depending on the evaluator
 */
export function runExampleServer() {

    const langiumServices = createLangiumGrammarServices(EmptyFileSystem);
    const langiumEvaluator = new LangiumEvaluator(langiumServices.grammar);

    startServer({
        port: 8080,
        evaluators: {
            'myeval': langiumEvaluator
        }
    });
}