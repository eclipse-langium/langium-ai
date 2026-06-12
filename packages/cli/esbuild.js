import * as esbuild from 'esbuild';

await esbuild.build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'esm',
    outfile: 'dist/lai.js',
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
