import fs from 'fs-extra';
import path from 'path';
import { register } from 'node:module';
import chalk from 'chalk';
import { loadConfig } from '../core/config.js';
import { error, info, success, spinner } from '../utils/console.js';
import { runEvalFile } from 'langium-ai-tools/evals';
import type { EvalContext, EvaluationCaseResult } from 'langium-ai-tools/evals';
import { getNextRunId, saveRunData } from '../utils/runs.js';
import type { EvaluationRunData } from '../utils/runs.js';

// track if tsx loader is registered
let tsxLoaderRegistered = false;

interface EvaluateOptions {
    output?: string;
    sysprompt?: string;
    verbose?: boolean;
}

/**
 * Count the number of test cases in an eval file without running them
 */
async function countEvalCases(filePath: string): Promise<number> {
    const { pathToFileURL } = await import('url');

    // dynamically import the testing module
    const { getCollectedSuites, clearSuites } = await import('langium-ai-tools/evals');

    // clear any previous state
    clearSuites();

    // dynamically import eval file (triggers describe/test calls)
    // add cache-busting query parameter to force re-import later
    const fileUrl = pathToFileURL(filePath).href + '?count=' + Date.now();
    await import(fileUrl);

    // collect suites and count evaluations
    const suites = getCollectedSuites();
    return suites.reduce((sum, suite) => sum + suite.evaluations.length, 0);
}

export async function evaluateCommand(options: EvaluateOptions): Promise<void> {
    try {
        const config = await loadConfig();

        // load system prompt (use --sysprompt option if provided, otherwise use config)
        const syspromptPath = options.sysprompt
            ? path.resolve(process.cwd(), options.sysprompt)
            : path.join(process.cwd(), config.sysprompt.path);

        if (!(await fs.pathExists(syspromptPath))) {
            const hint = options.sysprompt
                ? `File not found: ${syspromptPath}`
                : 'System prompt not found. Run `lai gen sysprompt` first.';
            error(hint);
            return;
        }
        const systemPrompt = await fs.readFile(syspromptPath, 'utf-8');

        // find evals directory
        const evalsDir = path.join(process.cwd(), config.evaluations.directory);
        if (!(await fs.pathExists(evalsDir))) {
            error(`Evaluation directory not found: ${evalsDir}`);
            info('Run `lai init` to set up evaluations.');
            return;
        }

        // discover .eval.ts files
        const files = await fs.readdir(evalsDir);
        const evalFiles = files.filter((f) => f.endsWith('.eval.ts')).map((f) => path.join(evalsDir, f));

        if (evalFiles.length === 0) {
            error('No .eval.ts files found in evals directory.');
            info('Add evaluation files with .eval.ts extension.');
            return;
        }

        // register tsx loader for TypeScript support (only once)
        if (!tsxLoaderRegistered) {
            try {
                // use tsx's ESM loader (Node 20.6+ compatible)
                register('tsx/esm', import.meta.url);
                tsxLoaderRegistered = true;
            } catch (_error) {
                // tsx may not be available, continue anyway (silence since it may still work)
            }
        }

        // create eval context
        const context: EvalContext = {
            systemPrompt,
            project: { name: config.project.name },
        };

        // count total test cases across all files
        let totalCases = 0;
        for (const file of evalFiles) {
            try {
                const count = await countEvalCases(file);
                totalCases += count;
            } catch (_err) {
                // if counting fails, we'll just show files count instead
                totalCases = 0;
                break;
            }
        }

        // run evaluations
        if (totalCases > 0) {
            info(`Running ${totalCases} evaluation case(s) across ${evalFiles.length} file(s)...\n`);
        } else {
            info(`Running ${evalFiles.length} evaluation file(s)...\n`);
        }

        const startTime = Date.now();
        const allResults: EvaluationCaseResult[] = [];
        let completedGlobal = 0;

        // create a persistent status spinner for verbose mode
        let statusSpinner: ReturnType<typeof spinner> | null = null;
        if (options.verbose && totalCases > 0) {
            statusSpinner = spinner('');
            statusSpinner.start();
        }

        for (let i = 0; i < evalFiles.length; i++) {
            const file = evalFiles[i];
            const fileName = path.basename(file);

            // start spinner for this file (non-verbose mode only)
            const fileSpinner = options.verbose ? null : spinner(`Running ${chalk.cyan(fileName)}...`);

            if (options.verbose) {
                // stop status spinner temporarily to print file header
                if (statusSpinner) {
                    statusSpinner.stop();
                }
                console.log(`\n${'='.repeat(60)}`);
                console.log(`File: ${fileName}`);
                console.log(`${'='.repeat(60)}`);
                // restart status spinner
                if (statusSpinner) {
                    statusSpinner.start();
                }
            }

            // run evaluations with progress callback
            const results: EvaluationCaseResult[] = await runEvalFile(
                file,
                context,
                (current, total) => {
                    // update spinner text with progress
                    if (fileSpinner) {
                        const progress = chalk.gray(`(${current}/${total})`);
                        fileSpinner.text = `Running ${chalk.cyan(fileName)}... ${progress}`;
                    }
                },
                (result, _current, _total) => {
                    // track global progress
                    completedGlobal++;

                    // update status spinner in verbose mode
                    if (statusSpinner && totalCases > 0) {
                        const remaining = totalCases - completedGlobal;
                        statusSpinner.text = ` ${chalk.cyan(`${completedGlobal}/${totalCases}`)} evaluations completed, ${chalk.yellow(`${remaining} remaining`)}`;
                    }

                    // in verbose mode, print result immediately as it completes
                    if (options.verbose) {
                        // stop spinner temporarily to print result
                        if (statusSpinner) {
                            statusSpinner.stop();
                        }

                        const { data, metadata } = result;
                        let icon: string;
                        let name: string;

                        if (data.skipped) {
                            // skipped tests shown in grey
                            icon = chalk.gray('○');
                            name = chalk.gray(`${metadata.suiteName} > ${metadata.caseName}`);
                        } else if (data.score >= 0.8) {
                            icon = chalk.green('✓');
                            name = chalk.white(`${metadata.suiteName} > ${metadata.caseName}`);
                        } else if (data.score >= 0.5) {
                            icon = chalk.yellow('~');
                            name = chalk.yellow(`${metadata.suiteName} > ${metadata.caseName}`);
                        } else {
                            icon = chalk.red('✗');
                            name = chalk.red(`${metadata.suiteName} > ${metadata.caseName}`);
                        }

                        // show score alongside the result
                        const scoreStr = chalk.gray(`(${(data.score * 100).toFixed(1)}%)`);

                        // show x/n count along with the result
                        const progress = totalCases > 0 ? chalk.gray(` [${completedGlobal}/${totalCases}]`) : '';
                        console.log(`\n${icon} ${name} ${scoreStr}${progress}`);
                        if (data.skipped) {
                            console.log(`  ${chalk.gray('(skipped)')}`);
                        } else if (metadata.duration) {
                            let durationColor: typeof chalk.gray;
                            if (metadata.duration < 1000) {
                                durationColor = chalk.gray;
                            } else if (metadata.duration < 3000) {
                                durationColor = chalk.yellow;
                            } else {
                                durationColor = chalk.red;
                            }
                            console.log(`  ${chalk.gray('Duration:')} ${durationColor(`${metadata.duration}ms`)}`);
                        }
                        // print all data entries (skip for skipped tests)
                        if (!data.skipped) {
                            console.log('DATA:');
                            for (const key in data) {
                                console.log(`${key}: ${(data as unknown as Record<string, string>)[key]}`);
                            }
                        }

                        // restart spinner
                        if (statusSpinner) {
                            statusSpinner.start();
                        }
                    }
                },
            );
            allResults.push(...results);

            // stop spinner and show completion count
            const skippedCount = results.filter((r) => r.data.skipped).length;
            const ranCount = results.length - skippedCount;
            const avgScore =
                ranCount > 0
                    ? results.filter((r) => !r.data.skipped).reduce((sum, r) => sum + r.data.score, 0) / ranCount
                    : 0;
            const countText =
                skippedCount > 0
                    ? `avg ${(avgScore * 100).toFixed(1)}% (${ranCount} cases, ${skippedCount} skipped)`
                    : `avg ${(avgScore * 100).toFixed(1)}% (${ranCount} cases)`;
            let countColor: typeof chalk.green;
            if (avgScore >= 0.8) {
                countColor = chalk.green;
            } else if (avgScore >= 0.5) {
                countColor = chalk.yellow;
            } else {
                countColor = chalk.red;
            }

            if (fileSpinner) {
                fileSpinner.succeed(`${chalk.cyan(fileName)}: ${countColor(countText)}`);
            } else if (options.verbose) {
                // stop status spinner to print file completion
                if (statusSpinner) {
                    statusSpinner.stop();
                }
                console.log(chalk.gray(`\nFile complete: ${countColor(countText)}`));
                // restart status spinner
                if (statusSpinner) {
                    statusSpinner.start();
                }
            }

            // print results (only in non-verbose mode, since verbose already printed them)
            if (!options.verbose) {
                for (const { data, metadata } of results) {
                    let icon: string;
                    let name: string;

                    if (data.skipped) {
                        // skipped tests shown in grey
                        icon = chalk.gray('○');
                        name = chalk.gray(`${metadata.suiteName} > ${metadata.caseName}`);
                    } else if (data.score >= 0.8) {
                        icon = chalk.green('✓');
                        name = chalk.white(`${metadata.suiteName} > ${metadata.caseName}`);
                    } else if (data.score >= 0.5) {
                        icon = chalk.yellow('~');
                        name = chalk.yellow(`${metadata.suiteName} > ${metadata.caseName}`);
                    } else {
                        icon = chalk.red('✗');
                        name = chalk.red(`${metadata.suiteName} > ${metadata.caseName}`);
                    }

                    const scoreStr = data.skipped ? '' : chalk.gray(` (${(data.score * 100).toFixed(1)}%)`);
                    console.log(`  ${icon} ${name}${scoreStr}`);
                }
            }

            console.log();
        }

        // stop the status spinner before showing summary
        if (statusSpinner) {
            statusSpinner.succeed(chalk.green(`All evaluations complete! (${completedGlobal}/${totalCases})`));
        }

        // calculate total time
        const totalTime = Date.now() - startTime;

        // summary
        const skipped = allResults.filter((r) => r.data.skipped).length;
        const ranTests = allResults.filter((r) => !r.data.skipped);
        const avgScore = ranTests.length > 0 ? ranTests.reduce((sum, r) => sum + r.data.score, 0) / ranTests.length : 0;
        const minScore = ranTests.length > 0 ? Math.min(...ranTests.map((r) => r.data.score)) : 0;
        const maxScore = ranTests.length > 0 ? Math.max(...ranTests.map((r) => r.data.score)) : 0;
        const avgDuration =
            ranTests.length > 0
                ? ranTests.reduce((sum, r) => sum + (r.metadata.duration || 0), 0) / ranTests.length
                : 0;

        console.log(chalk.gray('='.repeat(60)));
        console.log(chalk.bold('Summary'));
        console.log(chalk.gray('='.repeat(60)));
        console.log(`Total: ${chalk.blue(allResults.length.toString())}`);
        console.log(`Ran: ${chalk.blue(ranTests.length.toString())}`);
        if (skipped > 0) {
            console.log(`Skipped: ${chalk.gray(skipped.toString())}`);
        }
        console.log(`Average duration: ${chalk.cyan(`${avgDuration.toFixed(0)}ms`)}`);

        // format total time (seconds if >= 1000ms, otherwise ms)
        const totalTimeFormatted = totalTime >= 1000 ? `${(totalTime / 1000).toFixed(2)}s` : `${totalTime}ms`;
        console.log(`Total time: ${chalk.cyan(totalTimeFormatted)}`);

        let rateColor: typeof chalk.green;
        if (avgScore >= 0.8) {
            rateColor = chalk.green;
        } else if (avgScore >= 0.5) {
            rateColor = chalk.yellow;
        } else {
            rateColor = chalk.red;
        }
        console.log(`Average score: ${rateColor(`${(avgScore * 100).toFixed(1)}%`)}`);
        console.log(`Score range: ${chalk.gray(`${(minScore * 100).toFixed(1)}% - ${(maxScore * 100).toFixed(1)}%`)}`);

        // show low-scoring cases (score < 0.5)
        const lowScoring = ranTests.filter((r) => r.data.score < 0.5);
        if (lowScoring.length > 0) {
            console.log();
            console.log(chalk.red.bold('Low-scoring cases:'));
            for (const { metadata, data } of lowScoring) {
                console.log(
                    chalk.red(`  ✗ ${metadata.suiteName} > ${metadata.caseName} (${(data.score * 100).toFixed(1)}%)`),
                );
                if (data?.error) {
                    console.log(chalk.gray(`    Error: ${data.error}`));
                }
            }
        }

        // save results with run metadata
        const runId = await getNextRunId();
        const now = new Date();
        const runData: EvaluationRunData = {
            runId,
            timestamp: now.toISOString(),
            tags: [],
            syspromptPath: path.resolve(syspromptPath),
            totalTime,
            results: allResults,
        };

        // use custom output path if provided, otherwise use run utilities
        let outputPath: string;
        if (options.output) {
            outputPath = path.join(process.cwd(), options.output);
            await fs.writeJSON(outputPath, runData, { spaces: 2 });
        } else {
            outputPath = await saveRunData(runData);
        }

        const relativePath = path.relative(process.cwd(), outputPath);
        success(`Results saved to: ${relativePath} (Run #${runId})`);

        // exit with error if any cases scored below 0.5
        if (lowScoring.length > 0) {
            process.exit(1);
        }
    } catch (err) {
        error(err instanceof Error ? err.message : String(err));
        process.exit(1);
    }
}
