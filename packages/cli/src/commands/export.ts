import fs from 'fs-extra';
import path from 'path';
import { error, success } from '../utils/console.js';
import { getRunById } from '../utils/runs.js';

interface ExportOptions {
    format?: string;
    output?: string;
}

export async function exportCommand(idOrLatest: string, options: ExportOptions): Promise<void> {
    try {
        // load run
        const run = await getRunById(idOrLatest);

        if (!run) {
            error(`Run not found: ${idOrLatest}`);
            return;
        }

        const format = options.format || 'csv';

        if (format === 'csv') {
            await exportCSV(run.data.runId, run.data.results, options.output);
        } else if (format === 'json') {
            await exportJSON(run.data, options.output);
        } else {
            error(`Unsupported format: ${format}`);
            return;
        }
    } catch (err) {
        error(err instanceof Error ? err.message : String(err));
        process.exit(1);
    }
}

/**
 * export results to CSV format
 */
async function exportCSV(
    runId: number,
    results: Array<{
        metadata: { suiteName: string; caseName: string; duration: number };
        data: { score: number; skipped?: boolean; error?: string | Error };
    }>,
    outputPath?: string,
): Promise<void> {
    // generate CSV header
    const header = 'Suite,Case,Score,Skipped,Duration,Error\n';

    // generate CSV rows
    const rows = results.map((result) => {
        const suite = escapeCSV(result.metadata.suiteName);
        const caseName = escapeCSV(result.metadata.caseName);
        const score = result.data.score.toFixed(4);
        const skipped = result.data.skipped ? 'true' : 'false';
        const duration = result.metadata.duration.toString();
        const errorMsg = result.data.error
            ? escapeCSV(result.data.error instanceof Error ? result.data.error.message : String(result.data.error))
            : '';

        return `${suite},${caseName},${score},${skipped},${duration},${errorMsg}`;
    });

    const csv = header + rows.join('\n');

    // save to file or output to stdout
    if (outputPath) {
        const fullPath = path.resolve(process.cwd(), outputPath);
        await fs.writeFile(fullPath, csv, 'utf-8');
        success(`Exported to: ${outputPath}`);
    } else {
        console.log(csv);
    }
}

/**
 * export results to JSON format
 */
async function exportJSON(runData: unknown, outputPath?: string): Promise<void> {
    const json = JSON.stringify(runData, null, 2);

    // save to file or output to stdout
    if (outputPath) {
        const fullPath = path.resolve(process.cwd(), outputPath);
        await fs.writeFile(fullPath, json, 'utf-8');
        success(`Exported to: ${outputPath}`);
    } else {
        console.log(json);
    }
}

/**
 * escape CSV value (handle commas, quotes, newlines)
 */
function escapeCSV(value: string): string {
    // if value contains comma, quote, or newline, wrap in quotes and escape quotes
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}
