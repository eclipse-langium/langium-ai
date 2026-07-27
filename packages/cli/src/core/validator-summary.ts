// static extraction of Langium validation checks from a validator source file
//
// rather than inlining an entire (potentially huge) validator, we statically
// pull out the shape that matters to an LLM: which AST node each check runs on
// and the check method names. this is best-effort and regex-based (no TS
// compiler dependency), tuned for the conventional Langium validator layout
// produced by `registerValidationChecks`. richer per-check descriptions are
// supplemented at usage time rather than scraped from source comments here.

/**
 * The set of checks registered against a single AST node type.
 */
export interface ValidatorNodeChecks {
    /**
     * The AST node type the checks are registered against (e.g. `Definition`)
     */
    node: string;

    /**
     * Check method names registered for this node, in declaration order
     * (e.g. `checkDivByZero`)
     */
    checks: string[];
}

/**
 * Extract a map of AST node types to their registered validation checks.
 *
 * Parses the `checks` object literal inside a `register*ValidationChecks`
 * function, collecting the check method names registered against each node.
 *
 * @returns the discovered node/check groupings, or an empty array if the
 * conventional structure could not be found
 */
export function extractValidatorChecks(source: string): ValidatorNodeChecks[] {
    const registration = findRegistrationBlock(source);
    if (!registration) {
        return [];
    }

    const results: ValidatorNodeChecks[] = [];
    // match entries like `BinaryExpression: validator.checkDivByZero,`
    // or `Definition: [validator.checkUniqueParameters, validator.checkNormalizable],`
    const entryRegex = /(\w+)\s*:\s*(\[[^\]]*\]|[^,\n]+)/g;
    let match: RegExpExecArray | null;
    while ((match = entryRegex.exec(registration)) !== null) {
        const node = match[1];
        const rhs = match[2];
        const methods = extractMethodNames(rhs);
        if (methods.length === 0) {
            continue;
        }
        results.push({ node, checks: methods });
    }

    return results;
}

/**
 * Isolate the body of the `checks` object literal within the validation
 * registration function. Returns the inner text of the `{ ... }` or undefined.
 */
function findRegistrationBlock(source: string): string | undefined {
    // find the `checks` declaration, tolerant of optional type annotation
    const declRegex = /\bchecks\b[^=]*=\s*\{/;
    const declMatch = declRegex.exec(source);
    if (!declMatch) {
        return undefined;
    }

    // the opening brace is the last char of the match; scan for its pair
    const openIndex = declMatch.index + declMatch[0].length - 1;
    let depth = 0;
    for (let i = openIndex; i < source.length; i++) {
        const ch = source[i];
        if (ch === '{') {
            depth++;
        } else if (ch === '}') {
            depth--;
            if (depth === 0) {
                return source.slice(openIndex + 1, i);
            }
        }
    }
    return undefined;
}

/**
 * Pull method names from a registration right-hand side, dropping the
 * `validator.` (or similar) receiver prefix.
 */
function extractMethodNames(rhs: string): string[] {
    const names: string[] = [];
    // capture identifiers following a `.`, e.g. `validator.checkFoo` -> `checkFoo`
    const refRegex = /\.\s*(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = refRegex.exec(rhs)) !== null) {
        names.push(match[1]);
    }
    return names;
}

/**
 * Render extracted checks as a markdown summary suitable for a system prompt.
 * Points at the validator source file rather than inlining its body.
 */
export function formatValidatorSummary(validatorPath: string, groups: ValidatorNodeChecks[]): string {
    const lines: string[] = [
        `Semantic validation is implemented in \`${validatorPath}\`. ` +
            `The following checks are applied to the listed AST node types ` +
            `(programs that violate them will report errors or warnings):`,
        '',
    ];

    for (const group of groups) {
        lines.push(`- **${group.node}**`);
        for (const check of group.checks) {
            lines.push(`  - \`${check}\``);
        }
    }

    return lines.join('\n');
}
