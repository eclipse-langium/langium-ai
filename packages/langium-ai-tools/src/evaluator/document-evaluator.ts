/******************************************************************************
 * Copyright 2024 - 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

/**
 * Langium Document Evaluator (evaluates on a Langium document)
 */

import { type LangiumDocument, URI } from 'langium';
import type { LangiumServicesLike } from '../types.js';
import { Evaluator, type EvaluatorResult, type EvaluatorResultData } from './evaluator.js';

export abstract class AbstractDocumentEvaluator<
    T extends LangiumServicesLike,
    RD extends FailureAwarenessData = FailureAwarenessData,
> extends Evaluator {
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
     *
     * @param input The input to compare
     * @param expected_response Th expected response to compare against (unused in this evaluator)
     * @param fileExtension The extension of the language to apply explicitly,
     *  otherwise the first one that's registered will be applied from the services
     */
    async evaluate(input: string, _expected_response: string, fileExtension?: string): Promise<EvaluatorResult<RD>> {
        if (input.includes('```')) {
            // take the first code block instead, if present (assuming it's a langium grammar)
            const codeBlock = input.split(/```[a-z-]*/)[1];
            input = codeBlock;
        }
        const fileExt = fileExtension ? fileExtension : this.services.LanguageMetaData.fileExtensions[0];
        if (!fileExt || fileExt.trim() === '') {
            // without an extension the document factory can't resolve services by URI;
            // fail loudly rather than parsing against an empty extension
            throw new Error(
                'No file extension available to evaluate against. Provide one explicitly or ensure the ' +
                    'services expose a non-empty LanguageMetaData.fileExtensions entry.',
            );
        }
        // fileExtensions entries already include the leading dot, so normalize before appending
        const normalizedExt = fileExt.startsWith('.') ? fileExt : `.${fileExt}`;
        const doc = this.services.shared.workspace.LangiumDocumentFactory.fromString(
            input,
            URI.parse(`memory:///test${normalizedExt}`),
        );
        const context: EvaluationContext = {
            input: input,
        };
        const startTime = Date.now();
        try {
            await this.services.shared.workspace.DocumentBuilder.build([doc], { validation: true });
            return this.evaluateDocument(doc, context);
        } catch (e) {
            return this.handleBuildError(e, startTime);
        }
    }

    abstract evaluateDocument(doc: LangiumDocument, ctx: EvaluationContext): EvaluatorResult<RD>;

    protected handleBuildError(e: unknown, startTime: number): EvaluatorResult<RD> {
        console.error('Error during evaluation: ', e);
        return {
            name: this.constructor.name,
            metadata: {
                duration: Date.now() - startTime,
            },
            data: (<FailureAwarenessData>{
                failures: 1,
            }) as RD,
        };
    }
}

/**
 * Extends standard evaluator result data with a single failures property
 */
export type FailureAwarenessData = EvaluatorResultData & {
    /**
     * Number of validation failures
     */
    failures: number;
};

export type EvaluationContext = {
    input: string;
};
