import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { saveConfig, loadConfig } from '../../src/core/config.js';
import { detectLangiumProject } from '../../src/core/langium-detector.js';
import { generateDescriptor, saveDescriptor } from '../../src/core/descriptor.js';
import type { LaiConfig } from '../../src/types.js';

describe('CLI Workflow Integration', () => {
    let tempDir: string;
    let originalCwd: string;

    beforeEach(async () => {
        originalCwd = process.cwd();
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lai-workflow-test-'));
        process.chdir(tempDir);
    });

    afterEach(async () => {
        process.chdir(originalCwd);
        await fs.remove(tempDir);
    });

    it('should complete full workflow: detect -> config -> generate', async () => {
        // step 1: setup a langium project
        await fs.writeJSON(path.join(tempDir, 'package.json'), {
            name: 'workflow-test-dsl',
            version: '1.0.0',
        });

        await fs.writeJSON(path.join(tempDir, 'langium-config.json'), {
            projectName: 'workflow-test-dsl',
        });

        const grammarPath = path.join(tempDir, 'src', 'grammar.langium');
        await fs.ensureDir(path.dirname(grammarPath));
        await fs.writeFile(
            grammarPath,
            `
grammar WorkflowTest

entry Model:
    elements+=Element*;

Element:
    'element' name=ID;

terminal ID: /[_a-zA-Z][\\w_]*/;
hidden terminal WS: /\\s+/;
    `,
        );

        // create validator service
        const validatorPath = path.join(tempDir, 'src', 'workflow-validator.ts');
        await fs.writeFile(validatorPath, 'export class WorkflowValidator {}');

        // create module file that references the validator
        const modulePath = path.join(tempDir, 'src', 'workflow-test-module.ts');
        await fs.writeFile(
            modulePath,
            `import { WorkflowValidator } from './workflow-validator.js';

export const WorkflowTestModule: Module<WorkflowTestServices, PartialLangiumServices> = {
    validation: {
        DocumentValidator: () => new WorkflowValidator()
    }
};`,
        );

        // step 2: detect project structure
        const structure = await detectLangiumProject(tempDir);

        expect(structure.root).toBe(tempDir);
        expect(structure.grammar).toBe(grammarPath);
        expect(structure.services.validator).toBe(validatorPath);

        // step 3: create and save config
        const config: LaiConfig = {
            version: '1.0',
            langium: {
                configPath: './langium-config.json',
                grammarPath: './src/grammar.langium',
            },
            descriptor: {
                path: './language.descriptor.yml',
            },
            sysprompt: {
                path: './language.sysprompt.md',
            },
            evaluations: {
                directory: './evals',
            },
            project: {
                name: 'workflow-test-dsl',
            },
        };

        await saveConfig(config, tempDir);

        const loadedConfig = await loadConfig(tempDir);
        expect(loadedConfig).toEqual(config);

        // step 4: generate descriptor
        const descriptor = await generateDescriptor(config, structure);

        expect(descriptor.name).toBe('workflow-test-dsl');
        // check paths end with expected files (handles macOS temp dir paths)
        expect(descriptor.grammar).toMatch(/src\/grammar\.langium$/);
        expect(descriptor.services?.validator).toMatch(/src\/workflow-validator\.ts$/);

        // step 5: save descriptor
        await saveDescriptor(config.descriptor.path, descriptor);

        const savedDescriptor = await fs.readFile(path.join(tempDir, config.descriptor.path), 'utf-8');
        expect(savedDescriptor).toContain('workflow-test-dsl');
        // check that the grammar path is in the file (may have ../ prefix on macOS)
        expect(savedDescriptor).toMatch(/grammar\.langium/);

        // verify all expected files exist
        expect(await fs.pathExists(path.join(tempDir, 'lai.config.jsonc'))).toBe(true);
        expect(await fs.pathExists(path.join(tempDir, 'language.descriptor.yml'))).toBe(true);
    });
});
