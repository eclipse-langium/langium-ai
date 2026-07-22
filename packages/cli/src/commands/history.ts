import { error, info, st } from '../utils/console.js';
import { getAllRunFiles, calculateRunSummary } from '../utils/runs.js';

interface HistoryOptions {
    limit?: number;
    oneline?: boolean;
}

export async function historyCommand(options: HistoryOptions): Promise<void> {
    try {
        // load all run files
        const runFiles = await getAllRunFiles();

        if (runFiles.length === 0) {
            error('No evaluation history found.');
            info('Run `lai evaluate` to create evaluation logs.');
            return;
        }

        // limit number of runs to show
        const limit = options.limit || 10;
        const filesToShow = runFiles.slice(0, limit);

        // calculate summaries
        const summaries = filesToShow.map((f) => calculateRunSummary(f.data, f.fileName));

        // display history based on format
        if (options.oneline) {
            // calculate max width for run ID padding
            // TODO improve this check rather than doing a string conversion
            const runIds = summaries.map((s) => s.runId.toString().length);
            const maxIdWidth = Math.max(...runIds);

            // oneline format
            for (const summary of summaries) {
                // format timestamp (shorter format for oneline)
                const dateStr = summary.timestamp.toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                });

                // average score color
                let rateColor: 'green' | 'yellow' | 'red';
                if (summary.avgScore >= 0.8) {
                    rateColor = 'green';
                } else if (summary.avgScore >= 0.5) {
                    rateColor = 'yellow';
                } else {
                    rateColor = 'red';
                }

                // format total time
                const totalTimeStr =
                    summary.totalTime >= 1000 ? `${(summary.totalTime / 1000).toFixed(1)}s` : `${summary.totalTime}ms`;

                // pad run ID for alignment
                const paddedId = summary.runId.toString().padEnd(maxIdWidth, ' ');

                // build oneline output
                let line = `${st('cyan', paddedId)} - ${st('gray', dateStr)} - `;
                line += `avg ${st(rateColor, `${(summary.avgScore * 100).toFixed(1)}%`)} `;
                line += `(${st('blue', String(summary.total - summary.skipped))} cases) - `;
                line += st('gray', totalTimeStr);

                // add tags if any
                if (summary.tags.length > 0) {
                    const tagStr = summary.tags.map((t) => st('magenta', `[${t}]`)).join(' ');
                    line += ` ${tagStr}`;
                }

                console.log(line);
            }
        } else {
            // standard format
            console.log();
            console.log(st('bold', 'Evaluation History'));
            console.log(st('gray', '='.repeat(80)));
            console.log();

            for (const summary of summaries) {
                // format timestamp
                const dateStr = summary.timestamp.toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                });

                // run header with ID
                console.log(st('cyan', `Run #${summary.runId}`) + st('gray', ` - ${dateStr}`));

                // display tags if any
                if (summary.tags.length > 0) {
                    const tagStr = summary.tags.map((t) => st('magenta', `[${t}]`)).join(' ');
                    console.log(`  ${tagStr}`);
                }

                // average score color
                let rateColor: 'green' | 'yellow' | 'red';
                if (summary.avgScore >= 0.8) {
                    rateColor = 'green';
                } else if (summary.avgScore >= 0.5) {
                    rateColor = 'yellow';
                } else {
                    rateColor = 'red';
                }

                // format total time
                const totalTimeStr =
                    summary.totalTime >= 1000 ? `${(summary.totalTime / 1000).toFixed(1)}s` : `${summary.totalTime}ms`;

                // display stats
                const ran = summary.total - summary.skipped;
                console.log(
                    `  Cases: ${st('blue', String(ran))}` +
                        (summary.skipped > 0 ? ` | Skipped: ${st('gray', String(summary.skipped))}` : ''),
                );
                console.log(
                    `  Avg Score: ${st(rateColor, `${(summary.avgScore * 100).toFixed(1)}%`)} | ` +
                        `Range: ${st('gray', `${(summary.minScore * 100).toFixed(1)}%-${(summary.maxScore * 100).toFixed(1)}%`)} | ` +
                        `Avg Duration: ${st('gray', `${summary.avgDuration.toFixed(0)}ms`)} | ` +
                        `Total Time: ${st('gray', totalTimeStr)}`,
                );
                console.log();
            }
        }

        // show footer if there are more runs
        if (runFiles.length > filesToShow.length) {
            const remaining = runFiles.length - filesToShow.length;
            console.log(st('gray', `... and ${remaining} more run(s)`));
            console.log(st('gray', `Use --limit to show more results`));
            console.log();
        }
    } catch (err) {
        error(err instanceof Error ? err.message : String(err));
        process.exit(1);
    }
}
