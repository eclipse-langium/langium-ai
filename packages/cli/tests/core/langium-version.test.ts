import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'path';
import os from 'os';
import {
    checkLangiumVersion,
    parseMajorVersion,
    resolveLangiumVersion,
    MIN_LANGIUM_MAJOR,
} from '../../src/core/langium-version.js';

describe('Langium Version Checks', () => {
    let tempDir: string;
    let originalExitCode: typeof process.exitCode;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lai-version-test-'));
        originalExitCode = process.exitCode;
        process.exitCode = 0;
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
        process.exitCode = originalExitCode;
    });

    const writePackageJson = async (dir: string, contents: object): Promise<void> => {
        await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify(contents, null, 2));
    };

    const writeInstalledLangium = async (dir: string, version: string): Promise<void> => {
        const langiumDir = path.join(dir, 'node_modules', 'langium');
        await fs.mkdir(langiumDir, { recursive: true });
        await fs.writeFile(path.join(langiumDir, 'package.json'), JSON.stringify({ name: 'langium', version }));
    };

    describe('parseMajorVersion', () => {
        it('parses plain versions', () => {
            expect(parseMajorVersion('4.1.2')).toBe(4);
            expect(parseMajorVersion('3.0.0')).toBe(3);
        });

        it('parses range specifiers', () => {
            expect(parseMajorVersion('^4.0.0')).toBe(4);
            expect(parseMajorVersion('~4.1.0')).toBe(4);
            expect(parseMajorVersion('>=5.2.0')).toBe(5);
            expect(parseMajorVersion('v4.0.1')).toBe(4);
        });

        it('returns undefined for unparseable input', () => {
            expect(parseMajorVersion('latest')).toBeUndefined();
            expect(parseMajorVersion('')).toBeUndefined();
        });
    });

    describe('resolveLangiumVersion', () => {
        it('prefers the installed node_modules version', async () => {
            await writePackageJson(tempDir, { dependencies: { langium: '^3.0.0' } });
            await writeInstalledLangium(tempDir, '4.1.0');

            expect(await resolveLangiumVersion(tempDir)).toBe('4.1.0');
        });

        it('falls back to the declared dependency range', async () => {
            await writePackageJson(tempDir, { dependencies: { langium: '^4.0.0' } });

            expect(await resolveLangiumVersion(tempDir)).toBe('^4.0.0');
        });

        it('checks devDependencies and peerDependencies too', async () => {
            await writePackageJson(tempDir, { devDependencies: { langium: '~4.2.0' } });
            expect(await resolveLangiumVersion(tempDir)).toBe('~4.2.0');
        });

        it('returns undefined when no langium dependency exists', async () => {
            await writePackageJson(tempDir, { dependencies: {} });
            expect(await resolveLangiumVersion(tempDir)).toBeUndefined();
        });
    });

    describe('checkLangiumVersion', () => {
        it('passes for a supported version and leaves the exit code alone', async () => {
            await writePackageJson(tempDir, { dependencies: { langium: `^${MIN_LANGIUM_MAJOR}.0.0` } });

            expect(await checkLangiumVersion(tempDir)).toBe(true);
            expect(process.exitCode).toBe(0);
        });

        it('warns and sets a non-zero exit code for an unsupported version', async () => {
            await writePackageJson(tempDir, { dependencies: { langium: '^3.0.0' } });

            expect(await checkLangiumVersion(tempDir)).toBe(false);
            expect(process.exitCode).toBe(1);
        });

        it('uses the installed version over the declared range', async () => {
            // declared range looks fine, but the actually installed version is too old
            await writePackageJson(tempDir, { dependencies: { langium: '^4.0.0' } });
            await writeInstalledLangium(tempDir, '3.5.0');

            expect(await checkLangiumVersion(tempDir)).toBe(false);
            expect(process.exitCode).toBe(1);
        });

        it('stays quiet when no version can be determined', async () => {
            await writePackageJson(tempDir, { dependencies: {} });

            expect(await checkLangiumVersion(tempDir)).toBe(true);
            expect(process.exitCode).toBe(0);
        });

        it('does not crash on an unparseable version', async () => {
            await writePackageJson(tempDir, { dependencies: { langium: 'workspace:*' } });

            expect(await checkLangiumVersion(tempDir)).toBe(true);
            expect(process.exitCode).toBe(0);
        });
    });
});
