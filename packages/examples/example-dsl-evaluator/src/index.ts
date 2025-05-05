/******************************************************************************
 * Copyright 2024 - 2025 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { runLangDevDemo, generateChartFromLastResults } from './eval-langdev.js';
import { runLangiumEvals } from './eval-langium.js';
import { runExampleProgramMap } from './example-program-map.js';
import { runExampleServer } from './example-server.js';
import { runSpliterExample } from './example-splitter.js';

function printHelp() {
    console.log('Usage: node dist/index.js [run-langium|run-langdev|report|server|help]');
    console.log('  run-langium: Run Langium evaluations');
    console.log('  run-langdev: Run LangDev evaluations');
    console.log('  report: Generate a report from the last results');
    console.log('  server: Start the Langium AI REST API server');
    console.log('  splitter: Run the splitter example');
    console.log('  program-map: Generate a program map');
    console.log('  help: Show this help message');
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        printHelp();
        return;
    }

    const command = args[0];

    switch (command) {
        case 'run-langium':
            await runLangiumEvals();
            generateChartFromLastResults();
            break;
        case 'run-langdev':
            await runLangDevDemo();
            generateChartFromLastResults();
            break;
        case 'report':
            generateChartFromLastResults();
            break;
        case 'server':
            runExampleServer();
            break;
        case 'splitter':
            runSpliterExample();
            break;
        case 'program-map':
            runExampleProgramMap();
            break;
        case 'help':
            printHelp();
            break;
        default:
            printHelp();
            break;
    }
}

main();