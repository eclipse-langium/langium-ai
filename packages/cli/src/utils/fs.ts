import { access, stat, readFile } from 'node:fs/promises';
import path from 'path';
import { glob as nodeGlob } from 'glob';

// file system helpers

export async function pathExists(p: string): Promise<boolean> {
    return access(p).then(() => true, () => false);
}

export async function findProjectRoot(cwd: string): Promise<string> {
    let current = cwd;

    while (current !== path.parse(current).root) {
        // check for package.json or langium-config.json
        const hasPackageJson = await pathExists(path.join(current, 'package.json'));
        const hasLangiumConfig = await pathExists(path.join(current, 'langium-config.json'));

        if (hasPackageJson || hasLangiumConfig) {
            return current;
        }

        current = path.dirname(current);
    }

    // fallback to cwd if no root found
    return cwd;
}

export async function findFile(root: string, pattern: string): Promise<string | undefined> {
    const files = await nodeGlob(pattern, { cwd: root, absolute: true });
    return files[0];
}

export async function findFiles(root: string, pattern: string): Promise<string[]> {
    return await nodeGlob(pattern, { cwd: root, absolute: true });
}

export async function findServiceFile(root: string, patterns: string[]): Promise<string | undefined> {
    for (const pattern of patterns) {
        const file = await findFile(root, pattern);
        if (file) {
            return file;
        }
    }
    return undefined;
}

export async function findDirectory(root: string, names: string[]): Promise<string | undefined> {
    for (const name of names) {
        const dir = path.join(root, name);
        if (await pathExists(dir)) {
            const s = await stat(dir);
            if (s.isDirectory()) {
                return dir;
            }
        }
    }
    return undefined;
}

/**
 * Recursively search for directories matching any of the given names.
 * Excludes node_modules and returns all matches sorted by path depth (shallowest first).
 */
export async function findDirectories(root: string, names: string[]): Promise<string[]> {
    const patterns = names.map((name) => `**/${name}`);
    const results: string[] = [];
    for (const pattern of patterns) {
        const matches = await nodeGlob(pattern, {
            cwd: root,
            absolute: true,
            ignore: ['**/node_modules/**'],
        });
        // filter to only actual directories
        for (const match of matches) {
            if (await pathExists(match)) {
                const s = await stat(match);
                if (s.isDirectory()) {
                    results.push(match);
                }
            }
        }
    }
    // deduplicate and sort by depth (shallowest first)
    const unique = [...new Set(results)];
    unique.sort((a, b) => a.split(path.sep).length - b.split(path.sep).length);
    return unique;
}

/**
 * Detect the package manager used in the project.
 * Checks for pnpm-lock.yaml or packageManager field referencing pnpm; defaults to npm.
 */
export async function detectPackageManager(root: string): Promise<'pnpm' | 'npm'> {
    // check for pnpm lockfile
    const hasPnpmLock = await pathExists(path.join(root, 'pnpm-lock.yaml'));
    if (hasPnpmLock) {
        return 'pnpm';
    }

    // check packageManager field in package.json
    const pkgJsonPath = path.join(root, 'package.json');
    if (await pathExists(pkgJsonPath)) {
        try {
            const pkgJson = JSON.parse(await readFile(pkgJsonPath, 'utf-8'));
            if (typeof pkgJson.packageManager === 'string' && pkgJson.packageManager.startsWith('pnpm')) {
                return 'pnpm';
            }
        } catch {
            // ignore parse errors
        }
    }

    return 'npm';
}

export function makeRelative(from: string, to: string): string {
    const rel = path.relative(from, to);
    // ensure forward slashes for cross-platform consistency
    return rel.replace(/\\/g, '/');
}
