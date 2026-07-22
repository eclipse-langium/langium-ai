import { error, info, st } from '../utils/console.js';
import { getAllRunFiles, calculateRunSummary } from '../utils/runs.js';

interface StatsOptions {
    tag?: string;
}

export async function statsCommand(options: StatsOptions): Promise<void> {
    try {
        // load all run files
        let runFiles = await getAllRunFiles();

        if (runFiles.length === 0) {
            error('No evaluation history found.');
            info('Run `lai evaluate` to create evaluation logs.');
            return;
        }

        // filter by tag if provided
        if (options.tag) {
            runFiles = runFiles.filter((f) => f.data.tags.includes(options.tag!));
            if (runFiles.length === 0) {
                error(`No runs found with tag: ${options.tag}`);
                return;
            }
        }

        // calculate summaries
        const summaries = runFiles.map((f) => calculateRunSummary(f.data, f.fileName));

        // aggregate statistics
        const totalRuns = summaries.length;
        const totalEvals = summaries.reduce((sum, s) => sum + s.total, 0);
        const totalSkipped = summaries.reduce((sum, s) => sum + s.skipped, 0);
        const totalRan = totalEvals - totalSkipped;

        const avgScore = summaries.reduce((sum, s) => sum + s.avgScore, 0) / totalRuns;
        const avgDuration = summaries.reduce((sum, s) => sum + s.avgDuration, 0) / totalRuns;

        // find best and worst runs
        const bestRun = summaries.reduce((best, current) => (current.avgScore > best.avgScore ? current : best));
        const worstRun = summaries.reduce((worst, current) => (current.avgScore < worst.avgScore ? current : worst));

        // display stats header
        console.log();
        console.log(st('bold', 'Aggregate Statistics'));
        if (options.tag) {
            console.log(st('gray', `Filtered by tag: ${st('magenta', `[${options.tag}]`)}`));
        }
        console.log(st('gray', '='.repeat(80)));
        console.log();

        // overall stats
        console.log(st('bold', 'Overall'));
        console.log(st('gray', '-'.repeat(80)));
        console.log(`Total Runs: ${st('blue', String(totalRuns))}`);
        console.log(`Total Evals: ${st('blue', String(totalEvals))}`);
        console.log(`Ran: ${st('blue', String(totalRan))}`);
        if (totalSkipped > 0) {
            console.log(`Skipped: ${st('gray', String(totalSkipped))}`);
        }
        console.log();

        // averages
        console.log(st('bold', 'Averages'));
        console.log(st('gray', '-'.repeat(80)));

        let avgRateColor: 'green' | 'yellow' | 'red';
        if (avgScore >= 0.8) {
            avgRateColor = 'green';
        } else if (avgScore >= 0.5) {
            avgRateColor = 'yellow';
        } else {
            avgRateColor = 'red';
        }

        console.log(`Score: ${st(avgRateColor, `${(avgScore * 100).toFixed(1)}%`)}`);
        console.log(`Duration: ${st('cyan', `${avgDuration.toFixed(0)}ms`)}`);
        console.log();

        // best/worst runs
        console.log(st('bold', 'Performance'));
        console.log(st('gray', '-'.repeat(80)));
        console.log(
            `Best Run: ${st('green', `#${bestRun.runId}`)} - ${st('green', `${(bestRun.avgScore * 100).toFixed(1)}%`)}`,
        );
        console.log(
            `Worst Run: ${st('red', `#${worstRun.runId}`)} - ${st('red', `${(worstRun.avgScore * 100).toFixed(1)}%`)}`,
        );
        console.log();

        // trend for last 5 runs
        const recentRuns = summaries.slice(0, 5);
        if (recentRuns.length > 1) {
            console.log(st('bold', 'Recent Trend (Last 5 Runs)'));
            console.log(st('gray', '-'.repeat(80)));

            for (const summary of recentRuns) {
                const scorePercent = summary.avgScore * 100;
                let rateColor: 'green' | 'yellow' | 'red';
                if (summary.avgScore >= 0.8) {
                    rateColor = 'green';
                } else if (summary.avgScore >= 0.5) {
                    rateColor = 'yellow';
                } else {
                    rateColor = 'red';
                }

                const bar = '█'.repeat(Math.round(scorePercent / 5));
                console.log(
                    `Run #${summary.runId}: ${st(rateColor, bar.padEnd(20))} ${st(rateColor, `${scorePercent.toFixed(1)}%`)}`,
                );
            }

            console.log();
        }

        // collect all tags with counts
        const tagCounts = new Map<string, number>();
        for (const file of runFiles) {
            for (const tag of file.data.tags) {
                tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
            }
        }

        if (tagCounts.size > 0) {
            console.log(st('bold', 'Tags'));
            console.log(st('gray', '-'.repeat(80)));

            // sort tags by count descending
            const sortedTags = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]);

            for (const [tag, count] of sortedTags) {
                console.log(`${st('magenta', `[${tag}]`)} - ${st('blue', String(count))} run(s)`);
            }

            console.log();
        }
    } catch (err) {
        error(err instanceof Error ? err.message : String(err));
        process.exit(1);
    }
}
