import fs from 'fs-extra';
import path from 'path';
import type { Services, LangiumProjectStructure } from '../types.js';
import { findProjectRoot, findFile, findFiles, findDirectory, findDirectories, makeRelative } from '../utils/fs.js';

/**
 * Fallback mapping for categories when a service name doesn't match any known key.
 * This handles custom AddedServices (e.g., MyLangValidator under validation)
 * that every Langium project defines with its own language-specific names.
 */
const CATEGORY_FALLBACK_MAP: Partial<Record<string, keyof Services>> = {
    validation: 'validator',
};

/**
 * Maps Langium service names (as they appear in modules) to our Services interface keys.
 * Organized by the nested category they appear under in the module object.
 */
const SERVICE_KEY_MAP: Record<string, Record<string, keyof Services>> = {
    parser: {
        AsyncParser: 'async_parser',
        GrammarConfig: 'grammar_config',
        LangiumParser: 'langium_parser',
        ParserErrorMessageProvider: 'parser_error_message_provider',
        LexerErrorMessageProvider: 'lexer_error_message_provider',
        CompletionParser: 'completion_parser',
        TokenBuilder: 'token_builder',
        Lexer: 'lexer',
        ValueConverter: 'value_converter',
    },
    documentation: {
        CommentProvider: 'comment_provider',
        DocumentationProvider: 'documentation_provider',
    },
    references: {
        Linker: 'linker',
        NameProvider: 'name_provider',
        References: 'references',
        ScopeProvider: 'scope_provider',
        ScopeComputation: 'scope_computation',
    },
    serializer: {
        Hydrator: 'hydrator',
        JsonSerializer: 'json_serializer',
    },
    validation: {
        DocumentValidator: 'validator',
        ValidationRegistry: 'validation_registry',
    },
    lsp: {
        CompletionProvider: 'completion_provider',
        DocumentHighlightProvider: 'document_highlight_provider',
        DocumentSymbolProvider: 'document_symbol_provider',
        HoverProvider: 'hover_provider',
        FoldingRangeProvider: 'folding_range_provider',
        DefinitionProvider: 'definition_provider',
        TypeProvider: 'type_provider',
        ImplementationProvider: 'implementation_provider',
        ReferencesProvider: 'references_provider',
        CodeActionProvider: 'code_action_provider',
        SemanticTokenProvider: 'semantic_token_provider',
        RenameProvider: 'rename_provider',
        Formatter: 'formatter',
        SignatureHelp: 'signature_help_provider',
        CallHierarchyProvider: 'call_hierarchy_provider',
        TypeHierarchyProvider: 'type_hierarchy_provider',
        DeclarationProvider: 'declaration_provider',
        InlayHintProvider: 'inlay_hint_provider',
        CodeLensProvider: 'code_lens_provider',
        DocumentLinkProvider: 'document_link_provider',
    },
};

/**
 * Detect langium project structure and custom services
 */
export async function detectLangiumProject(cwd: string): Promise<LangiumProjectStructure> {
    // 1. find project root (package.json or langium-config.json)
    const root = await findProjectRoot(cwd);

    // 2. locate langium-config.json file(s) and filter out node_modules
    const allConfigFiles = await findFiles(root, '**/langium-config.json');
    const configFiles = allConfigFiles.filter(
        (file) => !file.includes('/node_modules/') && !file.includes('\\node_modules\\'),
    );

    // check for monorepo scenario - multiple config files detected
    if (configFiles.length > 1) {
        const relativeFiles = configFiles.map((f) => makeRelative(root, f));
        throw new Error(
            `Multiple Langium projects detected (by langium-config.json files):\n${relativeFiles.map((f) => `  - ${f}`).join('\n')}\n\n` +
                `This appears to be a monorepo with multiple Langium projects.\n` +
                `Please run 'lai init' from within a specific project directory, not from the monorepo root.`,
        );
    }

    const langiumConfig = configFiles[0];

    // 3. find grammar file(s) and filter out node_modules
    const allGrammarFiles = await findFiles(root, '**/*.langium');
    const grammarFiles = allGrammarFiles.filter(
        (file) => !file.includes('/node_modules/') && !file.includes('\\node_modules\\'),
    );

    // check for monorepo scenario - multiple grammar files detected
    if (grammarFiles.length > 1) {
        const relativeFiles = grammarFiles.map((f) => makeRelative(root, f));
        throw new Error(
            `Multiple Langium projects detected (by .langium grammar files):\n${relativeFiles.map((f) => `  - ${f}`).join('\n')}\n\n` +
                `This appears to be a monorepo with multiple Langium projects.\n` +
                `Please run 'lai init' from within a specific project directory, not from the monorepo root.`,
        );
    }

    // 4. detect DI module (pattern: *-module.ts)
    const allModuleFiles = await findFiles(root, '**/*-module.ts');
    const moduleFiles = allModuleFiles.filter(
        (file) =>
            !file.includes('/node_modules/') && !file.includes('\\node_modules\\') && !file.includes('/generated/'),
    );

    // 5. detect custom services by parsing the module file
    const services: Services = {
        module: moduleFiles[0],
    };

    if (moduleFiles[0]) {
        await parseModuleServices(moduleFiles[0], services);
    }

    // 6. find package.json
    const packageJson = await findFile(root, 'package.json');

    // 7. find test and example directories (recursive search for tests)
    const tests = await findDirectories(root, ['test', 'tests', '__tests__']);
    const examples = await findDirectory(root, ['examples', 'samples']);

    return {
        root,
        packageJson,
        langiumConfig,
        grammar: grammarFiles[0],
        services,
        tests,
        examples,
    };
}

/**
 * Parse a Langium DI module file to extract overridden services and resolve their source file paths.
 *
 * Module files follow this pattern:
 * ```ts
 * import { MyValidator } from './my-validator.js';
 * export const MyModule: Module<...> = {
 *     validation: {
 *         DocumentValidator: (services) => new MyValidator(services)
 *     },
 *     lsp: {
 *         CodeActionProvider: () => new MyCodeActionProvider()
 *     }
 * };
 * ```
 *
 * We extract:
 * 1. The import map (class name -> relative file path)
 * 2. The service overrides (category.ServiceName -> class name)
 * Then resolve them to absolute file paths in the Services object.
 */
async function parseModuleServices(modulePath: string, services: Services): Promise<void> {
    let content: string;
    try {
        content = await fs.readFile(modulePath, 'utf-8');
    } catch {
        return;
    }

    const moduleDir = path.dirname(modulePath);

    // build an import map: class name -> resolved file path
    const importMap = buildImportMap(content, moduleDir);

    // extract service overrides from the module object
    const overrides = extractServiceOverrides(content);

    // map each override to the Services interface
    for (const { category, serviceName, className } of overrides) {
        const categoryMap = SERVICE_KEY_MAP[category];
        if (!categoryMap) {
            continue;
        }

        // try exact match first, then fall back to category default for AddedServices
        const serviceKey = categoryMap[serviceName] ?? CATEGORY_FALLBACK_MAP[category];
        if (!serviceKey) {
            continue;
        }

        // resolve the file path from the import map using the class name
        const filePath = importMap.get(className);
        if (filePath) {
            services[serviceKey] = filePath;
        }
    }
}

/**
 * Build a map of imported class names to their resolved absolute file paths.
 * Handles standard ES import patterns:
 *   import { Foo } from './foo.js';
 *   import { Foo, Bar } from './services/index.js';
 *   import { Foo as Bar } from './foo.js';
 */
function buildImportMap(content: string, moduleDir: string): Map<string, string> {
    const importMap = new Map<string, string>();

    // match import statements with named imports
    const importRegex = /import\s+(?:type\s+)?{([^}]+)}\s+from\s+['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;

    while ((match = importRegex.exec(content)) !== null) {
        const importSpecifiers = match[1];
        const importPath = match[2];

        // skip non-relative imports (npm packages like 'langium', 'langium/lsp')
        if (!importPath.startsWith('.')) {
            continue;
        }

        // resolve the import path to an absolute .ts file path
        const resolvedPath = resolveImportPath(moduleDir, importPath);

        // parse individual import specifiers (handles 'Foo', 'Foo as Bar')
        const specifiers = importSpecifiers.split(',');
        for (const spec of specifiers) {
            const trimmed = spec.trim();
            if (!trimmed) {
                continue;
            }

            // handle 'OriginalName as LocalName' pattern
            const asMatch = trimmed.match(/^(\S+)\s+as\s+(\S+)$/);
            if (asMatch) {
                // map the local alias to the file path
                importMap.set(asMatch[2], resolvedPath);
            } else {
                importMap.set(trimmed, resolvedPath);
            }
        }
    }

    return importMap;
}

/**
 * Resolve a relative import path to an absolute .ts file path.
 * Converts .js extensions to .ts (standard in ESM TypeScript projects).
 */
function resolveImportPath(moduleDir: string, importPath: string): string {
    // convert .js -> .ts (ESM TypeScript convention)
    let tsPath = importPath;
    if (tsPath.endsWith('.js')) {
        tsPath = tsPath.slice(0, -3) + '.ts';
    } else if (!tsPath.endsWith('.ts')) {
        tsPath += '.ts';
    }

    return path.resolve(moduleDir, tsPath);
}

/**
 * Extract service overrides from the module object literal.
 * Parses patterns like:
 *   category: {
 *       ServiceName: (services) => new ClassName(services),
 *       ServiceName: () => new ClassName()
 *   }
 *
 * Returns an array of { category, serviceName, className } tuples.
 */
function extractServiceOverrides(content: string): Array<{ category: string; serviceName: string; className: string }> {
    const overrides: Array<{ category: string; serviceName: string; className: string }> = [];

    // find the module object export (e.g., `export const XxxModule: Module<...> = {`)
    // we look for the opening brace after `Module<...> =`
    const moduleStart = findModuleObjectStart(content);
    if (moduleStart === -1) {
        return overrides;
    }

    // extract the module object body by matching balanced braces
    const moduleBody = extractBalancedBraces(content, moduleStart);
    if (!moduleBody) {
        return overrides;
    }

    // parse top-level category blocks within the module body
    // pattern: `categoryName: {` ... `}`
    const categoryRegex = /(\w+)\s*:\s*\{/g;
    let categoryMatch: RegExpExecArray | null;

    while ((categoryMatch = categoryRegex.exec(moduleBody)) !== null) {
        const category = categoryMatch[1];
        const categoryStart = categoryMatch.index + categoryMatch[0].length - 1;

        // extract the category block content
        const categoryBody = extractBalancedBraces(moduleBody, categoryStart);
        if (!categoryBody) {
            continue;
        }

        // parse service assignments within the category
        // patterns:
        //   ServiceName: (services) => new ClassName(services)
        //   ServiceName: () => new ClassName()
        //   ServiceName: (services) => new ClassName(services),
        const serviceRegex = /(\w+)\s*:\s*(?:\([^)]*\)|[^)]*\s*=>|function\s*\([^)]*\)\s*\{)[^}]*?\bnew\s+(\w+)/g;
        let serviceMatch: RegExpExecArray | null;

        while ((serviceMatch = serviceRegex.exec(categoryBody)) !== null) {
            overrides.push({
                category,
                serviceName: serviceMatch[1],
                className: serviceMatch[2],
            });
        }
    }

    return overrides;
}

/**
 * Find the start position of the module object literal.
 * Looks for patterns like:
 *   export const XxxModule: Module<...> = {
 *   export const XxxModule = {
 */
function findModuleObjectStart(content: string): number {
    // match 'Module<...> = {' or just a const assignment ending in '= {'
    // that's preceded by an export with a name ending in 'Module'
    const pattern = /export\s+const\s+\w+Module\b[^=]*=\s*\{/g;
    const match = pattern.exec(content);
    if (match) {
        // return the position of the opening brace
        return match.index + match[0].length - 1;
    }
    return -1;
}

/**
 * Extract content within balanced braces starting at the given position.
 * Returns the content between the braces (exclusive), or null if unbalanced.
 */
function extractBalancedBraces(content: string, startPos: number): string | null {
    if (content[startPos] !== '{') {
        return null;
    }

    let depth = 0;
    for (let i = startPos; i < content.length; i++) {
        if (content[i] === '{') {
            depth++;
        } else if (content[i] === '}') {
            depth--;
            if (depth === 0) {
                return content.slice(startPos + 1, i);
            }
        }
    }

    return null;
}

export function getProjectName(structure: LangiumProjectStructure): string {
    // try to extract from package.json if available
    if (structure.packageJson) {
        try {
            const pkg = require(structure.packageJson);
            if (pkg.name) {
                return pkg.name;
            }
        } catch {
            // ignore errors
        }
    }

    // fallback to grammar file name
    if (structure.grammar) {
        const grammarName = structure.grammar.split('/').pop()?.replace('.langium', '');
        if (grammarName) {
            return grammarName;
        }
    }

    // last resort
    return 'my-dsl';
}

/**
 * Extract the language name for services from the project structure
 * This is used to generate service creation functions like createHelloWorldServices
 *
 * @param structure - The detected project structure
 * @returns The language name in PascalCase (e.g., "HelloWorld", "DomainModel")
 */
export function getLanguageName(structure: LangiumProjectStructure): string {
    // try to extract from grammar file name first
    if (structure.grammar) {
        const grammarFile = structure.grammar.split('/').pop()?.replace('.langium', '');
        if (grammarFile) {
            // convert kebab-case or snake_case to PascalCase
            return toPascalCase(grammarFile);
        }
    }

    // try to extract from module file name (e.g., hello-world-module.ts -> HelloWorld)
    if (structure.services.module) {
        const moduleFile = structure.services.module.split('/').pop()?.replace('-module.ts', '');
        if (moduleFile) {
            return toPascalCase(moduleFile);
        }
    }

    // fallback to project name
    const projectName = getProjectName(structure);
    return toPascalCase(projectName);
}

/**
 * Convert a string to PascalCase
 * Handles kebab-case, snake_case, and regular strings
 *
 * @param str - The input string
 * @returns PascalCase version of the string
 */
function toPascalCase(str: string): string {
    return str
        .split(/[-_\s]+/) // split on hyphens, underscores, and spaces
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join('');
}

// export internals for testing
export const _testing = {
    buildImportMap,
    extractServiceOverrides,
    parseModuleServices,
    resolveImportPath,
    findModuleObjectStart,
    extractBalancedBraces,
};
