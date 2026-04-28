import fs from 'fs-extra';
import path from 'path';
import type { LaiConfig } from '../types.js';

// config file management

export async function loadConfig(cwd: string = process.cwd()): Promise<LaiConfig> {
    const configPath = path.join(cwd, 'lai.config.jsonc');

    if (!(await fs.pathExists(configPath))) {
        throw new Error('lai.config.jsonc not found. Run `lai init` first.');
    }

    return await fs.readJSON(configPath);
}

export async function saveConfig(config: LaiConfig, cwd: string = process.cwd()): Promise<void> {
    const configPath = path.join(cwd, 'lai.config.jsonc');
    await fs.writeJSON(configPath, config, { spaces: 2 });
}

export async function configExists(cwd: string = process.cwd()): Promise<boolean> {
    const configPath = path.join(cwd, 'lai.config.jsonc');
    return await fs.pathExists(configPath);
}
