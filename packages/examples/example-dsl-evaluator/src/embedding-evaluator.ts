/******************************************************************************
 * Copyright 2024 - 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

/**
 * Simple evaluator that computes the embedding for two strings, and returns the cosine similarity
 */

import { Evaluator, type EvaluatorResult } from "langium-ai-tools/evaluator";
import ollama from 'ollama';

export interface EmbeddingEvaluatorResultData extends EvaluatorResult {
    similarity: number;
}

/**
 * Computes embeddings by leveraging embedding models from Ollama
 */
export class OllamaEmbeddingEvaluator extends Evaluator {
    private embeddingModel: string;

    constructor(model: string) {
        super();
        this.embeddingModel = model;
    }

    /**
     * Evaluate the similarity between two strings by comparing their embeddings
     */
    async evaluate(response: string, expected_response: string): Promise<Partial<EvaluatorResult>> {
        // compute the embedding for both strings
        const responseEmbedding = (await this.computeEmbedding(response));
        const expectedEmbedding = (await this.computeEmbedding(expected_response));

        // compute the cosine similarity between the two embeddings
        const similarity = this.cosineSimilarity(responseEmbedding, expectedEmbedding);

        return {
            data: {
                similarity
            }
        };
    }

    /**
     * Computes the embedding for a given text
     * @returns 
     */
    private async computeEmbedding(text: string): Promise<number[]> {
        return (await ollama.embed({
            model: this.embeddingModel,
            input: [text],
            keep_alive: 30
        })).embeddings[0];
    }

    /**
     * Compute the cosine similarity between two vectors
     */
    private cosineSimilarity(a: number[], b: number[]): number {
        const dotProduct = a.reduce((acc, val, i) => acc + val * b[i], 0);

        const aMagnitude = Math.sqrt(a.reduce((acc, val) => acc + val * val, 0));
        const bMagnitude = Math.sqrt(b.reduce((acc, val) => acc + val * val, 0));

        if (aMagnitude === 0 || bMagnitude === 0) {
            return 0;
        }

        return dotProduct / (aMagnitude * bMagnitude);
    }
}
