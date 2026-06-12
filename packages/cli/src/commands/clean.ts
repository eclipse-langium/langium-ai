import chalk from 'chalk';
import { error, success, info } from '../utils/console.js';
import { confirm } from '../utils/prompt.js';
import { getAllRunFiles, deleteRuns } from '../utils/runs.js';

interface CleanOptions {
    keep?: number;
    before?: string;
    yes?: boolean;
}

export async function cleanCommand(options: CleanOptions): Promise<void> {
    try {
        // load all run files
        const runFiles = await getAllRunFiles();

        if (runFiles.length === 0) {
            error('No evaluation history found.');
            return;
        }

        // determine which runs to delete
        let runsToDelete: number[];

        if (options.keep !== undefined) {
            // keep N most recent runs, delete the rest
            if (options.keep < 0) {
                error('--keep must be a positive number');
                return;
            }

            if (options.keep >= runFiles.length) {
                info('Nothing to clean. All runs would be kept.');
                return;
            }

            // runFiles is already sorted by runId descending (newest first)
            const _toKeep = runFiles.slice(0, options.keep);
            const toDelete = runFiles.slice(options.keep);
            runsToDelete = toDelete.map((f) => f.data.runId);
        } else if (options.before !== undefined) {
            // delete runs before a specific ID
            const beforeId = parseInt(options.before, 10);
            if (isNaN(beforeId)) {
                error(`Invalid run ID: ${options.before}`);
                return;
            }

            runsToDelete = runFiles.filter((f) => f.data.runId < beforeId).map((f) => f.data.runId);

            if (runsToDelete.length === 0) {
                info(`No runs found before ID ${beforeId}`);
                return;
            }
        } else {
            error('Must specify either --keep or --before');
            info('Examples:');
            info('  lai clean --keep 5        # Keep 5 most recent runs');
            info('  lai clean --before 10     # Delete runs before ID 10');
            return;
        }

        // list runs to be deleted
        console.log();
        console.log(chalk.bold('Runs to be deleted:'));
        console.log(chalk.gray('-'.repeat(80)));

        for (const runId of runsToDelete) {
            const file = runFiles.find((f) => f.data.runId === runId);
            if (file) {
                const dateStr = new Date(file.data.timestamp).toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                });
                console.log(`  Run #${runId} - ${dateStr}`);
            }
        }

        console.log();
        console.log(chalk.yellow(`Total: ${runsToDelete.length} run(s) will be deleted`));
        console.log();

        // prompt for confirmation unless --yes flag is set
        if (!options.yes) {
            const confirmed = await confirm('Are you sure you want to delete these runs?');

            if (!confirmed) {
                info('Cancelled');
                return;
            }
        }

        // delete runs
        await deleteRuns(runsToDelete);

        success(`Deleted ${runsToDelete.length} run(s)`);
    } catch (err) {
        error(err instanceof Error ? err.message : String(err));
        process.exit(1);
    }
}
