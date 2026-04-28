import chalk from 'chalk';
import { error } from '../utils/console.js';
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
        console.log(chalk.bold(`Run #${run.data.runId}`));
        console.log(chalk.gray('='.repeat(80)));
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
        console.log(chalk.gray('Date:') + ` ${dateStr}`);
        console.log(chalk.gray('System Prompt:') + ` ${run.data.syspromptPath || 'N/A'}`);

        // display tags if any
        if (run.data.tags.length > 0) {
            const tagStr = run.data.tags.map((t) => chalk.magenta(`[${t}]`)).join(' ');
            console.log(chalk.gray('Tags:') + ` ${tagStr}`);
        }

        console.log();

        // summary section
        console.log(chalk.bold('Summary'));
        console.log(chalk.gray('-'.repeat(80)));
        console.log(`Total: ${chalk.blue(summary.total)}`);
        if (summary.skipped > 0) {
            console.log(`Skipped: ${chalk.gray(summary.skipped)}`);
        }

        // average score color
        let rateColor: typeof chalk.green;
        if (summary.avgScore >= 0.8) {
            rateColor = chalk.green;
        } else if (summary.avgScore >= 0.5) {
            rateColor = chalk.yellow;
        } else {
            rateColor = chalk.red;
        }

        console.log(`Average Score: ${rateColor(`${(summary.avgScore * 100).toFixed(1)}%`)}`);
        console.log(
            `Score Range: ${chalk.gray(`${(summary.minScore * 100).toFixed(1)}% - ${(summary.maxScore * 100).toFixed(1)}%`)}`,
        );

        console.log();

        // results section
        console.log(chalk.bold('Results'));
        console.log(chalk.gray('-'.repeat(80)));

        for (const result of run.data.results) {
            let icon: string;
            let name: string;

            if (result.data.skipped) {
                // skipped tests shown in grey
                icon = chalk.gray('○');
                name = chalk.gray(`${result.metadata.suiteName} > ${result.metadata.caseName}`);
            } else if (result.data.score >= 0.8) {
                icon = chalk.green('✓');
                name = chalk.white(`${result.metadata.suiteName} > ${result.metadata.caseName}`);
            } else if (result.data.score >= 0.5) {
                icon = chalk.yellow('~');
                name = chalk.yellow(`${result.metadata.suiteName} > ${result.metadata.caseName}`);
            } else {
                icon = chalk.red('✗');
                name = chalk.red(`${result.metadata.suiteName} > ${result.metadata.caseName}`);
            }

            const scoreStr = result.data.skipped ? '' : chalk.gray(` (${(result.data.score * 100).toFixed(1)}%)`);
            console.log(`${icon} ${name}${scoreStr}`);

            // verbose mode: show duration and error details
            if (options.verbose) {
                if (!result.data.skipped && result.metadata.duration) {
                    let durationColor: typeof chalk.gray;
                    if (result.metadata.duration < 1000) {
                        durationColor = chalk.gray;
                    } else if (result.metadata.duration < 3000) {
                        durationColor = chalk.yellow;
                    } else {
                        durationColor = chalk.red;
                    }
                    console.log(`  ${chalk.gray('Duration:')} ${durationColor(`${result.metadata.duration}ms`)}`);
                }

                if (result.data.error) {
                    console.log(`  ${chalk.red('Error:')} ${result.data.error}`);
                }

                // print all data entries (skip for skipped tests)
                if (!result.data.skipped) {
                    for (const key in result.data) {
                        if (key !== 'score' && key !== 'skipped' && key !== 'error') {
                            console.log(`  ${chalk.gray(key + ':')} ${(result.data as Record<string, unknown>)[key]}`);
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
