import { readFile, writeFile } from 'node:fs/promises';
import path from 'path';
import type { LaiConfig } from '../types.js';
import { pathExists } from '../utils/fs.js';

// config file management

export async function loadConfig(cwd: string = process.cwd()): Promise<LaiConfig> {
    const configPath = path.join(cwd, 'lai.config.jsonc');

    if (!(await pathExists(configPath))) {
        throw new Error('lai.config.jsonc not found. Run `lai init` first.');
    }

    return JSON.parse(await readFile(configPath, 'utf-8'));
}

export async function saveConfig(config: LaiConfig, cwd: string = process.cwd()): Promise<void> {
    const configPath = path.join(cwd, 'lai.config.jsonc');
    await writeFile(configPath, JSON.stringify(config, null, 2));
}

export async function configExists(cwd: string = process.cwd()): Promise<boolean> {
    const configPath = path.join(cwd, 'lai.config.jsonc');
    return await pathExists(configPath);
}
