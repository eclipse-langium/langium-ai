import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { detectLangiumProject, getProjectName, getLanguageName } from '../core/langium-detector.js';
import { saveConfig, configExists } from '../core/config.js';
import { pathExists, makeRelative, detectPackageManager } from '../utils/fs.js';
import { confirm, text } from '../utils/prompt.js';
import { header, section, success, error, warning, logDetected, spinner } from '../utils/console.js';
import type { LaiConfig } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function initCommand(): Promise<void> {
    header('🔍 Detecting Langium project...');

    const cwd = process.cwd();

    // check if already initialized
    if (await configExists(cwd)) {
        warning('LAI is already initialized in this project (lai.config.jsonc exists)');
        const overwrite = await confirm('Reinitialize and overwrite existing configuration?');

        if (!overwrite) {
            console.log('Initialization cancelled.');
            return;
        }
    }

    // detect project structure
    const detectSpinner = spinner('Scanning project structure...');
    let structure;
    try {
        structure = await detectLangiumProject(cwd);
        detectSpinner.succeed('Project structure detected');
    } catch (err) {
        detectSpinner.fail('Failed to detect project structure');
        error(err instanceof Error ? err.message : String(err));
        return;
    }

    // validate required files
    if (!structure.grammar) {
        error('No Langium grammar file (*.langium) found in project');
        return;
    }

    const projectName = getProjectName(structure);

    // display detected structure
    console.log();
    section('Core Files');
    logDetected('Grammar', makeRelative(cwd, structure.grammar), true);
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

    // interactive configuration
    const projectNameInput = await text('Project name', projectName);

    // handle cancellation
    if (!projectNameInput) {
        console.log('Initialization cancelled.');
        return;
    }

    const languageName = projectNameInput;

    // create config
    const config: LaiConfig = {
        version: '1.0',
        langium: {
            configPath: structure.langiumConfig ? makeRelative(cwd, structure.langiumConfig) : './langium-config.json',
            grammarPath: makeRelative(cwd, structure.grammar),
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

    // save config
    const saveSpinner = spinner('Creating lai.config.jsonc...');
    try {
        await saveConfig(config, cwd);
        saveSpinner.succeed('Created lai.configc.json');
    } catch (err) {
        saveSpinner.fail('Failed to create config');
        error(err instanceof Error ? err.message : String(err));
        return;
    }

    // offer to install langium-ai-tools
    const pm = await detectPackageManager(cwd);
    const installTools = await confirm(`Install the latest langium-ai-tools? (using ${pm})`, true);

    if (installTools) {
        const installCmd = pm === 'pnpm' ? 'pnpm add langium-ai-tools@latest' : 'npm install langium-ai-tools@latest';
        const installSpinner = spinner(`Running ${installCmd}...`);
        try {
            execSync(installCmd, { cwd, stdio: 'pipe' });
            installSpinner.succeed('Installed langium-ai-tools');
        } catch (_err) {
            installSpinner.fail('Failed to install langium-ai-tools');
            warning(`You can install it manually: ${installCmd}`);
        }
    }

    // create evals directory with TypeScript evaluation files
    const evalsSpinner = spinner('Setting up evaluations...');
    try {
        const evalsDir = path.join(cwd, 'evals');
        await mkdir(evalsDir, { recursive: true });

        // copy utils.ts template
        const utilsTemplatePath = path.join(__dirname, '..', 'templates', 'utils.ts');
        const utilsTargetPath = path.join(evalsDir, 'utils.ts');
        if (await pathExists(utilsTemplatePath)) {
            await copyFile(utilsTemplatePath, utilsTargetPath);
        }

        // check if basic.eval.ts already exists
        const evalTargetPath = path.join(evalsDir, 'basic.eval.ts');
        let shouldCopyEvalFile = true;

        if (await pathExists(evalTargetPath)) {
            evalsSpinner.stop();
            shouldCopyEvalFile = await confirm('basic.eval.ts already exists. Overwrite?');
            evalsSpinner.start('Setting up evaluations...');
        }

        // copy and process basic.eval.ts template with placeholder substitution
        if (shouldCopyEvalFile) {
            const evalTemplatePath = path.join(__dirname, '..', 'templates', 'basic.eval.ts');
            if (await pathExists(evalTemplatePath)) {
                // read template
                let templateContent = await readFile(evalTemplatePath, 'utf-8');

                // extract language name for services
                const languageName = getLanguageName(structure);

                // determine services module path
                const servicesModulePath = structure.services.module
                    ? makeRelative(evalsDir, structure.services.module).replace(/\.ts$/, '.js')
                    : '../src/language/main.js'; // fallback path

                // replace placeholders
                templateContent = templateContent
                    .replace(/\{\{ CREATE_LANGUAGE_SERVICES \}\}/g, `create${languageName}Services`)
                    .replace(/\{\{ LANGUAGE_SERVICES \}\}/g, languageName)
                    .replace(/\{\{ SERVICES_MODULE_PATH \}\}/g, servicesModulePath);

                // write processed template
                await writeFile(evalTargetPath, templateContent, 'utf-8');
            }
        }

        evalsSpinner.succeed('Created evals/ directory with TypeScript evaluation files');
    } catch (err) {
        evalsSpinner.fail('Failed to create evals directory');
        error(err instanceof Error ? err.message : String(err));
    }

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
