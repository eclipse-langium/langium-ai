import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { statusCommand } from '../../src/commands/status.js';
import type { LaiConfig } from '../../src/types.js';

describe('Status Command', () => {
    let tempDir: string;
    let originalCwd: string;
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
        originalCwd = process.cwd();
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lai-status-test-'));
        process.chdir(tempDir);

        // spy on console.log to capture output
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(async () => {
        consoleLogSpy?.mockRestore();
        process.chdir(originalCwd);
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    const createConfig = (): LaiConfig => ({
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
            name: 'test-dsl',
        },
    });

    it('should display project status', async () => {
        const config = createConfig();
        await fs.writeFile(path.join(tempDir, 'lai.config.jsonc'), JSON.stringify(config, null, 2));
        await fs.writeFile(path.join(tempDir, 'language.descriptor.yml'), 'name: test');
        await fs.writeFile(path.join(tempDir, 'language.sysprompt.md'), '# Prompt');
        await fs.mkdir(path.join(tempDir, 'evals'), { recursive: true });

        await statusCommand();

        // verify output contains key information
        const output = consoleLogSpy.mock.calls.map((call: any) => call.join(' ')).join('\n');
        expect(output).toContain('test-dsl');
        expect(output).toContain('Descriptor');
        expect(output).toContain('System Prompt');
        expect(output).toContain('Evaluations');
    });

    it('should show missing files', async () => {
        const config = createConfig();
        await fs.writeFile(path.join(tempDir, 'lai.config.jsonc'), JSON.stringify(config, null, 2));
        // don't create descriptor or sysprompt

        await statusCommand();

        const output = consoleLogSpy.mock.calls.map((call: any) => call.join(' ')).join('\n');
        // status command shows all files but may use different icons for missing ones
        expect(output).toContain('Descriptor');
        expect(output).toContain('System Prompt');
    });

    it('should display eval file count', async () => {
        const config = createConfig();
        await fs.writeFile(path.join(tempDir, 'lai.config.jsonc'), JSON.stringify(config, null, 2));

        const evalsDir = path.join(tempDir, 'evals');
        await fs.mkdir(evalsDir, { recursive: true });
        await fs.writeFile(path.join(evalsDir, 'test1.eval.ts'), 'export default []');
        await fs.writeFile(path.join(evalsDir, 'test2.eval.ts'), 'export default []');
        await fs.writeFile(path.join(evalsDir, 'not-eval.ts'), 'export default []'); // should not count

        await statusCommand();

        const output = consoleLogSpy.mock.calls.map((call: any) => call.join(' ')).join('\n');
        expect(output).toContain('2');
    });

    it('should handle missing config gracefully', async () => {
        // no config file created
        await statusCommand();

        const output = consoleLogSpy.mock.calls.map((call: any) => call.join(' ')).join('\n');
        expect(output).toContain('lai.config.jsonc not found');
    });
});
