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