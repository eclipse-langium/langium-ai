import path from 'path';
import { loadConfig } from '../core/config.js';
import { generateDescriptor, saveDescriptor } from '../core/descriptor.js';
import { detectLangiumProject } from '../core/langium-detector.js';
import { generateSystemPrompt, loadDescriptor, saveSystemPrompt } from '../core/sysprompt.js';
import { LaiConfig, LangiumProjectStructure } from '../types.js';
import { error, spinner, success } from '../utils/console.js';
import { pathExists } from '../utils/fs.js';
import { confirm } from '../utils/prompt.js';

interface GenerateOptions {
    fresh?: boolean;
}

export async function generateCommand(type: string, options: GenerateOptions): Promise<void> {
    const config = await loadConfig();

    if (type === 'descriptor') {
        await generateDescriptorCommand(config, options);
    } else if (type === 'sysprompt') {
        await generateSysPromptCommand(config, options);
    } else {
        error(`Unknown generation type: ${type}`);
        console.log('Valid types: descriptor, sysprompt, mcp');
    }
}

/**
 * Generates a new language descriptor
 *
 * @throws An error on failed Langium project detection
 */
async function generateDescriptorCommand(config: LaiConfig, options: GenerateOptions): Promise<void> {
    const cwd = process.cwd();
    const descriptorPath = path.join(cwd, config.descriptor.path);

    // check if descriptor exists and handle overwrite/versioning
    if ((await pathExists(descriptorPath)) && !options.fresh) {
        const overwrite = await confirm(`Descriptor already exists at ${config.descriptor.path}. Overwrite?`);

        if (!overwrite) {
            console.log('Descriptor generation cancelled.');
            return;
        }
    }

    // detect project structure
    const detectSpinner = spinner('Detecting project structure...');
    let structure: LangiumProjectStructure;
    try {
        structure = await detectLangiumProject(cwd);
        detectSpinner.success('Project structure detected');
    } catch (err) {
        detectSpinner.error('Failed to detect project structure');
        error(err instanceof Error ? err.message : String(err));
        throw err;
    }

    if (!structure.languages || structure.languages.length === 0) {
        error('No Langium languages found');
        return;
    }

    // generate descriptor using LLM
    const genSpinner = spinner('Generating language descriptor...');
    const descriptor = await generateDescriptor(config, structure, options).catch((e) => {
        genSpinner.stop();
        throw e;
    });
    genSpinner.success('Descriptor generated');

    // save descriptor
    const saveSpinner = spinner('Saving descriptor...');
    try {
        await saveDescriptor(config.descriptor.path, descriptor);
        saveSpinner.success(`Descriptor saved to ${config.descriptor.path}`);
    } catch (err) {
        saveSpinner.error('Failed to save descriptor');
        error(err instanceof Error ? err.message : String(err));
        return;
    }

    console.log();
    success('✨ Descriptor generation complete!');
    console.log();
    console.log('Next steps:');
    console.log(`  1. Review ${config.descriptor.path}`);
    console.log('  2. Run `lai gen sysprompt` to generate a system prompt');
    console.log();
}

/**
 * Command handler for generating a default system prompt, using an existing language descriptor
 */
async function generateSysPromptCommand(config: LaiConfig, options: GenerateOptions): Promise<void> {
    const cwd = process.cwd();
    const descriptorPath = path.join(cwd, config.descriptor.path);

    // check if descriptor exists
    if (!(await pathExists(descriptorPath))) {
        error(`Descriptor not found at ${config.descriptor.path}`);
        console.log('Run `lai gen descriptor` first to create a descriptor.');
        return;
    }

    // confirm before proceeding - warn about LLM usage
    console.log();
    console.log('This command will generate a baseline system prompt from your descriptor.');
    console.log();

    const syspromptPath = config.sysprompt.path;
    const fullSyspromptPath = path.join(cwd, syspromptPath);

    // check if sysprompt exists and handle overwrite
    if ((await pathExists(fullSyspromptPath)) && !options.fresh) {
        const overwrite = await confirm(`System prompt already exists at ${syspromptPath}. Overwrite?`);

        if (!overwrite) {
            console.log('System prompt generation cancelled.');
            return;
        }
    }

    // load descriptor
    const loadSpinner = spinner('Loading descriptor...');
    let descriptor;
    try {
        descriptor = await loadDescriptor(descriptorPath);
        loadSpinner.success('Descriptor loaded');
    } catch (err) {
        loadSpinner.error('Failed to load descriptor');
        error(err instanceof Error ? err.message : String(err));
        return;
    }

    // generate system prompt
    const genSpinner = spinner(`Generating system prompt...`);
    let sysprompt;
    try {
        sysprompt = await generateSystemPrompt(descriptor);
        genSpinner.success('System prompt generated');
    } catch (err) {
        genSpinner.error('Failed to generate system prompt');
        error(err instanceof Error ? err.message : String(err));
        return;
    }

    // save system prompt
    const saveSpinner = spinner('Saving system prompt...');
    try {
        await saveSystemPrompt(syspromptPath, sysprompt);
        saveSpinner.success(`System prompt saved to ${syspromptPath}`);
    } catch (err) {
        saveSpinner.error('Failed to save system prompt');
        error(err instanceof Error ? err.message : String(err));
        return;
    }

    console.log();
    success('✨ System prompt generation complete!');
    console.log();
    console.log('Next steps:');
    console.log(`  1. Review ${syspromptPath}`);
    console.log('  2. Run `lai evaluate` to test your prompt');
    console.log();
}
