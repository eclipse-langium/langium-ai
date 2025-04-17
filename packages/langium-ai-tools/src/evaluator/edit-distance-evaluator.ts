import {levenshteinEditDistance} from 'levenshtein-edit-distance';
import { Evaluator, EvaluatorResult, EvaluatorResultData } from './evaluator.js';

export interface EditDistanceEvaluatorResultData extends EvaluatorResultData {
    edit_distance: number;
}

export class EditDistanceEvaluator extends Evaluator {
    async evaluate(response: string, expected_response: string): Promise<Partial<EvaluatorResult>> {
        const distance = levenshteinEditDistance(response, expected_response);
        return {
            data: {
                edit_distance: distance
            }
        };
    }
}
