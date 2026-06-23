import { Command } from 'commander';
import { initCommand, initConfigCommand, initEvalsCommand } from './commands/init.js';
import { generateCommand } from './commands/generate.js';
import { evaluateCommand } from './commands/evaluate.js';
import { statusCommand } from './commands/status.js';
import { historyCommand } from './commands/history.js';
import { showCommand } from './commands/show.js';
import { compareCommand } from './commands/compare.js';
import { cleanCommand } from './commands/clean.js';
import { statsCommand } from './commands/stats.js';
import { exportCommand } from './commands/export.js';
import { tagCommand } from './commands/tag.js';
import { validateCommand } from './commands/validate.js';

// injected by esbuild `define` at build time from package.json
// falls back to 'dev' when running via `tsx watch` (dev mode)
declare const __CLI_VERSION__: string;

const program = new Command();

program
    .name('lai')
    .description('Langium-AI CLI for bootstrapping AI-powered language tooling')
    .version(__CLI_VERSION__ ?? 'dev');

const initCmd = program.command('init').description('Initialize LAI in your Langium project').action(initCommand);
initCmd.command('config').description('Reinitialize the lai.config.jsonc file').action(initConfigCommand);
initCmd.command('evals').description('Reinitialize the evals directory and template files').action(initEvalsCommand);

program
    .command('gen')
    .description('Generate descriptor or a system prompt')
    .argument('<type>', 'descriptor, sysprompt')
    .option('--fresh', 'Generate from scratch, ignoring existing files')
    .action(generateCommand);

program
    .command('evaluate')
    .alias('eval')
    .alias('e')
    .description('Run evaluations against your system prompt')
    .argument('[paths...]', 'Eval files or directories (defaults to the configured evaluations directory)')
    .option('--dir <path>', '[DEPRECATED] Path to evaluations directory (pass as a positional argument instead)')
    .option('--output <path>', 'Output path to use over the default')
    .option('--sysprompt <path>', 'Path to system prompt file (overrides config)')
    .option('--verbose', 'Show detailed evaluation output')
    .option('--list', 'List discovered eval files, suites, and cases without running them')
    .action(evaluateCommand);

program.command('status').alias('s').description('Show LAI project status').action(statusCommand);

program
    .command('history')
    .alias('h')
    .description('View evaluation run history')
    .option('--limit <number>', 'Number of runs to show', '10')
    .option('--oneline', 'Show history in condensed single-line format')
    .action(
        async (options: {
            limit?: string;
            oneline?: boolean;
        }) => {
            // parse limit as number
            const limit = options.limit ? parseInt(options.limit, 10) : NaN;
            await historyCommand({
                limit: isNaN(limit) ? 10 : limit,
                oneline: options.oneline,
            });
        },
    );

program
    .command('show')
    .description('Show detailed results of a specific run')
    .argument('<id|latest|path>', 'Run ID, "latest", or result file path')
    .option('--verbose', 'Show detailed test data')
    .action(showCommand);

program
    .command('compare')
    .description('Compare two evaluation runs')
    .argument('<id1>', 'First run ID, "latest", or result file path')
    .argument('<id2>', 'Second run ID, "latest", or result file path')
    .action(compareCommand);

program
    .command('clean')
    .description('Clean up old evaluation logs')
    .option('--keep <number>', 'Keep N most recent runs', parseInt)
    .option('--before <id>', 'Delete runs before this ID')
    .option('--yes', 'Skip confirmation prompt')
    .action(cleanCommand);

program
    .command('stats')
    .description('Show aggregate statistics across runs')
    .option('--tag <tag>', 'Filter by tag')
    .action(statsCommand);

program
    .command('export')
    .description('Export run results')
    .argument('<id|latest>', 'Run ID or "latest"')
    .option('--format <format>', 'Output format (csv or json)', 'csv')
    .option('--output <path>', 'Output file path (stdout if not specified)')
    .action(exportCommand);

program
    .command('tag')
    .description('Add tags to a run')
    .argument('<id|latest|path>', 'Run ID, "latest", or result file path')
    .argument('<tags...>', 'Tags to add')
    .action(tagCommand);

program.command('validate').alias('v').description('Validate the language descriptor').action(validateCommand);

program.parse();
