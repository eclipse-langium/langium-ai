import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateCommand, formatEvalListing, listEvalFile, type EvalFileListing } from '../../src/commands/evaluate.js';
import type { LaiConfig } from '../../src/types.js';

// place temp dirs inside the workspace so node's module resolution can find
// langium-ai-tools from the workspace root when dynamically importing .eval.ts files
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpRoot = path.join(__dirname, '..', '.tmp');

describe('formatEvalListing', () => {
    it('reports zero files and zero cases when empty', () => {
        const output = formatEvalListing([]);
        expect(output).toContain('Found 0 eval files, 0 cases');
    });

    it('lists cases under each file using ✦ markers', () => {
        const entries: EvalFileListing[] = [
            {
                filePath: '/tmp/basic.eval.ts',
                suites: [{ name: 'Basic', cases: ['case one', 'case two'] }],
            },
        ];
        const output = formatEvalListing(entries);
        expect(output).toContain('Found 1 eval file, 2 cases');
        expect(output).toContain('basic.eval.ts');
        expect(output).toContain('case one');
        expect(output).toContain('case two');
        expect(output).toContain('✦');
    });

    it('aggregates cases across multiple suites and files', () => {
        const entries: EvalFileListing[] = [
            {
                filePath: '/tmp/a.eval.ts',
                suites: [
                    { name: 'S1', cases: ['c1', 'c2'] },
                    { name: 'S2', cases: ['c3'] },
                ],
            },
            { filePath: '/tmp/b.eval.ts', suites: [{ name: 'S3', cases: ['c4'] }] },
        ];
        const output = formatEvalListing(entries);
        expect(output).toContain('Found 2 eval files, 4 cases');
    });

    it('renders failed file inline with error message', () => {
        const entries: EvalFileListing[] = [
            { filePath: '/tmp/broken.eval.ts', error: 'boom' },
            { filePath: '/tmp/ok.eval.ts', suites: [{ name: 'S', cases: ['x'] }] },
        ];
        const output = formatEvalListing(entries);
        expect(output).toContain('broken.eval.ts');
        expect(output).toContain('Error loading eval file: boom');
        expect(output).toContain('ok.eval.ts');
        // total counts only successful cases
        expect(output).toContain('Found 2 eval files, 1 case');
    });
});

describe('listEvalFile', () => {
    let tempDir: string;
    let originalCwd: string;

    beforeEach(async () => {
        originalCwd = process.cwd();
        await fs.mkdir(tmpRoot, { recursive: true });
        tempDir = await fs.mkdtemp(path.join(tmpRoot, 'lai-evaluate-list-file-'));
        process.chdir(tempDir);
    });

    afterEach(async () => {
        process.chdir(originalCwd);
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('returns an error entry when the file fails to import', async () => {
        const broken = path.join(tempDir, 'broken.eval.ts');
        // syntax error at the top level — fails to parse/import
        await fs.writeFile(broken, 'this is not valid typescript @@@');

        const listing = await listEvalFile(broken);

        expect(listing.filePath).toBe(broken);
        expect(listing.error).toBeDefined();
        expect(listing.suites).toBeUndefined();
    });

    it('collects suites and cases from a valid eval file', async () => {
        const file = path.join(tempDir, 'sample.eval.ts');
        await fs.writeFile(
            file,
            `
            import { describe, evaluation } from 'langium-ai-tools/evals';
            describe('Suite A', () => {
                evaluation('alpha', async () => ({ score: 1 }));
                evaluation('beta', async () => ({ score: 1 }));
            });
            describe('Suite B', () => {
                evaluation('gamma', async () => ({ score: 1 }));
            });
            `,
        );

        const listing = await listEvalFile(file);

        expect(listing.error).toBeUndefined();
        expect(listing.suites).toEqual([
            { name: 'Suite A', cases: ['alpha', 'beta'] },
            { name: 'Suite B', cases: ['gamma'] },
        ]);
    });
});

describe('evaluateCommand --list', () => {
    let tempDir: string;
    let originalCwd: string;
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;
    let exitSpy: ReturnType<typeof vi.spyOn>;

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

    beforeEach(async () => {
        originalCwd = process.cwd();
        await fs.mkdir(tmpRoot, { recursive: true });
        tempDir = await fs.mkdtemp(path.join(tmpRoot, 'lai-evaluate-list-cmd-'));
        process.chdir(tempDir);

        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        // process.exit throws so we can assert on it without killing the test runner
        exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
            throw new Error(`process.exit:${code ?? 0}`);
        });

        await fs.writeFile(path.join(tempDir, 'lai.config.jsonc'), JSON.stringify(createConfig(), null, 2));
    });

    afterEach(async () => {
        consoleLogSpy?.mockRestore();
        exitSpy?.mockRestore();
        process.chdir(originalCwd);
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('lists discovered suites/cases without requiring sysprompt', async () => {
        const evalsDir = path.join(tempDir, 'evals');
        await fs.mkdir(evalsDir, { recursive: true });
        await fs.writeFile(
            path.join(evalsDir, 'first.eval.ts'),
            `
            import { describe, evaluation } from 'langium-ai-tools/evals';
            describe('First', () => {
                evaluation('one', async () => ({ score: 1 }));
            });
            `,
        );

        // do NOT create sysprompt — --list should not need it
        await evaluateCommand([], { list: true });

        const output = consoleLogSpy.mock.calls.map((call: unknown[]) => call.join(' ')).join('\n');
        expect(output).toContain('Found 1 eval file, 1 case');
        expect(output).toContain('first.eval.ts');
        expect(output).toContain('one');
        expect(exitSpy).not.toHaveBeenCalled();
    });

    it('exits non-zero when no eval files are found', async () => {
        const evalsDir = path.join(tempDir, 'evals');
        await fs.mkdir(evalsDir, { recursive: true });
        // empty dir — no .eval.ts files

        await expect(evaluateCommand([], { list: true })).rejects.toThrow('process.exit:1');
    });

    it('exits non-zero when any eval file fails to load but still prints the listing', async () => {
        const evalsDir = path.join(tempDir, 'evals');
        await fs.mkdir(evalsDir, { recursive: true });
        await fs.writeFile(
            path.join(evalsDir, 'ok.eval.ts'),
            `
            import { describe, evaluation } from 'langium-ai-tools/evals';
            describe('OK', () => {
                evaluation('passes', async () => ({ score: 1 }));
            });
            `,
        );
        await fs.writeFile(path.join(evalsDir, 'broken.eval.ts'), 'this is not valid typescript @@@');

        await expect(evaluateCommand([], { list: true })).rejects.toThrow('process.exit:1');

        const output = consoleLogSpy.mock.calls.map((call: unknown[]) => call.join(' ')).join('\n');
        expect(output).toContain('ok.eval.ts');
        expect(output).toContain('broken.eval.ts');
        expect(output).toContain('Error loading eval file');
    });

    it('honors variadic positional file arguments', async () => {
        const file = path.join(tempDir, 'explicit.eval.ts');
        await fs.writeFile(
            file,
            `
            import { describe, evaluation } from 'langium-ai-tools/evals';
            describe('Explicit', () => {
                evaluation('only-case', async () => ({ score: 1 }));
            });
            `,
        );

        // pass file path directly — should not consult default evals dir
        await evaluateCommand([file], { list: true });

        const output = consoleLogSpy.mock.calls.map((call: unknown[]) => call.join(' ')).join('\n');
        expect(output).toContain('explicit.eval.ts');
        expect(output).toContain('only-case');
    });
});
