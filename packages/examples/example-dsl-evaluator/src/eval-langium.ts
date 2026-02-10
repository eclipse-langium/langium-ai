/******************************************************************************
 * Copyright 2024 - 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { config } from 'dotenv';
import { EmptyFileSystem } from 'langium';
import { averageAcrossCases, averageAcrossRunners, EvalMatrix, generateHistogram, generateHistoricalChart, generateRadarChart, LangiumEvaluator, type LangiumEvaluatorResultData, loadLastResults, mergeEvaluators, normalizeData } from 'langium-ai-tools/evaluator';
import { createLangiumGrammarServices } from 'langium/grammar';
import { type EmbeddingEvaluatorResultData, OllamaEmbeddingEvaluator } from './embedding-evaluator.js';
import { EditDistanceEvaluator, type EditDistanceEvaluatorResultData } from './edit-distance-evaluator.js';
import { cases as langiumCases } from './langium-cases.js';
import { runner_codegemma, runner_codegemma_rag, runner_codellama, runner_codellama_rag, runner_llama3_1_rag, runner_llama3_2_3b, runner_llama3_2_3b_rag } from './runners.js';
config();

const langiumServices = createLangiumGrammarServices(EmptyFileSystem);

type MergedEvaluatorResultType = LangiumEvaluatorResultData & EditDistanceEvaluatorResultData & EmbeddingEvaluatorResultData;

/**
 * Runs a first set of evals for generating hello-world grammars
 * This is done with just a prompt
 */
export async function runLangiumEvals() {

    const eMat = new EvalMatrix({
        config: {
            // various config options
            name: 'Langium Grammar Evaluator w/ System Prompt',
            description: 'Evaluates Various Generated Grammars using Various Model Stacks',
            history_folder: '.langium-ai',
            // number of runs to average across
            num_runs: 3
        },
        runners: [
            runner_llama3_2_3b,
            runner_codellama,
            runner_codegemma,

            // rag versions
            runner_llama3_2_3b_rag,
            runner_codellama_rag,
            runner_codegemma_rag,
            runner_llama3_1_rag,
        ],
        evaluators: [
            {
                name: 'Langium + Edit Distance + Embedding Evaluator (merged)',
                eval: mergeEvaluators(
                    new LangiumEvaluator(langiumServices.grammar),
                    new EditDistanceEvaluator(),
                    new OllamaEmbeddingEvaluator('nomic-embed-text')
                )
            }
        ],
        cases: langiumCases
    });
    
    // run & report
    const results = await eMat.run();
    console.log('Evaluation report: ');
    console.table(results.map(r => {
        return {
            name: r.name,
            ...r.data
        }
    }), ['name', 'errors', 'warnings', 'infos', 'hints', 'unassigned', 'edit_distance']);

    // get average scores too
    const processedResults = averageAcrossCases(results);
    console.log('Average Evaluation report: ');
    console.table(processedResults.map(r => {
        return {
            name: r.name,
            ...r.data
        }
    }), ['name', 'errors', 'warnings', 'infos', 'hints', 'unassigned', 'edit_distance']);
    
}

export function generateChartFromLastResults() {
    const rawResults = loadLastResults('.langium-ai', 3);
    console.log('Last Evaluation report: ');

    // generate a radar chart for this run
    generateRadarChart(
        'Radar Chart (smaller is better)',
        normalizeData(rawResults),
        './radar-chart.html',
        (data: MergedEvaluatorResultType, _metadata: Record<string, unknown>) => {
            return {
                'Failures': data.failures,
                'Errors':   data.errors,
                'Warnings': data.warnings,
                'Semantic Diff': 1.0 - data.similarity, // inverse similarity
                'Total Diagnostics':    (data.errors + data.warnings + data.infos + data.hints + data.unassigned) / 5.0,
                'Response Size': data.response_length ?? 0,
                'Edit Distance': data.edit_distance,
                'Time': data._runtime ?? 0
            }
        }
    );

    // generate a histogram chart for this run
    generateHistogram(
        'Histogram Chart (smaller is better)',
        normalizeData(rawResults),
        './histogram-chart.html',
        (data: MergedEvaluatorResultType, _metadata: Record<string, unknown>) =>  {
            return {
                'Failures': data.failures,
                'Errors':   data.errors,
                'Warnings': data.warnings,
                'Semantic Diff': 1.0 - data.similarity,
                'Total Diagnostics':    (data.errors + data.warnings + data.infos + data.hints + data.unassigned) / 5.0,
                'Response Size': data.response_length ?? 0,
                'Edit Distance': data.edit_distance,
                'Time': data._runtime ?? 0
            }   
        }
    );

    // generate a historical chart for all unique runners over time
    generateHistoricalChart(
        'Historical Chart (Approx. Area of Radar Chart)',
        '.langium-ai', // src folder for data
        './historical-chart.html',
        (data: MergedEvaluatorResultType, _metadata: Record<string, unknown>) => {
            return calculateTriangleAreas(data).reduce((a, b) => a + b, 0);
        },
        {
            preprocess: averageAcrossRunners,
            // take: 30,
            // filter: (r) =>  r.name.match(/rag/i) === null
        }
    );
}

function calculateTriangleAreas(data: MergedEvaluatorResultType): number[] {
    // order changes area, so be consistent here when checking!
    const values = [
        data.failures ?? 0,
        data.errors,
        data.warnings,
        1.0 - (data.similarity ?? 0), // Semantic Diff
        (data.errors + data.warnings + data.infos + data.hints + data.unassigned) / 5.0, // Total Diagnostics
        data.responseLength ?? 0,
        data.edit_distance,
        data.runtime ?? 0
    ];

    const n = values.length;
    const angle = 2 * Math.PI / n;
    const areas = [];

    for (let i = 0; i < n; i++) {
        const r1 = values[i];
        const r2 = values[(i + 1) % n];
        const area = 0.5 * r1 * r2 * Math.sin(angle);
        areas.push(area);
    }

    return areas;
}


