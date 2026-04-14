import prompts from 'prompts';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { loadConfig } from '../core/config.js';
import { detectLangiumProject, getLanguageName } from '../core/langium-detector.js';
import { generateDescriptor, saveDescriptor } from '../core/descriptor.js';
import { loadDescriptor, generateSystemPrompt, saveSystemPrompt } from '../core/sysprompt.js';
import { error, success, info, spinner } from '../utils/console.js';
import { makeRelative } from '../utils/fs.js';
import { LaiConfig, LangiumProjectStructure } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface GenerateOptions {
    fresh?: boolean;
}

export async function generateCommand(type: string, options: GenerateOptions): Promise<void> {
    let config;
    try {
        config = await loadConfig();
    } catch (err) {
        error(err instanceof Error ? err.message : String(err));
        return;
    }

    if (type === 'descriptor') {
        await generateDescriptorCommand(config, options);
    } else if (type === 'sysprompt') {
        await generateSysPromptCommand(config, options);
        // TODO @montymxb Apr 1st, 2026: mcp setup isn't quite ready yet, TBD
        // } else if (type === 'mcp') {
        //     await generateMcpCommand(config, options);
        // }
    } else {
        error(`Unknown generation type: ${type}`);
        console.log('Valid types: descriptor, sysprompt, mcp');
    }
}

/**
 * Generates a new language descriptor
 */
async function generateDescriptorCommand(config: LaiConfig, options: GenerateOptions): Promise<void> {
    const cwd = process.cwd();
    const descriptorPath = path.join(cwd, config.descriptor.path);

    // check if descriptor exists and handle overwrite/versioning
    if ((await fs.pathExists(descriptorPath)) && !options.fresh) {
        const { overwrite } = await prompts({
            type: 'confirm',
            name: 'overwrite',
            message: `Descriptor already exists at ${config.descriptor.path}. Overwrite?`,
            initial: false,
        });

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
        detectSpinner.succeed('Project structure detected');
    } catch (err) {
        detectSpinner.fail('Failed to detect project structure');
        error(err instanceof Error ? err.message : String(err));
        return;
    }

    if (!structure.grammar) {
        error('No Langium grammar file found');
        return;
    }

    // generate descriptor using LLM
    const genSpinner = spinner('Generating language descriptor...');
    const descriptor = await generateDescriptor(config, structure, options);
    genSpinner.succeed('Descriptor generated');

    // save descriptor
    const saveSpinner = spinner('Saving descriptor...');
    try {
        await saveDescriptor(config.descriptor.path, descriptor);
        saveSpinner.succeed(`Descriptor saved to ${config.descriptor.path}`);
    } catch (err) {
        saveSpinner.fail('Failed to save descriptor');
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
    if (!(await fs.pathExists(descriptorPath))) {
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
    if ((await fs.pathExists(fullSyspromptPath)) && !options.fresh) {
        const { overwrite } = await prompts({
            type: 'confirm',
            name: 'overwrite',
            message: `System prompt already exists at ${syspromptPath}. Overwrite?`,
            initial: false,
        });

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
        loadSpinner.succeed('Descriptor loaded');
    } catch (err) {
        loadSpinner.fail('Failed to load descriptor');
        error(err instanceof Error ? err.message : String(err));
        return;
    }

    // generate system prompt
    const genSpinner = spinner(`Generating system prompt...`);
    let sysprompt;
    try {
        sysprompt = await generateSystemPrompt(descriptor);
        genSpinner.succeed('System prompt generated');
    } catch (err) {
        genSpinner.fail('Failed to generate system prompt');
        error(err instanceof Error ? err.message : String(err));
        return;
    }

    // save system prompt
    const saveSpinner = spinner('Saving system prompt...');
    try {
        await saveSystemPrompt(syspromptPath, sysprompt);
        saveSpinner.succeed(`System prompt saved to ${syspromptPath}`);
    } catch (err) {
        saveSpinner.fail('Failed to save system prompt');
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

/**
 * Generates an MCP server for the project's DSL
 */
// oxlint-disable-next-line no-unused-vars
async function generateMcpCommand(config: LaiConfig, _options: GenerateOptions): Promise<void> {
    const cwd = process.cwd();

    // detect project structure to resolve services module and language name
    const detectSpinner = spinner('Detecting project structure...');
    let structure: LangiumProjectStructure;
    try {
        structure = await detectLangiumProject(cwd);
        detectSpinner.succeed('Project structure detected');
    } catch (err) {
        detectSpinner.fail('Failed to detect project structure');
        error(err instanceof Error ? err.message : String(err));
        return;
    }

    if (!structure.services.module) {
        error('No Langium services module found. A module file is required to generate an MCP server.');
        return;
    }

    const languageName = getLanguageName(structure);
    const mcpDir = path.join(cwd, 'mcp');
    const targetPath = path.join(mcpDir, 'mcp-server.ts');

    // check if mcp-server.ts already exists
    if (await fs.pathExists(targetPath)) {
        const { overwrite } = await prompts({
            type: 'confirm',
            name: 'overwrite',
            message: 'mcp/mcp-server.ts already exists. Overwrite?',
            initial: false,
        });

        if (!overwrite) {
            console.log('MCP server generation cancelled.');
            return;
        }
    }

    // load and process the template
    const genSpinner = spinner('Generating MCP server...');
    try {
        const templatePath = path.join(__dirname, '..', 'templates', 'mcp-server.ts');
        if (!(await fs.pathExists(templatePath))) {
            genSpinner.fail('MCP server template not found');
            error('Could not locate the bundled mcp-server.ts template.');
            return;
        }

        let templateContent = await fs.readFile(templatePath, 'utf-8');

        // resolve the services module path relative to the mcp/ output directory
        const servicesModulePath = makeRelative(mcpDir, structure.services.module).replace(/\.ts$/, '.js');

        // derive naming from the project
        const projectName = config.project.name;
        const toolPrefix = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const serverName = `${projectName}-mcp-server`;

        // replace placeholders
        templateContent = templateContent
            .replace(/\{\{ CREATE_LANGUAGE_SERVICES \}\}/g, `create${languageName}Services`)
            .replace(/\{\{ LANGUAGE_SERVICES \}\}/g, languageName)
            .replace(/\{\{ SERVICES_MODULE_PATH \}\}/g, servicesModulePath)
            .replace(/\{\{ SERVER_NAME \}\}/g, serverName)
            .replace(/\{\{ TOOL_PREFIX \}\}/g, toolPrefix)
            .replace(/\{\{ DISPLAY_NAME \}\}/g, projectName);

        // write the output
        await fs.ensureDir(mcpDir);
        await fs.writeFile(targetPath, templateContent, 'utf-8');
        genSpinner.succeed('MCP server generated');
    } catch (err) {
        genSpinner.fail('Failed to generate MCP server');
        error(err instanceof Error ? err.message : String(err));
        return;
    }

    console.log();
    success('✨ MCP server generation complete!');
    console.log();
    console.log('Generated files:');
    console.log('  mcp/mcp-server.ts');
    console.log();
    info('Required dependencies:');
    console.log('  npm install @modelcontextprotocol/sdk langium-ai-tools langium zod');
    console.log();
    console.log('To run the server:');
    console.log('  npx tsx mcp/mcp-server.ts');
    console.log();
}
