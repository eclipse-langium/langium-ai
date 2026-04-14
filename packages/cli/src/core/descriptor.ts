import fs from 'fs-extra';
import path from 'path';
import YAML from 'yaml';
import type { Descriptor, LangiumProjectStructure, LaiConfig, Services } from '../types.js';
import { makeRelative } from '../utils/fs.js';
import { validateDescriptor, formatValidationErrors } from './descriptor-schema.js';
import { readFileSync } from 'fs';

// descriptor generation and management

/**
 * Generate a language descriptor for the target language
 */
export async function generateDescriptor(
    config: LaiConfig,
    structure: LangiumProjectStructure,
    _options: { fresh?: boolean } = {},
): Promise<Descriptor> {
    const cwd = process.cwd();

    // read example files if present
    let examplesContent: Array<{ name: string; content: string }> = [];
    if (structure.examples) {
        const exampleFiles = await fs.readdir(structure.examples);
        // read up to 3 example files (sorted for deterministic ordering)
        const exampleFilesToRead = exampleFiles.sort().slice(0, 3);

        examplesContent = await Promise.all(
            exampleFilesToRead.map(async (file) => ({
                name: file,
                content: await fs.readFile(path.join(structure.examples!, file), 'utf-8'),
            })),
        );
    }

    // generate deterministic description based on project structure
    const description = generateDescription(config.project.name, structure);

    let version = '0.0.0';
    const packageJSON = structure.packageJson;
    if (packageJSON) {
        try {
            const content = JSON.parse(readFileSync(packageJSON, { encoding: 'utf8' }));
            version = content.version;
        } catch (_e) {
            console.error('Error while reading version from package.json');
        }
    }

    const descriptor: Descriptor = {
        builtins: undefined,
        name: config.project.name,
        version: version ?? '0.0.0',
        description,
        langium_config: structure.langiumConfig ? makeRelative(cwd, structure.langiumConfig) : './langium-config.json',
        case_sensitive: true,
        grammar: makeRelative(cwd, structure.grammar!),

        // services section — relativize all detected service paths
        services: mapServicesToRelative(cwd, structure.services),

        tests: structure.tests.length > 0 ? structure.tests.map((t) => makeRelative(cwd, t)) : undefined,

        // create examples deterministically from files
        examples: createDefaultExamples(structure, examplesContent),

        // create documentation deterministically
        documentation: createDefaultDocumentation(structure),
    };

    // validate the descriptor against the schema
    const validation = validateDescriptor(descriptor);
    if (!validation.valid) {
        const errorMessage = formatValidationErrors(validation.errors);
        throw new Error(`Generated descriptor is invalid:\n\n${errorMessage}`);
    }

    return descriptor;
}

export async function saveDescriptor(descriptorPath: string, descriptor: Descriptor): Promise<string> {
    const cwd = process.cwd();
    const fullPath = path.join(cwd, descriptorPath);

    // write descriptor as YAML
    const yamlContent = YAML.stringify(descriptor, {
        indent: 2,
        lineWidth: 0, // disable line wrapping
    });

    await fs.writeFile(fullPath, yamlContent, 'utf-8');
    return fullPath;
}

/**
 * converts detected absolute service paths to relative paths for the descriptor
 */
function mapServicesToRelative(cwd: string, services: Services): Services {
    const result: Services = {};
    for (const [key, value] of Object.entries(services)) {
        if (value) {
            (result as Record<string, string | undefined>)[key] = makeRelative(cwd, value);
        }
    }
    return result;
}

/**
 * generates a deterministic description based on project structure
 */
function generateDescription(projectName: string, structure: LangiumProjectStructure): string {
    // build description based on available features
    const features: string[] = [];

    if (structure.services.validator || structure.services.validation_registry) {
        features.push('custom validation');
    }
    if (structure.services.scope_provider || structure.services.scope_computation) {
        features.push('scoping');
    }
    if (structure.services.linker) {
        features.push('linking');
    }
    if (structure.services.type_provider || structure.services.type_hierarchy_provider) {
        features.push('type system');
    }
    if (structure.services.comment_provider || structure.services.documentation_provider) {
        features.push('documentation');
    }
    if (structure.services.hover_provider || structure.services.completion_provider) {
        features.push('IDE support');
    }
    if (structure.services.formatter) {
        features.push('formatting');
    }
    if (structure.services.code_action_provider) {
        features.push('code actions');
    }
    if (structure.services.rename_provider) {
        features.push('renaming');
    }
    if (structure.services.semantic_token_provider) {
        features.push('semantic highlighting');
    }

    const baseDescription = `A domain-specific language built with Langium`;

    if (features.length === 0) {
        return baseDescription;
    }

    return `${baseDescription} with ${features.join(', ')}`;
}

function createDefaultExamples(
    structure: LangiumProjectStructure,
    exampleFiles: Array<{ name: string; content: string }>,
) {
    if (!structure.examples || exampleFiles.length === 0) {
        return [];
    }

    const cwd = process.cwd();
    return exampleFiles.map((ex, idx) => ({
        name: `Example ${idx + 1}`,
        description: `An example of one or more language features.`,
        file: makeRelative(cwd, path.join(structure.examples!, ex.name)),
        tags: ['example'],
    }));
}

function createDefaultDocumentation(structure: LangiumProjectStructure) {
    const cwd = process.cwd();
    const docs = [];

    // check for README
    const readmePath = path.join(structure.root, 'README.md');
    if (fs.existsSync(readmePath)) {
        docs.push({
            src: makeRelative(cwd, readmePath),
            description: 'Project README',
            priority: 'high' as const,
        });
    }

    return docs;
}
