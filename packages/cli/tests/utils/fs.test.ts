import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'path';
import os from 'os';
import {
    findProjectRoot,
    findFile,
    findFiles,
    findServiceFile,
    findDirectory,
    makeRelative,
} from '../../src/utils/fs.js';

describe('File System Utils', () => {
    let tempDir: string;

    beforeEach(async () => {
        // create temp directory for testing
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lai-test-'));
    });

    afterEach(async () => {
        // cleanup temp directory
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    describe('findProjectRoot', () => {
        it('should find root with package.json', async () => {
            await fs.writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'test' }, null, 2));
            const subDir = path.join(tempDir, 'src', 'nested');
            await fs.mkdir(subDir, { recursive: true });

            const root = await findProjectRoot(subDir);
            expect(root).toBe(tempDir);
        });

        it('should find root with langium-config.json', async () => {
            await fs.writeFile(path.join(tempDir, 'langium-config.json'), JSON.stringify({}, null, 2));
            const subDir = path.join(tempDir, 'src');
            await fs.mkdir(subDir, { recursive: true });

            const root = await findProjectRoot(subDir);
            expect(root).toBe(tempDir);
        });

        it('should fallback to cwd if no root found', async () => {
            const root = await findProjectRoot(tempDir);
            expect(root).toBe(tempDir);
        });
    });

    describe('findFile', () => {
        it('should find file matching pattern', async () => {
            const testFile = path.join(tempDir, 'test.langium');
            await fs.writeFile(testFile, 'grammar Test');

            const found = await findFile(tempDir, '*.langium');
            expect(found).toBe(testFile);
        });

        it('should return undefined if no file found', async () => {
            const found = await findFile(tempDir, '*.nonexistent');
            expect(found).toBeUndefined();
        });
    });

    describe('findFiles', () => {
        it('should find all files matching pattern', async () => {
            await fs.writeFile(path.join(tempDir, 'test1.ts'), 'content');
            await fs.writeFile(path.join(tempDir, 'test2.ts'), 'content');
            await fs.writeFile(path.join(tempDir, 'other.js'), 'content');

            const found = await findFiles(tempDir, '*.ts');
            expect(found).toHaveLength(2);
            expect(found.every((f) => f.endsWith('.ts'))).toBe(true);
        });

        it('should return empty array if no files found', async () => {
            const found = await findFiles(tempDir, '*.nonexistent');
            expect(found).toEqual([]);
        });
    });

    describe('findServiceFile', () => {
        it('should find file matching first pattern', async () => {
            const validatorFile = path.join(tempDir, 'my-validator.ts');
            await fs.writeFile(validatorFile, 'export class Validator {}');

            const found = await findServiceFile(tempDir, ['*-validator.ts', 'validation/**/*.ts']);
            expect(found).toBe(validatorFile);
        });

        it('should try multiple patterns in order', async () => {
            const validationDir = path.join(tempDir, 'validation');
            await fs.mkdir(validationDir, { recursive: true });
            const validatorFile = path.join(validationDir, 'index.ts');
            await fs.writeFile(validatorFile, 'export class Validator {}');

            const found = await findServiceFile(tempDir, ['*-validator.ts', 'validation/**/*.ts']);
            expect(found).toBe(validatorFile);
        });

        it('should return undefined if no pattern matches', async () => {
            const found = await findServiceFile(tempDir, ['*-nonexistent.ts']);
            expect(found).toBeUndefined();
        });
    });

    describe('findDirectory', () => {
        it('should find directory from list of names', async () => {
            const testsDir = path.join(tempDir, 'tests');
            await fs.mkdir(testsDir, { recursive: true });

            const found = await findDirectory(tempDir, ['test', 'tests', '__tests__']);
            expect(found).toBe(testsDir);
        });

        it('should return first matching directory', async () => {
            const testDir = path.join(tempDir, 'test');
            const testsDir = path.join(tempDir, 'tests');
            await fs.mkdir(testDir, { recursive: true });
            await fs.mkdir(testsDir, { recursive: true });

            const found = await findDirectory(tempDir, ['test', 'tests']);
            expect(found).toBe(testDir);
        });

        it('should return undefined if no directory found', async () => {
            const found = await findDirectory(tempDir, ['nonexistent']);
            expect(found).toBeUndefined();
        });

        it('should ignore files with matching names', async () => {
            await fs.writeFile(path.join(tempDir, 'test'), 'not a directory');

            const found = await findDirectory(tempDir, ['test']);
            expect(found).toBeUndefined();
        });
    });

    describe('makeRelative', () => {
        it('should create relative path', () => {
            const from = '/home/user/project';
            const to = '/home/user/project/src/file.ts';

            const relative = makeRelative(from, to);
            expect(relative).toBe('src/file.ts');
        });

        it('should use forward slashes for cross-platform consistency', () => {
            const from = path.join('home', 'user', 'project');
            const to = path.join('home', 'user', 'project', 'src', 'nested', 'file.ts');

            const relative = makeRelative(from, to);
            expect(relative).not.toContain('\\');
            expect(relative).toBe('src/nested/file.ts');
        });

        it('should handle parent directory references', () => {
            const from = '/home/user/project/src';
            const to = '/home/user/project/package.json';

            const relative = makeRelative(from, to);
            expect(relative).toBe('../package.json');
        });
    });
});
