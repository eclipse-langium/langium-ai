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
import { Diagnostic, LangiumEvaluatorResultData } from "../gen/interface.js";
import { AbstractDocumentEvaluator, EvaluationContext } from "./document-evaluator.js";
import { EvaluatorResult } from "./evaluator.js";


export class LangiumEvaluator<T extends LangiumServices> extends AbstractDocumentEvaluator<T, LangiumEvaluatorResultData &  Record<string, unknown> > {


    /**
     * Validate an agent response as if it's a langium program. If we can parse it, we attempt to validate it.
     */
    evaluateDocument(doc: LangiumDocument, ctx: EvaluationContext): EvaluatorResult< Record<string, unknown> & LangiumEvaluatorResultData > {

        const validationResults = doc.diagnostics ?? [];

        const evalData: LangiumEvaluatorResultData = this.createEmptyResultData();
        // include length of the response for checking
        evalData.responseLength = ctx.input.length;
        // include the diagnostics for debugging if desired
        evalData.diagnostics = validationResults as Diagnostic[];


        for (const diagnostic of evalData.diagnostics) {
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
            data: {...evalData}
        };
    }

    protected createEmptyResultData(): LangiumEvaluatorResultData {
        return {
            metadata: {},
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