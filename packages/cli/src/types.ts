// core configuration types

export interface LaiConfigLanguage {
    /**
     * Language ID
     */
    id: string;

    /**
     * Path to this language's grammar
     */
    grammarPath: string;

    /**
     * Whether this language is case sensitive or not
     */
    caseInsensitive: boolean;
}

/**
 * Configuration for LAI
 */
export interface LaiConfig {
    /**
     * LAI configuration version
     */
    version: string;

    /**
     * Langium config entries
     */
    langium: {
        /**
         * Path to langium config
         */
        configPath: string;

        /**
         * All defined languages we picked up from the config
         */
        languages: LaiConfigLanguage[];
    };

    /**
     * Language descriptor info
     */
    descriptor: {
        /**
         * Location of descriptor
         */
        path: string;
    };

    /**
     * Sys prompt config
     */
    sysprompt: {
        /**
         * Path to sys prompt
         */
        path: string;
    };

    /**
     * Evaluations config
     */
    evaluations: {
        /**
         * Path to evaluations directory
         */
        directory: string;
    };

    /**
     * Project config
     */
    project: {
        /**
         * Name of the project
         */
        name: string;
    };
}

/**
 * Details about the service function & it's return attributes.
 * Useful when we're looking into generation
 */
export interface ServiceDetails {
    /**
     * Name of the create services func, if we detected it before
     */
    createServicesFunc?: string;

    /**
     * Attributes that are returned from the createServicesFunc above.
     * If so we can use this to produce a better eval generation pass
     */
    createServicesAttributes?: string[];
}

/**
 * Locations to the paths of custom services for this language.
 * Organized to match Langium's core and LSP service groups.
 */
export interface Services {
    /**
     * Core DI module for this project
     */
    module?: string;

    // parser services
    async_parser?: string;
    grammar_config?: string;
    langium_parser?: string;
    parser_error_message_provider?: string;
    lexer_error_message_provider?: string;
    completion_parser?: string;
    token_builder?: string;
    lexer?: string;
    value_converter?: string;

    // documentation services
    comment_provider?: string;
    documentation_provider?: string;

    // references services
    linker?: string;
    name_provider?: string;
    references?: string;
    scope_provider?: string;
    scope_computation?: string;

    // serializer services
    hydrator?: string;
    json_serializer?: string;

    // validation services
    validator?: string;
    validation_registry?: string;

    // LSP services
    completion_provider?: string;
    document_highlight_provider?: string;
    document_symbol_provider?: string;
    hover_provider?: string;
    folding_range_provider?: string;
    definition_provider?: string;
    type_provider?: string;
    implementation_provider?: string;
    references_provider?: string;
    code_action_provider?: string;
    semantic_token_provider?: string;
    rename_provider?: string;
    formatter?: string;
    signature_help_provider?: string;
    call_hierarchy_provider?: string;
    type_hierarchy_provider?: string;
    declaration_provider?: string;
    inlay_hint_provider?: string;
    code_lens_provider?: string;
    document_link_provider?: string;
}

/**
 * Partial type for a langium language def in a langium config
 */
export interface LangiumLanguage {
    /**
     * Regular language ID
     */
    id: string;

    /**
     * Relative path to the language's grammar file
     */
    grammar: string;

    /**
     * Whether this language is case-insensitive or not, defaults to false
     */
    caseInsensitive: boolean;
}

/**
 * Partial type for a langium config
 */
export interface LangiumConfig {
    /**
     * Overall project name, may or may not reflect the language(s)
     */
    projectName: string;

    /**
     * Actual language defs
     */
    languages: LangiumLanguage[];
}

/**
 * Langium project structure detection
 * Serves as a map for generate structure & services services that we can find which are customized for the target language.
 * Suitable to generate project descriptor from.
 */
export interface LangiumProjectStructure {
    root: string;
    packageJson?: string;
    langiumConfig?: string;
    languages: LangiumLanguage[];
    serviceDetails: ServiceDetails;
    services: Services;

    // common directories (recursive search, may find multiple)
    tests: string[];
    examples?: string;
}

/**
 * Descriptor for a langium language in a project
 */
export interface LanguageDescriptor {
    /**
     * Language name
     */
    name: string;

    /**
     * Language description, typically a single line summary
     */
    description: string;

    /**
     * Whether this language is case sensitive or not (from config)
     */
    caseInsensitive: boolean;

    /**
     * Path to the .langium grammar file
     */
    grammar: string;
}

/**
 * Project descriptor format
 * Serves as a map for all langium-based services that we can find which are customized for the target language(s).
 * For projects with 2 or more languages, these are captured by the same descriptor as well.
 */
export interface ProjectDescriptor {
    /**
     * Version of LAI used to generate this descriptor
     * Used to detect older configs that need to be updated
     */
    version: string;

    /**
     * Path to known builtins (if any)
     */
    builtins?: string[];

    /**
     * Path to the project's Langium config file
     */
    langium_config: string;

    /**
     * Details about this project's service set instantiation.
     * Used for getting the right create*Services and return attributes for eval generation
     */
    serviceDetails: ServiceDetails;

    /**
     * Any customized Langium services
     */
    services: Services;

    /**
     * Paths to language test directories
     */
    tests?: string[];

    /**
     * Path to any examples
     */
    examples?: DescriptorExample[];

    /**
     * Path to any documentation (docs, README, GUIDE, etc.).
     * These should be more language focused.
     */
    documentation?: DescriptorDoc[];

    /**
     * Registered Langium languages we've picked up in this project
     */
    languages: LanguageDescriptor[];
}

interface DescriptorExample {
    name: string;
    description: string;
    file: string;
    tags: string[];
}

interface DescriptorDoc {
    src: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
}
