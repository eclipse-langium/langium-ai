import chalk from 'chalk';
import { error, success } from '../utils/console.js';
import { getRunById, addTagsToRun } from '../utils/runs.js';

export async function tagCommand(idOrLatestOrPath: string, tags: string[]): Promise<void> {
    try {
        // validate tags provided
        if (tags.length === 0) {
            error('No tags provided');
            return;
        }

        // check if run exists first
        const run = await getRunById(idOrLatestOrPath);
        if (!run) {
            error(`Run not found: ${idOrLatestOrPath}`);
            return;
        }

        // add tags to run
        await addTagsToRun(idOrLatestOrPath, tags);

        // display confirmation with colored tags
        const tagStr = tags.map((t) => chalk.magenta(`[${t}]`)).join(' ');
        success(`Added tags to Run #${run.data.runId}: ${tagStr}`);
    } catch (err) {
        error(err instanceof Error ? err.message : String(err));
        process.exit(1);
    }
}
