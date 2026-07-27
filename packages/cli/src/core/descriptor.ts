import { existsSync } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'path';
import YAML from 'yaml';
import type {
    LaiConfig,
    LaiConfigLanguage,
    LangiumProjectStructure,
    LanguageDescriptor,
    ProjectDescriptor,
    Services,
} from '../types.js';
import { makeRelative } from '../utils/fs.js';
import { formatValidationErrors, validateDescriptor } from './descriptor-schema.js';

// injected at compile-time to match the current CLI version
declare const __CLI_VERSION__: string;

/**
 * Generate a language descriptor for the target language
 */
export async function generateDescriptor(
    config: LaiConfig,
    structure: LangiumProjectStructure,
    _options: { fresh?: boolean } = {},
): Promise<ProjectDescriptor> {
    const cwd = process.cwd();

    // read example files if present
    let examplesContent: Array<{ name: string; content: string }> = [];
    if (structure.examples) {
        const exampleFiles = await readdir(structure.examples);
        // read up to 3 example files (sorted for deterministic ordering)
        const exampleFilesToRead = exampleFiles.sort().slice(0, 3);

        examplesContent = await Promise.all(
            exampleFilesToRead.map(async (file) => ({
                name: file,
                content: await readFile(path.join(structure.examples!, file), 'utf-8'),
            })),
        );
    }

    const languages: LaiConfigLanguage[] = config.langium.languages ?? [];

    // craft a descriptor for the project
    const projectDescriptor: ProjectDescriptor = {
        version: __CLI_VERSION__,
        languages: languages.map((l) => {
            const ld: LanguageDescriptor = {
                name: l.id,
                description: `${l.id}: A domain-specific language built with Langium`,
                caseInsensitive: l.caseInsensitive,
                grammar: l.grammarPath,
            };
            return ld;
        }),
        langium_config: structure.langiumConfig ? makeRelative(cwd, structure.langiumConfig) : './langium-config.json',
        // grammar: makeRelative(cwd, structure.grammar!),

        // service details for this project
        serviceDetails: structure.serviceDetails,

        // services section — relativize all detected service paths
        services: mapServicesToRelative(cwd, structure.services),

        tests: structure.tests.length > 0 ? structure.tests.map((t) => makeRelative(cwd, t)) : undefined,

        // create examples deterministically from files
        examples: createDefaultExamples(structure, examplesContent),

        builtins: undefined,

        // create documentation deterministically
        documentation: createDefaultDocumentation(structure),
    };

    // validate the descriptor against the schema
    const validation = validateDescriptor(projectDescriptor);
    if (!validation.valid) {
        const errorMessage = formatValidationErrors(validation.errors);
        throw new Error(`Generated descriptor is invalid:\n\n${errorMessage}`);
    }

    return projectDescriptor;
}

export async function saveDescriptor(descriptorPath: string, descriptor: ProjectDescriptor): Promise<string> {
    const cwd = process.cwd();
    const fullPath = path.join(cwd, descriptorPath);

    // write descriptor as YAML
    const yamlContent = YAML.stringify(descriptor, {
        indent: 2,
        lineWidth: 0, // disable line wrapping
    });

    await writeFile(fullPath, yamlContent, 'utf-8');
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
    if (existsSync(readmePath)) {
        docs.push({
            src: makeRelative(cwd, readmePath),
            description: 'Project README',
            priority: 'high' as const,
        });
    }

    return docs;
}
