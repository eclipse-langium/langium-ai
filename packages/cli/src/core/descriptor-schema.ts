import type { Descriptor } from '../types.js';

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
 * validates a descriptor against the required schema
 */
export function validateDescriptor(descriptor: Descriptor): ValidationResult {
    const errors: ValidationError[] = [];

    // required fields
    if (!descriptor.name || descriptor.name.trim() === '') {
        errors.push({ field: 'name', message: 'name is required' });
    }

    if (!descriptor.version || descriptor.version.trim() === '') {
        errors.push({ field: 'version', message: 'version is required' });
    }

    if (!descriptor.description || descriptor.description.trim() === '') {
        errors.push({ field: 'description', message: 'description is required' });
    }

    if (!descriptor.grammar || descriptor.grammar.trim() === '') {
        errors.push({ field: 'grammar', message: 'grammar is required' });
    }

    if (!descriptor.langium_config || descriptor.langium_config.trim() === '') {
        errors.push({ field: 'langium_config', message: 'langium_config is required' });
    }

    if (descriptor.case_sensitive === undefined || descriptor.case_sensitive === null) {
        errors.push({ field: 'case_sensitive', message: 'case_sensitive is required' });
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
