import { readdir } from 'node:fs/promises';
import path from 'path';
import { loadConfig } from '../core/config.js';
import { pathExists } from '../utils/fs.js';
import { header, section, logDetected } from '../utils/console.js';

export async function statusCommand(): Promise<void> {
    // let config load errors propagate; index.ts renders them and exits non-zero
    const config = await loadConfig();

    const cwd = process.cwd();

    header('Langium AI Status');

    console.log(`Project: ${config.project.name}`);
    console.log(`Config:  ./lai.config.jsonc`);
    console.log();

    // check descriptor
    section('Descriptor');
    const descriptorExists = await pathExists(path.join(cwd, config.descriptor.path));
    logDetected('File', config.descriptor.path, descriptorExists);

    // check sysprompt(s)
    section('System Prompt');
    const syspromptExists = await pathExists(path.join(cwd, config.sysprompt.path));
    logDetected('Default', config.sysprompt.path, syspromptExists);

    // check for other template-based prompts
    const syspromptDir = path.dirname(path.join(cwd, config.sysprompt.path));
    const syspromptBase = path.basename(config.sysprompt.path, '.md');
    if (await pathExists(syspromptDir)) {
        const files = await readdir(syspromptDir);
        const templatePrompts = files.filter(
            (f) => f.startsWith(syspromptBase) && f !== path.basename(config.sysprompt.path) && f.endsWith('.md'),
        );

        templatePrompts.forEach((file) => {
            logDetected('Template', file, true);
        });
    }

    // check evaluations
    section('Evaluations');
    const evalsDir = path.join(cwd, config.evaluations.directory);
    const evalsDirExists = await pathExists(evalsDir);
    logDetected('Directory', config.evaluations.directory, evalsDirExists);

    if (evalsDirExists) {
        const evalFiles = (await readdir(evalsDir)).filter((f) => f.endsWith('.eval.ts'));
        logDetected('Eval files', `${evalFiles.length} found`, evalFiles.length > 0);
    }

    console.log();
}
