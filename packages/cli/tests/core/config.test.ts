import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'path';
import os from 'os';
import { loadConfig, saveConfig, configExists } from '../../src/core/config.js';
import type { LaiConfig } from '../../src/types.js';
import { pathExists } from '../../src/utils/fs.js';

describe('Config Management', () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lai-config-test-'));
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    const createMockConfig = (): LaiConfig => ({
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

    describe('configExists', () => {
        it('should return true when config exists', async () => {
            await fs.writeFile(path.join(tempDir, 'lai.config.jsonc'), JSON.stringify(createMockConfig(), null, 2));

            const exists = await configExists(tempDir);
            expect(exists).toBe(true);
        });

        it('should return false when config does not exist', async () => {
            const exists = await configExists(tempDir);
            expect(exists).toBe(false);
        });
    });

    describe('saveConfig', () => {
        it('should save config as JSON', async () => {
            const config = createMockConfig();

            await saveConfig(config, tempDir);

            const configPath = path.join(tempDir, 'lai.config.jsonc');
            expect(await pathExists(configPath)).toBe(true);

            const saved = JSON.parse(await fs.readFile(configPath, 'utf-8'));
            expect(saved).toEqual(config);
        });

        it('should format JSON with proper indentation', async () => {
            const config = createMockConfig();

            await saveConfig(config, tempDir);

            const configPath = path.join(tempDir, 'lai.config.jsonc');
            const content = await fs.readFile(configPath, 'utf-8');

            // check that the file is properly formatted (contains newlines and spaces)
            expect(content).toContain('\n');
            expect(content).toContain('  ');
        });

        it('should overwrite existing config', async () => {
            const config1 = createMockConfig();
            const config2 = { ...createMockConfig(), project: { name: 'updated-dsl' } };

            await saveConfig(config1, tempDir);
            await saveConfig(config2, tempDir);

            const saved = await loadConfig(tempDir);
            expect(saved.project.name).toBe('updated-dsl');
        });
    });

    describe('loadConfig', () => {
        it('should load config from file', async () => {
            const config = createMockConfig();
            await fs.writeFile(path.join(tempDir, 'lai.config.jsonc'), JSON.stringify(config, null, 2));

            const loaded = await loadConfig(tempDir);
            expect(loaded).toEqual(config);
        });

        it('should throw error when config does not exist', async () => {
            await expect(loadConfig(tempDir)).rejects.toThrow('lai.config.jsonc not found');
        });

        it('should use process.cwd() when no path provided', async () => {
            // this test assumes we're not in a directory with lai.config.jsonc
            await expect(loadConfig()).rejects.toThrow('lai.config.jsonc not found');
        });
    });
});
