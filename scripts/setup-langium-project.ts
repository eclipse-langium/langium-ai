/**
 * scripts a `yo langium` run non-interactively using yeoman-test.
 *
 * the langium generator asks 8 prompts (all with sensible defaults) and then,
 * if `code` is on the PATH, a final select prompt asking whether to open the
 * new folder in VS Code. running it by hand means hitting enter 8x and then
 * arrowing down to "Skip". yeoman-test lets us supply every answer up front,
 * so nothing is interactive.
 *
 * usage: node --experimental-strip-types scripts/setup-langium-project.ts [targetDir] [...generatorArgs]
 *   targetDir      - where to generate the project (defaults to the cwd)
 *   generatorArgs  - extra args forwarded to the generator, e.g. skip-install, skip-build
 */

import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import * as url from 'node:url';
import helpers from 'yeoman-test';

// resolve the globally-installed generator-langium (installed via `npm i -g generator-langium`)
function resolveGeneratorPath(): string {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
    const require = createRequire(url.pathToFileURL(path.join(globalRoot, 'noop.js')));
    // the generator's package.json points `exports` at ./app/index.js
    return require.resolve('generator-langium');
}

async function main(): Promise<void> {
    const targetDir = path.resolve(process.argv[2] ?? process.cwd());
    const generatorArgs = process.argv.slice(3);
    const generatorPath = resolveGeneratorPath();

    console.log(`* generating a langium project in ${targetDir}`);
    console.log(`* using generator: ${generatorPath}`);
    if (generatorArgs.length > 0) {
        console.log(`* generator args: ${generatorArgs.join(' ')}`);
    }

    // withAnswers supplies values for every prompt by name, bypassing all
    // interactive input including the final VS Code "Open with `code` / Skip"
    // select — openWith: false is the "Skip" choice.
    await helpers
        .run(generatorPath, { resolved: generatorPath, namespace: 'langium:app' })
        .cd(targetDir)
        .withArguments(generatorArgs)
        .withAnswers({
            // 8 defaulted prompts
            extensionName: 'hello-world',
            rawLanguageName: 'Hello World',
            fileExtensions: '.hello',
            entryName: 'Model',
            includeVSCode: true,
            includeExampleProject: true,
            includeCLI: true,
            includeTest: true,
            // final select: skip opening in VS Code (equivalent to the "Skip" option)
            openWith: false,
        });

    console.log('* langium project generated');
}

main().catch((err) => {
    console.error('! failed to generate langium project');
    console.error(err);
    process.exit(1);
});
