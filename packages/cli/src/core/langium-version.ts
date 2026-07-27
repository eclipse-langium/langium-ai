import { readFile } from 'node:fs/promises';
import path from 'path';
import { pathExists, findProjectRoot } from '../utils/fs.js';
import { warning } from '../utils/console.js';

// langium version detection & support checks

/**
 * Minimum major version of Langium we support. Older versions have API
 * differences that cause the parser/validator services to misbehave, so we
 * warn and bail out early rather than crash deep inside evaluation.
 */
export const MIN_LANGIUM_MAJOR = 4;

/**
 * Extract the leading major version number from a version or range string.
 * Handles plain versions ('4.1.2'), ranges ('^4.0.0', '~4.1.0', '>=4.0.0'),
 * and 'v'-prefixed values. Returns undefined if no major can be parsed.
 */
export function parseMajorVersion(version: string): number | undefined {
    // strip common range operators/prefixes and grab the first numeric group
    const match = version.match(/(\d+)\./);
    if (!match) {
        return undefined;
    }
    const major = parseInt(match[1], 10);
    return isNaN(major) ? undefined : major;
}

/**
 * Resolve the Langium version used by the project rooted at (or above) cwd.
 *
 * Prefers the concrete version installed in node_modules, since that's what
 * actually runs. Falls back to the declared dependency range in package.json
 * when node_modules isn't present (e.g. deps not yet installed).
 *
 * Returns undefined when no langium dependency can be found at all.
 */
export async function resolveLangiumVersion(cwd: string = process.cwd()): Promise<string | undefined> {
    const root = await findProjectRoot(cwd);

    // 1. prefer the installed version from node_modules
    const installedPkg = path.join(root, 'node_modules', 'langium', 'package.json');
    if (await pathExists(installedPkg)) {
        try {
            const pkg = JSON.parse(await readFile(installedPkg, 'utf-8'));
            if (typeof pkg.version === 'string') {
                return pkg.version;
            }
        } catch {
            // fall through to the declared range
        }
    }

    // 2. fall back to the declared dependency range in the project package.json
    const pkgJsonPath = path.join(root, 'package.json');
    if (await pathExists(pkgJsonPath)) {
        try {
            const pkgJson = JSON.parse(await readFile(pkgJsonPath, 'utf-8'));
            const declared: string | undefined =
                pkgJson.dependencies?.langium ??
                pkgJson.devDependencies?.langium ??
                pkgJson.peerDependencies?.langium;
            if (typeof declared === 'string') {
                return declared;
            }
        } catch {
            // ignore parse errors, treated as "not found" below
        }
    }

    return undefined;
}

/**
 * Check that the project's Langium version is supported (>= MIN_LANGIUM_MAJOR).
 *
 * Never throws or crashes. When the version is too old to support, emits a
 * warning and sets a non-zero process exit code so CI can catch it, then
 * returns false. When the version can't be determined we stay quiet and
 * assume it's fine (returns true) to avoid false alarms.
 */
export async function checkLangiumVersion(cwd: string = process.cwd()): Promise<boolean> {
    let version: string | undefined;
    try {
        version = await resolveLangiumVersion(cwd);
    } catch {
        // detection is best-effort; never let it crash a command
        return true;
    }

    if (!version) {
        // couldn't determine a version — don't block, but don't claim support either
        return true;
    }

    const major = parseMajorVersion(version);
    if (major === undefined) {
        // unparseable version string — stay quiet rather than false-alarm
        return true;
    }

    if (major < MIN_LANGIUM_MAJOR) {
        warning(
            `Detected Langium version '${version}', which is not supported. ` +
                `Langium AI requires Langium >= ${MIN_LANGIUM_MAJOR}.x.x. ` +
                `Please upgrade Langium in your project to avoid errors.`,
        );
        process.exitCode = 1;
        return false;
    }

    return true;
}
