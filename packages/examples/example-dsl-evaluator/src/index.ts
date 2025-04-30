import { runLangDevDemo, generateChartFromLastResults } from './eval-langdev.js';
import { runLangiumEvals } from './eval-langium.js';
import { runExampleServer } from './example-server.js';

function printHelp() {
    console.log('Usage: node dist/index.js [run-langium|run-langdev|report|server|help]');
    console.log('  run-langium: Run Langium evaluations');
    console.log('  run-langdev: Run LangDev evaluations');
    console.log('  report: Generate a report from the last results');
    console.log('  server: Start the Langium AI REST API server');
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
        case 'help':
            printHelp();
            break;
        default:
            printHelp();
            break;
    }
}

main();