import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { resolveEvalFiles } from '../../src/commands/evaluate.js';

describe('resolveEvalFiles', () => {
    let tempDir: string;
    let originalCwd: string;

    beforeEach(async () => {
        originalCwd = process.cwd();
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lai-evaluate-resolve-'));
        process.chdir(tempDir);
    });

    afterEach(async () => {
        process.chdir(originalCwd);
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('falls back to the default directory when no args are provided', async () => {
        const defaultDir = path.join(tempDir, 'evals');
        await fs.mkdir(defaultDir, { recursive: true });
        await fs.writeFile(path.join(defaultDir, 'a.eval.ts'), '');
        await fs.writeFile(path.join(defaultDir, 'b.eval.ts'), '');
        await fs.writeFile(path.join(defaultDir, 'not-an-eval.ts'), '');

        const files = await resolveEvalFiles([], defaultDir);

        expect(files).toHaveLength(2);
        expect(files.every((f) => f.endsWith('.eval.ts'))).toBe(true);
    });

    it('runs a single explicit file', async () => {
        const file = path.join(tempDir, 'single.eval.ts');
        await fs.writeFile(file, '');

        const files = await resolveEvalFiles([file], path.join(tempDir, 'evals'));

        expect(files).toEqual([file]);
    });

    it('discovers eval files in an explicit directory', async () => {
        const dir = path.join(tempDir, 'mydir');
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, 'a.eval.ts'), '');
        await fs.writeFile(path.join(dir, 'b.eval.ts'), '');
        await fs.writeFile(path.join(dir, 'README.md'), '');

        const files = await resolveEvalFiles([dir], path.join(tempDir, 'evals'));

        expect(files).toHaveLength(2);
        expect(files.every((f) => f.endsWith('.eval.ts'))).toBe(true);
    });

    it('processes a mix of files and directories in order', async () => {
        const fileA = path.join(tempDir, 'a.eval.ts');
        const fileZ = path.join(tempDir, 'z.eval.ts');
        const dir1 = path.join(tempDir, 'dir1');
        const dir2 = path.join(tempDir, 'dir2');
        await fs.writeFile(fileA, '');
        await fs.writeFile(fileZ, '');
        await fs.mkdir(dir1, { recursive: true });
        await fs.mkdir(dir2, { recursive: true });
        const dir1File = path.join(dir1, 'one.eval.ts');
        const dir2File = path.join(dir2, 'two.eval.ts');
        await fs.writeFile(dir1File, '');
        await fs.writeFile(dir2File, '');

        const files = await resolveEvalFiles([fileA, dir1, dir2, fileZ], path.join(tempDir, 'evals'));

        expect(files).toEqual([fileA, dir1File, dir2File, fileZ]);
    });

    it('deduplicates an eval file that appears both explicitly and inside a passed directory', async () => {
        const dir = path.join(tempDir, 'evals');
        await fs.mkdir(dir, { recursive: true });
        const dupFile = path.join(dir, 'shared.eval.ts');
        await fs.writeFile(dupFile, '');

        // explicit file first, then the directory containing it
        const files = await resolveEvalFiles([dupFile, dir], dir);

        expect(files).toEqual([dupFile]);
    });

    it('preserves the position of a duplicate at its first occurrence', async () => {
        const dir = path.join(tempDir, 'evals');
        await fs.mkdir(dir, { recursive: true });
        const sharedFile = path.join(dir, 'shared.eval.ts');
        const otherFile = path.join(tempDir, 'other.eval.ts');
        await fs.writeFile(sharedFile, '');
        await fs.writeFile(otherFile, '');

        // dir first (so shared.eval.ts is discovered first), then explicit duplicate, then other
        const files = await resolveEvalFiles([dir, sharedFile, otherFile], dir);

        expect(files).toEqual([sharedFile, otherFile]);
    });

    it('throws a clear error for a non-existent path', async () => {
        const missing = path.join(tempDir, 'does-not-exist.eval.ts');

        await expect(resolveEvalFiles([missing], path.join(tempDir, 'evals'))).rejects.toThrow(
            /does-not-exist\.eval\.ts/,
        );
    });

    it('throws a clear error when an explicit file is not an eval file', async () => {
        const file = path.join(tempDir, 'plain.ts');
        await fs.writeFile(file, '');

        await expect(resolveEvalFiles([file], path.join(tempDir, 'evals'))).rejects.toThrow(/\.eval\.ts/);
    });

    it('throws when the default directory does not exist and no args are provided', async () => {
        const missingDefault = path.join(tempDir, 'evals');

        await expect(resolveEvalFiles([], missingDefault)).rejects.toThrow();
    });
});
