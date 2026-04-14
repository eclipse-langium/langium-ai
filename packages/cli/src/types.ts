// core configuration types

/**
 * Configuration for LAI
 */
export interface LaiConfig {
    /**
     * Language version
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
         * Path to the grammar
         */
        grammarPath: string;
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
 * Locations to the paths of custom services for this language.
 * Organized to match Langium's core and LSP service groups.
 */
export interface Services {
    // DI module
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
 * Langium project structure detection
 * Serves as a map for generate structure & services services that we can find which are customized for the target language
 */
export interface LangiumProjectStructure {
    root: string;
    packageJson?: string;
    langiumConfig?: string;
    grammar?: string;
    services: Services;

    // common directories (recursive search, may find multiple)
    tests: string[];
    examples?: string;
}

/**
 * Language descriptor format
 * Serves as a map for all langium-based services that we can find which are customized for the target language
 */
export interface Descriptor {
    /**
     * Path to known builtins (if any)
     */
    builtins?: string;

    /**
     * Language name
     */
    name: string;

    /**
     * Version of the language this descriptor was derived from
     */
    version: string;

    /**
     * Language description
     */
    description: string;

    /**
     * Path to the JSON config file
     */
    langium_config: string;

    /**
     * Whether this language is case sensitive or not
     */
    case_sensitive: boolean;

    /**
     * Path to the .langium grammar file
     */
    grammar: string;

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
}

export interface DescriptorExample {
    name: string;
    description: string;
    file: string;
    tags: string[];
}

export interface DescriptorDoc {
    src: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
}
