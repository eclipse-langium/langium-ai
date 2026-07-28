import { existsSync, statSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
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

    // read up to 3 reasonably sized examples
    const pickedExamples: Array<{ name: string; content: string }> = [];
    const exampleDir: string | undefined = structure.exampleDir;
    if (exampleDir !== undefined) {
        // collect all valid extensions
        const fileExtensions: string[] = structure.languages.flatMap((l) => l.fileExtensions);
        let checkedCount = 0;

        // pick a few reasonably sized examples to show in the descriptor
        const exampleFiles = await readdir(exampleDir, { recursive: true });
        for (const file of exampleFiles) {
            checkedCount++;

            if (checkedCount > 100) {
                // don't need to check everything, bail out at this point
                break;
            }

            const p = path.join(exampleDir, file);
            const s = statSync(p);
            if (s.isFile() && s.size <= 250 * 75) {
                // verify it's an extension for a file we want
                if (!fileExtensions.some((e) => file.endsWith(e))) {
                    // skip hop
                    continue;
                }

                // reasonably compact, take it
                const pp = path.join(exampleDir, file);
                const content = await readFile(pp, 'utf-8');
                pickedExamples.push({
                    name: file,
                    content: content,
                });
            }

            if (pickedExamples.length === 3) {
                break;
            }
        }
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
        langiumConfig: structure.langiumConfig ? makeRelative(cwd, structure.langiumConfig) : './langium-config.json',
        // grammar: makeRelative(cwd, structure.grammar!),

        // service details for this project
        serviceDetails: structure.serviceDetails,

        // services section — relativize all detected service paths
        services: mapServicesToRelative(cwd, structure.services),

        tests: structure.tests.length > 0 ? structure.tests.map((t) => makeRelative(cwd, t)) : undefined,

        // create examples deterministically from files
        examples: createDefaultExamples(structure, pickedExamples),

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
        if (!value) {
            continue;
        }
        if (key === 'validators' && Array.isArray(value)) {
            // validators is a list of { language?, path } objects
            result.validators = value.map((v) => ({ ...v, path: makeRelative(cwd, v.path) }));
        } else if (typeof value === 'string') {
            (result as Record<string, string | undefined>)[key] = makeRelative(cwd, value);
        }
    }
    return result;
}

function createDefaultExamples(
    structure: LangiumProjectStructure,
    exampleFiles: Array<{ name: string; content: string }>,
) {
    if (!structure.exampleDir || exampleFiles.length === 0) {
        return [];
    }

    const cwd = process.cwd();
    return exampleFiles.map((ex, idx) => ({
        name: `Example ${idx + 1}`,
        description: `An example of one or more language features.`,
        file: makeRelative(cwd, path.join(structure.exampleDir!, ex.name)),
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
