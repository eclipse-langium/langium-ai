import fs from 'node:fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { getMatchingServiceProp } from '../../src/commands/init';
import { extractServiceSetProps } from '../../src/core/langium-detector';

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

    describe('utility tests', () => {
        test('getMatchingServiceProp same', () => {
            const value = getMatchingServiceProp('lang', ['lang']);
            expect(value).toBe('lang');
        });

        test('getMatchingServiceProp different casing', () => {
            // sanity check on this func
            const value = getMatchingServiceProp('Lang', ['lang']);
            expect(value).toBe('lang');
        });

        test('getMatchingServiceProp different casing', () => {
            // sanity check on this func
            const value = getMatchingServiceProp('Lang', ['abclangabc']);
            expect(value).toBe('abclangabc');
        });

        // extractServiceSetProps
        test('extractServiceSetProps standard', () => {
            const props = extractServiceSetProps('return { shared, t1 };');
            expect(props).toEqual(['t1']);
        });

        test('extractServiceSetProps reversed', () => {
            const props = extractServiceSetProps('return { t1, shared };');
            expect(props).toEqual(['t1']);
        });

        test('extractServiceSetProps multiple', () => {
            const props = extractServiceSetProps('return { shared, t1, t2 };');
            expect(props).toEqual(['t1', 't2']);
        });

        test('extractServiceSetProps multiple mixed', () => {
            const props = extractServiceSetProps('return { t3, shared, t1,t2 };');
            expect(props).toEqual(['t3', 't1', 't2']);
        });
    });
});
