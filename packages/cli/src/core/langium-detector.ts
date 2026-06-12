import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'path';
import type { Services, LangiumProjectStructure } from '../types.js';
import { findProjectRoot, findFile, findFiles, findDirectory, findDirectories, makeRelative } from '../utils/fs.js';

/**
 * Maps known Langium base classes to our Services interface keys.
 * These class names are part of Langium's stable API surface — when a user's class
 * extends one of these, we know which service is being overridden.
 */
const KNOWN_BASE_CLASSES: Record<string, keyof Services> = {
    // parser
    DefaultAsyncParser: 'async_parser',
    AbstractThreadedAsyncParser: 'async_parser',
    LangiumParser: 'langium_parser',
    AbstractLangiumParser: 'langium_parser',
    LangiumParserErrorMessageProvider: 'parser_error_message_provider',
    AbstractParserErrorMessageProvider: 'parser_error_message_provider',
    DefaultLexerErrorMessageProvider: 'lexer_error_message_provider',
    LangiumCompletionParser: 'completion_parser',
    DefaultTokenBuilder: 'token_builder',
    DefaultLexer: 'lexer',
    DefaultValueConverter: 'value_converter',
    // documentation
    DefaultCommentProvider: 'comment_provider',
    JSDocDocumentationProvider: 'documentation_provider',
    // references
    DefaultLinker: 'linker',
    DefaultNameProvider: 'name_provider',
    DefaultReferences: 'references',
    DefaultScopeProvider: 'scope_provider',
    DefaultScopeComputation: 'scope_computation',
    // serializer
    DefaultHydrator: 'hydrator',
    DefaultJsonSerializer: 'json_serializer',
    // validation
    DefaultDocumentValidator: 'validator',
    // LSP
    DefaultCompletionProvider: 'completion_provider',
    DefaultDocumentHighlightProvider: 'document_highlight_provider',
    DefaultDocumentSymbolProvider: 'document_symbol_provider',
    AstNodeHoverProvider: 'hover_provider',
    MultilineCommentHoverProvider: 'hover_provider',
    DefaultFoldingRangeProvider: 'folding_range_provider',
    DefaultDefinitionProvider: 'definition_provider',
    AbstractTypeDefinitionProvider: 'type_provider',
    AbstractGoToImplementationProvider: 'implementation_provider',
    DefaultReferencesProvider: 'references_provider',
    AbstractSemanticTokenProvider: 'semantic_token_provider',
    DefaultRenameProvider: 'rename_provider',
    AbstractFormatter: 'formatter',
    AbstractSignatureHelpProvider: 'signature_help_provider',
    AbstractCallHierarchyProvider: 'call_hierarchy_provider',
    AbstractTypeHierarchyProvider: 'type_hierarchy_provider',
    AbstractInlayHintProvider: 'inlay_hint_provider',
};

/**
 * Maps known Langium interfaces to Services keys for services that have no default/abstract class.
 * Weaker heuristic — we also verify the interface is imported from 'langium' to reduce false positives.
 */
const KNOWN_INTERFACES: Record<string, keyof Services> = {
    CodeActionProvider: 'code_action_provider',
    CodeLensProvider: 'code_lens_provider',
    DeclarationProvider: 'declaration_provider',
    DocumentLinkProvider: 'document_link_provider',
};

/**
 * Fallback mapping for categories when a service name doesn't match any known key.
 * This handles custom AddedServices (e.g., MyLangValidator under validation)
 * that every Langium project defines with its own language-specific names.
 * Used by the module-parse fallback path.
 */
const CATEGORY_FALLBACK_MAP: Partial<Record<string, keyof Services>> = {
    validation: 'validator',
};

/**
 * Maps Langium service names (as they appear in modules) to our Services interface keys.
 * Used by the module-parse fallback path.
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
                `This might be a monorepo with multiple Langium projects.\n` +
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
                `This might be a monorepo with multiple Langium projects.\n` +
                `Please run 'lai init' from within a specific langium project directory, not from the monorepo root.`,
        );
    }

    // 4. detect DI module (pattern: *-module.ts)
    const allModuleFiles = await findFiles(root, '**/*-module.ts');
    const moduleFiles = allModuleFiles.filter(
        (file) =>
            !file.includes('/node_modules/') && !file.includes('\\node_modules\\') && !file.includes('/generated/'),
    );

    // 5. detect custom services using inheritance scan + module-parse fallback
    const services: Services = {
        module: moduleFiles[0],
    };

    await detectCustomServices(root, moduleFiles[0], services);

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
 * Result from scanning a source file for class inheritance or interface implementation.
 */
interface ServiceOverride {
    className: string;
    serviceKey: keyof Services;
    filePath: string;
}

/**
 * Detect custom services using two complementary strategies:
 * 1. Primary: scan source files for classes extending known Langium base classes
 * 2. Fallback: parse the DI module file for service wiring (handles AddedServices, factory patterns, etc.)
 *
 * The inheritance scan takes priority since base class names are part of Langium's stable API.
 * The module-parse fills in gaps for services that might be missed by the 1st check
 * (e.g., GrammarConfig, ValidationRegistry, custom AddedServices validators).
 */
async function detectCustomServices(root: string, modulePath: string | undefined, services: Services): Promise<void> {
    // primary: scan all source files for class inheritance / interface implementation
    const inheritanceOverrides = await scanSourceFilesForOverrides(root);

    // if multiple classes override the same service, prefer the one wired in the module
    const moduleImportMap = modulePath ? await buildModuleImportMap(modulePath) : new Map<string, string>();

    // group overrides by serviceKey to handle conflicts
    const overridesByKey = new Map<keyof Services, ServiceOverride[]>();
    for (const override of inheritanceOverrides) {
        const existing = overridesByKey.get(override.serviceKey);
        if (existing) {
            existing.push(override);
        } else {
            overridesByKey.set(override.serviceKey, [override]);
        }
    }

    // resolve each service key to a single file path
    for (const [serviceKey, overrides] of overridesByKey) {
        if (overrides.length === 1) {
            services[serviceKey] = overrides[0].filePath;
        } else {
            // prefer the class that appears in the module's imports
            let resolved: ServiceOverride | undefined;
            for (const override of overrides) {
                if (moduleImportMap.has(override.className)) {
                    resolved = override;
                    break;
                }
            }
            services[serviceKey] = (resolved ?? overrides[0]).filePath;
        }
    }

    // fallback: parse the module file for anything the inheritance scan missed
    if (modulePath) {
        await parseModuleServices(modulePath, services);
    }
}

/**
 * Scan all TypeScript source files under the project root for classes that
 * extend known Langium base classes or implement known Langium interfaces.
 */
async function scanSourceFilesForOverrides(root: string): Promise<ServiceOverride[]> {
    const allFiles = await findFiles(root, '**/*.ts');
    // assumes the following are off limits
    // TODO @montymxb, can leverage the .gitignore to dynamically pick up additional paths & files to avoid
    const sourceFiles = allFiles.filter(
        (f) =>
            !f.includes('/node_modules/') &&
            !f.includes('\\node_modules\\') &&
            !f.includes('/generated/') &&
            !f.endsWith('.test.ts') &&
            !f.endsWith('.spec.ts'),
    );

    const results: ServiceOverride[] = [];
    const extendsRegex = /class\s+(\w+)\s+extends\s+(\w+)/g;
    const implementsRegex = /class\s+(\w+)\s+implements\s+(\w+)/g;

    for (const filePath of sourceFiles) {
        let content: string;
        try {
            content = await readFile(filePath, 'utf-8');
        } catch {
            continue;
        }

        // check for class extends KnownBaseClass
        let match: RegExpExecArray | null;
        while ((match = extendsRegex.exec(content)) !== null) {
            const className = match[1];
            const baseClass = match[2];
            const serviceKey = KNOWN_BASE_CLASSES[baseClass];
            if (serviceKey) {
                results.push({ className, serviceKey, filePath });
            }
        }

        // check for class implements KnownInterface (for services with no default class)
        // only count if the interface is imported from 'langium' or 'langium/lsp'
        const hasLangiumImport = /from\s+['"]langium(?:\/lsp)?['"]/.test(content);
        if (hasLangiumImport) {
            while ((match = implementsRegex.exec(content)) !== null) {
                const className = match[1];
                const iface = match[2];
                const serviceKey = KNOWN_INTERFACES[iface];
                if (serviceKey) {
                    results.push({ className, serviceKey, filePath });
                }
            }
        }
    }

    return results;
}

/**
 * Build an import map from the module file (className -> resolved file path).
 * Used for conflict resolution when multiple classes extend the same base.
 */
async function buildModuleImportMap(modulePath: string): Promise<Map<string, string>> {
    let content: string;
    try {
        content = await readFile(modulePath, 'utf-8');
    } catch {
        return new Map();
    }
    return buildImportMap(content, path.dirname(modulePath));
}

/**
 * Parse a Langium DI module file to extract overridden services and resolve their source file paths.
 * This is the fallback path — it only fills in services that haven't already been detected by the
 * inheritance scan. Handles services like GrammarConfig, ValidationRegistry, and custom
 * AddedServices validators that don't extend a known Langium base class.
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
 */
async function parseModuleServices(modulePath: string, services: Services): Promise<void> {
    let content: string;
    try {
        content = await readFile(modulePath, 'utf-8');
    } catch {
        return;
    }

    const moduleDir = path.dirname(modulePath);

    // build an import map: class name -> resolved file path
    const importMap = buildImportMap(content, moduleDir);

    // extract service overrides from the module object
    const overrides = extractServiceOverrides(content);

    // map each override to the Services interface, only if not already detected
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

        // skip if already detected by the inheritance scan
        if (services[serviceKey]) {
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
        //   ServiceName: (services) => new ClassName(services) (w/ or w/out a trailing ,)
        //   ServiceName: () => new ClassName()
        //   ServiceName: (services) => new ClassName(services) (w/ or w/out a trailing ,)
        //   ServiceName: services => new ClassName(services) (w/ or w/out a trailing ,)
        const serviceRegex = /(\w+)\s*:\s*(?:\([^)]*\)\s*=>|function\s*\([^)]*\)\s*\{)[^}]*?\bnew\s+(\w+)/g;
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
            const pkg = JSON.parse(readFileSync(structure.packageJson, 'utf-8'));
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
    scanSourceFilesForOverrides,
    detectCustomServices,
};
