import { error, st } from '../utils/console.js';
import { getRunById, calculateRunSummary } from '../utils/runs.js';

interface ShowOptions {
    verbose?: boolean;
}

export async function showCommand(idOrLatest: string, options: ShowOptions): Promise<void> {
    try {
        // load run
        const run = await getRunById(idOrLatest);

        if (!run) {
            error(`Run not found: ${idOrLatest}`);
            return;
        }

        const summary = calculateRunSummary(run.data, run.fileName);

        // display run header
        console.log();
        console.log(st('bold', `Run #${run.data.runId}`));
        console.log(st('gray', '='.repeat(80)));
        console.log();

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

        // metadata section
        console.log(st('gray', 'Date:') + ` ${dateStr}`);
        console.log(st('gray', 'System Prompt:') + ` ${run.data.syspromptPath || 'N/A'}`);

        // display tags if any
        if (run.data.tags.length > 0) {
            const tagStr = run.data.tags.map((t) => st('magenta', `[${t}]`)).join(' ');
            console.log(st('gray', 'Tags:') + ` ${tagStr}`);
        }

        console.log();

        // summary section
        console.log(st('bold', 'Summary'));
        console.log(st('gray', '-'.repeat(80)));
        console.log(`Total: ${st('blue', String(summary.total))}`);
        if (summary.skipped > 0) {
            console.log(`Skipped: ${st('gray', String(summary.skipped))}`);
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

        console.log(`Average Score: ${st(rateColor, `${(summary.avgScore * 100).toFixed(1)}%`)}`);
        console.log(
            `Score Range: ${st('gray', `${(summary.minScore * 100).toFixed(1)}% - ${(summary.maxScore * 100).toFixed(1)}%`)}`,
        );

        console.log();

        // results section
        console.log(st('bold', 'Results'));
        console.log(st('gray', '-'.repeat(80)));

        for (const result of run.data.results) {
            let icon: string;
            let name: string;

            if (result.data.skipped) {
                // skipped tests shown in grey
                icon = st('gray', '○');
                name = st('gray', `${result.metadata.suiteName} > ${result.metadata.caseName}`);
            } else if (result.data.score >= 0.8) {
                icon = st('green', '✓');
                name = st('white', `${result.metadata.suiteName} > ${result.metadata.caseName}`);
            } else if (result.data.score >= 0.5) {
                icon = st('yellow', '~');
                name = st('yellow', `${result.metadata.suiteName} > ${result.metadata.caseName}`);
            } else {
                icon = st('red', '✗');
                name = st('red', `${result.metadata.suiteName} > ${result.metadata.caseName}`);
            }

            const scoreStr = result.data.skipped ? '' : st('gray', ` (${(result.data.score * 100).toFixed(1)}%)`);
            console.log(`${icon} ${name}${scoreStr}`);

            // verbose mode: show duration and error details
            if (options.verbose) {
                if (!result.data.skipped && result.metadata.duration) {
                    let durationColor: 'gray' | 'yellow' | 'red';
                    if (result.metadata.duration < 1000) {
                        durationColor = 'gray';
                    } else if (result.metadata.duration < 3000) {
                        durationColor = 'yellow';
                    } else {
                        durationColor = 'red';
                    }
                    console.log(`  ${st('gray', 'Duration:')} ${st(durationColor, `${result.metadata.duration}ms`)}`);
                }

                if (result.data.error) {
                    console.log(`  ${st('red', 'Error:')} ${result.data.error}`);
                }

                // print all data entries (skip for skipped tests)
                if (!result.data.skipped) {
                    for (const key in result.data) {
                        if (key !== 'score' && key !== 'skipped' && key !== 'error') {
                            console.log(`  ${st('gray', key + ':')} ${(result.data as Record<string, unknown>)[key]}`);
                        }
                    }
                }
            }
        }

        console.log();
    } catch (err) {
        error(err instanceof Error ? err.message : String(err));
        process.exit(1);
    }
}
