import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import type { Descriptor } from '../types.js';
import { pathExists } from '../utils/fs.js';

// system prompt generation from descriptor templates

export async function loadDescriptor(descriptorPath: string): Promise<Descriptor> {
    const content = await readFile(descriptorPath, 'utf-8');
    return YAML.parse(content);
}

/**
 * Generate a suitable default system prompt from our language descriptor
 */
export async function generateSystemPrompt(descriptor: Descriptor): Promise<string> {
    const cwd = process.cwd();

    // load all referenced content from descriptor
    const content = await loadContent(descriptor, cwd);

    // process template sections
    const processedPrompt = processContent(content, descriptor);

    return processedPrompt;
}

/**
 * Prepares template content
 */
async function loadContent(descriptor: Descriptor, cwd: string): Promise<Array<[string, string]>> {
    const content: Array<[string, string]> = [];

    // introduction
    content.push([
        'Introduction',
        [
            `You are an expert AI assistant for the ${descriptor.name} domain-specific language.`,
            'You can both explain existing DSL programs and write new ones.',
            descriptor.description,
        ].join('\n'),
    ]);

    // grammar
    if (descriptor.grammar) {
        const grammarPath = path.join(cwd, descriptor.grammar);
        if (await pathExists(grammarPath)) {
            const grammarContent = await readFile(grammarPath, 'utf-8');
            content.push([
                'Grammar',
                `The language grammar is defined as follows:\n\n\`\`\`langium\n${grammarContent}\n\`\`\``,
            ]);
        }
    }

    // built-in library definitions
    if (descriptor.builtins) {
        const builtinsPath = path.join(cwd, descriptor.builtins);
        if (await pathExists(builtinsPath)) {
            const builtinsContent = await readFile(builtinsPath, 'utf-8');
            content.push([
                'Built-in Library',
                `The following built-in types and functions are available by default in ${descriptor.name}. These are always in scope and do not need to be imported or defined by the user.\n\n\`\`\`\n${builtinsContent}\n\`\`\``,
            ]);
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
        content.push(['Examples', `Example ${descriptor.name} programs:\n\n${exampleContents.join('\n\n')}`]);
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
        content.push([
            'Documentation',
            `Here's documentation on ${descriptor.name}, relevant for understanding what it is and how to work with it.\n\n${docContents.join('\n')}`,
        ]);
    }

    // capabilities
    content.push([
        'Capabilities',
        [
            `When working with ${descriptor.name}:`,
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
function processContent(content: Array<[string, string]>, descriptor: Descriptor): string {
    const sections = content
        .map(([name, content]) => {
            return `### ${name}\n\n${content}`;
        })
        .join('\n\n');
    const header = `# ${descriptor.name} Language System Prompt v${descriptor.version}\n\n`;
    return header + '\n' + sections;
}

export async function saveSystemPrompt(syspromptPath: string, content: string): Promise<string> {
    const cwd = process.cwd();
    const fullPath = path.join(cwd, syspromptPath);

    // write sysprompt as markdown
    await writeFile(fullPath, content, 'utf-8');
    return fullPath;
}
