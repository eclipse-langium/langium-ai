import { describe, expect, it } from 'vitest';
import { extractValidatorChecks, formatValidatorSummary } from '../../src/core/validator-summary.js';

// a compact validator resembling the conventional Langium layout
const validatorSource = `
import type { ValidationChecks } from 'langium';

export function registerValidationChecks(services: FooServices): void {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.FooValidator;
    const checks: ValidationChecks<FooAstType> = {
        BinaryExpression: validator.checkDivByZero,
        Definition: [validator.checkUniqueParameters, validator.checkNormalizable],
        Module: validator.checkUniqueDefinitions,
    };
    registry.register(checks, validator);
}

export class FooValidator {
    /**
     * Reports division by a zero literal.
     */
    checkDivByZero(binExpr: BinaryExpression, accept: ValidationAcceptor): void {}

    // parameters of a definition must be uniquely named
    checkUniqueParameters(def: Definition, accept: ValidationAcceptor): void {}

    checkNormalizable(def: Definition, accept: ValidationAcceptor): void {}

    checkUniqueDefinitions(module: Module, accept: ValidationAcceptor): void {}
}
`;

describe('extractValidatorChecks', () => {
    it('maps AST node types to their registered checks', () => {
        const groups = extractValidatorChecks(validatorSource);
        expect(groups.map((g) => g.node)).toEqual(['BinaryExpression', 'Definition', 'Module']);

        const definition = groups.find((g) => g.node === 'Definition');
        expect(definition?.checks).toEqual(['checkUniqueParameters', 'checkNormalizable']);
    });

    it('extracts a single check registered directly (not in an array)', () => {
        const groups = extractValidatorChecks(validatorSource);
        expect(groups[0].node).toBe('BinaryExpression');
        expect(groups[0].checks).toEqual(['checkDivByZero']);
    });

    it('is agnostic to the check method naming convention', () => {
        // methods here do not use the conventional `check` prefix
        const source = `
            const checks: ValidationChecks<FooAstType> = {
                Widget: [validator.validateWidget, validator.ensureUnique],
            };
        `;
        const groups = extractValidatorChecks(source);
        expect(groups).toEqual([{ node: 'Widget', checks: ['validateWidget', 'ensureUnique'] }]);
    });

    it('returns an empty array when no registration block exists', () => {
        expect(extractValidatorChecks('export const x = 1;')).toEqual([]);
    });
});

describe('formatValidatorSummary', () => {
    it('renders a markdown check map pointing at the validator file', () => {
        const groups = extractValidatorChecks(validatorSource);
        const summary = formatValidatorSummary('src/foo-validator.ts', groups);

        expect(summary).toContain('`src/foo-validator.ts`');
        expect(summary).toContain('- **BinaryExpression**');
        expect(summary).toContain('`checkDivByZero`');
        expect(summary).toContain('`checkNormalizable`');
    });
});
