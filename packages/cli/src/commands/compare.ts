import chalk from 'chalk';
import { error } from '../utils/console.js';
import { getRunById, calculateRunSummary } from '../utils/runs.js';

export async function compareCommand(id1: string, id2: string): Promise<void> {
    try {
        // load both runs
        const run1 = await getRunById(id1);
        const run2 = await getRunById(id2);

        if (!run1) {
            error(`Run not found: ${id1}`);
            return;
        }

        if (!run2) {
            error(`Run not found: ${id2}`);
            return;
        }

        // calculate summaries
        const summary1 = calculateRunSummary(run1.data, run1.fileName);
        const summary2 = calculateRunSummary(run2.data, run2.fileName);

        // display comparison header
        console.log();
        console.log(chalk.bold(`Comparing Runs: #${run1.data.runId} vs #${run2.data.runId}`));
        console.log(chalk.gray('='.repeat(80)));
        console.log();

        // side-by-side stats
        const col1Width = 35;
        const col2Width = 20;
        const col3Width = 20;

        const header =
            ''.padEnd(col1Width) +
            chalk.cyan(`Run #${run1.data.runId}`.padEnd(col2Width)) +
            chalk.cyan(`Run #${run2.data.runId}`.padEnd(col3Width));
        console.log(header);
        console.log(chalk.gray('-'.repeat(80)));

        // average score with delta
        const score1 = summary1.avgScore * 100;
        const score2 = summary2.avgScore * 100;
        const scoreDelta = score2 - score1;
        let scoreDeltaStr: string;
        if (scoreDelta > 0) {
            scoreDeltaStr = chalk.green(`(+${scoreDelta.toFixed(1)}%)`);
        } else if (scoreDelta < 0) {
            scoreDeltaStr = chalk.red(`(${scoreDelta.toFixed(1)}%)`);
        } else {
            scoreDeltaStr = chalk.gray('(+0.0%)');
        }

        console.log(
            'Avg Score:'.padEnd(col1Width) +
                `${score1.toFixed(1)}%`.padEnd(col2Width) +
                `${score2.toFixed(1)}% ${scoreDeltaStr}`,
        );

        // avg duration with delta
        const durationDelta = summary2.avgDuration - summary1.avgDuration;
        let durationDeltaStr: string;
        if (durationDelta > 0) {
            durationDeltaStr = chalk.red(`(+${durationDelta.toFixed(0)}ms)`);
        } else if (durationDelta < 0) {
            durationDeltaStr = chalk.green(`(${durationDelta.toFixed(0)}ms)`);
        } else {
            durationDeltaStr = chalk.gray('(+0ms)');
        }

        console.log(
            'Avg Duration:'.padEnd(col1Width) +
                `${summary1.avgDuration.toFixed(0)}ms`.padEnd(col2Width) +
                `${summary2.avgDuration.toFixed(0)}ms ${durationDeltaStr}`,
        );

        // total time with delta
        const totalTimeDelta = summary2.totalTime - summary1.totalTime;
        const totalTime1Str =
            summary1.totalTime >= 1000 ? `${(summary1.totalTime / 1000).toFixed(1)}s` : `${summary1.totalTime}ms`;
        const totalTime2Str =
            summary2.totalTime >= 1000 ? `${(summary2.totalTime / 1000).toFixed(1)}s` : `${summary2.totalTime}ms`;
        let totalTimeDeltaStr: string;
        if (totalTimeDelta > 0) {
            const formatted = totalTimeDelta >= 1000 ? (totalTimeDelta / 1000).toFixed(1) + 's' : totalTimeDelta + 'ms';
            totalTimeDeltaStr = chalk.red(`(+${formatted})`);
        } else if (totalTimeDelta < 0) {
            const formatted =
                Math.abs(totalTimeDelta) >= 1000 ? (totalTimeDelta / 1000).toFixed(1) + 's' : totalTimeDelta + 'ms';
            totalTimeDeltaStr = chalk.green(`(${formatted})`);
        } else {
            totalTimeDeltaStr = chalk.gray('(+0ms)');
        }

        console.log(
            'Total Time:'.padEnd(col1Width) + totalTime1Str.padEnd(col2Width) + `${totalTime2Str} ${totalTimeDeltaStr}`,
        );

        console.log();

        // compare test results
        console.log(chalk.bold('Test Changes:'));
        console.log(chalk.gray('-'.repeat(80)));

        // build test score maps
        const tests1 = new Map<string, number>();
        const tests2 = new Map<string, number>();

        for (const result of run1.data.results) {
            if (!result.data.skipped) {
                const testName = `${result.metadata.suiteName} > ${result.metadata.caseName}`;
                tests1.set(testName, result.data.score);
            }
        }

        for (const result of run2.data.results) {
            if (!result.data.skipped) {
                const testName = `${result.metadata.suiteName} > ${result.metadata.caseName}`;
                tests2.set(testName, result.data.score);
            }
        }

        // find changes (score deltas, new, removed)
        const changes: Array<{ type: string; name: string; delta?: number }> = [];

        for (const [testName, score2] of tests2) {
            if (!tests1.has(testName)) {
                changes.push({ type: 'NEW', name: testName });
            } else {
                const score1 = tests1.get(testName)!;
                const delta = score2 - score1;
                // only report meaningful changes (> 1% difference)
                if (Math.abs(delta) > 0.01) {
                    changes.push({ type: 'CHANGED', name: testName, delta });
                }
            }
        }

        // check for removed tests
        for (const [testName] of tests1) {
            if (!tests2.has(testName)) {
                changes.push({ type: 'REMOVED', name: testName });
            }
        }

        if (changes.length === 0) {
            console.log(chalk.gray('  No changes'));
        } else {
            for (const change of changes) {
                let icon: string;
                let coloredType: string;

                switch (change.type) {
                    case 'CHANGED': {
                        const delta = change.delta!;
                        const deltaStr = `${delta > 0 ? '+' : ''}${(delta * 100).toFixed(1)}%`;
                        if (delta > 0) {
                            icon = chalk.green('▲');
                            coloredType = chalk.green(deltaStr);
                        } else {
                            icon = chalk.red('▼');
                            coloredType = chalk.red(deltaStr);
                        }
                        break;
                    }
                    case 'NEW':
                        icon = chalk.blue('+');
                        coloredType = chalk.blue(change.type);
                        break;
                    case 'REMOVED':
                        icon = chalk.gray('-');
                        coloredType = chalk.gray(change.type);
                        break;
                    default:
                        icon = '•';
                        coloredType = change.type;
                }

                console.log(`  ${icon} ${coloredType.padEnd(20)} ${change.name}`);
            }
        }

        console.log();
    } catch (err) {
        error(err instanceof Error ? err.message : String(err));
        process.exit(1);
    }
}
