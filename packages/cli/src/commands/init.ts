import { execSync } from 'child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'path';
import { configExists, saveConfig } from '../core/config.js';
import { detectLangiumProject, getLanguageNames, getProjectName } from '../core/langium-detector.js';
import { checkLangiumVersion } from '../core/langium-version.js';
import { getTemplate } from '../templates.js';
import type { LaiConfig, LangiumProjectStructure } from '../types.js';
import { error, header, logDetected, section, spinner, success, warning } from '../utils/console.js';
import { detectPackageManager, makeRelative, pathExists } from '../utils/fs.js';
import { confirm, text } from '../utils/prompt.js';

// injected by esbuild `define` at build time from package.json
// falls back to 'dev' when running via `tsx watch` (dev mode)
declare const __CLI_VERSION__: string;

/**
 * Options accepted by the init commands.
 */
export interface InitOptions {
    /**
     * Used to skip interactive prompts and apply defaults for CI & non-interactive use cases
     */
    yes?: boolean;
}

/**
 * Detects the Langium project structure and displays the results.
 * Returns the detected structure, or undefined if detection failed.
 *
 * @throws When detection fails
 */
async function detectAndDisplayStructure(cwd: string): Promise<LangiumProjectStructure> {
    header('Detecting Langium project...');

    // warn (and set a non-zero exit code) up front if the project's langium is too old
    await checkLangiumVersion(cwd);

    const detectSpinner = spinner('Scanning project structure...');
    let structure;
    try {
        structure = await detectLangiumProject(cwd);
        detectSpinner.success('Project structure detected');
    } catch (err) {
        detectSpinner.error('Failed to detect project structure');
        error(err instanceof Error ? err.message : String(err));
        throw err;
    }

    if (!structure.languages || structure.languages.length === 0) {
        throw 'No registered Langium languages found in this project';
    }

    // display detected structure
    console.log();
    section('Core Files');
    logDetected('Languages', structure.languages.map((l) => l.id).join(', '), true);
    logDetected(
        'Config',
        structure.langiumConfig ? makeRelative(cwd, structure.langiumConfig) : '(not found)',
        !!structure.langiumConfig,
    );
    logDetected(
        'DI Module',
        structure.services.module ? makeRelative(cwd, structure.services.module) : '(not found)',
        !!structure.services.module,
    );

    // display detected services grouped by category (only show categories with detected services)
    const serviceGroups: { label: string; entries: [string, string | undefined][] }[] = [
        {
            label: 'Parser Services',
            entries: [
                ['Async Parser', structure.services.async_parser],
                ['Grammar Config', structure.services.grammar_config],
                ['Langium Parser', structure.services.langium_parser],
                ['Parser Error Message Provider', structure.services.parser_error_message_provider],
                ['Lexer Error Message Provider', structure.services.lexer_error_message_provider],
                ['Completion Parser', structure.services.completion_parser],
                ['Token Builder', structure.services.token_builder],
                ['Lexer', structure.services.lexer],
                ['Value Converter', structure.services.value_converter],
            ],
        },
        {
            label: 'Documentation Services',
            entries: [
                ['Comment Provider', structure.services.comment_provider],
                ['Documentation Provider', structure.services.documentation_provider],
            ],
        },
        {
            label: 'References Services',
            entries: [
                ['Linker', structure.services.linker],
                ['Name Provider', structure.services.name_provider],
                ['References', structure.services.references],
                ['Scope Provider', structure.services.scope_provider],
                ['Scope Computation', structure.services.scope_computation],
            ],
        },
        {
            label: 'Serializer Services',
            entries: [
                ['Hydrator', structure.services.hydrator],
                ['JSON Serializer', structure.services.json_serializer],
            ],
        },
        {
            label: 'Validation Services',
            entries: [
                ['Validator', structure.services.validator],
                ['Validation Registry', structure.services.validation_registry],
            ],
        },
        {
            label: 'LSP Services',
            entries: [
                ['Completion Provider', structure.services.completion_provider],
                ['Document Highlight Provider', structure.services.document_highlight_provider],
                ['Document Symbol Provider', structure.services.document_symbol_provider],
                ['Hover Provider', structure.services.hover_provider],
                ['Folding Range Provider', structure.services.folding_range_provider],
                ['Definition Provider', structure.services.definition_provider],
                ['Type Provider', structure.services.type_provider],
                ['Implementation Provider', structure.services.implementation_provider],
                ['References Provider', structure.services.references_provider],
                ['Code Action Provider', structure.services.code_action_provider],
                ['Semantic Token Provider', structure.services.semantic_token_provider],
                ['Rename Provider', structure.services.rename_provider],
                ['Formatter', structure.services.formatter],
                ['Signature Help Provider', structure.services.signature_help_provider],
                ['Call Hierarchy Provider', structure.services.call_hierarchy_provider],
                ['Type Hierarchy Provider', structure.services.type_hierarchy_provider],
                ['Declaration Provider', structure.services.declaration_provider],
                ['Inlay Hint Provider', structure.services.inlay_hint_provider],
                ['Code Lens Provider', structure.services.code_lens_provider],
                ['Document Link Provider', structure.services.document_link_provider],
            ],
        },
    ];

    for (const group of serviceGroups) {
        const detected = group.entries.filter(([, value]) => value);
        if (detected.length > 0) {
            section(group.label);
            for (const [label, value] of detected) {
                logDetected(label, makeRelative(cwd, value!), true);
            }
        }
    }

    section('Directories');
    if (structure.tests.length > 0) {
        for (const testDir of structure.tests) {
            logDetected('Tests', makeRelative(cwd, testDir), true);
        }
    } else {
        logDetected('Tests', '(not found)', false);
    }
    logDetected(
        'Examples',
        structure.examples ? makeRelative(cwd, structure.examples) : '(not found)',
        !!structure.examples,
    );

    console.log();
    return structure;
}

/**
 * Creates or overwrites the lai.config.jsonc file based on the detected project structure.
 *
 * @throws When config cannot be initialized successfully
 */
async function initConfig(cwd: string, structure: LangiumProjectStructure, languageName: string): Promise<void> {
    const config: LaiConfig = {
        // TODO need to adjust this so it's either the language version or LAI version, can't be both
        version: __CLI_VERSION__,
        langium: {
            configPath: structure.langiumConfig ? makeRelative(cwd, structure.langiumConfig) : './langium-config.json',
            languages: structure.languages.map((l) => {
                return {
                    id: l.id,
                    grammarPath: l.grammar,
                    caseInsensitive: l.caseInsensitive,
                };
            }),
        },
        descriptor: {
            path: `./${languageName}.descriptor.yml`,
        },
        sysprompt: {
            path: `./${languageName}.sysprompt.md`,
        },
        evaluations: {
            directory: './evals',
        },
        project: {
            name: languageName,
        },
    };

    const saveSpinner = spinner('Creating lai.config.jsonc...');
    try {
        await saveConfig(config, cwd);
        saveSpinner.success('Created lai.config.jsonc');
    } catch (err) {
        // log & rethrow
        saveSpinner.error('Failed to create config');
        error(err instanceof Error ? err.message : String(err));
        throw err;
    }
}

/**
 * Creates the evals directory and copies template files into it.
 */
async function initEvals(cwd: string, structure: LangiumProjectStructure, yes = false): Promise<void> {
    const evalsSpinner = spinner('Setting up evaluations...');
    try {
        const evalsDir = path.join(cwd, 'evals');
        await mkdir(evalsDir, { recursive: true });

        // write utils.ts template
        const utilsTargetPath = path.join(evalsDir, 'utils.ts');
        await writeFile(utilsTargetPath, getTemplate('utils.ts'), 'utf-8');

        // check if basic.eval.ts already exists
        const evalTargetPath = path.join(evalsDir, 'basic.eval.ts');
        let shouldCopyEvalFile = true;

        if ((await pathExists(evalTargetPath)) && !yes) {
            evalsSpinner.stop();
            shouldCopyEvalFile = await confirm('basic.eval.ts already exists. Overwrite?');
            evalsSpinner.start('Setting up evaluations...');
        }

        // write basic.eval.ts template with placeholder substitution
        if (shouldCopyEvalFile) {
            let templateContent = getTemplate('basic.eval.ts');

            // TODO for multiple language names we need to generate an entry for each one
            const languageNames: string[] = getLanguageNames(structure);

            // determine services module path
            const servicesModulePath = structure.services.module
                ? makeRelative(evalsDir, structure.services.module).replace(/\.ts$/, '.js')
                : '../src/language/main.js';

            // create a singular invocation to get the collective service instance
            const joinedLanguageNames = languageNames.join('And');
            // TODO replace with the detected service one

            let createLanguageServicesNames: string;
            if (structure.serviceDetails.createServicesFunc) {
                createLanguageServicesNames = structure.serviceDetails.createServicesFunc;
            } else {
                createLanguageServicesNames = `create${joinedLanguageNames}Services`;
            }

            // const createLanguageServicesNames = `create${joinedLanguageNames}Services`;
            templateContent = templateContent.replace(
                /\{\{ CREATE_LANGUAGE_SERVICES \}\}/g,
                createLanguageServicesNames,
            );
            templateContent = templateContent.replace(
                /\{\{ PRIMARY_LANGUAGE_SERVICE_HANDLE \}\}/g,
                `${languageNames[0]}Services`,
            );

            // get each language's services
            const languageServiceInstantiations: string[] = [];
            const serviceAttrs: string[] = structure.serviceDetails.createServicesAttributes ?? [];
            // for (const l of languageNames) {
            for (let x = 0; x < languageNames.length; x++) {
                const l = languageNames[x];
                // attempt to resolve the property for this language's service set (if we picked it up)

                let languageServiceSetProp: string | undefined;
                if (languageNames.length === 1) {
                    // it has to be the lone entry
                    languageServiceSetProp = serviceAttrs.at(0);
                } else {
                    // make a best attempt to pick one up a good match
                    languageServiceSetProp = getMatchingServiceProp(l, serviceAttrs);
                }
                // const languageServiceSetProp: string | undefined = getMatchingServiceProp(l, serviceAttrs);
                languageServiceInstantiations.push(
                    `const ${l}Services = ${createLanguageServicesNames}(EmptyFileSystem).${languageServiceSetProp ? languageServiceSetProp : l};`,
                );
            }

            // default to using the 1st language's services
            languageServiceInstantiations.push(
                `// default evaluator configured for ${languageNames[0]}`,
                `const evaluator = new LangiumEvaluator(${languageNames[0]}Services);`,
            );

            // place in our instantiations as well for however many languages we have
            templateContent = templateContent.replace(
                /\{\{ LANGUAGE_SERVICE_INSTANTIATIONS \}\}/g,
                languageServiceInstantiations.join('\n'),
            );
            // update service module path in template
            templateContent = templateContent.replace(/\{\{ SERVICES_MODULE_PATH \}\}/g, servicesModulePath);

            await writeFile(evalTargetPath, templateContent, 'utf-8');
        }

        evalsSpinner.success('Created evals/ directory with TypeScript evaluation files');
    } catch (err) {
        evalsSpinner.error('Failed to create evals directory');
        error(err instanceof Error ? err.message : String(err));
    }
}

/**
 * Full init flow: detect project, create config, install tools, and set up evals.
 */
export async function initCommand(options: InitOptions = {}): Promise<void> {
    const cwd = process.cwd();
    const yes = options.yes ?? false;

    // check if already initialized
    if (await configExists(cwd)) {
        warning('LAI is already initialized in this project (lai.config.jsonc exists)');
        const overwrite = yes || (await confirm('Reinitialize and overwrite existing configuration?'));

        if (!overwrite) {
            console.log('Initialization cancelled.');
            return;
        }
    }

    const structure = await detectAndDisplayStructure(cwd);
    if (!structure) {
        return;
    }

    // interactive configuration (defaults are used automatically in non-interactive mode)
    const projectName = getProjectName(structure);
    const projectNameInput = yes ? projectName : await text('Project name', projectName);

    if (!projectNameInput) {
        console.log('Initialization cancelled.');
        return;
    }

    const languageName = projectNameInput;

    // create config
    await initConfig(cwd, structure, languageName);

    // offer to install langium-ai-tools
    const pm = await detectPackageManager(cwd);
    const installTools = yes || (await confirm(`Install the latest langium-ai-tools? (using ${pm})`, true));

    if (installTools) {
        const installCmd = pm === 'pnpm' ? 'pnpm add langium-ai-tools@latest' : 'npm install langium-ai-tools@latest';
        const installSpinner = spinner(`Running ${installCmd}...`);
        try {
            execSync(installCmd, { cwd, stdio: 'pipe' });
            installSpinner.success('Installed langium-ai-tools');
        } catch (_err) {
            installSpinner.error('Failed to install langium-ai-tools');
            warning(`You can install it manually: ${installCmd}`);
        }
    }

    // set up evals
    await initEvals(cwd, structure, yes);

    // summary
    console.log();
    success('LAI initialized successfully!');
    console.log();
    console.log('Next steps:');
    console.log('  1. Run `lai gen descriptor` to create a language descriptor');
    console.log('  2. Run `lai gen sysprompt` to synthesize a system prompt');
    console.log('  3. Run `lai evaluate` to test your prompt');
    console.log();
}

/**
 * Reinitialize just the config file (lai.config.jsonc).
 */
export async function initConfigCommand(options: InitOptions = {}): Promise<void> {
    const cwd = process.cwd();
    const yes = options.yes ?? false;

    if (await configExists(cwd)) {
        warning('lai.config.jsonc already exists');
        const overwrite = yes || (await confirm('Overwrite existing configuration?'));
        if (!overwrite) {
            console.log('Config initialization cancelled.');
            return;
        }
    }

    const structure = await detectAndDisplayStructure(cwd);
    if (!structure) {
        return;
    }

    const projectName = getProjectName(structure);
    const projectNameInput = yes ? projectName : await text('Project name', projectName);

    if (!projectNameInput) {
        console.log('Config initialization cancelled.');
        return;
    }

    await initConfig(cwd, structure, projectNameInput);
    console.log();
    success('Config reinitialized successfully!');
}

/**
 * Reinitialize just the evals directory and template files.
 */
export async function initEvalsCommand(options: InitOptions = {}): Promise<void> {
    const cwd = process.cwd();
    const yes = options.yes ?? false;

    // require existing config so we can detect the project structure
    if (!(await configExists(cwd))) {
        error('lai.config.jsonc not found. Run `lai init` first.');
        return;
    }

    const structure = await detectAndDisplayStructure(cwd);
    if (!structure) {
        return;
    }

    await initEvals(cwd, structure, yes);

    console.log();
    success('Evals reinitialized successfully!');
}

/**
 * Returns the most likely matching service set props as a fuzzy, case-insensitive match
 * to the given language name.
 * This allows us to try and pair up a language name with it's likely attribute from the create*Services
 * function.
 */
export function getMatchingServiceProp(l: string, props: string[]): string | undefined {
    const patt = new RegExp(`.*${l}.*`, 'i');
    const result = props.find((p) => p.match(patt));
    return result;
}
