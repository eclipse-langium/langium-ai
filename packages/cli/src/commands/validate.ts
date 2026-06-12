import path from 'node:path';
import { loadConfig } from '../core/config.js';
import { loadDescriptor } from '../core/sysprompt.js';
import { validateDescriptor, formatValidationErrors } from '../core/descriptor-schema.js';
import { error, success, warning, header, spinner } from '../utils/console.js';
import { pathExists } from '../utils/fs.js';

export async function validateCommand(): Promise<void> {
    let config;
    try {
        config = await loadConfig();
    } catch (err) {
        error(err instanceof Error ? err.message : String(err));
        return;
    }

    const cwd = process.cwd();
    const descriptorPath = path.join(cwd, config.descriptor.path);

    // check descriptor exists
    if (!(await pathExists(descriptorPath))) {
        error(`Descriptor not found at ${config.descriptor.path}`);
        console.log('Run `lai gen descriptor` first to create a descriptor.');
        return;
    }

    header('Validating descriptor...');

    // load and validate schema
    const loadSpinner = spinner('Loading descriptor...');
    let descriptor;
    try {
        descriptor = await loadDescriptor(descriptorPath);
        loadSpinner.succeed('Descriptor loaded');
    } catch (err) {
        loadSpinner.fail('Failed to parse descriptor');
        error(err instanceof Error ? err.message : String(err));
        return;
    }

    const validation = validateDescriptor(descriptor);
    if (!validation.valid) {
        console.log();
        error(formatValidationErrors(validation.errors));
        return;
    }

    console.log();
    success('Schema validation passed');

    // verify that referenced files exist on disk
    console.log();
    let warnings = 0;

    // grammar
    if (descriptor.grammar) {
        const grammarPath = path.join(cwd, descriptor.grammar);
        if (!(await pathExists(grammarPath))) {
            warning(`grammar: file not found at ${descriptor.grammar}`);
            warnings++;
        }
    }

    // builtins
    if (descriptor.builtins) {
        const builtinsPath = path.join(cwd, descriptor.builtins);
        if (!(await pathExists(builtinsPath))) {
            warning(`builtins: file not found at ${descriptor.builtins}`);
            warnings++;
        }
    }

    // langium config
    if (descriptor.langium_config) {
        const configPath = path.join(cwd, descriptor.langium_config);
        if (!(await pathExists(configPath))) {
            warning(`langium_config: file not found at ${descriptor.langium_config}`);
            warnings++;
        }
    }

    // services
    if (descriptor.services) {
        for (const [name, filePath] of Object.entries(descriptor.services)) {
            if (filePath) {
                const fullPath = path.join(cwd, filePath);
                if (!(await pathExists(fullPath))) {
                    warning(`services.${name}: file not found at ${filePath}`);
                    warnings++;
                }
            }
        }
    }

    // examples
    if (descriptor.examples) {
        for (const [idx, example] of descriptor.examples.entries()) {
            if (example.file) {
                const examplePath = path.join(cwd, example.file);
                if (!(await pathExists(examplePath))) {
                    warning(`examples[${idx}].file: file not found at ${example.file}`);
                    warnings++;
                }
            }
        }
    }

    // tests directories
    if (descriptor.tests) {
        for (const testPath of descriptor.tests) {
            const testsPath = path.join(cwd, testPath);
            if (!(await pathExists(testsPath))) {
                warning(`tests: directory not found at ${testPath}`);
                warnings++;
            }
        }
    }

    console.log();
    if (warnings > 0) {
        warning(`Descriptor valid with ${warnings} file path warning${warnings > 1 ? 's' : ''}`);
    } else {
        success('All referenced files exist');
    }
}
