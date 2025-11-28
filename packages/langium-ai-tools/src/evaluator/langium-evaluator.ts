/******************************************************************************
 * Copyright 2024 - 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

/**
 * Base Langium DSL validator (taps into Langium's validator messages to provide better results)
 */

import { LangiumDocument } from "langium";
import { LangiumServices } from "langium/lsp";
import { Diagnostic } from "vscode-languageserver-types";
import { AbstractDocumentEvaluator, EvaluationContext, FailureAwarenessData } from "./document-evaluator.js";
import { EvaluatorResult, EvaluatorResultData } from "./evaluator.js";

/**
 * Langium-specific evaluator result data
 */
export interface LangiumEvaluatorResultData extends FailureAwarenessData {

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
    responseLength: number;

    /**
     * Raw diagnostic data, same which is used to compute the other values above
     */
    diagnostics: Diagnostic[];
}

export class LangiumEvaluator<T extends LangiumServices> extends AbstractDocumentEvaluator<T, LangiumEvaluatorResultData> {


    /**
     * Validate an agent response as if it's a langium program. If we can parse it, we attempt to validate it.
     */
    evaluateDocument(doc: LangiumDocument, ctx: EvaluationContext): EvaluatorResult<LangiumEvaluatorResultData> {

        const validationResults = doc.diagnostics ?? [];

        const evalData: LangiumEvaluatorResultData = this.createEmptyResultData();
        // include length of the response for checking
        evalData.response_length = ctx.input.length;
        // include the diagnostics for debugging if desired
        evalData.diagnostics = validationResults;


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
            name: this.constructor.name,
            metadata: {},
            data: evalData
        };
    }

    protected createEmptyResultData(): LangiumEvaluatorResultData {
        return {
            failures: 0,
            errors: 0,
            warnings: 0,
            infos: 0,
            hints: 0,
            unassigned: 0,
            responseLength: 0,
            diagnostics: []
        };
    }
}