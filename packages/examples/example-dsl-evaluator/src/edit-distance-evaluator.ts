/******************************************************************************
 * Copyright 2024 - 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { Evaluator, type EvaluatorResultData } from 'langium-ai-tools/evaluator';

export interface EditDistanceEvaluatorResultData extends EvaluatorResultData {
    edit_distance: number;
}

/**
 * Simplistic levenshtein distance calculation between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix: number[][] = [];

    for (let i = 0; i <= len1; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
        }
    }
    return matrix[len1][len2];
}

export class EditDistanceEvaluator extends Evaluator {
    async evaluate(response: string, expected_response: string): Promise<EvaluatorResultData> {
        const distance = levenshteinDistance(response, expected_response);
        return new Promise((resolve) => {
            resolve({
                edit_distance: distance,
            });
        });
    }
}
