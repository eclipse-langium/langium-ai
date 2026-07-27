import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import type { ProjectDescriptor } from '../types.js';
import { pathExists } from '../utils/fs.js';

// system prompt generation from descriptor templates

export async function loadDescriptor(descriptorPath: string): Promise<ProjectDescriptor> {
    const content = await readFile(descriptorPath, 'utf-8');
    return YAML.parse(content);
}

/**
 * Generate a suitable default system prompt from our language descriptor
 */
export async function generateSystemPrompt(descriptor: ProjectDescriptor): Promise<string> {
    const cwd = process.cwd();

    // load all referenced content from descriptor
    const content = await loadContent(descriptor, cwd);

    // process template sections
    const processedPrompt = processContent(content, descriptor);

    return processedPrompt;
}

/**
 * Takes a list of items and prints out an 'X, Y, and Z' style string
 */
function prettyPrintArray(items: string[]): string {
    const parts: string[] = [];
    for (let x = items.length - 1; x >= 0; x--) {
        if (x === items.length - 1 && x > 0) {
            // insert ', and' before
            parts.unshift(`and ${items[x]}`);
        } else {
            parts.unshift(items[x]);
        }
    }
    return parts.join(', ');
}

/**
 * Prepares template content
 */
async function loadContent(descriptor: ProjectDescriptor, cwd: string): Promise<Array<[string, string]>> {
    const content: Array<[string, string]> = [];

    const languageNames: string[] = descriptor.languages.map((l) => l.name);
    const joinedNames = prettyPrintArray(descriptor.languages.map((l) => l.name));

    // introduction
    content.push([
        'Introduction',
        [
            `You are an AI assistant for working with the ${joinedNames} domain-specific language${languageNames.length > 1 ? 's' : ''}.`,
            'You can both explain existing DSL programs and write new ones.',
        ].join('\n'),
    ]);

    // grammars for each language
    for (const l of descriptor.languages) {
        const grammar = l.grammar;
        const grammarPath = path.join(cwd, grammar);
        if (await pathExists(grammarPath)) {
            const grammarContent = await readFile(grammarPath, 'utf-8');
            content.push([
                `Grammar for ${l.name}`,
                `The language grammar is defined as follows:\n\n\`\`\`langium\n${grammarContent}\n\`\`\``,
            ]);
        }
    }

    // built-in library definitions
    if (descriptor.builtins) {
        for (let x = 0; x < descriptor.builtins.length; x++) {
            const builtin: string = descriptor.builtins[x];
            const builtinsPath = path.join(cwd, builtin);
            if (await pathExists(builtinsPath)) {
                const builtinsContent = await readFile(builtinsPath, 'utf-8');

                let message: string;
                if (descriptor.languages.length > 1) {
                    // multi-language
                    message = `The following built-ins are available for their respective language in this project. \n\n\`\`\`\n${builtinsContent}\n\`\`\``;
                } else {
                    // single language
                    message = `The following built-ins are available by default in ${descriptor.languages[0].name}. These are always in scope and do not need to be imported or defined by the user.\n\n\`\`\`\n${builtinsContent}\n\`\`\``;
                }

                content.push([`Built-in Library${descriptor.builtins.length > 1 ? ` ${x + 1}` : ''}`, message]);
            }
        }
    }

    // validation rules (conditional on validator service)
    if (descriptor.services?.validator) {
        const validatorPath = path.join(cwd, descriptor.services.validator);
        if (await pathExists(validatorPath)) {
            const validatorContent = await readFile(validatorPath, 'utf-8');
            content.push([
                'Validation Rules',
                `Semantic validation rules:\n\n\`\`\`typescript\n${validatorContent}\n\`\`\``,
            ]);
        }
    }

    // take first 3 examples
    if (descriptor.examples && descriptor.examples.length > 0) {
        const examplesToLoad = descriptor.examples.slice(0, 3);
        const exampleContents = await Promise.all(
            examplesToLoad.map(async (ex) => {
                const examplePath = path.join(cwd, ex.file);
                let code = '';
                if (await pathExists(examplePath)) {
                    code = await readFile(examplePath, 'utf-8');
                }
                return `#### ${ex.name}\n${ex.description}\n${ex.tags ? `Tags: ${ex.tags.join(', ')}` : ''}\n\n\`\`\`\n${code}\n\`\`\``;
            }),
        );
        content.push(['Examples', `Example programs:\n\n${exampleContents.join('\n\n')}`]);
    }

    // inline documentation (first 2)
    if (descriptor.documentation && descriptor.documentation.length > 0) {
        const docsToLoad = descriptor.documentation.slice(0, 2);
        const docContents = docsToLoad.map((doc) => {
            if (doc.src.startsWith('http://') || doc.src.startsWith('https://')) {
                return `- [${doc.description}](${doc.src})`;
            } else {
                return `- ${doc.description}: ${doc.src}`;
            }
        });

        let name: string;
        if (descriptor.languages.length > 1) {
            name = `for this project's languages`;
        } else {
            name = `for ${descriptor.languages[0].name}`;
        }

        content.push([
            'Documentation',
            `Here's documentation ${name}, relevant for understanding what it is and how to work with it.\n\n${docContents.join('\n')}`,
        ]);
    }

    // capabilities
    content.push([
        'Capabilities',
        [
            `When working with ${prettyPrintArray(descriptor.languages.map((l) => l.name))}:`,
            '- Explain the meaning and behavior of existing programs',
            '- Write new programs that follow the grammar and validation rules',
            '- Help users understand language features and best practices',
            '- Debug and fix issues in DSL code',
        ].join('\n'),
    ]);

    return content;
}

/**
 * Processes content into a system prompt
 */
function processContent(content: Array<[string, string]>, descriptor: ProjectDescriptor): string {
    const sections = content
        .map(([name, content]) => {
            return `### ${name}\n\n${content}`;
        })
        .join('\n\n');
    const names = prettyPrintArray(descriptor.languages.map((l) => l.name));
    const header = `# ${names} Language System Prompt\n\n`;
    return header + '\n' + sections;
}

export async function saveSystemPrompt(syspromptPath: string, content: string): Promise<string> {
    const cwd = process.cwd();
    const fullPath = path.join(cwd, syspromptPath);

    // write sysprompt as markdown
    await writeFile(fullPath, content, 'utf-8');
    return fullPath;
}
