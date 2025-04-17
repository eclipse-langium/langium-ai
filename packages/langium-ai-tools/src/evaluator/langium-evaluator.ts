/**
 * Base Langium DSL validator (taps into Langium's validator messages to provide better results)
 */

import { LangiumServices } from "langium/lsp";
import { Diagnostic } from "vscode-languageserver-types";
import { Evaluator, EvaluatorResult, EvaluatorResultData } from "./evaluator.js";
import { URI } from "langium";

/**
 * Langium-specific evaluator result data
 */
export interface LangiumEvaluatorResultData extends EvaluatorResultData {

    /**
     * Number of validation failures
     */
    failures: number;

    /**
     * Number of errors
     */
    errors: number;

    /**
     * Number of warnings
     */
    warnings: number;

    /**
     * Number of infos
     */
    infos: number;

    /**
     * Number of hints
     */
    hints: number;

    /**
     * Number of unassigned diagnostics
     */
    unassigned: number;

    /**
     * Length of the response in chars
     */
    response_length: number;

    /**
     * Raw diagnostic data, same which is used to compute the other values above
     */
    diagnostics: Diagnostic[];
}

export class LangiumEvaluator<T extends LangiumServices> extends Evaluator {

    /**
     * Services to use for evaluation
     */
    protected services: T;

    constructor(services: T) {
        super();
        this.services = services;
    }

    /**
     * Validate an agent response as if it's a langium program. If we can parse it, we attempt to validate it.
     */
    async evaluate(response: string): Promise<Partial<EvaluatorResult>> {

        if (response.includes('```')) {
            // take the first code block instead, if present (assuming it's a langium grammar)
            const codeBlock = response.split(/```[a-z-]*/)[1];
            response = codeBlock;
        }

        const doc = this.services.shared.workspace.LangiumDocumentFactory.fromString(response, URI.parse('memory://test.langium'));

        try {
            await this.services.shared.workspace.DocumentBuilder.build([doc], { validation: true });
            const validationResults = doc.diagnostics ?? [];
            
            // count the number of each type of diagnostic
            let evalData: LangiumEvaluatorResultData = {
                failures: 0,
                errors: 0,
                warnings: 0,
                infos: 0,
                hints: 0,
                unassigned: 0,
                // include length of the response for checking
                response_length: response.length,
                // include the diagnostics for debugging if desired
                diagnostics: validationResults
            };

            for (const diagnostic of validationResults) {
                if (diagnostic.severity) {
                    switch (diagnostic.severity) {
                        case 1:
                            evalData.errors++;
                            break;
                        case 2:
                            evalData.warnings++;
                            break;
                        case 3:
                            evalData.infos++;
                            break;
                        case 4:
                            evalData.hints++;
                            break;
                        default:
                            evalData.unassigned++;
                            break;
                    }
                }
            }

            return {
                data: evalData
            };

        } catch (e) {
            console.error('Error during evaluation: ', e);
            return {
                data: {
                    failures: 1,
                    errors: 0,
                    warnings: 0,
                    infos: 0,
                    hints: 0,
                    unassigned: 0,
                    response_length: response.length
                } as LangiumEvaluatorResultData
            };
        }
    }
}