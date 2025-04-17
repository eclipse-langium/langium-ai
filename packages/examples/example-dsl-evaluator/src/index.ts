
import { runLangDevDemo, generateChartFromLastResults } from './eval-langdev.js';
import { runLangiumEvals } from './eval-langium.js';

async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.log('Usage: node dist/index.js [run|report]');
        return;
    }

    const command = args[0];

    if (command === 'run-langium') {
        await runLangiumEvals();
        generateChartFromLastResults();
    } else if (command === 'run-langdev') {
        await runLangDevDemo();
        generateChartFromLastResults();
    } else if (command === 'report') {
        generateChartFromLastResults();
    } else {
        console.log('Usage: node dist/index.js [run|report]');
    }
}

main();