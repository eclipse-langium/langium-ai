import type { ProjectDescriptor } from '../types.js';

// descriptor schema validation

export interface ValidationError {
    field: string;
    message: string;
}

export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
}

/**
 * Validates a descriptor against the required schema
 * @returns A validation result containing any errors encountered along the way
 */
export function validateDescriptor(descriptor: ProjectDescriptor): ValidationResult {
    const errors: ValidationError[] = [];

    // required fields
    if (!descriptor.version || descriptor.version.trim() === '') {
        errors.push({ field: 'version', message: 'version is required' });
    }

    // TODO check that this version matches the one we're built with, if not ensure we're at least compatible by doing a table lookup to see which versions are legitimate
    // laiVersion perhaps instead of 'version' to be more explicit up front about what that is

    if (!descriptor.langium_config || descriptor.langium_config.trim() === '') {
        errors.push({ field: 'langium_config', message: 'langium_config is required' });
    }

    // check languages
    if (!descriptor.languages || descriptor.languages.length === 0) {
        errors.push({ field: 'languages', message: 'at least one language is required' });
    }

    for (const language of descriptor.languages) {
        if (!language.name || language.name.trim() === '') {
            errors.push({ field: 'name', message: 'language name is required' });
        }

        if (!language.description || language.description.trim() === '') {
            errors.push({ field: 'description', message: 'language description is required' });
        }

        if (!language.grammar || language.grammar.trim() === '') {
            errors.push({ field: 'grammar', message: 'language grammar is required' });
        }

        if (language.caseInsensitive === undefined || language.caseInsensitive === null) {
            errors.push({ field: 'caseInsensitive', message: 'language caseInsensitive is required' });
        }
    }

    // validate validators list if present
    if (descriptor.services?.validators) {
        for (const [idx, validator] of descriptor.services.validators.entries()) {
            if (!validator.path || validator.path.trim() === '') {
                errors.push({
                    field: `services.validators[${idx}].path`,
                    message: 'validator path is required',
                });
            }
        }
    }

    // validate examples if present
    if (descriptor.examples) {
        for (const [idx, example] of descriptor.examples.entries()) {
            if (!example.name) {
                errors.push({
                    field: `examples[${idx}].name`,
                    message: 'example name is required',
                });
            }
            if (!example.file) {
                errors.push({
                    field: `examples[${idx}].file`,
                    message: 'example file path is required',
                });
            }
            if (!Array.isArray(example.tags)) {
                errors.push({
                    field: `examples[${idx}].tags`,
                    message: 'example tags must be an array',
                });
            }
        }
    }

    // validate documentation if present
    if (descriptor.documentation) {
        for (const [idx, doc] of descriptor.documentation.entries()) {
            if (!doc.src) {
                errors.push({
                    field: `documentation[${idx}].src`,
                    message: 'documentation source is required',
                });
            }
            if (!doc.priority || !['high', 'medium', 'low'].includes(doc.priority)) {
                errors.push({
                    field: `documentation[${idx}].priority`,
                    message: 'documentation priority must be "high", "medium", or "low"',
                });
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

/**
 * formats validation errors for display
 */
export function formatValidationErrors(errors: ValidationError[]): string {
    if (errors.length === 0) {
        return '';
    }

    const lines = ['Descriptor validation failed:', ''];
    for (const error of errors) {
        lines.push(`  - ${error.field}: ${error.message}`);
    }

    return lines.join('\n');
}
