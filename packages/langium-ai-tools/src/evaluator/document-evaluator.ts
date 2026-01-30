/******************************************************************************
 * Copyright 2024 - 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

/**
 * Langium Document Evaluator (evaluates on a Langium document)
 */

import { LangiumDocument, URI } from "langium";
import { LangiumServices } from "langium/lsp";
import { Evaluator, EvaluatorResult, EvaluatorResultData } from "./evaluator.js";


export abstract class AbstractDocumentEvaluator<T extends LangiumServices, RD extends FailureAwarenessData = FailureAwarenessData> extends Evaluator {

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
    async evaluate(input: string, fileExtension: string | undefined = undefined): Promise<Partial<EvaluatorResult<RD>>> {

        if (input.includes('```')) {
            // take the first code block instead, if present (assuming it's a langium grammar)
            const codeBlock = input.split(/```[a-z-]*/)[1];
            input = codeBlock;
        }
        const fileExt = fileExtension ? fileExtension : this.services.LanguageMetaData.fileExtensions[0];
        const doc = this.services.shared.workspace.LangiumDocumentFactory.fromString(input, URI.parse(`memory:/test.${fileExt}`));
        const context: EvaluationContext = {
            input: input
        };
        try {
            await this.services.shared.workspace.DocumentBuilder.build([doc], { validation: true });
            return this.evaluateDocument(doc, context);
        } catch (e) {
            return this.handleBuildError(e, context)
        }
    }

    abstract evaluateDocument(doc: LangiumDocument, ctx: EvaluationContext): Partial<EvaluatorResult<RD>>;


    protected handleBuildError(e: unknown, _ctx: EvaluationContext): Partial<EvaluatorResult<RD>> {
        console.error('Error during evaluation: ', e);
        return {
            name: this.constructor.name,
            data: <FailureAwarenessData>{
                failures: 1
            } as unknown as RD
        };
    }
}

export type FailureAwarenessData = EvaluatorResultData & {
    /**
    * Number of validation failures
    */
    failures: number;
};

export type EvaluationContext = {
    input: string;
};