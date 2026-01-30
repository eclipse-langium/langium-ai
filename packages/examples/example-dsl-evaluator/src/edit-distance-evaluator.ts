/******************************************************************************
 * Copyright 2024 - 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import {levenshteinEditDistance} from 'levenshtein-edit-distance';
import { Evaluator, EvaluatorResult, EvaluatorResultData } from 'langium-ai-tools/evaluator';

export interface EditDistanceEvaluatorResultData extends EvaluatorResultData {
    edit_distance: number;
}

export class EditDistanceEvaluator extends Evaluator {
    async evaluate(response: string, expected_response: string): Promise<Partial<EvaluatorResult>> {
        const distance = levenshteinEditDistance(response, expected_response);
        return new Promise((resolve) => {
            resolve({
                data: {
                    edit_distance: distance
                }
            });
        });
    }
}
