/**
 * Generates & exports an HTML radar chart report using plotly JS
 */

import { EvaluatorResult, EvaluatorResultData, averageAcrossRunners, loadReport } from "./evaluator.js";
import { writeFileSync, readdirSync, readFileSync } from 'fs';
import * as path from 'path';

/**
 * Generates an HTML radar chart from the provided data
 * @param evalResults Evaluator results to chart
 * @param dest Output file to write the chart to
 * @param rFunc polar r function, used to extract the r values from the data
 * @param theta theta values, i.e. the property names to use for the radar chart
 */
export function generateRadarChart<T extends EvaluatorResultData>(
    chartName: string,
    evalResults: EvaluatorResult[],
    dest: string,
    rFunc: (d: T, metadata: Record<string, unknown>) => Record<string, unknown>,
    preprocess?: (arr: EvaluatorResult[]) => EvaluatorResult[]
): void {

    // process results first to average out data (either using the user supplied function, or defaulting to average across runners)
    const processedResults = preprocess ? preprocess(evalResults) : averageAcrossRunners(evalResults);

    const data = processedResults.map((result) => {
        const resultData = result.data as T;
        const rfuncResult = rFunc(resultData, result.metadata);
        const theta = Object.keys(rfuncResult);
        const r = Object.values(rfuncResult);

        return {
            type: 'scatterpolar',
            r,
            theta,
            fill: 'toself',
            name: result.name
        };
    });

    const layout = {
        title: chartName,
        name: chartName,
        polar: {
            radialaxis: {
                visible: true,
                range: [0, 1]
            }
        },
        showlegend: true,
        width: 1000,
        height: 800
    };

    const html = `
<!DOCTYPE html>
<html>
    <head>
    <title>${chartName}</title>
    <script src="https://cdn.plot.ly/plotly-2.35.2.min.js" charset="utf-8"></script>
    </head>
    <body>
    <div id="langium-ai-chart" style="width:1000px;height:1000px;margin:8px auto;"></div>
    <script>
        data = ${JSON.stringify(data)};
        layout = ${JSON.stringify(layout)};
        Plotly.newPlot("langium-ai-chart", data, layout);
    </script>
    </body>
</html>
        `;

    writeFileSync(dest, html);
    console.log(`Radar chart report written to: ${dest}`);
}

export function generateHistogram<T extends EvaluatorResultData>(
    chartName: string,
    evalResults: EvaluatorResult[],
    dest: string,
    dataFunc: (d: T, metadata: Record<string, unknown>) => Record<string, unknown>,
    preprocess?: (arr: EvaluatorResult[]) => EvaluatorResult[]
) {
    
    // process results first to average out data (either using the user supplied function, or defaulting to average across runners)
    const processedResults = preprocess ? preprocess(evalResults) : averageAcrossRunners(evalResults);

    const data = processedResults.map((result) => {
        const data = result.data as T;
        const dd = dataFunc(data, result.metadata);
        const yLabels = Object.keys(dd);
        const xData = Object.values(dd);
        return {
            type: 'bar',
            x: xData,
            y: yLabels,
            orientation: 'h',
            name: result.name
        };
    });

    const layout = {
        title: chartName,
        barmode: 'group',
        showlegend: true,
        width: 1000,
        height: 800
    };

    const html = `
<!DOCTYPE html>
<html>
    <head>
    <title>${chartName}</title>
    <script src="https://cdn.plot.ly/plotly-2.35.2.min.js" charset="utf-8"></script>
    </head>
    <body>
    <div id="langium-ai-chart" style="width:1000px;height:1000px;margin:8px auto;"></div>
    <script>
        data = ${JSON.stringify(data)};
        layout = ${JSON.stringify(layout)};
        Plotly.newPlot("langium-ai-chart", data, layout);
    </script>
    </body>
</html>
        `;

    writeFileSync(dest, html);
    console.log(`Histogram report written to: ${dest}`);
}

type RunnerName = string;

/**
 * Normalizes all numeric data entries in results (while also retaining non-numeric entries)
 */
export function normalizeData(data: EvaluatorResult[]): EvaluatorResult[] {
    const maxValues = new Map<string, number>();

    for (const result of data) {
        const d = result.data as EvaluatorResultData;
        for (const [key, value] of Object.entries(d)) {
            if (typeof value !== 'number') {
                continue;
            }
            const existingMax = maxValues.get(key) ?? 0;
            if (value > existingMax) {
                maxValues.set(key, value);
            }
        }
    }

    for (const result of data) {
        const d = result.data as EvaluatorResultData;
        for (const [key, value] of Object.entries(d)) {
            if (typeof value === 'number') {
                const max = maxValues.get(key) ?? 1;
                d[key] = value / max;
            }
        }
    }

    return data;
}

/**
 * Generates a historical chart from the provided data, showing runners along the X, and their performance over time along the X axis
 * @param chartName 
 * @param folder 
 * @param dest 
 * @param dataFunc 
 * @param options 
 */
export function generateHistoricalChart<T extends EvaluatorResultData>(
    chartName: string,
    folder: string,
    dest: string,
    dataFunc: (d: T, metadata: Record<string, unknown>) => number,
    options?: {
        preprocess?: (arr: EvaluatorResult[]) => EvaluatorResult[],
        filter?: (r: EvaluatorResult) => boolean,
        take?: number,
        chartType?: string
    }
) {
    // generate a historical chart by calculating the average for runners in all previous reports, and organizing them in ascending date order
    let files = readdirSync(folder).filter(f => f.endsWith('.json'));

    // array of results, where each array of results is presumed to be a stream of results from a collection of historical runs
    const runnerResultsMap: Map<RunnerName, EvaluatorResult[]> = new Map();

    // take the most recent files if take is set
    if (options?.take) {
        files = files.sort().slice(0, options.take);
    }

    for (const file of files) {
        // retrieve results from this file
        const report = loadReport(path.join(folder, file));
        const results = report.results;
        const date: string = report.date;
        console.log(`Processing historical results from: ${date}`);

        // process results first
        let processedResults = options?.preprocess ? options.preprocess(results) : averageAcrossRunners(results);
        // normalize
        processedResults = normalizeData(processedResults);

        // add to the map based by runner name
        for (const result of processedResults) {
            if (options?.filter && !options.filter(result)) {
                // skip
                continue;
            }

            const name = result.metadata.runner;
            const existingResults = runnerResultsMap.get(name) ?? [];

            const rc = {
                ...result
            };
            rc.metadata.date = new Date(date).toISOString();

            existingResults.push(result);
            runnerResultsMap.set(name, existingResults);
        }
    }

    const allData: unknown[] = [];

    // organize by date in ascending order
    for (let [name, results] of runnerResultsMap) {
        results.sort((a, b) => {
            return new Date(a.metadata.date).getTime() - new Date(b.metadata.date).getTime();
        });

        const runners = results.map(r => r.metadata.runner);
        const data = results.map(r => dataFunc(r.data as T, r.metadata)).sort();

        allData.push({
            type: options?.chartType ? options.chartType : 'scatter',
            x: runners,
            y: data,
            name
        });
    }

    const layout = {
        title: chartName,
        showlegend: true,
        width: 1000,
        height: 1000
    };

    const html = `
<!DOCTYPE html>
<html>
    <head>
    <title>${chartName}</title>
    <script src="https://cdn.plot.ly/plotly-2.35.2.min.js" charset="utf-8"></script>
    </head>
    <body>
    <div id="langium-ai-chart" style="width:1000px;height:1000px;margin:8px auto;"></div>
    <script>
        data = ${JSON.stringify(allData)};
        layout = ${JSON.stringify(layout)};
        Plotly.newPlot("langium-ai-chart", data, layout);
    </script>
    </body>
</html>
        `;

    writeFileSync(dest, html);
    console.log(`Historical report written to: ${dest}`);

}