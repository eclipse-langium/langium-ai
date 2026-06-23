import * as esbuild from 'esbuild';
import * as fs from 'fs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

await esbuild.build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'esm',
    outfile: 'dist/lai.js',
    define: {
        __CLI_VERSION__: JSON.stringify(pkg.version),
    },
    minify: true,
    banner: {
        // shim require() for CJS packages that use require('node:*') internally
        js: [
            '#!/usr/bin/env node',
            'import { createRequire as __createRequire } from "module";',
            'const require = __createRequire(import.meta.url);',
        ].join('\n'),
    },
});
